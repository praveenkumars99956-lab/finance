import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function Collections() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [financeType, setFinanceType] = useState('all')

  const [totalAmount, setTotalAmount] = useState(0)
  const [todayAmount, setTodayAmount] = useState(0)

  useEffect(() => {
    loadCollections()
  }, [])

  const formatMoney = (value) => {
    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return Number(value || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatDate = (value) => {
    if (!value) return '-'

    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN')
  }

  const loadCollections = async () => {
    setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      navigate('/')
      return
    }

    // ---------------------------------------
    // LOAD PAYMENTS + FINANCE + CUSTOMER
    // ---------------------------------------

    const {
      data: paymentData,
      error: paymentError
    } = await supabase
      .from('finance_payments')
      .select(`
        id,
        finance_record_id,
        payment_date,
        payment_amount,
        balance_before,
        balance_after,
        created_at,

        finance_records (
          id,
          finance_type,
          amount,
          paid,
          pending,
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
        )
      `)
      .order('created_at', {
        ascending: false
      })

    if (paymentError) {
      console.error(
        'PAYMENT LOAD ERROR:',
        paymentError
      )

      alert(
        t('unableToLoadCollections', { message: paymentError.message })
      )

      setLoading(false)
      return
    }

    // ---------------------------------------
    // LOAD EVIDENCE
    // ---------------------------------------

    const {
      data: evidenceData,
      error: evidenceError
    } = await supabase
      .from('collection_evidence')
      .select(`
        id,
        payment_id,
        agent_id,
        latitude,
        longitude,
        proof_file_path,
        captured_at,

        agents (
          id,
          agent_id,
          full_name
        )
      `)

    if (evidenceError) {
      console.error(
        'EVIDENCE LOAD ERROR:',
        evidenceError
      )
    }

    // ---------------------------------------
    // LOAD CATEGORY -> AGENT ASSIGNMENTS
    // Used as fallback for older payments
    // without collection evidence.
    // ---------------------------------------

    const {
      data: assignmentData,
      error: assignmentError
    } = await supabase
      .from('category_agent_assignments')
      .select(`
        category_id,
        status,

        agents (
          id,
          agent_id,
          full_name
        )
      `)
      .eq('status', 'active')

    if (assignmentError) {
      console.error(
        'ASSIGNMENT LOAD ERROR:',
        assignmentError
      )
    }

    const evidenceMap = {}

    for (const evidence of evidenceData || []) {
      evidenceMap[evidence.payment_id] = evidence
    }

    const assignmentMap = {}

    for (const assignment of assignmentData || []) {
      if (!assignmentMap[assignment.category_id]) {
        assignmentMap[assignment.category_id] =
          assignment.agents
      }
    }

    // ---------------------------------------
    // COMBINE DATA
    // ---------------------------------------

    const combined = (paymentData || []).map(
      (payment) => {
        const finance =
          payment.finance_records || {}

        const customer =
          finance.customers || {}

        const category =
          finance.collection_categories || {}

        const evidence =
          evidenceMap[payment.id] || null

        const fallbackAgent =
          assignmentMap[
            finance.collection_category_id
          ] || null

        const agent =
          evidence?.agents ||
          fallbackAgent ||
          null

        return {
          id: payment.id,

          financeRecordId:
            payment.finance_record_id,

          paymentDate:
            payment.payment_date,

          paymentAmount:
            Number(payment.payment_amount || 0),

          balanceBefore:
            Number(payment.balance_before || 0),

          balanceAfter:
            Number(payment.balance_after || 0),

          createdAt:
            payment.created_at,

          financeType:
            finance.finance_type || '-',

          customerId:
            customer.customer_id || '-',

          customerName:
            customer.full_name || '-',

          customerPhone:
            customer.phone || '-',

          categoryName:
            category.category_name ||
            'Not Assigned',

          agentName:
            agent?.full_name ||
            'Not Assigned',

          agentCode:
            agent?.agent_id || '-',

          latitude:
            evidence?.latitude ?? null,

          longitude:
            evidence?.longitude ?? null,

          proofPath:
            evidence?.proof_file_path || null,

          hasGps:
            evidence?.latitude != null &&
            evidence?.longitude != null,

          hasProof:
            Boolean(
              evidence?.proof_file_path
            )
        }
      }
    )

    setCollections(combined)

    const total = combined.reduce(
      (sum, item) =>
        sum + item.paymentAmount,
      0
    )

    setTotalAmount(total)

    const today =
      new Date().toISOString().split('T')[0]

    const todayTotal = combined
      .filter(
        (item) =>
          item.paymentDate === today
      )
      .reduce(
        (sum, item) =>
          sum + item.paymentAmount,
        0
      )

    setTodayAmount(todayTotal)

    setLoading(false)
  }

  // =========================================
  // FILTER
  // =========================================

  const filteredCollections =
    collections.filter((item) => {
      const text =
        search.toLowerCase().trim()

      const matchesSearch =
        !text ||
        item.customerName
          .toLowerCase()
          .includes(text) ||
        item.customerId
          .toLowerCase()
          .includes(text) ||
        item.agentName
          .toLowerCase()
          .includes(text) ||
        item.categoryName
          .toLowerCase()
          .includes(text)

      const matchesType =
        financeType === 'all' ||
        item.financeType === financeType

      return (
        matchesSearch &&
        matchesType
      )
    })

  // =========================================
  // OPEN PROOF
  // =========================================

  const viewProof = async (proofPath) => {
    if (!proofPath) {
      alert(t('noProofAvailable'))
      return
    }

    const {
      data,
      error
    } = await supabase.storage
      .from('collection-proofs')
      .createSignedUrl(
        proofPath,
        60
      )

    if (error) {
      console.error(
        'PROOF ERROR:',
        error
      )

      alert(
        t('unableToOpenProof', { message: error.message })
      )

      return
    }

    window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer'
    )
  }

  // =========================================
  // OPEN LOCATION
  // =========================================

  const viewLocation = (
    latitude,
    longitude
  ) => {
    if (
      latitude == null ||
      longitude == null
    ) {
      alert(
        t('gpsLocationUnavailable')
      )
      return
    }

    const url =
      `https://www.google.com/maps?q=${latitude},${longitude}`

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    )
  }

  if (loading) {
    return (
      <div className="customer-profile-page">
        <p>
          {t('loadingCollections')}
        </p>
      </div>
    )
  }

  return (
    <div className="customer-profile-page">

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>
          <p>{t('appName')}</p>

          <h1>
            {t('collections')}
          </h1>

          <span>
            {t('collectionsPageDescription')}
          </span>
        </div>

        <button
          className="back-button"
          onClick={() =>
            navigate('/admin')
          }
        >
          ← {t('adminDashboard')}
        </button>

      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('totalTransactions')}
          </span>

          <strong>
            {collections.length}
          </strong>
        </div>

        <div>
          <span>
            {t('totalCollected')}
          </span>

          <strong>
            ₹{formatMoney(
              totalAmount
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('todaysCollection')}
          </span>

          <strong>
            ₹{formatMoney(
              todayAmount
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('gpsAndProof')}
          </span>

          <strong>
            {
              collections.filter(
                (item) =>
                  item.hasGps &&
                  item.hasProof
              ).length
            }
          </strong>
        </div>

      </div>

      {/* COLLECTION LIST */}

      <div className="daily-manage-section">

        <h2>
          {t('collectionTransactions')}
        </h2>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '20px'
          }}
        >

          <input
            type="text"
            placeholder={t('searchCollections')}
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={{
              minWidth: '280px'
            }}
          />

          <select
            value={financeType}
            onChange={(e) =>
              setFinanceType(
                e.target.value
              )
            }
          >
            <option value="all">
              {t('allLoanTypes')}
            </option>

            <option value="daily">
              {t('dailyLoan')}
            </option>

            <option value="weekly">
              {t('weeklyLoan')}
            </option>

            <option value="monthly">
              {t('monthlyLoan')}
            </option>

            <option value="interest_only">
              {t('interestOnlyLoan')}
            </option>
          </select>

        </div>

        {filteredCollections.length === 0 ? (

          <div className="no-payment-history">
            {t('noCollectionTransactionsFound')}
          </div>

        ) : (

          <div
            style={{
              overflowX: 'auto'
            }}
          >

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}
            >

              <thead>
                <tr>

                  <th style={thStyle}>
                    {t('date')}
                  </th>

                  <th style={thStyle}>
                    {t('customer')}
                  </th>

                  <th style={thStyle}>
                    {t('agent')}
                  </th>

                  <th style={thStyle}>
                    {t('collectionCategory')}
                  </th>

                  <th style={thStyle}>
                    {t('loanType')}
                  </th>

                  <th style={thStyle}>
                    {t('amount')}
                  </th>

                  <th style={thStyle}>
                    {t('balance')}
                  </th>

                  <th style={thStyle}>
                    {t('gps')}
                  </th>

                  <th style={thStyle}>
                    {t('proof')}
                  </th>

                </tr>
              </thead>

              <tbody>

                {filteredCollections.map(
                  (item) => (

                    <tr
                      key={item.id}
                      style={{
                        borderTop:
                          '1px solid #e5e7eb'
                      }}
                    >

                      <td style={tdStyle}>
                        {formatDate(
                          item.paymentDate
                        )}
                      </td>

                      <td style={tdStyle}>

                        <strong>
                          {item.customerName}
                        </strong>

                        <div
                          style={{
                            fontSize: '12px'
                          }}
                        >
                          {item.customerId}
                        </div>

                      </td>

                      <td style={tdStyle}>

                        {item.agentName}

                        <div
                          style={{
                            fontSize: '12px'
                          }}
                        >
                          {item.agentCode}
                        </div>

                      </td>

                      <td style={tdStyle}>
                        {item.categoryName}
                      </td>

                      <td style={tdStyle}>
                        {
                          t(({ daily: 'dailyLoan', weekly: 'weeklyLoan', monthly: 'monthlyLoan', interest_only: 'interestOnlyLoan' })[item.financeType] || item.financeType)
                        }
                      </td>

                      <td style={tdStyle}>

                        <strong>
                          ₹{formatMoney(
                            item.paymentAmount
                          )}
                        </strong>

                      </td>

                      <td style={tdStyle}>

                        ₹{formatMoney(
                          item.balanceBefore
                        )}

                        {' → '}

                        ₹{formatMoney(
                          item.balanceAfter
                        )}

                      </td>

                      <td style={tdStyle}>

                        {item.hasGps ? (

                          <button
                            type="button"
                            onClick={() =>
                              viewLocation(
                                item.latitude,
                                item.longitude
                              )
                            }
                          >
                            📍 {t('view')}
                          </button>

                        ) : (

                          <span>
                            -
                          </span>

                        )}

                      </td>

                      <td style={tdStyle}>

                        {item.hasProof ? (

                          <button
                            type="button"
                            onClick={() =>
                              viewProof(
                                item.proofPath
                              )
                            }
                          >
                            📷 {t('view')}
                          </button>

                        ) : (

                          <span>
                            -
                          </span>

                        )}

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  whiteSpace: 'nowrap'
}

const tdStyle = {
  padding: '12px',
  verticalAlign: 'top'
}

export default Collections