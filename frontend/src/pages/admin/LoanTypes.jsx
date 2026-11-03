import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

function LoanTypes() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="loan-types-page">

      <div className="loan-types-header">
        <div>
          <h1>{t('loanManagement')}</h1>
          <p>{t('selectLoanTypeToManage')}</p>
        </div>
      </div>

      <div className="loan-type-grid">

        <button
          className="loan-type-card"
          onClick={() =>
            navigate('/daily', {
              state: { from: 'loans' }
            })
          }
        >
          <span className="loan-type-icon">☀️</span>

          <div>
            <h2>{t('dailyLoan')}</h2>
            <p>
              {t('manageDailyCollectionsPaymentsBalances')}
            </p>
          </div>
        </button>

        <button
          className="loan-type-card"
          onClick={() =>
            navigate('/weekly', {
              state: { from: 'loans' }
            })
          }
        >
          <span className="loan-type-icon">📅</span>

          <div>
            <h2>{t('weeklyLoan')}</h2>
            <p>
              {t('manageWeeklyCustomerCollectionsBalances')}
            </p>
          </div>
        </button>

        <button
          className="loan-type-card"
          onClick={() =>
            navigate('/monthly', {
              state: { from: 'loans' }
            })
          }
        >
          <span className="loan-type-icon">🗓️</span>

          <div>
            <h2>{t('monthlyLoan')}</h2>
            <p>
              {t('manageMonthlyCustomerCollectionsBalances')}
            </p>
          </div>
        </button>

        <button
          className="loan-type-card interest-only-card"
          onClick={() =>
            navigate('/interest-only', {
              state: { from: 'loans' }
            })
          }
        >
          <span className="loan-type-icon">₹</span>

          <div>
            <h2>{t('interestOnlyLoan')}</h2>

            <p>
              {t('calculateLoansPrincipalPercentageInterest')}
            </p>
          </div>
        </button>

      </div>

    </div>
  )
}

export default LoanTypes