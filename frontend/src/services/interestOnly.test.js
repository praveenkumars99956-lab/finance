import { describe, it, expect, vi } from 'vitest'
import {
  getInterestOnlyStateAtDate,
  getInterestOnlyInterestDue,
  getInterestOnlyBalance
} from '../services/interestOnly'

const createFinance = (overrides = {}) => ({
  original_principal: 50000,
  principal_amount: 50000,
  amount: 50000,
  interest_rate: 12,
  entry_date: '2024-01-01',
  payment_date: '2024-01-01',
  ...overrides
})

const createPayment = (overrides = {}) => ({
  payment_date: '2024-01-15',
  created_at: '2024-01-15T10:00:00Z',
  payment_amount: 500,
  interest_payment: 500,
  principal_payment: 0,
  ...overrides
})

const createAdjustment = (overrides = {}) => ({
  adjustment_date: '2024-01-10',
  created_at: '2024-01-10T10:00:00Z',
  adjustment_amount: 10000,
  adjustment_type: 'increase',
  ...overrides
})

describe('interestOnly.js', () => {
  describe('getInterestOnlyStateAtDate', () => {
    it('returns original principal and zero interest before start date', () => {
      const finance = createFinance()
      const result = getInterestOnlyStateAtDate(finance, '2023-12-31', [], [])
      expect(result).toEqual({ principal: 50000, interestDue: 0 })
    })

    it('returns original principal and zero interest on start date', () => {
      const finance = createFinance()
      const result = getInterestOnlyStateAtDate(finance, '2024-01-01', [], [])
      expect(result).toEqual({ principal: 50000, interestDue: 0 })
    })

    it('accrues interest daily at principal * rate / 3000', () => {
      const finance = createFinance({ original_principal: 30000, interest_rate: 12 })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-31', [], [])
      // 30 days * 30000 * 12 / 3000 = 3600
      expect(result.principal).toBe(30000)
      expect(result.interestDue).toBe(3600)
    })

    it('accrues interest for partial month', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 10 })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-16', [], [])
      // 15 days * 50000 * 10 / 3000 = 2500
      expect(result.interestDue).toBe(2500)
    })

    it('payment fallback clears interest only and holds principal', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const payment = createPayment({
        payment_date: '2024-01-15',
        payment_amount: 1000,
        interest_payment: 0,
        principal_payment: 0
      })
      // 14 days interest = 50000 * 12 * 14 / 3000 = 2800
      // Payment 1000: interest_payment = min(1000, 2800) = 1000, principal_payment = 0
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [payment], [])
      expect(result.interestDue).toBe(1800) // 2800 - 1000
      expect(result.principal).toBe(50000)
    })

    it('payment fallback never reduces principal even when it exceeds interest due', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const payment = createPayment({
        payment_date: '2024-01-15',
        payment_amount: 5000,
        interest_payment: 0,
        principal_payment: 0
      })
      // 14 days interest = 2800; the held-principal rule clears only interest.
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [payment], [])
      expect(result.interestDue).toBe(0)
      expect(result.principal).toBe(50000)
    })

    it('payment with stored allocation uses stored values', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const payment = createPayment({
        payment_date: '2024-01-15',
        payment_amount: 1000,
        interest_payment: 800,
        principal_payment: 200
      })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [payment], [])
      expect(result.interestDue).toBe(2000) // 2800 - 800
      expect(result.principal).toBe(49800) // 50000 - 200
    })

    it('adjustment increases principal', () => {
      const finance = createFinance({ original_principal: 50000 })
      const adjustment = createAdjustment({
        adjustment_date: '2024-01-10',
        adjustment_amount: 10000,
        adjustment_type: 'increase'
      })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [], [adjustment])
      // 9 days on 50000 = 1800, then principal becomes 60000, 5 days on 60000 = 1200
      expect(result.principal).toBe(60000)
      expect(result.interestDue).toBe(3000)
    })

    it('adjustment decreases principal', () => {
      const finance = createFinance({ original_principal: 50000 })
      const adjustment = createAdjustment({
        adjustment_date: '2024-01-10',
        adjustment_amount: 10000,
        adjustment_type: 'decrease'
      })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [], [adjustment])
      expect(result.principal).toBe(40000)
    })

    it('multiple payments and adjustments in chronological order', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const payment1 = createPayment({
        payment_date: '2024-01-10',
        created_at: '2024-01-10T10:00:00Z',
        payment_amount: 500,
        interest_payment: 500,
        principal_payment: 0
      })
      const adjustment = createAdjustment({
        adjustment_date: '2024-01-12',
        created_at: '2024-01-12T10:00:00Z',
        adjustment_amount: 5000,
        adjustment_type: 'increase'
      })
      const payment2 = createPayment({
        payment_date: '2024-01-15',
        created_at: '2024-01-15T10:00:00Z',
        payment_amount: 1000,
        interest_payment: 1000,
        principal_payment: 0
      })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [payment1, payment2], [adjustment])
      // Should process in order: payment1 (Jan 10), adjustment (Jan 12), payment2 (Jan 15)
      expect(result.principal).toBe(55000)
    })

    it('handles missing finance gracefully', () => {
      const result = getInterestOnlyStateAtDate(null, '2024-01-15', [], [])
      expect(result).toEqual({ principal: 0, interestDue: 0 })
    })

    it('handles missing dates gracefully', () => {
      const finance = createFinance({ entry_date: null })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [], [])
      // Falls back to payment_date '2024-01-01', so 14 days interest = 2800
      expect(result).toEqual({ principal: 50000, interestDue: 2800 })
    })

    it('filters events outside date range', () => {
      const finance = createFinance({ entry_date: '2024-01-01' })
      const paymentBefore = createPayment({ payment_date: '2023-12-31' })
      const paymentAfter = createPayment({ payment_date: '2024-01-20' })
      const result = getInterestOnlyStateAtDate(finance, '2024-01-15', [paymentBefore, paymentAfter], [])
      // paymentBefore filtered (before start), paymentAfter filtered (after target)
      // Interest accrues 14 days (Jan 1-15) = 2800
      expect(result.interestDue).toBe(2800)
    })
  })

  describe('getInterestOnlyInterestDue', () => {
    it('returns only interestDue from state', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const interestDue = getInterestOnlyInterestDue(finance, '2024-01-16', [], [])
      // 15 days (Jan 1-16) * 50000 * 12 / 3000 = 3000
      expect(interestDue).toBe(3000)
    })
  })

  describe('getInterestOnlyBalance', () => {
    it('returns principal + interestDue rounded', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const balance = getInterestOnlyBalance(finance, '2024-01-16', [], [])
      // 50000 + 3000 = 53000
      expect(balance).toBe(53000)
    })

    it('includes payment effects', () => {
      const finance = createFinance({ original_principal: 50000, interest_rate: 12 })
      const payment = createPayment({
        payment_date: '2024-01-15',
        payment_amount: 1000,
        interest_payment: 1000,
        principal_payment: 0
      })
      const balance = getInterestOnlyBalance(finance, '2024-01-15', [payment], [])
      // 2800 interest accrued - 1000 paid = 1800 due, principal 50000
      expect(balance).toBe(51800)
    })
  })
})