import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { filterAssignedFinance } from '../../services/agentAssignments'

function AgentSettlement() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [agents, setAgents] = useState([])
  const [settlements, setSettlements] = useState([])

  const [selectedAgent, setSelectedAgent] = useState('')

  const [settlementDate, setSettlementDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  const [assignedAmount, setAssignedAmount] = useState(0)
  const [totalCollected, setTotalCollected] = useState(0)
  const [previouslySettled, setPreviouslySettled] = useState(0)

  const [remittedAmount, setRemittedAmount] = useState('')
  const [returnedAmount, setReturnedAmount] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [agentLoading, setAgentLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPage()
  }, [])

  // =========================================
  // LOAD PAGE
  // =========================================

  const loadPage = async () => {
    setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (
      sessionError ||
      !sessionData?.session
    ) {
      alert(
        t('agentLoginSessionEnded')
      )

      navigate('/')
      return
    }

    await Promise.all([
      loadAgents(),
      loadSettlements()
    ])

    setLoading(false)
  }

  // =========================================
  // LOAD AGENTS
  // =========================================

  const loadAgents = async () => {
    const {
      data,
      error
    } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'active')
      .order('full_name')

    if (error) {
      console.error(
        'AGENT ERROR:',
        error
      )

      alert(
        t('agentsLoadFailed', { message: error.message })
      )

      return
    }

    setAgents(data || [])
  }

  // =========================================
  // LOAD SETTLEMENT HISTORY
  // =========================================

  const loadSettlements = async () => {
    const {
      data,
      error
    } = await supabase
      .from('agent_settlements')
      .select(`
        *,
        agents (
          id,
          agent_id,
          full_name
        )
      `)
      .order(
        'settlement_date',
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

    if (error) {
      console.error(
        'SETTLEMENT ERROR:',
        error
      )

      alert(
        t('settlementsLoadFailed', { message: error.message })
      )

      return
    }

    setSettlements(data || [])
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

    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString(
      { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN'
    )
  }

  // =========================================
  // RESET AGENT TOTALS
  // =========================================

  const resetAgentTotals = () => {
    setAssignedAmount(0)
    setTotalCollected(0)
    setPreviouslySettled(0)
    setRemittedAmount('')
    setReturnedAmount('')
  }

  // =========================================
  // LOAD SELECTED AGENT TOTALS
  // =========================================

  const loadAgentTotals = async (agentId) => {
    if (!agentId) {
      resetAgentTotals()
      return
    }

    setAgentLoading(true)

    try {
      // -------------------------------------
      // 1. GET ACTIVE CATEGORY ASSIGNMENTS
      // -------------------------------------

      const {
        data: assignmentData,
        error: assignmentError
      } = await supabase
        .from('category_agent_assignments')
        .select('category_id, collection_type')
        .eq(
          'agent_id',
          Number(agentId)
        )
        .eq(
          'status',
          'active'
        )

      if (assignmentError) {
        throw assignmentError
      }

      const categoryIds = [
        ...new Set(
          (assignmentData || [])
            .map(
              (item) =>
                item.category_id
            )
            .filter(Boolean)
        )
      ]

      if (categoryIds.length === 0) {
        resetAgentTotals()
        setAgentLoading(false)
        return
      }

      // -------------------------------------
      // 2. GET FINANCE ACCOUNTS
      // -------------------------------------

      const {
        data: financeData,
        error: financeError
      } = await supabase
        .from('finance_records')
        .select(`
          id,
          amount,
          finance_type,
          collection_category_id
        `)
        .in(
          'collection_category_id',
          categoryIds
        )

      if (financeError) {
        throw financeError
      }

      const financeRecords = filterAssignedFinance(financeData, assignmentData)

      const financeIds =
        financeRecords.map(
          (record) =>
            record.id
        )

      // -------------------------------------
      // 3. CALCULATE ASSIGNED AMOUNT
      // -------------------------------------

      const assigned =
        financeRecords.reduce(
          (total, record) =>
            total +
            Number(
              record.amount || 0
            ),
          0
        )

      setAssignedAmount(
        assigned
      )

      // -------------------------------------
      // 4. GET REAL COLLECTION PAYMENTS
      // -------------------------------------

      let collected = 0

      if (financeIds.length > 0) {
        const {
          data: paymentData,
          error: paymentError
        } = await supabase
          .from('finance_payments')
          .select(`
            id,
            finance_record_id,
            payment_amount
          `)
          .in(
            'finance_record_id',
            financeIds
          )

        if (paymentError) {
          throw paymentError
        }

        collected =
          (paymentData || [])
            .reduce(
              (total, payment) =>
                total +
                Number(
                  payment.payment_amount ||
                  0
                ),
              0
            )
      }

      setTotalCollected(
        collected
      )

      // -------------------------------------
      // 5. GET PREVIOUS SETTLEMENTS
      // -------------------------------------

      const {
        data: previousData,
        error: previousError
      } = await supabase
        .from('agent_settlements')
        .select(`
          total_collected,
          status
        `)
        .eq(
          'agent_id',
          Number(agentId)
        )

      if (previousError) {
        throw previousError
      }

      /*
        total_collected in each settlement row
        represents the amount covered by that
        settlement record.

        For the current test record:
        Arun already settled ₹5,000.
      */

      const settled =
        (previousData || [])
          .reduce(
            (total, settlement) =>
              total +
              Number(
                settlement.total_collected ||
                0
              ),
            0
          )

      setPreviouslySettled(
        settled
      )

    } catch (error) {
      console.error(
        'AGENT TOTAL ERROR:',
        error
      )

      resetAgentTotals()

      alert(
        t('agentSettlementTotalsFailed', { message: error.message })
      )
    }

    setAgentLoading(false)
  }

  // =========================================
  // AGENT CHANGE
  // =========================================

  const handleAgentChange = async (e) => {
    const value =
      e.target.value

    setSelectedAgent(
      value
    )

    setRemittedAmount('')
    setReturnedAmount('')
    setNotes('')

    await loadAgentTotals(
      value
    )
  }

  // =========================================
  // AVAILABLE FOR SETTLEMENT
  // =========================================

  const availableForSettlement =
    useMemo(() => {
      const value =
        Number(totalCollected || 0) -
        Number(previouslySettled || 0)

      return Math.max(
        value,
        0
      )
    }, [
      totalCollected,
      previouslySettled
    ])

  // =========================================
  // VARIANCE
  // =========================================

  const variance =
    useMemo(() => {
      const remitted =
        Number(
          remittedAmount || 0
        )

      const returned =
        Number(
          returnedAmount || 0
        )

      return (
        availableForSettlement -
        remitted -
        returned
      )
    }, [
      availableForSettlement,
      remittedAmount,
      returnedAmount
    ])

  // =========================================
  // STATUS
  // =========================================

  const getSettlementStatus = () => {
    const remitted =
      Number(
        remittedAmount || 0
      )

    const returned =
      Number(
        returnedAmount || 0
      )

    if (
      availableForSettlement > 0 &&
      Math.abs(variance) < 0.01
    ) {
      return 'settled'
    }

    if (
      remitted > 0 ||
      returned > 0
    ) {
      return 'partial'
    }

    return 'pending'
  }

  // =========================================
  // SAVE SETTLEMENT
  // =========================================

  const saveSettlement = async (e) => {
    e.preventDefault()

    if (!selectedAgent) {
      alert(
        t('selectAgent')
      )
      return
    }

    if (!settlementDate) {
      alert(
        t('selectSettlementDate')
      )
      return
    }

    if (
      availableForSettlement <= 0
    ) {
      alert(
        t('noAvailableCollectionToSettle')
      )
      return
    }

    const remitted =
      Number(
        remittedAmount || 0
      )

    const returned =
      Number(
        returnedAmount || 0
      )

    if (
      remitted < 0 ||
      returned < 0
    ) {
      alert(
        t('settlementAmountsCannotBeNegative')
      )
      return
    }

    if (
      remitted === 0 &&
      returned === 0
    ) {
      alert(
        t('enterRemittedOrReturnedAmount')
      )
      return
    }

    if (
      remitted + returned >
      availableForSettlement
    ) {
      alert(
        t('settlementExceedsAvailable', {
          amount: formatMoney(availableForSettlement)
        })
      )
      return
    }

    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession()

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

    const userId =
      sessionData.session.user.id

    const status =
      getSettlementStatus()

    const settlementCoveredAmount =
      remitted + returned

    const confirmSave =
      window.confirm(
        t('confirmSaveSettlement', {
          amount: formatMoney(settlementCoveredAmount)
        })
      )

    if (!confirmSave) {
      return
    }

    setSaving(true)

    const {
      error
    } = await supabase
      .from('agent_settlements')
      .insert({
        agent_id:
          Number(selectedAgent),

        settlement_date:
          settlementDate,

        assigned_amount:
          Number(
            assignedAmount || 0
          ),

        /*
          Store only the amount covered by this
          settlement, not the lifetime collection.
          This prevents the same collection from
          being counted again next time.
        */
        total_collected:
          settlementCoveredAmount,

        remitted_amount:
          remitted,

        returned_amount:
          returned,

        variance:
          availableForSettlement -
          settlementCoveredAmount,

        status:
          status,

        notes:
          notes.trim() || null,

        created_by:
          userId
      })

    if (error) {
      console.error(
        'SAVE SETTLEMENT ERROR:',
        error
      )

      alert(
        t('settlementSaveFailed', { message: error.message })
      )

      setSaving(false)
      return
    }

    alert(
      t('agentSettlementSavedSuccessfully')
    )

    setRemittedAmount('')
    setReturnedAmount('')
    setNotes('')

    await Promise.all([
      loadSettlements(),
      loadAgentTotals(
        selectedAgent
      )
    ])

    setSaving(false)
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="customer-profile-page">

        <p>
          {t('loadingAgentSettlement')}
        </p>

      </div>
    )
  }

  return (
    <div className="customer-profile-page">

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>

          <p>
            {t('appName')}
          </p>

          <h1>
            {t('agentSettlement')}
          </h1>

          <span>
            {t('agentSettlementDescription')}
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

      {/* NEW SETTLEMENT */}

      <div className="daily-manage-section">

        <h2>
          {t('newSettlement')}
        </h2>

        <form
          onSubmit={
            saveSettlement
          }
        >

          <div className="daily-info-grid">

            {/* AGENT */}

            <div>

              <label>
                {t('agent')} *
              </label>

              <select
                value={
                  selectedAgent
                }
                onChange={
                  handleAgentChange
                }
                required
              >

                <option value="">
                  {t('selectAgent')}
                </option>

                {agents.map(
                  (agent) => (

                    <option
                      key={
                        agent.id
                      }
                      value={
                        agent.id
                      }
                    >
                      {agent.full_name}
                      {' - '}
                      {agent.agent_id}
                    </option>

                  )
                )}

              </select>

            </div>

            {/* DATE */}

            <div>

              <label>
                {t('settlementDate')} *
              </label>

              <input
                type="date"
                value={
                  settlementDate
                }
                onChange={(e) =>
                  setSettlementDate(
                    e.target.value
                  )
                }
                required
              />

            </div>

          </div>

          {/* AGENT TOTALS */}

          {selectedAgent && (

            <div
              style={{
                marginTop: '22px'
              }}
            >

              <h3>
                {t('agentCollectionSummary')}
              </h3>

              {agentLoading ? (

                <p>
                  {t('calculatingAgentCollections')}
                </p>

              ) : (

                <div className="daily-manage-summary">

                  <div>

                    <span>
                      {t('assignedAmount')}
                    </span>

                    <strong>
                      ₹{formatMoney(
                        assignedAmount
                      )}
                    </strong>

                  </div>

                  <div>

                    <span>
                      {t('totalActualCollected')}
                    </span>

                    <strong>
                      ₹{formatMoney(
                        totalCollected
                      )}
                    </strong>

                  </div>

                  <div>

                    <span>
                      {t('previouslySettled')}
                    </span>

                    <strong>
                      ₹{formatMoney(
                        previouslySettled
                      )}
                    </strong>

                  </div>

                  <div>

                    <span>
                      {t('availableForSettlement')}
                    </span>

                    <strong>
                      ₹{formatMoney(
                        availableForSettlement
                      )}
                    </strong>

                  </div>

                </div>

              )}

            </div>

          )}

          {/* REMITTANCE */}

          {selectedAgent &&
            !agentLoading &&
            availableForSettlement > 0 && (

            <div
              style={{
                marginTop: '24px'
              }}
            >

              <h3>
                {t('settlementEntry')}
              </h3>

              <div className="daily-info-grid">

                <div>

                  <label>
                    {t('remittedAmount')}
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={
                      availableForSettlement
                    }
                    placeholder="0.00"
                    value={
                      remittedAmount
                    }
                    onChange={(e) =>
                      setRemittedAmount(
                        e.target.value
                      )
                    }
                  />

                </div>

                <div>

                  <label>
                    {t('returnedAmount')}
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={
                      availableForSettlement
                    }
                    placeholder="0.00"
                    value={
                      returnedAmount
                    }
                    onChange={(e) =>
                      setReturnedAmount(
                        e.target.value
                      )
                    }
                  />

                </div>

              </div>

              {/* SUMMARY */}

              <div
                style={{
                  marginTop: '22px',
                  padding: '18px',
                  borderRadius: '12px',
                  background: '#f8fafc'
                }}
              >

                <h3>
                  {t('settlementSummary')}
                </h3>

                <p>
                  {t('available')}:
                  {' '}
                  <strong>
                    ₹{formatMoney(
                      availableForSettlement
                    )}
                  </strong>
                </p>

                <p>
                  {t('remitted')}:
                  {' '}
                  <strong>
                    ₹{formatMoney(
                      remittedAmount
                    )}
                  </strong>
                </p>

                <p>
                  {t('returned')}:
                  {' '}
                  <strong>
                    ₹{formatMoney(
                      returnedAmount
                    )}
                  </strong>
                </p>

                <p>
                  {t('remainingVariance')}:
                  {' '}
                  <strong>
                    ₹{formatMoney(
                      variance
                    )}
                  </strong>
                </p>

                <p>
                  {t('status')}:
                  {' '}
                  <strong>
                    {t(getSettlementStatus())}
                  </strong>
                </p>

              </div>

              {/* NOTES */}

              <div
                style={{
                  marginTop: '18px'
                }}
              >

                <label>
                  {t('notes')}
                </label>

                <textarea
                  rows="3"
                  placeholder={t('optionalSettlementNotes')}
                  value={notes}
                  onChange={(e) =>
                    setNotes(
                      e.target.value
                    )
                  }
                  style={{
                    width: '100%',
                    marginTop: '8px'
                  }}
                />

              </div>

              <button
                type="submit"
                className="record-payment-button"
                disabled={
                  saving ||
                  agentLoading
                }
                style={{
                  marginTop: '18px'
                }}
              >
                {
                  saving
                    ? t('saving')
                    : t('saveSettlement')
                }
              </button>

            </div>

          )}

          {/* NOTHING TO SETTLE */}

          {selectedAgent &&
            !agentLoading &&
            availableForSettlement <= 0 && (

            <div
              style={{
                marginTop: '22px',
                padding: '16px',
                background: '#eaf8ef',
                borderRadius: '10px'
              }}
            >

              <strong>
                ✅ {t('noPendingSettlementForAgent')}
              </strong>

            </div>

          )}

        </form>

      </div>

      {/* SETTLEMENT HISTORY */}

      <div className="daily-manage-section">

        <h2>
          {t('settlementHistory')}
        </h2>

        {settlements.length === 0 ? (

          <div className="no-payment-history">

            {t('noSettlementHistoryFound')}

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
                    {t('agent')}
                  </th>

                  <th style={thStyle}>
                    {t('settledAmount')}
                  </th>

                  <th style={thStyle}>
                    {t('remitted')}
                  </th>

                  <th style={thStyle}>
                    {t('returned')}
                  </th>

                  <th style={thStyle}>
                    {t('remainingVariance')}
                  </th>

                  <th style={thStyle}>
                    {t('status')}
                  </th>

                </tr>

              </thead>

              <tbody>

                {settlements.map(
                  (settlement) => (

                    <tr
                      key={
                        settlement.id
                      }
                      style={{
                        borderTop:
                          '1px solid #e5e7eb'
                      }}
                    >

                      <td style={tdStyle}>

                        {formatDate(
                          settlement
                            .settlement_date
                        )}

                      </td>

                      <td style={tdStyle}>

                        {
                          settlement
                            .agents
                            ?.full_name ||
                          '-'
                        }

                      </td>

                      <td style={tdStyle}>

                        ₹{formatMoney(
                          settlement
                            .total_collected
                        )}

                      </td>

                      <td style={tdStyle}>

                        ₹{formatMoney(
                          settlement
                            .remitted_amount
                        )}

                      </td>

                      <td style={tdStyle}>

                        ₹{formatMoney(
                          settlement
                            .returned_amount
                        )}

                      </td>

                      <td style={tdStyle}>

                        ₹{formatMoney(
                          settlement
                            .variance
                        )}

                      </td>

                      <td style={tdStyle}>

                        {
                          t(settlement.status)
                        }

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
  padding: '12px'
}

const tdStyle = {
  padding: '12px'
}

export default AgentSettlement