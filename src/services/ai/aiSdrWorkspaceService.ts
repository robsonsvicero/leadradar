import { getLeads } from '../leads/leadService'
import { prospectingMockMode } from '../prospecting/prospectingService'
import { supabase } from '../../lib/supabase/client'
import type { Lead, TaskItem } from '../../types'
import type { OutreachDraft } from './aiService'

const DEMO_TASKS_KEY = 'lead-radar-demo-tasks'

type WorkspaceLead = Pick<
  Lead,
  | 'id'
  | 'organization_id'
  | 'company_id'
  | 'company_name'
  | 'city'
  | 'segment'
  | 'classification'
  | 'status'
  | 'action_score'
  | 'technical_score'
  | 'opportunity'
  | 'opportunity_override'
  | 'ai_updated_at'
  | 'created_at'
>

export type WorkspaceTask = Omit<Pick<
  TaskItem,
  'id' | 'organization_id' | 'lead_id' | 'title' | 'description' | 'type' | 'priority' | 'status' | 'due_at' | 'created_at'
>, 'due_at' | 'lead_id'> & { due_at: string | null; lead_id: string | null }

export type WorkspaceDraft = Pick<
  OutreachDraft,
  'id' | 'channel' | 'status' | 'approved_variant' | 'approved_at' | 'created_at'
> & {
  lead_id: string
}

export type WorkspaceRecommendation = {
  id: string
  leadId: string
  action: string
  reason: string
  createdAt: string
}

export type AISDRWorkspaceData = {
  demoMode: boolean
  hasOrganization: boolean
  leads: WorkspaceLead[]
  tasks: WorkspaceTask[]
  drafts: WorkspaceDraft[]
  recommendations: WorkspaceRecommendation[]
  openTaskCount: number
  followUpCount: number
  approvedDraftCount: number
}

type AnalysisLogRow = {
  id: string
  lead_id: string | null
  output_data: unknown
  created_at: string
}

export function mapAIAnalysisRecommendation(log: AnalysisLogRow): WorkspaceRecommendation | null {
  if (!log.lead_id || !log.output_data || typeof log.output_data !== 'object') return null
  const output = log.output_data as Record<string, unknown>
  if (!output.nextBestAction || typeof output.nextBestAction !== 'object') return null
  const action = output.nextBestAction as Record<string, unknown>
  if (typeof action.action !== 'string' || typeof action.reason !== 'string') return null
  if (action.action === 'wait' || action.action === 'disqualify') return null
  return {
    id: log.id,
    leadId: log.lead_id,
    action: action.action,
    reason: action.reason,
    createdAt: log.created_at,
  }
}

function localDemoTasks(): WorkspaceTask[] {
  const raw = localStorage.getItem(DEMO_TASKS_KEY)
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('As tarefas locais de demonstração estão em um formato inválido.')
  return parsed as WorkspaceTask[]
}

function mapDemoLeads(leads: Lead[]): WorkspaceLead[] {
  return leads.map((lead) => ({
    id: lead.id,
    organization_id: lead.organization_id,
    company_id: lead.company_id,
    company_name: lead.company_name,
    city: lead.city,
    segment: lead.segment,
    classification: lead.classification,
    status: lead.status,
    action_score: lead.action_score,
    technical_score: lead.technical_score,
    opportunity: lead.opportunity,
    opportunity_override: lead.opportunity_override ?? null,
    ai_updated_at: lead.ai_updated_at ?? null,
    created_at: lead.created_at,
  }))
}

export async function getAISDRWorkspaceData(): Promise<AISDRWorkspaceData> {
  if (prospectingMockMode) {
    const [leads, localTasks] = await Promise.all([getLeads(), Promise.resolve(localDemoTasks())])
    const tasks = localTasks.filter((task) => task.status !== 'done')
    return {
      demoMode: true,
      hasOrganization: true,
      leads: mapDemoLeads(leads),
      tasks,
      drafts: [],
      recommendations: [],
      openTaskCount: tasks.length,
      followUpCount: tasks.filter((task) => task.type.toLocaleLowerCase('pt-BR').includes('follow')).length,
      approvedDraftCount: 0,
    }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', authData.user.id)
  if (membershipError) throw new Error(`Não foi possível carregar as organizações: ${membershipError.message}`)
  const organizationIds = [...new Set((memberships ?? []).map((membership) => membership.organization_id))]
  if (!organizationIds.length) {
    return {
      demoMode: false,
      hasOrganization: false,
      leads: [],
      tasks: [],
      drafts: [],
      recommendations: [],
      openTaskCount: 0,
      followUpCount: 0,
      approvedDraftCount: 0,
    }
  }

  const [leadsResult, tasksResult, followUpCountResult, draftsResult, analysisResult] = await Promise.all([
    supabase.from('leads')
      .select('id,organization_id,company_id,company_name,city,segment,classification,status,action_score,technical_score,opportunity,opportunity_override,ai_updated_at,created_at')
      .in('organization_id', organizationIds)
      .order('action_score', { ascending: false })
      .limit(200),
    supabase.from('tasks')
      .select('id,organization_id,lead_id,title,description,type,priority,status,due_at,created_at', { count: 'exact' })
      .in('organization_id', organizationIds)
      .neq('status', 'done')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200),
    supabase.from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('organization_id', organizationIds)
      .neq('status', 'done')
      .ilike('type', '%follow%'),
    supabase.from('ai_outreach_drafts')
      .select('id,lead_id,channel,status,approved_variant,approved_at,created_at', { count: 'exact' })
      .in('organization_id', organizationIds)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('ai_analysis_logs')
      .select('id,lead_id,output_data,created_at')
      .in('organization_id', organizationIds)
      .eq('analysis_type', 'lead_intelligence')
      .eq('status', 'succeeded')
      .not('lead_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (leadsResult.error) throw new Error(`Não foi possível carregar os leads prioritários: ${leadsResult.error.message}`)
  if (tasksResult.error) throw new Error(`Não foi possível carregar as tarefas: ${tasksResult.error.message}`)
  if (followUpCountResult.error) throw new Error(`Não foi possível contar os follow-ups: ${followUpCountResult.error.message}`)
  if (draftsResult.error) throw new Error(`Não foi possível carregar os rascunhos: ${draftsResult.error.message}`)
  if (analysisResult.error) throw new Error(`Não foi possível carregar as recomendações de IA: ${analysisResult.error.message}`)

  const recommendations = new Map<string, WorkspaceRecommendation>()
  for (const row of (analysisResult.data ?? []) as AnalysisLogRow[]) {
    if (!row.lead_id || recommendations.has(row.lead_id)) continue
    const recommendation = mapAIAnalysisRecommendation(row)
    if (recommendation) recommendations.set(row.lead_id, recommendation)
  }

  return {
    demoMode: false,
    hasOrganization: true,
    leads: (leadsResult.data ?? []) as WorkspaceLead[],
    tasks: (tasksResult.data ?? []) as WorkspaceTask[],
    drafts: (draftsResult.data ?? []) as WorkspaceDraft[],
    recommendations: [...recommendations.values()],
    openTaskCount: tasksResult.count ?? 0,
    followUpCount: followUpCountResult.count ?? 0,
    approvedDraftCount: draftsResult.count ?? 0,
  }
}

export async function completeWorkspaceTask(organizationId: string, taskId: string) {
  if (prospectingMockMode) {
    const tasks = localDemoTasks()
    const task = tasks.find((candidate) => candidate.id === taskId && candidate.organization_id === organizationId)
    if (!task) throw new Error('A tarefa não foi encontrada no workspace de demonstração.')
    const updated = { ...task, status: 'done' as const, updated_at: new Date().toISOString() }
    localStorage.setItem(DEMO_TASKS_KEY, JSON.stringify(tasks.map((candidate) => candidate.id === taskId ? updated : candidate)))
    return updated
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('tasks')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('organization_id', organizationId)
    .select('id,status')
    .single()
  if (error) throw new Error(`Não foi possível concluir a tarefa: ${error.message}`)
  return data
}
