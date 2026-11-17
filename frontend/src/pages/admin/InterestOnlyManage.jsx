import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Percent,
  CheckCircle2,
  Clock,
  AlertCircle,
  WalletCards,
  TrendingUp,
  Receipt,
  Calendar,
  Check,
  Sparkles,
  MapPin,
  Camera
} from 'lucide-react'

import { supabase } from '../../services/supabase'

import {
  useCollectionEvidence,
  EvidenceCapture,
  EvidenceHistory
} from '../../components/CollectionEvidence'

import CalendarDatePicker from '../../components/CalendarDatePicker'

import {
  getInterestOnlyBalance,
  getInterestOnlyInterestDue
} from '../../services/interestOnly'

// ======================================================
// LOCAL DATE
// ======================================================

const getLocalDate = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function InterestOnlyManage() {
  const navigate = useNavigate()
  const { financeId } = useParams()
  const { t, i18n } = useTranslation()

  const evidence = useCollectionEvidence(financeId)

  const [finance, setFinance] = useState(null)
  const [customer, setCustomer] = useState(null)

  const [payments, setPayments] = useState([])
  const [adjustments, setAdjustments] = useState([])

  const [paymentDate, setPaymentDate] = useState(getLocalDate())
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('manual')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEverything()
  }, [financeId])

  async function loadEverything() {
    try {
      setLoading(true)

      const { data: financeData, error: financeError } = await supabase
        .from('finance_records')
        .select('*')
        .eq('id', financeId)
        .eq('finance_type', 'interest_only')
        .single()

      if (financeError) {
        console.error('Finance load error:', financeError)
        notify(t('financeLoadFailed', { message: financeError.message }))
        setLoading(false)
        return
      }

      setFinance(financeData)

      if (financeData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('id', financeData.customer_id)
          .single()

        if (!customerError) {
          setCustomer(customerData)
        }
      }

      const { data: paymentData, error: paymentError } = await supabase
        .from('finance_payments')
        .select('*')
        .eq('finance_record_id', financeId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (paymentError) {
        console.error('Payment load error:', paymentError)
      }

      setPayments(paymentData || [])

      const { data: adjustmentData, error: adjustmentError } = await supabase
        .from('finance_principal_adjustments')
        .select('*')
        .eq('finance_record_id', financeId)
        .order('adjustment_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (adjustmentError) {
        console.error('Adjustment load error:', adjustmentError)
      }

      setAdjustments(adjustmentData || [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to load interest-only finance:', err)
      setLoading(false)
    }
  }

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(`${value}T00:00:00`)
    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN',
      { day: '2-digit', month: '2-digit', year: 'numeric' }
    )
  }

  const handlePaymentDateChange = (date) => {
    if (!date) return
    setPaymentDate(date)
  }

  const recordPayment = async (e) => {
    e.preventDefault()
    if (saving || !finance) return

    const submittedPaymentDate = paymentDate
    if (!submittedPaymentDate) {
      notify(t('selectPaymentDate'))
      return
    }

    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      notify(t('enterValidPaymentAmount'))
      return
    }

    const calculatedInterestDue = getInterestOnlyInterestDue(
      finance,
      submittedPaymentDate,
      payments,
      adjustments
    )

    if (amount > calculatedInterestDue) {
      notify(
        t('interestPaymentCannotExceedDue', {
          amount: formatMoney(calculatedInterestDue)
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

    try {
      const rpcPayload = {
        p_finance_record_id: Number(finance.id),
        p_payment_amount: amount,
        p_payment_date: submittedPaymentDate
      }

      let error = null
      let warning = null

      if (paymentMode === 'evidence') {
        const result = await evidence.recordPayment(
          'record_interest_only_payment',
          rpcPayload
        )
        error = result.error
        warning = result.warning
      } else {
        const rpcResult = await supabase.rpc(
          'record_interest_only_payment',
          rpcPayload
        )
        error = rpcResult.error
      }

      if (warning) notify(warning)

      if (error) {
        console.error('Interest-only payment error:', error)
        setSaving(false)
        notify(t('unableToRecordPayment', { message: error.message }))
        return
      }

      setPaymentAmount('')
      await loadEverything()
      setSaving(false)

      const remainingInterest = calculatedInterestDue - amount
      if (remainingInterest <= 0) {
        notify(t('interestPaymentClearedSuccess'))
      } else {
        notify(t('interestPaymentSuccess'))
      }
    } catch (err) {
      console.error('Failed to submit interest-only payment:', err)
      setSaving(false)
      notify(t('unexpectedErrorOccurred'))
    }
  }

  if (loading) {
    return (
      <div className="modern-loan-manage">
        <div className="modern-card p-12 text-center text-secondary">
          <Clock className="animate-spin mx-auto mb-3 text-primary" size={28} />
          <p>{t('loadingInterestOnlyFinance')}</p>
        </div>
      </div>
    )
  }

  if (!finance) {
    return (
      <div className="modern-loan-manage">
        <div className="modern-card p-12 text-center">
          <AlertCircle size={36} className="mx-auto mb-3 text-danger" />
          <h2 className="text-xl font-bold mb-3">{t('financeNotFound')}</h2>
          <button className="modern-btn-primary" onClick={() => navigate('/customers')}>
            {t('customers')}
          </button>
        </div>
      </div>
    )
  }

  const principal = Number(
    finance.principal_outstanding ??
    finance.original_principal ??
    finance.principal_amount ??
    0
  )

  const originalInterest = Number(finance.interest_accrual || 0)
  const totalPaid = Number(finance.paid || 0)
  const todayString = getLocalDate()

  const pending = getInterestOnlyBalance(
    finance,
    todayString,
    payments,
    adjustments
  )

  const interestPaid = Number(finance.interest_paid || 0)
  const interestDueToday = getInterestOnlyInterestDue(
    finance,
    todayString,
    payments,
    adjustments
  )

  const principalPaid = Number(finance.principal_paid || 0)
  const principalOutstanding = Number(finance.principal_outstanding || 0)

  const monthlyInterestAmount =
    Math.round(
      principalOutstanding *
      Number(finance.interest_rate || 0) /
      100 *
      100
    ) / 100

  const weeklyInterestAmount =
    Math.round(
      monthlyInterestAmount *
      7 /
      30 *
      100
    ) / 100

  const selectedInterestDue = getInterestOnlyInterestDue(
    finance,
    paymentDate,
    payments,
    adjustments
  )

  const selectedBalance = getInterestOnlyBalance(
    finance,
    paymentDate,
    payments,
    adjustments
  )

  const isClosed = finance.loan_status === 'closed' || pending <= 0

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
            <Percent size={14} />
            {t('interestOnlyFinance')}
          </span>
          <h1 className="modern-manage-heading">{t('manageInterestOnlyLoan')}</h1>
          <div className="modern-customer-meta">
            <span>{t('customer')}:</span>
            <strong className="modern-customer-pill">
              {customer?.full_name || finance.name || '-'}
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
            <span className="modern-summary-label">{t('interest')}</span>
            <Percent size={18} className="text-primary" />
          </div>
          <div className="modern-summary-val">₹{formatMoney(originalInterest)}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('totalPaid')}</span>
            <CheckCircle2 size={18} className="text-emerald" />
          </div>
          <div className="modern-summary-val emerald">₹{formatMoney(totalPaid)}</div>
        </div>

        <div className="modern-summary-card">
          <div className="modern-summary-top">
            <span className="modern-summary-label">{t('totalPending')}</span>
            <AlertCircle size={18} className="text-amber" />
          </div>
          <div className="modern-summary-val amber">₹{formatMoney(pending)}</div>
        </div>
      </div>

      {/* BALANCE BREAKDOWN CARD */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <TrendingUp size={18} className="text-primary" />
            <span>{t('currentBalanceBreakdown')}</span>
          </div>
        </div>

        <div className="modern-info-grid">
          <div className="modern-info-item">
            <span className="modern-info-label">{t('interestPaid')}</span>
            <span className="modern-info-val text-emerald">₹{formatMoney(interestPaid)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('interestDue')}</span>
            <span className="modern-info-val text-amber">₹{formatMoney(interestDueToday)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('principalPaid')}</span>
            <span className="modern-info-val">₹{formatMoney(principalPaid)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('principalOutstanding')}</span>
            <span className="modern-info-val font-bold">₹{formatMoney(principalOutstanding)}</span>
          </div>
        </div>
      </div>

      {/* LOAN SPECIFICATIONS */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <Calendar size={18} className="text-primary" />
            <span>{t('interestOnlyLoanInformation')}</span>
          </div>
        </div>

        <div className="modern-info-grid">
          <div className="modern-info-item">
            <span className="modern-info-label">{t('monthlyRateOfInterest')}</span>
            <span className="modern-info-val">{Number(finance.interest_rate || 0)}%</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('totalInterestAccrued')}</span>
            <span className="modern-info-val">₹{formatMoney(originalInterest)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('startDate')}</span>
            <span className="modern-info-val">{formatDate(finance.entry_date)}</span>
          </div>

          <div className="modern-info-item">
            <span className="modern-info-label">{t('nextScheduledDueDate')}</span>
            <span className="modern-info-val">{formatDate(finance.next_due_date)}</span>
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
            <span>{t('recordPayment')}</span>
          </div>
        </div>

        {isClosed ? (
          <div className="p-6 rounded-xl bg-surface-hover border border-border text-center">
            <CheckCircle2 size={32} className="text-emerald mx-auto mb-2" />
            <h3 className="text-base font-bold text-primary mb-1">{t('interestOnlyLoanCompleted')}</h3>
            <p className="text-sm text-secondary">{t('principalAndInterestFullyPaid')}</p>
          </div>
        ) : (
          <form className="modern-payment-form" onSubmit={recordPayment} noValidate>
            {/* Method Toggle */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-bg border border-border-light">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="radio"
                  name="interest-only-payment-mode"
                  value="manual"
                  checked={paymentMode === 'manual'}
                  onChange={() => setPaymentMode('manual')}
                  className="accent-blue-600"
                />
                <span>{t('manualEntry')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="radio"
                  name="interest-only-payment-mode"
                  value="evidence"
                  checked={paymentMode === 'evidence'}
                  onChange={() => setPaymentMode('evidence')}
                  className="accent-blue-600"
                />
                <span>{t('gpsAndPhoto')}</span>
              </label>
            </div>

            {/* Date Selection */}
            <div className="modern-field">
              <label>{t('paymentDate')} *</label>
              <CalendarDatePicker
                label={t('paymentDate')}
                value={paymentDate}
                onChange={handlePaymentDateChange}
              />
              <div className="text-xs text-muted mt-1">
                {t('selectedPaymentDate')}: <strong>{paymentDate ? formatDate(paymentDate) : t('noDateSelected')}</strong>
              </div>
            </div>

            {/* Amount */}
            <div className="modern-field">
              <label htmlFor="interestPaymentAmount">{t('paymentAmount')} ₹ *</label>
              <input
                id="interestPaymentAmount"
                type="number"
                min="0.01"
                step="0.01"
                max={selectedInterestDue}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={t('enterPaymentAmount')}
                required
              />
              {selectedInterestDue > 0 && (
                <button
                  type="button"
                  className="modern-quick-amount-chip"
                  onClick={() => setPaymentAmount(String(selectedInterestDue))}
                >
                  <Sparkles size={12} />
                  Fill Interest Due: ₹{formatMoney(selectedInterestDue)}
                </button>
              )}
            </div>

            {/* Calculation Previews */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="modern-live-calc-box">
                <span className="text-xs">{t('interestDueOnPaymentDate')}:</span>
                <strong>₹{formatMoney(selectedInterestDue)}</strong>
              </div>

              <div className="modern-live-calc-box">
                <span className="text-xs">{t('estimatedWeeklyInterest')}:</span>
                <strong>₹{formatMoney(weeklyInterestAmount)}</strong>
              </div>

              <div className="modern-live-calc-box">
                <span className="text-xs">{t('estimatedMonthlyInterest')}:</span>
                <strong>₹{formatMoney(monthlyInterestAmount)}</strong>
              </div>
            </div>

            {paymentMode === 'evidence' ? (
              <EvidenceCapture evidence={evidence} disabled={saving} />
            ) : (
              <p className="text-xs text-muted">
                {t('manualInterestPaymentNote')}
              </p>
            )}

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
            {t('noInterestOnlyPaymentsRecorded')}
          </div>
        ) : (
          <div className="modern-table-card">
            <div className="modern-table-wrap">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('date')}</th>
                    <th>{t('payment')}</th>
                    <th>{t('interest')}</th>
                    <th>{t('principal')}</th>
                    <th>{t('balanceBefore')}</th>
                    <th>{t('balanceAfter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => (
                    <tr key={payment.id}>
                      <td>{payments.length - index}</td>
                      <td>{formatDate(payment.payment_date)}</td>
                      <td className="font-semibold">₹{formatMoney(payment.payment_amount)}</td>
                      <td>₹{formatMoney(payment.interest_payment)}</td>
                      <td>₹{formatMoney(payment.principal_payment)}</td>
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

export default InterestOnlyManage
