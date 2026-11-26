import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn(),
      subscribe: vi.fn()
    })),
    removeChannel: vi.fn()
  }
}))

vi.mock('../services/workspaces', () => ({
  getCurrentWorkspaceId: vi.fn(async () => 'workspace-1')
}))

import { supabase } from '../services/supabase'
import {
  loadDashboardMetrics,
  subscribeDashboardMetrics
} from '../services/dashboardMetrics'

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    gt: vi.fn(() => query),
    gte: vi.fn(() => query),
    neq: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }

  return query
}

describe('dashboard metric queries', () => {
  let tableQueries

  beforeEach(() => {
    vi.clearAllMocks()

    tableQueries = {
      finance_records: [
        createQuery({ count: 39, error: null }),
        createQuery({ count: 38, error: null })
      ],
      finance_payments: [createQuery({ count: 2, error: null })],
      customers: [createQuery({ count: 22, error: null })],
      agents: [createQuery({ count: 5, error: null })]
    }

    supabase.from.mockImplementation((table) => tableQueries[table].shift())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads counts that match the destination pages', async () => {
    const metrics = await loadDashboardMetrics()

    expect(metrics).toEqual({
      financeAccounts: 39,
      pendingAccounts: 38,
      paymentsToday: 2,
      customersCount: 22,
      agentsCount: 5
    })

    const [financeQuery, pendingQuery] = supabase.from.mock.results
      .filter((result) => result.value?.gt)
      .map((result) => result.value)

    expect(financeQuery.select).toHaveBeenCalledWith(
      'id',
      { count: 'exact', head: true }
    )
    expect(financeQuery.gt).not.toHaveBeenCalled()
    expect(pendingQuery.gt).toHaveBeenCalledWith('pending', 0)
    expect(pendingQuery.neq).toHaveBeenCalledWith(
      'loan_status',
      'closed'
    )

    const paymentQuery = supabase.from.mock.results
      .map((result) => result.value)
      .find((query) => query?.eq?.mock?.calls?.length)

    expect(paymentQuery.eq).toHaveBeenCalledWith(
      'payment_date',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    )
    expect(paymentQuery.gte).not.toHaveBeenCalled()
  })

  it('keeps usable counts when one query fails', async () => {
    tableQueries.customers = [
      createQuery({ count: null, error: new Error('customers unavailable') })
    ]

    const metrics = await loadDashboardMetrics()

    expect(metrics).toEqual({
      financeAccounts: 39,
      pendingAccounts: 38,
      paymentsToday: 2,
      agentsCount: 5
    })
  })

  it('refreshes the counts when a watched table changes', async () => {
    vi.useFakeTimers()

    const unsubscribe = subscribeDashboardMetrics(vi.fn())
    await Promise.resolve()
    await Promise.resolve()

    const channel = supabase.channel.mock.results[0].value
    expect(channel.on).toHaveBeenCalledTimes(2)
    expect(channel.on.mock.calls[0][1]).toMatchObject({
      table: 'finance_records',
      filter: 'workspace_id=eq.workspace-1'
    })

    supabase.from.mockClear()
    channel.on.mock.calls[0][2]()

    await vi.advanceTimersByTimeAsync(150)

    expect(supabase.from).toHaveBeenCalledWith('finance_records')
    unsubscribe()
  })
})
