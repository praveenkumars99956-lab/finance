import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function AuditLogs() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLogs = async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('security_audit_logs')
      .select('id, actor_role, action, entity_type, entity_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (queryError) setError(queryError.message)
    else setLogs(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [])

  return (
    <div className="customer-profile-page">
      <div className="customer-profile-header">
        <div>
          <p>{t('appName')}</p>
          <h1>{t('securityAuditLogs')}</h1>
          <span>{t('auditLogAdminOnlyDescription')}</span>
        </div>
        <button className="back-button" onClick={() => navigate('/admin')}>← {t('back')}</button>
      </div>
      <div className="daily-manage-section">
        <button className="back-button" onClick={loadLogs} disabled={loading}>{t('refresh')}</button>
        {error && <p role="alert">{error}</p>}
        {loading ? <p>{t('loadingAuditLogs')}</p> : logs.length === 0 ? <p>{t('noAuditActivityRecorded')}</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>{t('auditTime')}</th><th>{t('auditRole')}</th><th>{t('auditAction')}</th><th>{t('auditEntity')}</th><th>{t('auditDetails')}</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN')}</td>
                    <td>{['admin', 'agent', 'client'].includes(String(log.actor_role).toLowerCase()) ? t(String(log.actor_role).toLowerCase()) : log.actor_role || '—'}</td>
                    <td>{log.action}</td>
                    <td>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                    <td>{JSON.stringify(log.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AuditLogs
