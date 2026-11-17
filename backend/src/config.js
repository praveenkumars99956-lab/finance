import 'dotenv/config'

function required(name, fallback = '') {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

const nodeEnv = process.env.NODE_ENV || 'development'
const isProduction = nodeEnv === 'production'

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 4000),
  trustProxy: process.env.TRUST_PROXY || '1',
  corsOrigins: parseOrigins(
    process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080'
  ),
  supabase: {
    url: required('SUPABASE_URL', process.env.VITE_SUPABASE_URL),
    anonKey: required('SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  },
  jwt: {
    accessSecret: required(
      'JWT_ACCESS_SECRET',
      isProduction ? '' : 'dev-access-secret-change-me-32-characters'
    ),
    refreshSecret: required(
      'JWT_REFRESH_SECRET',
      isProduction ? '' : 'dev-refresh-secret-change-me-32-characters'
    ),
    issuer: process.env.JWT_ISSUER || 'finance-suite',
    audience: process.env.JWT_AUDIENCE || 'finance-suite-web',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d'
  },
  sync: {
    maxBatch: Number(process.env.SYNC_MAX_BATCH || 100),
    idempotencyTtlMs: 24 * 60 * 60 * 1000
  }
}

export function assertProductionSecrets() {
  if (!isProduction) return

  const weak = ['change-me', 'replace-with', 'dev-access', 'dev-refresh']
  for (const [name, secret] of [
    ['JWT_ACCESS_SECRET', config.jwt.accessSecret],
    ['JWT_REFRESH_SECRET', config.jwt.refreshSecret]
  ]) {
    if (secret.length < 32 || weak.some((fragment) => secret.includes(fragment))) {
      throw new Error(`${name} must be a unique 32+ character secret in production`)
    }
  }
}
