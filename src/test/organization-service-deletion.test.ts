import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseMock, queryBuilder } = vi.hoisted(() => {
  const builder = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
  }
  return {
    queryBuilder: builder,
    supabaseMock: { from: vi.fn() },
  }
})

vi.mock('../lib/supabase/client', () => ({ supabase: supabaseMock }))

import { deleteOrganizationService } from '../services/ai/organizationAISettingsService'

describe('organization service deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBuilder.delete.mockReturnValue(queryBuilder)
    queryBuilder.eq.mockReturnValue(queryBuilder)
    supabaseMock.from.mockReturnValue(queryBuilder)
  })

  it('deletes a service scoped to its organization', async () => {
    queryBuilder.select.mockResolvedValue({ data: [{ id: 'service-1' }], error: null })

    await expect(deleteOrganizationService('org-1', 'service-1')).resolves.toBeUndefined()

    expect(supabaseMock.from).toHaveBeenCalledWith('organization_services')
    expect(queryBuilder.eq).toHaveBeenNthCalledWith(1, 'id', 'service-1')
    expect(queryBuilder.eq).toHaveBeenNthCalledWith(2, 'organization_id', 'org-1')
  })

  it('reports database failures instead of treating them as success', async () => {
    queryBuilder.select.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(deleteOrganizationService('org-1', 'service-1'))
      .rejects.toThrow('Não foi possível excluir o serviço: permission denied')
  })

  it('reports when RLS or a stale id prevents deletion', async () => {
    queryBuilder.select.mockResolvedValue({ data: [], error: null })

    await expect(deleteOrganizationService('org-1', 'service-1'))
      .rejects.toThrow('O serviço não foi encontrado ou você não tem permissão para excluí-lo.')
  })
})
