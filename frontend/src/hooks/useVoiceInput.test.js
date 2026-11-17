import { describe, expect, it } from 'vitest'
import { voiceLanguageForApp, voiceLanguageLabel } from './useVoiceInput'

describe('voiceLanguageForApp', () => {
  it('maps app locales to their regional recognition codes', () => {
    expect(voiceLanguageForApp('en')).toBe('en-IN')
    expect(voiceLanguageForApp('hi')).toBe('hi-IN')
    expect(voiceLanguageForApp('ta')).toBe('ta-IN')
    expect(voiceLanguageForApp('ml')).toBe('ml-IN')
    expect(voiceLanguageForApp('te')).toBe('te-IN')
    expect(voiceLanguageForApp('kn')).toBe('kn-IN')
  })

  it('keeps an explicit BCP-47 code', () => {
    expect(voiceLanguageForApp('en-US')).toBe('en-US')
    expect(voiceLanguageForApp('fr-FR')).toBe('fr-FR')
  })

  it('falls back to Indian English for unknown input', () => {
    expect(voiceLanguageForApp('')).toBe('en-IN')
    expect(voiceLanguageForApp('not a locale')).toBe('en-IN')
  })
})

describe('voiceLanguageLabel', () => {
  it('returns the native label when known', () => {
    expect(voiceLanguageLabel('hi-IN')).toBe('हिन्दी')
    expect(voiceLanguageLabel('en-IN')).toBe('English (India)')
  })

  it('falls back to the raw code', () => {
    expect(voiceLanguageLabel('xx-YY')).toBe('xx-YY')
  })
})
