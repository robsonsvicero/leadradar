import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'

import { prospectingConfig } from '../../../src/config/prospecting.ts'
import { extractPublicEmail } from '../../../src/services/prospecting/email.ts'
import {
  calculateICPMatch,
  calculateLeadScore,
  calculateTechnicalScore,
  deduplicateCompanies,
  meetsProspectingQualityCriteria,
  normalizeAddress,
  normalizeCompanyName,
  normalizeDomain,
  normalizePhone,
  normalizeUrl,
  type LeadSignal,
} from '../../../src/services/prospecting/scoring.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const createSchema = z.object({
  organizationId: z.string().uuid(),
  location: z.string().trim().min(2).max(120),
  segment: z.string().trim().min(2).max(120),
  keywords: z.array(z.string().trim().min(1).max(prospectingConfig.maxKeywordLength)).max(prospectingConfig.maxKeywordsPerJob).default([]),
  targetQuantity: z.number().int().min(prospectingConfig.minCompaniesPerJob).max(prospectingConfig.maxCompaniesPerJob),
})

const cancelSchema = z.object({ action: z.literal('cancel'), jobId: z.string().uuid() })
const continueSchema = z.object({ action: z.literal('continue'), jobId: z.string().uuid() })

type Place = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  websiteUri?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  googleMapsUri?: string
  rating?: number
  userRatingCount?: number
  types?: string[]
  primaryTypeDisplayName?: { text?: string }
  businessStatus?: string
}

type Job = {
  id: string
  organization_id: string
  created_by: string
  location: string
  segment: string
  keywords: string[]
  target_quantity: number
  status: string
  current_step: string
  companies_found: number
  companies_unique: number
  companies_analyzed: number
  hot_leads: number
  warm_leads: number
  cold_leads: number
  error_count: number
  progress_percentage: number
  search_query_index: number
  worker_id: string | null
  worker_lease_until: string | null
}

type JobCompany = {
  id: string
  external_id: string | null
  company_id: string | null
  status: string
  error_message: string | null
  place_data: Place | null
  result_classification: 'hot' | 'warm' | 'cold' | null
}

type PlaceResponse = { places?: Place[]; nextPageToken?: string }

type DigitalAnalysis = {
  website_status: string
  http_status: number | null
  has_https: boolean
  redirect_count: number
  performance_score: number | null
  mobile_score: number | null
  seo_score: number | null
  accessibility_score: number | null
  best_practices_score: number | null
  core_web_vitals: Record<string, number | null>
  page_title: string | null
  meta_description: string | null
  has_viewport: boolean
  has_analytics: boolean
  has_pixel: boolean
  has_contact_form: boolean
  has_whatsapp: boolean
  has_phone: boolean
  has_email: boolean
  contact_email: string | null
  has_social_links: boolean
  has_cta: boolean
  has_ssl: boolean | null
  analysis: Record<string, unknown>
  raw_data: Record<string, unknown>
  analyzed_at: string
}

const deno = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Response | Promise<Response>): void
  }
}).Deno

const runtime = (globalThis as typeof globalThis & {
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
}).EdgeRuntime

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function makeClient(url: string, key: string, authorization?: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  })
}

function log(event: string, values: Record<string, unknown>) {
  console.warn(JSON.stringify({ event, ...values }))
}

async function verifyMembership(userClient: SupabaseClient, organizationId: string, userId: string) {
  const { data, error } = await userClient
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Não foi possível validar sua organização: ${error.message}`)
  if (!data) throw new Error('Você não tem acesso à organização selecionada.')
}

async function recordApiUsage(
  admin: SupabaseClient,
  job: Job,
  provider: string,
  operation: string,
  requestCount = 1,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await admin.from('api_usage').insert({
    organization_id: job.organization_id,
    provider,
    operation,
    request_count: requestCount,
    metadata: { job_id: job.id, ...metadata },
  })
  if (error) log('api_usage_write_failed', { job_id: job.id, organization_id: job.organization_id, provider, error_code: error.code })
}

async function isCancelled(admin: SupabaseClient, jobId: string) {
  const { data, error } = await admin.from('prospecting_jobs').select('status').eq('id', jobId).single()
  if (error) throw new Error(`Não foi possível verificar o estado do job: ${error.message}`)
  return data.status === 'cancelled'
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function consumeRateLimit(
  admin: SupabaseClient,
  subjectType: 'user' | 'organization',
  subjectId: string,
  limit: number,
) {
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_action: 'prospecting_search',
    p_limit: limit,
    p_window_seconds: 3600,
  })
  if (error) throw new Error(`Rate-limit service failed: ${error.code ?? 'unknown'}`)
  return data === true
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries = prospectingConfig.transientRetryAttempts,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (result.ok || (result.status < 500 && result.status !== 429) || attempt === retries) return result
    } catch (error) {
      if (attempt === retries) throw error
    }
    await sleep(1000 * 2 ** attempt)
  }
  throw new Error('Falha transitória após esgotar as tentativas.')
}

async function searchPlaces(query: string, apiKey: string, target: number, job: Job, admin: SupabaseClient) {
  const places: Place[] = []
  let pageToken: string | undefined
  let page = 0

  while (places.length < target && page < prospectingConfig.maxPagesPerQuery) {
    if (await isCancelled(admin, job.id)) break
    const result = await requestWithRetry(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.rating,places.userRatingCount,places.types,places.primaryTypeDisplayName,places.businessStatus,nextPageToken',
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: Math.min(20, target - places.length),
          ...(pageToken ? { pageToken } : {}),
        }),
      },
      15000,
    )
    await recordApiUsage(admin, job, 'google_places', 'text_search')
    if (!result.ok) {
      const body = await result.json().catch(() => ({})) as { error?: { status?: string; message?: string } }
      throw new Error(`Google Places retornou ${result.status}${body.error?.status ? ` (${body.error.status})` : ''}.`)
    }
    const data = await result.json() as PlaceResponse
    places.push(...(data.places ?? []).filter((place) => meetsProspectingQualityCriteria({
      rating: place.rating,
      reviewCount: place.userRatingCount,
    })))
    pageToken = data.nextPageToken
    page += 1
    if (!pageToken) break
    await sleep(2000)
  }
  return places.slice(0, target)
}

function isPublicWebsite(value: string) {
  const normalized = normalizeUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:')
  ) return null
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number)
    const [first, second] = octets
    if (
      octets.some((octet) => octet > 255) ||
      first === 0 || first === 10 || first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    ) return null
  }
  return normalized
}

function readHtmlSignals(html: string) {
  const getMeta = (name: string) => {
    const pattern = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${name}["'])[^>]*content=["']([^"']*)["'][^>]*>`, 'i')
    return html.match(pattern)?.[1]?.trim() ?? null
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? null
  const visible = html.slice(0, 500000)
  const contactEmail = extractPublicEmail(visible)
  return {
    page_title: title,
    meta_description: getMeta('description'),
    has_viewport: /<meta\b[^>]*name=["']viewport["']/i.test(visible),
    has_analytics: /google-analytics|googletagmanager|gtag\(/i.test(visible),
    has_pixel: /connect\.facebook\.net|fbq\(/i.test(visible),
    has_contact_form: /<form\b/i.test(visible),
    has_whatsapp: /wa\.me\/|api\.whatsapp\.com/i.test(visible),
    has_phone: /(?:tel:|\+?\d[\d\s().-]{7,}\d)/i.test(visible),
    has_email: Boolean(contactEmail),
    contact_email: contactEmail,
    has_social_links: /instagram\.com|facebook\.com|linkedin\.com|youtube\.com/i.test(visible),
    has_cta: /<(?:a|button)\b[^>]*>[\s\S]{0,160}(?:agendar|solicitar|contato|fale|orçamento|orcamento|comprar|saiba mais)/i.test(visible),
  }
}

async function analyzePublicWebsite(rawUrl: string, pageSpeedKey?: string): Promise<DigitalAnalysis> {
  const start = Date.now()
  let currentUrl = isPublicWebsite(rawUrl)
  if (!currentUrl) throw new Error('O endereço do website não é válido ou não é público.')
  let redirects = 0
  let responseValue: Response | null = null

  while (redirects <= 3) {
    responseValue = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(prospectingConfig.websiteTimeoutMs),
      headers: { 'User-Agent': 'LeadRadarAI-WebsiteAnalyzer/1.0 (+public-site-metadata)' },
    })
    if (responseValue.status < 300 || responseValue.status >= 400) break
    const location = responseValue.headers.get('location')
    if (!location || redirects === 3) break
    const nextUrl = isPublicWebsite(new URL(location, currentUrl).toString())
    if (!nextUrl) throw new Error('O website redirecionou para um endereço que não pode ser analisado.')
    currentUrl = nextUrl
    redirects += 1
  }
  if (!responseValue) throw new Error('O website não respondeu.')
  const html = (await responseValue.text()).slice(0, 500000)
  const pageSignals = readHtmlSignals(html)
  let performanceScore: number | null = null
  let mobileScore: number | null = null
  let seoScore: number | null = null
  let accessibilityScore: number | null = null
  let bestPracticesScore: number | null = null
  const coreWebVitals: Record<string, number | null> = {}
  const pageSpeedErrors: string[] = []

  if (pageSpeedKey) {
    const pagespeedScores: Array<{ strategy: 'mobile' | 'desktop'; performance: number | null; seo: number | null; accessibility: number | null; bestPractices: number | null; vitals: Record<string, number | null> }> = []
    for (const strategy of ['mobile', 'desktop'] as const) {
      const params = new URLSearchParams({ url: currentUrl, key: pageSpeedKey, strategy })
      for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) params.append('category', category)
      try {
        const result = await requestWithRetry(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
          {},
          prospectingConfig.pageSpeedTimeoutMs,
          0,
        )
        if (!result.ok) throw new Error(`PageSpeed retornou ${result.status}.`)
        const data = await result.json() as {
          lighthouseResult?: {
            categories?: Record<string, { score?: number | null }>
            audits?: Record<string, { numericValue?: number }>
          }
        }
        const lighthouse = data.lighthouseResult
        const categoryScore = (name: string) => {
          const score = lighthouse?.categories?.[name]?.score
          return typeof score === 'number' ? Math.round(score * 100) : null
        }
        const vitals = {
          lcp_ms: lighthouse?.audits?.['largest-contentful-paint']?.numericValue ?? null,
          cls: lighthouse?.audits?.['cumulative-layout-shift']?.numericValue ?? null,
          inp_ms: lighthouse?.audits?.['interaction-to-next-paint']?.numericValue ?? null,
        }
        pagespeedScores.push({
          strategy,
          performance: categoryScore('performance'),
          seo: categoryScore('seo'),
          accessibility: categoryScore('accessibility'),
          bestPractices: categoryScore('best-practices'),
          vitals,
        })
      } catch (error) {
        pageSpeedErrors.push(`${strategy}: ${error instanceof Error ? error.message : 'falha ao consultar PageSpeed'}`)
        pagespeedScores.push({ strategy, performance: null, seo: null, accessibility: null, bestPractices: null, vitals: {} })
      }
    }
    const mobile = pagespeedScores.find((item) => item.strategy === 'mobile')
    const desktop = pagespeedScores.find((item) => item.strategy === 'desktop')
    mobileScore = mobile?.performance ?? null
    performanceScore = desktop?.performance ?? mobileScore
    seoScore = mobile?.seo ?? desktop?.seo ?? null
    accessibilityScore = mobile?.accessibility ?? null
    bestPracticesScore = mobile?.bestPractices ?? null
    Object.assign(coreWebVitals, mobile?.vitals)
  }

  return {
    website_status: responseValue.ok ? 'available' : 'http_error',
    http_status: responseValue.status,
    has_https: currentUrl.startsWith('https://'),
    redirect_count: redirects,
    performance_score: performanceScore,
    mobile_score: mobileScore,
    seo_score: seoScore,
    accessibility_score: accessibilityScore,
    best_practices_score: bestPracticesScore,
    core_web_vitals: coreWebVitals,
    ...pageSignals,
    has_ssl: currentUrl.startsWith('https://') ? responseValue.ok : false,
    analysis: { duration_ms: Date.now() - start },
    raw_data: { analyzed_url: currentUrl, pagespeed_errors: pageSpeedErrors },
    analyzed_at: new Date().toISOString(),
  }
}

function createSignals(place: Place, analysis: DigitalAnalysis | null): LeadSignal[] {
  const signals: LeadSignal[] = []
  const add = (signal: LeadSignal) => signals.push(signal)

  if (!place.websiteUri) {
    add({ signal: 'no_website', weight: 35, evidence: 'O Google Places não informou um website para esta empresa.', source: 'google_places', confidence: 0.95 })
  } else if (analysis) {
    if (!analysis.has_https) add({ signal: 'no_https', weight: 10, evidence: 'O endereço analisado usa HTTP sem HTTPS.', source: 'website_analyzer', confidence: 0.95 })
    if (analysis.performance_score !== null && analysis.performance_score < 50) {
      add({ signal: 'low_performance_score', weight: 20, evidence: `Performance PageSpeed: ${analysis.performance_score}/100.`, source: 'pagespeed', confidence: 0.95 })
    }
    if (analysis.mobile_score !== null && analysis.mobile_score < 50) {
      add({ signal: 'poor_mobile_experience', weight: 18, evidence: `Performance mobile: ${analysis.mobile_score}/100.`, source: 'pagespeed', confidence: 0.95 })
    }
    if (analysis.seo_score !== null && analysis.seo_score < 50) {
      add({ signal: 'low_seo_score', weight: 15, evidence: `Pontuação SEO: ${analysis.seo_score}/100.`, source: 'pagespeed', confidence: 0.95 })
    }
    if (!analysis.has_cta) add({ signal: 'weak_cta', weight: 10, evidence: 'Nenhum botão ou link de chamada para ação foi identificado no HTML público.', source: 'website_analyzer', confidence: 0.7 })
    if (!analysis.has_contact_form) add({ signal: 'missing_contact_form', weight: 8, evidence: 'Nenhum formulário HTML foi identificado no website público.', source: 'website_analyzer', confidence: 0.7 })
  }
  if (typeof place.rating === 'number' && place.rating >= 4.5 && (place.userRatingCount ?? 0) >= 20) {
    add({ signal: 'high_rating', weight: 12, evidence: `Avaliação ${place.rating}/5 com ${place.userRatingCount} avaliações no Google Places.`, source: 'google_places', confidence: 0.95 })
  }
  return signals
}

function opportunityFor(signals: LeadSignal[]) {
  const signalNames = new Set(signals.map((signal) => signal.signal))
  if (signalNames.has('no_website')) {
    return {
      opportunity: 'Empresa sem website',
      opportunity_reason: 'A empresa não tem website informado no Google Places.',
      recommended_service: 'Criação de website',
      sales_argument: 'A empresa tem presença no Google, mas não foi identificado um website público.',
    }
  }
  if (signalNames.has('low_performance_score') || signalNames.has('poor_mobile_experience')) {
    return {
      opportunity: 'Website com baixa performance',
      opportunity_reason: signals.filter((signal) => ['low_performance_score', 'poor_mobile_experience'].includes(signal.signal)).map((signal) => signal.evidence).join(' '),
      recommended_service: 'Otimização de performance e experiência mobile',
      sales_argument: 'A análise pública identificou oportunidades mensuráveis de melhoria na experiência digital.',
    }
  }
  if (signalNames.has('low_seo_score')) {
    return {
      opportunity: 'Website com oportunidade de SEO',
      opportunity_reason: signals.find((signal) => signal.signal === 'low_seo_score')?.evidence ?? '',
      recommended_service: 'Otimização de SEO técnico',
      sales_argument: 'A análise técnica pública identificou pontos de SEO que podem ser aprimorados.',
    }
  }
  if (signalNames.has('weak_cta')) {
    return {
      opportunity: 'Website sem chamada para ação identificada',
      opportunity_reason: signals.find((signal) => signal.signal === 'weak_cta')?.evidence ?? '',
      recommended_service: 'Otimização de conversão',
      sales_argument: 'Não foi identificada uma chamada para ação no HTML público analisado.',
    }
  }
  return {
    opportunity: 'Presença digital a avaliar',
    opportunity_reason: 'A empresa foi encontrada no Google Places; os sinais disponíveis não apontaram um problema técnico prioritário.',
    recommended_service: 'Avaliação de presença digital',
    sales_argument: 'A empresa pode ser qualificada com uma análise comercial adicional.',
  }
}

async function upsertCompany(admin: SupabaseClient, job: Job, place: Place) {
  const name = place.displayName?.text?.trim()
  if (!name) return null
  const website = place.websiteUri ? normalizeUrl(place.websiteUri) : ''
  const domain = normalizeDomain(website)
  const phone = place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? ''
  const normalizedPhone = normalizePhone(phone)
  const normalizedName = normalizeCompanyName(name)
  const address = place.formattedAddress ?? ''
  const values = {
    organization_id: job.organization_id,
    name,
    category: place.primaryTypeDisplayName?.text ?? job.segment,
    description: null,
    website: website || null,
    website_domain: domain || null,
    normalized_domain: domain || null,
    normalized_phone: normalizedPhone || null,
    normalized_name: normalizedName,
    phone: phone || null,
    address: address || null,
    city: job.location,
    country: 'BR',
    rating: place.rating ?? null,
    review_count: place.userRatingCount ?? 0,
    source: 'google_places',
    source_reference: { place_id: place.id ?? null },
    google_place_id: place.id ?? null,
    google_maps_url: place.googleMapsUri ?? null,
    website_status: website ? 'pending' : 'missing',
    data_quality_score: [name, address, phone, website, place.rating].filter(Boolean).length * 20,
  }
  let existing: Record<string, unknown> | null = null
  const lookup = async (column: string, value: string) => {
    if (existing || !value) return
    const { data, error } = await admin.from('companies').select('*').eq('organization_id', job.organization_id).eq(column, value).limit(1).maybeSingle()
    if (error) throw new Error(`Company lookup failed: ${error.message}`)
    existing = data
  }
  await lookup('google_place_id', place.id ?? '')
  await lookup('normalized_domain', domain)
  await lookup('normalized_phone', normalizedPhone)
  if (!existing && normalizedName && address) {
    const { data, error } = await admin
      .from('companies')
      .select('*')
      .eq('organization_id', job.organization_id)
      .eq('normalized_name', normalizedName)
      .eq('address', address)
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`Company name/address lookup failed: ${error.message}`)
    existing = data
  }
  if (!existing && normalizedName && job.location) {
    const normalizedCity = normalizeAddress(job.location)
    const { data, error } = await admin
      .from('companies')
      .select('*')
      .eq('organization_id', job.organization_id)
      .eq('normalized_name', normalizedName)
      .eq('city', job.location)
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`Company name/location lookup failed: ${error.message}`)
    if (data && normalizeAddress(String(data.city ?? '')) === normalizedCity) existing = data
  }

  if (existing) {
    const current = existing as Record<string, unknown>
    const updates = Object.fromEntries(
      Object.entries(values).filter(([key, value]) =>
        !['organization_id', 'google_place_id', 'source_reference'].includes(key) &&
        (current[key] === null || current[key] === undefined || current[key] === '') &&
        value !== null && value !== '',
      ),
    )
    const next = {
      ...updates,
      google_place_id: current.google_place_id ?? place.id ?? null,
      source_reference: { ...(current.source_reference as Record<string, unknown> ?? {}), google_place_id: place.id ?? null },
    }
    const { data, error } = await admin.from('companies').update(next).eq('id', current.id).select('id').single()
    if (error) throw new Error(`Company update failed: ${error.message}`)
    return data.id as string
  }

  const { data, error } = await admin.from('companies').insert(values).select('id').single()
  if (error) throw new Error(`Company insert failed: ${error.message}`)
  return data.id as string
}

async function saveLead(
  admin: SupabaseClient,
  job: Job,
  place: Place,
  companyId: string,
  analysis: DigitalAnalysis | null,
) {
  const signals = createSignals(place, analysis)
  const technical = calculateTechnicalScore({
    hasWebsite: Boolean(place.websiteUri),
    hasHttps: analysis?.has_https ?? null,
    performanceScore: analysis?.performance_score ?? null,
    seoScore: analysis?.seo_score ?? null,
    mobileScore: analysis?.mobile_score ?? null,
    hasCta: analysis?.has_cta ?? null,
    hasContactForm: analysis?.has_contact_form ?? null,
  })
  const icpMatch = calculateICPMatch({
    segmentMatched: true,
    locationMatched: true,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
  })
  const scores = calculateLeadScore({ technicalScore: technical.score, icpMatch, signals })
  const opportunity = opportunityFor(signals)
  const leadValues = {
    organization_id: job.organization_id,
    company_id: companyId,
    company_name: place.displayName?.text ?? 'Empresa sem nome',
    city: job.location,
    segment: place.primaryTypeDisplayName?.text ?? job.segment,
    score: scores.score,
    technical_score: technical.score,
    ai_score: 0,
    action_score: 0,
    icp_match: icpMatch,
    classification: scores.classification,
    status: 'new',
    opportunity: opportunity.opportunity,
    opportunity_reason: opportunity.opportunity_reason || technical.reasons.join(' '),
    ai_summary: 'Pontuação determinística, sem geração por inteligência artificial.',
    recommended_service: opportunity.recommended_service,
    sales_argument: opportunity.sales_argument,
    confidence: 85,
  }
  const { data: existingLead, error: leadLookupError } = await admin
    .from('leads')
    .select('id')
    .eq('organization_id', job.organization_id)
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle()
  if (leadLookupError) throw new Error(`Lead lookup failed: ${leadLookupError.message}`)
  let leadId = existingLead?.id as string | undefined
  if (leadId) {
    const { error } = await admin.from('leads').update(leadValues).eq('id', leadId)
    if (error) throw new Error(`Lead update failed: ${error.message}`)
  } else {
    const { data, error } = await admin.from('leads').insert(leadValues).select('id').single()
    if (error) throw new Error(`Lead insert failed: ${error.message}`)
    leadId = data.id as string
  }
  const signalRows = signals.map((signal) => ({
    organization_id: job.organization_id,
    lead_id: leadId,
    signal: signal.signal,
    weight: signal.weight,
    evidence: signal.evidence,
    source: signal.source,
    confidence: signal.confidence,
  }))
  if (signalRows.length) {
    const { error } = await admin.from('lead_signals').upsert(signalRows, { onConflict: 'organization_id,lead_id,signal,source' })
    if (error) throw new Error(`Signal persistence failed: ${error.message}`)
  }
  return { classification: scores.classification, leadId }
}

async function updateClaimedJob(admin: SupabaseClient, jobId: string, workerId: string, values: Record<string, unknown>) {
  const { data, error } = await admin
    .from('prospecting_jobs')
    .update(values)
    .eq('id', jobId)
    .eq('worker_id', workerId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Não foi possível atualizar o job: ${error.message}`)
  if (!data) throw new Error('O lease do worker expirou antes da atualização do job.')
}

async function enqueueNextWorker(
  jobId: string,
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
) {
  const result = await fetch(`${supabaseUrl}/functions/v1/prospecting-search`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'continue', jobId }),
    signal: AbortSignal.timeout(10000),
  })
  if (!result.ok) throw new Error(`A continuação do worker retornou HTTP ${result.status}.`)
}

async function updateJobCounts(admin: SupabaseClient, job: Job, workerId: string, progressBase: number) {
  const { data, error } = await admin
    .from('prospecting_job_companies')
    .select('status, error_message, result_classification')
    .eq('prospecting_job_id', job.id)
  if (error) throw new Error(`Não foi possível consolidar os resultados: ${error.message}`)

  const companies = data ?? []
  const completed = companies.filter((company) => company.status === 'completed')
  const failed = companies.filter((company) => company.status === 'failed')
  const processed = completed.length + failed.length
  const errorCount = companies.filter((company) => company.status === 'failed' || company.error_message).length
  await updateClaimedJob(admin, job.id, workerId, {
    companies_analyzed: completed.length,
    hot_leads: completed.filter((company) => company.result_classification === 'hot').length,
    warm_leads: completed.filter((company) => company.result_classification === 'warm').length,
    cold_leads: completed.filter((company) => company.result_classification === 'cold').length,
    error_count: errorCount,
    progress_percentage: Math.min(95, progressBase + Math.round(processed / Math.max(job.companies_unique, 1) * 70)),
  })
  return { completed: completed.length, errorCount, processed }
}

async function finalizeJob(admin: SupabaseClient, job: Job, workerId: string) {
  const { data, error } = await admin
    .from('prospecting_job_companies')
    .select('status, error_message, result_classification')
    .eq('prospecting_job_id', job.id)
  if (error) throw new Error(`Não foi possível finalizar o job: ${error.message}`)
  const companies = data ?? []
  const completed = companies.filter((company) => company.status === 'completed')
  const errorCount = companies.filter((company) => company.status === 'failed' || company.error_message).length
  await updateClaimedJob(admin, job.id, workerId, {
    status: 'completed',
    current_step: 'completed',
    progress_percentage: 100,
    companies_analyzed: completed.length,
    hot_leads: completed.filter((company) => company.result_classification === 'hot').length,
    warm_leads: completed.filter((company) => company.result_classification === 'warm').length,
    cold_leads: completed.filter((company) => company.result_classification === 'cold').length,
    error_count: errorCount,
    error_message: errorCount ? `${errorCount} registro(s) apresentaram falhas parciais.` : null,
    completed_at: new Date().toISOString(),
  })
  log('prospecting_completed', {
    job_id: job.id,
    organization_id: job.organization_id,
    companies_analyzed: completed.length,
    error_count: errorCount,
  })
}

async function advanceJobOneStep(
  admin: SupabaseClient,
  job: Job,
  workerId: string,
  googleApiKey: string,
  pageSpeedKey: string | undefined,
) {
  if (await isCancelled(admin, job.id)) return false

  const queries = [job.segment, ...(job.keywords ?? [])].map((term) => `${term} ${job.location}`)
  const queryIndex = job.search_query_index ?? 0
  if (job.current_step === 'searching' && queryIndex < queries.length && job.companies_found < job.target_quantity) {
    const found = await searchPlaces(
      queries[queryIndex],
      googleApiKey,
      job.target_quantity - job.companies_found,
      job,
      admin,
    )
    if (await isCancelled(admin, job.id)) return false

    const candidateRows = found.map((place) => ({
      prospecting_job_id: job.id,
      external_id: place.id ?? crypto.randomUUID(),
      place_data: place,
      status: 'discovered',
    }))
    if (candidateRows.length) {
      const { error } = await admin
        .from('prospecting_job_companies')
        .upsert(candidateRows, { onConflict: 'prospecting_job_id,external_id' })
      if (error) throw new Error(`Não foi possível persistir empresas encontradas: ${error.message}`)
    }

    const { data: allCandidates, error: countError } = await admin
      .from('prospecting_job_companies')
      .select('id')
      .eq('prospecting_job_id', job.id)
      .not('place_data', 'is', null)
    if (countError) throw new Error(`Não foi possível contar empresas encontradas: ${countError.message}`)
    const companiesFound = allCandidates?.length ?? 0
    await updateClaimedJob(admin, job.id, workerId, {
      search_query_index: queryIndex + 1,
      companies_found: companiesFound,
      progress_percentage: Math.min(20, 5 + Math.round(companiesFound / job.target_quantity * 15)),
    })
    return true
  }

  if (job.current_step === 'searching' || job.current_step === 'deduplicating') {
    const { data, error } = await admin
      .from('prospecting_job_companies')
      .select('id, external_id, company_id, status, error_message, place_data, result_classification')
      .eq('prospecting_job_id', job.id)
      .not('place_data', 'is', null)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`Não foi possível carregar empresas descobertas: ${error.message}`)

    const candidates = (data ?? []) as JobCompany[]
    const withPlaces = candidates.filter((candidate): candidate is JobCompany & { place_data: Place } => Boolean(candidate.place_data))
    const uniqueCompanies = deduplicateCompanies(withPlaces.map((candidate) => ({
      placeId: candidate.place_data.id,
      name: candidate.place_data.displayName?.text ?? '',
      address: candidate.place_data.formattedAddress,
      phone: candidate.place_data.internationalPhoneNumber ?? candidate.place_data.nationalPhoneNumber,
      website: candidate.place_data.websiteUri,
      city: job.location,
      candidateId: candidate.id,
    })))
    const uniqueIds = new Set(uniqueCompanies.map((company) => company.candidateId))
    const duplicateIds = candidates.filter((candidate) => !uniqueIds.has(candidate.id)).map((candidate) => candidate.id)

    if (duplicateIds.length) {
      const { error: duplicateError } = await admin
        .from('prospecting_job_companies')
        .update({ status: 'deduplicated' })
        .in('id', duplicateIds)
      if (duplicateError) throw new Error(`Não foi possível marcar duplicatas: ${duplicateError.message}`)
    }

    const missingPlaceDataIds = candidates.filter((candidate) => !candidate.place_data).map((candidate) => candidate.id)
    if (missingPlaceDataIds.length) {
      const { error: missingDataError } = await admin
        .from('prospecting_job_companies')
        .update({ status: 'failed', error_message: 'Dados da empresa ausentes para retomada.' })
        .in('id', missingPlaceDataIds)
      if (missingDataError) throw new Error(`Não foi possível registrar empresas incompletas: ${missingDataError.message}`)
    }

    await updateClaimedJob(admin, job.id, workerId, {
      current_step: 'analyzing',
      companies_unique: uniqueCompanies.length,
      progress_percentage: uniqueCompanies.length ? 25 : 95,
    })
    return true
  }

  const { data: candidateData, error: candidateError } = await admin
    .from('prospecting_job_companies')
    .select('id, external_id, company_id, status, error_message, place_data, result_classification')
    .eq('prospecting_job_id', job.id)
    .in('status', ['discovered', 'analyzing'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (candidateError) throw new Error(`Não foi possível selecionar a próxima empresa: ${candidateError.message}`)
  if (!candidateData) {
    await finalizeJob(admin, job, workerId)
    return false
  }

  const candidate = candidateData as JobCompany
  const place = candidate.place_data
  if (!place) {
    const { error } = await admin
      .from('prospecting_job_companies')
      .update({ status: 'failed', error_message: 'Dados da empresa ausentes para retomada.' })
      .eq('id', candidate.id)
    if (error) throw new Error(`Não foi possível registrar a empresa incompleta: ${error.message}`)
    await updateJobCounts(admin, job, workerId, 25)
    return true
  }

  const { data: processedRows, error: processedError } = await admin
    .from('prospecting_job_companies')
    .select('status')
    .eq('prospecting_job_id', job.id)
    .in('status', ['completed', 'failed'])
  if (processedError) throw new Error(`Não foi possível calcular o progresso: ${processedError.message}`)
  const processedBefore = processedRows?.length ?? 0
  await updateClaimedJob(admin, job.id, workerId, {
    current_step: place.websiteUri ? 'analyzing' : 'scoring',
    progress_percentage: Math.min(95, 25 + Math.round((processedBefore + 1) / Math.max(job.companies_unique, 1) * 70)),
  })
  const { error: markAnalyzingError } = await admin
    .from('prospecting_job_companies')
    .update({ status: 'analyzing' })
    .eq('id', candidate.id)
  if (markAnalyzingError) throw new Error(`Não foi possível iniciar a análise da empresa: ${markAnalyzingError.message}`)

  const partialErrors: string[] = []
  try {
    const companyId = await upsertCompany(admin, job, place)
    if (!companyId) throw new Error('Registro do Google Places sem nome de empresa.')
    const { error: companyLinkError } = await admin
      .from('prospecting_job_companies')
      .update({ company_id: companyId })
      .eq('id', candidate.id)
    if (companyLinkError) throw new Error(`Não foi possível associar a empresa ao job: ${companyLinkError.message}`)

    let analysis: DigitalAnalysis | null = null
    if (place.websiteUri) {
      try {
        analysis = await analyzePublicWebsite(place.websiteUri, pageSpeedKey)
        await recordApiUsage(admin, job, 'website_analyzer', 'public_html_analysis')
        if (pageSpeedKey) await recordApiUsage(admin, job, 'pagespeed', 'mobile_and_desktop', 2)
        const pageSpeedErrors = analysis.raw_data.pagespeed_errors
        if (Array.isArray(pageSpeedErrors) && pageSpeedErrors.length) {
          partialErrors.push(`PageSpeed indisponível (${pageSpeedErrors.length} estratégia(s)).`)
        }
        const { contact_email: contactEmail, ...analysisRecord } = analysis
        const { error } = await admin.from('digital_analyses').upsert({
          organization_id: job.organization_id,
          company_id: companyId,
          website_url: place.websiteUri,
          ...analysisRecord,
        }, { onConflict: 'organization_id,company_id,website_url' })
        if (error) throw new Error(`Digital analysis write failed: ${error.message}`)
        const { error: websiteUpdateError } = await admin.from('companies').update({
          website_status: analysis.website_status,
          website_last_checked_at: analysis.analyzed_at,
          ...(contactEmail ? { email: contactEmail } : {}),
        }).eq('id', companyId)
        if (websiteUpdateError) throw new Error(`Company website update failed: ${websiteUpdateError.message}`)
      } catch (error) {
        partialErrors.push(error instanceof Error ? error.message : 'Falha ao analisar website.')
      }
    }

    if (await isCancelled(admin, job.id)) return false
    const saved = await saveLead(admin, job, place, companyId, analysis)
    const { error: completedError } = await admin
      .from('prospecting_job_companies')
      .update({
        status: 'completed',
        result_classification: saved.classification,
        error_message: partialErrors.length ? partialErrors.join(' ').slice(0, 500) : null,
      })
      .eq('id', candidate.id)
    if (completedError) throw new Error(`Job company completion update failed: ${completedError.message}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    const { error: failureError } = await admin
      .from('prospecting_job_companies')
      .update({ status: 'failed', error_message: message.slice(0, 500) })
      .eq('id', candidate.id)
    if (failureError) {
      throw new Error(`Falha ao registrar erro da empresa: ${failureError.message}`, { cause: error })
    }
  }

  await updateJobCounts(admin, job, workerId, 25)
  return true
}

async function processJobStep(
  admin: SupabaseClient,
  jobId: string,
  googleApiKey: string,
  pageSpeedKey: string | undefined,
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
) {
  const workerId = crypto.randomUUID()
  const { data: claimed, error: claimError } = await admin.rpc('claim_prospecting_job', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lease_seconds: 180,
  })
  if (claimError) {
    log('prospecting_worker_claim_failed', { job_id: jobId, error_code: claimError.code })
    return
  }
  if (claimed !== true) return

  let shouldContinue = false
  try {
    const { data: jobData, error } = await admin.from('prospecting_jobs').select('*').eq('id', jobId).single()
    if (error) throw new Error(`Não foi possível carregar o job para processamento: ${error.message}`)
    const job = jobData as Job
    if (job.status === 'cancelled') return
    shouldContinue = await advanceJobOneStep(admin, job, workerId, googleApiKey, pageSpeedKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao processar a prospecção.'
    const { error: updateError } = await admin
      .from('prospecting_jobs')
      .update({
        status: 'failed',
        current_step: 'failed',
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('worker_id', workerId)
    if (updateError) log('prospecting_worker_failure_update_failed', { job_id: jobId, error_code: updateError.code })
    log('prospecting_failed', { job_id: jobId, error_code: 'PROCESSING_FAILED' })
  } finally {
    const { error } = await admin
      .from('prospecting_jobs')
      .update({ worker_id: null, worker_lease_until: null })
      .eq('id', jobId)
      .eq('worker_id', workerId)
    if (error) log('prospecting_worker_lease_release_failed', { job_id: jobId, error_code: error.code })
  }

  if (shouldContinue) {
    try {
      await enqueueNextWorker(jobId, supabaseUrl, anonKey, authorization)
    } catch {
      log('prospecting_worker_reschedule_failed', { job_id: jobId })
    }
  }
}

function scheduleJobStep(promise: Promise<void>) {
  if (runtime) {
    runtime.waitUntil(promise)
    return Promise.resolve()
  }
  return promise
}

deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = deno.env.get('SUPABASE_URL')
  const anonKey = deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: 'A configuração do Supabase Edge Function está incompleta.' }, 500)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return response({ error: 'Autenticação obrigatória.' }, 401)
  const admin = makeClient(supabaseUrl, serviceRoleKey)

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return response({ error: 'O corpo da requisição precisa ser JSON válido.' }, 400)
  }

  const userClient = makeClient(supabaseUrl, anonKey, authorization)
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return response({ error: 'Sessão inválida ou expirada.' }, 401)

  const cancelInput = cancelSchema.safeParse(input)
  if (cancelInput.success) {
    const { data: job, error } = await admin.from('prospecting_jobs').select('*').eq('id', cancelInput.data.jobId).maybeSingle()
    if (error || !job) return response({ error: 'Prospecção não encontrada.' }, 404)
    try {
      await verifyMembership(userClient, job.organization_id, authData.user.id)
    } catch (membershipError) {
      return response({ error: membershipError instanceof Error ? membershipError.message : 'Acesso negado.' }, 403)
    }
    if (!['queued', 'running'].includes(job.status)) return response({ error: 'Só é possível cancelar prospecções em andamento.' }, 409)
    const { error: updateError } = await admin.from('prospecting_jobs').update({
      status: 'cancelled',
      worker_id: null,
      worker_lease_until: null,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    if (updateError) return response({ error: 'Não foi possível cancelar a prospecção.' }, 500)
    log('prospecting_cancelled', { job_id: job.id, organization_id: job.organization_id, user_id: authData.user.id })
    return response({ ok: true })
  }

  const continuation = continueSchema.safeParse(input)
  if (continuation.success) {
    const { data: job, error } = await admin
      .from('prospecting_jobs')
      .select('id, organization_id, status')
      .eq('id', continuation.data.jobId)
      .maybeSingle()
    if (error || !job) return response({ error: 'Prospecção não encontrada.' }, 404)
    try {
      await verifyMembership(userClient, job.organization_id, authData.user.id)
    } catch (membershipError) {
      return response({ error: membershipError instanceof Error ? membershipError.message : 'Acesso negado.' }, 403)
    }
    if (!['queued', 'running'].includes(job.status)) return response({ ok: true, scheduled: false })

    const googleApiKey = deno.env.get('GOOGLE_PLACES_API_KEY')
    if (!googleApiKey) return response({ error: 'Google Places não está configurado.' }, 503)
    const pageSpeedKey = deno.env.get('PAGESPEED_API_KEY')
    await scheduleJobStep(processJobStep(admin, job.id, googleApiKey, pageSpeedKey, supabaseUrl, anonKey, authorization))
    return response({ ok: true, scheduled: true }, 202)
  }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return response({ error: 'Dados inválidos.', details: parsed.error.flatten().fieldErrors }, 400)
  const googleApiKey = deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!googleApiKey) {
    return response({ error: 'A prospecção real exige o secret GOOGLE_PLACES_API_KEY configurado nas Edge Functions do Supabase.' }, 503)
  }

  try {
    await verifyMembership(userClient, parsed.data.organizationId, authData.user.id)
  } catch (membershipError) {
    return response({ error: membershipError instanceof Error ? membershipError.message : 'Acesso negado.' }, 403)
  }

  try {
    const userAllowed = await consumeRateLimit(admin, 'user', authData.user.id, 10)
    const organizationAllowed = userAllowed
      ? await consumeRateLimit(admin, 'organization', parsed.data.organizationId, 30)
      : false
    if (!userAllowed || !organizationAllowed) {
      log('prospecting_rate_limited', {
        organization_id: parsed.data.organizationId,
        user_id: authData.user.id,
      })
      return response({ error: 'Limite de prospecções atingido. Tente novamente mais tarde.' }, 429)
    }
  } catch {
    log('prospecting_rate_limit_unavailable', {
      organization_id: parsed.data.organizationId,
      user_id: authData.user.id,
    })
    return response({ error: 'Não foi possível validar o limite de uso. Tente novamente mais tarde.' }, 503)
  }

  const { count, error: activeError } = await admin
    .from('prospecting_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', parsed.data.organizationId)
    .in('status', ['queued', 'running'])
  if (activeError) return response({ error: `Não foi possível verificar jobs ativos: ${activeError.message}` }, 500)
  if ((count ?? 0) >= prospectingConfig.maxActiveJobsPerOrganization) {
    return response({ error: 'Já existe uma prospecção ativa nesta organização. Aguarde sua conclusão antes de iniciar outra.' }, 409)
  }

  const { data: job, error: insertError } = await admin.from('prospecting_jobs').insert({
    organization_id: parsed.data.organizationId,
    created_by: authData.user.id,
    location: parsed.data.location,
    segment: parsed.data.segment,
    keywords: parsed.data.keywords,
    target_quantity: parsed.data.targetQuantity,
    status: 'queued',
  }).select('*').single()
  if (insertError) {
    const duplicateActiveJob = insertError.code === '23505'
    return response({
      error: duplicateActiveJob
        ? 'Já existe uma prospecção ativa nesta organização. Aguarde sua conclusão antes de iniciar outra.'
        : `Não foi possível criar o job: ${insertError.message}`,
    }, duplicateActiveJob ? 409 : 500)
  }

  const pageSpeedKey = deno.env.get('PAGESPEED_API_KEY')
  await scheduleJobStep(processJobStep(admin, job.id, googleApiKey, pageSpeedKey, supabaseUrl, anonKey, authorization))
  log('prospecting_started', { job_id: job.id, organization_id: job.organization_id, user_id: authData.user.id })
  return response({ job })
})
