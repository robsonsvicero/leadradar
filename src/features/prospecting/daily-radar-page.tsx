import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Building2, Flame, Globe, Mail, MapPin, Phone, Radar, Search, Settings2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { leadScoreThresholds } from '../../services/prospecting/scoring'
import { getSegmentLabel } from '../../services/prospecting/prospectingLabels'
import {
  getDailyRadarSnapshot,
  type DailyRadarLead,
  type DailyRadarRun,
  type DailyRadarSettings,
} from '../../services/prospecting/dailyRadarService'

const allFilter = 'Todos'
const leadStatuses = [
  allFilter,
  'new',
  'contact_pending',
  'contacted',
  'replied',
  'meeting',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const

const leadStatusLabels: Record<string, string> = {
  new: 'Novo',
  contact_pending: 'Pendente',
  contacted: 'Contatado',
  replied: 'Respondeu',
  meeting: 'Reunião',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  won: 'Ganho',
  lost: 'Perdido',
}

function settingsStatus(settings: DailyRadarSettings | undefined) {
  return settings?.enabled ? 'Ativada' : 'Pausada'
}

function getClassification(score: number) {
  return score >= leadScoreThresholds.hot
    ? 'hot'
    : score >= leadScoreThresholds.warm
      ? 'warm'
      : 'cold'
}

function getState(city: string) {
  const state = city.split(',').map((part) => part.trim()).filter(Boolean).at(-1)
  return state && /^[A-Z]{2}$/.test(state) ? state : 'Não informado'
}

function scoreLabel(classification: ReturnType<typeof getClassification>) {
  return classification === 'hot' ? 'Quente' : classification === 'warm' ? 'Morno' : 'Frio'
}

export function DailyRadarPage() {
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState(allFilter)
  const [selectedState, setSelectedState] = useState(allFilter)
  const [status, setStatus] = useState<(typeof leadStatuses)[number]>(allFilter)
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const snapshot = useQuery({
    queryKey: ['daily-radar'],
    queryFn: getDailyRadarSnapshot,
    retry: false,
    refetchInterval: 60_000,
  })
  const data = snapshot.data

  const selectedSettings = data?.settings.find((item) => item.organization_id === selectedOrganizationId)
    ?? data?.settings[0]
  const organizationRuns = data?.runs.filter((run) => run.organization_id === selectedSettings?.organization_id) ?? []
  const latestRun = organizationRuns[0]
  const segments = useMemo(
    () => [...new Set(data?.leads
      .filter((lead) => !selectedSettings || lead.organization_id === selectedSettings.organization_id)
      .map((lead) => lead.segment)
      .filter(Boolean) ?? [])].sort((first, second) => first.localeCompare(second, 'pt-BR')),
    [data?.leads, selectedSettings],
  )
  const states = useMemo(
    () => [...new Set(data?.leads
      .filter((lead) => !selectedSettings || lead.organization_id === selectedSettings.organization_id)
      .map((lead) => getState(lead.city))
      ?? [])].sort((first, second) => first.localeCompare(second, 'pt-BR')),
    [data?.leads, selectedSettings],
  )
  const visibleLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
    return (data?.leads ?? [])
      .filter((lead) => !selectedSettings || lead.organization_id === selectedSettings.organization_id)
      .filter((lead) => segment === allFilter || lead.segment === segment)
      .filter((lead) => selectedState === allFilter || getState(lead.city) === selectedState)
      .filter((lead) => status === allFilter || lead.status === status)
      .filter((lead) => !normalizedSearch || [
        lead.company_name,
        lead.segment,
        lead.city,
        lead.company_email ?? '',
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch)))
      .sort((first, second) => second.score - first.score || first.company_name.localeCompare(second.company_name, 'pt-BR'))
      .slice(0, 20)
  }, [data?.leads, search, segment, selectedSettings, selectedState, status])

  if (snapshot.isLoading) {
    return (
      <div className="space-y-5" aria-label="Carregando Radar Diário">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (snapshot.isError) {
    return (
      <div className="space-y-4">
        <PageHeading />
        <Alert role="alert" className="border-destructive/30 bg-destructive/10 text-destructive">
          {snapshot.error.message}
        </Alert>
        <Button variant="outline" onClick={() => void snapshot.refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeading />

      {data?.demoMode ? (
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          O Radar Diário aparece quando o Supabase e a prospecção automática estiverem configurados. Nenhum resultado fictício é mostrado.
        </Alert>
      ) : null}

      {!data?.demoMode && !data?.settings.length ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Radar aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold text-foreground">A automação ainda não foi configurada</h2>
                <p className="mt-1 text-sm text-muted-foreground">Configure a prospecção diária e o ICP para começar a priorizar novas oportunidades aqui.</p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link to="/settings"><Settings2 aria-hidden="true" className="h-4 w-4" />Abrir configurações</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data?.settings.length ? (
        <>
          {data.settings.length > 1 ? (
            <label className="block max-w-sm text-sm font-medium text-foreground">
              Organização
              <select
                aria-label="Organização do Radar Diário"
                value={selectedSettings?.organization_id ?? ''}
                onChange={(event) => setSelectedOrganizationId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {data.settings.map((item) => (
                  <option key={item.organization_id} value={item.organization_id}>{item.organization_name}</option>
                ))}
              </select>
            </label>
          ) : null}

          <AutomationSummary settings={selectedSettings} latestRun={latestRun} />

          <section aria-label="Filtros do Radar Diário" className="grid gap-3 rounded-xl border border-border bg-card/70 p-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-medium text-muted-foreground">
              Buscar
              <span className="relative mt-1 block">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Buscar oportunidades"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Empresa, segmento ou cidade"
                  className="h-10 w-full rounded-md border border-border bg-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </span>
            </label>
            <FilterSelect label="Segmento" value={segment} onChange={setSegment} options={[allFilter, ...segments]} formatLabel={(value) => value === allFilter ? value : getSegmentLabel(value)} />
            <FilterSelect label="Estado" value={selectedState} onChange={setSelectedState} options={[allFilter, ...states]} />
            <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as (typeof leadStatuses)[number])} options={[...leadStatuses]} formatLabel={(value) => value === allFilter ? value : leadStatusLabels[value] ?? value} />
            <label className="text-xs font-medium text-muted-foreground">
              Resultados
              <span className="mt-1 flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm text-foreground">
                {visibleLeads.length} melhores oportunidades
              </span>
            </label>
          </section>

          <section aria-labelledby="daily-opportunities-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="daily-opportunities-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Flame aria-hidden="true" className="h-4 w-4 text-hot" />
                20 melhores oportunidades
                <span className="text-xs font-normal text-muted-foreground">({visibleLeads.length})</span>
              </h2>
              {latestRun ? (
                <span className="text-xs text-muted-foreground">
                  Busca de {new Date(latestRun.started_at).toLocaleString('pt-BR')}
                </span>
              ) : null}
            </div>

            {latestRun?.status === 'failed' ? (
              <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
                A última tentativa da prospecção automática falhou{latestRun.error_message ? `: ${latestRun.error_message}` : '.'}
              </Alert>
            ) : null}
            {latestRun?.status === 'running' ? (
              <Alert className="border-primary/30 bg-accent/30 text-accent-foreground">
                A prospecção de hoje está em execução. Os resultados serão atualizados automaticamente.
              </Alert>
            ) : null}

            {visibleLeads.length ? (
              <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleLeads.map((lead) => <DailyOpportunityCard key={lead.id} lead={lead} />)}
              </div>
            ) : (
              <Card className="border-dashed border-border bg-card">
                <CardContent className="flex flex-col items-center py-10 text-center">
                  <Building2 aria-hidden="true" className="mb-3 h-8 w-8 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">
                    {latestRun?.status === 'failed' ? 'Não há resultados para esta execução' : 'Nenhuma oportunidade encontrada hoje'}
                  </h3>
                  <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                    {search || segment !== allFilter || selectedState !== allFilter || status !== allFilter
                      ? 'Ajuste ou limpe os filtros para ver outras oportunidades desta busca.'
                      : 'Quando o Radar concluir a busca automática, as empresas encontradas aparecerão priorizadas por score.'}
                  </p>
                  {search || segment !== allFilter || selectedState !== allFilter || status !== allFilter ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setSearch('')
                        setSegment(allFilter)
                        setSelectedState(allFilter)
                        setStatus(allFilter)
                      }}
                    >
                      Limpar filtros
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

function PageHeading() {
  return (
    <header>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Automação</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Radar Diário</h1>
      <p className="mt-1 text-sm text-muted-foreground">As melhores oportunidades B2B encontradas pelo radar automático.</p>
    </header>
  )
}

function AutomationSummary({
  settings,
  latestRun,
}: {
  settings: DailyRadarSettings | undefined
  latestRun: DailyRadarRun | undefined
}) {
  const isEnabled = Boolean(settings?.enabled)
  return (
    <section aria-label="Resumo da prospecção automática" className="rounded-xl border border-border bg-card/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Radar aria-hidden="true" className="h-4 w-4 text-primary" />
          Prospecção automática
        </h2>
        <Button asChild variant="ghost" size="sm" className="h-8">
          <Link to="/settings"><Settings2 aria-hidden="true" className="h-3.5 w-3.5" />Configurar</Link>
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryValue label="Diário às" value={settings?.run_time ?? '08:00'} />
        <SummaryValue label="Leads por dia" value={String(settings?.leads_per_day ?? 50)} />
        <SummaryValue label="Score mínimo" value={String(settings?.minimum_score ?? 60)} />
        <SummaryValue label="Status" value={settingsStatus(settings)} tone={isEnabled ? 'success' : 'muted'} />
      </div>
      {latestRun ? (
        <p className={`mt-2 text-xs ${latestRun.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
          Execução de hoje: {latestRun.status === 'running'
            ? 'em andamento'
            : latestRun.status === 'scheduled'
              ? 'agendada'
              : latestRun.status === 'completed'
                ? 'concluída'
                : 'falhou'}
          {' · '}{new Date(latestRun.started_at).toLocaleString('pt-BR')}
        </p>
      ) : null}
    </section>
  )
}

function SummaryValue({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'danger' | 'muted' }) {
  const valueTone = tone === 'success'
    ? 'text-success-foreground'
    : tone === 'danger'
      ? 'text-destructive'
      : tone === 'muted'
        ? 'text-muted-foreground'
        : 'text-foreground'
  return (
    <div className="min-w-0 rounded-lg bg-muted px-3 py-2">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${valueTone}`}>{value}</p>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  formatLabel = (option) => option,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  formatLabel?: (value: string) => string
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
      </select>
    </label>
  )
}

function DailyOpportunityCard({ lead }: { lead: DailyRadarLead }) {
  const classification = getClassification(lead.score)
  const badgeVariant = classification
  const scoreTone = classification === 'hot'
    ? 'border-hot text-hot'
    : classification === 'warm'
      ? 'border-warm text-warm-foreground'
      : 'border-cold text-muted-foreground'

  return (
    <Card className="flex min-w-0 flex-col border-border/80 bg-card/80 shadow-none transition-colors hover:border-primary/30">
      <CardContent className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/companies/${lead.company_id}`}
              className="line-clamp-1 text-sm font-semibold text-foreground underline decoration-transparent underline-offset-4 hover:text-primary hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {lead.company_name}
            </Link>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{getSegmentLabel(lead.segment) || 'Segmento não informado'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`grid h-9 w-9 place-items-center rounded-full border-2 text-[11px] font-bold tabular-nums ${scoreTone}`} aria-label={`Score ${lead.score} de 100`}>
              {lead.score}
            </span>
            <Badge variant={badgeVariant} className="gap-1 px-1.5 py-0.5 text-[9px] uppercase">
              <Flame aria-hidden="true" className="h-2.5 w-2.5" />
              {scoreLabel(classification)}
            </Badge>
          </div>
        </div>

        <div className="mt-2 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {lead.city ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.city}</span>
            </span>
          ) : null}
          {lead.company_website ? (
            <a href={lead.company_website} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-success-foreground hover:underline">
              <Globe aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.company_website.replace(/^https?:\/\//, '')}</span>
            </a>
          ) : null}
          {lead.company_phone ? (
            <a href={`tel:${lead.company_phone}`} className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground">
              <Phone aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.company_phone}</span>
            </a>
          ) : null}
          {lead.company_email ? (
            <a href={`mailto:${lead.company_email}`} className="inline-flex min-w-0 items-center gap-1 truncate text-primary hover:underline">
              <Mail aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.company_email}</span>
            </a>
          ) : null}
        </div>

        <div className="mt-2 rounded-lg bg-muted/80 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Oportunidade</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-4 text-foreground">{lead.opportunity || 'Oportunidade a avaliar'}</p>
          {lead.opportunity_reason ? <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{lead.opportunity_reason}</p> : null}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2">
          <Button asChild variant="secondary" size="sm" className="h-8 px-2 text-[10px]">
            <Link to={`/companies/${lead.company_id}`}>
              <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
              Ver lead
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 border-primary/25 bg-accent/30 px-2 text-[10px] text-primary hover:bg-accent/60">
            <Link to={`/companies/${lead.company_id}#outreach`}>
              <Sparkles aria-hidden="true" className="h-3 w-3" />
              Gerar abordagem
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
