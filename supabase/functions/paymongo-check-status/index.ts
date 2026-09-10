import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
  })

const isLikelyPaymongoSecretKey = (key: string) => {
  const k = key.trim()
  if (!k) return false
  if (k.startsWith('sk_test_') || k.startsWith('sk_live_')) return true
  if (k.startsWith('pk_') || k.startsWith('sb_publishable_')) return false
  return k.startsWith('sk_')
}

const paymongoGetRequest = async (secretKey: string, path: string) => {
  const auth = btoa(`${secretKey}:`)
  const res = await fetch(`https://api.paymongo.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text().catch(() => '')
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch (_) {
      data = null
    }
  }
  if (!res.ok) {
    const message =
      data?.errors?.[0]?.detail ||
      data?.errors?.[0]?.message ||
      data?.message ||
      text ||
      res.statusText
    throw new Error(`PayMongo GET ${res.status}: ${message}`)
  }
  return data
}

const PAID_STATUSES = new Set([
  'paid',
  'approved',
  'captured',
  'successful',
  'succeeded',
  'success',
  'confirmed',
  'completed',
  'processed',
  'settled',
  'paid_out',
  'pay_out',
  'fulfillment_pending',
])

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 })

  try {
    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY') ?? ''
    if (!secretKey) return json({ error: 'Missing PAYMONGO_SECRET_KEY env var' }, { status: 500 })
    if (!isLikelyPaymongoSecretKey(secretKey)) {
      const prefix = secretKey.trim().slice(0, 14)
      return json(
        { error: `Invalid PAYMONGO_SECRET_KEY. Expected a secret key like sk_test_... or sk_live_... (got "${prefix}...")` },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const reference = `${body?.reference ?? ''}`.trim()
    if (!reference) return json({ error: 'Missing reference' }, { status: 400 })

    // 1. Find the payment_transactions row with this reference (get pi/cs IDs)
    const ptRows = await supabaseAdmin()
      .from('payment_transactions')
      .select('*')
      .eq('reference', reference)
      .order('created_at', { ascending: false })
      .limit(5)

    const rows = Array.isArray(ptRows?.data) ? ptRows.data : []
    if (rows.length === 0) {
      return json({ ok: true, paid: false, message: 'No rows found for reference yet' })
    }

    let paid = false
    let usedId = ''
    let paymongoStatus = ''
    let latest: any = null

    // 2. Try payment_intent_id first (pi_...)
    for (const r of rows) {
      const piId = `${r?.payment_intent_id ?? r?.paymongo_payment_intent_id ?? r?.intent_id ?? ''}`.trim()
      if (piId && piId.startsWith('pi_')) {
        try {
          const res = await paymongoGetRequest(secretKey, `/v1/payment_intents/${piId}`)
          const status = `${res?.data?.attributes?.status ?? ''}`.toLowerCase().trim()
          paymongoStatus = status
          usedId = piId
          latest = r
          if (PAID_STATUSES.has(status)) {
            paid = true
            break
          }
          // If a clear fail status, record and move on
          if (['failed', 'cancelled', 'canceled', 'expired', 'voided'].includes(status)) {
            continue
          }
        } catch (e: any) {
          // Ignore individual fetch errors
        }
      }
    }

    // 3. If not found, try checkout_session_id (cs_...)
    if (!paid) {
      for (const r of rows) {
        const csId = `${r?.checkout_session_id ?? r?.checkoutId ?? r?.session_id ?? ''}`.trim()
        if (csId && csId.startsWith('cs_')) {
          try {
            const res = await paymongoGetRequest(secretKey, `/v1/checkout_sessions/${csId}`)
            const status = `${res?.data?.attributes?.status ?? ''}`.toLowerCase().trim()
            const pi = `${res?.data?.attributes?.payment_intent?.id ?? ''}`.trim()
            paymongoStatus = status
            usedId = csId
            latest = r
            if (PAID_STATUSES.has(status)) {
              paid = true
              break
            }
            // If checkout has a nested payment_intent.status, check that too
            if (!paid && pi && pi.startsWith('pi_')) {
              try {
                const piRes = await paymongoGetRequest(secretKey, `/v1/payment_intents/${pi}`)
                const piSt = `${piRes?.data?.attributes?.status ?? ''}`.toLowerCase().trim()
                paymongoStatus = piSt || status
                usedId = pi
                if (PAID_STATUSES.has(piSt)) {
                  paid = true
                  break
                }
              } catch (_) {}
            }
          } catch (_) {}
        }
      }
    }

    // 4. If paid = TRUE → UPDATE payment_transactions DB row to 'paid' so the webhook is no longer required!
    if (paid && latest) {
      const nowIso = new Date().toISOString()
      const idCols = ['id', 'uuid', 'reference_number', 'checkout_id']
      let updatedCount = 0
      for (const col of idCols) {
        if (!latest[col]) continue
        try {
          const updatePayload: Record<string, any> = {
            status: 'paid',
            is_paid: true,
            paid: true,
            paid_at: latest?.paid_at || nowIso,
            updated_at: nowIso,
            paymongo_status: paymongoStatus || 'paid',
          }
          const up = await supabaseAdmin()
            .from('payment_transactions')
            .update(updatePayload)
            .eq(col, latest[col])
          if (!up?.error) updatedCount += 1
        } catch (_) {}
      }
      return json({
        ok: true,
        paid: true,
        message: 'Payment confirmed by PayMongo API (poller check). DB updated to paid.',
        updated_rows: updatedCount,
        paymongo_status: paymongoStatus,
        matched_id: usedId,
      })
    }

    // Not paid yet
    return json({
      ok: true,
      paid: false,
      message: 'Payment not yet completed according to PayMongo servers',
      paymongo_status: paymongoStatus || undefined,
      matched_id: usedId || undefined,
    })
  } catch (e: any) {
    return json({ ok: false, paid: false, error: e?.message || String(e) }, { status: 500 })
  }
})
