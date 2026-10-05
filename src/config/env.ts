import { z } from 'zod'

const optionalString = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().optional(),
)

const clientEnvironmentSchema = z.object({
  MODE: z.enum(['development', 'test', 'staging', 'production']),
  VITE_SUPABASE_URL: optionalString.pipe(z.string().url().optional()),
  VITE_SUPABASE_ANON_KEY: optionalString,
  VITE_PROSPECTING_MOCK_MODE: z.enum(['true', 'false']).optional(),
  VITE_ENABLE_DEMO_AUTH: z.enum(['true', 'false']).optional(),
  VITE_ENABLE_AI_SDR: z.enum(['true', 'false']).optional(),
  VITE_ENABLE_INBOX: z.enum(['true', 'false']).optional(),
  VITE_ENABLE_PROPOSALS: z.enum(['true', 'false']).optional(),
  VITE_ENABLE_ADVANCED_ANALYTICS: z.enum(['true', 'false']).optional(),
  VITE_ENABLE_AUTOMATED_CADENCES: z.enum(['true', 'false']).optional(),
}).superRefine((value, context) => {
  const hasSupabaseUrl = Boolean(value.VITE_SUPABASE_URL)
  const hasSupabaseKey = Boolean(value.VITE_SUPABASE_ANON_KEY)

  if (hasSupabaseUrl !== hasSupabaseKey) {
    context.addIssue({
      code: 'custom',
      path: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      message: 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem ser configuradas em conjunto.',
    })
  }

  if ((value.MODE === 'staging' || value.MODE === 'production') && !hasSupabaseUrl) {
    context.addIssue({
      code: 'custom',
      path: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      message: 'Staging e produção exigem configuração do Supabase.',
    })
  }

  if ((value.MODE === 'staging' || value.MODE === 'production') && value.VITE_PROSPECTING_MOCK_MODE === 'true') {
    context.addIssue({
      code: 'custom',
      path: ['VITE_PROSPECTING_MOCK_MODE'],
      message: 'Modo mock não pode ser habilitado em staging ou produção.',
    })
  }

  if (value.MODE === 'production' && value.VITE_ENABLE_DEMO_AUTH === 'true') {
    context.addIssue({
      code: 'custom',
      path: ['VITE_ENABLE_DEMO_AUTH'],
      message: 'Autenticação demo não pode ser habilitada em produção.',
    })
  }

  if (value.MODE === 'staging' && value.VITE_ENABLE_DEMO_AUTH === 'true') {
    context.addIssue({
      code: 'custom',
      path: ['VITE_ENABLE_DEMO_AUTH'],
      message: 'Autenticação demo não pode ser habilitada em staging.',
    })
  }
})

function parseBoolean(value: string | undefined, fallback: boolean) {
  return value === undefined ? fallback : value === 'true'
}

export function validateClientEnvironment(input: unknown) {
  return clientEnvironmentSchema.safeParse(input)
}

const parsedEnvironment = validateClientEnvironment(import.meta.env)
if (!parsedEnvironment.success) {
  const invalidKeys = [...new Set(parsedEnvironment.error.issues.flatMap((issue) => issue.path))]
  throw new Error(`Configuração pública inválida. Verifique: ${invalidKeys.join(', ')}.`)
}

const raw = parsedEnvironment.data

export const appEnv = {
  mode: raw.MODE,
  isDevelopment: raw.MODE === 'development',
  isTest: raw.MODE === 'test',
  isStaging: raw.MODE === 'staging',
  isProduction: raw.MODE === 'production',
  supabaseUrl: raw.VITE_SUPABASE_URL,
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY,
  prospectingMockMode: parseBoolean(raw.VITE_PROSPECTING_MOCK_MODE, raw.MODE === 'development'),
  demoAuthEnabled: parseBoolean(raw.VITE_ENABLE_DEMO_AUTH, raw.MODE === 'development' || raw.MODE === 'test'),
  features: {
    aiSdr: parseBoolean(raw.VITE_ENABLE_AI_SDR, true),
    inbox: parseBoolean(raw.VITE_ENABLE_INBOX, true),
    proposals: parseBoolean(raw.VITE_ENABLE_PROPOSALS, true),
    advancedAnalytics: parseBoolean(raw.VITE_ENABLE_ADVANCED_ANALYTICS, true),
    automatedCadences: parseBoolean(raw.VITE_ENABLE_AUTOMATED_CADENCES, true),
  },
} as const

export type AppEnvironment = typeof appEnv
