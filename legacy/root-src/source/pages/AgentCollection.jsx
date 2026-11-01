import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { EvidenceHistory } from '../components/CollectionEvidence'

function AgentCollection() {
  const navigate = useNavigate()
  const { financeId } = useParams()

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
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  )

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
      throw new Error('Login session not found. Please login again.')
    }
    const user = userData.user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()
    if (profileError || String(profile?.role || '').trim().toLowerCase() !== 'agent') {
      throw new Error('Unable to verify Agent access. Please login as an Agent.')
    }
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, agent_id, full_name, status, auth_user_id')
      .eq('auth_user_id', user.id)
      .single()
    if (agentError || !agent?.id ||
        String(agent.status || '').trim().toLowerCase() !== 'active') {
      throw new Error('Your Agent account was not found or is inactive.')
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
      throw new Error('Finance account is unavailable or has no assigned collection category.')
    }
    const { data: assignments, error: assignmentError } = await supabase
      .from('category_agent_assignments')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('category_id', record.collection_category_id)
      .eq('status', 'active')
      .limit(1)
    if (assignmentError || !assignments?.length) {
      throw new Error('This collection category is not actively assigned to your Agent account.')
    }
    return { user, agent, record }
  }

  const denyCollectionAccess = (error) => {
    setFinance(null)
    setPayments([])
    setCurrentAgent(null)
    console.error('COLLECTION ACCESS ERROR:', error)
    alert(error?.message || 'Unable to verify collection access.')
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
      'en-IN',
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
      'en-IN'
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
      return 'Daily Loan'
    }

    if (value === 'weekly') {
      return 'Weekly Loan'
    }

    if (value === 'monthly') {
      return 'Monthly Loan'
    }

    if (
      value === 'interest_only' ||
      value === 'interest-only'
    ) {
      return 'Interest-Only Loan'
    }

    return type || 'Finance'
  }

  // =========================================
  // GET CORRECT PAYMENT RPC
  // =========================================

  const getPaymentRpc = () => {
    const type =
      String(
        finance?.finance_type || ''
      ).toLowerCase()

    if (type === 'daily') {
      return 'record_daily_payment'
    }

    if (type === 'weekly') {
      return 'record_weekly_payment'
    }

    if (type === 'monthly') {
      return 'record_monthly_payment'
    }

    if (
      type === 'interest_only' ||
      type === 'interest-only'
    ) {
      return 'record_interest_only_payment'
    }

    return null
  }

  // =========================================
  // COLLECTION STATUS
  // =========================================

  const getCollectionStatus = () => {
    const pending =
      Number(
        finance?.pending || 0
      )

    const paid =
      Number(
        finance?.paid || 0
      )

    if (pending <= 0) {
      return 'Paid'
    }

    if (paid > 0) {
      return 'Partially Paid'
    }

    return 'Pending'
  }

  // =========================================
  // CAPTURE GPS
  // =========================================

  const captureGps = () => {
    if (!navigator.geolocation) {
      alert(
        'GPS location is not supported on this device/browser.'
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
          'GPS location captured successfully.'
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
            'Location permission was denied. Please allow location access in your browser.'
          )
        } else if (error.code === 2) {
          alert(
            'Your current location could not be determined.'
          )
        } else if (error.code === 3) {
          alert(
            'GPS request timed out. Please try again.'
          )
        } else {
          alert(
            'Unable to capture GPS location.'
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
        'Please select an image file.'
      )

      e.target.value = ''
      return
    }

    const maxSize =
      5 * 1024 * 1024

    if (file.size > maxSize) {
      alert(
        'Proof image must be 5 MB or smaller.'
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

    const amount =
      Number(paymentAmount)

    const pending =
      Number(
        finance?.pending || 0
      )

    // =========================================
    // BASIC VALIDATION
    // =========================================

    if (!paymentDate) {
      alert(
        'Please select collection date.'
      )
      return
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert(
        'Please enter a valid collection amount.'
      )
      return
    }

    if (amount > pending) {
      alert(
        `Collection amount cannot be greater than pending amount ₹${formatMoney(
          pending
        )}`
      )
      return
    }

    const rpcName =
      getPaymentRpc()

    if (!rpcName) {
      alert(
        'Unsupported finance type.'
      )
      return
    }

    // =========================================
    // SETTINGS VALIDATION
    // =========================================

    if (settingsLoading) {
      alert(
        'Collection settings are still loading. Please wait a moment and try again.'
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
        'GPS location is required. Please capture GPS before recording the collection.'
      )
      return
    }

    // PROOF REQUIRED

    if (
      requireCollectionProof &&
      !proofFile
    ) {
      alert(
        'Collection proof photo is required. Please select a proof photo before recording the collection.'
      )
      return
    }

    // =========================================
    // CONFIRM COLLECTION
    // =========================================

    const confirmPayment =
      window.confirm(
        `Record ₹${formatMoney(
          amount
        )} collection for ${
          finance?.customers
            ?.full_name ||
          finance?.name ||
          'this customer'
        }?`
      )

    if (!confirmPayment) {
      return
    }

    savingRef.current = true
    setSaving(true)
    let paymentRecorded = false
    try {
      let access
      try {
        access = await verifyCollectionAccess(financeId)
        if (String(routeRef.current) !== String(financeId)) return
        if (access.agent.id !== currentAgent.id ||
            access.user.id !== currentAgent.auth_user_id) {
          throw new Error('Your login has changed. Please reopen the collection page.')
        }
      } catch (accessError) {
        denyCollectionAccess(accessError)
        return
      }
      if (access.record.finance_type !== finance.finance_type ||
          amount > Number(access.record.pending || 0)) {
        alert('The finance account has changed. Review the refreshed balance and try again.')
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
            Number(financeId),

          p_payment_amount:
            amount,

          p_payment_date:
            paymentDate
        }
      )

      if (error) {
        console.error(
          'COLLECTION ERROR:',
          error
        )

        alert(
          `Unable to record collection: ${error.message}`
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
          Number(financeId)
        )
        .eq(
          'payment_date',
          paymentDate
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
        const extension =
          proofFile.name
            .split('.')
            .pop() || 'jpg'

        const safeExtension =
          extension.toLowerCase()

        const filePath =
          `finance-${financeId}/payment-${newPayment?.id || Date.now()}-${Date.now()}.${safeExtension}`

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
            `Collection was recorded, but proof upload failed: ${uploadError.message}`
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
              Number(financeId),

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
            `Collection was recorded, but GPS/proof information could not be saved: ${evidenceError.message}`
          )
        }
      }

      // =========================================
      // SUCCESS
      // =========================================

      alert(
        'Collection recorded successfully.'
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
        ? 'Payment was recorded, but completing the evidence or refresh failed. Check payment history before trying again.'
        : (error?.message || 'Unable to record collection. Check payment history before trying again.'))
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
          Loading Collection...
        </p>
      </div>
    )
  }

  if (!finance) {
    return (
      <div className="customer-profile-page">

        <h2>
          Finance account not found
        </h2>

        <button
          onClick={() =>
            navigate('/agent')
          }
        >
          ← Agent Dashboard
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
    'Not Assigned'

  const status =
    getCollectionStatus()

  const totalAmount =
    Number(
      finance.paid || 0
    ) +
    Number(
      finance.pending || 0
    )

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page">

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>

          <p>
            FINANCE
          </p>

          <h1>
            Agent Collection
          </h1>

          <span>
            Record and manage customer collection
          </span>

        </div>

        <button
          className="back-button"
          onClick={() =>
            navigate('/agent')
          }
        >
          ← Agent Dashboard
        </button>

      </div>

      {/* CUSTOMER INFORMATION */}

      <div className="daily-manage-section">

        <h2>
          Customer Information
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>
              Customer Name
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
              Customer ID
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
              Phone
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
              Address
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
          Collection Assignment
        </h2>

        <div
          style={{
            background: '#eef5ff',
            padding: '16px',
            borderRadius: '12px'
          }}
        >

          <span>
            Collection Category
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
            Loan Type
          </span>

          <strong>
            {getLoanName(
              finance.finance_type
            )}
          </strong>
        </div>

        <div>
          <span>
            Total Amount
          </span>

          <strong>
            ₹{formatMoney(
              totalAmount
            )}
          </strong>
        </div>

        <div>
          <span>
            Collected
          </span>

          <strong>
            ₹{formatMoney(
              finance.paid
            )}
          </strong>
        </div>

        <div>
          <span>
            Pending
          </span>

          <strong>
            ₹{formatMoney(
              finance.pending
            )}
          </strong>
        </div>

      </div>

      {/* FINANCE DETAILS */}

      <div className="daily-manage-section">

        <h2>
          Finance Details
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>
              Principal
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
              Next Due Date
            </span>

            <strong>
              {formatDate(
                finance.next_due_date
              )}
            </strong>
          </div>

          <div>
            <span>
              Status
            </span>

            <strong>
              {status}
            </strong>
          </div>

          <div>
            <span>
              Loan Status
            </span>

            <strong>
              {
                finance.loan_status ||
                'active'
              }
            </strong>
          </div>

        </div>

      </div>

      {/* RECORD COLLECTION */}

      <div className="daily-manage-section">

        <h2>
          Record Collection
        </h2>

        {Number(
          finance.pending || 0
        ) > 0 ? (

          <form
            onSubmit={
              recordCollection
            }
          >

            <div className="daily-info-grid">

              <div>

                <label>
                  Collection Date *
                </label>

                <input
                  type="date"
                  value={
                    paymentDate
                  }
                  onChange={(e) =>
                    setPaymentDate(
                      e.target.value
                    )
                  }
                  required
                />

              </div>

              <div>

                <label>
                  Collection Amount *
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={
                    Number(
                      finance.pending ||
                      0
                    )
                  }
                  placeholder="Enter amount"
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
                Collection Evidence
              </h3>

              {settingsLoading ? (
                <p>
                  Loading collection requirements...
                </p>
              ) : (
                <p>
                  GPS:{' '}
                  <strong>
                    {
                      requireGps
                        ? 'Required'
                        : 'Optional'
                    }
                  </strong>

                  {' • '}

                  Proof:{' '}
                  <strong>
                    {
                      requireCollectionProof
                        ? 'Required'
                        : 'Optional'
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
                      ? 'Capturing GPS...'
                      : requireGps
                        ? '📍 Capture GPS *'
                        : '📍 Capture GPS (Optional)'
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
                      ✅ GPS Captured
                    </strong>

                    <p>
                      Latitude:{' '}
                      {
                        Number(
                          latitude
                        ).toFixed(6)
                      }
                    </p>

                    <p>
                      Longitude:{' '}
                      {
                        Number(
                          longitude
                        ).toFixed(6)
                      }
                    </p>

                    <p>
                      Accuracy:{' '}
                      {
                        gpsAccuracy
                          ? `${Math.round(
                              gpsAccuracy
                            )} meters`
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
                  Collection Proof Photo{' '}
                  {
                    requireCollectionProof
                      ? '*'
                      : '(Optional)'
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
                      ✅ Proof Selected
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
                    alt="Collection proof preview"
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
                Current Pending
              </p>

              <h2>
                ₹{formatMoney(
                  finance.pending
                )}
              </h2>

              <button
                type="submit"
                className="record-payment-button"
                disabled={
                  saving ||
                  settingsLoading
                }
              >
                {
                  saving
                    ? 'Recording...'
                    : settingsLoading
                      ? 'Loading Settings...'
                      : 'Record Collection'
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
              Collection Completed
            </strong>

          </div>

        )}

      </div>

      <EvidenceHistory financeId={finance?.id} payments={payments} />

      {/* COLLECTION HISTORY */}

      <div className="daily-manage-section">

        <h2>
          Collection History
        </h2>

        {payments.length === 0 ? (

          <div className="no-payment-history">
            No collection history found.
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
                    Date
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    Amount
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    Balance Before
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px'
                    }}
                  >
                    Balance After
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
