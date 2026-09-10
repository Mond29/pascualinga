import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
  })

const text = (body: string, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { 'Content-Type': 'text/plain', ...corsHeaders, ...(init.headers ?? {}) } })

const coerceText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, { status: 405 })

  try {
    const body = await req.json().catch(() => ({}))
    const doctorId = coerceText((body as any)?.doctorId || (body as any)?.doctor_id).trim()
    const from = coerceText((body as any)?.from).trim()
    const to = coerceText((body as any)?.to).trim()
    const mode = coerceText((body as any)?.mode || 'onsite').trim() || 'onsite'
    const userEmail = coerceText((body as any)?.userEmail || (body as any)?.email).trim().toLowerCase()

    if (!doctorId || !isUuid(doctorId)) return json({ ok: false, error: 'Invalid doctorId' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return json({ ok: false, error: 'Invalid from' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ ok: false, error: 'Invalid to' }, { status: 400 })

    const backendBase = (Deno.env.get('BACKEND_API_BASE_URL') ?? 'https://api.pascualinga.com').trim().replace(/\/+$/, '')
    const bearer = (Deno.env.get('BACKEND_BEARER_TOKEN') ?? '').trim()
    const debug = (body as any)?.debug === true
    if (debug) {
      console.log('[doctor-availability-proxy] meta', { backendBase, hasBearer: !!bearer, userEmail: !!userEmail })
    }

    const u = new URL(`${backendBase}/api/doctors/${encodeURIComponent(doctorId)}/availability`)
    u.searchParams.set('from', from)
    u.searchParams.set('to', to)
    u.searchParams.set('mode', mode)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)
    let res: Response
    try {
      res = await fetch(u.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'x-user-role': 'patient',
          ...(userEmail ? { 'x-user-email': userEmail } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const responseText = await res.text()
    let responseJson: unknown = null
    try {
      responseJson = responseText ? JSON.parse(responseText) : null
    } catch (_) {
      responseJson = null
    }

    if (!res.ok) {
      return json(
        {
          ok: false,
          status: res.status,
          message: (responseJson as any)?.message || responseText || 'Request failed',
        },
        { status: res.status },
      )
    }

    return json({ ok: true, status: res.status, data: responseJson ?? responseText })
  } catch (e) {
    const msg = `${(e as any)?.message || e || ''}`.trim()
    if (msg.toLowerCase().includes('abort')) return text('timeout', { status: 504 })
    return json({ ok: false, error: msg || 'Unknown error' }, { status: 500 })
  }
})
