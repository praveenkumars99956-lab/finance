export const FINANCE_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'interest_only'
]

export function normalizeFinanceType(value) {
  const type = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (type === 'interestonly' || type === 'interest_only') {
    return 'interest_only'
  }

  return type
}
