import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, CalendarClock, CalendarPlus, CircleAlert, Clock3, ExternalLink, MapPin, Pencil, RefreshCw, Video } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { createMeeting, getMeetingWorkspace, updateMeetingDetails, updateMeetingStatus } from '../../services/meetings/meetingService'
import type { MeetingStatus, SalesMeeting } from '../../types'

type MeetingFilter = MeetingStatus

const meetingFilters: Array<{ value: MeetingFilter; label: string }> = [
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'cancelled', label: 'Canceladas' },
]

function formatMeetingDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function isPast(meeting: SalesMeeting) {
  return meeting.status === 'scheduled' && new Date(meeting.starts_at).getTime() < Date.now()
}

function statusLabel(status: MeetingStatus) {
  if (status === 'completed') return 'Concluída'
  if (status === 'cancelled') return 'Cancelada'
  return 'Agendada'
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function MeetingsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<MeetingFilter>('scheduled')
  const [organizationId, setOrganizationId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null)

  const workspace = useQuery({
    queryKey: ['sales-meetings'],
    queryFn: getMeetingWorkspace,
    retry: false,
  })
  const createMutation = useMutation({
    mutationFn: createMeeting,
    onSuccess: async () => {
      setEditingMeetingId(null)
      setTitle('')
      setStartsAt('')
      setDurationMinutes('30')
      setMeetingUrl('')
      setNotes('')
      await queryClient.invalidateQueries({ queryKey: ['sales-meetings'] })
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, title: nextTitle, startsAt: nextStartsAt, durationMinutes: nextDuration, meetingUrl: nextUrl, notes: nextNotes }: {
      id: string
      title: string
      startsAt: string
      durationMinutes: number
      meetingUrl: string
      notes: string
    }) => updateMeetingDetails(id, {
      title: nextTitle,
      startsAt: nextStartsAt,
      durationMinutes: nextDuration,
      meetingUrl: nextUrl,
      notes: nextNotes,
    }),
    onSuccess: async () => {
      setEditingMeetingId(null)
      setTitle('')
      setStartsAt('')
      setDurationMinutes('30')
      setMeetingUrl('')
      setNotes('')
      await queryClient.invalidateQueries({ queryKey: ['sales-meetings'] })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MeetingStatus }) => updateMeetingStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-meetings'] }),
  })

  const organizations = workspace.data?.organizations ?? []
  const selectedOrganizationId = organizationId || organizations[0]?.id || ''
  const organizationLeads = workspace.data?.leads.filter((lead) => lead.organization_id === selectedOrganizationId) ?? []
  const selectedLead = organizationLeads.find((lead) => lead.id === leadId)
  const visibleMeetings = useMemo(() => {
    const meetings = (workspace.data?.meetings ?? []).filter((meeting) => meeting.status === filter)
    return filter === 'scheduled'
      ? meetings.sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      : meetings.sort((left, right) => right.starts_at.localeCompare(left.starts_at))
  }, [filter, workspace.data?.meetings])

  const handleSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!startsAt) return
    if (editingMeetingId) {
      updateMutation.mutate({
        id: editingMeetingId,
        title,
        startsAt,
        durationMinutes: Number(durationMinutes),
        meetingUrl,
        notes,
      })
    } else if (selectedLead) {
      createMutation.mutate({
        lead: selectedLead,
        title,
        startsAt,
        durationMinutes: Number(durationMinutes),
        meetingUrl,
        notes,
      })
    }
  }

  const cancelEdit = () => {
    setEditingMeetingId(null)
    setTitle('')
    setStartsAt('')
    setDurationMinutes('30')
    setMeetingUrl('')
    setNotes('')
  }

  if (workspace.isLoading) return <Skeleton className="h-[32rem] w-full rounded-xl" />
  if (workspace.isError) {
    return (
      <Alert className="border-red-200 bg-red-50 text-red-900">
        <div className="flex items-start gap-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar a agenda.</p>
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

  const mutationError = createMutation.error ?? updateMutation.error ?? statusMutation.error

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Reuniões</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Agende conversas comerciais ligadas aos leads e registre quando forem realizadas ou canceladas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void workspace.refetch()}
          disabled={workspace.isFetching}
          aria-label="Atualizar agenda"
        >
          <RefreshCw aria-hidden="true" className={workspace.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Atualizar
        </Button>
      </header>

      <Alert className="border-sky-200 bg-sky-50 text-sky-950">
        A agenda é interna. Ela não cria eventos no Google Calendar, não envia convites e não dispara lembretes.
      </Alert>

      {organizations.length === 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          Sua conta ainda não pertence a uma organização. Peça ao administrador para adicioná-la antes de agendar reuniões.
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
            {editingMeetingId
              ? <Pencil aria-hidden="true" className="h-5 w-5 text-sky-700" />
              : <CalendarPlus aria-hidden="true" className="h-5 w-5 text-sky-700" />}
            {editingMeetingId ? 'Editar reunião' : 'Agendar reunião'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.data?.leads.length ? (
            <form onSubmit={handleSchedule} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-medium text-slate-800">
                Organização
                <Select value={selectedOrganizationId} onValueChange={(value) => {
                  setOrganizationId(value)
                  setLeadId('')
                }} disabled={Boolean(editingMeetingId)}>
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
                <Select value={leadId} onValueChange={setLeadId} disabled={Boolean(editingMeetingId)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um lead" /></SelectTrigger>
                  <SelectContent>
                    {organizationLeads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>{lead.company_name} · {lead.city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm font-medium text-slate-800">
                Título
                <Input
                  className="mt-1"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={selectedLead ? `Conversa com ${selectedLead.company_name}` : 'Ex.: Diagnóstico inicial'}
                  maxLength={160}
                  required
                />
              </label>
              <label className="text-sm font-medium text-slate-800">
                Data e horário
                <Input className="mt-1" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
              </label>
              <label className="text-sm font-medium text-slate-800">
                Duração
                <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90, 120].map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>{minutes} minutos</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm font-medium text-slate-800">
                Link da reunião (opcional)
                <Input
                  className="mt-1"
                  type="url"
                  inputMode="url"
                  value={meetingUrl}
                  onChange={(event) => setMeetingUrl(event.target.value)}
                  placeholder="https://..."
                  maxLength={2048}
                />
              </label>
              <label className="text-sm font-medium text-slate-800 md:col-span-2 xl:col-span-3">
                Pauta ou observações (opcional)
                <textarea
                  className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                  maxLength={4000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Contexto e resultado esperado para esta conversa."
                />
              </label>
              <div className="flex items-center justify-between gap-3 md:col-span-2 xl:col-span-3">
                <p className="text-xs leading-5 text-slate-600">Horário exibido conforme o fuso local do navegador.</p>
                <div className="flex gap-2">
                  {editingMeetingId ? (
                    <Button type="button" variant="outline" onClick={cancelEdit} disabled={updateMutation.isPending}>
                      Descartar edição
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={(!selectedLead && !editingMeetingId) || !startsAt || createMutation.isPending || updateMutation.isPending}
                  >
                    <CalendarCheck2 aria-hidden="true" className="h-4 w-4" />
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Salvando…'
                      : editingMeetingId ? 'Salvar alterações' : 'Agendar'}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <p className="text-sm leading-6 text-slate-700">
              Ainda não há leads disponíveis para associar a uma reunião. Adicione leads à organização para continuar.
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="meeting-list-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 id="meeting-list-title" className="text-xl font-semibold text-slate-900">Agenda comercial</h3>
          <div className="flex flex-wrap gap-2" aria-label="Filtrar reuniões">
            {meetingFilters.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? 'secondary' : 'outline'}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {visibleMeetings.length ? (
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {visibleMeetings.map((meeting) => (
              <li key={meeting.id} className="py-4">
                <MeetingRow
                  meeting={meeting}
                  updating={statusMutation.isPending}
                  onStatusChange={(status) => statusMutation.mutate({ id: meeting.id, status })}
                  onEdit={() => {
                    setEditingMeetingId(meeting.id)
                    setOrganizationId(meeting.organization_id)
                    setLeadId(meeting.lead_id)
                    setTitle(meeting.title)
                    setStartsAt(toLocalDateTimeInput(meeting.starts_at))
                    setDurationMinutes(String(meeting.duration_minutes))
                    setMeetingUrl(meeting.meeting_url ?? '')
                    setNotes(meeting.notes ?? '')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-y border-slate-200 py-10 text-center">
            <CalendarClock aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-800">
              {filter === 'scheduled' ? 'Nenhuma reunião agendada' : `Nenhuma reunião ${statusLabel(filter).toLocaleLowerCase('pt-BR')}`}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {filter === 'scheduled' ? 'As reuniões agendadas para seus leads aparecerão aqui.' : 'Os registros aparecerão aqui quando o status mudar.'}
            </p>
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-600">
        Exibindo até 500 reuniões. Reagendamentos ficam registrados na timeline do lead; sincronização de agenda ainda não está habilitada.
      </p>
    </div>
  )
}

function MeetingRow({
  meeting,
  updating,
  onStatusChange,
  onEdit,
}: {
  meeting: SalesMeeting
  updating: boolean
  onStatusChange: (status: MeetingStatus) => void
  onEdit: () => void
}) {
  const past = isPast(meeting)
  const date = new Date(meeting.starts_at)
  const endTime = new Date(date.getTime() + meeting.duration_minutes * 60_000)
  return (
    <article className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <div className="hidden w-16 shrink-0 text-right sm:block" aria-hidden="true">
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)}
          </p>
          <p className="text-xs tabular-nums text-slate-600">
            {Number.isNaN(endTime.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(endTime)}
          </p>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-slate-900">{meeting.title}</h4>
            <Badge variant={past ? 'warning' : meeting.status === 'completed' ? 'success' : meeting.status === 'cancelled' ? 'danger' : 'secondary'}>
              {past ? 'Horário passado' : statusLabel(meeting.status)}
            </Badge>
          </div>
          {meeting.lead_company_id ? (
            <Link to={`/companies/${meeting.lead_company_id}`} className="mt-1 inline-block text-sm text-sky-800 underline underline-offset-4">
              {meeting.lead_name}
            </Link>
          ) : <p className="mt-1 text-sm text-slate-700">{meeting.lead_name}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
              <time dateTime={meeting.starts_at}>{formatMeetingDate(meeting.starts_at)}</time>
              <span>· {meeting.duration_minutes} min</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {meeting.organization_name}
            </span>
          </div>
          {meeting.notes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{meeting.notes}</p> : null}
          {meeting.meeting_url ? (
            <a
              href={meeting.meeting_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-800 underline underline-offset-4"
            >
              <Video aria-hidden="true" className="h-4 w-4" />
              Abrir link da reunião
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      {meeting.status === 'scheduled' ? (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            Editar
          </Button>
          <Button type="button" size="sm" disabled={updating} onClick={() => onStatusChange('completed')}>
            Marcar realizada
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={updating} onClick={() => onStatusChange('cancelled')}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </article>
  )
}
