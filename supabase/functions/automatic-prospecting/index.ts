import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const deno = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Response | Promise<Response>): void
  }
}).Deno

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function localClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

function dayNumber(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function chooseTarget<T>(values: T[], index: number) {
  return values[((index % values.length) + values.length) % values.length]
}

deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = deno.env.get('SUPABASE_URL')
  const requestAuthorization = request.headers.get('Authorization')
  const serviceRoleKey = requestAuthorization?.replace(/^Bearer\s+/i, '') ?? deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = deno.env.get('AUTOMATIC_PROSPECTING_CRON_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return response({ error: 'A configuração do Supabase Edge Function está incompleta.' }, 500)
  }
  if (request.headers.get('x-automatic-prospecting-secret') !== cronSecret) {
    return response({ error: 'Acesso negado.' }, 401)
  }
  const apiKey = request.headers.get('apikey')
  if (!requestAuthorization || !apiKey) {
    return response({ error: 'A autenticação do agendador está incompleta.' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const settingsResult = await admin
    .from('automatic_prospecting_settings')
    .select('organization_id, run_time, timezone, leads_per_day, minimum_score')
    .eq('enabled', true)
  if (settingsResult.error) {
    console.error('automatic_prospecting_settings_load_failed', settingsResult.error.message)
    return response({ error: 'Não foi possível carregar as configurações de prospecção automática.' }, 500)
  }

  const now = new Date()
  let scheduled = 0
  let skipped = 0
  const failures: string[] = []

  for (const settings of settingsResult.data ?? []) {
    let runId: string | null = null
    try {
      const clock = localClock(now, settings.timezone)
      if (clock.time < String(settings.run_time).slice(0, 5)) {
        skipped += 1
        continue
      }

      const { data: claimedRun, error: claimError } = await admin.rpc('claim_automatic_prospecting_run', {
        p_organization_id: settings.organization_id,
        p_local_date: clock.date,
      })
      if (claimError) throw new Error(`Não foi possível reservar a execução: ${claimError.message}`)
      if (!claimedRun) {
        skipped += 1
        continue
      }
      runId = claimedRun as string

      const { data: icp, error: icpError } = await admin
        .from('organization_icp_settings')
        .select('target_segments, target_locations')
        .eq('organization_id', settings.organization_id)
        .eq('active', true)
        .maybeSingle()
      if (icpError) throw new Error(`Não foi possível carregar o ICP ativo: ${icpError.message}`)
      const segments = (icp?.target_segments ?? []).filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      const locations = (icp?.target_locations ?? []).filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      if (!segments.length || !locations.length) {
        throw new Error('Configure ao menos um segmento e uma localização no ICP ativo.')
      }

      const day = dayNumber(clock.date)
      const segmentIndex = day % segments.length
      const locationIndex = Math.floor(day / segments.length) % locations.length
      const functionResponse = await fetch(`${supabaseUrl}/functions/v1/prospecting-search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: apiKey,
          'x-automatic-prospecting-secret': cronSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'scheduled-create',
          organizationId: settings.organization_id,
          segment: chooseTarget(segments, segmentIndex),
          location: chooseTarget(locations, locationIndex),
          targetQuantity: settings.leads_per_day,
          minimumScore: settings.minimum_score,
          runId,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      const result = await functionResponse.json().catch(() => null)
      if (!functionResponse.ok) {
        throw new Error(result?.error ?? `A criação do job retornou HTTP ${functionResponse.status}.`)
      }

      const { error: updateError } = await admin
        .from('automatic_prospecting_runs')
        .update({
          status: 'scheduled',
          prospecting_job_id: result?.job?.id ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .eq('status', 'running')
      if (updateError) throw new Error(`Job agendado, mas não foi possível registrar a execução: ${updateError.message}`)
      scheduled += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha inesperada na execução automática.'
      failures.push(`${settings.organization_id}: ${message}`)
      console.error('automatic_prospecting_run_failed', { organization_id: settings.organization_id, error: message })
      if (runId) {
        const { error: updateError } = await admin
          .from('automatic_prospecting_runs')
          .update({
            status: 'failed',
            error_message: message.slice(0, 1000),
            finished_at: new Date().toISOString(),
          })
          .eq('id', runId)
          .eq('status', 'running')
        if (updateError) {
          console.error('automatic_prospecting_run_failure_record_failed', {
            organization_id: settings.organization_id,
            error: updateError.message,
          })
        }
      }
    }
  }

  return response({ scheduled, skipped, failures }, failures.length ? 207 : 200)
})
