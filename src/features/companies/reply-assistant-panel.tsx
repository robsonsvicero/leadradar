import { useState } from 'react'
import { MessageSquareReply, RefreshCw } from 'lucide-react'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { useLeadReplyAssistant } from '../../hooks/useLeadAI'
import {
  replyCategories,
  replySentiments,
  replyUrgencies,
} from '../../services/ai/schemas'
import type { OutreachDraft } from '../../services/ai/aiService'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'

const channels: Array<{ value: OutreachDraft['channel']; label: string }> = [
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
]

export function ReplyAssistantPanel({ leadId }: { leadId: string }) {
  const [channel, setChannel] = useState<OutreachDraft['channel']>('email')
  const [receivedMessage, setReceivedMessage] = useState('')
  const assistant = useLeadReplyAssistant(leadId)
  const currentAnalysis = assistant.analyze.data?.analysis

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareReply aria-hidden="true" className="h-5 w-5 text-primary" />
          Analisar resposta recebida
        </CardTitle>
        <CardDescription>
          Cole manualmente uma resposta para classificar sua intenção e preparar uma sugestão. O sistema não monitora conversas nem envia mensagens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
          Remova nomes, telefones, e-mails e outros dados pessoais antes de enviar. O texto será processado pela OpenAI, mas não será salvo no histórico do Lead Radar.
        </Alert>
        <label className="block text-sm font-medium text-foreground" htmlFor="received-reply">
          Texto da resposta
          <textarea
            id="received-reply"
            className="mt-1 min-h-32 w-full rounded-lg border border-border bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={5000}
            placeholder="Cole a resposta recebida após remover dados pessoais."
            value={receivedMessage}
            onChange={(event) => setReceivedMessage(event.target.value)}
            disabled={prospectingMockMode || assistant.analyze.isPending}
            aria-describedby="received-reply-help"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-foreground">
            Canal da resposta
            <select
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={channel}
              onChange={(event) => setChannel(event.target.value as OutreachDraft['channel'])}
              disabled={prospectingMockMode || assistant.analyze.isPending}
            >
              {channels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Button
            onClick={() => assistant.analyze.mutate(
              { channel, receivedMessage: receivedMessage.trim() },
              { onSuccess: () => setReceivedMessage('') },
            )}
            disabled={prospectingMockMode || receivedMessage.trim().length < 10 || assistant.analyze.isPending}
          >
            {assistant.analyze.isPending
              ? <><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Analisando resposta…</>
              : 'Classificar e sugerir resposta'}
          </Button>
        </div>
        <p id="received-reply-help" className="text-xs leading-5 text-muted-foreground">
          Mínimo de 10 caracteres. A chamada à IA ocorre somente ao clicar no botão.
        </p>
        {assistant.analyze.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{assistant.analyze.error.message}</Alert>
        ) : null}
        {assistant.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{assistant.error.message}</Alert>
        ) : null}

          {currentAnalysis ? (
            <div className="space-y-4 border-t border-border pt-4" role="status" aria-live="polite">
              <h3 className="font-semibold text-foreground">Sugestão para revisar</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{replyCategories[currentAnalysis.category]}</Badge>
                <Badge variant="outline">Sentimento: {replySentiments[currentAnalysis.sentiment]}</Badge>
                <Badge variant="outline">Urgência: {replyUrgencies[currentAnalysis.urgency]}</Badge>
                <Badge variant="outline">Confiança: {Math.round(currentAnalysis.confidence * 100)}%</Badge>
              </div>
              <p className="text-sm leading-6 text-foreground">{currentAnalysis.intent}</p>
              <div className="rounded-lg bg-muted p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{currentAnalysis.suggestedReply}</p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Próximo passo sugerido:</strong> {currentAnalysis.nextStep}
              </p>
              <p className="text-xs text-muted-foreground">Resultado salvo sem o texto recebido; revise antes de responder.</p>
          </div>
          ) : null}

        {assistant.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico de análises…</p> : null}
        {assistant.data?.length === 0 && !currentAnalysis && !assistant.isLoading && !assistant.isError ? (
          <p className="border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
            Nenhuma resposta foi analisada neste lead. O histórico guarda somente a classificação e a sugestão, nunca a mensagem colada.
          </p>
        ) : null}
        {assistant.data?.length ? (
          <section aria-labelledby="reply-history-title" className="border-t border-border pt-4">
            <h3 id="reply-history-title" className="font-medium text-foreground">Análises recentes</h3>
            <ul className="mt-2 divide-y divide-slate-200" aria-live="polite">
              {assistant.data.map((record) => (
                <li key={record.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary">{replyCategories[record.result.category]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(record.created_at).toLocaleString('pt-BR')} · {record.model}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-foreground">{record.result.intent}</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-6 text-foreground">{record.result.suggestedReply}</p>
                  <p className="text-xs leading-5 text-muted-foreground">Próximo passo: {record.result.nextStep}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
