import { useEffect, useId, useMemo, useRef, useState } from 'react'
import '../styles/customer-autocomplete.css'

/**
 * Accessible customer field for loan forms.
 *
 * It behaves like a combobox: typing filters `existingCustomers`, arrow keys
 * move through the suggestions, and Enter/click selects one. When the typed
 * value is not already in the list, a final "create new" option is shown so a
 * new customer can be entered without leaving the loan form.
 *
 * Props:
 *   value            current customer name (controlled)
 *   onChange         called with the new name — callers store this in the
 *                    loan record's customerName field
 *   existingCustomers array of existing customer names (strings)
 *   onCreateNew      optional callback when the "create new" option is chosen
 *   label / id / name / placeholder / disabled / required / error
 *   ariaLabel        accessible name when no visible label is supplied
 *   maxSuggestions   maximum number of existing names shown at once
 *   createNewLabel   optional (name) => string override for the create option
 */
function CustomerAutocomplete({
  value = '',
  onChange,
  existingCustomers = [],
  onCreateNew,
  id,
  name,
  label,
  placeholder,
  disabled = false,
  required = false,
  error = '',
  ariaLabel,
  className = '',
  autoComplete = 'off',
  maxSuggestions = 8,
  createNewLabel
}) {
  const generatedId = useId()
  const inputId = id || `customer-autocomplete-${generatedId}`
  const listboxId = `${inputId}-listbox`
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [touched, setTouched] = useState(false)
  const rootRef = useRef(null)

  const rawValue = String(value ?? '')
  const query = rawValue.trim()
  const queryKey = query.toLocaleLowerCase()

  // De-duplicate case-insensitively so "Ravi" and "ravi" are one suggestion.
  const uniqueCustomers = useMemo(() => {
    const seen = new Set()

    return (Array.isArray(existingCustomers) ? existingCustomers : [])
      .map((customer) => String(customer ?? '').trim())
      .filter((customerName) => {
        if (!customerName) return false

        const key = customerName.toLocaleLowerCase()
        if (seen.has(key)) return false

        seen.add(key)
        return true
      })
  }, [existingCustomers])

  const suggestions = useMemo(() => {
    const matching = queryKey
      ? uniqueCustomers.filter((customerName) =>
          customerName.toLocaleLowerCase().includes(queryKey)
        )
      : uniqueCustomers

    return matching
      .slice(0, maxSuggestions)
      .map((customerName) => ({ type: 'existing', name: customerName }))
  }, [uniqueCustomers, queryKey, maxSuggestions])

  const exactMatch = useMemo(
    () =>
      Boolean(queryKey) &&
      uniqueCustomers.some(
        (customerName) => customerName.toLocaleLowerCase() === queryKey
      ),
    [uniqueCustomers, queryKey]
  )

  // Never offer to create a name that is already in the list.
  const options = useMemo(() => {
    const list = [...suggestions]

    if (query && !exactMatch) {
      list.push({ type: 'create', name: query })
    }

    return list
  }, [suggestions, query, exactMatch])

  useEffect(() => {
    setActiveIndex(0)
  }, [queryKey])

  useEffect(() => {
    if (!open) return undefined

    const closeWhenClickedOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeWhenClickedOutside)
    document.addEventListener('touchstart', closeWhenClickedOutside)

    return () => {
      document.removeEventListener('mousedown', closeWhenClickedOutside)
      document.removeEventListener('touchstart', closeWhenClickedOutside)
    }
  }, [open])

  useEffect(() => {
    if (!open || !rootRef.current) return

    const activeOption = rootRef.current.querySelector(
      `[data-option-index="${activeIndex}"]`
    )

    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeIndex])

  const isOpen = open && options.length > 0
  const showNoSuggestions = open && query && options.length === 0
  const showError = Boolean(error) || (required && touched && !query)
  const describedBy = [
    showError ? errorId : null,
    showNoSuggestions ? hintId : null
  ]
    .filter(Boolean)
    .join(' ')

  const optionId = (index) => `${inputId}-option-${index}`

  const emitChange = (nextValue) => {
    onChange?.(nextValue ?? '')
  }

  const commit = (option) => {
    if (!option) return

    emitChange(option.name)

    if (option.type === 'create') {
      onCreateNew?.(option.name)
    }

    setTouched(true)
    setOpen(false)
  }

  const handleChange = (event) => {
    emitChange(event.target.value)
    setActiveIndex(0)
    setOpen(true)
  }

  const moveActive = (delta) => {
    setActiveIndex((index) => {
      if (!options.length) return 0
      return (index + delta + options.length) % options.length
    })
  }

  const handleKeyDown = (event) => {
    if (disabled) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      else moveActive(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else moveActive(-1)
      return
    }

    if (event.key === 'Enter') {
      if (isOpen) {
        event.preventDefault()
        commit(options[activeIndex] || options[0])
      }
      return
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }

    if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const handleBlur = () => {
    setTouched(true)
    setOpen(false)

    // Store a trimmed value in the loan record.
    if (rawValue !== query) emitChange(query)
  }

  const renderOptionLabel = (option) => {
    if (option.type === 'existing') return option.name

    if (typeof createNewLabel === 'function') {
      return createNewLabel(option.name)
    }

    return `Create new customer "${option.name}"`
  }

  return (
    <div
      ref={rootRef}
      className={`customer-autocomplete ${className}`.trim()}
    >
      {label && (
        <label
          className="customer-autocomplete__label"
          htmlFor={inputId}
        >
          {label}
        </label>
      )}

      <input
        id={inputId}
        name={name}
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && options[activeIndex] ? optionId(activeIndex) : undefined
        }
        aria-invalid={showError}
        aria-describedby={describedBy || undefined}
        aria-label={ariaLabel}
        className="customer-autocomplete__input"
        value={rawValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
      />

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel || label || 'Customer suggestions'}
          className="customer-autocomplete__list"
        >
          {options.map((option, index) => (
            <li
              key={`${option.type}-${option.name}-${index}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              data-option-index={index}
              className={[
                'customer-autocomplete__option',
                option.type === 'create'
                  ? 'customer-autocomplete__option--create'
                  : '',
                index === activeIndex
                  ? 'customer-autocomplete__option--active'
                  : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(option)}
            >
              {renderOptionLabel(option)}
            </li>
          ))}
        </ul>
      )}

      {showNoSuggestions && (
        <p
          id={hintId}
          className="customer-autocomplete__hint"
        >
          {`Create new customer "${query}"`}
        </p>
      )}

      {showError && (
        <p
          id={errorId}
          role="alert"
          className="customer-autocomplete__error"
        >
          {error || 'Customer name is required.'}
        </p>
      )}
    </div>
  )
}

export default CustomerAutocomplete

/** Helper for form submit handlers. */
export function getTrimmedCustomerName(value) {
  return String(value ?? '').trim()
}
