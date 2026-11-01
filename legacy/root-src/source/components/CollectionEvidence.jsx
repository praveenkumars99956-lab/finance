import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'

async function withTimeout(request, label) {
  let timer
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' timed out.')), 20000)
      })
    ])
  } finally { clearTimeout(timer) }
}

export function useCollectionEvidence(financeId) {
  const [location, setLocation] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [requirements, setRequirements] = useState(null)
  const [message, setMessage] = useState('')
  const [fileKey, setFileKey] = useState(0)
  const busy = useRef(false)
  const pendingSave = useRef(null)
  const uncertainPayment = useRef(false)
  const [needsRetry, setNeedsRetry] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const gpsVersion = useRef(0)

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : ''
    setPreview(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file])

  useEffect(() => {
    let active = true
    if (!pendingSave.current && !uncertainPayment.current) { setLocation(null); setFile(null) }
    setFileKey(k => k + 1)
    setRequirements(null)
    setGpsLoading(false)
    setMessage('')
    gpsVersion.current += 1
    readRequirements().then(value => {
      if (active) setRequirements(value)
    }).catch(error => {
      if (active) {
        setRequirements({ gps: true, proof: true })
        setMessage('Settings could not be loaded. GPS and a photo are required until settings can be verified.')
      }
    })
    return () => { active = false; gpsVersion.current += 1 }
  }, [financeId])

  async function readRequirements() {
    const { data, error } = await withTimeout(supabase.from('app_settings')
      .select('require_gps, require_collection_proof').order('id', { ascending: true }).limit(1).maybeSingle(), 'Loading settings')
    if (error) throw error
    return { gps: data?.require_gps !== false, proof: data?.require_collection_proof !== false }
  }

  function captureGps() {
    if (!navigator.geolocation) { setMessage('GPS is not available in this browser.'); return }
    const version = ++gpsVersion.current
    setGpsLoading(true)
    setLocation(null)
    setMessage('')
    navigator.geolocation.getCurrentPosition(position => {
      if (version !== gpsVersion.current) return
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy })
      setGpsLoading(false)
    }, error => {
      if (version !== gpsVersion.current) return
      setGpsLoading(false)
      setMessage(error.code === 1 ? 'Allow location access to capture GPS.' : 'Could not capture GPS. Please try again outdoors or check your location settings.')
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  function selectFile(event) {
    const selected = event.target.files?.[0]
    setFile(null)
    setMessage('')
    if (!selected) return
    if (!selected.type.startsWith('image/') || selected.size > 5 * 1024 * 1024) {
      event.target.value = ''
      setMessage('Select an image no larger than 5 MB.')
      return
    }
    setFile(selected)
  }

  // Existing payment RPCs remain responsible for changing balances.
  async function recordPayment(rpcName, params) {
    if (busy.current) return { error: { message: 'A payment is already being recorded.' } }
    if (pendingSave.current) return { error: new Error('A payment is already recorded. Use Retry evidence only below.') }
    if (uncertainPayment.current) return { error: new Error('The previous payment result is unknown. Check payment history before reopening this page to try another payment.') }
    busy.current = true
    let recorded = false
    let proofPath = null
    let rpcStarted = false
    const evidenceLocation = location
    const evidenceFile = file
    try {
      // Fail closed when settings cannot be verified.
      const settings = await readRequirements().catch(() => ({ gps: true, proof: true }))
      setRequirements(settings)
      if (gpsLoading) throw new Error('Wait for GPS capture to finish.')
      if (settings.gps && !evidenceLocation) throw new Error('Capture GPS before recording this payment.')
      if (settings.proof && !evidenceFile) throw new Error('Select a proof photo before recording this payment.')
      const { data: auth, error: authError } = await withTimeout(supabase.auth.getUser(), 'Verifying login')
      if (authError || !auth?.user) throw new Error('Please log in again.')
      const { data: profile, error: profileError } = await withTimeout(supabase.from('profiles').select('role').eq('id', auth.user.id).single(), 'Verifying Admin role')
      if (profileError || String(profile?.role || '').trim().toLowerCase() !== 'admin') throw new Error('An Admin login is required for this payment form.')
      const hasEvidence = Boolean(evidenceLocation || evidenceFile)
      const matchingPayments = () => supabase.from('finance_payments').select('id')
        .eq('finance_record_id', params.p_finance_record_id)
        .eq('payment_date', params.p_payment_date)
        .eq('payment_amount', params.p_payment_amount)
      let previous = []
      if (hasEvidence) {
        const snapshot = await withTimeout(matchingPayments(), 'Finding payment')
        if (snapshot.error) throw snapshot.error
        previous = snapshot.data || []
      }
      if (evidenceFile) {
        const extension = evidenceFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        proofPath = `finance-${params.p_finance_record_id}/admin-${auth.user.id}-${crypto.randomUUID()}.${extension}`
        const upload = await withTimeout(supabase.storage.from('collection-proofs').upload(proofPath, evidenceFile, { upsert: false, contentType: evidenceFile.type }), 'Uploading proof')
        if (upload.error) throw new Error('Proof upload failed: ' + upload.error.message)
      }
      rpcStarted = true
      const result = await withTimeout(supabase.rpc(rpcName, params), 'Recording payment')
      if (result.error) throw new Error(result.error.message + ' Check payment history before retrying.')
      recorded = true
      if (hasEvidence) {
        // Keep this exact payment's evidence job; retry never invokes the payment RPC.
        const saveEvidence = async () => {
        const { data: currentAuth, error: currentAuthError } = await withTimeout(supabase.auth.getUser(), 'Verifying evidence login')
        if (currentAuthError || currentAuth?.user?.id !== auth.user.id) throw new Error('Sign back in with the same Admin account before retrying evidence.')
        const returned = Array.isArray(result.data) ? result.data[0] : result.data
        let paymentId = returned && typeof returned === 'object' ? (returned.payment_id ?? returned.id) : null
        if (!paymentId) {
          const after = await matchingPayments()
          if (after.error) throw after.error
          const priorIds = new Set(previous.map(row => String(row.id)))
          const candidates = (after.data || []).filter(row => !priorIds.has(String(row.id)))
          if (candidates.length !== 1) throw new Error('The new payment could not be identified uniquely. Evidence was not attached to avoid linking it to the wrong payment.')
          paymentId = candidates[0].id
        }
        const existing = await withTimeout(supabase.from('collection_evidence')
          .select('id, proof_file_path, latitude, longitude')
          .eq('payment_id', paymentId).eq('created_by', auth.user.id).limit(2), 'Checking saved evidence')
        if (existing.error) throw existing.error
        if (existing.data?.length) {
          const matches = existing.data.some(row => row.proof_file_path === proofPath &&
            row.latitude === (evidenceLocation?.latitude ?? null) && row.longitude === (evidenceLocation?.longitude ?? null))
          if (matches) return
          throw new Error('This payment already has different evidence. Review it before making changes.')
        }
        const { error } = await withTimeout(supabase.from('collection_evidence').insert({
          finance_record_id: params.p_finance_record_id,
          payment_id: paymentId,
          agent_id: null,
          created_by: auth.user.id,
          latitude: evidenceLocation?.latitude ?? null,
          longitude: evidenceLocation?.longitude ?? null,
          gps_accuracy: evidenceLocation?.accuracy ?? null,
          proof_file_path: proofPath,
          proof_file_name: evidenceFile?.name ?? null
        }), 'Saving evidence')
        if (error) throw error
        }
        pendingSave.current = saveEvidence
        setNeedsRetry(true)
        await saveEvidence()
        pendingSave.current = null
        setNeedsRetry(false)
      }
      setMessage('')
      return { error: null }
    } catch (error) {
      if (recorded) {
        setMessage('Payment recorded. Evidence needs attention: ' + error.message + ' Use Retry evidence only; do not record the payment again.')
        return { error: null, warning: 'Payment recorded, but evidence could not be saved: ' + error.message + ' Do not record this payment again.' + (proofPath ? ' Uploaded proof: ' + proofPath : '') }
      }
      if (rpcStarted) {
        uncertainPayment.current = true
        setMessage('Payment result is unknown. Check payment history before reopening this page. Do not immediately repeat the payment.')
        return { error: new Error(error.message + ' Payment result is unknown; check history before retrying.') }
      }
      // Preserve an uploaded file if the RPC outcome is uncertain.
      if (proofPath && !rpcStarted) await withTimeout(supabase.storage.from('collection-proofs').remove([proofPath]), 'Cleaning up proof').catch(() => {})
      return { error }
    } finally {
      busy.current = false
      if (recorded && !pendingSave.current) { setFile(null); setLocation(null); setFileKey(k => k + 1) }
    }
  }

  async function retryEvidence() {
    if (busy.current || !pendingSave.current) return
    busy.current = true
    setRetrying(true)
    try {
      await pendingSave.current()
      pendingSave.current = null
      setNeedsRetry(false)
      setFile(null); setLocation(null); setFileKey(k => k + 1)
      setMessage('Evidence saved successfully. Refresh payment history to view it.')
    } catch (error) {
      setMessage('Evidence retry failed: ' + error.message + ' The payment is already recorded; do not submit it again.')
    } finally { busy.current = false; setRetrying(false) }
  }

  return { needsRetry, retrying, retryEvidence, location, preview, gpsLoading, requirements, message, fileKey, captureGps, selectFile, recordPayment }
}

export function EvidenceCapture({ evidence, disabled }) {
  return (
    <div style={{ gridColumn: '1 / -1', padding: '18px', background: '#f5f8fc', borderRadius: '12px' }}>
      <h3 style={{ marginTop: 0 }}>GPS and proof photo</h3>
      <p>{evidence.requirements ? `GPS ${evidence.requirements.gps ? 'required' : 'optional'} · Photo ${evidence.requirements.proof ? 'required' : 'optional'}` : 'Loading collection requirements...'}</p>
      <button type="button" className="back-button" disabled={disabled || evidence.needsRetry || evidence.gpsLoading} onClick={evidence.captureGps}>
        {evidence.gpsLoading ? 'Capturing GPS...' : evidence.location ? 'Capture GPS again' : 'Capture GPS'}
      </button>
      {evidence.location && <p>GPS captured: {evidence.location.latitude.toFixed(6)}, {evidence.location.longitude.toFixed(6)} · Accuracy ±{Math.round(evidence.location.accuracy)} m</p>}
      <label style={{ display: 'block', marginTop: '16px' }}>Proof photo (maximum 5 MB)
        <input key={evidence.fileKey} type="file" accept="image/*" disabled={disabled || evidence.needsRetry} onChange={evidence.selectFile} style={{ display: 'block', marginTop: '8px' }} />
      </label>
      {evidence.preview && <img src={evidence.preview} alt="Selected payment proof" style={{ display: 'block', maxWidth: '100%', maxHeight: '220px', marginTop: '12px', borderRadius: '8px' }} />}
      {evidence.message && <p role="alert">{evidence.message}</p>}
      {evidence.needsRetry && <button type="button" className="back-button" disabled={disabled || evidence.retrying} onClick={evidence.retryEvidence}>
        {evidence.retrying ? 'Saving evidence...' : 'Retry evidence only'}
      </button>}
      {evidence.needsRetry && <p>Keep this page open until evidence is saved. Do not record the payment again.</p>}
    </div>
  )
}

export function EvidenceHistory({ financeId, payments }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [photo, setPhoto] = useState(null)
  const photoVersion = useRef(0)
  useEffect(() => {
    let active = true
    photoVersion.current += 1
    setRows([]); setError(''); setPhoto(null); setLoading(true)
    if (!financeId) { setLoading(false); return }
    withTimeout(supabase.from('collection_evidence')
      .select('id, payment_id, latitude, longitude, gps_accuracy, proof_file_path, proof_file_name, captured_at')
      .eq('finance_record_id', financeId).order('captured_at', { ascending: false }), 'Loading evidence history')
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError('Unable to load evidence: ' + error.message)
        else setRows(data || [])
      }).catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; photoVersion.current += 1 }
  }, [financeId, payments])
  async function viewPhoto(row) {
    const version = ++photoVersion.current
    try {
      const { data, error } = await withTimeout(supabase.storage.from('collection-proofs').createSignedUrl(row.proof_file_path, 300), 'Opening proof photo')
      if (version !== photoVersion.current) return
      if (error) throw error
      setPhoto({ url: data.signedUrl, name: row.proof_file_name || 'Payment proof' })
    } catch (error) { if (version === photoVersion.current) setError('Unable to open proof: ' + error.message) }
  }
  return (
    <div className="daily-manage-section">
      <h2>GPS and proof history</h2>
      {loading && <p>Loading evidence...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && <p>No saved GPS or proof photos for this finance account.</p>}
      {rows.map(row => {
        const payment = (payments || []).find(item => String(item.id) === String(row.payment_id))
        const hasGps = row.latitude !== null && row.longitude !== null && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
        return <div key={row.id} style={{ padding: '14px 0', borderBottom: '1px solid #e5e7eb' }}>
          <strong>Payment #{row.payment_id || 'not linked'}{payment ? ` · ₹${Number(payment.payment_amount).toLocaleString('en-IN')} · ${payment.payment_date}` : ''}</strong>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
            {hasGps ? <a href={`https://www.google.com/maps?q=${Number(row.latitude)},${Number(row.longitude)}`} target="_blank" rel="noopener noreferrer">View GPS location</a> : <span>No GPS saved</span>}
            {row.proof_file_path ? <button type="button" className="back-button" onClick={() => viewPhoto(row)}>View proof photo</button> : <span>No photo saved</span>}
          </div>
        </div>
      })}
      {photo && <div style={{ marginTop: '16px' }}>
        <button type="button" className="back-button" onClick={() => { photoVersion.current += 1; setPhoto(null) }}>Close photo</button>
        <img src={photo.url} alt={photo.name} style={{ display: 'block', maxWidth: '100%', maxHeight: '500px', marginTop: '12px' }} />
      </div>}
    </div>
  )
}
