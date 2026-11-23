import { notify } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { generateCustomerId } from '../../utils/customerId'
import { isValidPhone, normalizePhone } from '../../utils/phone'
import VoiceInputButton from '../../components/VoiceInputButton'
import SelectMenu from '../../components/SelectMenu'
import { getLocalId } from '../../services/offlineDb'
import { cacheQuery, cacheSet, enqueueMutation } from '../../services/offlineSync'
import { refreshSyncState } from '../../store/slices/syncSlice'

const CUSTOMERS_CACHE_KEY = 'customers:list'
const CUSTOMERS_CACHE_TTL = 2 * 60 * 1000

function isNetworkFailure(error) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return /failed to fetch|network|fetch|load failed/i.test(String(error?.message || ''))
}

function isLocalId(id) {
  return String(id || '').startsWith('local-')
}

function Customers() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { t } = useTranslation()

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingCachedData, setUsingCachedData] = useState(false)

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

  async function loadCustomers() {
    setLoading(true)

    const { data, error, fromCache } = await cacheQuery(
      CUSTOMERS_CACHE_KEY,
      () =>
        supabase
          .from('customers')
          .select('*')
          .order('created_at', {
            ascending: false
          }),
      { ttlMs: CUSTOMERS_CACHE_TTL }
    )

    if (error) {
      console.error(error)
      notify(error.message)
      setLoading(false)
      return
    }

    setCustomers(data || [])
    setUsingCachedData(Boolean(fromCache))
    setLoading(false)
  }

  async function queueCustomerWrite(mutation, optimisticCustomers) {
    await enqueueMutation({
      idempotencyKey: mutation.idempotencyKey || `customer-${mutation.action}-${Date.now()}`,
      ...mutation
    })
    await cacheSet(CUSTOMERS_CACHE_KEY, optimisticCustomers, CUSTOMERS_CACHE_TTL)
    setCustomers(optimisticCustomers)
    setUsingCachedData(true)
    dispatch(refreshSyncState())
    notify(
      t(
        'savedOfflineWillSync',
        'Saved on this device. It will sync automatically when the connection returns.'
      )
    )
    resetForm()
  }

  const openAddCustomer = () => {
    setEditingId(null)
    setCustomerId(generateCustomerId())
    setFullName('')
    setPhone('')
    setAddress('')
    setStatus('active')
    setShowForm(true)
  }

  const resetForm = () => {
    setCustomerId('')
    setFullName('')
    setPhone('')
    setAddress('')
    setStatus('active')
    setEditingId(null)
    setShowForm(false)
  }

  const saveCustomer = async (e) => {
    e.preventDefault()

    if (!fullName.trim()) {
      notify(t('enterCustomerName'))
      return
    }

    if (!customerId.trim()) {
      notify(t('customerIdRequired'))
      return
    }

    if (!isValidPhone(phone)) {
      notify(t('agentPhoneMustBeTenDigits'))
      return
    }

    // getSession reads the cached session, so a customer can still be entered
    // when the device is offline. getUser() would require the network.
    const {
      data: { session }
    } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) {
      notify(t('loginRequired'))
      return
    }

    const customerData = {
      customer_id: customerId.trim(),
      full_name: fullName.trim(),
      phone: normalizePhone(phone),
      address: address.trim() || null,
      status
    }

    const isEditing = Boolean(editingId)
    const match = isEditing
      ? isLocalId(editingId)
        ? { customer_id: customerData.customer_id }
        : { id: editingId }
      : null

    const optimisticRow = isEditing
      ? {
          ...(customers.find((customer) => customer.id === editingId) || {}),
          ...customerData,
          id: editingId,
          _offline: true
        }
      : {
          ...customerData,
          id: getLocalId(),
          created_by: user.id,
          created_at: new Date().toISOString(),
          _offline: true
        }

    const optimisticCustomers = isEditing
      ? customers.map((customer) =>
          customer.id === editingId ? optimisticRow : customer
        )
      : [optimisticRow, ...customers]

    const queuedMutation = {
      table: 'customers',
      action: isEditing ? 'update' : 'insert',
      payload: isEditing ? customerData : { ...customerData, created_by: user.id },
      match,
      idempotencyKey: `customer-${isEditing ? editingId : customerData.customer_id}`
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueCustomerWrite(queuedMutation, optimisticCustomers)
      return
    }

    if (isEditing) {
      const { error } = await supabase
        .from('customers')
        .update(customerData)
        .match(match)

      if (error) {
        console.error(error)
        if (isNetworkFailure(error)) {
          await queueCustomerWrite(queuedMutation, optimisticCustomers)
          return
        }
        notify(error.message)
        return
      }

      notify(t('customerUpdatedSuccessfully'))
    } else {
      const { error } = await supabase.from('customers').insert([
        {
          ...customerData,
          created_by: user.id
        }
      ])

      if (error) {
        console.error(error)
        if (error.code === '23505') {
          notify(t('customerIdAlreadyExists'))
        } else if (isNetworkFailure(error)) {
          await queueCustomerWrite(queuedMutation, optimisticCustomers)
          return
        } else {
          notify(error.message)
        }
        return
      }

      notify(t('customerAddedSuccessfully'))
    }

    resetForm()
    await loadCustomers()
  }

  const editCustomer = (customer) => {
    setEditingId(customer.id)
    setCustomerId(customer.customer_id || '')
    setFullName(customer.full_name || '')
    setPhone(normalizePhone(customer.phone))
    setAddress(customer.address || '')
    setStatus(customer.status || 'active')
    setShowForm(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  const deleteCustomer = async (customer) => {
    const confirmed = window.confirm(`${t('delete')} ${customer.full_name}?`)
    if (!confirmed) return

    const match = isLocalId(customer.id)
      ? { customer_id: customer.customer_id }
      : { id: customer.id }
    const optimisticCustomers = customers.filter((item) => item.id !== customer.id)
    const queuedMutation = {
      table: 'customers',
      action: 'delete',
      match,
      idempotencyKey: `customer-delete-${customer.customer_id || customer.id}`
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueCustomerWrite(queuedMutation, optimisticCustomers)
      return
    }

    const { error } = await supabase.from('customers').delete().match(match)
    if (error) {
      console.error(error)
      if (isNetworkFailure(error)) {
        await queueCustomerWrite(queuedMutation, optimisticCustomers)
        return
      }
      notify(error.message)
      return
    }

    await loadCustomers()
  }

  const filteredCustomers = customers.filter((customer) => {
    const text = `${customer.customer_id || ''} ${customer.full_name || ''} ${customer.phone || ''} ${customer.address || ''}`
    return text.toLowerCase().includes(search.toLowerCase())
  })

  const activeCustomers = customers.filter((c) => c.status === 'active').length
  const inactiveCustomers = customers.filter((c) => c.status === 'inactive').length

  return (
    <div className="customers-page-layout flex flex-col w-full">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <span className="px-space-sm py-space-xs rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold uppercase tracking-wider">
              Tier-1 KYC Registry
            </span>
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Institutional Counterparty Directory
            </span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface">
            {t('customers')}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {t('customersPageDescription') || 'Manage institutional debtors, legal dossiers, credit history and account profiles.'}
          </p>
        </div>

        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            className="flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low transition-colors font-label-lg text-label-lg border border-outline-variant/30 cursor-pointer"
            onClick={() => navigate('/admin')}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>{t('back')}</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
            onClick={openAddCustomer}
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>{t('addCustomer')}</span>
          </button>
        </div>
      </div>

      {/* Summary Pods */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <div className="p-space-md rounded-DEFAULT bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-outline-variant/20 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{t('totalCustomers')}</span>
            <span className="font-data-metric text-data-metric text-on-surface font-bold">{customers.length}</span>
          </div>
          <div className="w-10 h-10 rounded-DEFAULT bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[22px]">group</span>
          </div>
        </div>

        <div className="p-space-md rounded-DEFAULT bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-outline-variant/20 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{t('activeCustomers')}</span>
            <span className="font-data-metric text-data-metric text-primary font-bold">{activeCustomers}</span>
          </div>
          <div className="w-10 h-10 rounded-DEFAULT bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[22px]">verified</span>
          </div>
        </div>

        <div className="p-space-md rounded-DEFAULT bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-outline-variant/20 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{t('inactiveCustomers')}</span>
            <span className="font-data-metric text-data-metric text-outline font-bold">{inactiveCustomers}</span>
          </div>
          <div className="w-10 h-10 rounded-DEFAULT bg-surface-container-low flex items-center justify-center text-outline">
            <span className="material-symbols-outlined text-[22px]">block</span>
          </div>
        </div>
      </div>

      {/* ADD / EDIT FORM MODAL / CARD */}
      {showForm && (
        <form
          onSubmit={saveCustomer}
          className="p-space-lg rounded-DEFAULT bg-surface-container-lowest shadow-md border border-primary/20 flex flex-col gap-space-md transition-all"
        >
          <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-DEFAULT bg-primary flex items-center justify-center text-on-primary">
                <span className="material-symbols-outlined text-[18px]">
                  {editingId ? 'edit' : 'person_add'}
                </span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {editingId ? t('editCustomer') : t('addCustomer')}
                </h2>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('enterCustomerInformation')}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center hover:bg-surface-container-high border-0 cursor-pointer"
              onClick={resetForm}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                {t('customerId')}
              </label>
              <input
                type="text"
                value={customerId}
                readOnly
                className="px-space-md py-space-sm rounded-DEFAULT bg-surface-container-low border border-outline-variant/30 text-on-surface font-mono text-sm cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                {t('customerName')} *
              </label>
              <div className="voice-field">
                <input
                  type="text"
                  placeholder={t('enterCustomerName')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-space-md py-space-sm pr-12 rounded-DEFAULT bg-surface-container-lowest border border-outline-variant/40 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <VoiceInputButton
                  className="voice-field-button"
                  onResult={(text) =>
                    setFullName((previous) =>
                      [previous, text].filter(Boolean).join(' ')
                    )
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                {t('phoneNumber')}
              </label>
              <div className="voice-field">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(normalizePhone(e.target.value))}
                  maxLength={10}
                  inputMode="numeric"
                  placeholder={t('tenDigitPhoneNumber')}
                  className="w-full px-space-md py-space-sm pr-12 rounded-DEFAULT bg-surface-container-lowest border border-outline-variant/40 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <VoiceInputButton
                  className="voice-field-button"
                  onResult={(text) =>
                    setPhone((previous) => normalizePhone(`${previous}${text}`))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
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

            <div className="flex flex-col gap-space-xs md:col-span-2 lg:col-span-4">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                {t('address')}
              </label>
              <div className="voice-field">
                <textarea
                  rows="2"
                  placeholder={t('enterCustomerAddress')}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-space-md py-space-sm pr-12 rounded-DEFAULT bg-surface-container-lowest border border-outline-variant/40 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-y"
                />
                <VoiceInputButton
                  className="voice-field-button voice-field-button--top"
                  onResult={(text) =>
                    setAddress((previous) =>
                      [previous, text].filter(Boolean).join(' ')
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-space-sm pt-space-xs">
            <button
              type="button"
              className="px-space-md py-space-sm rounded-DEFAULT bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md border-0 cursor-pointer"
              onClick={resetForm}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-colors border-0 cursor-pointer shadow-sm"
            >
              {editingId ? t('updateCustomer') : t('saveCustomer')}
            </button>
          </div>
        </form>
      )}

      {usingCachedData && (
        <div className="offline-inline-banner" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <span>
            {t(
              'offlineCachedData',
              'Showing the last cached copy. New entries are saved on this device and sync automatically.'
            )}
          </span>
        </div>
      )}

      {/* SEARCH BAR */}
      <div className="relative w-full">
        <input
          type="text"
          placeholder={t('searchCustomers')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-4 pr-14 py-3 rounded-DEFAULT bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-sm font-body-md text-body-md"
        />
        <VoiceInputButton
          className="voice-field-button voice-field-button--search"
          onResult={(text) => setSearch(text)}
        />
      </div>

      {/* CUSTOMER DIRECTORY LIST */}
      <div className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
            {t('customerList')} ({filteredCustomers.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-space-xl text-center text-outline bg-surface-container-lowest rounded-DEFAULT shadow-sm">
            <span className="material-symbols-outlined text-[32px] animate-spin text-primary">sync</span>
            <p className="mt-2 font-body-md">{t('loadingCustomers')}</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-space-xl text-center bg-surface-container-lowest rounded-DEFAULT shadow-sm border border-outline-variant/20 flex flex-col items-center gap-space-sm">
            <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[26px]">person_off</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">{t('noCustomersFound')}</h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-sm">{t('addFirstCustomer')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="flex flex-col justify-between p-space-md rounded-DEFAULT bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-outline-variant/20 gap-space-md hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-sm">
                      <div className="w-10 h-10 rounded-DEFAULT bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-base shadow-sm">
                        {customer.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-tight">
                          {customer.full_name}
                        </h3>
                        <span className="font-label-sm text-label-sm text-outline font-mono">
                          {customer.customer_id}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                        customer.status === 'active'
                          ? 'bg-surface-container-high text-primary'
                          : 'bg-surface-container-low text-outline'
                      }`}
                    >
                      {customer.status === 'active' ? t('active') : t('inactive')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 text-sm text-on-surface-variant pt-2 border-t border-outline-variant/20">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-outline">call</span>
                      <span>{customer.phone || t('notProvided')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-outline mt-0.5">location_on</span>
                      <span className="line-clamp-2">{customer.address || t('notProvided')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-space-sm border-t border-outline-variant/20">
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-DEFAULT bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-colors border-0 cursor-pointer shadow-sm"
                    onClick={() =>
                      navigate(`/customers/${customer.id}`, {
                        state: { customer }
                      })
                    }
                  >
                    <span>{t('viewProfile')}</span>
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border-0 cursor-pointer"
                      onClick={() => editCustomer(customer)}
                      title={t('edit')}
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      type="button"
                      className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-outline hover:bg-error-container hover:text-on-error-container transition-colors border-0 cursor-pointer"
                      onClick={() => deleteCustomer(customer)}
                      title={t('delete')}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Customers
