import { supabase } from '../../lib/supabase/client'
import { prospectingMockMode } from './prospectingService'
import type { AutomaticProspectingSettings } from './automaticProspectingService'
import type { Lead } from '../../types'

export type DailyRadarSettings = AutomaticProspectingSettings & {
  organization_id: string
  organization_name: string
}

export type DailyRadarRun = {
  organization_id: string
  organization_name: string
  local_date: string
  status: 'running' | 'scheduled' | 'failed' | 'completed'
  error_message: string | null
  started_at: string
  prospecting_job_id: string | null
}

export type DailyRadarLead = Lead & {
  company_email: string | null
  company_website: string | null
  company_phone: string | null
  prospecting_job_id: string
}

export type DailyRadarSnapshot = {
  settings: DailyRadarSettings[]
  runs: DailyRadarRun[]
  leads: DailyRadarLead[]
  demoMode: boolean
}

type DailyRadarLeadRow = Lead & {
  companies: { email: string | null; website: string | null; phone: string | null } | null
}

function localDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function getDailyRadarSnapshot(): Promise<DailyRadarSnapshot> {
  if (prospectingMockMode) return { settings: [], runs: [], leads: [], demoMode: true }
  if (!supabase) throw new Error('O Radar Diário exige uma conexão ativa com o Supabase.')

  const { data: settingsRows, error: settingsError } = await supabase
    .from('automatic_prospecting_settings')
    .select('organization_id, enabled, run_time, timezone, leads_per_day, minimum_score, alert_score')
  if (settingsError) throw new Error(`Não foi possível carregar as configurações do Radar Diário: ${settingsError.message}`)
  const settings = settingsRows ?? []
  const organizationIds = [...new Set(settings.map((item) => item.organization_id))]
  if (!organizationIds.length) return { settings: [], runs: [], leads: [], demoMode: false }

  const [organizationsResult, membersResult] = await Promise.all([
    supabase.from('organizations').select('id, name').in('id', organizationIds),
    supabase.from('organization_members').select('organization_id').in('organization_id', organizationIds),
  ])
  if (organizationsResult.error) throw new Error(`Não foi possível carregar as organizações: ${organizationsResult.error.message}`)
  if (membersResult.error) throw new Error(`Não foi possível validar as organizações do Radar Diário: ${membersResult.error.message}`)

  const authorizedIds = new Set((membersResult.data ?? []).map((membership) => membership.organization_id))
  const organizationNameById = new Map((organizationsResult.data ?? []).map((organization) => [organization.id, organization.name]))
  const visibleSettings: DailyRadarSettings[] = settings
    .filter((item) => authorizedIds.has(item.organization_id))
    .map((item) => ({
      ...item,
      run_time: String(item.run_time).slice(0, 5),
      organization_name: organizationNameById.get(item.organization_id) ?? 'Organização',
    }))
  if (!visibleSettings.length) return { settings: [], runs: [], leads: [], demoMode: false }

  const dateByOrganization = new Map(visibleSettings.map((item) => [item.organization_id, localDate(item.timezone)]))
  const dates = [...new Set(dateByOrganization.values())]
  const { data: runRows, error: runsError } = await supabase
    .from('automatic_prospecting_runs')
    .select('organization_id, local_date, status, error_message, started_at, prospecting_job_id')
    .in('organization_id', visibleSettings.map((item) => item.organization_id))
    .in('local_date', dates)
    .order('started_at', { ascending: false })
  if (runsError) throw new Error(`Não foi possível carregar as execuções do Radar Diário: ${runsError.message}`)

  const runs: DailyRadarRun[] = (runRows ?? [])
    .filter((run) => run.local_date === dateByOrganization.get(run.organization_id))
    .map((run) => ({
      ...run,
      organization_name: organizationNameById.get(run.organization_id) ?? 'Organização',
    }))
  const runByJobId = new Map(
    runs.filter((run) => run.prospecting_job_id).map((run) => [run.prospecting_job_id!, run]),
  )
  const jobIds = [...runByJobId.keys()]
  if (!jobIds.length) return { settings: visibleSettings, runs, leads: [], demoMode: false }

  const { data: jobRows, error: jobsError } = await supabase
    .from('prospecting_jobs')
    .select('id, status')
    .in('id', jobIds)
  if (jobsError) throw new Error(`Não foi possível carregar os jobs do Radar Diário: ${jobsError.message}`)
  const jobStatusById = new Map((jobRows ?? []).map((job) => [job.id, job.status]))
  for (const run of runs) {
    if (run.status !== 'scheduled' || !run.prospecting_job_id) continue
    const jobStatus = jobStatusById.get(run.prospecting_job_id)
    if (jobStatus === 'running') run.status = 'running'
    else if (jobStatus === 'completed') run.status = 'completed'
    else if (jobStatus === 'failed') run.status = 'failed'
  }

  const { data: jobCompanyRows, error: jobCompaniesError } = await supabase
    .from('prospecting_job_companies')
    .select('prospecting_job_id, company_id')
    .in('prospecting_job_id', jobIds)
    .not('company_id', 'is', null)
  if (jobCompaniesError) throw new Error(`Não foi possível carregar as empresas encontradas hoje: ${jobCompaniesError.message}`)

  const jobIdByCompanyId = new Map<string, string>()
  for (const row of jobCompanyRows ?? []) {
    if (row.company_id) jobIdByCompanyId.set(row.company_id, row.prospecting_job_id)
  }
  const companyIds = [...jobIdByCompanyId.keys()]
  if (!companyIds.length) return { settings: visibleSettings, runs, leads: [], demoMode: false }

  const { data: leadRows, error: leadsError } = await supabase
    .from('leads')
    .select('*, companies(email, website, phone)')
    .in('organization_id', visibleSettings.map((item) => item.organization_id))
    .in('company_id', companyIds)
    .order('score', { ascending: false })
  if (leadsError) throw new Error(`Não foi possível carregar as oportunidades do Radar Diário: ${leadsError.message}`)

  const leads = new Map<string, DailyRadarLead>()
  for (const row of (leadRows ?? []) as DailyRadarLeadRow[]) {
    const jobId = jobIdByCompanyId.get(row.company_id)
    if (!jobId || jobStatusById.get(jobId) !== 'completed' || leads.has(row.id)) continue
    const { companies, ...lead } = row
    leads.set(row.id, {
      ...lead,
      company_email: companies?.email ?? null,
      company_website: companies?.website ?? null,
      company_phone: companies?.phone ?? null,
      prospecting_job_id: jobId,
    })
  }

  return {
    settings: visibleSettings,
    runs,
    leads: [...leads.values()],
    demoMode: false,
  }
}
