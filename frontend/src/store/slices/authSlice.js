import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { loadAccessContext } from '../../services/access'

function serializeUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || null,
    fullName: user.user_metadata?.full_name || null
  }
}

export const loadAccess = createAsyncThunk(
  'auth/loadAccess',
  async (_, { signal }) => {
    if (signal?.aborted) throw new Error('aborted')
    const result = await loadAccessContext()

    return {
      user: serializeUser(result.user),
      profile: result.profile
        ? {
            id: result.profile.id,
            fullName: result.profile.full_name || null,
            role: result.profile.role || null
          }
        : null,
      access: result.access
        ? {
            role: result.access.role || null,
            email: result.access.email || null,
            source: result.access.source || 'none',
            profileRole: result.access.profileRole || null,
            serverRole: result.access.serverRole || null,
            emailBinding: result.access.emailBinding || null,
            conflict: Boolean(result.access.conflict),
            reason: result.access.reason || null
          }
        : null,
      error: result.error?.message || null
    }
  }
)

const initialState = {
  user: null,
  profile: null,
  access: null,
  status: 'idle',
  checking: false,
  error: null,
  lastCheckedAt: null
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    beginAccessCheck(state) {
      state.checking = true
    },
    setAccessFailure(state, action) {
      state.checking = false
      state.status = 'anonymous'
      state.error = action.payload || 'Access check failed.'
    },
    clearAuth(state) {
      state.user = null
      state.profile = null
      state.access = null
      state.status = 'anonymous'
      state.checking = false
      state.error = null
      state.lastCheckedAt = null
    }
  },
  extraReducers(builder) {
    builder
      .addCase(loadAccess.pending, (state) => {
        state.checking = true
        state.error = null
      })
      .addCase(loadAccess.fulfilled, (state, action) => {
        state.checking = false
        state.user = action.payload.user
        state.profile = action.payload.profile
        state.access = action.payload.access
        state.error = action.payload.error
        state.status = action.payload.user ? 'authenticated' : 'anonymous'
        state.lastCheckedAt = Date.now()
      })
      .addCase(loadAccess.rejected, (state, action) => {
        state.checking = false
        state.status = 'anonymous'
        state.error = action.error?.message || 'Access check failed.'
      })
  }
})

export const { beginAccessCheck, setAccessFailure, clearAuth } = authSlice.actions

export const selectAuth = (state) => state.auth
export const selectAccess = (state) => state.auth.access
export const selectAuthUser = (state) => state.auth.user
export const selectAuthChecking = (state) => state.auth.checking

export default authSlice.reducer
