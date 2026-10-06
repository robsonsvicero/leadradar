import { describe, expect, it } from 'vitest'

import {
  getClassificationLabel,
  getSegmentLabel,
} from '../services/prospecting/prospectingLabels'

describe('prospecting labels', () => {
  it('translates internal lead classifications to Brazilian Portuguese', () => {
    expect(getClassificationLabel('hot')).toBe('Quente')
    expect(getClassificationLabel('warm')).toBe('Morno')
    expect(getClassificationLabel('cold')).toBe('Frio')
  })

  it('translates common English business segments and preserves custom segments', () => {
    expect(getSegmentLabel('Dentists')).toBe('Dentistas')
    expect(getSegmentLabel(' REAL ESTATE AGENCY ')).toBe('Imobiliária')
    expect(getSegmentLabel('Clínicas odontológicas')).toBe('Clínicas odontológicas')
  })

  it('returns an empty label for a missing segment', () => {
    expect(getSegmentLabel(null)).toBe('')
  })
})
