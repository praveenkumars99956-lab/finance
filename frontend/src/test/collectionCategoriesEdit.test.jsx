import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notify } from '../utils/notify'
import CollectionCategories from '../pages/admin/CollectionCategories'

const categories = [
  {
    id: 'cat-1',
    category_name: 'Monday Collection',
    description: 'Every Monday',
    status: 'active',
    category_type: 'weekly'
  }
]

const query = {
  select: vi.fn(() => query),
  order: vi.fn(() => Promise.resolve({ data: categories, error: null })),
  update: vi.fn(() => query),
  insert: vi.fn(() => Promise.resolve({ error: null })),
  delete: vi.fn(() => query),
  eq: vi.fn(() => Promise.resolve({ error: null }))
}

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn(() => query),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })) }
  }
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key })
}))

vi.mock('../utils/notify', () => ({ notify: vi.fn() }))

describe('CollectionCategories edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('scrollTo', vi.fn())
  })

  it('opens the form with the selected category', async () => {
    render(<CollectionCategories />)

    expect(await screen.findByText('Monday Collection')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Monday Collection')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'edit' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Monday Collection')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Every Monday')).toBeInTheDocument()
    expect(screen.getByText('editCollectionCategory')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'updateCategory' }))

    await waitFor(() => {
      expect(query.update).toHaveBeenCalled()
    })
    expect(query.update.mock.calls.at(-1)[0]).toMatchObject({
      category_name: 'Monday Collection',
      category_type: 'weekly'
    })
    expect(query.update.mock.calls.at(-1)[0]).toHaveProperty(
      'updated_at'
    )
  })

  it('retries an edit when category_type is not in the database yet', async () => {
    query.eq
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'category_type' column of 'collection_categories' in the schema cache"
        }
      })
      .mockResolvedValueOnce({ error: null })

    render(<CollectionCategories />)

    expect(await screen.findByText('Monday Collection')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Monday Collection')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'updateCategory' }))

    await waitFor(() => {
      expect(query.update).toHaveBeenCalledTimes(2)
    })
    expect(query.update.mock.calls.at(-1)[0]).not.toHaveProperty('category_type')
  })

  it('keeps created_by when retrying a create without category_type', async () => {
    query.insert
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message:
            "Could not find the 'category_type' column of 'collection_categories' in the schema cache"
        }
      })
      .mockResolvedValueOnce({ error: null })

    render(<CollectionCategories />)

    expect(await screen.findByText('Monday Collection')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'addCollectionCategory' })
    )
    fireEvent.change(
      screen.getByPlaceholderText('exampleMondayCollection'),
      { target: { value: 'Tuesday Collection' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'addCategory' })
    )

    await waitFor(() => {
      expect(query.insert).toHaveBeenCalledTimes(2)
    })
    expect(query.insert.mock.calls.at(-1)[0]).toMatchObject({
      category_name: 'Tuesday Collection',
      created_by: 'u1'
    })
    expect(query.insert.mock.calls.at(-1)[0]).not.toHaveProperty(
      'category_type'
    )
  })

  it('reports a blocked update instead of leaving stale list data', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    query.eq.mockResolvedValueOnce({ data: [], error: null })

    render(<CollectionCategories />)

    expect(await screen.findByText('Monday Collection')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Monday Collection')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'updateCategory' }))

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('categoryUpdateFailed')
    })
  })
})
