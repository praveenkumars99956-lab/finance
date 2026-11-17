import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'
import { ensureLanguageLoaded } from '../i18n/i18n'
import { setLanguage } from '../store/slices/uiSlice'
import SelectMenu from './SelectMenu'

const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
]

function LanguageSelector() {
  const dispatch = useDispatch()
  const { i18n, t } = useTranslation()
  const currentLanguage = i18n.resolvedLanguage || i18n.language || 'en'

  const changeLanguage = async (code) => {
    if (!code || code === currentLanguage) return
    await ensureLanguageLoaded(code)
    await i18n.changeLanguage(code)
    dispatch(setLanguage(code))
    try {
      localStorage.setItem('finance-language', code)
    } catch {
      // Storage can be unavailable in private mode — the switch still applies.
    }
  }

  return (
    <SelectMenu
      variant="pill"
      value={currentLanguage}
      onChange={changeLanguage}
      ariaLabel={`${t('language', 'Language')} — ${currentLanguage}`}
      leadingIcon={
        <span className="material-symbols-outlined text-[17px]">translate</span>
      }
      options={LANGUAGES.map((lang) => ({
        value: lang.code,
        label: lang.nativeLabel
      }))}
    />
  )
}

export default LanguageSelector
