import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

const ISSUER = config.jwt.issuer
const AUDIENCE = config.jwt.audience

function baseClaims(subject) {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: subject,
    jti: crypto.randomUUID()
  }
}

/**
 * Issue a short-lived access token. The token is self-contained: no server
 * session lookup is required, which is what allows any API node to serve it.
 */
export function signAccessToken({ userId, email, role, workspaceId = null }) {
  return jwt.sign(
    {
      ...baseClaims(userId),
      type: 'access',
      email: email || null,
      role: role || 'client',
      workspace_id: workspaceId || null
    },
    config.jwt.accessSecret,
    {
      expiresIn: config.jwt.accessTtl,
      algorithm: 'HS256'
    }
  )
}

/**
 * Issue a refresh token. Rotation is handled by the caller: a refresh token is
 * single-use in the client, but the server stays stateless.
 */
export function signRefreshToken({ userId, email, role, workspaceId = null }) {
  return jwt.sign(
    {
      ...baseClaims(userId),
      type: 'refresh',
      email: email || null,
      role: role || 'client',
      workspace_id: workspaceId || null
    },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshTtl,
      algorithm: 'HS256'
    }
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256']
  })
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256']
  })
}

export function issueTokenPair(identity) {
  const accessToken = signAccessToken(identity)
  const refreshToken = signRefreshToken(identity)
  const decoded = jwt.decode(accessToken)

  return {
    tokenType: 'Bearer',
    accessToken,
    refreshToken,
    expiresIn: decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 900,
    expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
    role: identity.role || 'client'
  }
}

export function decodeExpiry(token) {
  const decoded = jwt.decode(token)
  return decoded?.exp ? decoded.exp * 1000 : 0
}
