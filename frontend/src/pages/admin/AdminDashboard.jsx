import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [dashboardMetrics, setDashboardMetrics] = useState(null)
  const [activePortalFilter, setActivePortalFilter] = useState('all')

  useEffect(() => {
    let active = true
    const today = getLocalDateString()

    const loadDashboardMetrics = async () => {
      const [financeResult, pendingResult, paymentResult, customersResult, agentsResult] = await Promise.all([
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
          .gte('payment_date', today),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('agents')
          .select('id', { count: 'exact', head: true })
      ])

      if (!active) return

      const metrics = [
        ['financeAccounts', financeResult],
        ['pendingAccounts', pendingResult],
        ['paymentsToday', paymentResult],
        ['customersCount', customersResult],
        ['agentsCount', agentsResult]
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
    <div className="admin-dashboard-page">
      {/* Page Header */}
      <div className="admin-dashboard-hero bg-gradient-to-r from-[#351078] to-[#5B2D8E] rounded-2xl text-white">
        <div className="admin-dashboard-hero-inner">
          <div className="flex flex-col gap-2 min-w-0">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold uppercase tracking-wider w-fit">
              <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
              {t('adminPanel', 'Admin Panel')}
            </span>
            <h1 className="text-2xl font-bold text-white leading-tight">
              {t('managementDashboard', 'Management & Liquidity Matrix')}
            </h1>
            <p className="text-white/70 text-sm max-w-3xl">
              {t('dashboardDescription', 'Real-time loan administration, recovery orchestration & automated settlements.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm font-medium border border-white/20 cursor-pointer"
              onClick={() => navigate('/reports')}
            >
              <span className="material-symbols-outlined text-[18px]">file_upload</span>
              {t('exportTelemetry', 'Export Telemetry')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-[#351078] hover:bg-[#EDE5FF] transition-colors text-sm font-semibold cursor-pointer"
              onClick={() => navigate('/settlements')}
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              {t('treasuryRebalance', 'Treasury Rebalance')}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="admin-dashboard-filters">
        <button
          type="button"
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer border-0 ${
            activePortalFilter === 'all'
              ? 'bg-[#351078] text-white'
              : 'bg-[#EDE5FF] text-[#351078] hover:bg-[#D9CCFF]'
          }`}
          onClick={() => setActivePortalFilter('all')}
        >
          {t('allPortals', 'All Portals')}
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-full text-sm font-medium bg-[#EDE5FF] text-[#351078] hover:bg-[#D9CCFF] transition-colors cursor-pointer border-0"
          onClick={() => navigate('/pending')}
        >
          {t('recovery', 'Recovery')}
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-full text-sm font-medium bg-[#EDE5FF] text-[#351078] hover:bg-[#D9CCFF] transition-colors cursor-pointer border-0"
          onClick={() => navigate('/categories')}
        >
          {t('tranches', 'Tranches')}
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-full text-sm font-medium bg-[#EDE5FF] text-[#351078] hover:bg-[#D9CCFF] transition-colors cursor-pointer border-0"
          onClick={() => navigate('/agents')}
        >
          {t('nodes', 'Nodes')}
        </button>
      </div>

      {/* Stats Row */}
      <div className="admin-dashboard-stats">
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow min-h-[108px]"
          onClick={() => navigate('/loans')}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('financeAccounts', 'Finance Accounts')}</span>
            <span className="text-2xl font-bold text-[#1A0A3B]">
              {dashboardMetrics?.financeAccounts !== undefined ? dashboardMetrics.financeAccounts : '—'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#EDE5FF] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#351078] text-[20px]">payments</span>
          </div>
        </div>

        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow min-h-[108px]"
          onClick={() => navigate('/pending')}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('pendingAccounts', 'Pending Accounts')}</span>
            <span className="text-2xl font-bold text-amber-600">
              {dashboardMetrics?.pendingAccounts !== undefined ? dashboardMetrics.pendingAccounts : '—'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-amber-600 text-[20px]">warning</span>
          </div>
        </div>

        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow min-h-[108px]"
          onClick={() => navigate('/payments')}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('paymentsToday', 'Payments Today')}</span>
            <span className="text-2xl font-bold text-[#1A0A3B]">
              {dashboardMetrics?.paymentsToday !== undefined ? dashboardMetrics.paymentsToday : '—'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#EDE5FF] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#351078] text-[20px]">receipt_long</span>
          </div>
        </div>

        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow min-h-[108px]"
          onClick={() => navigate('/customers')}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('totalCustomers', 'Total Customers')}</span>
            <span className="text-2xl font-bold text-[#1A0A3B]">
              {dashboardMetrics?.customersCount !== undefined ? dashboardMetrics.customersCount : '—'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#EDE5FF] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#351078] text-[20px]">group</span>
          </div>
        </div>
      </div>

      {/* Bento Grid of Navigation Cards */}
      <div className="admin-dashboard-modules">
        {/* Card 1: Finance / Loans */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/loans')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">payments</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('coreEngine', 'Core Engine')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('financeLoans', 'Finance / Loans')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('financeLoanDesc', 'Create, approve, and service Daily, Weekly, Monthly, and Prime Interest-Only loan instruments.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('activePortfolio', 'Active Portfolio')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">
                {dashboardMetrics?.financeAccounts !== undefined ? `${dashboardMetrics.financeAccounts} ${t('accounts', 'Accounts')}` : '—'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 2: Security Audit Logs */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/audit-logs')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">policy</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('securityHSM', 'Security HSM')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('securityAuditLogs', 'Security Audit Logs')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('auditLogDesc', 'Review immutable operator credentials, dual-key signing, and agent security activities.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('integrityStatus', 'Integrity Status')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">{t('sha256Verified', 'SHA-256 Verified')}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 3: Customers */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/customers')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">group</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('tier1KYC', 'Tier-1 KYC')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('customersDebtorProfiles', 'Customers & Debtor Profiles')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('customersDesc', 'Manage institutional counterparties, credit rating metrics, collateral, and KYC dossiers.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('activeCounterparties', 'Active Counterparties')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">
                {dashboardMetrics?.customersCount !== undefined ? `${dashboardMetrics.customersCount} ${t('accounts', 'Accounts')}` : '—'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 4: Recovery Agents */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/agents')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">badge</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('fieldOperations', 'Field Operations')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('recoveryAgents', 'Recovery Agents')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('agentsDesc', 'Manage field recovery personnel credentials, operational status, and compliance licenses.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('operationalForce', 'Operational Force')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">
                {dashboardMetrics?.agentsCount !== undefined ? `${dashboardMetrics.agentsCount} ${t('agentsOnline', 'Agents Online')}` : '—'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 5: Collection Categories */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/categories')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">account_tree</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('trancheMatrix', 'Tranche Matrix')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('collectionCategories', 'Collection Categories')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('categoriesDesc', 'Configure dynamic recovery tranches, delinquency groupings, and automated interest tiers.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('configuredPools', 'Configured Pools')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">{t('structuredTiers', '8 Structured Tiers')}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 6: Agent Assignment */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/assignments')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">alt_route</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('smartRouter', 'Smart Router')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('agentAssignment', 'Agent Assignment')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('assignmentDesc', 'Dynamic distribution of collection categories and high-risk debtor accounts across recovery specialists.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('queueDistribution', 'Queue Distribution')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">{t('optimal', '98.4% Optimal')}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 7: Collections & Intake */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/payments')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">receipt_long</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('realTimeInflow', 'Real-Time Inflow')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('collectionsIntake', 'Collections & Intake')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('collectionsDesc', 'Monitor incoming cash infusions, electronic wire clearances, and automated bank reconciliation events.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('todaysInflow', "Today's Inflow")}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">
                {dashboardMetrics?.paymentsToday !== undefined ? `${dashboardMetrics.paymentsToday} ${t('settled', 'Settled')}` : '—'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 8: Pending / Overdue */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/pending')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-red-600 text-[20px]">warning</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
                {t('actionMatrix', 'Action Matrix')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('pendingOverdue', 'Pending / Overdue')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('pendingDesc', 'Surveil pending deadlines and overdue repayments with automated cure notice generation.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('immediateFocus', 'Immediate Focus')}</span>
              <span className="text-sm font-bold text-red-600">
                {dashboardMetrics?.pendingAccounts !== undefined ? `${dashboardMetrics.pendingAccounts} ${t('overdue', 'Overdue')}` : '—'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 9: Reports & Telemetry */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/reports')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">monitoring</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('executiveTelemetry', 'Executive Telemetry')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('reportsTelemetry', 'Reports & Telemetry')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('reportsDesc', 'Aggregate balance sheet health, recovery efficiency curves, and compliance reporting packs.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('auditStandard', 'Audit Standard')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">{t('boardReady', 'Q3 Board Ready')}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 10: Settings & Governance */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/settings')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">tune</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('systemRules', 'System Rules')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('settingsGovernance', 'Settings & Governance')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('settingsDesc', 'Configure system-wide recovery thresholds, custom interest schedules, legal jurisdictions, and API keys.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('activePolicies', 'Active Policies')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">{t('engineActive', 'Engine v4.8 Active')}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 11: Agent Settlement */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/settlements')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-[#351078] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-white text-[20px]">fact_check</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                {t('escrowPayout', 'Escrow Payout')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('agentSettlement', 'Agent Settlement')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('settlementDesc', 'Orchestrate agent commission disbursement, recovery bonus reconciliation, and escrow remittance.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('disbursedCycle', 'Disbursed Cycle')}</span>
              <span className="text-sm font-bold text-[#1A0A3B]">{t('authorized', '$892K Authorized')}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#EDE5FF] flex items-center justify-center text-[#351078] hover:bg-[#351078] hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 12: Quantum Key Exchange */}
        <div
          className="bg-[#EDE5FF] rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/audit-logs')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[#351078] text-[20px]">lock</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white text-[#1A0A3B] text-xs font-semibold">
                {t('institutionalNode', 'Institutional Node')}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-[#1A0A3B]">{t('quantumKeyExchange', 'Quantum Key Exchange')}</h2>
              <p className="text-sm text-[#4A3870]">
                {t('quantumDesc', 'Zero-knowledge cryptographic handshake running between Zurich and New York ledger vaults.')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-purple-200">
            <div className="flex items-center gap-2 text-sm text-[#1A0A3B] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#351078] animate-pulse" />
              {t('zeroSyncLag', 'Zero Sync Lag (0.2ms)')}
            </div>
            <span className="px-3 py-1 rounded-full bg-white text-[#351078] text-xs font-semibold shadow-sm">
              {t('inspectNode', 'Inspect Node')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function getLocalDateString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default AdminDashboard
