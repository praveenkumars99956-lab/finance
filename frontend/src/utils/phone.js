/**
 * Phone numbers are stored as exactly 10 digits throughout the app.
 * Keeping the rule in one place stops individual forms from accepting
 * short, long or free-text values.
 */
export const PHONE_LENGTH = 10

/** Remove everything that is not a digit (spaces from voice input, etc.). */
export function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/** Value safe to put in a phone input: digits only, never longer than 10. */
export function normalizePhone(value) {
  return phoneDigits(value).slice(0, PHONE_LENGTH)
}

/** True only when the value contains exactly 10 digits. */
export function isValidPhone(value) {
  return phoneDigits(value).length === PHONE_LENGTH
}
