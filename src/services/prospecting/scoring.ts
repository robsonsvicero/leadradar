export type DeduplicableCompany = {
  placeId?: string | null
  name: string
  address?: string | null
  phone?: string | null
  website?: string | null
  city?: string | null
}

export type TechnicalSignals = {
  hasWebsite: boolean
  hasHttps: boolean | null
  performanceScore: number | null
  seoScore: number | null
  mobileScore: number | null
  hasCta: boolean | null
  hasContactForm: boolean | null
}

export type LeadSignal = {
  signal: string
  weight: number
  evidence: string
  source: string
  confidence: number
}

export const leadScoreThresholds = {
  hot: 80,
  warm: 40,
} as const

export const prospectingQualityCriteria = {
  minRating: 4,
  minReviewCount: 20,
  maxReviewCount: 350,
} as const

export function meetsProspectingQualityCriteria(input: {
  rating: number | null | undefined
  reviewCount: number | null | undefined
}) {
  return input.rating !== null
    && input.rating !== undefined
    && input.rating >= prospectingQualityCriteria.minRating
    && input.reviewCount !== null
    && input.reviewCount !== undefined
    && input.reviewCount >= prospectingQualityCriteria.minReviewCount
    && input.reviewCount <= prospectingQualityCriteria.maxReviewCount
}

export function normalizeCompanyName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|limitada|me|epp|eireli|sa|s\/a)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizePhone(value: string | null | undefined) {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits
}

export function normalizeDomain(value: string | null | undefined) {
  if (!value) return ''
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  } catch {
    return ''
  }
}

export function normalizeUrl(value: string | null | undefined) {
  if (!value) return ''
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    url.hash = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if (url.pathname === '/') url.pathname = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function normalizeAddress(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function companyDeduplicationKey(company: DeduplicableCompany) {
  if (company.placeId) return `place:${company.placeId}`
  const domain = normalizeDomain(company.website)
  if (domain) return `domain:${domain}`
  const phone = normalizePhone(company.phone)
  if (phone) return `phone:${phone}`
  const name = normalizeCompanyName(company.name)
  const address = normalizeAddress(company.address)
  if (name && address) return `name-address:${name}:${address}`
  const city = normalizeAddress(company.city)
  return name && city ? `name-city:${name}:${city}` : ''
}

export function deduplicateCompanies<T extends DeduplicableCompany>(companies: T[]) {
  const seen = new Set<string>()
  return companies.filter((company) => {
    const key = companyDeduplicationKey(company)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function calculateTechnicalScore(signals: TechnicalSignals) {
  let score = signals.hasWebsite ? 15 : 85
  const reasons: string[] = []

  if (!signals.hasWebsite) {
    reasons.push('Empresa sem website identificado')
  } else {
    if (signals.hasHttps === false) {
      score += 12
      reasons.push('Website sem HTTPS')
    }
    if (signals.performanceScore !== null && signals.performanceScore < 50) {
      score += 22
      reasons.push(`Baixa performance do website (${signals.performanceScore}/100)`)
    } else if (signals.performanceScore !== null && signals.performanceScore < 75) {
      score += 12
      reasons.push(`Performance do website abaixo do ideal (${signals.performanceScore}/100)`)
    }
    if (signals.mobileScore !== null && signals.mobileScore < 50) {
      score += 18
      reasons.push(`Experiência mobile com pontuação baixa (${signals.mobileScore}/100)`)
    }
    if (signals.seoScore !== null && signals.seoScore < 50) {
      score += 15
      reasons.push(`SEO técnico abaixo do ideal (${signals.seoScore}/100)`)
    }
    if (signals.hasCta === false) {
      score += 10
      reasons.push('Nenhuma chamada para ação identificada')
    }
    if (signals.hasContactForm === false) {
      score += 8
      reasons.push('Nenhum formulário de contato identificado')
    }
  }

  return { score: clampScore(score), reasons }
}

export function calculateICPMatch(input: {
  segmentMatched: boolean
  locationMatched: boolean
  rating: number | null
  reviewCount: number | null
}) {
  let score = 0
  if (input.segmentMatched) score += 50
  if (input.locationMatched) score += 25
  if (input.rating !== null && input.rating >= prospectingQualityCriteria.minRating) score += 15
  if (input.reviewCount !== null && input.reviewCount >= prospectingQualityCriteria.minReviewCount) score += 10
  return clampScore(score)
}

export function calculateLeadScore(input: {
  technicalScore: number
  icpMatch: number
  signals: LeadSignal[]
}) {
  const signalStrength = clampScore(
    input.signals.reduce((total, signal) => total + Math.max(0, signal.weight) * signal.confidence, 0),
  )
  const score = clampScore(input.technicalScore * 0.5 + input.icpMatch * 0.3 + signalStrength * 0.2)
  const classification = score >= leadScoreThresholds.hot
    ? 'hot'
    : score >= leadScoreThresholds.warm
      ? 'warm'
      : 'cold'
  return { score, signalStrength, classification }
}
