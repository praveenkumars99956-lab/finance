import { notify } from '../../utils/notify'
import { formatMoney as formatMoneyValue } from '../../utils/money'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance, getAssignedFinanceTypes } from '../../services/agentAssignments'

function AgentDashboard() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [assignedTypes, setAssignedTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [todayTasks, setTodayTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksLastRefreshed, setTasksLastRefreshed] = useState(null)
  const requestVersion = useRef(0)
  const [loadingStep, setLoadingStep] = useState('checkingLogin')
  const stepRef = useRef('checkingLogin')
  const controllerRef = useRef(null)

  useEffect(() => {
    loadAgent()
    return () => {
      requestVersion.current += 1
      controllerRef.current?.abort()
    }
  }, [])

  // =========================================
  // LOAD LOGGED-IN AGENT
  // =========================================

  async function loadAgent() {
    const version = ++requestVersion.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setAgent(null)
    setAssignedTypes([])
    setLastRefreshed(null)
    setErrorMessage('')
    const setStep = (message) => {
      if (version !== requestVersion.current) return
      stepRef.current = message
      setLoadingStep(message)
    }
    setStep('checkingLogin')

    // End the loading state even if the authentication client never resolves.
    const timeoutId = setTimeout(() => {
      if (version !== requestVersion.current) return
      requestVersion.current += 1
      controller.abort()
      setErrorMessage(t('agentLoadTimeout', {
        step: t(stepRef.current).toLowerCase()
      }))
      setLoading(false)
    }, 15000)

    try {
      const { data, error: userError } = await supabase.auth.getUser()
      if (version !== requestVersion.current) return
      if (userError) throw new Error(t('agentLoginVerificationFailed', { message: userError.message }))
      if (!data?.user) throw new Error(t('agentLoginSessionEnded'))

      setStep('checkingProfileAndRole')
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.user.id)
        .abortSignal(controller.signal)
        .maybeSingle()
      if (version !== requestVersion.current) return
      if (profileError) throw new Error(t('agentUnableReadProfile', { message: profileError.message }))
      if (!profile) throw new Error(t('agentProfileNotAccessible'))
      const role = String(profile.role || '').trim().toLowerCase()
      if (role !== 'agent') {
        const roleLabel = ['admin', 'agent', 'client'].includes(role)
          ? t(role)
          : role || t('notAssigned')
        throw new Error(t('agentWrongRole', { role: roleLabel }))
      }

      setStep('loadingAgentAccount')
      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('id, agent_id, full_name, status, auth_user_id')
        .eq('auth_user_id', data.user.id)
        .abortSignal(controller.signal)
        .maybeSingle()
      if (version !== requestVersion.current) return
      if (agentError) throw new Error(t('agentUnableReadAccount', { message: agentError.message }))
      if (!agentData) throw new Error(t('agentNoLinkedAccount'))
      if (String(agentData.status || '').trim().toLowerCase() !== 'active') {
        throw new Error(t('agentAccountInactive'))
      }
      setAgent(agentData)

      const { data: assignments, error: assignmentError } = await supabase
        .from('category_agent_assignments')
        .select('id, category_id, collection_type, status')
        .eq('agent_id', agentData.id)
        .eq('status', 'active')
        .abortSignal(controller.signal)
      if (assignmentError) {
        console.error('AGENT ASSIGNMENTS ERROR:', assignmentError)
        setErrorMessage(t('agentAssignmentsRefreshFailed'))
        setAssignedTypes([])
      } else {
        setAssignedTypes(getAssignedFinanceTypes(assignments))
        setLastRefreshed(new Date())
      }
    } catch (error) {
      if (version !== requestVersion.current) return
      console.error('AGENT DASHBOARD ERROR:', error)
      setErrorMessage(error?.message || t('agentDashboardLoadFailed'))
    } finally {
      clearTimeout(timeoutId)
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!agent?.id) return undefined

    let active = true
    let assignmentController = null

    const refreshAssignments = async () => {
      if (assignmentController) return

      const requestController = new AbortController()
      assignmentController = requestController

      try {
        const { data: assignments, error } = await supabase
          .from('category_agent_assignments')
          .select('id, category_id, collection_type, status')
          .eq('agent_id', agent.id)
          .eq('status', 'active')
          .abortSignal(requestController.signal)

        if (!active || requestController.signal.aborted) return

        if (error) {
          console.error('AGENT ASSIGNMENTS ERROR:', error)
          setErrorMessage(t('agentAssignmentsRefreshFailed'))
          return
        }

        setAssignedTypes(getAssignedFinanceTypes(assignments))
        setLastRefreshed(new Date())
      } catch (error) {
        if (!active || requestController.signal.aborted) return
        console.error('AGENT ASSIGNMENTS ERROR:', error)
        setErrorMessage(t('agentAssignmentsRefreshFailed'))
      } finally {
        if (assignmentController === requestController) {
          assignmentController = null
        }
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshAssignments()
      }
    }

    refreshAssignments()
    const intervalId = window.setInterval(refreshWhenVisible, 15000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      active = false
      assignmentController?.abort()
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [agent?.id, t])

  const loadTodayTasks = async (currentAgent = agent) => {
    if (!currentAgent?.id) return
    setTasksLoading(true)
    try {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('category_agent_assignments')
        .select('id, category_id, collection_type, agent_id, status')
        .eq('agent_id', currentAgent.id)
        .eq('status', 'active')

      if (assignmentError) throw assignmentError

      const categoryIds = (assignmentData || []).map((item) => item.category_id).filter(Boolean)
      if (categoryIds.length === 0) {
        setTodayTasks([])
        setTasksLastRefreshed(new Date())
        return
      }

      const today = new Date().toISOString().split('T')[0]
      const { data: financeData, error: financeError } = await supabase
        .from('finance_records')
        .select(`
          id, finance_type, pending, paid, next_due_date, collection_category_id,
          customers (id, customer_id, full_name, phone),
          collection_categories (id, category_name)
        `)
        .in('collection_category_id', categoryIds)
        .eq('loan_status', 'active')
        .order('next_due_date', { ascending: true })

      if (financeError) throw financeError

      const todayRecords = filterAssignedFinance(financeData, assignmentData).filter((record) => {
        const pending = Number(record.pending || 0)
        if (pending <= 0 || !record.next_due_date) return false
        return String(record.next_due_date).split('T')[0] === today
      })

      setTodayTasks(todayRecords)
      setTasksLastRefreshed(new Date())
    } catch (error) {
      console.error('AGENT TODAY TASKS ERROR:', error)
    } finally {
      setTasksLoading(false)
    }
  }

  useEffect(() => {
    if (!agent?.id) return undefined

    let active = true
    const refresh = async () => {
      if (!active) return
      await loadTodayTasks(agent)
    }

    refresh()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const intervalId = window.setInterval(refreshWhenVisible, 30000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [agent?.id])

  const cancelLoading = () => {
    requestVersion.current += 1
    controllerRef.current?.abort()
    setErrorMessage(t('agentLoadingCancelled'))
    setLoading(false)
  }

  // =========================================
  // LOGOUT
  // =========================================

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      requestVersion.current += 1
      setAgent(null)
      navigate('/', { replace: true })
    } catch (error) {
      notify(t('agentLogoutFailed', {
        message: error?.message || t('tryAgain')
      }))
    }
  }

  // =========================================
  // OPEN LOAN TYPE
  // =========================================

  const openLoanType = (type) => {
    if (!agent || loading) return
    navigate(
      `/agent/loans/${type}`
    )
  }

  const assignedLabel = (type) =>
    t(assignedTypes.includes(type) ? 'assigned' : 'notAssigned')

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)
  const formatDate = (value) => {
    if (!value) return '-'
    const dateValue = String(value).split('T')[0]
    return new Date(`${dateValue}T00:00:00`).toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }
  const getLoanName = (type) => {
    const value = String(type || '').trim().toLowerCase()
    if (value === 'daily') return t('dailyLoan')
    if (value === 'weekly') return t('weeklyLoan')
    if (value === 'monthly') return t('monthlyLoan')
    if (value === 'interest_only' || value === 'interest-only') return t('interestOnlyLoan')
    return type || '-'
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="customer-profile-page">
        <div className="daily-manage-section">
          <p>{t('appName')}</p>
          <h1>{t('agentDashboard')}</h1>
          <p role="status">{t(loadingStep)}...</p>
          <p>{t('agentLoadingTimeoutNotice')}</p>
          <button type="button" className="back-button" onClick={cancelLoading}>{t('cancelLoading')}</button>
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="customer-profile-page">
        <div className="customer-profile-header">
          <div><p>{t('appName')}</p><h1>{t('agentDashboard')}</h1></div>
        </div>
        <div className="daily-manage-section">
          <h2>{t('agentDashboardUnavailable')}</h2>
          <p role="alert">{errorMessage || t('agentAccountNotVerified')}</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="back-button" onClick={loadAgent}>{t('tryAgain')}</button>
            <button type="button" className="back-button" onClick={handleLogout}>{t('logout')}</button>
            <button type="button" className="back-button" onClick={() => navigate('/')}>{t('goToLogin')}</button>
          </div>
        </div>
      </div>
    )
  }

  // =========================================
  // UI
  // =========================================

  const totalTaskPending = todayTasks.reduce((sum, r) => sum + Number(r.pending || 0), 0)

  return (
    <div className="customer-profile-page">
      <div className="daily-manage-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0 }}>{t('agentDashboard')}</h1>
            <p style={{ margin: '0.25rem 0 0', color: '#5b4b75' }}>
              {t('welcome')}, <strong>{agent?.full_name || t('agent')}</strong>{agent?.agent_id ? ` · ${t('agentIdLabel')}: ${agent.agent_id}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p role="status" style={{ margin: 0 }}>
              {t('assignedCollectionTypes')}: {assignedTypes.length ? assignedTypes.map((type) => t(({ daily: 'dailyLoan', weekly: 'weeklyLoan', monthly: 'monthlyLoan', interest_only: 'interestOnlyLoan' })[type] || type)).join(', ') : t('none')}
            </p>
            {lastRefreshed && (
              <small style={{ display: 'block', opacity: 0.7 }}>
                {t('lastRefreshed')}: {lastRefreshed.toLocaleTimeString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN')}
              </small>
            )}
          </div>
        </div>
        {errorMessage && <p role="alert" style={{ marginTop: '0.75rem' }}>{errorMessage}</p>}
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={loadAgent} style={{ background: '#351078', color: '#fff', border: '1px solid #351078', borderRadius: 10, padding: '0.45rem 0.8rem', fontWeight: 600, cursor: 'pointer' }}>{t('refreshAssignments', 'Refresh')}</button>
        </div>
      </div>

      <div className="daily-manage-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>{t('todaysCollectionsTitle', "Today's Collections")}</h2>
            <p style={{ margin: '0.25rem 0 0' }}>
              {t('realTimeTaskList', 'Dynamic task list for assigned collections due today.')} {tasksLoading ? `(${t('loading')}...)` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => loadTodayTasks(agent)} style={{ background: '#351078', color: '#fff', border: '1px solid #351078', borderRadius: 10, padding: '0.45rem 0.8rem', fontWeight: 600, cursor: 'pointer' }}>{t('refresh', 'Refresh')}</button>
            <button type="button" onClick={() => navigate('/agent/today')} style={{ background: '#6d28d9', color: '#fff', border: '1px solid #6d28d9', borderRadius: 10, padding: '0.45rem 0.8rem', fontWeight: 600, cursor: 'pointer' }}>{t('viewAll', 'View all')}</button>
          </div>
        </div>

        <div className="daily-manage-summary" style={{ marginBottom: '1rem' }}>
          <div><span>{t('dueToday', 'Due today')}</span><strong>{todayTasks.length}</strong></div>
          <div><span>{t('totalPending', 'Total pending')}</span><strong>₹{formatMoney(totalTaskPending)}</strong></div>
          <div><span>{t('lastUpdated', 'Last updated')}</span><strong>{tasksLastRefreshed ? tasksLastRefreshed.toLocaleTimeString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN') : '-'}</strong></div>
        </div>

        {todayTasks.length === 0 ? (
          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <strong>{t('noCollectionsDueToday', 'No collections due today')}</strong>
            <p style={{ margin: '0.25rem 0 0' }}>{t('noAssignedCustomerCollectionsDueToday', 'You have no assigned customer collections due today.')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {todayTasks.slice(0, 12).map((record) => (
              <div key={record.id} style={{ border: '1px solid #d7e0ec', borderRadius: 12, padding: '0.9rem', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong>{record.customers?.full_name || '-'}</strong>
                  <small style={{ color: '#6b7280' }}>{record.customers?.customer_id || '-'}</small>
                </div>
                <div style={{ fontSize: '0.9rem', marginTop: '0.35rem', color: '#374151' }}>
                  {getLoanName(record.finance_type)} · {record.collection_categories?.category_name || t('notAssigned')}
                </div>
                <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.9rem' }}>
                  <span>{t('dueDate', 'Due date')}: <strong>{formatDate(record.next_due_date)}</strong></span>
                  <span>{t('pending', 'Pending')}: <strong>₹{formatMoney(record.pending)}</strong></span>
                </div>
                <button type="button" style={{ width: '100%', marginTop: '0.6rem', background: '#16a34a', color: '#fff', border: '1px solid #16a34a', borderRadius: 10, padding: '0.55rem 0.8rem', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate(`/agent/collection/${record.id}`)}>
                  {t('collectPayment', 'Collect payment')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="daily-manage-section">
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <h2>{t('selectLoanType')}</h2>
          <p>{t('chooseCollectionTypeToManage')}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {[
            ['daily', t('dailyLoan'), t('viewDailyAssignedCollections'), '#4f46e5', '#eef2ff'],
            ['weekly', t('weeklyLoan'), t('viewWeeklyAssignedCollections'), '#0284c7', '#e0f2fe'],
            ['monthly', t('monthlyLoan'), t('viewMonthlyAssignedCollections'), '#7c3aed', '#f3e8ff'],
            ['interest_only', t('interestOnlyLoan'), t('viewInterestOnlyAssignedCollections'), '#0f766e', '#ccfbf1']
          ].map(([type, title, desc, accent, bg]) => (
            <button
              key={type}
              type="button"
              disabled={loading}
              onClick={() => openLoanType(type)}
              style={{
                minHeight: '130px',
                padding: '22px',
                borderRadius: '14px',
                border: `1px solid ${accent}33`,
                background: `linear-gradient(135deg, ${bg} 0%, #ffffff 100%)`,
                cursor: loading ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 8px rgba(53,16,120,0.06)'
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 999, background: accent, marginBottom: 12 }} />
              <h2 style={{ marginTop: 0, marginBottom: 6, color: '#1f2937' }}>{title}</h2>
              <p style={{ margin: '0 0 8px', color: '#374151' }}>{desc}</p>
              <small style={{ color: accent, fontWeight: 700 }}>{assignedLabel(type)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="daily-manage-section">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2>{t('collectionWorkspace')}</h2>
          <p>{t('openToolsForTodaysCollection')}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
          {[
            [t('today'), t('viewTodaysDueCollections'), '/agent/today', '📅', '#2563eb', '#eff6ff'],
            [t('pending'), t('reviewUnpaidOverdueAccounts'), '/agent/pending', '⏳', '#d97706', '#fffbeb'],
            [t('customers'), t('browseAssignedCustomers'), '/agent/customers', '👥', '#7c3aed', '#f5f3ff'],
            [t('history'), t('reviewCompletedCollections'), '/agent/history', '🧾', '#0891b2', '#ecfeff'],
            [t('agentSettlement'), t('reviewCollectionSettlement'), '/agent/settlement', '💰', '#16a34a', '#f0fdf4'],
            [t('agentProfile'), t('viewAgentAccount'), '/agent/profile', '👤', '#4f46e5', '#eef2ff']
          ].map(([title, description, path, icon, accent, bg]) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              style={{
                minHeight: '112px',
                padding: '18px',
                borderRadius: '12px',
                border: `1px solid ${accent}33`,
                background: `linear-gradient(135deg, ${bg} 0%, #ffffff 100%)`,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <span style={{ fontSize: '22px', display: 'inline-flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: `${accent}18` }}>{icon}</span>
              <strong style={{ display: 'block', marginTop: '8px', color: '#1f2937' }}>{title}</strong>
              <small style={{ color: '#4b5563' }}>{description}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AgentDashboard