import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Building2, Check, CornerDownRight, Globe, MapPin, MessageSquareText, Phone, RefreshCw, Sparkles, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { ReplyAssistantPanel } from './reply-assistant-panel'
import { DeepAnalysisPanel } from './deep-analysis-panel'
import { LeadActivityTimeline } from './lead-activity-timeline'
import { useAIFeedback, useLeadFollowUp, useLeadIntelligence, useLeadOutreach } from '../../hooks/useLeadAI'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'
import { getCompanyById } from '../../services/companies/companyService'
import { getLeadByCompanyId } from '../../services/leads/leadService'

const channelLabels = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
} as const

export function CompanyDetailPage() {
  const { id = '' } = useParams()
  const [channel, setChannel] = useState<keyof typeof channelLabels>('email')
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [editingVariant, setEditingVariant] = useState<{ draftId: string; index: number; subject: string; body: string } | null>(null)
  const [interactionContext, setInteractionContext] = useState('')
  const [selectedFollowUpVariant, setSelectedFollowUpVariant] = useState(0)
  const [editingFollowUpVariant, setEditingFollowUpVariant] = useState<{ draftId: string; index: number; subject: string; body: string } | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const companyQuery = useQuery({
    queryKey: ['company', id],
    queryFn: () => getCompanyById(id),
    enabled: Boolean(id),
    retry: false,
  })
  const company = companyQuery.data
  const leadQuery = useQuery({
    queryKey: ['company-lead', company?.id],
    queryFn: () => getLeadByCompanyId(company!.id),
    enabled: Boolean(company?.id),
    retry: false,
  })
  const lead = leadQuery.data
  const intelligence = useLeadIntelligence(lead?.id ?? '')
  const outreach = useLeadOutreach(lead?.id ?? '')
  const followUp = useLeadFollowUp(lead?.id ?? '')
  const feedback = useAIFeedback(lead?.id ?? '')
  const analysis = intelligence.data?.output_data
  const currentDraft = outreach.data?.find((draft) => draft.channel === channel)
  const currentVariant = currentDraft?.variants[selectedVariant]
  const currentFollowUpDraft = followUp.data?.find((draft) => draft.channel === channel)
  const currentFollowUpVariant = currentFollowUpDraft?.variants[selectedFollowUpVariant]
  const editingCurrentFollowUpVariant = Boolean(
    editingFollowUpVariant && currentFollowUpDraft?.id === editingFollowUpVariant.draftId &&
      selectedFollowUpVariant === editingFollowUpVariant.index,
  )
  const editingCurrentVariant = Boolean(
    editingVariant && currentDraft?.id === editingVariant.draftId && selectedVariant === editingVariant.index,
  )

  if (companyQuery.isLoading) return <Skeleton className="h-80 w-full rounded-xl" />
  if (companyQuery.isError) {
    return <Alert className="border-red-200 bg-red-50 text-red-800">
      {companyQuery.error instanceof Error ? companyQuery.error.message : 'Não foi possível carregar esta empresa.'}
    </Alert>
  }
  if (!company) return <Alert className="border-amber-200 bg-amber-50 text-amber-900">Empresa não encontrada ou sem acesso.</Alert>

  const submitFeedback = (feedbackType: 'helpful' | 'unhelpful') => {
    if (!intelligence.data) return
    setFeedbackMessage('')
    feedback.mutate({ analysisLogId: intelligence.data.id, feedbackType }, {
      onSuccess: () => setFeedbackMessage('Obrigado. Seu feedback foi registrado.'),
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h2 className="text-3xl font-semibold text-slate-900">{company.name}</h2>
        <p className="mt-2 text-sm text-slate-600">Perfil da empresa, evidências digitais e recomendações comerciais.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Informações da empresa</CardTitle>
          <CardDescription>Dados empresariais disponíveis no cadastro do lead.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <InfoLine icon={<MapPin aria-hidden="true" className="h-4 w-4" />} value={[company.city, company.state, company.country].filter(Boolean).join(', ') || 'Localização não informada'} />
          <InfoLine icon={<Globe aria-hidden="true" className="h-4 w-4" />} value={company.website || 'Sem website cadastrado'} />
          <InfoLine icon={company.phone ? <Phone aria-hidden="true" className="h-4 w-4" /> : <Building2 aria-hidden="true" className="h-4 w-4" />} value={company.phone || company.description || 'Telefone e descrição não informados'} />
          <InfoLine icon={<Star aria-hidden="true" className="h-4 w-4" />} value={company.rating === null ? 'Avaliação não informada' : `${company.rating}/5 · ${company.review_count} avaliações`} />
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
            <span>Segmento</span>
            <Badge variant="secondary">{company.category || 'Não informado'}</Badge>
          </div>
        </CardContent>
      </Card>

      {leadQuery.isLoading ? <Skeleton className="h-36 w-full rounded-xl" /> : null}
      {leadQuery.isError ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          {leadQuery.error instanceof Error ? leadQuery.error.message : 'Não foi possível carregar o lead desta empresa.'}
        </Alert>
      ) : null}
      {!leadQuery.isLoading && !leadQuery.isError && !lead ? (
        <Alert className="border-slate-200 bg-slate-50 text-slate-700">
          Esta empresa ainda não está associada a um lead. A inteligência comercial fica disponível depois da prospecção.
        </Alert>
      ) : null}

      {lead ? (
        <>
          {prospectingMockMode ? (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              A inteligência de IA usa somente leads reais do Supabase. Os indicadores técnicos atuais continuam disponíveis no modo de demonstração.
            </Alert>
          ) : null}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Sparkles aria-hidden="true" className="h-5 w-5 text-sky-600" />Inteligência comercial</CardTitle>
                <CardDescription className="mt-1">Recomendações baseadas nos dados e sinais coletados para este lead.</CardDescription>
              </div>
              <Button
                onClick={() => intelligence.analyze.mutate(Boolean(analysis))}
                disabled={prospectingMockMode || intelligence.analyze.isPending}
              >
                {intelligence.analyze.isPending
                  ? <><RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Analisando oportunidade…</>
                  : <><Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />{analysis ? 'Reanalisar com IA' : 'Analisar lead com IA'}</>}
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Score label="Technical Score" value={lead.technical_score} />
                <Score label="ICP Match" value={lead.icp_match} />
                <Score label="AI Score" value={lead.ai_updated_at ? lead.ai_score : null} />
                <Score label="Action Score" value={lead.ai_updated_at ? lead.action_score : null} prominent />
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">Por que priorizar este lead?</h3>
                  <Badge variant="secondary">Buying Moment {analysis?.buyingMomentScore ?? lead.buying_moment_score ?? '—'}/100</Badge>
                </div>
                {lead.action_score_reason ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {lead.action_score_reason.split('\n').filter(Boolean).map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                ) : <p className="mt-2 text-sm text-slate-500">A explicação do Action Score estará disponível após a análise comercial.</p>}
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">Sinais técnicos disponíveis</h3>
                <p className="mt-2 text-sm text-slate-600">{lead.opportunity_reason || 'Não há uma explicação técnica registrada para este lead.'}</p>
                {lead.recommended_service ? <p className="mt-2 text-sm text-slate-700">Serviço sugerido pelo motor técnico: <strong>{lead.recommended_service}</strong></p> : null}
              </div>

              {intelligence.isError || intelligence.analyze.isError ? (
                <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                  <AlertCircle aria-hidden="true" className="mr-2 inline h-4 w-4" />
                  {intelligence.analyze.error instanceof Error
                    ? intelligence.analyze.error.message
                    : intelligence.error instanceof Error
                      ? intelligence.error.message
                      : 'A inteligência de IA está temporariamente indisponível. Os dados técnicos continuam disponíveis.'}
                </Alert>
              ) : null}

              {analysis ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{analysis.executiveSummary}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.digitalSituation}</p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Insight title="Oportunidade" description={analysis.opportunity.description} detail={`${analysis.opportunity.title} · urgência ${analysis.opportunity.urgency} · confiança ${Math.round(analysis.opportunity.confidence * 100)}%`} />
                    <Insight title="Por que agora?" description={analysis.whyNow.explanation} detail={`Base: ${analysis.whyNow.assessment}`} />
                    <Insight title="Serviço recomendado" description={analysis.recommendedService.reason} detail={analysis.recommendedService.service} />
                    <Insight title="Próxima melhor ação" description={analysis.nextBestAction.reason} detail={analysis.nextBestAction.action.replaceAll('_', ' ')} />
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4">
                    <h3 className="font-semibold text-slate-900">Aderência ao ICP</h3>
                    <p className="mt-2 text-sm text-slate-700">{analysis.icpAssessment.explanation}</p>
                    {lead.icp_match_reason ? <p className="mt-1 text-xs text-slate-500">{lead.icp_match_reason}</p> : null}
                  </div>
                  <div className="rounded-lg bg-sky-50 p-4">
                    <h3 className="font-semibold text-slate-900">Argumento comercial sugerido</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.salesAngle.argument}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Riscos a considerar</h3>
                    {analysis.risks.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {analysis.risks.map((risk, index) => <li key={`${risk.risk}-${index}`}>{risk.risk}: {risk.explanation}</li>)}
                      </ul>
                    ) : <p className="mt-2 text-sm text-slate-500">Nenhum risco comercial identificado nos dados disponíveis.</p>}
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">Modelo {intelligence.data?.model} · {new Date(intelligence.data?.created_at ?? '').toLocaleString('pt-BR')}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => submitFeedback('helpful')} disabled={feedback.isPending}>
                        <ThumbsUp aria-hidden="true" className="mr-1 h-4 w-4" />Útil
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => submitFeedback('unhelpful')} disabled={feedback.isPending}>
                        <ThumbsDown aria-hidden="true" className="mr-1 h-4 w-4" />Não útil
                      </Button>
                    </div>
                  </div>
                  {feedbackMessage ? <p role="status" className="text-sm text-emerald-700">{feedbackMessage}</p> : null}
                  {feedback.isError ? <p role="alert" className="text-sm text-red-700">{feedback.error.message}</p> : null}
                </div>
              ) : !intelligence.isLoading && !prospectingMockMode ? (
                <p className="text-sm text-slate-500">A análise ainda não foi gerada. Ela só será enviada à OpenAI quando você solicitar.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MessageSquareText aria-hidden="true" className="h-5 w-5 text-sky-600" />Rascunhos de abordagem</CardTitle>
              <CardDescription>Gera três opções para revisão. Nenhuma mensagem é enviada automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
                  Canal
                  <select
                    className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as keyof typeof channelLabels)}
                    disabled={prospectingMockMode}
                  >
                    {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => outreach.generate.mutate({ channel })}
                    disabled={prospectingMockMode || !analysis || outreach.generate.isPending}
                  >
                    {outreach.generate.isPending ? 'Criando abordagem…' : 'Gerar 3 abordagens'}
                  </Button>
                </div>
              </div>
              {!analysis && !prospectingMockMode ? <p className="text-sm text-slate-500">Gere primeiro a inteligência do lead para criar mensagens baseadas em evidências.</p> : null}
              {outreach.generate.isError ? <Alert className="border-red-200 bg-red-50 text-red-800">{outreach.generate.error.message}</Alert> : null}
              {outreach.isError ? <Alert className="border-red-200 bg-red-50 text-red-800">{outreach.error.message}</Alert> : null}
              {currentDraft && currentVariant ? (
                <div className="space-y-4 border-t border-slate-200 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {currentDraft.variants.map((variant, index) => (
                      <Button
                        key={variant.label}
                        type="button"
                        size="sm"
                        variant={selectedVariant === index ? 'default' : 'outline'}
                        onClick={() => setSelectedVariant(index)}
                      >
                        {variant.label}
                      </Button>
                    ))}
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {editingCurrentVariant ? (
                      <div className="space-y-3">
                        {currentDraft.channel === 'email' ? (
                          <label className="block text-sm font-medium text-slate-700">
                            Assunto
                            <input
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
                              maxLength={160}
                              value={editingVariant?.subject ?? ''}
                              onChange={(event) => setEditingVariant((current) => current ? { ...current, subject: event.target.value } : current)}
                            />
                          </label>
                        ) : null}
                        <label className="block text-sm font-medium text-slate-700">
                          Mensagem
                          <textarea
                            className="mt-1 min-h-40 w-full rounded-lg border border-slate-300 bg-white p-3"
                            maxLength={1800}
                            value={editingVariant?.body ?? ''}
                            onChange={(event) => setEditingVariant((current) => current ? { ...current, body: event.target.value } : current)}
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        {currentVariant.subject ? <p className="mb-3 font-semibold text-slate-900">Assunto: {currentVariant.subject}</p> : null}
                        {currentVariant.body}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Qualidade {currentVariant.overallQualityScore}/100 · Personalização {currentVariant.personalizationScore}/100 · Risco {currentVariant.riskScore}/100
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {editingCurrentVariant ? (
                      <>
                        <Button
                          onClick={() => {
                            if (!editingVariant) return
                            outreach.edit.mutate({
                              draftId: editingVariant.draftId,
                              variantIndex: editingVariant.index,
                              subject: editingVariant.subject.trim() || null,
                              body: editingVariant.body,
                            }, { onSuccess: () => setEditingVariant(null) })
                          }}
                          disabled={outreach.edit.isPending || !editingVariant?.body.trim()}
                        >
                          {outreach.edit.isPending ? 'Salvando…' : 'Salvar edição'}
                        </Button>
                        <Button variant="outline" onClick={() => setEditingVariant(null)}>Cancelar edição</Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setEditingVariant({
                            draftId: currentDraft.id,
                            index: selectedVariant,
                            subject: currentVariant.subject ?? '',
                            body: currentVariant.body,
                          })}
                          disabled={currentDraft.status === 'approved'}
                        >
                          Editar
                        </Button>
                        <Button
                          onClick={() => outreach.approve.mutate({ draftId: currentDraft.id, variantIndex: selectedVariant })}
                          disabled={currentDraft.status === 'approved' || outreach.approve.isPending}
                        >
                          {currentDraft.status === 'approved' && currentDraft.approved_variant === selectedVariant
                            ? <><Check aria-hidden="true" className="mr-2 h-4 w-4" />Aprovada para uso</>
                            : 'Aprovar rascunho'}
                        </Button>
                      </>
                    )}
                    {currentDraft.status === 'approved' ? <Badge variant="success">Aprovado · não enviado</Badge> : <Badge variant="secondary">Aguardando revisão</Badge>}
                  </div>
                  {outreach.approve.isError ? <p role="alert" className="text-sm text-red-700">{outreach.approve.error.message}</p> : null}
                  {outreach.edit.isError ? <p role="alert" className="text-sm text-red-700">{outreach.edit.error.message}</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CornerDownRight aria-hidden="true" className="h-5 w-5 text-sky-600" />Follow-up assistido</CardTitle>
              <CardDescription>
                Gere três opções com base na inteligência do lead e no contexto que você informar. Revise e aprove antes de usar; nada é enviado ou agendado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block text-sm font-medium text-slate-700" htmlFor="follow-up-context">
                Resumo do contato anterior
                <textarea
                  id="follow-up-context"
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  maxLength={1500}
                  placeholder="Ex.: enviei uma apresentação do serviço na semana passada e pedi para conversarmos sobre a experiência mobile."
                  value={interactionContext}
                  onChange={(event) => setInteractionContext(event.target.value)}
                  disabled={prospectingMockMode || followUp.generate.isPending}
                  aria-describedby="follow-up-context-help"
                />
              </label>
              <p id="follow-up-context-help" className="text-xs leading-5 text-slate-500">
                Informe somente o que aconteceu; evite dados pessoais. O sistema não tem acesso a mensagens enviadas nem à caixa de entrada.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
                  Canal
                  <select
                    className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    value={channel}
                    onChange={(event) => {
                      setChannel(event.target.value as keyof typeof channelLabels)
                      setSelectedFollowUpVariant(0)
                      setEditingFollowUpVariant(null)
                    }}
                    disabled={prospectingMockMode || followUp.generate.isPending}
                  >
                    {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <Button
                  variant="outline"
                  onClick={() => followUp.generate.mutate({
                    channel,
                    interactionContext: interactionContext.trim(),
                  }, { onSuccess: () => setSelectedFollowUpVariant(0) })}
                  disabled={prospectingMockMode || !analysis || interactionContext.trim().length < 10 || followUp.generate.isPending}
                >
                  {followUp.generate.isPending ? 'Criando follow-ups…' : 'Gerar 3 follow-ups'}
                </Button>
              </div>
              {!analysis && !prospectingMockMode ? <p className="text-sm text-slate-500">Gere primeiro a inteligência do lead para criar follow-ups baseados nas evidências disponíveis.</p> : null}
              {followUp.generate.isError ? <Alert className="border-red-200 bg-red-50 text-red-800">{followUp.generate.error.message}</Alert> : null}
              {followUp.isError ? <Alert className="border-red-200 bg-red-50 text-red-800">{followUp.error.message}</Alert> : null}
              {currentFollowUpDraft && currentFollowUpVariant ? (
                <div className="space-y-4 border-t border-slate-200 pt-4">
                  <p className="text-xs leading-5 text-slate-500">
                    Contexto usado: {currentFollowUpDraft.interaction_context}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentFollowUpDraft.variants.map((variant, index) => (
                      <Button
                        key={variant.label}
                        type="button"
                        size="sm"
                        variant={selectedFollowUpVariant === index ? 'default' : 'outline'}
                        onClick={() => setSelectedFollowUpVariant(index)}
                      >
                        {variant.label}
                      </Button>
                    ))}
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {editingCurrentFollowUpVariant ? (
                      <div className="space-y-3">
                        {currentFollowUpDraft.channel === 'email' ? (
                          <label className="block text-sm font-medium text-slate-700">
                            Assunto
                            <input
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
                              maxLength={160}
                              value={editingFollowUpVariant?.subject ?? ''}
                              onChange={(event) => setEditingFollowUpVariant((current) => current ? { ...current, subject: event.target.value } : current)}
                            />
                          </label>
                        ) : null}
                        <label className="block text-sm font-medium text-slate-700">
                          Mensagem
                          <textarea
                            className="mt-1 min-h-40 w-full rounded-lg border border-slate-300 bg-white p-3"
                            maxLength={1800}
                            value={editingFollowUpVariant?.body ?? ''}
                            onChange={(event) => setEditingFollowUpVariant((current) => current ? { ...current, body: event.target.value } : current)}
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        {currentFollowUpVariant.subject ? <p className="mb-3 font-semibold text-slate-900">Assunto: {currentFollowUpVariant.subject}</p> : null}
                        {currentFollowUpVariant.body}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Qualidade {currentFollowUpVariant.overallQualityScore}/100 · Personalização {currentFollowUpVariant.personalizationScore}/100 · Risco {currentFollowUpVariant.riskScore}/100
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {editingCurrentFollowUpVariant ? (
                      <>
                        <Button
                          onClick={() => {
                            if (!editingFollowUpVariant) return
                            followUp.edit.mutate({
                              draftId: editingFollowUpVariant.draftId,
                              variantIndex: editingFollowUpVariant.index,
                              subject: editingFollowUpVariant.subject.trim() || null,
                              body: editingFollowUpVariant.body,
                            }, { onSuccess: () => setEditingFollowUpVariant(null) })
                          }}
                          disabled={followUp.edit.isPending || !editingFollowUpVariant?.body.trim()}
                        >
                          {followUp.edit.isPending ? 'Salvando…' : 'Salvar edição'}
                        </Button>
                        <Button variant="outline" onClick={() => setEditingFollowUpVariant(null)}>Cancelar edição</Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setEditingFollowUpVariant({
                            draftId: currentFollowUpDraft.id,
                            index: selectedFollowUpVariant,
                            subject: currentFollowUpVariant.subject ?? '',
                            body: currentFollowUpVariant.body,
                          })}
                          disabled={currentFollowUpDraft.status === 'approved'}
                        >
                          Editar
                        </Button>
                        <Button
                          onClick={() => followUp.approve.mutate({ draftId: currentFollowUpDraft.id, variantIndex: selectedFollowUpVariant })}
                          disabled={currentFollowUpDraft.status === 'approved' || followUp.approve.isPending}
                        >
                          {currentFollowUpDraft.status === 'approved' && currentFollowUpDraft.approved_variant === selectedFollowUpVariant
                            ? <><Check aria-hidden="true" className="mr-2 h-4 w-4" />Aprovado para uso</>
                            : 'Aprovar rascunho'}
                        </Button>
                      </>
                    )}
                    {currentFollowUpDraft.status === 'approved' ? <Badge variant="success">Aprovado · não enviado</Badge> : <Badge variant="secondary">Aguardando revisão</Badge>}
                  </div>
                  {followUp.approve.isError ? <p role="alert" className="text-sm text-red-700">{followUp.approve.error.message}</p> : null}
                  {followUp.edit.isError ? <p role="alert" className="text-sm text-red-700">{followUp.edit.error.message}</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
          {lead ? <ReplyAssistantPanel leadId={lead.id} /> : null}
          {lead ? <DeepAnalysisPanel leadId={lead.id} hasBaseAnalysis={Boolean(analysis)} /> : null}
          {lead ? <LeadActivityTimeline lead={lead} /> : null}
        </>
      ) : null}

      <Button variant="outline" asChild>
        <Link to="/leads"><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar à lista de leads</Link>
      </Button>
    </div>
  )
}

function InfoLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <div className="flex items-center gap-2">{icon}<span>{value}</span></div>
}

function Score({ label, value, prominent = false }: { label: string; value: number | null; prominent?: boolean }) {
  return (
    <div className={prominent ? 'rounded-lg bg-sky-50 p-4' : 'rounded-lg bg-slate-50 p-4'}>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value ?? '—'}<span className="ml-1 text-sm font-normal text-slate-500">/100</span></p>
    </div>
  )
}

function Insight({ title, description, detail }: { title: string; description: string; detail: string }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <p className="mt-2 text-xs font-medium capitalize text-sky-800">{detail}</p>
    </div>
  )
}
