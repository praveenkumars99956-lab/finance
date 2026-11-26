import { describe, expect, it } from 'vitest'
import { createTenantAuthEmail } from './tenantAuthEmail'

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000'

describe('createTenantAuthEmail', () => {
  it('matches the Edge Function alias format', () => {
    expect(
      createTenantAuthEmail('Ravi.Kumar@example.com', WORKSPACE_ID)
    ).toBe('ravi.kumar+123e4567e89b12d3a456426614174000@example.com')
  })

  it('truncates long local parts before adding the tenant tag', () => {
    const result = createTenantAuthEmail(
      `${'a'.repeat(80)}@example.com`,
      WORKSPACE_ID
    )
    const localPart = result.split('@')[0]

    expect(localPart.length).toBe(64)
    expect(localPart.endsWith('+123e4567e89b12d3a456426614174000')).toBe(true)
  })

  it('returns an empty string for incomplete input', () => {
    expect(createTenantAuthEmail('', WORKSPACE_ID)).toBe('')
    expect(createTenantAuthEmail('not-an-email', WORKSPACE_ID)).toBe('')
    expect(createTenantAuthEmail('ravi@example.com', '')).toBe('')
  })
})
