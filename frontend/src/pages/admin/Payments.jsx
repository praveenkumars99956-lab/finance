import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { formatMoney as formatMoneyValue } from '../../utils/money'
import { normalizeFinanceType } from '../../utils/financeType'
import { notify } from '../../utils/notify'
import VoiceInputButton from '../../components/VoiceInputButton'
import SelectMenu from '../../components/SelectMenu'
import { cacheQuery } from '../../services/offlineSync'

const PAYMENTS_CACHE_KEY = 'payments:recent'
const PAYMENTS_CACHE_TTL = 2 * 60 * 1000

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function Payments() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [usingCachedData, setUsingCachedData] = useState(false)
  const [totals, setTotals] = useState(null)

  const locale =
    { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN', te: 'te-IN', kn: 'kn-IN' }[
      i18n.resolvedLanguage
    ] || 'en-IN'
  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)
  const formatDate = (value) => {
    if (!value) return '-'
    return new Date(`${value}T00:00:00`).toLocaleDateString(locale)
  }

  useEffect(() => {
    loadPayments()
  }, [])

  async function loadPayments() {
    setLoading(true)

    const { data, error, fromCache } = await cacheQuery(
      PAYMENTS_CACHE_KEY,
      () =>
        supabase
          .from('finance_payments')
          .select(`
            id,
            finance_record_id,
            payment_date,
            payment_amount,
            balance_before,
            balance_after,
            created_at,
            finance_records (
              id,
              finance_type,
              amount,
              paid,
              pending,
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
            )
          `)
          .order('created_at', { ascending: false })
          .limit(250),
      { ttlMs: PAYMENTS_CACHE_TTL }
    )

    if (error) {
      console.error(error)
      notify(t('unableToLoadPayments', 'Unable to load payments: {{message}}', {
        message: error.message
      }))
      setLoading(false)
      return
    }

    setPayments(data || [])
    setUsingCachedData(Boolean(fromCache))

    // The table is intentionally capped at 250 rows for fast rendering. Ask
    // the database for exact ledger-wide aggregates; if the RPC has not been
    // deployed yet, the client-side fallback below still works.
    const currentDay = localDateString()
    const { data: totalsData, error: totalsError } = await supabase.rpc(
      'finance_payment_totals',
      {
        p_today: currentDay,
        p_month_start: `${currentDay.slice(0, 7)}-01`
      }
    )

    if (totalsError) {
      console.error('Unable to load payment totals:', totalsError)
      setTotals(null)
    } else {
      setTotals(Array.isArray(totalsData) ? totalsData[0] : totalsData)
    }

    setLoading(false)
  }

  const today = localDateString()
  const monthPrefix = today.slice(0, 7)

  const todayTotal = totals?.today_total !== undefined
    ? Number(totals.today_total)
    : payments
        .filter((payment) => payment.payment_date === today)
        .reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0)
  const monthTotal = totals?.month_total !== undefined
    ? Number(totals.month_total)
    : payments
        .filter((payment) => String(payment.payment_date || '').startsWith(monthPrefix))
        .reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0)
  const paymentCount = totals?.payment_count !== undefined
    ? Number(totals.payment_count)
    : payments.length
  const customersPaid = totals?.customers_paid !== undefined
    ? Number(totals.customers_paid)
    : new Set(
        payments
          .map((payment) => payment.finance_records?.customers?.id)
          .filter(Boolean)
      ).size

  const filtered = payments.filter((payment) => {
    const record = payment.finance_records || {}
    const customer = record.customers || {}
    const category = record.collection_categories || {}
    const type = normalizeFinanceType(record.finance_type)

    if (typeFilter !== 'all' && type !== typeFilter) return false

    const haystack = [
      customer.full_name,
      customer.customer_id,
      customer.phone,
      category.category_name,
      type,
      payment.payment_date,
      payment.payment_amount
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(search.trim().toLowerCase())
  })

  const financeTypeLabel = (type) => {
    switch (normalizeFinanceType(type)) {
      case 'daily':
        return t('dailyLoan', 'Daily Loan')
      case 'weekly':
        return t('weeklyLoan', 'Weekly Loan')
      case 'monthly':
        return t('monthlyLoan', 'Monthly Loan')
      case 'interest_only':
        return t('interestOnlyLoan', 'Interest-Only Loan')
      default:
        return type || '-'
    }
  }

  return (
    <div className="payments-page flex flex-col gap-space-lg">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <span className="w-fit px-space-sm py-space-xs rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold uppercase tracking-wider">
            {t('treasuryCore', 'Treasury Core')}
          </span>
          <h1 className="font-headline-xl text-headline-xl text-on-surface">
            {t('payments', 'Payments')}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {t(
              'paymentsDashboardDescription',
              'Every recorded collection, newest first, with same-day and month-to-date totals.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate('/collections')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
            {t('collections', 'Collections')}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate('/reports/collections')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">analytics</span>
            {t('collectionReport', 'Collection report')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={loadPayments}
            disabled={loading}
          >
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            {t('refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {usingCachedData && (
        <div className="offline-inline-banner" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <span>
            {t(
              'offlineCachedData',
              'Showing the last cached copy. New entries are saved on this device and sync automatically.'
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <MetricCard
          eyebrow={t('collectedToday', 'Collected today')}
          value={formatMoney(todayTotal)}
          icon="today"
          tone="primary"
        />
        <MetricCard
          eyebrow={t('monthToDate', 'Month to date')}
          value={formatMoney(monthTotal)}
          icon="calendar_month"
          tone="secondary"
        />
        <MetricCard
          eyebrow={t('paymentsRecorded', { count: paymentCount })}
          value={String(paymentCount)}
          icon="payments"
          tone="neutral"
        />
        <MetricCard
          eyebrow={t('customersPaid', 'Customers paid')}
          value={String(customersPaid)}
          icon="groups"
          tone="success"
        />
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:flex-wrap gap-space-sm">
        <div className="search-wrapper payments-search relative flex-1 w-full md:basis-full min-w-0">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPayments', 'Search customer, phone, loan...')}
            className="w-full pl-4 pr-14 py-3 rounded-DEFAULT bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-sm font-body-md text-body-md"
          />
          <VoiceInputButton
            className="voice-field-button voice-field-button--search"
            onResult={(text) => setSearch(text)}
          />
        </div>

        <SelectMenu
          value={typeFilter}
          onChange={setTypeFilter}
          ariaLabel={t('filterByLoanType', 'Filter by loan type')}
          className="w-full md:w-64 md:flex-none"
          options={[
            { value: 'all', label: t('allLoanTypes', 'All loan types') },
            { value: 'daily', label: t('dailyLoan', 'Daily Loan') },
            { value: 'weekly', label: t('weeklyLoan', 'Weekly Loan') },
            { value: 'monthly', label: t('monthlyLoan', 'Monthly Loan') },
            { value: 'interest_only', label: t('interestOnlyLoan', 'Interest-Only Loan') }
          ]}
        />
      </div>

      {loading ? (
        <div className="p-space-xl text-center text-outline bg-surface-container-lowest rounded-DEFAULT shadow-sm">
          <span className="material-symbols-outlined text-[32px] animate-spin text-primary">sync</span>
          <p className="mt-2 font-body-md">{t('loadingPayments', 'Loading payments…')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-space-xl text-center bg-surface-container-lowest rounded-DEFAULT shadow-sm border border-outline-variant/20">
          <span className="material-symbols-outlined text-[30px] text-outline">payments</span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-2">
            {t('noPaymentsFound', 'No payments found')}
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('noPaymentsMatch', 'Try a different search, or record a collection from the agent workspace.')}
          </p>
        </div>
      ) : (
        <div className="rounded-DEFAULT bg-surface-container-lowest shadow-sm border border-outline-variant/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                  <th className="px-space-md py-space-sm">{t('date', 'Date')}</th>
                  <th className="px-space-md py-space-sm">{t('customer', 'Customer')}</th>
                  <th className="px-space-md py-space-sm">{t('loanType', 'Loan type')}</th>
                  <th className="px-space-md py-space-sm">{t('category', 'Category')}</th>
                  <th className="px-space-md py-space-sm text-right">{t('amount', 'Amount')}</th>
                  <th className="px-space-md py-space-sm text-right">{t('balanceAfter', 'Balance after')}</th>
                  <th className="px-space-md py-space-sm">{t('action', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment) => {
                  const record = payment.finance_records || {}
                  const customer = record.customers || {}
                  const category = record.collection_categories || {}
                  const type = normalizeFinanceType(record.finance_type)

                  return (
                    <tr key={payment.id} data-finance-id={record.id} className="border-t border-outline-variant/20 hover:bg-surface-container-low/60">
                      <td className="px-space-md py-space-sm font-body-md text-on-surface whitespace-nowrap">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-space-md py-space-sm">
                        <div className="flex flex-col">
                          <span className="font-label-lg text-label-lg text-on-surface font-semibold">
                            {customer.full_name || t('thisCustomer', 'This customer')}
                          </span>
                          <span className="font-label-sm text-label-sm text-outline font-mono">
                            {customer.customer_id || customer.phone || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-space-md py-space-sm">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold whitespace-nowrap">
                          {financeTypeLabel(type)}
                        </span>
                      </td>
                      <td className="px-space-md py-space-sm font-body-md text-on-surface-variant">
                        {category.category_name || '-'}
                      </td>
                      <td className="px-space-md py-space-sm text-right font-label-lg text-label-lg text-primary font-bold whitespace-nowrap">
                        {formatMoney(payment.payment_amount)}
                      </td>
                      <td className="px-space-md py-space-sm text-right font-body-md text-on-surface-variant whitespace-nowrap">
                        {formatMoney(payment.balance_after)}
                      </td>
                      <td className="px-space-md py-space-sm">
                        <div className="flex items-center gap-space-xs">
                          {record.id && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() =>
                                navigate(
                                  `/${type === 'interest_only' ? 'interest-only' : type}/${record.id}`
                                )
                              }
                            >
                              {t('open', 'Open')}
                            </button>
                          )}
                          {customer.id && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/customers/${customer.id}/finance`)}
                            >
                              {t('profile', 'Profile')}
                            </button>
                          )}
                        </div>
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
  )
}

function MetricCard({ eyebrow, value, icon, tone }) {
  return (
    <div className={`p-space-md rounded-DEFAULT bg-surface-container-lowest shadow-sm border border-outline-variant/20 flex items-center justify-between metric-card metric-card--${tone}`}>
      <div className="flex flex-col">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
          {eyebrow}
        </span>
        <span className="font-data-metric text-data-metric text-on-surface font-bold">
          {value}
        </span>
      </div>
      <div className="metric-card-icon">
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      </div>
    </div>
  )
}

export default Payments
