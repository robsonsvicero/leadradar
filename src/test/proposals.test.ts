import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createProposal,
  getProposalWorkspace,
  normalizeProposalInput,
  updateProposalStatus,
} from '../services/proposals/proposalService'
import type { Lead } from '../types'

const input = {
  title: '  Site institucional  ',
  scope: '  Design e desenvolvimento.  ',
  validUntil: '2026-12-31',
  items: [
    { description: '  Criação do site  ', quantity: 1, unitPrice: 2500 },
    { description: 'Hospedagem anual', quantity: 2, unitPrice: 150 },
  ],
}

const lead: Lead = {
  id: 'demo-lead-proposal',
  organization_id: 'demo-org',
  company_id: 'demo-company-proposal',
  company_name: 'Empresa para proposta',
  city: 'São Paulo',
  segment: 'Serviços',
  score: 70,
  technical_score: 60,
  ai_score: 65,
  action_score: 70,
  icp_match: 80,
  classification: 'warm',
  status: 'new',
  opportunity: 'Presença digital',
  opportunity_reason: 'Site desatualizado',
  ai_summary: 'Resumo de demonstração',
  recommended_service: 'Criação de site',
  confidence: 0.8,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('normalizeProposalInput', () => {
  it('trims text and calculates a BRL preview from line items', () => {
    expect(normalizeProposalInput(input)).toEqual({
      title: 'Site institucional',
      scope: 'Design e desenvolvimento.',
      validUntil: '2026-12-31',
      items: [
        { description: 'Criação do site', quantity: 1, unitPrice: 2500 },
        { description: 'Hospedagem anual', quantity: 2, unitPrice: 150 },
      ],
      totalAmount: 2800,
    })
  })

  it('rejects a proposal without line items', () => {
    expect(() => normalizeProposalInput({ ...input, items: [] }))
      .toThrow('A proposta deve ter de 1 a 30 itens.')
  })

  it('rejects quantities and unit prices outside database limits', () => {
    expect(() => normalizeProposalInput({
      ...input,
      items: [{ description: 'Serviço', quantity: 0, unitPrice: 100 }],
    })).toThrow('A quantidade deve ser maior que zero')
    expect(() => normalizeProposalInput({
      ...input,
      items: [{ description: 'Serviço', quantity: 1, unitPrice: -1 }],
    })).toThrow('O preço unitário deve estar entre')
  })

  it('rejects invalid dates and more than two decimal places', () => {
    expect(() => normalizeProposalInput({ ...input, validUntil: '2026-02-30' }))
      .toThrow('Informe uma data de validade válida.')
    expect(() => normalizeProposalInput({
      ...input,
      items: [{ description: 'Serviço', quantity: 1.001, unitPrice: 10 }],
    })).toThrow('Quantidade e preço podem ter no máximo duas casas decimais.')
  })

  it('rounds each line item to cents before summing the total', () => {
    expect(normalizeProposalInput({
    ...input,
    items: [{ description: 'Serviço', quantity: 1.1, unitPrice: 1.15 }],
    }).totalAmount).toBe(1.27)
  })
})

describe('proposal workflow in demo mode', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lead-radar-demo-leads', JSON.stringify([lead]))
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists a proposal, calculates its total, and tracks manual status transitions', async () => {
    const proposal = await createProposal({ ...input, lead })
    expect(proposal).toMatchObject({
      title: 'Site institucional',
      scope: 'Design e desenvolvimento.',
      lead_name: lead.company_name,
      organization_name: 'Demonstração',
      status: 'draft',
      total_amount: 2800,
      currency: 'BRL',
    })
    expect(proposal.items).toHaveLength(2)

    expect((await getProposalWorkspace()).proposals.map((item) => item.id)).toContain(proposal.id)
    expect(await updateProposalStatus(proposal.id, 'sent')).toMatchObject({ status: 'sent' })
    expect(await updateProposalStatus(proposal.id, 'accepted')).toMatchObject({ status: 'accepted' })
    await expect(updateProposalStatus(proposal.id, 'cancelled'))
      .rejects.toThrow('Esta mudança de situação não é permitida.')
  })
})
