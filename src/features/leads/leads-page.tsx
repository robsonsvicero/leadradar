import { Mail, Search, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { deleteLeads, getLeads, type LeadWithCompanyEmail } from '../../services/leads/leadService'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'

const emptyLeads: LeadWithCompanyEmail[] = []

type PendingDeletion = {
  ids: string[]
  companyNames: string[]
}

export function LeadsPage() {
  const queryClient = useQueryClient()
  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: getLeads, retry: false })
  const leads = leadsQuery.data ?? emptyLeads
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set())
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)
  const deleteMutation = useMutation({
    mutationFn: deleteLeads,
    onSuccess: async (_data, deletedIds) => {
      const deletedIdSet = new Set(deletedIds)
      setSelectedLeadIds((current) => new Set([...current].filter((id) => !deletedIdSet.has(id))))
      setPendingDeletion(null)
      await Promise.all([
        queryClient.invalidateQueries(),
        ...deletedIds.flatMap((leadId) => [
          queryClient.removeQueries({ queryKey: ['ai-analysis', leadId] }),
          queryClient.removeQueries({ queryKey: ['ai-outreach', leadId] }),
          queryClient.removeQueries({ queryKey: ['ai-follow-up', leadId] }),
          queryClient.removeQueries({ queryKey: ['ai-reply-assistant', leadId] }),
          queryClient.removeQueries({ queryKey: ['ai-deep-analysis', leadId] }),
          queryClient.removeQueries({ queryKey: ['lead-activities', leadId] }),
        ]),
      ])
    },
  })

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const byQuery = !query || lead.company_name.toLowerCase().includes(query.toLowerCase())
      const byStatus = statusFilter === 'all' || lead.status === statusFilter
      const byClassification = classificationFilter === 'all' || lead.classification === classificationFilter
      return byQuery && byStatus && byClassification
    })
  }, [classificationFilter, leads, query, statusFilter])
  const allVisibleSelected = filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.has(lead.id))
  const someVisibleSelected = filteredLeads.some((lead) => selectedLeadIds.has(lead.id))

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const toggleVisibleSelection = () => {
    setSelectedLeadIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) filteredLeads.forEach((lead) => next.delete(lead.id))
      else filteredLeads.forEach((lead) => next.add(lead.id))
      return next
    })
  }

  const requestDeletion = (ids: string[]) => {
    deleteMutation.reset()
    setPendingDeletion({
      ids,
      companyNames: ids.map((id) => leads.find((lead) => lead.id === id)?.company_name ?? 'Lead'),
    })
  }

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
              <Input
                className="w-[220px] pl-9"
                placeholder="Buscar empresa"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedLeadIds(new Set())
                }}
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setSelectedLeadIds(new Set())
              }}
            >
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

            <Select
              value={classificationFilter}
              onValueChange={(value) => {
                setClassificationFilter(value)
                setSelectedLeadIds(new Set())
              }}
            >
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
          {selectedLeadIds.size > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-700" aria-live="polite">
                {selectedLeadIds.size} {selectedLeadIds.size === 1 ? 'lead selecionado' : 'leads selecionados'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => requestDeletion([...selectedLeadIds])}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  Excluir selecionados
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLeadIds(new Set())}>
                  Limpar seleção
                </Button>
              </div>
            </div>
          ) : null}

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
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected
                      }}
                      onChange={toggleVisibleSelection}
                      aria-label="Selecionar todos os leads filtrados"
                      className="h-4 w-4 rounded border-slate-300 accent-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                    />
                  </TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Oportunidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-12 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={lead.id} data-state={selectedLeadIds.has(lead.id) ? 'selected' : undefined}>
                    <TableCell className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        onChange={() => toggleLeadSelection(lead.id)}
                        aria-label={`Selecionar ${lead.company_name}`}
                        className="h-4 w-4 rounded border-slate-300 accent-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Link to={`/companies/${lead.company_id}`} className="font-medium text-sky-700 hover:underline">
                          {lead.company_name}
                        </Link>
                        {lead.company_email ? (
                          <a
                            href={`mailto:${lead.company_email}`}
                            aria-label={`Enviar e-mail para ${lead.company_email}`}
                            className="inline-flex max-w-full items-center gap-1.5 text-xs text-slate-600 underline-offset-4 hover:text-sky-700 hover:underline"
                          >
                            <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span className="break-all">{lead.company_email}</span>
                          </a>
                        ) : null}
                      </div>
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
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir lead ${lead.company_name}`}
                        onClick={() => requestDeletion([lead.id])}
                        className="text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {pendingDeletion ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-leads-title"
            aria-describedby="delete-leads-description"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 id="delete-leads-title" className="text-lg font-semibold text-slate-900">
              {pendingDeletion.ids.length === 1 ? 'Excluir este lead?' : `Excluir ${pendingDeletion.ids.length} leads?`}
            </h3>
            <p id="delete-leads-description" className="mt-2 text-sm leading-6 text-slate-600">
              Esta ação é permanente. Atividades, conversas, reuniões, propostas e cadências vinculadas também serão removidas. Tarefas serão mantidas sem vínculo com o lead.
            </p>
            {pendingDeletion.ids.length === 1 ? (
              <p className="mt-3 break-words text-sm font-medium text-slate-800">{pendingDeletion.companyNames[0]}</p>
            ) : null}
            {deleteMutation.isError ? (
              <Alert className="mt-4 border-red-200 bg-red-50 text-red-800">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Não foi possível excluir os leads.'}
              </Alert>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setPendingDeletion(null)
                  deleteMutation.reset()
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(pendingDeletion.ids)}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir permanentemente'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
