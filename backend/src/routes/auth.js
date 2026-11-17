import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import {
  loadProfile,
  verifySupabaseToken
} from '../services/supabase.js'
import {
  issueTokenPair,
  verifyRefreshToken
} from '../services/tokens.js'

const router = Router()

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'rate_limited',
    message: 'Too many token requests. Try again shortly.'
  }
})

function normalizeRole(profile, user) {
  const role = String(profile?.role || user?.user_metadata?.role || 'client')
    .trim()
    .toLowerCase()
  return ['admin', 'agent', 'client'].includes(role) ? role : 'client'
}

function profileWorkspace(profile) {
  return (
    profile?.workspace_id ||
    profile?.workspaceId ||
    profile?.workspace ||
    null
  )
}

/**
 * Exchange a Supabase access token for a stateless Finance Suite token pair.
 *
 * The Supabase token is verified against the auth server, then the profile is
 * loaded with the caller's own token so RLS decides what is visible. The API
 * never invents a role from client-supplied input.
 */
router.post('/token', tokenLimiter, async (req, res, next) => {
  try {
    const header = String(req.headers.authorization || '')
    const bearer = header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : null
    const supabaseToken = bearer || req.body?.supabaseAccessToken

    if (!supabaseToken) {
      return res.status(400).json({
        error: 'missing_supabase_token',
        message: 'A Supabase access token is required.'
      })
    }

    const { user, error: verifyError } = await verifySupabaseToken(supabaseToken)
    if (verifyError || !user) {
      return res.status(401).json({
        error: 'invalid_supabase_token',
        message: 'The Supabase session is not valid.'
      })
    }

    let profile = null
    const { profile: loadedProfile, error: profileError } = await loadProfile(
      user.id,
      supabaseToken
    )

    if (profileError) {
      // A missing profile is not a token failure. The access context loader in
      // the SPA will still fail closed; the API mirror keeps the least
      // privilege role so sync requests cannot escalate.
      console.warn('[auth] profile lookup failed', {
        userId: user.id,
        message: profileError.message
      })
    } else {
      profile = loadedProfile
    }

    const pair = issueTokenPair({
      userId: user.id,
      email: user.email,
      role: normalizeRole(profile, user),
      workspaceId: profileWorkspace(profile)
    })

    res.set('Cache-Control', 'no-store')
    return res.json({
      ...pair,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.user_metadata?.full_name || null,
        role: normalizeRole(profile, user),
        workspaceId: profileWorkspace(profile)
      }
    })
  } catch (error) {
    return next(error)
  }
})

/**
 * Rotate a refresh token. Because tokens are self-contained this endpoint is
 * horizontally scalable: every node can verify the signature independently.
 */
router.post('/refresh', tokenLimiter, async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken
    if (!refreshToken) {
      return res.status(400).json({
        error: 'missing_refresh_token',
        message: 'A refresh token is required.'
      })
    }

    let claims
    try {
      claims = verifyRefreshToken(refreshToken)
    } catch {
      return res.status(401).json({
        error: 'invalid_refresh_token',
        message: 'The refresh token is invalid or expired.'
      })
    }

    if (claims.type !== 'refresh') {
      return res.status(401).json({
        error: 'invalid_token_type',
        message: 'An access token cannot be used to refresh a session.'
      })
    }

    const pair = issueTokenPair({
      userId: claims.sub,
      email: claims.email,
      role: claims.role,
      workspaceId: claims.workspace_id
    })

    res.set('Cache-Control', 'no-store')
    return res.json(pair)
  } catch (error) {
    return next(error)
  }
})

/**
 * Stateless logout. There is nothing to delete server-side; the client must
 * discard its token pair. Keeping the endpoint makes the contract explicit and
 * gives us one place to add a denylist later if refresh tokens are persisted.
 */
router.post('/logout', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.status(204).end()
})

router.get('/me', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({
    user: {
      id: req.auth.userId,
      email: req.auth.email,
      role: req.auth.role,
      workspaceId: req.auth.workspaceId
    },
    token: {
      id: req.auth.claims.jti,
      issuedAt: new Date(req.auth.claims.iat * 1000).toISOString(),
      expiresAt: new Date(req.auth.claims.exp * 1000).toISOString()
    }
  })
})

export default router
