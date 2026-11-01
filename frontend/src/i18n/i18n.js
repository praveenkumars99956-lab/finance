import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import ta from './locales/ta.json'
import hi from './locales/hi.json'
import ml from './locales/ml.json'

const supportedLanguages = ['en', 'ta', 'hi', 'ml']

const getSavedLanguage = () => {
  try {
    const savedLanguage =
      localStorage.getItem('finance-language')

    return supportedLanguages.includes(savedLanguage)
      ? savedLanguage
      : 'en'
  } catch {
    return 'en'
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: en
      },

      ta: {
        translation: ta
      },

      hi: {
        translation: hi
      },

      ml: {
        translation: ml
      }
    },

    lng: getSavedLanguage(),

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

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.resolvedLanguage || i18n.language
}

export default i18n