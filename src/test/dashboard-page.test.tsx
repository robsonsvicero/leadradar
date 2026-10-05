import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from '../features/dashboard/dashboard-page'
import { getLeads, type LeadWithCompanyEmail } from '../services/leads/leadService'

vi.mock('../services/leads/leadService', () => ({
  getLeads: vi.fn(),
}))

vi.mock('../services/prospecting/prospectingService', () => ({
  prospectingMockMode: false,
}))

const currentDate = new Date().toISOString()
const leads: LeadWithCompanyEmail[] = [
  {
    id: 'lead-hot',
    organization_id: 'org-1',
    company_id: 'company-hot',
    company_name: 'Empresa Quente',
    city: 'São Paulo',
    segment: 'Tecnologia',
    score: 95,
    technical_score: 90,
    ai_score: 85,
    action_score: 88,
    icp_match: 75,
    classification: 'hot',
    status: 'replied',
    last_contact_at: currentDate,
    last_response_at: currentDate,
    opportunity: 'Oportunidade de otimização',
    opportunity_reason: 'Site sem formulário de contato.',
    ai_summary: '',
    recommended_service: 'Site institucional',
    confidence: 0.9,
    created_at: currentDate,
    updated_at: currentDate,
    company_email: '=contato@example.com',
  },
  {
    id: 'lead-won',
    organization_id: 'org-1',
    company_id: 'company-won',
    company_name: 'Empresa Fechada',
    city: 'Campinas',
    segment: 'Serviços',
    score: 90,
    technical_score: 88,
    ai_score: 90,
    action_score: 80,
    icp_match: 70,
    classification: 'warm',
    status: 'won',
    last_contact_at: currentDate,
    opportunity: 'Oportunidade de criação',
    opportunity_reason: 'Sem presença digital.',
    ai_summary: '',
    recommended_service: 'Site institucional',
    confidence: 0.85,
    created_at: currentDate,
    updated_at: currentDate,
    company_email: null,
  },
  {
    id: 'lead-cold',
    organization_id: 'org-1',
    company_id: 'company-cold',
    company_name: 'Empresa em avaliação',
    city: 'Santos',
    segment: 'Comércio',
    score: 55,
    technical_score: 50,
    ai_score: 60,
    action_score: 55,
    icp_match: 40,
    classification: 'cold',
    status: 'new',
    opportunity: 'Presença digital a avaliar',
    opportunity_reason: 'Há informações insuficientes.',
    ai_summary: '',
    recommended_service: 'Site institucional',
    confidence: 0.6,
    created_at: currentDate,
    updated_at: currentDate,
    company_email: null,
  },
]

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('dashboard page', () => {
  beforeEach(() => {
    vi.mocked(getLeads).mockResolvedValue(leads)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the compact pipeline metrics and sorts opportunity cards by score', async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Indicadores do pipeline' })).toBeInTheDocument()
    expect(screen.getByText('Leads hoje')).toBeInTheDocument()
    expect(screen.getByText('Contatados')).toBeInTheDocument()
    expect(screen.getByText('Respostas')).toBeInTheDocument()
    expect(screen.getByText('Conversão')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()

    const companyLinks = screen.getAllByRole('link', { name: /Empresa (Quente|Fechada)/ })
    expect(companyLinks.map((link) => link.textContent)).toEqual(['Empresa Quente', 'Empresa Fechada'])
    expect(screen.getAllByRole('link', { name: /Ver lead/ }).map((link) => link.getAttribute('href'))).toEqual([
      '/companies/company-hot',
      '/companies/company-won',
    ])
    expect(screen.getAllByRole('link', { name: /Preparar abordagem/ })[0]).toHaveAttribute('href', '/companies/company-hot')
  })

  it('exports leads as a CSV while protecting spreadsheet formula-like values', async () => {
    let exportedBlob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (blob instanceof Blob) exportedBlob = blob
      return 'blob:dashboard-export'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    renderDashboard()
    fireEvent.click(await screen.findByRole('button', { name: /Exportar CSV/ }))

    expect(clickSpy).toHaveBeenCalledOnce()
    expect(exportedBlob).toBeInstanceOf(Blob)
    await expect(exportedBlob?.text()).resolves.toContain("'=contato@example.com")
  })
})
