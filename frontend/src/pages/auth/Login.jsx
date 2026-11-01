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
        await supabase.auth.signOut()

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

        await supabase.auth.signOut()

        setErrorMessage(
          'userProfileNotFound'
        )

        return
      }

      if (!profile) {
        await supabase.auth.signOut()

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

          await supabase.auth.signOut()

          setErrorMessage(
            'agentAccountNotLinked'
          )

          return
        }

        if (!agent) {
          await supabase.auth.signOut()

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
          await supabase.auth.signOut()

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

      await supabase.auth.signOut()

      setErrorMessage(
        'invalidFinanceRole'
      )
    } catch (error) {
      console.error(
        'LOGIN UNEXPECTED ERROR:',
        error
      )

      await supabase.auth.signOut()

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
          <h1>
            {t('appName')}
          </h1>

          <p>
            {t('collectionManagementSystem')}
          </p>
        </div>

        <div role="group" aria-label={t('loginType')} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          {['admin', 'agent'].map((role) => (
            <div key={role} style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                disabled={loading}
                aria-pressed={selectedRole === role}
                onClick={() => { setSelectedRole(role); setErrorMessage(''); setPassword('') }}
                style={{
                  padding: '12px', borderRadius: '10px',
                  border: '1px solid #1767d9', fontWeight: 700,
                  background: selectedRole === role ? '#1767d9' : '#ffffff',
                  color: selectedRole === role ? '#ffffff' : '#17477b',
                  cursor: loading ? 'wait' : 'pointer'
                }}
              >
                {t(role)}
              </button>
              {role === 'admin' && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => navigate('/admin/create')}
                  style={{
                    width: 'auto',
                    display: 'block',
                    margin: '3px auto 0',
                    padding: '2px 6px',
                    border: 0,
                    borderRadius: 4,
                    background: 'transparent',
                    color: '#52657a',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: loading ? 'wait' : 'pointer'
                  }}
                >
                  {t('adminCreate')}
                </button>
              )}
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', margin: '0 0 18px', color: '#52657a' }}>
          {t('signInToDashboard', { role: t(selectedRole) })}
        </p>

        <form
          onSubmit={handleLogin}
          className="login-form"
        >

          <div className="form-group">
            <label>
              {t('email')}
            </label>

            <input
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
            <label>
              {t('password')}
            </label>

            <input
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
        <button type="button" disabled={loading}
          onClick={() => { setSelectedRole('client'); setErrorMessage(''); setPassword('') }}
          style={{ display: 'block', margin: '16px auto 0', border: 0, background: 'transparent', color: '#52657a', cursor: 'pointer', textDecoration: 'underline' }}>
          {t('clientLogin')}
        </button>

      </div>

    </div>
  )
}

export default Login