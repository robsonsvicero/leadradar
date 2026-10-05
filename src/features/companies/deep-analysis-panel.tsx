import { useLeadDeepAnalysis } from '../../hooks/useLeadAI'
import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'

const priorityLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
} as const

export function DeepAnalysisPanel({ leadId, hasBaseAnalysis }: { leadId: string; hasBaseAnalysis: boolean }) {
  const deepAnalysis = useLeadDeepAnalysis(leadId)
  const result = deepAnalysis.data?.result

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análise aprofundada</CardTitle>
        <CardDescription>
          Explore oportunidades, pontos fortes, riscos e perguntas de validação com base nas evidências já coletadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          onClick={() => deepAnalysis.analyze.mutate()}
          disabled={prospectingMockMode || !hasBaseAnalysis || deepAnalysis.analyze.isPending}
        >
          {deepAnalysis.analyze.isPending ? 'Analisando evidências…' : result ? 'Atualizar análise aprofundada' : 'Gerar análise aprofundada'}
        </Button>
        {!hasBaseAnalysis && !prospectingMockMode ? (
          <p className="text-sm leading-6 text-muted-foreground">Gere primeiro a inteligência comercial deste lead. A análise aprofundada só começa quando solicitada.</p>
        ) : null}
        {deepAnalysis.analyze.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{deepAnalysis.analyze.error.message}</Alert>
        ) : null}
        {deepAnalysis.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{deepAnalysis.error.message}</Alert>
        ) : null}
        {deepAnalysis.isLoading ? <p className="text-sm text-muted-foreground">Carregando análise salva…</p> : null}
        {result ? (
          <div className="space-y-5 border-t border-border pt-4">
            <div>
              <p className="text-sm leading-6 text-foreground">{result.executiveSummary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Modelo {deepAnalysis.data?.model} · Confiança {Math.round(result.confidence * 100)}% · {new Date(deepAnalysis.data?.created_at ?? '').toLocaleString('pt-BR')}
              </p>
            </div>

            {result.opportunities.length ? (
              <section aria-labelledby="deep-opportunities-title">
                <h3 id="deep-opportunities-title" className="font-semibold text-foreground">Oportunidades a validar</h3>
                <ul className="mt-2 divide-y divide-slate-200">
                  {result.opportunities.map((item) => (
                    <li key={`${item.title}-${item.evidenceRefs.join('-')}`} className="space-y-1 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{item.title}</span>
                        <Badge variant="outline">Prioridade {priorityLabels[item.priority]}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-foreground">{item.observedEvidence}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{item.businessImplication}</p>
                      <p className="text-sm leading-6 text-muted-foreground"><strong>Ação sugerida:</strong> {item.recommendedAction}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {result.strengths.length ? (
              <section aria-labelledby="deep-strengths-title">
                <h3 id="deep-strengths-title" className="font-semibold text-foreground">Pontos fortes observados</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                  {result.strengths.map((item) => <li key={`${item.title}-${item.evidenceRefs.join('-')}`}><strong>{item.title}:</strong> {item.detail}</li>)}
                </ul>
              </section>
            ) : null}

            {result.risks.length ? (
              <section aria-labelledby="deep-risks-title">
                <h3 id="deep-risks-title" className="font-semibold text-foreground">Riscos e limitações</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                  {result.risks.map((item) => <li key={`${item.title}-${item.evidenceRefs.join('-')}`}><strong>{item.title} ({priorityLabels[item.severity]}):</strong> {item.detail}</li>)}
                </ul>
              </section>
            ) : null}

            {result.validationQuestions.length ? (
              <section aria-labelledby="deep-questions-title">
                <h3 id="deep-questions-title" className="font-semibold text-foreground">Perguntas para a conversa</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                  {result.validationQuestions.map((question) => <li key={question}>{question}</li>)}
                </ul>
              </section>
            ) : null}
          </div>
        ) : !deepAnalysis.isLoading && !deepAnalysis.isError ? (
          <p className="border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
            A análise detalhada ainda não foi solicitada. A chamada de IA pode gerar custo e não cria tarefas ou mensagens.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
