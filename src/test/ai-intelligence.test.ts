import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  LeadIntelligenceSchema,
  DeepAnalysisSchema,
  OutreachVariantsSchema,
  ReplyAssistantSchema,
  validateDeepAnalysisEvidence,
  validateLeadIntelligenceEvidence,
  validateRecommendedService,
} from '../services/ai/schemas'
import {
  calculateActionScore,
  calculateBuyingMomentScore,
  calculateICPMatch,
  createActionScoreReason,
  defaultActionScoreWeights,
} from '../services/ai/scoring'

const intelligenceFixture = {
  executiveSummary: 'Empresa local com uma oportunidade técnica a validar.',
  companyUnderstanding: 'Empresa do segmento informado pelo cadastro.',
  digitalSituation: 'Há dados técnicos disponíveis para revisão.',
  opportunity: {
    title: 'Revisar experiência mobile',
    description: 'A pontuação mobile registrada indica oportunidade de melhoria.',
    urgency: 'medium' as const,
    confidence: 0.8,
    evidenceRefs: ['mobile_score'],
  },
  whyNow: {
    assessment: 'observed' as const,
    explanation: 'A medição técnica foi registrada pelo sistema.',
    evidenceRefs: ['mobile_score'],
  },
  buyingSignals: [{
    signal: 'Performance mobile',
    evidence: 'Performance mobile PageSpeed: 42/100',
    evidenceRefs: ['mobile_score'],
    confidence: 0.9,
  }],
  risks: [],
  recommendedService: {
    service: 'Otimização mobile',
    reason: 'É o serviço cadastrado mais próximo da evidência disponível.',
    evidenceRefs: ['mobile_score'],
    confidence: 0.75,
  },
  salesAngle: {
    headline: 'Uma oportunidade de melhoria mobile',
    argument: 'A medição registrada sugere uma oportunidade de revisão técnica.',
  },
  nextBestAction: {
    action: 'review_website' as const,
    reason: 'Valide a evidência antes de iniciar contato.',
  },
  icpAssessment: {
    score: 70,
    fit: 'good' as const,
    explanation: 'Aderência calculada pelos critérios disponíveis.',
  },
  confidence: 0.8,
}

describe('AI structured schemas', () => {
  it('accepts a complete lead intelligence record', () => {
    expect(LeadIntelligenceSchema.safeParse(intelligenceFixture).success).toBe(true)
  })

  it('emits a strict JSON Schema with all response fields required', () => {
    const jsonSchema = z.toJSONSchema(LeadIntelligenceSchema)
    const properties = Object.keys(jsonSchema.properties ?? {})
    expect(jsonSchema.additionalProperties).toBe(false)
    expect(jsonSchema.required).toEqual(properties)
  })

  it('rejects malformed output and unsupported evidence references', () => {
    const parsed = LeadIntelligenceSchema.parse(intelligenceFixture)
    expect(LeadIntelligenceSchema.safeParse({ ...intelligenceFixture, confidence: 1.2 }).success).toBe(false)
    expect(validateLeadIntelligenceEvidence(parsed, new Map([['mobile_score', 'Performance mobile PageSpeed: 42/100']]))).toBe(true)
    expect(validateLeadIntelligenceEvidence(parsed, new Map([['company_name', 'Clínica Sorriso']]))).toBe(false)
  })

  it('allows only configured service names or the explicit unconfigured state', () => {
    const parsed = LeadIntelligenceSchema.parse(intelligenceFixture)
    expect(validateRecommendedService(parsed, ['Redesign de site'])).toBe(false)
    expect(validateRecommendedService(parsed, ['Otimização mobile', 'Redesign de site'])).toBe(true)
    expect(validateRecommendedService({
      ...parsed,
      recommendedService: { ...parsed.recommendedService, service: 'Serviço não configurado' },
    }, [])).toBe(true)
  })

  it('requires three valid, scored outreach variants', () => {
    const valid = {
      variants: ['Direta', 'Consultiva', 'Curta'].map((label) => ({
        label,
        subject: label === 'Direta' ? 'Uma sugestão para o site' : null,
        body: 'Notei uma medição técnica disponível. Faz sentido conversar?',
        evidenceRefs: ['mobile_score'],
        personalizationScore: 80,
        clarityScore: 90,
        relevanceScore: 85,
        riskScore: 10,
        overallQualityScore: 84,
      })),
    }
    expect(OutreachVariantsSchema.safeParse(valid).success).toBe(true)
    expect(OutreachVariantsSchema.safeParse({ variants: valid.variants.slice(0, 2) }).success).toBe(false)
  })

  it('accepts a classified reply with a human-reviewed suggestion', () => {
    const validReply = {
      category: 'objection',
      sentiment: 'mixed',
      intent: 'A pessoa demonstra interesse, mas questiona o investimento.',
      urgency: 'medium',
      suggestedReply: 'Entendo a preocupação. Podemos avaliar juntos se faz sentido para o momento de vocês.',
      nextStep: 'Revisar a resposta e decidir se deseja enviá-la manualmente.',
      confidence: 0.82,
    } as const
    expect(ReplyAssistantSchema.safeParse(validReply).success).toBe(true)
    const jsonSchema = z.toJSONSchema(ReplyAssistantSchema)
    expect(jsonSchema.additionalProperties).toBe(false)
    expect(jsonSchema.required).toEqual(Object.keys(jsonSchema.properties ?? {}))
    expect(ReplyAssistantSchema.safeParse({
      category: 'unsupported',
      sentiment: 'positive',
      intent: 'Resposta.',
      urgency: 'low',
      suggestedReply: 'Obrigado.',
      nextStep: 'Revisar.',
      confidence: 0.8,
    }).success).toBe(false)
  })

  it('requires deep-analysis findings to cite available evidence', () => {
    const result = DeepAnalysisSchema.parse({
      executiveSummary: 'Há um ponto técnico que vale revisar com a empresa.',
      opportunities: [{
        title: 'Validar a experiência mobile',
        observedEvidence: 'A pontuação mobile registrada foi 42/100.',
        businessImplication: 'Isso pode indicar fricção, hipótese a confirmar.',
        recommendedAction: 'Perguntar se a experiência mobile é uma prioridade atual.',
        priority: 'medium',
        evidenceRefs: ['mobile_score'],
      }],
      strengths: [],
      risks: [],
      validationQuestions: ['Como avaliam a experiência mobile hoje?'],
      confidence: 0.75,
    })
    expect(validateDeepAnalysisEvidence(result, new Set(['mobile_score']))).toBe(true)
    expect(validateDeepAnalysisEvidence(result, new Set(['company_name']))).toBe(false)
  })
})

describe('commercial prioritization scores', () => {
  it('scores ICP only against configured, observable criteria', () => {
    expect(calculateICPMatch({
      fallbackScore: 44,
      companyCategory: null,
      companyLocation: null,
      targetSegments: ['clínica'],
      targetLocations: [],
      targetCompanySizes: ['pequena'],
      preferredServices: [],
      idealSignals: [],
      negativeSignals: [],
      observedSignals: [],
      minimumScore: 60,
    })).toEqual({
      score: 0,
      reason: 'Aderência calculada por segmento fora do alvo, porte desejado configurado, mas porte da empresa não disponível para comparação, abaixo do mínimo configurado (60/100).',
    })
  })

  it('uses the existing score when the configured ICP cannot be compared', () => {
    expect(calculateICPMatch({
      fallbackScore: 64,
      companyCategory: null,
      companyLocation: null,
      targetSegments: [],
      targetLocations: [],
      targetCompanySizes: ['pequena'],
      preferredServices: ['Criação de sites'],
      idealSignals: [],
      negativeSignals: [],
      observedSignals: [],
      minimumScore: 50,
    }).score).toBe(64)
  })

  it('calculates Action Score deterministically from weighted components', () => {
    const scores = {
      icpFit: 80,
      opportunity: 90,
      buyingSignals: 70,
      urgency: 60,
      confidence: 80,
      reachability: 50,
    }
    const first = calculateActionScore(scores)
    expect(calculateActionScore(scores)).toEqual(first)
    expect(first.score).toBe(76)
    expect(calculateActionScore(scores, { ...defaultActionScoreWeights, opportunity: -10 }).score).toBeGreaterThanOrEqual(0)
  })

  it('calculates Buying Moment from known signals, not fabricated business facts', () => {
    expect(calculateBuyingMomentScore(['low_performance_score', 'poor_mobile_experience'])).toBe(70)
    expect(calculateBuyingMomentScore(['unknown_signal'])).toBe(0)
  })

  it('explains the score and warns when confidence is weak', () => {
    expect(createActionScoreReason({
      icpFit: 80,
      opportunity: 90,
      buyingSignals: 60,
      urgency: 75,
      confidence: 20,
      reachability: 50,
    })).toEqual(expect.arrayContaining([
      'Boa aderência ao perfil de cliente ideal',
      'Confiança limitada: valide os dados antes de abordar',
      'Há canais empresariais públicos para contato',
    ]))
  })
})
