import { formatMoney as formatMoneyValue } from '../../utils/money'
import {
  getCollectedAmount,
  getInstallmentAmount,
  getPeriodCount
} from '../../utils/loanSummary'
import { notify } from '../../utils/notify'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { normalizeFinanceType } from '../../services/agentAssignments'
import { loadAccessContext } from '../../services/access'
import { EvidenceHistory } from '../../components/CollectionEvidence'
import CalendarDatePicker from '../../components/CalendarDatePicker'
import {
  getInterestOnlyBalance,
  getInterestOnlyInterestDue
} from '../../services/interestOnly'

function getPendingForDate(finance, date) {
  if (normalizeFinanceType(finance?.finance_type) === 'interest_only') {
    return getInterestOnlyBalance(finance, date)
  }

  return Number(finance?.pending || 0)
}

function getPaymentLimitForDate(finance, date) {
  if (normalizeFinanceType(finance?.finance_type) === 'interest_only') {
    return getInterestOnlyInterestDue(finance, date)
  }

  return getPendingForDate(finance, date)
}

function getLocalDate() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function getMinimumPaymentDate(finance) {
  const entryDate = String(
    finance?.entry_date || finance?.payment_date || ''
  ).slice(0, 10)
  if (normalizeFinanceType(finance?.finance_type) === 'interest_only') {
    return entryDate
  }

  return entryDate && entryDate <= getLocalDate() ? entryDate : ''
}

function getValidPaymentDate(date, finance) {
  const minimumDate = getMinimumPaymentDate(finance)
  const maximumDate = getLocalDate()

  if (minimumDate && minimumDate > maximumDate) return ''
  if (!date || date > maximumDate) return maximumDate
  if (minimumDate && date < minimumDate) return minimumDate
  return date
}

function AgentCollection() {
  const navigate = useNavigate()
  const { financeId } = useParams()
  const { t, i18n } = useTranslation()

  const [finance, setFinance] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentAgent, setCurrentAgent] = useState(null)
  const loadVersion = useRef(0)
  const savingRef = useRef(false)
  const routeRef = useRef(financeId)
  routeRef.current = financeId

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(getLocalDate)
  const minimumPaymentDate = getMinimumPaymentDate(finance)
  const collectionDateUnavailable =
    Boolean(minimumPaymentDate && minimumPaymentDate > getLocalDate())

  // =========================================
  // SETTINGS
  // =========================================

  const [requireGps, setRequireGps] = useState(true)
  const [
    requireCollectionProof,
    setRequireCollectionProof
  ] = useState(true)

  const [settingsLoading, setSettingsLoading] =
    useState(true)
  const [settingsLoadError, setSettingsLoadError] =
    useState('')

  // =========================================
  // GPS
  // =========================================

  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // =========================================
  // PROOF
  // =========================================

  const [proofFile, setProofFile] = useState(null)
  const [proofPreview, setProofPreview] = useState('')

  // =========================================
  // INITIAL LOAD
  // =========================================

  useEffect(() => {
    loadCollection()
    return () => { loadVersion.current += 1 }
  }, [financeId])

  useEffect(() => {
    if (!finance) return

    const validDate = getValidPaymentDate(paymentDate, finance)

    if (validDate !== paymentDate) setPaymentDate(validDate)
  }, [
    finance?.entry_date,
    finance?.finance_type,
    finance?.payment_date,
    paymentDate
  ])

  // =========================================
  // LOAD COLLECTION SETTINGS
  // =========================================

  useEffect(() => {
    const loadCollectionSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select(
            'require_gps, require_collection_proof'
          )
          .order('id', {
            ascending: true
          })
          .limit(1)
          .maybeSingle()

        if (error) throw error

        if (data) {
          setRequireGps(data.require_gps !== false)
          setRequireCollectionProof(
            data.require_collection_proof !== false
          )
        }
      } catch (error) {
        console.error('SETTINGS LOAD ERROR:', error)
        setSettingsLoadError(
          t('settingsLoadFailed', {
            message: error?.message || String(error)
          })
        )
        setRequireGps(true)
        setRequireCollectionProof(true)
      } finally {
        setSettingsLoading(false)
      }
    }

    loadCollectionSettings()
  }, [])

  // =========================================
  // LOAD COLLECTION
  // =========================================

  // Resolve identity and assignment afresh for both page loading and submission.
  // Database RLS and payment RPCs must enforce the same authorization rules.
  const verifyCollectionAccess = async (recordId) => {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new Error(t('agentLoginSessionEnded'))
    }
    const user = userData.user
    const { access, error: accessError } = await loadAccessContext()
    if (accessError || access?.role !== 'agent') {
      throw new Error(t('unableVerifyAgentLogin'))
    }
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, agent_id, full_name, status, auth_user_id')
      .eq('auth_user_id', user.id)
      .single()
    if (agentError || !agent?.id ||
        String(agent.status || '').trim().toLowerCase() !== 'active') {
      throw new Error(!agent?.id
        ? t('agentAccountNotFound')
        : t('agentAccountInactive'))
    }
    const { data: record, error: financeError } = await supabase
      .from('finance_records')
      .select(`
        *,
        customers (id, customer_id, full_name, phone, address, status),
        collection_categories (id, category_name)
      `)
      .eq('id', recordId)
      .single()
    if (financeError || !record || record.collection_category_id == null) {
      throw new Error(t('collectionFinanceUnavailable'))
    }
    const { data: assignments, error: assignmentError } = await supabase
      .from('category_agent_assignments')
      .select('id, collection_type')
      .eq('agent_id', agent.id)
      .eq('category_id', record.collection_category_id)
      .eq('status', 'active')
      .limit(100)
    const hasTypeAssignment = (assignments || []).some((assignment) => {
      const assignedType = normalizeFinanceType(assignment.collection_type)
      return !assignedType ||
        assignedType === 'all' ||
        assignedType === normalizeFinanceType(record.finance_type)
    })
    if (assignmentError || !hasTypeAssignment) {
      throw new Error(t('collectionAssignmentInactive'))
    }
    return { user, agent, record }
  }

  const denyCollectionAccess = (error) => {
    setFinance(null)
    setPayments([])
    setCurrentAgent(null)
    console.error('COLLECTION ACCESS ERROR:', error)
    notify(error?.message || t('unableVerifyCollectionAccess'))
    navigate('/agent', { replace: true })
  }

  async function loadCollection() {
    const version = ++loadVersion.current
    setLoading(true)
    setFinance(null)
    setPayments([])
    setCurrentAgent(null)
    try {
      const { agent, record } = await verifyCollectionAccess(financeId)
      if (version !== loadVersion.current) return

      const { data: paymentData, error: paymentError } = await supabase
        .from('finance_payments')
        .select('*')
        .eq('finance_record_id', financeId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (version !== loadVersion.current) return
      if (paymentError) throw paymentError

      setCurrentAgent(agent)
      setFinance(record)
      setPayments(paymentData || [])
    } catch (error) {
      if (version === loadVersion.current) denyCollectionAccess(error)
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }

  // =========================================
  // FORMAT MONEY
  // =========================================

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

  // =========================================
  // FORMAT DATE
  // =========================================

  const formatDate = (value) => {
    if (!value) {
      return '-'
    }

    const date = new Date(
      `${value}T00:00:00`
    )

    return date.toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }

  // =========================================
  // LOAN NAME
  // =========================================

  const getLoanName = (type) => {
    const value = normalizeFinanceType(type)

    if (value === 'daily') {
      return t('dailyLoan')
    }

    if (value === 'weekly') {
      return t('weeklyLoan')
    }

    if (value === 'monthly') {
      return t('monthlyLoan')
    }

    if (value === 'interest_only') {
      return t('interestOnlyLoan')
    }

    return type || t('finance')
  }

  // =========================================
  // GET CORRECT PAYMENT RPC
  // =========================================

  const getPaymentRpc = () => {
    const type = normalizeFinanceType(finance?.finance_type)
    return ['daily', 'weekly', 'monthly', 'interest_only'].includes(type)
      ? 'record_agent_payment'
      : null
  }

  // =========================================
  // COLLECTION STATUS
  // =========================================

  const getCollectionStatus = () => {
    const pending = getPendingForDate(finance, paymentDate)

    const paid =
      Number(
        finance?.paid || 0
      )

    if (pending <= 0) {
      return 'paid'
    }

    if (paid > 0) {
      return 'partiallyPaid'
    }

    return 'pending'
  }

  // =========================================
  // CAPTURE GPS
  // =========================================

  const captureGps = () => {
    if (!navigator.geolocation) {
      notify(
        t('gpsUnsupported')
      )
      return
    }

    setGpsLoading(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(
          position.coords.latitude
        )

        setLongitude(
          position.coords.longitude
        )

        setGpsAccuracy(
          position.coords.accuracy
        )

        setGpsLoading(false)

        notify(
          t('gpsCapturedSuccessfully')
        )
      },

      (error) => {
        console.error(
          'GPS ERROR:',
          error
        )

        setGpsLoading(false)

        if (error.code === 1) {
          notify(
            t('gpsPermissionDenied')
          )
        } else if (error.code === 2) {
          notify(
            t('gpsLocationUnavailable')
          )
        } else if (error.code === 3) {
          notify(
            t('gpsRequestTimedOut')
          )
        } else {
          notify(
            t('gpsCaptureFailed')
          )
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    )
  }

  // =========================================
  // SELECT PROOF IMAGE
  // =========================================

  const handleProofFile = (e) => {
    const file =
      e.target.files?.[0]

    if (!file) {
      setProofFile(null)
      setProofPreview('')
      return
    }

    if (!file.type.startsWith('image/')) {
      notify(
        t('selectImageFile')
      )

      e.target.value = ''
      return
    }

    const maxSize =
      5 * 1024 * 1024

    if (file.size > maxSize) {
      notify(
        t('proofImageMaxSize')
      )

      e.target.value = ''
      return
    }

    setProofFile(file)

    if (proofPreview) {
      URL.revokeObjectURL(
        proofPreview
      )
    }

    const preview =
      URL.createObjectURL(file)

    setProofPreview(preview)
  }

  // =========================================
  // RECORD COLLECTION
  // =========================================

  const recordCollection = async (e) => {
    e.preventDefault()
    if (savingRef.current || loading || !currentAgent?.id || !finance ||
        String(finance.id) !== String(financeId)) return

    const selectedDate = paymentDate
    if (collectionDateUnavailable) {
      notify(
        t(
          'collectionNotAvailableUntil',
          'Collections cannot be recorded until {{date}}.',
          { date: minimumPaymentDate }
        )
      )
      return
    }

    if (!selectedDate) {
      notify(t('selectCollectionDate'))
      return
    }

    const submittedPaymentDate = getValidPaymentDate(selectedDate, finance)
    if (paymentDate !== submittedPaymentDate) {
      setPaymentDate(submittedPaymentDate)
    }

    const amount =
      Number(paymentAmount)

    const paymentLimit = getPaymentLimitForDate(finance, submittedPaymentDate)

    // =========================================
    // BASIC VALIDATION
    // =========================================

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      notify(
        t('enterValidCollectionAmount')
      )
      return
    }

    if (amount > paymentLimit) {
      notify(
        t('collectionExceedsInterestDue', {
          amount: formatMoney(paymentLimit)
        })
      )
      return
    }

    const rpcName =
      getPaymentRpc()

    if (!rpcName) {
      notify(
        t('financeTypeNotSupported')
      )
      return
    }

    // GPS REQUIRED

    if (
      requireGps &&
      (
        latitude === null ||
        longitude === null
      )
    ) {
      notify(
        t('collectionGpsRequired')
      )
      return
    }

    // PROOF REQUIRED

    if (
      requireCollectionProof &&
      !proofFile
    ) {
      notify(
        t('collectionProofRequired')
      )
      return
    }

    // =========================================
    // CONFIRM COLLECTION
    // =========================================

    const confirmPayment =
      window.confirm(
        t('confirmCollection', {
          amount: formatMoney(amount),
          customerName: finance?.customers?.full_name || finance?.name || t('thisCustomer')
        })
      )

    if (!confirmPayment) {
      return
    }

    savingRef.current = true
    setSaving(true)
    let paymentRecorded = false
    const financeRecordId = finance.id
    try {
      let access
      try {
        access = await verifyCollectionAccess(financeId)
        if (String(routeRef.current) !== String(financeId)) return
        if (access.agent.id !== currentAgent.id ||
            access.user.id !== currentAgent.auth_user_id) {
          throw new Error(t('collectionLoginChanged'))
        }
      } catch (accessError) {
        denyCollectionAccess(accessError)
        return
      }
      const verifiedPaymentLimit = getPaymentLimitForDate(access.record, submittedPaymentDate)
      if (normalizeFinanceType(access.record.finance_type) !==
            normalizeFinanceType(finance.finance_type) ||
          amount > verifiedPaymentLimit) {
        notify(t('collectionFinanceChanged'))
        await loadCollection()
        return
      }

      // =========================================
      // RECORD PAYMENT
      // =========================================

      const {
        data: paymentResult,
        error
      } = await supabase.rpc(
        rpcName,
        {
          p_finance_record_id:
            financeRecordId,

          p_payment_amount:
            amount,

          p_payment_date:
            submittedPaymentDate
        }
      )

      if (error) {
        console.error(
          'COLLECTION ERROR:',
          error
        )

        if (/finance record not found/i.test(error.message || '')) {
          try {
            await verifyCollectionAccess(financeId)
            notify(t('unableRecordCollection', { message: error.message }))
          } catch (accessError) {
            notify(
              t('collectionNoLongerAssigned', {
                loanType: getLoanName(finance?.finance_type)
              })
            )
            console.error('COLLECTION ACCESS ERROR:', accessError)
          }
          await loadCollection()
          setSaving(false)
          return
        }

        notify(
          t('unableRecordCollection', { message: error.message })
        )

        setSaving(false)
        return
      }

      paymentRecorded = true

      // =========================================
      // NEW PAYMENT ID
      // =========================================

      // The RPC returns the id of the row it just inserted. Guessing by
      // date/amount can attach evidence to the wrong payment when two
      // identical collections are recorded on the same day.
      const returnedPayment =
        Array.isArray(paymentResult)
          ? paymentResult[0]
          : paymentResult

      const paymentId =
        returnedPayment &&
        typeof returnedPayment === 'object'
          ? (returnedPayment.payment_id ?? returnedPayment.id ?? null)
          : null

      if (!paymentId) {
        console.warn('[agent-collection] payment RPC did not return a payment id')
      }

      // =========================================
      // UPLOAD PROOF
      // =========================================

      let proofPath = null
      let auxiliaryFailed = false

      if (proofFile) {
        const workspaceId =
          await getCurrentWorkspaceId()

        const extension =
          proofFile.name
            .split('.')
            .pop() || 'jpg'

        const safeExtension =
          extension.toLowerCase()

        const filePath =
          `workspaces/${workspaceId}/finance-${financeId}/payment-${paymentId || Date.now()}-${Date.now()}.${safeExtension}`

        const {
          error: uploadError
        } = await supabase.storage
          .from('collection-proofs')
          .upload(
            filePath,
            proofFile,
            {
              cacheControl: '3600',
              upsert: false,
              contentType:
                proofFile.type
            }
          )

        if (uploadError) {
          auxiliaryFailed = true

          console.error(
            'PROOF UPLOAD ERROR:',
            uploadError
          )

          notify(
            t('collectionRecordedProofUploadFailed', {
              message: uploadError.message
            })
          )
        } else {
          proofPath =
            filePath
        }
      }

      // =========================================
      // SAVE COLLECTION EVIDENCE
      // =========================================

      if (
        latitude !== null ||
        longitude !== null ||
        proofPath
      ) {
        const {
          data: savedEvidence,
          error: evidenceError
        } = await supabase
          .from('collection_evidence')
          .insert({
            finance_record_id:
              financeRecordId,

            payment_id:
              paymentId,

            agent_id:
              access.agent.id,

            latitude:
              latitude,

            longitude:
              longitude,

            gps_accuracy:
              gpsAccuracy,

            proof_file_path:
              proofPath,

            proof_file_name:
              proofFile?.name || null,

            created_by:
              access.user.id
          })
          .select('id')
          .single()

        if (evidenceError || !savedEvidence?.id) {
          auxiliaryFailed = true

          console.error(
            'EVIDENCE ERROR:',
            evidenceError || 'Evidence insert returned no row'
          )

          notify(
            t('collectionRecordedEvidenceSaveFailed', {
              message:
                evidenceError?.message ||
                'unknown'
            })
          )
        }
      }

      // =========================================
      // SUCCESS
      // =========================================

      // The specific failure notices above already explain the partial save.
      // Do not follow them with a blanket "success" message.
      if (!auxiliaryFailed) {
        notify(
          t('collectionRecordedSuccessfully')
        )
      }

      setPaymentAmount('')

      setLatitude(null)
      setLongitude(null)
      setGpsAccuracy(null)

      setProofFile(null)

      if (proofPreview) {
        URL.revokeObjectURL(
          proofPreview
        )
      }

      setProofPreview('')

      await loadCollection()

    } catch (error) {
      console.error('COLLECTION ERROR:', error)
      notify(paymentRecorded
        ? t('collectionRecordedEvidenceRefreshFailed')
        : (error?.message || t('unableRecordCollectionCheckHistory')))
      if (paymentRecorded) await loadCollection()
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading || (finance && String(finance.id) !== String(financeId))) {
    return (
      <div className="customer-profile-page">
        <p>
          {t('loadingCollection')}
        </p>
      </div>
    )
  }

  if (!finance) {
    return (
      <div className="customer-profile-page">

        <h2>
          {t('financeAccountNotFound')}
        </h2>

        <button
          onClick={() =>
            navigate('/agent')
          }
        >
          ← {t('agentDashboard')}
        </button>

      </div>
    )
  }

  // =========================================
  // PAGE VALUES
  // =========================================

  const customer =
    finance.customers

  const categoryName =
    finance
      .collection_categories
      ?.category_name ||
    t('notAssigned')

  const status =
    getCollectionStatus()

  const financeType = normalizeFinanceType(finance.finance_type)
  const isInterestOnlyLoan = financeType === 'interest_only'

  const pendingForDate = getPendingForDate(finance, paymentDate)
  const paymentLimitForDate = getPaymentLimitForDate(finance, paymentDate)
  const paidAmount = getCollectedAmount(finance, payments)
  const totalAmount = paidAmount + pendingForDate
  const principalAmount = Number(finance.principal_amount ?? finance.amount ?? 0)
  // Interest accrual is cumulative; the outstanding principal and the
  // per-period interest must be derived separately for payoff figures.
  const principalOutstanding = Number(
    finance.principal_outstanding ?? principalAmount
  )
  const interestRate = Number(finance.interest_rate ?? 0)
  const interestAmount = Number(
    finance.interest_amount ??
      finance.interest_accrual ??
      finance.interest_due ??
      0
  )
  const interestPer30Days = Math.round(
    principalOutstanding * interestRate / 100 * 100
  ) / 100
  const totalRepayment = isInterestOnlyLoan
    ? Number(finance.total_amount ?? principalOutstanding + interestPer30Days)
    : Number(finance.total_amount ?? totalAmount)
  const startDateValue =
    finance.start_date ||
    finance.payment_date ||
    finance.entry_date ||
    ''
  const endingDateValue = finance.ending_date || ''
  const installmentAmount = getInstallmentAmount(finance)
  const durationCount = getPeriodCount(finance)
  const durationLabel = financeType === 'daily'
    ? t('numberOfDays', 'Number of Days')
    : financeType === 'weekly'
      ? t('numberOfWeeks', 'Number of Weeks')
      : financeType === 'monthly'
        ? t('numberOfMonths', 'Number of Months')
        : null
  const installmentLabel = financeType === 'daily'
    ? t('dailyAmount', 'Daily Amount')
    : financeType === 'weekly'
      ? t('weeklyAmount', 'Weekly Amount')
      : financeType === 'monthly'
        ? t('monthlyAmount', 'Monthly Amount')
        : null
  const collectionMonthValue = finance.collection_month || finance.collectionMonth || ''

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
            {t('agentCollection')}
          </h1>

          <span>
            {t('recordManageCustomerCollection')}
          </span>

        </div>

        <button
          type="button"
          onClick={() => navigate('/agent')}
          style={{ background: 'var(--fs-inline-card, #ffffff)', color: '#351078', border: '1px solid var(--fs-inline-border, #c4b5fd)', borderRadius: 10, padding: '0.5rem 0.9rem', fontWeight: 600, cursor: 'pointer' }}
        >
          ← {t('agentDashboard')}
        </button>

      </div>

      {/* CUSTOMER INFORMATION */}

      <div className="daily-manage-section">

        <h2>
          {t('customerInformation')}
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>
              {t('customerName')}
            </span>

            <strong>
              {
                customer?.full_name ||
                finance.name ||
                '-'
              }
            </strong>
          </div>

          <div>
            <span>
              {t('customerId')}
            </span>

            <strong>
              {
                customer?.customer_id ||
                '-'
              }
            </strong>
          </div>

          <div>
            <span>
              {t('phone')}
            </span>

            <strong>
              {
                customer?.phone ||
                '-'
              }
            </strong>
          </div>

          <div>
            <span>
              {t('address')}
            </span>

            <strong>
              {
                customer?.address ||
                '-'
              }
            </strong>
          </div>

        </div>

      </div>

      {/* COLLECTION ASSIGNMENT */}

      <div className="daily-manage-section">

        <h2>
          {t('collectionAssignment')}
        </h2>

        <div
          style={{
            background: 'var(--fs-inline-soft, #eef5ff)',
            padding: '16px',
            borderRadius: '12px'
          }}
        >

          <span>
            {t('collectionCategory')}
          </span>

          <h3
            style={{
              marginBottom: 0
            }}
          >
            {categoryName}
          </h3>

        </div>

      </div>

      {/* LOAN SUMMARY */}

      <div className="daily-manage-section">

        <h2>
          {t('loanSummary', 'Loan Summary')}
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>{t('loanType', 'Loan Type')}</span>
            <strong>{getLoanName(finance.finance_type)}</strong>
          </div>

          <div>
            <span>{t('principal', 'Principal')}</span>
            <strong>₹{formatMoney(principalAmount)}</strong>
          </div>

          <div>
            <span>{t('interestRate', 'Interest Rate')}</span>
            <strong>{interestRate}%</strong>
          </div>

          {isInterestOnlyLoan ? (
            <div>
              <span>{t('interestPer30Days', 'Interest per 30 days')}</span>
              <strong>₹{formatMoney(interestPer30Days)}</strong>
            </div>
          ) : (
            <div>
              <span>{t('interest', 'Interest')}</span>
              <strong>₹{formatMoney(interestAmount)}</strong>
            </div>
          )}

          <div>
            <span>{t('totalRepayment', 'Total Repayment')}</span>
            <strong>₹{formatMoney(totalRepayment)}</strong>
          </div>

          {isInterestOnlyLoan && (
            <div>
              <span>{t('principalDueAtPayoff', 'Principal Due At Payoff')}</span>
              <strong>₹{formatMoney(principalOutstanding)}</strong>
            </div>
          )}

          <div>
            <span>{t('collected', 'Collected')}</span>
            <strong>₹{formatMoney(paidAmount)}</strong>
          </div>

          <div>
            <span>{isInterestOnlyLoan ? t('balanceDue', 'Balance Due') : t('pending', 'Pending')}</span>
            <strong>₹{formatMoney(pendingForDate)}</strong>
          </div>

          {!isInterestOnlyLoan && installmentLabel && (
            <div>
              <span>{installmentLabel}</span>
              <strong>₹{formatMoney(installmentAmount)}</strong>
            </div>
          )}

          <div>
            <span>{t('startDate', 'Start Date')}</span>
            <strong>{formatDate(startDateValue)}</strong>
          </div>

          {!isInterestOnlyLoan && durationLabel && (
            <div>
              <span>{durationLabel}</span>
              <strong>{durationCount || 0}</strong>
            </div>
          )}

          {!isInterestOnlyLoan && (
            <div>
              <span>{t('endingDate', 'Ending Date')}</span>
              <strong>{formatDate(endingDateValue)}</strong>
            </div>
          )}

          <div>
            <span>{isInterestOnlyLoan ? t('nextInterestDue', 'Next Interest Due') : t('nextDueDate', 'Next Due Date')}</span>
            <strong>{formatDate(finance.next_due_date)}</strong>
          </div>

          {financeType === 'monthly' && (
            <div>
              <span>{t('collectionMonth', 'Collection Month')}</span>
              <strong>{collectionMonthValue || t('notSelected', 'Not Selected')}</strong>
            </div>
          )}

          <div>
            <span>{t('collectionCategory', 'Collection Category')}</span>
            <strong>{categoryName}</strong>
          </div>

          <div>
            <span>{t('status', 'Status')}</span>
            <strong>{t(status)}</strong>
          </div>

          <div>
            <span>{t('loanStatus', 'Loan Status')}</span>
            <strong>
              {['active', 'closed'].includes(String(finance.loan_status || 'active').toLowerCase())
                ? t(String(finance.loan_status || 'active').toLowerCase())
                : (finance.loan_status || '-')}
            </strong>
          </div>

        </div>

      </div>

      {/* RECORD COLLECTION */}

      <div className="daily-manage-section">

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>{t('recordCollection')}</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#5b4b75' }}>
              {isInterestOnlyLoan
                ? t('interestOnlyCollectionHint', 'Easy steps: choose date, enter interest amount, add GPS/photo if required, then record.')
                : t('collectionEasyHint', 'Easy steps: choose date, enter amount, add GPS/photo if required, then record.')}
            </p>
          </div>
          <div style={{ background: 'var(--fs-inline-tint, #f5f3ff)', border: '1px solid var(--fs-inline-border, #ddd6fe)', borderRadius: 12, padding: '0.6rem 0.9rem', minWidth: 180 }}>
            <div style={{ fontSize: '0.8rem', color: '#6d28d9', fontWeight: 600 }}>{t('currentPending')}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>₹{formatMoney(pendingForDate)}</div>
          </div>
        </div>

        {pendingForDate > 0 ? (

          <form onSubmit={recordCollection} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'var(--fs-inline-card, #fff)', border: '1px solid var(--fs-inline-border, #e5e7eb)', borderRadius: 12, padding: '0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 700, color: '#351078' }}>{t('collectionDate')} *</label>
                  {!collectionDateUnavailable && (
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {t('tapToSelectDate', 'Tap a day to select')}
                    </span>
                  )}
                </div>
                {collectionDateUnavailable ? (
                  <p role="alert" style={{ margin: 0, color: 'var(--fs-inline-warning, #b45309)', background: 'var(--fs-inline-warning-bg, #fffbeb)', border: '1px solid var(--fs-inline-warning-border, #fde68a)', borderRadius: 10, padding: '0.75rem' }}>
                    {t('collectionNotAvailableUntil', 'Collections cannot be recorded until {{date}}.', { date: minimumPaymentDate })}
                  </p>
                ) : (
                  <>
                    <CalendarDatePicker
                      label={t('collectionDate')}
                      min={minimumPaymentDate}
                      max={getLocalDate()}
                      value={getValidPaymentDate(paymentDate, finance)}
                      onChange={(date) => setPaymentDate(getValidPaymentDate(date, finance))}
                    />
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#5b6472' }}>
                      {t('collectionDateHelp', 'You can record collections only within the allowed date range.')}
                    </p>
                  </>
                )}
              </div>

              <div style={{ background: 'var(--fs-inline-card, #fff)', border: '1px solid var(--fs-inline-border, #e5e7eb)', borderRadius: 12, padding: '0.9rem' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {isInterestOnlyLoan
                    ? `${t('interestPaymentAmount')} *`
                    : `${t('collectionAmount')} *`}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={paymentLimitForDate}
                  placeholder={t('enterAmount')}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.8rem', borderRadius: 10, border: '1px solid var(--fs-inline-border, #cbd5e1)', fontSize: '1rem' }}
                />
                <small style={{ display: 'block', marginTop: '0.35rem', color: '#6b7280' }}>
                  {isInterestOnlyLoan
                    ? `${t('maxAmount', 'Max')}: ₹${formatMoney(paymentLimitForDate)}`
                    : `${t('pending', 'Pending')}: ₹${formatMoney(pendingForDate)}`}
                </small>
              </div>

              {isInterestOnlyLoan ? (
                <div style={{ background: 'var(--fs-inline-soft, #ecfeff)', border: '1px solid var(--fs-inline-border, #a5f3fc)', borderRadius: 12, padding: '0.9rem' }}>
                  <span style={{ display: 'block', color: '#155e75', fontWeight: 600 }}>{t('interestDueOnCollectionDate')}</span>
                  <strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>₹{formatMoney(paymentLimitForDate)}</strong>
                </div>
              ) : (
                <div style={{ background: 'var(--fs-inline-soft, #f0fdf4)', border: '1px solid var(--fs-inline-border, #bbf7d0)', borderRadius: 12, padding: '0.9rem' }}>
                  <span style={{ display: 'block', color: '#166534', fontWeight: 600 }}>{t('status')}</span>
                  <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{t(status)}</strong>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--fs-inline-border, #e5e7eb)', borderRadius: 12, background: 'var(--fs-inline-soft, #fcfcff)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{t('collectionEvidence')}</h3>
              {settingsLoading ? (
                <p style={{ margin: '0 0 0.75rem' }}>{t('loadingCollectionRequirements')}</p>
              ) : (
                <p style={{ margin: '0 0 0.75rem' }}>
                  <span style={{ display: 'inline-block', marginRight: '0.5rem', background: requireGps ? '#fee2e2' : '#e0f2fe', color: requireGps ? '#991b1b' : '#075985', borderRadius: 999, padding: '0.15rem 0.55rem', fontWeight: 600 }}>
                    {t('gps')}: {requireGps ? t('required') : t('optional')}
                  </span>
                  <span style={{ display: 'inline-block', background: requireCollectionProof ? '#fee2e2' : '#e0f2fe', color: requireCollectionProof ? '#991b1b' : '#075985', borderRadius: 999, padding: '0.15rem 0.55rem', fontWeight: 600 }}>
                    {t('proof')}: {requireCollectionProof ? t('required') : t('optional')}
                  </span>
                </p>
              )}
              {settingsLoadError && <p role="alert">{settingsLoadError}</p>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'var(--fs-inline-card, #fff)', border: '1px solid var(--fs-inline-border, #e5e7eb)', borderRadius: 12, padding: '0.9rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{t('gps')}</div>
                  <button
                    type="button"
                    onClick={captureGps}
                    disabled={gpsLoading || saving}
                    style={{ background: '#2563eb', color: '#fff', border: '1px solid #2563eb', borderRadius: 10, padding: '0.55rem 0.85rem', fontWeight: 600, cursor: gpsLoading || saving ? 'not-allowed' : 'pointer', opacity: gpsLoading || saving ? 0.7 : 1 }}
                  >
                    {gpsLoading ? t('capturingGps') : requireGps ? `📍 ${t('captureGps')} *` : `📍 ${t('captureGps')} (${t('optional')})`}
                  </button>

                  {latitude !== null && longitude !== null && (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--fs-inline-soft, #ecfdf5)', borderRadius: 10, border: '1px solid var(--fs-inline-border, #bbf7d0)' }}>
                      <strong>✅ {t('gpsCaptured')}</strong>
                      <p style={{ margin: '0.35rem 0 0' }}>{t('latitude')}: {Number(latitude).toFixed(6)}</p>
                      <p style={{ margin: '0.2rem 0 0' }}>{t('longitude')}: {Number(longitude).toFixed(6)}</p>
                      <p style={{ margin: '0.2rem 0 0' }}>{t('accuracy')}: {gpsAccuracy ? `${Math.round(gpsAccuracy)} ${t('meters')}` : '-'}</p>
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--fs-inline-card, #fff)', border: '1px solid var(--fs-inline-border, #e5e7eb)', borderRadius: 12, padding: '0.9rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {t('collectionProofPhoto')} {requireCollectionProof ? '*' : `(${t('optional')})`}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleProofFile}
                    disabled={saving}
                    style={{ marginTop: '4px' }}
                  />

                  {proofFile && (
                    <div style={{ marginTop: '12px', padding: '10px', background: 'var(--fs-inline-soft, #eff6ff)', borderRadius: 10, border: '1px solid var(--fs-inline-border, #bfdbfe)' }}>
                      <strong>✅ {t('proofSelected')}</strong>
                      <p style={{ margin: '0.25rem 0 0', wordBreak: 'break-word' }}>{proofFile.name}</p>
                    </div>
                  )}

                  {proofPreview && (
                    <img
                      src={proofPreview}
                      alt={t('collectionProofPreview')}
                      style={{ display: 'block', marginTop: '12px', width: '100%', maxWidth: '320px', maxHeight: '260px', objectFit: 'cover', borderRadius: 12, border: '1px solid var(--fs-inline-border, #e5e7eb)' }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', background: 'var(--fs-inline-soft, #f8fafc)', border: '1px solid var(--fs-inline-border, #e5e7eb)', borderRadius: 12, padding: '0.9rem 1rem' }}>
              <div>
                <div style={{ color: '#475569', fontSize: '0.9rem' }}>{t('readyToRecord', 'Ready to record')}</div>
                <div style={{ fontWeight: 700, color: '#1f2937' }}>
                  {isInterestOnlyLoan ? t('interestPaymentAmount', 'Interest payment amount') : t('collectionAmount', 'Collection amount')} : ₹{formatMoney(Number(paymentAmount || 0))}
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                style={{ background: saving ? '#86efac' : '#16a34a', color: '#fff', border: '1px solid #16a34a', borderRadius: 12, padding: '0.75rem 1.2rem', fontWeight: 700, fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', minWidth: 220 }}
              >
                {saving ? t('recording') : t('recordCollection')}
              </button>
            </div>
          </form>

        ) : (
          <div style={{ padding: '16px', background: 'var(--fs-inline-soft, #ecfdf5)', border: '1px solid var(--fs-inline-border, #bbf7d0)', borderRadius: 12 }}>
            <strong style={{ color: '#166534' }}>✅ {t('collectionCompleted')}</strong>
          </div>
        )}

      </div>

      <EvidenceHistory financeId={finance?.id} payments={payments} />

      {/* COLLECTION HISTORY */}

      <div className="daily-manage-section">

        <h2>
          {t('collectionHistory')}
        </h2>

        {payments.length === 0 ? (

          <div className="no-payment-history">
            {t('noCollectionHistoryFound')}
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
                borderCollapse:
                  'collapse'
              }}
            >

              <thead>

                <tr>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    {t('date')}
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    {t('amount')}
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    {t('balanceBefore')}
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    {t('balanceAfter')}
                  </th>

                </tr>

              </thead>

              <tbody>

                {payments.map(
                  (payment) => (

                    <tr
                      key={
                        payment.id
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
                        {formatDate(
                          payment.payment_date
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            '12px'
                        }}
                      >
                        ₹{formatMoney(
                          payment.payment_amount
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            '12px'
                        }}
                      >
                        ₹{formatMoney(
                          payment.balance_before
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            '12px'
                        }}
                      >
                        ₹{formatMoney(
                          payment.balance_after
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

export default AgentCollection
