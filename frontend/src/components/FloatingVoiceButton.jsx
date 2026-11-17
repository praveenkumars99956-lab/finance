import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { selectUi } from '../store/slices/uiSlice'
import {
  isVoiceInputSupported,
  useVoiceInput,
  voiceLanguageForApp,
  voiceLanguageLabel
} from '../hooks/useVoiceInput'
import { insertDictationText, resolveDictationTarget } from '../utils/dictation'

const NOTICE_TIMEOUT = 4200
const SUCCESS_TIMEOUT = 2200

/**
 * Screen-level dictation button.
 *
 * The recognition language comes straight from the app's language settings:
 * an explicit dictation language wins, otherwise the current UI locale is
 * mapped to a single BCP-47 code. There is no auto-detect pass, so each tap
 * starts one recogniser in one language.
 *
 * Text is inserted into the field that had focus when dictation started, which
 * lets the same button serve every page without wiring it per input.
 */
function FloatingVoiceButton() {
  const { t, i18n } = useTranslation()
  const ui = useSelector(selectUi)
  const [supported] = useState(() => isVoiceInputSupported())
  const [notice, setNotice] = useState(null)

  const lastTargetRef = useRef(null)
  const targetRef = useRef(null)
  const noticeTimerRef = useRef(null)

  const appLanguage = i18n.resolvedLanguage || i18n.language || 'en'
  const language =
    ui.voiceLanguage && ui.voiceLanguage !== 'auto'
      ? ui.voiceLanguage
      : voiceLanguageForApp(appLanguage)
  const languageLabel = voiceLanguageLabel(language)

  const showNotice = useCallback((kind, text, timeout = NOTICE_TIMEOUT, raw = '') => {
    if (typeof window === 'undefined') return
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    setNotice({ kind, text, raw })
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), timeout)
  }, [])

  const voice = useVoiceInput({
    language,
    appLanguage,
    onResult: (text) => {
      const target = targetRef.current
      const inserted = insertDictationText(target, text)

      if (inserted) {
        showNotice(
          'success',
          t('floatingVoiceInserted', 'Inserted into the field'),
          SUCCESS_TIMEOUT
        )
        return
      }

      targetRef.current = null
      showNotice('info', t('floatingVoiceHint', 'Tap a text field, then speak.'))
    }
  })

  // Remember the most recent editable field. Clicking the button keeps that
  // field focused (see onMouseDown), so this is only a fallback for keyboard
  // and assistive-technology activation.
  useEffect(() => {
    const handleFocusIn = (event) => {
      const target = resolveDictationTarget(event.target)
      if (target) lastTargetRef.current = target
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [])

  useEffect(() => {
    if (!voice.error) return

    showNotice(
      'error',
      t('floatingVoiceError', 'Voice input stopped. Tap the microphone to try again.'),
      NOTICE_TIMEOUT,
      voice.error
    )
  }, [voice.error, showNotice, t])

  useEffect(() => {
    if (!voice.listening) return undefined

    const stopListening = voice.stop

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') stopListening()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [voice.listening, voice.stop])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  if (!supported) return null

  const handleClick = () => {
    if (voice.listening) {
      voice.stop()
      return
    }

    const active = resolveDictationTarget(document.activeElement)
    const target = active || lastTargetRef.current

    if (!target || target.isConnected === false) {
      showNotice('info', t('floatingVoiceHint', 'Tap a text field, then speak.'))
      return
    }

    targetRef.current = target
    setNotice(null)
    if (voice.error) voice.clearError()

    const started = voice.start()
    if (!started) {
      showNotice(
        'error',
        t('floatingVoiceError', 'Voice input stopped. Tap the microphone to try again.')
      )
    }
  }

  const status = voice.listening
    ? {
        kind: 'listening',
        icon: 'graphic_eq',
        text:
          voice.interim ||
          t('floatingVoiceListening', 'Listening in {{language}}', {
            language: languageLabel
          }),
        raw: ''
      }
    : notice

  const startLabel = t('floatingVoiceStart', 'Dictate in your language')
  const stopLabel = t('floatingVoiceStop', 'Stop dictation')

  return (
    <div
      className={`floating-voice ${voice.listening ? 'is-listening' : ''}`.trim()}
      data-language={language}
    >
      {status && (
        <div
          className={`floating-voice-toast is-${status.kind}`}
          role="status"
          aria-live="polite"
          title={status.raw || undefined}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {status.icon}
          </span>
          <span className="floating-voice-toast-text">{status.text}</span>
        </div>
      )}

      <button
        type="button"
        className="floating-voice-button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleClick}
        aria-pressed={voice.listening}
        aria-label={voice.listening ? stopLabel : startLabel}
        title={`${voice.listening ? stopLabel : startLabel} · ${languageLabel}`}
      >
        <span className="floating-voice-ring" aria-hidden="true" />
        <span className="floating-voice-ring floating-voice-ring--two" aria-hidden="true" />
        {voice.listening && <span className="floating-voice-dot" aria-hidden="true" />}
        <span className="material-symbols-outlined" aria-hidden="true">
          {voice.listening ? 'stop_circle' : 'mic'}
        </span>
      </button>
    </div>
  )
}

export default FloatingVoiceButton
