import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { writeAuditLog } from '../../services/auditLog'

function AgentAssignments() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [categories, setCategories] = useState([])
  const [agents, setAgents] = useState([])
  const [assignments, setAssignments] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState(null)

  const [categoryId, setCategoryId] = useState('')
  const [collectionType, setCollectionType] = useState('daily')
  const [agentId, setAgentId] = useState('')
  const [assignedDate, setAssignedDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [status, setStatus] = useState('active')

  useEffect(() => {
    loadPage()
  }, [])

  // =========================================
  // LOAD PAGE
  // =========================================

  const loadPage = async () => {
    setLoading(true)

    await Promise.all([
      loadCategories(),
      loadAgents(),
      loadAssignments()
    ])

    setLoading(false)
  }

  // =========================================
  // LOAD CATEGORIES
  // =========================================

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('collection_categories')
      .select('id, category_name, status')
      .order('category_name')

    if (error) {
      console.error(error)
      alert(t('categoriesLoadFailed', { message: error.message }))
      return
    }

    setCategories(data || [])
  }

  // =========================================
  // LOAD AGENTS
  // =========================================

  const loadAgents = async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('id, agent_id, full_name, status')
      .order('full_name')

    if (error) {
      console.error(error)
      alert(t('agentsLoadFailed', { message: error.message }))
      return
    }

    setAgents(data || [])
  }

  // =========================================
  // LOAD ASSIGNMENTS
  // =========================================

  const loadAssignments = async () => {
    const { data, error } = await supabase
      .from('category_agent_assignments')
      .select(`
        id,
        category_id,
        collection_type,
        agent_id,
        assigned_date,
        status,
        created_at,
        collection_categories (
          category_name
        ),
        agents (
          agent_id,
          full_name
        )
      `)
      .order('created_at', {
        ascending: false
      })

    if (error) {
      console.error(error)
      alert(t('unableLoadAssignments', { message: error.message }))
      return
    }

    setAssignments(data || [])
  }

  // =========================================
  // CLEAR FORM
  // =========================================

  const clearForm = () => {
    setEditingId(null)
    setCategoryId('')
    setCollectionType('all')
    setAgentId('')
    setAssignedDate(
      new Date().toISOString().split('T')[0]
    )
    setStatus('active')
  }

  // =========================================
  // SAVE ASSIGNMENT
  // =========================================

  const saveAssignment = async (e) => {
    e.preventDefault()

    if (!categoryId) {
      alert(t('selectCollectionCategory'))
      return
    }

    if (!['all', 'daily', 'weekly', 'monthly', 'interest_only'].includes(collectionType)) {
      alert(t('selectValidCollectionType'))
      return
    }

    if (!agentId) {
      alert(t('selectAgent'))
      return
    }

    if (!assignedDate) {
      alert(t('selectAssignedDate'))
      return
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      alert(t('pleaseLoginAgain'))
      navigate('/')
      return
    }

    setSaving(true)

    // =====================================
    // UPDATE
    // =====================================

    if (editingId) {
      const { error } = await supabase
        .from('category_agent_assignments')
        .update({
          category_id: Number(categoryId),
          collection_type: collectionType,
          agent_id: Number(agentId),
          assigned_date: assignedDate,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingId)

      if (error) {
        console.error(error)

        if (error.code === '23505') {
          alert(
            t('categoryAlreadyAssignedToAgent')
          )
        } else {
          alert(
            t('assignmentUpdateFailed', { message: error.message })
          )
        }

        setSaving(false)
        return
      }

      alert(t('assignmentUpdatedSuccessfully'))
      await writeAuditLog({
        action: 'assignment.updated',
        entityType: 'category_agent_assignment',
        entityId: editingId,
        details: { categoryId: Number(categoryId), agentId: Number(agentId), collectionType, status }
      })
    }

    // =====================================
    // CREATE
    // =====================================

    else {
      const assignmentData = {
        category_id: Number(categoryId),
        collection_type: collectionType,
        agent_id: Number(agentId),
        assigned_date: assignedDate,
        status,
        created_by: user.id
      }

      const { data: existing, error: lookupError } = await supabase
        .from('category_agent_assignments')
        .select('id')
        .eq('category_id', assignmentData.category_id)
        .eq('agent_id', assignmentData.agent_id)
        .eq('collection_type', assignmentData.collection_type)
        .limit(1)

      if (lookupError) {
        console.error(lookupError)
        alert(t('assignmentLookupFailed', { message: lookupError.message }))
        setSaving(false)
        return
      }

      const { error } = existing?.length
        ? await supabase
          .from('category_agent_assignments')
          .update({
            assigned_date: assignmentData.assigned_date,
            status: assignmentData.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing[0].id)
        : await supabase
        .from('category_agent_assignments')
        .insert(assignmentData)

      if (error) {
        console.error(error)

        if (error.code === '23505') {
          alert(t('collectionTypeAlreadyAssigned'))
        } else {
          alert(
            t('assignmentCreateFailed', { message: error.message })
          )
        }

        setSaving(false)
        return
      }

      alert(existing?.length
        ? t('assignmentRefreshedSuccessfully')
        : t('agentAssignedSuccessfully'))
      await writeAuditLog({
        action: existing?.length ? 'assignment.reactivated' : 'assignment.created',
        entityType: 'category_agent_assignment',
        entityId: existing?.[0]?.id || null,
        details: { categoryId: assignmentData.category_id, agentId: assignmentData.agent_id, collectionType: assignmentData.collection_type, status: assignmentData.status }
      })
    }

    clearForm()
    await loadAssignments()
    setSaving(false)
  }

  // =========================================
  // EDIT
  // =========================================

  const editAssignment = (assignment) => {
    setEditingId(assignment.id)

    setCategoryId(
      String(assignment.category_id)
    )

    setCollectionType(
      assignment.collection_type || 'all'
    )

    setAgentId(
      String(assignment.agent_id)
    )

    setAssignedDate(
      assignment.assigned_date || ''
    )

    setStatus(
      assignment.status || 'active'
    )

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // =========================================
  // DELETE
  // =========================================

  const deleteAssignment = async (assignment) => {
    const categoryName =
      assignment.collection_categories
        ?.category_name || t('collectionCategory')

    const agentName =
      assignment.agents
        ?.full_name || t('agent')

    const confirmed = window.confirm(
      t('confirmRemoveAssignment', { categoryName, agentName })
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('category_agent_assignments')
      .delete()
      .eq('id', assignment.id)

    if (error) {
      console.error(error)

      alert(
        t('assignmentDeleteFailed', { message: error.message })
      )

      return
    }

    if (editingId === assignment.id) {
      clearForm()
    }

    await loadAssignments()
    await writeAuditLog({
      action: 'assignment.deleted',
      entityType: 'category_agent_assignment',
      entityId: assignment.id,
      details: { categoryId: assignment.category_id, agentId: assignment.agent_id }
    })
    alert(t('assignmentRemovedSuccessfully'))
  }

  // =========================================
  // SEARCH
  // =========================================

  const filteredAssignments =
    assignments.filter((assignment) => {
      const categoryName =
        assignment.collection_categories
          ?.category_name || ''

      const agentCode =
        assignment.agents
          ?.agent_id || ''

      const agentName =
        assignment.agents
          ?.full_name || ''

      const text = `
        ${categoryName}
        ${assignment.collection_type || ''}
        ${agentCode}
        ${agentName}
        ${assignment.assigned_date || ''}
        ${assignment.status || ''}
      `.toLowerCase()

      return text.includes(
        search.toLowerCase()
      )
    })

  // =========================================
  // SUMMARY
  // =========================================

  const activeAssignments =
    assignments.filter(
      (item) =>
        item.status === 'active'
    ).length

  const inactiveAssignments =
    assignments.filter(
      (item) =>
        item.status === 'inactive'
    ).length

  const activeCategories =
    categories.filter(
      (item) =>
        item.status === 'active'
    )

  const activeAgents =
    agents.filter(
      (item) =>
        item.status === 'active'
    )

  const formatAssignedDate = (value) => {
    if (!value) return '-'

    const date = new Date(`${String(value).split('T')[0]}T00:00:00`)
    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(locale)
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page">

      <button
        className="back-button"
        onClick={() =>
          navigate('/admin')
        }
      >
        ← {t('adminDashboard')}
      </button>

      <div className="customer-profile-header">

        <div>
          <p>{t('appName')}</p>

          <h1>
            {t('agentAssignment')}
          </h1>

          <span>
            {t('agentAssignmentDescription')}
          </span>
        </div>

      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('totalAssignments')}
          </span>

          <strong>
            {assignments.length}
          </strong>
        </div>

        <div>
          <span>
            Active
          </span>

          <strong>
            {activeAssignments}
          </strong>
        </div>

        <div>
          <span>
            Inactive
          </span>

          <strong>
            {inactiveAssignments}
          </strong>
        </div>

      </div>

      {/* ADD / EDIT */}

      <div className="daily-manage-section">

        <h2>
          {editingId
            ? t('editAssignment')
            : t('assignCategoryToAgent')}
        </h2>

        <form
          onSubmit={saveAssignment}
          className="daily-payment-form"
        >

          <div>
            <label>
              {t('collectionCategory')} *
            </label>

            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(
                  e.target.value
                )
              }
              required
            >
              <option value="">
                {t('selectCategory')}
              </option>

              {activeCategories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.category_name}
                  </option>
                )
              )}

            </select>
          </div>

          <div>
            <label>
              {t('collectionType')} *
            </label>

            <select
              value={collectionType}
              onChange={(e) => setCollectionType(e.target.value)}
              required
            >
              <option value="daily">{t('dailyLoan')}</option>
              <option value="weekly">{t('weeklyLoan')}</option>
              <option value="monthly">{t('monthlyLoan')}</option>
              <option value="interest_only">{t('interestOnlyLoan')}</option>
              <option value="all">{t('allLoanTypesLegacy')}</option>
            </select>
          </div>

          <div>
            <label>
              {t('agent')} *
            </label>

            <select
              value={agentId}
              onChange={(e) =>
                setAgentId(
                  e.target.value
                )
              }
              required
            >
              <option value="">
                {t('selectAgent')}
              </option>

              {activeAgents.map(
                (agent) => (
                  <option
                    key={agent.id}
                    value={agent.id}
                  >
                    {agent.agent_id}
                    {' - '}
                    {agent.full_name}
                  </option>
                )
              )}

            </select>
          </div>

          <div>
            <label>
              {t('assignedDate')} *
            </label>

            <input
              type="date"
              value={assignedDate}
              onChange={(e) =>
                setAssignedDate(
                  e.target.value
                )
              }
              required
            />
          </div>

          <div>
            <label>
              Status
            </label>

            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value
                )
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

          <button
            type="submit"
            className="record-payment-button"
            disabled={saving}
          >
            {saving
              ? t('saving')
              : editingId
                ? t('updateAssignment')
                : t('assignAgent')}
          </button>

          {editingId && (
            <button
              type="button"
              className="back-button"
              onClick={clearForm}
              disabled={saving}
            >
              {t('cancelEdit')}
            </button>
          )}

        </form>

      </div>

      {/* LIST */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <div>
            <h2>
              {t('assignmentList')}
            </h2>

            <p>
              {t('assignmentCount', { count: filteredAssignments.length })}
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
            placeholder={t('searchAssignments')}
            style={{
              padding: '10px 12px',
              minWidth: '240px',
              border:
                '1px solid #d7e0ec',
              borderRadius: '8px'
            }}
          />

        </div>

        {loading ? (

          <div className="no-payment-history">
            {t('loadingAssignments')}
          </div>

        ) : filteredAssignments.length === 0 ? (

          <div className="no-payment-history">
            {t('noAssignmentsFound')}
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('collectionCategory')}</th>
                  <th>{t('collectionType')}</th>
                  <th>{t('agentIdLabel')}</th>
                  <th>{t('fullName')}</th>
                  <th>{t('assignedDate')}</th>
                  <th>{t('status')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>

              <tbody>

                {filteredAssignments.map(
                  (assignment, index) => (

                    <tr key={assignment.id}>

                      <td>
                        {index + 1}
                      </td>

                      <td>
                        <strong>
                          {assignment
                            .collection_categories
                            ?.category_name ||
                            '-'}
                        </strong>
                      </td>

                      <td>
                        {t(({ daily: 'dailyLoan', weekly: 'weeklyLoan', monthly: 'monthlyLoan', interest_only: 'interestOnlyLoan', all: 'allLoanTypesLegacy' })[assignment.collection_type || 'all'])}
                      </td>

                      <td>
                        {assignment
                          .agents
                          ?.agent_id ||
                          '-'}
                      </td>

                      <td>
                        {assignment
                          .agents
                          ?.full_name ||
                          '-'}
                      </td>

                      <td>
                          {formatAssignedDate(assignment.assigned_date)}
                      </td>

                      <td>

                        <span
                          className={
                            assignment.status ===
                            'active'
                              ? 'schedule-status schedule-paid'
                              : 'schedule-status schedule-pending'
                          }
                        >
                          {assignment.status ===
                          'active'
                            ? 'Active'
                            : t('inactive')}
                        </span>

                      </td>

                      <td>

                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap'
                          }}
                        >

                          <button
                            type="button"
                            className="record-payment-button"
                            onClick={() =>
                              editAssignment(
                                assignment
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="back-button"
                            onClick={() =>
                              deleteAssignment(
                                assignment
                              )
                            }
                          >
                            Delete
                          </button>

                        </div>

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

export default AgentAssignments