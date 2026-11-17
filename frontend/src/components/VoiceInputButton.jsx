import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { selectUi } from '../store/slices/uiSlice'
import { useVoiceInput } from '../hooks/useVoiceInput'

/**
 * Multilingual dictation button for any text field.
 *
 * Usage:
 *   <VoiceInputButton onResult={(text) => setSearch(prev => `${prev} ${text}`)} />
 */
function VoiceInputButton({
  onResult,
  language,
  appLanguage,
  className = '',
  label,
  title,
  disabled = false,
  continuous = false,
  append = false
}) {
  const { t, i18n } = useTranslation()
  const ui = useSelector(selectUi)
  const voiceLanguage = language || ui.voiceLanguage || 'auto'
  const activeLanguage = appLanguage || i18n.resolvedLanguage || i18n.language || 'en'

  const voice = useVoiceInput({
    language: voiceLanguage,
    appLanguage: activeLanguage,
    continuous,
    onResult: (text, meta) => {
      if (!text) return
      onResult?.(append ? `${text}` : text, meta)
    }
  })

  if (!voice.supported) {
    return null
  }

  return (
    <button
      type="button"
      className={`voice-input-button ${voice.listening ? 'is-listening' : ''} ${className}`.trim()}
      onClick={voice.toggle}
      disabled={disabled}
      aria-pressed={voice.listening}
      aria-label={
        voice.listening
          ? t('stopVoiceInput', 'Stop voice input')
          : t('startVoiceInput', 'Start voice input')
      }
      title={
        title ||
        (voice.listening
          ? t('listeningIn', 'Listening in {{language}}', { language: voice.language })
          : label || t('voiceInput', 'Voice input'))
      }
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {voice.listening ? 'mic' : 'mic_none'}
      </span>
      {voice.listening && <span className="voice-input-pulse" aria-hidden="true" />}
      {voice.error && (
        <span className="sr-only" role="alert">
          {voice.error}
        </span>
      )}
    </button>
  )
}

VoiceInputButton.propTypes = {
  onResult: PropTypes.func,
  language: PropTypes.string,
  appLanguage: PropTypes.string,
  className: PropTypes.string,
  label: PropTypes.string,
  title: PropTypes.string,
  disabled: PropTypes.bool,
  continuous: PropTypes.bool,
  append: PropTypes.bool
}

export default VoiceInputButton
