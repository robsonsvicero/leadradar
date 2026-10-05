import { describe, expect, it } from 'vitest'

import { hasExpiredProspectingLease } from '../services/prospecting/prospectingRecovery'

describe('prospecting worker recovery', () => {
  const now = Date.parse('2026-10-05T00:00:00.000Z')

  it('requests recovery when an active job has no worker lease', () => {
    expect(hasExpiredProspectingLease('running', null, now)).toBe(true)
    expect(hasExpiredProspectingLease('queued', undefined, now)).toBe(true)
  })

  it('requests recovery when the worker lease has expired', () => {
    expect(hasExpiredProspectingLease('running', '2026-10-04T23:59:59.000Z', now)).toBe(true)
  })

  it('does not request recovery while a worker lease is active', () => {
    expect(hasExpiredProspectingLease('running', '2026-10-05T00:00:01.000Z', now)).toBe(false)
  })

  it('does not resume terminal jobs', () => {
    expect(hasExpiredProspectingLease('cancelled', null, now)).toBe(false)
    expect(hasExpiredProspectingLease('completed', null, now)).toBe(false)
    expect(hasExpiredProspectingLease('failed', null, now)).toBe(false)
  })
})
