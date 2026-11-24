import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { ensureMonthlyLoanCategory } from '../../services/collectionCategories'
import SelectMenu from '../../components/SelectMenu'
import { generateCustomerId } from '../../utils/customerId'
import { isValidPhone, normalizePhone } from '../../utils/phone'
import { useMobileFormReveal } from '../../hooks/useMobileFormReveal'
import {
  normalizeInterestInput,
  rateFromInterestAmount
} from '../../utils/interestRate'
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

// Editing must never restore balances that were posted after the loan list was
// read. The guard is part of the UPDATE statement, so a payment committing
// between the fresh read and the write makes the update affect no rows.
function withRecordedBalanceGuard(query, totals) {
  return [
    ['paid', totals.paid],
    ['principal_paid', totals.principal_paid],
    ['interest_paid', totals.interest_paid]
  ].reduce(
    (current, [column, value]) =>
      current.or(
        `${column}.eq.${Number(value || 0)},${column}.is.null`
      ),
    query
  )
}

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

  const [newCustomerPhone, setNewCustomerPhone] =
    useState('')

  const existingCustomerNames =
    customerOptions
      .map((option) =>
        String(option.full_name || '').trim()
      )
      .filter(Boolean)

  // Editing a row in the live list overrides the customer linked from the
  // customer profile so the whole loan can be changed from this page.
  // `customer` starts as the navigation customer, so editingCustomer wins
  // whenever a list row is being edited.
  const [editingFinanceId, setEditingFinanceId] =
    useState(null)

  const [editingCustomer, setEditingCustomer] =
    useState(null)

  const activeCustomer =
    editingCustomer || customer

  const activeCustomerId =
    editingCustomer?.id ??
    customer?.id ??
    null

  // =========================================
  // FORM VISIBILITY + LIVE LIST STATE
  // =========================================

  // The header button opens the form. When this page is opened from a
  // customer profile, the form is already needed.
  const [showForm, setShowForm] =
    useState(Boolean(providedCustomer))
  const formSectionRef = useRef(null)
  const revealForm = useMobileFormReveal(
    showForm,
    formSectionRef
  )

  const [monthlyLoans, setMonthlyLoans] =
    useState([])

  const [listLoading, setListLoading] =
    useState(true)

  const [listError, setListError] =
    useState('')

  const [listSearch, setListSearch] =
    useState('')

  const realtimeTimer = useRef(null)
  const loadRequestRef = useRef(0)

  const loadMonthlyLoans = useCallback(async () => {
    const requestId = ++loadRequestRef.current

    try {
      setListLoading(true)

      const {
        data: loans,
        error: loansError
      } = await supabase
        .from('finance_records')
        .select('*')
        .eq('finance_type', 'monthly')
        .order('created_at', {
          ascending: false
        })

      if (loansError) {
        throw loansError
      }

      const rows = loans || []

      const customerIds = [
        ...new Set(
          rows
            .map((row) => row.customer_id)
            .filter(Boolean)
        )
      ]

      let customerMap = {}

      if (customerIds.length) {
        const {
          data: customerRows,
          error: customerError
        } = await supabase
          .from('customers')
          .select(
            'id, customer_id, full_name, phone, address'
          )
          .in('id', customerIds)

        if (customerError) {
          console.error(
            'Monthly loan customers error:',
            customerError
          )
        } else {
          customerMap = Object.fromEntries(
            (customerRows || []).map((row) => [
              row.id,
              row
            ])
          )
        }
      }

      // Ignore a slower refresh that started before the post-save reload.
      if (requestId === loadRequestRef.current) {
        setMonthlyLoans(
          rows.map((row) => ({
            ...row,
            customer:
              customerMap[row.customer_id] || null
          }))
        )

        setListError('')
      }
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return
      }

      console.error(
        'Monthly loans load error:',
        error
      )

      setListError(
        error?.message ||
          t(
            'unableToLoadMonthlyLoans',
            'Unable to load monthly loans.'
          )
      )
    } finally {
      if (requestId === loadRequestRef.current) {
        setListLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    loadMonthlyLoans()

    let disposed = false
    let channel = null

    getCurrentWorkspaceId()
      .then((workspaceId) => {
        if (!workspaceId || disposed) return

        channel = supabase
          .channel(`monthly-loans:${workspaceId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'finance_records',
              filter: `workspace_id=eq.${workspaceId}`
            },
            () => {
              if (realtimeTimer.current) {
                clearTimeout(realtimeTimer.current)
              }

              realtimeTimer.current = setTimeout(
                () => {
                  if (!disposed) {
                    loadMonthlyLoans()
                  }
                },
                200
              )
            }
          )
          .subscribe()
      })
      .catch(() => {
        // Realtime is best-effort; focus refresh keeps data fresh.
      })

    const refreshOnFocus = () => {
      if (
        document.visibilityState === 'visible'
      ) {
        loadMonthlyLoans()
      }
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener(
      'visibilitychange',
      refreshOnFocus
    )

    return () => {
      disposed = true

      if (realtimeTimer.current) {
        clearTimeout(realtimeTimer.current)
      }

      if (channel) {
        supabase.removeChannel(channel)
      }

      window.removeEventListener(
        'focus',
        refreshOnFocus
      )
      document.removeEventListener(
        'visibilitychange',
        refreshOnFocus
      )
    }
  }, [loadMonthlyLoans])

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

  // An edit load seeds a stored month; the next auto-select effect must not
  // replace it with a month derived from the start date.
  const skipMonthAutoSelectRef = useRef(false)

  const [categories, setCategories] =
    useState([])

  const [collectionCategoryId, setCollectionCategoryId] =
    useState('')

  // Restored when the form is cancelled/reset.
  const [defaultCategoryId, setDefaultCategoryId] =
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

  // Tracks which field the user last edited. While Interest Amount is being
  // typed, the rate follows it; otherwise the rate drives the interest.
  const interestAmountEdited = useRef(false)

  // Loading a saved loan must not let the calculation effect or the async
  // default-rate load replace the stored interest/rate.
  const editLoadRef = useRef(false)
  const editingLoanRef = useRef(false)

  // Bumped on every Edit click so the calculation effect runs even when the
  // same row is edited twice with identical values, consuming the guard.
  const [editLoadVersion, setEditLoadVersion] = useState(0)

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

  // Keep the Settings default so resetting after an edit restores it instead
  // of leaving the required rate blank.
  const defaultInterestRateRef = useRef('')

  const [saving, setSaving] =
    useState(false)
  const savingRef = useRef(false)

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
          defaultInterestRateRef.current = String(
            data.default_interest_rate
          )

          // A late settings response must not replace a rate the user just
          // derived by typing an Interest Amount.
          if (
            !editingLoanRef.current &&
            !interestAmountEdited.current
          ) {
            setInterestRate(
              defaultInterestRateRef.current
            )
          }
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
        // An Edit click can happen while this loader is in flight. Keep the
        // category from the loaded loan instead of replacing it with default.
        setCollectionCategoryId((current) =>
          editingLoanRef.current && current
            ? current
            : String(monthlyCategory.id)
        )
        setDefaultCategoryId(String(monthlyCategory.id))
        setCategoryError(false)
      } catch (error) {
        console.error('Collection category loading error:', error)
        setCategories([])
        setCategoryError(true)
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
    // With a linked navigation customer the autocomplete is normally hidden,
    // but editing a list row must allow changing the customer.
    if (providedCustomerId && !editingFinanceId) {
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
  }, [providedCustomerId, editingFinanceId, t])

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
    // While editing, keep the override in sync with the autocomplete so the
    // selected customer wins over the original record/navigation customer.
    if (editingFinanceId) {
      setEditingCustomer(selectedCustomer)
    }
    // A name that no longer matches the selected customer is a new customer,
    // so it must not inherit that customer's phone number.
    setNewCustomerPhone(
      selectedCustomer
        ? normalizePhone(selectedCustomer.phone)
        : ''
    )
    setCustomerError(false)
  }

  const handleCreateNewCustomer = (value) => {
    const trimmedName = getTrimmedCustomerName(value)

    setCustomerName(trimmedName)
    setCustomer(null)
    if (editingFinanceId) {
      setEditingCustomer(null)
    }
    setNewCustomerPhone('')
    setCustomerError(false)
  }

  // =========================================
  // AUTO SELECT COLLECTION MONTH
  // =========================================

  useEffect(() => {
    if (skipMonthAutoSelectRef.current) {
      skipMonthAutoSelectRef.current = false
      return
    }

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
  }, [startDate, editLoadVersion])

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

    const isEditLoad =
      editLoadRef.current

    const interest =
      isEditLoad ||
      interestAmountEdited.current
        ? Number(interestAmount || 0)
        : months > 0
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

    if (isEditLoad) {
      // Keep the stored interest/rate from the loaded loan. The flag is
      // consumed so later user edits recalculate as usual.
      editLoadRef.current = false
    } else if (interestAmountEdited.current) {
      const derivedRate =
        rateFromInterestAmount(
          interestAmount,
          principal,
          numberOfMonths
        )

      if (derivedRate !== interestRate) {
        setInterestRate(derivedRate)
      }
    } else {
      setInterestAmount(
        interest
      )
    }

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
    interestAmount,
    alreadyPaid,
    numberOfMonths,
    startDate,
    editLoadVersion
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
  // OPEN / CLOSE FORM + EDIT ROW
  // =========================================

  const resetForm = () => {
    editLoadRef.current = false
    editingLoanRef.current = false
    setEditingFinanceId(null)
    setEditingCustomer(null)
    setCustomer(providedCustomer)
    setCustomerName(
      providedCustomer?.full_name || ''
    )
    setCustomerError(false)
    setNewCustomerPhone('')
    setPrincipal('')
    setInterestRate(defaultInterestRateRef.current)
    setInterestAmount(0)
    interestAmountEdited.current = false
    setAlreadyPaid('0')
    setNumberOfMonths('')
    setStartDate('')
    setCollectionMonth('')
    setEndingDate('')
    setCollectionCategoryId(defaultCategoryId)
    setCategoryError(false)
  }

  const openAddMonthly = () => {
    resetForm()
    setShowForm(true)

    const isMobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 640px)').matches

    if (isMobile) {
      revealForm()
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
  }

  const closeForm = () => {
    resetForm()
    setShowForm(false)
  }

  const monthFromDate = (dateValue) => {
    const parts = String(dateValue || '')
      .split('-')
      .map(Number)

    const monthNumber = parts[1]

    if (
      monthNumber >= 1 &&
      monthNumber <= 12
    ) {
      return MONTHS[monthNumber - 1].value
    }

    return ''
  }

  const editMonthlyLoan = (loan) => {
    const months = parseInt(
      String(loan.period || '').split(' ')[0],
      10
    )

    const loanCustomer =
      loan.customer ||
      (loan.customer_id
        ? {
            id: loan.customer_id,
            customer_id: loan.customer_id,
            full_name: loan.name || '',
            phone: '',
            address: ''
          }
        : null)

    const loanStartDate =
      loan.payment_date || loan.entry_date || ''

    editLoadRef.current = true
    editingLoanRef.current = true
    skipMonthAutoSelectRef.current = true
    setEditLoadVersion((version) => version + 1)
    setEditingFinanceId(loan.id)
    setEditingCustomer(loanCustomer)
    setCustomer(loanCustomer)
    setCustomerName(
      loan.name || loanCustomer?.full_name || ''
    )
    setCustomerError(false)
    setNewCustomerPhone(normalizePhone(loanCustomer?.phone))

    setPrincipal(loan.principal_amount ?? '')
    setInterestRate(loan.interest_rate ?? '')
    setInterestAmount(
      loan.interest_accrual ?? loan.interest_due ?? 0
    )
    interestAmountEdited.current = false
    setAlreadyPaid(loan.paid ?? 0)
    setNumberOfMonths(
      Number.isFinite(months) ? String(months) : ''
    )
    setStartDate(loanStartDate)
    setCollectionMonth(
      loan.collection_month ||
        monthFromDate(loanStartDate)
    )
    setEndingDate(loan.ending_date || '')
    setCollectionCategoryId(
      loan.collection_category_id || defaultCategoryId
    )
    setCategoryError(false)
    setShowForm(true)

    const isMobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 640px)').matches

    if (isMobile) {
      revealForm()
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
  }

  // Navigation state from a customer profile opens the form automatically.
  useEffect(() => {
    if (providedCustomer) {
      setShowForm(true)
    }
  }, [providedCustomer])

  // =========================================
  // SAVE MONTHLY FINANCE
  // =========================================

  const saveMonthlyFinance =
    async (e) => {
      e.preventDefault()
      // A synchronous ref lock closes the gap while auth.getUser() is
      // pending; state alone updates too late to stop a second fast submit.
      if (savingRef.current) return
      savingRef.current = true

      try {
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
        !activeCustomer &&
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

      if (
        !activeCustomer &&
        !isValidPhone(newCustomerPhone)
      ) {
        notify(t('agentPhoneMustBeTenDigits'))
        return
      }

      if (!collectionCategoryId) {
        setCategoryError(true)
        notify(
          t(
            'collectionCategoryRequired',
            'Please select a collection category.'
          )
        )

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
        !Number.isFinite(p) ||
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
        String(interestRate).trim() === '' ||
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

      // Paid-off loans may be edited; this guard only applies to new loans.
      if (
        !editingFinanceId &&
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
        const isEditing =
          Boolean(editingFinanceId)

        // Re-read payment totals at submit time. The live list can be stale if
        // a collection was posted after it loaded.
        let storedRecord = null
        let recordedTotals = {
          paid: 0,
          principal_paid: 0,
          interest_paid: 0
        }

        if (isEditing) {
          const {
            data: freshRecord,
            error: freshRecordError
          } = await supabase
            .from('finance_records')
            .select(
              'id, finance_id, paid, principal_paid, interest_paid'
            )
            .eq('id', editingFinanceId)
            .single()

          if (freshRecordError || !freshRecord?.id) {
            console.error(freshRecordError)

            notify(t('collectionFinanceChanged'))
            return
          }

          storedRecord = freshRecord
          recordedTotals = {
            paid: Number(freshRecord.paid || 0),
            principal_paid: Number(freshRecord.principal_paid || 0),
            interest_paid: Number(freshRecord.interest_paid || 0)
          }
        }

        // On edit, posted payment totals come from the freshly read record so
        // loan detail edits cannot rewrite them. On create, the informational
        // "Already Paid" amount must reduce the stored balances to match the
        // live summary; otherwise the list and payment RPC would allow
        // collecting the upfront amount a second time.
        const paidSoFar = isEditing
          ? recordedTotals.paid
          : paid

        const principalPaidSoFar = isEditing
          ? recordedTotals.principal_paid
          : Math.min(paid, p)

        const interestPaidSoFar = isEditing
          ? recordedTotals.interest_paid
          : Math.min(
              Number(interestAmount || 0),
              Math.max(paid - p, 0)
            )

        // =====================================
        // RESOLVE CUSTOMER (SELECT EXISTING OR CREATE NEW)
        // =====================================

        let financeCustomer = activeCustomer
        let financeCustomerId = activeCustomerId

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
                  phone:
                    normalizePhone(newCustomerPhone),
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
        // CREATE / UPDATE FINANCE RECORD
        // =====================================

        const recordPayload = {
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

          // The selected collection month is displayed by agent screens, so
          // it must be persisted with the finance record.
          collection_month:
            collectionMonth,

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

          // =================================
          // INTEREST
          // =================================

          interest_rate:
            rate,

          interest_accrual:
            interestAmount,

          interest_due:
            Math.max(
              Number(interestAmount || 0) -
                interestPaidSoFar,
              0
            ),

          // =================================
          // BALANCE
          // =================================

          pending:
            Math.max(
              totalRepayment - paidSoFar,
              0
            ),

          principal_outstanding:
            Math.max(
              p - principalPaidSoFar,
              0
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
            'active'
        }

        if (!isEditing) {
          Object.assign(
            recordPayload,
            {
              user_id: user.id,
              original_principal: p,
              interest_paid:
                interestPaidSoFar,
              paid: paid,
              principal_paid:
                principalPaidSoFar,
              renewal_count: 0
            }
          )
        }

        let financeRecord = null
        let saveError = null

        if (isEditing) {
          const result = await withRecordedBalanceGuard(
            supabase
              .from('finance_records')
              .update(recordPayload)
              .eq('id', editingFinanceId),
            recordedTotals
          )
            .select('id')
            .single()

          financeRecord = result.data
          saveError = result.error
        } else {
          const result = await supabase
            .from('finance_records')
            .insert([recordPayload])
            .select('id')
            .single()

          financeRecord = result.data
          saveError = result.error
        }

        if (saveError?.code === 'PGRST116') {
          console.error(saveError)

          notify(t('collectionFinanceChanged'))
          closeForm()
          await loadMonthlyLoans()
          return
        }

        if (saveError) {
          console.error(
            'Monthly finance save error:',
            saveError
          )

          notify(
            `${t(
              'unableToSaveMonthlyFinance',
              'Unable to save Monthly Finance'
            )}: ${saveError.message}`
          )

          return
        }

        if (!financeRecord?.id) {
          notify(
            t(
              'monthlyFinanceNotCreatedCorrectly',
              'Monthly Finance was not saved correctly.'
            )
          )

          return
        }

        // =====================================
        // MONTHLY REPAYMENT SCHEDULE
        // =====================================

        let scheduleError = null
        let shouldGenerateSchedule = true

        if (isEditing) {
          // Only rebuild the plan when no payments have been made yet. The
          // reset RPC deletes and regenerates atomically, so an authorization
          // failure cannot leave the loan without a schedule.
          const {
            data: existingPayments,
            error: paymentCheckError
          } = await supabase
            .from('finance_payments')
            .select('id')
            .eq(
              'finance_record_id',
              editingFinanceId
            )
            .limit(1)

          if (paymentCheckError) {
            console.error(
              'Monthly payment check error:',
              paymentCheckError
            )

            scheduleError = paymentCheckError
            shouldGenerateSchedule = false
          } else if (existingPayments?.length) {
            shouldGenerateSchedule = false
          }
        }

        if (shouldGenerateSchedule) {
          const result = await supabase.rpc(
            isEditing
              ? 'reset_monthly_schedule'
              : 'generate_monthly_schedule',
            {
              p_finance_record_id:
                financeRecord.id
            }
          )

          scheduleError = result.error
        }

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
              'Monthly Finance was saved, but schedule generation failed'
            )}: ${scheduleError.message}`
          )

          if (isEditing) {
            closeForm()
            await loadMonthlyLoans()
            return
          }

          navigate(
            `/customers/${financeCustomerId}`
          )

          return
        }

        // =====================================
        // SUCCESS
        // =====================================

        if (isEditing) {
          notify(
            t(
              'monthlyLoanSavedSuccessfully',
              'Monthly Loan {{financeId}} saved successfully',
              {
                financeId:
                  storedRecord?.finance_id ||
                  `#${editingFinanceId}`
              }
            )
          )

          closeForm()
          await loadMonthlyLoans()
          return
        }

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
      } finally {
        savingRef.current = false
      }
    }

  // =========================================
  // LIST HELPERS
  // =========================================

  const categoryName = (id) =>
    categories.find(
      (category) =>
        String(category.id) === String(id)
    )?.category_name ||
    t('notSelected', 'Not Selected')

  const loanMonths = (loan) =>
    parseInt(
      String(loan.period || '').split(' ')[0],
      10
    ) || 0

  const remainingFor = (loan) => {
    const fallback = Math.max(
      Number(loan.amount || 0) -
        Number(loan.paid || 0),
      0
    )

    return Number(
      loan.pending ?? fallback
    )
  }

  const monthlyFor = (loan) => {
    const months = loanMonths(loan)

    return months > 0
      ? Number(
          (
            remainingFor(loan) / months
          ).toFixed(2)
        )
      : 0
  }

  const normalizedListSearch =
    listSearch.trim().toLocaleLowerCase()

  const filteredMonthlyLoans =
    monthlyLoans.filter((loan) => {
      if (!normalizedListSearch) return true

      return [
        loan.finance_id,
        loan.id,
        loan.name,
        loan.customer?.full_name,
        loan.customer?.customer_id,
        loan.customer?.phone,
        categoryName(
          loan.collection_category_id
        )
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedListSearch)
    })

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
          if (activeCustomerId) {
            navigate(
              `/customers/${activeCustomerId}/finance`,
              {
                state: {
                  customer: activeCustomer,

                  customerId:
                    Number(
                      activeCustomerId
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

      <div
        className="daily-header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}
      >
        <div>
          <p>
            {t(
              'finance',
              'FINANCE'
            )}
          </p>

          <h1>
            {editingFinanceId
              ? `${t(
                  'edit',
                  'Edit'
                )} ${t(
                  'monthlyLoan',
                  'Monthly Loan'
                )}`
              : t(
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

        <button
          type="button"
          className="loan-add-button flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
          onClick={openAddMonthly}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>
            {t(
              'addMonthlyFinance',
              'Add Monthly Finance'
            )}
          </span>
        </button>

      </div>

      {/* =====================================
          LOAN SUMMARY — ALWAYS VISIBLE
      ====================================== */}

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
              ₹{formatMoney(interestAmount)}
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
              ₹{formatMoney(totalRepayment)}
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
              ₹{formatMoney(alreadyPaid)}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'remainingAmount',
                'Remaining Amount'
              )}
            </span>

            <strong>
              ₹{formatMoney(remainingAmount)}
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
              ₹{formatMoney(monthlyAmount)}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'numberOfMonths',
                'Number of Months'
              )}
            </span>

            <strong>
              {numberOfMonths || 0}
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
              {collectionMonth
                ? getTranslatedMonth(
                    collectionMonth
                  )
                : t(
                    'notSelected',
                    'Not Selected'
                  )}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'startDate',
                'Start Date'
              )}
            </span>

            <strong>
              {startDate || '-'}
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
              {selectedCategory?.category_name ||
                t(
                  'notSelected',
                  'Not Selected'
                )}
            </strong>
          </div>

        </div>

      </div>

      {/* =====================================
          FORM
      ====================================== */}

      {showForm && (

      <form
        ref={formSectionRef}
        onSubmit={
          saveMonthlyFinance
        }
        noValidate
      >

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

        {(!providedCustomerId || editingFinanceId) && (
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

            {!activeCustomer && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label>
                  {t('phoneNumber', 'Phone Number')} *
                </label>

                <input
                  type="tel"
                  value={newCustomerPhone}
                  onChange={(event) =>
                    setNewCustomerPhone(
                      normalizePhone(event.target.value)
                    )
                  }
                  maxLength={10}
                  inputMode="numeric"
                  placeholder={t('tenDigitPhoneNumber')}
                  autoComplete="tel"
                />
              </div>
            )}
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
                activeCustomer
                  ?.customer_id ||
                '-'
              }
            </strong>

          </div>

        </div>

      </div>

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
                    color: 'var(--fs-inline-danger, #b42318)'
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
                    color: 'var(--fs-inline-danger, #b42318)'
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
                onChange={(e) => {
                  const value = e.target.value
                  setPrincipal(value)

                  // If the amount was entered first, keep the rate in sync
                  // as soon as its principal is available.
                  if (interestAmountEdited.current) {
                    setInterestRate(
                      rateFromInterestAmount(
                        interestAmount,
                        value,
                        numberOfMonths
                      )
                    )
                  }
                }}
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
                onChange={(e) => {
                  interestAmountEdited.current = false
                  setInterestRate(e.target.value)
                }}
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
                  const value = normalizeInterestInput(
                    e.target.value,
                    interestAmount
                  )
                  interestAmountEdited.current = true
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
                readOnly={Boolean(editingFinanceId)}
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
                onChange={(e) => {
                  const value = e.target.value
                  setNumberOfMonths(value)

                  // The month count is part of the amount-to-rate inverse.
                  if (interestAmountEdited.current) {
                    setInterestRate(
                      rateFromInterestAmount(
                        interestAmount,
                        principal,
                        value
                      )
                    )
                  }
                }}
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
            SAVE
        ================================== */}

        <div className="daily-save-area">

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
                    editingFinanceId
                      ? 'saving'
                      : 'creatingMonthlyFinance',
                    editingFinanceId
                      ? 'Saving...'
                      : 'Creating Monthly Finance...'
                  )
                : t(
                    editingFinanceId
                      ? 'saveMonthlyFinance'
                      : 'createMonthlyFinance',
                    editingFinanceId
                      ? 'Save Monthly Finance'
                      : 'Create Monthly Finance'
                  )
            }
          </button>

          <button
            type="button"
            className="back-button daily-cancel-button"
            onClick={closeForm}
            disabled={saving}
          >
            {t('cancel', 'Cancel')}
          </button>

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

      </form>

      )}

      {/* =================================
          LIVE MONTHLY LOANS LIST
      ================================= */}

      <div className="loan-list-section">

        <div className="loan-list-header">

          <div>
            <h2>
              {t(
                'liveMonthlyLoans',
                'Live Monthly Loans'
              )}
            </h2>

            <span>
              {t(
                'liveLoansHelp',
                'Updates automatically as data changes.'
              )}
            </span>
          </div>

          <input
            type="search"
            value={listSearch}
            onChange={(e) =>
              setListSearch(e.target.value)
            }
            placeholder={t(
              'searchMonthlyLoans',
              'Search customer, ID, phone or finance ID...'
            )}
            aria-label={t(
              'searchMonthlyLoans',
              'Search monthly loans'
            )}
          />

        </div>

        {listLoading ? (

          <p className="loan-list-message">
            {t('loading', 'Loading...')}
          </p>

        ) : listError ? (

          <p className="loan-list-error">
            {listError}
          </p>

        ) : filteredMonthlyLoans.length === 0 ? (

          <p className="loan-list-message">
            {t(
              'noMonthlyLoansFound',
              'No monthly loans found.'
            )}
          </p>

        ) : (

          <div className="loan-list-table-wrap">

            <table className="loan-list-table">

              <thead>
                <tr>
                  <th>
                    {t(
                      'financeId',
                      'Finance ID'
                    )}
                  </th>

                  <th>
                    {t(
                      'customerName',
                      'Customer Name'
                    )}
                  </th>

                  <th>
                    {t(
                      'customerId',
                      'Customer ID'
                    )}
                  </th>

                  <th>
                    {t('phone', 'Phone')}
                  </th>

                  <th>
                    {t(
                      'principal',
                      'Principal'
                    )}
                  </th>

                  <th>
                    {t(
                      'interestRate',
                      'Interest Rate'
                    )}
                  </th>

                  <th>
                    {t(
                      'interest',
                      'Interest'
                    )}
                  </th>

                  <th>
                    {t(
                      'totalRepayment',
                      'Total Repayment'
                    )}
                  </th>

                  <th>
                    {t(
                      'remainingAmount',
                      'Remaining'
                    )}
                  </th>

                  <th>
                    {t(
                      'monthlyAmount',
                      'Monthly Amount'
                    )}
                  </th>

                  <th>
                    {t(
                      'startDate',
                      'Start Date'
                    )}
                  </th>

                  <th>
                    {t(
                      'numberOfMonths',
                      'Number of Months'
                    )}
                  </th>

                  <th>
                    {t(
                      'endingDate',
                      'Ending Date'
                    )}
                  </th>

                  <th>
                    {t(
                      'collectionCategory',
                      'Collection Category'
                    )}
                  </th>

                  <th>
                    {t('paid', 'Paid')}
                  </th>

                  <th>
                    {t(
                      'pending',
                      'Pending'
                    )}
                  </th>

                  <th>
                    {t(
                      'status',
                      'Status'
                    )}
                  </th>

                  <th>
                    {t('edit', 'Edit')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredMonthlyLoans.map(
                  (loan) => {
                    const months =
                      loanMonths(loan)

                    return (
                      <tr key={loan.id}>

                        <td>
                          {loan.finance_id ||
                            `#${loan.id}`}
                        </td>

                        <td>
                          {loan.customer
                            ?.full_name ||
                            loan.name ||
                            '-'}
                        </td>

                        <td>
                          {loan.customer
                            ?.customer_id ||
                            '-'}
                        </td>

                        <td>
                          {loan.customer
                            ?.phone || '-'}
                        </td>

                        <td>
                          ₹{formatMoney(
                            loan.principal_amount
                          )}
                        </td>

                        <td>
                          {loan.interest_rate ?? 0}%
                        </td>

                        <td>
                          ₹{formatMoney(
                            loan.interest_accrual ??
                              loan.interest_due
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            loan.amount
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            remainingFor(loan)
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            monthlyFor(loan)
                          )}
                        </td>

                        <td>
                          {loan.payment_date ||
                            loan.entry_date ||
                            '-'}
                        </td>

                        <td>
                          {months || '-'}
                        </td>

                        <td>
                          {loan.ending_date ||
                            '-'}
                        </td>

                        <td>
                          {categoryName(
                            loan.collection_category_id
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            loan.paid
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            loan.pending
                          )}
                        </td>

                        <td>
                          {loan.loan_status ||
                            '-'}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="loan-list-edit-button"
                            onClick={() =>
                              editMonthlyLoan(
                                loan
                              )
                            }
                          >
                            {t(
                              'edit',
                              'Edit'
                            )}
                          </button>
                        </td>

                      </tr>
                    )
                  }
                )}
              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

export default Monthly