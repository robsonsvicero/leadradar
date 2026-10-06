import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, CircleAlert, Clock3, LoaderCircle, XCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Progress } from '../../components/ui/progress'
import { Skeleton } from '../../components/ui/skeleton'
import { prospectingConfig } from '../../config/prospecting'
import { getClassificationLabel, getSegmentLabel } from '../../services/prospecting/prospectingLabels'
import {
  cancelProspectingJob,
  getProspectingJob,
  getProspectingResults,
  prospectingMockMode,
  type ProspectingJob,
} from '../../services/prospecting/prospectingService'

const stepNames: Record<string, string> = {
  searching: 'Buscando empresas',
  deduplicating: 'Removendo duplicatas',
  enriching: 'Completando dados públicos',
  analyzing: 'Analisando presença digital',
  scoring: 'Calculando oportunidades',
  saving: 'Salvando resultados',
  completed: 'Prospecção concluída',
  failed: 'Prospecção com falha',
  cancelled: 'Prospecção cancelada',
}

function isActive(job: ProspectingJob | undefined) {
  return job?.status === 'queued' || job?.status === 'running'
}

export function ProspectingJobPage() {
  const { jobId = '' } = useParams()
  const queryClient = useQueryClient()
  const job = useQuery({
    queryKey: ['prospecting-job', jobId],
    queryFn: () => getProspectingJob(jobId),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: (query) => isActive(query.state.data) ? prospectingConfig.pollingIntervalMs : false,
  })
  const results = useQuery({
    queryKey: ['prospecting-results', jobId],
    queryFn: () => getProspectingResults(job.data!),
    enabled: job.data?.status === 'completed',
    retry: false,
  })
  const cancel = useMutation({
    mutationFn: () => cancelProspectingJob(jobId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prospecting-job', jobId] })
    },
  })

  if (job.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-60" /><Skeleton className="h-56 w-full rounded-xl" /></div>
  }

  if (job.isError || !job.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar ao dashboard
        </Link>
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
          {job.error instanceof Error ? job.error.message : 'Não foi possível carregar esta prospecção.'}
        </Alert>
        <Button variant="outline" onClick={() => void job.refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  const currentJob = job.data
  const active = isActive(currentJob)
  const stateVariant = currentJob.status === 'completed'
    ? 'success'
    : currentJob.status === 'failed'
      ? 'danger'
      : currentJob.status === 'cancelled'
        ? 'secondary'
        : 'warning'
  const duration = currentJob.started_at && currentJob.completed_at
    ? Math.max(0, Math.round((Date.parse(currentJob.completed_at) - Date.parse(currentJob.started_at)) / 1000))
    : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar ao dashboard
      </Link>

      {prospectingMockMode ? (
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          Demonstração local: os resultados exibidos são fictícios e não foram pesquisados no Google.
        </Alert>
      ) : null}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-foreground">Prospecção de {getSegmentLabel(currentJob.segment)}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{currentJob.location} · até {currentJob.target_quantity} empresas</p>
        </div>
        <Badge variant={stateVariant}>{currentJob.status === 'running' ? 'Em andamento' : currentJob.status === 'queued' ? 'Na fila' : currentJob.status === 'completed' ? 'Concluída' : currentJob.status === 'failed' ? 'Falhou' : 'Cancelada'}</Badge>
      </header>

      {cancel.isError ? <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{cancel.error.message}</Alert> : null}
      {currentJob.error_message ? (
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden="true" className="mr-2 inline h-4 w-4" />
          {currentJob.error_message}
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>
              {currentJob.status === 'cancelled'
                ? stepNames.cancelled
                : stepNames[currentJob.current_step] ?? 'Processando prospecção'}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {active
                ? 'O progresso é atualizado automaticamente.'
                : currentJob.status === 'cancelled'
                  ? `Execução encerrada com ${currentJob.companies_analyzed} empresa(s) analisada(s).`
                  : duration === null
                    ? 'A execução foi interrompida antes do início.'
                    : `Tempo de execução: ${duration}s`}
            </p>
          </div>
          {active ? (
            <Button variant="outline" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <XCircle aria-hidden="true" className="h-4 w-4" />}
              Cancelar
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm font-medium text-foreground">
            <span>Progresso</span>
            <span>{currentJob.progress_percentage}%</span>
          </div>
          <Progress value={currentJob.progress_percentage} className="mt-2 h-3" />
          {active
            ? <p className="mt-3 text-sm text-muted-foreground">Esta página acompanha a execução em segundo plano.</p>
            : currentJob.status === 'cancelled'
              ? <p className="mt-3 text-sm text-muted-foreground">32% é o último progresso registrado antes do cancelamento.</p>
              : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <StatCard label="Empresas encontradas" value={currentJob.companies_found} icon={<Building2 aria-hidden="true" className="h-4 w-4" />} />
        <StatCard label="Empresas únicas" value={currentJob.companies_unique} icon={<Building2 aria-hidden="true" className="h-4 w-4" />} />
        <StatCard label="Empresas analisadas" value={currentJob.companies_analyzed} icon={<Building2 aria-hidden="true" className="h-4 w-4" />} />
        <StatCard label="Leads quentes" value={currentJob.hot_leads} />
        <StatCard label="Leads mornos" value={currentJob.warm_leads} />
        <StatCard label="Leads frios" value={currentJob.cold_leads} />
        <StatCard label="Erros parciais" value={currentJob.error_count} icon={<CircleAlert aria-hidden="true" className="h-4 w-4" />} />
      </div>

      {currentJob.status === 'completed' ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-foreground">Melhores oportunidades</h3>
            <Link to="/leads" className="text-sm font-medium text-primary hover:underline">Ver todos os leads</Link>
          </div>
          {results.isLoading ? <Skeleton className="h-44 w-full rounded-xl" /> : null}
          {results.isError ? (
            <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
              {results.error instanceof Error ? results.error.message : 'Não foi possível carregar os resultados.'}
            </Alert>
          ) : null}
          {results.data?.length === 0 ? (
            <Alert className="border-border bg-muted text-foreground">A prospecção terminou, mas não retornou leads associados ao job.</Alert>
          ) : null}
          {results.data?.slice(0, 10).map((lead) => (
            <Card key={lead.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">{lead.company_name}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{getSegmentLabel(lead.segment)} · {lead.city}</p>
                  <p className="mt-1 text-sm text-foreground"><strong>Oportunidade técnica:</strong> {lead.opportunity}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{lead.opportunity_reason}</p>
                  {lead.target_fit ? (
                    <div className="mt-2">
                      <p className="text-sm text-foreground">
                        <strong>Aderência B2B:</strong>{' '}
                        {lead.target_fit === 'matched' ? 'Compatível com o perfil-alvo' : 'Não confirmada automaticamente'}
                        {lead.matched_service ? ` · Serviço: ${lead.matched_service}` : ''}
                      </p>
                      {lead.target_fit_reason ? <p className="mt-1 text-xs text-muted-foreground">{lead.target_fit_reason}</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-foreground">Score {lead.score}</span>
                  <Badge variant={lead.classification === 'hot' ? 'hot' : lead.classification === 'warm' ? 'warm' : 'cold'}>
                    {getClassificationLabel(lead.classification)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        {icon ?? <Clock3 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
      </CardContent>
    </Card>
  )
}
