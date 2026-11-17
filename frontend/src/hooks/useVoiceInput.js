import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Broad language catalogue for speech recognition.
 *
 * Browsers expose different subsets through the Web Speech API. The list below
 * is intentionally wider than the UI locales so an operator can dictate in the
 * language they actually speak; unsupported locales simply report
 * `language-unavailable` instead of failing silently.
 */
export const VOICE_LANGUAGES = [
  { code: 'auto', label: 'Auto detect', nativeLabel: 'Auto detect' },
  { code: 'en-IN', label: 'English (India)', nativeLabel: 'English (India)' },
  { code: 'en-US', label: 'English (US)', nativeLabel: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)', nativeLabel: 'English (UK)' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ta-IN', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'ml-IN', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'kn-IN', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'bn-IN', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'gu-IN', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'mr-IN', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'pa-IN', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
  { code: 'ur-PK', label: 'Urdu', nativeLabel: 'اردو' },
  { code: 'ar-SA', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'fr-FR', label: 'French', nativeLabel: 'Français' },
  { code: 'de-DE', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'es-ES', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', nativeLabel: 'Português' },
  { code: 'it-IT', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'nl-NL', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'ru-RU', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'tr-TR', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'id-ID', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
  { code: 'ms-MY', label: 'Malay', nativeLabel: 'Bahasa Melayu' },
  { code: 'th-TH', label: 'Thai', nativeLabel: 'ไทย' },
  { code: 'vi-VN', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { code: 'ja-JP', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko-KR', label: 'Korean', nativeLabel: '한국어' }
]

const APP_LOCALE_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  ml: 'ml-IN',
  te: 'te-IN',
  kn: 'kn-IN'
}

/**
 * Maps an app locale to a concrete recognition locale.
 *
 * Used by dictation surfaces that should follow the app language directly
 * instead of asking the browser to auto-detect, which avoids a second
 * language-resolution step on every utterance.
 */
export function voiceLanguageForApp(appLanguage = 'en') {
  const value = String(appLanguage || 'en').trim()
  const base = value.split('-')[0].toLowerCase()

  if (/^[a-z]{2,3}-[A-Za-z0-9]{2,8}$/.test(value)) return value
  if (APP_LOCALE_MAP[base]) return APP_LOCALE_MAP[base]

  return /^[a-z]{2,3}$/.test(value) ? value : 'en-IN'
}

export function voiceLanguageLabel(code) {
  return VOICE_LANGUAGES.find((item) => item.code === code)?.nativeLabel || code
}

export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isVoiceInputSupported() {
  return Boolean(getSpeechRecognition())
}

export function resolveVoiceLanguage(preference, appLanguage = 'en') {
  if (preference && preference !== 'auto') {
    return preference
  }

  if (typeof navigator !== 'undefined') {
    const candidates = [
      ...(navigator.languages || []),
      navigator.language
    ].filter(Boolean)

    const exact = candidates.find((code) => VOICE_LANGUAGES.some((item) => item.code === code))
    if (exact) return exact

    const base = candidates[0]?.split('-')[0]
    if (base && APP_LOCALE_MAP[base]) return APP_LOCALE_MAP[base]
  }

  return APP_LOCALE_MAP[appLanguage] || 'en-IN'
}

function normaliseError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied.'
    case 'no-speech':
      return 'No speech was detected. Try again.'
    case 'audio-capture':
      return 'No microphone was found.'
    case 'network':
      return 'Speech recognition needs a network connection.'
    case 'language-not-supported':
      return 'This browser does not support the selected language.'
    case 'aborted':
      return ''
    default:
      return 'Voice input stopped.'
  }
}

/**
 * Multilingual dictation backed by the Web Speech API.
 *
 * @param {object} options
 * @param {string} options.language preferred BCP-47 code or "auto"
 * @param {string} options.appLanguage current i18n language
 * @param {(text: string, meta: object) => void} options.onResult
 * @param {boolean} options.continuous keep listening after a pause
 * @param {boolean} options.interimResults stream partial text
 */
export function useVoiceInput({
  language = 'auto',
  appLanguage = 'en',
  onResult,
  continuous = false,
  interimResults = true
} = {}) {
  const [supported] = useState(() => isVoiceInputSupported())
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const [resolvedLanguage, setResolvedLanguage] = useState(() =>
    resolveVoiceLanguage(language, appLanguage)
  )

  const recognitionRef = useRef(null)
  const onResultRef = useRef(onResult)
  const manualStopRef = useRef(false)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    setResolvedLanguage(resolveVoiceLanguage(language, appLanguage))
  }, [language, appLanguage])

  const stop = useCallback(() => {
    manualStopRef.current = true
    try {
      recognitionRef.current?.stop()
    } catch {
      // Recognition may already have ended.
    }
    setListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      setError('This browser does not support speech recognition.')
      return false
    }

    try {
      recognitionRef.current?.abort()
    } catch {
      // No active recogniser.
    }

    const recognition = new Recognition()
    recognition.lang = resolveVoiceLanguage(language, appLanguage)
    recognition.continuous = continuous
    recognition.interimResults = interimResults
    recognition.maxAlternatives = 1

    setResolvedLanguage(recognition.lang)
    setError('')
    setInterim('')
    manualStopRef.current = false

    recognition.onstart = () => setListening(true)

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript || ''
        if (result.isFinal) {
          finalText += transcript
        } else {
          interimText += transcript
        }
      }

      if (interimText) setInterim(interimText)

      if (finalText.trim()) {
        setInterim('')
        onResultRef.current?.(finalText.trim(), {
          language: recognition.lang,
          final: true
        })
      }
    }

    recognition.onerror = (event) => {
      const message = normaliseError(event.error)
      if (message) setError(message)
      setListening(false)
      setInterim('')
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
      if (!manualStopRef.current && continuous) {
        // Some browsers stop after a pause even in continuous mode. Restarting
        // here keeps a long dictation session alive.
        try {
          recognition.start()
          setListening(true)
        } catch {
          // The session is finished.
        }
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      return true
    } catch (startError) {
      setError(startError?.message || 'Voice input could not start.')
      setListening(false)
      return false
    }
  }, [appLanguage, continuous, interimResults, language])

  const toggle = useCallback(() => {
    if (listening) {
      stop()
    } else {
      start()
    }
  }, [listening, start, stop])

  useEffect(() => {
    return () => {
      manualStopRef.current = true
      try {
        recognitionRef.current?.abort()
      } catch {
        // Nothing to clean up.
      }
    }
  }, [])

  return {
    supported,
    listening,
    interim,
    error,
    language: resolvedLanguage,
    start,
    stop,
    toggle,
    clearError: () => setError('')
  }
}
