import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageSelector from './LanguageSelector'
import { supabase } from '../services/supabase'

function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [adminProfile, setAdminProfile] = useState(null)
  const [headerMetrics, setHeaderMetrics] = useState(null)
  const [isDarkTheme, setIsDarkTheme] = useState(() => window.localStorage.getItem('finance-theme') === 'dark')
  const isAuthPage = ['/', '/admin/create', '/forgot-password', '/reset-password'].includes(location.pathname)
  const isAdminPage = !isAuthPage &&
    !location.pathname.startsWith('/agent') &&
    !['/client', '/weekly', '/monthly'].includes(location.pathname)

  useEffect(() => {
    const theme = isDarkTheme ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('finance-theme', theme)
  }, [isDarkTheme])

  const logout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (error) {
      console.error('Unable to sign out:', error)
      window.alert(error.message)
      return
    }

    navigate('/')
  }

  useEffect(() => {
    if (!isAdminPage) {
      setAdminProfile(null)
      setHeaderMetrics(null)
      return undefined
    }

    let active = true

    const loadAdminHeader = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userError) {
        console.error('Unable to load admin header user:', userError)
        return
      }

      if (!userData.user) {
        setAdminProfile(null)
        return
      }

      const [profileResult, financeResult, pendingResult, paymentResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', userData.user.id)
          .maybeSingle(),
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
          .gte('payment_date', getLocalDateString())
      ])

      if (!active) return

      if (profileResult.error) {
        console.error('Unable to load admin header profile:', profileResult.error)
      } else {
        setAdminProfile({
          name: profileResult.data?.full_name || userData.user.user_metadata?.full_name || userData.user.email,
          role: profileResult.data?.role
        })
      }

      const metricResults = [
        ['financeAccounts', financeResult],
        ['pendingAccounts', pendingResult],
        ['paymentsToday', paymentResult]
      ]

      const metrics = {}
      metricResults.forEach(([key, result]) => {
        if (result.error) {
          console.error(`Unable to load admin header ${key}:`, result.error)
        } else {
          metrics[key] = result.count ?? 0
        }
      })
      setHeaderMetrics(metrics)
    }

    loadAdminHeader()

    return () => {
      active = false
    }
  }, [isAdminPage])

  return (
    <header className={`app-header${isAuthPage ? ' app-header--auth' : ''}${isAdminPage ? ' app-header--admin' : ''}`}>
      <div className="app-brand">
        <span className="app-brand-mark" aria-hidden="true">₹</span>
        <span className="app-brand-copy">
          <strong>{t('appName')}</strong>
        </span>
        <button
          className="theme-toggle"
          type="button"
          role="switch"
          aria-checked={isDarkTheme}
          aria-label={t(isDarkTheme ? 'switchToLightTheme' : 'switchToDarkTheme')}
          title={t(isDarkTheme ? 'switchToLightTheme' : 'switchToDarkTheme')}
          onClick={() => setIsDarkTheme((currentTheme) => !currentTheme)}
        >
          <span className="theme-toggle-thumb" aria-hidden="true" />
        </button>
      </div>
      {isAdminPage ? (
        <>
          <div className="admin-header-metrics" aria-label={t('adminOperationalSummary')}>
            <div className="admin-header-metric">
              <span>{t('financeAccounts')}</span>
              <strong>{headerMetrics?.financeAccounts ?? '—'}</strong>
            </div>
            <span className="admin-header-divider" aria-hidden="true" />
            <div className="admin-header-metric">
              <span>{t('pendingAccounts')}</span>
              <strong>{headerMetrics?.pendingAccounts ?? '—'}</strong>
            </div>
            <span className="admin-header-divider" aria-hidden="true" />
            <div className="admin-header-metric">
              <span>{t('paymentsToday')}</span>
              <strong>{headerMetrics?.paymentsToday ?? '—'}</strong>
            </div>
          </div>
          <div className="admin-header-actions">
            <Link className="admin-header-icon-button" to="/pending" aria-label={t('pendingOverdue')} title={t('pendingOverdue')}>
              <span aria-hidden="true">♧</span>
            </Link>
            <Link className="admin-header-icon-button" to="/audit-logs" aria-label={t('securityAuditLogs')} title={t('securityAuditLogs')}>
              <span aria-hidden="true">▣</span>
            </Link>
            <div className="admin-header-profile">
              <span className="admin-header-avatar" aria-hidden="true">♙</span>
              <span className="admin-header-profile-copy">
                <strong>{adminProfile?.name || t('admin')}</strong>
                <span>{adminProfile?.role ? t(adminProfile.role) : t('admin')}</span>
              </span>
            </div>
            <LanguageSelector />
            <button className="admin-header-icon-button" type="button" onClick={logout} aria-label={t('logout')} title={t('logout')}>
              <span aria-hidden="true">⇥</span>
            </button>
          </div>
        </>
      ) : (
        <LanguageSelector />
      )}
    </header>
  )
}

function getLocalDateString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default Navbar