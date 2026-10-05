import { supabase } from '../../lib/supabase/client'
import { getProspectingOrganizations, prospectingMockMode } from '../prospecting/prospectingService'
import type { Company } from '../../types'

const STORAGE_KEY = 'lead-radar-demo-companies'

const emptyCompanies: Company[] = []

export async function getCompanies() {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false }).limit(20)
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

export async function getCompanyOrganizations() {
  const organizations = await getProspectingOrganizations()
  return organizations.sort((first, second) => first.name.localeCompare(second.name))
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

export type CreateCompanyInput = {
  organization_id: string
  name: string
  category: string | null
  description: string | null
  email: string | null
  website: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
}

export async function createCompany(input: CreateCompanyInput) {
  if (supabase && !prospectingMockMode) {
    const { data, error } = await supabase.from('companies').insert({
      ...input,
      rating: null,
      review_count: 0,
      source: 'Manual',
    }).select().single()
    if (error) {
      throw new Error(`Não foi possível cadastrar a empresa: ${error.message}`)
    }
    return data as Company
  }

  const existing = (await getCompanies()) as Company[]
  const next = {
    ...input,
    id: crypto.randomUUID(),
    category: input.category ?? '',
    description: input.description ?? '',
    email: input.email,
    website: input.website ?? '',
    phone: input.phone,
    address: input.address,
    city: input.city ?? '',
    state: input.state ?? '',
    country: input.country ?? '',
    rating: null,
    review_count: 0,
    source: 'Manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Company

  const nextCompanies = [...existing, next]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCompanies))
  return next
}
