function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function getInterestOnlyStateAtDate(finance, paymentDate, payments, adjustments) {
  const originalPrincipal = Number(
    finance?.original_principal ??
    finance?.principal_amount ??
    finance?.amount ??
    0
  )
  const startDate = String(finance?.entry_date || finance?.payment_date || '').slice(0, 10)
  const targetDate = String(paymentDate || '').slice(0, 10)

  if (!startDate || !targetDate || targetDate < startDate) {
    return { principal: originalPrincipal, interestDue: 0 }
  }

  const events = [
    ...(payments || []).map((payment) => ({
      type: 'payment',
      date: String(payment.payment_date || '').slice(0, 10),
      createdAt: payment.created_at || '',
      payment
    })),
    ...(adjustments || []).map((adjustment) => ({
      type: 'adjustment',
      date: String(adjustment.adjustment_date || '').slice(0, 10),
      createdAt: adjustment.created_at || '',
      adjustment
    }))
  ].filter((event) => event.date >= startDate && event.date <= targetDate)
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.type.localeCompare(right.type)
    )

  let principal = originalPrincipal
  let interestDue = 0
  let lastDate = startDate
  const rate = Number(finance?.interest_rate || 0)

  for (const event of events) {
    const elapsedDays = Math.max(
      0,
      Math.round((Date.parse(`${event.date}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86400000)
    )
    interestDue += roundMoney(principal * rate * elapsedDays / 3000)
    lastDate = event.date

    if (event.type === 'adjustment') {
      const amount = Number(event.adjustment.adjustment_amount || 0)
      principal += event.adjustment.adjustment_type === 'increase' ? amount : -amount
      continue
    }

    const paymentAmount = Number(event.payment.payment_amount || 0)
    let interestPayment = Number(event.payment.interest_payment || 0)
    let principalPayment = Number(event.payment.principal_payment || 0)

    if (interestPayment + principalPayment === 0 && paymentAmount > 0) {
      interestPayment = Math.min(paymentAmount, interestDue)
      principalPayment = paymentAmount - interestPayment
    }

    interestDue = Math.max(0, interestDue - interestPayment)
    principal = Math.max(0, principal - principalPayment)
  }

  const remainingDays = Math.max(
    0,
    Math.round((Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86400000)
  )
  interestDue += roundMoney(principal * rate * remainingDays / 3000)

  return {
    principal: roundMoney(principal),
    interestDue: roundMoney(interestDue)
  }
}

export function getInterestOnlyInterestDue(finance, paymentDate, payments, adjustments) {
  return getInterestOnlyStateAtDate(finance, paymentDate, payments, adjustments).interestDue
}

export function getInterestOnlyBalance(finance, paymentDate, payments, adjustments) {
  const balance = getInterestOnlyStateAtDate(finance, paymentDate, payments, adjustments)
  return roundMoney(balance.principal + balance.interestDue)
}