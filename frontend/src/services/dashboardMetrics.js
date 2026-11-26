import { supabase } from './supabase'
import { getCurrentWorkspaceId } from './workspaces'

// Only the tables that drive the dashboard summary are watched here. Both are
// published for realtime by the collections migration; the callback is just an
// invalidation signal, so the canonical values always come from fresh queries.
const REALTIME_TABLES = ['finance_records', 'finance_payments']

const DEBOUNCE_MS = 150
const POLL_INTERVAL_MS = 30_000
const INITIAL_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

let cachedMetrics = null
const listeners = new Set()
let refreshPromise = null
let stopRealtime = null
let pollTimer = null
let focusListeners = null
let subscriptionGeneration = 0

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeMetrics(results) {
  const next = {}

  results.forEach(([key, result]) => {
    if (result?.error) {
      console.error(`Unable to load dashboard ${key}:`, result.error)
      return
    }

    next[key] = result?.count ?? 0
  })

  return next
}

/**
 * Load the counts shown on the dashboard cards and navbar. The queries mirror
 * the destination pages: pending excludes closed loans and Payments Today is
 * the exact current day, not every future-dated row.
 */
export async function loadDashboardMetrics() {
  const today = localDateString()

  const results = await Promise.all([
    supabase
      .from('finance_records')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('finance_records')
      .select('id', { count: 'exact', head: true })
      .gt('pending', 0)
      .neq('loan_status', 'closed'),
    supabase
      .from('finance_payments')
      .select('id', { count: 'exact', head: true })
      .eq('payment_date', today),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
  ])

  return normalizeMetrics([
    ['financeAccounts', results[0]],
    ['pendingAccounts', results[1]],
    ['paymentsToday', results[2]],
    ['customersCount', results[3]],
    ['agentsCount', results[4]]
  ])
}

export function getDashboardMetricsSnapshot() {
  return cachedMetrics
}

/** Refresh once even when several consumers mount at the same time. */
export function refreshDashboardMetrics() {
  if (refreshPromise) return refreshPromise

  refreshPromise = loadDashboardMetrics()
    .then((next) => {
      cachedMetrics = { ...(cachedMetrics || {}), ...next }
      listeners.forEach((listener) => listener(cachedMetrics))
      return cachedMetrics
    })
    .catch((error) => {
      console.error('Unable to refresh dashboard metrics:', error)
      return cachedMetrics
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

function startRealtime(generation) {
  getCurrentWorkspaceId()
    .then((workspaceId) => {
      if (generation !== subscriptionGeneration || !listeners.size) return

      let disposed = false
      let debounceTimer = null
      let retryTimer = null
      let retryDelay = INITIAL_RETRY_MS

      const channel = supabase.channel(
        `dashboard-metrics:${workspaceId}`
      )

      const scheduleRefresh = () => {
        if (debounceTimer) clearTimeout(debounceTimer)

        debounceTimer = setTimeout(() => {
          debounceTimer = null
          if (!disposed) refreshDashboardMetrics()
        }, DEBOUNCE_MS)
      }

      REALTIME_TABLES.forEach((table) => {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            filter: `workspace_id=eq.${workspaceId}`
          },
          () => {
            if (!disposed) scheduleRefresh()
          }
        )
      })

      function subscribe() {
        if (disposed) return

        channel.subscribe((status) => {
          if (disposed) return

          if (status === 'SUBSCRIBED') {
            retryDelay = INITIAL_RETRY_MS
            return
          }

          if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            if (!retryTimer) {
              retryTimer = setTimeout(() => {
                retryTimer = null
                subscribe()
              }, retryDelay)

              retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
            }
          }
        })
      }

      subscribe()

      stopRealtime = () => {
        disposed = true
        if (debounceTimer) clearTimeout(debounceTimer)
        if (retryTimer) clearTimeout(retryTimer)
        supabase.removeChannel(channel)
        stopRealtime = null
      }
    })
    .catch((error) => {
      console.error('Unable to watch dashboard metrics:', error)
    })
}

function startUpdates() {
  const generation = ++subscriptionGeneration
  startRealtime(generation)

  // Customers and agents are not in the realtime publication yet, so a slow
  // fallback keeps those counts current when another tab changes them.
  pollTimer = setInterval(refreshDashboardMetrics, POLL_INTERVAL_MS)

  if (typeof window !== 'undefined' && !focusListeners) {
    const onFocus = () => refreshDashboardMetrics()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshDashboardMetrics()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    focusListeners = { onFocus, onVisibilityChange }
  }
}

function stopUpdates() {
  subscriptionGeneration += 1

  if (stopRealtime) stopRealtime()
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (focusListeners && typeof window !== 'undefined') {
    window.removeEventListener('focus', focusListeners.onFocus)
    document.removeEventListener(
      'visibilitychange',
      focusListeners.onVisibilityChange
    )
    focusListeners = null
  }
}

/** Subscribe to live metric updates. Returns an unsubscribe function. */
export function subscribeDashboardMetrics(listener) {
  listeners.add(listener)

  if (cachedMetrics) listener(cachedMetrics)
  if (listeners.size === 1) startUpdates()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopUpdates()
  }
}
