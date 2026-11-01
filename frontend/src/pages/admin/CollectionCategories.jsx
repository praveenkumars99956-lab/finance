import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function CollectionCategories() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const returnTo = location.state?.returnTo

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')

  const [categoryName, setCategoryName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('active')

  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    loadCategories()
  }, [])

  // =========================================
  // LOAD CATEGORIES
  // =========================================

  const loadCategories = async () => {
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

      alert(
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
    setEditingId(null)
  }

  // =========================================
  // SAVE / UPDATE
  // =========================================

  const saveCategory = async (e) => {
    e.preventDefault()

    const cleanName =
      categoryName.trim()

    if (!cleanName) {
      alert(t('enterCategoryName'))
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

    // UPDATE
    if (editingId) {
      const { error } = await supabase
        .from('collection_categories')
        .update({
          category_name: cleanName,
          description:
            description.trim(),
          status,
          updated_at:
            new Date().toISOString()
        })
        .eq('id', editingId)

      if (error) {
        console.error(error)
        setSaving(false)

        alert(
          t('categoryUpdateFailed', { message: error.message })
        )
        return
      }

      alert(
        t('categoryUpdatedSuccessfully')
      )
    }

    // CREATE
    else {
      const { error } = await supabase
        .from('collection_categories')
        .insert({
          category_name: cleanName,
          description:
            description.trim(),
          status,
          created_by: user.id
        })

      if (error) {
        console.error(error)
        setSaving(false)

        if (error.code === '23505') {
          alert(
            t('categoryNameAlreadyExists')
          )
        } else {
          alert(
            t('categoryCreateFailed', { message: error.message })
          )
        }

        return
      }

      alert(
        t('categoryCreatedSuccessfully')
      )
    }

    clearForm()
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

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
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

      alert(
        t('categoryDeleteFailed', { message: error.message })
      )

      return
    }

    if (editingId === category.id) {
      clearForm()
    }

    await loadCategories()

    alert(
      t('categoryDeletedSuccessfully')
    )
  }

  // =========================================
  // SEARCH
  // =========================================

  const filteredCategories =
    categories.filter((category) => {
      const text =
        `${category.category_name || ''} ${category.description || ''} ${category.status || ''}`
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
          navigate(returnTo || '/admin')
        }
      >
        ← {returnTo
          ? t('backToDailyFinance', 'Back to Daily Finance')
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

      {/* ADD / EDIT */}

      <div className="daily-manage-section">

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
              {t('status')}
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
                ? t('updateCategory')
                : t('addCategory')}
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

      {/* CATEGORY LIST */}

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