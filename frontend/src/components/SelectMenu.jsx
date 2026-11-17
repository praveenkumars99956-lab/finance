import { useEffect, useRef, useState } from 'react'

/**
 * Styled replacement for a native <select>. The native option list is rendered
 * by the OS and can't be themed, so this renders its own listbox popup with the
 * app's design tokens while keeping keyboard + screen-reader behaviour.
 *
 * Usage:
 *   <SelectMenu
 *     value={typeFilter}
 *     onChange={setTypeFilter}
 *     ariaLabel="Filter by loan type"
 *     placeholder="Select an option"
 *     options={[{ value: 'all', label: 'All loan types' }]}
 *   />
 *
 * Notes:
 * - `ref` is forwarded to the trigger <button>, so `ref.current.focus()` /
 *   `scrollIntoView()` keep working like they did on a native <select>.
 * - Native `required` is intentionally not forwarded; forms validate their
 *   values in JS on submit.
 */
function SelectMenu({
  ref,
  id,
  value,
  onChange,
  options = [],
  placeholder,
  ariaLabel,
  ariaInvalid = false,
  ariaDescribedBy,
  disabled = false,
  variant = 'default',
  leadingIcon = null,
  className = '',
  buttonClassName = ''
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const listRef = useRef(null)

  const allOptions = placeholder !== undefined && placeholder !== null
    ? [{ value: '', label: placeholder }, ...options]
    : options

  const selectedIndex = Math.max(
    0,
    allOptions.findIndex((option) => option.value === value)
  )
  const selected = allOptions[selectedIndex]

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex)
  }, [open, selectedIndex])

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const node = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeIndex])

  const commit = (index) => {
    const option = allOptions[index]
    if (!option || option.disabled) return
    onChange?.(option.value)
    setOpen(false)
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

  const handleTriggerKeyDown = (event) => {
    if (disabled) return

    if (event.key === 'Escape') {
      setOpen(false)
      return
    }

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        setOpen(true)
      }
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
        setOpen(false)
        break
      default:
        break
    }
  }

  const variantClass = variant === 'default' ? '' : ` select-menu--${variant}`
  const rootClass = `select-menu${variantClass}${open ? ' is-open' : ''} ${className}`.trim()
  const triggerClass = `select-menu__trigger${buttonClassName ? ` ${buttonClassName}` : ''}`

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        ref={ref}
        id={id}
        type="button"
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={handleTriggerKeyDown}
      >
        {leadingIcon && <span className="select-menu__leading" aria-hidden="true">{leadingIcon}</span>}
        <span className="select-menu__value">{selected ? selected.label : ''}</span>
        <svg
          className="select-menu__chevron"
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
      </button>

      {open && (
        <ul
          ref={listRef}
          className="select-menu__list"
          role="listbox"
          aria-label={ariaLabel}
          onMouseDown={(event) => event.preventDefault()}
        >
          {allOptions.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value === '' ? '__placeholder__' : option.value}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={`select-menu__option${index === activeIndex ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index)
                }}
                onClick={() => commit(index)}
              >
                <span className="select-menu__option-label">{option.label}</span>
                {isSelected && (
                  <svg
                    className="select-menu__check"
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
        </ul>
      )}
    </div>
  )
}

export default SelectMenu
