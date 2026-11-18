import { describe, expect, it } from 'vitest'
import { rateFromInterestAmount } from './interestRate'

describe('rateFromInterestAmount', () => {
  it('derives the rate from an entered interest amount', () => {
    expect(rateFromInterestAmount('5000', '50000', 1)).toBe('10')
    expect(rateFromInterestAmount('4500', '100000', 3)).toBe('1.5')
  })

  it('keeps enough precision to reproduce the exact interest amount', () => {
    const principal = 100000
    const interest = '3333.33'
    const rate = rateFromInterestAmount(interest, principal, 1)
    expect((Number(principal) * Number(rate) / 100).toFixed(2)).toBe(interest)
  })

  it('returns a blank rate when the calculation is not possible', () => {
    expect(rateFromInterestAmount('', '50000')).toBe('')
    expect(rateFromInterestAmount('5000', '')).toBe('')
    expect(rateFromInterestAmount('5000', '0')).toBe('')
    expect(rateFromInterestAmount('-1', '50000')).toBe('')
  })
})
