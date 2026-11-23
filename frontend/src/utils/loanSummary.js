// Loan Summary helpers for values that are derived rather than stored as
// dedicated columns. Finance records store the repayment length in `period`
// (for example "30 Days", "12 Weeks", "6 Months") and the total in `amount`.
// Older records may also carry explicit number_of_* / *_amount columns, so
// those keep priority when present.

const DURATION_KEYS = [
  'number_of_days',
  'number_of_weeks',
  'number_of_months',
  'duration',
  'days',
  'weeks',
  'months'
]

const INSTALLMENT_KEYS = [
  'daily_amount',
  'weekly_amount',
  'monthly_amount',
  'installment_amount'
]

function firstPositiveNumber(values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue

    const match = String(value).match(/\d+(?:\.\d+)?/)
    const number = match ? Number(match[0]) : Number(value)

    if (Number.isFinite(number) && number > 0) return number
  }

  return 0
}

export function getPeriodCount(finance) {
  const direct = firstPositiveNumber(
    DURATION_KEYS.map((key) => finance?.[key])
  )

  if (direct > 0) return direct

  return firstPositiveNumber([finance?.period])
}

export function getInstallmentAmount(finance) {
  const explicit = firstPositiveNumber(
    INSTALLMENT_KEYS.map((key) => finance?.[key])
  )

  if (explicit > 0) return explicit

  const count = getPeriodCount(finance)
  const total = firstPositiveNumber([
    finance?.total_amount,
    finance?.amount
  ])

  if (!count || !total) return 0

  return Math.round((total / count) * 100) / 100
}

export function getCollectedAmount(finance, payments = []) {
  const stored = Number(finance?.paid || 0)
  const fromPayments = (Array.isArray(payments) ? payments : []).reduce(
    (sum, payment) =>
      sum +
      (Number(payment?.payment_amount ?? payment?.amount ?? 0) || 0),
    0
  )

  return Math.max(
    Number.isFinite(stored) ? stored : 0,
    fromPayments
  )
}
