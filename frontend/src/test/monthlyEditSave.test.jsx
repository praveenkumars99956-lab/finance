import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  t: (key, fallback) => fallback || key,
  i18n: { resolvedLanguage: 'en' },
  latestUpdate: null,
  orFilters: [],
  loans: [],
  customers: [],
  payments: [],
  paymentsAfterReload: [],
  paymentCheckCalls: 0,
  paymentError: null,
  freshRecord: null,
  freshRecordAfterReload: null,
  freshRecordCalls: 0,
  createQuery(table) {
    const state = { mode: 'list', columns: '' }
    const query = {}

    query.select = (columns) => {
      state.columns = String(columns || '')
      if (state.mode !== 'update') {
        state.mode = state.columns.includes('finance_id') ? 'fresh' : 'list'
      }
      return query
    }
    query.eq = () => query
    query.or = (filter) => {
      h.orFilters.push(filter)
      return query
    }
    query.insert = () => query
    query.update = (payload) => {
      state.mode = 'update'
      h.latestUpdate = payload
      return query
    }
    query.maybeSingle = () =>
      Promise.resolve({
        data: { default_interest_rate: '2' },
        error: null
      })
    query.single = () => {
      if (state.mode === 'update') {
        return Promise.resolve({ data: { id: 'loan-1' }, error: null })
      }
      if (state.mode === 'fresh') {
        h.freshRecordCalls += 1
        const record =
          h.freshRecordCalls >= 2 && h.freshRecordAfterReload
            ? h.freshRecordAfterReload
            : h.freshRecord

        return Promise.resolve({ data: record, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    query.in = () =>
      Promise.resolve({ data: h.customers, error: null })
    query.limit = () => {
      if (table === 'finance_payments') {
        return Promise.resolve({
          data: h.payments,
          error: h.paymentError
        })
      }
      return query
    }
    query.order = () => {
      if (table === 'finance_records' && state.mode === 'list') {
        return Promise.resolve({ data: h.loans, error: null })
      }
      if (table === 'customers') {
        return Promise.resolve({ data: h.customers, error: null })
      }
      return query
    }

    return query
  }
}))

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn((table) => h.createQuery(table)),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: 'u1' } }, error: null })
      )
    },
    rpc: vi.fn((name) => {
      if (name === 'finance_has_posted_payments') {
        // Edit open -> submit check -> post-save reload check.
        const call = h.paymentCheckCalls += 1
        const posted =
          call >= 3 && h.paymentsAfterReload.length
            ? true
            : h.payments.length > 0

        return Promise.resolve({
          data: posted,
          error: h.paymentError
        })
      }

      return Promise.resolve({ data: null, error: null })
    })
  }
}))

vi.mock('../services/workspaces', () => ({
  getCurrentWorkspaceId: vi.fn(() => Promise.resolve(null))
}))

vi.mock('../services/collectionCategories', () => ({
  ensureMonthlyLoanCategory: vi.fn(() =>
    Promise.resolve({
      categories: [
        {
          id: 'cat-1',
          category_name: 'Monthly Category',
          category_type: 'monthly'
        }
      ],
      monthlyCategory: { id: 'cat-1' }
    })
  )
}))

vi.mock('../components/SelectMenu', () => ({
  default: ({ value, onChange, options = [], ariaLabel, placeholder }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onChange(options[0]?.value)}
    >
      {value || placeholder}
    </button>
  )
}))

vi.mock('../components/CustomerAutocomplete', () => ({
  default: ({ value, onChange, label }) => (
    <input
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  getTrimmedCustomerName: (value) => String(value || '').trim()
}))

vi.mock('../hooks/useMobileFormReveal', () => ({
  useMobileFormReveal: () => () => {}
}))

vi.mock('../utils/notify', () => ({ notify: vi.fn() }))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: h.t,
    i18n: h.i18n
  })
}))

import Monthly from '../pages/client/Monthly'
import { notify } from '../utils/notify'
import { supabase } from '../services/supabase'

describe('Monthly live list edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    h.customers = [
      {
        id: 1,
        customer_id: 'CUST-1',
        full_name: 'Asha',
        phone: '9876543210',
        address: ''
      }
    ]
    h.freshRecord = {
      id: 'loan-1',
      finance_id: 'MF-1',
      paid: '0.00',
      principal_paid: '0.0',
      interest_paid: null
    }
    h.loans = [
      {
        id: 'loan-1',
        finance_id: 'MF-1',
        customer_id: 1,
        collection_category_id: 'cat-1',
        collection_month: 'January',
        name: 'Asha',
        finance_type: 'monthly',
        period: '12 Months',
        payment_date: '2026-01-01',
        entry_date: '2026-01-01',
        ending_date: '2026-12-01',
        principal_amount: 50000,
        interest_rate: 2,
        interest_accrual: 12000,
        interest_due: 12000,
        amount: 62000,
        paid: 0,
        principal_paid: 0,
        interest_paid: 0,
        pending: 62000,
        loan_status: 'active'
      }
    ]
    h.latestUpdate = null
    h.orFilters = []
    h.payments = []
    h.paymentsAfterReload = []
    h.paymentCheckCalls = 0
    h.freshRecordAfterReload = null
    h.freshRecordCalls = 0
    h.paymentError = null

    vi.stubGlobal('scrollTo', vi.fn())
  })

  async function openEditForm() {
    render(<Monthly />)

    expect(await screen.findByText('Asha')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('50000')).toBeInTheDocument()
    })
  }

  function getMoneyCell(text) {
    return screen.getByText(
      (_, element) =>
        element?.tagName === 'TD' &&
        element.textContent === text
    )
  }

  it('updates the edited record and rebuilds its schedule', async () => {
    render(<Monthly />)

    expect(await screen.findByText('Asha')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('50000')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('50000'), {
      target: { value: '60000' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({
        customer_id: 1,
        principal_amount: 60000
      })
    })

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('reset_monthly_schedule', {
        p_finance_record_id: 'loan-1'
      })
    })

    // Balance predicates in the UPDATE filter made ordinary edits affect zero
    // rows whenever PostgREST formatted a numeric differently. The fresh read
    // is the conflict snapshot, so the UPDATE must be by id only.
    expect(h.orFilters).toEqual([])

    // The live list must reflect the saved edit even though the mock reload
    // still returns the stale row.
    await waitFor(() => {
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName === 'TD' &&
            element.textContent === '₹60,000.00'
        )
      ).toBeInTheDocument()
    })
  })

  it('keeps a newer upfront amount on a detail-only edit', async () => {
    h.freshRecord = {
      ...h.freshRecord,
      paid: '500.00',
      principal_paid: '500.0',
      interest_paid: '0.00'
    }

    await openEditForm()

    fireEvent.change(screen.getByDisplayValue('50000'), {
      target: { value: '60000' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({
        principal_amount: 60000
      })
    })

    expect(h.latestUpdate).not.toHaveProperty('paid')
    expect(h.latestUpdate).not.toHaveProperty('principal_paid')
    expect(h.latestUpdate).not.toHaveProperty('interest_paid')
  })

  it('rejects an explicit paid change when the amount changed elsewhere', async () => {
    h.freshRecord = {
      ...h.freshRecord,
      paid: '500.00',
      principal_paid: '500.0',
      interest_paid: '0.00'
    }

    await openEditForm()

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Already Paid' }),
      { target: { value: '1500' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        'collectionFinanceChanged'
      )
    })

    expect(h.latestUpdate).toBeNull()
  })

  it('persists an edited Already Paid when no collections are posted', async () => {
    await openEditForm()

    const paidInput = screen.getByRole('spinbutton', {
      name: 'Already Paid'
    })

    expect(paidInput).not.toHaveAttribute('readonly')

    fireEvent.change(paidInput, {
      target: { value: '1500' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({
        paid: 1500,
        principal_paid: 1500,
        interest_paid: 0,
        pending: 60500
      })
    })

    expect(supabase.rpc).toHaveBeenCalledWith(
      'reset_monthly_schedule',
      { p_finance_record_id: 'loan-1' }
    )

    await waitFor(() => {
      expect(getMoneyCell('₹1,500.00')).toBeInTheDocument()
    })
  })

  it('locks Already Paid after collections are posted', async () => {
    h.payments = [{ id: 'pay-1' }]
    h.freshRecord = {
      ...h.freshRecord,
      paid: '2500.00',
      principal_paid: '2500.0',
      interest_paid: '0.00'
    }
    h.loans = [
      {
        ...h.loans[0],
        paid: 2500,
        principal_paid: 2500,
        interest_paid: 0,
        pending: 59500
      }
    ]

    await openEditForm()

    const paidInput = screen.getByRole('spinbutton', {
      name: 'Already Paid'
    })

    await waitFor(() => {
      expect(paidInput).toHaveAttribute('readonly')
    })
    expect(paidInput.value).toBe('2500')

    fireEvent.change(paidInput, {
      target: { value: '9999' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toBeTruthy()
    })

    expect(h.latestUpdate).not.toHaveProperty('paid')
    expect(h.latestUpdate).not.toHaveProperty('principal_paid')
    expect(h.latestUpdate).not.toHaveProperty('interest_paid')
    expect(notify).toHaveBeenCalledWith(
      'Already Paid cannot be changed after collections are posted.'
    )
    expect(supabase.rpc).toHaveBeenCalledWith(
      'finance_has_posted_payments',
      { p_finance_record_id: 'loan-1' }
    )
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'reset_monthly_schedule',
      { p_finance_record_id: 'loan-1' }
    )
  })

  it('keeps a newer posted payment from being overwritten while staging the edit', async () => {
    await openEditForm()

    const paidInput = screen.getByRole('spinbutton', {
      name: 'Already Paid'
    })

    fireEvent.change(paidInput, {
      target: { value: '1500' }
    })

    // The payment commits after the guarded update succeeds but before the
    // reload's authoritative payment check.
    h.paymentsAfterReload = [{ id: 'pay-after-save' }]
    h.freshRecordAfterReload = {
      ...h.freshRecord,
      paid: '2500.00',
      principal_paid: '2500.0',
      interest_paid: '0.00'
    }
    h.loans = [
      {
        ...h.loans[0],
        paid: 2500,
        principal_paid: 2500,
        interest_paid: 0,
        pending: 59500,
        loan_status: 'active'
      }
    ]

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({ paid: 1500 })
    })

    await waitFor(() => {
      expect(getMoneyCell('₹2,500.00')).toBeInTheDocument()
    })
    expect(
      screen.queryByText(
        (_, element) =>
          element?.tagName === 'TD' &&
          element.textContent === '₹1,500.00'
      )
    ).not.toBeInTheDocument()
  })

  it('preserves stored lifecycle fields on a detail edit', async () => {
    // A posted collection skips the schedule rebuild, so the stored due date
    // and status must survive the edit.
    h.payments = [{ id: 'pay-1' }]
    h.freshRecord = {
      ...h.freshRecord,
      paid: '2500.00',
      principal_paid: '2500.0',
      interest_paid: '0.00',
      loan_status: 'settled',
      next_due_date: '2026-06-01'
    }

    await openEditForm()

    fireEvent.change(screen.getByDisplayValue('50000'), {
      target: { value: '60000' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({
        principal_amount: 60000,
        loan_status: 'settled',
        next_due_date: '2026-06-01'
      })
    })
  })

  it('aborts the save when the payment check fails', async () => {
    h.paymentError = { message: 'rpc down' }

    await openEditForm()

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Already Paid' }),
      { target: { value: '1500' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        'Payment status could not be checked. Save was not completed. Please try again.'
      )
    })

    expect(h.latestUpdate).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Already Paid' }).value
    ).toBe('1500')
  })

  it('rejects a retained upfront amount after the total is reduced', async () => {
    h.freshRecord = {
      ...h.freshRecord,
      paid: '800.00',
      principal_paid: '800.0',
      interest_paid: '0.00'
    }
    h.loans = [
      {
        ...h.loans[0],
        paid: 800,
        principal_paid: 800,
        interest_paid: 0,
        pending: 61200
      }
    ]

    await openEditForm()

    fireEvent.change(screen.getByDisplayValue('50000'), {
      target: { value: '600' }
    })
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Interest Amount' }),
      { target: { value: '0' } }
    )

    await waitFor(() => {
      expect(
        screen.getAllByText('₹600.00').length
      ).toBeGreaterThan(0)
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        'Already Paid must be less than Total Repayment'
      )
    })

    expect(h.latestUpdate).toBeNull()
  })

  it('keeps a posted payment committed before the reload', async () => {
    h.freshRecord = {
      ...h.freshRecord,
      paid: '800.00',
      principal_paid: '800.0',
      interest_paid: '0.00'
    }
    h.loans = [
      {
        ...h.loans[0],
        paid: 800,
        principal_paid: 800,
        interest_paid: 0,
        pending: 61200
      }
    ]

    await openEditForm()

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Already Paid' }),
      { target: { value: '0' } }
    )
    h.paymentsAfterReload = [{ id: 'pay-before-reload' }]
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({ paid: 0 })
    })

    // The list reload still reports ₹800 after the edit saved ₹0. The newer
    // posted total must win on screen even though it matches the pre-edit row.
    await waitFor(() => {
      expect(getMoneyCell('₹800.00')).toBeInTheDocument()
    })
    expect(
      screen.queryByText(
        (_, element) =>
          element?.tagName === 'TD' &&
          element.textContent === '₹0.00'
      )
    ).not.toBeInTheDocument()
  })

  it('prefers the refreshed customer after a successful reload', async () => {
    await openEditForm()

    h.customers = [
      {
        id: 2,
        customer_id: 'CUST-2',
        full_name: 'New Owner',
        phone: '9876543211',
        address: ''
      }
    ]
    h.loans = [
      { ...h.loans[0], customer_id: 2, name: 'New Owner' }
    ]

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Monthly Finance' })
    )

    await waitFor(() => {
      expect(h.latestUpdate).toMatchObject({ customer_id: 1 })
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName === 'TD' &&
            element.textContent === 'New Owner'
        )
      ).toBeInTheDocument()
    })

    expect(screen.queryByText('Asha')).not.toBeInTheDocument()
  })
})
