import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CircleAlert,
  Inbox,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { getInboxWorkspace, getConversationMessages, createConversation, addConversationMessage, updateConversationStatus } from '../../services/inbox/inboxService'
import type {
  ConversationChannel,
  ConversationMessageDirection,
  ConversationMessageStatus,
  ConversationStatus,
  InboxConversation,
} from '../../types'

const channelLabels: Record<ConversationChannel, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  phone: 'Telefone',
  other: 'Outro',
}

const entryOptions: Array<{
  value: 'inbound' | 'draft' | 'sent'
  label: string
}> = [
  { value: 'inbound', label: 'Resposta recebida (registrar)' },
  { value: 'draft', label: 'Rascunho de resposta (não enviado)' },
  { value: 'sent', label: 'Mensagem enviada fora do Lead Radar' },
]

type ConversationFilter = 'all' | 'open' | 'archived'
const emptyConversations: InboxConversation[] = []

function formatDate(value: string | null) {
  if (!value) return 'Sem mensagens'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function messageLabel(direction: ConversationMessageDirection, status: ConversationMessageStatus) {
  if (status === 'draft') return 'Rascunho · não enviado'
  return direction === 'inbound' ? 'Resposta recebida · registro manual' : 'Saída enviada fora do app'
}

function EntryIcon({ direction }: { direction: ConversationMessageDirection }) {
  return direction === 'inbound'
    ? <ArrowDownLeft aria-hidden="true" className="h-4 w-4" />
    : <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
}

export function InboxPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ConversationFilter>('open')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [channel, setChannel] = useState<ConversationChannel>('email')
  const [title, setTitle] = useState('')
  const [entryKind, setEntryKind] = useState<'inbound' | 'draft' | 'sent'>('draft')
  const [body, setBody] = useState('')

  const workspace = useQuery({
    queryKey: ['inbox-workspace'],
    queryFn: getInboxWorkspace,
    retry: false,
  })
  const conversations = workspace.data?.conversations ?? emptyConversations
  const filteredConversations = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
    return conversations.filter((conversation) => {
      if (filter !== 'all' && conversation.status !== filter) return false
      if (!normalizedSearch) return true
      return [
        conversation.title,
        conversation.lead_name,
        conversation.last_message_excerpt ?? '',
        conversation.organization_name,
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
    })
  }, [conversations, filter, search])
  const selectedConversation = filteredConversations.find((conversation) => conversation.id === selectedId)
    ?? filteredConversations[0]
  const selectedConversationId = selectedConversation?.id ?? null
  const selectedLead = workspace.data?.leads.find((lead) => lead.id === leadId)

  const messages = useQuery({
    queryKey: ['inbox-messages', selectedConversationId],
    queryFn: () => selectedConversationId
      ? getConversationMessages(selectedConversationId)
      : Promise.resolve([]),
    enabled: Boolean(selectedConversationId),
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: async (conversation) => {
      setCreating(false)
      setFilter('open')
      setSelectedId(conversation.id)
      setMobileThreadOpen(true)
      setLeadId('')
      setTitle('')
      await queryClient.invalidateQueries({ queryKey: ['inbox-workspace'] })
    },
  })
  const addMessageMutation = useMutation({
    mutationFn: ({ conversation, direction, status, body: messageBody }: {
      conversation: InboxConversation
      direction: ConversationMessageDirection
      status: ConversationMessageStatus
      body: string
    }) => addConversationMessage(conversation, { direction, status, body: messageBody }),
    onSuccess: async (_message, variables) => {
      setBody('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inbox-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox-messages', variables.conversation.id] }),
      ])
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConversationStatus }) => updateConversationStatus(id, status),
    onSuccess: async (_conversation, variables) => {
      setFilter(variables.status)
      await queryClient.invalidateQueries({ queryKey: ['inbox-workspace'] })
    },
  })

  if (workspace.isLoading) {
    return <div className="h-96 animate-pulse rounded-xl bg-slate-200" aria-label="Carregando Inbox" />
  }
  if (workspace.isError) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-900">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar o Inbox.</p>
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

  const actionError = createMutation.error ?? addMessageMutation.error ?? statusMutation.error
  const organizations = workspace.data?.organizations ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Inbox</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Revise conversas registradas manualmente e mantenha o próximo contato no contexto do lead.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void workspace.refetch()}
            disabled={workspace.isFetching}
            aria-label="Atualizar Inbox"
          >
            <RefreshCw aria-hidden="true" className={workspace.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Atualizar
          </Button>
          <Button type="button" onClick={() => setCreating((current) => !current)}>
            <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
            Nova conversa
          </Button>
        </div>
      </header>

      <Alert className="border-sky-200 bg-sky-50 text-sky-950">
        Registro manual: o Inbox não sincroniza e-mail ou WhatsApp. Rascunhos ficam salvos para revisão; mensagens enviadas precisam ter sido enviadas fora do Lead Radar.
      </Alert>

      {actionError ? (
        <Alert className="border-red-200 bg-red-50 text-red-900">
          <p className="font-semibold">A alteração não foi salva.</p>
          <p className="mt-1">{actionError.message}</p>
        </Alert>
      ) : null}

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Iniciar uma conversa</CardTitle>
          </CardHeader>
          <CardContent>
            {workspace.data?.leads.length ? (
              <form
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.3fr)_minmax(10rem,.7fr)_minmax(14rem,1fr)_auto]"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!selectedLead) return
                  createMutation.mutate({ lead: selectedLead, channel, title })
                }}
              >
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
                  Lead
                  <select
                    required
                    value={leadId}
                    onChange={(event) => setLeadId(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                  >
                    <option value="" disabled>Selecione um lead</option>
                    {organizations.map((organization) => {
                      const organizationLeads = workspace.data?.leads.filter((lead) => lead.organization_id === organization.id) ?? []
                      if (!organizationLeads.length) return null
                      return (
                        <optgroup key={organization.id} label={organization.name}>
                          {organizationLeads.map((lead) => (
                            <option key={lead.id} value={lead.id}>{lead.company_name} · {lead.city}</option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
                  Canal
                  <select
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as ConversationChannel)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                  >
                    {Object.entries(channelLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
                  Assunto ou contexto
                  <input
                    maxLength={120}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={selectedLead ? `${selectedLead.company_name} · ${channelLabels[channel]}` : 'Ex.: Primeiro contato'}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <Button type="submit" disabled={!selectedLead || createMutation.isPending}>
                    {createMutation.isPending ? 'Criando…' : 'Criar conversa'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setCreating(false)}>Fechar</Button>
                </div>
              </form>
            ) : (
              <p className="text-sm leading-6 text-slate-700">
                Ainda não há leads para vincular.{' '}
                <Link className="font-medium text-sky-800 underline underline-offset-4" to="/leads">Adicione ou importe leads</Link>
                {' '}antes de iniciar uma conversa.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid min-h-[38rem] gap-4 lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)]">
        <aside className={mobileThreadOpen ? 'hidden lg:block' : ''} aria-label="Lista de conversas">
          <Card className="flex min-h-[38rem] flex-col">
            <CardHeader className="space-y-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Inbox aria-hidden="true" className="h-4 w-4 text-sky-700" />
                  Conversas
                </CardTitle>
                <span className="text-xs tabular-nums text-slate-600">{filteredConversations.length} exibidas</span>
              </div>
              <label className="relative block">
                <span className="sr-only">Buscar conversa</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Lead, assunto ou mensagem"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                />
              </label>
              <div className="flex flex-wrap gap-2" aria-label="Filtrar conversas">
                {([
                  ['open', 'Abertas'],
                  ['all', 'Todas'],
                  ['archived', 'Arquivadas'],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={filter === value ? 'secondary' : 'outline'}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
              {filteredConversations.length ? (
                <ul className="divide-y divide-slate-200">
                  {filteredConversations.map((conversation) => {
                    const selected = conversation.id === selectedConversation?.id
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(conversation.id)
                            setMobileThreadOpen(true)
                          }}
                          aria-current={selected ? 'true' : undefined}
                          className={[
                            'block w-full px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600',
                            selected ? 'bg-sky-50' : 'hover:bg-slate-50',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{conversation.lead_name}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-600">{conversation.title}</p>
                            </div>
                            <time className="shrink-0 text-[11px] text-slate-600" dateTime={conversation.last_message_at ?? conversation.created_at}>
                              {formatDate(conversation.last_message_at ?? conversation.created_at)}
                            </time>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{channelLabels[conversation.channel]}</Badge>
                            <Badge variant={conversation.status === 'open' ? 'secondary' : 'outline'}>
                              {conversation.status === 'open' ? 'Aberta' : 'Arquivada'}
                            </Badge>
                            {conversation.last_message_direction ? (
                              <span className="flex items-center gap-1 text-xs text-slate-600">
                                <EntryIcon direction={conversation.last_message_direction} />
                                {conversation.last_message_direction === 'inbound' ? 'Recebida' : 'Saída'}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-700">
                            {conversation.last_message_excerpt ?? 'Conversa criada · registre a primeira mensagem.'}
                          </p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="px-5 py-10 text-center">
                  <Inbox aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-medium text-slate-800">
                    {conversations.length ? 'Nenhuma conversa corresponde ao filtro.' : 'Nenhuma conversa registrada'}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    {conversations.length ? 'Tente outra busca ou altere o filtro.' : 'Inicie uma conversa vinculada a um lead para manter o histórico em um só lugar.'}
                  </p>
                  {!conversations.length ? (
                    <Button type="button" size="sm" className="mt-4" onClick={() => setCreating(true)}>
                      <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
                      Nova conversa
                    </Button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <section className={!mobileThreadOpen ? 'hidden lg:block' : ''} aria-label="Conversa selecionada">
          {selectedConversation ? (
            <Card className="flex min-h-[38rem] flex-col">
              <CardHeader className="border-b border-slate-200 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 lg:hidden"
                      onClick={() => setMobileThreadOpen(false)}
                      aria-label="Voltar para a lista de conversas"
                    >
                      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{selectedConversation.title}</CardTitle>
                      {selectedConversation.lead_company_id ? (
                        <Link
                          to={`/companies/${selectedConversation.lead_company_id}`}
                          className="mt-1 inline-block truncate text-sm text-sky-800 underline underline-offset-4"
                        >
                          {selectedConversation.lead_name}
                        </Link>
                      ) : <p className="mt-1 truncate text-sm text-slate-700">{selectedConversation.lead_name}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{channelLabels[selectedConversation.channel]}</Badge>
                        <Badge variant={selectedConversation.status === 'open' ? 'secondary' : 'outline'}>
                          {selectedConversation.status === 'open' ? 'Aberta' : 'Arquivada'}
                        </Badge>
                        <span className="text-xs text-slate-600">{selectedConversation.organization_name}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({
                      id: selectedConversation.id,
                      status: selectedConversation.status === 'open' ? 'archived' : 'open',
                    })}
                  >
                    {selectedConversation.status === 'open'
                      ? <><Archive aria-hidden="true" className="h-4 w-4" />Arquivar</>
                      : <><RotateCcw aria-hidden="true" className="h-4 w-4" />Reabrir</>}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-4 sm:p-6" aria-live="polite">
                  {messages.isLoading ? <p className="text-sm text-slate-600">Carregando mensagens…</p> : null}
                  {messages.isError ? (
                    <Alert className="border-red-200 bg-red-50 text-red-900">
                      <div className="flex items-start justify-between gap-3">
                        <p>{messages.error.message}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => void messages.refetch()} aria-label="Tentar carregar mensagens novamente">
                          <RefreshCw aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </div>
                    </Alert>
                  ) : null}
                  {!messages.isLoading && !messages.isError && !messages.data?.length ? (
                    <div className="mx-auto max-w-sm py-10 text-center">
                      <Inbox aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-3 text-sm font-medium text-slate-800">Conversa sem mensagens</p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">Registre uma resposta recebida, uma mensagem enviada externamente ou prepare um rascunho.</p>
                    </div>
                  ) : null}
                  {messages.data?.map((message) => (
                    <article
                      key={message.id}
                      className={[
                        'max-w-[min(100%,42rem)] rounded-lg border px-4 py-3',
                        message.direction === 'inbound'
                          ? 'mr-auto border-slate-200 bg-white'
                          : 'ml-auto border-sky-200 bg-sky-50',
                        message.status === 'draft' ? 'border-dashed' : '',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <EntryIcon direction={message.direction} />
                          {messageLabel(message.direction, message.status)}
                        </span>
                        <time className="text-xs text-slate-600" dateTime={message.occurred_at}>
                          {formatDate(message.occurred_at)}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{message.body}</p>
                    </article>
                  ))}
                </div>

                <form
                  className="space-y-3 border-t border-slate-200 bg-white p-4 sm:p-5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!selectedConversation || !body.trim()) return
                    addMessageMutation.mutate({
                      conversation: selectedConversation,
                      direction: entryKind === 'inbound' ? 'inbound' : 'outbound',
                      status: entryKind === 'draft' ? 'draft' : 'logged',
                      body,
                    })
                  }}
                >
                  {selectedConversation.status === 'archived' ? (
                    <p className="text-sm text-slate-600">Esta conversa está arquivada. Reabra-a para adicionar registros.</p>
                  ) : (
                    <>
                      <label className="flex max-w-md flex-col gap-1.5 text-sm font-medium text-slate-800">
                        Tipo de registro
                        <select
                          value={entryKind}
                          onChange={(event) => setEntryKind(event.target.value as 'inbound' | 'draft' | 'sent')}
                          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                        >
                          {entryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-slate-800">
                        Conteúdo
                        <textarea
                          value={body}
                          onChange={(event) => setBody(event.target.value)}
                          maxLength={10000}
                          rows={4}
                          placeholder="Registre o conteúdo necessário para manter o contexto da conversa."
                          className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                          aria-describedby="inbox-message-privacy"
                        />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p id="inbox-message-privacy" className="max-w-xl text-xs leading-5 text-slate-600">
                          O conteúdo será salvo no Supabase da organização. Registre apenas o necessário; este texto não é enviado nem analisado por IA.
                        </p>
                        <Button type="submit" disabled={!body.trim() || addMessageMutation.isPending}>
                          <Send aria-hidden="true" className="h-4 w-4" />
                          {addMessageMutation.isPending ? 'Salvando…' : entryKind === 'draft' ? 'Salvar rascunho' : 'Registrar mensagem'}
                        </Button>
                      </div>
                    </>
                  )}
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex min-h-[38rem] items-center justify-center">
              <CardContent className="max-w-sm py-12 text-center">
                <Inbox aria-hidden="true" className="mx-auto h-9 w-9 text-slate-400" />
                <h3 className="mt-3 font-semibold text-slate-900">Selecione uma conversa</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">Escolha uma conversa da lista ou inicie uma nova para registrar o histórico de contato.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
      <p className="text-xs leading-5 text-slate-600">
        O Inbox mantém até 500 conversas mais recentes por consulta. A conexão com provedores e o envio automatizado não estão ativos.
      </p>
    </div>
  )
}
