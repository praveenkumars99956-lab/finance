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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: '18px'
        }}
      >
        🌐
      </span>

      <select
        value={currentLanguage}
        onChange={changeLanguage}
        aria-label={t('language')}
        style={{
          padding: '9px 12px',
          borderRadius: '8px',
          border: '1px solid #d7dfeb',
          background: '#ffffff',
          cursor: 'pointer',
          fontWeight: '600',
          outline: 'none'
        }}
      >
        <option value="en">
          English
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
    </div>
  )
}

export default LanguageSelector