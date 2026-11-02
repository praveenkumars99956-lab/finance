import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { supabase } from '../../services/supabase'
import CalendarDatePicker from '../../components/CalendarDatePicker'
import { ensureInterestOnlyLoanCategory } from '../../services/collectionCategories'
import { generateCustomerId } from '../../utils/customerId'

function InterestOnly() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  // =========================================
  // CUSTOMER
  // =========================================

  const customer = location.state?.customer || null
  const [createdCustomer, setCreatedCustomer] = useState(null)
  const activeCustomer = customer || createdCustomer
  const customerId =
    location.state?.customerId ||
    activeCustomer?.id ||
    null
  const [newCustomerId, setNewCustomerId] = useState(generateCustomerId)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')

  // =========================================
  // FINANCE DETAILS
  // =========================================

  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [interestAmount, setInterestAmount] = useState('')

  // =========================================
  // START DATE
  // =========================================

  const [startDate, setStartDate] = useState('')

  // =========================================
  // COLLECTION CATEGORY
  // =========================================

  const [collectionCategoryId, setCollectionCategoryId] =
    useState('')

  const [categoryLoading, setCategoryLoading] =
    useState(true)

  const [categoryError, setCategoryError] =
    useState('')

  // =========================================
  // SETTINGS
  // =========================================

  const [settingsLoading, setSettingsLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  // =========================================
  // LOAD DEFAULT INTEREST RATE
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
          .select('default_interest_rate')
          .order('id', {
            ascending: true
          })
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error(
            'SETTINGS LOAD ERROR:',
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
          'SETTINGS LOAD ERROR:',
          error
        )
      } finally {
        setSettingsLoading(false)
      }
    }

    loadFinanceSettings()
  }, [])

  // =========================================
  // ENSURE INTEREST-ONLY CATEGORY
  // =========================================

  useEffect(() => {
    const loadInterestOnlyCategory = async () => {
      try {
        setCategoryLoading(true)

        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (!user) {
          throw new Error(t('pleaseLoginAgain'))
        }

        const { interestOnlyCategory } =
          await ensureInterestOnlyLoanCategory(user.id)

        setCollectionCategoryId(
          String(interestOnlyCategory.id)
        )

        setCategoryError('')
      } catch (error) {
        console.error(
          'CATEGORY LOAD ERROR:',
          error
        )

        setCategoryError(
          t('unableLoadInterestOnlyCategory', {
            message: error?.message || String(error)
          })
        )
      } finally {
        setCategoryLoading(false)
      }
    }

    loadInterestOnlyCategory()
  }, [])

  // =========================================
  // AUTOMATIC INTEREST CALCULATION
  // =========================================

  useEffect(() => {
    const p =
      Number(principal || 0)

    const rate =
      Number(interestRate || 0)

    if (
      p > 0 &&
      rate >= 0
    ) {
      const interest =
        Number(
          (
            (p * rate) /
            100
          ).toFixed(2)
        )

      setInterestAmount(
        interest > 0
          ? interest.toFixed(2)
          : '0.00'
      )
    } else {
      setInterestAmount('')
    }
  }, [
    principal,
    interestRate
  ])

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
  // ADD 30 DAYS
  // =========================================

  const add30Days = (dateString) => {
    if (!dateString) {
      return null
    }

    const date = new Date(
      `${dateString}T00:00:00`
    )

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null
    }

    date.setDate(
      date.getDate() + 30
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

    return `${year}-${month}-${day}`
  }

  // =========================================
  // SAVE INTEREST-ONLY FINANCE
  // =========================================

  const saveInterestOnly = async (e) => {
    e.preventDefault()
    if (saving) return

    const p =
      Number(principal)

    const rate =
      Number(interestRate)

    const interest =
      Number(
        (
          (p * rate) /
          100
        ).toFixed(2)
      )

    // =====================================
    // CUSTOMER CHECK
    // =====================================

    if (!customerId && !newCustomerName.trim()) {
      alert(
        t(
          'dailyCustomerNameRequired',
          'Enter the customer name to create an Interest-Only Finance account.'
        )
      )

      return
    }

    // =====================================
    // CATEGORY CHECK
    // =====================================

    if (
      categoryLoading ||
      !collectionCategoryId
    ) {
      alert(
        categoryError ||
          t('interestOnlyCategoryLoading')
      )

      return
    }

    // =====================================
    // PRINCIPAL CHECK
    // =====================================

    if (
      !Number.isFinite(p) ||
      p <= 0
    ) {
      alert(
        t('enterValidPrincipal')
      )

      return
    }

    // =====================================
    // RATE CHECK
    // =====================================

    if (
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      alert(
        t('enterValidInterestRate')
      )

      return
    }

    // =====================================
    // INTEREST CHECK
    // =====================================

    if (
      !Number.isFinite(interest) ||
      interest < 0
    ) {
      alert(
        t('enterValidInterestAmount')
      )

      return
    }

    // =====================================
    // START DATE CHECK
    // =====================================

    if (!startDate) {
      alert(
        t('selectStartDate')
      )

      return
    }

    // =====================================
    // NEXT DUE DATE
    // =====================================

    const nextDueDate =
      add30Days(startDate)

    if (!nextDueDate) {
      alert(
        t('invalidStartDate')
      )

      return
    }

    // =====================================
    // LOGIN CHECK
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
        t('pleaseLoginAgain')
      )

      navigate('/')

      return
    }

    try {
      setSaving(true)

      let financeCustomer = activeCustomer
      let financeCustomerDbId = customerId

      if (!financeCustomer && !financeCustomerDbId) {
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

      // =====================================
      // SAVE TO FINANCE_RECORDS
      // =====================================

      const {
        error
      } = await supabase
        .from('finance_records')
        .insert({
          // USER
          user_id:
            user.id,

          // CUSTOMER
          customer_id:
            Number(financeCustomerDbId),

          // CATEGORY
          collection_category_id:
            Number(
              collectionCategoryId
            ),

          // CUSTOMER NAME
          name:
            financeCustomer?.full_name || 'Customer',

          // FINANCE TYPE
          finance_type:
            'interest_only',

          period:
            'Interest Only',

          // =================================
          // DATES
          // =================================

          payment_date:
            startDate,

          entry_date:
            startDate,

          ending_date:
            null,

          // =================================
          // BASIC AMOUNTS
          // =================================

          amount:
            p,

          paid:
            0,

          pending:
            p,

          // =================================
          // CALCULATION
          // =================================

          calculation_mode:
            'automatic',

          // =================================
          // PRINCIPAL
          // =================================

          principal_amount:
            p,

          original_principal:
            p,

          principal_outstanding:
            p,

          // =================================
          // INTEREST
          // =================================

          interest_rate:
            rate,

          interest_accrual:
            0,

          interest_due:
            0,

          interest_paid:
            0,

          principal_paid:
            0,

          interest_method:
            'principal_outstanding',

          loan_type:
            'interest_only',

          interest_type:
            'simple',

          interest_period:
            '30_days',

          collection_cadence:
            'monthly',

          // =================================
          // INTEREST DATES
          // =================================

          last_interest_date:
            startDate,

          next_due_date:
            nextDueDate,

          // =================================
          // STATUS
          // =================================

          loan_status:
            'active',

          renewal_count:
            0
        })

      if (error) {
        console.error(
          'INTEREST ONLY SAVE ERROR:',
          error
        )

        alert(
          t('unableCreateInterestOnlyFinance', { message: error.message })
        )

        return
      }

      alert(
        t('interestOnlyFinanceCreatedSuccessfully')
      )

      navigate(
        `/customers/${financeCustomerDbId}`
      )
    } catch (error) {
      console.error(
        'INTEREST ONLY SAVE ERROR:',
        error
      )

      alert(
        error?.message || t('unableCreateInterestOnlyFinanceFallback')
      )
    } finally {
      setSaving(false)
    }
  }

  // =========================================
  // RESTORE DEFAULT INTEREST RATE
  // =========================================

  const loadDefaultInterestAfterClear =
    async () => {
      try {
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
            {
              ascending: true
            }
          )
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error(
            'SETTINGS LOAD ERROR:',
            error
          )

          setInterestRate('')

          return
        }

        setInterestRate(
          String(
            data?.default_interest_rate ??
              ''
          )
        )
      } catch (error) {
        console.error(
          'SETTINGS LOAD ERROR:',
          error
        )

        setInterestRate('')
      }
    }

  // =========================================
  // CLEAR FORM
  // =========================================

  const clearForm = () => {
    setPrincipal('')

    setInterestAmount('')

    setStartDate('')

    loadDefaultInterestAfterClear()
  }

  // =========================================
  // BACK
  // =========================================

  const goBack = () => {
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

      return
    }

    navigate('/customers')
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="daily-page">

      {/* =====================================
          BACK
          ===================================== */}

      <button
        type="button"
        className="back-button"
        onClick={goBack}
      >
        ← {t('back')}
      </button>

      {/* =====================================
          HEADER
          ===================================== */}

      <div className="daily-header">

        <p>
          {t('appName')}
        </p>

        <h1>
          {t('interestOnlyLoan')}
        </h1>

        <span>
          {activeCustomer
            ? t('createInterestOnlyFinance')
            : t('newCustomerForDailyFinance', 'Enter new customer details')}
        </span>

      </div>

      <form onSubmit={saveInterestOnly}>
      {/* =====================================
          CUSTOMER
          ===================================== */}

      <div className="daily-form-section">

        <h2>
          {t('customer')}
        </h2>

        <div className="daily-info-grid">

          <div>

            <span>
              {t('customerName')}
            </span>

            {activeCustomer ? (
              <strong>{activeCustomer.full_name}</strong>
            ) : (
              <input
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                autoComplete="name"
                required
              />
            )}

          </div>

          <div>

            <span>
              {t('customerId')}
            </span>

            {activeCustomer ? (
              <strong>{activeCustomer.customer_id || '-'}</strong>
            ) : (
              <input value={newCustomerId} readOnly />
            )}

          </div>

          {!activeCustomer && (
            <>
              <div>
                <span>{t('phoneNumber', 'Phone Number')}</span>
                <input
                  type="tel"
                  value={newCustomerPhone}
                  onChange={(event) => setNewCustomerPhone(event.target.value)}
                  autoComplete="tel"
                />
              </div>

              <div>
                <span>{t('address', 'Address')}</span>
                <textarea
                  rows="3"
                  value={newCustomerAddress}
                  onChange={(event) => setNewCustomerAddress(event.target.value)}
                />
              </div>
            </>
          )}

        </div>

      </div>

      {/* =====================================
          FORM
          ===================================== */}

        {/* CATEGORY ERROR */}

        {categoryError && (
          <p role="alert">
            {categoryError}
          </p>
        )}

        {/* ===================================
            FINANCE DETAILS
            =================================== */}

        <div className="daily-form-section">

          <h2>
            {t('interestOnlyFinanceDetails')}
          </h2>

          <div className="daily-form-grid">

            {/* PRINCIPAL */}

            <div>

              <label>
                {t('principalAmount')} ₹ *
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
                placeholder={t('dailyPrincipalExample')}
                required
              />

            </div>

            {/* INTEREST RATE */}

            <div>

              <label>
                {t('monthlyRateOfInterest')} % *
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
                    ? t('loadingDefaultRate')
                    : t('enterInterestRate')
                }
                required
              />

              <small>
                {t('weeklyInterestRateHelp')}
              </small>

            </div>

          </div>

        </div>

        {/* ===================================
            START DATE CALENDAR
            =================================== */}

        <div className="daily-form-section">

          <h2>
            {t('startDate')}
          </h2>

          <p>
            {t('interestOnlyStartDateHelp')}
          </p>

          <CalendarDatePicker
            value={startDate}
            onChange={(date) => {
              console.log(
                'INTEREST LOAN START DATE:',
                date
              )

              setStartDate(date)
            }}
            label={t('interestOnlyLoanStartDate')}
          />

          {/* SELECTED DATE */}

          <div
            style={{
              marginTop: '15px',
              padding: '12px',
              background: '#f7f8fa',
              borderRadius: '8px'
            }}
          >

            <span>
              {t('selectedStartDate')}:{' '}
            </span>

            <strong>
              {
                startDate ||
                t('noDateSelected')
              }
            </strong>

          </div>

          {/* NEXT INTEREST DATE */}

          {startDate && (
            <div
              style={{
                marginTop: '10px',
                padding: '12px',
                background: '#f7f8fa',
                borderRadius: '8px'
              }}
            >

              <span>
                {t('firstInterestDueDate')}:{' '}
              </span>

              <strong>
                {add30Days(startDate)}
              </strong>

            </div>
          )}

        </div>

        {/* ===================================
            CALCULATION
            =================================== */}

        <div className="daily-form-section">

          <h2>
            {t('interestCalculation')}
          </h2>

          <p>
            {t('monthlyInterestFormula')}
          </p>

          <p>
            {t('interestOnlyExplanation')}
          </p>

          <div className="daily-manage-summary">

            {/* PRINCIPAL */}

            <div>

              <span>
                {t('principal')}
              </span>

              <strong>
                ₹{formatMoney(
                  principal
                )}
              </strong>

            </div>

            {/* RATE */}

            <div>

              <span>
                {t('monthlyRate')}
              </span>

              <strong>
                {
                  Number(
                    interestRate || 0
                  )
                }%
              </strong>

            </div>

            {/* INTEREST */}

            <div>

              <span>
                {t('interestPer30Days')}
              </span>

              <strong>
                ₹{formatMoney(
                  interestAmount
                )}
              </strong>

            </div>

            {/* PRINCIPAL DUE */}

            <div>

              <span>
                {t('principalDueAtPayoff')}
              </span>

              <strong>
                ₹{formatMoney(
                  principal
                )}
              </strong>

            </div>

          </div>

        </div>

        {/* ===================================
            SUMMARY
            =================================== */}

        {startDate && (
          <div className="daily-form-section">

            <h2>
              {t('loanSchedule')}
            </h2>

            <div className="daily-info-grid">

              <div>

                <span>
                  {t('startDate')}
                </span>

                <strong>
                  {startDate}
                </strong>

              </div>

              <div>

                <span>
                  {t('nextInterestDue')}
                </span>

                <strong>
                  {add30Days(
                    startDate
                  )}
                </strong>

              </div>

            </div>

          </div>
        )}

        {/* ===================================
            BUTTONS
            =================================== */}

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >

          <button
            type="submit"
            className="record-payment-button"
            disabled={
              saving ||
              categoryLoading ||
              !collectionCategoryId
            }
          >
            {
              saving
                ? t('creatingInterestOnlyFinance')
                : t('createInterestOnlyFinance')
            }
          </button>

          <button
            type="button"
            className="back-button"
            onClick={clearForm}
            disabled={saving}
          >
            {t('clear')}
          </button>

        </div>

      </form>

    </div>
  )
}

export default InterestOnly