import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance } from '../../services/agentAssignments'

function AgentSettlementSummary() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettlementSummary()
  }, [])

  // =========================================
  // LOAD SETTLEMENT SUMMARY
  // =========================================

  const loadSettlementSummary = async () => {
    setLoading(true)

    try {
      // =====================================
      // GET CURRENT LOGIN
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
      // GET AGENT CATEGORY ASSIGNMENTS
      // =====================================

      const {
        data: assignmentData,
        error: assignmentError
      } = await supabase
        .from('category_agent_assignments')
        .select('category_id, collection_type')
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
      // GET AGENT FINANCE ACCOUNTS
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
            full_name
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
            (item) =>
              item.id
          )
          .filter(Boolean)

      if (financeIds.length === 0) {
        setPayments([])
        return
      }

      // =====================================
      // GET PAYMENTS
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
          t('unableLoadSettlementSummary', { message: paymentError.message })
        )

        return
      }

      // =====================================
      // ATTACH FINANCE + CUSTOMER INFO
      // =====================================

      const combined =
        (paymentData || [])
          .map(
            (payment) => {
              const finance =
                financeRecords.find(
                  (item) =>
                    Number(item.id) ===
                    Number(
                      payment.finance_record_id
                    )
                )

              return {
                ...payment,
                finance:
                  finance || null,
                customer:
                  finance?.customers ||
                  null,
                category:
                  finance
                    ?.collection_categories ||
                  null
              }
            }
          )

      setPayments(combined)
    } catch (error) {
      console.error(
        'SETTLEMENT SUMMARY ERROR:',
        error
      )

      alert(
        error instanceof Error
          ? t('unableLoadSettlementSummary', { message: error.message })
          : t('unableLoadSettlementSummaryFallback')
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

    const cleanDate =
      String(value).split('T')[0]

    const date =
      new Date(
        `${cleanDate}T00:00:00`
      )

    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }

  // =========================================
  // TODAY
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

  // =========================================
  // TODAY COLLECTED
  // =========================================

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
  // GROUP TODAY BY CATEGORY
  // =========================================

  const categorySummary = {}

  todayPayments.forEach(
    (payment) => {
      const categoryName =
        payment.category
          ?.category_name ||
        t('uncategorized')

      if (
        !categorySummary[
          categoryName
        ]
      ) {
        categorySummary[
          categoryName
        ] = {
          count: 0,
          amount: 0
        }
      }

      categorySummary[
        categoryName
      ].count += 1

      categorySummary[
        categoryName
      ].amount +=
        Number(
          payment.payment_amount || 0
        )
    }
  )

  const categoryRows =
    Object.entries(
      categorySummary
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
            {t('loadingSettlementSummary')}
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
            {t('settlementSummary')}
          </h1>

          <span>
            {t('myCollectionSummary')}
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
              {t('date')}
            </span>

            <strong>
              {new Date()
                .toLocaleDateString(
                  'en-IN'
                )}
            </strong>
          </div>

        </div>

      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

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

      </div>

      {/* CATEGORY SUMMARY */}

      <div className="daily-manage-section">

        <h2>
          {t('todaysCategorySummary')}
        </h2>

        {
          categoryRows.length === 0
            ? (
              <div
                style={{
                  padding: '25px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '12px'
                }}
              >
                {t('noCollectionsRecordedToday')}
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
                      'collapse'
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
                        {t('collectionCategory')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('transactions')}
                      </th>

                      <th
                        style={{
                          padding: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {t('collected')}
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {
                      categoryRows.map(
                        ([
                          categoryName,
                          summary
                        ]) => (
                          <tr
                            key={
                              categoryName
                            }
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
                              <strong>
                                {
                                  categoryName
                                }
                              </strong>
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              {
                                summary.count
                              }
                            </td>

                            <td
                              style={{
                                padding:
                                  '12px'
                              }}
                            >
                              <strong>
                                ₹{formatMoney(
                                  summary.amount
                                )}
                              </strong>
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

      {/* TODAY TRANSACTIONS */}

      <div className="daily-manage-section">

        <h2>
          {t('todaysCollectionsTitle')}
        </h2>

        {
          todayPayments.length === 0
            ? (
              <div
                style={{
                  padding: '25px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '12px'
                }}
              >
                {t('noTransactionsToday')}
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
                    minWidth: '750px',
                    borderCollapse:
                      'collapse'
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
                        {t('amount')}
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {
                      todayPayments.map(
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
                                    '12px'
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
                              <strong>
                                ₹{formatMoney(
                                  payment
                                    .payment_amount
                                )}
                              </strong>
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

export default AgentSettlementSummary