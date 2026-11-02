import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function ForgotPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (loading) return

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setErrorMessage(t('enterEmail'))
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const redirectTo = new URL('/reset-password', window.location.origin).toString()
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo
      })

      if (error) throw error
      setEmailSent(true)
    } catch (error) {
      console.error('PASSWORD RESET REQUEST ERROR:', error)
      setErrorMessage(error?.message || t('passwordResetRequestFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card auth-flow-card">
        <div className="login-brand">
          <span className="login-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 7.5 12 13l8-5.5M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1>{emailSent ? t('checkYourEmail') : t('forgotPassword')}</h1>
          <p>{emailSent ? t('passwordResetEmailSent') : t('passwordResetInstructions')}</p>
        </div>

        {emailSent ? (
          <div className="auth-flow-result" role="status">
            <p>{t('passwordResetEmailSentDetails', { email })}</p>
            <p>{t('passwordResetEmailPrivacy')}</p>
            <button type="button" className="login-button" onClick={() => navigate('/')}>
              {t('backToLogin')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="reset-request-email">{t('email')}</label>
              <input
                id="reset-request-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('enterEmailPlaceholder')}
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            {errorMessage && (
              <p className="auth-flow-error" role="alert">{errorMessage}</p>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? t('sendingResetEmail') : t('sendResetEmail')}
            </button>
            <button type="button" className="auth-flow-back" onClick={() => navigate('/')}>
              {t('backToLogin')}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default ForgotPassword
