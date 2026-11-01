import { supabase } from './supabase'

async function ensureLoanCategory(createdBy, loanName, reactivateInactive = false) {
  if (!createdBy) {
    throw new Error(`A signed-in admin is required to create the ${loanName} category.`)
  }

  const { data, error } = await supabase
    .from('collection_categories')
    .select('id, category_name, status')
    .order('category_name')

  if (error) {
    throw error
  }

  const categories = data || []
  const loanCategory = categories.find(
    (category) =>
      String(category.category_name || '').trim().toLowerCase() === loanName.toLowerCase()
  )

  if (loanCategory?.status === 'active') {
    return {
      categories: categories.filter(
        (category) => category.status === 'active'
      ),
      loanCategory
    }
  }

  if (loanCategory && !reactivateInactive) {
    throw new Error(
      `A ${loanName} collection category already exists but is inactive. Reactivate it in Collection Categories to continue.`
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
      `Only an admin can create the default ${loanName} collection category.`
    )
  }

  if (loanCategory) {
    const { data: reactivatedCategory, error: reactivateError } = await supabase
      .from('collection_categories')
      .update({ status: 'active' })
      .eq('id', loanCategory.id)
      .select('id, category_name, status')
      .single()

    if (reactivateError) {
      throw reactivateError
    }

    return {
      categories: [...categories.filter((category) => category.id !== loanCategory.id), reactivatedCategory]
        .filter((category) => category.status === 'active')
        .sort((left, right) =>
          left.category_name.localeCompare(right.category_name)
        ),
      loanCategory: reactivatedCategory
    }
  }

  const { data: createdCategory, error: createError } = await supabase
    .from('collection_categories')
    .insert({
      category_name: loanName,
      description: `Default collection category for ${loanName}`,
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
    loanCategory: createdCategory
  }
}

export async function ensureWeeklyLoanCategory(createdBy) {
  const { categories, loanCategory } =
    await ensureLoanCategory(createdBy, 'Weekly Loan')

  return {
    categories,
    weeklyCategory: loanCategory
  }
}

export async function ensureMonthlyLoanCategory(createdBy) {
  const { categories, loanCategory } =
    await ensureLoanCategory(createdBy, 'Monthly Loan', true)

  return {
    categories,
    monthlyCategory: loanCategory
  }
}
