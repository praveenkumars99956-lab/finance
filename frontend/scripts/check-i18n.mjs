import fs from 'node:fs'
import path from 'node:path'

const localeDir = path.resolve('src/i18n/locales')
const locales = ['en', 'ta', 'hi', 'ml', 'te', 'kn']
const placeholderPattern = /\{\{\s*[\w.]+\s*\}\}/g

function readLocale(code) {
  const file = path.join(localeDir, `${code}.json`)
  if (!fs.existsSync(file)) {
    return { code, file, error: 'file missing' }
  }

  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { code, file, json }
  } catch (error) {
    return { code, file, error: error.message }
  }
}

function placeholders(value) {
  return [...String(value).matchAll(placeholderPattern)]
    .map((match) => match[0].replace(/\s+/g, ''))
    .sort()
}

const source = readLocale('en')
if (source.error) {
  console.error(`✗ en.json: ${source.error}`)
  process.exit(1)
}

const sourceKeys = Object.keys(source.json)
let failed = false

for (const code of locales) {
  if (code === 'en') continue

  const locale = readLocale(code)
  if (locale.error) {
    console.error(`✗ ${code}: ${locale.error}`)
    failed = true
    continue
  }

  const keys = Object.keys(locale.json)
  const missing = sourceKeys.filter((key) => !(key in locale.json))
  const extra = keys.filter((key) => !(key in source.json))
  const empty = keys.filter((key) => String(locale.json[key] ?? '').trim() === '')
  const placeholderMismatch = sourceKeys.filter((key) => {
    if (!(key in locale.json)) return false
    return placeholders(source.json[key]).join('|') !== placeholders(locale.json[key]).join('|')
  })

  const problems = []
  if (missing.length) problems.push(`${missing.length} missing`)
  if (extra.length) problems.push(`${extra.length} extra`)
  if (empty.length) problems.push(`${empty.length} empty`)
  if (placeholderMismatch.length) problems.push(`${placeholderMismatch.length} placeholder mismatches`)

  if (problems.length) {
    failed = true
    console.error(`✗ ${code}: ${problems.join(', ')}`)
    if (missing.length) console.error(`    missing: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`)
    if (extra.length) console.error(`    extra: ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? ' …' : ''}`)
    if (placeholderMismatch.length) {
      console.error(`    placeholders: ${placeholderMismatch.slice(0, 10).join(', ')}${placeholderMismatch.length > 10 ? ' …' : ''}`)
    }
  } else {
    console.log(`✓ ${code}: ${keys.length} keys`)
  }
}

if (failed) {
  console.error('\ni18n check failed.')
  process.exit(1)
}

console.log(`\ni18n check passed for ${locales.length} locales (${sourceKeys.length} keys each).`)
