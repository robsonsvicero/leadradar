import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CompaniesPage } from '../features/companies/companies-page'
import { createCompany, getCompanies, getCompanyOrganizations } from '../services/companies/companyService'

vi.mock('../services/companies/companyService', () => ({
  createCompany: vi.fn(),
  getCompanies: vi.fn(),
  getCompanyOrganizations: vi.fn(),
}))

describe('companies page manual creation', () => {
  beforeEach(() => {
    vi.mocked(createCompany).mockResolvedValue({
      id: 'company-new',
      organization_id: 'org-1',
      name: 'Empresa Nova',
      category: 'Consultoria',
      description: '',
      email: 'contato@empresa.com',
      website: '',
      phone: null,
      address: null,
      city: '',
      state: '',
      country: '',
      rating: null,
      review_count: 0,
      source: 'Manual',
      created_at: '2026-10-05T12:00:00.000Z',
      updated_at: '2026-10-05T12:00:00.000Z',
    })
    vi.mocked(getCompanies).mockResolvedValue([])
    vi.mocked(getCompanyOrganizations).mockResolvedValue([{ id: 'org-1', name: 'Minha organização' }])
  })

  it('opens the manual form and saves the company to the single available organization', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompaniesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Nova empresa' }))
    fireEvent.change(await screen.findByLabelText('Nome da empresa *'), { target: { value: 'Empresa Nova' } })
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'Consultoria' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'contato@empresa.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))

    await waitFor(() => expect(vi.mocked(createCompany).mock.calls[0]?.[0]).toEqual({
      organization_id: 'org-1',
      name: 'Empresa Nova',
      category: 'Consultoria',
      description: null,
      email: 'contato@empresa.com',
      website: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      country: null,
    }))
    expect(await screen.findByRole('button', { name: 'Nova empresa' })).toBeInTheDocument()
  })
})
