import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function Login() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [selectedRole, setSelectedRole] = useState('admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleLogin = async (event) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setErrorMessage('')

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail) {
      setErrorMessage('enterEmail')
      return
    }

    if (!password) {
      setErrorMessage('enterPassword')
      return
    }

    setLoading(true)

    try {
      // =========================================
      // SIGN IN
      // =========================================

      const {
        data: loginData,
        error: loginError
      } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      })

      if (loginError) {
        console.error(
          'LOGIN ERROR:',
          loginError
        )

        setErrorMessage(
          loginError.message ||
          'invalidEmailOrPassword'
        )

        return
      }

      const user = loginData?.user

      if (!user?.id) {
        await supabase.auth.signOut({ scope: 'local' })

        setErrorMessage(
          'unableIdentifyUser'
        )

        return
      }

      // =========================================
      // GET USER PROFILE / ROLE
      // =========================================

      const {
        data: profile,
        error: profileError
      } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          role
        `)
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error(
          'PROFILE ERROR:',
          profileError
        )

        await supabase.auth.signOut({ scope: 'local' })

        setErrorMessage(
          'userProfileNotFound'
        )

        return
      }

      if (!profile) {
        await supabase.auth.signOut({ scope: 'local' })

        setErrorMessage(
          'userProfileNotFound'
        )

        return
      }

      // =========================================
      // NORMALIZE ROLE
      // =========================================

      const role = String(
        profile.role || ''
      )
        .trim()
        .toLowerCase()

      // The selector expresses login intent; the stored profile authorizes access.
      if (role !== selectedRole) {
        setErrorMessage('accountRoleMismatch')
        await supabase.auth.signOut({ scope: 'local' })
        return
      }

      // =========================================
      // ADMIN LOGIN
      // =========================================

      if (role === 'admin') {
        navigate(
          '/admin',
          {
            replace: true
          }
        )

        return
      }

      // =========================================
      // AGENT LOGIN
      // =========================================

      if (role === 'agent') {
        // Confirm this Auth user is linked
        // to an active Agent record.

        const {
          data: agent,
          error: agentError
        } = await supabase
          .from('agents')
          .select(`
            id,
            agent_id,
            full_name,
            status,
            auth_user_id
          `)
          .eq(
            'auth_user_id',
            user.id
          )
          .single()

        if (agentError) {
          console.error(
            'AGENT LOGIN ERROR:',
            agentError
          )

          await supabase.auth.signOut({ scope: 'local' })

          setErrorMessage(
            'agentAccountNotLinked'
          )

          return
        }

        if (!agent) {
          await supabase.auth.signOut({ scope: 'local' })

          setErrorMessage(
            'agentAccountNotFound'
          )

          return
        }

        if (
          String(agent.status || '')
            .trim()
            .toLowerCase() !== 'active'
        ) {
          await supabase.auth.signOut({ scope: 'local' })

          setErrorMessage(
            'agentAccountInactive'
          )

          return
        }

        navigate(
          '/agent',
          {
            replace: true
          }
        )

        return
      }

      // =========================================
      // CLIENT LOGIN
      // =========================================

      if (role === 'client') {
        navigate(
          '/client',
          {
            replace: true
          }
        )

        return
      }

      // =========================================
      // UNKNOWN ROLE
      // =========================================

      await supabase.auth.signOut({ scope: 'local' })

      setErrorMessage(
        'invalidFinanceRole'
      )
    } catch (error) {
      console.error(
        'LOGIN UNEXPECTED ERROR:',
        error
      )

      await supabase.auth.signOut({ scope: 'local' })

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'unableLoginTryAgain'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">

      <div className="login-card">

        <div className="login-brand">
          <span className="login-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 20V5.8c0-.45.35-.8.8-.8h12.4c.45 0 .8.35.8.8V20M3 20h18M9 9h2m2 0h2m-6 4h2m2 0h2m-6 7v-3h4v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1>
            {t('appName')}
          </h1>

          <p>
            {t('collectionManagementSystem')}
          </p>
        </div>

        <div role="group" aria-label={t('loginType')} className="login-role-switch">
          {['admin', 'agent'].map((role) => (
            <div key={role} className="login-role-option">
              <button
                type="button"
                className="login-role-button"
                disabled={loading}
                aria-pressed={selectedRole === role}
                onClick={() => { setSelectedRole(role); setErrorMessage(''); setPassword('') }}
              >
                {t(role)}
              </button>
            </div>
          ))}
        </div>
        <div className="login-meta">
          <button
            type="button"
            className="admin-create-link"
            disabled={loading}
            onClick={() => navigate('/admin/create')}
          >
            {t('adminCreate')}
          </button>
          <p className="login-context">
            {t('signInToDashboard', { role: t(selectedRole) })}
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="login-form"
        >

          <div className="form-group">
            <label htmlFor="login-email">
              {t('email')}
            </label>

            <input
              id="login-email"
              disabled={loading}
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder={t('enterEmailPlaceholder')}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <div className="login-password-label">
              <label htmlFor="login-password">
                {t('password')}
              </label>
              <button
                type="button"
                className="forgot-password-link"
                disabled={loading}
                onClick={() => navigate('/forgot-password', { state: { email } })}
              >
                {t('forgotPassword')}
              </button>
            </div>

            <input
              id="login-password"
              disabled={loading}
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder={t('enterPasswordPlaceholder')}
              autoComplete="current-password"
              required
            />
          </div>

          {
            errorMessage && (
              <div
                style={{
                  marginTop: '12px',
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#fff2f2',
                  color: '#b42318'
                }}
              >
                {t(errorMessage, { defaultValue: errorMessage, role: t(selectedRole) })}
              </div>
            )
          }

          <button
            type="submit"
            disabled={loading}
            className="login-button"
          >
            {
              loading
                ? t('loggingIn')
                : t('loginAsRole', { role: t(selectedRole) })
            }
          </button>

        </form>
        <div className="client-login-prompt">
          <button type="button" disabled={loading}
            onClick={() => { setSelectedRole('client'); setErrorMessage(''); setPassword('') }}
            className="client-login-link">
            {t('clientLogin')}
          </button>
        </div>

      </div>

      <footer className="login-footer">
        <span>{t('collectionManagementSystem')}</span>
        <span className="login-footer-divider" aria-hidden="true" />
        <span>{t('financeManagementSystem')}</span>
      </footer>

    </div>
  )
}

export default Login