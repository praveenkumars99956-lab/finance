import { notify } from '../utils/notify'
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import LanguageSelector from './LanguageSelector'
import SyncStatus from './SyncStatus'
import VoiceLanguageSelector from './VoiceLanguageSelector'
import { selectUi, setTheme } from '../store/slices/uiSlice'

function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const { theme } = useSelector(selectUi)
  const [adminProfile, setAdminProfile] = useState(null)
  const [headerMetrics, setHeaderMetrics] = useState(null)
  const isDarkTheme = theme === 'dark'
  const isAuthPage = ['/', '/admin/create', '/forgot-password', '/reset-password'].includes(location.pathname)
  const isAdminPage = !isAuthPage &&
    !location.pathname.startsWith('/agent') &&
    !['/client', '/weekly', '/monthly'].includes(location.pathname)

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) {
      themeColor.setAttribute('content', theme === 'dark' ? '#0c0618' : '#351078')
    }

    try {
      window.localStorage.setItem('finance-theme', theme)
    } catch {
      // Theme still applies for this page when storage is blocked.
    }
  }, [theme])

  const logout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (error) {
      console.error('Unable to sign out:', error)
      notify(error.message)
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
    <header className="app-navbar fixed top-0 left-0 right-0 z-50 bg-[#F2ECFF]/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(53,16,120,0.08)]">
      <div className="h-16 w-full px-gutter-desktop flex items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-lg">
          <Link to={isAdminPage ? '/admin' : '/'} className="flex items-center gap-space-sm no-underline">
            <div className="app-brand-mark w-9 h-9 rounded-DEFAULT bg-[#351078] flex items-center justify-center shadow-sm">
              <span className="text-on-primary font-bold text-[20px] leading-none select-none">₹</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline tracking-wider uppercase leading-none mt-1">
                {t('financeSuite')}
              </span>
            </div>
          </Link>

          <div className="hidden xl:flex items-center px-space-sm py-space-xs rounded-full bg-surface-container-high">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2" />
            <span className="font-label-sm text-label-sm text-on-surface font-semibold">{t('institutionalCoreOnline')}</span>
          </div>

          <div className="hidden 2xl:flex items-center gap-space-sm px-space-md py-space-xs rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-secondary text-[16px]">domain</span>
            <span>{t('zurichNode')}</span>
          </div>
        </div>

        {isAdminPage && (
          <div className="hidden lg:flex items-center gap-space-lg px-space-md py-space-xs rounded-full bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
            <Link to="/loans" className="flex items-center gap-space-xs no-underline">
              <span className="font-label-sm text-label-sm text-outline uppercase">{t('financeAccounts', 'Finance Accounts')}</span>
              <span className="font-label-lg text-label-lg text-on-surface font-semibold">
                {headerMetrics?.financeAccounts ?? '—'}
              </span>
            </Link>
            <span className="w-1 h-1 rounded-full bg-outline-variant" />
            <Link to="/pending" className="flex items-center gap-space-xs no-underline">
              <span className="font-label-sm text-label-sm text-outline uppercase">{t('pendingAccounts', 'Pending Accounts')}</span>
              <span className="font-label-lg text-label-lg text-primary font-semibold">
                {headerMetrics?.pendingAccounts ?? '—'}
              </span>
            </Link>
            <span className="w-1 h-1 rounded-full bg-outline-variant" />
            <Link to="/payments" className="flex items-center gap-space-xs no-underline">
              <span className="font-label-sm text-label-sm text-outline uppercase">{t('paymentsToday', 'Payments Today')}</span>
              <span className="font-label-lg text-label-lg text-secondary font-semibold">
                {headerMetrics?.paymentsToday ?? '—'}
              </span>
            </Link>
          </div>
        )}

        <div className="flex items-center gap-space-md">
          <SyncStatus />
          <VoiceLanguageSelector />
          <LanguageSelector />

          <button
            className="app-nav-icon w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border-0 cursor-pointer"
            type="button"
            title={t('notifications', 'Notifications')}
            aria-label={t('notifications', 'Notifications')}
            onClick={() => navigate('/pending')}
          >
            <span className="material-symbols-outlined text-[18px]">notifications</span>
          </button>

          <button
            className="app-nav-icon w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border-0 cursor-pointer"
            type="button"
            title={t('securityAuditLogs', 'Audit Logs')}
            aria-label={t('securityAuditLogs', 'Audit Logs')}
            onClick={() => navigate('/audit-logs')}
          >
            <span className="material-symbols-outlined text-[18px]">terminal</span>
          </button>

          <button
            className="app-nav-icon w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border-0 cursor-pointer"
            type="button"
            role="switch"
            aria-checked={isDarkTheme}
            aria-label={t(isDarkTheme ? 'switchToLightTheme' : 'switchToDarkTheme')}
            title={t(isDarkTheme ? 'switchToLightTheme' : 'switchToDarkTheme')}
            onClick={() => dispatch(setTheme(isDarkTheme ? 'light' : 'dark'))}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isDarkTheme ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {isAdminPage && (
            <div className="flex items-center gap-space-sm pl-space-sm">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="font-label-md text-label-md text-on-surface leading-tight font-semibold">
                  {adminProfile?.name || 'E. von Hapsburg'}
                </span>
                <span className="font-label-sm text-label-sm text-outline leading-tight">
                  {adminProfile?.role ? t(adminProfile.role) : t('chiefInvestmentOfficer')}
                </span>
              </div>
            </div>
          )}

          {isAdminPage && (
            <button
              className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-outline hover:bg-error-container hover:text-on-error-container transition-colors border-0 cursor-pointer"
              type="button"
              onClick={logout}
              title={t('logout')}
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          )}
        </div>
      </div>
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
