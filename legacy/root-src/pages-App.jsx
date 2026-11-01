import {
  BrowserRouter,
  Routes,
  Route
} from 'react-router-dom'

import Login from './pages/Login'
import ClientDashboard from './pages/ClientDashboard'
import AdminDashboard from './pages/AdminDashboard'

import LoanTypes from './pages/LoanTypes'
import Daily from './pages/Daily'
import Weekly from './pages/Weekly'
import Monthly from './pages/Monthly'
import InterestOnly from './pages/InterestOnly'

import Customers from './pages/Customers'
import Payments from './pages/Payments'
import Pending from './pages/Pending'
import Reports from './pages/Reports'

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Login />}
        />

        <Route
          path="/client"
          element={<ClientDashboard />}
        />

        <Route
          path="/admin"
          element={<AdminDashboard />}
        />

        <Route
          path="/loans"
          element={<LoanTypes />}
        />

        <Route
          path="/daily"
          element={<Daily />}
        />

        <Route
          path="/weekly"
          element={<Weekly />}
        />

        <Route
          path="/monthly"
          element={<Monthly />}
        />

        <Route
          path="/interest-only"
          element={<InterestOnly />}
        />

        <Route
          path="/customers"
          element={<Customers />}
        />

        <Route
          path="/payments"
          element={<Payments />}
        />

        <Route
          path="/pending"
          element={<Pending />}
        />

        <Route
          path="/reports"
          element={<Reports />}
        />

      </Routes>

    </BrowserRouter>
  )
}

export default App