import { ArrowRight, Building2, ChartNoAxesCombined, CircleDashed, MessageSquareText, Trophy, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { getDashboardStats, prospectingMockMode } from '../../services/prospecting/prospectingService'

export function DashboardPage() {
  const statsQuery = useQuery({ queryKey: ['dashboard-stats'], queryFn: getDashboardStats, retry: false })
  const stats = statsQuery.data

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-52" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (statsQuery.isError || !stats) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-800">
        {statsQuery.error instanceof Error ? statsQuery.error.message : 'Não foi possível carregar o dashboard.'}
      </Alert>
    )
  }

  const chartData = [
    { name: 'Quentes', leads: stats.hotLeads },
    { name: 'Mornos', leads: stats.warmLeads },
    { name: 'Frios', leads: stats.coldLeads },
  ]

  return (
    <div className="space-y-6">
      {prospectingMockMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          Modo de demonstração: os leads exibidos são fictícios e servem apenas para testar a interface.
        </Alert>
      ) : null}
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-600">Dashboard</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Visão geral do pipeline</h2>
        </div>
        <Button asChild>
          <Link to="/prospecting/new">
            Encontrar primeiros leads
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </header>

      {stats.isEmpty ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CircleDashed className="mb-4 h-12 w-12 text-slate-400" />
            <h3 className="text-xl font-semibold text-slate-900">Você ainda não possui leads.</h3>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Ainda não há resultados de prospecção nesta organização. Inicie uma busca para encontrar empresas e avaliar sinais digitais.
            </p>
            <Button asChild className="mt-6">
              <Link to="/prospecting/new">Encontrar primeiros leads</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Leads encontrados" value={stats.leadsFound} icon={<Users className="h-5 w-5" />} />
            <MetricCard label="Leads quentes" value={stats.hotLeads} icon={<Trophy className="h-5 w-5" />} accent="emerald" />
            <MetricCard label="Leads mornos" value={stats.warmLeads} icon={<ChartNoAxesCombined className="h-5 w-5" />} accent="amber" />
            <MetricCard label="Empresas analisadas" value={stats.companiesAnalyzed} icon={<Building2 className="h-5 w-5" />} />
            <MetricCard label="Buscas executadas" value={stats.prospectingJobs} icon={<CircleDashed className="h-5 w-5" />} accent="slate" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline</CardTitle>
                <CardDescription>Distribuição por classificação; leads frios: {stats.coldLeads}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Bar dataKey="leads" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
                <CardDescription>Indicadores operacionais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SummaryRow label="Contatos pendentes" value={stats.pendingContacts} />
                <SummaryRow label="Reuniões" value={stats.meetings} />
                <SummaryRow label="Oportunidades" value={stats.opportunities} />
                <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">
                  <MessageSquareText className="mb-2 h-5 w-5" />
                  O score atual é determinístico e prioriza sinais técnicos públicos; não usa inteligência artificial.
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, icon, accent = 'sky' }: { label: string; value: number; icon: React.ReactNode; accent?: 'sky' | 'emerald' | 'amber' | 'slate' }) {
  const accentStyles = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-200 text-slate-700',
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{value}</p>
          </div>
          <div className={`rounded-xl p-3 ${accentStyles[accent]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}
