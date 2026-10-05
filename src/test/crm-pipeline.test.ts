import { describe, expect, it } from 'vitest'

import { buildPipelineStageChanges, createDefaultPipelineStages } from '../services/crm/pipelineService'
import type { Lead, PipelineStage } from '../types'

const lead = {
  id: 'lead-1',
  organization_id: 'org-1',
  company_id: 'company-1',
  company_name: 'Empresa de teste',
  city: 'São Paulo',
  segment: 'Serviços',
  score: 80,
  technical_score: 70,
  ai_score: 75,
  action_score: 82,
  icp_match: 70,
  classification: 'warm',
  status: 'meeting',
  opportunity: 'Melhoria digital',
  opportunity_reason: 'Sinal técnico disponível',
  ai_summary: '',
  recommended_service: '',
  confidence: 0.8,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
} satisfies Lead

describe('CRM pipeline stages', () => {
  it('creates ordered default stages with one win and one loss outcome', () => {
    const stages = createDefaultPipelineStages('org-1')
    expect(stages).toHaveLength(10)
    expect(stages.map((stage) => stage.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(stages.filter((stage) => stage.is_won).map((stage) => stage.slug)).toEqual(['won'])
    expect(stages.filter((stage) => stage.is_lost).map((stage) => stage.slug)).toEqual(['lost'])
    expect(new Set(stages.map((stage) => stage.id)).size).toBe(stages.length)
  })

  it('records terminal stage outcomes and clears stale outcome timestamps when reopened', () => {
    const [wonStage, lostStage, meetingStage] = [
      createDefaultPipelineStages('org-1').find((stage) => stage.slug === 'won')!,
      createDefaultPipelineStages('org-1').find((stage) => stage.slug === 'lost')!,
      createDefaultPipelineStages('org-1').find((stage) => stage.slug === 'meeting')!,
    ]
    const now = '2026-10-04T12:00:00.000Z'
    expect(buildPipelineStageChanges(lead, wonStage, now, {
      wonService: 'Otimização de site',
      wonReason: 'Escopo alinhado às necessidades da empresa',
    })).toMatchObject({
      status: 'won',
      won_at: now,
      lost_at: null,
      won_service: 'Otimização de site',
      won_reason: 'Escopo alinhado às necessidades da empresa',
    })
    expect(buildPipelineStageChanges(lead, lostStage, now, {
      lostReason: 'price',
      lostNotes: 'Orçamento abaixo do mínimo',
    })).toMatchObject({
      status: 'lost',
      won_at: null,
      lost_at: now,
      lost_reason: 'price',
      lost_notes: 'Orçamento abaixo do mínimo',
    })
    expect(buildPipelineStageChanges({ ...lead, won_at: now, lost_at: null }, meetingStage, now)).toMatchObject({
      status: 'meeting',
      won_at: null,
      lost_at: null,
    })
  })

  it('requires a recorded reason before an opportunity can be closed', () => {
    const stages = createDefaultPipelineStages('org-1')
    const won = stages.find((stage) => stage.is_won)!
    const lost = stages.find((stage) => stage.is_lost)!
    expect(() => buildPipelineStageChanges(lead, won, '2026-10-04T12:00:00.000Z')).toThrow('Informe o serviço vendido e o motivo da vitória.')
    expect(() => buildPipelineStageChanges(lead, lost, '2026-10-04T12:00:00.000Z')).toThrow('Selecione o motivo da perda.')
  })

  it('does not overwrite legacy status for a custom stage slug', () => {
    const customStage: PipelineStage = {
      ...createDefaultPipelineStages('org-1')[0],
      id: 'custom',
      slug: 'discovery_call',
      name: 'Descoberta',
    }
    expect(buildPipelineStageChanges(lead, customStage, '2026-10-04T12:00:00.000Z').status).toBeUndefined()
  })
})
