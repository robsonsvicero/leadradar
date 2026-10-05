import { supabase } from '../../lib/supabase/client'
import { getLeads } from '../leads/leadService'
import { prospectingMockMode } from '../prospecting/prospectingService'
import type { Lead, MeetingStatus, SalesMeeting } from '../../types'

const meetingsStorageKey = 'lead-radar-demo-sales-meetings'

type MeetingRecord = Omit<SalesMeeting, 'lead_name' | 'lead_company_id' | 'organization_name'>

export type MeetingWorkspace = {
  meetings: SalesMeeting[]
  leads: Lead[]
  organizations: Array<{ id: string; name: string }>
}

export type MeetingInput = {
  lead: Lead
  title: string
  startsAt: string
  durationMinutes: number
  meetingUrl?: string
  notes?: string
}

function readDemoMeetings(): MeetingRecord[] {
  return JSON.parse(localStorage.getItem(meetingsStorageKey) ?? '[]') as MeetingRecord[]
}

function writeDemoMeetings(meetings: MeetingRecord[]) {
  localStorage.setItem(meetingsStorageKey, JSON.stringify(meetings))
}

export function normalizeMeetingInput(input: Omit<MeetingInput, 'lead'>) {
  const title = input.title.trim()
  if (!title) throw new Error('Informe o título da reunião.')
  if (title.length > 160) throw new Error('O título deve ter no máximo 160 caracteres.')

  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) throw new Error('Informe uma data e horário válidos.')

  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480) {
    throw new Error('A duração deve ser de 5 a 480 minutos.')
  }

  const meetingUrl = input.meetingUrl?.trim() ?? ''
  if (meetingUrl) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(meetingUrl)
    } catch {
      throw new Error('Informe um link de reunião válido começando com https:// ou http://.')
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('O link da reunião deve usar https:// ou http://.')
    }
  }

  const notes = input.notes?.trim() ?? ''
  if (notes.length > 4000) throw new Error('As observações devem ter no máximo 4.000 caracteres.')

  return {
    title,
    starts_at: startsAt.toISOString(),
    duration_minutes: input.durationMinutes,
    meeting_url: meetingUrl || null,
    notes: notes || null,
  }
}

function toMeeting(
  meeting: MeetingRecord,
  leadsById: Map<string, Lead>,
  organizationsById: Map<string, string>,
): SalesMeeting {
  const lead = leadsById.get(meeting.lead_id)
  return {
    ...meeting,
    lead_name: lead?.company_name ?? 'Lead indisponível',
    lead_company_id: lead?.company_id ?? null,
    organization_name: organizationsById.get(meeting.organization_id) ?? 'Organização',
  }
}

export async function getMeetingWorkspace(): Promise<MeetingWorkspace> {
  if (prospectingMockMode) {
    const leads = await getLeads()
    const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
    const organizations = [...new Set(leads.map((lead) => lead.organization_id))]
      .map((id) => ({ id, name: id === 'demo-org' ? 'Demonstração' : `Organização ${id.slice(0, 8)}` }))
    const organizationsById = new Map(organizations.map((organization) => [organization.id, organization.name]))
    const meetings = readDemoMeetings()
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      .map((meeting) => toMeeting(meeting, leadsById, organizationsById))
    return { meetings, leads, organizations }
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const [leads, meetingResult] = await Promise.all([
    getLeads(),
    supabase.from('sales_meetings')
      .select('*')
      .order('starts_at', { ascending: true })
      .range(0, 499),
  ])
  const { data, error } = meetingResult
  if (error) {
    throw new Error(`Não foi possível carregar as reuniões. Verifique se a migration 20261004210000_sales_meetings.sql foi aplicada: ${error.message}`)
  }

  const organizationIds = [...new Set(leads.map((lead) => lead.organization_id))]
  const { data: organizationData, error: organizationError } = organizationIds.length
    ? await supabase.from('organizations').select('id,name').in('id', organizationIds).order('name')
    : { data: [], error: null }
  if (organizationError) throw new Error(`Não foi possível carregar as organizações das reuniões: ${organizationError.message}`)
  const organizations = (organizationData ?? []) as Array<{ id: string; name: string }>
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization.name]))
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
  const meetings = ((data ?? []) as MeetingRecord[])
    .map((meeting) => toMeeting(meeting, leadsById, organizationsById))

  return { meetings, leads, organizations }
}

export async function createMeeting(input: MeetingInput): Promise<SalesMeeting> {
  const normalized = normalizeMeetingInput(input)

  if (prospectingMockMode) {
    const now = new Date().toISOString()
    const meeting: MeetingRecord = {
      id: crypto.randomUUID(),
      organization_id: input.lead.organization_id,
      lead_id: input.lead.id,
      ...normalized,
      status: 'scheduled',
      created_by: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    }
    writeDemoMeetings([meeting, ...readDemoMeetings()])
    return toMeeting(
      meeting,
      new Map([[input.lead.id, input.lead]]),
      new Map([[input.lead.organization_id, input.lead.organization_id === 'demo-org'
        ? 'Demonstração'
        : `Organização ${input.lead.organization_id.slice(0, 8)}`]]),
    )
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('sales_meetings')
    .insert({
      organization_id: input.lead.organization_id,
      lead_id: input.lead.id,
      ...normalized,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível agendar a reunião: ${error.message}`)

  return toMeeting(data as MeetingRecord, new Map([[input.lead.id, input.lead]]), new Map())
}

export async function updateMeetingDetails(id: string, input: Omit<MeetingInput, 'lead'>) {
  const normalized = normalizeMeetingInput(input)

  if (prospectingMockMode) {
    const updated = readDemoMeetings().map((meeting) => meeting.id === id && meeting.status === 'scheduled'
      ? { ...meeting, ...normalized, updated_at: new Date().toISOString() }
      : meeting)
    writeDemoMeetings(updated)
    return updated.find((meeting) => meeting.id === id) ?? null
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('sales_meetings')
    .update(normalized)
    .eq('id', id)
    .eq('status', 'scheduled')
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível atualizar a reunião: ${error.message}`)
  return data as MeetingRecord
}

export async function updateMeetingStatus(id: string, status: MeetingStatus): Promise<MeetingRecord | null> {
  if (prospectingMockMode) {
    const now = new Date().toISOString()
    const updated = readDemoMeetings().map((meeting) => meeting.id === id
      ? {
          ...meeting,
          status,
          completed_at: status === 'completed' ? now : null,
          updated_at: now,
        }
      : meeting)
    writeDemoMeetings(updated)
    return updated.find((meeting) => meeting.id === id) ?? null
  }

  if (!supabase) throw new Error('Supabase não está configurado.')
  const { data, error } = await supabase.from('sales_meetings')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Não foi possível atualizar o status da reunião: ${error.message}`)
  return data as MeetingRecord
}
