import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, paymongo-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseAdmin = () => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) throw new Error('Missing Supabase environment variables.')
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

const json = (body: any, init: any = {}) =>
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

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const hmacSha256Hex = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toHex(sig)
}

const parsePaymongoSignatureHeader = (header: string) => {
  const parts = header.split(',').map((p) => p.trim())
  const out: Record<string, string> = {}
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (k && v) out[k] = v
  }
  return out
}

const paymongoRetrieve = async (secretKey: string, path: string) => {
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
    throw new Error(`PayMongo ${res.status}: ${message}`)
  }
  return data
}

const extractBookingFromMetadata = (metadata: any) => {
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const reference = `${meta?.reference || ''}`.trim()
  const rawBooking = meta?.booking_json || meta?.booking || ''
  let booking: Record<string, unknown> = {}
  if (rawBooking && typeof rawBooking === 'string') {
    try {
      booking = JSON.parse(rawBooking)
    } catch (_) {
      booking = {}
    }
  } else if (rawBooking && typeof rawBooking === 'object') {
    booking = rawBooking as Record<string, unknown>
  }
  return { reference, booking }
}

const looksLikeMissingColumnError = (err: any) => {
  const msg = `${err?.message || ''}`.toLowerCase()
  return (
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column')
  )
}

const isUUID = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ''}`)

const insertAppointmentBestEffort = async (db: any, args: any) => {
  const {
    email,
    firstName,
    lastName,
    phone,
    dateOfBirth,
    requestedDate,
    requestedTime,
    serviceCategory,
    serviceType,
    mainConcern,
    reference,
  } = args

  const normalizeEmptyToNull = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : v
    return s === '' ? null : v
  }

  const safeDob = normalizeEmptyToNull(dateOfBirth)

  const candidates: Record<string, unknown>[] = [
    {
      email,
      first_name: firstName,
      last_name: lastName,
      phone,
      ...(safeDob !== null ? { date_of_birth: dateOfBirth } : {}),
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      category: serviceCategory,
      service_type: serviceType,
      main_concern: mainConcern,
      status: 'Confirmed',
      created_at: new Date().toISOString(),
    },
    {
      email,
      first_name: firstName,
      last_name: lastName,
      phone,
      ...(safeDob !== null ? { date_of_birth: dateOfBirth } : {}),
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      reason: serviceType,
      main_concern: mainConcern,
      status: 'Confirmed',
      created_at: new Date().toISOString(),
    },
    {
      email,
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      category: serviceCategory,
      service_type: serviceType,
      main_concern: mainConcern,
    },
    {
      email,
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      reason: serviceType,
      main_concern: mainConcern,
    },
    {
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      service_type: serviceType,
      main_concern: mainConcern,
    },
    {
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      reason: serviceType,
      main_concern: mainConcern,
    },
  ]

  let lastError: any = null
  for (const payload of candidates) {
    const res = await db.from('appointments').insert([payload]).select('id').maybeSingle()
    if (!res.error) return { inserted: true, id: res.data?.id ?? null }
    lastError = res.error
    if (!looksLikeMissingColumnError(res.error)) {
      const msg = `${res.error?.message || ''}`.toLowerCase()
      if (
        msg.includes('null value') ||
        msg.includes('not-null') ||
        msg.includes('violates') ||
        msg.includes('constraint')
      ) {
        continue
      }
      break
    }
  }

  if (lastError) throw lastError
  return { inserted: false, id: null }
}

const insertApprovalRequestBestEffort = async (db: any, args: any) => {
  const {
    patientId,
    patientName,
    email,
    requestedDate,
    requestedTime,
    reason,
    status,
    doctorName,
    nurseName,
  } = args

  const base: Record<string, unknown> = {
    patient_name: patientName,
    email,
    requested_date: requestedDate,
    requested_time: requestedTime,
    status,
    reason,
    doctor_name: doctorName,
    nurse_name: nurseName,
    created_at: new Date().toISOString(),
  }

  const candidates: Record<string, unknown>[] = [
    {
      ...base,
      ...(patientId && isUUID(patientId) ? { patient_id: patientId } : {}),
    },
    {
      ...base,
      ...(patientId && isUUID(patientId) ? { patient_id: patientId } : {}),
      email: undefined,
    },
    {
      patient_name: patientName,
      requested_date: requestedDate,
      requested_time: requestedTime,
      status,
      reason,
      doctor_name: doctorName,
      nurse_name: nurseName,
    },
  ].map((c) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(c)) {
      if (v !== undefined) out[k] = v
    }
    return out
  })

  let lastError: any = null
  for (const payload of candidates) {
    const res = await db.from('appointment_approval_requests').insert([payload]).select('id').maybeSingle()
    if (!res.error) return { inserted: true, id: res.data?.id ?? null }
    lastError = res.error
    if (!looksLikeMissingColumnError(res.error)) {
      const msg = `${res.error?.message || ''}`.toLowerCase()
      if (
        msg.includes('null value') ||
        msg.includes('not-null') ||
        msg.includes('violates') ||
        msg.includes('constraint')
      ) {
        continue
      }
      break
    }
  }

  if (lastError) throw lastError
  return { inserted: false, id: null }
}

const updatePaymentTransactionPaidBestEffort = async (db: any, args: any) => {
  const { reference, paymentIntentId, checkoutSessionId, referenceNumber } = args || {}
  const ref = `${reference || ''}`.trim()
  const refNum = `${referenceNumber || ''}`.trim()
  const pi = `${paymentIntentId || ''}`.trim()
  const csi = `${checkoutSessionId || ''}`.trim()
  const paidAt = new Date().toISOString()

  const attempt = async (matcher: { col: string; val: string }, payload: Record<string, unknown>) => {
    return await db.from('payment_transactions').update(payload).eq(matcher.col, matcher.val)
  }

  const progressivePayloads = [
    { status: 'paid', paid_at: paidAt, is_paid: true },
    { status: 'paid', paid_at: paidAt },
    { status: 'paid' },
  ]

  const matchers: { col: string; val: string }[] = []
  if (ref) matchers.push({ col: 'reference', val: ref })
  if (refNum) matchers.push({ col: 'reference_number', val: refNum })
  if (pi) matchers.push({ col: 'payment_intent_id', val: pi })
  if (csi) matchers.push({ col: 'checkout_session_id', val: csi })
  if (csi) matchers.push({ col: 'checkout_id', val: csi })

  for (const matcher of matchers) {
    for (const payload of progressivePayloads) {
      const res = await attempt(matcher, payload)
      if (!res.error) return
      if (res.error?.code !== '42703') break
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 })

  const secret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET') ?? ''
  if (!secret) return json({ error: 'Missing PAYMONGO_WEBHOOK_SECRET' }, { status: 500 })

  const signatureHeader = req.headers.get('paymongo-signature') ?? req.headers.get('Paymongo-Signature') ?? ''
  if (!signatureHeader) return json({ error: 'Missing Paymongo-Signature header' }, { status: 400 })

  const rawBody = await req.text()

  let payload: any = null
  try {
    const parsed = parsePaymongoSignatureHeader(signatureHeader)
    const timestamp = parsed.t
    const te = parsed.te
    const li = parsed.li
    if (!timestamp || (!te && !li)) return json({ error: 'Invalid signature header' }, { status: 400 })

    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
    payload = JSON.parse(rawBody)
    const livemode =
      payload?.data?.attributes?.livemode === true ||
      payload?.data?.attributes?.data?.attributes?.livemode === true ||
      payload?.attributes?.livemode === true
    const targetSig = livemode ? li : te
    const matches = !!targetSig && expected === targetSig
    if (!matches) return json({ error: 'Invalid signature' }, { status: 400 })
  } catch (e) {
    return json({ error: `${e?.message || e}` }, { status: 400 })
  }

  try {
    const eventType = payload?.data?.attributes?.type

    const payloadData = payload?.data?.attributes?.data
    const payloadAttrs = payloadData?.attributes

    let reference = ''
    let booking: Record<string, unknown> = {}
    const paymentIntentId = `${payloadAttrs?.payment_intent_id || ''}`.trim()
    const directRefNumber = `${payloadAttrs?.reference_number || ''}`.trim()
    const payloadDataId = `${payloadData?.id || ''}`.trim()
    const checkoutSessionId =
      `${payloadAttrs?.checkout_session_id || ''}`.trim() ||
      (payloadDataId.startsWith('cs_') ? payloadDataId : '') ||
      `${booking?.checkout_session_id || ''}`.trim()
    console.log(
      'paymongo-webhook received',
      JSON.stringify({
        eventType: eventType || null,
        paymentIntentId: paymentIntentId || null,
        checkoutSessionId: checkoutSessionId || null,
        directRefNumber: directRefNumber || null,
      }),
    )

    if (eventType === 'checkout_session.payment.paid') {
      const csMetadata = payloadAttrs?.metadata
      const extracted = extractBookingFromMetadata(csMetadata)
      reference = extracted.reference || directRefNumber || `${payloadAttrs?.reference_number || ''}`.trim()
      booking = extracted.booking
    } else if (eventType === 'payment.paid') {
      const paymentMetadata = payloadAttrs?.metadata
      const extracted = extractBookingFromMetadata(paymentMetadata)
      reference = extracted.reference || directRefNumber
      booking = extracted.booking

      if ((!reference || !booking || Object.keys(booking).length === 0) && paymentIntentId) {
        const paymongoSecretKey = (Deno.env.get('PAYMONGO_SECRET_KEY') ?? '').trim()
        if (paymongoSecretKey && isLikelyPaymongoSecretKey(paymongoSecretKey)) {
          const piRes = await paymongoRetrieve(paymongoSecretKey, `/v1/payment_intents/${paymentIntentId}`)
          const piAttrs = piRes?.data?.attributes
          const piExtracted = extractBookingFromMetadata(piAttrs?.metadata)
          reference = reference || piExtracted.reference || directRefNumber
          booking = Object.keys(booking).length ? booking : piExtracted.booking
        }
      }
    } else if (payload?.type === 'payment' && payload?.attributes?.status === 'paid') {
      const paymentAttrs = payload?.attributes
      const paymentMetadata = paymentAttrs?.metadata
      const extracted = extractBookingFromMetadata(paymentMetadata)
      reference = extracted.reference || directRefNumber
      booking = extracted.booking

      const directPaymentIntentId = `${paymentAttrs?.payment_intent_id || ''}`.trim()
      if ((!reference || !booking || Object.keys(booking).length === 0) && directPaymentIntentId) {
        const paymongoSecretKey = (Deno.env.get('PAYMONGO_SECRET_KEY') ?? '').trim()
        if (paymongoSecretKey && isLikelyPaymongoSecretKey(paymongoSecretKey)) {
          const piRes = await paymongoRetrieve(paymongoSecretKey, `/v1/payment_intents/${directPaymentIntentId}`)
          const piAttrs = piRes?.data?.attributes
          const piExtracted = extractBookingFromMetadata(piAttrs?.metadata)
          reference = reference || piExtracted.reference || directRefNumber
          booking = Object.keys(booking).length ? booking : piExtracted.booking
        }
      }
    } else {
      return json({ received: true })
    }

    const db = supabaseAdmin()

    let txFound = false
    let txEmail = ''
    let txRequestedDate = ''
    let txRequestedTime = ''
    let txServiceCategory = ''
    let txServiceName = ''
    try {
      const lookupBy =
        reference
          ? { col: 'reference', val: reference }
          : paymentIntentId
            ? { col: 'payment_intent_id', val: paymentIntentId }
            : null

      if (!lookupBy) throw new Error('No transaction identifier.')

      const txRes = await db
        .from('payment_transactions')
        .select('reference, patient_email, requested_date, requested_time, service_category, service_name')
        .eq(lookupBy.col, lookupBy.val)
        .maybeSingle()

      if (txRes.error?.code === '42703') {
        const txRes2 = await db
          .from('payment_transactions')
          .select('reference, patient_email, requested_date, requested_time')
          .eq(lookupBy.col, lookupBy.val)
          .maybeSingle()
        if (!txRes2.error && txRes2.data) {
          txFound = true
          reference = reference || `${(txRes2.data as any)?.reference || ''}`.trim()
          txEmail = `${(txRes2.data as any)?.patient_email || ''}`.trim()
          txRequestedDate = `${(txRes2.data as any)?.requested_date || ''}`.trim()
          txRequestedTime = `${(txRes2.data as any)?.requested_time || ''}`.trim()
        } else if (txRes2.error?.code === '42703') {
          // 3rd candidate: requested_date/requested_time also missing (legacy old schema)
          const txRes3 = await db
            .from('payment_transactions')
            .select('reference, patient_email')
            .eq(lookupBy.col, lookupBy.val)
            .maybeSingle()
          if (!txRes3.error && txRes3.data) {
            txFound = true
            reference = reference || `${(txRes3.data as any)?.reference || ''}`.trim()
            txEmail = `${(txRes3.data as any)?.patient_email || ''}`.trim()
          } else if (txRes3.error?.code === '42703') {
            // 4th candidate: ULTIMATE SAFE SELECT(*) — returns ALL EXISTING columns (cannot 42703, select(*))
            const txRes4 = await db
              .from('payment_transactions')
              .select('*')
              .eq(lookupBy.col, lookupBy.val)
              .maybeSingle()
            if (!txRes4.error && txRes4.data) {
              txFound = true
              const d = txRes4.data as any
              reference = reference || `${d?.reference || ''}`.trim()
              txEmail = `${d?.patient_email || d?.email || ''}`.trim()
              txRequestedDate = `${d?.requested_date || d?.appointment_date || d?.date || ''}`.trim()
              txRequestedTime = `${d?.requested_time || d?.appointment_time || d?.time || ''}`.trim()
              txServiceCategory = `${d?.service_category || d?.department || d?.category || ''}`.trim()
              txServiceName = `${d?.service_name || d?.service || d?.subservice || ''}`.trim()
            }
          }
        }
      } else if (!txRes.error && txRes.data) {
        txFound = true
        reference = reference || `${(txRes.data as any)?.reference || ''}`.trim()
        txEmail = `${(txRes.data as any)?.patient_email || ''}`.trim()
        txRequestedDate = `${(txRes.data as any)?.requested_date || ''}`.trim()
        txRequestedTime = `${(txRes.data as any)?.requested_time || ''}`.trim()
        txServiceCategory = `${(txRes.data as any)?.service_category || ''}`.trim()
        txServiceName = `${(txRes.data as any)?.service_name || ''}`.trim()
      }
    } catch (_) {}

    reference = `${reference || ''}`.trim()
    booking = booking || {}

    await updatePaymentTransactionPaidBestEffort(db, { reference, referenceNumber: directRefNumber, paymentIntentId, checkoutSessionId })

    if (!reference) {
      const out = {
        received: true,
        eventType: eventType || null,
        reference: null,
        paymentIntentId: paymentIntentId || null,
        txFound,
      }
      console.log('paymongo-webhook result', JSON.stringify(out))
      return json(out)
    }

    const bookingEmail = `${booking?.email || ''}`.trim()
    const email = bookingEmail || txEmail
    const firstName = `${booking?.first_name || ''}`.trim()
    const lastName = `${booking?.last_name || ''}`.trim()
    const serviceCategory = `${booking?.service_category || ''}`.trim() || txServiceCategory
    const serviceName = `${booking?.service_name || ''}`.trim() || txServiceName
    const requestedDate = `${booking?.requested_date || ''}`.trim() || txRequestedDate
    const requestedTime = `${booking?.requested_time || ''}`.trim() || txRequestedTime
    const bookingKeys = Object.keys(booking || {})
    const usedTransactionFallback =
      !!txFound &&
      (!bookingEmail ||
        !`${booking?.requested_date || ''}`.trim() ||
        !`${booking?.requested_time || ''}`.trim() ||
        !`${booking?.service_category || ''}`.trim() ||
        !`${booking?.service_name || ''}`.trim())

    let phone = ''
    let dateOfBirth = ''
    let patientId = ''
    if (email) {
      const profileRes = await db
        .from('accounts')
        .select('id, phone, date_of_birth')
        .eq('email', email)
        .maybeSingle()
      if (!profileRes.error && profileRes.data) {
        patientId = `${(profileRes.data as any)?.id || ''}`.trim()
        phone = `${profileRes.data.phone || ''}`.trim()
        dateOfBirth = `${profileRes.data.date_of_birth || ''}`.trim()
      }
    }

    let approvalUpdated = 0
    let approvalFallbackUpdated = 0
    let approvalInserted = false
    let approvalId: string | number | null = null
    let approvalMatchCount = 0
    let approvalMatchIds: Array<string | number> = []
    if (reference) {
      const updatePayload: Record<string, unknown> = { status: 'Approved' }
      const reasonNeedle = `%PAYREF:${reference}%`
      const updateRes = await db
        .from('appointment_approval_requests')
        .update(updatePayload)
        .ilike('reason', reasonNeedle)
        .neq('status', 'Approved')
        .neq('status', 'Declined')
        .neq('status', 'Cancelled')
        .select('id')
      approvalUpdated = Array.isArray(updateRes.data) ? updateRes.data.length : 0

      if (approvalUpdated === 0 && email && requestedDate && requestedTime) {
        const res3 = await db
          .from('appointment_approval_requests')
          .update(updatePayload)
          .eq('email', email)
          .eq('requested_date', requestedDate)
          .eq('requested_time', requestedTime)
          .neq('status', 'Approved')
          .neq('status', 'Declined')
          .neq('status', 'Cancelled')
          .select('id')
        approvalFallbackUpdated = Array.isArray(res3.data) ? res3.data.length : 0
      }

      {
        const matchRes = await db
          .from('appointment_approval_requests')
          .select('id')
          .ilike('reason', reasonNeedle)
          .order('created_at', { ascending: false })
          .limit(3)
        if (matchRes.error?.code === '42703') {
          const matchRes2 = await db.from('appointment_approval_requests').select('id').ilike('reason', reasonNeedle).limit(3)
          approvalMatchCount = Array.isArray(matchRes2.data) ? matchRes2.data.length : 0
          approvalMatchIds = Array.isArray(matchRes2.data) ? matchRes2.data.map((r: any) => r?.id).filter(Boolean) : []
        } else {
          approvalMatchCount = Array.isArray(matchRes.data) ? matchRes.data.length : 0
          approvalMatchIds = Array.isArray(matchRes.data) ? matchRes.data.map((r: any) => r?.id).filter(Boolean) : []
        }
      }

      if (approvalUpdated === 0 && approvalFallbackUpdated === 0) {
        const exists = approvalMatchCount > 0
        if (!exists && email && requestedDate && requestedTime) {
          const patientName = `${[firstName, lastName].filter(Boolean).join(' ')}`.trim() || email
          const reasonText = reasonNeedle.startsWith('%') ? `Video Consultation | PAYREF:${reference}` : reasonNeedle
          const insertReason =
            serviceCategory || serviceName
              ? `Video Consultation - ${serviceCategory}${serviceName ? `: ${serviceName}` : ''} | PAYREF:${reference}`
              : `Video Consultation | PAYREF:${reference}`

          const ins = await insertApprovalRequestBestEffort(db, {
            patientId,
            patientName,
            email,
            requestedDate,
            requestedTime,
            reason: insertReason || reasonText,
            status: 'Approved',
            doctorName: 'Doctor',
            nurseName: 'Nurse',
          })
          approvalInserted = ins.inserted === true
          approvalId = ins.id ?? null
        }
      }
    }

    let appointmentInserted = false
    let appointmentId: string | number | null = null
    let appointmentMatchCount = 0
    let appointmentMatchIds: Array<string | number> = []
    let appointmentStatusUpdated = 0

    if (requestedDate && requestedTime) {
      const baseLabel =
        serviceCategory || serviceName
          ? `Video Consultation - ${serviceCategory}: ${serviceName}`
          : 'Video Consultation'
      const computedServiceType = `${baseLabel} | PAYREF:${reference}`
      const mainConcern = serviceName || serviceCategory || baseLabel

      let alreadyExists = false
      if (email) {
        const existsRes = await db
          .from('appointments')
          .select('id')
          .eq('email', email)
          .like('service_type', `%PAYREF:${reference}%`)
          .limit(1)
          .maybeSingle()

        if (existsRes.error?.code === '42703') {
          const existsRes2 = await db
            .from('appointments')
            .select('id')
            .eq('email', email)
            .like('reason', `%PAYREF:${reference}%`)
            .limit(1)
            .maybeSingle()
          alreadyExists = !!existsRes2.data?.id
        } else {
          alreadyExists = !!existsRes.data?.id
        }
      }

      if (!alreadyExists) {
        const insertRes = await insertAppointmentBestEffort(db, {
          email,
          firstName,
          lastName,
          phone,
          dateOfBirth,
          requestedDate,
          requestedTime,
          serviceCategory,
          serviceType: computedServiceType,
          mainConcern,
          reference,
        })
        appointmentInserted = insertRes.inserted === true
        appointmentId = insertRes.id ?? null
      } else if (email) {
        const matchLike = `%PAYREF:${reference}%`
        const matchRes = await db
          .from('appointments')
          .select('id')
          .eq('email', email)
          .like('service_type', matchLike)
          .limit(3)
        if (matchRes.error?.code === '42703') {
          const matchRes2 = await db.from('appointments').select('id').eq('email', email).like('reason', matchLike).limit(3)
          appointmentMatchCount = Array.isArray(matchRes2.data) ? matchRes2.data.length : 0
          appointmentMatchIds = Array.isArray(matchRes2.data) ? matchRes2.data.map((r: any) => r?.id).filter(Boolean) : []
        } else {
          appointmentMatchCount = Array.isArray(matchRes.data) ? matchRes.data.length : 0
          appointmentMatchIds = Array.isArray(matchRes.data) ? matchRes.data.map((r: any) => r?.id).filter(Boolean) : []
        }

        const updateRes = await db
          .from('appointments')
          .update({ status: 'Confirmed' })
          .eq('email', email)
          .like('service_type', matchLike)
          .neq('status', 'Confirmed')
          .select('id')
        if (updateRes.error?.code === '42703') {
          const updateRes2 = await db
            .from('appointments')
            .update({ status: 'Confirmed' })
            .eq('email', email)
            .like('reason', matchLike)
            .neq('status', 'Confirmed')
            .select('id')
          appointmentStatusUpdated = Array.isArray(updateRes2.data) ? updateRes2.data.length : 0
        } else {
          appointmentStatusUpdated = Array.isArray(updateRes.data) ? updateRes.data.length : 0
        }
      }
    }

    const out = {
      received: true,
      eventType: eventType || null,
      reference,
      email: email || null,
      requestedDate: requestedDate || null,
      requestedTime: requestedTime || null,
      bookingKeys,
      txFound,
      usedTransactionFallback,
      approvalUpdated,
      approvalFallbackUpdated,
      approvalInserted,
      approvalId,
      approvalMatchCount,
      approvalMatchIds,
      appointmentInserted,
      appointmentId,
      appointmentMatchCount,
      appointmentMatchIds,
      appointmentStatusUpdated,
    }
    console.log('paymongo-webhook result', JSON.stringify(out))
    return json(out)
  } catch (e) {
    const message = `${(e as any)?.message || e}` || 'Unknown error'
    console.error('paymongo-webhook error:', message)
    console.error('env presence:', {
      hasSupabaseUrl: !!(Deno.env.get('SUPABASE_URL') ?? '').trim(),
      hasServiceRoleKey: !!(
        (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
      ),
      hasWebhookSecret: !!(Deno.env.get('PAYMONGO_WEBHOOK_SECRET') ?? '').trim(),
      hasPaymongoSecretKey: !!(Deno.env.get('PAYMONGO_SECRET_KEY') ?? '').trim(),
    })
    return json({ error: message }, { status: 500 })
  }
})
