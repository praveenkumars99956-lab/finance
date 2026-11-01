import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useCollectionEvidence, EvidenceCapture, EvidenceHistory } from '../components/CollectionEvidence'

function InterestOnlyManage() {
  const navigate = useNavigate()
  const { financeId } = useParams()
  const evidence = useCollectionEvidence(financeId)

  const [finance, setFinance] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [payments, setPayments] = useState([])

  const [paymentDate, setPaymentDate] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEverything()
  }, [financeId])

  // =========================================
  // LOAD DATA
  // =========================================

  const loadEverything = async () => {
    setLoading(true)

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

    setLoading(false)
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
    if (!value) return '-'

    const date = new Date(
      `${value}T00:00:00`
    )

    return date.toLocaleDateString(
      'en-IN'
    )
  }

  // =========================================
  // RECORD PAYMENT
  // =========================================

  const recordPayment = async (e) => {
    e.preventDefault()
    if (saving) return

    if (!finance) return

    const amount =
      Number(paymentAmount)

    const pending =
      Number(finance.pending || 0)

    if (!paymentDate) {
      alert('Select Payment Date')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      alert(
        'Enter a valid Payment Amount'
      )
      return
    }

    if (amount > pending) {
      alert(
        `Payment cannot be more than pending amount ₹${formatMoney(
          pending
        )}`
      )
      return
    }

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      alert('Please login again')
      navigate('/')
      return
    }

    setSaving(true)

    const { error, warning } = await evidence.recordPayment(
      'record_interest_only_payment',
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

    setPaymentDate('')
    setPaymentAmount('')

    await loadEverything()

    setSaving(false)

    if (pending - amount <= 0) {
      alert(
        'Payment recorded successfully. Interest-Only Loan is fully paid and closed.'
      )
    } else {
      alert(
        'Interest-Only payment recorded successfully'
      )
    }
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="daily-manage-page">
        <p>
          Loading Interest-Only Finance...
        </p>
      </div>
    )
  }

  if (!finance) {
    return (
      <div className="daily-manage-page">

        <h2>
          Interest-Only Finance not found
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

  // =========================================
  // VALUES
  // =========================================

  const principal =
    Number(
      finance.original_principal ||
      finance.principal_amount ||
      0
    )

  const originalInterest =
    Number(
      finance.interest_accrual || 0
    )

  const totalAmount =
    Number(finance.amount || 0)

  const totalPaid =
    Number(finance.paid || 0)

  const pending =
    Number(finance.pending || 0)

  const interestPaid =
    Number(
      finance.interest_paid || 0
    )

  const interestDue =
    Number(
      finance.interest_due || 0
    )

  const principalPaid =
    Number(
      finance.principal_paid || 0
    )

  const principalOutstanding =
    Number(
      finance.principal_outstanding || 0
    )

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
            INTEREST-ONLY FINANCE
          </p>

          <h1>
            Manage Interest-Only Loan
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
            ₹{formatMoney(principal)}
          </strong>

        </div>

        <div>

          <span>
            Interest
          </span>

          <strong>
            ₹{formatMoney(
              originalInterest
            )}
          </strong>

        </div>

        <div>

          <span>
            Total Paid
          </span>

          <strong>
            ₹{formatMoney(totalPaid)}
          </strong>

        </div>

        <div>

          <span>
            Total Pending
          </span>

          <strong>
            ₹{formatMoney(pending)}
          </strong>

        </div>

      </div>

      {/* LOAN INFORMATION */}

      <div className="daily-manage-section">

        <h2>
          Interest-Only Loan Information
        </h2>

        <div className="daily-info-grid">

          <div>

            <span>
              Principal Amount
            </span>

            <strong>
              ₹{formatMoney(principal)}
            </strong>

          </div>

          <div>

            <span>
              Interest Rate
            </span>

            <strong>
              {Number(
                finance.interest_rate || 0
              )}%
            </strong>

          </div>

          <div>

            <span>
              Original Interest
            </span>

            <strong>
              ₹{formatMoney(
                originalInterest
              )}
            </strong>

          </div>

          <div>

            <span>
              Total Amount
            </span>

            <strong>
              ₹{formatMoney(
                totalAmount
              )}
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
              Status
            </span>

            <strong>
              {isClosed
                ? 'Closed'
                : 'Active'}
            </strong>

          </div>

        </div>

      </div>

      {/* BALANCE BREAKDOWN */}

      <div className="daily-manage-section">

        <h2>
          Current Balance Breakdown
        </h2>

        <div className="daily-manage-summary">

          <div>

            <span>
              Interest Paid
            </span>

            <strong>
              ₹{formatMoney(
                interestPaid
              )}
            </strong>

          </div>

          <div>

            <span>
              Interest Due
            </span>

            <strong>
              ₹{formatMoney(
                interestDue
              )}
            </strong>

          </div>

          <div>

            <span>
              Principal Paid
            </span>

            <strong>
              ₹{formatMoney(
                principalPaid
              )}
            </strong>

          </div>

          <div>

            <span>
              Principal Outstanding
            </span>

            <strong>
              ₹{formatMoney(
                principalOutstanding
              )}
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
              ✓ Interest-Only Loan Completed
            </h3>

            <p>
              Principal and interest have
              been fully paid.
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
                onChange={(e) =>
                  setPaymentAmount(
                    e.target.value
                  )
                }
                placeholder="Enter payment amount"
                required
              />

            </div>

            <div className="payment-preview">

              <span>
                Total Pending
              </span>

              <strong>
                ₹{formatMoney(pending)}
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

      <EvidenceHistory financeId={finance?.id} payments={payments} />

      {/* PAYMENT HISTORY */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <div>

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

        </div>

        {payments.length === 0 ? (

          <div className="no-payment-history">
            No Interest-Only payments
            recorded yet.
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>

                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Interest</th>
                  <th>Principal</th>
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