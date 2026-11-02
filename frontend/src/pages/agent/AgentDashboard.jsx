import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getAssignedFinanceTypes } from '../../services/agentAssignments'

function AgentDashboard() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [assignedTypes, setAssignedTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)
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

  const loadAgent = async () => {
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
        setErrorMessage('')
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
      alert(t('agentLogoutFailed', {
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

  return (
    <div className="customer-profile-page">

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>
          <p>
            {t('appName')}
          </p>

          <h1>
            {t('agentDashboard')}
          </h1>

          <span>
            {t('collectionManagement')}
          </span>
        </div>

        <button
          className="back-button"
          onClick={handleLogout}
        >
          {t('logout')}
        </button>

      </div>

      {/* WELCOME */}

      <div
        className="daily-manage-section"
        style={{
          textAlign: 'center'
        }}
      >

        <p
          style={{
            marginBottom: '5px'
          }}
        >
          {t('welcome')}
        </p>

        <h2
          style={{
            marginTop: '0',
            marginBottom: '5px'
          }}
        >
          {agent?.full_name || t('agent')}
        </h2>

        <p
          style={{
            marginTop: '0'
          }}
        >
          {t('agentIdLabel')}:{' '}
          <strong>
            {agent?.agent_id || '-'}
          </strong>
        </p>

      </div>

      {/* SELECT LOAN TYPE */}

      <div className="daily-manage-section">

        <div
          style={{
            textAlign: 'center',
            marginBottom: '25px'
          }}
        >
          <h2>
            {t('selectLoanType')}
          </h2>

          <p>
            {t('chooseCollectionTypeToManage')}
          </p>
          <p role="status">
            {t('assignedCollectionTypes')}: {assignedTypes.length ? assignedTypes.map((type) => t(({ daily: 'dailyLoan', weekly: 'weeklyLoan', monthly: 'monthlyLoan', interest_only: 'interestOnlyLoan' })[type] || type)).join(', ') : t('none')}
          </p>
          {errorMessage && <p role="alert">{errorMessage}</p>}
          <button type="button" className="back-button" onClick={loadAgent}>
            {t('refreshAssignments')}
          </button>
          {lastRefreshed && (
            <small style={{ display: 'block', marginTop: '8px', opacity: 0.7 }}>
              {t('lastRefreshed')}: {lastRefreshed.toLocaleTimeString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN')}
            </small>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px'
          }}
        >

          {/* DAILY */}

          <button
            type="button"
          disabled={loading}
            onClick={() =>
              openLoanType('daily')
            }
            style={{
              minHeight: '130px',
              padding: '22px',
              borderRadius: '14px',
              border: '1px solid #d7e0ec',
              background: '#ffffff',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >

            <h2
              style={{
                marginTop: 0
              }}
            >
              {t('dailyLoan')}
            </h2>

            <p>
              {t('viewDailyAssignedCollections')}
            </p>
            <small>{assignedLabel('daily')}</small>

          </button>

          {/* WEEKLY */}

          <button
            type="button"
          disabled={loading}
            onClick={() =>
              openLoanType('weekly')
            }
            style={{
              minHeight: '130px',
              padding: '22px',
              borderRadius: '14px',
              border: '1px solid #d7e0ec',
              background: '#ffffff',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >

            <h2
              style={{
                marginTop: 0
              }}
            >
              {t('weeklyLoan')}
            </h2>

            <p>
              {t('viewWeeklyAssignedCollections')}
            </p>
            <small>{assignedLabel('weekly')}</small>

          </button>

          {/* MONTHLY */}

          <button
            type="button"
          disabled={loading}
            onClick={() =>
              openLoanType('monthly')
            }
            style={{
              minHeight: '130px',
              padding: '22px',
              borderRadius: '14px',
              border: '1px solid #d7e0ec',
              background: '#ffffff',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >

            <h2
              style={{
                marginTop: 0
              }}
            >
              {t('monthlyLoan')}
            </h2>

            <p>
              {t('viewMonthlyAssignedCollections')}
            </p>
            <small>{assignedLabel('monthly')}</small>

          </button>

          {/* INTEREST ONLY */}

          <button
            type="button"
            onClick={() =>
              openLoanType('interest_only')
            }
            style={{
              minHeight: '130px',
              padding: '22px',
              borderRadius: '14px',
              border: '1px solid #d7e0ec',
              background: '#ffffff',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >

            <h2
              style={{
                marginTop: 0
              }}
            >
              {t('interestOnlyLoan')}
            </h2>

            <p>
              {t('viewInterestOnlyAssignedCollections')}
            </p>
            <small>{assignedLabel('interest_only')}</small>

          </button>

        </div>

      </div>

      <div className="daily-manage-section">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2>{t('collectionWorkspace')}</h2>
          <p>{t('openToolsForTodaysCollection')}</p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '14px'
          }}
        >
          {[
            [t('today'), t('viewTodaysDueCollections'), '/agent/today', '📅'],
            [t('pending'), t('reviewUnpaidOverdueAccounts'), '/agent/pending', '⏳'],
            [t('customers'), t('browseAssignedCustomers'), '/agent/customers', '👥'],
            [t('history'), t('reviewCompletedCollections'), '/agent/history', '🧾'],
            [t('agentSettlement'), t('reviewCollectionSettlement'), '/agent/settlement', '💰'],
            [t('agentProfile'), t('viewAgentAccount'), '/agent/profile', '👤']
          ].map(([title, description, path, icon]) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              style={{
                minHeight: '112px',
                padding: '18px',
                borderRadius: '12px',
                border: '1px solid #d7e0ec',
                background: '#f8fbff',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '22px' }}>{icon}</span>
              <strong style={{ display: 'block', marginTop: '8px' }}>{title}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}

export default AgentDashboard