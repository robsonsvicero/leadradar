import { createClient } from '@supabase/supabase-js'

import { appEnv } from '../../config/env'

export const supabase =
  appEnv.supabaseUrl && appEnv.supabaseAnonKey
    ? createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null

export const isSupabaseConfigured = Boolean(supabase)
