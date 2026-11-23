import { normalizeFinanceType } from './financeType'

// Report filters compare values that can arrive as a plain date ("2026-01-15")
// or as a full timestamp ("2026-01-15T00:00:00.000Z"). Comparing those strings
// directly makes the To-date filter drop records on the selected day, so use
// the date part for every comparison.
export function toDateKey(value) {
  if (!value) return ''

  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

export function isDateOverdue(value, now = new Date()) {
  const key = toDateKey(value)
  if (!key) return false

  const dueDate = new Date(`${key}T00:00:00`)
  if (Number.isNaN(dueDate.getTime())) return false

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  return dueDate < today
}

export function getLoanStatus(record, now = new Date()) {
  if (Number(record?.pending || 0) <= 0) return 'paid'
  if (isDateOverdue(record?.next_due_date, now)) return 'overdue'
  return 'pending'
}

export function matchesReportFilter(record, filter, now = new Date()) {
  if (!filter || filter === 'all') return true

  const type = normalizeFinanceType(record?.finance_type)

  if (['daily', 'weekly', 'monthly', 'interest_only'].includes(filter)) {
    return type === filter
  }

  if (['pending', 'overdue', 'paid'].includes(filter)) {
    return getLoanStatus(record, now) === filter
  }

  return true
}

export function buildReportSearchText(record, extraFields = []) {
  return [
    record?.customers?.full_name,
    record?.name,
    record?.customers?.customer_id,
    record?.customer_id,
    record?.customers?.phone,
    record?.phone,
    record?.collection_categories?.category_name,
    record?.category_name,
    record?.finance_type,
    normalizeFinanceType(record?.finance_type),
    ...extraFields
  ]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(' ')
    .toLowerCase()
}

export function matchesCollectionReport(record, filters = {}) {
  const {
    search = '',
    typeFilter = 'all',
    fromDate = '',
    toDate = ''
  } = filters

  const text = String(search).trim().toLowerCase()
  const haystack = buildReportSearchText({
    customers: {
      full_name: record?.customerName,
      customer_id: record?.customerId,
      phone: record?.phone
    },
    finance_type: record?.financeType
  }, [
    record?.agentName,
    record?.agentCode,
    record?.category,
    record?.paymentDate,
    record?.paymentAmount,
    record?.balanceBefore,
    record?.balanceAfter
  ])

  const matchesSearch = !text || haystack.includes(text)
  const matchesType =
    !typeFilter ||
    typeFilter === 'all' ||
    normalizeFinanceType(record?.financeType) ===
      normalizeFinanceType(typeFilter)

  const paymentDate = toDateKey(record?.paymentDate)
  const fromKey = toDateKey(fromDate)
  const toKey = toDateKey(toDate)

  const matchesFrom = !fromKey || (!!paymentDate && paymentDate >= fromKey)
  const matchesTo = !toKey || (!!paymentDate && paymentDate <= toKey)

  return matchesSearch && matchesType && matchesFrom && matchesTo
}
