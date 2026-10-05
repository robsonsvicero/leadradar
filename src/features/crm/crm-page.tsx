import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Building2, CircleAlert, RefreshCw, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { getPipelineStageColor, getPipelineWorkspace, updateLeadOwner, updateLeadPipelineStage, type PipelineOutcome } from '../../services/crm/pipelineService'
import type { Lead, PipelineStage } from '../../types'

const unassignedFilter = '__unassigned'
const anyOwnerFilter = '__all'
const emptyLeads: Lead[] = []

export function CRMPage() {
  const queryClient = useQueryClient()
  const [ownerFilter, setOwnerFilter] = useState(anyOwnerFilter)
  const workspace = useQuery({
    queryKey: ['crm-pipeline'],
    queryFn: getPipelineWorkspace,
    retry: false,
  })
  const stageMutation = useMutation({
    mutationFn: ({ lead, stage, outcome }: { lead: Lead; stage: PipelineStage; outcome?: PipelineOutcome }) => updateLeadPipelineStage(lead, stage, outcome),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] }),
  })
  const ownerMutation = useMutation({
    mutationFn: ({ lead, ownerId }: { lead: Lead; ownerId: string | null }) => updateLeadOwner(lead, ownerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] }),
  })

  const data = workspace.data
  const stages = data?.stages ?? []
  const leads = data?.leads ?? emptyLeads
  const filterMembers = [...new Map((data?.members ?? []).map((member) => [member.user_id, member])).values()]
  const filteredLeads = useMemo(
    () => leads.filter((lead) => {
      if (ownerFilter === anyOwnerFilter) return true
      if (ownerFilter === unassignedFilter) return !lead.owner_id
      return lead.owner_id === ownerFilter
    }),
    [leads, ownerFilter],
  )
  const failedMutation = stageMutation.error ?? ownerMutation.error

  if (workspace.isLoading) return <Skeleton className="h-[32rem] w-full rounded-xl" />
  if (workspace.isError) {
    return (
      <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar o pipeline.</p>
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Pipeline comercial</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Acompanhe cada oportunidade, seu próximo passo e quem está responsável por avançá-la.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="sr-only">Filtrar por responsável</span>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-52" aria-label="Filtrar por responsável">
                <SelectValue placeholder="Todos os responsáveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={anyOwnerFilter}>Todos os responsáveis</SelectItem>
                <SelectItem value={unassignedFilter}>Sem responsável</SelectItem>
                {filterMembers.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.full_name || `Membro ${member.user_id.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button type="button" variant="outline" onClick={() => void workspace.refetch()} disabled={workspace.isFetching} aria-label="Atualizar pipeline">
            <RefreshCw aria-hidden="true" className={workspace.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </header>

      {failedMutation ? (
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
          <p className="font-semibold">A alteração não foi salva.</p>
          <p className="mt-1">{failedMutation.message}</p>
        </Alert>
      ) : null}

      {data?.isPartial ? (
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          Exibindo os {leads.length} leads mais recentes de {data.totalLeads}. Os demais ainda não estão carregados neste quadro; a paginação será adicionada em uma próxima etapa.
        </Alert>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        As probabilidades são estimativas configuráveis da etapa, não uma previsão financeira nem garantia de venda.
      </p>

      {!stages.length ? (
        <Card>
          <CardContent className="p-6 text-sm leading-6 text-foreground">
            Nenhuma etapa de pipeline foi encontrada. Aplique a migration `20261004190000_crm_pipeline_operations.sql` no Supabase e atualize esta página.
          </CardContent>
        </Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="grid auto-cols-[minmax(17rem,20rem)] grid-flow-col gap-4">
            {stages.map((stage) => {
              const items = filteredLeads.filter((lead) => lead.pipeline_stage_id === stage.id)
              return (
                <section key={stage.id} aria-labelledby={`stage-${stage.id}`}>
                  <Card className="h-full min-h-[28rem] bg-muted/70">
                    <CardHeader className="pb-3">
                      <CardTitle id={`stage-${stage.id}`} className="flex items-center justify-between gap-2 text-base">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getPipelineStageColor(stage) }} />
                          <span className="truncate">{stage.name}</span>
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">{items.length}</span>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Probabilidade estimada: {stage.probability}%</p>
                      {!stage.is_active ? <p className="text-xs font-medium text-warm-foreground">Etapa inativa · mantenha ou mova os leads para uma etapa ativa.</p> : null}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {items.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Nenhum lead nesta etapa.</p>
                      ) : items.map((lead) => (
                        <LeadPipelineCard
                          key={lead.id}
                          lead={lead}
                          stage={stage}
                          stages={stages.filter((candidate) => candidate.organization_id === lead.organization_id && (candidate.is_active || candidate.id === lead.pipeline_stage_id))}
                          members={data?.members.filter((member) => member.organization_id === lead.organization_id) ?? []}
                          canReassign={['owner', 'admin'].includes(data?.currentRoles[lead.organization_id] ?? '')}
                          isUpdating={stageMutation.isPending || ownerMutation.isPending}
                          onStageChange={(nextStage, outcome) => stageMutation.mutate({ lead, stage: nextStage, outcome })}
                          onOwnerChange={(ownerId) => ownerMutation.mutate({ lead, ownerId })}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {data?.totalLeads === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Building2 aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold text-foreground">Seu pipeline está vazio</h3>
          <p className="mt-1 text-sm text-muted-foreground">Encontre empresas no Radar ou adicione leads à organização para começar.</p>
        </div>
      ) : null}

      {data?.demoMode ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          Modo de demonstração: alterações ficam neste navegador e não são compartilhadas com outras pessoas.
        </p>
      ) : null}
    </div>
  )
}

function LeadPipelineCard({
  lead,
  stage,
  stages,
  members,
  canReassign,
  isUpdating,
  onStageChange,
  onOwnerChange,
}: {
  lead: Lead
  stage: PipelineStage
  stages: PipelineStage[]
  members: { organization_id: string; user_id: string; role: string; full_name: string | null }[]
  canReassign: boolean
  isUpdating: boolean
  onStageChange: (stage: PipelineStage, outcome?: PipelineOutcome) => void
  onOwnerChange: (ownerId: string | null) => void
}) {
  const [pendingStage, setPendingStage] = useState<PipelineStage | null>(null)
  const [lossReason, setLossReason] = useState('__choose')
  const [lossNotes, setLossNotes] = useState('')
  const [wonService, setWonService] = useState(lead.won_service ?? '')
  const [wonReason, setWonReason] = useState(lead.won_reason ?? '')
  const currentOwner = members.find((member) => member.user_id === lead.owner_id)
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/companies/${lead.company_id}`} className="min-w-0 text-sm font-semibold text-foreground underline decoration-transparent underline-offset-4 hover:text-primary hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {lead.company_name}
        </Link>
        <Badge variant={lead.classification === 'hot' ? 'hot' : lead.classification === 'warm' ? 'warm' : 'cold'}>
          {lead.classification === 'hot' ? 'Quente' : lead.classification === 'warm' ? 'Morno' : 'Frio'}
        </Badge>
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">Action Score {lead.action_score} · ICP {lead.icp_match}</p>
      {lead.next_best_action ? (
        <p className="mt-2 rounded-md bg-accent/50 px-2.5 py-2 text-xs leading-5 text-primary">
          Próxima ação: {lead.next_best_action}
          {lead.next_best_action_reason ? <span className="block text-primary">{lead.next_best_action_reason}</span> : null}
        </p>
      ) : lead.next_action ? (
        <p className="mt-2 text-xs leading-5 text-foreground">Próxima ação: {lead.next_action}</p>
      ) : null}
      {lead.next_action_at ? (
        <p className="mt-1 text-xs text-muted-foreground">Prazo: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lead.next_action_at))}</p>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-foreground">
        Mover para
        <Select value={stage.id} disabled={isUpdating} onValueChange={(stageId) => {
          const nextStage = stages.find((candidate) => candidate.id === stageId)
          if (!nextStage) return
          if (nextStage.is_won || nextStage.is_lost) {
            setPendingStage(nextStage)
            setLossReason('__choose')
            setLossNotes('')
            return
          }
          setPendingStage(null)
          onStageChange(nextStage)
        }}>
          <SelectTrigger className="mt-1 h-9 text-xs" aria-label={`Mover ${lead.company_name} para outra etapa`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stages.filter((option) => option.is_active || option.id === stage.id).map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      {pendingStage?.is_lost ? (
        <div className="mt-3 space-y-2 rounded-lg bg-destructive/10 p-3">
          <p className="text-xs font-semibold text-destructive">Encerrar como {pendingStage.name}</p>
          <label className="block text-xs font-medium text-destructive">
            Motivo da perda
            <Select value={lossReason} onValueChange={setLossReason}>
              <SelectTrigger className="mt-1 h-9 bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__choose">Selecione um motivo</SelectItem>
                {[
                  ['price', 'Preço'], ['timing', 'Momento inadequado'], ['competitor', 'Concorrente'],
                  ['no_budget', 'Sem orçamento'], ['no_need', 'Sem necessidade'],
                  ['no_response', 'Sem resposta'], ['bad_fit', 'Fora do perfil'], ['other', 'Outro'],
                ].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="block text-xs font-medium text-destructive">
            Observações (opcional)
            <Input className="mt-1 h-9 bg-card text-xs" maxLength={500} value={lossNotes} onChange={(event) => setLossNotes(event.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={lossReason === '__choose' || isUpdating} onClick={() => {
              onStageChange(pendingStage, { lostReason: lossReason, lostNotes: lossNotes })
              setPendingStage(null)
            }}>Confirmar perda</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPendingStage(null)}>Cancelar</Button>
          </div>
        </div>
      ) : null}
      {pendingStage?.is_won ? (
        <div className="mt-3 space-y-2 rounded-lg bg-success/10 p-3">
          <p className="text-xs font-semibold text-success-foreground">Encerrar como {pendingStage.name}</p>
          <label className="block text-xs font-medium text-success-foreground">
            Serviço vendido
            <Input className="mt-1 h-9 bg-card text-xs" maxLength={160} value={wonService} onChange={(event) => setWonService(event.target.value)} required />
          </label>
          <label className="block text-xs font-medium text-success-foreground">
            Motivo da vitória
            <Input className="mt-1 h-9 bg-card text-xs" maxLength={500} value={wonReason} onChange={(event) => setWonReason(event.target.value)} required />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!wonService.trim() || !wonReason.trim() || isUpdating} onClick={() => {
              onStageChange(pendingStage, { wonService, wonReason })
              setPendingStage(null)
            }}>Confirmar venda</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPendingStage(null)}>Cancelar</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        {canReassign ? (
          <label className="block text-xs font-medium text-foreground">
            Responsável
            <Select
              value={lead.owner_id ?? '__unassigned'}
              disabled={isUpdating}
              onValueChange={(value) => onOwnerChange(value === '__unassigned' ? null : value)}
            >
              <SelectTrigger className="mt-1 h-9 text-xs" aria-label={`Alterar responsável de ${lead.company_name}`}>
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned">Sem responsável</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.full_name || `Membro ${member.user_id.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">Responsável: {currentOwner?.full_name ?? (lead.owner_id ? `Membro ${lead.owner_id.slice(0, 8)}` : 'Não atribuído')}</p>
        )}
      </div>
    </article>
  )
}
