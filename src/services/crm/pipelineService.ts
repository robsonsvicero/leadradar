import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from '../prospecting/prospectingService'
import { getLeads } from '../leads/leadService'
import type { Lead, LeadActivity, OrganizationMember, PipelineStage } from '../../types'

const activityStorageKey = 'lead-radar-demo-activities'
const stageTemplates = [
  ['Novo', 'new', '#64748b', 5, false, false],
  ['Qualificado', 'qualified', '#0ea5e9', 10, false, false],
  ['Contato pendente', 'contact_pending', '#6366f1', 15, false, false],
  ['Contatado', 'contacted', '#8b5cf6', 20, false, false],
  ['Respondeu', 'replied', '#d946ef', 30, false, false],
  ['Reunião', 'meeting', '#f59e0b', 45, false, false],
  ['Proposta', 'proposal', '#f97316', 60, false, false],
  ['Negociação', 'negotiation', '#ef4444', 75, false, false],
  ['Ganho', 'won', '#16a34a', 100, true, false],
  ['Perdido', 'lost', '#475569', 0, false, true],
] as const

export function createDefaultPipelineStages(organizationId: string): PipelineStage[] {
  return stageTemplates.map(([name, slug, color, probability, is_won, is_lost], position) => ({
    id: `demo-stage-${organizationId}-${slug}`,
    organization_id: organizationId,
    name,
    slug,
    description: null,
    color,
    position,
    probability,
    is_won,
    is_lost,
    is_active: true,
  }))
}

export type PipelineWorkspace = {
  demoMode: boolean
  leads: Lead[]
  stages: PipelineStage[]
  members: OrganizationMember[]
  currentRoles: Record<string, OrganizationMember['role']>
  totalLeads: number
  isPartial: boolean
}

export type PipelineOutcome = {
  wonReason?: string
  wonService?: string
  lostReason?: string
  lostNotes?: string
}

export async function getPipelineWorkspace(): Promise<PipelineWorkspace> {
  if (prospectingMockMode) {
    const leads = await getLeads()
    const organizationIds = [...new Set(leads.map((lead) => lead.organization_id))]
    const stages = organizationIds.flatMap((organizationId) => createDefaultPipelineStages(organizationId))
    return {
      demoMode: true,
      leads: leads.map((lead) => {
        if (lead.pipeline_stage_id) return lead
        const stage = stages.find((item) => item.organization_id === lead.organization_id && item.slug === lead.status)
        return { ...lead, pipeline_stage_id: stage?.id ?? null }
      }),
      stages,
      members: [],
      currentRoles: {},
      totalLeads: leads.length,
      isPartial: false,
    }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: memberships, error: membershipsError } = await supabase.from('organization_members')
    .select('organization_id,role')
    .eq('user_id', authData.user.id)
  if (membershipsError) throw new Error(`Não foi possível carregar as organizações: ${membershipsError.message}`)
  const currentRoles = Object.fromEntries(
    (memberships ?? []).map((membership) => [membership.organization_id, membership.role]),
  ) as Record<string, OrganizationMember['role']>
  const organizationIds = Object.keys(currentRoles)
  if (!organizationIds.length) {
    return { demoMode: false, leads: [], stages: [], members: [], currentRoles, totalLeads: 0, isPartial: false }
  }

  const [leadResult, stageResult, memberResult] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact' })
      .in('organization_id', organizationIds).order('created_at', { ascending: false }).range(0, 499),
    supabase.from('pipeline_stages').select('*')
      .in('organization_id', organizationIds).order('position'),
    supabase.rpc('get_organization_member_roster', { target_organization_ids: organizationIds }),
  ])

  if (leadResult.error) throw new Error(`Não foi possível carregar o pipeline: ${leadResult.error.message}`)
  if (stageResult.error) throw new Error(`Não foi possível carregar as etapas. Verifique se a migration do CRM foi aplicada: ${stageResult.error.message}`)
  if (memberResult.error) throw new Error(`Não foi possível carregar os responsáveis. Verifique se a migration 20261004190000_crm_pipeline_operations.sql foi aplicada: ${memberResult.error.message}`)
  const roster = (memberResult.data ?? []) as {
    organization_id: string
    user_id: string
    member_role: OrganizationMember['role']
    full_name: string | null
  }[]
  const members = roster.map((member) => ({
    organization_id: member.organization_id,
    user_id: member.user_id,
    role: member.member_role,
    full_name: member.full_name,
  }))
  const leads = (leadResult.data ?? []) as Lead[]

  return {
    demoMode: false,
    leads,
    stages: (stageResult.data ?? []) as PipelineStage[],
    members,
    currentRoles,
    totalLeads: leadResult.count ?? leads.length,
    isPartial: leads.length < (leadResult.count ?? leads.length),
  }
}

export async function updateLeadPipelineStage(
  lead: Lead,
  stage: PipelineStage,
  outcome?: PipelineOutcome,
): Promise<Lead> {
  if (stage.organization_id !== lead.organization_id) {
    throw new Error('A etapa selecionada não pertence à organização deste lead.')
  }
  const changes = buildPipelineStageChanges(lead, stage, new Date().toISOString(), outcome)

  if (prospectingMockMode) {
    const allLeads = await getLeads()
    const updatedLead = { ...lead, ...changes }
    const nextLeads = allLeads.map((item) => item.id === lead.id ? updatedLead : item)
    localStorage.setItem('lead-radar-demo-leads', JSON.stringify(nextLeads))
    return updatedLead
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('leads').update(changes).eq('id', lead.id).select('*').single()
  if (error) throw new Error(`Não foi possível alterar a etapa: ${error.message}`)
  return data as Lead
}

export function buildPipelineStageChanges(
  lead: Lead,
  stage: PipelineStage,
  now: string,
  outcome?: PipelineOutcome,
): Partial<Lead> {
  if (stage.is_won && (!outcome?.wonService?.trim() || !outcome.wonReason?.trim())) {
    throw new Error('Informe o serviço vendido e o motivo da vitória.')
  }
  if (stage.is_lost && !outcome?.lostReason?.trim()) {
    throw new Error('Selecione o motivo da perda.')
  }
  const knownStatuses = new Set([
    'new', 'qualified', 'contact_pending', 'contacted', 'replied', 'meeting',
    'proposal', 'negotiation', 'won', 'lost',
  ])
  const changes: Partial<Lead> = {
    pipeline_stage_id: stage.id,
    won_at: stage.is_won ? now : null,
    won_reason: stage.is_won ? outcome?.wonReason?.trim() ?? null : null,
    won_service: stage.is_won ? outcome?.wonService?.trim() ?? null : null,
    lost_at: stage.is_lost ? now : null,
    lost_reason: stage.is_lost ? outcome?.lostReason ?? null : null,
    lost_notes: stage.is_lost ? outcome?.lostNotes?.trim() || null : null,
    updated_at: now,
  }
  if (knownStatuses.has(stage.slug)) changes.status = stage.slug
  if (stage.slug === 'qualified' && !lead.qualified_at) changes.qualified_at = now
  if (stage.slug === 'contacted') changes.last_contact_at = now
  if (stage.slug === 'replied') changes.last_response_at = now
  return changes
}

export async function updateLeadOwner(lead: Lead, ownerId: string | null): Promise<Lead> {
  if (prospectingMockMode) {
    const allLeads = await getLeads()
    const updatedLead = { ...lead, owner_id: ownerId, updated_at: new Date().toISOString() }
    localStorage.setItem(
      'lead-radar-demo-leads',
      JSON.stringify(allLeads.map((item) => item.id === lead.id ? updatedLead : item)),
    )
    return updatedLead
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('leads').update({ owner_id: ownerId }).eq('id', lead.id).select('*').single()
  if (error) throw new Error(`Não foi possível atribuir o responsável. Somente owner/admin podem reassinar leads: ${error.message}`)
  return data as Lead
}

export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  if (prospectingMockMode) {
    const raw = localStorage.getItem(activityStorageKey)
    const activities = raw ? JSON.parse(raw) as LeadActivity[] : []
    return activities.filter((activity) => activity.lead_id === leadId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('lead_activities')
    .select('id,organization_id,lead_id,user_id,type,title,description,metadata,created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`Não foi possível carregar a timeline do lead: ${error.message}`)
  return (data ?? []) as LeadActivity[]
}

export async function addLeadNoteActivity(lead: Lead, note: string): Promise<LeadActivity | null> {
  const trimmedNote = note.trim()
  if (!trimmedNote) throw new Error('Escreva uma nota antes de salvá-la.')
  if (prospectingMockMode) {
    const activity: LeadActivity = {
      id: crypto.randomUUID(),
      organization_id: lead.organization_id,
      lead_id: lead.id,
      user_id: null,
      type: 'note_added',
      title: 'Nota adicionada',
      description: trimmedNote,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    const raw = localStorage.getItem(activityStorageKey)
    const activities = raw ? JSON.parse(raw) as LeadActivity[] : []
    localStorage.setItem(activityStorageKey, JSON.stringify([activity, ...activities]))
    return activity
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')
  const { data, error } = await supabase.from('lead_activities').insert({
    organization_id: lead.organization_id,
    lead_id: lead.id,
    user_id: authData.user.id,
    type: 'note_added',
    title: 'Nota adicionada',
    description: trimmedNote,
  }).select('id,organization_id,lead_id,user_id,type,title,description,metadata,created_at').single()
  if (error) throw new Error(`Não foi possível salvar a nota: ${error.message}`)
  return data as LeadActivity
}
