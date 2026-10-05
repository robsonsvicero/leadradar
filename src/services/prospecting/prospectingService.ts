import { supabase } from '../../lib/supabase/client'
import { appEnv } from '../../config/env'
import type { DashboardStats, Lead } from '../../types'
import { hasExpiredProspectingLease } from './prospectingRecovery'

const MOCK_JOBS_KEY = 'lead-radar-demo-prospecting-jobs'
const MOCK_LEADS_KEY = 'lead-radar-demo-leads'
const MOCK_RESULTS_KEY = 'lead-radar-demo-prospecting-results'
const isMockMode = appEnv.isTest || (appEnv.isDevelopment && appEnv.prospectingMockMode)
const workerResumeAttemptAt = new Map<string, number>()

export type ProspectingStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type ProspectingJob = {
  id: string
  organization_id: string
  location: string
  segment: string
  keywords: string[]
  target_quantity: number
  status: ProspectingStatus
  companies_found: number
  companies_unique: number
  companies_analyzed: number
  hot_leads: number
  warm_leads: number
  cold_leads: number
  error_count: number
  current_step: string
  progress_percentage: number
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  worker_lease_until?: string | null
}

export type ProspectingInput = {
  organizationId: string
  location: string
  segment: string
  keywords: string[]
  targetQuantity: number
}

export type ProspectingOrganization = {
  id: string
  name: string
}

export const prospectingMockMode = isMockMode

async function invokeProspectingFunction(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.functions.invoke('prospecting-search', { body })
  if (!error) return data

  const context = 'context' in error ? error.context : null
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: string } | null
    if (payload?.error) throw new Error(payload.error)
  }
  throw new Error(error.message)
}

function readMockJobs(): ProspectingJob[] {
  return JSON.parse(localStorage.getItem(MOCK_JOBS_KEY) ?? '[]') as ProspectingJob[]
}

function writeMockJobs(jobs: ProspectingJob[]) {
  localStorage.setItem(MOCK_JOBS_KEY, JSON.stringify(jobs))
}

export async function getProspectingOrganizations(): Promise<ProspectingOrganization[]> {
  if (isMockMode) {
    return [{ id: 'demo-org', name: 'Organização de demonstração' }]
  }
  if (!supabase) {
    throw new Error('Configure o Supabase ou habilite o modo de demonstração para prospectar.')
  }

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', authData.user.id)

  if (membershipError) throw new Error(`Não foi possível carregar suas organizações: ${membershipError.message}`)
  const organizationIds = [...new Set((memberships ?? []).map((membership) => membership.organization_id))]
  if (organizationIds.length === 0) {
    throw new Error('Sua conta ainda não pertence a uma organização. Crie um workspace em Configurações antes de iniciar a prospecção real.')
  }

  const { data: organizations, error: organizationsError } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', organizationIds)

  if (organizationsError) throw new Error(`Não foi possível carregar as organizações: ${organizationsError.message}`)
  return (organizations ?? []) as ProspectingOrganization[]
}

function createMockProspectingJob(input: ProspectingInput): ProspectingJob {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const samples: Array<Pick<Lead, 'company_name' | 'city' | 'score' | 'technical_score' | 'ai_score' | 'action_score' | 'classification' | 'opportunity' | 'opportunity_reason' | 'ai_summary' | 'recommended_service' | 'confidence'>> = [
    {
      company_name: 'Empresa de demonstração A',
      city: input.location,
      score: 91,
      technical_score: 90,
      ai_score: 0,
      action_score: 0,
      classification: 'hot',
      opportunity: 'Website com oportunidade de melhoria',
      opportunity_reason: 'Resultado fictício para validar a interface; nenhuma empresa real foi consultada.',
      ai_summary: 'Registro de demonstração. Não representa uma empresa real.',
      recommended_service: 'Revisão de presença digital',
      confidence: 0.5,
    },
    {
      company_name: 'Empresa de demonstração B',
      city: input.location,
      score: 72,
      technical_score: 65,
      ai_score: 0,
      action_score: 0,
      classification: 'warm',
      opportunity: 'Sem oportunidade técnica prioritária identificada',
      opportunity_reason: 'Resultado fictício para validar a interface; nenhuma empresa real foi consultada.',
      ai_summary: 'Registro de demonstração. Não representa uma empresa real.',
      recommended_service: 'Nenhum serviço técnico específico sugerido',
      confidence: 0.5,
    },
    {
      company_name: 'Empresa de demonstração C',
      city: input.location,
      score: 44,
      technical_score: 40,
      ai_score: 0,
      action_score: 0,
      classification: 'cold',
      opportunity: 'Oportunidade não priorizada',
      opportunity_reason: 'Resultado fictício para validar a interface; nenhuma empresa real foi consultada.',
      ai_summary: 'Registro de demonstração. Não representa uma empresa real.',
      recommended_service: 'Qualificação manual',
      confidence: 0.5,
    },
  ]
  const leads = samples.slice(0, Math.min(input.targetQuantity, samples.length)).map((sample, index) => ({
    id: crypto.randomUUID(),
    organization_id: input.organizationId,
    company_id: `demo-company-${id}-${index}`,
    segment: input.segment,
    status: 'new',
    icp_match: 0,
    created_at: now,
    updated_at: now,
    ...sample,
  })) satisfies Lead[]
  const currentLeads = JSON.parse(localStorage.getItem(MOCK_LEADS_KEY) ?? '[]') as Lead[]
  localStorage.setItem(MOCK_LEADS_KEY, JSON.stringify([...leads, ...currentLeads]))
  const resultIds = JSON.parse(localStorage.getItem(MOCK_RESULTS_KEY) ?? '{}') as Record<string, string[]>
  resultIds[id] = leads.map((lead) => lead.id)
  localStorage.setItem(MOCK_RESULTS_KEY, JSON.stringify(resultIds))

  const job: ProspectingJob = {
    id,
    organization_id: input.organizationId,
    location: input.location,
    segment: input.segment,
    keywords: input.keywords,
    target_quantity: input.targetQuantity,
    status: 'completed',
    companies_found: leads.length,
    companies_unique: leads.length,
    companies_analyzed: leads.length,
    hot_leads: leads.filter((lead) => lead.classification === 'hot').length,
    warm_leads: leads.filter((lead) => lead.classification === 'warm').length,
    cold_leads: leads.filter((lead) => lead.classification === 'cold').length,
    error_count: 0,
    current_step: 'completed',
    progress_percentage: 100,
    error_message: null,
    created_at: now,
    started_at: now,
    completed_at: now,
  }
  writeMockJobs([job, ...readMockJobs()])
  return job
}

export async function createProspectingJob(input: ProspectingInput): Promise<ProspectingJob> {
  if (isMockMode) return createMockProspectingJob(input)
  if (!supabase) {
    throw new Error('Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }

  const data = await invokeProspectingFunction({
    organizationId: input.organizationId,
    location: input.location,
    segment: input.segment,
    keywords: input.keywords,
    targetQuantity: input.targetQuantity,
  })
  if (!data?.job) throw new Error(data?.error ?? 'A função de prospecção não retornou o job criado.')
  return data.job as ProspectingJob
}

export async function getProspectingJob(id: string): Promise<ProspectingJob> {
  if (isMockMode) {
    const job = readMockJobs().find((item) => item.id === id)
    if (!job) throw new Error('Prospecção de demonstração não encontrada.')
    return job
  }
  if (!supabase) throw new Error('Supabase não está configurado.')

  const { data, error } = await supabase.from('prospecting_jobs').select('*').eq('id', id).single()
  if (error) throw new Error(`Não foi possível carregar o job: ${error.message}`)
  const job = data as ProspectingJob
  const leaseExpired = hasExpiredProspectingLease(job.status, job.worker_lease_until)
  const lastResumeAttempt = workerResumeAttemptAt.get(id) ?? 0
  const canResume = leaseExpired
    && Date.now() - lastResumeAttempt >= 15000

  if (canResume) {
    workerResumeAttemptAt.set(id, Date.now())
    try {
      await invokeProspectingFunction({ action: 'continue', jobId: id })
    } catch (resumeError) {
      console.warn('Unable to request a prospecting worker resume', { jobId: id, resumeError })
    }
  } else if (!['queued', 'running'].includes(job.status)) {
    workerResumeAttemptAt.delete(id)
  }

  return job
}

export async function getProspectingResults(job: ProspectingJob): Promise<Lead[]> {
  if (isMockMode) {
    const leads = JSON.parse(localStorage.getItem(MOCK_LEADS_KEY) ?? '[]') as Lead[]
    const resultIds = JSON.parse(localStorage.getItem(MOCK_RESULTS_KEY) ?? '{}') as Record<string, string[]>
    const ids = new Set(resultIds[job.id] ?? [])
    return leads.filter((lead) => ids.has(lead.id))
  }
  if (!supabase) throw new Error('Supabase não está configurado.')

  const { data: jobCompanies, error: jobCompaniesError } = await supabase
    .from('prospecting_job_companies')
    .select('company_id')
    .eq('prospecting_job_id', job.id)
    .not('company_id', 'is', null)

  if (jobCompaniesError) throw new Error(`Não foi possível carregar as empresas processadas: ${jobCompaniesError.message}`)
  const companyIds = [...new Set((jobCompanies ?? []).map((item) => item.company_id).filter((id): id is string => Boolean(id)))]
  if (companyIds.length === 0) return []

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', job.organization_id)
    .in('company_id', companyIds)
    .order('score', { ascending: false })
  if (error) throw new Error(`Não foi possível carregar os resultados: ${error.message}`)
  return (data ?? []) as Lead[]
}

export async function cancelProspectingJob(id: string) {
  if (isMockMode) {
    const jobs = readMockJobs()
    writeMockJobs(jobs.map((job) => (job.id === id ? { ...job, status: 'cancelled' as const, current_step: 'failed' } : job)))
    return
  }
  if (!supabase) throw new Error('Supabase não está configurado.')

  await invokeProspectingFunction({ action: 'cancel', jobId: id })
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (isMockMode) {
    const leads = JSON.parse(localStorage.getItem(MOCK_LEADS_KEY) ?? '[]') as Lead[]
    const jobs = readMockJobs()
    return {
      leadsToday: leads.length,
      leadsFound: leads.length,
      hotLeads: leads.filter((lead) => lead.classification === 'hot').length,
      warmLeads: leads.filter((lead) => lead.classification === 'warm').length,
      coldLeads: leads.filter((lead) => lead.classification === 'cold').length,
      companiesAnalyzed: jobs.reduce((total, job) => total + job.companies_analyzed, 0),
      prospectingJobs: jobs.length,
      pendingContacts: leads.filter((lead) => lead.status === 'contact_pending').length,
      meetings: leads.filter((lead) => lead.status === 'meeting').length,
      opportunities: leads.filter((lead) => lead.score >= 80).length,
      isEmpty: leads.length === 0,
    }
  }
  if (supabase) {
    const [leadsResult, jobsResult] = await Promise.all([
      supabase.from('leads').select('classification,status,score'),
      supabase.from('prospecting_jobs').select('companies_analyzed'),
    ])
    if (leadsResult.error) throw new Error(`Não foi possível carregar os leads do dashboard: ${leadsResult.error.message}`)
    if (jobsResult.error) throw new Error(`Não foi possível carregar os jobs de prospecção: ${jobsResult.error.message}`)
    const leads = leadsResult.data ?? []
    const jobs = jobsResult.data ?? []

    return {
      leadsToday: leads.length,
      leadsFound: leads.length,
      hotLeads: leads.filter((lead) => lead.classification === 'hot').length,
      warmLeads: leads.filter((lead) => lead.classification === 'warm').length,
      coldLeads: leads.filter((lead) => lead.classification === 'cold').length,
      companiesAnalyzed: jobs.reduce((total, job) => total + (job.companies_analyzed ?? 0), 0),
      prospectingJobs: jobs.length,
      pendingContacts: leads.filter((lead) => lead.status === 'contact_pending').length,
      meetings: leads.filter((lead) => lead.status === 'meeting').length,
      opportunities: leads.filter((lead) => (lead.score ?? 0) >= 80).length,
      isEmpty: leads.length === 0,
    }
  }

  throw new Error('Supabase não está configurado. Configure as variáveis de ambiente para carregar os indicadores.')
}
