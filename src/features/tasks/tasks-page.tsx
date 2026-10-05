import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { createTask, getTaskCreationOptions, getTasks, updateTask } from '../../services/tasks/taskService'
import type { TaskItem } from '../../types'

const priorities: TaskItem['priority'][] = ['low', 'medium', 'high', 'urgent']
const typeOptions = [
  'contact', 'follow_up', 'call', 'meeting', 'proposal', 'research', 'review', 'other',
] as const
const views = ['today', 'overdue', 'upcoming', 'completed', 'all'] as const
type TaskView = typeof views[number]
const emptyTasks: TaskItem[] = []

const priorityLabels: Record<TaskItem['priority'], string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

const typeLabels: Record<string, string> = {
  contact: 'Contato',
  follow_up: 'Follow-up',
  call: 'Ligação',
  meeting: 'Reunião',
  proposal: 'Proposta',
  research: 'Pesquisa',
  review: 'Revisão',
  other: 'Outra',
}

const taskStatusLabels: Record<TaskItem['status'], string> = {
  open: 'Pendente',
  pending: 'Pendente',
  in_progress: 'Em andamento',
  done: 'Concluída',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

function isComplete(task: TaskItem) {
  return task.status === 'done' || task.status === 'completed'
}

function isOpen(task: TaskItem) {
  return !isComplete(task) && task.status !== 'cancelled'
}

function localDateBoundary(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value.getTime()
}

function isToday(value: string | null) {
  if (!value) return false
  return localDateBoundary(new Date(value)) === localDateBoundary(new Date())
}

function isOverdue(task: TaskItem) {
  return !isComplete(task) && task.status !== 'cancelled' && Boolean(task.due_at) &&
    new Date(task.due_at!).getTime() < localDateBoundary(new Date())
}

function isUpcoming(task: TaskItem) {
  return !isComplete(task) && task.status !== 'cancelled' && Boolean(task.due_at) &&
    new Date(task.due_at!).getTime() >= localDateBoundary(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

function formatDue(value: string | null) {
  if (!value) return 'Sem prazo'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Prazo indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function TasksPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<TaskView>('today')
  const [priorityFilter, setPriorityFilter] = useState('__all')
  const [typeFilter, setTypeFilter] = useState('__all')
  const [assigneeFilter, setAssigneeFilter] = useState('__all')
  const [leadFilter, setLeadFilter] = useState('__all')
  const [organizationId, setOrganizationId] = useState('')
  const [leadId, setLeadId] = useState('__none')
  const [assignedTo, setAssignedTo] = useState<string | null | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskItem['priority']>('medium')
  const [type, setType] = useState<TaskItem['type']>('follow_up')
  const [dueAt, setDueAt] = useState('')
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: getTasks, retry: false })
  const optionsQuery = useQuery({ queryKey: ['task-creation-options'], queryFn: getTaskCreationOptions, retry: false })
  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: async () => {
      setTitle('')
      setDescription('')
      setDueAt('')
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskItem['status'] }) => updateTask(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const tasks = tasksQuery.data ?? emptyTasks
  const options = optionsQuery.data
  const organizations = options?.organizations ?? []
  const selectedOrganizationId = organizationId || organizations[0]?.id || ''
  const leads = options?.leads.filter((lead) => lead.organization_id === selectedOrganizationId) ?? []
  const assignees = options?.assignees.filter((member) => member.organization_id === selectedOrganizationId) ?? []
  const uniqueAssignees = [...new Map((options?.assignees ?? []).map((member) => [member.user_id, member])).values()]
  const leadNameById = new Map((options?.leads ?? []).map((lead) => [lead.id, lead.company_name]))
  const leadById = new Map((options?.leads ?? []).map((lead) => [lead.id, lead]))
  const assigneeNameById = new Map(uniqueAssignees.map((assignee) => [
    assignee.user_id,
    assignee.full_name || `Membro ${assignee.user_id.slice(0, 8)}`,
  ]))
  const counts = useMemo(() => ({
    today: tasks.filter((task) => isOpen(task) && isToday(task.due_at)).length,
    overdue: tasks.filter(isOverdue).length,
    upcoming: tasks.filter(isUpcoming).length,
    completed: tasks.filter(isComplete).length,
    all: tasks.length,
  }), [tasks])

  const visibleTasks = useMemo(() => {
    const selected = tasks.filter((task) => {
      if (view === 'today' && (!isOpen(task) || !isToday(task.due_at))) return false
      if (view === 'overdue' && !isOverdue(task)) return false
      if (view === 'upcoming' && !isUpcoming(task)) return false
      if (view === 'completed' && !isComplete(task)) return false
      if (priorityFilter !== '__all' && task.priority !== priorityFilter) return false
      if (typeFilter !== '__all' && task.type !== typeFilter) return false
      if (leadFilter === '__unlinked' && task.lead_id) return false
      if (leadFilter !== '__all' && leadFilter !== '__unlinked' && task.lead_id !== leadFilter) return false
      if (assigneeFilter === '__unassigned' && task.assigned_to) return false
      if (assigneeFilter !== '__all' && assigneeFilter !== '__unassigned' && task.assigned_to !== assigneeFilter) return false
      return true
    })
    const priorityOrder: Record<TaskItem['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 }
    return selected.sort((left, right) => {
      const urgencyDifference = priorityOrder[left.priority] - priorityOrder[right.priority]
      if (urgencyDifference) return urgencyDifference
      const leftScore = options?.leads.find((lead) => lead.id === left.lead_id)?.action_score ?? 0
      const rightScore = options?.leads.find((lead) => lead.id === right.lead_id)?.action_score ?? 0
      if (leftScore !== rightScore) return rightScore - leftScore
      if (!left.due_at) return 1
      if (!right.due_at) return -1
      return new Date(left.due_at).getTime() - new Date(right.due_at).getTime()
    })
  }, [assigneeFilter, leadFilter, options?.leads, priorityFilter, tasks, typeFilter, view])

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !selectedOrganizationId) return
    const selectedLead = leads.find((lead) => lead.id === leadId)
    if (leadId !== '__none' && !selectedLead) return
    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      organization_id: selectedOrganizationId,
      lead_id: selectedLead?.id ?? null,
      priority,
      type,
      assigned_to: assignedTo === undefined ? options?.currentUserId ?? null : assignedTo,
      status: 'pending',
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      source: 'manual',
    })
  }

  if (tasksQuery.isLoading || optionsQuery.isLoading) return <Skeleton className="h-[32rem] w-full rounded-xl" />
  if (tasksQuery.isError || optionsQuery.isError) {
    const errorMessage = tasksQuery.isError
      ? tasksQuery.error.message
      : optionsQuery.error?.message ?? 'Erro desconhecido ao carregar os dados.'
    return (
      <Alert className="border-red-200 bg-red-50 text-red-900">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar o centro de tarefas.</p>
            <p className="mt-1">{errorMessage}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => {
              void tasksQuery.refetch()
              void optionsQuery.refetch()
            }}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Meu dia</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Priorize as tarefas por urgência e prazo; registre o próximo passo sem perder o vínculo com o lead.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => {
          void tasksQuery.refetch()
          void optionsQuery.refetch()
        }} disabled={tasksQuery.isFetching} aria-label="Atualizar tarefas">
          <RefreshCw aria-hidden="true" className={tasksQuery.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </header>

      {organizations.length === 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          Sua conta ainda não pertence a uma organização. Peça ao administrador para adicioná-la antes de criar tarefas.
        </Alert>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Nova tarefa</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTask} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Título
              <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: ligar para confirmar o interesse" maxLength={160} required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Organização
              <Select value={selectedOrganizationId} onValueChange={(value) => {
                setOrganizationId(value)
                setLeadId('__none')
                setAssignedTo(undefined)
              }} disabled={organizations.length === 0}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a organização" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Lead (opcional)
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sem lead associado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem lead associado</SelectItem>
                  {leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Descrição
              <Input className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto ou resultado esperado" maxLength={1000} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tipo
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => <SelectItem key={option} value={option}>{typeLabels[option]}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Prioridade
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskItem['priority'])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{priorities.map((level) => <SelectItem key={level} value={level}>{priorityLabels[level]}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Responsável
              <Select
                value={assignedTo === undefined ? options?.currentUserId ?? '__unassigned' : assignedTo ?? '__unassigned'}
                onValueChange={(value) => setAssignedTo(value === '__unassigned' ? null : value)}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Atribuir a mim" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Sem responsável</SelectItem>
                  {assignees.map((assignee) => <SelectItem key={assignee.user_id} value={assignee.user_id}>{assignee.full_name || `Membro ${assignee.user_id.slice(0, 8)}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Prazo (opcional)
              <Input className="mt-1" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </label>
            <div className="flex items-end md:col-span-2">
              <Button type="submit" disabled={!title.trim() || !selectedOrganizationId || createMutation.isPending}>
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                {createMutation.isPending ? 'Salvando tarefa…' : 'Adicionar tarefa'}
              </Button>
            </div>
          </form>
          {createMutation.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{createMutation.error.message}</p> : null}
        </CardContent>
      </Card>

      <section aria-label="Visões de tarefas">
        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <Button
              key={item}
              type="button"
              variant={view === item ? 'default' : 'outline'}
              size="sm"
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {({ today: 'Hoje', overdue: 'Atrasadas', upcoming: 'Próximas', completed: 'Concluídas', all: 'Todas' })[item]}
              <span className="ml-2 tabular-nums">{counts[item]}</span>
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Prioridade
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas</SelectItem>
                {priorities.map((level) => <SelectItem key={level} value={level}>{priorityLabels[level]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Tipo
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {typeOptions.map((option) => <SelectItem key={option} value={option}>{typeLabels[option]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Responsável
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                <SelectItem value="__unassigned">Sem responsável</SelectItem>
                {uniqueAssignees.map((assignee) => <SelectItem key={assignee.user_id} value={assignee.user_id}>{assigneeNameById.get(assignee.user_id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Lead
            <Select value={leadFilter} onValueChange={setLeadFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                <SelectItem value="__unlinked">Sem lead associado</SelectItem>
                {options?.leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>
      </section>

      {updateMutation.isError ? <Alert className="border-red-200 bg-red-50 text-red-900">{updateMutation.error.message}</Alert> : null}
      <div className="space-y-3">
        {visibleTasks.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="flex min-h-40 flex-col items-center justify-center text-center">
              <CalendarClock aria-hidden="true" className="mb-3 h-9 w-9 text-slate-500" />
              <h3 className="font-semibold text-slate-900">{tasks.length ? 'Nenhuma tarefa nesta visão' : 'Nenhuma tarefa cadastrada'}</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">
                {tasks.length ? 'Altere a visão ou os filtros para encontrar outras tarefas.' : 'Crie uma tarefa e vincule-a a uma organização para iniciar seu fluxo comercial.'}
              </p>
            </CardContent>
          </Card>
        ) : visibleTasks.map((task) => (
          <Card key={task.id}>
            <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{task.title}</h3>
                  <Badge variant={task.priority === 'urgent' || task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'secondary'}>{priorityLabels[task.priority]}</Badge>
                  <Badge variant="outline">{typeLabels[task.type] ?? task.type}</Badge>
                  {task.status === 'in_progress' ? <Badge variant="secondary">{taskStatusLabels[task.status]}</Badge> : null}
                </div>
                {task.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{task.description}</p> : null}
                {task.lead_id ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Lead: {leadById.get(task.lead_id)?.company_id
                      ? <Link to={`/companies/${leadById.get(task.lead_id)?.company_id}`} className="font-medium text-sky-800 underline underline-offset-2">{leadNameById.get(task.lead_id) ?? 'Abrir lead'}</Link>
                      : leadNameById.get(task.lead_id) ?? 'Lead não carregado'}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-600">Responsável: {task.assigned_to ? assigneeNameById.get(task.assigned_to) ?? 'Membro da organização' : 'Não atribuído'}</p>
                <p className={`mt-2 text-xs ${isOverdue(task) ? 'font-semibold text-red-700' : 'text-slate-600'}`}>
                  {isOverdue(task) ? 'Atrasada · ' : ''}{formatDue(task.due_at)}
                </p>
              </div>
              {task.status !== 'cancelled' ? (
                <Button
                  variant={isComplete(task) ? 'outline' : 'default'}
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: task.id, status: isComplete(task) ? 'pending' : 'completed' })}
                >
                  <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                  {isComplete(task) ? 'Reabrir' : 'Concluir'}
                </Button>
              ) : <Badge variant="secondary">Cancelada</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
      {tasks.length >= 500 ? <p className="text-xs text-slate-600">Mostrando até 500 tarefas mais próximas do prazo. Use filtros adicionais para organizar o trabalho.</p> : null}
    </div>
  )
}
