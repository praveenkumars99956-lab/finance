import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'
import { selectUi, setVoiceLanguage } from '../store/slices/uiSlice'
import { VOICE_LANGUAGES, isVoiceInputSupported } from '../hooks/useVoiceInput'
import SelectMenu from './SelectMenu'

function persistVoiceLanguage(code) {
  try {
    window.localStorage.setItem('finance-voice-language', code)
  } catch {
    // The in-store value still applies for this session.
  }
}

/**
 * Chooses the dictation language independently of the UI language, so an
 * operator can read an English screen while speaking Tamil, Hindi, Arabic, etc.
 */
function VoiceLanguageSelector() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { voiceLanguage } = useSelector(selectUi)

  if (!isVoiceInputSupported()) {
    return null
  }

  const handleChange = (value) => {
    if (value === '__custom__') {
      const custom = window.prompt(
        t('enterLanguageCode', 'Enter a BCP-47 language code (for example fr-CA)'),
        voiceLanguage === 'auto' ? 'en-IN' : voiceLanguage
      )
      if (custom && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(custom.trim())) {
        const code = custom.trim()
        dispatch(setVoiceLanguage(code))
        persistVoiceLanguage(code)
      }
      return
    }

    dispatch(setVoiceLanguage(value))
    persistVoiceLanguage(value)
  }

  return (
    <div className="voice-language-select-wrap">
      <SelectMenu
        variant="pill"
        value={voiceLanguage}
        onChange={handleChange}
        ariaLabel={t('voiceInputLanguage', 'Voice input language')}
        leadingIcon={
          <span className="material-symbols-outlined">record_voice_over</span>
        }
        options={[
          ...VOICE_LANGUAGES.map((language) => ({
            value: language.code,
            label: language.nativeLabel
          })),
          { value: '__custom__', label: t('otherLanguage', 'Other language…') }
        ]}
      />
    </div>
  )
}

export default VoiceLanguageSelector
