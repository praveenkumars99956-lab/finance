import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function ClientDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="app">
      <h1>{t('clientDashboard')}</h1>

      <p>{t('selectPaymentType')}</p>

      <button
        onClick={() =>
          navigate('/weekly', {
            state: { from: 'client' }
          })
        }
      >
        {t('weekly')}
      </button>

      <button
        onClick={() =>
          navigate('/monthly', {
            state: { from: 'client' }
          })
        }
      >
        {t('monthly')}
      </button>

      <button onClick={logout}>
        {t('logout')}
      </button>
    </div>
  )
}

export default ClientDashboard