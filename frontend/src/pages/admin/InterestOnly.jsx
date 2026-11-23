import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import CalendarDatePicker from '../../components/CalendarDatePicker'
import CustomerAutocomplete, {
  getTrimmedCustomerName
} from '../../components/CustomerAutocomplete'
import { ensureInterestOnlyLoanCategory } from '../../services/collectionCategories'
import { generateCustomerId } from '../../utils/customerId'
import { useMobileFormReveal } from '../../hooks/useMobileFormReveal'
import {
  normalizeInterestInput,
  rateFromInterestAmount
} from '../../utils/interestRate'

function InterestOnly() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  // =========================================
  // CUSTOMER
  // =========================================

  const customer = location.state?.customer || null

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

  // Editing a row in the live list overrides the customer linked from the
  // customer profile so the whole loan can be changed from this page.
  const [editingFinanceId, setEditingFinanceId] =
    useState(null)

  const [editingCustomer, setEditingCustomer] =
    useState(null)

  // Set once the customer field is edited so a customer linked from the
  // customer profile can be replaced through the autocomplete.
  const [
    customerSelectionCleared,
    setCustomerSelectionCleared
  ] = useState(false)

  const activeCustomer =
    editingCustomer ||
    selectedExistingCustomer ||
    createdCustomer ||
    (customerSelectionCleared ? null : customer)

  const activeCustomerDbId =
    editingCustomer?.id ??
    selectedExistingCustomer?.id ??
    createdCustomer?.id ??
    (customerSelectionCleared
      ? null
      : location.state?.customerId) ??
    activeCustomer?.id ??
    null

  const [customerName, setCustomerName] = useState(
    (customer || createdCustomer)?.full_name || ''
  )

  const [customerNameError, setCustomerNameError] =
    useState(false)

  const [newCustomerId, setNewCustomerId] = useState(generateCustomerId)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')

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

    setCustomerSelectionCleared(true)
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
      setEditingCustomer(null)
      setNewCustomerId(match.customer_id || '')
    } else {
      setCreatedCustomer(null)
      setEditingCustomer(null)

      if (!name) {
        setNewCustomerId(generateCustomerId())
      }
    }
  }

  const handleCreateNewCustomer = (name) => {
    const trimmedName = getTrimmedCustomerName(name)

    setCustomerSelectionCleared(true)
    setCustomerName(trimmedName)
    setNewCustomerName(trimmedName)
    setSelectedExistingCustomer(null)
    setCreatedCustomer(null)
    setEditingCustomer(null)
  }

  // =========================================
  // FINANCE DETAILS
  // =========================================

  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [interestAmount, setInterestAmount] = useState('')

  // Tracks which field the user last edited. While Interest Amount is being
  // typed, the rate follows it; otherwise the rate drives the interest.
  const interestAmountEdited = useRef(false)

  // Values loaded by clicking Edit. Async loaders and the interest
  // calculator leave these untouched until the user edits a field.
  const editLoadedValuesRef = useRef(null)

  // Bumped on every Edit click so the interest effect runs even when the same
  // row is edited twice with identical values.
  const [editLoadVersion, setEditLoadVersion] = useState(0)

  // =========================================
  // START DATE
  // =========================================

  const [startDate, setStartDate] = useState('')

  // =========================================
  // COLLECTION CATEGORY
  // =========================================

  const [interestOnlyCategory, setInterestOnlyCategory] =
    useState(null)

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

  // The header button opens the form. When this page is opened from a customer
  // profile, the form is already needed.
  const [showForm, setShowForm] =
    useState(Boolean(customer))
  const formSectionRef = useRef(null)
  const revealForm = useMobileFormReveal(
    showForm,
    formSectionRef
  )

  const isEditingLoan = Boolean(editingFinanceId)

  // =========================================
  // LIVE INTEREST-ONLY LOANS LIST
  // =========================================

  const [interestOnlyLoans, setInterestOnlyLoans] =
    useState([])

  const [listLoading, setListLoading] =
    useState(true)

  const [listError, setListError] = useState('')

  const [listSearch, setListSearch] = useState('')

  const realtimeTimer = useRef(null)
  const loadRequestRef = useRef(0)

  const loadInterestOnlyLoans = useCallback(async () => {
    const requestId = ++loadRequestRef.current

    try {
      setListLoading(true)

      const {
        data: loans,
        error: loansError
      } = await supabase
        .from('finance_records')
        .select('*')
        .eq('finance_type', 'interest_only')
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
            'Interest-only loan customers error:',
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
        setInterestOnlyLoans(
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
        'Interest-only loans load error:',
        error
      )

      setListError(
        error?.message ||
          t(
            'unableToLoadInterestOnlyLoans',
            'Unable to load interest-only loans.'
          )
      )
    } finally {
      if (requestId === loadRequestRef.current) {
        setListLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    loadInterestOnlyLoans()

    let disposed = false
    let channel = null

    getCurrentWorkspaceId()
      .then((workspaceId) => {
        if (!workspaceId || disposed) return

        channel = supabase
          .channel(`interest-only-loans:${workspaceId}`)
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
                    loadInterestOnlyLoans()
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
        loadInterestOnlyLoans()
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
  }, [loadInterestOnlyLoans])

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
          !editLoadedValuesRef.current &&
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

        const { interestOnlyCategory: categoryResult } =
          await ensureInterestOnlyLoanCategory(user.id)

        setInterestOnlyCategory(categoryResult || null)

        // Clicking Edit may have already loaded a category; keep that value
        // but still publish the default category for labels and summaries.
        if (
          !editLoadedValuesRef.current?.categoryLoaded
        ) {
          setCollectionCategoryId(
            categoryResult?.id
              ? String(categoryResult.id)
              : ''
          )

          setCategoryError('')
        }
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
  }, [t])

  // =========================================
  // AUTOMATIC INTEREST CALCULATION
  // =========================================

  useEffect(() => {
    const loaded = editLoadedValuesRef.current

    if (
      loaded &&
      loaded.principal ===
        String(principal) &&
      loaded.interestRate ===
        String(interestRate) &&
      loaded.interestAmount ===
        String(interestAmount)
    ) {
      return
    }

    if (interestAmountEdited.current) {
      const derivedRate =
        rateFromInterestAmount(
          interestAmount,
          principal
        )

      if (derivedRate !== interestRate) {
        setInterestRate(derivedRate)
      }

      return
    }

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
    interestRate,
    interestAmount,
    editLoadVersion
  ])

  // =========================================
  // MONEY FORMAT
  // =========================================

  const formatMoney = (value) => formatMoneyValue(value)

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
  // OPEN / CLOSE FORM
  // =========================================

  useEffect(() => {
    if (customer) {
      setShowForm(true)
    }
  }, [customer])

  const resetForm = () => {
    setEditingFinanceId(null)
    setEditingCustomer(null)
    setCreatedCustomer(null)
    setSelectedExistingCustomer(null)
    setCustomerSelectionCleared(false)
    setCustomerName('')
    setCustomerNameError(false)
    setNewCustomerId(generateCustomerId())
    setNewCustomerName('')
    setNewCustomerPhone('')
    setNewCustomerAddress('')
    setPrincipal('')
    setInterestAmount('')
    setStartDate('')
    // A new loan must not inherit a category from the loan just edited.
    setCollectionCategoryId(
      interestOnlyCategory?.id
        ? String(interestOnlyCategory.id)
        : ''
    )
    interestAmountEdited.current = false
    editLoadedValuesRef.current = null
    loadDefaultInterestAfterClear()
  }

  const openAddInterestOnly = () => {
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

  const editInterestOnly = (loan) => {
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

    const name =
      loan.name || loanCustomer?.full_name || ''

    const derivedInterest =
      Number(loan.principal_amount || 0) > 0 &&
      loan.interest_rate !== null &&
      loan.interest_rate !== undefined
        ? (
            (Number(loan.principal_amount) *
              Number(loan.interest_rate)) /
            100
          ).toFixed(2)
        : ''

    setEditingFinanceId(loan.id)
    setEditingCustomer(loanCustomer)
    setCreatedCustomer(null)
    setSelectedExistingCustomer(null)

    setCustomerName(name)
    setNewCustomerName(name)
    setNewCustomerPhone(loanCustomer?.phone || '')
    setNewCustomerAddress(loanCustomer?.address || '')
    setNewCustomerId(loanCustomer?.customer_id || '')
    setCustomerNameError(false)

    const loadedPrincipal =
      loan.principal_amount ?? loan.amount ?? ''
    const loadedRate = loan.interest_rate ?? ''

    editLoadedValuesRef.current = {
      principal: String(loadedPrincipal),
      interestRate: String(loadedRate),
      interestAmount: String(derivedInterest),
      categoryLoaded: Boolean(loan.collection_category_id)
    }

    setEditLoadVersion((version) => version + 1)
    setPrincipal(loadedPrincipal)
    setInterestRate(loadedRate)
    setInterestAmount(derivedInterest)
    interestAmountEdited.current = false
    setStartDate(
      loan.payment_date || loan.entry_date || ''
    )

    if (loan.collection_category_id) {
      setCollectionCategoryId(
        String(loan.collection_category_id)
      )
    } else if (interestOnlyCategory?.id) {
      // Fall back to the default category instead of keeping a category left
      // in state from a previously edited loan.
      setCollectionCategoryId(
        String(interestOnlyCategory.id)
      )
    }

    setCategoryError('')
    setShowForm(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // =========================================
  // SAVE INTEREST-ONLY FINANCE
  // =========================================

  const saveInterestOnly = async (e) => {
    e.preventDefault()
    if (saving) return

    const isEditing = isEditingLoan

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

    const trimmedCustomerName =
      getTrimmedCustomerName(newCustomerName)

    // =====================================
    // CUSTOMER CHECK
    // =====================================

    if (!activeCustomerDbId && !trimmedCustomerName) {
      setCustomerNameError(true)

      notify(
        t(
          'dailyCustomerNameRequired',
          'Enter the customer name to create an Interest-Only Finance account.'
        )
      )

      return
    }

    if (!activeCustomer && trimmedCustomerName) {
      setCustomerName(trimmedCustomerName)
      setNewCustomerName(trimmedCustomerName)
    }

    if (!activeCustomerDbId && activeCustomer) {
      notify(
        t(
          'customerDatabaseIdMissingFinance',
          'Customer database ID is missing. Please go back to the Customer Profile and open Add Finance again.'
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
      notify(
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
      notify(
        t('enterValidPrincipal')
      )

      return
    }

    // =====================================
    // RATE CHECK
    // =====================================

    if (
      String(interestRate).trim() === '' ||
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      notify(
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
      notify(
        t('enterValidInterestAmount')
      )

      return
    }

    // =====================================
    // START DATE CHECK
    // =====================================

    if (!startDate) {
      notify(
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
      notify(
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
      notify(
        t('pleaseLoginAgain')
      )

      navigate('/')

      return
    }

    try {
      setSaving(true)

      let financeCustomer = activeCustomer
      let financeCustomerDbId = activeCustomerDbId

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

      const editingRecord = isEditing
        ? interestOnlyLoans.find(
            (loan) =>
              String(loan.id) ===
              String(editingFinanceId)
          )
        : null

      const paidSoFar = Number(
        editingRecord?.paid || 0
      )

      const principalPaidSoFar = Number(
        editingRecord?.principal_paid || 0
      )

      const interestPaidSoFar = Number(
        editingRecord?.interest_paid || 0
      )

      // Interest-only accrual is maintained by the payment RPC, so preserve
      // the recorded accrual/due balances when an existing loan is edited.
      const interestAccrualAfter = isEditing
        ? Number(
            editingRecord?.interest_accrual || 0
          )
        : 0

      const interestDueAfter = isEditing
        ? Number(editingRecord?.interest_due || 0)
        : 0

      const principalOutstanding = Math.max(
        p - principalPaidSoFar,
        0
      )

      const pendingAfter = Math.max(
        principalOutstanding + interestDueAfter,
        0
      )

      const recordPayload = {
        // CUSTOMER
        customer_id:
          Number(financeCustomerDbId),

        // CATEGORY
        collection_category_id:
          Number(collectionCategoryId),

        // CUSTOMER NAME
        name:
          financeCustomer?.full_name ||
          trimmedCustomerName ||
          'Customer',

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
          paidSoFar,

        pending:
          pendingAfter,

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

        principal_outstanding:
          principalOutstanding,

        // =================================
        // INTEREST
        // =================================

        interest_rate:
          rate,

        interest_accrual:
          interestAccrualAfter,

        interest_due:
          interestDueAfter,

        interest_paid:
          interestPaidSoFar,

        principal_paid:
          principalPaidSoFar,

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
          'active'
      }

      if (!isEditing) {
        Object.assign(recordPayload, {
          user_id: user.id,
          paid: 0,
          pending: p,
          original_principal: p,
          interest_accrual: 0,
          interest_due: 0,
          interest_paid: 0,
          principal_paid: 0,
          renewal_count: 0
        })
      }

      let financeRecord = null
      let saveError = null

      if (isEditing) {
        const result = await supabase
          .from('finance_records')
          .update(recordPayload)
          .eq('id', editingFinanceId)
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

      if (saveError) {
        console.error(
          'INTEREST ONLY SAVE ERROR:',
          saveError
        )

        notify(
          isEditing
            ? t('unableToSaveInterestOnlyFinance', {
                message: saveError.message
              })
            : t('unableCreateInterestOnlyFinance', {
                message: saveError.message
              })
        )

        return
      }

      if (!financeRecord?.id) {
        notify(
          t(
            'interestOnlyFinanceNotSavedCorrectly',
            'Interest-Only Finance was not saved correctly.'
          )
        )

        return
      }

      if (isEditing) {
        notify(
          t(
            'interestOnlyLoanSavedSuccessfully',
            'Interest-Only Loan {{financeId}} saved successfully',
            {
              financeId:
                editingRecord?.finance_id ||
                `#${editingFinanceId}`
            }
          )
        )

        closeForm()
        await loadInterestOnlyLoans()
        return
      }

      notify(
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

      notify(
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

        if (editLoadedValuesRef.current) {
          return
        }

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

        if (!editLoadedValuesRef.current) {
          setInterestRate('')
        }
      }
    }

  // =========================================
  // BACK
  // =========================================

  const goBack = () => {
    if (activeCustomerDbId) {
      navigate(
        `/customers/${activeCustomerDbId}/finance`,
        {
          state: {
            customer: activeCustomer,
            customerId:
              Number(activeCustomerDbId)
          }
        }
      )

      return
    }

    navigate('/customers')
  }

  // =========================================
  // DERIVED VALUES
  // =========================================

  const summaryTotal = (
    Number(principal || 0) +
    Number(interestAmount || 0)
  ).toFixed(2)

  const selectedCategoryName =
    interestOnlyCategory?.category_name ||
    t('notSelected', 'Not Selected')

  const categoryName = (id) =>
    id &&
    String(id) === String(collectionCategoryId)
      ? selectedCategoryName
      : t('notSelected', 'Not Selected')

  const normalizedListSearch =
    listSearch.trim().toLocaleLowerCase()

  const filteredInterestOnlyLoans =
    interestOnlyLoans.filter((loan) => {
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
            {t('appName')}
          </p>

          <h1>
            {isEditingLoan
              ? `${t('edit', 'Edit')} ${t('interestOnlyLoan', 'Interest-Only Loan')}`
              : t('interestOnlyLoan')}
          </h1>

          <span>
            {activeCustomer
              ? t('createInterestOnlyFinance')
              : t('newCustomerForDailyFinance', 'Enter new customer details')}
          </span>
        </div>

        <button
          type="button"
          className="loan-add-button flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
          onClick={openAddInterestOnly}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>{t('addInterestOnlyFinance', 'Add Interest-Only Finance')}</span>
        </button>

      </div>

      {/* =====================================
          LOAN SUMMARY — ALWAYS VISIBLE
          ===================================== */}

      <div className="daily-loan-summary">

        <h2>
          {t('loanSummary', 'Loan Summary')}
        </h2>

        <div className="daily-summary-grid">

          <div>
            <span>
              {t('principal', 'Principal')}
            </span>

            <strong>
              ₹{formatMoney(principal)}
            </strong>
          </div>

          <div>
            <span>
              {t('interestRate', 'Interest Rate')}
            </span>

            <strong>
              {Number(interestRate || 0)}%
            </strong>
          </div>

          <div>
            <span>
              {t('interestPer30Days', 'Interest per 30 days')}
            </span>

            <strong>
              ₹{formatMoney(interestAmount)}
            </strong>
          </div>

          <div>
            <span>
              {t('totalRepayment', 'Total Repayment')}
            </span>

            <strong>
              ₹{formatMoney(summaryTotal)}
            </strong>
          </div>

          <div>
            <span>
              {t(
                'principalDueAtPayoff',
                'Principal Due At Payoff'
              )}
            </span>

            <strong>
              ₹{formatMoney(principal)}
            </strong>
          </div>

          <div>
            <span>
              {t('startDate', 'Start Date')}
            </span>

            <strong>
              {startDate || '-'}
            </strong>
          </div>

          <div>
            <span>
              {t('nextInterestDue', 'Next Interest Due')}
            </span>

            <strong>
              {startDate
                ? add30Days(startDate)
                : '-'}
            </strong>
          </div>

          <div>
            <span>
              {t('collectionCategory', 'Collection Category')}
            </span>

            <strong>
              {selectedCategoryName}
            </strong>
          </div>

        </div>

      </div>

      {/* FORM */}

      {showForm && (

      <form
        ref={formSectionRef}
        className="daily-loan-form"
        onSubmit={saveInterestOnly}
        noValidate
      >
      {/* =====================================
          CUSTOMER
          ===================================== */}

      <div className="daily-form-section">

        <h2>
          {t('customer')}
        </h2>

        <div className="daily-info-grid">

          {activeCustomer && !editingCustomer ? (
            <>
              <div>

                <span>
                  {t('customerName')}
                </span>

                <strong>{activeCustomer.full_name}</strong>

              </div>

              <div>

                <span>
                  {t('customerId')}
                </span>

                <strong>{activeCustomer.customer_id || '-'}</strong>

              </div>
            </>
          ) : (
            <>
              <div style={{ gridColumn: '1 / -1' }}>
                <CustomerAutocomplete
                  id="interest-only-customer-name"
                  label={`${t('customerName', 'Customer Name')} *`}
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
                          'Enter the customer name to create an Interest-Only Finance account.'
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
                <span>
                  {t('customerId')}
                </span>

                <input value={newCustomerId} readOnly />
              </div>

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
                step="any"
                value={interestRate}
                onChange={(e) => {
                  interestAmountEdited.current = false
                  setInterestRate(e.target.value)
                }}
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
                : isEditingLoan
                  ? t('save', 'Save')
                  : t('createInterestOnlyFinance')
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

          {/* Values are shown in the always-visible Loan Summary above. */}

        </div>

      </form>

      )}

      {/* =================================
          LIVE INTEREST-ONLY LOANS LIST
      ================================= */}

      <div className="loan-list-section">

        <div className="loan-list-header">

          <div>
            <h2>
              {t(
                'liveInterestOnlyLoans',
                'Live Interest-Only Loans'
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
              'searchInterestOnlyLoans',
              'Search customer, ID, phone or finance ID...'
            )}
            aria-label={t(
              'searchInterestOnlyLoans',
              'Search interest-only loans'
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

        ) : filteredInterestOnlyLoans.length === 0 ? (

          <p className="loan-list-message">
            {t(
              'noInterestOnlyLoansFound',
              'No interest-only loans found.'
            )}
          </p>

        ) : (

          <div className="loan-list-table-wrap">

            <table className="loan-list-table">

              <thead>
                <tr>
                  <th>
                    {t('financeId', 'Finance ID')}
                  </th>

                  <th>
                    {t('customerName', 'Customer Name')}
                  </th>

                  <th>
                    {t('customerId', 'Customer ID')}
                  </th>

                  <th>
                    {t('phone', 'Phone')}
                  </th>

                  <th>
                    {t('principal', 'Principal')}
                  </th>

                  <th>
                    {t('interestRate', 'Interest Rate')}
                  </th>

                  <th>
                    {t('interest', 'Interest')}
                  </th>

                  <th>
                    {t('totalRepayment', 'Total Repayment')}
                  </th>

                  <th>
                    {t('startDate', 'Start Date')}
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
                    {t('pending', 'Pending')}
                  </th>

                  <th>
                    {t('status', 'Status')}
                  </th>

                  <th>
                    {t('edit', 'Edit')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredInterestOnlyLoans.map(
                  (loan) => (
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
                          ?.customer_id || '-'}
                      </td>

                      <td>
                        {loan.customer?.phone || '-'}
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
                          loan.interest_accrual
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(loan.amount)}
                      </td>

                      <td>
                        {loan.payment_date ||
                          loan.entry_date ||
                          '-'}
                      </td>

                      <td>
                        {categoryName(
                          loan.collection_category_id
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(loan.paid)}
                      </td>

                      <td>
                        ₹{formatMoney(
                          loan.pending
                        )}
                      </td>

                      <td>
                        {loan.loan_status || '-'}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="loan-list-edit-button"
                          onClick={() =>
                            editInterestOnly(
                              loan
                            )
                          }
                        >
                          {t('edit', 'Edit')}
                        </button>
                      </td>

                    </tr>
                  )
                )}
              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

export default InterestOnly