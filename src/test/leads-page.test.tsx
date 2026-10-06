import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LeadsPage } from '../features/leads/leads-page'
import { deleteLeads, getLeads, type LeadWithCompanyEmail } from '../services/leads/leadService'

vi.mock('../services/leads/leadService', () => ({
  deleteLeads: vi.fn(),
  getLeads: vi.fn(),
}))

const lead = {
  id: 'lead-1',
  organization_id: 'org-1',
  company_id: 'company-1',
  company_name: 'Empresa Exemplo',
  city: 'São Paulo',
  segment: 'Serviços',
  score: 80,
  technical_score: 75,
  ai_score: 80,
  action_score: 70,
  icp_match: 90,
  classification: 'hot',
  status: 'new',
  opportunity: 'Site desatualizado',
  opportunity_reason: 'O site pode melhorar.',
  ai_summary: 'Resumo do lead.',
  recommended_service: 'Criação de site',
  confidence: 0.9,
  created_at: '2026-10-05T12:00:00.000Z',
  updated_at: '2026-10-05T12:00:00.000Z',
  company_email: 'contato@empresa.com.br',
} satisfies LeadWithCompanyEmail
const secondLead = {
  ...lead,
  id: 'lead-2',
  company_id: 'company-2',
  company_name: 'Outra Empresa',
} satisfies LeadWithCompanyEmail

describe('leads page contact email', () => {
  beforeEach(() => {
    vi.mocked(deleteLeads).mockResolvedValue()
    vi.mocked(getLeads).mockResolvedValue([lead])
  })

  function renderLeadsPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LeadsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('shows the public company email as a mailto link', async () => {
    renderLeadsPage()

    const emailLink = await screen.findByRole('link', { name: 'Enviar e-mail para contato@empresa.com.br' })
    expect(emailLink).toHaveAttribute('href', 'mailto:contato@empresa.com.br')
  })

  it('shows segment and classification labels in Brazilian Portuguese', async () => {
    renderLeadsPage()

    expect(await screen.findByText('Serviços')).toBeInTheDocument()
    expect(screen.getByText('Quente')).toBeInTheDocument()
  })

  it('requires confirmation before deleting one lead', async () => {
    renderLeadsPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir lead Empresa Exemplo' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Excluir este lead?')
    expect(deleteLeads).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }))

    await waitFor(() => expect(deleteLeads).toHaveBeenCalled())
    expect(vi.mocked(deleteLeads).mock.calls[0]?.[0]).toEqual(['lead-1'])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('allows selecting and bulk deleting the filtered leads after confirmation', async () => {
    vi.mocked(getLeads).mockResolvedValue([lead, secondLead])
    renderLeadsPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Selecionar todos os leads filtrados' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir selecionados' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Excluir 2 leads?')
    expect(deleteLeads).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }))

    await waitFor(() => expect(deleteLeads).toHaveBeenCalled())
    expect(vi.mocked(deleteLeads).mock.calls[0]?.[0]).toEqual(['lead-1', 'lead-2'])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the confirmation open and explains when deletion fails', async () => {
    vi.mocked(deleteLeads).mockRejectedValue(new Error('Sem permissão para excluir leads.'))
    renderLeadsPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir lead Empresa Exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }))

    expect(await screen.findByText('Sem permissão para excluir leads.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
