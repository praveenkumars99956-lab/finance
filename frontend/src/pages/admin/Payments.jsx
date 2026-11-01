import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

function Payments() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="weekly-page">
      <button onClick={() => navigate('/admin')}>
        ← {t('back')}
      </button>

      <h1>{t('payments')}</h1>

      <div className="customer-record">
        <h3>{t('paymentManagement')}</h3>

        <p>{t('viewWeeklyOrMonthlyPayments')}</p>

        <button
          onClick={() =>
            navigate('/weekly', {
              state: { from: 'admin' }
            })
          }
        >
          {t('weeklyPayments')}
        </button>

        <button
          onClick={() =>
            navigate('/monthly', {
              state: { from: 'admin' }
            })
          }
        >
          {t('monthlyPayments')}
        </button>
      </div>
    </div>
  )
}

export default Payments