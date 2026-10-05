import { supabase } from '../../lib/supabase/client'

function getSupabaseClient() {
  if (!supabase) throw new Error('A prospecção automática exige Supabase configurado.')
  return supabase
}

export type AutomaticProspectingSettings = {
  enabled: boolean
  run_time: string
  timezone: string
  leads_per_day: number
  minimum_score: number
  alert_score: number
}

export type AutomaticProspectingRun = {
  status: 'running' | 'scheduled' | 'failed'
  local_date: string
  error_message: string | null
  started_at: string
}

export const defaultAutomaticProspectingSettings: AutomaticProspectingSettings = {
  enabled: false,
  run_time: '08:00',
  timezone: 'America/Sao_Paulo',
  leads_per_day: 50,
  minimum_score: 60,
  alert_score: 85,
}

export function validateAutomaticProspectingSettings(
  settings: AutomaticProspectingSettings,
  hasActiveTargets: boolean,
) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.run_time)) return 'Informe um horário válido.'
  if (!Number.isInteger(settings.leads_per_day) || settings.leads_per_day < 1 || settings.leads_per_day > 100) {
    return 'O limite diário deve estar entre 1 e 100 empresas.'
  }
  if (!Number.isInteger(settings.minimum_score) || settings.minimum_score < 0 || settings.minimum_score > 100) {
    return 'O score mínimo deve estar entre 0 e 100.'
  }
  if (!Number.isInteger(settings.alert_score) || settings.alert_score < settings.minimum_score || settings.alert_score > 100) {
    return 'O score de alerta deve ser igual ou superior ao score mínimo e não ultrapassar 100.'
  }
  if (settings.enabled && !hasActiveTargets) return 'Configure segmentos e localidades no ICP ativo antes de habilitar a automação.'
  return null
}

export async function getAutomaticProspectingSettings(organizationId: string) {
  const client = getSupabaseClient()
  const [settingsResult, runResult] = await Promise.all([
    client
      .from('automatic_prospecting_settings')
      .select('enabled, run_time, timezone, leads_per_day, minimum_score, alert_score')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    client
      .from('automatic_prospecting_runs')
      .select('status, local_date, error_message, started_at')
      .eq('organization_id', organizationId)
      .order('local_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (settingsResult.error) throw new Error(`Não foi possível carregar a prospecção automática: ${settingsResult.error.message}`)
  if (runResult.error) throw new Error(`Não foi possível carregar a última execução automática: ${runResult.error.message}`)

  const settings = settingsResult.data
  return {
    settings: settings
      ? { ...settings, run_time: String(settings.run_time).slice(0, 5) } as AutomaticProspectingSettings
      : defaultAutomaticProspectingSettings,
    lastRun: runResult.data as AutomaticProspectingRun | null,
  }
}

export async function saveAutomaticProspectingSettings(
  organizationId: string,
  settings: AutomaticProspectingSettings,
) {
  const client = getSupabaseClient()
  const { data: icp, error: icpError } = await client
    .from('organization_icp_settings')
    .select('target_segments, target_locations')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .maybeSingle()
  if (icpError) throw new Error(`Não foi possível validar o ICP ativo: ${icpError.message}`)
  const hasActiveTargets = Boolean(icp?.target_segments?.length && icp.target_locations?.length)
  const validationError = validateAutomaticProspectingSettings(settings, hasActiveTargets)
  if (validationError) throw new Error(validationError)

  const { data, error } = await client
    .from('automatic_prospecting_settings')
    .upsert({
      organization_id: organizationId,
      ...settings,
      run_time: `${settings.run_time}:00`,
    }, { onConflict: 'organization_id' })
    .select('enabled, run_time, timezone, leads_per_day, minimum_score, alert_score')
    .single()
  if (error) throw new Error(`Não foi possível salvar a prospecção automática: ${error.message}`)
  return { ...data, run_time: String(data.run_time).slice(0, 5) } as AutomaticProspectingSettings
}
