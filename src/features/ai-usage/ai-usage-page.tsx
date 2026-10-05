import { useState } from 'react'
import { Activity, CircleAlert, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { getAIUsageData } from '../../services/ai/aiUsageService'

const operationLabels: Record<string, string> = {
  lead_intelligence: 'Análise comercial',
  deep_analysis: 'Análise aprofundada',
  outreach: 'Geração de abordagem',
  follow_up: 'Geração de follow-up',
  reply_assistant: 'Assistente de respostas',
  objection_assistant: 'Assistente de objeções',
}

const statusLabels = {
  pending: 'Em andamento',
  succeeded: 'Concluída',
  failed: 'Falhou',
} as const

function formatUSD(value: number | null) {
  if (value === null) return 'Sem estimativa'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function AIUsagePage() {
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30)
  const usage = useQuery({
    queryKey: ['ai-usage', periodDays],
    queryFn: () => getAIUsageData(periodDays),
    retry: false,
  })

  if (usage.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-14 w-80" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (usage.isError) {
    return (
      <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar o uso de IA.</p>
            <p className="mt-1">{usage.error.message}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void usage.refetch()}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )
  }

  const data = usage.data
  if (!data) return null
  if (!data.hasOrganization) {
    return (
      <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
        Sua conta ainda não pertence a uma organização; não há histórico de IA disponível para exibir.
      </Alert>
    )
  }

  const succeeded = data.logs.filter((log) => log.status === 'succeeded').length
  const failed = data.logs.filter((log) => log.status === 'failed').length
  const totalInputTokens = data.logs.reduce((total, log) => total + log.tokens_input, 0)
  const totalOutputTokens = data.logs.reduce((total, log) => total + log.tokens_output, 0)
  const totalEstimatedCost = data.logs.reduce((total, log) => {
    const cost = log.estimated_cost === null ? null : Number(log.estimated_cost)
    return cost !== null && Number.isFinite(cost) && cost >= 0 ? total + cost : total
  }, 0)
  const unestimated = data.logs.filter((log) => {
    const cost = log.estimated_cost === null ? null : Number(log.estimated_cost)
    return cost === null || !Number.isFinite(cost) || cost < 0
  }).length
  const pending = data.logs.filter((log) => log.status === 'pending').length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {data.demoMode ? (
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          O modo de demonstração não armazena chamadas reais de IA; este histórico só fica disponível com Supabase.
        </Alert>
      ) : null}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Uso e custos de IA</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Histórico de chamadas registradas para as organizações às quais você pertence. Custos são estimativas e dependem das taxas configuradas.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Período
            <select
              className="h-10 rounded-lg border border-border bg-card px-3"
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </label>
          <Button variant="outline" onClick={() => void usage.refetch()} disabled={usage.isFetching} aria-label="Atualizar histórico">
            <RefreshCw aria-hidden="true" className={usage.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </header>

      {data.isPartial ? (
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          O período contém {data.totalCount} registros, mas o painel carregou os {data.logs.length} mais recentes para manter a consulta eficiente. Os totais abaixo são parciais.
        </Alert>
      ) : null}
      {unestimated ? (
        <Alert className="border-border bg-muted text-foreground">
          {unestimated} registro(s) não têm custo estimado. Isso pode ocorrer quando a chamada falhou ou quando as taxas do modelo não estavam configuradas.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Chamadas registradas" value={data.totalCount.toLocaleString('pt-BR')} />
        <Metric label="Concluídas · falhas · pendentes" value={`${succeeded} · ${failed} · ${pending}`} />
        <Metric label="Tokens de entrada · saída" value={`${totalInputTokens.toLocaleString('pt-BR')} · ${totalOutputTokens.toLocaleString('pt-BR')}`} />
        <Metric label="Custo estimado" value={formatUSD(totalEstimatedCost)} detail="Somente registros com estimativa disponível" />
      </div>

      <section aria-labelledby="usage-by-operation">
        <h3 id="usage-by-operation" className="mb-3 text-lg font-semibold text-foreground">Consumo por operação</h3>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {data.byOperation.length ? (
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">Operação</th>
                    <th scope="col" className="px-4 py-3">Chamadas</th>
                    <th scope="col" className="px-4 py-3">Concluídas · falhas · pendentes</th>
                    <th scope="col" className="px-4 py-3">Tokens entrada · saída</th>
                    <th scope="col" className="px-4 py-3">Custo estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.byOperation.map((summary) => (
                    <tr key={summary.operation}>
                      <th scope="row" className="px-4 py-3 font-medium text-foreground">
                        {operationLabels[summary.operation] ?? summary.operation}
                      </th>
                      <td className="px-4 py-3 tabular-nums text-foreground">{summary.count}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{summary.succeeded} · {summary.failed} · {summary.pending}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{summary.inputTokens.toLocaleString('pt-BR')} · {summary.outputTokens.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {formatUSD(summary.estimatedCost)}
                        {summary.unestimatedCostCount ? <span className="ml-1 text-xs text-muted-foreground">({summary.unestimatedCostCount} sem estimativa)</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-sm leading-6 text-muted-foreground">
                Nenhuma chamada de IA foi registrada nos últimos {data.periodDays} dias.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="usage-history-title">
        <div className="mb-3 flex items-center gap-2">
          <Activity aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <h3 id="usage-history-title" className="text-lg font-semibold text-foreground">Histórico recente</h3>
        </div>
        {data.logs.length ? (
          <ul className="divide-y divide-slate-200 border-y border-border">
            {data.logs.slice(0, 100).map((log) => (
              <li key={log.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{operationLabels[log.analysis_type] ?? log.analysis_type}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(log.created_at)} · {log.model}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant={log.status === 'succeeded' ? 'success' : log.status === 'failed' ? 'danger' : 'secondary'}>
                    {statusLabels[log.status]}
                  </Badge>
                  <span className="tabular-nums">{log.tokens_input.toLocaleString('pt-BR')} entrada · {log.tokens_output.toLocaleString('pt-BR')} saída</span>
                  <span className="tabular-nums">{formatUSD(
                    log.estimated_cost === null || !Number.isFinite(Number(log.estimated_cost)) || Number(log.estimated_cost) < 0
                      ? null
                      : Number(log.estimated_cost),
                  )}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-y border-border py-4 text-sm leading-6 text-muted-foreground">O histórico aparecerá aqui após uma chamada de IA ser solicitada.</p>
        )}
        {data.logs.length > 100 ? (
          <p className="mt-2 text-xs text-muted-foreground">Mostrando as 100 chamadas mais recentes do período.</p>
        ) : null}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">
        Valores estimados não são cobrança da OpenAI nem teto de gasto. Consulte o faturamento do provedor para os valores finais.
      </p>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 break-words text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}
