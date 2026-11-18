import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CustomerAutocomplete, {
  getTrimmedCustomerName
} from './CustomerAutocomplete'

const EXISTING = [
  'Ravi Kumar',
  'ravi sharma',
  'Anita Rao',
  'Ravi Kumar'
]

function ControlledField(props) {
  const [value, setValue] = useState(props.initialValue ?? '')

  return (
    <>
      <CustomerAutocomplete
        label="Customer Name *"
        value={value}
        onChange={setValue}
        existingCustomers={EXISTING}
        {...props}
      />
      <output data-testid="stored-name">{value}</output>
    </>
  )
}

describe('CustomerAutocomplete', () => {
  it('filters existing customers by the typed value (case-insensitive)', () => {
    render(<ControlledField />)

    const input = screen.getByRole('combobox', {
      name: /customer name/i
    })

    fireEvent.change(input, { target: { value: 'ravi' } })

    const options = screen.getAllByRole('option')
    const labels = options.map((option) => option.textContent)

    expect(labels).toContain('Ravi Kumar')
    expect(labels).toContain('ravi sharma')
    expect(labels).not.toContain('Anita Rao')
  })

  it('selects an existing customer and stores the exact stored name', () => {
    const onChange = vi.fn()
    const onCreateNew = vi.fn()

    render(
      <CustomerAutocomplete
        label="Customer Name *"
        value="ravi"
        onChange={onChange}
        existingCustomers={EXISTING}
        onCreateNew={onCreateNew}
      />
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)

    fireEvent.click(
      screen.getByRole('option', { name: 'Ravi Kumar' })
    )

    expect(onChange).toHaveBeenCalledWith('Ravi Kumar')
    expect(onCreateNew).not.toHaveBeenCalled()
  })

  it('offers creation only when the name is not already present', () => {
    const { rerender } = render(
      <CustomerAutocomplete
        label="Customer Name *"
        value="Ravi Kumar"
        onChange={vi.fn()}
        existingCustomers={EXISTING}
      />
    )

    fireEvent.focus(screen.getByRole('combobox'))

    expect(
      screen.queryByRole('option', {
        name: /create new customer/i
      })
    ).toBeNull()

    rerender(
      <CustomerAutocomplete
        label="Customer Name *"
        value="Meera Iyer"
        onChange={vi.fn()}
        existingCustomers={EXISTING}
      />
    )

    expect(
      screen.getByRole('option', {
        name: 'Create new customer "Meera Iyer"'
      })
    ).toBeInTheDocument()
  })

  it('stores the new name when the create option is chosen', () => {
    const onChange = vi.fn()
    const onCreateNew = vi.fn()

    render(
      <CustomerAutocomplete
        label="Customer Name *"
        value="Meera Iyer"
        onChange={onChange}
        existingCustomers={EXISTING}
        onCreateNew={onCreateNew}
      />
    )

    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.click(
      screen.getByRole('option', {
        name: 'Create new customer "Meera Iyer"'
      })
    )

    expect(onChange).toHaveBeenCalledWith('Meera Iyer')
    expect(onCreateNew).toHaveBeenCalledWith('Meera Iyer')
  })

  it('clears the loan record value when the field is cleared', () => {
    render(<ControlledField initialValue="Ravi Kumar" />)

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '' } })

    expect(screen.getByTestId('stored-name')).toHaveTextContent('')
  })

  it('trims whitespace before storing the value on blur', () => {
    render(<ControlledField initialValue="  Meera Iyer  " />)

    const input = screen.getByRole('combobox')
    fireEvent.blur(input)

    expect(screen.getByTestId('stored-name')).toHaveTextContent('Meera Iyer')
    expect(getTrimmedCustomerName('  Meera Iyer  ')).toBe('Meera Iyer')
  })

  it('supports keyboard selection and exposes combobox ARIA state', () => {
    const onChange = vi.fn()

    render(
      <CustomerAutocomplete
        label="Customer Name *"
        value="Ani"
        onChange={onChange}
        existingCustomers={EXISTING}
      />
    )

    const input = screen.getByRole('combobox')

    expect(input).toHaveAttribute('aria-expanded', 'false')

    fireEvent.focus(input)

    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox').id
    )

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('Anita Rao')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows an accessible error for an empty required name', () => {
    render(<ControlledField required />)

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Customer name is required.'
    )
  })
})
