import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance } from '../../services/agentAssignments'

function AgentLoans() {
  const navigate = useNavigate()
  const { type } = useParams()
  const { t, i18n } = useTranslation()

  const [agent, setAgent] = useState(null)
  const [records, setRecords] = useState([])
  const [assignedCategories, setAssignedCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const normalizeType = (value) => {
    const cleanValue = String(value || '')
      .trim()
      .toLowerCase()

    if (
      cleanValue === 'interest-only' ||
      cleanValue === 'interestonly'
    ) {
      return 'interest_only'
    }

    return cleanValue
  }

  const financeType = normalizeType(type)

  const allowedTypes = [
    'daily',
    'weekly',
    'monthly',
    'interest_only'
  ]

  const getTitle = () => {
    if (financeType === 'daily') {
      return t('dailyLoan')
    }

    if (financeType === 'weekly') {
      return t('weeklyLoan')
    }

    if (financeType === 'monthly') {
      return t('monthlyLoan')
    }

    if (financeType === 'interest_only') {
      return t('interestOnlyLoan')
    }

    return t('finance')
  }

  useEffect(() => {
    loadAgentLoans()
  }, [type])

  const loadAgentLoans = async () => {
    setLoading(true)
    setRecords([])
    setAssignedCategories([])

    try {
      // =========================================
      // VALIDATE FINANCE TYPE
      // =========================================

      if (!allowedTypes.includes(financeType)) {
        alert(t('invalidLoanType'))
        navigate('/agent')
        return
      }

      // =========================================
      // GET LOGIN SESSION
      // =========================================

      const {
        data: sessionData,
        error: sessionError
      } = await supabase.auth.getSession()

      if (
        sessionError ||
        !sessionData?.session?.user
      ) {
        alert(
          t('agentLoginSessionEnded')
        )

        navigate('/')
        return
      }

      const loggedInUser =
        sessionData.session.user

      // =========================================
      // VERIFY AGENT ROLE
      // =========================================

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

      // =========================================
      // GET CURRENT AGENT
      // =========================================

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

      // =========================================
      // GET CATEGORIES ASSIGNED TO THIS AGENT
      // =========================================

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
          status,
          collection_categories (
            category_name
          )
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

      const eligibleAssignments = (
        assignmentData || []
        .filter((assignment) => {
          const assignedType = String(assignment.collection_type || '').trim().toLowerCase()
          return !assignedType || assignedType === 'all' || assignedType === financeType
        })
      )

      const categoriesById = new Map()
      eligibleAssignments.forEach((assignment) => {
        if (assignment.category_id) {
          categoriesById.set(String(assignment.category_id), {
            id: assignment.category_id,
            name: assignment.collection_categories?.category_name || ''
          })
        }
      })
      setAssignedCategories([...categoriesById.values()])

      const categoryIds = [...new Set(eligibleAssignments
        .map(
          (assignment) =>
            assignment.category_id
        )
        .filter(Boolean))]

      // No category assigned to this Agent.

      if (categoryIds.length === 0) {
        setRecords([])
        return
      }

      // =========================================
      // GET ONLY THIS AGENT'S LOANS
      // =========================================

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
        .in('loan_status', ['active', 'Active'])
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
          t('unableLoadLoanTypeCollections', {
            loanType: getTitle(),
            message: financeError.message
          })
        )

        return
      }

      setRecords(filterAssignedFinance(
        (financeData || []).filter((record) =>
          normalizeType(record.finance_type) === financeType
        ),
        eligibleAssignments
      ))
    } catch (error) {
      console.error(
        'AGENT LOANS ERROR:',
        error
      )

      alert(
        error instanceof Error
          ? t('unableLoadCollections', { message: error.message })
          : t('unableLoadCollectionsFallback')
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
  // TOTALS
  // =========================================

  const totalCollected =
    records.reduce(
      (total, record) =>
        total +
        Number(record.paid || 0),
      0
    )

  const totalPending =
    records.reduce(
      (total, record) =>
        total +
        Number(record.pending || 0),
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
        <p>
          {t('loadingAgentCollections', { loanType: getTitle() })}
        </p>
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
            {t('loanTypeCollections', { loanType: getTitle() })}
          </h1>

          <span>
            {t('agentCollectionManagement')}
          </span>
        </div>

        <button
          className="back-button"
          type="button"
          onClick={() =>
            navigate('/agent')
          }
        >
          ← {t('back')}
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
              {t('loanType')}
            </span>

            <strong>
              {getTitle()}
            </strong>
          </div>

        </div>

      </div>

      <div className="daily-manage-section">
        <div className="payment-history-heading">
          <div>
            <h2>{t('assignedCategoriesForLoanType', { loanType: getTitle() })}</h2>
            <p>
              {assignedCategories.length
                ? assignedCategories.map((category) => category.name || `${t('collectionCategory')} #${category.id}`).join(', ')
                : t('noVisibleAgentAssignment', { loanType: getTitle() })}
            </p>
          </div>
          <button
            type="button"
            className="back-button"
            onClick={loadAgentLoans}
            disabled={loading}
          >
            {loading ? t('loadingAgentCollections', { loanType: getTitle() }) : t('refreshAssignments')}
          </button>
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
            Total Pending
          </span>

          <strong>
            ₹{formatMoney(
              totalPending
            )}
          </strong>
        </div>

      </div>

      {/* CUSTOMERS */}

      <div className="daily-manage-section">

        <h2>
          {t('assignedCustomers')}
        </h2>

        <p>
          {t('onlyYourAssignedCollections', { loanType: getTitle() })}
        </p>

        {
          records.length === 0
            ? (
              <div className="no-payment-history">
                {assignedCategories.length
                  ? t('noActiveLoansInAssignedCategories', { loanType: getTitle() })
                  : t('noAssignedCollections', { loanType: getTitle() })}
              </div>
            )
            : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(290px, 1fr))',
                  gap: '16px',
                  marginTop: '20px'
                }}
              >

                {
                  records.map(
                    (record) => {

                      const customer =
                        record.customers

                      const category =
                        record
                          .collection_categories
                          ?.category_name ||
                        'Not Assigned'

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
                              '#ffffff'
                          }}
                        >

                          <small>
                            {t('customer').toUpperCase()}
                          </small>

                          <h3>
                            {
                              customer?.full_name ||
                              record.name ||
                              '-'
                            }
                          </h3>

                          <p>
                            {t('customerId')}:{' '}
                            <strong>
                              {
                                customer?.customer_id ||
                                '-'
                              }
                            </strong>
                          </p>

                          <div
                            style={{
                              background:
                                '#eef5ff',
                              padding:
                                '10px',
                              borderRadius:
                                '8px',
                              marginBottom:
                                '12px'
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

                          <div
                            style={{
                              background:
                                '#f6f8fb',
                              padding:
                                '12px',
                              borderRadius:
                                '8px'
                            }}
                          >

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
                                {t('amount')}:
                              </strong>{' '}

                              ₹{formatMoney(
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
                                {t('nextDue')}:
                              </strong>{' '}

                              {
                                record.next_due_date ||
                                '-'
                              }
                            </p>

                          </div>

                          <button
                            className="record-payment-button"
                            style={{
                              width: '100%',
                              marginTop: '12px'
                            }}
                            onClick={() =>
                              openCollection(
                                record
                              )
                            }
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

export default AgentLoans