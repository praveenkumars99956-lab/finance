import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { writeAuditLog } from '../../services/auditLog'

function Agents() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)

  const [form, setForm] = useState({
    agent_id: '',
    full_name: '',
    phone: '',
    email: '',
    password: '',
    address: '',
    status: 'active'
  })

  useEffect(() => {
    loadAgents()
  }, [])

  // =========================================
  // LOAD AGENTS
  // =========================================

  const loadAgents = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', {
        ascending: false
      })

    if (error) {
      console.error('LOAD AGENTS ERROR:', error)

      alert(
        t('agentsLoadFailed', { message: error.message })
      )

      setLoading(false)
      return
    }

    setAgents(data || [])
    setLoading(false)
  }

  // =========================================
  // HANDLE INPUT
  // =========================================

  const handleChange = (e) => {
    const { name, value } = e.target

    setForm((previous) => ({
      ...previous,
      [name]: value
    }))
  }

  // =========================================
  // CLEAR FORM
  // =========================================

  const clearForm = () => {
    setEditingId(null)

    setForm({
      agent_id: '',
      full_name: '',
      phone: '',
      email: '',
      password: '',
      address: '',
      status: 'active'
    })
  }

  // =========================================
  // GET CURRENT ADMIN SESSION
  // =========================================

  const getCurrentSession = async () => {
    const {
      data,
      error
    } = await supabase.auth.getSession()

    if (error) {
      console.error(
        'SESSION ERROR:',
        error
      )

      return null
    }

    return data?.session || null
  }

  // =========================================
  // SAVE AGENT
  // =========================================

  const saveAgent = async (e) => {
    e.preventDefault()

    // -----------------------------------------
    // NAME VALIDATION
    // -----------------------------------------

    if (!form.full_name.trim()) {
      alert(t('enterAgentName'))
      return
    }

    // -----------------------------------------
    // PHONE VALIDATION
    // -----------------------------------------

    if (
      form.phone &&
      !/^[0-9]{10}$/.test(
        form.phone.trim()
      )
    ) {
      alert(
        t('agentPhoneMustBeTenDigits')
      )

      return
    }

    // -----------------------------------------
    // EMAIL VALIDATION
    // -----------------------------------------

    if (!form.email.trim()) {
      alert(t('enterAgentEmail'))
      return
    }

    // -----------------------------------------
    // PASSWORD VALIDATION
    // Only required when creating new agent
    // -----------------------------------------

    if (
      !editingId &&
      form.password.length < 6
    ) {
      alert(
        t('temporaryPasswordMinimumLength')
      )

      return
    }

    setSaving(true)

    try {
      // =====================================
      // CHECK CURRENT LOGIN SESSION
      // =====================================

      const session =
        await getCurrentSession()

      if (!session) {
        alert(
          t('adminLoginSessionNotFound')
        )

        await supabase.auth.signOut()

        navigate('/')

        return
      }

      const accessToken =
        session.access_token

      if (!accessToken) {
        alert(
          t('loginTokenNotFound')
        )

        await supabase.auth.signOut()

        navigate('/')

        return
      }

      // =====================================
      // UPDATE EXISTING AGENT
      // =====================================

      if (editingId) {
        const {
          error: updateError
        } = await supabase
          .from('agents')
          .update({
            full_name:
              form.full_name.trim(),

            phone:
              form.phone.trim(),

            email:
              form.email
                .trim()
                .toLowerCase(),

            address:
              form.address.trim(),

            status:
              form.status,

            updated_at:
              new Date().toISOString()
          })
          .eq(
            'id',
            editingId
          )

        if (updateError) {
          console.error(
            'UPDATE AGENT ERROR:',
            updateError
          )

          throw new Error(
            t('agentUpdateFailed', { message: updateError.message })
          )
        }

        alert(
          t('agentUpdatedSuccessfully')
        )
      }

      // =====================================
      // CREATE NEW AGENT
      // =====================================

      else {
        console.log(
          'Creating agent using secure Edge Function...'
        )

        // -------------------------------------
        // CALL EDGE FUNCTION
        // -------------------------------------

        const {
          data,
          error: functionError
        } =
          await supabase.functions.invoke(
            'create-agent',
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`
              },

              body: {
                full_name:
                  form.full_name.trim(),

                phone:
                  form.phone.trim(),

                email:
                  form.email
                    .trim()
                    .toLowerCase(),

                password:
                  form.password,

                address:
                  form.address.trim(),

                status:
                  form.status
              }
            }
          )

        // -------------------------------------
        // FUNCTION ERROR
        // -------------------------------------

        if (functionError) {
          console.error(
            'CREATE AGENT FUNCTION ERROR:',
            functionError
          )

          let errorMessage =
            functionError.message ||
            t('unableCreateAgent')

          // Try to read detailed error
          // returned by the Edge Function.
          try {
            if (
              functionError.context &&
              typeof functionError.context.json ===
                'function'
            ) {
              const responseBody =
                await functionError.context.json()

              console.error(
                'FUNCTION RESPONSE:',
                responseBody
              )

              if (
                responseBody?.message
              ) {
                errorMessage =
                  responseBody.message
              }
            }
          } catch (responseError) {
            console.error(
              'ERROR READING FUNCTION RESPONSE:',
              responseError
            )
          }

          throw new Error(
            errorMessage
          )
        }

        console.log(
          'CREATE AGENT RESPONSE:',
          data
        )

        // -------------------------------------
        // EDGE FUNCTION RETURNED FAILURE
        // -------------------------------------

        if (!data?.success) {
          throw new Error(
            data?.message ||
            t('unableCreateAgentAccount')
          )
        }

        // -------------------------------------
        // SUCCESS
        // -------------------------------------

        const createdAgent =
          data.agent

        alert(
          t('agentCreatedWithLogin', {
            agentId: createdAgent?.agent_id || '-',
            email: createdAgent?.email || form.email.trim().toLowerCase()
          })
        )
      }

      // =====================================
      // REFRESH PAGE DATA
      // =====================================

      clearForm()

      await loadAgents()
    } catch (error) {
      console.error(
        'SAVE AGENT ERROR:',
        error
      )

      alert(
        error?.message || t('agentSaveFailed')
      )
    } finally {
      setSaving(false)
    }
  }

  // =========================================
  // EDIT AGENT
  // =========================================

  const editAgent = (agent) => {
    setEditingId(
      agent.id
    )

    setForm({
      agent_id:
        agent.agent_id || '',

      full_name:
        agent.full_name || '',

      phone:
        agent.phone || '',

      email:
        agent.email || '',

      password: '',

      address:
        agent.address || '',

      status:
        agent.status || 'active'
    })

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // =========================================
  // DELETE / DEACTIVATE AGENT
  // =========================================

  const deleteAgent = async (
    agent
  ) => {
    // =====================================
    // AGENT ALREADY HAS LOGIN
    // =====================================

    if (agent.auth_user_id) {
      const confirmed =
        window.confirm(
          t('confirmDeactivateAgentWithLogin', {
            agentName: agent.full_name
          })
        )

      if (!confirmed) {
        return
      }

      const {
        error
      } = await supabase
        .from('agents')
        .update({
          status: 'inactive',

          updated_at:
            new Date().toISOString()
        })
        .eq(
          'id',
          agent.id
        )

      if (error) {
        console.error(
          'DEACTIVATE ERROR:',
          error
        )

        alert(
          t('agentDeactivateFailed', { message: error.message })
        )

        return
      }

      if (
        editingId === agent.id
      ) {
        clearForm()
      }

      await loadAgents()

      alert(
        t('agentDeactivatedSuccessfully')
      )
      await writeAuditLog({
        action: 'agent.deactivated',
        entityType: 'agent',
        entityId: agent.id,
        details: { agentId: agent.agent_id }
      })

      return
    }

    // =====================================
    // OLD AGENT WITHOUT LOGIN
    // =====================================

    const confirmed =
      window.confirm(
        t('confirmDeleteAgent', { agentName: agent.full_name })
      )

    if (!confirmed) {
      return
    }

    const {
      error
    } = await supabase
      .from('agents')
      .delete()
      .eq(
        'id',
        agent.id
      )

    if (error) {
      console.error(
        'DELETE AGENT ERROR:',
        error
      )

      alert(
        t('agentDeleteFailed', { message: error.message })
      )

      return
    }

    if (
      editingId === agent.id
    ) {
      clearForm()
    }

    await loadAgents()

    alert(
      t('agentDeletedSuccessfully')
    )
  }

  // =========================================
  // SEARCH
  // =========================================

  const filteredAgents =
    agents.filter(
      (agent) => {
        const text = `
          ${agent.agent_id || ''}
          ${agent.full_name || ''}
          ${agent.phone || ''}
          ${agent.email || ''}
          ${agent.address || ''}
          ${agent.status || ''}
        `.toLowerCase()

        return text.includes(
          search
            .trim()
            .toLowerCase()
        )
      }
    )

  // =========================================
  // SUMMARY
  // =========================================

  const activeAgents =
    agents.filter(
      (agent) =>
        agent.status === 'active'
    ).length

  const inactiveAgents =
    agents.filter(
      (agent) =>
        agent.status === 'inactive'
    ).length

  const loginEnabledAgents =
    agents.filter(
      (agent) =>
        Boolean(
          agent.auth_user_id
        )
    ).length

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page">

      {/* BACK */}

      <button
        className="back-button"
        onClick={() =>
          navigate('/admin')
        }
      >
        ← Admin Dashboard
      </button>

      {/* HEADER */}

      <div className="customer-profile-header">

        <div>

          <p>
            {t('appName')}
          </p>

          <h1>
            {t('agents')}
          </h1>

          <span>
            {t('agentsDescription')}
          </span>

        </div>

      </div>

      {/* =====================================
          SUMMARY
      ====================================== */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('totalAgents')}
          </span>

          <strong>
            {agents.length}
          </strong>
        </div>

        <div>
          <span>
            Active
          </span>

          <strong>
            {activeAgents}
          </strong>
        </div>

        <div>
          <span>
            Inactive
          </span>

          <strong>
            {inactiveAgents}
          </strong>
        </div>

        <div>
          <span>
            {t('loginEnabled')}
          </span>

          <strong>
            {loginEnabledAgents}
          </strong>
        </div>

      </div>

      {/* =====================================
          ADD / EDIT AGENT
      ====================================== */}

      <div className="daily-manage-section">

        <h2>
          {
            editingId
              ? t('editAgent')
              : t('addAgent')
          }
        </h2>

        <form
          onSubmit={saveAgent}
          className="daily-payment-form"
        >

          {/* AGENT ID */}

          {editingId && (

            <div>

              <label>
                {t('agentIdLabel')}
              </label>

              <input
                type="text"
                value={
                  form.agent_id
                }
                disabled
              />

            </div>

          )}

          {/* AGENT NAME */}

          <div>

            <label>
              {t('agentName')} *
            </label>

            <input
              type="text"
              name="full_name"
              value={
                form.full_name
              }
              onChange={
                handleChange
              }
              placeholder={t('enterAgentName')}
              required
            />

          </div>

          {/* PHONE */}

          <div>

            <label>
              {t('phone')}
            </label>

            <input
              type="tel"
              name="phone"
              value={
                form.phone
              }
              onChange={
                handleChange
              }
              placeholder={t('tenDigitPhoneNumber')}
              maxLength="10"
              inputMode="numeric"
            />

          </div>

          {/* EMAIL */}

          <div>

            <label>
              {t('email')} *
            </label>

            <input
              type="email"
              name="email"
              value={
                form.email
              }
              onChange={
                handleChange
              }
              placeholder={t('agentLoginEmail')}
              required
            />

          </div>

          {/* TEMPORARY PASSWORD */}

          {!editingId && (

            <div>

              <label>
                {t('temporaryPassword')} *
              </label>

              <input
                type="password"
                name="password"
                value={
                  form.password
                }
                onChange={
                  handleChange
                }
                placeholder={t('minimumSixCharacters')}
                minLength="6"
                autoComplete="new-password"
                required
              />

              <small
                style={{
                  display: 'block',
                  marginTop: '6px',
                  color: '#64748b'
                }}
              >
                {t('temporaryPasswordSecurityNotice')}
              </small>

            </div>

          )}

          {/* ADDRESS */}

          <div>

            <label>
              {t('address')}
            </label>

            <input
              type="text"
              name="address"
              value={
                form.address
              }
              onChange={
                handleChange
              }
              placeholder={t('enterAddress')}
            />

          </div>

          {/* STATUS */}

          <div>

            <label>
              {t('status')}
            </label>

            <select
              name="status"
              value={
                form.status
              }
              onChange={
                handleChange
              }
            >

              <option value="active">
                {t('active')}
              </option>

              <option value="inactive">
                {t('inactive')}
              </option>

            </select>

          </div>

          {/* SAVE BUTTON */}

          <button
            type="submit"
            className="record-payment-button"
            disabled={saving}
          >

            {
              saving
                ? t('saving')
                : editingId
                  ? t('updateAgent')
                  : t('createAgentAndLogin')
            }

          </button>

          {/* CANCEL EDIT */}

          {editingId && (

            <button
              type="button"
              className="back-button"
              onClick={
                clearForm
              }
              disabled={
                saving
              }
            >
              {t('cancelEdit')}
            </button>

          )}

        </form>

      </div>

      {/* =====================================
          {t('agentList').toUpperCase()}
      ====================================== */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <div>

            <h2>
              {t('agentList')}
            </h2>

            <p>
              {t('agentCount', { count: filteredAgents.length })}
            </p>

          </div>

          <input
            type="text"
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder={t('searchAgents')}
            style={{
              padding: '10px 12px',
              minWidth: '240px',
              border:
                '1px solid #d7e0ec',
              borderRadius: '8px'
            }}
          />

        </div>

        {/* LOADING */}

        {loading ? (

          <div className="no-payment-history">
            {t('loadingAgents')}
          </div>

        ) : filteredAgents.length ===
          0 ? (

          <div className="no-payment-history">
            {t('noAgentsFound')}
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>

                <tr>

                  <th>
                    #
                  </th>

                  <th>
                    {t('agentIdLabel')}
                  </th>

                  <th>
                    {t('fullName')}
                  </th>

                  <th>
                    {t('phone')}
                  </th>

                  <th>
                    {t('email')}
                  </th>

                  <th>
                    {t('address')}
                  </th>

                  <th>
                    {t('login')}
                  </th>

                  <th>
                    {t('status')}
                  </th>

                  <th>
                    {t('actions')}
                  </th>

                </tr>

              </thead>

              <tbody>

                {
                  filteredAgents.map(
                    (
                      agent,
                      index
                    ) => (

                      <tr
                        key={
                          agent.id
                        }
                      >

                        <td>
                          {
                            index + 1
                          }
                        </td>

                        <td>

                          <strong>
                            {
                              agent.agent_id
                            }
                          </strong>

                        </td>

                        <td>
                          {
                            agent.full_name
                          }
                        </td>

                        <td>
                          {
                            agent.phone ||
                            '-'
                          }
                        </td>

                        <td>
                          {
                            agent.email ||
                            '-'
                          }
                        </td>

                        <td>
                          {
                            agent.address ||
                            '-'
                          }
                        </td>

                        {/* LOGIN STATUS */}

                        <td>

                          <span
                            className={
                              agent.auth_user_id
                                ? 'schedule-status schedule-paid'
                                : 'schedule-status schedule-pending'
                            }
                          >

                            {
                              agent.auth_user_id
                                ? t('enabled')
                                : t('notCreated')
                            }

                          </span>

                        </td>

                        {/* AGENT STATUS */}

                        <td>

                          <span
                            className={
                              agent.status ===
                              'active'
                                ? 'schedule-status schedule-paid'
                                : 'schedule-status schedule-pending'
                            }
                          >

                            {
                              agent.status ===
                              'active'
                                ? t('active')
                                : t('inactive')
                            }

                          </span>

                        </td>

                        {/* ACTIONS */}

                        <td>

                          <div
                            style={{
                              display:
                                'flex',
                              gap:
                                '8px',
                              flexWrap:
                                'wrap'
                            }}
                          >

                            <button
                              type="button"
                              className="record-payment-button"
                              onClick={() =>
                                editAgent(
                                  agent
                                )
                              }
                            >
                              {t('edit')}
                            </button>

                            <button
                              type="button"
                              className="back-button"
                              onClick={() =>
                                deleteAgent(
                                  agent
                                )
                              }
                            >

                              {
                                agent.auth_user_id
                                  ? t('deactivate')
                                  : t('delete')
                              }

                            </button>

                          </div>

                        </td>

                      </tr>

                    )
                  )
                }

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

export default Agents