export const FINANCE_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'interest_only'
]

// Older records/labels use values such as "Daily Loan", "Interest Only" or
// "interest-only". Every filter (Reports, Collections, Payments, Pending and
// the agent portal) should treat those as the current canonical type.
const TYPE_ALIASES = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  interest: 'interest_only',
  interest_only: 'interest_only'
}

export function normalizeFinanceType(value) {
  const type = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  const base = type.replace(/_(loans?|collections?|payments?)$/, '')

  return TYPE_ALIASES[base] || type
}
