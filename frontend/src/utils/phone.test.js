import { describe, expect, it } from 'vitest'
import { isValidPhone, normalizePhone } from './phone'

describe('phone validation', () => {
  it('accepts exactly 10 digits', () => {
    expect(isValidPhone('9876543210')).toBe(true)
    expect(isValidPhone(' 9876543210 ')).toBe(true)
  })

  it('rejects fewer or more than 10 digits', () => {
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('987654321')).toBe(false)
    expect(isValidPhone('98765432100')).toBe(false)
  })

  it('ignores spaces and other non-digit characters', () => {
    expect(isValidPhone('987 654 3210')).toBe(true)
    expect(isValidPhone('+91 9876543210')).toBe(false)
    expect(isValidPhone('abcdefghij')).toBe(false)
  })

  it('normalizes input to digits only and caps at 10', () => {
    expect(normalizePhone('98 765-43210')).toBe('9876543210')
    expect(normalizePhone('987654321099')).toBe('9876543210')
    expect(normalizePhone('abc')).toBe('')
    expect(normalizePhone(null)).toBe('')
  })
})
