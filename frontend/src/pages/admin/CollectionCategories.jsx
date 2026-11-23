import { notify } from '../../utils/notify'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import SelectMenu from '../../components/SelectMenu'
import { useMobileFormReveal } from '../../hooks/useMobileFormReveal'

function CollectionCategories() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const returnTo = location.state?.returnTo

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const formSectionRef = useRef(null)
  const revealForm = useMobileFormReveal(
    isFormOpen,
    formSectionRef
  )

  const [categoryName, setCategoryName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('active')
  const [categoryType, setCategoryType] = useState('daily')
  const [typeColumnMissing, setTypeColumnMissing] = useState(false)

  const [editingId, setEditingId] = useState(null)

  const categoryTypeOptions = [
    { value: 'daily', label: t('dailyCategoryType') },
    { value: 'weekly', label: t('weekly') },
    { value: 'monthly', label: t('monthly') },
    { value: 'interest', label: t('interest') }
  ]

  const getCategoryTypeLabel = (value) =>
    categoryTypeOptions.find(
      (option) => option.value === value
    )?.label || value || '-'

  // Until the category type migration is applied, PostgREST rejects writes
  // that mention category_type. Retry without it so editing still works.
  const isMissingTypeColumnError = (error) =>
    Boolean(error) &&
    error.code === '42703' &&
    /category_type/i.test(error.message || '')

  const omitTypeFrom = (payload) => {
    const next = { ...payload }
    delete next.category_type
    return next
  }

  useEffect(() => {
    loadCategories()
  }, [])

  // =========================================
  // LOAD CATEGORIES
  // =========================================

  async function loadCategories() {
    setLoading(true)

    const {
      data,
      error
    } = await supabase
      .from('collection_categories')
      .select('*')
      .order('created_at', {
        ascending: false
      })

    if (error) {
      console.error(error)

      notify(
        t('categoriesLoadFailed', { message: error.message })
      )

      setLoading(false)
      return
    }

    setCategories(data || [])
    setLoading(false)
  }

  // =========================================
  // CLEAR FORM
  // =========================================

  const clearForm = () => {
    setCategoryName('')
    setDescription('')
    setStatus('active')
    setCategoryType('daily')
    setEditingId(null)
  }

  // Toggle the add form. Opening it always starts a fresh entry,
  // discarding any unfinished edit.
  const openAddForm = () => {
    if (isFormOpen && !editingId) {
      setIsFormOpen(false)
      return
    }

    clearForm()
    setIsFormOpen(true)
    revealForm()
  }

  const closeForm = () => {
    clearForm()
    setIsFormOpen(false)
  }

  // =========================================
  // SAVE / UPDATE
  // =========================================

  const saveCategory = async (e) => {
    e.preventDefault()

    const cleanName =
      categoryName.trim()

    if (!cleanName) {
      notify(t('enterCategoryName'))
      return
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

    const omitType =
      typeColumnMissing

    const basePayload = {
      category_name: cleanName,
      description:
        description.trim(),
      status,
      ...(omitType
        ? {}
        : { category_type: categoryType })
    }

    const updatePayload = {
      ...basePayload,
      updated_at: new Date().toISOString()
    }

    // UPDATE
    if (editingId) {
      // Request the updated row back so a silent RLS denial (zero rows
      // affected, no error) cannot be reported as a successful edit.
      let result = await supabase
        .from('collection_categories')
        .update(updatePayload)
        .select('id')
        .eq('id', editingId)

      let { error, data: updatedRows } = result

      if (
        error &&
        !omitType &&
        isMissingTypeColumnError(error)
      ) {
        setTypeColumnMissing(true)

        result = await supabase
          .from('collection_categories')
          .update(
            omitTypeFrom(updatePayload)
          )
          .select('id')
          .eq('id', editingId)

        error = result.error
        updatedRows = result.data
      }

      if (
        !error &&
        Array.isArray(updatedRows) &&
        updatedRows.length === 0
      ) {
        error = new Error(
          t('categoryUpdateNoRows')
        )
      }

      if (error) {
        console.error(error)
        setSaving(false)

        notify(
          t('categoryUpdateFailed', { message: error.message })
        )
        return
      }

      notify(
        t('categoryUpdatedSuccessfully')
      )
    }

    // CREATE
    else {
      let { error } = await supabase
        .from('collection_categories')
        .insert({
          ...basePayload,
          created_by: user.id
        })

      if (
        error &&
        !omitType &&
        isMissingTypeColumnError(error)
      ) {
        setTypeColumnMissing(true)

        const retry = await supabase
          .from('collection_categories')
          .insert({
            ...omitTypeFrom(basePayload),
            created_by: user.id
          })

        error = retry.error
      }

      if (error) {
        console.error(error)
        setSaving(false)

        if (error.code === '23505') {
          notify(
            t('categoryNameAlreadyExists')
          )
        } else {
          notify(
            t('categoryCreateFailed', { message: error.message })
          )
        }

        return
      }

      notify(
        t('categoryCreatedSuccessfully')
      )
    }

    clearForm()
    setIsFormOpen(false)
    await loadCategories()
    setSaving(false)
  }

  // =========================================
  // EDIT
  // =========================================

  const editCategory = (category) => {
    setEditingId(category.id)
    setCategoryName(
      category.category_name || ''
    )
    setDescription(
      category.description || ''
    )
    setStatus(
      category.status || 'active'
    )
    setCategoryType(
      category.category_type || 'daily'
    )
    setIsFormOpen(true)

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

  const deleteCategory = async (category) => {
    const confirmed =
      window.confirm(
        t('confirmDeleteCategory', {
          categoryName: category.category_name
        })
      )

    if (!confirmed) return

    const { error } = await supabase
      .from('collection_categories')
      .delete()
      .eq('id', category.id)

    if (error) {
      console.error(error)

      notify(
        t('categoryDeleteFailed', { message: error.message })
      )

      return
    }

    if (editingId === category.id) {
      clearForm()
    }

    await loadCategories()

    notify(
      t('categoryDeletedSuccessfully')
    )
  }

  // =========================================
  // SEARCH
  // =========================================

  const filteredCategories =
    categories.filter((category) => {
      const text =
        `${category.category_name || ''} ${category.description || ''} ${category.status || ''} ${getCategoryTypeLabel(category.category_type)}`
          .toLowerCase()

      return text.includes(
        search.toLowerCase()
      )
    })

  const activeCount =
    categories.filter(
      (category) =>
        category.status === 'active'
    ).length

  const inactiveCount =
    categories.filter(
      (category) =>
        category.status === 'inactive'
    ).length

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page">

      <button
        className="back-button"
        onClick={() =>
          navigate(
            returnTo || '/admin',
            returnTo
              ? { state: location.state?.returnState }
              : undefined
          )
        }
      >
        ← {returnTo
          ? t(
              location.state?.returnLabelKey || 'backToFinanceSetup',
              'Back to Finance Setup'
            )
          : t('adminDashboard')}
      </button>

      <div className="customer-profile-header">

        <div>
          <p>
            {t('appName')}
          </p>

          <h1>
            {t('collectionCategories')}
          </h1>

          <span>
            {t('collectionCategoriesDescription')}
          </span>
        </div>

      </div>

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('totalCategories')}
          </span>

          <strong>
            {categories.length}
          </strong>
        </div>

        <div>
          <span>
            Active
          </span>

          <strong>
            {activeCount}
          </strong>
        </div>

        <div>
          <span>
            Inactive
          </span>

          <strong>
            {inactiveCount}
          </strong>
        </div>

      </div>

      {/* ADD CATEGORY BUTTON */}

      <div className="collection-category-actions">

        <button
          type="button"
          className="collection-category-add-button"
          aria-expanded={isFormOpen}
          aria-controls="collection-category-form"
          onClick={openAddForm}
        >
          <span aria-hidden="true">＋</span>
          {t('addCollectionCategory')}
        </button>

      </div>

      {/* ADD / EDIT */}

      {isFormOpen && (

      <div
        ref={formSectionRef}
        id="collection-category-form"
        className="daily-manage-section"
      >

        <h2>
          {editingId
            ? t('editCollectionCategory')
            : t('addCollectionCategory')}
        </h2>

        <form
          onSubmit={saveCategory}
          className="daily-payment-form"
        >

          <div>
            <label>
              {t('categoryName')} *
            </label>

            <input
              type="text"
              value={categoryName}
              onChange={(e) =>
                setCategoryName(
                  e.target.value
                )
              }
              placeholder={t('exampleMondayCollection')}
              required
            />
          </div>

          <div>
            <label>
              {t('description')}
            </label>

            <input
              type="text"
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
              placeholder={t('exampleCollectionDescription')}
            />
          </div>

          <div>
            <label>
              {t('categoryType')}
            </label>

            <SelectMenu
              value={categoryType}
              onChange={setCategoryType}
              ariaLabel={t('categoryType')}
              options={categoryTypeOptions}
              disabled={typeColumnMissing}
            />

            {typeColumnMissing && (
              <small className="collection-category-type-hint">
                {t('categoryTypeUnavailable')}
              </small>
            )}
          </div>

          <div>
            <label>
              {t('status')}
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
            className="record-payment-button"
            disabled={saving}
          >
            {saving
              ? t('saving')
              : editingId
                ? t('updateCategory')
                : t('addCategory')}
          </button>

          {editingId && (
            <button
              type="button"
              className="back-button"
              onClick={closeForm}
              disabled={saving}
            >
              {t('cancelEdit')}
            </button>
          )}

        </form>

      </div>

      )}

      {/* CATEGORY LIST - always visible */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <div>
            <h2>
              {t('categoryList')}
            </h2>

            <p>
              {t('categoryCount', { count: filteredCategories.length })}
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
            placeholder={t('searchCategories')}
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
            {t('loadingCategories')}
          </div>

        ) : filteredCategories.length === 0 ? (

          <div className="no-payment-history">
            {t('noCollectionCategoriesFound')}
          </div>

        ) : (

          <div className="payment-table-wrapper">

            <table className="payment-history-table">

              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('categoryName')}</th>
                  <th>{t('description')}</th>
                  <th>{t('categoryType')}</th>
                  <th>{t('status')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>

              <tbody>

                {filteredCategories.map(
                  (category, index) => (

                    <tr key={category.id}>

                      <td>
                        {index + 1}
                      </td>

                      <td>
                        <strong>
                          {category.category_name}
                        </strong>
                      </td>

                      <td>
                        {category.description ||
                          '-'}
                      </td>

                      <td>
                        {getCategoryTypeLabel(
                          category.category_type
                        )}
                      </td>

                      <td>

                        <span
                          className={
                            category.status ===
                            'active'
                              ? 'schedule-status schedule-paid'
                              : 'schedule-status schedule-pending'
                          }
                        >
                          {category.status ===
                          'active'
                            ? t('active')
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
                              editCategory(
                                category
                              )
                            }
                          >
                            {t('edit')}
                          </button>

                          <button
                            type="button"
                            className="back-button"
                            onClick={() =>
                              deleteCategory(
                                category
                              )
                            }
                          >
                            {t('delete')}
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

export default CollectionCategories