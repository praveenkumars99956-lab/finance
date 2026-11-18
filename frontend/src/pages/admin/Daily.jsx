import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useEffect, useRef, useState } from 'react'
import {
  useLocation,
  useNavigate
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { generateCustomerId } from '../../utils/customerId'
import { rateFromInterestAmount } from '../../utils/interestRate'
import SelectMenu from '../../components/SelectMenu'
import CustomerAutocomplete, {
  getTrimmedCustomerName
} from '../../components/CustomerAutocomplete'

function Daily() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()

  // =========================================
  // CUSTOMER
  // =========================================

  const customer =
    location.state?.customer || null

  const [createdCustomer, setCreatedCustomer] =
    useState(null)

  const [
    existingCustomerRecords,
    setExistingCustomerRecords
  ] = useState([])

  const [
    selectedExistingCustomer,
    setSelectedExistingCustomer
  ] = useState(null)

  const [customerName, setCustomerName] =
    useState(
      (customer || createdCustomer)?.full_name || ''
    )

  const [customerNameError, setCustomerNameError] =
    useState(false)

  const activeCustomer =
    customer || createdCustomer || selectedExistingCustomer

  const activeCustomerDbId =
    location.state?.customerId ??
    activeCustomer?.id ??
    null

  const [newCustomerId, setNewCustomerId] =
    useState(generateCustomerId)

  const [newCustomerName, setNewCustomerName] =
    useState('')

  const [newCustomerPhone, setNewCustomerPhone] =
    useState('')

  const [newCustomerAddress, setNewCustomerAddress] =
    useState('')

  const existingCustomerNames =
    existingCustomerRecords
      .map((record) =>
        String(record.full_name || '').trim()
      )
      .filter(Boolean)

  // =========================================
  // CUSTOMER NAME — SEARCH OR CREATE
  // =========================================

  useEffect(() => {
    let active = true

    const loadCustomers = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, customer_id, full_name')
          .eq('status', 'active')
          .order('full_name')

        if (error) {
          console.error(
            'Unable to load customers:',
            error
          )
          return
        }

        if (active) {
          setExistingCustomerRecords(data || [])
        }
      } catch (error) {
        console.error(
          'Customer loading error:',
          error
        )
      }
    }

    loadCustomers()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const name = activeCustomer?.full_name

    if (name) {
      setCustomerName(name)
    }
  }, [activeCustomer?.full_name])

  const handleCustomerNameChange = (nextName) => {
    const name = String(nextName ?? '')

    setCustomerName(name)
    setNewCustomerName(name)
    setCustomerNameError(false)

    const match = existingCustomerRecords.find(
      (record) =>
        String(record.full_name || '')
          .trim()
          .toLocaleLowerCase() ===
        name.trim().toLocaleLowerCase()
    )

    setSelectedExistingCustomer(match || null)

    if (match) {
      setCreatedCustomer(null)
      setNewCustomerId(match.customer_id || '')
    } else if (!name) {
      setNewCustomerId(generateCustomerId())
    }
  }

  const handleCreateNewCustomer = (name) => {
    const trimmedName = getTrimmedCustomerName(name)

    setCustomerName(trimmedName)
    setNewCustomerName(trimmedName)
    setSelectedExistingCustomer(null)
    setCreatedCustomer(null)
  }

  // =========================================
  // LOAN DETAILS
  // =========================================

  const [principal, setPrincipal] =
    useState('')

  const [interestRate, setInterestRate] =
    useState('')

  const [
    interestAmount,
    setInterestAmount
  ] = useState('')

  const [
    totalAmount,
    setTotalAmount
  ] = useState('')

  // =========================================
  // DAILY REPAYMENT
  // =========================================

  const [startDate, setStartDate] =
    useState('')

  const [
    numberOfDays,
    setNumberOfDays
  ] = useState('')

  const [
    endingDate,
    setEndingDate
  ] = useState('')

  const [
    dailyAmount,
    setDailyAmount
  ] = useState('')

  // =========================================
  // COLLECTION CATEGORY
  // =========================================

  const [categories, setCategories] =
    useState([])

  const [
    collectionCategoryId,
    setCollectionCategoryId
  ] = useState('')

  const [
    categoryLoading,
    setCategoryLoading
  ] = useState(true)

  const [categoryError, setCategoryError] =
    useState(false)

  const categorySelectRef = useRef(null)

  // =========================================
  // SETTINGS
  // =========================================

  const [
    settingsLoading,
    setSettingsLoading
  ] = useState(true)

  const [saving, setSaving] =
    useState(false)

  // =========================================
  // LOAD DEFAULT INTEREST FROM SETTINGS
  // =========================================

  useEffect(() => {
    const loadFinanceSettings = async () => {
      try {
        setSettingsLoading(true)

        const {
          data,
          error
        } = await supabase
          .from('app_settings')
          .select(
            'default_interest_rate'
          )
          .order(
            'id',
            { ascending: true }
          )
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error(
            'Unable to load finance settings:',
            error
          )

          return
        }

        if (
          data?.default_interest_rate !==
            null &&
          data?.default_interest_rate !==
            undefined
        ) {
          setInterestRate(
            String(
              data.default_interest_rate
            )
          )
        }
      } catch (error) {
        console.error(
          'Finance settings error:',
          error
        )
      } finally {
        setSettingsLoading(false)
      }
    }

    loadFinanceSettings()
  }, [])

  // =========================================
  // LOAD COLLECTION CATEGORIES
  // =========================================

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoryLoading(true)

        const {
          data,
          error
        } = await supabase
          .from(
            'collection_categories'
          )
          .select(
            'id, category_name, status'
          )
          .eq(
            'status',
            'active'
          )
          .order(
            'category_name'
          )

        if (error) {
          console.error(
            'Collection category error:',
            error
          )

          notify(
            `${t(
              'unableToLoadCollectionCategories',
              'Unable to load Collection Categories'
            )}: ${error.message}`
          )

          return
        }

        setCategories(
          data || []
        )
      } catch (error) {
        console.error(
          'Category loading error:',
          error
        )
      } finally {
        setCategoryLoading(false)
      }
    }

    loadCategories()
  }, [t])

  // =========================================
  // CALCULATE LOAN
  // =========================================

  useEffect(() => {
    const p =
      Number(principal || 0)

    const rate =
      Number(interestRate || 0)

    const days =
      Number(numberOfDays || 0)

    const interest =
      (p * rate) / 100

    const total =
      p + interest

    setInterestAmount(
      interest > 0
        ? interest.toFixed(2)
        : ''
    )

    setTotalAmount(
      total > 0
        ? total.toFixed(2)
        : ''
    )

    if (
      total > 0 &&
      Number.isInteger(days) &&
      days > 0
    ) {
      setDailyAmount(
        (total / days).toFixed(2)
      )
    } else {
      setDailyAmount('')
    }
  }, [
    principal,
    interestRate,
    numberOfDays
  ])

  // =========================================
  // CALCULATE END DATE
  // =========================================

  useEffect(() => {
    if (
      !startDate ||
      !numberOfDays
    ) {
      setEndingDate('')
      return
    }

    const days =
      Number(numberOfDays)

    if (
      !Number.isInteger(days) ||
      days <= 0
    ) {
      setEndingDate('')
      return
    }

    const date =
      new Date(
        `${startDate}T00:00:00`
      )

    date.setDate(
      date.getDate() +
        days -
        1
    )

    const year =
      date.getFullYear()

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, '0')

    const day =
      String(
        date.getDate()
      ).padStart(2, '0')

    setEndingDate(
      `${year}-${month}-${day}`
    )
  }, [
    startDate,
    numberOfDays
  ])

  // =========================================
  // GENERATE FINANCE ID
  // =========================================

  const generateFinanceId = () => {
    const number =
      Date.now()
        .toString()
        .slice(-8)

    return `DL${number}`
  }

  // =========================================
  // SAVE DAILY LOAN
  // =========================================

  const saveDailyLoan =
    async (e) => {
      e.preventDefault()

      // =====================================
      // CUSTOMER VALIDATION
      // =====================================

      const trimmedCustomerName =
        getTrimmedCustomerName(customerName)

      if (!activeCustomer && !trimmedCustomerName) {
        setCustomerNameError(true)
        notify(
          t(
            'dailyCustomerNameRequired',
            'Enter the customer name to create a Daily Finance account.'
          )
        )
        return
      }

      if (!activeCustomer) {
        setCustomerName(trimmedCustomerName)
        setNewCustomerName(trimmedCustomerName)
      }

      if (activeCustomer && !activeCustomerDbId) {
        console.error(
          'Customer state:',
          location.state
        )

        console.error(
          'Customer object:',
          customer
        )

        notify(
          t(
            'customerDatabaseIdMissingFinance',
            'Customer database ID is missing. Please go back to the Customer Profile and open Add Finance again.'
          )
        )

        return
      }

      // =====================================
      // COLLECTION CATEGORY VALIDATION
      // =====================================

      if (
        !collectionCategoryId
      ) {
        setCategoryError(true)
        categorySelectRef.current?.focus()
        categorySelectRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })

        return
      }

      // =====================================
      // LOAN VALUES
      // =====================================

      const p =
        Number(principal)

      const rate =
        Number(interestRate)

      const interest =
        Number(interestAmount)

      const total =
        Number(totalAmount)

      const days =
        Number(numberOfDays)

      // =====================================
      // PRINCIPAL VALIDATION
      // =====================================

      if (
        !p ||
        p <= 0
      ) {
        notify(
          t(
            'enterValidPrincipal',
            'Enter a valid Principal Amount'
          )
        )

        return
      }

      // =====================================
      // INTEREST VALIDATION
      // =====================================

      if (
        Number.isNaN(rate) ||
        rate < 0
      ) {
        notify(
          t(
            'enterValidInterestRate',
            'Enter a valid Interest Rate'
          )
        )

        return
      }

      // =====================================
      // START DATE VALIDATION
      // =====================================

      if (!startDate) {
        notify(
          t(
            'selectStartDate',
            'Select Start Date'
          )
        )

        return
      }

      // =====================================
      // DAYS VALIDATION
      // =====================================

      if (
        !Number.isInteger(days) ||
        days <= 0
      ) {
        notify(
          t(
            'enterWholeNumberOfDays',
            'Enter a whole number of days'
          )
        )

        return
      }

      // =====================================
      // TOTAL VALIDATION
      // =====================================

      if (
        !total ||
        total <= 0
      ) {
        notify(
          t(
            'totalAmountInvalid',
            'Total amount is invalid'
          )
        )

        return
      }

      // =====================================
      // AUTH USER
      // =====================================

      const {
        data: {
          user
        },
        error: userError
      } =
        await supabase.auth.getUser()

      if (
        userError ||
        !user
      ) {
        notify(
          t(
            'loginSessionEnded',
            'Your login session has ended. Please login again.'
          )
        )

        navigate('/')
        return
      }

      try {
        setSaving(true)

        let financeCustomer = activeCustomer
        let financeCustomerDbId = activeCustomerDbId

        if (!financeCustomer) {
          let customerInsertResult = null

          for (let attempt = 0; attempt < 5; attempt += 1) {
            const candidateCustomerId =
              attempt === 0
                ? newCustomerId
                : generateCustomerId()

            const result = await supabase
              .from('customers')
              .insert({
                customer_id: candidateCustomerId,
                full_name: newCustomerName.trim(),
                phone: newCustomerPhone.trim(),
                address: newCustomerAddress.trim(),
                status: 'active',
                created_by: user.id,
                updated_at: new Date().toISOString()
              })
              .select('id, customer_id, full_name, phone, address, status')
              .single()

            if (!result.error) {
              customerInsertResult = result
              break
            }

            if (result.error.code !== '23505') {
              throw result.error
            }
          }

          if (!customerInsertResult?.data) {
            throw new Error(
              t(
                'customerIdGenerationFailed',
                'Unable to generate a unique customer ID. Please try again.'
              )
            )
          }

          financeCustomer = customerInsertResult.data
          financeCustomerDbId = customerInsertResult.data.id
          setCreatedCustomer(customerInsertResult.data)
          setNewCustomerId(customerInsertResult.data.customer_id)
        }

        const financeId =
          generateFinanceId()

        console.log(
          'Creating Daily Finance'
        )

        console.log(
          'Customer DB ID:',
          financeCustomerDbId
        )

        console.log(
          'Customer Display ID:',
          financeCustomer?.customer_id
        )

        // =====================================
        // CREATE FINANCE RECORD
        // =====================================

        const {
          data: financeRecord,
          error
        } = await supabase
          .from(
            'finance_records'
          )
          .insert([
            {
              user_id:
                user.id,

              customer_id:
                financeCustomerDbId,

              collection_category_id:
                Number(
                  collectionCategoryId
                ),

              name:
                financeCustomer.full_name,

              finance_type:
                'daily',

              period:
                `${days} Days`,

              payment_date:
                startDate,

              entry_date:
                startDate,

              ending_date:
                endingDate,

              amount:
                total,

              paid:
                0,

              pending:
                total,

              calculation_mode:
                'automatic',

              principal_amount:
                p,

              original_principal:
                p,

              principal_outstanding:
                p,

              interest_rate:
                rate,

              interest_accrual:
                interest,

              interest_due:
                interest,

              interest_paid:
                0,

              principal_paid:
                0,

              interest_method:
                'original_principal',

              loan_type:
                'normal',

              interest_type:
                'simple',

              interest_period:
                'loan_period',

              collection_cadence:
                'daily',

              last_interest_date:
                startDate,

              next_due_date:
                startDate,

              loan_status:
                'active',

              renewal_count:
                0
            }
          ])
          .select('id')
          .single()

        // =====================================
        // FINANCE INSERT ERROR
        // =====================================

        if (error) {
          console.error(
            'Daily finance insert error:',
            error
          )

          notify(
            `${t(
              'unableToSaveDailyLoan',
              'Unable to save Daily Loan'
            )}: ${error.message}${
              !activeCustomer
                ? `\n${t(
                    'dailyCustomerSavedForRetry',
                    'The customer was saved. You can try creating the loan again from this page.'
                  )}`
                : ''
            }`
          )

          return
        }

        if (
          !financeRecord?.id
        ) {
          notify(
            t(
              'dailyFinanceNotCreatedCorrectly',
              'Daily Finance was not created correctly.'
            )
          )

          return
        }

        console.log(
          'Daily finance created:',
          financeRecord.id
        )

        // =====================================
        // GENERATE DAILY REPAYMENT SCHEDULE
        // =====================================

        const {
          error: scheduleError
        } = await supabase.rpc(
          'generate_daily_schedule',
          {
            p_finance_record_id:
              financeRecord.id
          }
        )

        // =====================================
        // SCHEDULE ERROR
        // =====================================

        if (scheduleError) {
          console.error(
            'Daily schedule error:',
            scheduleError
          )

          notify(
            `${t(
              'dailyCreatedScheduleFailed',
              'Daily Finance was created, but repayment schedule could not be generated'
            )}: ${scheduleError.message}`
          )

          navigate(
            `/customers/${financeCustomerDbId}`
          )

          return
        }

        // =====================================
        // SUCCESS
        // =====================================

        notify(
          t(
            'dailyLoanSavedSuccessfully',
            'Daily Loan {{financeId}} saved successfully',
            {
              financeId
            }
          )
        )

        navigate(
          `/customers/${financeCustomerDbId}`
        )
      } catch (error) {
        console.error(
          'Save Daily Finance error:',
          error
        )

        notify(
          error?.message ||
            t(
              'unableToSaveDailyFinance',
              'Unable to save Daily Finance.'
            )
        )
      } finally {
        setSaving(false)
      }
    }

  // =========================================
  // FORMAT MONEY
  // =========================================

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

  // =========================================
  // SELECTED CATEGORY
  // =========================================

  const selectedCategory =
    categories.find(
      (category) =>
        String(category.id) ===
        String(
          collectionCategoryId
        )
    )

  // =========================================
  // UI
  // =========================================

  return (
    <div className="daily-loan-page">

      {/* BACK */}

      <button
        className="back-button"
        type="button"
        onClick={() =>
          navigate(-1)
        }
      >
        ← {t('back', 'Back')}
      </button>

      {/* HEADER */}

      <div className="daily-loan-header">

        <p>
          {t(
            'dailyFinance',
            'DAILY FINANCE'
          )}
        </p>

        <h1>
          {t(
            'createDailyLoan',
            'Create Daily Loan'
          )}
        </h1>

        {activeCustomer ? (
          <span>
            {t(
              'customer',
              'Customer'
            )}:{' '}

            <strong>
              {activeCustomer.full_name}
            </strong>

            {' • '}

            {activeCustomer.customer_id}
          </span>
        ) : (
          <span>
            {t(
              'newCustomerForDailyFinance',
              'Enter new customer details'
            )}
          </span>
        )}

      </div>

      {/* FORM */}

      <form
        className="daily-loan-form"
        onSubmit={saveDailyLoan}
      >

        {/* =================================
            CUSTOMER
        ================================= */}

        <div className="daily-form-section">

          <h2>
            {t(
              'customer',
              'Customer'
            )}
          </h2>

          <div className="daily-form-grid">

            {customer ? (
              <>
                <div>
                  <label>
                    {t(
                      'customerName',
                      'Customer Name'
                    )}
                  </label>

                  <input
                    value={activeCustomer.full_name || ''}
                    readOnly
                  />
                </div>

                <div>
                  <label>
                    {t(
                      'customerId',
                      'Customer ID'
                    )}
                  </label>

                  <input
                    value={activeCustomer.customer_id || ''}
                    readOnly
                  />
                </div>
              </>
            ) : (
              <>
                <div style={{ gridColumn: '1 / -1' }}>
                  <CustomerAutocomplete
                    id="daily-customer-name"
                    label={`${t(
                      'customerName',
                      'Customer Name'
                    )} *`}
                    value={customerName}
                    onChange={handleCustomerNameChange}
                    existingCustomers={existingCustomerNames}
                    onCreateNew={handleCreateNewCustomer}
                    placeholder={t(
                      'enterCustomerName',
                      'Enter Customer Name'
                    )}
                    required
                    error={
                      customerNameError
                        ? t(
                            'dailyCustomerNameRequired',
                            'Enter the customer name to create a Daily Finance account.'
                          )
                        : ''
                    }
                    disabled={saving}
                    createNewLabel={(name) =>
                      t(
                        'createNewCustomer',
                        'Create new customer "{{name}}"',
                        { name }
                      )
                    }
                    ariaLabel={t(
                      'customerName',
                      'Customer Name'
                    )}
                  />
                </div>

                <div>
                  <label>
                    {t(
                      'customerId',
                      'Customer ID'
                    )}
                  </label>

                  <input
                    value={newCustomerId}
                    readOnly
                  />
                </div>

                <div>
                  <label>
                    {t('phoneNumber', 'Phone Number')}
                  </label>

                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(event) =>
                      setNewCustomerPhone(event.target.value)
                    }
                    autoComplete="tel"
                  />
                </div>

                <div>
                  <label>
                    {t('address', 'Address')}
                  </label>

                  <textarea
                    rows="3"
                    value={newCustomerAddress}
                    onChange={(event) =>
                      setNewCustomerAddress(event.target.value)
                    }
                  />
                </div>
              </>
            )}

          </div>

        </div>

        {/* =================================
            COLLECTION CATEGORY
        ================================= */}

        <div className="daily-form-section">

          <h2>
            {t(
              'collectionCategory',
              'Collection Category'
            )}
          </h2>

          <div className="daily-form-grid">

            <div>
              <label>
                {t(
                  'collectionCategory',
                  'Collection Category'
                )} *
              </label>

              <SelectMenu
                ref={categorySelectRef}
                id="daily-collection-category"
                value={collectionCategoryId}
                onChange={(value) => {
                  setCollectionCategoryId(value)
                  setCategoryError(false)
                }}
                ariaLabel={t('collectionCategory', 'Collection Category')}
                ariaInvalid={categoryError}
                ariaDescribedBy={
                  categoryError
                    ? 'daily-collection-category-error'
                    : undefined
                }
                disabled={categoryLoading}
                placeholder={
                  categoryLoading
                    ? t('loadingCategories', 'Loading Categories...')
                    : t('selectCollectionCategory', 'Select Collection Category')
                }
                options={categories.map((category) => ({
                  value: String(category.id),
                  label: category.category_name
                }))}
              />

              {!categoryLoading && categories.length === 0 && (
                <small
                  id="daily-collection-category-error"
                  role="alert"
                  style={{
                    display: 'block',
                    marginTop: 6,
                    color: '#b42318'
                  }}
                >
                  {t(
                    'noActiveCollectionCategories',
                    'No active collection categories are available. Add a category before creating this loan.'
                  )}
                </small>
              )}

              {!categoryLoading && categories.length === 0 && (
                <button
                  type="button"
                  className="daily-category-action"
                  onClick={() =>
                    navigate('/categories', {
                      state: {
                        returnTo: '/daily',
                        returnState: location.state,
                        returnLabelKey: 'backToDailyFinance'
                      }
                    })
                  }
                >
                  {t(
                    'manageCollectionCategories',
                    'Manage Collection Categories'
                  )}
                </button>
              )}

              {categoryError && categories.length > 0 && (
                <small
                  id="daily-collection-category-error"
                  role="alert"
                  style={{
                    display: 'block',
                    marginTop: 6,
                    color: '#b42318'
                  }}
                >
                  {t(
                    'selectCollectionCategory',
                    'Select Collection Category'
                  )}
                </small>
              )}
            </div>

            <div>
              <label>
                {t(
                  'selectedCategory',
                  'Selected Category'
                )}
              </label>

              <input
                value={
                  selectedCategory
                    ?.category_name ||
                  ''
                }
                placeholder={t(
                  'noCategorySelected',
                  'No category selected'
                )}
                readOnly
              />
            </div>

          </div>

        </div>

        {/* =================================
            LOAN DETAILS
        ================================= */}

        <div className="daily-form-section">

          <h2>
            {t(
              'loanDetails',
              'Loan Details'
            )}
          </h2>

          <div className="daily-form-grid">

            <div>
              <label>
                {t(
                  'principalAmount',
                  'Principal Amount'
                )} ₹ *
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t(
                  'dailyPrincipalExample',
                  'Example: 20000'
                )}
                value={principal}
                onChange={(e) =>
                  setPrincipal(
                    e.target.value
                  )
                }
                required
              />
            </div>

            <div>
              <label>
                {t(
                  'rateOfInterest',
                  'Interest Rate'
                )} % *
              </label>

              <input
                type="number"
                min="0"
                step="any"
                placeholder={
                  settingsLoading
                    ? t(
                        'loadingDefaultRate',
                        'Loading default rate...'
                      )
                    : t(
                        'enterInterestRate',
                        'Enter interest rate'
                      )
                }
                value={
                  interestRate
                }
                onChange={(e) =>
                  setInterestRate(
                    e.target.value
                  )
                }
                required
              />

              <small>
                {t(
                  'dailyInterestRateHelp',
                  'Default rate from Settings. You can change it for this loan.'
                )}
              </small>
            </div>

            <div>
              <label>
                {t(
                  'interestAmount',
                  'Interest Amount'
                )} ₹
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  interestAmount
                }
                onChange={(e) => {
                  const value = e.target.value
                  setInterestAmount(value)
                  setInterestRate(
                    rateFromInterestAmount(
                      value,
                      principal
                    )
                  )
                }}
              />

              <small>
                {t(
                  'interestAmountRateHint',
                  'Enter the interest amount to calculate the rate automatically.'
                )}
              </small>
            </div>

            <div>
              <label>
                {t(
                  'totalRepayment',
                  'Total Repayment'
                )} ₹
              </label>

              <input
                type="number"
                value={
                  totalAmount
                }
                readOnly
              />
            </div>

          </div>

        </div>

        {/* =================================
            DAILY REPAYMENT
        ================================= */}

        <div className="daily-form-section">

          <h2>
            {t(
              'dailyRepayment',
              'Daily Repayment'
            )}
          </h2>

          <div className="daily-form-grid">

            <div>
              <label>
                {t(
                  'startDate',
                  'Start Date'
                )} *
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) =>
                  setStartDate(
                    e.target.value
                  )
                }
                required
              />
            </div>

            <div>
              <label>
                {t(
                  'numberOfDays',
                  'Number of Days'
                )} *
              </label>

              <input
                type="number"
                min="1"
                step="1"
                placeholder={t(
                  'daysExample',
                  'Example: 100'
                )}
                value={
                  numberOfDays
                }
                onChange={(e) =>
                  setNumberOfDays(
                    e.target.value
                  )
                }
                required
              />
            </div>

            <div>
              <label>
                {t(
                  'endingDate',
                  'Ending Date'
                )}
              </label>

              <input
                type="date"
                value={
                  endingDate
                }
                readOnly
              />
            </div>

            <div>
              <label>
                {t(
                  'dailyCollection',
                  'Daily Collection'
                )} ₹
              </label>

              <input
                type="number"
                value={
                  dailyAmount
                }
                readOnly
              />
            </div>

          </div>

        </div>

        {/* =================================
            SUMMARY
        ================================= */}

        <div className="daily-loan-summary">

          <h2>
            {t(
              'loanSummary',
              'Loan Summary'
            )}
          </h2>

          <div className="daily-summary-grid">

            <div>
              <span>
                {t(
                  'principal',
                  'Principal'
                )}
              </span>

              <strong>
                ₹{formatMoney(
                  principal
                )}
              </strong>
            </div>

            <div>
              <span>
                {t(
                  'interest',
                  'Interest'
                )}
              </span>

              <strong>
                ₹{formatMoney(
                  interestAmount
                )}
              </strong>
            </div>

            <div>
              <span>
                {t(
                  'totalRepayment',
                  'Total Repayment'
                )}
              </span>

              <strong>
                ₹{formatMoney(
                  totalAmount
                )}
              </strong>
            </div>

            <div>
              <span>
                {t(
                  'dailyCollection',
                  'Daily Collection'
                )}
              </span>

              <strong>
                ₹{formatMoney(
                  dailyAmount
                )}
              </strong>
            </div>

            <div>
              <span>
                {t(
                  'collectionCategory',
                  'Collection Category'
                )}
              </span>

              <strong>
                {
                  selectedCategory
                    ?.category_name ||
                  t(
                    'notSelected',
                    'Not Selected'
                  )
                }
              </strong>
            </div>

          </div>

        </div>

        {/* =================================
            SAVE
        ================================= */}

        <div className="daily-save-area">

          <button
            type="submit"
            className="daily-save-button"
            disabled={saving}
          >
            {
              saving
                ? t(
                    'saving',
                    'Saving...'
                  )
                : t(
                    'saveDailyFinance',
                    'Save Daily Finance'
                  )
            }
          </button>

        </div>

      </form>

    </div>
  )
}

export default Daily