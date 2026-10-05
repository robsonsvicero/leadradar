import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CircleAlert,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileSearch,
  ListChecks,
  MessageSquareText,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import {
  completeWorkspaceTask,
  getAISDRWorkspaceData,
  type WorkspaceRecommendation,
  type WorkspaceTask,
} from '../../services/ai/aiSdrWorkspaceService'

const channelLabels = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
} as const

const actionLabels: Record<string, string> = {
  contact_now: 'Qualificar contato',
  follow_up: 'Fazer follow-up',
  review_website: 'Revisar website',
  schedule_meeting: 'Preparar reunião',
}

const taskTypeLabels: Record<string, string> = {
  follow_up: 'Follow-up',
  call: 'Ligação',
  email: 'E-mail',
  meeting: 'Reunião',
}

function companyPath(companyId: string | null | undefined) {
  return companyId ? `/companies/${companyId}` : '/leads'
}

function leadHref(leadId: string, leads: Array<{ id: string; company_id: string | null }>) {
  return companyPath(leads.find((lead) => lead.id === leadId)?.company_id)
}

function formatDueDate(value: string | null) {
  if (!value) return 'Sem prazo definido'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Prazo inválido'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
}

function isOverdue(value: string | null) {
  return Boolean(value && new Date(value).getTime() < Date.now())
}

export function AISDRPage() {
  const queryClient = useQueryClient()
  const workspace = useQuery({
    queryKey: ['ai-sdr-workspace'],
    queryFn: getAISDRWorkspaceData,
    retry: false,
  })
  const completeTask = useMutation({
    mutationFn: ({ organizationId, taskId }: { organizationId: string; taskId: string }) =>
      completeWorkspaceTask(organizationId, taskId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-sdr-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ])
    },
  })

  if (workspace.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-14 w-72" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
          <Skeleton className="h-[32rem] rounded-xl" />
          <Skeleton className="h-[32rem] rounded-xl" />
        </div>
      </div>
    )
  }

  if (workspace.isError) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-900">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível montar o workspace AI SDR.</p>
            <p className="mt-1">{workspace.error.message}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void workspace.refetch()}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )
  }

  const data = workspace.data
  if (!data) return null
  if (!data.hasOrganization) {
    return (
      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        Sua conta ainda não pertence a uma organização. Associe seu usuário a `organization_members` no Supabase para abrir o workspace.
      </Alert>
    )
  }

  const activeLeads = data.leads.filter((lead) => !['won', 'lost'].includes(lead.status))
  const analyzedLeads = activeLeads
    .filter((lead) => Boolean(lead.ai_updated_at))
    .sort((left, right) => right.action_score - left.action_score)
    .slice(0, 5)
  const leadsToReview = activeLeads
    .filter((lead) => !lead.ai_updated_at)
    .slice(0, 5)
  const openTasks = data.tasks.filter((task) => task.status !== 'done')
  const followUps = openTasks.filter((task) => task.type.toLocaleLowerCase('pt-BR').includes('follow'))
  const approvedDrafts = data.drafts.filter((draft) => draft.status === 'approved')
  const leadMap = new Map(data.leads.map((lead) => [lead.id, lead]))
  const recommendations = data.recommendations
    .filter((recommendation) => leadMap.has(recommendation.leadId))
    .slice(0, 6)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {data.demoMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          Modo de demonstração: leads e tarefas locais podem ser fictícios. Rascunhos aprovados e recomendações de IA reais não são exibidos neste modo.
        </Alert>
      ) : null}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">AI SDR</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Sua fila de trabalho comercial, reunida a partir de tarefas, leads e análises que você já solicitou.
            Nada é enviado automaticamente.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void workspace.refetch()} disabled={workspace.isFetching}>
          <RefreshCw aria-hidden="true" className={workspace.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {workspace.isFetching ? 'Atualizando…' : 'Atualizar fila'}
        </Button>
      </header>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-200 py-3 text-sm text-slate-600">
        <span><strong className="text-slate-900">{data.openTaskCount}</strong> tarefas abertas</span>
        <span><strong className="text-slate-900">{data.followUpCount}</strong> follow-ups registrados</span>
        <span><strong className="text-slate-900">{data.approvedDraftCount}</strong> mensagens aprovadas, não enviadas</span>
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
        <section aria-labelledby="next-actions-title" className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 id="next-actions-title" className="text-xl font-semibold text-slate-900">Próximas ações</h3>
              <p className="mt-1 text-sm text-slate-600">Tarefas e recomendações geradas por análises existentes.</p>
            </div>
            <Link to="/tasks" className="shrink-0 text-sm font-medium text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950">
              Ver tarefas
            </Link>
          </div>

          <Card>
            {openTasks.length || recommendations.length || leadsToReview.length ? (
              <ul className="divide-y divide-slate-200">
                {openTasks.slice(0, 6).map((task) => (
                  <TaskQueueItem
                    key={`task-${task.id}`}
                    task={task}
                    leadName={data.leads.find((lead) => lead.id === task.lead_id)?.company_name}
                    href={task.lead_id ? leadHref(task.lead_id, data.leads) : '/tasks'}
                    onComplete={() => completeTask.mutate({ organizationId: task.organization_id, taskId: task.id })}
                    completing={completeTask.isPending && completeTask.variables?.taskId === task.id}
                    error={completeTask.isError && completeTask.variables?.taskId === task.id ? completeTask.error.message : null}
                  />
                ))}
                {recommendations.slice(0, 4).map((recommendation) => (
                  <RecommendationQueueItem
                    key={`recommendation-${recommendation.id}`}
                    recommendation={recommendation}
                    leadName={leadMap.get(recommendation.leadId)?.company_name ?? 'Lead'}
                    href={leadHref(recommendation.leadId, data.leads)}
                  />
                ))}
                {leadsToReview.slice(0, 4).map((lead) => (
                  <ReviewLeadQueueItem
                    key={`review-${lead.id}`}
                    leadName={lead.company_name}
                    href={companyPath(lead.company_id)}
                  />
                ))}
              </ul>
            ) : (
              <CardContent className="py-10 text-center">
                <ListChecks aria-hidden="true" className="mx-auto h-9 w-9 text-slate-400" />
                <h4 className="mt-3 font-semibold text-slate-900">Sua fila está vazia</h4>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  Crie tarefas ou solicite uma análise na ficha de um lead. O workspace não dispara análises nem cria atividades por conta própria.
                </p>
                <Button asChild variant="outline" className="mt-4"><Link to="/leads">Abrir leads</Link></Button>
              </CardContent>
            )}
          </Card>
        </section>

        <aside className="space-y-7">
          <section aria-labelledby="messages-ready-title">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 id="messages-ready-title" className="text-lg font-semibold text-slate-900">Mensagens prontas</h3>
                <p className="mt-1 text-sm text-slate-600">Aprovadas por você; nenhuma foi enviada.</p>
              </div>
            </div>
            {approvedDrafts.length ? (
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {approvedDrafts.slice(0, 4).map((draft) => {
                  const lead = leadMap.get(draft.lead_id)
                  return (
                    <li key={draft.id} className="py-3">
                      <Link to={companyPath(lead?.company_id)} className="group flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-sky-800">{lead?.company_name ?? 'Lead removido'}</span>
                          <span className="mt-1 block text-xs text-slate-600">{channelLabels[draft.channel]} · opção {draft.approved_variant === null ? '—' : draft.approved_variant + 1}</span>
                        </span>
                        <Badge variant="success">Aprovada</Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="border-y border-slate-200 py-4 text-sm leading-6 text-slate-600">
                Nenhuma mensagem aprovada. Gere e revise um rascunho na ficha do lead; a aprovação não dispara o envio.
              </p>
            )}
          </section>

          <section aria-labelledby="follow-ups-title">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock aria-hidden="true" className="h-5 w-5 text-slate-600" />
              <h3 id="follow-ups-title" className="text-lg font-semibold text-slate-900">Follow-ups</h3>
            </div>
            {followUps.length ? (
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {followUps.slice(0, 4).map((task) => (
                  <li key={task.id} className="py-3">
                    <Link to={task.lead_id ? leadHref(task.lead_id, data.leads) : '/tasks'} className="block text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-sky-800">
                      {data.leads.find((lead) => lead.id === task.lead_id)?.company_name ?? task.title}
                    </Link>
                    <p className={isOverdue(task.due_at) ? 'mt-1 text-xs font-medium text-red-700' : 'mt-1 text-xs text-slate-600'}>
                      {isOverdue(task.due_at) ? 'Prazo vencido · ' : ''}{formatDueDate(task.due_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-y border-slate-200 py-4 text-sm leading-6 text-slate-600">
                Nenhum follow-up está registrado. O sistema não agenda contatos automaticamente.
              </p>
            )}
          </section>

          <section aria-labelledby="replies-title">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareText aria-hidden="true" className="h-5 w-5 text-slate-600" />
              <h3 id="replies-title" className="text-lg font-semibold text-slate-900">Respostas para analisar</h3>
            </div>
            <div className="border-y border-slate-200 py-4">
              <p className="text-sm leading-6 text-slate-700">
                A caixa de entrada não está conectada. Você pode colar uma resposta manualmente na ficha do lead para classificá-la e revisar uma sugestão; nenhuma conversa é monitorada.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
                <CircleHelp aria-hidden="true" className="h-4 w-4" />O texto colado não é salvo no histórico; a análise ocorre somente quando solicitada
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section aria-labelledby="top-leads-title">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="top-leads-title" className="text-xl font-semibold text-slate-900">Leads prioritários</h3>
            <p className="mt-1 text-sm text-slate-600">Ordenados pelo Action Score salvo na análise de IA mais recente.</p>
          </div>
          <Link to="/leads" className="text-sm font-medium text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950">
            Ver todos os leads
          </Link>
        </div>

        {analyzedLeads.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Empresa</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Segmento / local</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Prioridade</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Oportunidade</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Abrir lead</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analyzedLeads.map((lead) => (
                  <tr key={lead.id} className="align-middle">
                    <td className="px-4 py-3">
                      <Link to={companyPath(lead.company_id)} className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-sky-800">
                        {lead.company_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{[lead.segment, lead.city].filter(Boolean).join(' · ') || 'Não informado'}</td>
                    <td className="px-4 py-3"><span className="font-semibold tabular-nums text-slate-900">{lead.action_score}/100</span></td>
                    <td className="max-w-sm px-4 py-3 text-slate-600">{lead.opportunity || 'Oportunidade não informada'}</td>
                    <td className="px-4 py-3">
                      <Link aria-label={`Abrir ${lead.company_name}`} to={companyPath(lead.company_id)} className="inline-flex rounded p-1 text-sky-800 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
                        <ExternalLink aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 px-5 py-6">
            <p className="font-medium text-slate-900">Ainda não há Action Scores de IA para priorizar.</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              {leadsToReview.length
                ? `${leadsToReview.length} lead(s) ainda aguardam análise. Abra um lead e solicite a análise quando quiser; ela não será iniciada automaticamente.`
                : 'Quando você analisar leads, os maiores Action Scores aparecerão aqui.'}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/leads">Revisar leads</Link></Button>
          </div>
        )}
      </section>

      <section aria-labelledby="recommendations-title">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles aria-hidden="true" className="h-5 w-5 text-sky-700" />
          <h3 id="recommendations-title" className="text-xl font-semibold text-slate-900">Recomendações de IA</h3>
        </div>
        {recommendations.length ? (
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {recommendations.slice(0, 5).map((recommendation) => {
              const lead = leadMap.get(recommendation.leadId)
              return (
                <li key={recommendation.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{actionLabels[recommendation.action] ?? recommendation.action.replaceAll('_', ' ')} · {lead?.company_name}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{recommendation.reason}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0"><Link to={leadHref(recommendation.leadId, data.leads)}>Revisar recomendação<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="border-y border-slate-200 py-4 text-sm leading-6 text-slate-600">
            Ainda não há recomendações acionáveis de análises salvas. Solicite uma análise na ficha de uma empresa; o workspace apenas consulta o resultado existente.
          </p>
        )}
      </section>

      {completeTask.isError && completeTask.variables ? (
        <p role="alert" className="text-sm text-red-700">{completeTask.error.message}</p>
      ) : null}
    </div>
  )
}

function TaskQueueItem({
  task,
  leadName,
  href,
  onComplete,
  completing,
  error,
}: {
  task: WorkspaceTask
  leadName?: string
  href: string
  onComplete: () => void
  completing: boolean
  error: string | null
}) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Clock3 aria-hidden="true" className={isOverdue(task.due_at) ? 'mt-0.5 h-4 w-4 shrink-0 text-red-700' : 'mt-0.5 h-4 w-4 shrink-0 text-slate-500'} />
        <div className="min-w-0">
          <Link to={href} className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-sky-800">
            {task.title}
          </Link>
          <p className="mt-1 text-sm text-slate-600">{leadName ?? task.description ?? 'Sem lead associado'}</p>
          <p className={isOverdue(task.due_at) ? 'mt-1 text-xs font-medium text-red-700' : 'mt-1 text-xs text-slate-600'}>
            {isOverdue(task.due_at) ? 'Vencida · ' : ''}{formatDueDate(task.due_at)}
          </p>
          {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
        <Badge variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'secondary'}>
          {taskTypeLabels[task.type] ?? task.priority}
        </Badge>
        <Button type="button" variant="outline" size="sm" onClick={onComplete} disabled={completing} aria-label={`Concluir tarefa ${task.title}`}>
          {completing ? <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
          {completing ? 'Salvando…' : 'Concluir'}
        </Button>
      </div>
    </li>
  )
}

function RecommendationQueueItem({
  recommendation,
  leadName,
  href,
}: {
  recommendation: WorkspaceRecommendation
  leadName: string
  href: string
}) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Bot aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{actionLabels[recommendation.action] ?? recommendation.action.replaceAll('_', ' ')} · {leadName}</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">{recommendation.reason}</p>
          <p className="mt-1 text-xs text-slate-500">Recomendação salva em {formatDate(recommendation.createdAt)}</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 self-start"><Link to={href}>Revisar<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
    </li>
  )
}

function ReviewLeadQueueItem({ leadName, href }: { leadName: string; href: string }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <FileSearch aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0">
          <p className="font-medium text-slate-900">Revisar análise · {leadName}</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">Este lead ainda não tem análise de IA. A análise só começa quando você a solicitar na ficha.</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 self-start"><Link to={href}>Abrir ficha<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
    </li>
  )
}
