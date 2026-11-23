import { notify } from '../../utils/notify'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { writeAuditLog } from '../../services/auditLog'
import { useMobileFormReveal } from '../../hooks/useMobileFormReveal'
import SelectMenu from '../../components/SelectMenu'
import {
  ensureInterestOnlyLoanCategory,
  ensureMonthlyLoanCategory,
  ensureWeeklyLoanCategory
} from '../../services/collectionCategories'

function AgentAssignments() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [categories, setCategories] = useState([])
  const [agents, setAgents] = useState([])
  const [assignments, setAssignments] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const formSectionRef = useRef(null)
  const revealForm = useMobileFormReveal(
    showForm,
    formSectionRef
  )

  const [categoryId, setCategoryId] = useState('')
  const [collectionType, setCollectionType] = useState('all')
  const [agentId, setAgentId] = useState('')
  const [assignedDate, setAssignedDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [status, setStatus] = useState('active')

  // Keep the original assignment selectable while editing, even if its
  // category or agent is no longer active/available.
  const currentAssignment = editingId
    ? assignments.find((assignment) => assignment.id === editingId)
    : null
  // The bypass only applies while editing the assignment unchanged. Flipping
  // an inactive assignment to active must still validate the agent.
  const isExistingAssignmentAgent = Boolean(
    currentAssignment &&
      String(currentAssignment.agent_id) === String(agentId) &&
      String(currentAssignment.status) === String(status)
  )

  useEffect(() => {
    loadPage()
  }, [])

  // =========================================
  // LOAD PAGE
  // =========================================

  async function loadPage() {
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
    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError) {
        throw userError
      }

      if (!user) {
        notify(t('pleaseLoginAgain'))
        navigate('/')
        return
      }

      await Promise.all([
        ensureWeeklyLoanCategory(user.id),
        ensureMonthlyLoanCategory(user.id),
        ensureInterestOnlyLoanCategory(user.id)
      ])

      const { data, error } = await supabase
        .from('collection_categories')
        .select('id, category_name, status, category_type')
        .eq('status', 'active')
        .order('category_name')

      if (error) {
        throw error
      }

      setCategories(data || [])
    } catch (error) {
      console.error(error)
      notify(
        t('categoriesLoadFailed', {
          message: error.message
        })
      )
    }
  }

  // =========================================
  // LOAD AGENTS
  // =========================================

  const loadAgents = async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('id, agent_id, full_name, status, auth_user_id')
      .order('full_name')

    if (error) {
      console.error(error)
      notify(t('agentsLoadFailed', { message: error.message }))
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
          full_name,
          auth_user_id,
          status
        )
      `)
      .order('created_at', {
        ascending: false
      })

    if (error) {
      console.error(error)
      notify(t('unableLoadAssignments', { message: error.message }))
      return
    }

    setAssignments(data || [])
  }

  // =========================================
  // CLEAR FORM
  // =========================================

  const clearForm = () => {
    setEditingId(null)
    setShowForm(false)
    setCategoryId('')
    setCollectionType('all')
    setAgentId('')
    setAssignedDate(
      new Date().toISOString().split('T')[0]
    )
    setStatus('active')
  }

  // A category already declares which loan product it belongs to. Keep the
  // collection type in sync with it so an assignment cannot silently hide every
  // loan in that category from the agent. "interest" is stored on categories
  // while finance records use "interest_only".
  const collectionTypeForCategory = (category) => {
    const categoryType = String(category?.category_type || '')
      .trim()
      .toLowerCase()

    if (categoryType === 'interest') {
      return 'interest_only'
    }

    return ['daily', 'weekly', 'monthly'].includes(categoryType)
      ? categoryType
      : 'all'
  }

  const handleCategoryChange = (value) => {
    setCategoryId(value)

    const selectedCategory = categories.find(
      (category) => String(category.id) === String(value)
    )

    if (selectedCategory?.category_type) {
      setCollectionType(
        collectionTypeForCategory(selectedCategory)
      )
    }
  }

  // Same interaction pattern as Customers and Agents: the header button
  // opens the assignment form, which keeps one Assign Agent create action.
  const openAssignAgent = () => {
    clearForm()
    setShowForm(true)

    const isMobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 640px)').matches

    if (isMobile) {
      revealForm()
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
  }

  // =========================================
  // SAVE ASSIGNMENT
  // =========================================

  const saveAssignment = async (e) => {
    e.preventDefault()

    if (!categoryId) {
      notify(t('selectCollectionCategory'))
      return
    }

    if (!['all', 'daily', 'weekly', 'monthly', 'interest_only'].includes(collectionType)) {
      notify(t('selectValidCollectionType'))
      return
    }

    if (!agentId) {
      notify(t('selectAgent'))
      return
    }

    const selectedAgent = agents.find(
      (agent) => String(agent.id) === String(agentId)
    )

    if (!selectedAgent) {
      notify(t('selectAgent'))
      return
    }

    if (
      !selectedAgent.auth_user_id &&
      (!editingId || (status === 'active' && !isExistingAssignmentAgent))
    ) {
      notify(t('agentAssignmentLoginRequired'))
      return
    }

    if (
      selectedAgent.status !== 'active' &&
      status === 'active' &&
      !isExistingAssignmentAgent
    ) {
      notify(t('agentAssignmentActiveRequired'))
      return
    }

    if (!assignedDate) {
      notify(t('selectAssignedDate'))
      return
    }

    const { data: activeCategoryLoans, error: categoryLoansError } =
      await supabase
        .from('finance_records')
        .select('finance_type')
        .eq('collection_category_id', Number(categoryId))
        .eq('loan_status', 'active')
        .gt('pending', 0)

    if (categoryLoansError) {
      console.error(categoryLoansError)
      notify(
        t('assignmentCategoryLoansCheckFailed', {
          message: categoryLoansError.message
        })
      )
      return
    }

    const normalizeFinanceType = (value) => {
      const normalized = String(value || '').trim().toLowerCase()
      return normalized === 'interest-only' || normalized === 'interestonly'
        ? 'interest_only'
        : normalized
    }
    const activeFinanceTypes = [
      ...new Set((activeCategoryLoans || []).map((loan) =>
        normalizeFinanceType(loan.finance_type)
      ))
    ].filter(Boolean)

    if (
      collectionType !== 'all' &&
      activeFinanceTypes.length > 0 &&
      !activeFinanceTypes.includes(collectionType)
    ) {
      const selectedCategory = categories.find(
        (category) => String(category.id) === String(categoryId)
      )
      const typeNames = {
        daily: t('dailyLoan'),
        weekly: t('weeklyLoan'),
        monthly: t('monthlyLoan'),
        interest_only: t('interestOnlyLoan')
      }
      const existingTypeNames = activeFinanceTypes
        .map((type) => typeNames[type] || type)
        .join(', ')

      if (!window.confirm(t('agentAssignmentTypeMismatch', {
        category: selectedCategory?.category_name || t('collectionCategory'),
        selectedType: typeNames[collectionType] || collectionType,
        existingTypes: existingTypeNames
      }))) {
        return
      }
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      notify(t('pleaseLoginAgain'))
      navigate('/')
      return
    }

    setSaving(true)

    // =====================================
    // UPDATE
    // =====================================

    if (editingId) {
      const { data: updatedAssignment, error } = await supabase
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
        .select('id')
        .single()

      if (error || !updatedAssignment?.id) {
        console.error(error || 'Update returned no row')

        if (error?.code === '23505') {
          notify(
            t('categoryAlreadyAssignedToAgent')
          )
        } else {
          notify(
            t('assignmentUpdateFailed', {
              message: error?.message || 'no row updated'
            })
          )
        }

        setSaving(false)
        return
      }

      notify(t('assignmentUpdatedSuccessfully'))
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
        notify(t('assignmentLookupFailed', { message: lookupError.message }))
        setSaving(false)
        return
      }

      const { data: savedAssignment, error } = existing?.length
        ? await supabase
          .from('category_agent_assignments')
          .update({
            assigned_date: assignmentData.assigned_date,
            status: assignmentData.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing[0].id)
          .select('id')
          .single()
        : await supabase
        .from('category_agent_assignments')
        .insert(assignmentData)
        .select('id')
        .single()

      if (error || !savedAssignment?.id) {
        console.error(error || 'Save returned no row')

        if (error?.code === '23505') {
          notify(t('collectionTypeAlreadyAssigned'))
        } else {
          notify(
            t('assignmentCreateFailed', {
              message: error?.message || 'no row saved'
            })
          )
        }

        setSaving(false)
        return
      }

      notify(existing?.length
        ? t('assignmentRefreshedSuccessfully')
        : t('agentAssignedSuccessfully'))
      await writeAuditLog({
        action: existing?.length ? 'assignment.reactivated' : 'assignment.created',
        entityType: 'category_agent_assignment',
        entityId: savedAssignment?.id || existing?.[0]?.id || null,
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
    setShowForm(true)

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

    const isMobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 640px)').matches

    if (isMobile) {
      revealForm()
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
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

    const { data: deletedAssignment, error } = await supabase
      .from('category_agent_assignments')
      .delete()
      .eq('id', assignment.id)
      .select('id')
      .maybeSingle()

    if (error || !deletedAssignment?.id) {
      console.error(error || 'Delete returned no row')

      notify(
        t('assignmentDeleteFailed', {
          message: error?.message || 'no row deleted'
        })
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
    notify(t('assignmentRemovedSuccessfully'))
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
        item.status === 'active' &&
        Boolean(item.auth_user_id)
    )

  const activeAssignmentsWithUnavailableAgent = assignments.filter(
    (assignment) =>
      assignment.status === 'active' &&
      (
        !assignment.agents?.auth_user_id ||
        assignment.agents?.status !== 'active'
      )
  ).length
  const currentAssignmentAgent = editingId
    ? agents.find((agent) => String(agent.id) === String(agentId))
    : null

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

        <button
          type="button"
          className="assignment-add-button flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
          onClick={openAssignAgent}
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>{t('assignAgent')}</span>
        </button>

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

      {activeAssignmentsWithUnavailableAgent > 0 && (
        <p role="alert">
          {t('activeAssignmentsWithUnavailableAgents', {
            count: activeAssignmentsWithUnavailableAgent
          })}
        </p>
      )}

      {/* ADD / EDIT */}

      {showForm && (

      <div
        ref={formSectionRef}
        className="assignment-form-section daily-manage-section"
      >

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

            <SelectMenu
              value={categoryId}
              onChange={handleCategoryChange}
              ariaLabel={t('collectionCategory')}
              placeholder={t('selectCategory')}
              options={[
                ...activeCategories.map((category) => ({
                  value: String(category.id),
                  label: category.category_name
                })),
                ...(currentAssignment &&
                !activeCategories.some(
                  (category) =>
                    String(category.id) ===
                    String(currentAssignment.category_id)
                )
                  ? [{
                      value: String(currentAssignment.category_id),
                      label: currentAssignment.collection_categories?.category_name ||
                        t('collectionCategory')
                    }]
                  : [])
              ]}
            />
          </div>

          <div>
            <label>
              {t('collectionType')} *
            </label>

            <SelectMenu
              value={collectionType}
              onChange={setCollectionType}
              ariaLabel={t('collectionType')}
              options={[
                { value: 'daily', label: t('dailyLoan') },
                { value: 'weekly', label: t('weeklyLoan') },
                { value: 'monthly', label: t('monthlyLoan') },
                { value: 'interest_only', label: t('interestOnlyLoan') },
                { value: 'all', label: t('allLoanTypesLegacy') }
              ]}
            />
          </div>

          <div>
            <label>
              {t('agent')} *
            </label>

            <SelectMenu
              value={agentId}
              onChange={setAgentId}
              ariaLabel={t('agent')}
              placeholder={t('selectAgent')}
              options={[
                ...activeAgents.map((agent) => ({
                  value: String(agent.id),
                  label: `${agent.agent_id} - ${agent.full_name}`
                })),
                ...(currentAssignmentAgent &&
                !activeAgents.includes(currentAssignmentAgent)
                  ? [
                      {
                        value: String(currentAssignmentAgent.id),
                        label: `${currentAssignmentAgent.agent_id} - ${currentAssignmentAgent.full_name} (${
                          currentAssignmentAgent.auth_user_id
                            ? t('agentAccountInactive')
                            : t('agentAssignmentLoginRequired')
                        })`
                      }
                    ]
                  : [])
              ]}
            />
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

            <SelectMenu
              value={status}
              onChange={setStatus}
              ariaLabel={t('status')}
              options={[
                { value: 'active', label: t('active') },
                { value: 'inactive', label: t('inactive') }
              ]}
            />
          </div>

          <button
            type="submit"
            className="assignment-submit-button record-payment-button"
            disabled={saving}
          >
            {saving
              ? t('saving')
              : editingId
                ? t('updateAssignment')
                : t('assignAgent')}
          </button>

          <button
            type="button"
            className="assignment-cancel-button back-button"
            onClick={clearForm}
            disabled={saving}
          >
            {t('cancel')}
          </button>

        </form>

      </div>

      )}

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
              border: '1px solid var(--fs-inline-border, #d7e0ec)',
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