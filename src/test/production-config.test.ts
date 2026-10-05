import { describe, expect, it } from 'vitest'

import { validateClientEnvironment } from '../config/env'

describe('client environment validation', () => {
  it('accepts a local configuration without Supabase for demo mode', () => {
    expect(validateClientEnvironment({ MODE: 'development' }).success).toBe(true)
  })

  it('requires Supabase URL and public key to be configured together', () => {
    expect(validateClientEnvironment({
      MODE: 'production',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    }).success).toBe(false)
  })

  it('rejects demo authentication in production and staging', () => {
    for (const mode of ['production', 'staging'] as const) {
      expect(validateClientEnvironment({
        MODE: mode,
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'public-test-key',
        VITE_ENABLE_DEMO_AUTH: 'true',
      }).success).toBe(false)
    }
  })

  it('requires Supabase and disables prospecting mocks in staging and production', () => {
    expect(validateClientEnvironment({ MODE: 'production' }).success).toBe(false)
    expect(validateClientEnvironment({
      MODE: 'staging',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-test-key',
      VITE_PROSPECTING_MOCK_MODE: 'true',
    }).success).toBe(false)
  })

  it('rejects unknown mock-mode values', () => {
    expect(validateClientEnvironment({
      MODE: 'development',
      VITE_PROSPECTING_MOCK_MODE: 'sometimes',
    }).success).toBe(false)
  })
})
