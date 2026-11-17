import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function CustomerProfile() {
  const { customerId: id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [customer, setCustomer] = useState(null)
  const [financeRecords, setFinanceRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    loadCustomerProfile(active)

    return () => {
      active = false
    }
  }, [id])

  // =========================================
  // LOAD CUSTOMER PROFILE
  // =========================================

  async function loadCustomerProfile(active = true) {
    setLoading(true)
    setCustomer(null)
    setFinanceRecords([])

    // Validate customer database ID
    if (
      !/^[1-9]\d*$/.test(id || '') ||
      BigInt(id) > 9223372036854775807n
    ) {
      if (!active) return

      setLoading(false)

      notify(
        t(
          'invalidCustomerLink',
          'Invalid customer link. Please select a customer from the customer list.'
        )
      )

      navigate('/customers', {
        replace: true
      })

      return
    }

    // =========================================
    // AUTH
    // =========================================

    const {
      data: authData,
      error: authError
    } = await supabase.auth.getUser()

    if (!active) return

    if (authError || !authData?.user) {
      setLoading(false)

      navigate('/', {
        replace: true
      })

      return
    }

    // =========================================
    // CUSTOMER
    // =========================================

    const {
      data: customerData,
      error: customerError
    } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (!active) return

    if (customerError) {
      console.error(customerError)

      notify(
        `${t(
          'unableToLoadCustomer',
          'Unable to load customer'
        )}: ${customerError.message}`
      )

      setLoading(false)
      return
    }

    setCustomer(customerData)

    // =========================================
    // FINANCE ACCOUNTS + COLLECTION CATEGORY
    // =========================================

    const {
      data: financeData,
      error: financeError
    } = await supabase
      .from('finance_records')
      .select(`
        *,
        collection_categories (
          id,
          category_name
        )
      `)
      .eq('customer_id', id)
      .order('created_at', {
        ascending: false
      })

    if (!active) return

    if (financeError) {
      console.error(financeError)

      notify(
        `${t(
          'unableToLoadFinanceAccounts',
          'Unable to load finance accounts'
        )}: ${financeError.message}`
      )
    }

    setFinanceRecords(
      financeData || []
    )

    setLoading(false)
  }

  // =========================================
  // MONEY FORMAT
  // =========================================

  const formatMoney = (value) => formatMoneyValue(value)

  // =========================================
  // LOAN NAME
  // =========================================

  const getLoanName = (record) => {
    const type = String(
      record.finance_type || ''
    ).toLowerCase()

    if (type === 'daily') {
      return t(
        'dailyLoan',
        'Daily Loan'
      )
    }

    if (type === 'weekly') {
      return t(
        'weeklyLoan',
        'Weekly Loan'
      )
    }

    if (type === 'monthly') {
      return t(
        'monthlyLoan',
        'Monthly Loan'
      )
    }

    if (
      type === 'interest_only' ||
      type === 'interest-only'
    ) {
      return t(
        'interestOnlyLoan',
        'Interest-Only Loan'
      )
    }

    return (
      record.finance_type ||
      t('finance', 'Finance')
    )
  }

  // =========================================
  // COLLECTION CATEGORY TRANSLATION
  // =========================================

  const getCollectionCategoryName = (categoryName) => {
    if (!categoryName) {
      return t(
        'notAssigned',
        'Not Assigned'
      )
    }

    const normalizedName = String(categoryName)
      .trim()
      .toLowerCase()

    const categoryTranslations = {
      'monday collection': 'mondayCollection',
      'tuesday collection': 'tuesdayCollection',
      'wednesday collection': 'wednesdayCollection',
      'thursday collection': 'thursdayCollection',
      'friday collection': 'fridayCollection',
      'saturday collection': 'saturdayCollection',
      'sunday collection': 'sundayCollection'
    }

    const translationKey =
      categoryTranslations[normalizedName]

    // Keep custom Admin-created categories unchanged
    if (!translationKey) {
      return categoryName
    }

    return t(
      translationKey,
      categoryName
    )
  }

  // =========================================
  // MANAGE FINANCE
  // =========================================

  const manageFinance = (record) => {
    const type = String(
      record.finance_type || ''
    ).toLowerCase()

    // DAILY
    if (type === 'daily') {
      navigate(
        `/daily/${record.id}`
      )

      return
    }

    // WEEKLY
    if (type === 'weekly') {
      navigate(
        `/weekly/${record.id}`
      )

      return
    }

    // MONTHLY
    if (type === 'monthly') {
      navigate(
        `/monthly/${record.id}`
      )

      return
    }

    // INTEREST ONLY
    if (
      type === 'interest_only' ||
      type === 'interest-only'
    ) {
      navigate(
        `/interest-only/${record.id}`
      )

      return
    }

    notify(
      t(
        'financeTypeNotSupported',
        'Finance type is not supported yet'
      )
    )
  }

  // =========================================
  // TOTALS
  // =========================================

  const totalPrincipal =
    financeRecords.reduce(
      (total, record) =>
        total +
        Number(
          record.original_principal ||
          record.principal_amount ||
          0
        ),
      0
    )

  const totalPaid =
    financeRecords.reduce(
      (total, record) =>
        total +
        Number(
          record.paid || 0
        ),
      0
    )

  const totalPending =
    financeRecords.reduce(
      (total, record) =>
        total +
        Number(
          record.pending || 0
        ),
      0
    )

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full gap-space-md p-space-xl bg-surface min-h-screen">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '48px' }}>
          autorenew
        </span>
        <p className="font-body-lg text-on-surface-variant">
          {t(
            'loadingCustomerProfile',
            'Loading Customer Profile...'
          )}
        </p>
      </div>
    )
  }

  // =========================================
  // CUSTOMER NOT FOUND
  // =========================================

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center w-full gap-space-md p-space-xl bg-surface min-h-screen">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>
          person_off
        </span>
        <h2 className="font-headline-md text-on-surface">
          {t(
            'customerNotFound',
            'Customer not found'
          )}
        </h2>
        <button
          className="flex items-center gap-space-sm px-space-md py-space-sm bg-primary text-on-primary rounded-full font-label-lg"
          onClick={() =>
            navigate('/customers')
          }
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          {t(
            'backToCustomers',
            'Back to Customers'
          )}
        </button>
      </div>
    )
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="flex flex-col w-full gap-space-lg">

      {/* =====================================
          BREADCRUMB + BACK
      ====================================== */}

      <div className="flex items-center gap-space-sm px-gutter-desktop" style={{ paddingTop: '1.25rem' }}>
        <button
          className="flex items-center gap-space-xs text-on-surface-variant font-label-lg hover:text-primary transition-colors"
          onClick={() =>
            navigate('/customers')
          }
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          {t('customers', 'Customers')}
        </button>
        <span className="text-outline-variant font-label-lg">/</span>
        <span
          className="px-space-sm py-space-xs bg-primary text-on-primary rounded-full font-label-sm"
          style={{ letterSpacing: '0.04em' }}
        >
          {t('customerProfile', 'Counterparty Registry').toUpperCase()}
        </span>
      </div>

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="flex items-start justify-between px-gutter-desktop gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <h1 className="font-headline-xl text-on-surface">
            {customer.full_name}
          </h1>
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>badge</span>
            <span className="font-label-lg text-on-surface-variant">
              {customer.customer_id}
            </span>
            <span
              className={
                customer.status === 'inactive'
                  ? 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-full font-label-sm bg-error-container text-on-error-container'
                  : 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-full font-label-sm bg-surface-container-high text-primary'
              }
            >
              <span
                className="rounded-full"
                style={{
                  width: '6px',
                  height: '6px',
                  display: 'inline-block',
                  backgroundColor: customer.status === 'inactive' ? 'var(--color-error)' : 'var(--color-primary)'
                }}
              />
              {customer.status === 'inactive'
                ? t('inactive', 'Inactive').toUpperCase()
                : t('active', 'Active').toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* =====================================
          INFO CARDS ROW
      ====================================== */}

      <div className="flex flex-wrap gap-space-md px-gutter-desktop">

        {/* Phone Card */}
        <div className="flex items-center gap-space-md p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '200px' }}>
          <div className="flex items-center justify-center rounded-DEFAULT bg-surface-container-low" style={{ width: '44px', height: '44px', flexShrink: 0 }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>call</span>
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('phone', 'Phone')}
            </span>
            <span className="font-label-lg text-on-surface">
              {customer.phone || '—'}
            </span>
          </div>
        </div>

        {/* Address Card */}
        <div className="flex items-center gap-space-md p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '200px' }}>
          <div className="flex items-center justify-center rounded-DEFAULT bg-surface-container-low" style={{ width: '44px', height: '44px', flexShrink: 0 }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>location_on</span>
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('address', 'Address')}
            </span>
            <span className="font-label-lg text-on-surface">
              {customer.address || '—'}
            </span>
          </div>
        </div>

        {/* Status Card */}
        <div className="flex items-center gap-space-md p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '200px' }}>
          <div className="flex items-center justify-center rounded-DEFAULT bg-surface-container-low" style={{ width: '44px', height: '44px', flexShrink: 0 }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>verified_user</span>
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('status', 'Status')}
            </span>
            <span className="font-label-lg text-on-surface">
              {customer.status === 'inactive'
                ? t('inactive', 'Inactive')
                : t('active', 'Active')}
            </span>
          </div>
        </div>

        {/* Created Date Card */}
        <div className="flex items-center gap-space-md p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '200px' }}>
          <div className="flex items-center justify-center rounded-DEFAULT bg-surface-container-low" style={{ width: '44px', height: '44px', flexShrink: 0 }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>calendar_today</span>
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('customerSince', 'Customer Since')}
            </span>
            <span className="font-label-lg text-on-surface">
              {customer.created_at
                ? new Date(customer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}
            </span>
          </div>
        </div>

      </div>

      {/* =====================================
          PORTFOLIO SUMMARY STRIP
      ====================================== */}

      <div className="flex flex-wrap gap-space-md px-gutter-desktop">

        <div className="flex flex-col gap-space-xs p-space-md bg-primary rounded-DEFAULT flex-1" style={{ minWidth: '160px' }}>
          <span className="font-label-sm text-on-primary" style={{ opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('financeAccounts', 'Finance Accounts')}
          </span>
          <span className="font-data-metric text-on-primary">
            {financeRecords.length}
          </span>
        </div>

        <div className="flex flex-col gap-space-xs p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '160px' }}>
          <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('totalPrincipal', 'Total Principal')}
          </span>
          <span className="font-data-metric text-on-surface">
            ₹{formatMoney(totalPrincipal)}
          </span>
        </div>

        <div className="flex flex-col gap-space-xs p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '160px' }}>
          <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('totalPaid', 'Total Paid')}
          </span>
          <span className="font-data-metric text-on-surface">
            ₹{formatMoney(totalPaid)}
          </span>
        </div>

        <div className="flex flex-col gap-space-xs p-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow flex-1" style={{ minWidth: '160px' }}>
          <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('totalPending', 'Total Pending')}
          </span>
          <span className="font-data-metric" style={{ color: Number(totalPending) > 0 ? 'var(--color-error)' : 'var(--color-on-surface)' }}>
            ₹{formatMoney(totalPending)}
          </span>
        </div>

      </div>

      {/* =====================================
          LOAN PORTFOLIO SECTION
      ====================================== */}

      <div className="flex flex-col gap-space-md px-gutter-desktop pb-space-xl">

        {/* Section heading row */}
        <div className="flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>account_balance_wallet</span>
            <h2 className="font-headline-md text-on-surface">
              {t('loanPortfolio', 'Loan Portfolio')}
            </h2>
            {financeRecords.length > 0 && (
              <span className="px-space-sm py-space-xs bg-primary text-on-primary rounded-full font-label-sm">
                {financeRecords.length}
              </span>
            )}
          </div>

          <button
            className="flex items-center gap-space-xs px-space-md py-space-sm bg-primary text-on-primary rounded-full font-label-lg"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() =>
              navigate(
                `/customers/${id}/finance`,
                {
                  state: {
                    customer,
                    customerId: Number(id)
                  }
                }
              )
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            {t('addFinance', 'Add Finance')}
          </button>
        </div>

        <p className="font-body-md text-on-surface-variant" style={{ marginTop: '-0.5rem' }}>
          {t(
            'financeAccountsDescription',
            'All finance accounts belonging to this customer.'
          )}
        </p>

        {/* Empty state */}
        {financeRecords.length === 0 ? (

          <div className="flex flex-col items-center justify-center gap-space-md p-space-xl bg-surface-container-lowest rounded-DEFAULT stitch-shadow" style={{ minHeight: '180px' }}>
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>
              folder_open
            </span>
            <span className="font-body-md text-on-surface-variant">
              {t('noFinanceAccounts', 'No finance accounts created yet.')}
            </span>
          </div>

        ) : (

          <div
            className="finance-account-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem'
            }}
          >

            {financeRecords.map(
              (record) => {

                // =================================
                // LOAN STATUS
                // =================================

                const isClosed =
                  record.loan_status === 'closed' ||
                  Number(record.pending || 0) <= 0

                // =================================
                // COLLECTION CATEGORY
                // =================================

                const categoryName =
                  getCollectionCategoryName(
                    record.collection_categories?.category_name
                  )

                return (

                  <div
                    key={record.id}
                    className="flex flex-col gap-space-md bg-surface-container-lowest rounded-DEFAULT stitch-shadow"
                    style={{ border: '1px solid var(--color-outline-variant)', overflow: 'hidden' }}
                  >

                    {/* =============================
                        CARD HEADER
                    ============================== */}

                    <div className="flex items-start justify-between gap-space-sm p-space-lg" style={{ paddingBottom: 0 }}>
                      <div className="flex flex-col gap-space-xs">
                        <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {t('loanType', 'Loan Type')}
                        </span>
                        <span className="font-headline-sm text-on-surface">
                          {getLoanName(record)}
                        </span>
                      </div>

                      <span
                        className={
                          isClosed
                            ? 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-full font-label-sm bg-surface-container text-on-surface-variant'
                            : 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-full font-label-sm bg-surface-container-high text-primary'
                        }
                        style={{ whiteSpace: 'nowrap', marginTop: '2px' }}
                      >
                        <span
                          className="rounded-full"
                          style={{
                            width: '6px',
                            height: '6px',
                            display: 'inline-block',
                            backgroundColor: isClosed ? 'var(--color-outline)' : 'var(--color-primary)'
                          }}
                        />
                        {isClosed
                          ? t('closed', 'Closed')
                          : t('active', 'Active')}
                      </span>
                    </div>

                    {/* =============================
                        COLLECTION CATEGORY PILL
                    ============================== */}

                    <div className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-low rounded-full mx-space-md" style={{ width: 'fit-content', paddingLeft: '1rem', paddingRight: '1rem' }}>
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px' }}>group</span>
                      <span className="font-label-sm text-on-surface-variant" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('collectionCategory', 'Collection')}:&nbsp;
                      </span>
                      <span className="font-label-lg text-on-surface">
                        {categoryName}
                      </span>
                    </div>

                    {/* =============================
                        VALUES TABLE
                    ============================== */}

                    <div className="flex flex-col gap-space-xs bg-surface-container-low rounded-DEFAULT mx-space-md p-space-md">

                      <div className="flex items-center justify-between gap-space-sm">
                        <span className="font-body-md text-on-surface-variant">
                          {t('principal', 'Principal')}
                        </span>
                        <span className="font-label-lg text-on-surface">
                          ₹{formatMoney(record.original_principal || record.principal_amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-space-sm">
                        <span className="font-body-md text-on-surface-variant">
                          {t('interest', 'Interest')}
                        </span>
                        <span className="font-label-lg text-on-surface">
                          ₹{formatMoney(record.interest_accrual)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-space-sm" style={{ borderTop: '1px solid var(--color-outline-variant)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                        <span className="font-label-lg text-on-surface-variant">
                          {t('totalAmount', 'Total Amount')}
                        </span>
                        <span className="font-label-lg text-on-surface">
                          ₹{formatMoney(record.amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-space-sm">
                        <span className="font-body-md text-on-surface-variant">
                          {t('paid', 'Paid')}
                        </span>
                        <span className="font-label-lg text-primary">
                          ₹{formatMoney(record.paid)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-space-sm">
                        <span className="font-body-md text-on-surface-variant">
                          {t('pending', 'Pending')}
                        </span>
                        <span
                          className="font-label-lg"
                          style={{ color: Number(record.pending || 0) > 0 ? 'var(--color-error)' : 'var(--color-primary)' }}
                        >
                          ₹{formatMoney(record.pending)}
                        </span>
                      </div>

                    </div>

                    {/* =============================
                        MANAGE FINANCE BUTTON
                    ============================== */}

                    <div className="p-space-lg" style={{ paddingTop: 0 }}>
                      <button
                        className="flex items-center justify-center gap-space-xs w-full py-space-sm bg-primary text-on-primary rounded-DEFAULT font-label-lg"
                        onClick={() =>
                          manageFinance(record)
                        }
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>open_in_new</span>
                        {t('manageFinance', 'Manage Finance')}
                      </button>
                    </div>

                  </div>
                )
              }
            )}

          </div>

        )}

      </div>

    </div>
  )
}

export default CustomerProfile