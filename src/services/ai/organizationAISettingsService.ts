import { z } from 'zod'

import { supabase } from '../../lib/supabase/client'

const listSchema = z.array(z.string().trim().min(1).max(120)).max(30)

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable(),
  target_segments: listSchema,
  selling_points: listSchema,
})

export type AIConfigurationOrganization = {
  id: string
  name: string
  role: 'owner' | 'admin'
}

export type OrganizationICPSettings = {
  id: string
  organization_id: string
  name: string
  description: string | null
  target_segments: string[]
  target_locations: string[]
  target_company_sizes: string[]
  preferred_services: string[]
  minimum_score: number
  ideal_signals: string[]
  negative_signals: string[]
  weights: Record<string, unknown>
  active: boolean
}

export type OrganizationService = {
  id: string
  organization_id: string
  name: string
  description: string | null
  target_segments: string[]
  selling_points: string[]
  active: boolean
}

export type OrganizationAIProfile = {
  id: string
  organization_id: string
  company_name: string | null
  company_description: string | null
  target_audience: string | null
  tone: string
  style: string
  sales_method: string | null
  forbidden_phrases: string[]
  preferred_phrases: string[]
  signature: string | null
}

export type OrganizationAISettings = {
  icp: OrganizationICPSettings | null
  services: OrganizationService[]
  profile: OrganizationAIProfile | null
}

export type SaveICPInput = Omit<OrganizationICPSettings, 'id' | 'organization_id'>
export type SaveProfileInput = Omit<OrganizationAIProfile, 'id' | 'organization_id'>
export type SaveServiceInput = Omit<OrganizationService, 'id' | 'organization_id' | 'active'> & {
  id?: string
  active?: boolean
}

export type CreateOrganizationInput = {
  name: string
  slug?: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

export async function getAIConfigurationOrganizations(): Promise<AIConfigurationOrganization[]> {
  const client = requireSupabase()
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw new Error(`Não foi possível validar sua sessão: ${authError.message}`)
  if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: memberships, error: membershipError } = await client
    .from('organization_members')
    .select('organization_id,role')
    .eq('user_id', authData.user.id)
    .in('role', ['owner', 'admin'])

  if (membershipError) throw new Error(`Não foi possível carregar suas permissões: ${membershipError.message}`)
  const organizationIds = [...new Set((memberships ?? []).map((membership) => membership.organization_id))]
  if (!organizationIds.length) return []

  const { data: organizations, error: organizationsError } = await client
    .from('organizations')
    .select('id,name')
    .in('id', organizationIds)

  if (organizationsError) throw new Error(`Não foi possível carregar as organizações: ${organizationsError.message}`)
  const roleByOrganization = new Map((memberships ?? []).map((membership) => [membership.organization_id, membership.role]))
  return (organizations ?? []).map((organization) => ({
    ...organization,
    role: roleByOrganization.get(organization.id) as AIConfigurationOrganization['role'],
  }))
}

export async function createOrganization(input: CreateOrganizationInput): Promise<{ id: string; name: string; slug: string }> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_organization', {
    p_name: input.name.trim(),
    p_slug: input.slug?.trim() || null,
  })
  if (error) throw new Error(error.message)
  return data as { id: string; name: string; slug: string }
}

export async function getOrganizationAISettings(organizationId: string): Promise<OrganizationAISettings> {
  const client = requireSupabase()
  const [icpResult, servicesResult, profileResult] = await Promise.all([
    client.from('organization_icp_settings').select('*').eq('organization_id', organizationId).eq('active', true).maybeSingle(),
    client.from('organization_services').select('*').eq('organization_id', organizationId).order('name'),
    client.from('organization_ai_profile').select('*').eq('organization_id', organizationId).maybeSingle(),
  ])
  if (icpResult.error) throw new Error(`Não foi possível carregar o ICP: ${icpResult.error.message}`)
  if (servicesResult.error) throw new Error(`Não foi possível carregar os serviços: ${servicesResult.error.message}`)
  if (profileResult.error) throw new Error(`Não foi possível carregar o perfil comercial: ${profileResult.error.message}`)
  return {
    icp: icpResult.data as OrganizationICPSettings | null,
    services: (servicesResult.data ?? []) as OrganizationService[],
    profile: profileResult.data as OrganizationAIProfile | null,
  }
}

export async function saveOrganizationICP(organizationId: string, input: SaveICPInput) {
  const client = requireSupabase()
  const payload = {
    ...input,
    organization_id: organizationId,
    active: true,
  }
  const { data: existing, error: lookupError } = await client
    .from('organization_icp_settings')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .maybeSingle()
  if (lookupError) throw new Error(`Não foi possível verificar o ICP atual: ${lookupError.message}`)

  const result = existing
    ? await client.from('organization_icp_settings').update(payload).eq('id', existing.id).select('*').single()
    : await client.from('organization_icp_settings').insert(payload).select('*').single()
  if (result.error) throw new Error(`Não foi possível salvar o ICP: ${result.error.message}`)
  return result.data as OrganizationICPSettings
}

export async function saveOrganizationAIProfile(organizationId: string, input: SaveProfileInput) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('organization_ai_profile')
    .upsert({ ...input, organization_id: organizationId }, { onConflict: 'organization_id' })
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível salvar o perfil comercial: ${error.message}`)
  return data as OrganizationAIProfile
}

export async function saveOrganizationService(organizationId: string, input: SaveServiceInput) {
  const parsed = serviceSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Confira os dados do serviço.')
  const client = requireSupabase()
  const payload = { ...parsed.data, organization_id: organizationId, active: input.active ?? true }
  const result = input.id
    ? await client.from('organization_services').update(payload).eq('id', input.id).eq('organization_id', organizationId).select('*').single()
    : await client.from('organization_services').insert(payload).select('*').single()
  if (result.error) throw new Error(`Não foi possível salvar o serviço: ${result.error.message}`)
  return result.data as OrganizationService
}

export async function setOrganizationServiceActive(organizationId: string, serviceId: string, active: boolean) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('organization_services')
    .update({ active })
    .eq('id', serviceId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível atualizar o serviço: ${error.message}`)
  return data as OrganizationService
}
