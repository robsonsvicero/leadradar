import { describe, expect, it } from 'vitest'

import { mapAIAnalysisRecommendation } from '../services/ai/aiSdrWorkspaceService'

describe('AI SDR workspace recommendations', () => {
  it('maps a saved actionable analysis without generating new advice', () => {
    expect(mapAIAnalysisRecommendation({
      id: 'analysis-1',
      lead_id: 'lead-1',
      created_at: '2026-10-04T12:00:00.000Z',
      output_data: {
        nextBestAction: {
          action: 'contact_now',
          reason: 'A evidência técnica registrada permite iniciar uma qualificação.',
        },
      },
    })).toEqual({
      id: 'analysis-1',
      leadId: 'lead-1',
      action: 'contact_now',
      reason: 'A evidência técnica registrada permite iniciar uma qualificação.',
      createdAt: '2026-10-04T12:00:00.000Z',
    })
  })

  it('does not enqueue wait or disqualification recommendations', () => {
    for (const action of ['wait', 'disqualify']) {
      expect(mapAIAnalysisRecommendation({
        id: 'analysis-2',
        lead_id: 'lead-1',
        created_at: '2026-10-04T12:00:00.000Z',
        output_data: { nextBestAction: { action, reason: 'Não priorizar.' } },
      })).toBeNull()
    }
  })

  it('ignores incomplete analysis records', () => {
    expect(mapAIAnalysisRecommendation({
      id: 'analysis-3',
      lead_id: null,
      created_at: '2026-10-04T12:00:00.000Z',
      output_data: { nextBestAction: { action: 'follow_up' } },
    })).toBeNull()
  })
})
