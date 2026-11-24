import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = {
  select: vi.fn(() => query),
  order: vi.fn(),
  insert: vi.fn(() => query),
  single: vi.fn()
}

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn(() => query)
  }
}))

vi.mock('../services/access', () => ({
  loadAccessContext: vi.fn()
}))

import { ensureMonthlyLoanCategory, ensureWeeklyLoanCategory } from '../services/collectionCategories'

const weeklyCategory = {
  id: 'weekly-1',
  category_name: 'Weekly Loan',
  status: 'active',
  category_type: 'weekly'
}

const monthlyCategory = {
  id: 'monthly-1',
  category_name: 'Monthly Loan',
  status: 'active',
  category_type: 'monthly'
}

const dailyCategory = {
  id: 'daily-1',
  category_name: 'Daily Loan',
  status: 'active',
  category_type: 'daily'
}

describe('collection category service product typing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads only weekly categories when preparing the weekly form', async () => {
    query.order.mockResolvedValueOnce({
      data: [weeklyCategory, monthlyCategory, dailyCategory],
      error: null
    })

    const result = await ensureWeeklyLoanCategory('admin-1')

    expect(query.select).toHaveBeenCalledWith(
      'id, category_name, status, category_type'
    )
    expect(result.weeklyCategory).toEqual(weeklyCategory)
    expect(result.categories).toEqual([weeklyCategory])
  })

  it('loads only monthly categories when preparing the monthly form', async () => {
    query.order.mockResolvedValueOnce({
      data: [weeklyCategory, monthlyCategory, dailyCategory],
      error: null
    })

    const result = await ensureMonthlyLoanCategory('admin-1')

    expect(result.monthlyCategory).toEqual(monthlyCategory)
    expect(result.categories).toEqual([monthlyCategory])
  })

  it('treats a reserved product name as authoritative over a wrong category_type', async () => {
    const mistypedWeeklyCategory = {
      ...weeklyCategory,
      category_type: 'daily'
    }

    query.order.mockResolvedValueOnce({
      data: [mistypedWeeklyCategory, monthlyCategory, dailyCategory],
      error: null
    })

    const result = await ensureWeeklyLoanCategory('admin-1')

    expect(result.weeklyCategory).toEqual(mistypedWeeklyCategory)
    expect(result.categories.map((category) => category.id)).toEqual([
      'weekly-1'
    ])
    expect(query.insert).not.toHaveBeenCalled()
  })

  it('falls back to name-based typing when category_type is not in the database', async () => {
    let selectedFields = ''

    query.select.mockImplementationOnce((fields) => {
      selectedFields = fields
      return query
    })
    query.order
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '42703',
          message: 'column collection_categories.category_type does not exist'
        }
      })
      .mockResolvedValueOnce({
        data: [
          { id: 'old-weekly', category_name: 'Weekly Loan', status: 'active' },
          { id: 'old-daily', category_name: 'Daily Loan', status: 'active' }
        ],
        error: null
      })

    const result = await ensureWeeklyLoanCategory('admin-1')

    expect(selectedFields).toContain('category_type')
    expect(query.select).toHaveBeenLastCalledWith('id, category_name, status')
    expect(result.weeklyCategory.id).toBe('old-weekly')
    expect(result.categories.map((category) => category.id)).toEqual([
      'old-weekly'
    ])
  })
})
