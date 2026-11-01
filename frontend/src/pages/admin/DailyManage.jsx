import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { useCollectionEvidence, EvidenceCapture, EvidenceHistory } from '../../components/CollectionEvidence'

function DailyManage() {
  const navigate = useNavigate()
  const { financeId } = useParams()
  const { t, i18n } = useTranslation()
  const evidence = useCollectionEvidence(financeId)

  const [finance, setFinance] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [payments, setPayments] = useState([])
  const [schedule, setSchedule] = useState([])

  const [paymentDate, setPaymentDate] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEverything()
  }, [financeId])

  // =========================================
  // LOAD EVERYTHING
  // =========================================

  const loadEverything = async () => {
    setLoading(true)

    // FINANCE
    const {
      data: financeData,
      error: financeError
    } = await supabase
      .from('finance_records')
      .select('*')
      .eq('id', financeId)
      .single()

    if (financeError) {
      console.error(financeError)
      alert(financeError.message)
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
      .order('payment_date', {
        ascending: false
      })
      .order('created_at', {
        ascending: false
      })

    if (paymentError) {
      console.error(paymentError)
    }

    setPayments(paymentData || [])

    // REPAYMENT SCHEDULE
    const {
      data: scheduleData,
      error: scheduleError
    } = await supabase
      .from('repayment_schedule')
      .select('*')
      .eq('finance_record_id', financeId)
      .order('installment_number', {
        ascending: true
      })

    if (scheduleError) {
      console.error(scheduleError)
    }

    setSchedule(scheduleData || [])

    setLoading(false)
  }

  // =========================================
  // RECORD PAYMENT
  // SAFE DATABASE TRANSACTION
  // =========================================

  const recordPayment = async (e) => {
    e.preventDefault()
    if (saving) return

    if (!finance) {
      return
    }

    const amount = Number(paymentAmount)
    const currentPending = Number(finance.pending || 0)

    // VALIDATE DATE
    if (!paymentDate) {
      alert(t('selectPaymentDate'))
      return
    }

    // VALIDATE AMOUNT
    if (!Number.isFinite(amount) || amount <= 0) {
      alert(t('enterValidPaymentAmount'))
      return
    }

    // PREVENT OVERPAYMENT
    if (amount > currentPending) {
      alert(
        t('paymentCannotExceedPending', {
          amount: formatMoney(currentPending)
        })
      )

      return
    }

    // CHECK LOGIN
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      alert(t('pleaseLoginAgain'))
      navigate('/')
      return
    }

    setSaving(true)

    // =========================================
    // ONE SAFE DATABASE FUNCTION
    // =========================================

    const { error, warning } = await evidence.recordPayment(
      'record_daily_payment',
      {
        p_finance_record_id:
          Number(finance.id),

        p_payment_amount:
          amount,

        p_payment_date:
          paymentDate
      }
    )

    if (warning) alert(warning)

    if (error) {
      console.error(error)

      setSaving(false)

      alert(t('unableToRecordPayment', {
        message: error.message
      }))

      return
    }

    // CLEAR FORM
    setPaymentAmount('')
    setPaymentDate('')

    // RELOAD UPDATED DATA
    await loadEverything()

    setSaving(false)

    const remaining =
      currentPending - amount

    if (remaining <= 0) {
      alert(
        t('dailyPaymentClosedSuccess')
      )
    } else {
      alert(
        t('dailyPaymentSuccess')
      )
    }
  }

  // =========================================
  // DISPLAY SCHEDULE STATUS
  // =========================================

  const getDisplayStatus = (item) => {
    const due =
      Number(item.due_amount || 0)

    const paid =
      Number(item.paid_amount || 0)

    // PAID
    if (paid >= due) {
      return 'paid'
    }

    // PARTIAL
    if (paid > 0) {
      return 'partiallyPaid'
    }

    // TODAY
    const today = new Date()

    today.setHours(
      0,
      0,
      0,
      0
    )

    // DUE DATE
    const rawDueDate = String(item.due_date || '')
    const dueDate = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate)
        ? `${rawDueDate}T00:00:00`
        : rawDueDate
    )

    // OVERDUE
    if (!Number.isNaN(dueDate.getTime()) && dueDate < today) {
      return 'overdue'
    }

    return 'pending'
  }

  // =========================================
  // STATUS CSS CLASS
  // =========================================

  const getStatusClass = (status) => {
    if (status === 'paid') {
      return 'schedule-paid'
    }

    if (status === 'overdue') {
      return 'schedule-overdue'
    }

    if (status === 'partiallyPaid') {
      return 'schedule-partial'
    }

    return 'schedule-pending'
  }

  // =========================================
  // MONEY FORMAT
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
  // DATE FORMAT
  // =========================================

  const formatDate = (value) => {
    if (!value) {
      return '-'
    }

    const raw = String(value)
    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00`
        : raw
    )

    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }

  // =========================================
  // SCHEDULE COUNTS
  // =========================================

  const paidInstallments =
    schedule.filter(
      (item) =>
        getDisplayStatus(item) === 'paid'
    ).length

  const overdueInstallments =
    schedule.filter(
      (item) =>
        getDisplayStatus(item) === 'overdue'
    ).length

  const pendingInstallments =
    schedule.filter((item) => {
      const status =
        getDisplayStatus(item)

      return (
        status === 'pending' ||
        status === 'partiallyPaid'
      )
    }).length

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="daily-manage-page">
        <p>
          {t('loadingDailyFinance')}
        </p>
      </div>
    )
  }

  // =========================================
  // FINANCE NOT FOUND
  // =========================================

  if (!finance) {
    return (
      <div className="daily-manage-page">

        <h2>
          {t('financeNotFound')}
        </h2>

        <button
          onClick={() =>
            navigate('/customers')
          }
        >
          {t('customers')}
        </button>

      </div>
    )
  }

  const pending =
    Number(finance.pending || 0)

  const isClosed =
    finance.loan_status === 'closed' ||
    pending <= 0

  // =========================================
  // UI
  // =========================================

  return (
    <div className="daily-manage-page">

      {/* BACK */}

      <button
        className="back-button"
        onClick={() => {
          if (finance.customer_id) {
            navigate(
              `/customers/${finance.customer_id}`
            )
          } else {
            navigate('/customers')
          }
        }}
      >
        ← {t('customerProfile')}
      </button>

      {/* HEADER */}

      <div className="daily-manage-header">

        <div>

          <p>
            {t('dailyFinance')}
          </p>

          <h1>
            {t('manageDailyLoan')}
          </h1>

          <span>
            {t('customer')}:{' '}

            <strong>
              {customer?.full_name ||
                finance.name}
            </strong>

            {customer?.customer_id &&
              ` • ${customer.customer_id}`}
          </span>

        </div>

        <span
          className={
            isClosed
              ? 'loan-big-status closed'
              : 'loan-big-status active'
          }
        >
          {isClosed
            ? t('closedUpper')
            : t('activeUpper')}
        </span>

      </div>

      {/* MAIN SUMMARY */}

      <div className="daily-manage-summary">

        <div>

          <span>
            {t('principal')}
          </span>

          <strong>
            ₹{formatMoney(
              finance.original_principal ||
                finance.principal_amount
            )}
          </strong>

        </div>

        <div>

          <span>
            {t('totalAmount')}
          </span>

          <strong>
            ₹{formatMoney(
              finance.amount
            )}
          </strong>

        </div>

        <div>

          <span>
            {t('totalPaid')}
          </span>

          <strong>
            ₹{formatMoney(
              finance.paid
            )}
          </strong>

        </div>

        <div>

          <span>
            {t('pending')}
          </span>

          <strong>
            ₹{formatMoney(
              finance.pending
            )}
          </strong>

        </div>

      </div>

      {/* LOAN INFORMATION */}

      <div className="daily-manage-section">

        <h2>
          {t('loanInformation')}
        </h2>

        <div className="daily-info-grid">

          <div>

            <span>
              {t('rateOfInterest')}
            </span>

            <strong>
              {finance.interest_rate || 0}%
            </strong>

          </div>

          <div>

            <span>
              {t('interestAmount')}
            </span>

            <strong>
              ₹{formatMoney(
                finance.interest_accrual
              )}
            </strong>

          </div>

          <div>

            <span>
              {t('loanPeriod')}
            </span>

            <strong>
              {finance.period || '-'}
            </strong>

          </div>

          <div>

            <span>
              {t('startDate')}
            </span>

            <strong>
              {formatDate(
                finance.entry_date
              )}
            </strong>

          </div>

          <div>

            <span>
              {t('endingDate')}
            </span>

            <strong>
              {formatDate(
                finance.ending_date
              )}
            </strong>

          </div>

          <div>

            <span>
              {t('installments')}
            </span>

            <strong>
              {schedule.length}
            </strong>

          </div>

        </div>

      </div>

      {/* RECORD PAYMENT */}

      <div className="daily-manage-section">

        <h2>
          {t('recordPayment')}
        </h2>

        {isClosed ? (

          <div className="loan-completed-message">

            <h3>
              ✓ {t('loanCompleted')}
            </h3>

            <p>
              {t('financeFullyPaid')}
            </p>

          </div>

        ) : (

          <form
            className="daily-payment-form"
            onSubmit={recordPayment}
          >

            <div>

              <label>
                {t('paymentDate')} *
              </label>

              <input
                type="date"
                value={paymentDate}
                onChange={(e) =>
                  setPaymentDate(
                    e.target.value
                  )
                }
                required
              />

            </div>

            <div>

              <label>
                {t('paymentAmount')} ₹ *
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                placeholder={t('enterAmount')}
                onChange={(e) =>
                  setPaymentAmount(
                    e.target.value
                  )
                }
                required
              />

            </div>

            <div className="payment-preview">

              <span>
                {t('currentPending')}
              </span>

              <strong>
                ₹{formatMoney(
                  finance.pending
                )}
              </strong>

            </div>
            <EvidenceCapture evidence={evidence} disabled={saving} />


            <button
              type="submit"
              className="record-payment-button"
              disabled={saving}
            >
              {saving
                ? t('recording')
                : t('recordPayment')}
            </button>

          </form>
        )}

      </div>

      {/* COLLECTION SCHEDULE */}

      <div className="daily-manage-section">

        <div className="schedule-heading">

          <div>

            <h2>
              {t('dailyCollectionSchedule')}
            </h2>

            <p>
              {t('dayRepaymentSchedule', { count: schedule.length })}
            </p>

          </div>

        </div>

        {/* SCHEDULE SUMMARY */}

        <div className="schedule-summary">

          <div>

            <span>
              {t('paid')}
            </span>

            <strong>
              {paidInstallments}
            </strong>

          </div>

          <div>

            <span>
              {t('overdue')}
            </span>

            <strong>
              {overdueInstallments}
            </strong>

          </div>

          <div>

            <span>
              {t('pending')}
            </span>

            <strong>
              {pendingInstallments}
            </strong>

          </div>

        </div>

        {schedule.length === 0 ? (

          <div className="no-payment-history">
            {t('repaymentScheduleNotGenerated')}
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>

                <tr>
                  <th>{t('day')}</th>
                  <th>{t('dueDate')}</th>
                  <th>{t('dueAmount')}</th>
                  <th>{t('paid')}</th>
                  <th>{t('balance')}</th>
                  <th>{t('paidDate')}</th>
                  <th>{t('status')}</th>
                </tr>

              </thead>

              <tbody>

                {schedule.map((item) => {

                  const status =
                    getDisplayStatus(item)

                  const balance =
                    Math.max(
                      0,
                      Number(
                        item.due_amount || 0
                      ) -
                      Number(
                        item.paid_amount || 0
                      )
                    )

                  return (

                    <tr key={item.id}>

                      <td>
                        {t('dayNumber', { number: item.installment_number })}
                      </td>

                      <td>
                        {formatDate(
                          item.due_date
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          item.due_amount
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          item.paid_amount
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          balance
                        )}
                      </td>

                      <td>
                        {formatDate(
                          item.paid_date
                        )}
                      </td>

                      <td>

                        <span
                          className={`schedule-status ${getStatusClass(
                            status
                          )}`}
                        >
                          {t(status)}
                        </span>

                      </td>

                    </tr>

                  )
                })}

              </tbody>

            </table>

          </div>
        )}

      </div>

      <EvidenceHistory financeId={finance?.id} payments={payments} />

      {/* PAYMENT HISTORY */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <h2>
            Payment History
          </h2>

          <p>
            {t('paymentsRecorded', { count: payments.length })}
          </p>

        </div>

        {payments.length === 0 ? (

          <div className="no-payment-history">
            {t('noPaymentsRecorded')}
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

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

                {payments.map(
                  (payment, index) => (

                    <tr key={payment.id}>

                      <td>
                        {payments.length -
                          index}
                      </td>

                      <td>
                        {formatDate(
                          payment.payment_date
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          payment.payment_amount
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          payment.balance_before
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          payment.balance_after
                        )}
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>
        )}

      </div>

    </div>
  )
}

export default DailyManage