import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageSelector from './LanguageSelector'

function Navbar() {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <header
      className="app-header"
      style={{
        width: '100%',
        minHeight: '64px',
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '15px',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 100
      }}
    >
      <div>
        <strong
          style={{
            fontSize: '20px',
            color: '#0b3b78',
            letterSpacing: '0.5px'
          }}
        >
          {t('appName')}
        </strong>
      </div>

      <LanguageSelector />
    </header>
  )
}

export default Navbar