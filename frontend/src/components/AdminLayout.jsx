import { notify } from '../utils/notify'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'

const navigationGroups = [
  {
    heading: 'Treasury Core',
    headingKey: 'treasuryCore',
    items: [
      { to: '/admin', key: 'dashboard', label: 'Dashboard', icon: 'space_dashboard' },
      { to: '/loans', key: 'loanPortfolio', label: 'Loan Portfolio', icon: 'account_balance' },
      { to: '/customers', key: 'customers', label: 'Customers', icon: 'group' },
      { to: '/pending', key: 'debtRecovery', label: 'Debt Recovery', icon: 'price_check' }
    ]
  },
  {
    heading: 'Field Operations',
    headingKey: 'fieldOperations',
    items: [
      { to: '/collections', key: 'collections', label: 'Collections', icon: 'payments' },
      { to: '/payments', key: 'payments', label: 'Payments', icon: 'receipt_long' },
      { to: '/categories', key: 'collectionCategories', label: 'Collection Categories', icon: 'category' },
      { to: '/agents', key: 'agents', label: 'Agents', icon: 'badge' },
      { to: '/assignments', key: 'agentAssignment', label: 'Agent Assignment', icon: 'hub' },
      { to: '/settlements', key: 'agentSettlement', label: 'Agent Settlement', icon: 'currency_exchange' }
    ]
  },
  {
    heading: 'Governance & Vault',
    headingKey: 'governanceVault',
    items: [
      { to: '/reports', key: 'reports', label: 'Reports', icon: 'insights' },
      { to: '/reports/collections', key: 'creditAgingMatrix', label: 'Credit Aging Matrix', icon: 'analytics' },
      { to: '/audit-logs', key: 'auditCompliance', label: 'Audit & Compliance', icon: 'verified_user' },
      { to: '/settings', key: 'vaultOperations', label: 'Vault Operations', icon: 'lock' }
    ]
  }
]

function AdminLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const logout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (error) {
      console.error(error)
      notify(error.message)
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
  const currentPageItem = pathname.startsWith('/customers/')
    ? { label: pathname.endsWith('/finance') ? t('financeAccounts') : t('customerProfile') }
    : pathname.startsWith('/weekly')
      ? { label: t('weekly', 'Weekly') }
      : pathname.startsWith('/monthly')
        ? { label: t('monthly', 'Monthly') }
        : allItems
            .filter(({ to }) => isActive(to))
            .sort((a, b) => b.to.length - a.to.length)[0]

  return (
    <div className="admin-shell page-bg">
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={t('openMenu', 'Open menu')}
        aria-expanded={sidebarOpen}
        aria-controls="admin-sidebar"
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

      {/* Fixed sidebar */}
      <aside
        id="admin-sidebar"
        className={`admin-sidebar fixed left-0 top-16 bottom-0 w-64 z-40 flex flex-col justify-between py-space-md border-r border-purple-200/30 ${sidebarOpen ? 'is-open' : ''}`}
      >
        <div className="flex flex-col gap-space-md px-space-md overflow-y-auto min-h-0 flex-1">
          {navigationGroups.map(({ heading, headingKey, items }, groupIdx) => (
            <div key={heading} className="flex flex-col">
              <div className={`px-space-sm ${groupIdx === 0 ? 'py-space-xs' : 'pt-space-md pb-space-xs'}`}>
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
                  {t(headingKey) !== headingKey ? t(headingKey) : heading}
                </span>
              </div>
              <nav className="flex flex-col gap-space-xs">
                {items.map(({ to, key, label, icon }) => {
                  const active = isActive(to)

                  return (
                    <Link
                      key={to}
                      to={to}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center px-space-md py-space-sm transition-all rounded-DEFAULT no-underline ${
                        active
                          ? 'bg-primary text-on-primary font-semibold shadow-sm'
                          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined mr-space-sm text-[20px] select-none">
                        {icon}
                      </span>
                      <span className="font-label-lg text-label-lg">
                        {t(key) !== key ? t(key) : label}
                      </span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="px-space-md pt-space-md border-t border-outline-variant/30">
          <button
            type="button"
            className="flex items-center w-full px-space-md py-space-sm rounded-DEFAULT text-error hover:bg-error-container hover:text-on-error-container transition-all border-0 bg-transparent cursor-pointer font-label-md text-label-md font-semibold"
            onClick={logout}
          >
            <span className="material-symbols-outlined mr-space-sm text-[20px]">logout</span>
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="admin-main">
        <main className="admin-content flex flex-col page-bg">
          {pathname !== '/admin' && (
            <nav className="admin-breadcrumb" aria-label={t('dashboard')}>
              <Link to="/admin" className="admin-breadcrumb-link">
                {t('adminPanel')}
              </Link>
              <span className="admin-breadcrumb-sep" aria-hidden="true">/</span>
              <strong className="admin-breadcrumb-current">
                {currentPageItem?.label || t('dashboard')}
              </strong>
            </nav>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
