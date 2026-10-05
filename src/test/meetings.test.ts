import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createMeeting,
  getMeetingWorkspace,
  normalizeMeetingInput,
  updateMeetingDetails,
  updateMeetingStatus,
} from '../services/meetings/meetingService'
import type { Lead } from '../types'

const meetingInput = {
  title: ' Diagnóstico inicial ',
  startsAt: '2026-11-10T10:30',
  durationMinutes: 45,
  meetingUrl: 'https://meet.example.com/room',
  notes: '  Revisar site e prioridades.  ',
}

const lead: Lead = {
  id: 'demo-lead-meeting',
  organization_id: 'demo-org',
  company_id: 'demo-company-meeting',
  company_name: 'Empresa para reunião',
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

describe('normalizeMeetingInput', () => {
  it('trims fields and serializes the date and optional URL', () => {
    expect(normalizeMeetingInput(meetingInput)).toEqual({
      title: 'Diagnóstico inicial',
      starts_at: new Date(meetingInput.startsAt).toISOString(),
      duration_minutes: 45,
      meeting_url: 'https://meet.example.com/room',
      notes: 'Revisar site e prioridades.',
    })
  })

  it('rejects invalid duration', () => {
    expect(() => normalizeMeetingInput({ ...meetingInput, durationMinutes: 4 }))
      .toThrow('A duração deve ser de 5 a 480 minutos.')
  })

  it('rejects non-http links', () => {
    expect(() => normalizeMeetingInput({ ...meetingInput, meetingUrl: 'javascript:alert(1)' }))
      .toThrow('O link da reunião deve usar https:// ou http://.')
  })

  it('rejects an invalid date', () => {
    expect(() => normalizeMeetingInput({ ...meetingInput, startsAt: 'data inválida' }))
      .toThrow('Informe uma data e horário válidos.')
  })
})

describe('meeting scheduling in demo mode', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lead-radar-demo-leads', JSON.stringify([lead]))
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists meetings and reflects completion status', async () => {
    const meeting = await createMeeting({ ...meetingInput, lead })
    expect(meeting).toMatchObject({
      title: 'Diagnóstico inicial',
      lead_name: lead.company_name,
      organization_name: 'Demonstração',
      status: 'scheduled',
    })

    const workspace = await getMeetingWorkspace()
    expect(workspace.meetings.map((item) => item.id)).toContain(meeting.id)

    const rescheduled = await updateMeetingDetails(meeting.id, {
      ...meetingInput,
      title: 'Diagnóstico reagendado',
      startsAt: '2026-11-11T11:30',
    })
    expect(rescheduled).toMatchObject({
      title: 'Diagnóstico reagendado',
      starts_at: new Date('2026-11-11T11:30').toISOString(),
    })

    const completed = await updateMeetingStatus(meeting.id, 'completed')
    expect(completed).toMatchObject({ status: 'completed' })
    expect(completed?.completed_at).toBeTruthy()
  })
})
