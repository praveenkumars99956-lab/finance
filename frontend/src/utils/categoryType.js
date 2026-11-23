// PostgREST reports a missing column with different codes depending on the
// operation:
//   - SELECT / filter: 42703 "column collection_categories.category_type does not exist"
//   - INSERT / UPDATE payload: PGRST204 "Could not find the 'category_type' column ... in the schema cache"
// The category_type column comes from a migration, so until it is applied to
// a project these errors must be treated as "migration not applied yet".
export function isMissingCategoryTypeColumnError(error) {
  if (!error) return false

  const code = String(error.code || '')
  if (code !== '42703' && code !== 'PGRST204') return false

  return /category_type/i.test(error.message || '')
}

// Older category rows predate category_type, so derive the product from the
// display name when the migration column is absent/empty.
export function categoryTypeFromName(name) {
  const value = String(name ?? '')
    .trim()
    .toLowerCase()

  if (value.includes('interest')) return 'interest'
  if (value.includes('weekly')) return 'weekly'
  if (value.includes('monthly')) return 'monthly'
  if (value.includes('daily')) return 'daily'
  return ''
}
