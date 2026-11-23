import { describe, expect, it } from 'vitest'
import { normalizeFinanceType } from './financeType'

describe('normalizeFinanceType', () => {
  it('normalizes canonical and legacy loan type spellings', () => {
    expect(normalizeFinanceType('daily')).toBe('daily')
    expect(normalizeFinanceType('Daily Loan')).toBe('daily')
    expect(normalizeFinanceType('weekly-collection')).toBe('weekly')
    expect(normalizeFinanceType('Monthly Payment')).toBe('monthly')
  })

  it('maps every legacy interest-only spelling to interest_only', () => {
    expect(normalizeFinanceType('interest-only')).toBe('interest_only')
    expect(normalizeFinanceType('Interest Only')).toBe('interest_only')
    expect(normalizeFinanceType('interestonly')).toBe('interest_only')
    expect(normalizeFinanceType('Interest Only Loan')).toBe('interest_only')
  })
})
