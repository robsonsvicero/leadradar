import { beforeEach, describe, expect, it } from 'vitest'

import { createLead, deleteLeads, getLeads } from '../services/leads/leadService'

describe('lead deletion service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('deletes selected leads from demo storage while preserving the others', async () => {
    await createLead({ id: 'lead-1', company_name: 'Empresa A' })
    await createLead({ id: 'lead-2', company_name: 'Empresa B' })
    await createLead({ id: 'lead-3', company_name: 'Empresa C' })

    await deleteLeads(['lead-1', 'lead-2'])

    expect((await getLeads()).map((lead) => lead.id)).toEqual(['lead-3'])
  })

  it('rejects an empty selection', async () => {
    await expect(deleteLeads([])).rejects.toThrow('Selecione pelo menos um lead para excluir.')
  })
})
