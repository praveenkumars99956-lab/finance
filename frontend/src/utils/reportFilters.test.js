import { describe, expect, it } from 'vitest'
import {
  buildReportSearchText,
  countOverdueRecords,
  getLoanStatus,
  isDateOverdue,
  matchesCollectionReport,
  matchesReportFilter,
  toDateKey
} from './reportFilters'

const now = new Date('2026-01-20T12:00:00')

describe('report date filtering', () => {
  it('reads the date part from date and timestamp values', () => {
    expect(toDateKey('2026-01-15')).toBe('2026-01-15')
    expect(toDateKey('2026-01-15T00:00:00.000Z')).toBe('2026-01-15')
    expect(toDateKey(null)).toBe('')
  })

  it('detects overdue dates even when stored with a time', () => {
    expect(isDateOverdue('2026-01-19T00:00:00.000Z', now)).toBe(true)
    expect(isDateOverdue('2026-01-20', now)).toBe(false)
    expect(isDateOverdue('not-a-date', now)).toBe(false)
  })
})

describe('report status and type filters', () => {
  const record = {
    finance_type: 'daily',
    pending: 500,
    next_due_date: '2026-01-19'
  }

  it('uses the same status for the filter and the status column', () => {
    expect(getLoanStatus(record, now)).toBe('overdue')
    expect(matchesReportFilter(record, 'overdue', now)).toBe(true)
    expect(matchesReportFilter(record, 'pending', now)).toBe(false)
    expect(matchesReportFilter({ ...record, pending: 0 }, 'paid', now)).toBe(true)
    expect(
      matchesReportFilter({ ...record, next_due_date: '2026-02-01' }, 'pending', now)
    ).toBe(true)
  })

  it('matches legacy loan type labels', () => {
    expect(matchesReportFilter({ finance_type: 'Daily Loan' }, 'daily')).toBe(true)
    expect(matchesReportFilter({ finance_type: 'interest-only' }, 'interest_only')).toBe(true)
    expect(matchesReportFilter({ finance_type: 'interestonly' }, 'interest_only')).toBe(true)
    expect(matchesReportFilter({ finance_type: 'monthly' }, 'weekly')).toBe(false)
    expect(matchesReportFilter(record, 'all')).toBe(true)
  })

  it('counts overdue records with the same status used by the table', () => {
    const paidWithStaleDueDate = {
      pending: 0,
      next_due_date: '2026-01-19'
    }

    expect(getLoanStatus(paidWithStaleDueDate, now)).toBe('paid')
    expect(
      countOverdueRecords([record, paidWithStaleDueDate], now)
    ).toBe(1)
  })
})

describe('report search filtering', () => {
  it('searches phone, customer id, raw type and translated labels', () => {
    const record = {
      customers: {
        full_name: 'Ravi Kumar',
        customer_id: 'CUST-1',
        phone: '9876543210'
      },
      finance_type: 'daily',
      collection_categories: { category_name: 'City Collect' }
    }

    const text = buildReportSearchText(record, ['Daily Loan'])

    expect(text).toContain('9876543210')
    expect(text).toContain('cust-1')
    expect(text).toContain('daily')
    expect(text).toContain('daily loan')
    expect(text).toContain('city collect')
  })
})

describe('collection report filters', () => {
  const record = {
    customerName: 'Ravi Kumar',
    customerId: 'CUST-1',
    phone: '9876543210',
    agentName: 'Agent One',
    agentCode: 'AG-1',
    category: 'City Collect',
    financeType: 'Daily Loan',
    paymentDate: '2026-01-15T10:30:00.000Z',
    paymentAmount: 250,
    balanceBefore: 1000,
    balanceAfter: 750
  }

  it('includes payments on the selected To date even with timestamps', () => {
    expect(
      matchesCollectionReport(record, {
        fromDate: '2026-01-15',
        toDate: '2026-01-15'
      })
    ).toBe(true)

    expect(
      matchesCollectionReport(record, { toDate: '2026-01-14' })
    ).toBe(false)
  })

  it('applies type and text filters together', () => {
    expect(
      matchesCollectionReport(record, {
        typeFilter: 'daily',
        search: 'agent one'
      })
    ).toBe(true)

    expect(
      matchesCollectionReport(record, {
        typeFilter: 'weekly',
        search: ''
      })
    ).toBe(false)

    expect(
      matchesCollectionReport(record, { search: '9876543210' })
    ).toBe(true)

    expect(
      matchesCollectionReport(record, { search: '250' })
    ).toBe(true)
  })

  it('finds the displayed translated loan-type label', () => {
    const translatedLabel = 'தினசரி கடன்'

    expect(
      matchesCollectionReport(record, {
        search: translatedLabel,
        extraSearchFields: [translatedLabel]
      })
    ).toBe(true)

    expect(
      matchesCollectionReport(record, { search: translatedLabel })
    ).toBe(false)
  })
})
