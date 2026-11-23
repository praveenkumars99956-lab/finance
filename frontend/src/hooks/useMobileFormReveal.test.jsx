import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useMobileFormReveal } from './useMobileFormReveal'

function Harness() {
  const [open, setOpen] = useState(false)
  const formRef = useRef(null)
  const revealForm = useMobileFormReveal(open, formRef)

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          revealForm()
        }}
      >
        Add
      </button>
      {open && (
        <form ref={formRef}>
          <input aria-label="first field" />
        </form>
      )}
    </div>
  )
}

function mockMatchMedia(matches) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })
}

describe('useMobileFormReveal', () => {
  beforeEach(() => {
    // Run rAF callbacks synchronously so the double-frame reveal is testable.
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback(0)
      return 1
    })
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('scrolls the form and focuses the first field on mobile', () => {
    mockMatchMedia(true)
    render(<Harness />)

    act(() => {
      screen.getByText('Add').click()
    })

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    })
    expect(screen.getByLabelText('first field')).toHaveFocus()
  })

  it('does nothing on desktop', () => {
    mockMatchMedia(false)
    render(<Harness />)

    act(() => {
      screen.getByText('Add').click()
    })

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})
