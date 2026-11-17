import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/custom-select.css'

/**
 * Reusable styled replacement for a native <select>.
 *
 * A visually hidden native <select> is kept in the DOM so that form
 * submission (name/id/options) keeps working, while the visible trigger and
 * the option list are fully custom and themeable.
 *
 * The option panel is rendered in a portal on document.body with fixed
 * positioning, so it is never clipped by card/section boundaries, and it
 * flips upward automatically when there is not enough room below the trigger.
 *
 * Props:
 *   value        current value (controlled)
 *   onChange     called with the new value: onChange(value)
 *   options      [{ value, label, disabled? }]
 *   disabled     disables the control
 *   placeholder  optional first option shown when nothing is selected
 *   name         forwarded to the hidden native <select>
 *   id           forwarded to the hidden native <select>
 *   ariaLabel    accessible label for the trigger/listbox
 *   className    extra class on the root wrapper
 */

const PANEL_MAX_HEIGHT = 280
const PANEL_GAP = 5
const OPTION_HEIGHT = 40
const TYPE_AHEAD_RESET_MS = 600

function CustomSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  placeholder,
  name,
  id,
  ariaLabel,
  className = ''
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [placement, setPlacement] = useState('bottom')
  const [panelStyle, setPanelStyle] = useState({})

  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const typeBufferRef = useRef('')
  const typeTimerRef = useRef(null)

  const generatedId = useId()
  const listboxId = id ? `${id}-listbox` : `${generatedId}-listbox`

  const allOptions = useMemo(() => {
    if (placeholder !== undefined && placeholder !== null) {
      return [{ value: '', label: placeholder }, ...options]
    }
    return options
  }, [placeholder, options])

  const selectedIndex = Math.max(
    0,
    allOptions.findIndex((option) => option.value === value)
  )
  const selected = allOptions[selectedIndex]

  // -------------------------------------------------------------------------
  // Positioning (portal + fixed) with automatic upward flip
  // -------------------------------------------------------------------------

  const measure = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return null

    const rect = trigger.getBoundingClientRect()
    const estimatedHeight = Math.min(
      PANEL_MAX_HEIGHT,
      allOptions.length * OPTION_HEIGHT + 12
    )
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP
    const spaceAbove = rect.top - PANEL_GAP
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      OPTION_HEIGHT + 12,
      Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)
    )

    return {
      placement: openUp ? 'top' : 'bottom',
      style: {
        position: 'fixed',
        left: `${Math.round(rect.left)}px`,
        width: `${Math.round(rect.width)}px`,
        maxHeight: `${Math.round(maxHeight)}px`,
        zIndex: 1200,
        ...(openUp
          ? { bottom: `${Math.round(window.innerHeight - rect.top + PANEL_GAP)}px`, top: 'auto' }
          : { top: `${Math.round(rect.bottom + PANEL_GAP)}px`, bottom: 'auto' })
      }
    }
  }, [allOptions.length])

  const reposition = useCallback(() => {
    const next = measure()
    if (!next) return
    setPlacement(next.placement)
    setPanelStyle(next.style)
  }, [measure])

  const openMenu = useCallback(() => {
    const next = measure()
    if (next) {
      setPlacement(next.placement)
      setPanelStyle(next.style)
    }
    setActiveIndex(selectedIndex)
    setOpen(true)
  }, [measure, selectedIndex])

  const closeMenu = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus && triggerRef.current) triggerRef.current.focus()
  }, [])

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Keep the active option visible.
  useEffect(() => {
    if (!open || !listRef.current) return
    const node = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeIndex])

  // Close on outside pointer + Escape.
  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      const target = event.target
      if (rootRef.current && rootRef.current.contains(target)) return
      if (listRef.current && listRef.current.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu(true)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeMenu])

  // Reposition while open (scroll / resize).
  useEffect(() => {
    if (!open) return undefined
    const handler = () => reposition()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open, reposition])

  // Clear any pending type-ahead timer on unmount.
  useEffect(() => () => {
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current)
  }, [])

  // -------------------------------------------------------------------------
  // Interaction helpers
  // -------------------------------------------------------------------------

  const commit = (index) => {
    const option = allOptions[index]
    if (!option || option.disabled) return
    onChange?.(option.value)
    closeMenu(true)
  }

  const moveActive = (delta) => {
    setActiveIndex((index) => {
      let next = index
      for (let step = 0; step < allOptions.length; step += 1) {
        next += delta
        if (next < 0) next = allOptions.length - 1
        if (next >= allOptions.length) next = 0
        if (!allOptions[next]?.disabled) return next
      }
      return index
    })
  }

  const handleTypeAhead = (key) => {
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current)
    typeBufferRef.current += key.toLowerCase()
    const buffer = typeBufferRef.current
    typeTimerRef.current = setTimeout(() => {
      typeBufferRef.current = ''
    }, TYPE_AHEAD_RESET_MS)

    const matchIndex = allOptions.findIndex(
      (option) =>
        !option.disabled &&
        String(option.label).toLowerCase().startsWith(buffer)
    )
    if (matchIndex < 0) return

    if (open) {
      setActiveIndex(matchIndex)
    } else {
      // Like a native <select>, typing while closed selects the match.
      onChange?.(allOptions[matchIndex].value)
    }
  }

  const isPrintableKey = (event) =>
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey

  const handleTriggerKeyDown = (event) => {
    if (disabled) return

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        closeMenu(true)
      }
      return
    }

    if (!open) {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault()
        openMenu()
        return
      }
      if (isPrintableKey(event)) handleTypeAhead(event.key)
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveActive(-1)
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(allOptions.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(activeIndex)
        break
      case 'Tab':
        closeMenu(false)
        break
      default:
        if (isPrintableKey(event)) {
          event.preventDefault()
          handleTypeAhead(event.key)
        }
        break
    }
  }

  const rootClass = `custom-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`

  return (
    <div ref={rootRef} className={rootClass}>
      {/* Hidden native select keeps name/id/options working for form submission. */}
      <select
        className="custom-select__native"
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      >
        {placeholder !== undefined && placeholder !== null && (
          <option value="">{placeholder}</option>
        )}
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>

      <div
        ref={triggerRef}
        className="custom-select__trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return
          if (open) closeMenu(false)
          else openMenu()
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="custom-select__value">
          {selected ? selected.label : ''}
        </span>
        <svg
          className="custom-select__chevron"
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            className={`custom-select__list${placement === 'top' ? ' is-up' : ''}`}
            role="listbox"
            aria-label={ariaLabel}
            style={panelStyle}
            onMouseDown={(event) => event.preventDefault()}
          >
            {allOptions.map((option, index) => {
              const isSelected = option.value === value
              return (
                <li
                  key={
                    option.value === ''
                      ? '__placeholder__'
                      : String(option.value)
                  }
                  id={`${listboxId}-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  className={`custom-select__option${index === activeIndex ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`}
                  onMouseEnter={() => {
                    if (!option.disabled) setActiveIndex(index)
                  }}
                  onClick={() => commit(index)}
                >
                  <span className="custom-select__option-label">
                    {option.label}
                  </span>
                  {isSelected && (
                    <svg
                      className="custom-select__check"
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </li>
              )
            })}
          </ul>,
          document.body
        )}
    </div>
  )
}

export default CustomSelect
