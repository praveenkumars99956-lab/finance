import {
  useEffect,
  useRef,
  useState
} from 'react'

import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { supabase } from '../services/supabase'
import { formatMoney } from '../utils/money'
import { normalizeFinanceType } from '../utils/financeType'
import {
  getCollectedAmount,
  getInstallmentAmount
} from '../utils/loanSummary'

const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, [contenteditable="true"]'

const DATE_LOCALE_BY_LANGUAGE = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  ml: 'ml-IN'
}

const TYPE_LABEL_KEYS = {
  daily: 'dailyLoan',
  weekly: 'weeklyLoan',
  monthly: 'monthlyLoan',
  interest_only: 'interestOnlyLoan'
}

function formatDate(value, language) {
  if (!value) return '-'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return parsed.toLocaleDateString(DATE_LOCALE_BY_LANGUAGE[language] || 'en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export default function LoanSummaryOverlay() {
  const { t, i18n } = useTranslation()
  const closeButtonRef = useRef(null)

  const [financeId, setFinanceId] = useState(null)
  const [finance, setFinance] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [category, setCategory] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function handleClick(event) {
      if (event.defaultPrevented) return
      if (!(event.target instanceof Element)) return
      if (event.target.closest(INTERACTIVE_SELECTOR)) return

      const row = event.target.closest('[data-finance-id]')
      if (!row) return

      const id = row.getAttribute('data-finance-id')
      if (!id) return

      event.preventDefault()
      setFinanceId(id)
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    if (!financeId) return undefined

    let cancelled = false

    setFinance(null)
    setCustomer(null)
    setCategory(null)
    setPayments([])
    setError('')
    setLoading(true)

    async function loadSummary() {
      const { data: financeData, error: financeError } = await supabase
        .from('finance_records')
        .select('*')
        .eq('id', financeId)
        .single()

      if (cancelled) return

      if (financeError) {
        setError(financeError.message || t('unableLoginTryAgain'))
        setLoading(false)
        return
      }

      setFinance(financeData)

      const queries = []

      if (financeData?.customer_id) {
        queries.push(
          supabase
            .from('customers')
            .select('*')
            .eq('id', financeData.customer_id)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setCustomer(data || null)
            })
        )
      }

      if (financeData?.collection_category_id) {
        queries.push(
          supabase
            .from('collection_categories')
            .select('*')
            .eq('id', financeData.collection_category_id)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setCategory(data || null)
            })
        )
      }

      queries.push(
        supabase
          .from('finance_payments')
          .select('*')
          .eq('finance_record_id', financeId)
          .order('payment_date', { ascending: false })
          .order('created_at', { ascending: false })
          .then(({ data }) => {
            if (!cancelled) setPayments(data || [])
          })
      )

      await Promise.all(queries)

      if (!cancelled) setLoading(false)
    }

    loadSummary()

    return () => {
      cancelled = true
    }
  }, [financeId, t])

  useEffect(() => {
    if (!financeId) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') setFinanceId(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [financeId])

  if (!financeId) return null

  const language = i18n?.language || 'en'
  const type = normalizeFinanceType(finance?.finance_type)
  const typeLabelKey = TYPE_LABEL_KEYS[type]
  const principal = Number(
    finance?.principal_amount ?? finance?.original_principal ?? 0
  )
  const interest = Number(
    finance?.interest_accrual ?? finance?.interest_due ?? 0
  )
  const total = Number(finance?.amount ?? finance?.total_amount ?? 0)
  const collected = getCollectedAmount(finance || {}, payments)
  const outstanding = Number(
    finance?.pending ?? Math.max(total - collected, 0)
  )
  const emi = getInstallmentAmount(finance || {})
  const money = (value) => `₹${formatMoney(value, language)}`

  const facts = finance
    ? [
        [t('loanType'), typeLabelKey ? t(typeLabelKey) : (finance.finance_type || '-')],
        [t('collectionCategory'), category?.category_name || t('notAssigned')],
        [t('status'), finance.loan_status || (outstanding > 0 ? t('active') : t('closed'))],
        [t('principal'), money(principal)],
        [t('interestRate'), `${finance.interest_rate ?? 0}%`],
        [t('interest'), money(interest)],
        [t('totalAmount'), money(total)],
        [t('collected'), money(collected)],
        [t('outstandingBalance'), money(outstanding)],
        [t('emi', 'EMI / Installment'), money(emi)],
        [t('startDate'), formatDate(finance.payment_date || finance.entry_date, language)],
        [t('endDate', 'End Date'), formatDate(finance.ending_date, language)],
        [t('nextDueDate'), formatDate(finance.next_due_date, language)]
      ]
    : []

  return createPortal(
    <div
      className="loan-summary-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setFinanceId(null)
      }}
    >
      <section
        className="loan-summary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-summary-title"
      >
        <header className="loan-summary-header">
          <div>
            <h2 id="loan-summary-title">{t('loanSummary')}</h2>
            <p>
              {customer?.full_name || finance?.name || t('customer')}
              {customer?.customer_id ? ` · ${customer.customer_id}` : ''}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="loan-summary-close"
            aria-label={t('close', 'Close')}
            onClick={() => setFinanceId(null)}
          >
            ×
          </button>
        </header>

        <div className="loan-summary-body">
          {loading && <p className="loan-summary-message">{t('loading')}</p>}

          {!loading && error && (
            <p className="loan-summary-message loan-summary-error">{error}</p>
          )}

          {!loading && !error && finance && (
            <>
              <div className="loan-summary-facts">
                {facts.map(([label, value]) => (
                  <div className="loan-summary-fact" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div className="loan-summary-history">
                <h3>{t('paymentHistory')}</h3>

                {payments.length === 0 ? (
                  <p className="loan-summary-message">
                    {t('noPaymentsRecorded')}
                  </p>
                ) : (
                  <div className="loan-summary-table-wrap">
                    <table className="loan-summary-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t('paymentDate')}</th>
                          <th>{t('payment')}</th>
                          <th>{t('balanceBefore')}</th>
                          <th>{t('balanceAfter')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment, index) => (
                          <tr key={payment.id || `${payment.payment_date}-${index}`}>
                            <td>{payments.length - index}</td>
                            <td>{formatDate(payment.payment_date, language)}</td>
                            <td>{money(payment.payment_amount)}</td>
                            <td>{money(payment.balance_before)}</td>
                            <td>{money(payment.balance_after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  )
}
