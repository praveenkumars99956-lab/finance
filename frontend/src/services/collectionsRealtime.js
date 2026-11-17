import { supabase } from './supabase'

// Tables that can change what the Collections dashboard shows. Each carries
// workspace_id, so the subscription is filtered to the caller's workspace.
const REALTIME_TABLES = [
  'finance_records',
  'finance_payments',
  'collection_evidence',
  'category_agent_assignments'
]

const DEBOUNCE_MS = 150
const INITIAL_RETRY_MS = 1000
const MAX_RETRY_MS = 30000

/**
 * Subscribe to database changes that affect Collections.
 *
 * The callback is an invalidation signal only: callers refetch canonical data.
 * Events are debounced so a single payment transaction (payment row + loan
 * balance update + evidence row) triggers one refetch, not three.
 *
 * @returns {function} unsubscribe
 */
export function subscribeToCollections({
  workspaceId,
  onChange,
  onStatus
}) {
  if (!workspaceId) return () => {}

  let disposed = false
  let debounceTimer = null
  let retryTimer = null
  let retryDelay = INITIAL_RETRY_MS
  let currentStatus = 'connecting'

  function reportStatus(next) {
    if (currentStatus === next) return
    currentStatus = next
    if (typeof onStatus === 'function') onStatus(next)
  }

  function scheduleChange() {
    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (!disposed && typeof onChange === 'function') onChange()
    }, DEBOUNCE_MS)
  }

  const channel = supabase.channel(
    `collections:${workspaceId}`
  )

  for (const table of REALTIME_TABLES) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `workspace_id=eq.${workspaceId}`
      },
      () => {
        if (!disposed) scheduleChange()
      }
    )
  }

  function subscribe() {
    if (disposed) return

    channel.subscribe((channelStatus) => {
      if (disposed) return

      if (channelStatus === 'SUBSCRIBED') {
        retryDelay = INITIAL_RETRY_MS
        reportStatus('live')
        return
      }

      if (
        channelStatus === 'CHANNEL_ERROR' ||
        channelStatus === 'TIMED_OUT' ||
        channelStatus === 'CLOSED'
      ) {
        reportStatus('reconnecting')

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

  return function unsubscribe() {
    disposed = true

    if (debounceTimer) clearTimeout(debounceTimer)
    if (retryTimer) clearTimeout(retryTimer)

    supabase.removeChannel(channel)
  }
}
