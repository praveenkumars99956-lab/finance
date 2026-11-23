import { describe, expect, it } from 'vitest'
import {
  categoryTypeFromName,
  isMissingCategoryTypeColumnError
} from './categoryType'

describe('isMissingCategoryTypeColumnError', () => {
  it('recognizes the PGRST204 error returned by INSERT/UPDATE payloads', () => {
    expect(
      isMissingCategoryTypeColumnError({
        code: 'PGRST204',
        message:
          "Could not find the 'category_type' column of 'collection_categories' in the schema cache"
      })
    ).toBe(true)
  })

  it('recognizes the 42703 error returned by SELECT filters', () => {
    expect(
      isMissingCategoryTypeColumnError({
        code: '42703',
        message: 'column collection_categories.category_type does not exist'
      })
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isMissingCategoryTypeColumnError(null)).toBe(false)
    expect(
      isMissingCategoryTypeColumnError({
        code: '23505',
        message: 'duplicate key value violates unique constraint'
      })
    ).toBe(false)
    expect(
      isMissingCategoryTypeColumnError({
        code: 'PGRST204',
        message: "Could not find the 'description' column"
      })
    ).toBe(false)
  })
})

describe('categoryTypeFromName', () => {
  it('derives the stored type from legacy category names', () => {
    expect(categoryTypeFromName('Daily')).toBe('daily')
    expect(categoryTypeFromName('Weekly Collection')).toBe('weekly')
    expect(categoryTypeFromName('monthly loans')).toBe('monthly')
    expect(categoryTypeFromName('Interest Only')).toBe('interest')
  })

  it('returns an empty string for unknown or empty names', () => {
    expect(categoryTypeFromName('')).toBe('')
    expect(categoryTypeFromName(null)).toBe('')
    expect(categoryTypeFromName('General')).toBe('')
  })
})
