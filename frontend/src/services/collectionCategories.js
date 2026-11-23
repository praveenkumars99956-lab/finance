import { supabase } from './supabase'
import { isMissingCategoryTypeColumnError } from '../utils/categoryType'
import { loadAccessContext } from './access'

async function loadCollectionCategories() {
  const { data, error } = await supabase
    .from('collection_categories')
    .select('id, category_name, status')
    .order('category_name')

  if (error) {
    throw error
  }

  return data || []
}

async function insertLoanCategory(payload) {
  const { data, error } = await supabase
    .from('collection_categories')
    .insert(payload)
    .select('id, category_name, status')
    .single()

  // The category_type column is added by a recent migration. Until it has
  // been applied, fall back to a plain insert so loan creation still works.
  if (isMissingCategoryTypeColumnError(error)) {
    const payloadWithoutType = { ...payload }
    delete payloadWithoutType.category_type

    return supabase
      .from('collection_categories')
      .insert(payloadWithoutType)
      .select('id, category_name, status')
      .single()
  }

  return { data, error }
}

async function ensureLoanCategory(
  createdBy,
  loanName,
  reactivateInactive = false,
  categoryType = 'daily'
) {
  if (!createdBy) {
    throw new Error(`A signed-in admin is required to create the ${loanName} category.`)
  }

  const categories = await loadCollectionCategories()
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

  const { access, error: accessError } = await loadAccessContext()

  if (accessError) {
    throw accessError
  }

  if (access?.role !== 'admin') {
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

  const { data: createdCategory, error: createError } =
    await insertLoanCategory({
      category_name: loanName,
      description: `Default collection category for ${loanName}`,
      status: 'active',
      category_type: categoryType,
      created_by: createdBy
    })

  if (createError) {
    if (createError.code === '23505') {
      const currentCategories = await loadCollectionCategories()
      const existingCategory = currentCategories.find(
        (category) =>
          String(category.category_name || '').trim().toLowerCase() === loanName.toLowerCase()
      )

      if (existingCategory?.status === 'active') {
        return {
          categories: currentCategories.filter(
            (category) => category.status === 'active'
          ),
          loanCategory: existingCategory
        }
      }

      if (existingCategory && !reactivateInactive) {
        throw new Error(
          `A ${loanName} collection category already exists but is inactive. Reactivate it in Collection Categories to continue.`
        )
      }
    }

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

export async function ensureWeeklyLoanCategory(
  createdBy,
  reactivateInactive = true
) {
  const { categories, loanCategory } =
    await ensureLoanCategory(
      createdBy,
      'Weekly Loan',
      reactivateInactive,
      'weekly'
    )

  return {
    categories,
    weeklyCategory: loanCategory
  }
}

export async function ensureMonthlyLoanCategory(createdBy) {
  const { categories, loanCategory } =
    await ensureLoanCategory(
      createdBy,
      'Monthly Loan',
      true,
      'monthly'
    )

  return {
    categories,
    monthlyCategory: loanCategory
  }
}

export async function ensureInterestOnlyLoanCategory(createdBy) {
  const { loanCategory } =
    await ensureLoanCategory(
      createdBy,
      'Interest-Only Collection',
      true,
      'interest'
    )

  return {
    interestOnlyCategory: loanCategory
  }
}
