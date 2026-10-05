import { supabase } from '../../lib/supabase/client'

export type PendingUser = {
  id: string
  email: string
  full_name: string | null
  created_at: string
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Configure o Supabase para revisar cadastros.')
  }
  return supabase
}

export async function getPendingUsers(): Promise<PendingUser[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('access_status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Não foi possível carregar os cadastros pendentes: ${error.message}`)
  }

  return data
}

export async function decideUserApproval(userId: string, status: 'approved' | 'rejected') {
  const client = requireSupabase()
  const { error } = await client.rpc('decide_user_access', {
    p_user_id: userId,
    p_access_status: status,
  })

  if (error) {
    throw new Error(`Não foi possível atualizar o cadastro: ${error.message}`)
  }
}
