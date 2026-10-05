import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Bot, CalendarClock, CheckCircle2, CircleDot, FileText, RefreshCw, StickyNote, UserRound, Workflow, XCircle } from 'lucide-react'
import { useState } from 'react'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { getLeadActivities, addLeadNoteActivity } from '../../services/crm/pipelineService'
import type { Lead } from '../../types'

const eventIcon: Record<string, typeof CircleDot> = {
  lead_created: CircleDot,
  stage_changed: ArrowRightLeft,
  score_changed: Bot,
  ai_analyzed: Bot,
  task_created: CalendarClock,
  task_completed: CheckCircle2,
  meeting_scheduled: CalendarClock,
  meeting_completed: CheckCircle2,
  meeting_cancelled: CircleDot,
  meeting_rescheduled: CalendarClock,
  proposal_created: FileText,
  proposal_sent: FileText,
  proposal_viewed: FileText,
  proposal_accepted: CheckCircle2,
  proposal_rejected: XCircle,
  proposal_cancelled: CircleDot,
  cadence_enrolled: Workflow,
  cadence_completed: CheckCircle2,
  cadence_cancelled: CircleDot,
  lead_assigned: UserRound,
  lead_reassigned: UserRound,
  note_added: StickyNote,
}

function displayDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function LeadActivityTimeline({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const activities = useQuery({
    queryKey: ['lead-activities', lead.id],
    queryFn: () => getLeadActivities(lead.id),
    retry: false,
  })
  const noteMutation = useMutation({
    mutationFn: () => addLeadNoteActivity(lead, note),
    onSuccess: async () => {
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['lead-activities', lead.id] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico do lead</CardTitle>
        <CardDescription>Mudanças de etapa, responsáveis, tarefas e notas registradas para esta oportunidade.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={(event) => {
          event.preventDefault()
          if (note.trim()) noteMutation.mutate()
        }} className="space-y-3">
          <label htmlFor={`lead-note-${lead.id}`} className="text-sm font-medium text-foreground">Adicionar nota interna</label>
          <textarea
            id={`lead-note-${lead.id}`}
            className="min-h-24 w-full rounded-lg border border-border bg-card p-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Registre um contexto útil para a próxima interação"
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{note.length}/2000 caracteres · visível somente para membros da organização</p>
            <Button type="submit" size="sm" disabled={!note.trim() || noteMutation.isPending}>
              {noteMutation.isPending ? 'Salvando…' : 'Salvar nota'}
            </Button>
          </div>
          {noteMutation.isError ? <p role="alert" className="text-sm text-destructive">{noteMutation.error.message}</p> : null}
        </form>

        {activities.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
            <div className="flex items-start justify-between gap-3">
              <p>{activities.error.message}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void activities.refetch()} aria-label="Tentar carregar o histórico novamente">
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </Alert>
        ) : null}
        {activities.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico…</p> : null}
        {!activities.isLoading && !activities.isError && activities.data?.length === 0 ? (
          <p className="border-t border-border pt-4 text-sm leading-6 text-muted-foreground">As atividades deste lead aparecerão aqui conforme o pipeline for atualizado.</p>
        ) : null}
        {activities.data?.length ? (
          <ol className="relative space-y-0 border-l border-border pl-5">
            {activities.data.map((activity) => {
              const Icon = eventIcon[activity.type] ?? CircleDot
              return (
                <li key={activity.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[1.65rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-ring">
                    <Icon aria-hidden="true" className="h-3 w-3" />
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{activity.title}</h3>
                      {activity.description ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{activity.description}</p> : null}
                    </div>
                    <time dateTime={activity.created_at} className="shrink-0 text-xs text-muted-foreground">{displayDate(activity.created_at)}</time>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  )
}
