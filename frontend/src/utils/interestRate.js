// Convert an entered interest amount back into the rate that produces it.
//
// The loan forms calculate interest as:
//   principal * rate * periods / 100
// so the inverse is:
//   interest * 100 / (principal * periods)
//
// `periods` is 1 for daily, weekly and interest-only loans, and the number of
// months for monthly loans. A blank result means the rate cannot be derived
// yet (no principal/periods entered, or a negative amount).
export function rateFromInterestAmount(
  interestAmount,
  principal,
  periods = 1
) {
  if (
    interestAmount === '' ||
    interestAmount === null ||
    interestAmount === undefined
  ) {
    return ''
  }

  const interest = Number(interestAmount)
  const base = Number(principal) * Number(periods)

  if (
    !Number.isFinite(interest) ||
    !Number.isFinite(base) ||
    base <= 0 ||
    interest < 0
  ) {
    return ''
  }

  // Keep enough precision that recalculating interest from this rate returns
  // the exact amount the user typed.
  return String(Number(((interest * 100) / base).toFixed(8)))
}

// The calculated fields start at 0 / 0.00. If the user starts typing a whole
// amount at the end of that placeholder, replace the placeholder instead of
// producing values like 04500 or 0.004500.
export function normalizeInterestInput(value, previousValue) {
  const raw = String(value ?? '')
  const previous = String(previousValue ?? '')

  if (
    previous !== '' &&
    Number(previous) === 0 &&
    raw.startsWith(previous) &&
    raw.length > previous.length &&
    /^\d+$/.test(raw.slice(previous.length))
  ) {
    return raw.slice(previous.length)
  }

  return raw
}
