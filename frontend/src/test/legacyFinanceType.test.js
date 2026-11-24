import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  normalizeFinanceType as normalizeFromService
} from '../services/agentAssignments'
import { normalizeFinanceType } from '../utils/financeType'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')
const readSource = (relativePath) =>
  readFileSync(path.join(frontendRoot, relativePath), 'utf8')

describe('legacy finance type handling', () => {
  it('shares one normalizer between assignment filters and finance utilities', () => {
    expect(normalizeFromService).toBe(normalizeFinanceType)
    expect(normalizeFromService('Weekly Loan')).toBe('weekly')
    expect(normalizeFromService('monthly-collection')).toBe('monthly')
    expect(normalizeFromService('Interest Only Loan')).toBe('interest_only')
  })

  it('opens legacy weekly and monthly records from admin manage screens', () => {
    for (const page of [
      'src/pages/admin/WeeklyManage.jsx',
      'src/pages/admin/MonthlyManage.jsx'
    ]) {
      const source = readSource(page)

      expect(source).toMatch(/normalizeFinanceType\(financeData\.finance_type\)/)
      expect(source).not.toMatch(/\.eq\('finance_type', '(weekly|monthly)'\)/)
    }
  })

  it('normalizes legacy types in admin navigation and agent payment routing', () => {
    const pending = readSource('src/pages/admin/Pending.jsx')
    const profile = readSource('src/pages/admin/CustomerProfile.jsx')
    const agentCollection = readSource('src/pages/agent/AgentCollection.jsx')

    expect(pending).toMatch(
      /switch \(normalizeFinanceType\(record\.finance_type\)\)/
    )
    expect(profile).toMatch(
      /const type = normalizeFinanceType\(/
    )
    expect(agentCollection).toMatch(
      /const type = normalizeFinanceType\(finance\?\.finance_type\)/
    )
  })

  it('uses normalized interest-only checks throughout the agent collection form', () => {
    const agentCollection = readSource('src/pages/agent/AgentCollection.jsx')

    expect(agentCollection).toMatch(
      /if \(normalizeFinanceType\(finance\?\.finance_type\) === 'interest_only'\)/
    )
    expect(agentCollection).toMatch(
      /normalizeFinanceType\(access\.record\.finance_type\)/
    )
    expect(agentCollection).toMatch(
      /const financeType = normalizeFinanceType\(finance\.finance_type\)/
    )
    expect(agentCollection).toMatch(
      /const isInterestOnlyLoan = financeType === 'interest_only'/
    )
    expect(agentCollection).not.toMatch(/=== 'interest-only'/)
    expect(agentCollection).not.toMatch(
      /String\(finance(?:Record)?\.finance_type \|\| ''\)\.toLowerCase\(\)/
    )
  })

  it('normalizes legacy types in the SQL payment guard', () => {
    const migration = readSource(
      '../supabase/migrations/20261124130000_add_finance_records_collection_month.sql'
    )

    expect(migration).toMatch(
      /function public\.finance_normalize_type\(p_value text\)/
    )
    expect(migration).toMatch(
      /public\.finance_normalize_type\(finance_type\) = public\.finance_normalize_type\(p_expected_type\)/
    )
  })
})
