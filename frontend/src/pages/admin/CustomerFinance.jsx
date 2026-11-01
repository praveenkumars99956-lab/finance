import { useEffect, useState } from 'react'
import {
  useLocation,
  useNavigate,
  useParams
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function CustomerFinance() {
  const navigate = useNavigate()
  const location = useLocation()
  const { customerId } = useParams()
  const { t } = useTranslation()

  const [customer, setCustomer] = useState(
    location.state?.customer || null
  )

  const [loading, setLoading] = useState(
    !location.state?.customer
  )

  // =========================================
  // LOAD CUSTOMER
  // =========================================

  useEffect(() => {
    const loadCustomer = async () => {
      if (location.state?.customer?.id) {
        setCustomer(location.state.customer)
        setLoading(false)
        return
      }

      if (!customerId) {
        alert(
          t(
            'customerDatabaseIdMissing',
            'Customer database ID is missing.'
          )
        )

        navigate('/customers')
        return
      }

      try {
        setLoading(true)

        const {
          data,
          error
        } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single()

        if (error) {
          console.error(
            'CUSTOMER LOAD ERROR:',
            error
          )

          alert(
            `${t(
              'unableToLoadCustomer',
              'Unable to load customer'
            )}: ${error.message}`
          )

          return
        }

        if (!data) {
          alert(
            t(
              'customerNotFound',
              'Customer not found.'
            )
          )

          return
        }

        setCustomer(data)
      } catch (error) {
        console.error(
          'CUSTOMER ERROR:',
          error
        )

        alert(
          error?.message ||
            t(
              'unableToLoadCustomer',
              'Unable to load customer.'
            )
        )
      } finally {
        setLoading(false)
      }
    }

    loadCustomer()
  }, [
    customerId,
    location.state,
    navigate,
    t
  ])

  // =========================================
  // OPEN LOAN
  // =========================================

  const openLoan = (type) => {
    const dbCustomerId =
      customer?.id ||
      customerId

    if (!dbCustomerId) {
      alert(
        t(
          'customerDatabaseIdMissing',
          'Customer database ID is missing.'
        )
      )

      return
    }

    if (!customer) {
      alert(
        t(
          'customerInformationMissing',
          'Customer information is missing.'
        )
      )

      return
    }

    // =====================================
    // STATE SENT TO LOAN PAGES
    // =====================================

    const state = {
      customer: {
        ...customer,
        id: Number(dbCustomerId)
      },

      customerId:
        Number(dbCustomerId),

      from:
        'customer-finance'
    }

    console.log(
      'OPENING FINANCE'
    )

    console.log(
      'CUSTOMER:',
      customer
    )

    console.log(
      'CUSTOMER DB ID:',
      dbCustomerId
    )

    console.log(
      'NAVIGATION STATE:',
      state
    )

    // =====================================
    // DAILY
    // =====================================

    if (type === 'daily') {
      navigate(
        '/daily',
        {
          state
        }
      )

      return
    }

    // =====================================
    // WEEKLY
    // =====================================

    if (type === 'weekly') {
      navigate(
        '/weekly',
        {
          state
        }
      )

      return
    }

    // =====================================
    // MONTHLY
    // =====================================

    if (type === 'monthly') {
      navigate(
        '/monthly',
        {
          state
        }
      )

      return
    }

    // =====================================
    // INTEREST ONLY
    // =====================================

    if (
      type ===
      'interest_only'
    ) {
      navigate(
        '/interest-only',
        {
          state
        }
      )
    }
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="customer-finance-page">

        <div
          style={{
            padding: '40px',
            textAlign: 'center'
          }}
        >
          <h2>
            {t('appName', 'FINANCE')}
          </h2>

          <p>
            {t(
              'loadingCustomer',
              'Loading Customer...'
            )}
          </p>
        </div>

      </div>
    )
  }

  // =========================================
  // CUSTOMER NOT FOUND
  // =========================================

  if (!customer) {
    return (
      <div className="customer-finance-page">

        <button
          className="back-button"
          type="button"
          onClick={() =>
            navigate('/customers')
          }
        >
          ← {t(
            'customers',
            'Customers'
          )}
        </button>

        <div
          style={{
            padding: '40px',
            textAlign: 'center'
          }}
        >
          <h2>
            {t(
              'customerNotFound',
              'Customer Not Found'
            )}
          </h2>

          <p>
            {t(
              'unableToLoadSelectedCustomer',
              'Unable to load the selected customer.'
            )}
          </p>
        </div>

      </div>
    )
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-finance-page">

      {/* =====================================
          BACK
      ====================================== */}

      <button
        className="back-button"
        type="button"
        onClick={() =>
          navigate(
            `/customers/${customer.id}`
          )
        }
      >
        ← {t(
          'customerProfile',
          'Customer Profile'
        )}
      </button>

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="customer-finance-header">

        <p>
          {t(
            'addFinance',
            'ADD FINANCE'
          ).toUpperCase()}
        </p>

        <h1>
          {t(
            'selectLoanType',
            'Select Loan Type'
          )}
        </h1>

        <span>
          {t(
            'customer',
            'Customer'
          )}:{' '}

          <strong>
            {customer.full_name}
          </strong>

          {' • '}

          {customer.customer_id}
        </span>

      </div>

      {/* =====================================
          DATABASE INFO
      ====================================== */}

      <div
        style={{
          marginBottom: '20px',
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: '10px'
        }}
      >
        <small>
          {t(
            'customerDatabaseId',
            'Customer Database ID'
          )}:{' '}

          <strong>
            {customer.id}
          </strong>
        </small>
      </div>

      {/* =====================================
          FINANCE TYPES
      ====================================== */}

      <div className="finance-type-grid">

        {/* =====================================
            DAILY
        ====================================== */}

        <button
          type="button"
          className="finance-type-card"
          onClick={() =>
            openLoan('daily')
          }
        >

          <div className="finance-type-icon">
            D
          </div>

          <h2>
            {t(
              'dailyLoan',
              'Daily Loan'
            )}
          </h2>

          <p>
            {t(
              'dailyLoanDescription',
              'Daily repayment and collection finance.'
            )}
          </p>

          <span>
            {t(
              'openDailyLoan',
              'Open Daily Loan'
            )} →
          </span>

        </button>

        {/* =====================================
            WEEKLY
        ====================================== */}

        <button
          type="button"
          className="finance-type-card"
          onClick={() =>
            openLoan('weekly')
          }
        >

          <div className="finance-type-icon">
            W
          </div>

          <h2>
            {t(
              'weeklyLoan',
              'Weekly Loan'
            )}
          </h2>

          <p>
            {t(
              'weeklyLoanCardDescription',
              'Weekly repayment and collection finance.'
            )}
          </p>

          <span>
            {t(
              'openWeeklyLoan',
              'Open Weekly Loan'
            )} →
          </span>

        </button>

        {/* =====================================
            MONTHLY
        ====================================== */}

        <button
          type="button"
          className="finance-type-card"
          onClick={() =>
            openLoan('monthly')
          }
        >

          <div className="finance-type-icon">
            M
          </div>

          <h2>
            {t(
              'monthlyLoan',
              'Monthly Loan'
            )}
          </h2>

          <p>
            {t(
              'monthlyLoanCardDescription',
              'Monthly repayment and collection finance.'
            )}
          </p>

          <span>
            {t(
              'openMonthlyLoan',
              'Open Monthly Loan'
            )} →
          </span>

        </button>

        {/* =====================================
            INTEREST ONLY
        ====================================== */}

        <button
          type="button"
          className="finance-type-card interest-finance-card"
          onClick={() =>
            openLoan(
              'interest_only'
            )
          }
        >

          <div className="finance-type-icon">
            %
          </div>

          <h2>
            {t(
              'interestOnlyLoan',
              'Interest-Only Loan'
            )}
          </h2>

          <p>
            {t(
              'interestOnlyLoanDescription',
              'Principal and percentage-based interest calculation.'
            )}
          </p>

          <div className="interest-mini-formula">
            {t(
              'interestOnlyFormula',
              'Interest = (Principal / 100) × Rate'
            )}
          </div>

          <span>
            {t(
              'openInterestOnly',
              'Open Interest-Only'
            )} →
          </span>

        </button>

      </div>

    </div>
  )
}

export default CustomerFinance