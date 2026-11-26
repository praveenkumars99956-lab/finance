import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = {
  select: vi.fn(() => query),
  order: vi.fn(),
  insert: vi.fn(() => query),
  update: vi.fn(() => query),
  single: vi.fn()
}

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn(() => query)
  }
}))

import {
  getInterestOnlyLoanCategory,
  getMonthlyLoanCategory,
  getWeeklyLoanCategory
} from '../services/collectionCategories'

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

const interestCategory = {
  id: 'interest-1',
  category_name: 'Interest-Only Collection',
  status: 'active',
  category_type: 'interest'
}

const dailyCategory = {
  id: 'daily-1',
  category_name: 'Daily Loan',
  status: 'active',
  category_type: 'daily'
}

function expectNoWrites() {
  expect(query.insert).not.toHaveBeenCalled()
  expect(query.update).not.toHaveBeenCalled()
  expect(query.single).not.toHaveBeenCalled()
}

describe('collection category lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads only weekly categories when preparing the weekly form', async () => {
    query.order.mockResolvedValueOnce({
      data: [weeklyCategory, monthlyCategory, dailyCategory],
      error: null
    })

    const result = await getWeeklyLoanCategory()

    expect(query.select).toHaveBeenCalledWith(
      'id, category_name, status, category_type'
    )
    expect(result.weeklyCategory).toEqual(weeklyCategory)
    expect(result.categories).toEqual([weeklyCategory])
    expectNoWrites()
  })

  it('loads only monthly categories when preparing the monthly form', async () => {
    query.order.mockResolvedValueOnce({
      data: [weeklyCategory, monthlyCategory, dailyCategory],
      error: null
    })

    const result = await getMonthlyLoanCategory()

    expect(result.monthlyCategory).toEqual(monthlyCategory)
    expect(result.categories).toEqual([monthlyCategory])
    expectNoWrites()
  })

  it('loads only interest categories when preparing the interest-only form', async () => {
    query.order.mockResolvedValueOnce({
      data: [interestCategory, monthlyCategory, dailyCategory],
      error: null
    })

    const result = await getInterestOnlyLoanCategory()

    expect(result.interestOnlyCategory).toEqual(interestCategory)
    expectNoWrites()
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

    const result = await getWeeklyLoanCategory()

    expect(result.weeklyCategory).toEqual(mistypedWeeklyCategory)
    expect(result.categories.map((category) => category.id)).toEqual([
      'weekly-1'
    ])
    expectNoWrites()
  })

  it('returns no product category instead of creating one when none is active', async () => {
    query.order.mockResolvedValueOnce({
      data: [
        { ...weeklyCategory, status: 'inactive' },
        monthlyCategory,
        dailyCategory
      ],
      error: null
    })

    const result = await getWeeklyLoanCategory()

    expect(result.weeklyCategory).toBeNull()
    expect(result.categories).toEqual([])
    expectNoWrites()
  })

  it('returns no interest-only category instead of creating one when it is absent', async () => {
    query.order.mockResolvedValueOnce({
      data: [monthlyCategory, dailyCategory],
      error: null
    })

    const result = await getInterestOnlyLoanCategory()

    expect(result.interestOnlyCategory).toBeNull()
    expectNoWrites()
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

    const result = await getWeeklyLoanCategory()

    expect(selectedFields).toContain('category_type')
    expect(query.select).toHaveBeenLastCalledWith('id, category_name, status')
    expect(result.weeklyCategory.id).toBe('old-weekly')
    expect(result.categories.map((category) => category.id)).toEqual([
      'old-weekly'
    ])
    expectNoWrites()
  })
})
