import { describe, expect, it } from 'vitest'
import {
  insertDictationText,
  isDictationTarget,
  resolveDictationTarget
} from './dictation'

function makeInput(attributes = {}) {
  const input = document.createElement('input')
  for (const [name, value] of Object.entries(attributes)) {
    input.setAttribute(name, value)
  }
  document.body.appendChild(input)
  return input
}

describe('isDictationTarget', () => {
  it('accepts text-like inputs and textareas', () => {
    expect(isDictationTarget(makeInput())).toBe(true)
    expect(isDictationTarget(makeInput({ type: 'search' }))).toBe(true)
    expect(isDictationTarget(makeInput({ type: 'tel' }))).toBe(true)
    expect(isDictationTarget(document.createElement('textarea'))).toBe(true)
  })

  it('rejects non-text fields and disabled controls', () => {
    expect(isDictationTarget(makeInput({ type: 'password' }))).toBe(false)
    expect(isDictationTarget(makeInput({ type: 'checkbox' }))).toBe(false)
    expect(isDictationTarget(makeInput({ type: 'file' }))).toBe(false)
    expect(isDictationTarget(makeInput({ disabled: 'disabled' }))).toBe(false)

    const readOnly = makeInput()
    readOnly.readOnly = true
    expect(isDictationTarget(readOnly)).toBe(false)

    expect(isDictationTarget(document.createElement('div'))).toBe(false)
    expect(isDictationTarget(null)).toBe(false)
  })
})

describe('resolveDictationTarget', () => {
  it('walks up from a contenteditable child to its host', () => {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    Object.defineProperty(host, 'isContentEditable', { value: true })

    const child = document.createElement('span')
    host.appendChild(child)
    document.body.appendChild(host)

    expect(resolveDictationTarget(child)).toBe(host)
  })

  it('returns null when nothing editable is found', () => {
    expect(resolveDictationTarget(document.createElement('div'))).toBeNull()
    expect(resolveDictationTarget(null)).toBeNull()
  })
})

describe('insertDictationText', () => {
  it('inserts at the caret and dispatches an input event', () => {
    const input = makeInput()
    input.value = 'Hello world'
    input.setSelectionRange(5, 5)

    let events = 0
    input.addEventListener('input', () => {
      events += 1
    })

    expect(insertDictationText(input, 'there')).toBe(true)
    expect(input.value).toBe('Hello there world')
    expect(input.selectionStart).toBe(11)
    expect(events).toBe(1)
  })

  it('replaces the current selection', () => {
    const input = makeInput()
    input.value = 'Collect 500 today'
    input.setSelectionRange(8, 11)

    insertDictationText(input, '750')

    expect(input.value).toBe('Collect 750 today')
  })

  it('adds a separating space when the caret follows a word', () => {
    const input = makeInput()
    input.value = 'Ravi'
    input.setSelectionRange(4, 4)

    insertDictationText(input, 'Kumar')

    expect(input.value).toBe('Ravi Kumar')
  })

  it('does not add a space before punctuation or after whitespace', () => {
    const input = makeInput()
    input.value = 'Amount'
    input.setSelectionRange(6, 6)
    insertDictationText(input, ', paid')
    expect(input.value).toBe('Amount, paid')

    const spaced = makeInput()
    spaced.value = 'Note: '
    spaced.setSelectionRange(6, 6)
    insertDictationText(spaced, 'ok')
    expect(spaced.value).toBe('Note: ok')
  })

  it('appends to contenteditable elements', () => {
    const editor = document.createElement('div')
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    editor.textContent = 'Visit'
    document.body.appendChild(editor)

    expect(insertDictationText(editor, 'today')).toBe(true)
    expect(editor.textContent).toBe('Visit today')
  })

  it('refuses empty text or detached elements', () => {
    const input = makeInput()
    expect(insertDictationText(input, '   ')).toBe(false)

    const detached = document.createElement('input')
    expect(insertDictationText(detached, 'hello')).toBe(false)
  })
})
