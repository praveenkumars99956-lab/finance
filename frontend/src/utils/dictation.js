/**
 * Helpers for inserting dictated text into whatever field has focus.
 *
 * These deliberately work on the DOM node rather than React state: dictation is
 * a screen-level tool, so the field may live in any page or modal. Updating the
 * native value and dispatching `input` lets React's onChange run normally, so
 * controlled inputs stay in sync.
 */

const DICTATION_INPUT_TYPES = new Set([
  'text',
  'search',
  'tel',
  'email',
  'url',
  'number'
])

export function isDictationTarget(element) {
  if (!element || element.nodeType !== 1) return false

  if (element.isContentEditable) {
    return element.getAttribute('aria-disabled') !== 'true'
  }

  if (element.tagName === 'TEXTAREA') {
    return !element.disabled && !element.readOnly
  }

  if (element.tagName !== 'INPUT') return false
  if (element.disabled || element.readOnly) return false

  const type = (element.getAttribute('type') || 'text').toLowerCase()
  return DICTATION_INPUT_TYPES.has(type)
}

/**
 * Resolves the editable field for a focused node, walking up from a
 * contenteditable child to its host.
 */
export function resolveDictationTarget(element) {
  if (!element || element.nodeType !== 1) return null
  if (isDictationTarget(element)) return element

  const host = element.closest?.('[contenteditable="true"]')
  return host && isDictationTarget(host) ? host : null
}

function withLeadingSpace(before, text) {
  if (!before || /\s$/.test(before)) return text
  if (/^[\s.,!?;:)\]}%]/.test(text)) return text
  return ` ${text}`
}

/**
 * Inserts `rawText` at the caret of `field` and fires a native `input` event.
 * Returns true when text was written.
 */
export function insertDictationText(field, rawText) {
  const text = String(rawText || '').trim()
  if (!field || !text) return false
  if (field.isConnected === false) return false

  if (field.isContentEditable) {
    field.focus({ preventScroll: true })

    const selection = typeof window !== 'undefined' ? window.getSelection() : null
    let range = null

    if (selection && selection.rangeCount > 0) {
      const candidate = selection.getRangeAt(0)
      if (field.contains(candidate.commonAncestorContainer)) {
        range = candidate
      }
    }

    if (!range) {
      range = document.createRange()
      range.selectNodeContents(field)
      range.collapse(false)
    }

    const beforeRange = range.cloneRange()
    beforeRange.selectNodeContents(field)
    beforeRange.setEnd(range.startContainer, range.startOffset)
    const inserted = withLeadingSpace(beforeRange.toString(), text)

    range.deleteContents()
    range.insertNode(document.createTextNode(inserted))
    range.collapse(false)

    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }

    field.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  const start = field.selectionStart ?? field.value.length
  const end = field.selectionEnd ?? field.value.length
  const before = field.value.slice(0, start)
  const inserted = withLeadingSpace(before, text)
  const nextValue = `${before}${inserted}${field.value.slice(end)}`

  field.focus({ preventScroll: true })

  const prototype =
    typeof HTMLTextAreaElement !== 'undefined' &&
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  if (setter) {
    setter.call(field, nextValue)
  } else {
    field.value = nextValue
  }

  const caret = start + inserted.length
  if (typeof field.setSelectionRange === 'function') {
    field.setSelectionRange(caret, caret)
  }

  field.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}
