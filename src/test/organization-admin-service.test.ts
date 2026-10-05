import { FunctionsHttpError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { getEdgeFunctionErrorMessage } from '../services/organizations/organizationAdminService'

describe('organization admin service errors', () => {
  it('shows the actionable message returned by the Edge Function', async () => {
    const error = new FunctionsHttpError(new Response(
      JSON.stringify({ error: 'A configuração da função administrativa está incompleta.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    ))

    await expect(getEdgeFunctionErrorMessage(error))
      .resolves.toBe('A configuração da função administrativa está incompleta.')
  })

  it('falls back to the SDK message when the response has no error field', async () => {
    const error = new FunctionsHttpError(new Response('internal server error', { status: 500 }))

    await expect(getEdgeFunctionErrorMessage(error))
      .resolves.toBe('Edge Function returned a non-2xx status code')
  })
})
