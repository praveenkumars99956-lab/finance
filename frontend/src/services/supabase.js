import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error(
    'VITE_SUPABASE_URL is missing from .env'
  )
}

if (!supabaseKey) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is missing from .env'
  )
}

// Persist the session in localStorage so a refresh, a new tab, or a request
// routed to a different application server never looks like a logout. Fall
// back to sessionStorage when storage is blocked (private mode / hardened
// browser), where the app still works for the current tab.
function resolveAuthStorage() {
  try {
    const probe = '__finance_storage_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return window.sessionStorage
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storage: resolveAuthStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
)