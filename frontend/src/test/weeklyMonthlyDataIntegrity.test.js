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
const clientLoanEditMigration = readFileSync(
  path.resolve(
    frontendRoot,
    '../supabase/migrations/20261124140000_harden_client_loan_edit_access.sql'
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

  it('derives pending from a freshly stored paid total when collections exist', () => {
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
      expect(source).toMatch(
        /const effectivePaid = canApplyAlreadyPaid[\s\S]{0,120}: recordedTotals\.paid/u
      )
      expect(source).toMatch(/const paidSoFar = effectivePaid/)
    }
  })

  it('does not select the legacy finance_id column', () => {
    for (const source of [weekly, monthly]) {
      expect(source).not.toMatch(
        /\.select\(\s*['"`][^'"`]*\bfinance_id\b/u
      )
    }
  })

  it('uses a plain id update and keeps conflict detection at the boundary', () => {
    for (const source of [weekly, monthly]) {
      const directUpdate =
        /\.update\(recordPayload\)[\s\S]{0,120}\.eq\('id', editedRecordId\)/.test(
          source
        )
      const helperUpdate =
        /await writeMonthlyRecord\(\s*recordPayload,\s*isEditing,\s*editedRecordId\s*\)/.test(
          source
        ) &&
        /\.update\(body\)[\s\S]{0,80}\.eq\('id', recordId\)/.test(source)

      expect(source).not.toMatch(/withRecordedBalanceGuard/)
      expect(source).not.toMatch(/\.or\(/)
      expect(directUpdate || helperUpdate).toBe(true)
      expect(source).toMatch(/storedRecord\?\.paid/)
      expect(source).toMatch(/collectionFinanceChanged/)
    }
  })

  it('retries only the schedule after a failed weekly create', () => {
    expect(weekly).toMatch(
      /pendingScheduleRecordIdRef = useRef\(null\)/
    )
    expect(weekly).toMatch(
      /if \(retryScheduleRecordId && !submittedEditRecordId\)/
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

  it('writes paid through the guarded upfront-paid rule', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/user_id: user\.id/)
      expect(source).toMatch(/if \(canApplyAlreadyPaid\)/)
      expect(source).toMatch(/paid: paidSoFar/)
      expect(source).not.toMatch(
        /Object\.assign\(\s*recordPayload,\s*\{\s*paid: paid\s*\}\s*\)/
      )
    }
  })

  it('aborts the save when a payment check fails', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(/paymentStatusCheckFailed/)
      expect(source).toMatch(
        /if \(paymentCheckError\)[\s\S]{0,1200}?(notify|showToast)\(\s*t\(\s*'paymentStatusCheckFailed'/u
      )
      expect(source).toMatch(/let scheduleError = null/)
    }
  })

  it('does not restage a superseded reload', () => {
    expect(monthly).toMatch(/postSaveReloadRef = useRef\(0\)/)
    expect(monthly).toMatch(/reloadToken !== postSaveReloadRef\.current/)
    expect(monthly).toMatch(
      /listGeneration !== loadRequestRef\.current/
    )
    expect(monthly).toMatch(/balanceLoan = \{/)
    expect(monthly).toMatch(/if \(!refreshedLoan\) return/)
    expect(monthly).toMatch(/mergedPatch\.customer_id =/)
    expect(monthly).toMatch(
      /const useRefreshedCustomer =\s*Boolean\(refreshedLoan\) &&\s*Boolean\(refreshedCustomer\)/
    )
  })

  it('guards legacy schedule deletion behind the missing-reset fallback', () => {
    for (const source of [weekly, monthly]) {
      const helper =
        source.match(/async function rebuild(?:Weekly|Monthly)Schedule[\s\S]*?\n\}/)?.[0] || ''
      const scheduleBlockStart = source.indexOf('if (shouldGenerateSchedule)')
      const scheduleBlock = source.slice(
        scheduleBlockStart,
        scheduleBlockStart + 320
      )

      expect(source).toMatch(
        /const shouldGenerateSchedule =\s*!isEditing \|\|\s*\(\s*!hasPostedPayments && !paymentCheckError\s*\)/
      )
      expect(scheduleBlock).toMatch(
        /await rebuild(?:Weekly|Monthly)Schedule\(/
      )
      expect(helper).toMatch(
        /const reset = await supabase\.rpc\('reset_(?:weekly|monthly)_schedule'/
      )
      expect(helper.indexOf('PGRST202')).toBeLessThan(
        helper.indexOf(".from('repayment_schedule')")
      )
      expect(helper).toMatch(
        /\.from\('repayment_schedule'\)\s*\.delete\(\)\s*\.eq\('finance_record_id', recordId\)/u
      )
      expect(helper).toMatch(/if \(removed\.error\) \{/)
      expect(helper).toMatch(/removed\.error\.code === '42501'/)
      expect(helper).toMatch(/includes\('permission denied'\)/)
      expect(helper).toMatch(/return removed/)
      expect(
        helper.match(
          /return supabase\.rpc\('generate_(?:weekly|monthly)_schedule'/g
        )?.length
      ).toBeGreaterThanOrEqual(2)
    }
  })

  it('uses atomic reset RPCs for edits', () => {
    expect(weekly).toMatch(
      /const reset = await supabase\.rpc\(\s*'reset_weekly_schedule'/
    )
    expect(monthly).toMatch(
      /const reset = await supabase\.rpc\(\s*'reset_monthly_schedule'/
    )
    expect(weekly).toMatch(
      /await rebuildWeeklySchedule\(\s*financeRecord\.id,\s*isEditing\s*\)/
    )
    expect(monthly).toMatch(
      /await rebuildMonthlySchedule\(\s*financeRecord\.id,\s*isEditing\s*\)/
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
      expect(source).toMatch(
        /readOnly=\{Boolean\(\s*editingFinanceId &&\s*\(\s*!editingPaymentChecked \|\|\s*editingHasPayments\s*\)\s*\)\}/
      )
      expect(source).toMatch(
        /canApplyAlreadyPaid =\s*!isEditing \|\|\s*\(\s*alreadyPaidChanged &&\s*!hasPostedPayments &&\s*!paymentCheckError\s*\)/
      )
    }
  })

  it('uses an authoritative payment lookup and an explicit paid-change rule', () => {
    for (const source of [weekly, monthly]) {
      const helper =
        source.match(/async function checkPostedPayments[\s\S]*?\n\}/)?.[0] || ''

      expect(helper).toMatch(
        /await supabase\.rpc\('finance_has_posted_payments'/
      )
      expect(helper).toMatch(/result\.error\.code !== 'PGRST202'/)
      expect(helper).toMatch(/\.from\('finance_payments'\)/)
      expect(helper).toMatch(/principal_paid \|\| 0/)
      expect(helper).toMatch(/interest_paid \|\| 0/)
      expect(helper).toMatch(
        /ledger\.error && !totalsHavePayments \? ledger\.error : null/
      )
      expect(source).toMatch(
        /const result = await checkPostedPayments\(\s*editedRecordId,\s*storedRecord\s*\)/
      )
      expect(source).toMatch(/paymentLookupRef = useRef\(0\)/)
      expect(source).toMatch(/const lookupId = \+\+paymentLookupRef\.current/)
      expect(source).toMatch(/const submittedEditRecordId = editingFinanceId/)
      expect(source).toMatch(/const submittedEditSessionId =/)
      expect(source).toMatch(/const submittedOriginalPaid =/)
      expect(source).toMatch(/alreadyPaidChanged =/)
      expect(source).toMatch(/isCurrentEdit\(\)/)
      expect(source).toMatch(/if \(savingRef\.current\) return/)
      expect(source).toMatch(
        /next_due_date:\s*isEditing\s*&&\s*hasPostedPayments\s*\? storedRecord\?\.next_due_date/
      )
      expect(source).toMatch(
        /loan_status:\s*isEditing\s*\? storedRecord\?\.loan_status/
      )
    }
  })

  it('retries monthly writes without collection_month on legacy schemas', () => {
    const helper =
      monthly.match(/async function writeMonthlyRecord[\s\S]*?\n\}/)?.[0] || ''

    expect(helper).toMatch(/result\.error\?\.code === '42703'/)
    expect(helper).toMatch(/includes\('collection_month'\)/)
    expect(helper).toMatch(/delete legacyPayload\.collection_month/)
    expect(helper).toMatch(/result = await run\(legacyPayload\)/)
    expect(monthly).toMatch(
      /await writeMonthlyRecord\(\s*recordPayload,\s*isEditing,\s*editedRecordId\s*\)/
    )
  })

  it('normalizes legacy loan types in client edit policies', () => {
    expect(clientLoanEditMigration).toMatch(
      /finance_normalize_type\(finance_type\) in \('weekly', 'monthly'\)/
    )
    expect(clientLoanEditMigration).toMatch(
      /finance_normalize_type\(finance\.finance_type\) in \('weekly', 'monthly'\)/
    )
    expect(clientLoanEditMigration).toMatch(
      /create or replace function public\.finance_has_posted_payments/
    )
    expect(clientLoanEditMigration).toMatch(/security definer/)
    expect(clientLoanEditMigration).toMatch(
      /v_role is null or v_role not in \('admin', 'client'\)/
    )
    expect(clientLoanEditMigration).toMatch(
      /create trigger finance_30_client_payment_totals_guard/
    )
    expect(clientLoanEditMigration).toMatch(
      /new\.paid is distinct from old\.paid/
    )
    expect(clientLoanEditMigration).toMatch(
      /not public\.finance_has_posted_payments\(finance\.id\)/
    )
  })

  it('keeps weekly upfront paid out of pending', () => {
    const start = weekly.indexOf('const pendingSoFar =')
    const end = weekly.indexOf(
      '// CREATE / UPDATE WEEKLY FINANCE ACCOUNT',
      start
    )

    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const section = weekly.slice(start, end)

    expect(section).toMatch(/\?\s*total/u)
    expect(section).toMatch(
      /Math\.max\(total - postedPaidSoFar, 0\)/
    )
    expect(weekly).toMatch(/pending: pendingSoFar/)
    expect(weekly).toMatch(/weeklyTermLockedAfterPayments/)
    expect(weekly).not.toMatch(
      /interestAmount,\s*alreadyPaid,\s*numberOfWeeks/u
    )
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

  it('subtracts upfront paid from stored monthly balances when collections are absent', () => {
    const baselineStart = monthly.indexOf('const canApplyAlreadyPaid =')
    const baselineEnd = monthly.indexOf('let financeCustomer', baselineStart)
    const paidBaseline = monthly.slice(baselineStart, baselineEnd)

    expect(paidBaseline).toMatch(/const effectivePaid = canApplyAlreadyPaid/)
    expect(paidBaseline).toMatch(/\?\s*paid/u)
    expect(paidBaseline).toMatch(/recordedTotals\.paid/)
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
