import { z } from 'zod'

const boundedScore = z.number().int().min(0).max(100)
const confidence = z.number().min(0).max(1)
const evidenceRefs = z.array(z.string().min(1).max(80)).max(12)

export const LeadIntelligenceSchema = z.object({
  executiveSummary: z.string().min(1).max(500),
  companyUnderstanding: z.string().min(1).max(800),
  digitalSituation: z.string().min(1).max(800),
  opportunity: z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(800),
    urgency: z.enum(['low', 'medium', 'high']),
    confidence,
    evidenceRefs,
  }).strict(),
  whyNow: z.object({
    assessment: z.enum(['observed', 'inferred', 'unknown']),
    explanation: z.string().min(1).max(500),
    evidenceRefs,
  }).strict(),
  buyingSignals: z.array(z.object({
    signal: z.string().min(1).max(120),
    evidence: z.string().min(1).max(500),
    evidenceRefs,
    confidence,
  }).strict()).max(8),
  risks: z.array(z.object({
    risk: z.string().min(1).max(160),
    explanation: z.string().min(1).max(500),
    severity: z.enum(['low', 'medium', 'high']),
  }).strict()).max(8),
  recommendedService: z.object({
    service: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
    evidenceRefs,
    confidence,
  }).strict(),
  salesAngle: z.object({
    headline: z.string().min(1).max(160),
    argument: z.string().min(1).max(800),
  }).strict(),
  nextBestAction: z.object({
    action: z.enum(['contact_now', 'follow_up', 'review_website', 'schedule_meeting', 'wait', 'disqualify']),
    reason: z.string().min(1).max(500),
  }).strict(),
  icpAssessment: z.object({
    score: boundedScore,
    fit: z.enum(['poor', 'moderate', 'good', 'excellent']),
    explanation: z.string().min(1).max(500),
  }).strict(),
  confidence,
}).strict()

export const OutreachVariantsSchema = z.object({
  variants: z.array(z.object({
    label: z.enum(['Direta', 'Consultiva', 'Curta']),
    subject: z.string().max(160).nullable(),
    body: z.string().min(1).max(1800),
    evidenceRefs,
    personalizationScore: boundedScore,
    clarityScore: boundedScore,
    relevanceScore: boundedScore,
    riskScore: boundedScore,
    overallQualityScore: boundedScore,
  }).strict()).length(3),
}).strict()

export const ReplyAssistantSchema = z.object({
  category: z.enum(['interested', 'question', 'pricing', 'objection', 'not_now', 'not_interested', 'meeting_request', 'positive', 'negative', 'unknown']),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed', 'unknown']),
  intent: z.string().min(1).max(240),
  urgency: z.enum(['low', 'medium', 'high', 'unknown']),
  suggestedReply: z.string().min(1).max(1200),
  nextStep: z.string().min(1).max(400),
  confidence,
}).strict()

export const DeepAnalysisSchema = z.object({
  executiveSummary: z.string().min(1).max(800),
  opportunities: z.array(z.object({
    title: z.string().min(1).max(140),
    observedEvidence: z.string().min(1).max(500),
    businessImplication: z.string().min(1).max(600),
    recommendedAction: z.string().min(1).max(400),
    priority: z.enum(['low', 'medium', 'high']),
    evidenceRefs,
  }).strict()).max(8),
  strengths: z.array(z.object({
    title: z.string().min(1).max(140),
    detail: z.string().min(1).max(500),
    evidenceRefs,
  }).strict()).max(8),
  risks: z.array(z.object({
    title: z.string().min(1).max(140),
    detail: z.string().min(1).max(500),
    severity: z.enum(['low', 'medium', 'high']),
    evidenceRefs,
  }).strict()).max(8),
  validationQuestions: z.array(z.string().min(1).max(300)).max(8),
  confidence,
}).strict()

export const replyCategories = {
  interested: 'Interessado',
  question: 'Dúvida',
  pricing: 'Preço',
  objection: 'Objeção',
  not_now: 'Não é o momento',
  not_interested: 'Sem interesse',
  meeting_request: 'Pedido de reunião',
  positive: 'Positiva',
  negative: 'Negativa',
  unknown: 'Não identificada',
} as const

export const replySentiments = {
  positive: 'Positivo',
  neutral: 'Neutro',
  negative: 'Negativo',
  mixed: 'Misto',
  unknown: 'Indeterminado',
} as const

export const replyUrgencies = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  unknown: 'Indeterminada',
} as const

export type LeadIntelligence = z.infer<typeof LeadIntelligenceSchema>
export type OutreachVariants = z.infer<typeof OutreachVariantsSchema>
export type OutreachVariant = OutreachVariants['variants'][number]
export type ReplyAssistantResult = z.infer<typeof ReplyAssistantSchema>
export type DeepAnalysisResult = z.infer<typeof DeepAnalysisSchema>

export function validateDeepAnalysisEvidence(
  value: DeepAnalysisResult,
  availableReferences: Set<string>,
) {
  return [
    ...value.opportunities,
    ...value.strengths,
    ...value.risks,
  ].every((item) => item.evidenceRefs.length > 0 &&
    validateEvidenceReferences(item, availableReferences))
}

export function validateEvidenceReferences<T extends { evidenceRefs: string[] }>(
  value: T,
  availableReferences: Set<string>,
): boolean {
  return value.evidenceRefs.every((reference) => availableReferences.has(reference))
}

export function validateLeadIntelligenceEvidence(
  value: LeadIntelligence,
  availableReferences: Map<string, string>,
) {
  return value.opportunity.evidenceRefs.length > 0 &&
    validateEvidenceReferences(value.opportunity, new Set(availableReferences.keys())) &&
    validateEvidenceReferences(value.whyNow, new Set(availableReferences.keys())) &&
    value.buyingSignals.every((signal) => signal.evidenceRefs.length > 0 &&
      validateEvidenceReferences(signal, new Set(availableReferences.keys())) &&
      signal.evidenceRefs.some((reference) => availableReferences.get(reference) === signal.evidence)) &&
    validateEvidenceReferences(value.recommendedService, new Set(availableReferences.keys()))
}

export function validateRecommendedService(value: LeadIntelligence, availableServices: string[]) {
  const recommended = value.recommendedService.service.trim().toLocaleLowerCase('pt-BR')
  if (!availableServices.length) return recommended === 'serviço não configurado'
  return availableServices.some((service) => service.trim().toLocaleLowerCase('pt-BR') === recommended)
}

export function validateOutreachEvidence(
  value: OutreachVariants,
  availableReferences: Set<string>,
) {
  return value.variants.every((variant) =>
    variant.evidenceRefs.length > 0 && validateEvidenceReferences(variant, availableReferences))
}
