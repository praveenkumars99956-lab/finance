import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // =========================================
  // LOGOUT
  // =========================================

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="finance-admin">

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="finance-header">

        <div>
          <h1>{t('appName')}</h1>

          <p>
            {t('financeManagementSystem')}
          </p>
        </div>

        <button
          className="logout-button"
          onClick={logout}
        >
          {t('logout')}
        </button>

      </div>

      {/* =====================================
          WELCOME SECTION
      ====================================== */}

      <div className="admin-welcome">

        <div>
          <p>{t('adminPanel')}</p>

          <h2>{t('dashboard')}</h2>

          <span>
            {t('adminDashboardDescription')}
          </span>
        </div>

      </div>

      {/* =====================================
          MANAGEMENT MODULES
      ====================================== */}

      <h2 className="section-title">
        {t('management')}
      </h2>

      <div className="finance-module-grid">

        {/* SECURITY AUDIT LOGS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/audit-logs')
          }
        >
          <span className="finance-icon">
            🛡️
          </span>

          <div>
            <h3>
              {t('securityAuditLogs')}
            </h3>

            <p>
              {t('securityAuditLogsDescription')}
            </p>
          </div>
        </button>

        {/* CUSTOMERS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/customers')
          }
        >
          <span className="finance-icon">
            👥
          </span>

          <div>
            <h3>
              {t('customers')}
            </h3>

            <p>
              {t('customersDescription')}
            </p>
          </div>
        </button>

        {/* FINANCE / LOANS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/loans')
          }
        >
          <span className="finance-icon">
            ₹
          </span>

          <div>
            <h3>
              {t('financeLoans')}
            </h3>

            <p>
              {t('financeLoansDescription')}
            </p>
          </div>
        </button>

        {/* AGENTS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/agents')
          }
        >
          <span className="finance-icon">
            🧑‍💼
          </span>

          <div>
            <h3>
              {t('agents')}
            </h3>

            <p>
              {t('agentsDescription')}
            </p>
          </div>
        </button>

        {/* COLLECTION CATEGORIES */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/categories')
          }
        >
          <span className="finance-icon">
            🗂️
          </span>

          <div>
            <h3>
              {t('collectionCategories')}
            </h3>

            <p>
              {t('collectionCategoriesDescription')}
            </p>
          </div>
        </button>

        {/* AGENT ASSIGNMENT */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/assignments')
          }
        >
          <span className="finance-icon">
            🔗
          </span>

          <div>
            <h3>
              {t('agentAssignment')}
            </h3>

            <p>
              {t('agentAssignmentDescription')}
            </p>
          </div>
        </button>

        {/* COLLECTIONS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/collections')
          }
        >
          <span className="finance-icon">
            💰
          </span>

          <div>
            <h3>
              {t('collections')}
            </h3>

            <p>
              {t('collectionsDescription')}
            </p>
          </div>
        </button>

        {/* PENDING / OVERDUE */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/pending')
          }
        >
          <span className="finance-icon">
            ⏳
          </span>

          <div>
            <h3>
              {t('pendingOverdue')}
            </h3>

            <p>
              {t('pendingOverdueDescription')}
            </p>
          </div>
        </button>

        {/* AGENT SETTLEMENT */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/settlements')
          }
        >
          <span className="finance-icon">
            🤝
          </span>

          <div>
            <h3>
              {t('agentSettlement')}
            </h3>

            <p>
              {t('agentSettlementDescription')}
            </p>
          </div>
        </button>

        {/* REPORTS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/reports')
          }
        >
          <span className="finance-icon">
            📊
          </span>

          <div>
            <h3>
              {t('reports')}
            </h3>

            <p>
              {t('reportsDescription')}
            </p>
          </div>
        </button>

        {/* SETTINGS */}

        <button
          className="finance-module-card"
          onClick={() =>
            navigate('/settings')
          }
        >
          <span className="finance-icon">
            ⚙️
          </span>

          <div>
            <h3>
              {t('settings')}
            </h3>

            <p>
              {t('settingsDescription')}
            </p>
          </div>
        </button>

      </div>

    </div>
  )
}

export default AdminDashboard