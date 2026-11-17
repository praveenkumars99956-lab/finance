import { formatMoney as formatMoneyValue } from '../../utils/money'
import { normalizeFinanceType } from '../../utils/financeType'
import { notify } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { cacheQuery } from '../../services/offlineSync'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { subscribeToCollections } from '../../services/collectionsRealtime'
import SelectMenu from '../../components/SelectMenu'

const COLLECTIONS_CACHE_TTL = 5 * 60 * 1000

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function Collections() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingCachedData, setUsingCachedData] = useState(false)
  const [search, setSearch] = useState('')
  const [financeType, setFinanceType] = useState('all')

  const [totalAmount, setTotalAmount] = useState(0)
  const [todayAmount, setTodayAmount] = useState(0)
  const [liveStatus, setLiveStatus] = useState('connecting')

  useEffect(() => {
    loadCollections()

    let unsubscribeRealtime = () => {}

    getCurrentWorkspaceId()
      .then((workspaceId) => {
        unsubscribeRealtime = subscribeToCollections({
          workspaceId,
          onChange: () => loadCollections(false),
          onStatus: setLiveStatus
        })
      })
      .catch(() => {
        // Realtime is best-effort; focus refresh below still keeps data fresh.
        setLiveStatus('reconnecting')
      })

    // Fallback when the socket is unavailable: a payment recorded in a loan
    // module still appears as soon as the user returns to this page.
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadCollections(false)
      }
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      unsubscribeRealtime()
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [])

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

  const formatDate = (value) => {
    if (!value) return '-'

    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN')
  }

  async function loadCollections(showLoader = true) {
    if (showLoader) setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      navigate('/')
      return
    }

    // ---------------------------------------
    // LOAD LOANS (base list) — Daily, Weekly,
    // Monthly and Interest-only all live here.
    // A loan must appear even before its first
    // payment has been recorded.
    // ---------------------------------------

    const {
      data: financeData,
      error: financeError,
      fromCache: financeFromCache
    } = await cacheQuery(
      'collections:finance_records',
      () =>
        supabase
          .from('finance_records')
          .select(`
            id,
            finance_type,
            amount,
            paid,
            pending,
            entry_date,
            payment_date,
            next_due_date,
            loan_status,
            collection_category_id,
            created_at,

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
          .order('created_at', {
            ascending: false
          })
          .limit(500),
      { ttlMs: COLLECTIONS_CACHE_TTL }
    )

    if (financeError) {
      console.error(
        'LOAN LOAD ERROR:',
        financeError
      )

      notify(
        t('unableToLoadCollections', { message: financeError.message })
      )

      setLoading(false)
      return
    }

    // ---------------------------------------
    // LOAD PAYMENTS (latest collection detail)
    // ---------------------------------------

    const {
      data: paymentData,
      error: paymentError,
      fromCache: paymentsFromCache
    } = await cacheQuery(
      'collections:finance_payments',
      () =>
        supabase
          .from('finance_payments')
          .select(`
            id,
            finance_record_id,
            payment_date,
            payment_amount,
            balance_before,
            balance_after,
            created_at
          `)
          .order('created_at', {
            ascending: false
          })
          .limit(500),
      { ttlMs: COLLECTIONS_CACHE_TTL }
    )

    if (paymentError) {
      console.error(
        'PAYMENT LOAD ERROR:',
        paymentError
      )

      notify(
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
      error: evidenceError,
      fromCache: evidenceFromCache
    } = await cacheQuery(
      'collections:collection_evidence',
      () =>
        supabase
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
          .limit(500),
      { ttlMs: COLLECTIONS_CACHE_TTL }
    )

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
      error: assignmentError,
      fromCache: assignmentsFromCache
    } = await cacheQuery(
      'collections:category_agent_assignments',
      () =>
        supabase
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
          .eq('status', 'active'),
      { ttlMs: COLLECTIONS_CACHE_TTL }
    )

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

    // Group payments by loan so each loan produces one Collections row,
    // carrying its most recent payment details (or none yet).
    const paymentsByLoan = {}

    for (const payment of paymentData || []) {
      const loanId = payment.finance_record_id

      if (!paymentsByLoan[loanId]) {
        paymentsByLoan[loanId] = []
      }

      paymentsByLoan[loanId].push(payment)
    }

    const combined = (financeData || []).map(
      (finance) => {
        const customer =
          finance.customers || {}

        const category =
          finance.collection_categories || {}

        const payments =
          (paymentsByLoan[finance.id] || [])
            .slice()
            .sort(
              (a, b) => {
                const byDate =
                  String(b.payment_date || '')
                    .localeCompare(
                      String(a.payment_date || '')
                    )

                if (byDate !== 0) return byDate

                return String(b.created_at || '')
                  .localeCompare(
                    String(a.created_at || '')
                  )
              }
            )

        const latest = payments[0] || null

        const evidence = latest
          ? evidenceMap[latest.id] || null
          : null

        const fallbackAgent =
          assignmentMap[
            finance.collection_category_id
          ] || null

        const agent =
          evidence?.agents ||
          fallbackAgent ||
          null

        return {
          id: finance.id,

          financeRecordId:
            finance.id,

          paymentDate:
            latest?.payment_date ||
            finance.next_due_date ||
            finance.payment_date ||
            finance.entry_date ||
            null,

          paymentAmount:
            Number(latest?.payment_amount || 0),

          balanceBefore:
            latest?.balance_before ??
            Number(finance.amount || 0),

          balanceAfter:
            latest?.balance_after ??
            Number(finance.pending || 0),

          createdAt:
            latest?.created_at ||
            finance.created_at,

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
            ),

          paymentCount:
            payments.length,

          loanStatus:
            finance.loan_status || '-',

          totalPaid:
            Number(finance.paid || 0),

          pendingAmount:
            Number(finance.pending || 0),

          nextDueDate:
            finance.next_due_date || null
        }
      }
    )

    setCollections(combined)

    // Totals use the full payment list, not just each loan's latest one.
    const total = (paymentData || []).reduce(
      (sum, payment) =>
        sum + Number(payment.payment_amount || 0),
      0
    )

    setTotalAmount(total)

    const today = localDateString()

    const todayTotal = (paymentData || [])
      .filter(
        (payment) =>
          payment.payment_date === today
      )
      .reduce(
        (sum, payment) =>
          sum + Number(payment.payment_amount || 0),
        0
      )

    setTodayAmount(todayTotal)

    setUsingCachedData(
      Boolean(
        financeFromCache ||
        paymentsFromCache ||
        evidenceFromCache ||
        assignmentsFromCache
      )
    )

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
        normalizeFinanceType(item.financeType) === normalizeFinanceType(financeType)

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
      notify(t('noProofAvailable'))
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

      notify(
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
      notify(
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

          <div
            style={{ marginTop: '6px' }}
            aria-live="polite"
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color:
                  liveStatus === 'live'
                    ? '#16a34a'
                    : '#f59e0b'
              }}
            >
              ● {liveStatus === 'live' ? 'LIVE' : 'RECONNECTING'}
            </span>
          </div>
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

      {usingCachedData && (
        <div className="offline-inline-banner" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <span>
            {t(
              'offlineCachedData',
              'Showing the last cached copy. Changes sync automatically when you are back online.'
            )}
          </span>
        </div>
      )}

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('totalLoans')}
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

          <SelectMenu
            value={financeType}
            onChange={setFinanceType}
            ariaLabel={t('filterByLoanType', 'Filter by loan type')}
            variant="compact"
            options={[
              { value: 'all', label: t('allLoanTypes') },
              { value: 'daily', label: t('dailyLoan') },
              { value: 'weekly', label: t('weeklyLoan') },
              { value: 'monthly', label: t('monthlyLoan') },
              { value: 'interest_only', label: t('interestOnlyLoan') }
            ]}
          />

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
                          t(({ daily: 'dailyLoan', weekly: 'weeklyLoan', monthly: 'monthlyLoan', interest_only: 'interestOnlyLoan' })[normalizeFinanceType(item.financeType)] || item.financeType)
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