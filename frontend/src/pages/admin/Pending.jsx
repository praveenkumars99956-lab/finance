import { formatMoney as formatMoneyValue } from '../../utils/money'
import { normalizeFinanceType } from '../../utils/financeType'
import { toDateKey } from '../../utils/reportFilters'
import { notify } from '../../utils/notify'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Clock,
  ArrowLeft,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  WalletCards,
  Calendar,
  Layers,
  ChevronRight
} from 'lucide-react'
import { supabase } from '../../services/supabase'
import SelectMenu from '../../components/SelectMenu'

function Pending() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Settings
  const [overdueGraceDays, setOverdueGraceDays] = useState(0)

  useEffect(() => {
    loadPageData()
  }, [])

  // =========================================
  // LOAD PAGE
  // =========================================

  async function loadPageData() {
    setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      setLoading(false)
      navigate('/')
      return
    }

    await loadSettings()
    await loadPendingRecords()

    setLoading(false)
  }

  // =========================================
  // LOAD SETTINGS
  // =========================================

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('overdue_grace_days')
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      return
    }

    if (data) {
      setOverdueGraceDays(Number(data.overdue_grace_days || 0))
    }
  }

  // =========================================
  // LOAD PENDING RECORDS
  // =========================================

  const loadPendingRecords = async () => {
    const { data, error } = await supabase
      .from('finance_records')
      .select(`
        id,
        name,
        finance_type,
        amount,
        paid,
        pending,
        next_due_date,
        loan_status,
        created_at,
        customers (
          id,
          customer_id,
          full_name,
          phone
        ),
        collection_categories (
          id,
          category_name
        )
      `)
      .gt('pending', 0)
      .neq('loan_status', 'closed')
      .order('next_due_date', { ascending: true })

    if (error) {
      console.error(error)
      notify(error.message)
      return
    }

    setRecords(data || [])
  }

  // =========================================
  // STATUS CHECK WITH GRACE DAYS
  // =========================================

  const getStatus = (record) => {
    const dueDateKey = toDateKey(record.next_due_date)
    if (!dueDateKey) return 'pending'

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueDate = new Date(`${dueDateKey}T00:00:00`)
    if (Number.isNaN(dueDate.getTime())) return 'pending'

    const graceLimit = new Date(dueDate)
    graceLimit.setDate(graceLimit.getDate() + Number(overdueGraceDays || 0))

    if (today > graceLimit) return 'overdue'
    return 'pending'
  }

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(`${value}T00:00:00`)
    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }

  const getFinanceTypeName = (type) => {
    switch (normalizeFinanceType(type)) {
      case 'daily':
        return t('dailyLoan')
      case 'weekly':
        return t('weeklyLoan')
      case 'monthly':
        return t('monthlyLoan')
      case 'interest_only':
        return t('interestOnlyLoan')
      default:
        return type || '-'
    }
  }

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const status = getStatus(record)
      const customerName = record.customers?.full_name || record.name || ''
      const customerCode = record.customers?.customer_id || ''
      const category = record.collection_categories?.category_name || ''
      const searchText = search.trim().toLowerCase()

      const matchesSearch =
        !searchText ||
        customerName.toLowerCase().includes(searchText) ||
        customerCode.toLowerCase().includes(searchText) ||
        category.toLowerCase().includes(searchText)

      const matchesStatus = statusFilter === 'all' || status === statusFilter
      const matchesType =
        typeFilter === 'all' ||
        normalizeFinanceType(record.finance_type) === normalizeFinanceType(typeFilter)

      return matchesSearch && matchesStatus && matchesType
    })
  }, [records, statusFilter, typeFilter, search, overdueGraceDays])

  const pendingRecords = records.filter((r) => getStatus(r) === 'pending')
  const overdueRecords = records.filter((r) => getStatus(r) === 'overdue')

  const totalOutstanding = records.reduce((sum, r) => sum + Number(r.pending || 0), 0)
  const overdueAmount = overdueRecords.reduce((sum, r) => sum + Number(r.pending || 0), 0)

  const openFinance = (record) => {
    switch (normalizeFinanceType(record.finance_type)) {
      case 'daily':
        navigate(`/daily/${record.id}`)
        break
      case 'weekly':
        navigate(`/weekly/${record.id}`)
        break
      case 'monthly':
        navigate(`/monthly/${record.id}`)
        break
      case 'interest_only':
        navigate(`/interest-only/${record.id}`)
        break
      default:
        notify(t('unableOpenFinanceAccount'))
    }
  }

  if (loading) {
    return (
      <div className="modern-loan-manage">
        <div className="modern-card p-12 text-center text-secondary">
          <Clock className="animate-spin mx-auto mb-3 text-primary" size={28} />
          <p>{t('loadingPendingOverdue')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="modern-loan-manage">
      <button
        type="button"
        className="modern-back-link"
        onClick={() => navigate('/admin')}
      >
        <ArrowLeft size={16} />
        <span>{t('adminDashboard')}</span>
      </button>

      {/* HEADER HERO */}
      <div className="modern-manage-hero">
        <div className="modern-manage-title-wrap">
          <span className="modern-loan-category-tag">
            <ShieldAlert size={14} />
            {t('appName')}
          </span>
          <h1 className="modern-manage-heading">{t('pendingOverdue')}</h1>
          <p className="text-sm text-secondary">{t('pendingOverdueDescription')}</p>
        </div>

        <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface-hover border border-border text-secondary">
          <strong>{t('overdueGracePeriod')}:</strong>{' '}
          {t('dayCount', {
            count: overdueGraceDays,
            unit: t(Number(overdueGraceDays) === 1 ? 'day' : 'days')
          })}
        </div>
      </div>

      {/* 4-CARD SUMMARY METRICS */}
      <div className="modern-summary-grid">
        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('pendingAccounts')}</span>
            <Clock size={18} className="text-amber" />
          </div>
          <div className="modern-summary-val amber">{pendingRecords.length}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('overdueAccounts')}</span>
            <AlertCircle size={18} className="text-danger" />
          </div>
          <div className="modern-summary-val text-danger">{overdueRecords.length}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('totalOutstanding')}</span>
            <WalletCards size={18} className="text-primary" />
          </div>
          <div className="modern-summary-val">₹{formatMoney(totalOutstanding)}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('overdueAmount')}</span>
            <AlertCircle size={18} className="text-danger" />
          </div>
          <div className="modern-summary-val text-danger">₹{formatMoney(overdueAmount)}</div>
        </div>
      </div>

      {/* FILTER & TABLE SECTION */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <Layers size={18} className="text-primary" />
            <span>{t('outstandingFinanceAccounts')}</span>
          </div>

          <div className="modern-table-filter-bar">
            <input
              type="text"
              placeholder={t('searchCustomerOrCategory')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-primary"
              style={{ minWidth: 220 }}
            />

            <SelectMenu
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel={t('status')}
              variant="compact"
              options={[
                { value: 'all', label: t('allStatuses') },
                { value: 'pending', label: t('pending') },
                { value: 'overdue', label: t('overdue') }
              ]}
            />

            <SelectMenu
              value={typeFilter}
              onChange={setTypeFilter}
              ariaLabel={t('allLoanTypes')}
              variant="compact"
              options={[
                { value: 'all', label: t('allLoanTypes') },
                { value: 'daily', label: t('dailyLoan') },
                { value: 'weekly', label: t('weeklyLoan') },
                { value: 'monthly', label: t('monthlyLoan') },
                { value: 'interest_only', label: t('interestOnlyLoan') }
              ]}
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-muted">
            {t('noPendingOrOverdueFinanceAccounts')}
          </div>
        ) : (
          <div className="modern-table-card">
            <div className="modern-table-wrap">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>{t('customer')}</th>
                    <th>{t('collectionCategory')}</th>
                    <th>{t('loanType')}</th>
                    <th>{t('total')}</th>
                    <th>{t('paid')}</th>
                    <th>{t('pending')}</th>
                    <th>{t('nextDueDate')}</th>
                    <th>{t('status')}</th>
                    <th>{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const status = getStatus(record)
                    const customer = record.customers
                    const category = record.collection_categories

                    return (
                      <tr key={record.id}>
                        <td>
                          <strong>{customer?.full_name || record.name || '-'}</strong>
                          <div className="text-xs text-muted">
                            {customer?.customer_id ? `ID: ${customer.customer_id}` : ''}
                            {customer?.phone ? ` • ${customer.phone}` : ''}
                          </div>
                        </td>
                        <td>{category?.category_name || t('notAssigned')}</td>
                        <td>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-surface-hover border border-border">
                            {getFinanceTypeName(record.finance_type)}
                          </span>
                        </td>
                        <td>₹{formatMoney(record.amount)}</td>
                        <td className="text-emerald font-semibold">₹{formatMoney(record.paid)}</td>
                        <td className="font-bold">₹{formatMoney(record.pending)}</td>
                        <td>{formatDate(record.next_due_date)}</td>
                        <td>
                          <span className={`modern-table-chip ${status}`}>
                            {t(status)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="modern-btn-secondary text-xs py-1 px-2.5"
                            onClick={() => openFinance(record)}
                          >
                            <span>{t('viewProfile')}</span>
                            <ArrowUpRight size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Pending
