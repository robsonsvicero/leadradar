import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list-organizations') }),
  z.object({ action: z.literal('list-members'), organizationId: z.string().uuid() }),
  z.object({
    action: z.literal('assign-existing'),
    organizationId: z.string().uuid(),
    email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
    role: z.enum(['admin', 'member']).default('member'),
  }),
  z.object({
    action: z.literal('invite'),
    organizationId: z.string().uuid(),
    email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  }),
])

const deno = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Response | Promise<Response>): void
  }
}).Deno

type OrganizationRole = 'owner' | 'admin' | 'member'
type ManagedOrganization = { id: string; name: string; role: OrganizationRole }

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    },
  })
}

deno.serve(async (request) => {
  const supabaseUrl = deno.env.get('SUPABASE_URL')
  const anonKey = deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appBaseUrl = deno.env.get('APP_BASE_URL')?.replace(/\/+$/, '')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appBaseUrl) {
    return jsonResponse({ error: 'A configuração da função de usuários da organização está incompleta.' }, 500, '*')
  }

  let baseOrigin: string
  try {
    baseOrigin = new URL(appBaseUrl).origin
  } catch {
    return jsonResponse({ error: 'APP_BASE_URL precisa ser uma URL válida.' }, 500, '*')
  }
  const allowedOrigins = new Set([
    baseOrigin,
    ...(deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ])
  const requestOrigin = request.headers.get('Origin')
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return jsonResponse({ error: 'Origem não autorizada.' }, 403, baseOrigin)
  }
  const responseOrigin = requestOrigin ?? baseOrigin
  if (request.method === 'OPTIONS') return jsonResponse({ ok: true }, 200, responseOrigin)
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405, responseOrigin)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, responseOrigin)

  let rawInput: unknown
  try {
    rawInput = await request.json()
  } catch {
    return jsonResponse({ error: 'O corpo da requisição precisa ser JSON válido.' }, 400, responseOrigin)
  }
  const parsed = requestSchema.safeParse(rawInput)
  if (!parsed.success) return jsonResponse({ error: 'Confira os dados enviados.' }, 400, responseOrigin)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401, responseOrigin)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('is_platform_admin, access_status')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError) {
    console.error(JSON.stringify({ event: 'organization_members_profile_check_failed', code: profileError.code }))
    return jsonResponse({ error: 'Não foi possível verificar sua permissão.' }, 500, responseOrigin)
  }
  if (!profile || profile.access_status !== 'approved') {
    return jsonResponse({ error: 'Sua conta não tem acesso aprovado.' }, 403, responseOrigin)
  }
  const isPlatformAdmin = profile.is_platform_admin === true

  async function getManagedOrganizations(): Promise<ManagedOrganization[]> {
    if (isPlatformAdmin) {
      const { data, error } = await admin.from('organizations').select('id, name').order('name')
      if (error) throw new Error(`Não foi possível carregar as organizações: ${error.message}`)
      return (data ?? []).map((organization) => ({ ...organization, role: 'owner' }))
    }

    const { data: memberships, error: membershipError } = await admin.from('organization_members')
      .select('organization_id, role')
      .eq('user_id', authData.user.id)
      .in('role', ['owner', 'admin'])
    if (membershipError) throw new Error(`Não foi possível carregar suas permissões: ${membershipError.message}`)
    const roleByOrganization = new Map((memberships ?? []).map((membership) => [
      membership.organization_id,
      membership.role as OrganizationRole,
    ]))
    if (!roleByOrganization.size) return []

    const { data, error } = await admin.from('organizations')
      .select('id, name')
      .in('id', [...roleByOrganization.keys()])
      .order('name')
    if (error) throw new Error(`Não foi possível carregar as organizações: ${error.message}`)
    return (data ?? []).map((organization) => ({
      ...organization,
      role: roleByOrganization.get(organization.id) ?? 'member',
    }))
  }

  async function requireOrganizationManager(organizationId: string) {
    if (isPlatformAdmin) return
    const { data, error } = await admin.from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (error) throw new Error(`Não foi possível verificar seu vínculo: ${error.message}`)
    if (!data || !['owner', 'admin'].includes(data.role)) {
      throw new Error('Somente administradores desta organização podem gerenciar seus usuários.')
    }
  }

  try {
    const input = parsed.data
    if (input.action === 'list-organizations') {
      return jsonResponse({ organizations: await getManagedOrganizations() }, 200, responseOrigin)
    }

    await requireOrganizationManager(input.organizationId)

    if (input.action === 'list-members') {
      const { data: memberships, error: membershipError } = await admin.from('organization_members')
        .select('user_id, role, created_at')
        .eq('organization_id', input.organizationId)
        .order('created_at')
      if (membershipError) throw new Error(`Não foi possível listar os usuários da organização: ${membershipError.message}`)
      const userIds = [...new Set((memberships ?? []).map((membership) => membership.user_id))]
      if (!userIds.length) return jsonResponse({ members: [] }, 200, responseOrigin)

      const { data: profiles, error: profilesError } = await admin.from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
      if (profilesError) throw new Error(`Não foi possível carregar os perfis dos usuários: ${profilesError.message}`)
      const profileById = new Map((profiles ?? []).map((userProfile) => [userProfile.id, userProfile]))
      return jsonResponse({
        members: (memberships ?? []).map((membership) => ({
          user_id: membership.user_id,
          role: membership.role,
          created_at: membership.created_at,
          email: profileById.get(membership.user_id)?.email ?? '',
          full_name: profileById.get(membership.user_id)?.full_name ?? null,
        })),
      }, 200, responseOrigin)
    }

    if (input.action === 'assign-existing' && !isPlatformAdmin) {
      return jsonResponse({ error: 'Somente o administrador da plataforma pode vincular contas existentes.' }, 403, responseOrigin)
    }

    const { data: existingProfiles, error: lookupError } = await admin.from('profiles')
      .select('id, email, full_name, access_status')
      .ilike('email', input.email)
      .limit(10)
    if (lookupError) throw new Error(`Não foi possível localizar a conta pelo e-mail: ${lookupError.message}`)
    const existingProfile = (existingProfiles ?? []).find((item) => item.email.toLowerCase() === input.email)

    let userId = existingProfile?.id ?? null
    let invited = false
    if (input.action === 'assign-existing' && !existingProfile) {
      return jsonResponse({ error: 'Não foi encontrada uma conta cadastrada com esse e-mail. Peça ao administrador da organização para enviar um convite.' }, 404, responseOrigin)
    }

    if (input.action === 'invite' && !userId) {
      const redirectTo = new URL('/set-password', appBaseUrl).toString()
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
        redirectTo,
        data: { full_name: input.email.split('@')[0] },
      })
      if (inviteError) throw new Error(`Não foi possível enviar o convite: ${inviteError.message}`)
      userId = invitation.user?.id ?? null
      if (!userId) throw new Error('O serviço de autenticação não retornou o usuário convidado.')
      invited = true
    }

    if (!userId) throw new Error('Não foi possível identificar a conta para vinculá-la à organização.')
    if (existingProfile?.access_status !== 'approved' && input.action === 'assign-existing') {
      return jsonResponse({ error: 'A conta existe, mas ainda não foi aprovada para acessar o Lead Radar.' }, 409, responseOrigin)
    }

    const role: OrganizationRole = input.action === 'assign-existing' ? input.role : 'member'
    const { data: currentMembership, error: currentMembershipError } = await admin.from('organization_members')
      .select('role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (currentMembershipError) throw new Error(`Não foi possível verificar o vínculo atual: ${currentMembershipError.message}`)
    if (currentMembership && input.action === 'invite') {
      return jsonResponse({ error: 'Essa conta já está vinculada à organização.' }, 409, responseOrigin)
    }

    const { error: membershipError } = await admin.from('organization_members').upsert({
      organization_id: input.organizationId,
      user_id: userId,
      role,
    }, { onConflict: 'organization_id,user_id' })
    if (membershipError) {
      const cleanupError = invited ? (await admin.auth.admin.deleteUser(userId)).error : null
      if (cleanupError) {
        console.error(JSON.stringify({
          event: 'organization_member_invite_cleanup_failed',
          organization_id: input.organizationId,
          auth_user_id: userId,
          code: cleanupError.code,
        }))
      }
      throw new Error(cleanupError
        ? `Não foi possível vincular o usuário e a limpeza da conta convidada também falhou (${cleanupError.message}).`
        : `Não foi possível vincular o usuário à organização: ${membershipError.message}`)
    }

    if (invited) {
      const { error: profileUpdateError } = await admin.from('profiles').upsert({
        id: userId,
        email: input.email,
        full_name: input.email.split('@')[0],
        access_status: 'approved',
        is_platform_admin: false,
      }, { onConflict: 'id' })
      if (profileUpdateError) {
        const { error: unlinkError } = await admin.from('organization_members').delete()
          .eq('organization_id', input.organizationId)
          .eq('user_id', userId)
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
        const cleanupErrors = [unlinkError, deleteUserError].filter(Boolean)
        if (cleanupErrors.length) {
          console.error(JSON.stringify({
            event: 'organization_member_activation_cleanup_failed',
            organization_id: input.organizationId,
            auth_user_id: userId,
            cleanup_errors: cleanupErrors.map((error) => error.code ?? 'unknown'),
          }))
        }
        throw new Error(cleanupErrors.length
          ? `O convite foi enviado, mas não foi possível ativar o usuário nem limpar todos os registros. Verifique os logs da função.`
          : `Não foi possível concluir a ativação do usuário convidado: ${profileUpdateError.message}`)
      }
    } else if (input.action === 'invite' && existingProfile?.access_status !== 'approved') {
      const { error: profileUpdateError } = await admin.from('profiles')
        .update({ access_status: 'approved' })
        .eq('id', userId)
      if (profileUpdateError) {
        const { error: unlinkError } = await admin.from('organization_members').delete()
          .eq('organization_id', input.organizationId)
          .eq('user_id', userId)
        if (unlinkError) {
          console.error(JSON.stringify({
            event: 'organization_member_approval_cleanup_failed',
            organization_id: input.organizationId,
            auth_user_id: userId,
            code: unlinkError.code,
          }))
          throw new Error('Não foi possível aprovar o usuário nem remover o vínculo. Verifique os logs da função.')
        }
        throw new Error(`Não foi possível aprovar o acesso do usuário convidado: ${profileUpdateError.message}`)
      }
    }

    return jsonResponse({
      member: {
        user_id: userId,
        email: existingProfile?.email ?? input.email,
        role,
        invited,
      },
    }, invited ? 201 : 200, responseOrigin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao gerenciar usuários da organização.'
    const status = message.startsWith('Somente administradores') ? 403 : 500
    console.error(JSON.stringify({ event: 'organization_members_operation_failed', action: parsed.data.action, error: message }))
    return jsonResponse({ error: message }, status, responseOrigin)
  }
})
