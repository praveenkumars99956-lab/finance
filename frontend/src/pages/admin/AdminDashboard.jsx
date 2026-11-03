import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

const dashboardModules = [
  { to: '/loans', key: 'financeLoans', description: 'financeLoansDescription', group: 'moduleFinanceCore', icon: 'finance' },
  { to: '/audit-logs', key: 'securityAuditLogs', description: 'securityAuditLogsDescription', group: 'moduleGovernance', icon: 'audit' },
  { to: '/customers', key: 'customers', description: 'customersDescription', group: 'moduleCustomerOps', icon: 'customer' },
  { to: '/agents', key: 'agents', description: 'agentsDescription', group: 'moduleCustomerOps', icon: 'agents' },
  { to: '/categories', key: 'collectionCategories', description: 'collectionCategoriesDescription', group: 'moduleOperations', icon: 'categories' },
  { to: '/assignments', key: 'agentAssignment', description: 'agentAssignmentDescription', group: 'moduleOperations', icon: 'assignment' },
  { to: '/collections', key: 'collections', description: 'collectionsDescription', group: 'moduleOperations', icon: 'collections' },
  { to: '/pending', key: 'pendingOverdue', description: 'pendingOverdueDescription', group: 'moduleOperations', icon: 'pending' },
  { to: '/settlements', key: 'agentSettlement', description: 'agentSettlementDescription', group: 'moduleOperations', icon: 'settlement' },
  { to: '/reports', key: 'reports', description: 'reportsDescription', group: 'moduleInsights', icon: 'reports' },
  { to: '/settings', key: 'settings', description: 'settingsDescription', group: 'moduleGovernance', icon: 'settings' },
  { to: '/payments', key: 'payments', description: 'paymentsDescription', group: 'moduleOperations', icon: 'payments' }
]

const dashboardIcons = {
  finance: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h3M8 15h8M8 18h5" /></>,
  audit: <><path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="M9 12a3 3 0 1 1 5.2 2M14 12v2h2" /></>,
  customer: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M5.5 16c.7-2 2-3 3.5-3s2.8 1 3.5 3M15 9h3M15 12h3M15 15h2" /></>,
  agents: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5M15 14c2.8 0 4.5 1.5 5 4" /></>,
  categories: <><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="9.5" y="15" width="5" height="5" rx="1" /><path d="M9 6.5h6M17.5 9v2.5l-5.5 3.5M6.5 9v2.5l5.5 3.5" /></>,
  assignment: <><circle cx="12" cy="12" r="2" /><circle cx="5" cy="5" r="1.5" /><circle cx="19" cy="5" r="1.5" /><circle cx="5" cy="19" r="1.5" /><circle cx="19" cy="19" r="1.5" /><path d="m10.5 10.5-4-4M13.5 10.5l4-4M10.5 13.5l-4 4M13.5 13.5l4 4" /></>,
  collections: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M7 6V4h11v2M7 15h4" /><circle cx="17" cy="15" r="1" /></>,
  pending: <><circle cx="12" cy="13" r="7" /><path d="M12 9v4l2.5 1.5M8 3 6 5M16 3l2 2M12 2v2" /></>,
  settlement: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M8 7h8M8 10h8M8 13h8M8 16h5" /></>,
  reports: <><path d="M4 19V5M4 19h17M8 15l3-4 3 2 5-7" /><path d="m15 6 4 0 0 4M8 9h1M8 6h2" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="18" r="2" /></>,
  payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 14h4M16 14h1" /></>
}

const financeTypes = [
  { key: 'dailyFinance', icon: 'D' },
  { key: 'weeklyFinance', icon: 'W' },
  { key: 'monthlyFinance', icon: 'M' },
  { key: 'interestOnlyFinance', icon: 'I' }
]

function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [dashboardMetrics, setDashboardMetrics] = useState(null)

  useEffect(() => {
    let active = true
    const today = getLocalDateString()

    const loadDashboardMetrics = async () => {
      const [financeResult, pendingResult, paymentResult] = await Promise.all([
        supabase
          .from('finance_records')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('finance_records')
          .select('id', { count: 'exact', head: true })
          .gt('pending', 0),
        supabase
          .from('finance_payments')
          .select('id', { count: 'exact', head: true })
          .gte('payment_date', today)
      ])

      if (!active) return

      const metrics = [
        ['financeAccounts', financeResult],
        ['pendingAccounts', pendingResult],
        ['paymentsToday', paymentResult]
      ]
      const nextMetrics = {}

      metrics.forEach(([key, result]) => {
        if (result.error) {
          console.error(`Unable to load dashboard ${key}:`, result.error)
        } else {
          nextMetrics[key] = result.count ?? 0
        }
      })

      setDashboardMetrics(nextMetrics)
    }

    loadDashboardMetrics()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="finance-admin admin-dashboard">
      <section className="dashboard-command-bar" aria-labelledby="admin-dashboard-title">
        <div className="dashboard-command-copy">
          <span className="dashboard-eyebrow">
            <span className="dashboard-eyebrow-dot" aria-hidden="true">•</span>
            {t('adminDashboardEyebrow')}
          </span>
          <h1 id="admin-dashboard-title">{t('managementLiquidityTitle')}</h1>
          <p>{t('adminDashboardSubtitle')}</p>
        </div>

        <div className="dashboard-command-actions">
          <nav className="dashboard-portal-tabs" aria-label={t('adminPortals')}>
            <button type="button" className="is-selected" aria-current="page" onClick={() => navigate('/admin')}>
              {t('adminAllPortals')}
            </button>
            <button type="button" onClick={() => navigate('/pending')}>
              {t('adminRecovery')}
            </button>
            <button type="button" onClick={() => navigate('/categories')}>
              {t('adminTranches')}
            </button>
            <button type="button" onClick={() => navigate('/agents')}>
              {t('adminNodes')}
            </button>
          </nav>
          <button type="button" className="dashboard-action-secondary" onClick={() => navigate('/reports')}>
            <span aria-hidden="true">▤</span>
            {t('reports')}
          </button>
          <button type="button" className="dashboard-action-primary" onClick={() => navigate('/settlements')}>
            <span aria-hidden="true">⇄</span>
            {t('agentSettlement')}
          </button>
        </div>
      </section>

      <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
        <div className="dashboard-hero-glow" aria-hidden="true" />
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-eyebrow">
            {t('adminPanel')} <span aria-hidden="true">//</span> {t('financeLoans')}
          </span>
          <h2 id="dashboard-hero-title">{t('financeEngineTitle')}</h2>
          <p>{t('financeLoansDescription')}</p>
          <div className="dashboard-finance-types" aria-label={t('financeLoans')}>
            {financeTypes.map(({ key, icon }, index) => (
              <button
                key={key}
                type="button"
                className={index === 0 ? 'is-selected' : ''}
                onClick={() => navigate('/loans')}
              >
                <span aria-hidden="true">{icon}</span>
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        <aside className="dashboard-hero-panel" aria-label={t('adminOperationalSummary')}>
          <div className="dashboard-metrics">
            {[
              ['financeAccounts', '/loans'],
              ['pendingAccounts', '/pending'],
              ['paymentsToday', '/payments']
            ].map(([key, to]) => (
              <button
                className="dashboard-metric"
                key={key}
                type="button"
                onClick={() => navigate(to)}
                aria-label={`${t(key)}: ${dashboardMetrics?.[key] ?? '—'}`}
              >
                <span>{t(key)}</span>
                <strong>{dashboardMetrics?.[key] ?? '—'}</strong>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="dashboard-hero-cta"
            onClick={() => navigate('/loans')}
          >
            {t('manageFinance')}
            <span aria-hidden="true">→</span>
          </button>
        </aside>
      </section>

      <section className="dashboard-modules" aria-label={t('management')}>
        <div className="dashboard-module-grid">
          {dashboardModules.map(({ to, key, description, group, icon }) => (
            <button
              key={to}
              type="button"
              className="dashboard-module-card"
              onClick={() => navigate(to)}
              aria-label={`${t(key)}: ${t(description)}`}
            >
              <span className="dashboard-module-body">
                <span className="dashboard-module-top">
                  <span className="dashboard-module-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {dashboardIcons[icon]}
                    </svg>
                  </span>
                  <span className="dashboard-module-badge">{t(group)}</span>
                </span>
                <span className="dashboard-module-copy">
                  <strong>{t(key)}</strong>
                  <span>{t(description)}</span>
                </span>
              </span>
              <span className="dashboard-module-footer">
                <span>{t('openModule')}</span>
                <span className="dashboard-module-arrow" aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default AdminDashboard

function getLocalDateString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
