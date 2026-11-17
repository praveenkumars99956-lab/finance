import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'
import { isApiConfigured } from '../services/jwtSession'
import { subscribeSyncState } from '../services/offlineSync'
import {
  applySyncSnapshot,
  flushOutboxNow,
  selectSync
} from '../store/slices/syncSlice'

function formatTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value))
  } catch {
    return ''
  }
}

/**
 * Compact offline / sync indicator for the global header.
 *
 * The outbox is durable, so the badge is the single place an operator can see
 * whether a field entry has reached the server.
 */
function SyncStatus() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const sync = useSelector(selectSync)
  const configured = isApiConfigured()

  useEffect(() => subscribeSyncState((snapshot) => {
    dispatch(applySyncSnapshot(snapshot))
  }), [dispatch])

  const pending = sync.outboxCount
  const state = !sync.online
    ? 'offline'
    : sync.syncing
      ? 'syncing'
      : pending > 0
        ? 'pending'
        : 'synced'

  const label = {
    offline: t('offlinePendingChanges', 'Offline — {{count}} waiting', { count: pending }),
    syncing: t('syncingChanges', 'Syncing…'),
    pending: t('pendingChanges', '{{count}} waiting to sync', { count: pending }),
    synced: t('allChangesSynced', 'All changes synced')
  }[state]

  const title = [
    label,
    sync.lastSyncedAt
      ? t('lastSyncedAt', 'Last synced at {{time}}', { time: formatTime(sync.lastSyncedAt) })
      : '',
    sync.lastError || '',
    configured ? '' : t('syncApiNotConfigured', 'Sync API is not configured')
  ]
    .filter(Boolean)
    .join(' · ')

  const handleSync = () => {
    dispatch(flushOutboxNow())
  }

  return (
    <div className={`sync-status sync-status--${state}`} title={title} aria-live="polite">
      <span className="material-symbols-outlined sync-status-icon" aria-hidden="true">
        {state === 'offline'
          ? 'cloud_off'
          : state === 'syncing'
            ? 'cloud_sync'
            : pending > 0
              ? 'cloud_upload'
              : 'cloud_done'}
      </span>
      {pending > 0 && <span className="sync-status-count">{pending}</span>}
      {configured && (
        <button
          type="button"
          className="sync-status-action"
          onClick={handleSync}
          disabled={sync.syncing || !sync.online}
          aria-label={t('syncNow', 'Sync now')}
          title={t('syncNow', 'Sync now')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
        </button>
      )}
    </div>
  )
}

export default SyncStatus
