import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    let active = true
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(true)
        setCheckingSession(false)
      }
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        console.error('PASSWORD RESET SESSION ERROR:', error)
        setErrorMessage(error.message || t('passwordResetSessionFailed'))
        setHasSession(false)
      } else {
        setHasSession(Boolean(data.session))
      }
      setCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [t])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (loading) return

    if (password.length < 8) {
      setErrorMessage(t('passwordMinimumLength'))
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage(t('passwordsDoNotMatch'))
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) {
        console.error('PASSWORD RESET SIGN-OUT ERROR:', signOutError)
        setErrorMessage(t('passwordUpdatedSignOutFailed'))
        setUpdated(true)
        return
      }

      setUpdated(true)
    } catch (error) {
      console.error('PASSWORD UPDATE ERROR:', error)
      setErrorMessage(error?.message || t('passwordUpdateFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="login-page">
        <section className="login-card auth-flow-card" role="status">
          <p className="auth-flow-loading">{t('checkingPasswordResetLink')}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-card auth-flow-card">
        <div className="login-brand">
          <span className="login-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10m-11 0h13v10h-13V10Zm6.5 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1>{updated ? t('passwordUpdated') : t('createNewPassword')}</h1>
          <p>
            {updated
              ? t('passwordUpdatedInstructions')
              : hasSession
                ? t('createNewPasswordInstructions')
                : t('passwordResetLinkInvalid')}
          </p>
        </div>

        {updated ? (
          <div className="auth-flow-result" role="status">
            <button type="button" className="login-button" onClick={() => navigate('/')}>
              {t('backToLogin')}
            </button>
          </div>
        ) : hasSession ? (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="new-password">{t('newPassword')}</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-new-password">{t('confirmNewPassword')}</label>
              <input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={loading}
              />
            </div>

            {errorMessage && (
              <p className="auth-flow-error" role="alert">{errorMessage}</p>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? t('updatingPassword') : t('updatePassword')}
            </button>
          </form>
        ) : (
          <div className="auth-flow-result">
            {errorMessage && <p className="auth-flow-error" role="alert">{errorMessage}</p>}
            <button type="button" className="login-button" onClick={() => navigate('/forgot-password')}>
              {t('requestNewResetLink')}
            </button>
            <button type="button" className="auth-flow-back" onClick={() => navigate('/')}>
              {t('backToLogin')}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

export default ResetPassword
