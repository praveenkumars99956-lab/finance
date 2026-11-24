import {
  lazy,
  Suspense
} from 'react'

import {
  BrowserRouter,
  Routes,
  Route
} from 'react-router-dom'

import { useTranslation } from 'react-i18next'

import AuthBoundary from './components/AuthBoundary'
import Navbar from './components/Navbar'
import AdminLayout from './components/AdminLayout'
import AgentLayout from './components/AgentLayout'
import FloatingVoiceButton from './components/FloatingVoiceButton'

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
// APP
// =========================================

function App() {
  const { t } = useTranslation()

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

        <Suspense fallback={<div className="route-loading" role="status">{t('loading')}</div>}>
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

          {/* The loan forms share the admin shell so the full side navigation
              stays available on /weekly and /monthly. */}

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
              AGENT PORTAL
          ================================== */}
          <Route element={<AgentLayout />}>
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/loans/:type" element={<AgentLoans />} />
            <Route path="/agent/customers" element={<AgentCustomers />} />
            <Route path="/agent/today" element={<AgentToday />} />
            <Route path="/agent/pending" element={<AgentPending />} />
            <Route path="/agent/history" element={<AgentHistory />} />
            <Route path="/agent/settlement" element={<AgentSettlementSummary />} />
            <Route path="/agent/profile" element={<AgentProfile />} />
            <Route path="/agent/collection/:financeId" element={<AgentCollection />} />
          </Route>

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

      <FloatingVoiceButton />

    </BrowserRouter>
  )
}

export default App