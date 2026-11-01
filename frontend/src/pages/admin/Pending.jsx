import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

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

  const loadPageData = async () => {
    setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (
      sessionError ||
      !sessionData?.session
    ) {
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
    const {
      data,
      error
    } = await supabase
      .from('app_settings')
      .select('overdue_grace_days')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error(
        'SETTINGS LOAD ERROR:',
        error
      )

      // Safe fallback
      setOverdueGraceDays(0)
      return
    }

    setOverdueGraceDays(
      Number(data?.overdue_grace_days || 0)
    )
  }

  // =========================================
  // LOAD FINANCE RECORDS
  // =========================================

  const loadPendingRecords = async () => {
    const {
      data,
      error
    } = await supabase
      .from('finance_records')
      .select(`
        id,
        name,
        finance_type,
        period,
        payment_date,
        amount,
        paid,
        pending,
        next_due_date,
        loan_status,
        customer_id,
        collection_category_id,
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
      .order(
        'next_due_date',
        {
          ascending: true,
          nullsFirst: false
        }
      )

    if (error) {
      console.error(
        'PENDING LOAD ERROR:',
        error
      )

      alert(
        t('pendingRecordsLoadFailed', { message: error.message })
      )

      return
    }

    setRecords(data || [])
  }

  // =========================================
  // TODAY
  // =========================================

  const getToday = () => {
    const now = new Date()

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
  }

  // =========================================
  // DATE FROM YYYY-MM-DD
  // =========================================

  const getLocalDate = (value) => {
    if (!value) {
      return null
    }

    const parts = value.split('-')

    if (parts.length !== 3) {
      return null
    }

    return new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    )
  }

  // =========================================
  // OVERDUE DATE WITH GRACE PERIOD
  // =========================================

  const getOverdueDate = (record) => {
    if (!record.next_due_date) {
      return null
    }

    const dueDate =
      getLocalDate(record.next_due_date)

    if (!dueDate) {
      return null
    }

    const overdueDate =
      new Date(dueDate)

    /*
      Example:

      Due Date = 18 Sep
      Grace = 2 days

      18 Sep = Due
      19 Sep = Grace
      20 Sep = Grace
      21 Sep = Overdue
    */

    overdueDate.setDate(
      overdueDate.getDate() +
      overdueGraceDays +
      1
    )

    return overdueDate
  }

  // =========================================
  // STATUS
  // =========================================

  const getStatus = (record) => {
    const pending =
      Number(record.pending || 0)

    if (pending <= 0) {
      return 'paid'
    }

    if (!record.next_due_date) {
      return 'pending'
    }

    const overdueDate =
      getOverdueDate(record)

    if (!overdueDate) {
      return 'pending'
    }

    const today = getToday()

    if (today >= overdueDate) {
      return 'overdue'
    }

    return 'pending'
  }

  // =========================================
  // FORMAT MONEY
  // =========================================

  const formatMoney = (value) => {
    return Number(
      value || 0
    ).toLocaleString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }

  // =========================================
  // FORMAT DATE
  // =========================================

  const formatDate = (value) => {
    if (!value) {
      return '-'
    }

    const date =
      getLocalDate(value)

    if (!date) {
      return '-'
    }

    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return date.toLocaleDateString(locale)
  }

  // =========================================
  // FINANCE TYPE
  // =========================================

  const getFinanceTypeName = (type) => {
    switch (type) {
      case 'daily':
        return t('dailyLoan')

      case 'weekly':
        return t('weeklyLoan')

      case 'monthly':
        return t('monthlyLoan')

      case 'interest_only':
      case 'interest-only':
        return t('interestOnlyLoan')

      default:
        return type || '-'
    }
  }

  // =========================================
  // FILTER
  // =========================================

  const filteredRecords =
    useMemo(() => {
      return records.filter(
        (record) => {
          const status =
            getStatus(record)

          const customerName =
            record.customers
              ?.full_name ||
            record.name ||
            ''

          const customerCode =
            record.customers
              ?.customer_id ||
            ''

          const category =
            record.collection_categories
              ?.category_name ||
            ''

          const searchText =
            search
              .trim()
              .toLowerCase()

          const matchesSearch =
            !searchText ||
            customerName
              .toLowerCase()
              .includes(searchText) ||
            customerCode
              .toLowerCase()
              .includes(searchText) ||
            category
              .toLowerCase()
              .includes(searchText)

          const matchesStatus =
            statusFilter === 'all' ||
            status === statusFilter

          const matchesType =
            typeFilter === 'all' ||
            record.finance_type ===
              typeFilter

          return (
            matchesSearch &&
            matchesStatus &&
            matchesType
          )
        }
      )
    }, [
      records,
      statusFilter,
      typeFilter,
      search,
      overdueGraceDays
    ])

  // =========================================
  // SUMMARY
  // =========================================

  const pendingRecords =
    records.filter(
      (record) =>
        getStatus(record) ===
        'pending'
    )

  const overdueRecords =
    records.filter(
      (record) =>
        getStatus(record) ===
        'overdue'
    )

  const totalOutstanding =
    records.reduce(
      (total, record) =>
        total +
        Number(
          record.pending || 0
        ),
      0
    )

  const overdueAmount =
    overdueRecords.reduce(
      (total, record) =>
        total +
        Number(
          record.pending || 0
        ),
      0
    )

  // =========================================
  // OPEN FINANCE
  // =========================================

  const openFinance = (record) => {
    switch (record.finance_type) {
      case 'daily':
        navigate(
          `/daily/${record.id}`
        )
        break

      case 'weekly':
        navigate(
          `/weekly/${record.id}`
        )
        break

      case 'monthly':
        navigate(
          `/monthly/${record.id}`
        )
        break

      case 'interest_only':
      case 'interest-only':
        navigate(
          `/interest-only/${record.id}`
        )
        break

      default:
        alert(
          t('unableOpenFinanceAccount')
        )
    }
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="customer-profile-page">
        <p>
          {t('loadingPendingOverdue')}
        </p>
      </div>
    )
  }

  return (
    <div className="customer-profile-page">

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>
          <p>
            {t('appName')}
          </p>

          <h1>
            {t('pendingOverdue')}
          </h1>

          <span>
            {t('pendingOverdueDescription')}
          </span>
        </div>

        <button
          className="back-button"
          onClick={() =>
            navigate('/admin')
          }
        >
          ← {t('adminDashboard')}
        </button>

      </div>

      {/* SETTINGS INFO */}

      <div
        style={{
          marginBottom: '18px',
          padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: '10px'
        }}
      >
        <strong>
          {t('overdueGracePeriod')}:
        </strong>{' '}
        {t('dayCount', {
          count: overdueGraceDays,
          unit: t(Number(overdueGraceDays) === 1 ? 'day' : 'days')
        })}
      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('pendingAccounts')}
          </span>

          <strong>
            {pendingRecords.length}
          </strong>
        </div>

        <div>
          <span>
            {t('overdueAccounts')}
          </span>

          <strong>
            {overdueRecords.length}
          </strong>
        </div>

        <div>
          <span>
            {t('totalOutstanding')}
          </span>

          <strong>
            ₹{formatMoney(
              totalOutstanding
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('overdueAmount')}
          </span>

          <strong>
            ₹{formatMoney(
              overdueAmount
            )}
          </strong>
        </div>

      </div>

      {/* FILTERS */}

      <div className="daily-manage-section">

        <h2>
          {t('outstandingFinanceAccounts')}
        </h2>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '20px'
          }}
        >

          <input
            type="text"
            placeholder={t('searchCustomerOrCategory')}
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={{
              minWidth: '260px'
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
          >

            <option value="all">
              {t('allStatuses')}
            </option>

            <option value="pending">
              {t('pending')}
            </option>

            <option value="overdue">
              {t('overdue')}
            </option>

          </select>

          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(
                e.target.value
              )
            }
          >

            <option value="all">
              {t('allLoanTypes')}
            </option>

            <option value="daily">
              {t('dailyLoan')}
            </option>

            <option value="weekly">
              {t('weeklyLoan')}
            </option>

            <option value="monthly">
              {t('monthlyLoan')}
            </option>

            <option value="interest_only">
              {t('interestOnlyLoan')}
            </option>

          </select>

        </div>

        {/* TABLE */}

        {filteredRecords.length === 0 ? (

          <div className="no-payment-history">
            {t('noPendingOrOverdueFinanceAccounts')}
          </div>

        ) : (

          <div
            style={{
              overflowX: 'auto'
            }}
          >

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border:
                  '1px solid #d9e0e8'
              }}
            >

              <thead>

                <tr>

                  <th style={thStyle}>
                    {t('customer')}
                  </th>

                  <th style={thStyle}>
                    {t('collectionCategory')}
                  </th>

                  <th style={thStyle}>
                    {t('loanType')}
                  </th>

                  <th style={thStyle}>
                    {t('total')}
                  </th>

                  <th style={thStyle}>
                    {t('paid')}
                  </th>

                  <th style={thStyle}>
                    {t('pending')}
                  </th>

                  <th style={thStyle}>
                    {t('nextDueDate')}
                  </th>

                  <th style={thStyle}>
                    {t('status')}
                  </th>

                  <th style={thStyle}>
                    {t('action')}
                  </th>

                </tr>

              </thead>

              <tbody>

                {filteredRecords.map(
                  (record) => {

                    const status =
                      getStatus(record)

                    const customer =
                      record.customers

                    const category =
                      record
                        .collection_categories

                    return (

                      <tr
                        key={record.id}
                      >

                        <td style={tdStyle}>

                          <strong>
                            {
                              customer
                                ?.full_name ||
                              record.name ||
                              '-'
                            }
                          </strong>

                          <div
                            style={{
                              fontSize: '12px'
                            }}
                          >
                            {
                              customer
                                ?.customer_id ||
                              '-'
                            }
                          </div>

                          <div
                            style={{
                              fontSize: '12px'
                            }}
                          >
                            {
                              customer
                                ?.phone ||
                              ''
                            }
                          </div>

                        </td>

                        <td style={tdStyle}>
                          {
                            category
                              ?.category_name ||
                            t('notAssigned')
                          }
                        </td>

                        <td style={tdStyle}>
                          {
                            getFinanceTypeName(
                              record.finance_type
                            )
                          }
                        </td>

                        <td style={tdStyle}>
                          ₹{formatMoney(
                            record.amount
                          )}
                        </td>

                        <td style={tdStyle}>
                          ₹{formatMoney(
                            record.paid
                          )}
                        </td>

                        <td style={tdStyle}>
                          <strong>
                            ₹{formatMoney(
                              record.pending
                            )}
                          </strong>
                        </td>

                        <td style={tdStyle}>
                          {formatDate(
                            record.next_due_date
                          )}
                        </td>

                        <td style={tdStyle}>

                          <span
                            style={{
                              fontWeight: '700'
                            }}
                          >
                            {
                              status ===
                              'overdue'
                                ? `🔴 ${t('overdue')}`
                                : `🟡 ${t('pending')}`
                            }
                          </span>

                        </td>

                        <td style={tdStyle}>

                          <button
                            type="button"
                            onClick={() =>
                              openFinance(
                                record
                              )
                            }
                          >
                            {t('viewProfile')}
                          </button>

                        </td>

                      </tr>

                    )
                  }
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  whiteSpace: 'nowrap',
  border: '1px solid #d9e0e8',
  background: '#f8fafc'
}

const tdStyle = {
  padding: '12px',
  verticalAlign: 'top',
  border: '1px solid #d9e0e8'
}

export default Pending