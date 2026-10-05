import { Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { getLeads } from '../../services/leads/leadService'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'
import type { Lead } from '../../types'

const emptyLeads: Lead[] = []

export function LeadsPage() {
  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: getLeads, retry: false })
  const leads = leadsQuery.data ?? emptyLeads
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [classificationFilter, setClassificationFilter] = useState('all')

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const byQuery = !query || lead.company_name.toLowerCase().includes(query.toLowerCase())
      const byStatus = statusFilter === 'all' || lead.status === statusFilter
      const byClassification = classificationFilter === 'all' || lead.classification === classificationFilter
      return byQuery && byStatus && byClassification
    })
  }, [classificationFilter, leads, query, statusFilter])

  if (leadsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  if (leadsQuery.isError) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-800">
        {leadsQuery.error instanceof Error ? leadsQuery.error.message : 'Não foi possível carregar os leads.'}
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {prospectingMockMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          Modo de demonstração: estes registros são fictícios e estão salvos apenas neste navegador.
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-600">Leads</p>
          <h2 className="text-3xl font-semibold text-slate-900">Pipeline de prospecção</h2>
        </div>
        <Button asChild>
          <Link to="/prospecting/new">Nova prospecção</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Lista de leads</CardTitle>
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="w-[220px] pl-9" placeholder="Buscar empresa" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="qualified">Qualificado</SelectItem>
                <SelectItem value="contact_pending">Contato pendente</SelectItem>
                <SelectItem value="meeting">Reunião</SelectItem>
              </SelectContent>
            </Select>

            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Classificação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filteredLeads.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center">
              <Star className="mb-3 h-10 w-10 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900">Nenhum lead encontrado</h3>
              <p className="mt-2 max-w-md text-sm text-slate-500">Ajuste os filtros ou comece a descobrir novas empresas no radar de prospecção.</p>
              <Button asChild className="mt-4">
                <Link to="/prospecting/new">Iniciar prospecção</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Oportunidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link to={`/companies/${lead.company_id}`} className="font-medium text-sky-700 hover:underline">
                        {lead.company_name}
                      </Link>
                    </TableCell>
                    <TableCell>{lead.segment}</TableCell>
                    <TableCell>{lead.score}</TableCell>
                    <TableCell>
                      <Badge variant={lead.classification === 'hot' ? 'success' : lead.classification === 'warm' ? 'warning' : 'outline'}>
                        {lead.classification}
                      </Badge>
                    </TableCell>
                    <TableCell>{lead.opportunity}</TableCell>
                    <TableCell>{lead.status}</TableCell>
                    <TableCell>{new Date(lead.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
