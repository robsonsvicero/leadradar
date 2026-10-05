import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3'

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(240),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  whatsapp: z.string().trim().min(8).max(32).regex(/^[+()\d\s.-]+$/),
})

const deno = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Response | Promise<Response>): void
  }
}).Deno

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
    },
  })
}

function slugFromName(name: string) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 45)
  return `${base || 'organizacao'}-${crypto.randomUUID().slice(0, 8)}`
}

deno.serve(async (request) => {
  const supabaseUrl = deno.env.get('SUPABASE_URL')
  const anonKey = deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appBaseUrl = deno.env.get('APP_BASE_URL')?.replace(/\/+$/, '')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appBaseUrl) {
    return jsonResponse({ error: 'A configuração da função administrativa está incompleta.' }, 500, '*')
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
  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405, responseOrigin)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401, responseOrigin)

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
    console.error(JSON.stringify({ event: 'organization_admin_check_failed', code: profileError.code }))
    return jsonResponse({ error: 'Não foi possível verificar sua permissão administrativa.' }, 500, responseOrigin)
  }
  if (!profile || profile.is_platform_admin !== true || profile.access_status !== 'approved') {
    return jsonResponse({ error: 'Somente o administrador da plataforma pode gerenciar organizações.' }, 403, responseOrigin)
  }

  if (request.method === 'GET') {
    const { data, error } = await admin.from('organizations')
      .select('id, name, address, email, whatsapp, created_at, admin_invite_sent_at')
      .order('created_at', { ascending: false })
    if (error) {
      console.error(JSON.stringify({ event: 'organization_list_failed', code: error.code }))
      return jsonResponse({ error: 'Não foi possível carregar as organizações.' }, 500, responseOrigin)
    }
    return jsonResponse({ organizations: data ?? [] }, 200, responseOrigin)
  }

  let rawInput: unknown
  try {
    rawInput = await request.json()
  } catch {
    return jsonResponse({ error: 'O corpo da requisição precisa ser JSON válido.' }, 400, responseOrigin)
  }
  const parsed = organizationSchema.safeParse(rawInput)
  if (!parsed.success) {
    return jsonResponse({ error: 'Confira os campos: nome, endereço, e-mail e WhatsApp precisam ser válidos.' }, 400, responseOrigin)
  }

  const organizationInput = parsed.data
  const { data: organization, error: organizationError } = await admin.from('organizations')
    .insert({
      ...organizationInput,
      slug: slugFromName(organizationInput.name),
    })
    .select('id, name, address, email, whatsapp, created_at, admin_invite_sent_at')
    .single()
  if (organizationError || !organization) {
    console.error(JSON.stringify({ event: 'organization_create_failed', code: organizationError?.code ?? 'empty_result' }))
    return jsonResponse({ error: 'Não foi possível cadastrar a organização.' }, 500, responseOrigin)
  }

  let invitedUserId: string | null = null
  try {
    const redirectTo = new URL('/set-password', appBaseUrl).toString()
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(
      organizationInput.email,
      {
        redirectTo,
        data: { full_name: organizationInput.email.split('@')[0] },
      },
    )
    if (invitationError) throw new Error(`Convite de autenticação falhou: ${invitationError.message}`)
    invitedUserId = invitation.user?.id ?? null
    if (!invitedUserId) throw new Error('O serviço de autenticação não retornou o usuário convidado.')

    const { error: membershipError } = await admin.from('organization_members').upsert({
      organization_id: organization.id,
      user_id: invitedUserId,
      role: 'owner',
    }, { onConflict: 'organization_id,user_id' })
    if (membershipError) throw new Error(`Vínculo do administrador falhou: ${membershipError.message}`)

    const { error: profileUpdateError } = await admin.from('profiles').upsert({
      id: invitedUserId,
      email: organizationInput.email,
      full_name: organizationInput.email.split('@')[0],
      access_status: 'approved',
      is_platform_admin: false,
    }, { onConflict: 'id' })
    if (profileUpdateError) throw new Error(`Ativação do perfil falhou: ${profileUpdateError.message}`)

    const invitedAt = new Date().toISOString()
    const { data: completedOrganization, error: organizationUpdateError } = await admin.from('organizations')
      .update({ admin_user_id: invitedUserId, admin_invite_sent_at: invitedAt })
      .eq('id', organization.id)
      .select('id, name, address, email, whatsapp, created_at, admin_invite_sent_at')
      .single()
    if (organizationUpdateError || !completedOrganization) {
      throw new Error(`Atualização do administrador da organização falhou: ${organizationUpdateError?.message ?? 'sem resultado'}`)
    }

    return jsonResponse({ organization: completedOrganization }, 201, responseOrigin)
  } catch (error) {
    const cleanupErrors: string[] = []
    if (invitedUserId) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(invitedUserId)
      if (deleteUserError) cleanupErrors.push(`auth:${deleteUserError.code ?? 'unknown'}`)
    }
    const { error: deleteOrganizationError } = await admin.from('organizations').delete().eq('id', organization.id)
    if (deleteOrganizationError) cleanupErrors.push(`organization:${deleteOrganizationError.code ?? 'unknown'}`)

    console.error(JSON.stringify({
      event: 'organization_invitation_failed',
      organization_id: organization.id,
      invited_user_created: Boolean(invitedUserId),
      cleanup_errors: cleanupErrors,
      error: error instanceof Error ? error.message : 'unknown',
    }))
    return jsonResponse({
      error: cleanupErrors.length
        ? 'O convite falhou e não foi possível limpar todos os registros automaticamente. Contate o administrador da plataforma.'
        : 'Não foi possível concluir o convite. Confira se o e-mail já possui uma conta e se o serviço de e-mail do Supabase está configurado.',
    }, 500, responseOrigin)
  }
})
