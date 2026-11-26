import { formatMoney as formatMoneyValue } from '../../utils/money'
import { notify } from '../../utils/notify'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useLocation,
  useNavigate
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { useMobileFormReveal } from '../../hooks/useMobileFormReveal'
import { isValidPhone, normalizePhone } from '../../utils/phone'
import { isMissingCategoryTypeColumnError } from '../../utils/categoryType'
import { generateCustomerId } from '../../utils/customerId'
import {
  normalizeInterestInput,
  rateFromInterestAmount
} from '../../utils/interestRate'
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

  // Editing a row in the live list overrides the customer linked from the
  // customer profile so the whole loan can be changed from this page.
  const [editingFinanceId, setEditingFinanceId] =
    useState(null)

  const [editingCustomer, setEditingCustomer] =
    useState(null)

  // Refs guard effects while a loaded loan is being placed into the form.
  const editingFinanceIdRef = useRef(null)
  const skipLoadedValueEffects = useRef(false)

  // Bumping this on every Edit guarantees the one-shot guard is cleared even
  // when the same row is clicked again and no other state actually changes.
  const [editLoadVersion, setEditLoadVersion] = useState(0)

  // While editing a list row, the navigation customer must not take
  // precedence over a customer chosen in this form.
  const activeCustomer = editingFinanceId
    ? editingCustomer ||
      createdCustomer ||
      selectedExistingCustomer
    : editingCustomer ||
      customer ||
      createdCustomer ||
      selectedExistingCustomer

  const activeCustomerDbId =
    editingCustomer?.id ??
    (!editingFinanceId
      ? location.state?.customerId
      : null) ??
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

    // A typed or re-selected customer replaces the one loaded with the loan.
    // Otherwise the save would keep writing the original customer.
    if (
      name.trim().toLocaleLowerCase() !==
      String(editingCustomer?.full_name || '')
        .trim()
        .toLocaleLowerCase()
    ) {
      setEditingCustomer(null)
    }

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

    setEditingCustomer(null)
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

  // Tracks which field the user last edited. While Interest Amount is being
  // typed, the rate follows it; otherwise the rate drives the interest.
  const interestAmountEdited = useRef(false)

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

  // The header button opens the form, matching the Agents and Customers pages.
  // When this page is opened from a customer profile, the form is already needed.
  const [showForm, setShowForm] =
    useState(Boolean(customer))
  const formSectionRef = useRef(null)
  const revealForm = useMobileFormReveal(
    showForm,
    formSectionRef
  )

  // =========================================
  // LIVE DAILY LOANS LIST
  // =========================================

  const [dailyLoans, setDailyLoans] =
    useState([])

  const [listLoading, setListLoading] =
    useState(true)

  const [listError, setListError] =
    useState('')

  const [listSearch, setListSearch] =
    useState('')

  const realtimeTimer = useRef(null)
  const loadRequestRef = useRef(0)

  const loadDailyLoans = useCallback(async () => {
    const requestId = ++loadRequestRef.current

    try {
      setListLoading(true)

      const {
        data: loans,
        error: loansError
      } = await supabase
        .from('finance_records')
        .select('*')
        .eq('finance_type', 'daily')
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
            'Daily loan customers error:',
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

      // A newer refresh may have finished while this request was in flight.
      if (requestId === loadRequestRef.current) {
        setDailyLoans(
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
        'Daily loans load error:',
        error
      )

      setListError(
        error?.message ||
          t(
            'unableToLoadDailyLoans',
            'Unable to load daily loans.'
          )
      )
    } finally {
      if (requestId === loadRequestRef.current) {
        setListLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    loadDailyLoans()

    let disposed = false
    let channel = null

    getCurrentWorkspaceId()
      .then((workspaceId) => {
        if (!workspaceId || disposed) return

        channel = supabase
          .channel(`daily-loans:${workspaceId}`)
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
                    loadDailyLoans()
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
      if (
        document.visibilityState === 'visible'
      ) {
        loadDailyLoans()
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
  }, [loadDailyLoans])

  // =========================================
  // OPEN / CLOSE FORM
  // =========================================

  useEffect(() => {
    if (customer) {
      setShowForm(true)
    }
  }, [customer])

  const resetForm = () => {
    editingFinanceIdRef.current = null
    skipLoadedValueEffects.current = false
    setEditingFinanceId(null)
    setEditingCustomer(null)
    setCreatedCustomer(null)
    setSelectedExistingCustomer(null)
    setCustomerName('')
    setCustomerNameError(false)
    setNewCustomerId(generateCustomerId())
    setNewCustomerName('')
    setNewCustomerPhone('')
    setNewCustomerAddress('')
    setPrincipal('')
    setInterestRate('')
    setInterestAmount('')
    setTotalAmount('')
    setStartDate('')
    setNumberOfDays('')
    setEndingDate('')
    setDailyAmount('')
    setCollectionCategoryId('')
    setCategoryError(false)
    interestAmountEdited.current = false
  }

  const openAddDaily = () => {
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

  const editDailyLoan = (loan) => {
    editingFinanceIdRef.current = loan.id
    skipLoadedValueEffects.current = true
    setEditLoadVersion((version) => version + 1)

    const days = parseInt(
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

    setEditingFinanceId(loan.id)
    setEditingCustomer(loanCustomer)
    setCreatedCustomer(null)
    setSelectedExistingCustomer(null)

    setCustomerName(
      loan.name || loanCustomer?.full_name || ''
    )
    setNewCustomerName(
      loan.name || loanCustomer?.full_name || ''
    )
    setNewCustomerPhone(normalizePhone(loanCustomer?.phone))
    setNewCustomerAddress(loanCustomer?.address || '')
    setNewCustomerId(loanCustomer?.customer_id || '')
    setCustomerNameError(false)

    setPrincipal(loan.principal_amount ?? '')
    setInterestRate(loan.interest_rate ?? '')
    setInterestAmount(
      loan.interest_accrual ?? loan.interest_due ?? ''
    )
    interestAmountEdited.current = false
    setTotalAmount(loan.amount ?? '')
    setStartDate(
      loan.payment_date || loan.entry_date || ''
    )
    setNumberOfDays(
      Number.isFinite(days) ? String(days) : ''
    )
    setEndingDate(loan.ending_date || '')
    setDailyAmount(
      loan.amount && days
        ? (
            Number(loan.amount) / Number(days)
          ).toFixed(2)
        : ''
    )
    setCollectionCategoryId(
      loan.collection_category_id || ''
    )
    setCategoryError(false)
    setShowForm(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

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
            undefined &&
          editingFinanceIdRef.current === null
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

        let result = await supabase
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
          .eq(
            'category_type',
            'daily'
          )
          .order(
            'category_name'
          )

        // Until the category_type migration is applied, keep Daily entry
        // working with every active category instead of an empty list.
        if (isMissingCategoryTypeColumnError(result.error)) {
          result = await supabase
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
        }

        const {
          data,
          error
        } = result

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
    if (skipLoadedValueEffects.current) {
      return
    }

    const p =
      Number(principal || 0)

    const rate =
      Number(interestRate || 0)

    const days =
      Number(numberOfDays || 0)

    const interest =
      interestAmountEdited.current
        ? Number(interestAmount || 0)
        : (p * rate) / 100

    if (interestAmountEdited.current) {
      const derivedRate =
        rateFromInterestAmount(
          interestAmount,
          principal
        )

      if (derivedRate !== interestRate) {
        setInterestRate(derivedRate)
      }
    } else {
      setInterestAmount(
        interest > 0
          ? interest.toFixed(2)
          : ''
      )
    }

    const total =
      p + interest

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
    interestAmount,
    numberOfDays
  ])

  // =========================================
  // CALCULATE END DATE
  // =========================================

  useEffect(() => {
    if (skipLoadedValueEffects.current) {
      return
    }

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

  // Clear the one-shot guard after the edit render's derived-value effects
  // have run so later user changes recalculate normally.
  useEffect(() => {
    skipLoadedValueEffects.current = false
  }, [editLoadVersion])

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

      if (!activeCustomer && !isValidPhone(newCustomerPhone)) {
        notify(t('agentPhoneMustBeTenDigits'))
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
        String(interestRate).trim() === '' ||
        !Number.isFinite(rate) ||
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
                phone: newCustomerPhone,
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

        const isEditing =
          Boolean(editingFinanceId)

        const editingRecord = isEditing
          ? dailyLoans.find(
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

        console.log(
          isEditing
            ? 'Updating Daily Finance'
            : 'Creating Daily Finance',
          'Customer DB ID:',
          financeCustomerDbId
        )

        // =====================================
        // CREATE / UPDATE FINANCE RECORD
        // =====================================

        const recordPayload = {
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

          pending:
            Math.max(
              total - paidSoFar,
              0
            ),

          calculation_mode:
            'automatic',

          principal_amount:
            p,

          principal_outstanding:
            Math.max(
              p - principalPaidSoFar,
              0
            ),

          interest_rate:
            rate,

          interest_accrual:
            interest,

          interest_due:
            Math.max(
              interest - interestPaidSoFar,
              0
            ),

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
            'active'
        }

        if (!isEditing) {
          Object.assign(
            recordPayload,
            {
              user_id: user.id,
              paid: 0,
              original_principal: p,
              interest_paid: 0,
              principal_paid: 0,
              renewal_count: 0
            }
          )
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

        // =====================================
        // FINANCE SAVE ERROR
        // =====================================

        if (saveError) {
          console.error(
            'Daily finance save error:',
            saveError
          )

          notify(
            `${t(
              'unableToSaveDailyLoan',
              'Unable to save Daily Loan'
            )}: ${saveError.message}${
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
          'Daily finance saved:',
          financeRecord.id
        )

        // For an edited loan, keep the existing schedule when payments have
        // been recorded; only rebuild it when there are no payments to lose.
        let shouldGenerateSchedule = true

        if (isEditing) {
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
              'Daily payment check error:',
              paymentCheckError
            )

            shouldGenerateSchedule = false
          } else if (
            existingPayments?.length > 0
          ) {
            shouldGenerateSchedule = false
          } else {
            const {
              error: scheduleDeleteError
            } = await supabase
              .from('repayment_schedule')
              .delete()
              .eq(
                'finance_record_id',
                editingFinanceId
              )

            if (scheduleDeleteError) {
              console.error(
                'Daily schedule reset error:',
                scheduleDeleteError
              )

              shouldGenerateSchedule =
                false
            }
          }
        }

        // =====================================
        // GENERATE DAILY REPAYMENT SCHEDULE
        // =====================================

        if (shouldGenerateSchedule) {
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

            if (isEditing) {
              closeForm()
              await loadDailyLoans()
              return
            }

            navigate(
              `/customers/${financeCustomerDbId}`
            )

            return
          }
        }

        // =====================================
        // SUCCESS
        // =====================================

        if (isEditing) {
          notify(
            t(
              'dailyLoanSavedSuccessfully',
              'Daily Loan {{financeId}} saved successfully',
              {
                financeId:
                  editingRecord?.finance_id ||
                  `#${editingFinanceId}`
              }
            )
          )

          closeForm()
          await loadDailyLoans()
          return
        }

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

  const categoryName = (id) =>
    categories.find(
      (category) =>
        String(category.id) === String(id)
    )?.category_name ||
    t('notSelected', 'Not Selected')

  const loanDays = (loan) =>
    parseInt(
      String(loan.period || '').split(' ')[0],
      10
    ) || 0

  const normalizedListSearch =
    listSearch.trim().toLocaleLowerCase()

  const filteredDailyLoans =
    dailyLoans.filter((loan) => {
      if (!normalizedListSearch) return true

      return [
        loan.finance_id,
        loan.id,
        loan.name,
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

        <div>

          <p>
            {t(
              'dailyFinance',
              'DAILY FINANCE'
            )}
          </p>

          <h1>
            {editingFinanceId
              ? `${t(
                  'edit',
                  'Edit'
                )} ${t(
                  'dailyLoan',
                  'Daily Loan'
                )}`
              : t(
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

        <button
          type="button"
          className="daily-add-button flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
          onClick={openAddDaily}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>{t('addDailyFinance', 'Add Daily Finance')}</span>
        </button>

      </div>

      {/* =================================
          LOAN SUMMARY — ALWAYS VISIBLE
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

      {/* FORM */}

      {showForm && (

      <form
        ref={formSectionRef}
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

            {customer && !editingCustomer ? (
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
                      setNewCustomerPhone(normalizePhone(event.target.value))
                    }
                    maxLength={10}
                    inputMode="numeric"
                    placeholder={t('tenDigitPhoneNumber')}
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
                onChange={(e) => {
                  interestAmountEdited.current = false
                  setInterestRate(e.target.value)
                }}
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

          <button
            type="button"
            className="back-button daily-cancel-button"
            onClick={closeForm}
            disabled={saving}
          >
            {t('cancel', 'Cancel')}
          </button>

        </div>

      </form>

      )}

      {/* =================================
          LIVE DAILY LOANS LIST
      ================================= */}

      <div className="daily-loan-list-section">

        <div className="daily-loan-list-header">

          <div>
            <h2>
              {t(
                'liveDailyLoans',
                'Live Daily Loans'
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
              'searchDailyLoans',
              'Search customer, ID, phone or finance ID...'
            )}
            aria-label={t(
              'searchDailyLoans',
              'Search daily loans'
            )}
          />

        </div>

        {listLoading ? (

          <p className="daily-list-message">
            {t('loading', 'Loading...')}
          </p>

        ) : listError ? (

          <p className="daily-list-error">
            {listError}
          </p>

        ) : filteredDailyLoans.length === 0 ? (

          <p className="daily-list-message">
            {t(
              'noDailyLoansFound',
              'No daily loans found.'
            )}
          </p>

        ) : (

          <div className="daily-list-table-wrap">

            <table className="daily-list-table">

              <thead>
                <tr>
                  <th>
                    {t('financeId', 'Finance ID')}
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
                      'dailyCollection',
                      'Daily Collection'
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
                      'numberOfDays',
                      'Number of Days'
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
                {filteredDailyLoans.map(
                  (loan) => {
                    const days =
                      loanDays(loan)

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
                            loan.interest_accrual
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            loan.amount
                          )}
                        </td>

                        <td>
                          ₹{formatMoney(
                            days
                              ? Number(
                                  loan.amount || 0
                                ) / days
                              : 0
                          )}
                        </td>

                        <td>
                          {loan.payment_date ||
                            loan.entry_date ||
                            '-'}
                        </td>

                        <td>
                          {days || '-'}
                        </td>

                        <td>
                          {loan.ending_date || '-'}
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
                          {loan.loan_status ||
                            '-'}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="daily-list-edit-button"
                            onClick={() =>
                              editDailyLoan(
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

export default Daily