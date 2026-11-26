import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoanSummaryOverlay from './LoanSummaryOverlay'

vi.mock('../services/supabase', () => {
  const tables = {
    finance_records: {
      single: {
        id: 'fin-1',
        finance_type: 'daily',
        customer_id: 'cust-1',
        collection_category_id: 'cat-1',
        principal_amount: 1000,
        interest_accrual: 100,
        amount: 1100,
        pending: 200,
        interest_rate: 10,
        period: '10 Days',
        payment_date: '2026-01-01',
        ending_date: '2026-01-10',
        next_due_date: '2026-01-05'
      }
    },
    customers: {
      single: { id: 'cust-1', full_name: 'Ravi Kumar', customer_id: 'C-1' }
    },
    collection_categories: {
      single: { id: 'cat-1', category_name: 'Monday Collection' }
    },
    finance_payments: {
      list: [
        {
          id: 'pay-1',
          payment_date: '2026-01-02',
          payment_amount: 900,
          balance_before: 1100,
          balance_after: 200
        }
      ]
    }
  }

  function createQuery(table) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      single: vi.fn(() =>
        Promise.resolve({ data: tables[table]?.single || null, error: null })
      ),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: tables[table]?.single || null, error: null })
      ),
      then: (resolve, reject) =>
        Promise.resolve({ data: tables[table]?.list || [], error: null }).then(
          resolve,
          reject
        )
    }

    return query
  }

  return {
    supabase: {
      from: vi.fn((table) => createQuery(table))
    }
  }
})

vi.mock('react-i18next', () => {
  const i18n = { language: 'en' }
  const t = (key, fallback) => fallback || key

  return {
    useTranslation: () => ({ t, i18n })
  }
})

function LoanRow() {
  return (
    <table>
      <tbody>
        <tr data-finance-id="fin-1">
          <td>Ravi Kumar - Daily Loan line</td>
          <td>
            <button type="button">Edit</button>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

describe('LoanSummaryOverlay', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('opens the full loan snapshot when a loan line is clicked', async () => {
    render(
      <>
        <LoanRow />
        <LoanSummaryOverlay />
      </>
    )

    fireEvent.click(screen.getByText(/daily loan line/i))

    const dialog = await screen.findByRole('dialog', { name: /loanSummary/i })
    const summary = within(dialog)

    expect(summary.getByText(/Ravi Kumar/)).toBeInTheDocument()
    expect(summary.getByText('₹1,000.00')).toBeInTheDocument()
    expect(summary.getByText('₹110.00')).toBeInTheDocument()
    expect(summary.getByText('Monday Collection')).toBeInTheDocument()
    expect(summary.getByText('EMI / Installment')).toBeInTheDocument()
    expect(summary.getByText('paymentHistory')).toBeInTheDocument()
    expect(summary.getByText('01 Jan 2026')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.body.style.overflow).toBe('')
  })

  it('leaves existing row buttons untouched', async () => {
    render(
      <>
        <LoanRow />
        <LoanSummaryOverlay />
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
