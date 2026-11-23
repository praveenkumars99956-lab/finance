import { describe, expect, it } from 'vitest'
import {
  getCollectedAmount,
  getInstallmentAmount,
  getPeriodCount
} from './loanSummary'

describe('loan summary derived values', () => {
  it('reads the duration from the stored period text', () => {
    expect(getPeriodCount({ period: '30 Days' })).toBe(30)
    expect(getPeriodCount({ period: '12 Weeks' })).toBe(12)
    expect(getPeriodCount({ period: '6 Months' })).toBe(6)
    expect(getPeriodCount({ number_of_days: 10, period: '30 Days' })).toBe(10)
    expect(getPeriodCount({})).toBe(0)
  })

  it('derives the daily, weekly or monthly amount from total and period', () => {
    expect(getInstallmentAmount({ amount: 3000, period: '30 Days' })).toBe(100)
    expect(getInstallmentAmount({ amount: 1200, period: '4 Weeks' })).toBe(300)
    expect(getInstallmentAmount({ total_amount: 600, period: '2 Months' })).toBe(300)
    expect(getInstallmentAmount({ daily_amount: 75, amount: 3000, period: '30 Days' })).toBe(75)
    expect(getInstallmentAmount({ amount: 3000 })).toBe(0)
  })

  it('shows collected amounts even when the record paid field is stale', () => {
    expect(getCollectedAmount({ paid: 500 }, [])).toBe(500)
    expect(
      getCollectedAmount(
        { paid: 0 },
        [{ payment_amount: 250 }, { payment_amount: 100 }]
      )
    ).toBe(350)
    expect(
      getCollectedAmount(
        { paid: 250 },
        [{ payment_amount: 250 }]
      )
    ).toBe(250)
  })
})
