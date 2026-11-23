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
