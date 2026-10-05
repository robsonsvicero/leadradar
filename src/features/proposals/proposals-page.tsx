import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CalendarClock, Check, CircleAlert, FilePlus2, FileText, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { calculateProposalTotal, createProposal, getProposalWorkspace, updateProposalStatus } from '../../services/proposals/proposalService'
import type { ProposalStatus, SalesProposal } from '../../types'

type ProposalColumn = {
  title: string
  statuses: ProposalStatus[]
  className: string
}

const proposalColumns: ProposalColumn[] = [
  { title: 'Rascunhos', statuses: ['draft'], className: 'border-slate-300 bg-slate-50' },
  { title: 'Envio registrado', statuses: ['sent'], className: 'border-sky-200 bg-sky-50/70' },
  { title: 'Aceitas', statuses: ['accepted'], className: 'border-emerald-200 bg-emerald-50/70' },
  { title: 'Encerradas', statuses: ['rejected', 'cancelled'], className: 'border-amber-200 bg-amber-50/70' },
]

const statusLabels: Record<ProposalStatus, string> = {
  draft: 'Rascunho',
  sent: 'Envio registrado',
  accepted: 'Aceita',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type DraftItem = {
  key: string
  description: string
  quantity: string
  unitPrice: string
}

function parseInputNumber(value: string) {
  const normalized = value.trim().includes(',')
    ? value.trim().replace(/\./g, '').replace(',', '.')
    : value.trim()
  return Number(normalized)
}

function formatProposalDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? 'Validade indisponível'
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function ProposalCard({
  proposal,
  onUpdateStatus,
  isUpdating,
}: {
  proposal: SalesProposal
  onUpdateStatus: (id: string, status: ProposalStatus) => void
  isUpdating: boolean
}) {
  const nextStatuses: ProposalStatus[] = proposal.status === 'draft'
    ? ['sent', 'cancelled']
    : proposal.status === 'sent'
      ? ['accepted', 'rejected', 'cancelled']
      : []

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="break-words font-semibold text-slate-900">{proposal.title}</h4>
            <p className="mt-1 text-sm text-slate-600">
              {proposal.lead_company_id
                ? <Link className="font-medium text-sky-800 hover:underline" to={`/companies/${proposal.lead_company_id}`}>{proposal.lead_name}</Link>
                : proposal.lead_name}
            </p>
          </div>
          <Badge variant={proposal.status === 'accepted' ? 'success' : proposal.status === 'rejected' || proposal.status === 'cancelled' ? 'warning' : 'outline'}>
            {statusLabels[proposal.status]}
          </Badge>
        </div>

        {proposal.scope ? <p className="whitespace-pre-line text-sm leading-5 text-slate-600">{proposal.scope}</p> : null}

        <ul className="space-y-2 border-y border-slate-100 py-3">
          {proposal.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-slate-700">
                {item.description}
                <span className="ml-1 text-slate-500">× {item.quantity}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-slate-800">{currency.format(Number(item.line_total))}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 pt-1 font-semibold text-slate-950">
            <span>Total</span>
            <span className="tabular-nums">{currency.format(proposal.total_amount)}</span>
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Criada em {formatProposalDate(proposal.created_at.slice(0, 10))}</span>
          {proposal.valid_until ? <span>Válida até {formatProposalDate(proposal.valid_until)}</span> : null}
        </div>

        {nextStatuses.length ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {nextStatuses.map((status) => {
              const label = status === 'sent'
                ? 'Registrar envio externo'
                : status === 'accepted'
                  ? 'Marcar como aceita'
                  : status === 'rejected'
                    ? 'Marcar como recusada'
                    : 'Cancelar proposta'
              const Icon = status === 'sent' ? Send : status === 'accepted' ? Check : status === 'rejected' ? X : Ban
              return (
                <Button
                  key={status}
                  type="button"
                  variant={status === 'accepted' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const needsConfirmation = status === 'accepted' || status === 'rejected' || status === 'cancelled'
                    const confirmed = !needsConfirmation || window.confirm(
                      `${label}? Depois de confirmar, o status ficará encerrado e não poderá ser alterado.`,
                    )
                    if (confirmed) onUpdateStatus(proposal.id, status)
                  }}
                  disabled={isUpdating}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </Button>
              )
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ProposalsPage() {
  const queryClient = useQueryClient()
  const [organizationId, setOrganizationId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [items, setItems] = useState<DraftItem[]>([{ key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' }])

  const workspace = useQuery({
    queryKey: ['sales-proposals'],
    queryFn: getProposalWorkspace,
    retry: false,
  })
  const createMutation = useMutation({
    mutationFn: createProposal,
    onSuccess: async () => {
      setTitle('')
      setScope('')
      setValidUntil('')
      setItems([{ key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' }])
      await queryClient.invalidateQueries({ queryKey: ['sales-proposals'] })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProposalStatus }) => updateProposalStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-proposals'] }),
  })

  const organizations = workspace.data?.organizations ?? []
  const selectedOrganizationId = organizationId || organizations[0]?.id || ''
  const organizationLeads = workspace.data?.leads.filter((lead) => lead.organization_id === selectedOrganizationId) ?? []
  const selectedLead = organizationLeads.find((lead) => lead.id === leadId)
  const itemTotal = calculateProposalTotal(items.map((item) => ({
    quantity: parseInputNumber(item.quantity),
    unitPrice: parseInputNumber(item.unitPrice),
  })))
  const mutationError = createMutation.error ?? statusMutation.error

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedLead) return
    createMutation.mutate({
      lead: selectedLead,
      title,
      scope,
      validUntil,
      items: items.map((item) => ({
        description: item.description,
        quantity: parseInputNumber(item.quantity),
        unitPrice: parseInputNumber(item.unitPrice),
      })),
    })
  }

  const updateDraftItem = (key: string, property: keyof Omit<DraftItem, 'key'>, value: string) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, [property]: value } : item))
  }

  const proposals = workspace.data?.proposals ?? []

  if (workspace.isLoading) return <Skeleton className="h-[32rem] w-full rounded-xl" />
  if (workspace.isError) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-900">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar as propostas.</p>
            <p className="mt-1">{workspace.error.message}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void workspace.refetch()}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Propostas</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Organize escopo e valores por lead, acompanhe decisões e mantenha o histórico comercial no CRM.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void workspace.refetch()} disabled={workspace.isFetching} aria-label="Atualizar propostas">
          <RefreshCw aria-hidden="true" className={workspace.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Atualizar
        </Button>
      </header>

      <Alert className="border-sky-200 bg-sky-50 text-sky-950">
        O Lead Radar não envia propostas nem gera PDF ou assinatura eletrônica. “Registrar envio externo” apenas anota que você enviou a proposta fora do app.
      </Alert>

      {organizations.length === 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          Sua conta ainda não pertence a uma organização. Peça ao administrador para adicioná-la antes de criar propostas.
        </Alert>
      ) : null}

      {mutationError ? (
        <Alert className="border-red-200 bg-red-50 text-red-900">
          <p className="font-semibold">A alteração não foi salva.</p>
          <p className="mt-1">{mutationError.message}</p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilePlus2 aria-hidden="true" className="h-5 w-5 text-sky-700" />
            Criar proposta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.data?.leads.length ? (
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm font-medium text-slate-800">
                  Organização
                  <Select value={selectedOrganizationId} onValueChange={(value) => {
                    setOrganizationId(value)
                    setLeadId('')
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a organização" /></SelectTrigger>
                    <SelectContent>
                      {organizations.map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="text-sm font-medium text-slate-800">
                  Lead
                  <Select value={leadId} onValueChange={setLeadId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um lead" /></SelectTrigger>
                    <SelectContent>
                      {organizationLeads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>{lead.company_name} · {lead.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="text-sm font-medium text-slate-800 md:col-span-2">
                  Título
                  <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder={selectedLead ? `Projeto para ${selectedLead.company_name}` : 'Ex.: Novo site institucional'} required />
                </label>
                <label className="text-sm font-medium text-slate-800 md:col-span-2">
                  Escopo (opcional)
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                    maxLength={4000}
                    value={scope}
                    onChange={(event) => setScope(event.target.value)}
                    placeholder="Descreva o que está incluído. Evite adicionar compromissos ainda não aprovados."
                  />
                </label>
                <label className="text-sm font-medium text-slate-800">
                  Validade (opcional)
                  <Input className="mt-1" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Itens e valores (BRL)</h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    if (items.length < 30) setItems((current) => [...current, { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' }])
                  }} disabled={items.length >= 30}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Adicionar item
                  </Button>
                </div>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={item.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_10rem_auto] sm:items-end">
                      <label className="text-sm font-medium text-slate-800">
                        Descrição
                        <Input className="mt-1" value={item.description} onChange={(event) => updateDraftItem(item.key, 'description', event.target.value)} maxLength={240} placeholder={`Serviço ou entrega ${index + 1}`} required />
                      </label>
                      <label className="text-sm font-medium text-slate-800">
                        Quantidade
                        <Input className="mt-1" type="text" inputMode="decimal" value={item.quantity} onChange={(event) => updateDraftItem(item.key, 'quantity', event.target.value)} placeholder="1" required />
                      </label>
                      <label className="text-sm font-medium text-slate-800">
                        Valor unitário
                        <Input className="mt-1" type="text" inputMode="decimal" value={item.unitPrice} onChange={(event) => updateDraftItem(item.key, 'unitPrice', event.target.value)} placeholder="0,00" required />
                      </label>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remover item ${index + 1}`} disabled={items.length === 1} onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}>
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  Prévia do total: <strong className="text-base text-slate-950">{currency.format(itemTotal)}</strong>
                  <span className="ml-2 text-xs">O total salvo é recalculado pelo banco.</span>
                </p>
                <Button type="submit" disabled={!selectedLead || createMutation.isPending}>
                  <FileText aria-hidden="true" className="h-4 w-4" />
                  {createMutation.isPending ? 'Salvando proposta…' : 'Salvar como rascunho'}
                </Button>
              </div>
            </form>
          ) : (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              Crie ou importe um lead antes de preparar uma proposta comercial.
            </Alert>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="proposal-board-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="proposal-board-heading" className="text-xl font-semibold text-slate-900">Quadro de propostas</h3>
            <p className="mt-1 text-sm text-slate-600">{proposals.length} {proposals.length === 1 ? 'proposta' : 'propostas'} na sua organização.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <CalendarClock aria-hidden="true" className="h-4 w-4" />
            Os status são atualizados manualmente
          </div>
        </div>

        <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-2 2xl:grid-cols-4">
          {proposalColumns.map((column) => {
            const columnProposals = proposals.filter((proposal) => column.statuses.includes(proposal.status))
            return (
              <section key={column.title} aria-label={`${column.title}: ${columnProposals.length}`} className={`min-w-0 rounded-xl border p-3 ${column.className}`}>
                <header className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-slate-900">{column.title}</h4>
                  <Badge variant="outline">{columnProposals.length}</Badge>
                </header>
                <div className="space-y-3">
                  {columnProposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      onUpdateStatus={(id, status) => statusMutation.mutate({ id, status })}
                      isUpdating={statusMutation.isPending}
                    />
                  ))}
                  {!columnProposals.length ? (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-4 text-center text-sm text-slate-500">
                      <FileText aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-slate-400" />
                      Nenhuma proposta nesta etapa.
                    </p>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </div>
  )
}
