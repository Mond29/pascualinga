import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-role, x-user-email',
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
  })

const coerceText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const normalizeText = (v: unknown) => coerceText(v).replace(/\s+/g, ' ').trim().toLowerCase()

const detectProvider = (roomUrlOrName: string): string => {
  if (/daily\.co/i.test(roomUrlOrName)) return 'daily'
  if (
    /jits/i.test(roomUrlOrName)
    || roomUrlOrName.includes('meet.jit.si')
    || roomUrlOrName.includes('8x8.vc')
    || roomUrlOrName.includes('framatalk.org')
    || roomUrlOrName.includes('jitsi.riot.im')
    || roomUrlOrName.includes('jitsi.fsf.org')
  ) return 'jitsi'
  return 'unknown'
}

const buildJitsiUrl = (roomShortName: string, baseUrl?: string): string => {
  const base = (baseUrl || 'https://meet.jit.si').replace(/\/+$/, '')
  const safeName = (roomShortName || `pascualinga-${Math.random().toString(36).slice(2, 10)}`).replace(/[^a-zA-Z0-9_-]/g, '')
  return `${base}/${safeName}`
}

const saveRoomUrlToTables = async (
  supabase: any,
  sourceTable: string,
  aptId: string,
  url: string,
) => {
  const trySaveTo = async (table: string, column: string) => {
    try {
      await supabase
        .from(table as any)
        .update({ [column]: url } as any)
        .eq('id', aptId as any)
    } catch (_) {}
  }

  if (sourceTable === 'appointments') {
    await Promise.all([
      trySaveTo('appointments', 'meeting_room_id'),
      trySaveTo('appointments', 'meeting_room'),
      trySaveTo('appointments', 'video_room'),
    ])
  } else if (sourceTable === 'appointment_approval_requests') {
    await Promise.all([
      trySaveTo('appointment_approval_requests', 'meeting_room'),
      trySaveTo('appointment_approval_requests', 'meeting_room_id'),
      trySaveTo('appointment_approval_requests', 'video_room'),
    ])
  } else if (sourceTable === 'service_appointment') {
    await Promise.all([
      trySaveTo('service_appointment', 'meeting_room_id'),
      trySaveTo('service_appointment', 'meeting_room'),
      trySaveTo('service_appointment', 'video_room'),
    ])
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, { status: 405 })

  try {
    const body = await req.json().catch(() => ({}))

    const appointmentId = coerceText(
      (body as any)?.appointmentId ||
      (body as any)?.appointment_id ||
      (body as any)?.id ||
      '',
    ).trim()
    if (!appointmentId) return json({ ok: false, error: 'Missing appointment id' }, { status: 400 })

    const sourceTableHint = coerceText((body as any)?.sourceTable || (body as any)?.source_table || '').trim()

    const action = coerceText((body as any)?.action || 'start').trim().toLowerCase()
    if (!['start', 'join'].includes(action)) {
      return json({ ok: false, error: 'Invalid action' }, { status: 400 })
    }

    const requesterRole = (
      coerceText((body as any)?.role) ||
      coerceText(req.headers.get('x-user-role')) ||
      'patient'
    ).trim().toLowerCase()

    const requesterEmail = (
      coerceText((body as any)?.email) ||
      coerceText(req.headers.get('x-user-email')) ||
      ''
    ).trim().toLowerCase()

    const requesterName = (
      coerceText((body as any)?.name) ||
      coerceText((body as any)?.displayName) ||
      coerceText((body as any)?.display_name) ||
      coerceText(req.headers.get('x-user-name')) ||
      ''
    ).trim()

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceKey =
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
        Deno.env.get('SERVICE_ROLE_KEY') ??
        Deno.env.get('SUPABASE_SERVICE_KEY') ??
        '').trim()

    const dailyApiKey =
      (Deno.env.get('DAILY_API_KEY') ??
        Deno.env.get('DAILY_KEY') ??
        '').trim()

    const providerMode = normalizeText(
      Deno.env.get('PROVIDER_MODE') ?? Deno.env.get('VIDEO_PROVIDER') ?? '',
    )

    const jitsiBaseUrl = (Deno.env.get('JITSI_BASE_URL') ?? '').trim() || 'https://meet.jit.si'

    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Missing Supabase service secrets.' }, { status: 500 })
    }

    // ---------- JITSI PROVIDER (instant fallback — no keys/accounts/billing needed) ----------
    // Use Jitsi immediately if:
    //   1. PROVIDER_MODE secret is explicitly set to "jitsi", OR
    //   2. PROVIDER_MODE is not "daily" AND there is no valid Daily API key
    const forceJitsi =
      providerMode === 'jitsi' ||
      (providerMode !== 'daily' && !dailyApiKey)

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    let apt: any = null
    let sourceTable = ''

    const tableCandidates: Array<string> = []
    const knownTables = ['appointments', 'appointment_approval_requests', 'service_appointment']
    if (sourceTableHint && knownTables.includes(sourceTableHint)) tableCandidates.push(sourceTableHint)
    knownTables.forEach((t) => {
      if (!tableCandidates.includes(t)) tableCandidates.push(t)
    })

    for (const t of tableCandidates) {
      if (apt) break
      try {
        const r = await supabase.from(t).select('*').eq('id', appointmentId).limit(1).maybeSingle()
        if (r?.data) {
          apt = r.data
          sourceTable = t
        }
      } catch (_) {}
    }

    if (!apt) {
      return json({ ok: false, error: 'Appointment not found' }, { status: 404 })
    }

    const aptId = `${apt.id}`

    const modeKey = normalizeText(
      apt.consultation_mode ||
      apt.mode ||
      apt.consultationType ||
      apt.consultation_type ||
      apt.category ||
      `${apt.service_type || ''} ${apt.reason || ''}`,
    )
    const isVideo =
      modeKey.includes('video') ||
      modeKey.includes('online') ||
      modeKey.includes('tele')

    if (action === 'start' && !isVideo) {
      return json({ ok: false, error: 'This appointment is not an online consultation.' }, { status: 400 })
    }

    const patientEmail = normalizeText(
      apt.patient_email || apt.email || apt.user_email || apt.patientEmail || '',
    )
    const doctorEmail = normalizeText(
      apt.doctor_email || apt.doctorEmail || apt.staff_email || apt.assigned_doctor_email || apt.doctoruuid || '',
    )
    const doctorName = coerceText(
      apt.doctor_name || apt.doctorName || apt.doctor || apt.doctor_id || apt.assigned_doctor || apt.assignedDoctor || '',
    ).trim()

    const isPatient =
      requesterRole === 'patient' ||
      (!!patientEmail && requesterEmail && requesterEmail === patientEmail)

    const isDoctor =
      requesterRole === 'doctor' ||
      requesterRole === 'nurse' ||
      requesterRole === 'er-doctor' ||
      requesterRole === 'er-nurse' ||
      requesterRole === 'secretary' ||
      requesterRole === 'receptionist' ||
      (!!doctorEmail && requesterEmail && requesterEmail === doctorEmail) ||
      (!!doctorName && requesterEmail && normalizeText(doctorName).includes(requesterEmail.split('@')[0]))

    if (!isPatient && !isDoctor) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 403 })
    }

    const extractDailyRoomName = (u: string): string => {
      try {
        const url = new URL(u)
        const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
        return parts[parts.length - 1] || ''
      } catch (_) {
        return ''
      }
    }

    const makeTokenFor = async (opts: {
      roomName: string
      userName: string
      userEmail?: string
      isOwner?: boolean
    }): Promise<string | null> => {
      const props: Record<string, any> = {
        room_name: opts.roomName,
        user_name: opts.userName || 'Guest',
        is_owner: !!opts.isOwner,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      }
      const reqBody = { properties: props }
      try {
        const r = await fetch('https://api.daily.co/v1/meeting-tokens', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${dailyApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reqBody),
        })
        const txt = await r.text()
        if (!r.ok) {
          console.warn('[daily-create-room] makeTokenFor failed:', r.status, txt)
          return null
        }
        const parsed = txt ? JSON.parse(txt) : null
        const t = coerceText(parsed?.token || parsed || '').trim()
        return t || null
      } catch (e) {
        console.warn('[daily-create-room] makeTokenFor exception:', `${(e as any)?.message || e}`)
        return null
      }
    }

    const makeTokenUrl = (base: string, token: string | null) => {
      if (!token) return base
      try {
        const u = new URL(base)
        u.searchParams.set('t', token)
        return u.toString()
      } catch (_) {
        return base
      }
    }

    const attendeeDefaultName = patientEmail ? patientEmail.split('@')[0] : 'Patient'
    const requesterDisplayName =
      requesterName ||
      (isDoctor ? (doctorName || (doctorEmail ? doctorEmail.split('@')[0] : 'Doctor')) : attendeeDefaultName)
    const isOwnerCaller = isDoctor === true

    const buildTokensFor = async (roomUrl: string, roomName?: string) => {
      const rName = (roomName || extractDailyRoomName(roomUrl) || '').trim()

      const ownerDisplayName = doctorName || (doctorEmail ? doctorEmail.split('@')[0] : 'Doctor')
      const ownerToken = rName ? (await makeTokenFor({
        roomName: rName,
        userName: ownerDisplayName,
        userEmail: doctorEmail || requesterEmail || undefined,
        isOwner: true,
      })) : null

      const attendeeName = attendeeDefaultName || requesterDisplayName || 'Patient'
      const attendeeEmail = patientEmail || requesterEmail || undefined
      const attendeeToken = rName ? (await makeTokenFor({
        roomName: rName,
        userName: attendeeName,
        userEmail: attendeeEmail,
        isOwner: false,
      })) : null

      const requesterToken = isOwnerCaller
        ? (ownerToken || (rName ? await makeTokenFor({
          roomName: rName,
          userName: requesterDisplayName,
          userEmail: requesterEmail || doctorEmail || undefined,
          isOwner: true,
        }) : null))
        : (attendeeToken || (rName ? await makeTokenFor({
          roomName: rName,
          userName: requesterDisplayName,
          userEmail: requesterEmail || patientEmail || undefined,
          isOwner: false,
        }) : null))

      const tokenUrl = requesterToken ? makeTokenUrl(roomUrl, requesterToken) : roomUrl
      return {
        roomName: rName,
        ownerToken,
        attendeeToken,
        requesterToken,
        tokenUrl,
      }
    }

    const existingRoom = coerceText(
      apt.meeting_room_id || apt.meeting_room || apt.video_room || apt.room_url || '',
    ).trim()

    const safeAptId = aptId.replace(/[^A-Za-z0-9_-]/g, '')

    // ════════════════════════════════════════════════════════════════
    // DETERMINISTIC ROOM NAME (same appointmentId = same room FOREVER!)
    // Avoid random suffix so patient and doctor always land on the same room.
    // Formula: apt-{safeAptId}-{8CharStableHash(safeAptId)}
    // ════════════════════════════════════════════════════════════════
    const stableShortHash = (s: string) => {
      const salt = 'pascualinga-telehealth-v1'
      let h = 2166136261
      const input = `${salt}:${s || ''}`
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i)
        h = Math.imul(h, 16777619)
      }
      const u = h >>> 0
      return u.toString(36).padStart(7, '0').slice(0, 8)
    }
    const roomShortName = `apt-${safeAptId}-${stableShortHash(safeAptId)}`.slice(0, 80) || `pascualinga-${stableShortHash(safeAptId)}`

    // ════════════════════════════════════════════════════════════════
    // CROSS-TABLE EXISTING ROOM REUSE
    // Patient/doctor may read from different tables (approval_requests vs appointments vs service_appointment).
    // If any OTHER table already stored a Jitsi room for the same appointment id, REUSE IT —
    // never create a second room!
    // ════════════════════════════════════════════════════════════════
    const findExistingRoomAnywhere = async (id: string): Promise<string | null> => {
      if (!id) return null
      const tables = ['appointments', 'appointment_approval_requests', 'service_appointment']
      const columns = ['meeting_room_id', 'meeting_room', 'video_room', 'room_url']
      for (const table of tables) {
        for (const col of columns) {
          try {
            const res = await supabase.from(table).select(col).eq('id', id).limit(1).maybeSingle()
            if (!res.error && res.data) {
              const val = coerceText((res.data as any)[col] || '').trim()
              if (val && /^https?:/i.test(val)) return val
            }
          } catch (_) { /* ignore RLS/column errors */ }
        }
      }
      return null
    }
    const crossExistingRoom = existingRoom ? existingRoom : (await findExistingRoomAnywhere(aptId) || '')
    const effectiveExisting = existingRoom || crossExistingRoom

    // ════════════════════════════════════════════════════════════════
    // JITSI PROVIDER BRANCH (100% free, no account, no billing)
    // ════════════════════════════════════════════════════════════════
    const existingIsJitsi = effectiveExisting && detectProvider(effectiveExisting) === 'jitsi'
    if (forceJitsi || existingIsJitsi) {
      let url = existingIsJitsi ? effectiveExisting : ''
      if (!url) url = buildJitsiUrl(roomShortName, jitsiBaseUrl)

      // Save to DB
      try { await saveRoomUrlToTables(supabase, sourceTable, aptId, url) } catch (_) {}

      // Jitsi needs no meeting tokens — tokenUrl is the plain URL.
      return json({
        ok: true,
        provider: 'jitsi',
        url,
        tokenUrl: url,
        token: '',
        ownerToken: '',
        attendeeToken: '',
        appointmentId: aptId,
        sourceTable,
        providerRoomName: roomShortName,
      })
    }

    // ════════════════════════════════════════════════════════════════
    // DAILY.CO PROVIDER BRANCH (only reached if Jitsi NOT forced)
    // ════════════════════════════════════════════════════════════════
    if (!dailyApiKey) {
      return json({ ok: false, error: 'Missing DAILY_API_KEY secret. Either add the key or set PROVIDER_MODE=jitsi secret.' }, { status: 500 })
    }

    if (effectiveExisting && /\.daily\.co/i.test(effectiveExisting)) {
      const tk = await buildTokensFor(effectiveExisting)
      return json({
        ok: true,
        provider: 'daily',
        url: effectiveExisting,
        tokenUrl: tk.tokenUrl,
        token: tk.requesterToken,
        ownerToken: tk.ownerToken,
        attendeeToken: tk.attendeeToken,
        appointmentId: aptId,
        sourceTable,
      })
    }

    if (action === 'join' && effectiveExisting) {
      const tk = await buildTokensFor(effectiveExisting)
      return json({
        ok: true,
        provider: detectProvider(effectiveExisting),
        url: effectiveExisting,
        tokenUrl: tk.tokenUrl,
        token: tk.requesterToken,
        ownerToken: tk.ownerToken,
        attendeeToken: tk.attendeeToken,
        appointmentId: aptId,
        sourceTable,
      })
    }

    const dailyPayload = {
      name: roomShortName,
      privacy: 'public',
    }

    const createRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dailyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dailyPayload),
    })

    const createText = await createRes.text()
    let createJson: any = null
    try { createJson = createText ? JSON.parse(createText) : null } catch {}

    if (!createRes.ok) {
      return json(
        {
          ok: false,
          error:
            createJson?.info ||
            createJson?.error ||
            createText ||
            'Failed to create Daily room',
          provider: 'daily',
        },
        { status: createRes.status },
      )
    }

    const url: string = coerceText(createJson?.url || '').trim()
    if (!url || !/\.daily\.co/i.test(url)) {
      return json({ ok: false, error: 'Daily returned an invalid room URL.' }, { status: 502 })
    }

    const tk = await buildTokensFor(url, createJson?.name || roomShortName)
    const tokenUrl = tk.tokenUrl

    try { await saveRoomUrlToTables(supabase, sourceTable, aptId, url) } catch (_) {}

    return json({
      ok: true,
      provider: 'daily',
      url,
      tokenUrl,
      token: tk.requesterToken,
      ownerToken: tk.ownerToken,
      attendeeToken: tk.attendeeToken,
      appointmentId: aptId,
      sourceTable,
      providerRoomName: createJson?.name || roomShortName,
    })
  } catch (e) {
    const msg = `${(e as any)?.message || e || ''}`.trim()
    return json({ ok: false, error: msg || 'Unknown error' }, { status: 500 })
  }
})
