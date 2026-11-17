import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
  flushOutbox,
  getSyncSnapshot,
  refreshSyncState as refreshOfflineSyncState
} from '../../services/offlineSync'

export const refreshSyncState = createAsyncThunk(
  'sync/refresh',
  async () => {
    await refreshOfflineSyncState()
    return getSyncSnapshot()
  }
)

export const flushOutboxNow = createAsyncThunk(
  'sync/flush',
  async () => {
    await flushOutbox({ force: true })
    return getSyncSnapshot()
  }
)

const initialState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  outboxCount: 0,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
  processed: 0,
  failed: 0,
  status: 'idle'
}

function applySnapshot(state, snapshot) {
  if (!snapshot) return
  state.online = snapshot.online
  state.outboxCount = snapshot.outboxCount
  state.syncing = snapshot.syncing
  state.lastSyncedAt = snapshot.lastSyncedAt
  state.lastError = snapshot.lastError
  state.processed = snapshot.processed
  state.failed = snapshot.failed
}

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    applySyncSnapshot(state, action) {
      applySnapshot(state, action.payload)
    },
    setOnline(state, action) {
      state.online = Boolean(action.payload)
    }
  },
  extraReducers(builder) {
    builder
      .addCase(refreshSyncState.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(refreshSyncState.fulfilled, (state, action) => {
        state.status = 'ready'
        applySnapshot(state, action.payload)
      })
      .addCase(refreshSyncState.rejected, (state, action) => {
        state.status = 'error'
        state.lastError = action.error?.message || 'Unable to read the outbox.'
      })
      .addCase(flushOutboxNow.pending, (state) => {
        state.syncing = true
        state.lastError = null
      })
      .addCase(flushOutboxNow.fulfilled, (state, action) => {
        applySnapshot(state, action.payload)
      })
      .addCase(flushOutboxNow.rejected, (state, action) => {
        state.syncing = false
        state.lastError = action.error?.message || 'Sync failed.'
      })
  }
})

export const { applySyncSnapshot, setOnline } = syncSlice.actions

export const selectSync = (state) => state.sync
export const selectOutboxCount = (state) => state.sync.outboxCount

export default syncSlice.reducer
