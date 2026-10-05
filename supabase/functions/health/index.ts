import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const deno = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined }
    serve(handler: (request: Request) => Response | Promise<Response>): void
  }
}).Deno

function statusResponse(status: 'ok' | 'degraded', code: number) {
  return new Response(JSON.stringify({ status }), {
    status: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const url = deno.env.get('SUPABASE_URL')
  const serviceRoleKey = deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return statusResponse('degraded', 503)

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.from('organizations').select('id').limit(1)
  if (error) return statusResponse('degraded', 503)
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  return statusResponse('ok', 200)
})
