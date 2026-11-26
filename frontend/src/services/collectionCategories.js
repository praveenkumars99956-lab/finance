import { supabase } from './supabase'
import {
  categoryTypeFromName,
  isMissingCategoryTypeColumnError
} from '../utils/categoryType'

// Loan product categories are created manually in Collection Categories.
// These helpers only look up an existing active category; they never insert,
// reactivate or seed one as a side effect of opening a form.

async function loadCollectionCategories(categoryType) {
  let result = await supabase
    .from('collection_categories')
    .select('id, category_name, status, category_type')
    .order('category_name')

  // Until the category_type migration is applied, keep the previous behaviour
  // of returning every active/inactive category so edits still work.
  if (isMissingCategoryTypeColumnError(result.error)) {
    result = await supabase
      .from('collection_categories')
      .select('id, category_name, status')
      .order('category_name')
  }

  if (result.error) {
    throw result.error
  }

  const categories = result.data || []

  if (!categoryType) {
    return categories
  }

  // Legacy rows can predate category_type even after the column exists, so
  // fall back to the product name before excluding them.
  return categories.filter((category) => {
    const storedType = String(category.category_type || '')
      .trim()
      .toLowerCase()

    // Reserved product names are authoritative. If an admin changed
    // "Weekly Loan" to category_type='daily', the weekly form still finds the
    // manually created category instead of trying to create a duplicate.
    const nameType = categoryTypeFromName(category.category_name)

    if (nameType) {
      return nameType === categoryType
    }

    if (storedType) {
      return storedType === categoryType
    }

    return false
  })
}

async function findActiveLoanCategory(loanName, categoryType) {
  const categories = await loadCollectionCategories(categoryType)
  const activeCategories = categories.filter(
    (category) => category.status === 'active'
  )

  const loanCategory =
    activeCategories.find(
      (category) =>
        String(category.category_name || '')
          .trim()
          .toLowerCase() === loanName.toLowerCase()
    ) || null

  return { categories: activeCategories, loanCategory }
}

export async function getWeeklyLoanCategory() {
  const { categories, loanCategory } =
    await findActiveLoanCategory(
      'Weekly Loan',
      'weekly'
    )

  return {
    categories,
    weeklyCategory: loanCategory
  }
}

export async function getMonthlyLoanCategory() {
  const { categories, loanCategory } =
    await findActiveLoanCategory(
      'Monthly Loan',
      'monthly'
    )

  return {
    categories,
    monthlyCategory: loanCategory
  }
}

export async function getInterestOnlyLoanCategory() {
  const { loanCategory } =
    await findActiveLoanCategory(
      'Interest-Only Collection',
      'interest'
    )

  return {
    interestOnlyCategory: loanCategory
  }
}
