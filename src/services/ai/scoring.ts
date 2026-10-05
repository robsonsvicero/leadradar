export type ActionScoreWeights = {
  icpFit: number
  opportunity: number
  buyingSignals: number
  urgency: number
  confidence: number
  reachability: number
}

export type ActionScoreInputs = ActionScoreWeights

export const defaultActionScoreWeights: ActionScoreWeights = {
  icpFit: 25,
  opportunity: 25,
  buyingSignals: 20,
  urgency: 15,
  confidence: 10,
  reachability: 5,
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function calculateICPMatch(input: {
  fallbackScore: number
  companyCategory: string | null
  companyLocation: string | null
  targetSegments: string[]
  targetLocations: string[]
  targetCompanySizes: string[]
  preferredServices: string[]
  idealSignals: string[]
  negativeSignals: string[]
  observedSignals: string[]
  minimumScore: number
}) {
  const hasComparableCriteria = input.targetSegments.length > 0 ||
    input.targetLocations.length > 0 ||
    input.idealSignals.length > 0 ||
    input.negativeSignals.length > 0
  if (!hasComparableCriteria) {
    return {
      score: clampScore(input.fallbackScore),
      reason: 'Usado o ICP determinístico salvo pelo motor de prospecção; os critérios configurados ainda não podem ser comparados com os dados disponíveis.',
    }
  }

  const normalize = (value: string) => value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
  const category = normalize(input.companyCategory ?? '')
  const location = normalize(input.companyLocation ?? '')
  const segmentMatch = input.targetSegments.length === 0 ||
    (category.length > 0 && input.targetSegments.some((segment) => category.includes(normalize(segment))))
  const locationMatch = input.targetLocations.length === 0 ||
    (location.length > 0 && input.targetLocations.some((target) => location.includes(normalize(target))))
  const observedSignals = new Set(input.observedSignals)
  const idealMatches = input.idealSignals.filter((signal) => observedSignals.has(signal)).length
  const negativeMatches = input.negativeSignals.filter((signal) => observedSignals.has(signal)).length

  let availableWeight = 0
  let earnedWeight = 0
  if (input.targetSegments.length) {
    availableWeight += 50
    if (segmentMatch) earnedWeight += 50
  }
  if (input.targetLocations.length) {
    availableWeight += 30
    if (locationMatch) earnedWeight += 30
  }
  if (input.idealSignals.length) {
    availableWeight += 20
    earnedWeight += 20 * idealMatches / input.idealSignals.length
  }
  if (input.negativeSignals.length) {
    availableWeight += 20
    earnedWeight += 20
  }

  const score = clampScore((earnedWeight / availableWeight) * 100 - Math.min(40, negativeMatches * 20))
  const reasons = [
    input.targetSegments.length ? `segmento ${segmentMatch ? 'compatível' : 'fora do alvo'}` : null,
    input.targetLocations.length ? `localização ${locationMatch ? 'compatível' : 'fora do alvo'}` : null,
    input.idealSignals.length ? `${idealMatches}/${input.idealSignals.length} sinais desejados observados` : null,
  ].filter((reason): reason is string => Boolean(reason))
  if (negativeMatches) reasons.push(`${negativeMatches} sinal(is) de desqualificação observado(s)`)
  if (input.targetCompanySizes.length) reasons.push('porte desejado configurado, mas porte da empresa não disponível para comparação')
  if (input.preferredServices.length) reasons.push('serviços prioritários serão considerados pela análise comercial')
  if (score < input.minimumScore) reasons.push(`abaixo do mínimo configurado (${input.minimumScore}/100)`)

  return {
    score,
    reason: `Aderência calculada por ${reasons.join(', ')}.`,
  }
}

export function calculateActionScore(
  scores: ActionScoreInputs,
  weights: ActionScoreWeights = defaultActionScoreWeights,
) {
  const normalizedWeights = {
    icpFit: Math.max(0, weights.icpFit),
    opportunity: Math.max(0, weights.opportunity),
    buyingSignals: Math.max(0, weights.buyingSignals),
    urgency: Math.max(0, weights.urgency),
    confidence: Math.max(0, weights.confidence),
    reachability: Math.max(0, weights.reachability),
  }
  const totalWeight = Object.values(normalizedWeights).reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0) throw new Error('Os pesos do Action Score precisam somar um valor positivo.')

  const weighted = (
    clampScore(scores.icpFit) * normalizedWeights.icpFit +
    clampScore(scores.opportunity) * normalizedWeights.opportunity +
    clampScore(scores.buyingSignals) * normalizedWeights.buyingSignals +
    clampScore(scores.urgency) * normalizedWeights.urgency +
    clampScore(scores.confidence) * normalizedWeights.confidence +
    clampScore(scores.reachability) * normalizedWeights.reachability
  ) / totalWeight

  return {
    score: clampScore(weighted),
    breakdown: {
      icpFit: clampScore(scores.icpFit),
      opportunity: clampScore(scores.opportunity),
      buyingSignals: clampScore(scores.buyingSignals),
      urgency: clampScore(scores.urgency),
      confidence: clampScore(scores.confidence),
      reachability: clampScore(scores.reachability),
    },
  }
}

export function calculateBuyingMomentScore(signals: string[]) {
  const weights: Record<string, number> = {
    no_website: 45,
    no_https: 20,
    low_performance_score: 35,
    poor_mobile_experience: 35,
    low_seo_score: 25,
    weak_cta: 20,
    missing_contact_form: 15,
    high_rating: 15,
  }
  const unique = [...new Set(signals)]
  return clampScore(unique.reduce((total, signal) => total + (weights[signal] ?? 0), 0))
}

export function createActionScoreReason(input: {
  icpFit: number
  opportunity: number
  buyingSignals: number
  urgency: number
  confidence: number
  reachability: number
}) {
  const reasons: string[] = []
  if (input.icpFit >= 70) reasons.push('Boa aderência ao perfil de cliente ideal')
  if (input.opportunity >= 70) reasons.push('Oportunidade técnica respaldada por dados coletados')
  if (input.buyingSignals >= 50) reasons.push('Há sinais públicos que justificam qualificação')
  if (input.urgency >= 60) reasons.push('Os sinais disponíveis favorecem uma abordagem no momento')
  if (input.confidence < 50) reasons.push('Confiança limitada: valide os dados antes de abordar')
  if (input.reachability >= 50) reasons.push('Há canais empresariais públicos para contato')
  if (!reasons.length) reasons.push('Poucas evidências disponíveis; qualifique antes de priorizar')
  return reasons
}
