import { supabase } from './supabase'

export async function ensureWeeklyLoanCategory(createdBy) {
  if (!createdBy) {
    throw new Error('A signed-in admin is required to create the Weekly Loan category.')
  }

  const { data, error } = await supabase
    .from('collection_categories')
    .select('id, category_name, status')
    .order('category_name')

  if (error) {
    throw error
  }

  const categories = data || []
  const weeklyCategory = categories.find(
    (category) =>
      String(category.category_name || '').trim().toLowerCase() === 'weekly loan'
  )

  if (weeklyCategory?.status === 'active') {
    return {
      categories: categories.filter(
        (category) => category.status === 'active'
      ),
      weeklyCategory
    }
  }

  if (weeklyCategory) {
    throw new Error(
      'A Weekly Loan collection category already exists but is inactive. Reactivate it in Collection Categories to continue.'
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', createdBy)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  if (profile?.role !== 'admin') {
    throw new Error(
      'Only an admin can create the default Weekly Loan collection category.'
    )
  }

  const { data: createdCategory, error: createError } = await supabase
    .from('collection_categories')
    .insert({
      category_name: 'Weekly Loan',
      description: 'Default collection category for weekly loans',
      status: 'active',
      created_by: createdBy
    })
    .select('id, category_name, status')
    .single()

  if (createError) {
    throw createError
  }

  return {
    categories: [...categories, createdCategory]
      .filter((category) => category.status === 'active')
      .sort((left, right) =>
        left.category_name.localeCompare(right.category_name)
      ),
    weeklyCategory: createdCategory
  }
}
