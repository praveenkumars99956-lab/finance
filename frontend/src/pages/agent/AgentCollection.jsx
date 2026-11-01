import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { EvidenceHistory } from '../../components/CollectionEvidence'
import CalendarDatePicker from '../../components/CalendarDatePicker'
import {
  getInterestOnlyBalance,
  getInterestOnlyInterestDue
} from '../../services/interestOnly'

function getPendingForDate(finance, date) {
  if (String(finance?.finance_type || '').toLowerCase() === 'interest_only') {
    return getInterestOnlyBalance(finance, date)
  }

  return Number(finance?.pending || 0)
}

function getPaymentLimitForDate(finance, date) {
  if (String(finance?.finance_type || '').toLowerCase() === 'interest_only') {
    return getInterestOnlyInterestDue(finance, date)
  }

  return getPendingForDate(finance, date)
}

function getLocalDate() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function getValidPaymentDate(date, finance) {
  const minimumDate = String(
    finance?.last_interest_date || finance?.entry_date || ''
  ).slice(0, 10)
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
  const minimumPaymentDate = String(
    finance?.last_interest_date || finance?.entry_date || ''
  ).slice(0, 10)
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
  }, [finance?.last_interest_date, finance?.entry_date, paymentDate])

  // =========================================
  // LOAD COLLECTION SETTINGS
  // =========================================

  useEffect(() => {
    const loadCollectionSettings = async () => {
      setSettingsLoading(true)

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

      if (error) {
        console.error(
          'SETTINGS LOAD ERROR:',
          error
        )

        // Safe fallback:
        // evidence remains required if Settings
        // cannot be loaded.
        setRequireGps(true)
        setRequireCollectionProof(true)
        setSettingsLoading(false)
        return
      }

      if (data) {
        setRequireGps(
          data.require_gps !== false
        )

        setRequireCollectionProof(
          data.require_collection_proof !== false
        )
      }

      setSettingsLoading(false)
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
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()
    if (profileError || String(profile?.role || '').trim().toLowerCase() !== 'agent') {
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
      const assignedType = String(assignment.collection_type || '').trim().toLowerCase()
      return !assignedType ||
        assignedType === 'all' ||
        assignedType === String(record.finance_type || '').trim().toLowerCase()
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
    alert(error?.message || t('unableVerifyCollectionAccess'))
    navigate('/agent', { replace: true })
  }

  const loadCollection = async () => {
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
    const value =
      String(type || '')
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

    return type || t('finance')
  }

  // =========================================
  // GET CORRECT PAYMENT RPC
  // =========================================

  const getPaymentRpc = () => {
    const type = String(finance?.finance_type || '').toLowerCase()
    return ['daily', 'weekly', 'monthly', 'interest_only', 'interest-only'].includes(type)
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
      alert(
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

        alert(
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
          alert(
            t('gpsPermissionDenied')
          )
        } else if (error.code === 2) {
          alert(
            t('gpsLocationUnavailable')
          )
        } else if (error.code === 3) {
          alert(
            t('gpsRequestTimedOut')
          )
        } else {
          alert(
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
      alert(
        t('selectImageFile')
      )

      e.target.value = ''
      return
    }

    const maxSize =
      5 * 1024 * 1024

    if (file.size > maxSize) {
      alert(
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
      alert(
        t(
          'collectionNotAvailableUntil',
          'Collections cannot be recorded until {{date}}.',
          { date: minimumPaymentDate }
        )
      )
      return
    }

    if (!selectedDate) {
      alert(t('selectCollectionDate'))
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
      alert(
        t('enterValidCollectionAmount')
      )
      return
    }

    if (amount > paymentLimit) {
      alert(
        t('collectionExceedsInterestDue', {
          amount: formatMoney(paymentLimit)
        })
      )
      return
    }

    const rpcName =
      getPaymentRpc()

    if (!rpcName) {
      alert(
        t('financeTypeNotSupported')
      )
      return
    }

    // =========================================
    // SETTINGS VALIDATION
    // =========================================

    if (settingsLoading) {
      alert(
        t('collectionSettingsLoading')
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
      alert(
        t('collectionGpsRequired')
      )
      return
    }

    // PROOF REQUIRED

    if (
      requireCollectionProof &&
      !proofFile
    ) {
      alert(
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
      if (access.record.finance_type !== finance.finance_type ||
          amount > verifiedPaymentLimit) {
        alert(t('collectionFinanceChanged'))
        await loadCollection()
        return
      }

      // =========================================
      // RECORD PAYMENT
      // =========================================

      const {
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
            alert(t('unableRecordCollection', { message: error.message }))
          } catch (accessError) {
            alert(
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

        alert(
          t('unableRecordCollection', { message: error.message })
        )

        setSaving(false)
        return
      }

      paymentRecorded = true

      // =========================================
      // FIND NEW PAYMENT
      // =========================================

      const {
        data: newPayment,
        error: paymentFindError
      } = await supabase
        .from('finance_payments')
        .select('*')
        .eq(
          'finance_record_id',
          financeRecordId
        )
        .eq(
          'payment_date',
          submittedPaymentDate
        )
        .eq(
          'payment_amount',
          amount
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(1)
        .maybeSingle()

      if (paymentFindError) {
        console.error(
          'PAYMENT FIND ERROR:',
          paymentFindError
        )
      }

      // =========================================
      // UPLOAD PROOF
      // =========================================

      let proofPath = null

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
          `workspaces/${workspaceId}/finance-${financeId}/payment-${newPayment?.id || Date.now()}-${Date.now()}.${safeExtension}`

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
          console.error(
            'PROOF UPLOAD ERROR:',
            uploadError
          )

          alert(
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
          error: evidenceError
        } = await supabase
          .from('collection_evidence')
          .insert({
            finance_record_id:
              financeRecordId,

            payment_id:
              newPayment?.id || null,

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

        if (evidenceError) {
          console.error(
            'EVIDENCE ERROR:',
            evidenceError
          )

          alert(
            t('collectionRecordedEvidenceSaveFailed', {
              message: evidenceError.message
            })
          )
        }
      }

      // =========================================
      // SUCCESS
      // =========================================

      alert(
        t('collectionRecordedSuccessfully')
      )

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
      alert(paymentRecorded
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

  const pendingForDate = getPendingForDate(finance, paymentDate)
  const paymentLimitForDate = getPaymentLimitForDate(finance, paymentDate)
  const totalAmount = Number(finance.paid || 0) + pendingForDate

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
          className="back-button"
          onClick={() =>
            navigate('/agent')
          }
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
            background: '#eef5ff',
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

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('loanType')}
          </span>

          <strong>
            {getLoanName(
              finance.finance_type
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('totalAmount')}
          </span>

          <strong>
            ₹{formatMoney(
              totalAmount
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('collected')}
          </span>

          <strong>
            ₹{formatMoney(
              finance.paid
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('pending')}
          </span>

          <strong>
            ₹{formatMoney(
              pendingForDate
            )}
          </strong>
        </div>

      </div>

      {/* FINANCE DETAILS */}

      <div className="daily-manage-section">

        <h2>
          {t('financeDetails')}
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>
              {t('principal')}
            </span>

            <strong>
              ₹{formatMoney(
                finance.principal_amount ||
                finance.amount
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('nextDueDate')}
            </span>

            <strong>
              {formatDate(
                finance.next_due_date
              )}
            </strong>
          </div>

          <div>
            <span>
              {t('status')}
            </span>

            <strong>
              {t(status)}
            </strong>
          </div>

          <div>
            <span>
              Loan Status
            </span>

            <strong>
              {
                ['active', 'closed'].includes(String(finance.loan_status || 'active').toLowerCase())
                  ? t(String(finance.loan_status || 'active').toLowerCase())
                  : finance.loan_status || '-'
              }
            </strong>
          </div>

        </div>

      </div>

      {/* RECORD COLLECTION */}

      <div className="daily-manage-section">

        <h2>
          {t('recordCollection')}
        </h2>

        {pendingForDate > 0 ? (

          <form
            onSubmit={
              recordCollection
            }
            noValidate
          >

            <div className="daily-info-grid">

              <div>

                <label>
                  {t('collectionDate')} *
                </label>

                {collectionDateUnavailable ? (
                  <p role="alert">
                    {t(
                      'collectionNotAvailableUntil',
                      'Collections cannot be recorded until {{date}}.',
                      { date: minimumPaymentDate }
                    )}
                  </p>
                ) : (
                  <CalendarDatePicker
                    label={t('collectionDate')}
                    min={minimumPaymentDate}
                    max={getLocalDate()}
                    value={getValidPaymentDate(paymentDate, finance)}
                    onChange={(date) =>
                      setPaymentDate(
                        getValidPaymentDate(date, finance)
                      )
                    }
                  />
                )}

              </div>

              <div>

                <label>
                  {String(finance.finance_type || '').toLowerCase() === 'interest_only'
                    ? `${t('interestPaymentAmount')} *`
                    : `${t('collectionAmount')} *`}
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={paymentLimitForDate}
                  placeholder={t('enterAmount')}
                  value={
                    paymentAmount
                  }
                  onChange={(e) =>
                    setPaymentAmount(
                      e.target.value
                    )
                  }
                  required
                />

              </div>

              {String(finance.finance_type || '').toLowerCase() === 'interest_only' && (
                <div className="payment-preview">
                  <span>{t('interestDueOnCollectionDate')}</span>
                  <strong>₹{formatMoney(paymentLimitForDate)}</strong>
                </div>
              )}

            </div>

            {/* COLLECTION EVIDENCE */}

            <div
              style={{
                marginTop: '24px',
                padding: '18px',
                border:
                  '1px solid #e5e7eb',
                borderRadius: '12px'
              }}
            >

              <h3>
                {t('collectionEvidence')}
              </h3>

              {settingsLoading ? (
                <p>
                  {t('loadingCollectionRequirements')}
                </p>
              ) : (
                <p>
                  {t('gps')}:{' '}
                  <strong>
                    {
                      requireGps
                        ? t('required')
                        : t('optional')
                    }
                  </strong>

                  {' • '}

                  {t('proof')}:{' '}
                  <strong>
                    {
                      requireCollectionProof
                        ? t('required')
                        : t('optional')
                    }
                  </strong>
                </p>
              )}

              {/* GPS */}

              <div
                style={{
                  marginTop: '16px'
                }}
              >

                <button
                  type="button"
                  onClick={
                    captureGps
                  }
                  disabled={
                    gpsLoading ||
                    saving
                  }
                >
                  {
                    gpsLoading
                      ? t('capturingGps')
                      : requireGps
                        ? `📍 ${t('captureGps')} *`
                        : `📍 ${t('captureGps')} (${t('optional')})`
                  }
                </button>

                {latitude !== null &&
                  longitude !== null && (

                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px',
                      background:
                        '#eaf8ef',
                      borderRadius:
                        '10px'
                    }}
                  >

                    <strong>
                      ✅ {t('gpsCaptured')}
                    </strong>

                    <p>
                      {t('latitude')}:{' '}
                      {
                        Number(
                          latitude
                        ).toFixed(6)
                      }
                    </p>

                    <p>
                      {t('longitude')}:{' '}
                      {
                        Number(
                          longitude
                        ).toFixed(6)
                      }
                    </p>

                    <p>
                      {t('accuracy')}:{' '}
                      {
                        gpsAccuracy
                          ? `${Math.round(
                              gpsAccuracy
                              )} {t('meters')}`
                          : '-'
                      }
                    </p>

                  </div>

                )}

              </div>

              {/* PROOF IMAGE */}

              <div
                style={{
                  marginTop: '20px'
                }}
              >

                <label>
                  {t('collectionProofPhoto')}{' '}
                  {
                    requireCollectionProof
                      ? '*'
                      : `(${t('optional')})`
                  }
                </label>

                <br />

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={
                    handleProofFile
                  }
                  disabled={saving}
                  style={{
                    marginTop: '8px'
                  }}
                />

                {proofFile && (

                  <div
                    style={{
                      marginTop: '12px'
                    }}
                  >

                    <strong>
                      ✅ {t('proofSelected')}
                    </strong>

                    <p>
                      {proofFile.name}
                    </p>

                  </div>

                )}

                {proofPreview && (

                  <img
                    src={
                      proofPreview
                    }
                    alt={t('collectionProofPreview')}
                    style={{
                      display: 'block',
                      marginTop: '12px',
                      width: '100%',
                      maxWidth: '320px',
                      maxHeight: '260px',
                      objectFit: 'cover',
                      borderRadius:
                        '12px',
                      border:
                        '1px solid #e5e7eb'
                    }}
                  />

                )}

              </div>

            </div>

            {/* CURRENT PENDING */}

            <div
              style={{
                marginTop: '18px'
              }}
            >

              <p>
                {t('currentPending')}
              </p>

              <h2>
                ₹{formatMoney(
                  pendingForDate
                )}
              </h2>

              <button
                type="submit"
                className="record-payment-button"
                disabled={
                  saving ||
                  settingsLoading ||
                  collectionDateUnavailable
                }
              >
                {
                  saving
                    ? t('recording')
                    : settingsLoading
                      ? t('loadingSettings')
                      : t('recordCollection')
                }
              </button>

            </div>

          </form>

        ) : (

          <div
            style={{
              padding: '16px',
              background: '#eaf8ef',
              borderRadius: '10px'
            }}
          >

            <strong>
              {t('collectionCompleted')}
            </strong>

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
