import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

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

  date.setMinutes(
    date.getMinutes() - date.getTimezoneOffset()
  )

  return date.toISOString().slice(0, 10)
}

// ======================================================
// INTEREST ONLY MANAGE
// ======================================================

function InterestOnlyManage() {
  const navigate = useNavigate()
  const { financeId } = useParams()
  const { t, i18n } = useTranslation()

  const evidence = useCollectionEvidence(financeId)

  const [finance, setFinance] = useState(null)
  const [customer, setCustomer] = useState(null)

  const [payments, setPayments] = useState([])
  const [adjustments, setAdjustments] = useState([])

  // IMPORTANT:
  // Calendar controls this value directly.
  const [paymentDate, setPaymentDate] = useState(
    getLocalDate()
  )

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('manual')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ======================================================
  // LOAD
  // ======================================================

  useEffect(() => {
    loadEverything()
  }, [financeId])

  // ======================================================
  // LOAD EVERYTHING
  // ======================================================

  const loadEverything = async () => {
    try {
      setLoading(true)

      // ------------------------------------------
      // FINANCE RECORD
      // ------------------------------------------

      const {
        data: financeData,
        error: financeError
      } = await supabase
        .from('finance_records')
        .select('*')
        .eq('id', financeId)
        .eq('finance_type', 'interest_only')
        .single()

      if (financeError) {
        console.error(
          'Finance load error:',
          financeError
        )

        alert(t('financeLoadFailed', { message: financeError.message }))

        setLoading(false)
        return
      }

      setFinance(financeData)

      // ------------------------------------------
      // CUSTOMER
      // ------------------------------------------

      if (financeData?.customer_id) {
        const {
          data: customerData,
          error: customerError
        } = await supabase
          .from('customers')
          .select('*')
          .eq('id', financeData.customer_id)
          .single()

        if (customerError) {
          console.error(
            'Customer load error:',
            customerError
          )
        } else {
          setCustomer(customerData)
        }
      }

      // ------------------------------------------
      // PAYMENT HISTORY
      // ------------------------------------------

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
        console.error(
          'Payment history error:',
          paymentError
        )
      }

      setPayments(paymentData || [])

      // ------------------------------------------
      // PRINCIPAL ADJUSTMENTS
      // ------------------------------------------

      const {
        data: adjustmentData,
        error: adjustmentError
      } = await supabase
        .from('finance_principal_adjustments')
        .select('*')
        .eq('finance_record_id', financeId)
        .order('adjustment_date', {
          ascending: false
        })
        .order('created_at', {
          ascending: false
        })

      if (adjustmentError) {
        console.error(
          'Adjustment load error:',
          adjustmentError
        )
      }

      setAdjustments(adjustmentData || [])
    } catch (error) {
      console.error(
        'Interest only load error:',
        error
      )

      alert(
        error?.message ||
          t('unableLoadInterestOnlyFinance')
      )
    } finally {
      setLoading(false)
    }
  }

  // ======================================================
  // MONEY FORMAT
  // ======================================================

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }

  // ======================================================
  // DATE FORMAT
  // ======================================================

  const formatDate = (value) => {
    if (!value) {
      return '-'
    }

    const date = new Date(
      `${value}T00:00:00`
    )

    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }
    )
  }

  // ======================================================
  // CALENDAR DATE CHANGE
  // ======================================================

  const handlePaymentDateChange = (date) => {
    if (!date) {
      return
    }

    console.log(
      'Payment date selected:',
      date
    )

    // IMPORTANT:
    // Do NOT run this through getValidPaymentDate().
    // Keep exactly what the calendar selected.
    setPaymentDate(date)
  }

  // ======================================================
  // RECORD PAYMENT
  // ======================================================

  const recordPayment = async (e) => {
    e.preventDefault()

    if (saving) {
      return
    }

    if (!finance) {
      return
    }

    // ------------------------------------------
    // PAYMENT DATE
    // ------------------------------------------

    const submittedPaymentDate = paymentDate

    if (!submittedPaymentDate) {
      alert(t('selectPaymentDate'))
      return
    }

    // ------------------------------------------
    // PAYMENT AMOUNT
    // ------------------------------------------

    const amount = Number(paymentAmount)

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert(
        t('enterValidPaymentAmount')
      )

      return
    }

    // ------------------------------------------
    // INTEREST DUE
    // ------------------------------------------

    const interestDue =
      getInterestOnlyInterestDue(
        finance,
        submittedPaymentDate,
        payments,
        adjustments
      )

    if (amount > interestDue) {
      alert(
        t('interestPaymentCannotExceedDue', {
          amount: formatMoney(interestDue)
        })
      )

      return
    }

    // ------------------------------------------
    // CURRENT USER
    // ------------------------------------------

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      alert(t('pleaseLoginAgain'))

      navigate('/')

      return
    }

    // ------------------------------------------
    // MANUAL CONFIRMATION
    // ------------------------------------------

    if (
      paymentMode === 'manual' &&
      !window.confirm(
        t('confirmManualInterestPayment', {
          amount: formatMoney(amount),
          date: formatDate(submittedPaymentDate)
        })
      )
    ) {
      return
    }

    setSaving(true)

    try {
      let error = null
      let warning = null

      const paymentParams = {
        p_finance_record_id:
          Number(finance.id),

        p_payment_amount:
          amount,

        p_payment_date:
          submittedPaymentDate
      }

      // ------------------------------------------
      // MANUAL PAYMENT
      // ------------------------------------------

      if (paymentMode === 'manual') {
        const result =
          await supabase.rpc(
            'record_interest_only_payment',
            paymentParams
          )

        error = result.error
      }

      // ------------------------------------------
      // GPS + PHOTO PAYMENT
      // ------------------------------------------

      else {
        const result =
          await evidence.recordPayment(
            'record_interest_only_payment',
            paymentParams
          )

        error = result.error
        warning = result.warning
      }

      if (warning) {
        alert(warning)
      }

      if (error) {
        console.error(
          'Payment error:',
          error
        )

        if (
          paymentMode === 'evidence' &&
          /Capture GPS|proof photo is required|Wait for GPS capture/i.test(
            error.message
          )
        ) {
          return
        }

        alert(
          t('unableToRecordPayment', { message: error.message })
        )

        return
      }

      // ------------------------------------------
      // SUCCESS
      // ------------------------------------------

      setPaymentAmount('')

      // Reset only AFTER successful save.
      setPaymentDate(getLocalDate())

      await loadEverything()

      alert(
        t('interestOnlyPaymentSuccess')
      )
    } catch (error) {
      console.error(
        'Record payment error:',
        error
      )

      alert(
        t('unableToRecordPayment', {
          message: error?.message || t('unknownError')
        })
      )
    } finally {
      setSaving(false)
    }
  }

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div className="daily-manage-page">
        <p>
          {t('loadingInterestOnlyFinance')}
        </p>
      </div>
    )
  }

  // ======================================================
  // NOT FOUND
  // ======================================================

  if (!finance) {
    return (
      <div className="daily-manage-page">

        <h2>
          {t('interestOnlyFinanceNotFound')}
        </h2>

        <button
          type="button"
          onClick={() =>
            navigate('/customers')
          }
        >
          {t('customers')}
        </button>

      </div>
    )
  }

  // ======================================================
  // VALUES
  // ======================================================

  const principal =
    Number(
      finance.original_principal ||
      finance.principal_amount ||
      0
    )

  const originalInterest =
    Number(
      finance.interest_accrual ||
      0
    )

  const totalPaid =
    Number(
      finance.paid ||
      0
    )

  const todayString =
    getLocalDate()

  const pending =
    getInterestOnlyBalance(
      finance,
      todayString,
      payments,
      adjustments
    )

  const interestPaid =
    Number(
      finance.interest_paid ||
      0
    )

  const interestDueToday =
    getInterestOnlyInterestDue(
      finance,
      todayString,
      payments,
      adjustments
    )

  const principalPaid =
    Number(
      finance.principal_paid ||
      0
    )

  const principalOutstanding =
    Number(
      finance.principal_outstanding ||
      0
    )

  const monthlyInterestAmount =
    Math.round(
      principalOutstanding *
        Number(
          finance.interest_rate ||
          0
        ) /
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

  const selectedInterestDue =
    getInterestOnlyInterestDue(
      finance,
      paymentDate,
      payments,
      adjustments
    )

  const selectedBalance =
    getInterestOnlyBalance(
      finance,
      paymentDate,
      payments,
      adjustments
    )

  const isClosed =
    finance.loan_status === 'closed' ||
    pending <= 0

  // ======================================================
  // UI
  // ======================================================

  return (
    <div className="daily-manage-page">

      {/* ================================================= */}
      {/* BACK */}
      {/* ================================================= */}

      <button
        type="button"
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

      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="daily-manage-header">

        <div>

          <p>
            {t('interestOnlyFinance')}
          </p>

          <h1>
            {t('manageInterestOnlyLoan')}
          </h1>

          <span>
            {t('customer')}:{' '}

            <strong>
              {customer?.full_name ||
                finance.name ||
                '-'}
            </strong>

            {customer?.customer_id
              ? ` • ${customer.customer_id}`
              : ''}
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

      {/* ================================================= */}
      {/* MAIN SUMMARY */}
      {/* ================================================= */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('principal')}
          </span>

          <strong>
            ₹{formatMoney(principal)}
          </strong>
        </div>

        <div>
          <span>
            {t('interest')}
          </span>

          <strong>
            ₹{formatMoney(
              originalInterest
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('totalPaid')}
          </span>

          <strong>
            ₹{formatMoney(totalPaid)}
          </strong>
        </div>

        <div>
          <span>
            {t('totalPending')}
          </span>

          <strong>
            ₹{formatMoney(pending)}
          </strong>
        </div>

      </div>

      {/* ================================================= */}
      {/* LOAN INFORMATION */}
      {/* ================================================= */}

      <div className="daily-manage-section">

        <h2>
          {t('interestOnlyLoanInformation')}
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>
              {t('principalAmount')}
            </span>

            <strong>
              ₹{formatMoney(principal)}
            </strong>
          </div>

          <div>
            <span>
              {t('monthlyRateOfInterest')}
            </span>

            <strong>
              {Number(
                finance.interest_rate ||
                0
              )}%
            </strong>
          </div>

          <div>
            <span>
              {t('totalInterestAccrued')}
            </span>

            <strong>
              ₹{formatMoney(
                originalInterest
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('originalPrincipal')}
            </span>

            <strong>
              ₹{formatMoney(principal)}
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
              {t('nextScheduledDueDate')}
            </span>

            <strong>
              {formatDate(
                finance.next_due_date
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('status')}
            </span>

            <strong>
              {isClosed
                ? t('closed')
                : t('active')}
            </strong>
          </div>

        </div>

      </div>

      {/* ================================================= */}
      {/* BALANCE BREAKDOWN */}
      {/* ================================================= */}

      <div className="daily-manage-section">

        <h2>
          {t('currentBalanceBreakdown')}
        </h2>

        <div className="daily-manage-summary">

          <div>
            <span>
              {t('interestPaid')}
            </span>

            <strong>
              ₹{formatMoney(
                interestPaid
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('interestDue')}
            </span>

            <strong>
              ₹{formatMoney(
                interestDueToday
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('principalPaid')}
            </span>

            <strong>
              ₹{formatMoney(
                principalPaid
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('principalOutstanding')}
            </span>

            <strong>
              ₹{formatMoney(
                principalOutstanding
              )}
            </strong>
          </div>

        </div>

      </div>

      {/* ================================================= */}
      {/* RECORD PAYMENT */}
      {/* ================================================= */}

      <div className="daily-manage-section">

        <h2>
          {t('recordPayment')}
        </h2>

        {isClosed ? (

          <div className="loan-completed-message">

            <h3>
              ✓ {t('interestOnlyLoanCompleted')}
            </h3>

            <p>
              {t('principalAndInterestFullyPaid')}
            </p>

          </div>

        ) : (

          <form
            className="daily-payment-form"
            onSubmit={recordPayment}
            noValidate
          >

            {/* PAYMENT METHOD */}

            <fieldset className="payment-entry-mode">

              <legend>
                {t('paymentEntryMethod')}
              </legend>

              <label>

                <input
                  type="radio"
                  name="interest-only-payment-mode"
                  value="manual"
                  checked={
                    paymentMode ===
                    'manual'
                  }
                  onChange={() =>
                    setPaymentMode(
                      'manual'
                    )
                  }
                />

                {t('manualEntry')}

              </label>

              <label>

                <input
                  type="radio"
                  name="interest-only-payment-mode"
                  value="evidence"
                  checked={
                    paymentMode ===
                    'evidence'
                  }
                  onChange={() =>
                    setPaymentMode(
                      'evidence'
                    )
                  }
                />

                {t('gpsAndPhoto')}

              </label>

            </fieldset>

            {/* ============================================= */}
            {/* PAYMENT DATE - FIXED */}
            {/* ============================================= */}

            <div>

              <label>
                {t('paymentDate')} *
              </label>

              <CalendarDatePicker
                label={t('paymentDate')}
                value={paymentDate}
                onChange={
                  handlePaymentDateChange
                }
              />

              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  background: '#f5f7fb',
                  borderRadius: '8px'
                }}
              >
                <span>
                  {t('selectedPaymentDate')}
                </span>

                <br />

                <strong>
                  {paymentDate
                    ? formatDate(
                        paymentDate
                      )
                    : t('noDateSelected')}
                </strong>
              </div>

            </div>

            {/* ============================================= */}
            {/* PAYMENT AMOUNT */}
            {/* ============================================= */}

            <div>

              <label>
                {t('paymentAmount')} ₹ *
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                max={
                  selectedInterestDue
                }
                value={paymentAmount}
                onChange={(e) =>
                  setPaymentAmount(
                    e.target.value
                  )
                }
                placeholder={t('enterPaymentAmount')}
                required
              />

            </div>

            {/* ============================================= */}
            {/* INTEREST DUE */}
            {/* ============================================= */}

            <div className="payment-preview">

              <span>
                {t('interestDueOnPaymentDate')}
              </span>

              <strong>
                ₹{formatMoney(
                  selectedInterestDue
                )}
              </strong>

            </div>

            {/* ============================================= */}
            {/* WEEKLY INTEREST */}
            {/* ============================================= */}

            <div className="payment-preview">

              <span>
                {t('estimatedWeeklyInterest')}
              </span>

              <strong>
                ₹{formatMoney(
                  weeklyInterestAmount
                )}
              </strong>

            </div>

            {/* ============================================= */}
            {/* MONTHLY INTEREST */}
            {/* ============================================= */}

            <div className="payment-preview">

              <span>
                {t('estimatedMonthlyInterest')}
              </span>

              <strong>
                ₹{formatMoney(
                  monthlyInterestAmount
                )}
              </strong>

            </div>

            {/* ============================================= */}
            {/* BALANCE */}
            {/* ============================================= */}

            <div className="payment-preview">

              <span>
                {t('balanceDueOnPaymentDate')}
              </span>

              <strong>
                ₹{formatMoney(
                  selectedBalance
                )}
              </strong>

            </div>

            {/* ============================================= */}
            {/* EVIDENCE */}
            {/* ============================================= */}

            {paymentMode ===
            'manual' ? (

              <p className="payment-entry-note">
                {t('manualInterestPaymentNote')}
              </p>

            ) : (

              <EvidenceCapture
                evidence={evidence}
                disabled={saving}
              />

            )}

            {/* ============================================= */}
            {/* SAVE */}
            {/* ============================================= */}

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

      {/* ================================================= */}
      {/* EVIDENCE HISTORY */}
      {/* ================================================= */}

      <EvidenceHistory
        financeId={finance?.id}
        payments={payments}
      />

      {/* ================================================= */}
      {/* PAYMENT HISTORY */}
      {/* ================================================= */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <div>

            <h2>
              {t('paymentHistory')}
            </h2>

            <p>
              {t('paymentsRecorded', { count: payments.length })}
            </p>

          </div>

        </div>

        {payments.length === 0 ? (

          <div className="no-payment-history">
            {t('noInterestOnlyPaymentsRecorded')}
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>

                <tr>
                  <th>#</th>
                  <th>{t('date')}</th>
                  <th>{t('payment')}</th>
                  <th>{t('interest')}</th>
                  <th>{t('principal')}</th>
                  <th>
                    {t('balanceBefore')}
                  </th>
                  <th>
                    {t('balanceAfter')}
                  </th>
                </tr>

              </thead>

              <tbody>

                {payments.map(
                  (payment, index) => (

                    <tr
                      key={
                        payment.id
                      }
                    >

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
                          payment.interest_payment
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          payment.principal_payment
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

export default InterestOnlyManage