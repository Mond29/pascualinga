import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
  })

const coerceText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const normalizeText = (v: unknown) => coerceText(v).replace(/\s+/g, ' ').trim().toLowerCase()

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, { status: 405 })

  try {
    const body = await req.json().catch(() => ({}))
    const department = coerceText((body as any)?.department || (body as any)?.dept).trim()
    const procedure = coerceText((body as any)?.procedure || (body as any)?.service || (body as any)?.subService).trim()
    const date = coerceText((body as any)?.date).trim()

    if (!department) return json({ ok: false, error: 'Invalid department' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'Invalid date' }, { status: 400 })

    const deptNorm = normalizeText(department)
    const procNorm = normalizeText(procedure)

    const active = (status: unknown) => {
      const s = normalizeText(status)
      if (!s) return true
      if (s.startsWith('cancel')) return false
      if (s.startsWith('declin')) return false
      if (s.startsWith('reject')) return false
      return true
    }

    const matcher = (() => {
      const deptEsc = escapeRegex(deptNorm)
      if (procNorm) {
        const procEsc = escapeRegex(procNorm)
        return new RegExp(`(^|\\s)${deptEsc}\\s*:\\s*${procEsc}(\\s|\\||$)`, 'i')
      }
      return new RegExp(`(^|\\s)${deptEsc}(\\s|\\||:|$)`, 'i')
    })()

    const matchesService = (value: unknown) => {
      const s = normalizeText(value)
      if (!s) return false
      if (matcher.test(s)) return true
      if (!procNorm) return s === deptNorm || s.startsWith(`${deptNorm} `)
      return false
    }

    const supabase = supabaseAdmin()

    const [reqRes, apptRes, legacyRes] = await Promise.all([
      supabase.from('appointment_approval_requests').select('status, reason, requested_date').eq('requested_date', date),
      supabase.from('appointments').select('status, service_type, reason, appointment_date').eq('appointment_date', date),
      supabase.from('service_appointment').select('status, service_type, appointment_date').eq('appointment_date', date),
    ])

    const reqRows = Array.isArray(reqRes?.data) ? reqRes.data : []
    const apptRows = Array.isArray(apptRes?.data) ? apptRes.data : []
    const legacyRows = Array.isArray(legacyRes?.data) ? legacyRes.data : []

    const reqCount = reqRows.filter((r: any) => active(r?.status) && matchesService(r?.reason)).length
    const apptCount = apptRows.filter((r: any) => active(r?.status) && (matchesService(r?.service_type) || matchesService(r?.reason))).length
    const legacyCount = legacyRows.filter((r: any) => active(r?.status) && matchesService(r?.service_type)).length

    const queueNumber = reqCount + apptCount + legacyCount + 1

    return json({ ok: true, queueNumber })
  } catch (e) {
    const msg = `${(e as any)?.message || e || ''}`.trim()
    return json({ ok: false, error: msg || 'Unknown error' }, { status: 500 })
  }
})

