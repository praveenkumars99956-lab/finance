import { apiRequest } from './apiClient'
import { isApiConfigured } from './jwtSession'
import { requestBackgroundSync } from './serviceWorker'
import { supabase } from './supabase'
import {
  cacheGet,
  cacheSet,
  countOutbox,
  enqueueOutbox,
  listOutbox,
  markOutboxFailure,
  metaGet,
  metaSet,
  removeOutbox
} from './offlineDb'

// Re-exported so pages can refresh the read-through cache after an optimistic
// local write without importing the IndexedDB layer directly.
export { cacheSet } from './offlineDb'

const listeners = new Set()

let started = false
let syncing = false
let flushTimer = null
let intervalTimer = null
let snapshot = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  outboxCount: 0,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
  processed: 0,
  failed: 0
}

function emit(patch = {}) {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch {
      // A broken subscriber must not stop the sync loop.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('finance:sync-state', { detail: snapshot })
    )
  }
  return snapshot
}

export function getSyncSnapshot() {
  return { ...snapshot }
}

export function subscribeSyncState(listener) {
  listeners.add(listener)
  listener({ ...snapshot })
  return () => listeners.delete(listener)
}

export async function refreshSyncState() {
  const [outboxCount, lastSyncedAt] = await Promise.all([
    countOutbox(),
    metaGet('lastSyncedAt', null)
  ])

  return emit({ outboxCount, lastSyncedAt })
}

function toWireMutation(row) {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey || row.id,
    table: row.table,
    action: row.action,
    payload: row.payload,
    match: row.match,
    rpc: row.rpc,
    args: row.args,
    returning: row.returning
  }
}

// Mirrors the server-side allowlist in backend/src/routes/sync.js. Used only
// when the Express API is not configured, so a Supabase-only deployment still
// drains the offline outbox. RLS and workspace triggers apply as usual.
const SUPABASE_REPLAY_TABLES = new Set([
  'customers',
  'collection_categories',
  'collection_evidence',
  'finance_records',
  'finance_payments',
  'finance_principal_adjustments',
  'app_settings'
])

async function replayThroughSupabase(row) {
  if (row.rpc) {
    const { error } = await supabase.rpc(row.rpc, row.args || {})
    if (error) throw error
    return
  }

  if (!SUPABASE_REPLAY_TABLES.has(row.table)) {
    throw new Error(`Offline replay is not allowed for "${row.table}".`)
  }

  const match = row.match || {}
  let query

  if (row.action === 'insert') {
    query = supabase.from(row.table).insert(row.payload || {})
  } else if (row.action === 'update') {
    query = supabase.from(row.table).update(row.payload || {}).match(match)
  } else if (row.action === 'delete') {
    query = supabase.from(row.table).delete().match(match)
  } else if (row.action === 'upsert') {
    query = supabase.from(row.table).upsert(row.payload || {})
  } else {
    throw new Error(`Offline replay action "${row.action}" is not supported.`)
  }

  if (row.returning) query = query.select(row.returning)

  const { error } = await query
  if (error) throw error
}

/**
 * Replay the outbox through the authenticated sync API.
 *
 * When VITE_API_URL is configured the API validates the app JWT *and* forwards
 * the Supabase token, so every replayed row still passes RLS, role triggers,
 * and workspace isolation. Without the API, the same rows are replayed through
 * the Supabase client so offline entry keeps working in Supabase-only mode.
 */
export async function flushOutbox({ force = false } = {}) {
  if (syncing) return getSyncSnapshot()
  if (!force && typeof navigator !== 'undefined' && !navigator.onLine) {
    return emit({ online: false })
  }

  const useApi = isApiConfigured()

  syncing = true
  emit({ syncing: true, online: true, lastError: null })

  try {
    const rows = await listOutbox({ readyOnly: true, limit: 50 })
    if (rows.length === 0) {
      const outboxCount = await countOutbox()
      return emit({ syncing: false, outboxCount })
    }

    let results = new Map()

    if (useApi) {
      const payload = await apiRequest('/api/sync/mutations', {
        method: 'POST',
        supabaseToken: true,
        body: { mutations: rows.map(toWireMutation) }
      })

      results = new Map(
        (payload?.results || []).map((result) => [result.id, result])
      )
    }

    let succeeded = 0
    let failed = 0

    for (const row of rows) {
      let result = results.get(row.id)

      if (!useApi) {
        try {
          await replayThroughSupabase(row)
          result = { ok: true }
        } catch (error) {
          result = { ok: false, error: error?.message }
        }
      }

      if (result?.ok) {
        await removeOutbox(row.id)
        succeeded += 1
      } else {
        await markOutboxFailure(
          row.id,
          result?.error || 'The server did not confirm this change.'
        )
        failed += 1
      }
    }

    const outboxCount = await countOutbox()
    const lastSyncedAt = succeeded > 0 ? Date.now() : await metaGet('lastSyncedAt', null)

    if (succeeded > 0) {
      await metaSet('lastSyncedAt', lastSyncedAt)
    }

    emit({
      syncing: false,
      outboxCount,
      lastSyncedAt,
      processed: succeeded,
      failed,
      lastError:
        failed > 0
          ? `${failed} change${failed === 1 ? '' : 's'} could not be synced yet.`
          : null
    })

    return getSyncSnapshot()
  } catch (error) {
    const outboxCount = await countOutbox()
    emit({
      syncing: false,
      outboxCount,
      lastError: error?.message || 'Sync failed.'
    })
    throw error
  } finally {
    syncing = false
  }
}

function scheduleFlush(delay = 600) {
  if (typeof window === 'undefined') return
  if (flushTimer) window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    flushOutbox().catch(() => {})
  }, delay)
}

/**
 * Queue a write for background replay. When the browser is online the queue is
 * drained immediately; offline it stays durable in IndexedDB.
 */
export async function enqueueMutation(mutation) {
  const row = await enqueueOutbox(mutation)
  const outboxCount = await countOutbox()
  emit({
    outboxCount,
    lastError: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine
  })

  if (typeof navigator === 'undefined' || navigator.onLine) {
    scheduleFlush()
  } else {
    requestBackgroundSync()
  }

  return row
}

/**
 * Read-through cache helper for Supabase queries.
 *
 * `loader` must resolve to `{ data, error }`, matching the Supabase client.
 * A successful online read refreshes the cache. An offline or failed read
 * falls back to the newest cached copy.
 */
export async function cacheQuery(key, loader, { ttlMs = 5 * 60 * 1000 } = {}) {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine

  if (online) {
    try {
      const result = await loader()
      if (!result?.error) {
        await cacheSet(key, result?.data ?? null, ttlMs)
        return { ...result, fromCache: false }
      }

      const cached = await cacheGet(key)
      if (cached) {
        return { data: cached.value, error: null, fromCache: true }
      }
      return { ...result, fromCache: false }
    } catch (error) {
      const cached = await cacheGet(key)
      if (cached) {
        return { data: cached.value, error: null, fromCache: true }
      }
      return { data: null, error, fromCache: false }
    }
  }

  const cached = await cacheGet(key)
  if (cached) {
    return { data: cached.value, error: null, fromCache: true }
  }

  return {
    data: null,
    error: new Error('You are offline and this data has not been cached yet.'),
    fromCache: true
  }
}

/**
 * Start background synchronisation. Safe to call more than once.
 */
export function startBackgroundSync() {
  if (started || typeof window === 'undefined') {
    return () => {}
  }

  started = true

  const handleOnline = () => {
    emit({ online: true, lastError: null })
    refreshSyncState()
      .then(() => flushOutbox())
      .catch(() => {})
  }

  const handleOffline = () => emit({ online: false })

  const handleVisible = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      flushOutbox().catch(() => {})
    }
  }

  const handleServiceWorkerMessage = (event) => {
    if (event?.data?.type === 'FINANCE_FLUSH_OUTBOX') {
      flushOutbox({ force: true }).catch(() => {})
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('focus', handleVisible)
  document.addEventListener('visibilitychange', handleVisible)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
  }

  intervalTimer = window.setInterval(() => {
    if (navigator.onLine) {
      refreshSyncState()
        .then((state) => {
          if (state.outboxCount > 0) return flushOutbox()
          return null
        })
        .catch(() => {})
    }
  }, 60 * 1000)

  refreshSyncState().catch(() => {})
  scheduleFlush(1500)

  return () => {
    started = false
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('focus', handleVisible)
    document.removeEventListener('visibilitychange', handleVisible)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
    }
    if (intervalTimer) window.clearInterval(intervalTimer)
    if (flushTimer) window.clearTimeout(flushTimer)
    intervalTimer = null
    flushTimer = null
  }
}
