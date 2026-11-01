import { BrowserRouter, Routes, Route } from 'react-router-dom'

// LOGIN
import Login from './pages/Login'

// CLIENT
import ClientDashboard from './pages/ClientDashboard'
import Weekly from './pages/Weekly'
import Monthly from './pages/Monthly'

// ADMIN
import AdminDashboard from './pages/AdminDashboard'
import Customers from './pages/Customers'
import CustomerProfile from './pages/CustomerProfile'
import CustomerFinance from './pages/CustomerFinance'

import Daily from './pages/Daily'
import DailyManage from './pages/DailyManage'

import WeeklyManage from './pages/WeeklyManage'
import MonthlyManage from './pages/MonthlyManage'

import InterestOnly from './pages/InterestOnly'
import InterestOnlyManage from './pages/InterestOnlyManage'

import LoanTypes from './pages/LoanTypes'

import Agents from './pages/Agents'
import AgentAssignments from './pages/AgentAssignments'

import CollectionCategories from './pages/CollectionCategories'
import Collections from './pages/Collections'

import Payments from './pages/Payments'
import Pending from './pages/Pending'

import Reports from './pages/Reports'
import CollectionReport from './pages/CollectionReport'

import AgentSettlement from './pages/AgentSettlement'
import Settings from './pages/Settings'

// =========================================
// AGENT
// =========================================

import AgentDashboard from './pages/AgentDashboard'
import AgentLoans from './pages/AgentLoans'
import AgentCollection from './pages/AgentCollection'

import AgentCustomers from './pages/AgentCustomers'
import AgentToday from './pages/AgentToday'
import AgentPending from './pages/AgentPending'
import AgentHistory from './pages/AgentHistory'
import AgentSettlementSummary from './pages/AgentSettlementSummary'
import AgentProfile from './pages/AgentProfile.jsx'

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route path="/daily/:financeId" element={<DailyManage />} />
        <Route path="/weekly/:financeId" element={<WeeklyManage />} />
        <Route path="/monthly/:financeId" element={<MonthlyManage />} />
        <Route path="/interest-only/:financeId" element={<InterestOnlyManage />} />

        {/* ===================================== */}
        {/* LOGIN */}
        {/* ===================================== */}

        <Route
          path="/"
          element={<Login />}
        />

        {/* ===================================== */}
        {/* CLIENT */}
        {/* ===================================== */}

        <Route
          path="/client"
          element={<ClientDashboard />}
        />

        <Route
          path="/weekly"
          element={<Weekly />}
        />

        <Route
          path="/monthly"
          element={<Monthly />}
        />

        {/* ===================================== */}
        {/* ADMIN DASHBOARD */}
        {/* ===================================== */}

        <Route
          path="/admin"
          element={<AdminDashboard />}
        />

        {/* ===================================== */}
        {/* ADMIN CUSTOMERS */}
        {/* ===================================== */}

        <Route
          path="/customers"
          element={<Customers />}
        />

        <Route
          path="/customers/:customerId"
          element={<CustomerProfile />}
        />

        <Route
          path="/customers/:customerId/finance"
          element={<CustomerFinance />}
        />

        {/* ===================================== */}
        {/* ADMIN LOAN TYPES */}
        {/* ===================================== */}

        <Route
          path="/loans"
          element={<LoanTypes />}
        />

        {/* DAILY */}

        <Route
          path="/daily"
          element={<Daily />}
        />

        <Route
          path="/daily/manage"
          element={<DailyManage />}
        />

        {/* WEEKLY */}

        <Route
          path="/weekly/manage"
          element={<WeeklyManage />}
        />

        {/* MONTHLY */}

        <Route
          path="/monthly/manage"
          element={<MonthlyManage />}
        />

        {/* INTEREST ONLY */}

        <Route
          path="/interest-only"
          element={<InterestOnly />}
        />

        <Route
          path="/interest-only/manage"
          element={<InterestOnlyManage />}
        />

        {/* ===================================== */}
        {/* COLLECTION CATEGORIES */}
        {/* ===================================== */}

        <Route
          path="/categories"
          element={<CollectionCategories />}
        />

        {/* ===================================== */}
        {/* AGENTS */}
        {/* ===================================== */}

        <Route
          path="/agents"
          element={<Agents />}
        />

        <Route
          path="/assignments"
          element={<AgentAssignments />}
        />

        {/* ===================================== */}
        {/* COLLECTIONS */}
        {/* ===================================== */}

        <Route
          path="/collections"
          element={<Collections />}
        />

        {/* ===================================== */}
        {/* PAYMENTS */}
        {/* ===================================== */}

        <Route
          path="/payments"
          element={<Payments />}
        />

        {/* ===================================== */}
        {/* PENDING / OVERDUE */}
        {/* ===================================== */}

        <Route
          path="/pending"
          element={<Pending />}
        />

        {/* ===================================== */}
        {/* REPORTS */}
        {/* ===================================== */}

        <Route
          path="/reports"
          element={<Reports />}
        />

        <Route
          path="/reports/collections"
          element={<CollectionReport />}
        />

        {/* ===================================== */}
        {/* ADMIN SETTLEMENT */}
        {/* ===================================== */}

        <Route
          path="/settlements"
          element={<AgentSettlement />}
        />

        {/* ===================================== */}
        {/* SETTINGS */}
        {/* ===================================== */}

        <Route
          path="/settings"
          element={<Settings />}
        />

        {/* ===================================== */}
        {/* AGENT DASHBOARD */}
        {/* ===================================== */}

        <Route
          path="/agent"
          element={<AgentDashboard />}
        />

        {/* ===================================== */}
        {/* AGENT LOAN TYPES */}
        {/* ===================================== */}

        <Route
          path="/agent/loans/:type"
          element={<AgentLoans />}
        />

        {/* ===================================== */}
        {/* AGENT CUSTOMERS */}
        {/* ===================================== */}

        <Route
          path="/agent/customers"
          element={<AgentCustomers />}
        />

        {/* ===================================== */}
        {/* TODAY'S COLLECTIONS */}
        {/* ===================================== */}

        <Route
          path="/agent/today"
          element={<AgentToday />}
        />

        {/* ===================================== */}
        {/* AGENT PENDING */}
        {/* ===================================== */}

        <Route
          path="/agent/pending"
          element={<AgentPending />}
        />

        {/* ===================================== */}
        {/* AGENT COLLECTION HISTORY */}
        {/* ===================================== */}

        <Route
          path="/agent/history"
          element={<AgentHistory />}
        />

        {/* ===================================== */}
        {/* AGENT SETTLEMENT SUMMARY */}
        {/* ===================================== */}

        <Route
          path="/agent/settlement"
          element={<AgentSettlementSummary />}
        />

        {/* ===================================== */}
        {/* AGENT PROFILE */}
        {/* ===================================== */}

        <Route
          path="/agent/profile"
          element={<AgentProfile />}
        />

        {/* ===================================== */}
        {/* AGENT CUSTOMER COLLECTION */}
        {/* ===================================== */}

        <Route
          path="/agent/collection/:financeId"
          element={<AgentCollection />}
        />

        {/* ===================================== */}
        {/* UNKNOWN URL */}
        {/* ===================================== */}

        <Route
          path="*"
          element={<Login />}
        />

      </Routes>

    </BrowserRouter>
  )
}

export default App