import { ArrowDown, ArrowUp, Mail, Pencil, Search, Star, Trash2 } from 'lucide-react'
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
import { deleteLeads, getLeadOpportunityText, getLeads, updateLeadOpportunity, type LeadWithCompanyEmail } from '../../services/leads/leadService'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'
import { getClassificationLabel, getSegmentLabel } from '../../services/prospecting/prospectingLabels'

const emptyLeads: LeadWithCompanyEmail[] = []

type PendingDeletion = {
  ids: string[]
  companyNames: string[]
}

type SortColumn = 'company' | 'segment' | 'score' | 'classification' | 'opportunity' | 'status' | 'date'
type SortDirection = 'asc' | 'desc'

function isLeadNewToday(createdAt: string, year: number, month: number, day: number) {
  const createdDate = new Date(createdAt)
  return createdDate.getFullYear() === year
    && createdDate.getMonth() === month
    && createdDate.getDate() === day
}

export function LeadsPage() {
  const queryClient = useQueryClient()
  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: getLeads, retry: false })
  const leads = leadsQuery.data ?? emptyLeads
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [sortColumn, setSortColumn] = useState<SortColumn>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set())
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)
  const [editingOpportunityLeadId, setEditingOpportunityLeadId] = useState<string | null>(null)
  const [opportunityDraft, setOpportunityDraft] = useState('')
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
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
  const opportunityMutation = useMutation({
    mutationFn: ({ leadId, opportunityOverride }: { leadId: string; opportunityOverride: string | null }) =>
      updateLeadOpportunity(leadId, opportunityOverride),
    onSuccess: async () => {
      setEditingOpportunityLeadId(null)
      setOpportunityDraft('')
      await queryClient.invalidateQueries()
    },
  })

  const filteredLeads = useMemo(() => {
    const filtered = leads.filter((lead) => {
      const byQuery = !query || lead.company_name.toLowerCase().includes(query.toLowerCase())
      const byStatus = statusFilter === 'all' || lead.status === statusFilter
      const byClassification = classificationFilter === 'all' || lead.classification === classificationFilter
      return byQuery && byStatus && byClassification
    })

    return filtered.sort((first, second) => {
      let comparison = 0
      switch (sortColumn) {
        case 'company':
          comparison = first.company_name.localeCompare(second.company_name, 'pt-BR')
          break
        case 'segment':
          comparison = getSegmentLabel(first.segment).localeCompare(getSegmentLabel(second.segment), 'pt-BR')
          break
        case 'score':
          comparison = first.score - second.score
          break
        case 'classification':
          comparison = getClassificationLabel(first.classification).localeCompare(getClassificationLabel(second.classification), 'pt-BR')
          break
        case 'opportunity':
          comparison = getLeadOpportunityText(first).localeCompare(getLeadOpportunityText(second), 'pt-BR')
          break
        case 'status':
          comparison = Number(isLeadNewToday(first.created_at, currentYear, currentMonth, currentDay))
            - Number(isLeadNewToday(second.created_at, currentYear, currentMonth, currentDay))
          break
        case 'date':
          comparison = new Date(first.created_at).getTime() - new Date(second.created_at).getTime()
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [classificationFilter, currentDay, currentMonth, currentYear, leads, query, sortColumn, sortDirection, statusFilter])
  const allVisibleSelected = filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.has(lead.id))
  const someVisibleSelected = filteredLeads.some((lead) => selectedLeadIds.has(lead.id))

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  const sortableHeader = (column: SortColumn, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(column)}
      className="inline-flex items-center gap-1.5 text-left font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      {sortColumn === column ? (
        sortDirection === 'asc'
          ? <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
          : <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
      ) : null}
    </button>
  )

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

  const startEditingOpportunity = (lead: LeadWithCompanyEmail) => {
    opportunityMutation.reset()
    setOpportunityDraft(getLeadOpportunityText(lead))
    setEditingOpportunityLeadId(lead.id)
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
      <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
        {leadsQuery.error instanceof Error ? leadsQuery.error.message : 'Não foi possível carregar os leads.'}
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {prospectingMockMode ? (
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          Modo de demonstração: estes registros são fictícios e estão salvos apenas neste navegador.
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Leads</p>
          <h2 className="text-3xl font-semibold text-foreground">Pipeline de prospecção</h2>
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
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
              aria-label="Filtrar por etapa do lead"
              onValueChange={(value) => {
                setStatusFilter(value)
                setSelectedLeadIds(new Set())
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Etapa do lead" />
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
                <SelectItem value="hot">Quente</SelectItem>
                <SelectItem value="warm">Morno</SelectItem>
                <SelectItem value="cold">Frio</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {selectedLeadIds.size > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-foreground" aria-live="polite">
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
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted text-center">
              <Star className="mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-foreground">Nenhum lead encontrado</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Ajuste os filtros ou comece a descobrir novas empresas no radar de prospecção.</p>
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
                      className="h-4 w-4 rounded border-border accent-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'company' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('company', 'Empresa')}
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'segment' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('segment', 'Segmento')}
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'score' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('score', 'Score')}
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'classification' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('classification', 'Classificação')}
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'opportunity' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('opportunity', 'Oportunidade')}
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('status', 'Status')}
                  </TableHead>
                  <TableHead aria-sort={sortColumn === 'date' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {sortableHeader('date', 'Data')}
                  </TableHead>
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
                        className="h-4 w-4 rounded border-border accent-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Link to={`/companies/${lead.company_id}`} className="font-medium text-primary hover:underline">
                          {lead.company_name}
                        </Link>
                        {lead.company_email ? (
                          <a
                            href={`mailto:${lead.company_email}`}
                            aria-label={`Enviar e-mail para ${lead.company_email}`}
                            className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span className="break-all">{lead.company_email}</span>
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{getSegmentLabel(lead.segment)}</TableCell>
                    <TableCell>{lead.score}</TableCell>
                    <TableCell>
                      <Badge variant={lead.classification === 'hot' ? 'hot' : lead.classification === 'warm' ? 'warm' : 'cold'}>
                        {getClassificationLabel(lead.classification)}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-64">
                      <div className="space-y-1">
                        <p className="whitespace-pre-line break-words">{getLeadOpportunityText(lead)}</p>
                        {lead.opportunity_override ? (
                          <p className="text-xs text-primary">Personalizada por você</p>
                        ) : null}
                        {lead.target_fit ? (
                          <p className="text-xs text-muted-foreground">
                            B2B: {lead.target_fit === 'matched' ? 'compatível' : 'não confirmado'}
                            {lead.matched_service ? ` · ${lead.matched_service}` : ''}
                          </p>
                        ) : null}
                        {editingOpportunityLeadId === lead.id ? (
                          <form
                            className="space-y-2 pt-2"
                            onSubmit={(event) => {
                              event.preventDefault()
                              opportunityMutation.mutate({
                                leadId: lead.id,
                                opportunityOverride: opportunityDraft.trim() || null,
                              })
                            }}
                          >
                            <label htmlFor={`opportunity-${lead.id}`} className="sr-only">
                              Oportunidade de {lead.company_name}
                            </label>
                            <textarea
                              id={`opportunity-${lead.id}`}
                              value={opportunityDraft}
                              onChange={(event) => setOpportunityDraft(event.target.value)}
                              rows={3}
                              aria-describedby={`opportunity-help-${lead.id}`}
                              className="w-full min-w-56 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <p id={`opportunity-help-${lead.id}`} className="text-xs text-muted-foreground">
                              Seu texto prevalece sobre a análise automática. Deixe em branco para restaurar a sugestão.
                            </p>
                            {opportunityMutation.isError ? (
                              <Alert role="alert" className="border-destructive/30 bg-destructive/10 text-destructive">
                                {opportunityMutation.error instanceof Error
                                  ? opportunityMutation.error.message
                                  : 'Não foi possível salvar a oportunidade.'}
                              </Alert>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button type="submit" size="sm" disabled={opportunityMutation.isPending}>
                                {opportunityMutation.isPending ? 'Salvando…' : 'Salvar'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={opportunityMutation.isPending}
                                onClick={() => {
                                  setEditingOpportunityLeadId(null)
                                  setOpportunityDraft('')
                                  opportunityMutation.reset()
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Editar oportunidade de ${lead.company_name}`}
                            disabled={opportunityMutation.isPending}
                            onClick={() => startEditingOpportunity(lead)}
                            className="h-7 px-2 text-xs"
                          >
                            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                            Editar oportunidade
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLeadNewToday(lead.created_at, currentYear, currentMonth, currentDay) ? 'success' : 'cold'}>
                        {isLeadNewToday(lead.created_at, currentYear, currentMonth, currentDay) ? 'Novo' : 'Antigo'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(lead.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir lead ${lead.company_name}`}
                        onClick={() => requestDeletion([lead.id])}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/40 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-leads-title"
            aria-describedby="delete-leads-description"
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 id="delete-leads-title" className="text-lg font-semibold text-foreground">
              {pendingDeletion.ids.length === 1 ? 'Excluir este lead?' : `Excluir ${pendingDeletion.ids.length} leads?`}
            </h3>
            <p id="delete-leads-description" className="mt-2 text-sm leading-6 text-muted-foreground">
              Esta ação é permanente. Atividades, conversas, reuniões, propostas e cadências vinculadas também serão removidas. Tarefas serão mantidas sem vínculo com o lead.
            </p>
            {pendingDeletion.ids.length === 1 ? (
              <p className="mt-3 break-words text-sm font-medium text-foreground">{pendingDeletion.companyNames[0]}</p>
            ) : null}
            {deleteMutation.isError ? (
              <Alert className="mt-4 border-destructive/30 bg-destructive/10 text-destructive">
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
