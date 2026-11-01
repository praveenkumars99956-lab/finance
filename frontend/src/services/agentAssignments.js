export function getAssignedCategoryIds(assignments, financeType) {
  const normalizedType = String(financeType || '').trim().toLowerCase()
  return [...new Set(
    (assignments || [])
      .filter((assignment) => {
        const assignedType = String(assignment.collection_type || '').trim().toLowerCase()
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
      const type = String(assignment.collection_type || '').trim().toLowerCase()
      return `${categoryId}:${type}`
    })
  )

  return (records || []).filter((record) => {
    const categoryId = String(record.collection_category_id)
    const type = String(record.finance_type || '').trim().toLowerCase()
    return allowed.has(`${categoryId}:${type}`) ||
      allowed.has(`${categoryId}:all`) ||
      allowed.has(`${categoryId}:`)
  })
}
