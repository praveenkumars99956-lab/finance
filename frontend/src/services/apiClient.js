import {
  getSupabaseAccessToken,
  getValidAppToken,
  isApiConfigured
} from './jwtSession'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'api_error', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function apiBase() {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
}

/**
 * Fetch wrapper for the stateless API.
 *
 * - attaches the short-lived app JWT,
 * - optionally forwards the caller's Supabase token so PostgREST RLS applies,
 * - normalises errors so callers do not parse response shapes.
 */
export async function apiRequest(path, options = {}) {
  if (!isApiConfigured()) {
    throw new ApiError('The sync API is not configured (VITE_API_URL is empty).', {
      code: 'api_not_configured'
    })
  }

  const {
    method = 'GET',
    body,
    headers = {},
    auth = true,
    supabaseToken,
    signal
  } = options

  const requestHeaders = { ...headers }

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = await getValidAppToken()
    if (!token) {
      throw new ApiError('No API session is available.', {
        status: 401,
        code: 'no_app_session'
      })
    }
    requestHeaders.Authorization = `Bearer ${token}`
  }

  const resolvedSupabaseToken =
    supabaseToken === true ? await getSupabaseAccessToken() : supabaseToken

  if (resolvedSupabaseToken) {
    requestHeaders['X-Supabase-Token'] = resolvedSupabaseToken
  }

  let response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: requestHeaders,
      body:
        body === undefined || body instanceof FormData
          ? body
          : JSON.stringify(body),
      signal
    })
  } catch (error) {
    throw new ApiError(
      error?.name === 'AbortError'
        ? 'The request was cancelled.'
        : 'The server is unreachable. The change is kept in the offline outbox.',
      { code: 'network_error', details: error }
    )
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null

  if (!response.ok) {
    throw new ApiError(payload?.message || `API request failed (${response.status})`, {
      status: response.status,
      code: payload?.error || 'api_error',
      details: payload
    })
  }

  return payload
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) =>
    apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) =>
    apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' })
}
