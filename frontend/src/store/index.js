import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import syncReducer from './slices/syncSlice'
import uiReducer from './slices/uiSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    sync: syncReducer,
    ui: uiReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Access payloads are plain objects, but Supabase errors occasionally
        // carry non-serialisable causes. Keep the check on actions/paths only.
        ignoredActionPaths: ['meta.arg', 'payload.error'],
        ignoredPaths: ['auth.error']
      }
    }),
  devTools: import.meta.env.DEV
})

export default store
