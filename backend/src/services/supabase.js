import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

// Public client: used to verify a Supabase access token and read the user's
// profile under the user's own RLS policies.
export const supabaseAnon = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
)

// Service client is optional. It is never used to serve a browser request
// directly; the sync route always prefers the caller's own token so RLS and
// workspace isolation remain in force.
export const supabaseAdmin = config.supabase.serviceRoleKey
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null

/**
 * Create a Supabase client that acts as the caller.
 *
 * Every query made through this client is subject to the same RLS policies as
 * the browser. That is deliberate: the API is a transport for offline writes,
 * not a privileged bypass.
 */
export function supabaseForUser(accessToken) {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  })
}

export async function verifySupabaseToken(accessToken) {
  if (!accessToken) return { user: null, error: new Error('Missing access token') }
  const { data, error } = await supabaseAnon.auth.getUser(accessToken)
  return { user: data?.user || null, error }
}

export async function loadProfile(userId, accessToken) {
  const client = supabaseForUser(accessToken)
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  return { profile: data || null, error }
}
