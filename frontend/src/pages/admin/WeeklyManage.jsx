import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Clock,
  AlertCircle,
  WalletCards,
  TrendingUp,
  Receipt,
  Calendar,
  Percent,
  Check,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { supabase } from '../../services/supabase'
import { useCollectionEvidence, EvidenceCapture, EvidenceHistory } from '../../components/CollectionEvidence'

function WeeklyManage() {
  const navigate = useNavigate()
  const { financeId } = useParams()
  const { t, i18n } = useTranslation()
  const evidence = useCollectionEvidence(financeId)

  const [finance, setFinance] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [payments, setPayments] = useState([])
  const [schedule, setSchedule] = useState([])

  const [paymentDate, setPaymentDate] = useState(() => getLocalDateString())
  const [paymentAmount, setPaymentAmount] = useState('')
  const [scheduleFilter, setScheduleFilter] = useState('all')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEverything()
  }, [financeId])

  // =========================================
  // LOAD DATA
  // =========================================

  async function loadEverything() {
    setLoading(true)

    // WEEKLY FINANCE
    const {
      data: financeData,
      error: financeError
    } = await supabase
      .from('finance_records')
      .select('*')
      .eq('id', financeId)
      .eq('finance_type', 'weekly')
      .single()

    if (financeError) {
      console.error(financeError)
      notify(t('financeLoadFailed', { message: financeError.message }))
      setLoading(false)
      return
    }

    setFinance(financeData)

    // CUSTOMER
    if (financeData.customer_id) {
      const {
        data: customerData,
        error: customerError
      } = await supabase
        .from('customers')
        .select('*')
        .eq('id', financeData.customer_id)
        .single()

      if (!customerError) {
        setCustomer(customerData)
      }
    }

    // PAYMENT HISTORY
    const {
      data: paymentData,
      error: paymentError
    } = await supabase
      .from('finance_payments')
      .select('*')
      .eq('finance_record_id', financeId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (paymentError) {
      console.error(paymentError)
    }

    setPayments(paymentData || [])

    // WEEKLY SCHEDULE
    const {
      data: scheduleData,
      error: scheduleError
    } = await supabase
      .from('repayment_schedule')
      .select('*')
      .eq('finance_record_id', financeId)
      .order('installment_number', { ascending: true })

    if (scheduleError) {
      console.error(scheduleError)
    }

    setSchedule(scheduleData || [])
    setLoading(false)
  }

  // =========================================
  // RECORD WEEKLY PAYMENT
  // =========================================

  const recordPayment = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!finance) return

    const amount = Number(paymentAmount)
    const currentPending = Number(finance.pending || 0)

    if (!paymentDate) {
      notify(t('selectPaymentDate'))
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      notify(t('enterValidPaymentAmount'))
      return
    }

    if (amount > currentPending) {
      notify(
        t('paymentCannotExceedPending', {
          amount: formatMoney(currentPending)
        })
      )
      return
    }

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      notify(t('pleaseLoginAgain'))
      navigate('/')
      return
    }

    setSaving(true)

    // SAFE DATABASE TRANSACTION
    const { error, warning } = await evidence.recordPayment(
      'record_weekly_payment',
      {
        p_finance_record_id: Number(finance.id),
        p_payment_amount: amount,
        p_payment_date: paymentDate
      }
    )

    if (warning) notify(warning)

    if (error) {
      console.error(error)
      setSaving(false)
      notify(t('unableToRecordPayment', { message: error.message }))
      return
    }

    setPaymentAmount('')
    setPaymentDate(getLocalDateString())
    await loadEverything()
    setSaving(false)

    const remaining = currentPending - amount
    if (remaining <= 0) {
      notify(t('weeklyPaymentClosedSuccess'))
    } else {
      notify(t('weeklyPaymentSuccess'))
    }
  }

  // =========================================
  // DISPLAY STATUS
  // =========================================

  const getDisplayStatus = (item) => {
    const due = Number(item.due_amount || 0)
    const paid = Number(item.paid_amount || 0)

    if (paid >= due) return 'paid'
    if (paid > 0) return 'partiallyPaid'

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDate = new Date(`${item.due_date}T00:00:00`)

    if (dueDate < today) return 'overdue'
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

  // Counts
  const paidInstallments = schedule.filter((i) => getDisplayStatus(i) === 'paid').length
  const overdueInstallments = schedule.filter((i) => getDisplayStatus(i) === 'overdue').length
  const partialInstallments = schedule.filter((i) => getDisplayStatus(i) === 'partiallyPaid').length
  const pendingInstallments = schedule.filter((i) => getDisplayStatus(i) === 'pending').length

  const filteredSchedule = useMemo(() => {
    if (scheduleFilter === 'all') return schedule
    return schedule.filter((item) => {
      const status = getDisplayStatus(item)
      if (scheduleFilter === 'pending') return status === 'pending' || status === 'partiallyPaid'
      return status === scheduleFilter
    })
  }, [schedule, scheduleFilter])

  if (loading) {
    return (
      <div className="modern-loan-manage">
        <div className="modern-card p-12 text-center text-secondary">
          <Clock className="animate-spin mx-auto mb-3 text-primary" size={28} />
          <p>{t('loadingWeeklyFinance')}</p>
        </div>
      </div>
    )
  }

  if (!finance) {
    return (
      <div className="modern-loan-manage">
        <div className="modern-card p-12 text-center">
          <AlertCircle size={36} className="mx-auto mb-3 text-danger" />
          <h2 className="text-xl font-bold mb-3">{t('weeklyFinanceNotFound')}</h2>
          <button className="modern-btn-primary" onClick={() => navigate('/customers')}>
            {t('customers')}
          </button>
        </div>
      </div>
    )
  }

  const pending = Number(finance.pending || 0)
  const principal = Number(
    finance.original_principal ||
    finance.principal_amount ||
    finance.amount ||
    0
  )

  const weeklyAmount = schedule.length > 0 ? Number(schedule[0].due_amount || 0) : 0
  const isClosed = finance.loan_status === 'closed' || pending <= 0

  const totalAmount = Number(finance.amount || 0)
  const totalPaid = Number(finance.paid || 0)
  const progressRatio = totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : 0

  const currentEnteredAmount = Number(paymentAmount) || 0
  const simulatedRemaining = Math.max(0, pending - currentEnteredAmount)

  return (
    <div className="modern-loan-manage">
      {/* BACK BUTTON */}
      <button
        className="modern-back-link"
        onClick={() => {
          if (finance.customer_id) {
            navigate(`/customers/${finance.customer_id}`)
          } else {
            navigate('/customers')
          }
        }}
      >
        <ArrowLeft size={16} />
        <span>{t('customerProfile')}</span>
      </button>

      {/* HEADER HERO */}
      <div className="modern-manage-hero">
        <div className="modern-manage-title-wrap">
          <span className="modern-loan-category-tag">
            <CalendarRange size={14} />
            {t('weeklyFinance')}
          </span>
          <h1 className="modern-manage-heading">{t('manageWeeklyLoan')}</h1>
          <div className="modern-customer-meta">
            <span>{t('customer')}:</span>
            <strong className="modern-customer-pill">
              {customer?.full_name || finance.name}
            </strong>
            {customer?.customer_id && (
              <span className="text-muted">({customer.customer_id})</span>
            )}
          </div>
        </div>

        <span className={`modern-status-badge ${isClosed ? 'closed' : 'active'}`}>
          <span className="w-2 h-2 rounded-full bg-current" />
          {isClosed ? t('closedUpper') : t('activeUpper')}
        </span>
      </div>

      {/* 4-CARD SUMMARY METRICS */}
      <div className="modern-summary-grid">
        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('principal')}</span>
            <WalletCards size={18} className="text-primary" />
          </div>
          <div className="modern-summary-val">₹{formatMoney(principal)}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('totalPaid')}</span>
            <CheckCircle2 size={18} className="text-emerald" />
          </div>
          <div className="modern-summary-val emerald">₹{formatMoney(totalPaid)}</div>
          <div className="modern-progress-bar-wrap">
            <div className="modern-progress-bar-fill" style={{ width: `${progressRatio}%` }} />
          </div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('pending')}</span>
            <AlertCircle size={18} className="text-amber" />
          </div>
          <div className="modern-summary-val amber">₹{formatMoney(pending)}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('installments')}</span>
            <TrendingUp size={18} className="text-primary" />
          </div>
          <div className="modern-summary-val">
            {paidInstallments} <span className="text-sm text-secondary font-normal">/ {schedule.length} {t('weeks')}</span>
          </div>
          <span className="text-xs text-muted mt-2">{t('percentRepaid', { percent: progressRatio })}</span>
        </div>
      </div>

      {/* LOAN SPECIFICATIONS */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <CalendarRange size={18} className="text-primary" />
            <span>{t('weeklyLoanInformation')}</span>
          </div>
        </div>

        <div className="modern-info-grid">
          <div className="modern-info-item">
            <span className="modern-info-label">{t('weeklyAmount')}</span>
            <span className="modern-info-val">₹{formatMoney(weeklyAmount)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('rateOfInterest')}</span>
            <span className="modern-info-val">{Number(finance.interest_rate || 0)}%</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('interestAmount')}</span>
            <span className="modern-info-val">₹{formatMoney(finance.interest_due)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('totalRepayment')}</span>
            <span className="modern-info-val">₹{formatMoney(finance.amount)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('startDate')}</span>
            <span className="modern-info-val">{formatDate(finance.entry_date)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('endingDate')}</span>
            <span className="modern-info-val">{formatDate(finance.ending_date)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('nextDueDate')}</span>
            <span className="modern-info-val">{isClosed ? '-' : formatDate(finance.next_due_date)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('status')}</span>
            <span className="modern-info-val">{isClosed ? t('closed') : t('active')}</span>
          </div>
        </div>
      </div>

      {/* RECORD PAYMENT SECTION */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <Receipt size={18} className="text-primary" />
            <span>{t('recordWeeklyPayment')}</span>
          </div>
        </div>

        {isClosed ? (
          <div className="p-6 rounded-xl bg-surface-hover border border-border text-center">
            <CheckCircle2 size={32} className="text-emerald mx-auto mb-2" />
            <h3 className="text-base font-bold text-primary mb-1">{t('weeklyLoanCompleted')}</h3>
            <p className="text-sm text-secondary">{t('financeFullyPaid')}</p>
          </div>
        ) : (
          <form className="modern-payment-form" onSubmit={recordPayment}>
            <div className="modern-form-row">
              <div className="modern-field">
                <label htmlFor="weeklyPaymentDate">{t('paymentDate')} *</label>
                <input
                  id="weeklyPaymentDate"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>

              <div className="modern-field">
                <label htmlFor="weeklyPaymentAmount">{t('paymentAmount')} ₹ *</label>
                <input
                  id="weeklyPaymentAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentAmount}
                  placeholder={
                    weeklyAmount > 0
                      ? t('weeklyAmountPlaceholder', { amount: formatMoney(weeklyAmount) })
                      : t('enterAmount')
                  }
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
                {weeklyAmount > 0 && (
                  <button
                    type="button"
                    className="modern-quick-amount-chip"
                    onClick={() => setPaymentAmount(String(weeklyAmount))}
                  >
                    <Sparkles size={12} />
                    Fill Weekly Due: ₹{formatMoney(weeklyAmount)}
                  </button>
                )}
              </div>
            </div>

            {currentEnteredAmount > 0 && (
              <div className="modern-live-calc-box">
                <span>{t('remainingAfterPayment')}</span>
                <strong>₹{formatMoney(simulatedRemaining)}</strong>
              </div>
            )}

            <EvidenceCapture evidence={evidence} disabled={saving} />

            <div>
              <button
                type="submit"
                className="modern-btn-primary"
                disabled={saving}
              >
                <Check size={16} />
                <span>{saving ? t('recording') : t('recordPayment')}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* REPAYMENT SCHEDULE TABLE */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div>
            <div className="modern-card-title">
              <Calendar size={18} className="text-primary" />
              <span>{t('weeklyCollectionSchedule')}</span>
            </div>
            <p className="modern-card-subtitle">
              {t('weekRepaymentSchedule', { count: schedule.length })}
            </p>
          </div>

          <div className="modern-table-filter-bar">
            <button
              type="button"
              className={`modern-filter-btn ${scheduleFilter === 'all' ? 'active' : ''}`}
              onClick={() => setScheduleFilter('all')}
            >
              All ({schedule.length})
            </button>
            <button
              type="button"
              className={`modern-filter-btn ${scheduleFilter === 'paid' ? 'active' : ''}`}
              onClick={() => setScheduleFilter('paid')}
            >
              Paid ({paidInstallments})
            </button>
            <button
              type="button"
              className={`modern-filter-btn ${scheduleFilter === 'overdue' ? 'active' : ''}`}
              onClick={() => setScheduleFilter('overdue')}
            >
              Overdue ({overdueInstallments})
            </button>
            <button
              type="button"
              className={`modern-filter-btn ${scheduleFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setScheduleFilter('pending')}
            >
              Pending ({pendingInstallments + partialInstallments})
            </button>
          </div>
        </div>

        {schedule.length === 0 ? (
          <div className="p-8 text-center text-muted">
            {t('weeklyScheduleNotGenerated')}
          </div>
        ) : (
          <div className="modern-table-card">
            <div className="modern-table-wrap">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>{t('week')}</th>
                    <th>{t('dueDate')}</th>
                    <th>{t('dueAmount')}</th>
                    <th>{t('paid')}</th>
                    <th>{t('balance')}</th>
                    <th>{t('paidDate')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedule.map((item) => {
                    const status = getDisplayStatus(item)
                    const balance = Math.max(0, Number(item.due_amount || 0) - Number(item.paid_amount || 0))

                    return (
                      <tr key={item.id}>
                        <td>{t('weekNumber', { number: item.installment_number })}</td>
                        <td>{formatDate(item.due_date)}</td>
                        <td>₹{formatMoney(item.due_amount)}</td>
                        <td>₹{formatMoney(item.paid_amount)}</td>
                        <td>₹{formatMoney(balance)}</td>
                        <td>{formatDate(item.paid_date)}</td>
                        <td>
                          <span className={`modern-table-chip ${status}`}>
                            {t(status)}
                          </span>
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

      <EvidenceHistory financeId={finance?.id} payments={payments} />

      {/* PAYMENT HISTORY TABLE */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div>
            <div className="modern-card-title">
              <Receipt size={18} className="text-primary" />
              <span>{t('paymentHistory')}</span>
            </div>
            <p className="modern-card-subtitle">
              {t('paymentsRecorded', { count: payments.length })}
            </p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="p-8 text-center text-muted">
            {t('noWeeklyPaymentsRecorded')}
          </div>
        ) : (
          <div className="modern-table-card">
            <div className="modern-table-wrap">
              <table className="modern-data-table">
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
                    <tr key={payment.id}>
                      <td>{payments.length - index}</td>
                      <td>{formatDate(payment.payment_date)}</td>
                      <td>₹{formatMoney(payment.payment_amount)}</td>
                      <td>₹{formatMoney(payment.balance_before)}</td>
                      <td>₹{formatMoney(payment.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getLocalDateString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default WeeklyManage
