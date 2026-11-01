import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function AgentProfile() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAgentProfile()
  }, [])

  const loadAgentProfile = async () => {
    try {
      setLoading(true)

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user) {
        alert(t('pleaseLoginAgain'))
        navigate('/')
        return
      }

      const {
        data: profile,
        error: profileError
      } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Profile error:', profileError)
        alert(t('unableVerifyAgentLogin'))
        return
      }

      const role = String(profile?.role || '')
        .trim()
        .toLowerCase()

      if (role !== 'agent') {
        if (role === 'admin') {
          navigate('/admin')
        } else if (role === 'client') {
          navigate('/client')
        } else {
          await supabase.auth.signOut()
          navigate('/')
        }

        return
      }

      const {
        data: agentData,
        error: agentError
      } = await supabase
        .from('agents')
        .select(`
          id,
          agent_id,
          full_name,
          phone,
          email,
          address,
          status,
          auth_user_id,
          created_at
        `)
        .eq('auth_user_id', user.id)
        .single()

      if (agentError) {
        console.error('Agent error:', agentError)
        alert(t('unableLoadAgentProfile'))
        return
      }

      if (!agentData) {
        alert(t('agentAccountNotFound'))
        return
      }

      setAgent(agentData)
    } catch (error) {
      console.error('Agent profile error:', error)
      alert(error?.message || t('unableLoadAgentProfile'))
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const formatDate = (value) => {
    if (!value) {
      return '-'
    }

    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return new Date(value).toLocaleDateString(locale)
  }

  const pageStyle = {
    minHeight: '100vh',
    background: '#f5f7fb',
    padding: '24px'
  }

  const containerStyle = {
    maxWidth: '900px',
    margin: '0 auto'
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
    marginBottom: '24px'
  }

  const cardStyle = {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.06)',
    marginBottom: '20px'
  }

  const profileCircleStyle = {
    width: '90px',
    height: '90px',
    borderRadius: '50%',
    background: '#eef5ff',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '34px',
    fontWeight: '700',
    margin: '0 auto 15px'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '15px',
    marginTop: '25px'
  }

  const detailStyle = {
    background: '#f8fafc',
    borderRadius: '10px',
    padding: '15px'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    marginBottom: '6px',
    opacity: 0.7
  }

  const buttonStyle = {
    border: 'none',
    borderRadius: '8px',
    padding: '11px 18px',
    cursor: 'pointer',
    fontWeight: '700'
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={cardStyle}>
            <h2>{t('appName')}</h2>
            <p>{t('loadingAgentProfile')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>

        {/* HEADER */}

        <div style={headerStyle}>
          <div>
            <p style={{ margin: 0 }}>
              {t('appName')}
            </p>

            <h1 style={{ margin: '5px 0' }}>
              {t('myProfile')}
            </h1>

            <span>
              {t('agentAccountInformation')}
            </span>
          </div>

          <button
            type="button"
            style={buttonStyle}
            onClick={() => navigate('/agent')}
          >
            ← {t('agentDashboard')}
          </button>
        </div>

        {/* PROFILE */}

        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={profileCircleStyle}>
              {String(agent?.full_name || 'A')
                .charAt(0)
                .toUpperCase()}
            </div>

            <h2 style={{ marginBottom: '5px' }}>
              {agent?.full_name || 'Agent'}
            </h2>

            <p>
              {agent?.agent_id || '-'}
            </p>

            <strong>
              {['active', 'inactive', 'closed'].includes(String(agent?.status).toLowerCase())
                ? t(String(agent.status).toLowerCase())
                : String(agent?.status || '-')}
            </strong>
          </div>

          <div style={gridStyle}>
            <div style={detailStyle}>
              <span style={labelStyle}>{t('fullName')}</span>
              <strong>{agent?.full_name || '-'}</strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('agentIdLabel')}</span>
              <strong>{agent?.agent_id || '-'}</strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('role')}</span>
              <strong>{t('agent')}</strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('phone')}</span>
              <strong>{agent?.phone || '-'}</strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('email')}</span>
              <strong>{agent?.email || '-'}</strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('status')}</span>
              <strong>{['active', 'inactive', 'closed'].includes(String(agent?.status).toLowerCase())
                ? t(String(agent.status).toLowerCase())
                : agent?.status || '-'}</strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('login')}</span>
              <strong>
                {agent?.auth_user_id ? t('enabled') : t('notEnabled')}
              </strong>
            </div>

            <div style={detailStyle}>
              <span style={labelStyle}>{t('joined')}</span>
              <strong>{formatDate(agent?.created_at)}</strong>
            </div>
          </div>

          <div
            style={{
              ...detailStyle,
              marginTop: '15px'
            }}
          >
            <span style={labelStyle}>{t('address')}</span>
            <strong>
              {agent?.address || t('noAddressAdded')}
            </strong>
          </div>
        </div>

        {/* ACCOUNT ACCESS */}

        <div style={cardStyle}>
          <h3>{t('accountAccess')}</h3>

          <p>
            {t('agentSecureLoginDescription')}
          </p>

          <p>
            {t('agentIdLabel')}:{' '}
            <strong>{agent?.agent_id || '-'}</strong>
          </p>

          <p>
            {t('loginStatus')}:{' '}
            <strong>
              {agent?.auth_user_id ? t('enabled') : t('notEnabled')}
            </strong>
          </p>
        </div>

        {/* BUTTONS */}

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            style={buttonStyle}
            onClick={() => navigate('/agent')}
          >
            ← {t('dashboard')}
          </button>

          <button
            type="button"
            style={buttonStyle}
            onClick={handleLogout}
          >
            {t('logout')}
          </button>
        </div>

      </div>
    </div>
  )
}

export default AgentProfile