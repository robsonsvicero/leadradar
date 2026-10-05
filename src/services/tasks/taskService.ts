import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type { TaskItem } from '../../types'

const STORAGE_KEY = 'lead-radar-demo-tasks'

export async function getTasks() {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('tasks').select('*')
      .order('due_at', { ascending: true, nullsFirst: false })
      .range(0, 499)
    if (error) {
      throw new Error(`Não foi possível carregar as tarefas: ${error.message}`)
    }
    return (data ?? []) as TaskItem[]
  }
  if (!prospectingMockMode) throw new Error('Supabase não está configurado.')

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return [] as TaskItem[]
  }

  return JSON.parse(raw) as TaskItem[]
}

export type TaskOrganizationOption = {
  id: string
  name: string
}

export type TaskLeadOption = {
  id: string
  organization_id: string
  company_name: string
  action_score: number
  company_id: string | null
}

export type TaskAssigneeOption = {
  organization_id: string
  user_id: string
  full_name: string | null
}

export async function getTaskCreationOptions(): Promise<{
  organizations: TaskOrganizationOption[]
  leads: TaskLeadOption[]
  assignees: TaskAssigneeOption[]
  currentUserId: string | null
}> {
  if (prospectingMockMode) {
    return { organizations: [{ id: 'demo-org', name: 'Demonstração' }], leads: [], assignees: [], currentUserId: null }
  }
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')
  const { data: memberships, error: membershipError } = await supabase.from('organization_members')
    .select('organization_id')
    .eq('user_id', authData.user.id)
  if (membershipError) throw new Error(`Não foi possível carregar as organizações: ${membershipError.message}`)
  const organizationIds = [...new Set((memberships ?? []).map((member) => member.organization_id))]
  if (!organizationIds.length) return { organizations: [], leads: [], assignees: [], currentUserId: authData.user.id }

  const [organizationResult, leadResult, memberResult] = await Promise.all([
    supabase.from('organizations').select('id,name').in('id', organizationIds).order('name'),
    supabase.from('leads').select('id,organization_id,company_name,action_score,company_id')
      .in('organization_id', organizationIds).order('company_name').limit(500),
    supabase.rpc('get_organization_member_roster', { target_organization_ids: organizationIds }),
  ])
  if (organizationResult.error) throw new Error(`Não foi possível carregar as organizações: ${organizationResult.error.message}`)
  if (leadResult.error) throw new Error(`Não foi possível carregar leads para vincular à tarefa: ${leadResult.error.message}`)
  if (memberResult.error) throw new Error(`Não foi possível carregar os responsáveis. Verifique se a migration 20261004190000_crm_pipeline_operations.sql foi aplicada: ${memberResult.error.message}`)
  const roster = (memberResult.data ?? []) as {
    organization_id: string
    user_id: string
    member_role: 'owner' | 'admin' | 'member'
    full_name: string | null
  }[]
  return {
    organizations: organizationResult.data ?? [],
    leads: (leadResult.data ?? []) as TaskLeadOption[],
    assignees: roster.map((member) => ({
      organization_id: member.organization_id,
      user_id: member.user_id,
      full_name: member.full_name,
    })) as TaskAssigneeOption[],
    currentUserId: authData.user.id,
  }
}

export async function createTask(input: Partial<TaskItem>) {
  if (supabase && !prospectingMockMode) {
    if (!input.organization_id) throw new Error('Selecione a organização da tarefa.')
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
    if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')
    const { data, error } = await supabase.from('tasks').insert({
      ...input,
      assigned_to: input.assigned_to ?? authData.user.id,
      source: input.source ?? 'manual',
      status: input.status ?? 'pending',
      completed_at: null,
    }).select().single()
    if (error) {
      throw new Error(`Não foi possível criar a tarefa: ${error.message}`)
    }
    return data as TaskItem
  }
  if (!prospectingMockMode) throw new Error('Supabase não está configurado.')

  const existing = await getTasks()
  const nextTask: TaskItem = {
    id: input.id ?? crypto.randomUUID(),
    organization_id: input.organization_id ?? 'demo-org',
    lead_id: input.lead_id ?? null,
    title: input.title ?? 'Tarefa nova',
    description: input.description ?? 'Descreva a atividade',
    type: input.type ?? 'follow_up',
    priority: input.priority ?? 'medium',
    status: input.status ?? 'pending',
    assigned_to: input.assigned_to ?? null,
    source: input.source ?? 'manual',
    completed_at: input.completed_at ?? null,
    due_at: input.due_at ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...input,
  } as TaskItem

  const nextTasks = [nextTask, ...existing]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks))
  return nextTask
}

export async function updateTask(id: string, nextTask: Partial<TaskItem>) {
  if (supabase && !prospectingMockMode) {
    const changes = { ...nextTask, updated_at: new Date().toISOString() }
    if (nextTask.status === 'done' || nextTask.status === 'completed') {
      changes.completed_at = new Date().toISOString()
    } else if (nextTask.status) {
      changes.completed_at = null
    }
    const { data, error } = await supabase.from('tasks').update(changes).eq('id', id).select().single()
    if (error) {
      throw new Error(error.message)
    }
    return data as TaskItem
  }
  if (!prospectingMockMode) throw new Error('Supabase não está configurado.')

  const tasks = await getTasks()
  const updated = tasks.map((task) => {
    if (task.id !== id) return task
    const completed = nextTask.status === 'done' || nextTask.status === 'completed'
    return {
      ...task,
      ...nextTask,
      completed_at: nextTask.status ? (completed ? new Date().toISOString() : null) : task.completed_at,
      updated_at: new Date().toISOString(),
    }
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated.find((task) => task.id === id) ?? null
}
