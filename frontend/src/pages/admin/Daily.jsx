import { useEffect, useRef, useState } from 'react'
import {
  useLocation,
  useNavigate
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { generateCustomerId } from '../../utils/customerId'

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

  const activeCustomer =
    customer || createdCustomer

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

          alert(
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

      if (!activeCustomer && !newCustomerName.trim()) {
        alert(
          t(
            'dailyCustomerNameRequired',
            'Enter the customer name to create a Daily Finance account.'
          )
        )
        return
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

        alert(
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
        alert(
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
        alert(
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
        alert(
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
        alert(
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
        alert(
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
        alert(
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

          alert(
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
          alert(
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

          alert(
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

        alert(
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

        alert(
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

  const formatMoney = (value) => {
    const localeByLanguage = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }

    return Number(
      value || 0
    ).toLocaleString(
      localeByLanguage[i18n.resolvedLanguage] || 'en-IN',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }

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

            {activeCustomer ? (
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
                <div>
                  <label>
                    {t(
                      'customerName',
                      'Customer Name'
                    )} *
                  </label>

                  <input
                    value={newCustomerName}
                    onChange={(event) =>
                      setNewCustomerName(event.target.value)
                    }
                    autoComplete="name"
                    required
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

              <select
                ref={categorySelectRef}
                id="daily-collection-category"
                value={
                  collectionCategoryId
                }
                onChange={(e) => {
                  setCollectionCategoryId(
                    e.target.value
                  )
                  setCategoryError(false)
                }}
                aria-required="true"
                aria-invalid={categoryError}
                aria-describedby={
                  categoryError
                    ? 'daily-collection-category-error'
                    : undefined
                }
                disabled={
                  categoryLoading
                }
              >

                <option value="">
                  {
                    categoryLoading
                      ? t(
                          'loadingCategories',
                          'Loading Categories...'
                        )
                      : t(
                          'selectCollectionCategory',
                          'Select Collection Category'
                        )
                  }
                </option>

                {categories.map(
                  (category) => (
                    <option
                      key={
                        category.id
                      }
                      value={
                        category.id
                      }
                    >
                      {
                        category.category_name
                      }
                    </option>
                  )
                )}

              </select>

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
                      state: { returnTo: '/daily' }
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
                step="0.01"
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
                value={
                  interestAmount
                }
                readOnly
              />
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