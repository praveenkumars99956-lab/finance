// ============================================================================
// Role-Based Access Control — email-bound, server-verifiable
// ----------------------------------------------------------------------------
// Roles are ALWAYS resolved from verifiable identity, never from SPA state:
//   1. The server-side role (public.current_user_role(), when the migration is
//      applied) is authoritative.
//   2. An explicit email binding (VITE_ADMIN_EMAILS / VITE_AGENT_EMAILS /
//      VITE_ADMIN_EMAIL_DOMAINS) overrides a stale profile role.
//   3. Otherwise the profile.role from Postgres is used.
//
// Every route is mapped to exactly one role family so an admin login cannot
// enter the agent workspace and an agent login cannot enter the admin console.
// ============================================================================

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  AGENT: 'agent'
})

const PUBLIC_PATHS = Object.freeze([
  '/',
  '/admin/create',
  '/forgot-password',
  '/reset-password'
])

export const ROLE_HOME = Object.freeze({
  admin: '/admin',
  agent: '/agent'
})

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function readEnv() {
  try {
    return import.meta.env || {}
  } catch {
    return {}
  }
}

const env = readEnv()

const runtimeConfig = {
  adminEmails: parseList(env.VITE_ADMIN_EMAILS),
  adminEmailDomains: parseList(env.VITE_ADMIN_EMAIL_DOMAINS),
  agentEmails: parseList(env.VITE_AGENT_EMAILS),
  strictEmailBindings: String(env.VITE_RBAC_STRICT || 'false').toLowerCase() === 'true'
}

export function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase()
  return role === ROLES.ADMIN || role === ROLES.AGENT ? role : null
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function getEmailBinding(email, config = runtimeConfig) {
  const cleanEmail = normalizeEmail(email)
  if (!cleanEmail) return null

  if (config.adminEmails.includes(cleanEmail)) return ROLES.ADMIN

  const domain = cleanEmail.split('@')[1] || ''
  if (domain && config.adminEmailDomains.includes(domain)) return ROLES.ADMIN

  if (config.agentEmails.includes(cleanEmail)) return ROLES.AGENT

  return null
}

function readClaimedRole(user) {
  return normalizeRole(user?.user_metadata?.role) || normalizeRole(user?.app_metadata?.role)
}

/**
 * Resolve the effective role for an authenticated user.
 *
 * @param {object} user Supabase auth user (contains email + metadata)
 * @param {string|null} profileRole role stored in public.profiles
 * @param {string|null} serverRole role returned by public.current_user_role()
 * @param {object} config optional override (used by tests)
 * @returns {{
 *   role: string|null,
 *   email: string,
 *   source: string,
 *   profileRole: string|null,
 *   serverRole: string|null,
 *   emailBinding: string|null,
 *   conflict: boolean,
 *   reason: string|null
 * }}
 */
export function resolveAccess(user, profileRole = null, serverRole = null, config = runtimeConfig) {
  const email = normalizeEmail(user?.email)
  const normalizedProfileRole = normalizeRole(profileRole)
  const normalizedServerRole = normalizeRole(serverRole)
  const emailBinding = getEmailBinding(email, config)

  let role = normalizedServerRole || normalizedProfileRole || readClaimedRole(user) || null
  let source = normalizedServerRole
    ? 'server'
    : normalizedProfileRole
      ? 'profile'
      : role
        ? 'claim'
        : 'none'

  // The database function already consults role_bindings. Only apply the
  // build-time email binding when the server has not answered (for example
  // before the RBAC migration is deployed).
  if (!normalizedServerRole && emailBinding) {
    role = emailBinding
    source = 'email-binding'
  }

  const conflict =
    !normalizedServerRole &&
    Boolean(emailBinding && normalizedProfileRole) &&
    emailBinding !== normalizedProfileRole

  let reason = null
  if (conflict) {
    reason = `email binding (${emailBinding}) disagrees with profile role (${normalizedProfileRole})`
  } else if (config.strictEmailBindings && !emailBinding && !normalizedServerRole) {
    // Strict mode: without a server or email binding, no privileged role is
    // trusted. The account gets no app role and is signed out.
    role = null
    source = 'strict-fallback'
    reason = 'strict email bindings enabled and the account has no trusted role binding'
  }

  return {
    role,
    email,
    source,
    profileRole: normalizedProfileRole,
    serverRole: normalizedServerRole,
    emailBinding,
    conflict,
    reason
  }
}

/**
 * Route → role-family map. The loan forms are admin-only; agents are always
 * excluded from the admin console.
 */
export function canAccessPath(roleOrAccess, pathname) {
  const role = typeof roleOrAccess === 'string' ? normalizeRole(roleOrAccess) : roleOrAccess?.role
  const path = String(pathname || '/')

  if (PUBLIC_PATHS.includes(path)) return true
  if (!role) return false

  if (path === '/agent' || path.startsWith('/agent/')) {
    return role === ROLES.AGENT
  }

  // Retired client portal: never grant access, so the auth boundary redirects
  // stale links to the signed-in role's home instead of the public login page.
  if (path === '/client') return false

  if (path === '/weekly' || path === '/monthly') {
    return role === ROLES.ADMIN
  }

  // Everything else is the admin console. Agents are rejected.
  return role === ROLES.ADMIN
}

export function getDefaultPath(roleOrAccess) {
  const role = typeof roleOrAccess === 'string' ? normalizeRole(roleOrAccess) : roleOrAccess?.role
  return ROLE_HOME[role] || '/'
}

export function canAccessAdmin(roleOrAccess) {
  const role = typeof roleOrAccess === 'string' ? normalizeRole(roleOrAccess) : roleOrAccess?.role
  return role === ROLES.ADMIN
}

export function canAccessAgent(roleOrAccess) {
  const role = typeof roleOrAccess === 'string' ? normalizeRole(roleOrAccess) : roleOrAccess?.role
  return role === ROLES.AGENT
}

export const accessConfig = runtimeConfig
