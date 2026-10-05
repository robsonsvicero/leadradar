import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, ListChecks, Plus, RefreshCw, Route, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import {
  archiveCadence,
  cancelCadenceEnrollment,
  createCadence,
  enrollLeadInCadence,
  getCadenceWorkspace,
  normalizeCadenceInput,
  type CadenceInput,
} from '../../services/cadences/cadenceService'
import type {
  CadenceTaskType,
  SalesCadence,
  SalesCadenceEnrollment,
  TaskItem,
} from '../../types'

type DraftStep = {
  key: string
  title: string
  description: string
  taskType: CadenceTaskType
  priority: TaskItem['priority']
  delayDays: string
}

const taskTypeOptions: Array<{ value: CadenceTaskType; label: string }> = [
  { value: 'contact', label: 'Contato' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'call', label: 'Ligação' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'research', label: 'Pesquisa' },
  { value: 'review', label: 'Revisão' },
  { value: 'other', label: 'Outra' },
]
const priorityOptions: Array<{ value: TaskItem['priority']; label: string }> = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]
const completedStatuses: TaskItem['status'][] = ['done', 'completed']
const initialDraftStep = (): DraftStep => ({
  key: crypto.randomUUID(),
  title: '',
  description: '',
  taskType: 'follow_up',
  priority: 'medium',
  delayDays: '0',
})

function formatDue(value: string | null) {
  if (!value) return 'Sem prazo'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Prazo indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(status: SalesCadenceEnrollment['status']) {
  if (status === 'completed') return 'Concluída'
  if (status === 'cancelled') return 'Cancelada'
  return 'Ativa'
}

function isCompleted(status: TaskItem['status']) {
  return completedStatuses.includes(status)
}

function CadenceEditor({
  organizations,
  selectedOrganizationId,
  onOrganizationChange,
  isPending,
  onSubmit,
}: {
  organizations: Array<{ id: string; name: string }>
  selectedOrganizationId: string
  onOrganizationChange: (value: string) => void
  isPending: boolean
  onSubmit: (input: CadenceInput) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([initialDraftStep(), initialDraftStep()])
  const [validationError, setValidationError] = useState<string | null>(null)

  const updateStep = (key: string, property: keyof Omit<DraftStep, 'key'>, value: string) => {
    setSteps((current) => current.map((step) => step.key === key ? { ...step, [property]: value } : step))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)
    const input: CadenceInput = {
      organizationId: selectedOrganizationId,
      name,
      description,
      steps: steps.map((step) => ({
        title: step.title,
        description: step.description,
        taskType: step.taskType,
        priority: step.priority,
        delayDays: Number(step.delayDays),
      })),
    }
    try {
      normalizeCadenceInput({
        name: input.name,
        description: input.description,
        steps: input.steps,
      })
      onSubmit(input)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Revise os dados da cadência.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova cadência</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-800">
              Organização
              <Select value={selectedOrganizationId} onValueChange={onOrganizationChange} disabled={organizations.length === 0}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a organização" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-800">
              Nome da cadência
              <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Ex.: Primeiro contato com comércio local" required />
            </label>
            <label className="text-sm font-medium text-slate-800 md:col-span-2">
              Descrição (opcional)
              <textarea
                className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Quando e para qual tipo de oportunidade esta sequência é adequada?"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Etapas e tarefas</h3>
              <Button type="button" variant="outline" size="sm" disabled={steps.length >= 20} onClick={() => setSteps((current) => [...current, initialDraftStep()])}>
                <Plus aria-hidden="true" className="h-4 w-4" />Adicionar etapa
              </Button>
            </div>
            {steps.map((step, index) => (
              <fieldset key={step.key} className="space-y-3 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">Etapa {index + 1}</legend>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_8rem_auto]">
                  <label className="text-sm font-medium text-slate-800">
                    Título da tarefa
                    <Input className="mt-1" value={step.title} onChange={(event) => updateStep(step.key, 'title', event.target.value)} maxLength={120} placeholder="Ex.: Enviar apresentação personalizada" required />
                  </label>
                  <label className="text-sm font-medium text-slate-800">
                    Tipo de tarefa
                    <Select value={step.taskType} onValueChange={(value) => updateStep(step.key, 'taskType', value)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{taskTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                  <label className="text-sm font-medium text-slate-800">
                    Prioridade
                    <Select value={step.priority} onValueChange={(value) => updateStep(step.key, 'priority', value)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{priorityOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                  <label className="text-sm font-medium text-slate-800">
                    Dias após inscrição
                    <Input className="mt-1" type="number" min={0} max={365} step={1} value={step.delayDays} onChange={(event) => updateStep(step.key, 'delayDays', event.target.value)} required />
                  </label>
                  <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`Remover etapa ${index + 1}`} disabled={steps.length <= 1} onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}>
                    <X aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <label className="text-sm font-medium text-slate-800 md:col-span-2 xl:col-span-4">
                    Instrução (opcional)
                    <Input className="mt-1" value={step.description} onChange={(event) => updateStep(step.key, 'description', event.target.value)} maxLength={1000} placeholder="Contexto para a tarefa; não é uma mensagem enviada ao lead." />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>

          {validationError ? <p role="alert" className="text-sm text-red-700">{validationError}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="max-w-xl text-xs leading-5 text-slate-600">
              Os intervalos contam a partir da inscrição. Salvar cria apenas o modelo; as tarefas aparecem quando um lead for inscrito.
            </p>
            <Button type="submit" disabled={!selectedOrganizationId || isPending}>
              {isPending ? 'Salvando…' : 'Salvar cadência'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function EnrollmentList({
  enrollments,
  cadence,
  isPending,
  onCancel,
}: {
  enrollments: SalesCadenceEnrollment[]
  cadence: SalesCadence
  isPending: boolean
  onCancel: (enrollment: SalesCadenceEnrollment) => void
}) {
  if (!enrollments.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
        Nenhum lead inscrito nesta cadência. Ao inscrever alguém, as tarefas datadas serão adicionadas ao centro de tarefas.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {enrollments.map((enrollment) => {
        const completedCount = enrollment.tasks.filter((task) => isCompleted(task.status)).length
        return (
          <article key={enrollment.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="font-semibold text-slate-900">
                  {enrollment.lead_company_id
                    ? <Link className="hover:text-sky-800 hover:underline" to={`/companies/${enrollment.lead_company_id}`}>{enrollment.lead_name}</Link>
                    : enrollment.lead_name}
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  {completedCount} de {cadence.steps.length} tarefas concluídas · inscrição em {formatDue(enrollment.enrolled_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={enrollment.status === 'completed' ? 'success' : enrollment.status === 'cancelled' ? 'warning' : 'outline'}>
                  {statusLabel(enrollment.status)}
                </Badge>
                {enrollment.status === 'active' ? (
                  <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => onCancel(enrollment)}>
                    Cancelar sequência
                  </Button>
                ) : null}
              </div>
            </div>
            <ol className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {cadence.steps.map((step, index) => {
                const task = enrollment.tasks.find((item) => item.cadence_step_id === step.id)
                const done = Boolean(task && isCompleted(task.status))
                return (
                  <li key={step.id} className="grid gap-2 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {done ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{step.title}</p>
                      <p className="text-xs text-slate-600">
                        {task?.status === 'cancelled' ? 'Tarefa cancelada' : task ? `Prazo: ${formatDue(task.due_at)}` : 'Tarefa ainda não gerada'}
                      </p>
                    </div>
                    {task && task.status !== 'cancelled' ? (
                      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-sky-800 hover:underline">
                        Ver tarefa <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </article>
        )
      })}
    </div>
  )
}

export function CadencesPage() {
  const queryClient = useQueryClient()
  const [organizationId, setOrganizationId] = useState('')
  const [selectedCadenceId, setSelectedCadenceId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const workspace = useQuery({
    queryKey: ['sales-cadences'],
    queryFn: getCadenceWorkspace,
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: createCadence,
    onSuccess: async (cadenceId, input) => {
      setOrganizationId(input.organizationId)
      setSelectedCadenceId(cadenceId)
      setShowCreateForm(false)
      await queryClient.invalidateQueries({ queryKey: ['sales-cadences'] })
    },
  })
  const enrollMutation = useMutation({
    mutationFn: ({ cadence, leadId }: { cadence: SalesCadence; leadId: string }) => {
      const lead = workspace.data?.leads.find((item) => item.id === leadId)
      if (!lead) throw new Error('Selecione um lead válido para esta organização.')
      return enrollLeadInCadence(cadence, lead)
    },
    onSuccess: async () => {
      setLeadId('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales-cadences'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ])
    },
  })
  const cancelMutation = useMutation({
    mutationFn: cancelCadenceEnrollment,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales-cadences'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ])
    },
  })
  const archiveMutation = useMutation({
    mutationFn: archiveCadence,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-cadences'] }),
  })

  const organizations = workspace.data?.organizations ?? []
  const selectedOrganizationId = organizationId || organizations[0]?.id || ''
  const organizationCadences = useMemo(
    () => (workspace.data?.cadences ?? []).filter((cadence) => cadence.organization_id === selectedOrganizationId),
    [selectedOrganizationId, workspace.data?.cadences],
  )
  const selectedCadence = organizationCadences.find((cadence) => cadence.id === selectedCadenceId)
    ?? organizationCadences[0]
  const organizationLeads = (workspace.data?.leads ?? []).filter((lead) => lead.organization_id === selectedOrganizationId)
  const selectedLead = organizationLeads.find((lead) => lead.id === leadId)
  const selectedEnrollments = (workspace.data?.enrollments ?? [])
    .filter((enrollment) => enrollment.cadence_id === selectedCadence?.id)
    .sort((left, right) => right.enrolled_at.localeCompare(left.enrolled_at))
  const openCreateForm = showCreateForm || !organizationCadences.length
  const mutationError = createMutation.error ?? enrollMutation.error ?? cancelMutation.error ?? archiveMutation.error

  if (workspace.isLoading) return <Skeleton className="h-[36rem] w-full rounded-xl" />
  if (workspace.isError) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-900">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar as cadências.</p>
            <p className="mt-1">{workspace.error.message}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void workspace.refetch()}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Cadências comerciais</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Organize os próximos passos e prazos por lead. Cada etapa vira uma tarefa para execução e revisão humanas.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void workspace.refetch()} disabled={workspace.isFetching} aria-label="Atualizar cadências">
          <RefreshCw aria-hidden="true" className={workspace.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Atualizar
        </Button>
      </header>

      <Alert className="border-sky-200 bg-sky-50 text-sky-950">
        Inscrever um lead cria tarefas agendadas, mas não envia mensagens, não agenda contatos e não executa tarefas automaticamente. Os intervalos contam desde a inscrição.
      </Alert>

      {organizations.length === 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          Sua conta ainda não pertence a uma organização. Peça ao administrador para adicioná-la antes de criar cadências.
        </Alert>
      ) : null}
      {mutationError ? (
        <Alert className="border-red-200 bg-red-50 text-red-900">
          <p className="font-semibold">A alteração não foi salva.</p>
          <p className="mt-1">{mutationError.message}</p>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(15rem,0.72fr)_minmax(0,2fr)]">
        <aside aria-label="Cadências da organização" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Planos</h3>
            <Select value={selectedOrganizationId} onValueChange={(value) => {
              setOrganizationId(value)
              setSelectedCadenceId('')
              setLeadId('')
            }} disabled={organizations.length === 0}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Organização" /></SelectTrigger>
              <SelectContent>
                {organizations.map((organization) => <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div role="tablist" aria-label="Selecionar cadência" className="space-y-2">
            {organizationCadences.map((cadence) => {
              const active = cadence.id === selectedCadence?.id
              const enrollmentCount = (workspace.data?.enrollments ?? []).filter((item) => item.cadence_id === cadence.id && item.status === 'active').length
              return (
                <button
                  key={cadence.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setSelectedCadenceId(cadence.id)
                    setLeadId('')
                    setShowCreateForm(false)
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${active ? 'border-sky-400 bg-sky-50 text-slate-950' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium">{cadence.name}</span>
                    {cadence.status === 'archived' ? <Badge variant="outline">Arquivada</Badge> : null}
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">{cadence.steps.length} etapas · {enrollmentCount} inscrições ativas</span>
                </button>
              )
            })}
          </div>

          {organizationCadences.length ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setShowCreateForm((current) => !current)}>
              <Plus aria-hidden="true" className="h-4 w-4" />Nova cadência
            </Button>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-5">
          {openCreateForm ? (
            <CadenceEditor
              organizations={organizations}
              selectedOrganizationId={selectedOrganizationId}
              onOrganizationChange={(value) => {
                setOrganizationId(value)
                setSelectedCadenceId('')
              }}
              isPending={createMutation.isPending}
              onSubmit={(input) => createMutation.mutate(input)}
            />
          ) : selectedCadence ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{selectedCadence.name}</CardTitle>
                      {selectedCadence.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{selectedCadence.description}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={selectedCadence.status === 'active' ? 'success' : 'outline'}>{selectedCadence.status === 'active' ? 'Ativa' : 'Arquivada'}</Badge>
                      {selectedCadence.status === 'active' ? (
                        <Button type="button" variant="outline" size="sm" disabled={archiveMutation.isPending} onClick={() => {
                          if (window.confirm(`Arquivar "${selectedCadence.name}"? As inscrições existentes e suas tarefas não serão canceladas.`)) {
                            archiveMutation.mutate(selectedCadence.id)
                          }
                        }}>
                          <Archive aria-hidden="true" className="h-4 w-4" />Arquivar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedCadence.steps.map((step, index) => (
                      <div key={step.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 p-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-slate-900">{step.title}</h4>
                          <p className="mt-1 text-xs text-slate-600">
                            {step.delay_days === 0 ? 'No dia da inscrição' : `${step.delay_days} ${step.delay_days === 1 ? 'dia' : 'dias'} após a inscrição`}
                            {' · '}{taskTypeOptions.find((type) => type.value === step.task_type)?.label ?? 'Tarefa'}
                          </p>
                          {step.description ? <p className="mt-2 text-sm leading-5 text-slate-700">{step.description}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {selectedCadence.status === 'active' ? (
                <Card>
                  <CardHeader><CardTitle>Inscrever um lead</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={(event) => {
                      event.preventDefault()
                      if (!selectedLead) return
                      enrollMutation.mutate({ cadence: selectedCadence, leadId: selectedLead.id })
                    }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                        Lead da organização
                        <Select value={leadId} onValueChange={setLeadId}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um lead" /></SelectTrigger>
                          <SelectContent>
                            {organizationLeads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.company_name} · {lead.city}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </label>
                      <Button type="submit" disabled={!selectedLead || enrollMutation.isPending}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {enrollMutation.isPending ? 'Inscrevendo…' : 'Inscrever e criar tarefas'}
                      </Button>
                    </form>
                    <p className="mt-3 text-xs leading-5 text-slate-600">
                      Serão criadas {selectedCadence.steps.length} tarefas com os prazos definidos acima. A inscrição não dispara contatos.
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              <section aria-labelledby="enrollments-heading" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 id="enrollments-heading" className="text-lg font-semibold text-slate-900">Leads inscritos</h3>
                    <p className="text-sm text-slate-600">As tarefas de cada lead também aparecem em <Link to="/tasks" className="font-medium text-sky-800 hover:underline">Tarefas</Link>.</p>
                  </div>
                  <Badge variant="outline">{selectedEnrollments.length} {selectedEnrollments.length === 1 ? 'inscrição' : 'inscrições'}</Badge>
                </div>
                <EnrollmentList
                  cadence={selectedCadence}
                  enrollments={selectedEnrollments}
                  isPending={cancelMutation.isPending}
                  onCancel={(enrollment) => {
                    if (window.confirm(`Cancelar esta cadência para ${enrollment.lead_name}? As tarefas abertas também serão canceladas.`)) {
                      cancelMutation.mutate(enrollment)
                    }
                  }}
                />
              </section>
            </>
          ) : (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
                <Route aria-hidden="true" className="mb-3 h-8 w-8 text-slate-500" />
                <h3 className="font-semibold text-slate-900">Escolha ou crie uma cadência</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Cada modelo organiza etapas como tarefas com intervalos definidos, para que a equipe conduza o contato manualmente.</p>
                <Button type="button" className="mt-4" onClick={() => setShowCreateForm(true)}>
                  <Plus aria-hidden="true" className="h-4 w-4" />Criar cadência
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <ListChecks aria-hidden="true" className="h-4 w-4" />
        <span>Concluir todas as tarefas encerra a inscrição. Cancelar uma tarefa da sequência cancela também as demais tarefas abertas.</span>
        <CalendarClock aria-hidden="true" className="ml-1 h-4 w-4" />
        <span>Os prazos são calculados no momento da inscrição e usam o fuso UTC do banco.</span>
      </div>
    </div>
  )
}
