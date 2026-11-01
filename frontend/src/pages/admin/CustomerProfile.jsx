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

  const loadCustomerProfile = async (active = true) => {
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

      alert(
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

      alert(
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

      alert(
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

  const formatMoney = (value) => {
    return Number(
      value || 0
    ).toLocaleString(
      'en-IN',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }

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

    alert(
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
      <div className="customer-profile-page">
        <p>
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
      <div className="customer-profile-page">
        <h2>
          {t(
            'customerNotFound',
            'Customer not found'
          )}
        </h2>

        <button
          onClick={() =>
            navigate('/customers')
          }
        >
          ← {t(
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
    <div className="customer-profile-page">

      {/* =====================================
          BACK
      ====================================== */}

      <button
        className="back-button"
        onClick={() =>
          navigate('/customers')
        }
      >
        ← {t(
          'customers',
          'Customers'
        )}
      </button>

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="customer-profile-header">

        <div>
          <p>
            {t(
              'customerProfile',
              'Customer Profile'
            ).toUpperCase()}
          </p>

          <h1>
            {customer.full_name}
          </h1>

          <span>
            {customer.customer_id}
          </span>
        </div>

        <span
          className={
            customer.status === 'inactive'
              ? 'loan-big-status closed'
              : 'loan-big-status active'
          }
        >
          {customer.status === 'inactive'
            ? t(
                'inactive',
                'Inactive'
              ).toUpperCase()
            : t(
                'active',
                'Active'
              ).toUpperCase()}
        </span>

      </div>

      {/* =====================================
          CUSTOMER INFORMATION
      ====================================== */}

      <div className="daily-manage-section">

        <h2>
          {t(
            'customerInformation',
            'Customer Information'
          )}
        </h2>

        <div className="daily-info-grid">

          <div>
            <span>
              {t(
                'customerName',
                'Customer Name'
              )}
            </span>

            <strong>
              {customer.full_name}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'customerId',
                'Customer ID'
              )}
            </span>

            <strong>
              {customer.customer_id}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'phone',
                'Phone'
              )}
            </span>

            <strong>
              {customer.phone || '-'}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'status',
                'Status'
              )}
            </span>

            <strong>
              {customer.status === 'inactive'
                ? t(
                    'inactive',
                    'Inactive'
                  )
                : t(
                    'active',
                    'Active'
                  )}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'address',
                'Address'
              )}
            </span>

            <strong>
              {customer.address || '-'}
            </strong>
          </div>

        </div>
      </div>

      {/* =====================================
          OVERALL SUMMARY
      ====================================== */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t(
              'financeAccounts',
              'Finance Accounts'
            )}
          </span>

          <strong>
            {financeRecords.length}
          </strong>
        </div>

        <div>
          <span>
            {t(
              'totalPrincipal',
              'Total Principal'
            )}
          </span>

          <strong>
            ₹{formatMoney(
              totalPrincipal
            )}
          </strong>
        </div>

        <div>
          <span>
            {t(
              'totalPaid',
              'Total Paid'
            )}
          </span>

          <strong>
            ₹{formatMoney(
              totalPaid
            )}
          </strong>
        </div>

        <div>
          <span>
            {t(
              'totalPending',
              'Total Pending'
            )}
          </span>

          <strong>
            ₹{formatMoney(
              totalPending
            )}
          </strong>
        </div>

      </div>

      {/* =====================================
          FINANCE ACCOUNTS
      ====================================== */}

      <div className="daily-manage-section">

        <div className="payment-history-heading">

          <div>
            <h2>
              {t(
                'financeAccounts',
                'Finance Accounts'
              )}
            </h2>

            <p>
              {t(
                'financeAccountsDescription',
                'All finance accounts belonging to this customer.'
              )}
            </p>
          </div>

          <button
            className="record-payment-button"
            onClick={() =>
              navigate(
                `/customers/${id}/finance`,
                {
                  state: {
                    customer,
                    customerId:
                      Number(id)
                  }
                }
              )
            }
          >
            + {t(
              'addFinance',
              'Add Finance'
            )}
          </button>

        </div>

        {financeRecords.length === 0 ? (

          <div className="no-payment-history">
            {t(
              'noFinanceAccounts',
              'No finance accounts created yet.'
            )}
          </div>

        ) : (

          <div
            className="finance-account-grid"
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
              marginTop: '20px'
            }}
          >

            {financeRecords.map(
              (record) => {

                // =================================
                // LOAN STATUS
                // =================================

                const isClosed =
                  record.loan_status ===
                    'closed' ||
                  Number(
                    record.pending || 0
                  ) <= 0

                // =================================
                // COLLECTION CATEGORY
                // =================================

                const categoryName =
                  getCollectionCategoryName(
                    record
                      .collection_categories
                      ?.category_name
                  )

                return (

                  <div
                    key={record.id}
                    className="finance-account-card"
                    style={{
                      border:
                        '1px solid #d7e0ec',
                      borderRadius:
                        '14px',
                      padding:
                        '20px',
                      background:
                        '#ffffff'
                    }}
                  >

                    {/* =============================
                        CARD HEADER
                    ============================== */}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'flex-start',
                        gap: '12px'
                      }}
                    >

                      <div>
                        <small>
                          {t(
                            'loanType',
                            'Loan Type'
                          ).toUpperCase()}
                        </small>

                        <h3
                          style={{
                            margin:
                              '4px 0 14px'
                          }}
                        >
                          {getLoanName(
                            record
                          )}
                        </h3>
                      </div>

                      <span
                        className={
                          isClosed
                            ? 'schedule-status schedule-paid'
                            : 'schedule-status schedule-pending'
                        }
                      >
                        {isClosed
                          ? t(
                              'closed',
                              'Closed'
                            )
                          : t(
                              'active',
                              'Active'
                            )}
                      </span>

                    </div>

                    {/* =============================
                        COLLECTION CATEGORY
                    ============================== */}

                    <div
                      style={{
                        background:
                          '#eef5ff',
                        padding:
                          '12px 14px',
                        borderRadius:
                          '10px',
                        marginBottom:
                          '14px'
                      }}
                    >

                      <small
                        style={{
                          display:
                            'block',
                          marginBottom:
                            '4px'
                        }}
                      >
                        {t(
                          'collectionCategory',
                          'Collection Category'
                        ).toUpperCase()}
                      </small>

                      <strong>
                        {categoryName}
                      </strong>

                    </div>

                    {/* =============================
                        VALUES
                    ============================== */}

                    <div
                      style={{
                        background:
                          '#f6f8fb',
                        padding:
                          '14px',
                        borderRadius:
                          '10px'
                      }}
                    >

                      <div
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between',
                          marginBottom:
                            '8px'
                        }}
                      >
                        <span>
                          {t(
                            'principal',
                            'Principal'
                          )}
                        </span>

                        <strong>
                          ₹{formatMoney(
                            record.original_principal ||
                            record.principal_amount
                          )}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between',
                          marginBottom:
                            '8px'
                        }}
                      >
                        <span>
                          {t(
                            'interest',
                            'Interest'
                          )}
                        </span>

                        <strong>
                          ₹{formatMoney(
                            record.interest_accrual
                          )}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between',
                          marginBottom:
                            '8px'
                        }}
                      >
                        <span>
                          {t(
                            'totalAmount',
                            'Total Amount'
                          )}
                        </span>

                        <strong>
                          ₹{formatMoney(
                            record.amount
                          )}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between',
                          marginBottom:
                            '8px'
                        }}
                      >
                        <span>
                          {t(
                            'paid',
                            'Paid'
                          )}
                        </span>

                        <strong>
                          ₹{formatMoney(
                            record.paid
                          )}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between'
                        }}
                      >
                        <span>
                          {t(
                            'pending',
                            'Pending'
                          )}
                        </span>

                        <strong>
                          ₹{formatMoney(
                            record.pending
                          )}
                        </strong>
                      </div>

                    </div>

                    {/* =============================
                        MANAGE FINANCE BUTTON
                    ============================== */}

                    <button
                      className="record-payment-button"
                      style={{
                        width: '100%',
                        marginTop: '15px'
                      }}
                      onClick={() =>
                        manageFinance(
                          record
                        )
                      }
                    >
                      {t(
                        'manageFinance',
                        'Manage Finance'
                      )}
                    </button>

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