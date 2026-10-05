import { describe, expect, it } from 'vitest'

import {
  defaultAutomaticProspectingSettings,
  validateAutomaticProspectingSettings,
} from '../services/prospecting/automaticProspectingService'

describe('automatic prospecting settings validation', () => {
  it('uses the documented disabled defaults', () => {
    expect(defaultAutomaticProspectingSettings).toMatchObject({
      enabled: false,
      run_time: '08:00',
      timezone: 'America/Sao_Paulo',
      leads_per_day: 50,
      minimum_score: 60,
      alert_score: 85,
    })
  })

  it('accepts valid settings when the active ICP has targets', () => {
    expect(validateAutomaticProspectingSettings(defaultAutomaticProspectingSettings, true)).toBeNull()
  })

  it('requires active ICP segments and locations before enabling', () => {
    expect(validateAutomaticProspectingSettings({
      ...defaultAutomaticProspectingSettings,
      enabled: true,
    }, false)).toMatch(/ICP ativo/)
  })

  it('rejects limits outside the supported job size', () => {
    expect(validateAutomaticProspectingSettings({
      ...defaultAutomaticProspectingSettings,
      leads_per_day: 101,
    }, true)).toMatch(/entre 1 e 100/)
  })

  it('requires the alert score to be at least the minimum save score', () => {
    expect(validateAutomaticProspectingSettings({
      ...defaultAutomaticProspectingSettings,
      alert_score: 59,
    }, true)).toMatch(/igual ou superior/)
  })
})
