import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')

const motionCss = readFileSync(
  path.join(frontendRoot, 'src/styles/motion.css'),
  'utf8'
)
const mainJs = readFileSync(
  path.join(frontendRoot, 'src/main.jsx'),
  'utf8'
)

describe('subtle motion polish', () => {
  it('is loaded globally', () => {
    expect(mainJs).toMatch(/import '\.\/styles\/motion\.css'/)
  })

  it('animates opacity only so layout and hover states are untouched', () => {
    expect(motionCss).toMatch(/@keyframes fs-fade-in/)
    expect(motionCss).not.toMatch(/transform:/)
    expect(motionCss).not.toMatch(
      /(?:^|\n)\s*(width|height|margin|padding):/
    )
  })

  it('covers admin, agent, auth and the mobile drawer scrim', () => {
    expect(motionCss).toMatch(/\.admin-content > \*/)
    expect(motionCss).toMatch(/\.agent-main > \*/)
    expect(motionCss).toMatch(/\.login-page > \.login-card/)
    expect(motionCss).toMatch(/\.sidebar-scrim\.is-visible/)
  })

  it('respects reduced-motion preferences', () => {
    expect(motionCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(motionCss).toMatch(/animation-duration: 0\.01ms !important/)
  })
})
