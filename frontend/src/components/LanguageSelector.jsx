import { useTranslation } from 'react-i18next'

function LanguageSelector() {
  const { i18n, t } = useTranslation()

  const currentLanguage =
    i18n.resolvedLanguage ||
    i18n.language ||
    'en'

  const changeLanguage = async (event) => {
    const language =
      event.target.value

    await i18n.changeLanguage(language)

  }

  return (
    <label className="language-selector">
      <span aria-hidden="true">🌐</span>
      <select
        value={currentLanguage}
        onChange={changeLanguage}
        aria-label={t('language')}
      >
        <option value="en">
          English (US)
        </option>

        <option value="ta">
          தமிழ்
        </option>

        <option value="hi">
          हिन्दी
        </option>

        <option value="ml">
          മലയാളം
        </option>
      </select>
    </label>
  )
}

export default LanguageSelector