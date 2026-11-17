import { config } from '../config.js'

// Fast in-process replay protection for mobile retries. It is intentionally
// bounded: the database idempotency_keys table (when present) remains the
// cross-node source of truth for money-moving operations.
const cache = new Map()

function prune(now) {
  if (cache.size < 5000) return
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
}

export function readIdempotentResult(scope, key) {
  if (!key) return null
  const entry = cache.get(`${scope}:${key}`)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(`${scope}:${key}`)
    return null
  }
  return entry.value
}

export function writeIdempotentResult(scope, key, value) {
  if (!key) return value
  const now = Date.now()
  prune(now)
  cache.set(`${scope}:${key}`, {
    value,
    expiresAt: now + config.sync.idempotencyTtlMs
  })
  return value
}

export function clearIdempotencyCache() {
  cache.clear()
}
