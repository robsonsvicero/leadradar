import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type { Company } from '../../types'

const STORAGE_KEY = 'lead-radar-demo-companies'

const emptyCompanies: Company[] = []

export async function getCompanies() {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('companies').select('*').limit(20)
    if (error) {
      throw new Error(`Não foi possível carregar as empresas: ${error.message}`)
    }
    return (data ?? []) as Company[]
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return emptyCompanies
  }

  return JSON.parse(raw) as Company[]
}

export async function getCompanyById(id: string) {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`Não foi possível carregar a empresa: ${error.message}`)
    return data as Company | null
  }
  const companies = await getCompanies()
  return companies.find((company) => company.id === id) ?? null
}

export async function createCompany(input: Partial<Company>) {
  if (supabase) {
    const { data, error } = await supabase.from('companies').insert(input).select().single()
    if (error) {
      throw new Error(error.message)
    }
    return data as Company
  }

  const existing = (await getCompanies()) as Company[]
  const next = {
    id: input.id ?? crypto.randomUUID(),
    organization_id: input.organization_id ?? 'demo-org',
    name: input.name ?? 'Nova empresa',
    category: input.category ?? 'Digital',
    description: input.description ?? 'Empresa adicionada ao radar.',
    website: input.website ?? '',
    city: input.city ?? 'São Paulo',
    state: input.state ?? 'SP',
    country: input.country ?? 'Brasil',
    rating: input.rating ?? null,
    review_count: input.review_count ?? 0,
    source: input.source ?? 'Manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...input,
  } as Company

  const nextCompanies = [...existing, next]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCompanies))
  return next
}
