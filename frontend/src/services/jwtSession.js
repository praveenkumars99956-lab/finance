import { supabase } from './supabase'

const STORAGE_KEY = 'finance-app-jwt'
const REFRESH_SKEW_MS = 30 * 1000

let exchangeInFlight = null
let bridgeStarted = false

function apiBase() {
  const value = import.meta.env.VITE_API_URL || ''
  return value.replace(/\/$/, '')
}

export function isApiConfigured() {
  return Boolean(apiBase())
}

function readStoredTokens() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.accessToken || !parsed?.refreshToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeStoredTokens(pair) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pair))
  } catch {
    // Token refresh still works in memory for this page.
  }
}

function clearStoredTokens() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore blocked storage.
  }
}

function tokenExpiresSoon(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return !payload.exp || payload.exp * 1000 - Date.now() < REFRESH_SKEW_MS
  } catch {
    return true
  }
}

async function readJson(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) return null
  return response.json()
}

async function requestToken(path, body, headers = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  })

  const payload = await readJson(response)
  if (!response.ok) {
    const error = new Error(payload?.message || `Token request failed (${response.status})`)
    error.status = response.status
    error.code = payload?.error
    throw error
  }

  return payload
}

export async function getSupabaseAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data?.session?.access_token || null
}

export async function exchangeSupabaseSession(supabaseAccessToken) {
  const token = supabaseAccessToken || (await getSupabaseAccessToken())
  if (!token || !isApiConfigured()) return null

  const pair = await requestToken(
    '/api/auth/token',
    {},
    { Authorization: `Bearer ${token}` }
  )

  writeStoredTokens(pair)
  return pair
}

export async function refreshAppTokens() {
  const stored = readStoredTokens()
  if (!stored || !isApiConfigured()) return null

  try {
    const pair = await requestToken('/api/auth/refresh', {
      refreshToken: stored.refreshToken
    })
    writeStoredTokens(pair)
    return pair
  } catch {
    clearStoredTokens()
    return exchangeSupabaseSession()
  }
}

export async function getValidAppToken() {
  if (!isApiConfigured()) return null

  const stored = readStoredTokens()
  if (stored?.accessToken && !tokenExpiresSoon(stored.accessToken)) {
    return stored.accessToken
  }

  if (exchangeInFlight) return exchangeInFlight

  exchangeInFlight = (async () => {
    const pair = stored?.refreshToken
      ? await refreshAppTokens()
      : await exchangeSupabaseSession()

    return pair?.accessToken || null
  })().finally(() => {
    exchangeInFlight = null
  })

  return exchangeInFlight
}

export async function bootstrapAppSession() {
  if (!isApiConfigured()) return null

  const supabaseToken = await getSupabaseAccessToken()
  if (!supabaseToken) {
    clearStoredTokens()
    return null
  }

  const stored = readStoredTokens()
  if (stored?.accessToken && !tokenExpiresSoon(stored.accessToken)) {
    return stored
  }

  if (stored?.refreshToken) {
    const refreshed = await refreshAppTokens()
    if (refreshed?.accessToken) return refreshed
  }

  return exchangeSupabaseSession(supabaseToken)
}

export async function clearAppSession() {
  const stored = readStoredTokens()
  clearStoredTokens()

  if (stored?.refreshToken && isApiConfigured()) {
    try {
      await fetch(`${apiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored.refreshToken })
      })
    } catch {
      // Stateless logout: dropping the tokens is sufficient.
    }
  }
}

/**
 * Keep the app token pair in step with the Supabase session. Called once from
 * main.jsx. No-ops when VITE_API_URL is not configured so the existing
 * Supabase-only deployment keeps working.
 */
export function startSessionBridge() {
  if (bridgeStarted || !isApiConfigured() || typeof window === 'undefined') {
    return () => {}
  }

  bridgeStarted = true
  bootstrapAppSession().catch(() => {})

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearStoredTokens()
      return
    }

    if (
      (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
      session?.access_token
    ) {
      exchangeSupabaseSession(session.access_token).catch(() => {})
    }
  })

  return () => {
    bridgeStarted = false
    data?.subscription?.unsubscribe?.()
  }
}

export function readAppTokenMetadata() {
  const stored = readStoredTokens()
  if (!stored?.accessToken) return null

  try {
    const payload = JSON.parse(atob(stored.accessToken.split('.')[1]))
    return {
      userId: payload.sub,
      role: payload.role,
      workspaceId: payload.workspace_id,
      expiresAt: payload.exp ? payload.exp * 1000 : null
    }
  } catch {
    return null
  }
}
