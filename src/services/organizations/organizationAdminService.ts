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

export async function getManagedOrganizations(): Promise<ManagedOrganization[]> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('admin-organizations', { method: 'GET' })
  if (error) throw new Error(`Não foi possível carregar as organizações: ${error.message}`)
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
  if (error) throw new Error(`Não foi possível cadastrar a organização: ${error.message}`)
  if (!data?.organization) throw new Error('A organização foi processada, mas o serviço não confirmou o resultado.')
  return data.organization as ManagedOrganization
}
