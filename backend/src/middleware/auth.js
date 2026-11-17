import { verifyAccessToken } from '../services/tokens.js'

function bearerFrom(header = '') {
  const [scheme, token] = String(header).split(' ')
  return scheme?.toLowerCase() === 'bearer' ? token : null
}

export function requireAuth(req, res, next) {
  const token = bearerFrom(req.headers.authorization)

  if (!token) {
    return res.status(401).json({
      error: 'missing_token',
      message: 'A Bearer access token is required.'
    })
  }

  try {
    const claims = verifyAccessToken(token)
    if (claims.type !== 'access') {
      return res.status(401).json({
        error: 'invalid_token_type',
        message: 'A refresh token cannot be used as an access token.'
      })
    }

    req.auth = {
      userId: claims.sub,
      email: claims.email,
      role: claims.role,
      workspaceId: claims.workspace_id,
      claims
    }

    return next()
  } catch (error) {
    return res.status(401).json({
      error: error.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token',
      message:
        error.name === 'TokenExpiredError'
          ? 'The access token has expired.'
          : 'The access token is invalid.'
    })
  }
}

/**
 * The sync route needs the caller's Supabase token so PostgREST applies the
 * user's RLS policies. The app JWT proves who the caller is; the Supabase token
 * proves what they may read/write.
 */
export function readSupabaseToken(req) {
  return (
    req.headers['x-supabase-token'] ||
    req.body?.supabaseAccessToken ||
    null
  )
}
