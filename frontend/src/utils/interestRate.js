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
