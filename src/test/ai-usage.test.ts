import { describe, expect, it } from 'vitest'

import { summarizeAIUsage, type AIUsageLog } from '../services/ai/aiUsageService'

const usageLogs: AIUsageLog[] = [
  {
    id: '1',
    analysis_type: 'lead_intelligence',
    model: 'gpt-test',
    tokens_input: 120,
    tokens_output: 80,
    estimated_cost: '0.00250000',
    status: 'succeeded',
    created_at: '2026-10-04T12:00:00.000Z',
  },
  {
    id: '2',
    analysis_type: 'lead_intelligence',
    model: 'gpt-test',
    tokens_input: 40,
    tokens_output: 0,
    estimated_cost: null,
    status: 'failed',
    created_at: '2026-10-04T12:01:00.000Z',
  },
  {
    id: '3',
    analysis_type: 'reply_assistant',
    model: 'gpt-test',
    tokens_input: 70,
    tokens_output: 30,
    estimated_cost: 0,
    status: 'pending',
    created_at: '2026-10-04T12:02:00.000Z',
  },
]

describe('AI usage summaries', () => {
  it('aggregates requests, statuses, tokens, and only known costs by operation', () => {
    expect(summarizeAIUsage(usageLogs)).toEqual([
      {
        operation: 'lead_intelligence',
        count: 2,
        succeeded: 1,
        failed: 1,
        pending: 0,
        inputTokens: 160,
        outputTokens: 80,
        estimatedCost: 0.0025,
        unestimatedCostCount: 1,
      },
      {
        operation: 'reply_assistant',
        count: 1,
        succeeded: 0,
        failed: 0,
        pending: 1,
        inputTokens: 70,
        outputTokens: 30,
        estimatedCost: 0,
        unestimatedCostCount: 0,
      },
    ])
  })
})
