import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from '../prospecting/prospectingService'

const pageSize = 1000
const maxHistoryRows = 5000

export type AIUsageLog = {
  id: string
  analysis_type: string
  model: string
  tokens_input: number
  tokens_output: number
  estimated_cost: number | string | null
  status: 'pending' | 'succeeded' | 'failed'
  created_at: string
}

export type AIUsageOperationSummary = {
  operation: string
  count: number
  succeeded: number
  failed: number
  pending: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  unestimatedCostCount: number
}

export type AIUsageData = {
  demoMode: boolean
  hasOrganization: boolean
  periodDays: number
  totalCount: number
  isPartial: boolean
  logs: AIUsageLog[]
  byOperation: AIUsageOperationSummary[]
}

export function summarizeAIUsage(logs: AIUsageLog[]): AIUsageOperationSummary[] {
  const summaries = new Map<string, AIUsageOperationSummary>()
  for (const log of logs) {
    const summary = summaries.get(log.analysis_type) ?? {
      operation: log.analysis_type,
      count: 0,
      succeeded: 0,
      failed: 0,
      pending: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      unestimatedCostCount: 0,
    }
    const cost = log.estimated_cost === null ? null : Number(log.estimated_cost)
    summary.count += 1
    if (log.status === 'succeeded') summary.succeeded += 1
    if (log.status === 'failed') summary.failed += 1
    if (log.status === 'pending') summary.pending += 1
    summary.inputTokens += log.tokens_input
    summary.outputTokens += log.tokens_output
    if (cost !== null && Number.isFinite(cost) && cost >= 0) summary.estimatedCost += cost
    else summary.unestimatedCostCount += 1
    summaries.set(log.analysis_type, summary)
  }
  return [...summaries.values()].sort((left, right) => right.count - left.count)
}

export async function getAIUsageData(periodDays: 7 | 30 | 90): Promise<AIUsageData> {
  if (prospectingMockMode) {
    return {
      demoMode: true,
      hasOrganization: true,
      periodDays,
      totalCount: 0,
      isPartial: false,
      logs: [],
      byOperation: [],
    }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: memberships, error: membershipError } = await supabase.from('organization_members')
    .select('organization_id')
    .eq('user_id', authData.user.id)
  if (membershipError) throw new Error(`Não foi possível carregar as organizações: ${membershipError.message}`)
  const organizationIds = [...new Set((memberships ?? []).map((membership) => membership.organization_id))]
  if (!organizationIds.length) {
    return {
      demoMode: false,
      hasOrganization: false,
      periodDays,
      totalCount: 0,
      isPartial: false,
      logs: [],
      byOperation: [],
    }
  }

  const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await supabase.from('ai_analysis_logs')
    .select('id', { count: 'exact', head: true })
    .in('organization_id', organizationIds)
    .gte('created_at', from)
  if (countError) throw new Error(`Não foi possível contar o histórico de IA: ${countError.message}`)

  const totalCount = count ?? 0
  const rowsToLoad = Math.min(totalCount, maxHistoryRows)
  const logs: AIUsageLog[] = []
  for (let offset = 0; offset < rowsToLoad; offset += pageSize) {
    const end = Math.min(offset + pageSize, rowsToLoad) - 1
    const { data, error } = await supabase.from('ai_analysis_logs')
      .select('id,analysis_type,model,tokens_input,tokens_output,estimated_cost,status,created_at')
      .in('organization_id', organizationIds)
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .range(offset, end)
    if (error) throw new Error(`Não foi possível carregar o histórico de IA: ${error.message}`)
    const page = (data ?? []) as AIUsageLog[]
    logs.push(...page)
    if (page.length < end - offset + 1) break
  }

  return {
    demoMode: false,
    hasOrganization: true,
    periodDays,
    totalCount,
    isPartial: logs.length < totalCount,
    logs,
    byOperation: summarizeAIUsage(logs),
  }
}
