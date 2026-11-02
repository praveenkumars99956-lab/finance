import {
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

// =========================================
// LOGIN
// =========================================

import Login from './pages/auth/Login'
import AdminCreate from './pages/auth/AdminCreate'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

// =========================================
// CLIENT
// =========================================

import ClientDashboard from './pages/client/ClientDashboard'
import Weekly from './pages/client/Weekly'
import Monthly from './pages/client/Monthly'

// =========================================
// ADMIN
// =========================================

import AdminDashboard from './pages/admin/AdminDashboard'

import Customers from './pages/admin/Customers'
import CustomerProfile from './pages/admin/CustomerProfile'
import CustomerFinance from './pages/admin/CustomerFinance'

import Daily from './pages/admin/Daily'
import DailyManage from './pages/admin/DailyManage'

import WeeklyManage from './pages/admin/WeeklyManage'
import MonthlyManage from './pages/admin/MonthlyManage'

import InterestOnly from './pages/admin/InterestOnly'
import InterestOnlyManage from './pages/admin/InterestOnlyManage'

import LoanTypes from './pages/admin/LoanTypes'

import Agents from './pages/admin/Agents'
import AgentAssignments from './pages/admin/AgentAssignments'

import CollectionCategories from './pages/admin/CollectionCategories'
import Collections from './pages/admin/Collections'

import Payments from './pages/admin/Payments'
import Pending from './pages/admin/Pending'

import Reports from './pages/admin/Reports'
import CollectionReport from './pages/admin/CollectionReport'

import AgentSettlement from './pages/admin/AgentSettlement'

import Settings from './pages/admin/Settings'
import AuditLogs from './pages/admin/AuditLogs'

// =========================================
// AGENT
// =========================================

import AgentDashboard from './pages/agent/AgentDashboard'
import AgentLoans from './pages/agent/AgentLoans'
import AgentCollection from './pages/agent/AgentCollection'

import AgentCustomers from './pages/agent/AgentCustomers'
import AgentToday from './pages/agent/AgentToday'
import AgentPending from './pages/agent/AgentPending'
import AgentHistory from './pages/agent/AgentHistory'

import AgentSettlementSummary from './pages/agent/AgentSettlementSummary'

import AgentProfile from './pages/agent/AgentProfile.jsx'

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

        <Routes>

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

      </AuthBoundary>

    </BrowserRouter>
  )
}

export default App