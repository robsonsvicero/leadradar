import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from '../prospecting/prospectingService'
import {
  DeepAnalysisSchema,
  ReplyAssistantSchema,
  type DeepAnalysisResult,
  type LeadIntelligence,
  type OutreachVariant,
  type ReplyAssistantResult,
} from './schemas'

export type AIAnalysisRecord = {
  id: string
  analysis_type: string
  model: string
  prompt_version: string
  output_data: LeadIntelligence & {
    aiScore: number
    buyingMomentScore: number
    actionScore: number
    actionScoreBreakdown: Record<string, number>
    actionScoreReason: string[]
  }
  estimated_cost: number | null
  created_at: string
}

export type OutreachDraft = {
  id: string
  channel: 'email' | 'whatsapp' | 'instagram' | 'linkedin'
  tone: string
  variants: OutreachVariant[]
  status: 'draft' | 'approved'
  approved_variant: number | null
  approved_at: string | null
  created_at: string
}

export type FollowUpDraft = OutreachDraft & {
  interaction_context: string
}

export type ReplyAssistantRecord = {
  id: string
  model: string
  created_at: string
  result: ReplyAssistantResult
}

export type DeepAnalysisRecord = {
  id: string
  model: string
  created_at: string
  result: DeepAnalysisResult
}

async function invokeAI<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  if (prospectingMockMode) {
    throw new Error('A inteligência artificial exige dados reais. Desative o modo de demonstração para usar este recurso.')
  }
  if (!supabase) throw new Error('Supabase não está configurado.')

  const { data, error } = await supabase.functions.invoke(functionName, { body })
  if (!error) return data as T
  const context = 'context' in error ? error.context : null
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: string; code?: string } | null
    if (payload?.error) {
      if (payload.code === 'OPENAI_credit_balance_exhausted') {
        throw new Error(`${payload.error} (código: ${payload.code}). O saldo de créditos da API OpenAI acabou. Adicione créditos na conta de API vinculada a esta chave e tente novamente.`)
      }
      throw new Error(payload.code ? `${payload.error} (código: ${payload.code})` : payload.error)
    }
  }
  throw new Error(error.message)
}

export async function analyzeLead(leadId: string, force = false) {
  return invokeAI<{ analysis: LeadIntelligence; analysisLogId: string; cached: boolean }>('analyze-lead', {
    leadId,
    force,
    requestId: crypto.randomUUID(),
  })
}

export async function generateOutreach(
  leadId: string,
  channel: OutreachDraft['channel'],
  tone?: string,
) {
  return invokeAI<{ draft: OutreachDraft; analysisLogId: string; cached: boolean }>('generate-outreach', {
    action: 'generate',
    leadId,
    channel,
    ...(tone ? { tone } : {}),
    requestId: crypto.randomUUID(),
  })
}

export async function approveOutreach(draftId: string, variantIndex: number) {
  return invokeAI<{ draft: Pick<OutreachDraft, 'id' | 'status' | 'approved_variant' | 'approved_at'> }>('generate-outreach', {
    action: 'approve',
    draftId,
    variantIndex,
  })
}

export async function editOutreachDraft(input: {
  draftId: string
  variantIndex: number
  subject: string | null
  body: string
}) {
  return invokeAI<{ draft: OutreachDraft }>('generate-outreach', { action: 'edit', ...input })
}

export async function generateFollowUp(input: {
  leadId: string
  channel: OutreachDraft['channel']
  interactionContext: string
  tone?: string
}) {
  return invokeAI<{ draft: FollowUpDraft; analysisLogId: string; cached: boolean }>('generate-follow-up', {
    action: 'generate',
    leadId: input.leadId,
    channel: input.channel,
    interactionContext: input.interactionContext,
    ...(input.tone ? { tone: input.tone } : {}),
    requestId: crypto.randomUUID(),
  })
}

export async function approveFollowUp(draftId: string, variantIndex: number) {
  return invokeAI<{ draft: Pick<FollowUpDraft, 'id' | 'status' | 'approved_variant' | 'approved_at'> }>('generate-follow-up', {
    action: 'approve',
    draftId,
    variantIndex,
  })
}

export async function editFollowUpDraft(input: {
  draftId: string
  variantIndex: number
  subject: string | null
  body: string
}) {
  return invokeAI<{ draft: FollowUpDraft }>('generate-follow-up', { action: 'edit', ...input })
}

export async function generateReplyAssistant(input: {
  leadId: string
  channel: OutreachDraft['channel']
  receivedMessage: string
}) {
  return invokeAI<{ analysis: ReplyAssistantResult; analysisLogId: string; cached: boolean }>('generate-reply-assistant', {
    ...input,
    requestId: crypto.randomUUID(),
  })
}

export async function analyzeLeadDeep(leadId: string) {
  return invokeAI<{ analysis: DeepAnalysisResult; analysisLogId: string; cached: boolean }>('analyze-lead-deep', {
    leadId,
    requestId: crypto.randomUUID(),
  })
}

export async function getLatestLeadAIAnalysis(leadId: string): Promise<AIAnalysisRecord | null> {
  if (prospectingMockMode) return null
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('ai_analysis_logs')
    .select('id,analysis_type,model,prompt_version,output_data,estimated_cost,created_at')
    .eq('lead_id', leadId)
    .eq('analysis_type', 'lead_intelligence')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Não foi possível carregar a inteligência do lead: ${error.message}`)
  return data as AIAnalysisRecord | null
}

export async function getLeadOutreachDrafts(leadId: string): Promise<OutreachDraft[]> {
  if (prospectingMockMode) return []
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('ai_outreach_drafts')
    .select('id,channel,tone,variants,status,approved_variant,approved_at,created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(`Não foi possível carregar as abordagens: ${error.message}`)
  return (data ?? []) as OutreachDraft[]
}

export async function getLeadFollowUpDrafts(leadId: string): Promise<FollowUpDraft[]> {
  if (prospectingMockMode) return []
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('ai_follow_up_drafts')
    .select('id,channel,tone,interaction_context,variants,status,approved_variant,approved_at,created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error?.code === 'PGRST205') {
    throw new Error('Follow-up ainda não está habilitado neste Supabase. Aplique a migration 20261004180000_ai_follow_up_drafts.sql e recarregue a ficha.')
  }
  if (error) throw new Error(`Não foi possível carregar os follow-ups: ${error.message}`)
  return (data ?? []) as FollowUpDraft[]
}

export async function getLeadReplyAssistantHistory(leadId: string): Promise<ReplyAssistantRecord[]> {
  if (prospectingMockMode) return []
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('ai_analysis_logs')
    .select('id,model,output_data,created_at')
    .eq('lead_id', leadId)
    .eq('analysis_type', 'reply_assistant')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(`Não foi possível carregar o histórico do assistente: ${error.message}`)
  return (data ?? []).map((row) => {
    const parsed = ReplyAssistantSchema.safeParse(row.output_data)
    if (!parsed.success) {
      throw new Error(`O registro de análise ${row.id} contém um resultado inválido.`)
    }
    return { id: row.id, model: row.model, created_at: row.created_at, result: parsed.data }
  })
}

export async function getLatestDeepAnalysis(leadId: string): Promise<DeepAnalysisRecord | null> {
  if (prospectingMockMode) return null
  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('ai_analysis_logs')
    .select('id,model,output_data,created_at')
    .eq('lead_id', leadId)
    .eq('analysis_type', 'deep_analysis')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Não foi possível carregar a análise aprofundada: ${error.message}`)
  if (!data) return null
  const parsed = DeepAnalysisSchema.safeParse(data.output_data)
  if (!parsed.success) throw new Error(`A análise aprofundada ${data.id} contém um resultado inválido.`)
  return { id: data.id, model: data.model, created_at: data.created_at, result: parsed.data }
}

export async function submitAIFeedback(input: {
  leadId: string
  analysisLogId: string
  feedbackType: 'helpful' | 'unhelpful' | 'correct' | 'incorrect'
}) {
  return invokeAI<{ feedback: { id: string; feedback_type: string; rating: number | null; created_at: string } }>('ai-feedback', input)
}
