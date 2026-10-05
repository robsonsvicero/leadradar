import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  cancelCadenceEnrollment,
  createCadence,
  enrollLeadInCadence,
  getCadenceWorkspace,
  normalizeCadenceInput,
} from '../services/cadences/cadenceService'
import type { Lead, TaskItem } from '../types'

const lead: Lead = {
  id: 'demo-lead-cadence',
  organization_id: 'demo-org',
  company_id: 'demo-company-cadence',
  company_name: 'Empresa para cadência',
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

const cadenceInput = {
  name: '  Primeiro contato  ',
  description: '  Apresentação e retorno manual.  ',
  steps: [
    {
      title: '  Revisar website  ',
      description: 'Anotar uma oportunidade observável.',
      taskType: 'research' as const,
      priority: 'medium' as const,
      delayDays: 0,
    },
    {
      title: 'Ligar para apresentar a análise',
      description: '',
      taskType: 'call' as const,
      priority: 'high' as const,
      delayDays: 3,
    },
  ],
}

describe('normalizeCadenceInput', () => {
  it('trims template text and preserves ordered step values', () => {
    expect(normalizeCadenceInput(cadenceInput)).toEqual({
      name: 'Primeiro contato',
      description: 'Apresentação e retorno manual.',
      steps: [
        {
          title: 'Revisar website',
          description: 'Anotar uma oportunidade observável.',
          taskType: 'research',
          priority: 'medium',
          delayDays: 0,
        },
        {
          title: 'Ligar para apresentar a análise',
          description: '',
          taskType: 'call',
          priority: 'high',
          delayDays: 3,
        },
      ],
    })
  })

  it('requires one to twenty steps and valid day offsets', () => {
    expect(() => normalizeCadenceInput({ ...cadenceInput, steps: [] }))
      .toThrow('A cadência deve ter de 1 a 20 etapas.')
    expect(() => normalizeCadenceInput({
      ...cadenceInput,
      steps: [{ ...cadenceInput.steps[0], delayDays: 366 }],
    })).toThrow('O intervalo entre inscrição e etapa deve estar entre 0 e 365 dias.')
  })

  it('rejects task types outside the CRM task vocabulary', () => {
    expect(() => normalizeCadenceInput({
      ...cadenceInput,
      steps: [{ ...cadenceInput.steps[0], taskType: 'email' as never }],
    })).toThrow('Selecione um tipo de tarefa válido.')
  })
})

describe('manual cadence workflow in demo mode', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lead-radar-demo-leads', JSON.stringify([lead]))
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('creates a template and schedules linked CRM tasks after explicit enrollment', async () => {
    const cadenceId = await createCadence({
      organizationId: lead.organization_id,
      ...cadenceInput,
    })
    let workspace = await getCadenceWorkspace()
    const cadence = workspace.cadences.find((item) => item.id === cadenceId)
    expect(cadence?.name).toBe('Primeiro contato')

    const enrollmentId = await enrollLeadInCadence(cadence!, lead)
    workspace = await getCadenceWorkspace()
    const enrollment = workspace.enrollments.find((item) => item.id === enrollmentId)
    expect(enrollment).toMatchObject({
      status: 'active',
      lead_name: lead.company_name,
    })
    expect(enrollment?.tasks).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem('lead-radar-demo-tasks') ?? '[]')).toMatchObject([
      { title: 'Revisar website', type: 'research', status: 'pending', cadence_enrollment_id: enrollmentId },
      { title: 'Ligar para apresentar a análise', type: 'call', status: 'pending', cadence_enrollment_id: enrollmentId },
    ])
  })

  it('prevents duplicate active enrollments and cancels all open tasks', async () => {
    const cadenceId = await createCadence({
      organizationId: lead.organization_id,
      ...cadenceInput,
    })
    const cadence = (await getCadenceWorkspace()).cadences.find((item) => item.id === cadenceId)!
    const enrollmentId = await enrollLeadInCadence(cadence, lead)
    await expect(enrollLeadInCadence(cadence, lead)).rejects.toThrow('Este lead já está inscrito nesta cadência.')

    const enrollment = (await getCadenceWorkspace()).enrollments.find((item) => item.id === enrollmentId)!
    await cancelCadenceEnrollment(enrollment)
    const tasks = JSON.parse(localStorage.getItem('lead-radar-demo-tasks') ?? '[]') as TaskItem[]
    expect(tasks.every((task) => task.status === 'cancelled')).toBe(true)
    expect((await getCadenceWorkspace()).enrollments.find((item) => item.id === enrollmentId)?.status).toBe('cancelled')
  })
})
