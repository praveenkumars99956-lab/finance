import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminCreate from './AdminCreate'

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000'

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn()
}))

vi.mock('../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock
    }
  }
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}))

vi.mock('react-i18next', () => {
  const i18n = { language: 'en' }
  const t = (key, options) =>
    key === 'tenantLoginEmail' && options?.email
      ? `Tenant login email: ${options.email}`
      : key

  return {
    useTranslation: () => ({ t, i18n })
  }
})

function fillForm() {
  fireEvent.change(screen.getByLabelText('fullName'), {
    target: { value: 'Ravi Kumar' }
  })
  fireEvent.change(screen.getByLabelText('workspaceName'), {
    target: { value: 'Ravi Finance' }
  })
  fireEvent.change(screen.getByLabelText('email'), {
    target: { value: 'ravi@example.com' }
  })
  fireEvent.change(screen.getByLabelText('password'), {
    target: { value: 'password123' }
  })
}

describe('AdminCreate', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('derives the tenant login email when the function omits it', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, workspace_id: WORKSPACE_ID },
      error: null
    })

    render(<AdminCreate />)
    fillForm()
    fireEvent.click(
      screen.getByRole('button', { name: 'createAdminWorkspace' })
    )

    expect(
      await screen.findByText(
        'Tenant login email: ravi+123e4567e89b12d3a456426614174000@example.com'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
