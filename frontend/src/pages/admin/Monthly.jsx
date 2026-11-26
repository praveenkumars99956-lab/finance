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
async function rebuildMonthlySchedule(recordId, isEditing) {
  if (!isEditing) {
    return supabase.rpc('generate_monthly_schedule', {
      p_finance_record_id: recordId
    })
  }

  const reset = await supabase.rpc('reset_monthly_schedule', {
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
      return supabase.rpc('generate_monthly_schedule', {
        p_finance_record_id: recordId
      })
    }

    return removed
  }

  return supabase.rpc('generate_monthly_schedule', {
    p_finance_record_id: recordId
  })
}

// Older projects do not have collection_month. Retry once without that column
// instead of blocking the whole save.
async function writeMonthlyRecord(payload, isEditing, recordId) {
  const run = (body) =>
    isEditing
      ? supabase
          .from('finance_records')
          .update(body)
          .eq('id', recordId)
          .select('id')
          .single()
      : supabase
          .from('finance_records')
          .insert([body])
          .select('id')
          .single()

  let result = await run(payload)

  // PostgREST reports an unknown column as PGRST204; direct SQL uses 42703.
  const missingCollectionMonth =
    Object.prototype.hasOwnProperty.call(
      payload,
      'collection_month'
    ) &&
    (result.error?.code === '42703' ||
      result.error?.code === 'PGRST204' ||
      String(result.error?.message || '')
        .toLowerCase()
        .includes('collection_month'))

  if (missingCollectionMonth) {
    const legacyPayload = { ...payload }
    delete legacyPayload.collection_month
    result = await run(legacyPayload)
  }

  return result
}

const PAYMENT_STATE_FIELDS = [
  'paid',
  'principal_paid',
  'interest_paid',
  'pending',
  'principal_outstanding',
  'loan_status',
  'next_due_date'
]

// A collection can commit between the save and the post-save reload. In that
// case the refreshed row owns the newer payment totals and balances, so keep
// those fields instead of restoring the pre-payment values from the edit.
// Without a confirmed posted collection, the values just saved stay on screen
// even if the reload returns an older row.
function reconcileStagedLoan(
  patch,
  refreshedLoan,
  useRefreshedPaymentState
) {
  if (!patch || !refreshedLoan) return patch
  if (!useRefreshedPaymentState) return patch

  const reconciled = { ...patch }

  PAYMENT_STATE_FIELDS.forEach((field) => {
    if (
      Object.prototype.hasOwnProperty.call(
        refreshedLoan,
        field
      )
    ) {
      reconciled[field] = refreshedLoan[field]
    }
  })

  return reconciled
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
  // Closing the form intentionally invalidates the edit session, but the
  // post-save reload must still be able to stage the values it just wrote.
  // A new form opening during that reload increments this token and skips it.
  const postSaveReloadRef = useRef(0)

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
      let refreshedRows = null

      if (requestId === loadRequestRef.current) {
        refreshedRows = rows.map((row) => ({
          ...row,
          customer:
            customerMap[row.customer_id] || null
        }))

        setMonthlyLoans(refreshedRows)
        setListError('')
      }

      return refreshedRows
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

  // The live list is the user's confirmation that an edit worked. Stage the
  // saved values immediately, and again after the reload, so a delayed or
  // stale refresh cannot restore the old row on screen.
  const stageEditedLoan = useCallback(
    (
      patch,
      refreshedLoan,
      useRefreshedPaymentState = false
    ) => {
      if (!patch?.id) return

      const rowId = String(patch.id)

      const stagedPatch = reconcileStagedLoan(
        patch,
        refreshedLoan,
        useRefreshedPaymentState
      )

      const refreshedCustomer =
        refreshedLoan?.customer
      // A successful authoritative reload is the current source of truth,
      // including when another operator changed the loan's customer.
      const useRefreshedCustomer =
        Boolean(refreshedLoan) &&
        Boolean(refreshedCustomer)

      const mergedPatch = {
        ...stagedPatch
      }

      if (useRefreshedCustomer) {
        // The association must move as one unit: customer object, id and
        // displayed name. Otherwise search can still match the old customer.
        mergedPatch.customer_id =
          refreshedCustomer.id ??
          refreshedCustomer.customer_id ??
          refreshedLoan.customer_id ??
          mergedPatch.customer_id
        mergedPatch.name =
          refreshedCustomer.full_name ||
          refreshedLoan.name ||
          mergedPatch.name
      }

      setMonthlyLoans((current) =>
        current.map((loan) =>
          String(loan.id) === rowId
            ? {
                ...loan,
                ...mergedPatch,
                customer: useRefreshedCustomer
                  ? refreshedCustomer
                  : mergedPatch.customer ??
                    loan.customer ??
                    null
              }
            : loan
        )
      )
    },
    []
  )

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

  // "Already Paid" is editable for a saved loan only after a successful lookup
  // confirms there are no posted collections. While the lookup is pending or
  // failed, the field stays locked.
  const [editingHasPayments, setEditingHasPayments] =
    useState(false)
  const [editingPaymentChecked, setEditingPaymentChecked] =
    useState(false)
  const editingPaymentCheckRef = useRef(0)
  const paymentLookupRef = useRef(0)
  const originalAlreadyPaidRef = useRef('0')

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
    postSaveReloadRef.current += 1
    editingPaymentCheckRef.current += 1
    paymentLookupRef.current += 1
    originalAlreadyPaidRef.current = '0'
    setEditingHasPayments(false)
    setEditingPaymentChecked(false)
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
    // A customer insert and loan write are a single save session. Do not let a
    // new edit replace one that has already started writing.
    if (savingRef.current) return

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
    postSaveReloadRef.current += 1
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
    originalAlreadyPaidRef.current = String(loan.paid ?? 0)
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
            'Monthly payment check error:',
            error
          )

          return
        }

        setEditingHasPayments(hasPayments)
        setEditingPaymentChecked(true)
      })
      .catch((error) =>
        console.error(
          'Monthly payment check error:',
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
      // Capture the exact edit being submitted before any await. A different
      // loan can be opened while authentication or customer creation is in
      // flight, and this handler must keep using its own snapshot.
      const submittedEditRecordId = editingFinanceId
      const submittedEditSessionId =
        editingPaymentCheckRef.current
      const submittedOriginalPaid =
        originalAlreadyPaidRef.current

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

      // Authentication was awaited while the form could have been replaced by
      // another loan. Keep using only the snapshot captured on submit.
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
        const isEditing =
          Boolean(submittedEditRecordId)
        const editedRecordId =
          submittedEditRecordId

        const isCurrentEdit = () =>
          submittedEditSessionId ===
            editingPaymentCheckRef.current &&
          String(editingFinanceId ?? '') ===
            String(submittedEditRecordId ?? '')

        // Closing must only reset the form that submitted this save.
        const closeSubmittedForm = () => {
          if (isCurrentEdit()) closeForm()
        }

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
              'id, paid, principal_paid, interest_paid, pending, loan_status, next_due_date'
            )
            .eq('id', editedRecordId)
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

        if (!isCurrentEdit()) return

        // The helper uses the authoritative RPC when deployed and a safe ledger
        // plus stored-total fallback on older projects.
        let hasPostedPayments = false
        let paymentCheckError = null

        if (isEditing) {
          // A separate lookup id prevents a slower opening lookup from
          // overriding this authoritative submit-time result.
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
          isEditing &&
          Number(paid) !== originallySeenPaid

        // An explicit upfront edit must not overwrite a newer value saved by
        // somebody else. The fresh read is the conflict reference.
        if (
          alreadyPaidChanged &&
          Number(storedRecord?.paid || 0) !==
            originallySeenPaid
        ) {
          notify(t('collectionFinanceChanged'))
          closeSubmittedForm()
          await loadMonthlyLoans()
          return
        }

        setEditingHasPayments(
          paymentCheckError ? true : hasPostedPayments
        )
        setEditingPaymentChecked(!paymentCheckError)

        // Without a trustworthy payment status, no write is safe: a detail
        // edit could rewrite payment balances and a paid correction could
        // duplicate a posted collection. Keep the form and its values open.
        if (paymentCheckError) {
          console.error(
            'Monthly payment status check error:',
            paymentCheckError
          )

          notify(
            t(
              'paymentStatusCheckFailed',
              'Payment status could not be checked. Save was not completed. Please try again.'
            )
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

        const effectivePaid = canApplyAlreadyPaid
          ? paid
          : recordedTotals.paid
        const shouldValidatePaid =
          !isEditing ||
          (!hasPostedPayments && !paymentCheckError)

        // Validate the amount that will actually be saved, including an
        // unchanged upfront amount retained after the total was reduced.
        if (
          shouldValidatePaid &&
          Number(effectivePaid) >= totalRepayment
        ) {
          notify(
            t(
              'alreadyPaidLessThanTotal',
              'Already Paid must be less than Total Repayment'
            )
          )

          return
        }

        if (
          isEditing &&
          hasPostedPayments &&
          alreadyPaidChanged
        ) {
          setAlreadyPaid(
            String(recordedTotals.paid)
          )

          notify(
            t(
              'alreadyPaidLockedAfterPayments',
              'Already Paid cannot be changed after collections are posted.'
            )
          )
        }

        const paidSoFar = effectivePaid

        const principalPaidSoFar = canApplyAlreadyPaid
          ? Math.min(paid, p)
          : recordedTotals.principal_paid

        const interestPaidSoFar = canApplyAlreadyPaid
          ? Math.min(
              Number(interestAmount || 0),
              Math.max(paid - p, 0)
            )
          : recordedTotals.interest_paid

        // =====================================
        // RESOLVE CUSTOMER (SELECT EXISTING OR CREATE NEW)
        // =====================================

        let financeCustomer = activeCustomer
        let financeCustomerId = activeCustomerId
        let insertedCustomer = null

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
                  'id, customer_id, full_name, phone, address'
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

            insertedCustomer = insertResult.data
            financeCustomer = insertedCustomer
            financeCustomerId = insertedCustomer.id
          }
        }

        // Customer creation was awaited; the form could have been replaced.
        if (!isCurrentEdit()) return

        if (insertedCustomer) {
          setCustomer(insertedCustomer)
          setCustomerOptions((current) => [
            ...current,
            insertedCustomer
          ])
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

          // A rebuilt unpaid schedule starts on the new start date, so the
          // due date must follow it. A paid loan skips the rebuild and keeps
          // its stored lifecycle date.
          next_due_date:
            isEditing && hasPostedPayments
              ? storedRecord?.next_due_date ??
                startDate
              : startDate,

          loan_status:
            isEditing
              ? storedRecord?.loan_status ??
                'active'
              : 'active'
        }

        if (!isEditing) {
          Object.assign(
            recordPayload,
            {
              user_id: user.id,
              original_principal: p,
              renewal_count: 0
            }
          )
        }

        if (canApplyAlreadyPaid) {
          Object.assign(
            recordPayload,
            {
              paid: paidSoFar,
              principal_paid:
                principalPaidSoFar,
              interest_paid:
                interestPaidSoFar
            }
          )
        }

        const stagedCustomer = financeCustomer
          ? {
              id:
                financeCustomer.id ??
                financeCustomerId,
              customer_id:
                financeCustomer.customer_id ??
                financeCustomerId,
              full_name:
                financeCustomer.full_name ||
                trimmedCustomerName,
              phone:
                normalizePhone(
                  financeCustomer.phone ||
                    newCustomerPhone
                ) || '',
              address:
                financeCustomer.address || ''
            }
          : null

        const savedLoanPatch = isEditing
          ? {
              ...recordPayload,
              id: submittedEditRecordId,
              finance_id:
                storedRecord?.finance_id,
              paid: paidSoFar,
              principal_paid:
                principalPaidSoFar,
              interest_paid:
                interestPaidSoFar,
              customer: stagedCustomer
            }
          : null

        const reloadAndStageEdit = async (
          reloadToken
        ) => {
          const refreshedRows =
            await loadMonthlyLoans()
          const listGeneration =
            loadRequestRef.current

          // A null result means the reload was superseded or failed. Keep the
          // immediate patch already on screen instead of restaging stale data.
          if (
            !refreshedRows ||
            reloadToken !== postSaveReloadRef.current
          ) {
            return
          }

          const refreshedLoan =
            refreshedRows.find(
              (row) =>
                String(row.id) ===
                String(editedRecordId)
            )

          if (!refreshedLoan) return

          // Recheck payments after the reload. A collection posted between
          // the guarded UPDATE and this read makes the refreshed balances
          // authoritative; otherwise the just-saved patch wins over a stale
          // reload.
          let postedPaymentsAtReload =
            hasPostedPayments
          const lookupId =
            ++paymentLookupRef.current
          const paymentResult = await checkPostedPayments(
            editedRecordId,
            refreshedLoan
          )

          if (
            lookupId === paymentLookupRef.current &&
            reloadToken === postSaveReloadRef.current &&
            !paymentResult.error
          ) {
            postedPaymentsAtReload =
              paymentResult.hasPayments
          } else if (paymentResult.error) {
            console.error(
              'Monthly reload payment check error:',
              paymentResult.error
            )
          }

          if (
            reloadToken !== postSaveReloadRef.current ||
            listGeneration !== loadRequestRef.current
          ) {
            return
          }

          // If a posted collection makes the refreshed balances authoritative,
          // read them once more after the status check so both decisions come
          // from the same post-payment state.
          let balanceLoan = refreshedLoan

          if (postedPaymentsAtReload) {
            const {
              data: snapshotRecord,
              error: snapshotError
            } = await supabase
              .from('finance_records')
              .select(
                'id, paid, principal_paid, interest_paid, pending, loan_status, next_due_date'
              )
              .eq('id', editedRecordId)
              .single()

            if (
              !snapshotError &&
              snapshotRecord?.id
            ) {
              balanceLoan = {
                ...refreshedLoan,
                ...snapshotRecord
              }
            }
          }

          if (
            reloadToken !== postSaveReloadRef.current ||
            listGeneration !== loadRequestRef.current
          ) {
            return
          }

          stageEditedLoan(
            savedLoanPatch,
            balanceLoan,
            postedPaymentsAtReload
          )
        }

        let financeRecord = null
        let saveError = null

        // The fresh read above already establishes the balance snapshot. Do
        // not add balance predicates to the UPDATE itself: numeric formatting
        // from PostgREST can make a normal edit affect zero rows and surface a
        // false "finance account changed" error. The helper also retries once
        // without collection_month on projects where that column is missing.
        const result = await writeMonthlyRecord(
          recordPayload,
          isEditing,
          editedRecordId
        )

        financeRecord = result.data
        saveError = result.error

        if (saveError?.code === 'PGRST116') {
          console.error(saveError)

          notify(t('collectionFinanceChanged'))
          closeSubmittedForm()
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

        if (savedLoanPatch) {
          stageEditedLoan(savedLoanPatch)
        }

        // =====================================
        // MONTHLY REPAYMENT SCHEDULE
        // =====================================

        // Only rebuild the plan when no payments have been recorded. The reset
        // RPC deletes and regenerates atomically, so an authorization failure
        // cannot leave the loan without a schedule.
        let scheduleError = null
        const shouldGenerateSchedule =
          !isEditing ||
          (!hasPostedPayments && !paymentCheckError)

        if (shouldGenerateSchedule) {
          const result = await rebuildMonthlySchedule(
            financeRecord.id,
            isEditing
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
            closeSubmittedForm()
            await reloadAndStageEdit(
              postSaveReloadRef.current
            )
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
                  `#${submittedEditRecordId}`
              }
            )
          )

          closeSubmittedForm()
          await reloadAndStageEdit(
            postSaveReloadRef.current
          )
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
                aria-label={t(
                  'interestAmount',
                  'Interest Amount'
                )}
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
                aria-label={t(
                  'alreadyPaid',
                  'Already Paid'
                )}
                value={
                  alreadyPaid
                }
                readOnly={Boolean(
                  editingFinanceId &&
                    (!editingPaymentChecked ||
                      editingHasPayments)
                )}
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
                      <tr key={loan.id} data-finance-id={loan.id}>

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