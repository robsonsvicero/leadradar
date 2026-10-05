import { supabase } from '../../lib/supabase/client'

function getSupabaseClient() {
  if (!supabase) throw new Error('As notificações exigem Supabase configurado.')
  return supabase
}

export type OrganizationNotification = {
  id: string
  lead_id: string
  company_name: string
  score: number
  classification: 'hot' | 'warm' | 'cold'
  read_at: string | null
  created_at: string
}

export async function getOrganizationNotifications() {
  const client = getSupabaseClient()
  const [notificationsResult, unreadResult] = await Promise.all([
    client
      .from('organization_notifications')
      .select('id, lead_id, company_name, score, classification, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    client
      .from('organization_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ])
  if (notificationsResult.error) throw new Error(`Não foi possível carregar as notificações: ${notificationsResult.error.message}`)
  if (unreadResult.error) throw new Error(`Não foi possível contar as notificações não lidas: ${unreadResult.error.message}`)

  return {
    notifications: (notificationsResult.data ?? []) as OrganizationNotification[],
    unreadCount: unreadResult.count ?? 0,
  }
}

export async function markOrganizationNotificationRead(notificationId: string) {
  const { error } = await getSupabaseClient()
    .from('organization_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)
  if (error) throw new Error(`Não foi possível marcar a notificação como lida: ${error.message}`)
}
