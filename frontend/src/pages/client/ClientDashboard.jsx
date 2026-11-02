import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function ClientDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const logout = async () => {
    await supabase.auth.signOut({ scope: 'local' })
    navigate('/')
  }

  return (
    <main className="client-dashboard">
      <section className="client-welcome">
        <div className="client-welcome-copy">
          <span className="client-eyebrow">{t('appName')}</span>
          <h1>{t('clientDashboard')}</h1>
          <p>{t('selectPaymentType')}</p>
        </div>
        <span className="client-welcome-mark" aria-hidden="true">₹</span>
      </section>

      <section className="client-payment-options" aria-label={t('selectPaymentType')}>
        <button
          className="client-payment-card client-payment-card--weekly"
          onClick={() =>
            navigate('/weekly', {
              state: { from: 'client' }
            })
          }
        >
          <span className="client-payment-icon" aria-hidden="true">↗</span>
          <span className="client-payment-copy">
            <strong>{t('weekly')}</strong>
          </span>
          <span className="client-payment-arrow" aria-hidden="true">→</span>
        </button>

        <button
          className="client-payment-card client-payment-card--monthly"
          onClick={() =>
            navigate('/monthly', {
              state: { from: 'client' }
            })
          }
        >
          <span className="client-payment-icon" aria-hidden="true">▦</span>
          <span className="client-payment-copy">
            <strong>{t('monthly')}</strong>
          </span>
          <span className="client-payment-arrow" aria-hidden="true">→</span>
        </button>
      </section>

      <footer className="client-dashboard-footer">
        <span>{t('appName')}</span>
        <button type="button" className="client-logout-button" onClick={logout}>
          {t('logout')}
        </button>
      </footer>
    </main>
  )
}

export default ClientDashboard