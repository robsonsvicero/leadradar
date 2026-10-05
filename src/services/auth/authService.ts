import { supabase } from '../../lib/supabase/client'
import { appEnv } from '../../config/env'
import type { AppUser } from '../../types'

const DEMO_STORAGE_KEY = 'lead-radar-demo-session'
const DEMO_ACCOUNT_EMAIL = 'demo@lead-radar.dev'
const DEMO_ACCOUNT_PASSWORD = '123456'

export type SessionResponse = {
  user: AppUser | null
  access_token: string | null
}

async function getAuthenticatedUser(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): Promise<AppUser> {
  if (!supabase) {
    throw new Error('Autenticação Supabase não configurada.')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('access_status, is_platform_admin')
    .eq('id', user.id)
    .single()

  if (error) {
    throw new Error(`Não foi possível verificar a aprovação da conta: ${error.message}`)
  }

  return {
    id: user.id,
    email: user.email ?? '',
    full_name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
    avatar_url: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
    accessStatus: profile.access_status,
    isPlatformAdmin: profile.is_platform_admin,
  }
}

function isDemoAccountCredentials(email: string, password: string) {
  return appEnv.demoAuthEnabled &&
    (!supabase || appEnv.prospectingMockMode) &&
    email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL &&
    password === DEMO_ACCOUNT_PASSWORD
}

function requireSupabaseForRealAuth() {
  if (!supabase) {
    throw new Error('Autenticação Supabase não configurada. Configure o ambiente antes de entrar.')
  }
}

export const authService = {
  async signIn(email: string, password: string): Promise<SessionResponse> {
    if (isDemoAccountCredentials(email, password)) {
      const user: AppUser = {
        id: 'demo-user',
        email: DEMO_ACCOUNT_EMAIL,
        full_name: 'Usuário demo',
        avatar_url: null,
        accessStatus: 'approved',
        isPlatformAdmin: false,
      }

      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user))

      return { user, access_token: 'demo-access-token' }
    }

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        throw new Error(error.message)
      }

      return {
        user: data.user ? await getAuthenticatedUser(data.user) : null,
        access_token: data.session?.access_token ?? null,
      }
    }

    requireSupabaseForRealAuth()
    throw new Error('Use a conta de demonstração local ou configure o Supabase para entrar.')
  },

  async signUp(email: string, password: string, fullName?: string): Promise<SessionResponse> {
    if (isDemoAccountCredentials(email, password)) {
      const user: AppUser = {
        id: 'demo-user',
        email: DEMO_ACCOUNT_EMAIL,
        full_name: fullName ?? 'Usuário demo',
        avatar_url: null,
        accessStatus: 'approved',
        isPlatformAdmin: false,
      }

      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user))

      return { user, access_token: 'demo-access-token' }
    }

    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName ?? '',
          },
        },
      })

      if (error) {
        throw new Error(error.message)
      }

      return {
        user: data.session && data.user ? await getAuthenticatedUser(data.user) : null,
        access_token: data.session?.access_token ?? null,
      }
    }

    requireSupabaseForRealAuth()
    throw new Error('Configure o Supabase para criar uma conta real.')
  },

  async resetPassword(email: string) {
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) {
        throw new Error(error.message)
      }
      return true
    }

    throw new Error('Configure o Supabase para recuperar a senha de uma conta real.')
  },

  async updatePassword(password: string): Promise<AppUser> {
    if (!supabase) throw new Error('Configure o Supabase para definir uma senha.')
    const { data, error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(`Não foi possível definir a senha: ${error.message}`)
    if (!data.user) throw new Error('Não foi possível validar o convite. Abra o link recebido por e-mail novamente.')
    return getAuthenticatedUser(data.user)
  },

  async signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw new Error(error.message)
      }
    }

    localStorage.removeItem(DEMO_STORAGE_KEY)
    return true
  },

  async getCurrentSession(): Promise<SessionResponse> {
    if (supabase) {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        throw new Error(error.message)
      }

      return {
        user: data.session?.user ? await getAuthenticatedUser(data.session.user) : null,
        access_token: data.session?.access_token ?? null,
      }
    }

    if (!appEnv.demoAuthEnabled) return { user: null, access_token: null }

    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) {
      return { user: null, access_token: null }
    }

    const storedUser = JSON.parse(raw) as AppUser
    const user: AppUser = {
      ...storedUser,
      accessStatus: storedUser.accessStatus ?? 'approved',
      isPlatformAdmin: false,
    }
    return { user, access_token: 'demo-access-token' }
  },
}
