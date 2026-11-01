import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useCollectionEvidence, EvidenceCapture, EvidenceHistory } from '../components/CollectionEvidence'

function DailyManage() {
  const navigate = useNavigate()
  const { financeId } = useParams()
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
      alert('Select Payment Date')
      return
    }

    // VALIDATE AMOUNT
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid Payment Amount')
      return
    }

    // PREVENT OVERPAYMENT
    if (amount > currentPending) {
      alert(
        `Payment cannot be more than pending amount ₹${formatMoney(
          currentPending
        )}`
      )

      return
    }

    // CHECK LOGIN
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      alert('Please login again')
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

      alert(
        `Unable to record payment: ${error.message}`
      )

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
        'Payment recorded successfully. Loan is fully paid and closed.'
      )
    } else {
      alert(
        'Payment recorded successfully'
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
      return 'Paid'
    }

    // PARTIAL
    if (paid > 0) {
      return 'Partially Paid'
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
    const dueDate =
      new Date(
        `${item.due_date}T00:00:00`
      )

    // OVERDUE
    if (dueDate < today) {
      return 'Overdue'
    }

    return 'Pending'
  }

  // =========================================
  // STATUS CSS CLASS
  // =========================================

  const getStatusClass = (status) => {
    if (status === 'Paid') {
      return 'schedule-paid'
    }

    if (status === 'Overdue') {
      return 'schedule-overdue'
    }

    if (status === 'Partially Paid') {
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
      'en-IN',
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

    const date =
      new Date(
        `${value}T00:00:00`
      )

    return date.toLocaleDateString(
      'en-IN'
    )
  }

  // =========================================
  // SCHEDULE COUNTS
  // =========================================

  const paidInstallments =
    schedule.filter(
      (item) =>
        getDisplayStatus(item) === 'Paid'
    ).length

  const overdueInstallments =
    schedule.filter(
      (item) =>
        getDisplayStatus(item) === 'Overdue'
    ).length

  const pendingInstallments =
    schedule.filter((item) => {
      const status =
        getDisplayStatus(item)

      return (
        status === 'Pending' ||
        status === 'Partially Paid'
      )
    }).length

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="daily-manage-page">
        <p>
          Loading Daily Finance...
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
          Finance not found
        </h2>

        <button
          onClick={() =>
            navigate('/customers')
          }
        >
          Customers
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
        ← Customer Profile
      </button>

      {/* HEADER */}

      <div className="daily-manage-header">

        <div>

          <p>
            DAILY FINANCE
          </p>

          <h1>
            Manage Daily Loan
          </h1>

          <span>
            Customer:{' '}

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
            ? 'CLOSED'
            : 'ACTIVE'}
        </span>

      </div>

      {/* MAIN SUMMARY */}

      <div className="daily-manage-summary">

        <div>

          <span>
            Principal
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
            Total Amount
          </span>

          <strong>
            ₹{formatMoney(
              finance.amount
            )}
          </strong>

        </div>

        <div>

          <span>
            Total Paid
          </span>

          <strong>
            ₹{formatMoney(
              finance.paid
            )}
          </strong>

        </div>

        <div>

          <span>
            Pending
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
          Loan Information
        </h2>

        <div className="daily-info-grid">

          <div>

            <span>
              Interest Rate
            </span>

            <strong>
              {finance.interest_rate || 0}%
            </strong>

          </div>

          <div>

            <span>
              Interest Amount
            </span>

            <strong>
              ₹{formatMoney(
                finance.interest_accrual
              )}
            </strong>

          </div>

          <div>

            <span>
              Loan Period
            </span>

            <strong>
              {finance.period || '-'}
            </strong>

          </div>

          <div>

            <span>
              Start Date
            </span>

            <strong>
              {formatDate(
                finance.entry_date
              )}
            </strong>

          </div>

          <div>

            <span>
              Ending Date
            </span>

            <strong>
              {formatDate(
                finance.ending_date
              )}
            </strong>

          </div>

          <div>

            <span>
              Installments
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
          Record Payment
        </h2>

        {isClosed ? (

          <div className="loan-completed-message">

            <h3>
              ✓ Loan Completed
            </h3>

            <p>
              This finance has been
              fully paid.
            </p>

          </div>

        ) : (

          <form
            className="daily-payment-form"
            onSubmit={recordPayment}
          >

            <div>

              <label>
                Payment Date *
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
                Payment Amount ₹ *
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                placeholder="Enter amount"
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
                Current Pending
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
                ? 'Recording...'
                : 'Record Payment'}
            </button>

          </form>
        )}

      </div>

      {/* COLLECTION SCHEDULE */}

      <div className="daily-manage-section">

        <div className="schedule-heading">

          <div>

            <h2>
              Daily Collection Schedule
            </h2>

            <p>
              {schedule.length}-day
              repayment schedule
            </p>

          </div>

        </div>

        {/* SCHEDULE SUMMARY */}

        <div className="schedule-summary">

          <div>

            <span>
              Paid
            </span>

            <strong>
              {paidInstallments}
            </strong>

          </div>

          <div>

            <span>
              Overdue
            </span>

            <strong>
              {overdueInstallments}
            </strong>

          </div>

          <div>

            <span>
              Pending
            </span>

            <strong>
              {pendingInstallments}
            </strong>

          </div>

        </div>

        {schedule.length === 0 ? (

          <div className="no-payment-history">
            Repayment schedule has not been generated.
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>

                <tr>
                  <th>Day</th>
                  <th>Due Date</th>
                  <th>Due Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Paid Date</th>
                  <th>Status</th>
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
                        Day{' '}
                        {item.installment_number}
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
                          {status}
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
            {payments.length}{' '}
            payment
            {payments.length === 1
              ? ''
              : 's'}{' '}
            recorded
          </p>

        </div>

        {payments.length === 0 ? (

          <div className="no-payment-history">
            No payments recorded yet.
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>

                <tr>
                  <th>#</th>
                  <th>Payment Date</th>
                  <th>Payment</th>
                  <th>Balance Before</th>
                  <th>Balance After</th>
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