import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'

const supportedLanguages = ['en', 'ta', 'hi', 'ml', 'te', 'kn']

const localeLoaders = {
  ta: () => import('./locales/ta.json'),
  hi: () => import('./locales/hi.json'),
  ml: () => import('./locales/ml.json'),
  te: () => import('./locales/te.json'),
  kn: () => import('./locales/kn.json')
}

const loadedLanguages = new Set(['en'])

export const getSavedLanguage = () => {
  try {
    const savedLanguage = localStorage.getItem('finance-language')
    return supportedLanguages.includes(savedLanguage) ? savedLanguage : 'en'
  } catch {
    return 'en'
  }
}

export async function ensureLanguageLoaded(language) {
  const lng = supportedLanguages.includes(language) ? language : 'en'
  if (loadedLanguages.has(lng)) return lng

  const loader = localeLoaders[lng]
  if (!loader) return 'en'

  const mod = await loader()
  const translation = mod?.default ?? mod
  i18n.addResourceBundle(lng, 'translation', translation, true, true)
  loadedLanguages.add(lng)
  return lng
}

const initialLanguage = getSavedLanguage()

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en }
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  load: 'languageOnly',
  returnNull: false,
  interpolation: {
    escapeValue: false
  }
})

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
  }
  try {
    localStorage.setItem('finance-language', language)
  } catch {
    // Language changes still work when storage is unavailable.
  }
})

export async function initI18n() {
  if (initialLanguage !== 'en') {
    await ensureLanguageLoaded(initialLanguage)
    await i18n.changeLanguage(initialLanguage)
  } else {
    await i18n.changeLanguage('en')
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.resolvedLanguage || i18n.language
  }

  return i18n
}

export default i18n