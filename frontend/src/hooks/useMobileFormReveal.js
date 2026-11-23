import { useEffect, useRef, useState } from 'react'

/**
 * On phones, opening a form must take the user straight to the data-entry
 * fields. The form is often rendered below a summary, and scrolling the window
 * does nothing because the app shell keeps the page fixed and scrolls
 * `.admin-content` instead.
 *
 * Desktop behaviour is completely unchanged: the reveal only runs when the
 * viewport is 640px wide or less.
 */
export function useMobileFormReveal(isOpen, formRef, focusSelector = 'input') {
  const pendingRef = useRef(false)
  const [revealVersion, setRevealVersion] = useState(0)

  const requestReveal = () => {
    pendingRef.current = true
    // Bump the version so a second tap on an already-open form still reveals.
    setRevealVersion((version) => version + 1)
  }

  useEffect(() => {
    if (!isOpen || !pendingRef.current) return undefined

    const isMobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 640px)').matches

    if (!isMobile) {
      pendingRef.current = false
      return undefined
    }

    // Double rAF gives React time to mount the form and paint it before we
    // measure/scroll. Do not cancel the frame on re-render — an async state
    // update shortly after Add would otherwise kill the reveal entirely.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pendingRef.current = false

        const form = formRef.current
        if (!form) return

        // scrollIntoView walks up to the real scroll container
        // (.admin-content), so it works even though the window is locked.
        form.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })

        const firstField = form.querySelector(focusSelector)
        if (firstField) {
          firstField.focus({ preventScroll: true })
        }
      })
    })

    return undefined
  }, [isOpen, revealVersion, formRef, focusSelector])

  return requestReveal
}
