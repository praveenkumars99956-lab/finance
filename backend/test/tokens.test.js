import assert from 'node:assert/strict'
import test from 'node:test'

process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-12345'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-6789'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'

const {
  issueTokenPair,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} = await import('../src/services/tokens.js')

test('issues a matching stateless access/refresh pair', () => {
  const pair = issueTokenPair({
    userId: 'user-1',
    email: 'owner@example.com',
    role: 'admin',
    workspaceId: 'workspace-1'
  })

  assert.equal(pair.tokenType, 'Bearer')
  assert.ok(pair.accessToken)
  assert.ok(pair.refreshToken)

  const access = verifyAccessToken(pair.accessToken)
  assert.equal(access.sub, 'user-1')
  assert.equal(access.role, 'admin')
  assert.equal(access.workspace_id, 'workspace-1')
  assert.equal(access.type, 'access')

  const refresh = verifyRefreshToken(pair.refreshToken)
  assert.equal(refresh.type, 'refresh')
})

test('an access token cannot be verified as a refresh token', () => {
  const pair = issueTokenPair({ userId: 'user-2', role: 'agent' })
  assert.throws(() => verifyRefreshToken(pair.accessToken))
})

test('a refresh token cannot be verified as an access token', () => {
  const refresh = signRefreshToken({ userId: 'user-3', role: 'client' })
  assert.throws(() => verifyAccessToken(refresh))
})
