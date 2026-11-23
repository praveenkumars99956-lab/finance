import fs, { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')

const html = readFileSync(path.join(frontendRoot, 'index.html'), 'utf8')
const themeCss = readFileSync(
  path.join(frontendRoot, 'src/styles/finance-theme.css'),
  'utf8'
)

describe('dark theme bootstrap', () => {
  it('applies the saved theme before any stylesheet loads', () => {
    expect(html).toMatch(/localStorage\.getItem\('finance-theme'\)/)
    expect(html).toMatch(/dataset\.theme = 'dark'/)

    const themeScript = html.indexOf("localStorage.getItem('finance-theme')")
    const firstStylesheet = html.indexOf('<link href="https://fonts.googleapis.com')

    expect(themeScript).toBeGreaterThan(-1)
    expect(firstStylesheet).toBeGreaterThan(themeScript)
  })

  it('defines surface tokens for both light and dark themes', () => {
    const darkStart = themeCss.indexOf('Dark theme')
    expect(darkStart).toBeGreaterThan(-1)

    const lightBlock = themeCss.slice(0, darkStart)
    const darkBlock = themeCss.slice(darkStart)

    const tokens = [
      '--fs-surface-card',
      '--fs-surface-soft',
      '--fs-surface-tint',
      '--fs-border-soft'
    ]

    for (const token of tokens) {
      expect(lightBlock).toContain(`${token}:`)
      expect(darkBlock).toContain(`${token}:`)
    }
  })

  it('keeps original light colours as inline fallbacks for dark-only tokens', () => {
    const darkStart = themeCss.indexOf('Dark theme')
    const lightBlock = themeCss.slice(0, darkStart)
    const darkBlock = themeCss.slice(darkStart)

    for (const token of [
      '--fs-inline-card',
      '--fs-inline-soft',
      '--fs-inline-tint',
      '--fs-inline-border'
    ]) {
      expect(lightBlock).not.toContain(`${token}:`)
      expect(darkBlock).toContain(`${token}:`)
    }

    const jsxRoot = path.join(frontendRoot, 'src')
    const files = []
    const collect = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) collect(full)
        else if (entry.name.endsWith('.jsx')) files.push(full)
      }
    }
    collect(jsxRoot)

    const jsx = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(jsx).toMatch(/var\(--fs-inline-soft, #fbfaff\)/)
    expect(jsx).toMatch(/var\(--fs-inline-tint, \$\{bg\}\)/)
    expect(jsx).not.toMatch(/var\(--fs-surface-(card|soft|tint),/)
  })

  it('keeps primary buttons readable while lightening primary text', () => {
    expect(themeCss).toMatch(/--color-primary: #5b21b6/)
    expect(themeCss).toMatch(/:root\[data-theme='dark'\] \.text-primary/)
  })
})
