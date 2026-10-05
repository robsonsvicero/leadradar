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
      const user = {
        id: 'demo-user',
        email: DEMO_ACCOUNT_EMAIL,
        full_name: 'Usuário demo',
        avatar_url: null,
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
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email ?? '',
              full_name: data.user.user_metadata?.full_name ?? null,
              avatar_url: data.user.user_metadata?.avatar_url ?? null,
            }
          : null,
        access_token: data.session?.access_token ?? null,
      }
    }

    requireSupabaseForRealAuth()
    throw new Error('Use a conta de demonstração local ou configure o Supabase para entrar.')
  },

  async signUp(email: string, password: string, fullName?: string): Promise<SessionResponse> {
    if (isDemoAccountCredentials(email, password)) {
      const user = {
        id: 'demo-user',
        email: DEMO_ACCOUNT_EMAIL,
        full_name: fullName ?? 'Usuário demo',
        avatar_url: null,
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
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email ?? '',
              full_name: data.user.user_metadata?.full_name ?? fullName ?? null,
              avatar_url: data.user.user_metadata?.avatar_url ?? null,
            }
          : null,
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
        user: data.session?.user
          ? {
              id: data.session.user.id,
              email: data.session.user.email ?? '',
              full_name: data.session.user.user_metadata?.full_name ?? null,
              avatar_url: data.session.user.user_metadata?.avatar_url ?? null,
            }
          : null,
        access_token: data.session?.access_token ?? null,
      }
    }

    if (!appEnv.demoAuthEnabled) return { user: null, access_token: null }

    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) {
      return { user: null, access_token: null }
    }

    const user = JSON.parse(raw) as AppUser
    return { user, access_token: 'demo-access-token' }
  },
}
