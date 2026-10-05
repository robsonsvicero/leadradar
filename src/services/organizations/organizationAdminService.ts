import { FunctionsHttpError } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase/client'

export type ManagedOrganization = {
  id: string
  name: string
  address: string
  email: string
  whatsapp: string
  created_at: string
  admin_invite_sent_at: string | null
}

export type CreateManagedOrganizationInput = Pick<ManagedOrganization, 'name' | 'address' | 'email' | 'whatsapp'>

function requireSupabase() {
  if (!supabase) throw new Error('Configure o Supabase para gerenciar organizações.')
  return supabase
}

export async function getEdgeFunctionErrorMessage(error: Error): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context.clone()
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error
    }
  }

  return error.message
}

export async function getManagedOrganizations(): Promise<ManagedOrganization[]> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('admin-organizations', { method: 'GET' })
  if (error) {
    throw new Error(`Não foi possível carregar as organizações: ${await getEdgeFunctionErrorMessage(error)}`)
  }
  if (!Array.isArray(data?.organizations)) throw new Error('A resposta do serviço de organizações é inválida.')
  return data.organizations as ManagedOrganization[]
}

export async function createManagedOrganization(input: CreateManagedOrganizationInput): Promise<ManagedOrganization> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('admin-organizations', {
    body: {
      name: input.name.trim(),
      address: input.address.trim(),
      email: input.email.trim().toLowerCase(),
      whatsapp: input.whatsapp.trim(),
    },
  })
  if (error) {
    throw new Error(`Não foi possível cadastrar a organização: ${await getEdgeFunctionErrorMessage(error)}`)
  }
  if (!data?.organization) throw new Error('A organização foi processada, mas o serviço não confirmou o resultado.')
  return data.organization as ManagedOrganization
}
