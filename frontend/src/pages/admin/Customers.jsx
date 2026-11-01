import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { generateCustomerId } from '../../utils/customerId'

function Customers() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [customerId, setCustomerId] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState('active')

  const [search, setSearch] = useState('')

  useEffect(() => {
    loadCustomers()
  }, [])

  // =========================================
  // LOAD CUSTOMERS
  // =========================================

  const loadCustomers = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', {
        ascending: false
      })

    if (error) {
      console.error(error)
      alert(error.message)
      setLoading(false)
      return
    }

    setCustomers(data || [])
    setLoading(false)
  }

  // =========================================
  // OPEN ADD CUSTOMER
  // =========================================

  const openAddCustomer = () => {
    setEditingId(null)

    setCustomerId(
      generateCustomerId()
    )

    setFullName('')
    setPhone('')
    setAddress('')
    setStatus('active')

    setShowForm(true)
  }

  // =========================================
  // RESET FORM
  // =========================================

  const resetForm = () => {
    setCustomerId('')
    setFullName('')
    setPhone('')
    setAddress('')
    setStatus('active')

    setEditingId(null)
    setShowForm(false)
  }

  // =========================================
  // SAVE CUSTOMER
  // =========================================

  const saveCustomer = async (e) => {
    e.preventDefault()

    if (!fullName.trim()) {
      alert(t('enterCustomerName'))
      return
    }

    if (!customerId.trim()) {
      alert(t('customerIdRequired'))
      return
    }

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      alert(t('pleaseLoginAgain'))
      navigate('/')
      return
    }

    const customerData = {
      customer_id: customerId.trim(),
      full_name: fullName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      status: status,
      updated_at: new Date().toISOString()
    }

    // =========================================
    // UPDATE CUSTOMER
    // =========================================

    if (editingId) {
      const { error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', editingId)

      if (error) {
        console.error(error)
        alert(error.message)
        return
      }

      alert(t('customerUpdatedSuccessfully'))
    }

    // =========================================
    // CREATE CUSTOMER
    // =========================================

    else {
      const { error } = await supabase
        .from('customers')
        .insert([
          {
            ...customerData,
            created_by: user.id
          }
        ])

      if (error) {
        console.error(error)

        if (error.code === '23505') {
          alert(t('customerIdAlreadyExists'))
        } else {
          alert(error.message)
        }

        return
      }

      alert(t('customerAddedSuccessfully'))
    }

    resetForm()
    await loadCustomers()
  }

  // =========================================
  // EDIT CUSTOMER
  // =========================================

  const editCustomer = (customer) => {
    setEditingId(customer.id)

    setCustomerId(
      customer.customer_id || ''
    )

    setFullName(
      customer.full_name || ''
    )

    setPhone(
      customer.phone || ''
    )

    setAddress(
      customer.address || ''
    )

    setStatus(
      customer.status || 'active'
    )

    setShowForm(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // =========================================
  // DELETE CUSTOMER
  // =========================================

  const deleteCustomer = async (customer) => {
    const confirmed = window.confirm(
      `${t('delete')} ${customer.full_name}?`
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customer.id)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    await loadCustomers()
  }

  // =========================================
  // SEARCH
  // =========================================

  const filteredCustomers =
    customers.filter((customer) => {
      const text =
        `${customer.customer_id || ''} ` +
        `${customer.full_name || ''} ` +
        `${customer.phone || ''} ` +
        `${customer.address || ''}`

      return text
        .toLowerCase()
        .includes(
          search.toLowerCase()
        )
    })

  // =========================================
  // COUNTS
  // =========================================

  const activeCustomers =
    customers.filter(
      (customer) =>
        customer.status === 'active'
    ).length

  const inactiveCustomers =
    customers.filter(
      (customer) =>
        customer.status === 'inactive'
    ).length

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customers-page">

      {/* HEADER */}

      <div className="customers-header">

        <div>

          <button
            className="back-button"
            onClick={() =>
              navigate('/admin')
            }
          >
            ← {t('back')}
          </button>

          <h1>
            {t('customers')}
          </h1>

          <p>
            {t('customersPageDescription')}
          </p>

        </div>

        <button
          className="add-customer-button"
          onClick={openAddCustomer}
        >
          + {t('addCustomer')}
        </button>

      </div>

      {/* =====================================
          SUMMARY
      ====================================== */}

      <div className="customer-summary-grid">

        <div className="customer-summary-card">

          <span>
            {t('totalCustomers')}
          </span>

          <h2>
            {customers.length}
          </h2>

        </div>

        <div className="customer-summary-card">

          <span>
            {t('activeCustomers')}
          </span>

          <h2>
            {activeCustomers}
          </h2>

        </div>

        <div className="customer-summary-card">

          <span>
            {t('inactiveCustomers')}
          </span>

          <h2>
            {inactiveCustomers}
          </h2>

        </div>

      </div>

      {/* =====================================
          ADD / EDIT CUSTOMER
      ====================================== */}

      {showForm && (

        <form
          className="customer-management-form"
          onSubmit={saveCustomer}
        >

          <div className="customer-form-title">

            <div>

              <h2>
                {editingId
                  ? t('editCustomer')
                  : t('addCustomer')}
              </h2>

              <p>
                {t('enterCustomerInformation')}
              </p>

            </div>

          </div>

          <div className="customer-form-grid">

            {/* CUSTOMER ID */}

            <div>

              <label>
                {t('customerId')}
              </label>

              <input
                type="text"
                value={customerId}
                readOnly
              />

            </div>

            {/* CUSTOMER NAME */}

            <div>

              <label>
                {t('customerName')} *
              </label>

              <input
                type="text"
                placeholder={t('enterCustomerName')}
                value={fullName}
                onChange={(e) =>
                  setFullName(
                    e.target.value
                  )
                }
              />

            </div>

            {/* PHONE */}

            <div>

              <label>
                {t('phoneNumber')}
              </label>

              <input
                type="tel"
                placeholder={t('enterPhoneNumber')}
                value={phone}
                onChange={(e) =>
                  setPhone(
                    e.target.value
                  )
                }
              />

            </div>

            {/* STATUS */}

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

            {/* ADDRESS */}

            <div className="full-width-field">

              <label>
                {t('address')}
              </label>

              <textarea
                rows="4"
                placeholder={t('enterCustomerAddress')}
                value={address}
                onChange={(e) =>
                  setAddress(
                    e.target.value
                  )
                }
              />

            </div>

          </div>

          {/* FORM BUTTONS */}

          <div className="customer-form-actions">

            <button
              type="submit"
              className="save-customer-button"
            >
              {editingId
                ? t('updateCustomer')
                : t('saveCustomer')}
            </button>

            <button
              type="button"
              className="cancel-customer-button"
              onClick={resetForm}
            >
              {t('cancel')}
            </button>

          </div>

        </form>

      )}

      {/* =====================================
          SEARCH
      ====================================== */}

      <div className="customer-search-box">

        <input
          type="text"
          placeholder={t('searchCustomers')}
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />

      </div>

      {/* =====================================
          CUSTOMER LIST
      ====================================== */}

      <div className="customer-list-section">

        <h2>
          {t('customerList')}
        </h2>

        {loading ? (

          <p>
            {t('loadingCustomers')}
          </p>

        ) : filteredCustomers.length === 0 ? (

          <div className="empty-customers">

            <h3>
              {t('noCustomersFound')}
            </h3>

            <p>
              {t('addFirstCustomer')}
            </p>

          </div>

        ) : (

          <div className="customer-management-grid">

            {filteredCustomers.map(
              (customer) => (

                <div
                  className="customer-management-card"
                  key={customer.id}
                >

                  {/* CUSTOMER TOP */}

                  <div className="customer-card-top">

                    <div className="customer-avatar">

                      {customer.full_name
                        ?.charAt(0)
                        .toUpperCase()}

                    </div>

                    <div>

                      <h3>
                        {customer.full_name}
                      </h3>

                      <span>
                        {customer.customer_id}
                      </span>

                    </div>

                  </div>

                  {/* CUSTOMER DETAILS */}

                  <div className="customer-card-details">

                    <p>

                      <strong>
                        {t('phone')}:
                      </strong>{' '}

                      {customer.phone ||
                        t('notProvided')}

                    </p>

                    <p>

                      <strong>
                        {t('address')}:
                      </strong>{' '}

                      {customer.address ||
                        t('notProvided')}

                    </p>

                    <p>

                      <strong>
                        {t('status')}:
                      </strong>{' '}

                      <span
                        className={
                          customer.status === 'active'
                            ? 'status-active'
                            : 'status-inactive'
                        }
                      >
                        {customer.status === 'active'
                          ? t('active')
                          : t('inactive')}
                      </span>

                    </p>

                  </div>

                  {/* CUSTOMER ACTIONS */}

                  <div className="customer-card-actions">

                    <button
                      className="view-customer-button"
                      onClick={() =>
                        navigate(
                          `/customers/${customer.id}`,
                          {
                            state: {
                              customer
                            }
                          }
                        )
                      }
                    >
                      {t('viewProfile')}
                    </button>

                    <button
                      className="edit-customer-button"
                      onClick={() =>
                        editCustomer(
                          customer
                        )
                      }
                    >
                      {t('edit')}
                    </button>

                    <button
                      className="delete-customer-button"
                      onClick={() =>
                        deleteCustomer(
                          customer
                        )
                      }
                    >
                      {t('delete')}
                    </button>

                  </div>

                </div>

              )
            )}

          </div>

        )}

      </div>

    </div>
  )
}

export default Customers