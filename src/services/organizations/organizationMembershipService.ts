import { FunctionsHttpError } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase/client'

export type ManagedOrganizationMembership = {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

export type OrganizationMember = {
  user_id: string
  email: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

async function invokeOrganizationMembers<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Configure o Supabase para gerenciar usuários das organizações.')
  const { data, error } = await supabase.functions.invoke('organization-members', { body })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      const response = error.context.clone()
      const payload: unknown = await response.json().catch(() => null)
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        message = payload.error
      }
    }
    throw new Error(message)
  }
  return data as T
}

export async function getManageableOrganizations() {
  const result = await invokeOrganizationMembers<{ organizations: ManagedOrganizationMembership[] }>({
    action: 'list-organizations',
  })
  if (!Array.isArray(result.organizations)) throw new Error('A resposta de organizações é inválida.')
  return result.organizations
}

export async function getOrganizationMembers(organizationId: string) {
  const result = await invokeOrganizationMembers<{ members: OrganizationMember[] }>({
    action: 'list-members',
    organizationId,
  })
  if (!Array.isArray(result.members)) throw new Error('A resposta de usuários é inválida.')
  return result.members
}

export async function addOrganizationMember(input: {
  organizationId: string
  email: string
  role?: 'admin' | 'member'
  mode: 'assign' | 'invite'
}) {
  const result = await invokeOrganizationMembers<{ member: OrganizationMember & { invited: boolean } }>({
    action: input.mode === 'assign' ? 'assign-existing' : 'invite',
    organizationId: input.organizationId,
    email: input.email.trim().toLowerCase(),
    ...(input.mode === 'assign' ? { role: input.role ?? 'member' } : {}),
  })
  if (!result.member?.user_id) throw new Error('A operação terminou sem confirmar o vínculo do usuário.')
  return result.member
}
