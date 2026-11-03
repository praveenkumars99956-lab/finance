import { useLocation, useNavigate, Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'

const navigationGroups = [
  {
    heading: 'treasuryCore',
    items: [
      { to: '/admin', key: 'liquidityReserves', icon: '▦' },
      { to: '/pending', key: 'debtRecovery', icon: '↘' },
      { to: '/settlements', key: 'settlementEngine', icon: '⇄' },
      { to: '/reports/collections', key: 'creditAgingMatrix', icon: '▥' }
    ]
  },
  {
    heading: 'governanceVault',
    items: [
      { to: '/loans', key: 'institutionalLedger', icon: '▤' },
      { to: '/audit-logs', key: 'auditCompliance', icon: '✓' },
      { to: '/settings', key: 'vaultOperations', icon: '⚙' }
    ]
  }
]

function AdminLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const logout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (error) {
      console.error(error)
      window.alert(error.message)
      return
    }

    navigate('/')
  }

  const isActive = (to) => {
    if (to === '/admin') {
      return pathname === to
    }

    const sectionRoutes = {
      '/reports/collections': /^\/reports\/collections(\/|$)/
    }

    if (sectionRoutes[to]) {
      return sectionRoutes[to].test(pathname)
    }

    return pathname === to || pathname.startsWith(`${to}/`)
  }

  const allItems = navigationGroups.flatMap(({ items }) => items)
  const currentPageKey = pathname.startsWith('/customers/')
    ? pathname.endsWith('/finance')
      ? 'financeAccounts'
      : 'customerProfile'
    : allItems
      .filter(({ to }) => isActive(to))
      .sort((a, b) => b.to.length - a.to.length)[0]
      ?.key

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label={t('adminPanel')}>
        <div className="admin-sidebar-top">
          {navigationGroups.map(({ heading, items }) => (
            <section className="admin-sidebar-group" key={heading}>
              <p className="admin-sidebar-heading">{t(heading)}</p>
              <nav className="admin-sidebar-nav" aria-label={t(heading)}>
                {items.map(({ to, key, icon }) => {
                  const active = isActive(to)

                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`admin-sidebar-link${active ? ' is-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="admin-sidebar-icon" aria-hidden="true">{icon}</span>
                      <span>{t(key)}</span>
                    </Link>
                  )
                })}
              </nav>
            </section>
          ))}
        </div>

        <button className="admin-sidebar-logout" type="button" onClick={logout}>
          <span className="admin-sidebar-icon" aria-hidden="true">↪</span>
          <span>{t('logout')}</span>
        </button>
      </aside>

      <main className="admin-shell-content">
        {pathname !== '/admin' && (
          <div className="admin-context-bar">
            <span>{t('adminPanel')}</span>
            <span className="admin-context-divider" aria-hidden="true">/</span>
            <strong>{t(currentPageKey || 'dashboard')}</strong>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
