import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CalendarDatePicker from './CalendarDatePicker'

function PaymentForm({
  customer,
  onSave,
  onCancel
}) {
  const { t } = useTranslation()
  // =========================================
  // PAYMENT AMOUNT
  // =========================================

  const [payment, setPayment] = useState('')

  // =========================================
  // PAYMENT DATE
  // =========================================

  const getToday = () => {
    const today = new Date()

    const year = today.getFullYear()

    const month = String(
      today.getMonth() + 1
    ).padStart(2, '0')

    const day = String(
      today.getDate()
    ).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  const [paymentDate, setPaymentDate] =
    useState(getToday())

  // =========================================
  // SUBMIT PAYMENT
  // =========================================

  const handleSubmit = (e) => {
    e.preventDefault()

    const paymentAmount =
      Number(payment)

    // =====================================
    // VALIDATE AMOUNT
    // =====================================

    if (
      !paymentAmount ||
      paymentAmount <= 0
    ) {
      alert(
        t('invalidPaymentAmount')
      )

      return
    }

    // =====================================
    // VALIDATE PENDING
    // =====================================

    const pendingAmount =
      Number(customer?.pending || 0)

    if (
      paymentAmount >
      pendingAmount
    ) {
      alert(
        t('paymentExceedsPending')
      )

      return
    }

    // =====================================
    // VALIDATE DATE
    // =====================================

    if (!paymentDate) {
      alert(
        t('selectPaymentDate')
      )

      return
    }

    // =====================================
    // SEND PAYMENT
    // =====================================

    onSave(
      customer,
      paymentAmount,
      paymentDate
    )

    // =====================================
    // RESET
    // =====================================

    setPayment('')

    setPaymentDate(
      getToday()
    )
  }

  // =========================================
  // UI
  // =========================================

  return (
    <form
      className="payment-box"
      onSubmit={handleSubmit}
    >

      {/* TITLE */}

      <h4>
        {t('addPayment')} -{' '}
        {customer?.name ||
          customer?.full_name ||
          t('customer')}
      </h4>

      {/* PENDING */}

      <p>
        {t('pendingAmount')}:

        <strong>
          {' '}
          ₹{Number(
            customer?.pending || 0
          ).toLocaleString('en-IN')}
        </strong>
      </p>

      {/* =====================================
          PAYMENT DATE
          ===================================== */}

      <div
        style={{
          marginBottom: '18px'
        }}
      >

        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '600'
          }}
        >
          {t('paymentDate')} *
        </label>

        <CalendarDatePicker
          value={paymentDate}
          onChange={setPaymentDate}
          label={t('paymentDate')}
        />

      </div>

      {/* =====================================
          PAYMENT AMOUNT
          ===================================== */}

      <div
        style={{
          marginBottom: '18px'
        }}
      >

        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '600'
          }}
        >
          {t('paymentAmount')} ₹ *
        </label>

        <input
          type="number"
          placeholder={t('enterPaymentAmount')}
          value={payment}
          onChange={(e) =>
            setPayment(
              e.target.value
            )
          }
          min="1"
          max={
            Number(
              customer?.pending || 0
            )
          }
          step="0.01"
          required
        />

      </div>

      {/* SELECTED DATE */}

      <div
        style={{
          marginBottom: '18px',
          padding: '12px',
          background: '#f5f7fb',
          borderRadius: '8px'
        }}
      >
        <small>
          {t('selectedPaymentDate')}
        </small>

        <br />

        <strong>
          {paymentDate}
        </strong>
      </div>

      {/* BUTTONS */}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap'
        }}
      >

        <button
          type="submit"
        >
          {t('savePayment')}
        </button>

        <button
          type="button"
          onClick={onCancel}
        >
          {t('cancel')}
        </button>

      </div>

    </form>
  )
}

export default PaymentForm