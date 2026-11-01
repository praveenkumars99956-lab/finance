const FINANCE_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'interest_only'
]

function normalizeFinanceType(value) {
  const type = String(value || '').trim().toLowerCase()
  return type === 'interest-only' || type === 'interestonly'
    ? 'interest_only'
    : type
}

export function getAssignedFinanceTypes(assignments) {
  const types = new Set()

  ;(assignments || []).forEach((assignment) => {
    const type = normalizeFinanceType(assignment.collection_type)

    if (!type || type === 'all') {
      FINANCE_TYPES.forEach((financeType) => types.add(financeType))
    } else if (FINANCE_TYPES.includes(type)) {
      types.add(type)
    }
  })

  return [...types]
}

export function getAssignedCategoryIds(assignments, financeType) {
  const normalizedType = normalizeFinanceType(financeType)
  return [...new Set(
    (assignments || [])
      .filter((assignment) => {
        const assignedType = normalizeFinanceType(assignment.collection_type)
        return !assignedType || assignedType === 'all' || assignedType === normalizedType
      })
      .map((assignment) => assignment.category_id)
      .filter(Boolean)
  )]
}

export function filterAssignedFinance(records, assignments) {
  const allowed = new Set(
    (assignments || []).map((assignment) => {
      const categoryId = String(assignment.category_id)
      const type = normalizeFinanceType(assignment.collection_type)
      return `${categoryId}:${type}`
    })
  )

  return (records || []).filter((record) => {
    const categoryId = String(record.collection_category_id)
    const type = normalizeFinanceType(record.finance_type)
    return allowed.has(`${categoryId}:${type}`) ||
      allowed.has(`${categoryId}:all`) ||
      allowed.has(`${categoryId}:`)
  })
}
