import {
  lazy,
  Suspense,
  useEffect,
  useState
} from 'react'

import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate
} from 'react-router-dom'

import { supabase } from './services/supabase'

import Navbar from './components/Navbar'
import AdminLayout from './components/AdminLayout'

const Login = lazy(() => import('./pages/auth/Login'))
const AdminCreate = lazy(() => import('./pages/auth/AdminCreate'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))

const ClientDashboard = lazy(() => import('./pages/client/ClientDashboard'))
const Weekly = lazy(() => import('./pages/client/Weekly'))
const Monthly = lazy(() => import('./pages/client/Monthly'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const Customers = lazy(() => import('./pages/admin/Customers'))
const CustomerProfile = lazy(() => import('./pages/admin/CustomerProfile'))
const CustomerFinance = lazy(() => import('./pages/admin/CustomerFinance'))
const Daily = lazy(() => import('./pages/admin/Daily'))
const DailyManage = lazy(() => import('./pages/admin/DailyManage'))
const WeeklyManage = lazy(() => import('./pages/admin/WeeklyManage'))
const MonthlyManage = lazy(() => import('./pages/admin/MonthlyManage'))
const InterestOnly = lazy(() => import('./pages/admin/InterestOnly'))
const InterestOnlyManage = lazy(() => import('./pages/admin/InterestOnlyManage'))
const LoanTypes = lazy(() => import('./pages/admin/LoanTypes'))
const Agents = lazy(() => import('./pages/admin/Agents'))
const AgentAssignments = lazy(() => import('./pages/admin/AgentAssignments'))
const CollectionCategories = lazy(() => import('./pages/admin/CollectionCategories'))
const Collections = lazy(() => import('./pages/admin/Collections'))
const Payments = lazy(() => import('./pages/admin/Payments'))
const Pending = lazy(() => import('./pages/admin/Pending'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const CollectionReport = lazy(() => import('./pages/admin/CollectionReport'))
const AgentSettlement = lazy(() => import('./pages/admin/AgentSettlement'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'))

const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard'))
const AgentLoans = lazy(() => import('./pages/agent/AgentLoans'))
const AgentCollection = lazy(() => import('./pages/agent/AgentCollection'))
const AgentCustomers = lazy(() => import('./pages/agent/AgentCustomers'))
const AgentToday = lazy(() => import('./pages/agent/AgentToday'))
const AgentPending = lazy(() => import('./pages/agent/AgentPending'))
const AgentHistory = lazy(() => import('./pages/agent/AgentHistory'))
const AgentSettlementSummary = lazy(() => import('./pages/agent/AgentSettlementSummary'))
const AgentProfile = lazy(() => import('./pages/agent/AgentProfile.jsx'))

// =========================================
// AUTH BOUNDARY
// =========================================

function AuthBoundary({
  children
}) {
  const location =
    useLocation()

  const navigate =
    useNavigate()

  const [
    checking,
    setChecking
  ] = useState(
    !['/', '/admin/create', '/forgot-password', '/reset-password'].includes(location.pathname)
  )

  useEffect(() => {
    // =====================================
    // LOGIN PAGE
    // =====================================

    if (['/', '/admin/create', '/forgot-password', '/reset-password'].includes(location.pathname)) {
      setChecking(false)

      return
    }

    let active = true

    setChecking(true)

    // =====================================
    // GET LOGGED-IN USER
    // =====================================

    supabase.auth
      .getUser()

      .then(
        ({
          data,
          error
        }) => {
          if (!active) {
            return
          }

          if (
            error ||
            !data?.user
          ) {
            navigate(
              '/',
              {
                replace: true
              }
            )

            return
          }

          // =================================
          // CURRENT PATH
          // =================================

          const path =
            location.pathname

          // =================================
          // AGENT PATH
          // =================================

          const isAgentPath =
            path === '/agent' ||
            path.startsWith(
              '/agent/'
            )

          // =================================
          // CLIENT PATH
          // =================================

          const isClientPath =
            path === '/client' ||
            path === '/weekly' ||
            path === '/monthly'

          // =================================
          // WEEKLY / MONTHLY ARE SHARED
          // =================================

          const isSharedLoanPath =
            path === '/weekly' ||
            path === '/monthly'

          // =================================
          // GET PROFILE ROLE
          // =================================

          const roleQuery =
            supabase
              .from('profiles')
              .select('role')
              .eq(
                'id',
                data.user.id
              )
              .maybeSingle()

          roleQuery.then(
            ({
              data: profile,
              error: profileError
            }) => {
              if (!active) {
                return
              }

              if (
                profileError ||
                !profile
              ) {
                navigate(
                  '/',
                  {
                    replace: true
                  }
                )

                return
              }

              // =============================
              // NORMALIZE ROLE
              // =============================

              const role =
                String(
                  profile.role ||
                  ''
                )
                  .trim()
                  .toLowerCase()

              // =============================
              // CHECK ACCESS
              // =============================

              const allowed =
                (
                  role ===
                    'agent' &&
                  isAgentPath
                ) ||

                (
                  role ===
                    'client' &&
                  isClientPath
                ) ||

                (
                  role ===
                    'admin' &&
                  !isAgentPath &&
                  (
                    !isClientPath ||
                    isSharedLoanPath
                  ) &&
                  path !== '/'
                )

              // =============================
              // WRONG ROLE
              // =============================

              if (!allowed) {
                navigate(
                  role ===
                    'agent'
                    ? '/agent'
                    : role ===
                        'client'
                      ? '/client'
                      : '/admin',

                  {
                    replace: true
                  }
                )

                return
              }

              // =============================
              // ACCESS OK
              // =============================

              setChecking(false)
            }
          )
        }
      )

      .catch(() => {
        if (active) {
          navigate(
            '/',
            {
              replace: true
            }
          )
        }
      })

    // =====================================
    // CLEANUP
    // =====================================

    return () => {
      active = false
    }
  }, [
    location.pathname,
    navigate
  ])

  // =========================================
  // LOADING
  // =========================================

  if (checking) {
    return (
      <div className="customer-profile-page">

        <p>
          Checking login...
        </p>

      </div>
    )
  }

  return children
}

// =========================================
// APP
// =========================================

function App() {
  return (
    <BrowserRouter>

      {/* ===================================
          GLOBAL NAVBAR / LANGUAGE
      ==================================== */}

      <Navbar />

      {/* ===================================
          AUTHENTICATION
      ==================================== */}

      <AuthBoundary>

        <Suspense fallback={<div className="route-loading" role="status">Loading...</div>}>
        <Routes>

          {/* =================================
              FINANCE MANAGEMENT
          ================================== */}

          {/* =================================
              LOGIN
          ================================== */}

          <Route
            path="/"
            element={
              <Login />
            }
          />

          <Route
            path="/admin/create"
            element={
              <AdminCreate />
            }
          />

          <Route
            path="/forgot-password"
            element={
              <ForgotPassword />
            }
          />

          <Route
            path="/reset-password"
            element={
              <ResetPassword />
            }
          />

          {/* =================================
              CLIENT
          ================================== */}

          <Route
            path="/client"
            element={
              <ClientDashboard />
            }
          />

          <Route
            path="/weekly"
            element={
              <Weekly />
            }
          />

          <Route
            path="/monthly"
            element={
              <Monthly />
            }
          />

          {/* =================================
              ADMIN DASHBOARD
          ================================== */}

          <Route element={<AdminLayout />}>
          {/* =================================
              FINANCE MANAGEMENT
          ================================== */}

          <Route
            path="/daily/:financeId"
            element={
              <DailyManage />
            }
          />

          <Route
            path="/weekly/:financeId"
            element={
              <WeeklyManage />
            }
          />

          <Route
            path="/monthly/:financeId"
            element={
              <MonthlyManage />
            }
          />

          <Route
            path="/interest-only/:financeId"
            element={
              <InterestOnlyManage />
            }
          />

          <Route
            path="/admin"
            element={
              <AdminDashboard />
            }
          />

          {/* =================================
              CUSTOMERS
          ================================== */}

          <Route
            path="/customers"
            element={
              <Customers />
            }
          />

          <Route
            path="/customers/:customerId"
            element={
              <CustomerProfile />
            }
          />

          <Route
            path="/customers/:customerId/finance"
            element={
              <CustomerFinance />
            }
          />

          {/* =================================
              LOAN TYPES
          ================================== */}

          <Route
            path="/loans"
            element={
              <LoanTypes />
            }
          />

          {/* =================================
              DAILY
          ================================== */}

          <Route
            path="/daily"
            element={
              <Daily />
            }
          />

          <Route
            path="/daily/manage"
            element={
              <DailyManage />
            }
          />

          {/* =================================
              WEEKLY
          ================================== */}

          <Route
            path="/weekly/manage"
            element={
              <WeeklyManage />
            }
          />

          {/* =================================
              MONTHLY
          ================================== */}

          <Route
            path="/monthly/manage"
            element={
              <MonthlyManage />
            }
          />

          {/* =================================
              INTEREST ONLY
          ================================== */}

          <Route
            path="/interest-only"
            element={
              <InterestOnly />
            }
          />

          <Route
            path="/interest-only/manage"
            element={
              <InterestOnlyManage />
            }
          />

          {/* =================================
              COLLECTION CATEGORIES
          ================================== */}

          <Route
            path="/categories"
            element={
              <CollectionCategories />
            }
          />

          {/* =================================
              AGENTS
          ================================== */}

          <Route
            path="/agents"
            element={
              <Agents />
            }
          />

          <Route
            path="/assignments"
            element={
              <AgentAssignments />
            }
          />

          {/* =================================
              COLLECTIONS
          ================================== */}

          <Route
            path="/collections"
            element={
              <Collections />
            }
          />

          {/* =================================
              PAYMENTS
          ================================== */}

          <Route
            path="/payments"
            element={
              <Payments />
            }
          />

          {/* =================================
              PENDING / OVERDUE
          ================================== */}

          <Route
            path="/pending"
            element={
              <Pending />
            }
          />

          {/* =================================
              REPORTS
          ================================== */}

          <Route
            path="/reports"
            element={
              <Reports />
            }
          />

          <Route
            path="/reports/collections"
            element={
              <CollectionReport />
            }
          />

          {/* =================================
              SETTLEMENTS
          ================================== */}

          <Route
            path="/settlements"
            element={
              <AgentSettlement />
            }
          />

          {/* =================================
              SETTINGS
          ================================== */}

          <Route
            path="/settings"
            element={
              <Settings />
            }
          />

          {/* =================================
              AUDIT LOGS
          ================================== */}

          <Route
            path="/audit-logs"
            element={
              <AuditLogs />
            }
          />
          </Route>

          {/* =================================
              AGENT DASHBOARD
          ================================== */}

          <Route
            path="/agent"
            element={
              <AgentDashboard />
            }
          />

          {/* =================================
              AGENT LOANS
          ================================== */}

          <Route
            path="/agent/loans/:type"
            element={
              <AgentLoans />
            }
          />

          {/* =================================
              AGENT CUSTOMERS
          ================================== */}

          <Route
            path="/agent/customers"
            element={
              <AgentCustomers />
            }
          />

          {/* =================================
              AGENT TODAY
          ================================== */}

          <Route
            path="/agent/today"
            element={
              <AgentToday />
            }
          />

          {/* =================================
              AGENT PENDING
          ================================== */}

          <Route
            path="/agent/pending"
            element={
              <AgentPending />
            }
          />

          {/* =================================
              AGENT HISTORY
          ================================== */}

          <Route
            path="/agent/history"
            element={
              <AgentHistory />
            }
          />

          {/* =================================
              AGENT SETTLEMENT
          ================================== */}

          <Route
            path="/agent/settlement"
            element={
              <AgentSettlementSummary />
            }
          />

          {/* =================================
              AGENT PROFILE
          ================================== */}

          <Route
            path="/agent/profile"
            element={
              <AgentProfile />
            }
          />

          {/* =================================
              AGENT COLLECTION
          ================================== */}

          <Route
            path="/agent/collection/:financeId"
            element={
              <AgentCollection />
            }
          />

          {/* =================================
              UNKNOWN URL
          ================================== */}

          <Route
            path="*"
            element={
              <Login />
            }
          />

        </Routes>
        </Suspense>

      </AuthBoundary>

    </BrowserRouter>
  )
}

export default App