import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import { clearAuth, selectAuth } from '../store/slices/authSlice'
import { notify } from '../utils/notify'

const navItems = [
  { to: '/agent', labelKey: 'dashboard', fallback: 'Dashboard', icon: 'space_dashboard', end: true },
  { to: '/agent/today', labelKey: 'today', fallback: 'Today', icon: 'today' },
  { to: '/agent/pending', labelKey: 'pending', fallback: 'Pending', icon: 'pending_actions' },
  { to: '/agent/customers', labelKey: 'customers', fallback: 'Customers', icon: 'group' },
  { to: '/agent/history', labelKey: 'history', fallback: 'History', icon: 'history' },
  { to: '/agent/settlement', labelKey: 'agentSettlement', fallback: 'Settlement', icon: 'account_balance_wallet' },
  { to: '/agent/profile', labelKey: 'profile', fallback: 'Profile', icon: 'person' }
]

function isActivePath(pathname, to, end) {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

export default function AgentLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const auth = useSelector(selectAuth)
  const [agent, setAgent] = useState(null)
  const [status, setStatus] = useState('checking') // checking | online | offline | error
  const [lastValidatedAt, setLastValidatedAt] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const portalRef = useRef(null)
  const headerRef = useRef(null)

  const role = auth?.access?.role || 'agent'
  const displayName = agent?.full_name || auth?.profile?.fullName || auth?.user?.email || t('agent', 'Agent')

  useEffect(() => {
    let active = true

    async function loadAgent() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        if (!session?.user) {
          setStatus('offline')
          return
        }

        const { data, error } = await supabase
          .from('agents')
          .select('id, agent_id, full_name, status')
          .eq('auth_user_id', session.user.id)
          .maybeSingle()

        if (!active) return
        if (error) throw error
        setAgent(data || null)
        setStatus(navigator.onLine ? 'online' : 'offline')
        setLastValidatedAt(new Date())
      } catch (err) {
        console.error('[agent-layout] failed to load agent context', err)
        if (!active) return
        setStatus('error')
        setLastValidatedAt(new Date())
      }
    }

    loadAgent()

    const onOnline = () => setStatus((s) => (s === 'error' ? s : 'online'))
    const onOffline = () => setStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      active = false
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [auth?.user?.id])

  const statusLabel = useMemo(() => {
    if (status === 'online') return t('online', 'Online')
    if (status === 'offline') return t('offline', 'Offline')
    if (status === 'error') return t('sessionIssue', 'Session issue')
    return t('checking', 'Checking...')
  }, [status, t])

  // Close the phone drawer whenever the route changes, like the admin shell.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // The mobile header wraps to different heights depending on the agent name
  // and status. Publish its real height so the drawer, scrim and menu button
  // line up with it instead of relying on guessed pixel offsets.
  useEffect(() => {
    const portal = portalRef.current
    const header = headerRef.current

    if (!portal || !header) return undefined

    const syncHeaderHeight = () => {
      portal.style.setProperty(
        '--fs-agent-header-h',
        `${Math.ceil(header.getBoundingClientRect().height)}px`
      )
    }

    syncHeaderHeight()

    if (typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(syncHeaderHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch (err) {
      console.error(err)
      notify(err?.message || t('logoutFailed', 'Logout failed'))
    } finally {
      dispatch(clearAuth())
      navigate('/', { replace: true })
    }
  }

  const logoutBtnStyle = {
    background: 'var(--fs-agent-logout-bg, #fff1f2)',
    color: 'var(--fs-agent-logout-color, #be123c)',
    border: '1px solid var(--fs-agent-logout-border, #fecdd3)',
    borderRadius: 999,
    padding: '0.45rem 0.95rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    boxShadow: '0 1px 2px rgba(190,18,60,0.08)'
  }

  return (
    <div
      ref={portalRef}
      className="agent-portal"
      style={{ minHeight: '100vh', background: 'transparent', color: 'var(--fs-agent-heading, #1a0a3b)' }}
    >
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={t('openMenu', 'Open menu')}
        aria-expanded={sidebarOpen}
        aria-controls="agent-sidebar"
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <span className="material-symbols-outlined text-[22px]">
          {sidebarOpen ? 'close' : 'menu'}
        </span>
      </button>

      <div
        className={`sidebar-scrim ${sidebarOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <div ref={headerRef} className="agent-header-stack">
      <header
        className="agent-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.75rem 1rem',
          background: 'var(--fs-agent-header-bg, rgba(255,255,255,0.92))',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--fs-agent-border, rgba(53,16,120,0.12))'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ color: 'var(--fs-agent-icon, #351078)' }}>shield_person</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--fs-agent-heading, #1a0a3b)', lineHeight: 1.2 }}>{t('agentPortal', 'Agent Portal')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--fs-agent-muted, #6b5c86)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}{agent?.agent_id ? ` · ${agent.agent_id}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            title={lastValidatedAt ? `${t('lastValidated', 'Last validated')}: ${lastValidatedAt.toLocaleTimeString()}` : ''}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: status === 'online' ? 'var(--fs-agent-online-bg, rgba(16,185,129,0.12))' : status === 'offline' ? 'var(--fs-agent-offline-bg, rgba(245,158,11,0.14))' : 'var(--fs-agent-error-bg, rgba(239,68,68,0.12))',
              color: status === 'online' ? 'var(--fs-agent-online-fg, #047857)' : status === 'offline' ? 'var(--fs-agent-offline-fg, #92400e)' : 'var(--fs-agent-error-fg, #b91c1c)',
              border: '1px solid rgba(0,0,0,0.06)'
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} aria-hidden="true" />
            {statusLabel} · {t(role, role)}
          </span>
          <button type="button" style={logoutBtnStyle} onClick={logout} aria-label={t('logout', 'Logout')}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">logout</span>
            <span>{t('logout', 'Logout')}</span>
          </button>
        </div>
      </header>

      {/* On phones every navigation tab stays visible in a compact grid, so
          agents can jump straight to a section without opening the drawer. */}
      <nav className="agent-mobile-tabs" aria-label={t('agentNavigation', 'Agent navigation')}>
        {[
          ...navItems,
          { to: '/agent/loans/daily', labelKey: 'collections', fallback: 'Collections', icon: 'payments' }
        ].map((item) => {
          const active = isActivePath(location.pathname, item.to, item.end)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`agent-mobile-tab${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
              <span className="agent-mobile-tab-label">{t(item.labelKey, item.fallback)}</span>
            </Link>
          )
        })}
      </nav>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 57px)' }}>
        <aside
          id="agent-sidebar"
          className={`agent-sidebar ${sidebarOpen ? 'is-open' : ''}`}
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid var(--fs-agent-sidebar-border, rgba(53,16,120,0.1))',
            background: 'var(--fs-agent-sidebar-bg, rgba(255,255,255,0.75))',
            padding: '0.75rem',
            position: 'sticky',
            top: 57,
            alignSelf: 'flex-start',
            height: 'calc(100vh - 57px)',
            overflowY: 'auto',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
          }}
          aria-label={t('agentNavigation', 'Agent navigation')}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {navItems.map((item) => {
              const active = isActivePath(location.pathname, item.to, item.end)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.55rem 0.7rem',
                    borderRadius: 10,
                    textDecoration: 'none',
                    color: active ? 'var(--fs-agent-link-active, #351078)' : 'var(--fs-agent-link, #3b2a5a)',
                    background: active ? 'var(--fs-agent-link-active-bg, rgba(53,16,120,0.1))' : 'transparent',
                    fontWeight: active ? 700 : 500
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">{item.icon}</span>
                  <span>{t(item.labelKey, item.fallback)}</span>
                </Link>
              )
            })}
            <Link
              to="/agent/loans/daily"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.7rem', borderRadius: 10,
                textDecoration: 'none', color: 'var(--fs-agent-link, #3b2a5a)', marginTop: '0.25rem'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">payments</span>
              <span>{t('collections', 'Collections')}</span>
            </Link>
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--fs-agent-sidebar-border, rgba(53,16,120,0.1))' }}>
            <button type="button" style={{ ...logoutBtnStyle, width: '100%', justifyContent: 'center' }} onClick={logout}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">logout</span>
              <span>{t('logout', 'Logout')}</span>
            </button>
          </div>
        </aside>

        <main className="agent-main" style={{ flex: 1, minWidth: 0, padding: '1rem', boxSizing: 'border-box' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
