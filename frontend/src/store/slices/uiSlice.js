import { createSlice } from '@reduxjs/toolkit'

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

const initialState = {
  theme: readStorage('finance-theme', 'light'),
  language: readStorage('finance-language', 'en'),
  voiceLanguage: readStorage('finance-voice-language', 'auto'),
  sidebarOpen: false
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action) {
      state.theme = action.payload === 'dark' ? 'dark' : 'light'
    },
    setLanguage(state, action) {
      state.language = action.payload || 'en'
    },
    setVoiceLanguage(state, action) {
      state.voiceLanguage = action.payload || 'auto'
    },
    setSidebarOpen(state, action) {
      state.sidebarOpen = Boolean(action.payload)
    }
  }
})

export const { setTheme, setLanguage, setVoiceLanguage, setSidebarOpen } =
  uiSlice.actions

export const selectUi = (state) => state.ui

export default uiSlice.reducer
