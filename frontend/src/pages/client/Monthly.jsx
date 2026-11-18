import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { ensureMonthlyLoanCategory } from '../../services/collectionCategories'
import SelectMenu from '../../components/SelectMenu'
import { generateCustomerId } from '../../utils/customerId'
import { rateFromInterestAmount } from '../../utils/interestRate'
import CustomerAutocomplete, {
  getTrimmedCustomerName
} from '../../components/CustomerAutocomplete'

// =========================================
// MONTHS
// Keep English values for database/internal
// use and translate only what is displayed.
// =========================================

const MONTHS = [
  { value: 'January', key: 'january' },
  { value: 'February', key: 'february' },
  { value: 'March', key: 'march' },
  { value: 'April', key: 'april' },
  { value: 'May', key: 'may' },
  { value: 'June', key: 'june' },
  { value: 'July', key: 'july' },
  { value: 'August', key: 'august' },
  { value: 'September', key: 'september' },
  { value: 'October', key: 'october' },
  { value: 'November', key: 'november' },
  { value: 'December', key: 'december' }
]

function Monthly() {
  const { t, i18n } = useTranslation()

  const navigate = useNavigate()
  const location = useLocation()

  const providedCustomer = location.state?.customer || null

  const providedCustomerId =
    location.state?.customerId ||
    providedCustomer?.id ||
    null

  const [customer, setCustomer] = useState(providedCustomer)
  const [customerOptions, setCustomerOptions] = useState([])
  const [customerLoading, setCustomerLoading] = useState(!providedCustomerId)
  const [customerError, setCustomerError] = useState(false)

  const [customerName, setCustomerName] =
    useState(
      providedCustomer?.full_name || ''
    )

  const existingCustomerNames =
    customerOptions
      .map((option) =>
        String(option.full_name || '').trim()
      )
      .filter(Boolean)

  const customerId = providedCustomerId || customer?.id || null

  // =========================================
  // FORM
  // =========================================

  const [principal, setPrincipal] =
    useState('')

  const [interestRate, setInterestRate] =
    useState('')

  const [alreadyPaid, setAlreadyPaid] =
    useState('0')

  const [numberOfMonths, setNumberOfMonths] =
    useState('')

  const [startDate, setStartDate] =
    useState('')

  const [collectionMonth, setCollectionMonth] =
    useState('')

  const [categories, setCategories] =
    useState([])

  const [collectionCategoryId, setCollectionCategoryId] =
    useState('')

  const selectedCategory = categories.find(
    (category) =>
      String(category.id) === String(collectionCategoryId)
  )

  const [categoryLoading, setCategoryLoading] =
    useState(true)

  const [categoryError, setCategoryError] =
    useState(false)

  const categorySelectRef = useRef(null)

  // =========================================
  // CALCULATED VALUES
  // =========================================

  const [interestAmount, setInterestAmount] =
    useState(0)

  const [totalRepayment, setTotalRepayment] =
    useState(0)

  const [remainingAmount, setRemainingAmount] =
    useState(0)

  const [monthlyAmount, setMonthlyAmount] =
    useState(0)

  const [endingDate, setEndingDate] =
    useState('')

  // =========================================
  // STATUS
  // =========================================

  const [settingsLoading, setSettingsLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  // =========================================
  // LOAD DEFAULT INTEREST RATE
  // =========================================

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setSettingsLoading(true)

        const { data, error } = await supabase
          .from('app_settings')
          .select('default_interest_rate')
          .order('id', {
            ascending: true
          })
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error(
            'Unable to load settings:',
            error
          )

          return
        }

        if (
          data?.default_interest_rate !== null &&
          data?.default_interest_rate !== undefined
        ) {
          setInterestRate(
            String(
              data.default_interest_rate
            )
          )
        }
      } catch (error) {
        console.error(
          'Settings error:',
          error
        )
      } finally {
        setSettingsLoading(false)
      }
    }

    loadSettings()
  }, [])

  // =========================================
  // LOAD COLLECTION CATEGORIES
  // =========================================

  useEffect(() => {
    const loadCategories = async () => {
      setCategoryLoading(true)

      try {
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (!user) {
          throw new Error(t('pleaseLoginAgain', 'Please login again'))
        }

        const {
          categories: activeCategories,
          monthlyCategory
        } = await ensureMonthlyLoanCategory(user.id)

        setCategories(activeCategories)
        setCollectionCategoryId(String(monthlyCategory.id))
        setCategoryError(false)
      } catch (error) {
        console.error('Collection category loading error:', error)
        notify(
          `${t(
            'unableToLoadCollectionCategories',
            'Unable to load Collection Categories'
          )}: ${error?.message || String(error)}`
        )
      } finally {
        setCategoryLoading(false)
      }
    }

    loadCategories()
  }, [t])

  // =========================================
  // LOAD CUSTOMERS (when opened without one)
  // =========================================

  useEffect(() => {
    if (providedCustomerId) {
      return undefined
    }

    let active = true

    const loadCustomers = async () => {
      try {
        setCustomerLoading(true)

        const { data, error } = await supabase
          .from('customers')
          .select('id, customer_id, full_name, phone, status')
          .order('full_name')

        if (error) {
          console.error('Unable to load customers:', error)
          notify(
            `${t('unableToLoadCustomers', 'Unable to load customers')}: ${error.message}`
          )
          return
        }

        // Older customer rows may have a null/missing status, so do not
        // filter with .eq('status', 'active') in the query. Only skip
        // customers that are explicitly marked inactive.
        const selectableCustomers = (data || []).filter((option) => {
          const status = String(option.status ?? 'active')
            .trim()
            .toLowerCase()

          return status !== 'inactive'
        })

        if (active) {
          setCustomerOptions(selectableCustomers)
        }
      } catch (error) {
        console.error('Customer loading error:', error)
      } finally {
        if (active) {
          setCustomerLoading(false)
        }
      }
    }

    loadCustomers()

    return () => {
      active = false
    }
  }, [providedCustomerId, t])

  // =========================================
  // CUSTOMER SELECTION
  // =========================================

  const handleCustomerNameChange = (value) => {
    const typedName = String(value ?? '')
    const normalized = typedName.trim().toLocaleLowerCase()

    const selectedCustomer =
      customerOptions.find(
        (option) =>
          String(option.full_name || '')
            .trim()
            .toLocaleLowerCase() ===
          normalized
      ) || null

    setCustomerName(typedName)
    setCustomer(selectedCustomer)
    setCustomerError(false)
  }

  const handleCreateNewCustomer = (value) => {
    const trimmedName = getTrimmedCustomerName(value)

    setCustomerName(trimmedName)
    setCustomer(null)
    setCustomerError(false)
  }

  // =========================================
  // AUTO SELECT COLLECTION MONTH
  // =========================================

  useEffect(() => {
    if (!startDate) {
      return
    }

    const parts =
      startDate
        .split('-')
        .map(Number)

    const monthNumber =
      parts[1]

    if (
      monthNumber >= 1 &&
      monthNumber <= 12
    ) {
      setCollectionMonth(
        MONTHS[
          monthNumber - 1
        ].value
      )
    }
  }, [startDate])

  // =========================================
  // CALCULATIONS
  // =========================================

  useEffect(() => {
    const p =
      Number(principal || 0)

    const rate =
      Number(interestRate || 0)

    const paid =
      Number(alreadyPaid || 0)

    const months =
      Number(numberOfMonths || 0)

    // =========================================
    // INTEREST
    //
    // Principal × Monthly Rate × Months / 100
    // =========================================

    const interest =
      months > 0
        ? Number(
            (
              (p * rate * months) /
              100
            ).toFixed(2)
          )
        : 0

    // =========================================
    // TOTAL REPAYMENT
    // =========================================

    const total =
      Number(
        (
          p + interest
        ).toFixed(2)
      )

    // =========================================
    // REMAINING
    // =========================================

    const remaining =
      Math.max(
        0,
        Number(
          (
            total - paid
          ).toFixed(2)
        )
      )

    // =========================================
    // MONTHLY PAYMENT
    // =========================================

    const monthly =
      months > 0
        ? Number(
            (
              remaining /
              months
            ).toFixed(2)
          )
        : 0

    setInterestAmount(
      interest
    )

    setTotalRepayment(
      total
    )

    setRemainingAmount(
      remaining
    )

    setMonthlyAmount(
      monthly
    )

    // =========================================
    // ENDING DATE
    // =========================================

    if (
      startDate &&
      Number.isInteger(months) &&
      months > 0
    ) {
      const [
        year,
        month,
        day
      ] =
        startDate
          .split('-')
          .map(Number)

      const targetMonthIndex =
        (month - 1) +
        (months - 1)

      const targetYear =
        year +
        Math.floor(
          targetMonthIndex /
          12
        )

      const targetMonth =
        (
          (
            targetMonthIndex %
            12
          ) +
          12
        ) % 12

      const lastDay =
        new Date(
          targetYear,
          targetMonth + 1,
          0
        ).getDate()

      const safeDay =
        Math.min(
          day,
          lastDay
        )

      const finalMonth =
        String(
          targetMonth + 1
        ).padStart(
          2,
          '0'
        )

      const finalDay =
        String(
          safeDay
        ).padStart(
          2,
          '0'
        )

      setEndingDate(
        `${targetYear}-${finalMonth}-${finalDay}`
      )
    } else {
      setEndingDate('')
    }
  }, [
    principal,
    interestRate,
    alreadyPaid,
    numberOfMonths,
    startDate
  ])

  // =========================================
  // FORMAT MONEY
  // =========================================

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

  // =========================================
  // TRANSLATED MONTH NAME
  // =========================================

  const getTranslatedMonth = (
    monthValue
  ) => {
    if (!monthValue) {
      return ''
    }

    const month =
      MONTHS.find(
        (item) =>
          item.value === monthValue
      )

    if (!month) {
      return monthValue
    }

    return t(
      month.key,
      month.value
    )
  }

  // =========================================
  // SAVE MONTHLY FINANCE
  // =========================================

  const saveMonthlyFinance =
    async (e) => {
      e.preventDefault()

      const p =
        Number(principal)

      const rate =
        Number(interestRate)

      const paid =
        Number(
          alreadyPaid || 0
        )

      const months =
        Number(
          numberOfMonths
        )

      // =========================================
      // VALIDATION
      // =========================================

      const trimmedCustomerName =
        getTrimmedCustomerName(
          customerName
        )

      if (
        !customer &&
        !trimmedCustomerName
      ) {
        setCustomerError(true)
        notify(
          t(
            'selectCustomerRequired',
            'Please select a customer before creating this loan.'
          )
        )

        return
      }

      if (!collectionCategoryId) {
        setCategoryError(true)
        categorySelectRef.current?.focus()
        categorySelectRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
        return
      }

      if (!collectionMonth) {
        notify(
          t(
            'selectCollectionMonth',
            'Select Collection Month'
          )
        )

        return
      }

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

      if (
        !Number.isFinite(rate) ||
        rate < 0
      ) {
        notify(
          t(
            'enterValidInterestRate',
            'Enter a valid Rate of Interest'
          )
        )

        return
      }

      if (
        !Number.isFinite(paid) ||
        paid < 0
      ) {
        notify(
          t(
            'alreadyPaidNegative',
            'Already Paid cannot be negative'
          )
        )

        return
      }

      if (
        !Number.isInteger(months) ||
        months <= 0
      ) {
        notify(
          t(
            'enterValidNumberOfMonths',
            'Enter a valid Number of Months'
          )
        )

        return
      }

      if (
        paid >=
        totalRepayment
      ) {
        notify(
          t(
            'alreadyPaidLessThanTotal',
            'Already Paid must be less than Total Repayment'
          )
        )

        return
      }

      if (!startDate) {
        notify(
          t(
            'selectStartDate',
            'Select Start Date'
          )
        )

        return
      }

      // =========================================
      // USER
      // =========================================

      const {
        data: {
          user
        },
        error: userError
      } =
        await supabase
          .auth
          .getUser()

      if (
        userError ||
        !user
      ) {
        notify(
          t(
            'pleaseLoginAgain',
            'Please login again'
          )
        )

        navigate('/')

        return
      }

      setSaving(true)

      try {
        // =====================================
        // RESOLVE CUSTOMER (SELECT EXISTING OR CREATE NEW)
        // =====================================

        let financeCustomer = customer
        let financeCustomerId = customerId

        if (!financeCustomer) {
          const existingCustomer =
            customerOptions.find(
              (option) =>
                String(option.full_name || '')
                  .trim()
                  .toLocaleLowerCase() ===
                trimmedCustomerName.toLocaleLowerCase()
            )

          if (existingCustomer) {
            financeCustomer = existingCustomer
            financeCustomerId = existingCustomer.id
          } else {
            let insertResult = null

            for (
              let attempt = 0;
              attempt < 5;
              attempt += 1
            ) {
              const result = await supabase
                .from('customers')
                .insert({
                  customer_id:
                    generateCustomerId(),
                  full_name:
                    trimmedCustomerName,
                  phone: '',
                  address: '',
                  status: 'active',
                  created_by: user.id,
                  updated_at:
                    new Date().toISOString()
                })
                .select(
                  'id, customer_id, full_name'
                )
                .single()

              if (!result.error) {
                insertResult = result
                break
              }

              if (
                result.error.code !== '23505'
              ) {
                throw result.error
              }
            }

            if (!insertResult?.data) {
              throw new Error(
                t(
                  'customerIdGenerationFailed',
                  'Unable to generate a unique customer ID. Please try again.'
                )
              )
            }

            financeCustomer = insertResult.data
            financeCustomerId = insertResult.data.id

            setCustomer(financeCustomer)
            setCustomerOptions((current) => [
              ...current,
              financeCustomer
            ])
          }
        }

        // =====================================
        // INSERT FINANCE RECORD
        // =====================================

        const {
          data:
            financeRecord,
          error:
            financeError
        } =
          await supabase
            .from(
              'finance_records'
            )
            .insert({
              user_id:
                user.id,

              customer_id:
                Number(
                  financeCustomerId
                ),

              collection_category_id:
                Number(collectionCategoryId),

              name:
                financeCustomer
                  ?.full_name ||
                trimmedCustomerName ||
                'Customer',

              finance_type:
                'monthly',

              // =================================
              // IMPORTANT
              // =================================
              //
              // generate_monthly_schedule()
              // expects number of months here.
              //
              // Keep this internal/database
              // value in English.
              // =================================

              period:
                `${months} Months`,

              payment_date:
                startDate,

              entry_date:
                startDate,

              ending_date:
                endingDate,

              // =================================
              // PRINCIPAL / TOTAL
              // =================================

              amount:
                totalRepayment,

              principal_amount:
                p,

              original_principal:
                p,

              // =================================
              // INTEREST
              // =================================

              interest_rate:
                rate,

              interest_accrual:
                interestAmount,

              interest_due:
                interestAmount,

              interest_paid:
                0,

              // =================================
              // PAYMENT
              // =================================

              paid:
                paid,

              principal_paid:
                Math.min(
                  paid,
                  p
                ),

              // =================================
              // BALANCE
              // =================================

              pending:
                remainingAmount,

              principal_outstanding:
                Math.max(
                  0,
                  p - paid
                ),

              // =================================
              // SETTINGS
              // =================================

              calculation_mode:
                'automatic',

              interest_method:
                'simple',

              loan_type:
                'normal',

              interest_type:
                'monthly',

              interest_period:
                'monthly',

              collection_cadence:
                'monthly',

              last_interest_date:
                startDate,

              next_due_date:
                startDate,

              loan_status:
                'active',

              renewal_count:
                0
            })
            .select()
            .single()

        if (financeError) {
          console.error(
            'Monthly finance insert error:',
            financeError
          )

          notify(
            `${t(
              'unableToSaveMonthlyFinance',
              'Unable to save Monthly Finance'
            )}: ${financeError.message}`
          )

          return
        }

        // =====================================
        // GENERATE MONTHLY SCHEDULE
        // =====================================

        const {
          error:
            scheduleError
        } =
          await supabase
            .rpc(
              'generate_monthly_schedule',
              {
                p_finance_record_id:
                  financeRecord.id
              }
            )

        if (
          scheduleError
        ) {
          console.error(
            'Monthly schedule error:',
            scheduleError
          )

          notify(
            `${t(
              'monthlyCreatedScheduleFailed',
              'Monthly Finance was created, but schedule generation failed'
            )}: ${scheduleError.message}`
          )

          return
        }

        // =====================================
        // SUCCESS
        // =====================================

        notify(
          t(
            'monthlyFinanceCreatedSuccessfully',
            'Monthly Finance created successfully'
          )
        )

        navigate(
          `/customers/${financeCustomerId}`
        )
      } catch (error) {
        console.error(
          'Monthly Finance error:',
          error
        )

        notify(
          error?.message ||
          t(
            'unableToCreateMonthlyFinance',
            'Unable to create Monthly Finance'
          )
        )
      } finally {
        setSaving(false)
      }
    }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="daily-page monthly-page">

      {/* =====================================
          BACK
      ====================================== */}

      <button
        type="button"
        className="back-button"
        onClick={() => {
          if (customerId) {
            navigate(
              `/customers/${customerId}/finance`,
              {
                state: {
                  customer,

                  customerId:
                    Number(
                      customerId
                    )
                }
              }
            )
          } else {
            navigate(
              '/customers'
            )
          }
        }}
      >
        ← {t(
          'back',
          'Back'
        )}
      </button>

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="daily-header">

        <p>
          {t(
            'finance',
            'FINANCE'
          )}
        </p>

        <h1>
          {t(
            'monthlyLoan',
            'Monthly Loan'
          )}
        </h1>

        <span>
          {t(
            'monthlyLoanDescription',
            'Create a monthly repayment finance'
          )}
        </span>

      </div>

      {/* =====================================
          CUSTOMER
      ====================================== */}

      <div className="daily-form-section">

        <h2>
          {t(
            'customer',
            'Customer'
          )}
        </h2>

        {!providedCustomerId && (
          <div
            className="daily-form-grid"
            style={{ marginBottom: '18px' }}
          >
            <div style={{ gridColumn: '1 / -1' }}>
              <CustomerAutocomplete
                id="monthly-customer"
                label={`${t('customer', 'Customer')} *`}
                value={customerName}
                onChange={handleCustomerNameChange}
                existingCustomers={existingCustomerNames}
                onCreateNew={handleCreateNewCustomer}
                disabled={customerLoading}
                ariaLabel={t('customer', 'Customer')}
                required
                error={
                  customerError
                    ? t(
                        'selectCustomerRequired',
                        'Please select a customer before creating this loan.'
                      )
                    : ''
                }
                placeholder={
                  customerLoading
                    ? t('loadingCustomers', 'Loading customers...')
                    : t('selectCustomer', 'Select Customer')
                }
                createNewLabel={(name) =>
                  t(
                    'createNewCustomer',
                    'Create new customer "{{name}}"',
                    { name }
                  )
                }
              />
            </div>
          </div>
        )}

        <div className="daily-info-grid">

          <div>

            <span>
              {t(
                'customerName',
                'Customer Name'
              )}
            </span>

            <strong>
              {
                customerName ||
                t(
                  'notSelected',
                  'Not selected'
                )
              }
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
              {
                customer
                  ?.customer_id ||
                '-'
              }
            </strong>

          </div>

        </div>

      </div>

      {/* =====================================
          FORM
      ====================================== */}

      <form
        onSubmit={
          saveMonthlyFinance
        }
      >

        {/* =================================
            COLLECTION CATEGORY
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'collectionCategory',
              'Collection Category'
            )}
          </h2>

          <div className="daily-form-grid">

            <div>
              <label htmlFor="monthly-collection-category">
                {t(
                  'collectionCategory',
                  'Collection Category'
                )} *
              </label>

              <SelectMenu
                ref={categorySelectRef}
                id="monthly-collection-category"
                value={collectionCategoryId}
                onChange={(value) => {
                  setCollectionCategoryId(value)
                  setCategoryError(false)
                }}
                disabled={categoryLoading}
                ariaLabel={t('collectionCategory', 'Collection Category')}
                ariaInvalid={categoryError}
                ariaDescribedBy={
                  categoryError
                    ? 'monthly-collection-category-error'
                    : undefined
                }
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
                  id="monthly-collection-category-error"
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
                        returnTo: '/monthly',
                        returnState: location.state,
                        returnLabelKey: 'backToMonthlyFinance'
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
                  id="monthly-collection-category-error"
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
                value={selectedCategory?.category_name || ''}
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
            COLLECTION MONTH
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'collectionMonth',
              'Collection Month'
            )}
          </h2>

          <div className="daily-form-grid">

            <div>

              <label>
                {t(
                  'collectionMonth',
                  'Collection Month'
                )} *
              </label>

              <SelectMenu
                value={collectionMonth}
                onChange={setCollectionMonth}
                ariaLabel={t('collectionMonth', 'Collection Month')}
                placeholder={t(
                  'selectCollectionMonth',
                  'Select Collection Month'
                )}
                options={MONTHS.map((month) => ({
                  value: month.value,
                  label: t(month.key, month.value)
                }))}
              />

            </div>

            <div>

              <label>
                {t(
                  'selectedMonth',
                  'Selected Month'
                )}
              </label>

              <input
                type="text"
                value={
                  getTranslatedMonth(
                    collectionMonth
                  )
                }
                placeholder={
                  t(
                    'noMonthSelected',
                    'No month selected'
                  )
                }
                readOnly
              />

            </div>

          </div>

        </div>

        {/* =================================
            MONTHLY FINANCE DETAILS
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'monthlyFinanceDetails',
              'Monthly Finance Details'
            )}
          </h2>

          <div className="daily-form-grid">

            {/* PRINCIPAL */}

            <div>

              <label>
                {t(
                  'principalAmount',
                  'Principal Amount'
                )} ₹ *
              </label>

              <input
                type="number"
                min="1"
                step="0.01"
                value={
                  principal
                }
                onChange={(e) =>
                  setPrincipal(
                    e.target.value
                  )
                }
                placeholder={
                  t(
                    'principalExample',
                    'Example: 50000'
                  )
                }
                required
              />

            </div>

            {/* RATE */}

            <div>

              <label>
                {t(
                  'rateOfInterest',
                  'Rate of Interest'
                )} % *
              </label>

              <input
                type="number"
                min="0"
                step="any"
                value={
                  interestRate
                }
                onChange={(e) =>
                  setInterestRate(
                    e.target.value
                  )
                }
                placeholder={
                  settingsLoading
                    ? t(
                        'loadingDefaultRate',
                        'Loading default rate...'
                      )
                    : t(
                        'enterMonthlyInterestRate',
                        'Enter monthly interest rate'
                      )
                }
                required
              />

              <small>
                {t(
                  'monthlyInterestHelp',
                  'Monthly interest rate. Default rate is loaded from Settings.'
                )}
              </small>

            </div>

            {/* INTEREST AMOUNT */}

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
                      principal,
                      numberOfMonths
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

            {/* ALREADY PAID */}

            <div>

              <label>
                {t(
                  'alreadyPaid',
                  'Already Paid'
                )} ₹ *
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  alreadyPaid
                }
                onChange={(e) =>
                  setAlreadyPaid(
                    e.target.value
                  )
                }
                placeholder={
                  t(
                    'alreadyPaidExample',
                    'Example: 5000'
                  )
                }
                required
              />

            </div>

            {/* NUMBER OF MONTHS */}

            <div>

              <label>
                {t(
                  'numberOfMonths',
                  'Number of Months'
                )} *
              </label>

              <input
                type="number"
                min="1"
                step="1"
                value={
                  numberOfMonths
                }
                onChange={(e) =>
                  setNumberOfMonths(
                    e.target.value
                  )
                }
                placeholder={
                  t(
                    'monthsExample',
                    'Example: 12'
                  )
                }
                required
              />

            </div>

            {/* START DATE */}

            <div>

              <label>
                {t(
                  'startDate',
                  'Start Date'
                )} *
              </label>

              <input
                type="date"
                value={
                  startDate
                }
                onChange={(e) =>
                  setStartDate(
                    e.target.value
                  )
                }
                required
              />

            </div>

          </div>

        </div>

        {/* =================================
            MONTHLY CALCULATION
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'monthlyCalculation',
              'Monthly Calculation'
            )}
          </h2>

          <div className="daily-manage-summary">

            <div>

              <span>
                {t(
                  'principal',
                  'Principal'
                )}
              </span>

              <strong>
                ₹{
                  formatMoney(
                    principal
                  )
                }
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
                ₹{
                  formatMoney(
                    interestAmount
                  )
                }
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
                ₹{
                  formatMoney(
                    totalRepayment
                  )
                }
              </strong>

            </div>

            <div>

              <span>
                {t(
                  'alreadyPaid',
                  'Already Paid'
                )}
              </span>

              <strong>
                ₹{
                  formatMoney(
                    alreadyPaid
                  )
                }
              </strong>

            </div>

            <div>

              <span>
                {t(
                  'remaining',
                  'Remaining'
                )}
              </span>

              <strong>
                ₹{
                  formatMoney(
                    remainingAmount
                  )
                }
              </strong>

            </div>

            <div>

              <span>
                {t(
                  'monthlyAmount',
                  'Monthly Amount'
                )}
              </span>

              <strong>
                ₹{
                  formatMoney(
                    monthlyAmount
                  )
                }
              </strong>

            </div>

          </div>

          {/* =================================
              EXTRA INFORMATION
          ================================== */}

          <div className="daily-info-grid">

            <div>

              <span>
                {t(
                  'numberOfMonths',
                  'Number of Months'
                )}
              </span>

              <strong>
                {
                  numberOfMonths ||
                  0
                }
              </strong>

            </div>

            <div>

              <span>
                {t(
                  'endingDate',
                  'Ending Date'
                )}
              </span>

              <strong>
                {
                  endingDate ||
                  '-'
                }
              </strong>

            </div>

            <div>

              <span>
                {t(
                  'collectionMonth',
                  'Collection Month'
                )}
              </span>

              <strong>
                {
                  collectionMonth
                    ? getTranslatedMonth(
                        collectionMonth
                      )
                    : t(
                        'notSelected',
                        'Not Selected'
                      )
                }
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
                  selectedCategory?.category_name ||
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
            CALCULATION METHOD
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'calculationMethod',
              'Calculation Method'
            )}
          </h2>

          <p>
            {t(
              'interest',
              'Interest'
            )}
            {' = '}
            {t(
              'monthlyInterestFormula',
              'Principal × Monthly Rate × Number of Months ÷ 100'
            )}
          </p>

          <p>
            {t(
              'totalRepayment',
              'Total Repayment'
            )}
            {' = '}
            {t(
              'totalRepaymentFormula',
              'Principal + Interest'
            )}
          </p>

          <p>
            {t(
              'remaining',
              'Remaining'
            )}
            {' = '}
            {t(
              'remainingFormula',
              'Total Repayment − Already Paid'
            )}
          </p>

          <p>
            {t(
              'monthlyAmount',
              'Monthly Amount'
            )}
            {' = '}
            {t(
              'monthlyAmountFormula',
              'Remaining ÷ Number of Months'
            )}
          </p>

        </div>

        {/* =================================
            SAVE
        ================================== */}

        <button
          type="submit"
          className="record-payment-button"
          disabled={
            saving
          }
        >
          {
            saving
              ? t(
                  'creatingMonthlyFinance',
                  'Creating Monthly Finance...'
                )
              : t(
                  'createMonthlyFinance',
                  'Create Monthly Finance'
                )
          }
        </button>

      </form>

    </div>
  )
}

export default Monthly