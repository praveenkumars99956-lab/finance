import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageSelector from './LanguageSelector'

function Navbar() {
  const location = useLocation()
  const { t } = useTranslation()
  const isAuthPage = ['/', '/admin/create', '/forgot-password', '/reset-password'].includes(location.pathname)

  return (
    <header className={`app-header${isAuthPage ? ' app-header--auth' : ''}`}>
      <div className="app-brand">
        <span className="app-brand-mark" aria-hidden="true">✦</span>
        <span className="app-brand-copy">
          <strong>{t('appName')}</strong>
          <span>Enterprise Suite</span>
        </span>
      </div>
      <LanguageSelector />
    </header>
  )
}

export default Navbar