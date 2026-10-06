import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type { Lead } from '../../types'

const STORAGE_KEY = 'lead-radar-demo-leads'

export type LeadWithCompanyEmail = Lead & { company_email: string | null }

type LeadWithCompanyRelation = Lead & {
  companies: { email: string | null } | null
}

const emptyLeads: LeadWithCompanyEmail[] = []

export function getLeadOpportunityText(lead: Pick<Lead, 'opportunity' | 'opportunity_override'>) {
  return lead.opportunity_override?.trim() || lead.opportunity
}

function mapLeadWithCompanyEmail(row: LeadWithCompanyRelation): LeadWithCompanyEmail {
  const { companies, ...lead } = row
  return { ...lead, company_email: companies?.email ?? null }
}

export async function getLeads(): Promise<LeadWithCompanyEmail[]> {
  if (prospectingMockMode) {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Lead[]).map((lead) => ({ ...lead, company_email: null })) : emptyLeads
  }
  if (supabase) {
    const { data, error } = await supabase.from('leads').select('*, companies(email)').order('created_at', { ascending: false })
    if (error) {
      throw new Error(`Não foi possível carregar os leads: ${error.message}`)
    }
    return (data ?? []).map((row) => mapLeadWithCompanyEmail(row as LeadWithCompanyRelation))
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return emptyLeads
  }

  return (JSON.parse(raw) as Lead[]).map((lead) => ({ ...lead, company_email: null }))
}

export async function getLeadById(id: string) {
  const leads = await getLeads()
  return leads.find((lead) => lead.id === id) ?? null
}

export async function getLeadByCompanyId(companyId: string) {
  if (prospectingMockMode) {
    const leads = await getLeads()
    return leads.find((lead) => lead.company_id === companyId) ?? null
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('leads')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Não foi possível carregar o lead desta empresa: ${error.message}`)
  return data as Lead | null
}

export async function updateLeadStatus(id: string, status: string) {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) {
      throw new Error(error.message)
    }
    return data as Lead
  }

  const leads = await getLeads()
  const nextLeads = leads.map((lead) =>
    lead.id === id ? { ...lead, status, updated_at: new Date().toISOString() } : lead,
  )

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLeads))
  return nextLeads.find((lead) => lead.id === id) ?? null
}

export async function updateLeadOpportunity(id: string, opportunityOverride: string | null): Promise<Lead> {
  const normalizedOverride = opportunityOverride?.trim() || null
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase
      .from('leads')
      .update({ opportunity_override: normalizedOverride, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(`Não foi possível atualizar a oportunidade: ${error.message}`)
    return data as Lead
  }

  const leads = await getLeads()
  const targetExists = leads.some((lead) => lead.id === id)
  if (!targetExists) throw new Error('Lead não encontrado. Atualize a lista e tente novamente.')
  const updatedLeads = leads.map((lead) => lead.id === id
    ? { ...lead, opportunity_override: normalizedOverride, updated_at: new Date().toISOString() }
    : lead)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLeads))
  const updatedLead = updatedLeads.find((lead) => lead.id === id)
  if (!updatedLead) throw new Error('Não foi possível recuperar o lead atualizado.')
  return updatedLead
}

export async function deleteLeads(ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))]
  if (uniqueIds.length === 0) throw new Error('Selecione pelo menos um lead para excluir.')

  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('leads').delete().in('id', uniqueIds).select('id')
    if (error) throw new Error(`Não foi possível excluir os leads: ${error.message}`)
    if ((data ?? []).length !== uniqueIds.length) {
      throw new Error('Não foi possível excluir todos os leads. Verifique se você é proprietário ou administrador da organização e atualize a lista.')
    }
    return
  }

  const leads = await getLeads()
  const leadsToDelete = leads.filter((lead) => uniqueIds.includes(lead.id))
  if (leadsToDelete.length !== uniqueIds.length) {
    throw new Error('Um ou mais leads não foram encontrados. Atualize a lista e tente novamente.')
  }
  const idsToDelete = new Set(uniqueIds)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads.filter((lead) => !idsToDelete.has(lead.id))))
}

export async function createLead(input: Partial<Lead>) {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('leads').insert(input).select().single()
    if (error) {
      throw new Error(error.message)
    }
    return data as Lead
  }

  const existing = await getLeads()
  const nextLead: Lead = {
    id: input.id ?? crypto.randomUUID(),
    organization_id: input.organization_id ?? 'demo-org',
    company_id: input.company_id ?? 'demo-company',
    company_name: input.company_name ?? 'Nova empresa',
    city: input.city ?? 'São Paulo',
    segment: input.segment ?? 'Agência',
    score: input.score ?? 75,
    technical_score: input.technical_score ?? 60,
    ai_score: input.ai_score ?? 80,
    action_score: input.action_score ?? 70,
    icp_match: input.icp_match ?? 0,
    classification: input.classification ?? 'warm',
    status: input.status ?? 'new',
    opportunity: input.opportunity ?? 'N/A',
    opportunity_reason: input.opportunity_reason ?? 'Lead recém adicionado ao radar.',
    ai_summary: input.ai_summary ?? 'Resumo inicial disponível após análise.',
    recommended_service: input.recommended_service ?? 'Landing page e automação',
    confidence: input.confidence ?? 0.82,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...input,
  } as Lead

  const nextLeads = [nextLead, ...existing]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLeads))
  return nextLead
}
