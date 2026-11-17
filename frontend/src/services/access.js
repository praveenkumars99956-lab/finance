import { supabase } from './supabase'
import { resolveAccess } from './rbac'

// The RBAC migration may not be deployed yet. Once PostgREST reports that
// current_user_role() is missing, stop calling it on every navigation and use
// the profile role fallback instead.
let serverRoleRpcAvailable = true

/**
 * Load the authoritative access context for the current session.
 *
 * The SPA never trusts local state alone: the profile role is read from
 * Postgres and, when the email-bound RBAC migration is applied, the database
 * function public.current_user_role() is treated as authoritative.
 *
 * The RPC is optional so the frontend keeps working against databases that
 * have not received the migration yet (it fails closed to the profile role).
 */
export async function loadAccessContext() {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      user: null,
      profile: null,
      access: resolveAccess(null, null, null),
      error: userError || new Error('No authenticated user')
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return {
      user,
      profile: null,
      access: resolveAccess(user, null, null),
      error: profileError
    }
  }

  let serverRole = null
  if (serverRoleRpcAvailable) {
    try {
      const { data, error } = await supabase.rpc('current_user_role')
      if (!error && typeof data === 'string') {
        serverRole = data
      } else if (error && isMissingRpcError(error)) {
        serverRoleRpcAvailable = false
      }
    } catch {
      // Network hiccup — profile role remains the fallback for this request.
    }
  }

  const access = resolveAccess(user, profile?.role, serverRole)

  return {
    user,
    profile,
    access,
    error: null
  }
}

function isMissingRpcError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('does not exist')
  )
}
