import { supabase } from '../../lib/supabase/client'
import { getLeads } from '../leads/leadService'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type { Lead, ProposalStatus, SalesProposal, SalesProposalItem } from '../../types'

const proposalsStorageKey = 'lead-radar-demo-sales-proposals'

type ProposalItemInput = {
  description: string
  quantity: number
  unitPrice: number
}

type ProposalRecord = Omit<SalesProposal, 'lead_name' | 'lead_company_id' | 'organization_name' | 'items'>

const maximumAmountInCents = 99_999_999_999_999n

export type ProposalInput = {
  lead: Lead
  title: string
  scope: string
  validUntil?: string
  items: ProposalItemInput[]
}

export type ProposalWorkspace = {
  proposals: SalesProposal[]
  leads: Lead[]
  organizations: Array<{ id: string; name: string }>
}

function toMinorUnits(value: number): bigint | null {
  const [whole, fraction = ''] = value.toString().split('.')
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
}

function calculateProposalLineTotalInCents(quantity: number, unitPrice: number): bigint | null {
  const quantityInHundredths = toMinorUnits(quantity)
  const unitPriceInCents = toMinorUnits(unitPrice)
  if (quantityInHundredths === null || unitPriceInCents === null) return null
  return (quantityInHundredths * unitPriceInCents + 50n) / 100n
}

function calculateProposalTotalInCents(items: Array<Pick<ProposalItemInput, 'quantity' | 'unitPrice'>>): bigint {
  return items.reduce((total, item) => {
    return total + (calculateProposalLineTotalInCents(item.quantity, item.unitPrice) ?? 0n)
  }, 0n)
}

export function calculateProposalLineTotal(quantity: number, unitPrice: number): number {
  const totalInCents = calculateProposalLineTotalInCents(quantity, unitPrice)
  return totalInCents === null ? 0 : Number(totalInCents) / 100
}

export function calculateProposalTotal(items: Array<Pick<ProposalItemInput, 'quantity' | 'unitPrice'>>): number {
  return Number(calculateProposalTotalInCents(items)) / 100
}

function readDemoProposals(): Array<ProposalRecord & { items: SalesProposalItem[] }> {
  return JSON.parse(localStorage.getItem(proposalsStorageKey) ?? '[]') as Array<ProposalRecord & { items: SalesProposalItem[] }>
}

function writeDemoProposals(proposals: Array<ProposalRecord & { items: SalesProposalItem[] }>) {
  localStorage.setItem(proposalsStorageKey, JSON.stringify(proposals))
}

export function normalizeProposalInput(input: Omit<ProposalInput, 'lead'>) {
  const title = input.title.trim()
  if (!title) throw new Error('Informe o título da proposta.')
  if (title.length > 160) throw new Error('O título deve ter no máximo 160 caracteres.')

  const scope = input.scope.trim()
  if (scope.length > 4000) throw new Error('O escopo deve ter no máximo 4.000 caracteres.')

  const validUntil = input.validUntil?.trim() ?? ''
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    throw new Error('Informe uma data de validade válida.')
  }
  if (validUntil && (
    Number(validUntil.slice(0, 4)) < 1
    || new Date(`${validUntil}T00:00:00Z`).toISOString().slice(0, 10) !== validUntil
  )) {
    throw new Error('Informe uma data de validade válida.')
  }

  if (!input.items.length || input.items.length > 30) {
    throw new Error('A proposta deve ter de 1 a 30 itens.')
  }

  const items = input.items.map((item) => {
    const description = item.description.trim()
    if (!description || description.length > 240) {
      throw new Error('Cada item precisa de uma descrição de até 240 caracteres.')
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000) {
      throw new Error('A quantidade deve ser maior que zero e não pode exceder 1.000.000.')
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > 1_000_000_000) {
      throw new Error('O preço unitário deve estar entre R$ 0,00 e R$ 1.000.000.000,00.')
    }
    if (toMinorUnits(item.quantity) === null || toMinorUnits(item.unitPrice) === null) {
      throw new Error('Quantidade e preço podem ter no máximo duas casas decimais.')
    }
    const lineTotalInCents = calculateProposalLineTotalInCents(item.quantity, item.unitPrice)
    if (lineTotalInCents === null || lineTotalInCents > maximumAmountInCents) {
      throw new Error('O valor de cada item excede o limite permitido.')
    }
    return { description, quantity: item.quantity, unitPrice: item.unitPrice }
  })

  const totalAmountInCents = calculateProposalTotalInCents(items)
  if (totalAmountInCents > maximumAmountInCents) {
    throw new Error('O total da proposta excede o limite permitido.')
  }
  const totalAmount = Number(totalAmountInCents) / 100

  return { title, scope, validUntil: validUntil || null, items, totalAmount }
}

function buildProposal(
  proposal: ProposalRecord,
  items: SalesProposalItem[],
  leadsById: Map<string, Lead>,
  organizationsById: Map<string, string>,
): SalesProposal {
  const lead = leadsById.get(proposal.lead_id)
  return {
    ...proposal,
    total_amount: Number(proposal.total_amount),
    lead_name: lead?.company_name ?? 'Lead indisponível',
    lead_company_id: lead?.company_id ?? null,
    organization_name: organizationsById.get(proposal.organization_id) ?? 'Organização',
    items: [...items].sort((left, right) => left.position - right.position),
  }
}

export async function getProposalWorkspace(): Promise<ProposalWorkspace> {
  const leads = await getLeads()
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
  const organizations = [...new Set(leads.map((lead) => lead.organization_id))]
    .map((id) => ({ id, name: id === 'demo-org' ? 'Demonstração' : `Organização ${id.slice(0, 8)}` }))
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization.name]))

  if (prospectingMockMode) {
    const proposals = readDemoProposals()
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map(({ items, ...proposal }) => buildProposal(proposal, items, leadsById, organizationsById))
    return { proposals, leads, organizations }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('sales_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, 499)
  if (error) {
    throw new Error(`Não foi possível carregar as propostas. Verifique se a migration 20261004220000_sales_proposals.sql foi aplicada: ${error.message}`)
  }

  const records = (data ?? []) as ProposalRecord[]
  const proposalIds = records.map((proposal) => proposal.id)
  const { data: itemData, error: itemError } = proposalIds.length
    ? await supabase.from('sales_proposal_items')
      .select('*')
      .in('proposal_id', proposalIds)
      .order('position')
    : { data: [], error: null }
  if (itemError) throw new Error(`Não foi possível carregar os itens das propostas: ${itemError.message}`)

  const itemsByProposal = new Map<string, SalesProposalItem[]>()
  for (const item of (itemData ?? []) as SalesProposalItem[]) {
    const items = itemsByProposal.get(item.proposal_id) ?? []
    items.push(item)
    itemsByProposal.set(item.proposal_id, items)
  }
  const proposals = records.map((proposal) => buildProposal(
    proposal,
    itemsByProposal.get(proposal.id) ?? [],
    leadsById,
    organizationsById,
  ))
  return { proposals, leads, organizations }
}

export async function createProposal(input: ProposalInput): Promise<SalesProposal> {
  const normalized = normalizeProposalInput(input)
  const now = new Date().toISOString()

  if (prospectingMockMode) {
    const id = crypto.randomUUID()
    const items: SalesProposalItem[] = normalized.items.map((item, position) => ({
      id: crypto.randomUUID(),
      organization_id: input.lead.organization_id,
      proposal_id: id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: calculateProposalLineTotal(item.quantity, item.unitPrice),
      position,
      created_at: now,
    }))
    const proposal: ProposalRecord = {
      id,
      organization_id: input.lead.organization_id,
      lead_id: input.lead.id,
      title: normalized.title,
      scope: normalized.scope,
      valid_until: normalized.validUntil,
      status: 'draft',
      currency: 'BRL',
      total_amount: normalized.totalAmount,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    writeDemoProposals([{ ...proposal, items }, ...readDemoProposals()])
    return buildProposal(
      proposal,
      items,
      new Map([[input.lead.id, input.lead]]),
      new Map([[input.lead.organization_id, input.lead.organization_id === 'demo-org'
        ? 'Demonstração'
        : `Organização ${input.lead.organization_id.slice(0, 8)}`]]),
    )
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: proposalId, error } = await supabase.rpc('create_sales_proposal', {
    p_organization_id: input.lead.organization_id,
    p_lead_id: input.lead.id,
    p_title: normalized.title,
    p_scope: normalized.scope,
    p_valid_until: normalized.validUntil,
    p_items: normalized.items.map(({ description, quantity, unitPrice }) => ({
      description,
      quantity,
      unit_price: unitPrice,
    })),
  })
  if (error) throw new Error(`Não foi possível criar a proposta: ${error.message}`)

  const created = await getProposalWorkspace()
  const proposal = created.proposals.find((item) => item.id === proposalId)
  if (!proposal) throw new Error('A proposta foi criada, mas não apareceu na consulta. Atualize a página para verificar.')
  return proposal
}

const allowedProposalTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'cancelled'],
  accepted: [],
  rejected: [],
  cancelled: [],
}

export async function updateProposalStatus(id: string, status: ProposalStatus): Promise<ProposalRecord | null> {
  if (prospectingMockMode) {
    const now = new Date().toISOString()
    let updatedProposal: ProposalRecord | null = null
    const proposals = readDemoProposals().map(({ items, ...proposal }) => {
      if (proposal.id !== id) return { ...proposal, items }
      if (!allowedProposalTransitions[proposal.status].includes(status)) {
        throw new Error('Esta mudança de situação não é permitida.')
      }
      updatedProposal = { ...proposal, status, updated_at: now }
      return { ...updatedProposal, items }
    })
    writeDemoProposals(proposals)
    return updatedProposal
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data: current, error: readError } = await supabase.from('sales_proposals')
    .select('status')
    .eq('id', id)
    .single()
  if (readError) throw new Error(`Não foi possível validar a situação da proposta: ${readError.message}`)
  if (!allowedProposalTransitions[current.status as ProposalStatus]?.includes(status)) {
    throw new Error('Esta mudança de situação não é permitida.')
  }
  const { data, error } = await supabase.from('sales_proposals')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível atualizar a situação da proposta: ${error.message}`)
  return data as ProposalRecord
}
