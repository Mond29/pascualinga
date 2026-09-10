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

const paymongoRequest = async (secretKey: string, path: string, payload: unknown) => {
  const auth = btoa(`${secretKey}:`)
  const res = await fetch(`https://api.paymongo.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
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
    if (/invalid api key/i.test(`${message}`)) {
      throw new Error(`PayMongo auth failed: Invalid API key. Double-check PAYMONGO_SECRET_KEY (it must be the full secret key, not the public key). Key length: ${secretKey.trim().length}.`)
    }
    if (res.status === 401) {
      throw new Error(`PayMongo 401: Unauthorized. Double-check PAYMONGO_SECRET_KEY (must be a valid sk_test_... or sk_live_... secret key). Key length: ${secretKey.trim().length}.`)
    }
    throw new Error(`PayMongo ${res.status}: ${message}`)
  }
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 })

  try {
    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY') ?? ''
    if (!secretKey) return json({ error: 'Missing PAYMONGO_SECRET_KEY' }, { status: 500 })
    if (!isLikelyPaymongoSecretKey(secretKey)) {
      const prefix = secretKey.trim().slice(0, 14)
      return json(
        { error: `Invalid PAYMONGO_SECRET_KEY. Expected a secret key like sk_test_... or sk_live_... (got "${prefix}...")` },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    if (body?.debug_key_meta === true) {
      return json({
        ok: true,
        paymongo_key_prefix: secretKey.trim().slice(0, 12),
        paymongo_key_length: secretKey.trim().length,
      })
    }
    if (body?.debug_env_meta === true) {
      const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
      const serviceRole = (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
      return json({
        ok: true,
        paymongo_key_prefix: secretKey.trim().slice(0, 12),
        paymongo_key_length: secretKey.trim().length,
        supabase_url_prefix: supabaseUrl ? `${supabaseUrl.slice(0, 28)}...` : '',
        service_role_prefix: serviceRole ? `${serviceRole.slice(0, 10)}...` : '',
        service_role_length: serviceRole.length,
      })
    }
    const reference = `${body?.reference ?? ''}`.trim()
    const email = `${body?.email ?? ''}`.trim()
    const firstName = `${body?.first_name ?? ''}`.trim()
    const lastName = `${body?.last_name ?? ''}`.trim()
    const serviceCategory = `${body?.service_category ?? ''}`.trim()
    const serviceName = `${body?.service_name ?? ''}`.trim()
    const requestedDate = `${body?.requested_date ?? ''}`.trim()
    const requestedTime = `${body?.requested_time ?? ''}`.trim()
    const consultMode = `${body?.consult_mode ?? ''}`.trim()
    const notes = `${body?.notes ?? ''}`.trim()
    const mainConcern = `${body?.main_concern ?? ''}`.trim()
    const severity = `${body?.severity ?? ''}`.trim()
    const triageLevelRaw = body?.triage_level
    const priorityScoreRaw = body?.priority_score
    const priorityLabel = `${body?.priority_label ?? ''}`.trim()
    const queue = `${body?.queue ?? ''}`.trim()
    const symptoms =
      Array.isArray(body?.symptoms) ? body.symptoms.map((v: any) => `${v || ''}`.trim()).filter(Boolean) : []
    const emergencySymptoms =
      Array.isArray(body?.emergency_symptoms)
        ? body.emergency_symptoms.map((v: any) => `${v || ''}`.trim()).filter(Boolean)
        : []
    const triageReasons =
      Array.isArray(body?.triage_reasons) ? body.triage_reasons.map((v: any) => `${v || ''}`.trim()).filter(Boolean) : []
    const amount = Number(body?.amount ?? 0)
    const paymentMethod = `${body?.payment_method ?? ''}`.trim().toLowerCase()
    const debugSkipDb = body?.debug_skip_db === true

    if (!reference) return json({ error: 'Missing reference' }, { status: 400 })
    if (!email) return json({ error: 'Missing email' }, { status: 400 })
    if (!serviceCategory || !serviceName) return json({ error: 'Missing service' }, { status: 400 })
    if (!requestedDate || !requestedTime) return json({ error: 'Missing schedule' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Invalid amount' }, { status: 400 })

    const amountCentavos = Math.round(amount * 100)
    const description = `${consultMode || 'Consultation'} - ${serviceCategory}: ${serviceName}`

    const triageEnabled = body?.triage_enabled === true

    const bookingMetadata = {
      email,
      first_name: firstName,
      last_name: lastName,
      service_category: serviceCategory,
      service_name: serviceName,
      requested_date: requestedDate,
      requested_time: requestedTime,
      consult_mode: consultMode || 'Video Call',
      notes,
      ...(triageEnabled
        ? {
            main_concern: mainConcern,
            severity,
            symptoms,
            emergency_symptoms: emergencySymptoms,
            triage_level: Number.isFinite(Number(triageLevelRaw)) ? Number(triageLevelRaw) : null,
            priority_score: Number.isFinite(Number(priorityScoreRaw)) ? Number(priorityScoreRaw) : null,
            priority_label: priorityLabel || null,
            triage_reasons: triageReasons,
            queue: queue || null,
          }
        : {}),
    }

    const metadata = {
      reference,
      booking_json: JSON.stringify(bookingMetadata),
    }

    let checkoutUrl: string | null = null
    let checkoutSessionId: string | null = null
    let qrImageUrl: string | null = null
    let paymentIntentId: string | null = null
    let demoMode = false

    if (paymentMethod === 'qrph') {
      const piRes = await paymongoRequest(secretKey, '/v1/payment_intents', {
        data: {
          attributes: {
            amount: amountCentavos,
            currency: 'PHP',
            description,
            payment_method_allowed: ['qrph'],
            metadata,
          },
        },
      })

      paymentIntentId = piRes?.data?.id ?? null
      if (!paymentIntentId) throw new Error('Failed to create payment intent.')

      const pmRes = await paymongoRequest(secretKey, '/v1/payment_methods', {
        data: {
          attributes: {
            type: 'qrph',
            billing: {
              name: `${firstName} ${lastName}`.trim() || email,
              email,
            },
            metadata,
          },
        },
      })

      const paymentMethodId = pmRes?.data?.id ?? null
      if (!paymentMethodId) throw new Error('Failed to create payment method.')

      const attachRes = await paymongoRequest(secretKey, `/v1/payment_intents/${paymentIntentId}/attach`, {
        data: {
          attributes: {
            payment_method: paymentMethodId,
          },
        },
      })

      qrImageUrl =
        attachRes?.data?.attributes?.next_action?.code?.image_url ??
        attachRes?.data?.attributes?.next_action?.code?.url ??
        null

      if (!qrImageUrl) throw new Error('Failed to generate QRPh code.')
    } else {
      const checkoutPayload = {
        data: {
          attributes: {
            description,
            line_items: [
              {
                amount: amountCentavos,
                currency: 'PHP',
                name: serviceName,
                quantity: 1,
                description: serviceCategory,
              },
            ],
            payment_method_types: ['gcash', 'card'],
            reference_number: reference,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            success_url: 'https://example.com/payment-success',
            cancel_url: 'https://example.com/payment-cancel',
            metadata,
          },
        },
      }

      try {
        const checkoutRes = await paymongoRequest(secretKey, '/v1/checkout_sessions', checkoutPayload)
        checkoutUrl = checkoutRes?.data?.attributes?.checkout_url ?? null
        checkoutSessionId = checkoutRes?.data?.id ?? null
      } catch (err) {
        const message = `${(err as any)?.message || err}` || ''
        if (/invalid api key/i.test(message)) {
          demoMode = true
          checkoutUrl = 'https://example.com/pascualinga-demo-payment'
          checkoutSessionId = 'demo-session'
        } else {
          throw err
        }
      }
    }

    if (paymentMethod === 'qrph') {
      if (!paymentIntentId || !qrImageUrl) throw new Error('Failed to create QRPh payment.')
    } else {
      if (!checkoutUrl || !checkoutSessionId) throw new Error('Failed to create checkout session.')
    }

    if (debugSkipDb) {
      return json({ checkout_url: checkoutUrl, reference, checkout_session_id: checkoutSessionId, debug: 'skipped_db' })
    }

    const db = supabaseAdmin()
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
    const baseRow: Record<string, unknown> = {
      patient_email: email,
      amount,
      currency: 'PHP',
      provider: 'PayMongo',
      reference,
      service_category: serviceCategory,
      service_name: serviceName,
      requested_date: requestedDate,
      requested_time: requestedTime,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      status: demoMode ? 'paid' : 'pending',
    }

    const rowWithProviderIds: Record<string, unknown> = {
      ...baseRow,
      ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
      ...(checkoutSessionId ? { checkout_session_id: checkoutSessionId } : {}),
    }

    let insertError: any = null
    {
      const res = await db.from('payment_transactions').insert([rowWithProviderIds])
      insertError = res.error
    }

    if (insertError?.code === '42703') {
      const res2 = await db.from('payment_transactions').insert([baseRow])
      if (res2.error) throw res2.error
    } else if (insertError) {
      throw insertError
    }

    return json({
      checkout_url: checkoutUrl,
      checkout_session_id: checkoutSessionId,
      payment_intent_id: paymentIntentId,
      qr_image_url: qrImageUrl,
      reference,
      demo_mode: demoMode,
    })
  } catch (e) {
    return json({ error: `${e?.message || e}` }, { status: 400 })
  }
})
