import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DailyRadarPage } from '../features/prospecting/daily-radar-page'
import { getDailyRadarSnapshot, type DailyRadarSnapshot } from '../services/prospecting/dailyRadarService'

vi.mock('../services/prospecting/dailyRadarService', () => ({
  getDailyRadarSnapshot: vi.fn(),
}))

const snapshot: DailyRadarSnapshot = {
  demoMode: false,
  settings: [{
    organization_id: 'org-1',
    organization_name: 'Lead Radar',
    enabled: true,
    run_time: '08:00',
    timezone: 'America/Sao_Paulo',
    leads_per_day: 50,
    minimum_score: 60,
    alert_score: 85,
  }],
  runs: [{
    organization_id: 'org-1',
    organization_name: 'Lead Radar',
    local_date: '2026-10-05',
    status: 'completed',
    error_message: null,
    started_at: '2026-10-05T11:00:00.000Z',
    prospecting_job_id: 'job-1',
  }],
  leads: [
    {
      id: 'lead-1',
      organization_id: 'org-1',
      company_id: 'company-1',
      company_name: 'Academia Horizonte',
      city: 'São Paulo, SP',
      segment: 'Academias',
      score: 92,
      technical_score: 80,
      ai_score: 0,
      action_score: 0,
      icp_match: 80,
      classification: 'hot',
      status: 'new',
      opportunity: 'Site sem formulário de contato',
      opportunity_reason: 'Não foi encontrado um formulário no site.',
      ai_summary: '',
      recommended_service: 'Site institucional',
      confidence: 0.8,
      created_at: '2026-10-05T11:05:00.000Z',
      updated_at: '2026-10-05T11:05:00.000Z',
      company_email: 'contato@horizonte.example',
      company_website: 'https://horizonte.example',
      company_phone: '+55 11 3333-3333',
      prospecting_job_id: 'job-1',
    },
    {
      id: 'lead-2',
      organization_id: 'org-1',
      company_id: 'company-2',
      company_name: 'Clínica Central',
      city: 'Campinas, RJ',
      segment: 'Clínicas',
      score: 74,
      technical_score: 70,
      ai_score: 0,
      action_score: 0,
      icp_match: 70,
      classification: 'warm',
      status: 'contacted',
      opportunity: 'Presença digital a melhorar',
      opportunity_reason: 'Informações públicas indicam espaço para melhoria.',
      ai_summary: '',
      recommended_service: 'Otimização de site',
      confidence: 0.7,
      created_at: '2026-10-05T11:05:00.000Z',
      updated_at: '2026-10-05T11:05:00.000Z',
      company_email: null,
      company_website: null,
      company_phone: null,
      prospecting_job_id: 'job-1',
    },
  ],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DailyRadarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('daily radar page', () => {
  beforeEach(() => {
    vi.mocked(getDailyRadarSnapshot).mockResolvedValue(snapshot)
  })

  it('shows automatic search status, filters, and ranked daily opportunities', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Radar Diário' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Resumo da prospecção automática' })).toHaveTextContent('08:00')
    expect(screen.getByRole('region', { name: 'Resumo da prospecção automática' })).toHaveTextContent('Ativada')
    expect(screen.getByRole('region', { name: 'Resumo da prospecção automática' })).toHaveTextContent('Execução de hoje: concluída')
    expect(screen.getByRole('link', { name: 'Configurar' })).toHaveAttribute('href', '/settings')
    expect(screen.getAllByRole('link', { name: 'Gerar abordagem' })[0]).toHaveAttribute('href', '/companies/company-1#outreach')
    expect(screen.getAllByRole('link', { name: 'Ver lead' })).toHaveLength(2)

    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'RJ' } })
    expect(screen.getAllByRole('link', { name: 'Ver lead' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Clínica Central' })).toBeInTheDocument()
  })

  it('shows an actionable empty state when automatic prospecting is not configured', async () => {
    vi.mocked(getDailyRadarSnapshot).mockResolvedValue({
      settings: [],
      runs: [],
      leads: [],
      demoMode: false,
    })
    renderPage()

    expect(await screen.findByText('A automação ainda não foi configurada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir configurações' })).toHaveAttribute('href', '/settings')
  })
})
