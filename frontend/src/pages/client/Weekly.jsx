import { formatMoney as formatMoneyValue } from '../../utils/money'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { ensureWeeklyLoanCategory } from '../../services/collectionCategories'
import { useToast } from '../../components/Toast'
import SelectMenu from '../../components/SelectMenu'

function Weekly() {
  const { t } = useTranslation()
  const { showToast } = useToast()

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

  const customerId = providedCustomerId || customer?.id || null

  // =========================================
  // FORM
  // =========================================

  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [alreadyPaid, setAlreadyPaid] = useState('0')
  const [numberOfWeeks, setNumberOfWeeks] = useState('')
  const [startDate, setStartDate] = useState('')

  // =========================================
  // CALCULATED VALUES
  // =========================================

  const [interestAmount, setInterestAmount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [remainingAmount, setRemainingAmount] = useState(0)
  const [weeklyAmount, setWeeklyAmount] = useState(0)
  const [endingDate, setEndingDate] = useState('')

  // =========================================
  // SETTINGS
  // =========================================

  const [settingsLoading, setSettingsLoading] = useState(true)

  // =========================================
  // COLLECTION CATEGORY
  // =========================================

  const [categories, setCategories] = useState([])
  const [collectionCategoryId, setCollectionCategoryId] = useState('')
  const [categoryLoading, setCategoryLoading] = useState(true)
  const [categoryError, setCategoryError] = useState(false)
  const categorySelectRef = useRef(null)

  // =========================================
  // SAVE STATUS
  // =========================================

  const [saving, setSaving] = useState(false)

  // =========================================
  // LOAD DEFAULT INTEREST RATE
  // =========================================

  useEffect(() => {
    const loadFinanceSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('default_interest_rate')
          .order('id', { ascending: true })
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
          data?.default_interest_rate !== null &&
          data?.default_interest_rate !== undefined
        ) {
          setInterestRate(
            String(data.default_interest_rate)
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

        const { categories: activeCategories, weeklyCategory } =
          await ensureWeeklyLoanCategory(user.id)

        setCategories(activeCategories)
        setCollectionCategoryId(String(weeklyCategory.id))
        setCategoryError(false)
      } catch (error) {
        console.error('Collection category loading error:', error)
        showToast(
          `${t('unableToLoadCollectionCategories', 'Unable to load Collection Categories')}: ${error.message}`,
          'error'
        )
      } finally {
        setCategoryLoading(false)
      }
    }

    loadCategories()
  }, [showToast, t])

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
          .eq('status', 'active')
          .order('full_name')

        if (error) {
          console.error('Unable to load customers:', error)
          showToast(
            `${t('unableToLoadCustomers', 'Unable to load customers')}: ${error.message}`,
            'error'
          )
          return
        }

        if (active) {
          setCustomerOptions(data || [])
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
  }, [providedCustomerId, showToast, t])

  // =========================================
  // CUSTOMER SELECTION
  // =========================================

  const handleCustomerChange = (value) => {
    const selectedCustomer =
      customerOptions.find(
        (option) => String(option.id) === value
      ) || null

    setCustomer(selectedCustomer)
    setCustomerError(false)
  }

  // =========================================
  // CALCULATE WEEKLY FINANCE
  // =========================================

  useEffect(() => {
    const p = Number(principal || 0)
    const rate = Number(interestRate || 0)
    const weeks = Number(numberOfWeeks || 0)

    // =========================================
    // INTEREST
    // =========================================

    const interest = Number(
      ((p * rate) / 100).toFixed(2)
    )

    /*
      IMPORTANT REQUIRED BEHAVIOUR

      Principal       = ₹50,000
      Interest        = ₹5,000
      Total Repayment = ₹50,000
      Already Paid    = ₹5,000
      Remaining       = ₹50,000

      Already Paid and Interest do NOT
      reduce or increase Total Repayment
      or Remaining.
    */

    const total = p
    const remaining = p

    setInterestAmount(interest)
    setTotalAmount(total)
    setRemainingAmount(remaining)

    // =========================================
    // WEEKLY AMOUNT
    // =========================================

    if (weeks > 0) {
      setWeeklyAmount(
        Number(
          (remaining / weeks).toFixed(2)
        )
      )
    } else {
      setWeeklyAmount(0)
    }

    // =========================================
    // ENDING DATE
    // =========================================

    if (startDate && weeks > 0) {
      const date = new Date(
        `${startDate}T00:00:00`
      )

      // Week 1 is the start date.
      date.setDate(
        date.getDate() +
        ((weeks - 1) * 7)
      )

      const year = date.getFullYear()

      const month = String(
        date.getMonth() + 1
      ).padStart(2, '0')

      const day = String(
        date.getDate()
      ).padStart(2, '0')

      setEndingDate(
        `${year}-${month}-${day}`
      )
    } else {
      setEndingDate('')
    }
  }, [
    principal,
    interestRate,
    alreadyPaid,
    numberOfWeeks,
    startDate
  ])

  // =========================================
  // FORMAT MONEY
  // =========================================

  const formatMoney = (value) => formatMoneyValue(value)

  // =========================================
  // SELECTED CATEGORY
  // =========================================

  const selectedCategory =
    categories.find(
      (category) =>
        String(category.id) ===
        String(collectionCategoryId)
    )

  // =========================================
  // SAVE WEEKLY FINANCE
  // =========================================

  const saveWeeklyFinance = async (e) => {
    e.preventDefault()

    const p = Number(principal)
    const rate = Number(interestRate)
    const paid = Number(alreadyPaid || 0)
    const weeks = Number(numberOfWeeks)

    const interest = Number(
      ((p * rate) / 100).toFixed(2)
    )

    // IMPORTANT:
    // Total repayment remains Principal.
    const total = p

    // =========================================
    // VALIDATION
    // =========================================

    if (!customerId) {
      setCustomerError(true)
      showToast(
        t('selectCustomerRequired', 'Please select a customer before creating this loan.'),
        'error'
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

    if (!p || p <= 0) {
      showToast(
        t('enterValidPrincipal', 'Enter a valid Principal Amount'),
        'error'
      )

      return
    }

    if (
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      showToast(
        t('enterValidInterestRate', 'Enter a valid Interest Rate'),
        'error'
      )

      return
    }

    if (paid < 0) {
      showToast(
        t('alreadyPaidNegative', 'Already Paid cannot be negative'),
        'error'
      )

      return
    }

    /*
      IMPORTANT:

      We intentionally do NOT check:

      paid >= total

      because Already Paid is informational
      and must not change Total Repayment.
    */

    if (
      !Number.isInteger(weeks) ||
      weeks <= 0
    ) {
      showToast(
        t('enterValidNumberOfWeeks', 'Enter a valid Number of Weeks'),
        'error'
      )

      return
    }

    if (!startDate) {
      showToast(
        t('selectStartDate', 'Select Start Date'),
        'error'
      )

      return
    }

    // =========================================
    // GET LOGGED-IN USER
    // =========================================

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      showToast(
        t('pleaseLoginAgain', 'Please login again'),
        'error'
      )

      navigate('/')
      return
    }

    setSaving(true)

    try {
      // =========================================
      // CREATE WEEKLY FINANCE ACCOUNT
      // =========================================

      const {
        data: financeRecord,
        error: financeError
      } = await supabase
        .from('finance_records')
        .insert({
          user_id: user.id,

          customer_id:
            Number(customerId),

          collection_category_id:
            Number(collectionCategoryId),

          name:
            customer?.full_name ||
            'Customer',

          finance_type:
            'weekly',

          // Keep internal/database value in English.
          period:
            `${weeks} Weeks`,

          payment_date:
            startDate,

          entry_date:
            startDate,

          ending_date:
            endingDate,

          // =====================================
          // TOTAL AMOUNT = PRINCIPAL
          // =====================================

          amount:
            total,

          // =====================================
          // ALREADY PAID SAVED SEPARATELY
          // =====================================

          paid:
            paid,

          // =====================================
          // ALREADY PAID DOES NOT REDUCE PENDING
          // =====================================

          pending:
            total,

          calculation_mode:
            'automatic',

          principal_amount:
            p,

          original_principal:
            p,

          /*
            Keep principal outstanding at
            original principal because
            Already Paid must not reduce it.
          */

          principal_outstanding:
            p,

          interest_rate:
            rate,

          // =====================================
          // INTEREST STORED SEPARATELY
          // =====================================

          interest_accrual:
            interest,

          /*
            Interest is informational/separate.
            Already Paid does not automatically
            consume calculated interest.
          */

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
            'weekly',

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
        console.error(financeError)

        showToast(
          `${t('unableToSaveWeeklyFinance', 'Unable to save Weekly Finance')}: ${financeError.message}`,
          'error'
        )

        return
      }

      // =========================================
      // GENERATE WEEKLY REPAYMENT SCHEDULE
      // =========================================

      const {
        error: scheduleError
      } = await supabase.rpc(
        'generate_weekly_schedule',
        {
          p_finance_record_id:
            financeRecord.id
        }
      )

      if (scheduleError) {
        console.error(scheduleError)

        showToast(
          `${t('weeklyCreatedScheduleFailed', 'Weekly Finance was created, but schedule generation failed')}: ${scheduleError.message}`,
          'error'
        )

        return
      }

      // =========================================
      // SUCCESS
      // =========================================

      showToast(
        t('weeklyFinanceCreatedSuccessfully', 'Weekly Finance created successfully'),
        'success'
      )

      navigate(
        `/customers/${customerId}`
      )
    } catch (error) {
      console.error(
        'Weekly Finance error:',
        error
      )

      showToast(
        error?.message || t('unableToCreateWeeklyFinance', 'Unable to create Weekly Finance'),
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="daily-page">

      {/* =====================================
          BACK BUTTON
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
                    Number(customerId)
                }
              }
            )
          } else {
            navigate('/customers')
          }
        }}
      >
        ← {t('back', 'Back')}
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
            'weeklyLoan',
            'Weekly Loan'
          )}
        </h1>

        <span>
          {t(
            'weeklyLoanDescription',
            'Create a weekly repayment finance'
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
              <label htmlFor="weekly-customer">
                {t('customer', 'Customer')} *
              </label>

              <SelectMenu
                id="weekly-customer"
                value={customer ? String(customer.id) : ''}
                onChange={handleCustomerChange}
                disabled={customerLoading}
                ariaLabel={t('customer', 'Customer')}
                ariaInvalid={customerError}
                placeholder={
                  customerLoading
                    ? t('loadingCustomers', 'Loading customers...')
                    : t('selectCustomer', 'Select Customer')
                }
                options={customerOptions.map((option) => ({
                  value: String(option.id),
                  label: `${option.customer_id} - ${option.full_name}`
                }))}
              />

              {!customerLoading && customerOptions.length === 0 && (
                <small
                  style={{
                    display: 'block',
                    marginTop: 6,
                    color: '#b42318'
                  }}
                >
                  {t(
                    'noCustomersAvailable',
                    'No active customers are available. Add a customer before creating this loan.'
                  )}
                </small>
              )}
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
                customer?.full_name ||
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
                customer?.customer_id ||
                '-'
              }
            </strong>

          </div>

        </div>

      </div>

      {/* =====================================
          FORM
      ====================================== */}

      <form onSubmit={saveWeeklyFinance}>

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

              <label>
                {t(
                  'collectionCategory',
                  'Collection Category'
                )} *
              </label>

              <SelectMenu
                ref={categorySelectRef}
                id="weekly-collection-category"
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
                    ? 'weekly-collection-category-error'
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
                  id="weekly-collection-category-error"
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
                        returnTo: '/weekly',
                        returnState: location.state,
                        returnLabelKey: 'backToWeeklyFinance'
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
                  id="weekly-collection-category-error"
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
                placeholder={
                  t(
                    'noCategorySelected',
                    'No category selected'
                  )
                }
                readOnly
              />

            </div>

          </div>

        </div>

        {/* =================================
            WEEKLY FINANCE DETAILS
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'weeklyFinanceDetails',
              'Weekly Finance Details'
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
                value={principal}
                onChange={(e) =>
                  setPrincipal(
                    e.target.value
                  )
                }
                placeholder={
                  t(
                    'weeklyPrincipalExample',
                    'Example: 20000'
                  )
                }
                required
              />

            </div>

            {/* INTEREST RATE */}

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
                step="0.01"
                value={interestRate}
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
                        'enterInterestRate',
                        'Enter interest rate'
                      )
                }
                required
              />

              <small>
                {t(
                  'weeklyInterestRateHelp',
                  'Default rate from Settings. You can change it for this loan.'
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
                value={alreadyPaid}
                onChange={(e) =>
                  setAlreadyPaid(
                    e.target.value
                  )
                }
                placeholder={
                  t(
                    'weeklyAlreadyPaidExample',
                    'Example: 2000'
                  )
                }
                required
              />

              <small>
                {t(
                  'weeklyAlreadyPaidHelp',
                  'Already Paid is recorded separately and does not reduce Total Repayment.'
                )}
              </small>

            </div>

            {/* INTEREST */}

            <div>

              <label>
                {t(
                  'interestAmount',
                  'Interest Amount'
                )} ₹
              </label>

              <input
                type="text"
                value={
                  formatMoney(
                    interestAmount
                  )
                }
                readOnly
              />

            </div>

            {/* TOTAL */}

            <div>

              <label>
                {t(
                  'totalRepayment',
                  'Total Repayment'
                )} ₹
              </label>

              <input
                type="text"
                value={
                  formatMoney(
                    totalAmount
                  )
                }
                readOnly
              />

            </div>

            {/* NUMBER OF WEEKS */}

            <div>

              <label>
                {t(
                  'numberOfWeeks',
                  'Number of Weeks'
                )} *
              </label>

              <input
                type="number"
                min="1"
                step="1"
                value={numberOfWeeks}
                onChange={(e) =>
                  setNumberOfWeeks(
                    e.target.value
                  )
                }
                placeholder={
                  t(
                    'weeksExample',
                    'Example: 20'
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
                value={startDate}
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
            WEEKLY CALCULATION
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t(
              'weeklyCalculation',
              'Weekly Calculation'
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
                ₹{formatMoney(principal)}
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
                  'alreadyPaid',
                  'Already Paid'
                )}
              </span>

              <strong>
                ₹{formatMoney(
                  alreadyPaid
                )}
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
                ₹{formatMoney(
                  remainingAmount
                )}
              </strong>

            </div>

            <div>

              <span>
                {t(
                  'weeklyAmount',
                  'Weekly Amount'
                )}
              </span>

              <strong>
                ₹{formatMoney(
                  weeklyAmount
                )}
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
                  'numberOfWeeks',
                  'Number of Weeks'
                )}
              </span>

              <strong>
                {numberOfWeeks || 0}
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
                {endingDate || '-'}
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
              'interestFormulaWeekly',
              'Interest = Principal × Rate of Interest ÷ 100'
            )}
          </p>

          <p>
            {t(
              'totalRepaymentFormulaWeekly',
              'Total Repayment = Principal Amount'
            )}
          </p>

          <p>
            {t(
              'alreadyPaidFormulaWeekly',
              'Already Paid is stored separately and does not reduce Total Repayment.'
            )}
          </p>

          <p>
            {t(
              'remainingFormulaWeekly',
              'Remaining Amount = Principal Amount'
            )}
          </p>

          <p>
            {t(
              'weeklyAmountFormula',
              'Weekly Amount = Remaining Amount ÷ Number of Weeks'
            )}
          </p>

        </div>

        {/* =================================
            SUBMIT
        ================================== */}

        <button
          type="submit"
          className="record-payment-button"
          disabled={saving}
        >
          {
            saving
              ? t(
                  'creatingWeeklyFinance',
                  'Creating Weekly Finance...'
                )
              : t(
                  'createWeeklyFinance',
                  'Create Weekly Finance'
                )
          }
        </button>

      </form>

    </div>
  )
}

export default Weekly