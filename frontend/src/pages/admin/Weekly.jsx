import { formatMoney as formatMoneyValue } from '../../utils/money'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { getWeeklyLoanCategory } from '../../services/collectionCategories'
import { useToast } from '../../components/Toast'
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

// Older projects do not have the finance_has_posted_payments RPC. Keep the
// form usable there without weakening the payment lock: combine any ledger row
// with the posted-payment totals stored on the loan.
async function checkPostedPayments(recordId, storedRecord) {
  const result = await supabase.rpc('finance_has_posted_payments', {
    p_finance_record_id: recordId
  })

  if (!result.error || result.error.code !== 'PGRST202') {
    return {
      hasPayments: Boolean(result.data),
      error: result.error || null
    }
  }

  const ledger = await supabase
    .from('finance_payments')
    .select('id')
    .eq('finance_record_id', recordId)
    .limit(1)

  const totalsHavePayments =
    Number(storedRecord?.principal_paid || 0) > 0 ||
    Number(storedRecord?.interest_paid || 0) > 0

  return {
    hasPayments:
      (!ledger.error && Boolean(ledger.data?.length)) ||
      totalsHavePayments,
    // A failed ledger lookup cannot prove the loan is unpaid. Unless the
    // stored totals already show a posted collection, keep the field locked.
    error: ledger.error && !totalsHavePayments ? ledger.error : null
  }
}

// The atomic reset RPC is also absent in older projects. Delete the old plan
// only after the no-payment check has passed, then use the existing generator.
async function rebuildWeeklySchedule(recordId, isEditing) {
  if (!isEditing) {
    return supabase.rpc('generate_weekly_schedule', {
      p_finance_record_id: recordId
    })
  }

  const reset = await supabase.rpc('reset_weekly_schedule', {
    p_finance_record_id: recordId
  })

  if (!reset.error || reset.error.code !== 'PGRST202') {
    return reset
  }

  const removed = await supabase
    .from('repayment_schedule')
    .delete()
    .eq('finance_record_id', recordId)

  if (removed.error) {
    // Some older projects grant no direct DELETE on this table to the
    // restricted role. The loan record is already saved, so let the existing
    // security-definer generator run rather than reporting a false save
    // failure. It keeps the current plan when one already exists.
    const denied =
      removed.error.code === '42501' ||
      String(removed.error.message)
        .toLowerCase()
        .includes('permission denied')

    if (denied) {
      return supabase.rpc('generate_weekly_schedule', {
        p_finance_record_id: recordId
      })
    }

    return removed
  }

  return supabase.rpc('generate_weekly_schedule', {
    p_finance_record_id: recordId
  })
}

function Weekly() {
  const { t, i18n } = useTranslation()
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

  // Editing a row in the live list overrides the customer linked from the
  // customer profile so the whole loan can be changed from this page.
  const [editingFinanceId, setEditingFinanceId] = useState(null)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const editingFinanceIdRef = useRef(null)

  const activeCustomer = editingCustomer || customer
  const activeCustomerName = activeCustomer?.full_name || ''

  const customerId = editingFinanceId
    ? activeCustomer?.id ?? null
    : providedCustomerId ?? customer?.id ?? null

  const [customerName, setCustomerName] = useState(
    providedCustomer?.full_name || ''
  )

  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const existingCustomerNames = customerOptions
    .map((option) => String(option.full_name || '').trim())
    .filter(Boolean)

  // =========================================
  // FORM
  // =========================================

  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [alreadyPaid, setAlreadyPaid] = useState('0')

  // "Already Paid" is editable for a saved loan only after a successful lookup
  // confirms there are no posted collections. Pending and failed checks keep
  // the field locked.
  const [editingHasPayments, setEditingHasPayments] = useState(false)
  const [editingPaymentChecked, setEditingPaymentChecked] = useState(false)
  const editingPaymentCheckRef = useRef(0)
  const paymentLookupRef = useRef(0)
  const originalAlreadyPaidRef = useRef('0')

  const [numberOfWeeks, setNumberOfWeeks] = useState('')
  const [startDate, setStartDate] = useState('')

  // =========================================
  // CALCULATED VALUES
  // =========================================

  const [interestAmount, setInterestAmount] = useState(0)

  // Tracks which field the user last edited. While Interest Amount is being
  // typed, the rate follows it; otherwise the rate drives the interest.
  const interestAmountEdited = useRef(false)

  // Snapshot of the values loaded from a stored loan. The calculation effect
  // uses it to skip the one update that opens the edit form so the saved
  // interest and rate are not recomputed.
  const loadedLoanValuesRef = useRef(null)

  const [totalAmount, setTotalAmount] = useState(0)
  const [remainingAmount, setRemainingAmount] = useState(0)
  const [weeklyAmount, setWeeklyAmount] = useState(0)
  const [endingDate, setEndingDate] = useState('')

  // =========================================
  // SETTINGS
  // =========================================

  const [settingsLoading, setSettingsLoading] = useState(true)

  // Keep the Settings default so resetting after an edit restores it instead
  // of leaving the rate blank.
  const defaultInterestRateRef = useRef('')

  // =========================================
  // COLLECTION CATEGORY
  // =========================================

  const [categories, setCategories] = useState([])
  const [collectionCategoryId, setCollectionCategoryId] = useState('')
  const [weeklyCategoryId, setWeeklyCategoryId] = useState('')
  const [categoryLoading, setCategoryLoading] = useState(true)
  const [categoryError, setCategoryError] = useState(false)
  const categorySelectRef = useRef(null)

  // =========================================
  // SAVE STATUS / VISIBILITY
  // =========================================

  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // If a loan was inserted but its schedule RPC failed, keep that id so the
  // next submit retries only the schedule instead of creating a duplicate.
  const pendingScheduleRecordIdRef = useRef(null)

  // The header button opens the form. When this page is opened from a customer
  // profile, the form is already needed.
  const [showForm, setShowForm] = useState(Boolean(providedCustomer))
  const formSectionRef = useRef(null)
  const revealForm = useMobileFormReveal(
    showForm,
    formSectionRef
  )

  // =========================================
  // LIVE WEEKLY LOANS LIST
  // =========================================

  const [weeklyLoans, setWeeklyLoans] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [listSearch, setListSearch] = useState('')

  const realtimeTimer = useRef(null)
  const loadRequestRef = useRef(0)

  const loadWeeklyLoans = useCallback(async () => {
    const requestId = ++loadRequestRef.current

    try {
      setListLoading(true)

      const {
        data: loans,
        error: loansError
      } = await supabase
        .from('finance_records')
        .select('*')
        .eq('finance_type', 'weekly')
        .order('created_at', { ascending: false })

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
          .select('id, customer_id, full_name, phone')
          .in('id', customerIds)

        if (customerError) {
          console.error(
            'Weekly loan customers error:',
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
        setWeeklyLoans(
          rows.map((row) => ({
            ...row,
            customer: customerMap[row.customer_id] || null
          }))
        )

        setListError('')
      }
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return
      }

      console.error('Weekly loans load error:', error)

      setListError(
        error?.message ||
          t(
            'unableToLoadWeeklyLoans',
            'Unable to load weekly loans.'
          )
      )
    } finally {
      if (requestId === loadRequestRef.current) {
        setListLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    loadWeeklyLoans()

    let disposed = false
    let channel = null

    getCurrentWorkspaceId()
      .then((workspaceId) => {
        if (!workspaceId || disposed) return

        channel = supabase
          .channel(`weekly-loans:${workspaceId}`)
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
                    loadWeeklyLoans()
                  }
                },
                200
              )
            }
          )
          .subscribe()
      })
      .catch(() => {
        // Realtime is best-effort; focus refresh below keeps data fresh.
      })

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadWeeklyLoans()
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

      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener(
        'visibilitychange',
        refreshOnFocus
      )
    }
  }, [loadWeeklyLoans])

  // =========================================
  // OPEN / CLOSE FORM
  // =========================================

  useEffect(() => {
    if (providedCustomer) {
      setShowForm(true)
    }
  }, [providedCustomer])

  useEffect(() => {
    if (activeCustomerName) {
      setCustomerName(activeCustomerName)
    }
  }, [activeCustomerName])

  const resetForm = () => {
    editingFinanceIdRef.current = null
    pendingScheduleRecordIdRef.current = null
    loadedLoanValuesRef.current = null
    editingPaymentCheckRef.current += 1
    paymentLookupRef.current += 1
    originalAlreadyPaidRef.current = '0'
    setEditingHasPayments(false)
    setEditingPaymentChecked(false)
    setEditingFinanceId(null)
    setEditingCustomer(null)
    setCustomer(providedCustomer)
    setCustomerName(providedCustomer?.full_name || '')
    setCustomerError(false)
    setNewCustomerPhone('')
    setPrincipal('')
    setInterestRate(defaultInterestRateRef.current)
    setAlreadyPaid('0')
    setInterestAmount(0)
    interestAmountEdited.current = false
    setTotalAmount(0)
    setRemainingAmount(0)
    setWeeklyAmount(0)
    setEndingDate('')
    setNumberOfWeeks('')
    setStartDate('')
    setCollectionCategoryId(weeklyCategoryId)
    setCategoryError(false)
  }

  const openAddWeekly = () => {
    // A customer insert and loan write are a single save session. Do not let a
    // new form replace one that has already started writing.
    if (savingRef.current) return

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

  const editWeeklyLoan = (loan) => {
    // A customer insert and loan write are a single save session. Do not let a
    // new edit replace one that has already started writing.
    if (savingRef.current) return

    const weeks = parseInt(
      String(loan.period || '').split(' ')[0],
      10
    )

    const nextPrincipal = loan.principal_amount ?? ''
    const nextInterestRate = loan.interest_rate ?? ''
    const nextInterestAmount =
      loan.interest_accrual ?? loan.interest_due ?? 0
    const nextAlreadyPaid = loan.paid ?? 0
    originalAlreadyPaidRef.current = String(nextAlreadyPaid)
    const nextWeeks =
      Number.isFinite(weeks) ? String(weeks) : ''
    const nextStartDate =
      loan.payment_date || loan.entry_date || ''

    const loanCustomer =
      loan.customer ||
      (loan.customer_id
        ? {
            id: loan.customer_id,
            customer_id: loan.customer_id,
            full_name: loan.name || '',
            phone: ''
          }
        : null)

    editingFinanceIdRef.current = loan.id
    loadedLoanValuesRef.current = {
      principal: nextPrincipal,
      interestRate: nextInterestRate,
      interestAmount: nextInterestAmount,
      alreadyPaid: nextAlreadyPaid,
      numberOfWeeks: nextWeeks,
      startDate: nextStartDate
    }

    setEditingFinanceId(loan.id)
    setEditingCustomer(loanCustomer)
    setCustomer(loanCustomer)
    setCustomerName(
      loan.name || loanCustomer?.full_name || ''
    )
    setCustomerError(false)
    setNewCustomerPhone(normalizePhone(loanCustomer?.phone))

    setPrincipal(nextPrincipal)
    setInterestRate(nextInterestRate)
    setInterestAmount(nextInterestAmount)
    interestAmountEdited.current = false
    setAlreadyPaid(nextAlreadyPaid)
    setNumberOfWeeks(nextWeeks)
    setStartDate(nextStartDate)
    setCollectionCategoryId(
      loan.collection_category_id ||
        weeklyCategoryId ||
        ''
    )
    setCategoryError(false)
    setShowForm(true)

    // Keep Already Paid locked until the lookup confirms there are no posted
    // collections. Pending and failed checks must not unlock the field.
    const paymentCheckId = ++editingPaymentCheckRef.current
    const lookupId = ++paymentLookupRef.current
    setEditingHasPayments(true)
    setEditingPaymentChecked(false)

    checkPostedPayments(loan.id, loan)
      .then(({ hasPayments, error }) => {
        if (
          lookupId !== paymentLookupRef.current ||
          paymentCheckId !==
          editingPaymentCheckRef.current
        ) {
          return
        }

        if (error) {
          console.error(
            'Weekly payment check error:',
            error
          )

          return
        }

        setEditingHasPayments(hasPayments)
        setEditingPaymentChecked(true)
      })
      .catch((error) =>
        console.error(
          'Weekly payment check error:',
          error
        )
      )

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
          defaultInterestRateRef.current = String(
            data.default_interest_rate
          )

          // A late settings response must not replace a rate the user just
          // derived by typing an Interest Amount.
          if (
            !editingFinanceIdRef.current &&
            !interestAmountEdited.current
          ) {
            setInterestRate(
              defaultInterestRateRef.current
            )
          }
        }
      } catch (error) {
        console.error('Finance settings error:', error)
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
          await getWeeklyLoanCategory()

        const weeklyCategoryIdValue = weeklyCategory?.id
          ? String(weeklyCategory.id)
          : ''

        setCategories(activeCategories)
        setWeeklyCategoryId(weeklyCategoryIdValue)
        // An Edit click can happen while this loader is in flight. Keep the
        // category from the loaded loan instead of replacing it with the
        // manually created one.
        setCollectionCategoryId((current) =>
          editingFinanceIdRef.current && current
            ? current
            : weeklyCategoryIdValue
        )
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
  // LOAD CUSTOMERS (when opened without one, or while editing)
  // =========================================

  useEffect(() => {
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
          showToast(
            `${t('unableToLoadCustomers', 'Unable to load customers')}: ${error.message}`,
            'error'
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
  }, [providedCustomerId, editingFinanceId, showToast, t])

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
            .toLocaleLowerCase() === normalized
      ) || null

    setCustomerName(typedName)
    setCustomer(selectedCustomer)
    setEditingCustomer(selectedCustomer)
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
    setEditingCustomer(null)
    setNewCustomerPhone('')
    setCustomerError(false)
  }

  // =========================================
  // CALCULATE WEEKLY FINANCE
  // =========================================

  useEffect(() => {
    const p = Number(principal || 0)
    const rate = Number(interestRate || 0)
    const weeks = Number(numberOfWeeks || 0)

    const loadedValues = loadedLoanValuesRef.current

    const isLoanLoadUpdate = Boolean(
      loadedValues &&
        loadedValues.principal === principal &&
        loadedValues.interestRate === interestRate &&
        loadedValues.interestAmount === interestAmount &&
        loadedValues.alreadyPaid === alreadyPaid &&
        loadedValues.numberOfWeeks === numberOfWeeks &&
        loadedValues.startDate === startDate
    )

    if (loadedValues) {
      loadedLoanValuesRef.current = null
    }

    // =========================================
    // INTEREST
    // =========================================

    const interest =
      interestAmountEdited.current
        ? Number(interestAmount || 0)
        : Number(((p * rate) / 100).toFixed(2))

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

    if (!isLoanLoadUpdate) {
      if (interestAmountEdited.current) {
        const derivedRate = rateFromInterestAmount(
          interestAmount,
          principal
        )

        if (derivedRate !== interestRate) {
          setInterestRate(derivedRate)
        }
      } else {
        setInterestAmount(interest)
      }
    }

    setTotalAmount(total)
    setRemainingAmount(remaining)

    // =========================================
    // WEEKLY AMOUNT
    // =========================================

    if (weeks > 0) {
      setWeeklyAmount(
        Number((remaining / weeks).toFixed(2))
      )
    } else {
      setWeeklyAmount(0)
    }

    // =========================================
    // ENDING DATE
    // =========================================

    if (startDate && weeks > 0) {
      const date = new Date(`${startDate}T00:00:00`)

      // Week 1 is the start date.
      date.setDate(
        date.getDate() + ((weeks - 1) * 7)
      )

      const year = date.getFullYear()

      const month = String(
        date.getMonth() + 1
      ).padStart(2, '0')

      const day = String(
        date.getDate()
      ).padStart(2, '0')

      setEndingDate(`${year}-${month}-${day}`)
    } else {
      setEndingDate('')
    }
  }, [
    principal,
    interestRate,
    interestAmount,
    numberOfWeeks,
    startDate
  ])

  // =========================================
  // FORMAT MONEY
  // =========================================

  const formatMoney = (value) =>
    formatMoneyValue(value, i18n.resolvedLanguage)

  // =========================================
  // SELECTED CATEGORY / LIST HELPERS
  // =========================================

  const selectedCategory =
    categories.find(
      (category) =>
        String(category.id) ===
        String(collectionCategoryId)
    )

  const categoryName = (id) =>
    categories.find(
      (category) => String(category.id) === String(id)
    )?.category_name || t('notSelected', 'Not Selected')

  const loanWeeks = (loan) =>
    parseInt(
      String(loan.period || '').split(' ')[0],
      10
    ) || 0

  const normalizedListSearch =
    listSearch.trim().toLocaleLowerCase()

  const filteredWeeklyLoans =
    weeklyLoans.filter((loan) => {
      if (!normalizedListSearch) return true

      return [
        loan.finance_id,
        loan.id,
        loan.customer?.full_name,
        loan.name,
        loan.customer?.customer_id,
        loan.customer?.phone,
        categoryName(loan.collection_category_id)
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedListSearch)
    })

  // =========================================
  // SAVE WEEKLY FINANCE
  // =========================================

  const saveWeeklyFinance = async (e) => {
    e.preventDefault()
    // A synchronous ref lock closes the gap while auth.getUser() is pending;
    // the saving state alone updates too late to stop a second fast submit.
    if (savingRef.current) return
    savingRef.current = true

    try {
    // Capture the exact edit being submitted before any await. A different
    // loan can be opened while authentication or customer creation is pending.
    const submittedEditRecordId = editingFinanceId
    const submittedEditSessionId =
      editingPaymentCheckRef.current
    const submittedOriginalPaid =
      originalAlreadyPaidRef.current

    const p = Number(principal)
    const rate = Number(interestRate)
    const paid = Number(alreadyPaid || 0)
    const weeks = Number(numberOfWeeks)

    // On edit the form holds the loan's stored interest, which may have been
    // typed directly, so keep it instead of recomputing from the rate.
    const interest = submittedEditRecordId
      ? Number(interestAmount || 0)
      : Number(((p * rate) / 100).toFixed(2))

    // IMPORTANT:
    // Total repayment remains Principal.
    const total = p

    // =========================================
    // VALIDATION
    // =========================================

    const trimmedCustomerName =
      getTrimmedCustomerName(customerName)

    if (!activeCustomer && !trimmedCustomerName) {
      setCustomerError(true)
      showToast(
        t(
          'selectCustomerRequired',
          'Please select a customer before creating this loan.'
        ),
        'error'
      )

      return
    }

    if (!activeCustomer && !isValidPhone(newCustomerPhone)) {
      showToast(t('agentPhoneMustBeTenDigits'), 'error')
      return
    }

    if (!activeCustomer) {
      setCustomerName(trimmedCustomerName)
    }

    if (!collectionCategoryId) {
      setCategoryError(true)
      showToast(
        t(
          'collectionCategoryRequired',
          'Please select a collection category.'
        ),
        'error'
      )
      categorySelectRef.current?.focus()
      categorySelectRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
      return
    }

    if (!Number.isFinite(p) || p <= 0) {
      showToast(
        t('enterValidPrincipal', 'Enter a valid Principal Amount'),
        'error'
      )

      return
    }

    if (
      String(interestRate).trim() === '' ||
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      showToast(
        t('enterValidInterestRate', 'Enter a valid Interest Rate'),
        'error'
      )

      return
    }

    if (!Number.isFinite(paid) || paid < 0) {
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

    // Authentication was awaited while the form could have been replaced.
    if (
      submittedEditSessionId !==
        editingPaymentCheckRef.current ||
      String(submittedEditRecordId ?? '') !==
        String(editingFinanceId ?? '')
    ) {
      return
    }

    setSaving(true)

    try {
      const isEditing = Boolean(submittedEditRecordId)
      const editedRecordId = submittedEditRecordId

      const isCurrentEdit = () =>
        submittedEditSessionId ===
          editingPaymentCheckRef.current &&
        String(editingFinanceId ?? '') ===
          String(submittedEditRecordId ?? '')

      // A failed schedule must not turn the next submit into a second loan.
      // Reuse the already-saved record and only retry the schedule RPC.
      const retryScheduleRecordId = pendingScheduleRecordIdRef.current

      if (retryScheduleRecordId && !submittedEditRecordId) {
        const {
          data: savedRecord,
          error: savedRecordError
        } = await supabase
          .from('finance_records')
          .select('id, customer_id')
          .eq('id', retryScheduleRecordId)
          .single()

        if (!isCurrentEdit()) return

        if (savedRecordError || !savedRecord?.id) {
          console.error(savedRecordError)
          pendingScheduleRecordIdRef.current = null
          showToast(t('collectionFinanceChanged'), 'error')
          return
        }

        if (!isCurrentEdit()) return

        const retryResult = await supabase.rpc(
          'generate_weekly_schedule',
          {
            p_finance_record_id: retryScheduleRecordId
          }
        )

        if (retryResult.error) {
          console.error(retryResult.error)

          showToast(
            `${t(
              'weeklyCreatedScheduleFailed',
              'Weekly Finance was created, but schedule generation failed'
            )}: ${retryResult.error.message}`,
            'error'
          )

          return
        }

        pendingScheduleRecordIdRef.current = null

        showToast(
          t(
            'weeklyFinanceCreatedSuccessfully',
            'Weekly Finance created successfully'
          ),
          'success'
        )

        const retryCustomerId =
          savedRecord.customer_id || customerId

        if (retryCustomerId) {
          navigate(`/customers/${retryCustomerId}`)
        } else {
          navigate('/customers')
        }

        return
      }

      // Re-read payment totals at submit time. The live list can be stale if a
      // collection was posted after it loaded.
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
            'id, paid, principal_paid, interest_paid, pending, period, loan_status, next_due_date'
          )
          .eq('id', editedRecordId)
          .single()

        if (freshRecordError || !freshRecord?.id) {
          console.error(freshRecordError)

          showToast(t('collectionFinanceChanged'), 'error')
          return
        }

        storedRecord = freshRecord
        recordedTotals = {
          paid: Number(freshRecord.paid || 0),
          principal_paid: Number(freshRecord.principal_paid || 0),
          interest_paid: Number(freshRecord.interest_paid || 0)
        }
      }

      if (!isCurrentEdit()) return

      // The helper uses the authoritative RPC when deployed and a safe ledger
      // plus stored-total fallback on older projects.
      let hasPostedPayments = false
      let paymentCheckError = null

      if (isEditing) {
        // Keep the submit-time result newer than any opening lookup.
        const lookupId = ++paymentLookupRef.current
        const result = await checkPostedPayments(
          editedRecordId,
          storedRecord
        )

        if (
          lookupId !== paymentLookupRef.current ||
          !isCurrentEdit()
        ) {
          return
        }

        paymentCheckError = result.error
        hasPostedPayments = result.hasPayments
      }

      if (!isCurrentEdit()) return

      const originallySeenPaid =
        Number(submittedOriginalPaid || 0)
      const alreadyPaidChanged =
        isEditing && Number(paid) !== originallySeenPaid

      // An explicit upfront edit must not overwrite a newer value saved by
      // somebody else. The fresh read is the conflict reference.
      if (
        alreadyPaidChanged &&
        Number(storedRecord?.paid || 0) !==
          originallySeenPaid
      ) {
        showToast(t('collectionFinanceChanged'), 'error')
        closeForm()
        await loadWeeklyLoans()
        return
      }

      // Apply the latest authoritative status before any rejection path so the
      // form cannot keep Already Paid editable after a posted collection is
      // discovered at submit time.
      setEditingHasPayments(
        paymentCheckError ? true : hasPostedPayments
      )
      setEditingPaymentChecked(!paymentCheckError)

      // A posted collection has an installment plan that must stay aligned
      // with the stored term. Details edits remain allowed; term changes are
      // deferred until the loan has no posted collections.
      const storedWeeks = parseInt(
        String(storedRecord?.period || '').split(' ')[0],
        10
      )

      if (
        isEditing &&
        hasPostedPayments &&
        Number.isFinite(storedWeeks) &&
        weeks !== storedWeeks
      ) {
        showToast(
          t(
            'weeklyTermLockedAfterPayments',
            'Loan term cannot be changed after collections are posted.'
          ),
          'error'
        )

        return
      }

      // A failed status check cannot safely rewrite balances or duplicate a
      // posted collection. Abort before the write and leave the form open.
      if (paymentCheckError) {
        console.error(
          'Weekly payment status check error:',
          paymentCheckError
        )

        showToast(
          t(
            'paymentStatusCheckFailed',
            'Payment status could not be checked. Save was not completed. Please try again.'
          ),
          'error'
        )

        return
      }

      // Only an explicit change with no posted collections is written. A
      // detail-only edit keeps the freshly read totals instead of restoring
      // the amount this form originally displayed.
      const canApplyAlreadyPaid =
        !isEditing ||
        (alreadyPaidChanged &&
          !hasPostedPayments &&
          !paymentCheckError)

      if (
        isEditing &&
        hasPostedPayments &&
        alreadyPaidChanged
      ) {
        setAlreadyPaid(String(recordedTotals.paid))

        showToast(
          t(
            'alreadyPaidLockedAfterPayments',
            'Already Paid cannot be changed after collections are posted.'
          ),
          'error'
        )
      }

      // =========================================
      // RESOLVE CUSTOMER (SELECT EXISTING OR CREATE NEW)
      // =========================================

      let financeCustomer = activeCustomer
      let financeCustomerId = customerId
      let insertedCustomer = null

      if (!financeCustomer) {
        const existingCustomer = customerOptions.find(
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

          for (let attempt = 0; attempt < 5; attempt += 1) {
            const result = await supabase
              .from('customers')
              .insert({
                customer_id: generateCustomerId(),
                full_name: trimmedCustomerName,
                phone: normalizePhone(newCustomerPhone),
                address: '',
                status: 'active',
                created_by: user.id,
                updated_at: new Date().toISOString()
              })
              .select('id, customer_id, full_name, phone, address')
              .single()

            if (!result.error) {
              insertResult = result
              break
            }

            if (result.error.code !== '23505') {
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

          insertedCustomer = insertResult.data
          financeCustomer = insertedCustomer
          financeCustomerId = insertedCustomer.id
        }
      }

      // Customer creation was awaited; do not update the newer form or start
      // the loan write if another edit has since been opened.
      if (!isCurrentEdit()) return

      if (insertedCustomer) {
        setCustomer(insertedCustomer)
        setCustomerOptions((current) => [
          ...current,
          insertedCustomer
        ])
      }

      // =========================================
      // EDITING? READ PRESERVED PAYMENT TOTALS
      // =========================================

      // Posted payment totals come from the freshly read record, not the form
      // or the live list, so editing details cannot rewrite a newer balance.
      // If no real collection exists, the upfront amount from the form is
      // written to the same balances used on create.
      const effectivePaid = canApplyAlreadyPaid
        ? paid
        : recordedTotals.paid
      const paidSoFar = effectivePaid

      const principalPaidSoFar = canApplyAlreadyPaid
        ? 0
        : recordedTotals.principal_paid

      const interestPaidSoFar = canApplyAlreadyPaid
        ? 0
        : recordedTotals.interest_paid

      // Weekly "Already Paid" is informational when no collection is posted,
      // so it must not reduce the outstanding amount. After a collection, only
      // principal/interest paid from real collections count against pending;
      // `paid` can still include the informational upfront amount.
      const postedPaidSoFar =
        Number(recordedTotals.principal_paid || 0) +
        Number(recordedTotals.interest_paid || 0)

      const pendingSoFar =
        !isEditing ||
        (!hasPostedPayments && !paymentCheckError)
          ? total
          : paymentCheckError
            ? Number(
                storedRecord?.pending ??
                  Math.max(total - postedPaidSoFar, 0)
              )
            : Math.max(total - postedPaidSoFar, 0)

      // =========================================
      // CREATE / UPDATE WEEKLY FINANCE ACCOUNT
      // =========================================

      const recordPayload = {
        customer_id: Number(financeCustomerId),

        collection_category_id:
          Number(collectionCategoryId),

        name:
          financeCustomer?.full_name ||
          trimmedCustomerName ||
          'Customer',

        finance_type: 'weekly',

        // Keep internal/database value in English.
        period: `${weeks} Weeks`,

        payment_date: startDate,

        entry_date: startDate,

        ending_date: endingDate,

        // =====================================
        // TOTAL AMOUNT = PRINCIPAL
        // =====================================

        amount: total,

        // Already Paid is written on create and when an edit explicitly changes
        // it while no real collection exists. Other edits keep stored totals.

        // =====================================
        // PENDING / OUTSTANDING (RECOMPUTED ON EDIT)
        // =====================================

        pending: pendingSoFar,

        calculation_mode: 'automatic',

        principal_amount: p,

        principal_outstanding: isEditing
          ? Math.max(p - principalPaidSoFar, 0)
          : p,

        interest_rate: rate,

        // =====================================
        // INTEREST STORED SEPARATELY
        // =====================================

        interest_accrual: interest,

        interest_due: isEditing
          ? Math.max(interest - interestPaidSoFar, 0)
          : interest,

        interest_method: 'original_principal',

        loan_type: 'normal',

        interest_type: 'simple',

        interest_period: 'loan_period',

        collection_cadence: 'weekly',

        last_interest_date: startDate,

        // A rebuilt unpaid schedule starts on the new start date, so the due
        // date must follow it. A paid loan skips the rebuild and keeps its
        // stored lifecycle date.
        next_due_date:
          isEditing && hasPostedPayments
            ? storedRecord?.next_due_date ?? startDate
            : startDate,

        loan_status: isEditing
          ? storedRecord?.loan_status ?? 'active'
          : 'active'
      }

      if (!isEditing) {
        Object.assign(recordPayload, {
          user_id: user.id,

          original_principal: p,

          renewal_count: 0
        })
      }

      if (canApplyAlreadyPaid) {
        Object.assign(recordPayload, {
          paid: paidSoFar,

          /*
            Keep principal outstanding at
            original principal because
            Already Paid must not reduce it.
          */

          interest_paid: interestPaidSoFar,

          principal_paid: principalPaidSoFar
        })
      }

      let financeRecord = null
      let financeError = null

      if (isEditing) {
        // The fresh read above already establishes the balance snapshot. Do not
        // add balance predicates to the UPDATE itself: numeric formatting from
        // PostgREST can make a normal edit affect zero rows and surface a false
        // "finance account changed" error. The database guard still blocks
        // payment-total changes once a collection is posted.
        const result = await supabase
          .from('finance_records')
          .update(recordPayload)
          .eq('id', editedRecordId)
          .select('id')
          .single()

        financeRecord = result.data
        financeError = result.error
      } else {
        const result = await supabase
          .from('finance_records')
          .insert([recordPayload])
          .select('id')
          .single()

        financeRecord = result.data
        financeError = result.error

        if (!financeError && financeRecord?.id) {
          pendingScheduleRecordIdRef.current = financeRecord.id
        }
      }

      if (financeError?.code === 'PGRST116') {
        console.error(financeError)

        showToast(t('collectionFinanceChanged'), 'error')
        closeForm()
        await loadWeeklyLoans()
        return
      }

      if (financeError) {
        console.error(financeError)

        showToast(
          `${t('unableToSaveWeeklyFinance', 'Unable to save Weekly Finance')}: ${financeError.message}`,
          'error'
        )

        return
      }

      if (!financeRecord?.id) {
        showToast(
          t(
            'weeklyFinanceNotCreatedCorrectly',
            'Weekly Finance was not saved correctly.'
          ),
          'error'
        )

        return
      }

      // =========================================
      // WEEKLY REPAYMENT SCHEDULE
      // =========================================

      // Rebuild the installment plan only when no real payments have been
      // recorded against this loan. The reset RPC deletes and regenerates
      // atomically, so an authorization failure cannot leave no schedule.
      let scheduleError = null
      const shouldGenerateSchedule =
        !isEditing ||
        (!hasPostedPayments && !paymentCheckError)

      if (shouldGenerateSchedule) {
        const result = await rebuildWeeklySchedule(
          financeRecord.id,
          isEditing
        )

        scheduleError = result.error
      }

      if (scheduleError) {
        console.error(scheduleError)

        showToast(
          `${t(
            isEditing
              ? 'weeklySavedScheduleFailed'
              : 'weeklyCreatedScheduleFailed',
            isEditing
              ? 'Weekly Finance was saved, but schedule generation failed'
              : 'Weekly Finance was created, but schedule generation failed'
          )}: ${scheduleError.message}`,
          'error'
        )

        if (isEditing) {
          closeForm()
          await loadWeeklyLoans()
        }

        return
      }

      if (!isEditing) {
        pendingScheduleRecordIdRef.current = null
      }

      // =========================================
      // SUCCESS
      // =========================================

      if (isEditing) {
        showToast(
          t(
            'weeklyFinanceUpdatedSuccessfully',
            'Weekly Finance {{financeId}} saved successfully',
            {
              financeId:
                storedRecord?.finance_id ||
                `#${submittedEditRecordId}`
            }
          ),
          'success'
        )

        closeForm()
        await loadWeeklyLoans()
        return
      }

      showToast(
        t('weeklyFinanceCreatedSuccessfully', 'Weekly Finance created successfully'),
        'success'
      )

      navigate(
        `/customers/${financeCustomerId}`
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
    } finally {
      savingRef.current = false
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
                  customer: activeCustomer,
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
            {t('finance', 'FINANCE')}
          </p>

          <h1>
            {editingFinanceId
              ? `${t('edit', 'Edit')} ${t('weeklyLoan', 'Weekly Loan')}`
              : t('weeklyLoan', 'Weekly Loan')}
          </h1>

          <span>
            {editingFinanceId
              ? t('editWeeklyLoan', 'Edit Weekly Loan')
              : t('weeklyLoanDescription', 'Create a weekly repayment finance')}
          </span>
        </div>

        <button
          type="button"
          className="loan-add-button flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
          onClick={openAddWeekly}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>{t('addWeeklyFinance', 'Add Weekly Finance')}</span>
        </button>
      </div>

      {/* =====================================
          LOAN SUMMARY — ALWAYS VISIBLE
      ====================================== */}

      <div className="daily-loan-summary">
        <h2>
          {t('loanSummary', 'Loan Summary')}
        </h2>

        <div className="daily-summary-grid">
          <div>
            <span>{t('principal', 'Principal')}</span>
            <strong>₹{formatMoney(principal)}</strong>
          </div>

          <div>
            <span>{t('interest', 'Interest')}</span>
            <strong>₹{formatMoney(interestAmount)}</strong>
          </div>

          <div>
            <span>{t('totalRepayment', 'Total Repayment')}</span>
            <strong>₹{formatMoney(totalAmount)}</strong>
          </div>

          <div>
            <span>{t('alreadyPaid', 'Already Paid')}</span>
            <strong>₹{formatMoney(alreadyPaid)}</strong>
          </div>

          <div>
            <span>{t('remainingAmount', 'Remaining Amount')}</span>
            <strong>₹{formatMoney(remainingAmount)}</strong>
          </div>

          <div>
            <span>{t('weeklyAmount', 'Weekly Amount')}</span>
            <strong>₹{formatMoney(weeklyAmount)}</strong>
          </div>

          <div>
            <span>{t('startDate', 'Start Date')}</span>
            <strong>{startDate || '-'}</strong>
          </div>

          <div>
            <span>{t('numberOfWeeks', 'Number of Weeks')}</span>
            <strong>{numberOfWeeks || 0}</strong>
          </div>

          <div>
            <span>{t('endingDate', 'Ending Date')}</span>
            <strong>{endingDate || '-'}</strong>
          </div>

          <div>
            <span>{t('collectionCategory', 'Collection Category')}</span>
            <strong>
              {selectedCategory?.category_name ||
                t('notSelected', 'Not Selected')}
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
        onSubmit={saveWeeklyFinance}
        noValidate
      >

        {/* =================================
            CUSTOMER
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t('customer', 'Customer')}
          </h2>

          {(!providedCustomerId || editingFinanceId) && (
            <div
              className="daily-form-grid"
              style={{ marginBottom: '18px' }}
            >
              <div style={{ gridColumn: '1 / -1' }}>
                <CustomerAutocomplete
                  id="weekly-customer"
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
                      setNewCustomerPhone(normalizePhone(event.target.value))
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
                {t('customerName', 'Customer Name')}
              </span>

              <strong>
                {activeCustomerName ||
                  t('notSelected', 'Not selected')}
              </strong>
            </div>

            <div>
              <span>
                {t('customerId', 'Customer ID')}
              </span>

              <strong>
                {activeCustomer?.customer_id || '-'}
              </strong>
            </div>

          </div>

        </div>

        {/* =================================
            COLLECTION CATEGORY
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t('collectionCategory', 'Collection Category')}
          </h2>

          <div className="daily-form-grid">

            <div>
              <label>
                {t('collectionCategory', 'Collection Category')} *
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
                {t('selectedCategory', 'Selected Category')}
              </label>

              <input
                value={
                  selectedCategory?.category_name || ''
                }
                placeholder={t('noCategorySelected', 'No category selected')}
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
            {t('weeklyFinanceDetails', 'Weekly Finance Details')}
          </h2>

          <div className="daily-form-grid">

            {/* PRINCIPAL */}

            <div>
              <label>
                {t('principalAmount', 'Principal Amount')} ₹ *
              </label>

              <input
                type="number"
                min="1"
                step="0.01"
                value={principal}
                onChange={(e) =>
                  setPrincipal(e.target.value)
                }
                placeholder={t('weeklyPrincipalExample', 'Example: 20000')}
                required
              />
            </div>

            {/* INTEREST RATE */}

            <div>
              <label>
                {t('rateOfInterest', 'Rate of Interest')} % *
              </label>

              <input
                type="number"
                min="0"
                step="any"
                value={interestRate}
                onChange={(e) => {
                  interestAmountEdited.current = false
                  setInterestRate(e.target.value)
                }}
                placeholder={
                  settingsLoading
                    ? t('loadingDefaultRate', 'Loading default rate...')
                    : t('enterInterestRate', 'Enter interest rate')
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
                {t('alreadyPaid', 'Already Paid')} ₹ *
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                aria-label={t('alreadyPaid', 'Already Paid')}
                value={alreadyPaid}
                readOnly={Boolean(
                  editingFinanceId &&
                    (!editingPaymentChecked ||
                      editingHasPayments)
                )}
                onChange={(e) =>
                  setAlreadyPaid(e.target.value)
                }
                placeholder={t('weeklyAlreadyPaidExample', 'Example: 2000')}
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
                {t('interestAmount', 'Interest Amount')} ₹
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={interestAmount}
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

            {/* TOTAL */}

            <div>
              <label>
                {t('totalRepayment', 'Total Repayment')} ₹
              </label>

              <input
                type="text"
                value={formatMoney(totalAmount)}
                readOnly
              />
            </div>

            {/* NUMBER OF WEEKS */}

            <div>
              <label>
                {t('numberOfWeeks', 'Number of Weeks')} *
              </label>

              <input
                type="number"
                min="1"
                step="1"
                value={numberOfWeeks}
                onChange={(e) =>
                  setNumberOfWeeks(e.target.value)
                }
                placeholder={t('weeksExample', 'Example: 20')}
                required
              />
            </div>

            {/* START DATE */}

            <div>
              <label>
                {t('startDate', 'Start Date')} *
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) =>
                  setStartDate(e.target.value)
                }
                required
              />
            </div>

          </div>

        </div>

        {/* =================================
            CALCULATION METHOD
        ================================== */}

        <div className="daily-form-section">

          <h2>
            {t('calculationMethod', 'Calculation Method')}
          </h2>

          <p>
            {t('interestFormulaWeekly', 'Interest = Principal × Rate of Interest ÷ 100')}
          </p>

          <p>
            {t('totalRepaymentFormulaWeekly', 'Total Repayment = Principal Amount')}
          </p>

          <p>
            {t(
              'alreadyPaidFormulaWeekly',
              'Already Paid is stored separately and does not reduce Total Repayment.'
            )}
          </p>

          <p>
            {t('remainingFormulaWeekly', 'Remaining Amount = Principal Amount')}
          </p>

          <p>
            {t(
              'weeklyAmountFormula',
              'Weekly Amount = Remaining Amount ÷ Number of Weeks'
            )}
          </p>

        </div>

        {/* =================================
            SAVE / CANCEL
        ================================== */}

        <div className="daily-save-area">

          <button
            type="submit"
            className="record-payment-button"
            disabled={saving}
          >
            {saving
              ? editingFinanceId
                ? t('saving', 'Saving...')
                : t('creatingWeeklyFinance', 'Creating Weekly Finance...')
              : editingFinanceId
                ? t('saveWeeklyFinance', 'Save Weekly Finance')
                : t('createWeeklyFinance', 'Create Weekly Finance')}
          </button>

          <button
            type="button"
            className="back-button"
            onClick={closeForm}
            disabled={saving}
          >
            {t('cancel', 'Cancel')}
          </button>

        </div>

      </form>

      )}

      {/* =================================
          LIVE WEEKLY LOANS LIST
      ================================== */}

      <div className="loan-list-section">

        <div className="loan-list-header">

          <div>
            <h2>
              {t('liveWeeklyLoans', 'Live Weekly Loans')}
            </h2>

            <span>
              {t('liveLoansHelp', 'Updates automatically as data changes.')}
            </span>
          </div>

          <input
            type="search"
            value={listSearch}
            onChange={(e) =>
              setListSearch(e.target.value)
            }
            placeholder={t(
              'searchWeeklyLoans',
              'Search customer, ID, phone or finance ID...'
            )}
            aria-label={t(
              'searchWeeklyLoans',
              'Search weekly loans'
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

        ) : filteredWeeklyLoans.length === 0 ? (

          <p className="loan-list-message">
            {t('noWeeklyLoansFound', 'No weekly loans found.')}
          </p>

        ) : (

          <div className="loan-list-table-wrap">

            <table className="loan-list-table">

              <thead>
                <tr>
                  <th>{t('financeId', 'Finance ID')}</th>
                  <th>{t('customerName', 'Customer Name')}</th>
                  <th>{t('customerId', 'Customer ID')}</th>
                  <th>{t('phone', 'Phone')}</th>
                  <th>{t('principal', 'Principal')}</th>
                  <th>{t('interestRate', 'Interest Rate')}</th>
                  <th>{t('interest', 'Interest')}</th>
                  <th>{t('totalRepayment', 'Total Repayment')}</th>
                  <th>{t('remainingAmount', 'Remaining Amount')}</th>
                  <th>{t('weeklyAmount', 'Weekly Amount')}</th>
                  <th>{t('startDate', 'Start Date')}</th>
                  <th>{t('numberOfWeeks', 'Number of Weeks')}</th>
                  <th>{t('endingDate', 'Ending Date')}</th>
                  <th>{t('collectionCategory', 'Collection Category')}</th>
                  <th>{t('paid', 'Paid')}</th>
                  <th>{t('pending', 'Pending')}</th>
                  <th>{t('status', 'Status')}</th>
                  <th>{t('edit', 'Edit')}</th>
                </tr>
              </thead>

              <tbody>
                {filteredWeeklyLoans.map((loan) => {
                  const weeks = loanWeeks(loan)

                  return (
                    <tr key={loan.id} data-finance-id={loan.id}>
                      <td>{loan.finance_id || `#${loan.id}`}</td>

                      <td>
                        {loan.customer?.full_name ||
                          loan.name ||
                          '-'}
                      </td>

                      <td>
                        {loan.customer?.customer_id || '-'}
                      </td>

                      <td>{loan.customer?.phone || '-'}</td>

                      <td>
                        ₹{formatMoney(loan.principal_amount)}
                      </td>

                      <td>{loan.interest_rate ?? 0}%</td>

                      <td>
                        ₹{formatMoney(
                          loan.interest_accrual ??
                            loan.interest_due
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(loan.amount)}
                      </td>

                      <td>
                        ₹{formatMoney(
                          loan.principal_outstanding ??
                            loan.pending
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(
                          weeks
                            ? Number(loan.amount || 0) / weeks
                            : 0
                        )}
                      </td>

                      <td>
                        {loan.payment_date ||
                          loan.entry_date ||
                          '-'}
                      </td>

                      <td>{weeks || '-'}</td>

                      <td>{loan.ending_date || '-'}</td>

                      <td>
                        {categoryName(loan.collection_category_id)}
                      </td>

                      <td>₹{formatMoney(loan.paid)}</td>

                      <td>₹{formatMoney(loan.pending)}</td>

                      <td>{loan.loan_status || '-'}</td>

                      <td>
                        <button
                          type="button"
                          className="loan-list-edit-button"
                          onClick={() =>
                            editWeeklyLoan(loan)
                          }
                        >
                          {t('edit', 'Edit')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

export default Weekly
