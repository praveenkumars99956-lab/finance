import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')

function readSource(relativePath) {
  return readFileSync(
    path.join(frontendRoot, relativePath),
    'utf8'
  )
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)

  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)

  return source.slice(start, end)
}

const monthly = readSource('src/pages/client/Monthly.jsx')
const weekly = readSource('src/pages/client/Weekly.jsx')
const selectMenuCss = readSource('src/styles/select-menu.css')
const motionCss = readSource('src/styles/motion.css')

describe('monthly form interactions', () => {
  it('keeps an open dropdown above later form sections', () => {
    expect(selectMenuCss).toMatch(
      /\.daily-form-section:has\(\.select-menu\.is-open\)/
    )
    expect(selectMenuCss).toMatch(
      /\.daily-manage-section:has\(\.select-menu\.is-open\)/
    )
    expect(selectMenuCss).toMatch(/z-index:\s*1;/)

    // `both` retains the stacking context created by the opacity animation.
    expect(motionCss).not.toMatch(/animation:[^;]*\bboth\b/)
    expect(motionCss).toMatch(/animation:[^;]*backwards/)
  })

  it('does not let a late Settings response overwrite an interest-derived rate', () => {
    for (const source of [weekly, monthly]) {
      expect(source).toMatch(
        /!editing(?:LoanRef|FinanceIdRef)\.current\s*&&\s*!interestAmountEdited\.current/u
      )
    }
  })

  it('recalculates the monthly rate from the amount and its inputs', () => {
    const principal = section(
      monthly,
      '{/* PRINCIPAL */}',
      '{/* RATE */}'
    )
    const amount = section(
      monthly,
      '{/* INTEREST AMOUNT */}',
      '{/* ALREADY PAID */}'
    )
    const months = section(
      monthly,
      '{/* NUMBER OF MONTHS */}',
      '{/* START DATE */}'
    )

    expect(amount).toMatch(/interestAmountEdited\.current = true/)
    expect(amount).toMatch(
      /setInterestRate\(\s*rateFromInterestAmount\(\s*value,\s*principal,\s*numberOfMonths\s*\)\s*\)/u
    )

    for (const input of [principal, months]) {
      expect(input).toMatch(/interestAmountEdited\.current/)
      expect(input).toMatch(/setInterestRate\(/)
      expect(input).toMatch(/rateFromInterestAmount\(/)
      expect(input).toMatch(/interestAmount/)
    }

    expect(principal).toMatch(/\bvalue\b/)
    expect(months).toMatch(/\bvalue\b/)
  })
})
