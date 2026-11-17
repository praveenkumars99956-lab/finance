import assert from 'node:assert/strict'
import test from 'node:test'

process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-12345'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-6789'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'

const { validateMutation } = await import('../src/routes/sync.js')

test('accepts an allowlisted customer insert', () => {
  assert.equal(
    validateMutation({
      action: 'insert',
      table: 'customers',
      payload: { full_name: 'Asha' }
    }),
    null
  )
})

test('rejects an unknown table', () => {
  assert.match(
    validateMutation({ action: 'insert', table: 'profiles', payload: {} }),
    /not allowlisted/
  )
})

test('rejects an allowlisted table with a disallowed action', () => {
  assert.match(
    validateMutation({ action: 'delete', table: 'app_settings', match: { id: 1 } }),
    /not allowed/
  )
})

test('requires a non-empty match for update/delete', () => {
  assert.match(
    validateMutation({ action: 'update', table: 'customers', payload: {}, match: {} }),
    /non-empty/
  )
})

test('rejects a non-allowlisted RPC', () => {
  assert.match(
    validateMutation({ action: 'rpc', rpc: 'drop_everything', args: {} }),
    /not allowlisted/
  )
})

test('accepts an allowlisted RPC', () => {
  assert.equal(
    validateMutation({ action: 'rpc', rpc: 'record_payment', args: {} }),
    null
  )
})
