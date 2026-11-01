import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function AdminCreate() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [fullName, setFullName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [created, setCreated] = useState(false)

  const handleCreate = async (event) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase.functions.invoke(
        'create-admin-workspace',
        {
          body: {
            full_name: fullName.trim(),
            workspace_name: workspaceName.trim(),
            email: email.trim().toLowerCase(),
            password
          }
        }
      )

      if (error) {
        console.error('ADMIN WORKSPACE FUNCTION ERROR:', error)

        if (error.name === 'FunctionsFetchError') {
          setErrorMessage(t('adminWorkspaceFunctionUnavailable'))
          return
        }

        const response = error.context
        if (response instanceof Response) {
          let responseBody
          try {
            responseBody = await response.clone().json()
          } catch {
            responseBody = null
          }

          if (typeof responseBody?.message === 'string') {
            setErrorMessage(responseBody.message)
            return
          }
        }

        throw error
      }

      if (!data?.success) {
        throw new Error(data?.message || t('adminWorkspaceCreateFailed'))
      }

      setCreated(true)
      setPassword('')
    } catch (error) {
      console.error('ADMIN WORKSPACE CREATE ERROR:', error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('adminWorkspaceCreateFailed')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>{t('adminCreate')}</h1>
          <p>{t('adminWorkspaceCreateDescription')}</p>
        </div>

        {created ? (
          <>
            <div
              role="status"
              style={{
                marginBottom: 18,
                padding: '12px 14px',
                borderRadius: 8,
                background: '#ecfdf3',
                color: '#067647'
              }}
            >
              {t('adminWorkspaceCreated')}
            </div>
            <button
              type="button"
              className="login-button"
              onClick={() => navigate('/')}
            >
              {t('backToLogin')}
            </button>
          </>
        ) : (
          <>
            <form onSubmit={handleCreate} className="login-form">
              <div className="form-group">
                <label htmlFor="admin-full-name">{t('fullName')}</label>
                <input
                  id="admin-full-name"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="admin-workspace-name">
                  {t('workspaceName')}
                </label>
                <input
                  id="admin-workspace-name"
                  type="text"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="admin-email">{t('email')}</label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="admin-password">{t('password')}</label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fff2f2',
                    color: '#b42318'
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="login-button"
              >
                {loading ? t('creatingAdminWorkspace') : t('createAdminWorkspace')}
              </button>
            </form>

            <button
              type="button"
              disabled={loading}
              onClick={() => navigate('/')}
              style={{
                display: 'block',
                width: 'auto',
                margin: '16px auto 0',
                padding: '4px 8px',
                border: 0,
                background: 'transparent',
                color: '#52657a',
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'wait' : 'pointer',
                textDecoration: 'underline'
              }}
            >
              {t('backToLogin')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminCreate
