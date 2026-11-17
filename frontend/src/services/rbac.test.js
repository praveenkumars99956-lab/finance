import { describe, expect, it } from 'vitest'
import {
  canAccessPath,
  getDefaultPath,
  getEmailBinding,
  resolveAccess
} from './rbac'

const config = {
  adminEmails: ['owner@example.com'],
  adminEmailDomains: ['corp.example.com'],
  agentEmails: ['agent.one@example.com'],
  strictEmailBindings: false
}

const user = (email, role) => ({
  email,
  user_metadata: role ? { role } : {},
  app_metadata: {}
})

describe('resolveAccess', () => {
  it('prefers the server role over the profile role', () => {
    const access = resolveAccess(user('owner@example.com'), 'client', 'admin', config)
    expect(access.role).toBe('admin')
    expect(access.source).toBe('server')
  })

  it('lets an email binding override a stale profile role', () => {
    const access = resolveAccess(user('agent.one@example.com'), 'admin', null, config)
    expect(access.role).toBe('agent')
    expect(access.source).toBe('email-binding')
    expect(access.conflict).toBe(true)
  })

  it('resolves admin by domain', () => {
    expect(getEmailBinding('finance@corp.example.com', config)).toBe('admin')
  })

  it('falls back to the profile role when nothing matches', () => {
    const access = resolveAccess(user('person@example.com'), 'client', null, config)
    expect(access.role).toBe('client')
    expect(access.conflict).toBe(false)
  })

  it('pins unbound accounts to client in strict mode', () => {
    const access = resolveAccess(user('person@example.com'), 'agent', null, {
      ...config,
      strictEmailBindings: true
    })
    expect(access.role).toBe('client')
    expect(access.source).toBe('strict-fallback')
  })

  it('normalises emails before matching', () => {
    expect(getEmailBinding('  OWNER@Example.com ', config)).toBe('admin')
  })
})

describe('canAccessPath', () => {
  it('isolates the agent workspace from admins', () => {
    expect(canAccessPath('admin', '/agent')).toBe(false)
    expect(canAccessPath('agent', '/agent/today')).toBe(true)
  })

  it('isolates the admin console from agents', () => {
    expect(canAccessPath('agent', '/admin')).toBe(false)
    expect(canAccessPath('agent', '/customers')).toBe(false)
    expect(canAccessPath('admin', '/admin')).toBe(true)
  })

  it('keeps shared loan pages admin + client only', () => {
    expect(canAccessPath('admin', '/weekly')).toBe(true)
    expect(canAccessPath('client', '/monthly')).toBe(true)
    expect(canAccessPath('agent', '/weekly')).toBe(false)
  })

  it('allows public routes for anonymous visitors', () => {
    expect(canAccessPath(null, '/')).toBe(true)
    expect(canAccessPath(null, '/forgot-password')).toBe(true)
    expect(canAccessPath(null, '/admin')).toBe(false)
  })
})

describe('getDefaultPath', () => {
  it('maps each role to its own portal', () => {
    expect(getDefaultPath('admin')).toBe('/admin')
    expect(getDefaultPath('agent')).toBe('/agent')
    expect(getDefaultPath('client')).toBe('/client')
    expect(getDefaultPath(null)).toBe('/')
  })
})
