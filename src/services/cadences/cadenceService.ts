import { supabase } from '../../lib/supabase/client'
import { getLeads } from '../leads/leadService'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type {
  CadenceTaskType,
  Lead,
  SalesCadence,
  SalesCadenceEnrollment,
  SalesCadenceEnrollmentStatus,
  SalesCadenceStep,
  SalesCadenceTask,
  TaskItem,
} from '../../types'

const cadencesStorageKey = 'lead-radar-demo-sales-cadences'
const enrollmentsStorageKey = 'lead-radar-demo-sales-cadence-enrollments'
const tasksStorageKey = 'lead-radar-demo-tasks'

type CadenceInputStep = {
  title: string
  description: string
  taskType: CadenceTaskType
  priority: TaskItem['priority']
  delayDays: number
}

export type CadenceInput = {
  organizationId: string
  name: string
  description: string
  steps: CadenceInputStep[]
}

type CadenceRecord = Omit<SalesCadence, 'steps'>
type EnrollmentRecord = Omit<SalesCadenceEnrollment, 'lead_name' | 'lead_company_id' | 'tasks'>
type DemoTask = TaskItem & { cadence_enrollment_id: string; cadence_step_id: string }

export type CadenceWorkspace = {
  cadences: SalesCadence[]
  enrollments: SalesCadenceEnrollment[]
  leads: Lead[]
  organizations: Array<{ id: string; name: string }>
}

const allowedTaskTypes: CadenceTaskType[] = [
  'contact', 'follow_up', 'call', 'meeting', 'proposal', 'research', 'review', 'other',
]
const allowedPriorities: TaskItem['priority'][] = ['low', 'medium', 'high', 'urgent']
const completedTaskStatuses: TaskItem['status'][] = ['done', 'completed']

function readDemo<T>(key: string): T[] {
  const raw = localStorage.getItem(key)
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`Os dados locais de demonstração (${key}) estão em um formato inválido.`)
  return parsed as T[]
}

function writeDemo<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function normalizeCadenceInput(input: Omit<CadenceInput, 'organizationId'>) {
  const name = input.name.trim()
  if (!name) throw new Error('Informe o nome da cadência.')
  if (name.length > 120) throw new Error('O nome deve ter no máximo 120 caracteres.')

  const description = input.description.trim()
  if (description.length > 2000) throw new Error('A descrição deve ter no máximo 2.000 caracteres.')
  if (input.steps.length < 1 || input.steps.length > 20) {
    throw new Error('A cadência deve ter de 1 a 20 etapas.')
  }

  const steps = input.steps.map((step) => {
    const title = step.title.trim()
    if (!title || title.length > 120) throw new Error('Cada etapa precisa de um título de até 120 caracteres.')
    const stepDescription = step.description.trim()
    if (stepDescription.length > 1000) throw new Error('A instrução de cada etapa deve ter no máximo 1.000 caracteres.')
    if (!allowedTaskTypes.includes(step.taskType)) throw new Error('Selecione um tipo de tarefa válido.')
    if (!allowedPriorities.includes(step.priority)) throw new Error('Selecione uma prioridade válida.')
    if (!Number.isInteger(step.delayDays) || step.delayDays < 0 || step.delayDays > 365) {
      throw new Error('O intervalo entre inscrição e etapa deve estar entre 0 e 365 dias.')
    }
    return {
      title,
      description: stepDescription,
      taskType: step.taskType,
      priority: step.priority,
      delayDays: step.delayDays,
    }
  })

  return { name, description, steps }
}

function buildEnrollment(
  enrollment: EnrollmentRecord,
  leadsById: Map<string, Lead>,
  tasks: SalesCadenceTask[],
): SalesCadenceEnrollment {
  const lead = leadsById.get(enrollment.lead_id)
  return {
    ...enrollment,
    lead_name: lead?.company_name ?? 'Lead indisponível',
    lead_company_id: lead?.company_id ?? null,
    tasks: [...tasks].sort((left, right) => (left.due_at ?? '').localeCompare(right.due_at ?? '')),
  }
}

function mapDemoEnrollmentStatus(
  enrollment: EnrollmentRecord,
  tasks: SalesCadenceTask[],
): SalesCadenceEnrollmentStatus {
  if (enrollment.status === 'cancelled') return 'cancelled'
  if (tasks.some((task) => task.status === 'cancelled')) return 'cancelled'
  if (tasks.length && tasks.every((task) => completedTaskStatuses.includes(task.status))) return 'completed'
  return 'active'
}

export async function getCadenceWorkspace(): Promise<CadenceWorkspace> {
  const leads = await getLeads()
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]))

  if (prospectingMockMode) {
    const organizations = [...new Set(leads.map((lead) => lead.organization_id))]
      .map((id) => ({ id, name: id === 'demo-org' ? 'Demonstração' : `Organização ${id.slice(0, 8)}` }))
    if (!organizations.length) organizations.push({ id: 'demo-org', name: 'Demonstração' })
    const demoCadences = readDemo<SalesCadence>(cadencesStorageKey)
    const allTasks = readDemo<DemoTask>(tasksStorageKey)
    const enrollments = readDemo<EnrollmentRecord>(enrollmentsStorageKey).map((record) => {
      const tasks = allTasks.filter((task) => task.cadence_enrollment_id === record.id)
      const snapshots = tasks.map((task): SalesCadenceTask => ({
        id: task.id,
        title: task.title,
        status: task.status,
        due_at: task.due_at,
        cadence_step_id: task.cadence_step_id,
      }))
      return buildEnrollment({
        ...record,
        status: mapDemoEnrollmentStatus(record, snapshots),
      }, leadsById, snapshots)
    })
    return {
      cadences: demoCadences,
      enrollments,
      leads,
      organizations,
    }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: memberships, error: membershipError } = await supabase.from('organization_members')
    .select('organization_id')
    .eq('user_id', authData.user.id)
  if (membershipError) throw new Error(`Não foi possível carregar suas organizações: ${membershipError.message}`)
  const organizationIds = [...new Set((memberships ?? []).map((item) => item.organization_id))]
  if (!organizationIds.length) return { cadences: [], enrollments: [], leads, organizations: [] }

  const [organizationResult, cadenceResult] = await Promise.all([
    supabase.from('organizations').select('id,name').in('id', organizationIds).order('name'),
    supabase.from('sales_cadences').select('*')
      .in('organization_id', organizationIds)
      .order('name')
      .range(0, 499),
  ])
  if (organizationResult.error) throw new Error(`Não foi possível carregar as organizações: ${organizationResult.error.message}`)
  if (cadenceResult.error) {
    throw new Error(`Não foi possível carregar as cadências. Verifique se a migration 20261004230000_sales_cadences.sql foi aplicada: ${cadenceResult.error.message}`)
  }

  const cadenceRecords = (cadenceResult.data ?? []) as CadenceRecord[]
  const cadenceIds = cadenceRecords.map((cadence) => cadence.id)
  const { data: stepData, error: stepError } = cadenceIds.length
    ? await supabase.from('sales_cadence_steps').select('*').in('cadence_id', cadenceIds).order('position')
    : { data: [], error: null }
  if (stepError) throw new Error(`Não foi possível carregar as etapas das cadências: ${stepError.message}`)

  const { data: enrollmentData, error: enrollmentError } = cadenceIds.length
    ? await supabase.from('sales_cadence_enrollments').select('*')
      .in('cadence_id', cadenceIds)
      .order('created_at', { ascending: false })
      .range(0, 999)
    : { data: [], error: null }
  if (enrollmentError) throw new Error(`Não foi possível carregar as inscrições nas cadências: ${enrollmentError.message}`)

  const enrollmentRecords = (enrollmentData ?? []) as EnrollmentRecord[]
  const enrollmentIds = enrollmentRecords.map((enrollment) => enrollment.id)
  const { data: taskData, error: taskError } = enrollmentIds.length
    ? await supabase.from('tasks')
      .select('id,title,status,due_at,cadence_step_id,cadence_enrollment_id')
      .in('cadence_enrollment_id', enrollmentIds)
      .order('due_at')
    : { data: [], error: null }
  if (taskError) throw new Error(`Não foi possível carregar as tarefas das cadências: ${taskError.message}`)

  const stepsByCadence = new Map<string, SalesCadenceStep[]>()
  for (const step of (stepData ?? []) as SalesCadenceStep[]) {
    const steps = stepsByCadence.get(step.cadence_id) ?? []
    steps.push(step)
    stepsByCadence.set(step.cadence_id, steps)
  }
  const cadences = cadenceRecords.map((cadence) => ({
    ...cadence,
    steps: stepsByCadence.get(cadence.id) ?? [],
  }))
  const tasksByEnrollment = new Map<string, SalesCadenceTask[]>()
  for (const task of (taskData ?? []) as Array<SalesCadenceTask & { cadence_enrollment_id: string }>) {
    const tasks = tasksByEnrollment.get(task.cadence_enrollment_id) ?? []
    tasks.push(task)
    tasksByEnrollment.set(task.cadence_enrollment_id, tasks)
  }
  const enrollments = enrollmentRecords.map((enrollment) => buildEnrollment(
    enrollment,
    leadsById,
    tasksByEnrollment.get(enrollment.id) ?? [],
  ))

  return {
    cadences,
    enrollments,
    leads,
    organizations: (organizationResult.data ?? []) as Array<{ id: string; name: string }>,
  }
}

export async function createCadence(input: CadenceInput): Promise<string> {
  const normalized = normalizeCadenceInput(input)

  if (prospectingMockMode) {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const cadence: SalesCadence = {
      id,
      organization_id: input.organizationId,
      name: normalized.name,
      description: normalized.description,
      status: 'active',
      created_by: null,
      created_at: now,
      updated_at: now,
      steps: normalized.steps.map((step, position) => ({
        id: crypto.randomUUID(),
        organization_id: input.organizationId,
        cadence_id: id,
        position,
        title: step.title,
        description: step.description,
        task_type: step.taskType,
        priority: step.priority,
        delay_days: step.delayDays,
        created_at: now,
      })),
    }
    writeDemo(cadencesStorageKey, [cadence, ...readDemo<SalesCadence>(cadencesStorageKey)])
    return id
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.rpc('create_sales_cadence', {
    p_organization_id: input.organizationId,
    p_name: normalized.name,
    p_description: normalized.description,
    p_steps: normalized.steps.map((step) => ({
      title: step.title,
      description: step.description,
      task_type: step.taskType,
      priority: step.priority,
      delay_days: step.delayDays,
    })),
  })
  if (error) throw new Error(`Não foi possível criar a cadência: ${error.message}`)
  return data as string
}

export async function enrollLeadInCadence(cadence: SalesCadence, lead: Lead): Promise<string> {
  if (cadence.organization_id !== lead.organization_id) {
    throw new Error('O lead e a cadência devem pertencer à mesma organização.')
  }
  if (cadence.status !== 'active') throw new Error('Cadências arquivadas não aceitam novas inscrições.')
  if (!cadence.steps.length) throw new Error('A cadência não tem etapas para gerar tarefas.')

  if (prospectingMockMode) {
    const records = readDemo<EnrollmentRecord>(enrollmentsStorageKey)
    const duplicate = records.some((record) =>
      record.cadence_id === cadence.id
      && record.lead_id === lead.id
      && record.status === 'active',
    )
    if (duplicate) throw new Error('Este lead já está inscrito nesta cadência.')

    const now = new Date()
    const enrollmentId = crypto.randomUUID()
    const enrollment: EnrollmentRecord = {
      id: enrollmentId,
      organization_id: cadence.organization_id,
      cadence_id: cadence.id,
      lead_id: lead.id,
      status: 'active',
      enrolled_at: now.toISOString(),
      completed_at: null,
      cancelled_at: null,
      enrolled_by: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }
    const tasks = readDemo<DemoTask>(tasksStorageKey)
    const createdTasks = cadence.steps.map((step): DemoTask => {
      const due = new Date(now)
      due.setDate(due.getDate() + step.delay_days)
      return {
        id: crypto.randomUUID(),
        organization_id: cadence.organization_id,
        lead_id: lead.id,
        title: step.title,
        description: [`Cadência: ${cadence.name}`, step.description].filter(Boolean).join('\n\n'),
        type: step.task_type,
        priority: step.priority,
        status: 'pending',
        assigned_to: lead.owner_id ?? null,
        source: 'system',
        completed_at: null,
        due_at: due.toISOString(),
        cadence_enrollment_id: enrollmentId,
        cadence_step_id: step.id,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
    })
    writeDemo(enrollmentsStorageKey, [enrollment, ...records])
    writeDemo(tasksStorageKey, [...createdTasks, ...tasks])
    return enrollmentId
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.rpc('enroll_lead_in_sales_cadence', {
    p_cadence_id: cadence.id,
    p_lead_id: lead.id,
  })
  if (error) throw new Error(`Não foi possível inscrever o lead: ${error.message}`)
  return data as string
}

export async function cancelCadenceEnrollment(enrollment: SalesCadenceEnrollment): Promise<void> {
  if (enrollment.status !== 'active') throw new Error('Somente inscrições ativas podem ser canceladas.')

  if (prospectingMockMode) {
    const now = new Date().toISOString()
    writeDemo(enrollmentsStorageKey, readDemo<EnrollmentRecord>(enrollmentsStorageKey).map((record) =>
      record.id === enrollment.id
        ? { ...record, status: 'cancelled', cancelled_at: now, updated_at: now }
        : record,
    ))
    writeDemo(tasksStorageKey, readDemo<DemoTask>(tasksStorageKey).map((task) =>
      task.cadence_enrollment_id === enrollment.id
        && ['open', 'pending', 'in_progress'].includes(task.status)
        ? { ...task, status: 'cancelled', updated_at: now }
        : task,
    ))
    return
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { error } = await supabase.rpc('cancel_sales_cadence_enrollment', {
    p_enrollment_id: enrollment.id,
  })
  if (error) throw new Error(`Não foi possível cancelar a inscrição: ${error.message}`)
}

export async function archiveCadence(cadenceId: string): Promise<void> {
  if (prospectingMockMode) {
    writeDemo(cadencesStorageKey, readDemo<SalesCadence>(cadencesStorageKey).map((cadence) =>
      cadence.id === cadenceId ? { ...cadence, status: 'archived', updated_at: new Date().toISOString() } : cadence,
    ))
    return
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { error } = await supabase.rpc('archive_sales_cadence', { p_cadence_id: cadenceId })
  if (error) throw new Error(`Não foi possível arquivar a cadência: ${error.message}`)
}
