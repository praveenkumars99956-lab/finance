import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance } from '../../services/agentAssignments'

function AgentCustomers() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadCustomers()
  }, [])

  // =========================================
  // LOAD LOGGED-IN AGENT CUSTOMERS
  // =========================================

  const loadCustomers = async () => {
    setLoading(true)

    try {
      // =====================================
      // GET LOGIN SESSION
      // =====================================

      const {
        data: sessionData,
        error: sessionError
      } = await supabase.auth.getSession()

      if (
        sessionError ||
        !sessionData?.session?.user
      ) {
        alert(t('pleaseLoginAgain'))
        navigate('/')
        return
      }

      const loggedInUser =
        sessionData.session.user

      // =====================================
      // VERIFY ROLE
      // =====================================

      const {
        data: profileData,
        error: profileError
      } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', loggedInUser.id)
        .single()

      if (profileError) {
        console.error(
          'PROFILE ERROR:',
          profileError
        )

        alert(
          t('unableVerifyAgentLogin')
        )

        await supabase.auth.signOut({ scope: 'local' })
        navigate('/')
        return
      }

      const role = String(
        profileData?.role || ''
      )
        .trim()
        .toLowerCase()

      if (role !== 'agent') {
        if (role === 'admin') {
          navigate('/admin')
        } else if (role === 'client') {
          navigate('/client')
        } else {
          await supabase.auth.signOut({ scope: 'local' })
          navigate('/')
        }

        return
      }

      // =====================================
      // GET CURRENT AGENT
      // =====================================

      const {
        data: agentData,
        error: agentError
      } = await supabase
        .from('agents')
        .select(`
          id,
          agent_id,
          full_name,
          phone,
          email,
          address,
          status,
          auth_user_id
        `)
        .eq(
          'auth_user_id',
          loggedInUser.id
        )
        .single()

      if (agentError) {
        console.error(
          'AGENT ERROR:',
          agentError
        )

        alert(
          t('unableLoadAgentAccount')
        )

        return
      }

      if (!agentData) {
        alert(
          t('agentAccountNotFound')
        )

        return
      }

      if (
        String(agentData.status || '')
          .trim()
          .toLowerCase() !== 'active'
      ) {
        alert(
          t('agentAccountInactive')
        )

        await supabase.auth.signOut({ scope: 'local' })
        navigate('/')
        return
      }

      setAgent(agentData)

      // =====================================
      // GET AGENT CATEGORY ASSIGNMENTS
      // =====================================

      const {
        data: assignmentData,
        error: assignmentError
      } = await supabase
        .from('category_agent_assignments')
        .select(`
          id,
          category_id,
          collection_type,
          agent_id,
          status
        `)
        .eq(
          'agent_id',
          agentData.id
        )
        .eq(
          'status',
          'active'
        )

      if (assignmentError) {
        console.error(
          'ASSIGNMENT ERROR:',
          assignmentError
        )

        alert(
          t('unableLoadAssignments', { message: assignmentError.message })
        )

        return
      }

      const categoryIds = (
        assignmentData || []
      )
        .map(
          (item) =>
            item.category_id
        )
        .filter(Boolean)

      // No categories assigned

      if (categoryIds.length === 0) {
        setRecords([])
        return
      }

      // =====================================
      // GET FINANCE RECORDS
      // =====================================

      const {
        data: financeData,
        error: financeError
      } = await supabase
        .from('finance_records')
        .select(`
          *,
          customers (
            id,
            customer_id,
            full_name,
            phone,
            address,
            status
          ),
          collection_categories (
            id,
            category_name
          )
        `)
        .in(
          'collection_category_id',
          categoryIds
        )
        .eq(
          'loan_status',
          'active'
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )

      if (financeError) {
        console.error(
          'FINANCE ERROR:',
          financeError
        )

        alert(
          t('unableLoadAssignedCustomers', { message: financeError.message })
        )

        return
      }

      setRecords(filterAssignedFinance(financeData, assignmentData))
    } catch (error) {
      console.error(
        'AGENT CUSTOMERS ERROR:',
        error
      )

      alert(
        error instanceof Error
          ? t('unableLoadAssignedCustomers', { message: error.message })
          : t('unableLoadAssignedCustomersFallback')
      )
    } finally {
      setLoading(false)
    }
  }

  // =========================================
  // MONEY FORMAT
  // =========================================

  const formatMoney = (value) => {
    return Number(
      value || 0
    ).toLocaleString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }

  // =========================================
  // LOAN TYPE NAME
  // =========================================

  const getLoanName = (type) => {
    const value = String(
      type || ''
    )
      .trim()
      .toLowerCase()

    if (value === 'daily') {
      return t('dailyLoan')
    }

    if (value === 'weekly') {
      return t('weeklyLoan')
    }

    if (value === 'monthly') {
      return t('monthlyLoan')
    }

    if (
      value === 'interest_only' ||
      value === 'interest-only'
    ) {
      return t('interestOnlyLoan')
    }

    return type || '-'
  }

  // =========================================
  // REMOVE DUPLICATE FINANCE RECORDS
  // =========================================
  // We keep finance accounts separately because
  // one customer may have multiple finance accounts.

  const filteredRecords =
    records.filter(
      (record) => {
        const customer =
          record.customers

        const searchText =
          search
            .trim()
            .toLowerCase()

        if (!searchText) {
          return true
        }

        const values = [
          customer?.full_name,
          customer?.customer_id,
          customer?.phone,
          customer?.address,
          record.name,
          record.finance_type,
          record
            .collection_categories
            ?.category_name
        ]

        return values.some(
          (value) =>
            String(value || '')
              .toLowerCase()
              .includes(searchText)
        )
      }
    )

  // =========================================
  // TOTALS
  // =========================================

  const totalPending =
    records.reduce(
      (total, record) =>
        total +
        Number(
          record.pending || 0
        ),
      0
    )

  const totalCollected =
    records.reduce(
      (total, record) =>
        total +
        Number(
          record.paid || 0
        ),
      0
    )

  // =========================================
  // OPEN COLLECTION
  // =========================================

  const openCollection = (record) => {
    navigate(
      `/agent/collection/${record.id}`
    )
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="customer-profile-page">

        <div
          style={{
            padding: '40px',
            textAlign: 'center'
          }}
        >
          <h2>
            {t('appName')}
          </h2>

          <p>
            {t('loadingMyCustomers')}
          </p>
        </div>

      </div>
    )
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page">

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>
          <p>
            {t('appName')}
          </p>

          <h1>
            {t('myCustomers')}
          </h1>

          <span>
            {t('assignedCustomerAccounts')}
          </span>
        </div>

        <button
          className="back-button"
          onClick={() =>
            navigate('/agent')
          }
        >
          ← {t('agentDashboard')}
        </button>

      </div>

      {/* AGENT INFORMATION */}

      <div className="daily-manage-section">

        <div className="daily-info-grid">

          <div>
            <span>
              {t('agent')}
            </span>

            <strong>
              {agent?.full_name || '-'}
            </strong>
          </div>

          <div>
            <span>
              {t('agentIdLabel')}
            </span>

            <strong>
              {agent?.agent_id || '-'}
            </strong>
          </div>

          <div>
            <span>
              {t('status')}
            </span>

            <strong>
              {['active', 'inactive'].includes(String(agent?.status).toLowerCase())
                ? t(String(agent.status).toLowerCase())
                : agent?.status || '-'}
            </strong>
          </div>

        </div>

      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('assignedAccounts')}
          </span>

          <strong>
            {records.length}
          </strong>
        </div>

        <div>
          <span>
            {t('totalCollected')}
          </span>

          <strong>
            ₹{formatMoney(
              totalCollected
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('totalPending')}
          </span>

          <strong>
            ₹{formatMoney(
              totalPending
            )}
          </strong>
        </div>

      </div>

      {/* SEARCH */}

      <div className="daily-manage-section">

        <h2>
          {t('assignedCustomers')}
        </h2>

        <p>
          {t('assignedCustomersDescription')}
        </p>

        <div
          style={{
            marginTop: '18px',
            marginBottom: '20px'
          }}
        >

          <input
            type="text"
            placeholder={t('searchAgentCustomers')}
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={{
              width: '100%',
              maxWidth: '600px',
              padding: '12px 14px',
              border:
                '1px solid #d7e0ec',
              borderRadius: '10px',
              fontSize: '15px',
              boxSizing: 'border-box'
            }}
          />

        </div>

        {/* NO CUSTOMERS */}

        {
          filteredRecords.length === 0
            ? (
              <div className="no-payment-history">

                {
                  records.length === 0
                    ? (
                      <>
                        {t('noCustomersAssignedToAgent')}
                      </>
                    )
                    : (
                      <>
                        {t('noCustomersMatchSearch')}
                      </>
                    )
                }

              </div>
            )
            : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px'
                }}
              >

                {
                  filteredRecords.map(
                    (record) => {

                      const customer =
                        record.customers

                      const categoryName =
                        record
                          .collection_categories
                          ?.category_name ||
                        t('notAssigned')

                      const pending =
                        Number(
                          record.pending || 0
                        )

                      const paid =
                        Number(
                          record.paid || 0
                        )

                      let status =
                        'pending'

                      if (pending <= 0) {
                        status = 'paid'
                      } else if (paid > 0) {
                        status =
                          'partiallyPaid'
                      }

                      return (
                        <div
                          key={record.id}
                          style={{
                            border:
                              '1px solid #d7e0ec',
                            borderRadius:
                              '14px',
                            padding:
                              '18px',
                            background:
                              '#ffffff',
                            boxShadow:
                              '0 2px 8px rgba(0,0,0,0.04)'
                          }}
                        >

                          {/* CUSTOMER */}

                          <small>
                            {t('customer').toUpperCase()}
                          </small>

                          <h3
                            style={{
                              marginTop:
                                '6px',
                              marginBottom:
                                '5px'
                            }}
                          >
                            {
                              customer
                                ?.full_name ||
                              record.name ||
                              '-'
                            }
                          </h3>

                          <p>
                            {t('customerId')}:{' '}

                            <strong>
                              {
                                customer
                                  ?.customer_id ||
                                '-'
                              }
                            </strong>
                          </p>

                          {/* CATEGORY */}

                          <div
                            style={{
                              padding:
                                '10px',
                              background:
                                '#eef5ff',
                              borderRadius:
                                '8px',
                              marginTop:
                                '12px',
                              marginBottom:
                                '12px'
                            }}
                          >
                            <small>
                              {t('collectionCategory').toUpperCase()}
                            </small>

                            <div>
                              <strong>
                                {categoryName}
                              </strong>
                            </div>
                          </div>

                          {/* CUSTOMER DETAILS */}

                          <p>
                            <strong>
                              {t('phone')}:
                            </strong>{' '}

                            {
                              customer?.phone ||
                              '-'
                            }
                          </p>

                          <p>
                            <strong>
                              {t('address')}:
                            </strong>{' '}

                            {
                              customer?.address ||
                              '-'
                            }
                          </p>

                          {/* FINANCE */}

                          <hr
                            style={{
                              border: 0,
                              borderTop:
                                '1px solid #e5e7eb',
                              margin:
                                '15px 0'
                            }}
                          />

                          <p>
                            <strong>
                              {t('loanType')}:
                            </strong>{' '}

                            {getLoanName(
                              record.finance_type
                            )}
                          </p>

                          <p>
                            <strong>
                              {t('principal')}:
                            </strong>{' '}

                            ₹{formatMoney(
                              record
                                .principal_amount ||
                              record.amount
                            )}
                          </p>

                          <p>
                            <strong>
                              {t('collected')}:
                            </strong>{' '}

                            ₹{formatMoney(
                              record.paid
                            )}
                          </p>

                          <p>
                            <strong>
                              {t('pending')}:
                            </strong>{' '}

                            ₹{formatMoney(
                              record.pending
                            )}
                          </p>

                          <p>
                            <strong>
                              {t('status')}:
                            </strong>{' '}

                            {t(status)}
                          </p>

                          {/* BUTTON */}

                          <button
                            type="button"
                            className="record-payment-button"
                            onClick={() =>
                              openCollection(
                                record
                              )
                            }
                            style={{
                              width: '100%',
                              marginTop:
                                '12px'
                            }}
                          >
                            {t('viewOrCollect')}
                          </button>

                        </div>
                      )
                    }
                  )
                }

              </div>
            )
        }

      </div>

    </div>
  )
}

export default AgentCustomers