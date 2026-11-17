/**
 * Small IndexedDB layer for offline-first data entry.
 *
 * Three stores:
 *   cache  — read-through copies of server rows (key -> { value, expiresAt })
 *   outbox — writes waiting to be replayed when the network returns
 *   meta   — last sync time, schema version, etc.
 *
 * When IndexedDB is unavailable (private mode, SSR, tests) the same API falls
 * back to an in-memory map so callers never need a second code path.
 */

const DB_NAME = 'finance-suite-offline'
const DB_VERSION = 1
const STORES = {
  cache: 'cache',
  outbox: 'outbox',
  meta: 'meta'
}

const memory = {
  cache: new Map(),
  outbox: new Map(),
  meta: new Map()
}

let dbPromise = null
let indexedDbUnavailable = false

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined' && !indexedDbUnavailable
}

function openDb() {
  if (!hasIndexedDb()) return Promise.resolve(null)

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result

        if (!db.objectStoreNames.contains(STORES.cache)) {
          const cache = db.createObjectStore(STORES.cache, { keyPath: 'key' })
          cache.createIndex('expiresAt', 'expiresAt')
        }

        if (!db.objectStoreNames.contains(STORES.outbox)) {
          const outbox = db.createObjectStore(STORES.outbox, { keyPath: 'id' })
          outbox.createIndex('createdAt', 'createdAt')
          outbox.createIndex('nextAttemptAt', 'nextAttemptAt')
        }

        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: 'key' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.warn('[offline] IndexedDB unavailable, using memory fallback')
        indexedDbUnavailable = true
        resolve(null)
      }
    })
  }

  return dbPromise
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function withStore(storeName, mode, operation) {
  const db = await openDb()
  if (!db) {
    return operation(null)
  }

  const transaction = db.transaction(storeName, mode)
  const store = transaction.objectStore(storeName)
  const result = await operation(store)
  await transactionDone(transaction)
  return result
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getLocalId() {
  return createId()
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export async function cacheGet(key) {
  const now = Date.now()

  const entry = await withStore(STORES.cache, 'readonly', (store) => {
    if (!store) {
      const value = memory.cache.get(key)
      return value ? { ...value } : null
    }
    return requestToPromise(store.get(key))
  })

  if (!entry) return null

  if (entry.expiresAt && entry.expiresAt <= now) {
    await cacheDelete(key)
    return null
  }

  return entry
}

export async function cacheSet(key, value, ttlMs = 5 * 60 * 1000) {
  const entry = {
    key,
    value,
    updatedAt: Date.now(),
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0
  }

  return withStore(STORES.cache, 'readwrite', (store) => {
    if (!store) {
      memory.cache.set(key, entry)
      return entry
    }
    return requestToPromise(store.put(entry)).then(() => entry)
  })
}

export async function cacheDelete(key) {
  return withStore(STORES.cache, 'readwrite', (store) => {
    if (!store) {
      memory.cache.delete(key)
      return undefined
    }
    return requestToPromise(store.delete(key))
  })
}

export async function cacheClearExpired() {
  const now = Date.now()

  return withStore(STORES.cache, 'readwrite', (store) => {
    if (!store) {
      for (const [key, entry] of memory.cache) {
        if (entry.expiresAt && entry.expiresAt <= now) memory.cache.delete(key)
      }
      return undefined
    }

    const index = store.index('expiresAt')
    const request = index.openCursor(IDBKeyRange.upperBound(now))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
    return requestToPromise(request)
  })
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

async function allOutbox() {
  const rows = await withStore(STORES.outbox, 'readonly', (store) => {
    if (!store) return [...memory.outbox.values()]
    return requestToPromise(store.getAll())
  })

  return (rows || []).sort((a, b) => a.createdAt - b.createdAt)
}

export async function enqueueOutbox(mutation) {
  const now = Date.now()
  const row = {
    id: mutation.id || createId(),
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    ...mutation
  }

  await withStore(STORES.outbox, 'readwrite', (store) => {
    if (!store) {
      memory.outbox.set(row.id, row)
      return row
    }
    return requestToPromise(store.put(row))
  })

  return row
}

export async function listOutbox({ readyOnly = true, limit = 50 } = {}) {
  const rows = await allOutbox()
  const now = Date.now()
  const ready = readyOnly
    ? rows.filter((row) => !row.nextAttemptAt || row.nextAttemptAt <= now)
    : rows
  return ready.slice(0, limit)
}

export async function countOutbox() {
  return (await allOutbox()).length
}

export async function removeOutbox(id) {
  return withStore(STORES.outbox, 'readwrite', (store) => {
    if (!store) {
      memory.outbox.delete(id)
      return undefined
    }
    return requestToPromise(store.delete(id))
  })
}

export async function markOutboxFailure(id, message) {
  const db = await openDb()
  if (!db) {
    const row = memory.outbox.get(id)
    if (!row) return
    row.attempts = (row.attempts || 0) + 1
    row.lastError = message
    row.nextAttemptAt = Date.now() + backoff(row.attempts)
    return
  }

  return withStore(STORES.outbox, 'readwrite', async (store) => {
    const row = await requestToPromise(store.get(id))
    if (!row) return
    row.attempts = (row.attempts || 0) + 1
    row.lastError = message
    row.nextAttemptAt = Date.now() + backoff(row.attempts)
    await requestToPromise(store.put(row))
  })
}

function backoff(attempts) {
  const seconds = Math.min(30 * 60, Math.pow(2, Math.max(1, attempts)) * 30)
  return seconds * 1000
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export async function metaGet(key, fallback = null) {
  const row = await withStore(STORES.meta, 'readonly', (store) => {
    if (!store) return memory.meta.get(key) || null
    return requestToPromise(store.get(key))
  })
  return row?.value ?? fallback
}

export async function metaSet(key, value) {
  return withStore(STORES.meta, 'readwrite', (store) => {
    const row = { key, value }
    if (!store) {
      memory.meta.set(key, row)
      return row
    }
    return requestToPromise(store.put(row)).then(() => row)
  })
}

export async function clearOfflineData() {
  memory.cache.clear()
  memory.outbox.clear()
  memory.meta.clear()

  const db = await openDb()
  if (!db) return

  await Promise.all(
    Object.values(STORES).map((name) =>
      withStore(name, 'readwrite', (store) => requestToPromise(store.clear()))
    )
  )
}
