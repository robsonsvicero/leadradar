import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Download,
  Flame,
  Mail,
  MapPin,
  MessageSquare,
  Percent,
  Snowflake,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { getLeads, type LeadWithCompanyEmail } from '../../services/leads/leadService'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'

const contactedStatuses = new Set(['contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'won', 'lost'])
const numberFormatter = new Intl.NumberFormat('pt-BR')

function isToday(value: string): boolean {
  const date = new Date(value)
  const today = new Date()
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
}

function downloadLeadsCsv(leads: LeadWithCompanyEmail[]) {
  const columns: Array<{ label: string; value: (lead: LeadWithCompanyEmail) => string | number | null | undefined }> = [
    { label: 'Empresa', value: (lead) => lead.company_name },
    { label: 'Segmento', value: (lead) => lead.segment },
    { label: 'Cidade', value: (lead) => lead.city },
    { label: 'E-mail', value: (lead) => lead.company_email },
    { label: 'Score', value: (lead) => lead.score },
    { label: 'Classificação', value: (lead) => lead.classification },
    { label: 'Status', value: (lead) => lead.status },
    { label: 'Oportunidade', value: (lead) => lead.opportunity },
    { label: 'Motivo da oportunidade', value: (lead) => lead.opportunity_reason },
  ]
  const escapeCsv = (value: string | number | null | undefined) => {
    const text = String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&")
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = [
    columns.map(({ label }) => escapeCsv(label)).join(','),
    ...leads.map((lead) => columns.map(({ value }) => escapeCsv(value(lead))).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `leads-lead-radar-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function DashboardPage() {
  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: getLeads, retry: false })
  const leads = leadsQuery.data ?? []

  if (leadsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (leadsQuery.isError) {
    return (
      <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
        {leadsQuery.error instanceof Error ? leadsQuery.error.message : 'Não foi possível carregar os leads do dashboard.'}
      </Alert>
    )
  }

  const contactedLeads = leads.filter((lead) => Boolean(lead.last_contact_at) || contactedStatuses.has(lead.status))
  const repliedLeads = leads.filter((lead) => Boolean(lead.last_response_at) || lead.status === 'replied')
  const wonLeads = leads.filter((lead) => lead.status === 'won')
  const opportunities = leads
    .filter((lead) => lead.score >= 40)
    .sort((first, second) => second.score - first.score || first.company_name.localeCompare(second.company_name, 'pt-BR'))
  const conversionRate = contactedLeads.length === 0 ? 0 : Math.round((wonLeads.length / contactedLeads.length) * 100)

  const metrics: Metric[] = [
    { label: 'Leads hoje', value: numberFormatter.format(leads.filter((lead) => isToday(lead.created_at)).length), icon: Sparkles, tone: 'primary' },
    { label: 'Quentes', value: numberFormatter.format(leads.filter((lead) => lead.classification === 'hot').length), icon: Flame, tone: 'hot' },
    { label: 'Mornos', value: numberFormatter.format(leads.filter((lead) => lead.classification === 'warm').length), icon: Target, tone: 'warm' },
    { label: 'Frios', value: numberFormatter.format(leads.filter((lead) => lead.classification === 'cold').length), icon: Snowflake, tone: 'cold' },
    { label: 'Contatados', value: numberFormatter.format(contactedLeads.length), icon: MessageSquare, tone: 'success' },
    { label: 'Respostas', value: numberFormatter.format(repliedLeads.length), icon: MessageSquare, tone: 'success' },
    { label: 'Reuniões', value: numberFormatter.format(leads.filter((lead) => lead.status === 'meeting').length), icon: CalendarDays, tone: 'success' },
    { label: 'Conversão', value: `${conversionRate}%`, detail: 'ganhos / contatados', icon: Percent, tone: 'warm' },
    { label: 'Oportunidades', value: numberFormatter.format(opportunities.length), icon: Building2, tone: 'hot' },
    { label: 'Total leads', value: numberFormatter.format(leads.length), icon: Users, tone: 'primary' },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Painel de controle</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-xs text-muted-foreground">Visão geral das oportunidades comerciais detectadas pelo radar.</p>
        </div>
        {prospectingMockMode ? (
          <Badge variant="outline" className="border-primary/30 bg-accent/40 text-primary">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            Modo demonstração
          </Badge>
        ) : null}
      </header>

      <section aria-label="Indicadores do pipeline" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </section>

      {leads.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Target aria-hidden="true" className="mb-4 h-10 w-10 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Seu radar ainda não encontrou leads</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Inicie uma prospecção para encontrar empresas, avaliar oportunidades e organizar os próximos contatos.
            </p>
            <Button asChild className="mt-5">
              <Link to="/prospecting/new">Iniciar prospecção</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section aria-labelledby="opportunities-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="opportunities-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Flame aria-hidden="true" className="h-4 w-4 text-hot" />
              Top oportunidades
              <span className="text-xs font-normal text-muted-foreground">({numberFormatter.format(opportunities.length)})</span>
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadLeadsCsv(leads)}
              disabled={leads.length === 0}
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>

          {opportunities.length > 0 ? (
            <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
              {opportunities.map((lead) => <OpportunityCard key={lead.id} lead={lead} />)}
            </div>
          ) : (
            <Card className="border-border/80 bg-card/80 shadow-none">
              <CardContent className="py-7 text-center text-sm text-muted-foreground">
                Ainda não há oportunidades com score igual ou superior a 80.
                <Link to="/leads" className="ml-1 font-medium text-primary underline underline-offset-4">Ver todos os leads</Link>
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

type MetricTone = 'primary' | 'hot' | 'warm' | 'cold' | 'success'

type Metric = {
  label: string
  value: string
  detail?: string
  icon: typeof Sparkles
  tone: MetricTone
}

const metricToneStyles: Record<MetricTone, { icon: string; value: string }> = {
  primary: { icon: 'bg-accent text-primary', value: 'text-foreground' },
  hot: { icon: 'bg-hot/10 text-hot', value: 'text-hot' },
  warm: { icon: 'bg-warm/10 text-warm-foreground', value: 'text-warm-foreground' },
  cold: { icon: 'bg-cold/15 text-muted-foreground', value: 'text-muted-foreground' },
  success: { icon: 'bg-success/10 text-success-foreground', value: 'text-foreground' },
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  const tone = metricToneStyles[metric.tone]

  return (
    <Card className="min-w-0 border-border/80 bg-card/80 shadow-none">
      <CardContent className="flex min-h-[76px] items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
          <p className={`mt-1 text-xl font-bold leading-none tabular-nums ${tone.value}`}>{metric.value}</p>
          {metric.detail ? <p className="mt-1 truncate text-[9px] text-muted-foreground">{metric.detail}</p> : null}
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone.icon}`}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  )
}

function OpportunityCard({ lead }: { lead: LeadWithCompanyEmail }) {
  const classification = lead.classification
  const scoreTone = classification === 'hot' ? 'border-hot text-hot' : classification === 'warm' ? 'border-warm text-warm-foreground' : 'border-cold text-muted-foreground'
  const badgeTone = classification === 'hot' ? 'hot' : classification === 'warm' ? 'warm' : 'cold'
  const classificationLabel = classification === 'hot' ? 'Quente' : classification === 'warm' ? 'Morno' : 'Frio'

  return (
    <Card className="flex min-w-0 flex-col border-border/80 bg-card/80 shadow-none transition-colors hover:border-primary/25">
      <CardContent className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/companies/${lead.company_id}`}
              className="line-clamp-1 text-sm font-semibold text-foreground underline decoration-transparent underline-offset-4 hover:text-primary hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {lead.company_name}
            </Link>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{lead.segment}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`grid h-9 w-9 place-items-center rounded-full border-2 text-[11px] font-bold tabular-nums ${scoreTone}`} aria-label={`Score ${lead.score} de 100`}>
              {lead.score}
            </span>
            <Badge variant={badgeTone} className="gap-1 px-1.5 py-0.5 text-[9px] uppercase">
              <Flame aria-hidden="true" className="h-2.5 w-2.5" />
              {classificationLabel}
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
            <Link to={`/companies/${lead.company_id}`}>
              <Sparkles aria-hidden="true" className="h-3 w-3" />
              Preparar abordagem
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
