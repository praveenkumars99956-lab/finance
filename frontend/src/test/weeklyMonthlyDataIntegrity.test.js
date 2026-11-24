import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')

const weekly = readFileSync(
  path.join(frontendRoot, 'src/pages/client/Weekly.jsx'),
  'utf8'
)
const monthly = readFileSync(
  path.join(frontendRoot, 'src/pages/client/Monthly.jsx'),
  'utf8'
)
const collectionMonthMigration = readFileSync(
  path.resolve(
    frontendRoot,
    '../supabase/migrations/20261124130000_add_finance_records_collection_month.sql'
  ),
  'utf8'
)
const appSource = readFileSync(
  path.join(frontendRoot, 'src/App.jsx'),
  'utf8'
)
const adminLayoutSource = readFileSync(
  path.join(frontendRoot, 'src/components/AdminLayout.jsx'),
  'utf8'
)

describe('weekly and monthly data-integrity parity', () => {
  it('resets and seeds the new-customer phone state', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/setNewCustomerPhone\(''\)/)
      expect(source).toMatch(
        /setNewCustomerPhone\(normalizePhone\(loanCustomer\?\.phone\)\)/
      )
    }
  })

  it('derives pending from a freshly stored paid total on edit', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(
        /paid: Number\(freshRecord\.paid \|\| 0\)/
      )
      expect(source).toMatch(
        /principal_paid: Number\(freshRecord\.principal_paid \|\| 0\)/
      )
      expect(source).toMatch(
        /interest_paid: Number\(freshRecord\.interest_paid \|\| 0\)/
      )
      expect(source).not.toMatch(
        /(weekly|monthly)Loans\.find/
      )
    }

    expect(weekly).toMatch(
      /const paidSoFar = recordedTotals\.paid/
    )
    expect(monthly).toMatch(
      /\? recordedTotals\.paid/
    )
    expect(weekly).not.toMatch(/const paidSoFar = paid/)
  })

  it('blocks an edit when a payment lands after the fresh read', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/function withRecordedBalanceGuard/)
      expect(source).toMatch(
        /current\.or\(\s*`\$\{column\}\.eq\.\$\{Number\(value \|\| 0\)\},\$\{column\}\.is\.null`/
      )
      expect(source).toMatch(/saveError\?\.code === 'PGRST116'|financeError\?\.code === 'PGRST116'/)
      expect(source).toMatch(/collectionFinanceChanged/)
    }
  })

  it('retries only the schedule after a failed weekly create', () => {
    expect(weekly).toMatch(
      /pendingScheduleRecordIdRef = useRef\(null\)/
    )
    expect(weekly).toMatch(
      /if \(retryScheduleRecordId && !editingFinanceId\)/
    )
    expect(weekly).toMatch(
      /pendingScheduleRecordIdRef\.current = financeRecord\.id/
    )
    expect(weekly).toMatch(
      /'generate_weekly_schedule'/
    )
    expect(weekly).toMatch(
      /pendingScheduleRecordIdRef\.current = null/
    )
  })

  it('writes paid only when a loan is created', () => {
    expect(weekly).toMatch(/user_id: user\.id,[\s\S]{0,80}paid,/)
    expect(monthly).toMatch(/user_id: user\.id,[\s\S]{0,160}paid: paid,/)

    expect(monthly).not.toMatch(
      /Object\.assign\(\s*recordPayload,\s*\{\s*paid: paid\s*\}\s*\)/
    )
  })

  it('surfaces a failed payment check instead of reporting success', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/scheduleError = paymentCheckError/)
      expect(source).toMatch(/if\s*\([\s\S]{0,40}scheduleError[\s\S]{0,40}\)/u)
    }
  })

  it('skips schedule generation after a failed or paid edit check', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/let shouldGenerateSchedule = true/)
      expect(source).toMatch(/shouldGenerateSchedule = false/)
      expect(source).toMatch(/if \(shouldGenerateSchedule\)/)
      expect(source).not.toMatch(/\.from\('repayment_schedule'\)[\s\S]{0,80}\.delete\(\)/u)
    }
  })

  it('uses atomic reset RPCs for edits', () => {
    expect(weekly).toMatch(
      /isEditing\s*\n\s*\? 'reset_weekly_schedule'/
    )
    expect(monthly).toMatch(
      /isEditing\s*\n\s*\? 'reset_monthly_schedule'/
    )
    expect(collectionMonthMigration).toMatch(
      /function public\.reset_weekly_schedule/
    )
    expect(collectionMonthMigration).toMatch(
      /function public\.reset_monthly_schedule/
    )
  })

  it('keeps monthly search and category focus in sync with weekly', () => {
    expect(monthly).toMatch(/loan\.customer\?\.full_name,/)
    expect(monthly).toMatch(/categorySelectRef\.current\?\.focus\(\)/)
    expect(monthly).toMatch(/categorySelectRef\.current\?\.scrollIntoView/)
  })

  it('keeps legacy customers selectable in both pages', () => {
    for (const source of [weekly, monthly]) {
      expect(source).not.toMatch(/\n\s*\.eq\('status', 'active'\)/u)
      expect(source).toMatch(/status !== 'inactive'/)
    }
  })

  it('restores the Settings default rate when a form is reset', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/defaultInterestRateRef = useRef\(''\)/)
      expect(source).toMatch(
        /setInterestRate\(defaultInterestRateRef\.current\)/
      )
    }
  })

  it('guards against double submit and non-finite paid amounts', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(
        /e\.preventDefault\(\)[\s\S]{0,220}if \(savingRef\.current\) return/u
      )
      expect(source).toMatch(/savingRef\.current = true/)
      expect(source).toMatch(
        /!Number\.isFinite\(paid\)[\s\S]{0,30}\|\|[\s\S]{0,30}paid < 0/u
      )
      expect(source).toMatch(/readOnly=\{Boolean\(editingFinanceId\)\}/)
    }
  })

  it('clears the prefilled phone when switching to a new customer', () => {
    for (const source of [weekly, monthly]) {
      const handler = source.match(
        /const handleCreateNewCustomer[\s\S]{0,600}?\n  \}/u
      )

      expect(handler?.[0]).toMatch(/setNewCustomerPhone\(''\)/)
    }
  })

  it('reveals the form when editing on a phone', () => {
    for (const source of [weekly, monthly]) {
      const editor = source.match(
        /const edit(?:Weekly|Monthly)Loan[\s\S]*?(?=\n  \/\/)/u
      )

      expect(editor?.[0]).toMatch(/\(max-width: 640px\)/)
      expect(editor?.[0]).toMatch(/revealForm\(\)/)
    }
  })

  it('persists the selected collection month', () => {
    expect(monthly).toMatch(/collection_month:[\s\S]{0,40}collectionMonth/)
    expect(monthly).toMatch(/skipMonthAutoSelectRef\.current = true/)
    expect(collectionMonthMigration).toMatch(
      /add column if not exists collection_month text/
    )
    expect(collectionMonthMigration).toMatch(
      /coalesce\(finance_row\.amount, 0\) - coalesce\(finance_row\.paid, 0\)/
    )
  })

  it('subtracts upfront paid from stored monthly balances on create', () => {
    const baselineStart = monthly.indexOf('const paidSoFar = isEditing')
    const baselineEnd = monthly.indexOf('let financeCustomer', baselineStart)
    const paidBaseline = monthly.slice(baselineStart, baselineEnd)

    expect(paidBaseline).toMatch(/const paidSoFar = isEditing/)
    expect(paidBaseline).toMatch(/:\s*paid/u)
    expect(paidBaseline).toMatch(/Math\.min\(paid, p\)/)
    expect(paidBaseline).toMatch(/Math\.max\(paid - p, 0\)/)
    expect(monthly).toMatch(/interest_paid:\s*interestPaidSoFar/)
    expect(monthly).toMatch(/principal_paid:\s*principalPaidSoFar/)
  })

  it('falls back to the default weekly category when a loan has none', () => {
    expect(weekly).toMatch(
      /loan\.collection_category_id \|\|[\s\S]{0,40}weeklyCategoryId/
    )
  })

  it('keeps schedule totals exact and the weekly fallback inclusive', () => {
    expect(collectionMonthMigration).toMatch(
      /payable_cents := round\([\s\S]{0,120}payable[\s\S]{0,40}\* 100\)::bigint/
    )
    expect(collectionMonthMigration).toMatch(
      /base_cents := payable_cents \/ installment_count/
    )
    expect(collectionMonthMigration).toMatch(
      /remainder_cents := payable_cents % installment_count/
    )
    expect(collectionMonthMigration).toMatch(
      /function public\.generate_weekly_schedule/
    )
    expect(collectionMonthMigration).toMatch(
      /floor\(\(finance_row\.ending_date - finance_row\.entry_date\)::numeric \/ 7\)::integer \+ 1/
    )
    expect(collectionMonthMigration).not.toMatch(
      /ceil\(\(finance_row\.ending_date/
    )
  })

  it('renders weekly and monthly inside the admin shell', () => {
    const adminShellIndex = appSource.indexOf('<Route element={<AdminLayout />}>')

    expect(adminShellIndex).toBeGreaterThan(-1)
    expect(appSource.indexOf('path="/weekly"')).toBeGreaterThan(adminShellIndex)
    expect(appSource.indexOf('path="/monthly"')).toBeGreaterThan(adminShellIndex)
    expect(adminLayoutSource).toMatch(/pathname\.startsWith\('\/weekly'\)/)
    expect(adminLayoutSource).toMatch(/pathname\.startsWith\('\/monthly'\)/)
  })
})
