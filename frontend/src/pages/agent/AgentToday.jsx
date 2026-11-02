import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance } from '../../services/agentAssignments'

function AgentToday() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadTodayCollections()
  }, [])

  // =========================================
  // LOAD TODAY'S COLLECTIONS
  // =========================================

  const loadTodayCollections = async () => {
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
      // VERIFY AGENT ROLE
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
      // GET ASSIGNED CATEGORIES
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

      if (categoryIds.length === 0) {
        setRecords([])
        return
      }

      // =====================================
      // TODAY
      // =====================================

      const today =
        new Date()
          .toISOString()
          .split('T')[0]

      // =====================================
      // LOAD ASSIGNED FINANCE RECORDS
      // =====================================
      //
      // We load the Agent's assigned accounts
      // first, then determine which accounts
      // are due today.
      //
      // This works with the existing
      // next_due_date column already used in
      // AgentCollection.jsx.
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
          'next_due_date',
          {
            ascending: true
          }
        )

      if (financeError) {
        console.error(
          'FINANCE ERROR:',
          financeError
        )

        alert(
          t('unableLoadTodaysCollections', { message: financeError.message })
        )

        return
      }

      // =====================================
      // FILTER TODAY'S COLLECTIONS
      // =====================================

      const todayRecords = filterAssignedFinance(financeData, assignmentData).filter(
        (record) => {
          const pending =
            Number(
              record.pending || 0
            )

          if (pending <= 0) {
            return false
          }

          if (!record.next_due_date) {
            return false
          }

          return (
            String(
              record.next_due_date
            ).split('T')[0] === today
          )
        }
      )

      setRecords(todayRecords)
    } catch (error) {
      console.error(
        'TODAY COLLECTION ERROR:',
        error
      )

      alert(
        error instanceof Error
          ? t('unableLoadTodaysCollections', { message: error.message })
          : t('unableLoadTodaysCollectionsFallback')
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
  // DATE FORMAT
  // =========================================

  const formatDate = (value) => {
    if (!value) {
      return '-'
    }

    const dateValue =
      String(value).split('T')[0]

    const date =
      new Date(
        `${dateValue}T00:00:00`
      )

    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }

  // =========================================
  // LOAN NAME
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
  // SEARCH
  // =========================================

  const filteredRecords =
    records.filter(
      (record) => {
        const value =
          search
            .trim()
            .toLowerCase()

        if (!value) {
          return true
        }

        const customer =
          record.customers

        const searchValues = [
          customer?.full_name,
          customer?.customer_id,
          customer?.phone,
          customer?.address,
          record.finance_type,
          record
            .collection_categories
            ?.category_name
        ]

        return searchValues.some(
          (item) =>
            String(item || '')
              .toLowerCase()
              .includes(value)
        )
      }
    )

  // =========================================
  // TOTAL PENDING
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
            textAlign: 'center',
            padding: '40px'
          }}
        >
          <h2>
            {t('appName')}
          </h2>

          <p>
            {t('loadingTodaysCollections')}
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
            {t('todaysCollectionsTitle')}
          </h1>

          <span>
            {t('collectionsDueToday')}
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
              {t('date')}
            </span>

            <strong>
              {new Date().toLocaleDateString(
                { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
              )}
            </strong>
          </div>

        </div>

      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('dueToday')}
          </span>

          <strong>
            {records.length}
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

      {/* COLLECTION LIST */}

      <div className="daily-manage-section">

        <h2>
          {t('todaysAssignedCustomers')}
        </h2>

        <p>
          {t('assignedCollectionsDueTodayDescription')}
        </p>

        {/* SEARCH */}

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

        {/* EMPTY */}

        {
          filteredRecords.length === 0
            ? (
              <div
                style={{
                  padding: '25px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '12px'
                }}
              >

                <h3>
                  {t('noCollectionsDueToday')}
                </h3>

                <p>
                  {t('noAssignedCustomerCollectionsDueToday')}
                </p>

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

                      const category =
                        record
                          .collection_categories
                          ?.category_name ||
                        t('notAssigned')

                      const paid =
                        Number(
                          record.paid || 0
                        )

                      const pending =
                        Number(
                          record.pending || 0
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
                            background:
                              '#ffffff',
                            border:
                              '1px solid #d7e0ec',
                            borderRadius:
                              '14px',
                            padding:
                              '18px',
                            boxShadow:
                              '0 2px 8px rgba(0,0,0,0.04)'
                          }}
                        >

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
                              background:
                                '#eef5ff',
                              padding:
                                '10px',
                              borderRadius:
                                '8px',
                              margin:
                                '12px 0'
                            }}
                          >

                            <small>
                              {t('collectionCategory').toUpperCase()}
                            </small>

                            <div>
                              <strong>
                                {category}
                              </strong>
                            </div>

                          </div>

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
                              {t('loanType')}:
                            </strong>{' '}

                            {getLoanName(
                              record.finance_type
                            )}
                          </p>

                          <p>
                            <strong>
                              {t('dueDate')}:
                            </strong>{' '}

                            {formatDate(
                              record.next_due_date
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
                            {t('collectPayment')}
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

export default AgentToday