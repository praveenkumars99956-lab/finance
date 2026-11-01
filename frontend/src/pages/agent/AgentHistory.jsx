import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance } from '../../services/agentAssignments'

function AgentHistory() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadHistory()
  }, [])

  // =========================================
  // LOAD AGENT COLLECTION HISTORY
  // =========================================

  const loadHistory = async () => {
    setLoading(true)

    try {
      // =====================================
      // LOGIN SESSION
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

        await supabase.auth.signOut()
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
          await supabase.auth.signOut()
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

        await supabase.auth.signOut()
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
          category_id,
          collection_type
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
        setPayments([])
        return
      }

      // =====================================
      // GET ASSIGNED FINANCE RECORDS
      // =====================================

      const {
        data: financeData,
        error: financeError
      } = await supabase
        .from('finance_records')
        .select(`
          id,
          finance_type,
          collection_category_id,
          customers (
            id,
            customer_id,
            full_name,
            phone
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

      if (financeError) {
        console.error(
          'FINANCE ERROR:',
          financeError
        )

        alert(
          t('agentUnableLoadFinanceAccounts', { message: financeError.message })
        )

        return
      }

      const financeRecords = filterAssignedFinance(financeData, assignmentData)

      const financeIds =
        financeRecords
          .map(
            (record) =>
              record.id
          )
          .filter(Boolean)

      if (financeIds.length === 0) {
        setPayments([])
        return
      }

      // =====================================
      // LOAD PAYMENT HISTORY
      // =====================================

      const {
        data: paymentData,
        error: paymentError
      } = await supabase
        .from('finance_payments')
        .select('*')
        .in(
          'finance_record_id',
          financeIds
        )
        .order(
          'payment_date',
          {
            ascending: false
          }
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )

      if (paymentError) {
        console.error(
          'PAYMENT ERROR:',
          paymentError
        )

        alert(
          t('unableLoadCollectionHistory', { message: paymentError.message })
        )

        return
      }

      // =====================================
      // ADD CUSTOMER + FINANCE DETAILS
      // =====================================

      const combinedPayments =
        (paymentData || [])
          .map(
            (payment) => {
              const financeRecord =
                financeRecords.find(
                  (record) =>
                    Number(record.id) ===
                    Number(
                      payment.finance_record_id
                    )
                )

              return {
                ...payment,

                finance:
                  financeRecord || null,

                customer:
                  financeRecord
                    ?.customers || null,

                category:
                  financeRecord
                    ?.collection_categories ||
                  null
              }
            }
          )

      setPayments(
        combinedPayments
      )
    } catch (error) {
      console.error(
        'AGENT HISTORY ERROR:',
        error
      )

      alert(
        error instanceof Error
          ? t('unableLoadCollectionHistory', { message: error.message })
          : t('unableLoadCollectionHistoryFallback')
      )
    } finally {
      setLoading(false)
    }
  }

  // =========================================
  // MONEY
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
  // DATE
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
  // LOAN TYPE
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

  const filteredPayments =
    payments.filter(
      (payment) => {
        const value =
          search
            .trim()
            .toLowerCase()

        if (!value) {
          return true
        }

        const values = [
          payment.customer?.full_name,
          payment.customer?.customer_id,
          payment.customer?.phone,
          payment.category?.category_name,
          payment.finance?.finance_type,
          payment.payment_date,
          payment.payment_amount
        ]

        return values.some(
          (item) =>
            String(item || '')
              .toLowerCase()
              .includes(value)
        )
      }
    )

  // =========================================
  // TOTAL COLLECTED
  // =========================================

  const totalCollected =
    payments.reduce(
      (total, payment) =>
        total +
        Number(
          payment.payment_amount || 0
        ),
      0
    )

  // =========================================
  // TODAY COLLECTION
  // =========================================

  const today =
    new Date()
      .toISOString()
      .split('T')[0]

  const todayPayments =
    payments.filter(
      (payment) =>
        String(
          payment.payment_date || ''
        ).split('T')[0] === today
    )

  const todayCollected =
    todayPayments.reduce(
      (total, payment) =>
        total +
        Number(
          payment.payment_amount || 0
        ),
      0
    )

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
            {t('loadingCollectionHistory')}
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
            {t('collectionHistory')}
          </h1>

          <span>
            {t('myCollectionTransactions')}
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

      {/* AGENT */}

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
            {t('totalTransactions')}
          </span>

          <strong>
            {payments.length}
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
            {t('todaysTransactions')}
          </span>

          <strong>
            {todayPayments.length}
          </strong>
        </div>

        <div>
          <span>
            {t('todaysCollection')}
          </span>

          <strong>
            ₹{formatMoney(
              todayCollected
            )}
          </strong>
        </div>

      </div>

      {/* HISTORY */}

      <div className="daily-manage-section">

        <h2>
          {t('collectionTransactions')}
        </h2>

        <p>
          {t('assignedFinanceCollectionHistory')}
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
            placeholder={t('searchCollectionHistory')}
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={{
              width: '100%',
              maxWidth: '650px',
              padding: '12px 14px',
              border:
                '1px solid #d7e0ec',
              borderRadius: '10px',
              fontSize: '15px',
              boxSizing: 'border-box'
            }}
          />

        </div>

        {
          filteredPayments.length === 0
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
                  {t('noCollectionHistory')}
                </h3>

                <p>
                  {t('noCollectionTransactionsFound')}
                </p>

              </div>
            )
            : (
              <div
                style={{
                  overflowX: 'auto'
                }}
              >

                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    minWidth: '900px'
                  }}
                >

                  <thead>

                    <tr
                      style={{
                        background:
                          '#f8fafc'
                      }}
                    >

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('date')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('customer')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('collectionCategory')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('loanType')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('amount')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('balanceBefore')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('balanceAfter')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('action')}
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {
                      filteredPayments.map(
                        (payment) => (
                          <tr
                            key={payment.id}
                            style={{
                              borderTop:
                                '1px solid #e5e7eb'
                            }}
                          >

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              {formatDate(
                                payment
                                  .payment_date
                              )}
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >

                              <strong>
                                {
                                  payment
                                    .customer
                                    ?.full_name ||
                                  '-'
                                }
                              </strong>

                              <div
                                style={{
                                  fontSize:
                                    '12px',
                                  marginTop:
                                    '4px'
                                }}
                              >
                                {
                                  payment
                                    .customer
                                    ?.customer_id ||
                                  '-'
                                }
                              </div>

                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              {
                                payment
                                  .category
                                  ?.category_name ||
                                '-'
                              }
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              {getLoanName(
                                payment
                                  .finance
                                  ?.finance_type
                              )}
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              <strong>
                                ₹{formatMoney(
                                  payment
                                    .payment_amount
                                )}
                              </strong>
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              ₹{formatMoney(
                                payment
                                  .balance_before
                              )}
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              ₹{formatMoney(
                                payment
                                  .balance_after
                              )}
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >

                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/agent/collection/${payment.finance_record_id}`
                                  )
                                }
                              >
                                {t('viewProfile')}
                              </button>

                            </td>

                          </tr>
                        )
                      )
                    }

                  </tbody>

                </table>

              </div>
            )
        }

      </div>

    </div>
  )
}

export default AgentHistory