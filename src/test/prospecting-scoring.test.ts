import { describe, expect, it } from 'vitest'

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
} from '../services/prospecting/scoring'
import {
  createProspectingJob,
  getDashboardStats,
  getProspectingJob,
  getProspectingOrganizations,
  getProspectingResults,
} from '../services/prospecting/prospectingService'

describe('prospecting normalization and deduplication', () => {
  it('normalizes company names, addresses, phone numbers, domains, and URLs', () => {
    expect(normalizeCompanyName('CLÍNICA SORRISO Ltda.')).toBe('clinica sorriso')
    expect(normalizeAddress('Av. Paulista, São Paulo')).toBe('av paulista sao paulo')
    expect(normalizePhone('+55 (11) 3333-4444')).toBe('1133334444')
    expect(normalizeDomain('https://www.Exemplo.com.br/contato')).toBe('exemplo.com.br')
    expect(normalizeUrl('http://www.Exemplo.com.br/#contato')).toBe('http://exemplo.com.br')
    expect(normalizeUrl('javascript:alert(1)')).toBe('')
  })

  it('deduplicates by place ID, domain, phone, and name plus address', () => {
    const places = deduplicateCompanies([
      { placeId: 'places/1', name: 'Clínica Sorriso', city: 'São Paulo' },
      { placeId: 'places/1', name: 'Clinica Sorriso Ltda', city: 'São Paulo' },
      { name: 'Empresa A', website: 'https://www.empresa-a.com', city: 'Campinas' },
      { name: 'Empresa A', website: 'http://empresa-a.com/', city: 'Campinas' },
      { name: 'Empresa B', phone: '+55 11 99999-1111', city: 'São Paulo' },
      { name: 'Empresa B', phone: '(11) 99999-1111', city: 'São Paulo' },
      { name: 'Clínica X', address: 'Rua A, 10', city: 'Santos' },
      { name: 'Clinica X Ltda', address: 'Rua A 10', city: 'Santos' },
    ])

    expect(places).toHaveLength(4)
  })

  it('keeps same-name companies when no location is available to distinguish them', () => {
    const companies = deduplicateCompanies([
      { name: 'Mercado Central' },
      { name: 'Mercado Central' },
      { name: 'Mercado Central', city: 'Recife' },
      { name: 'Mercado Central', city: 'Recife' },
    ])

    expect(companies).toHaveLength(3)
  })
})

describe('prospecting scores', () => {
  it('requires a rating of at least 4.0 and between 20 and 350 reviews', () => {
    expect(meetsProspectingQualityCriteria({ rating: 4, reviewCount: 20 })).toBe(true)
    expect(meetsProspectingQualityCriteria({ rating: 5, reviewCount: 350 })).toBe(true)
    expect(meetsProspectingQualityCriteria({ rating: 3.9, reviewCount: 100 })).toBe(false)
    expect(meetsProspectingQualityCriteria({ rating: 4.5, reviewCount: 19 })).toBe(false)
    expect(meetsProspectingQualityCriteria({ rating: 4.5, reviewCount: 351 })).toBe(false)
    expect(meetsProspectingQualityCriteria({ rating: null, reviewCount: 100 })).toBe(false)
    expect(meetsProspectingQualityCriteria({ rating: 4.5, reviewCount: null })).toBe(false)
  })

  it('scores a missing website as a strong technical opportunity', () => {
    const result = calculateTechnicalScore({
      hasWebsite: false,
      hasHttps: null,
      performanceScore: null,
      seoScore: null,
      mobileScore: null,
      hasCta: null,
      hasContactForm: null,
    })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reasons).toContain('Empresa sem website identificado')
  })

  it('uses only available fit evidence and produces a bounded lead score', () => {
    const icpMatch = calculateICPMatch({
      segmentMatched: true,
      locationMatched: true,
      rating: 4.7,
      reviewCount: 90,
    })
    const lead = calculateLeadScore({
      technicalScore: 90,
      icpMatch,
      signals: [{ signal: 'no_website', weight: 30, evidence: 'Sem website', source: 'google_places', confidence: 1 }],
    })
    expect(icpMatch).toBe(100)
    expect(lead.score).toBe(81)
    expect(lead.classification).toBe('hot')
  })

  it('classifies scores from 40 as warm while keeping hot at 80', () => {
    const scoreLead = (technicalScore: number, icpMatch: number) => calculateLeadScore({
      technicalScore,
      icpMatch,
      signals: [],
    })

    expect(scoreLead(78, 0).classification).toBe('cold')
    expect(scoreLead(80, 0).classification).toBe('warm')
    expect(scoreLead(100, 97).classification).toBe('warm')
    expect(scoreLead(100, 100).classification).toBe('hot')
  })
})

describe('prospecting development flow', () => {
  it('creates a clearly labeled local demo job and returns its demo leads', async () => {
    localStorage.clear()
    const organizations = await getProspectingOrganizations()
    const job = await createProspectingJob({
      organizationId: organizations[0].id,
      segment: 'clínicas odontológicas',
      location: 'São Paulo, SP',
      keywords: ['implante dentário'],
      targetQuantity: 10,
    })

    expect(job.status).toBe('completed')
    expect(job.companies_unique).toBe(3)
    expect(await getProspectingJob(job.id)).toEqual(job)
    const results = await getProspectingResults(job)
    expect(results).toHaveLength(3)
    expect(results.every((lead) => lead.company_name.startsWith('Empresa de demonstração'))).toBe(true)
    expect(results.every((lead) => lead.opportunity_reason.includes('fictício'))).toBe(true)
    const stats = await getDashboardStats()
    expect(stats.leadsFound).toBe(3)
    expect(stats.companiesAnalyzed).toBe(3)
    expect(stats.prospectingJobs).toBe(1)
  })
})
