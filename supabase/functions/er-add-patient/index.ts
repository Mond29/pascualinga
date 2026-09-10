import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Inline CORS headers for maximum reliability
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-email, x-user-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

const toNum = (val: any) => {
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

const TRIAGE_TABLE_CANDIDATES = ['er_triage_logs', 'patient_triage_logs', 'triage_logs', 'er_triage_queue']
const VITALS_TABLE_CANDIDATES = ['patient_vitals_logs', 'er_vitals_logs', 'er_patient_vitals', 'vitals_logs']

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ ok: false, error: 'Internal Error: Missing environment variables.' })
    }

    const db = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })

    const callerEmail = `${req.headers.get('x-user-email') || ''}`.trim().toLowerCase()
    const callerRole = `${req.headers.get('x-user-role') || ''}`.trim().toLowerCase()
    let effectiveRole = callerRole

    if (callerEmail) {
      const { data: callerRes } = await db.from('accounts').select('roles').eq('email', callerEmail).maybeSingle()
      if (callerRes) {
        const dbRole = `${callerRes.roles || ''}`.toLowerCase()
        if (dbRole) effectiveRole = dbRole
      }
    }

    // Parse body safely
    let body: any = {}
    try {
      body = await req.json()
    } catch (e) {
      return json({ ok: false, error: 'Invalid JSON body.' })
    }

    const action = `${body?.action || ''}`.trim().toLowerCase()
    const isDoctorOnly =
      effectiveRole.includes('doctor') &&
      !effectiveRole.includes('nurse') &&
      !effectiveRole.includes('admin') &&
      !effectiveRole.includes('staff')

    // --- HANDLE DELETE ACTION ---
    if (action === 'delete') {
      if (isDoctorOnly) return json({ ok: false, error: 'Forbidden' }, 403)
      const patientId = body?.patientId
      if (!patientId) return json({ ok: false, error: 'Missing patientId for delete.' })

      console.log(`Deleting patient ${patientId} and related records...`)

      // 1. Delete Triage
      for (const t of TRIAGE_TABLE_CANDIDATES) {
        await db.from(t).delete().eq('patient_id', patientId)
      }

      // 2. Delete Vitals
      for (const t of VITALS_TABLE_CANDIDATES) {
        await db.from(t).delete().eq('patient_id', patientId)
      }
https://meet.jit.si/apt861tvu2ls
      // 3. Delete other related records (prescriptions, etc.)
      const RELATED_TABLES = [
        'prescriptions',
        'prescription_items',
        'medications',
        'medication_logs',
        'service_appointment',
        'appointment_approval_requests',
        'inpatient_monitoring_logs',
        'billing_records',
        'lab_results',
        'medical_notes',
        'medical_records',
        'triage_logs',
        'vitals_logs'
      ]

      console.log(`Cleaning up records for patient ${patientId}...`)
      
      for (const t of RELATED_TABLES) {
        try {
          // Attempt delete using patient_id
          const { error: delError } = await db.from(t).delete().eq('patient_id', patientId)
          if (delError && delError.code !== 'PGRST204' && delError.code !== '42P01') {
            console.error(`Warning: Failed to delete from ${t} using patient_id:`, delError.message)
          }

          // Also attempt delete using patientId (camelCase) just in case
          await db.from(t).delete().eq('patientId', patientId)
        } catch (e) {
          // Ignore tables that don't exist
        }
      }

      // 4. Delete Patient
      console.log(`Final step: Deleting patient ${patientId} from patients table...`)
      const { error } = await db.from('patients').delete().eq('id', patientId)
      
      if (error) {
        console.error('Delete failed:', error.message)
        return json({ 
          ok: false, 
          error: `Delete failed: ${error.message}. Please ensure all related records in other tables are removed first.` 
        })
      }

      return json({ ok: true, message: 'Patient and all related records deleted successfully.' })
    }

    if (isDoctorOnly) return json({ ok: false, error: 'Forbidden' }, 403)

    const patient = body?.patient || {}
    const vitals = body?.vitals || {}
    const triage = body?.triage || {}

    // --- TRAPPING: Check for existing patient (Duplicate Name + DOB) ---
    const firstName = `${patient?.first_name || ''}`.trim()
    const middleName = `${patient?.middle_name || ''}`.trim()
    const lastName = `${patient?.last_name || ''}`.trim()
    const dob = `${patient?.date_of_birth || patient?.dob || ''}`.trim()

    console.log('Trapping Check:', { firstName, middleName, lastName, dob })

    if (!firstName || !lastName || !dob) {
      return json({ ok: false, error: 'First Name, Last Name, and Date of Birth are required for trapping check.' })
    }

    // Query for exact match on core identity fields (Case-insensitive via ilike)
    let query = db
      .from('patients')
      .select('id, first_name, last_name, date_of_birth')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .eq('date_of_birth', dob)

    if (middleName) {
      query = query.ilike('middle_name', middleName)
    }

    const { data: existingResults, error: checkError } = await query.limit(1)

    if (checkError) {
      console.error('Trapping check error:', checkError)
    }

    if (existingResults && existingResults.length > 0) {
      const ep = existingResults[0]
      const existingName = `${ep.first_name} ${ep.last_name}`
      return json({ 
        ok: false, 
        error: `Trapping: A patient named "${existingName}" with birthdate ${dob} already exists in the system. Duplicates are not allowed.` 
      })
    }
    // -----------------------------------------------------------------

    // 1. Create Patient
    const patientInsert = await db
      .from('patients')
      .insert([
        {
          first_name: firstName,
          middle_name: `${patient?.middle_name || ''}`.trim() || null,
          last_name: lastName,
          date_of_birth: dob,
          email: `er-${Date.now()}-${Math.floor(Math.random() * 1000)}@pascualinga.temp`, // Fallback email
          created_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .maybeSingle()

    if (patientInsert.error) {
      return json({ ok: false, error: `Database Error (Patient): ${patientInsert.error.message}` })
    }

    const patientId = patientInsert.data?.id
    if (!patientId) {
      return json({ ok: false, error: 'Failed to retrieve created patient ID.' })
    }

    // 2. Save Vitals (Best effort)
    let vitalsSaved = false
    let vitalsError = null
    const hasVitals = `${vitals?.bp || ''}`.trim() || toNum(vitals?.hr) !== null
    
    if (hasVitals) {
      // Find valid vitals table
      let vitalsTable = null
      for (const t of VITALS_TABLE_CANDIDATES) {
        const { error } = await db.from(t).select('id').limit(1)
        if (!error || error.code !== 'PGRST205') {
          vitalsTable = t
          break
        }
      }

      if (vitalsTable) {
        const vRes = await db.from(vitalsTable).insert([{
          patient_id: patientId,
          context: 'ER',
          bp: `${vitals?.bp || ''}`.trim() || null,
          hr: toNum(vitals?.hr),
          rr: toNum(vitals?.rr),
          temp: toNum(vitals?.temp),
          spo2: toNum(vitals?.spo2),
          pain: toNum(vitals?.pain),
          notes: `${vitals?.notes || ''}`.trim() || null,
          created_at: new Date().toISOString(),
        }])
        if (vRes.error) vitalsError = vRes.error.message
        else vitalsSaved = true
      }
    }

    // 3. Save Triage (Best effort)
    let triageSaved = false
    let triageError = null
    const hasTriage = body?.triage && Object.keys(body.triage).length > 0

    if (hasTriage) {
      let triageTable = null
      for (const t of TRIAGE_TABLE_CANDIDATES) {
        const { error } = await db.from(t).select('id').limit(1)
        if (!error || error.code !== 'PGRST205') {
          triageTable = t
          break
        }
      }

      if (triageTable) {
        const tRes = await db.from(triageTable).insert([{
          patient_id: patientId,
          context: 'ER',
          main_concern: `${triage?.main_concern || ''}`.trim() || null,
          existing_conditions: `${triage?.existing_conditions || ''}`.trim() || null,
          symptoms: JSON.stringify(triage?.symptoms || []),
          emergency_symptoms: JSON.stringify(triage?.emergency_symptoms || []),
          triage_level: triage?.triage_level,
          priority_score: triage?.priority_score,
          priority_label: triage?.priority_label,
          reasons: JSON.stringify(triage?.reasons || []),
          created_at: new Date().toISOString(),
        }])
        if (tRes.error) triageError = tRes.error.message
        else triageSaved = true
      }
    }

    return json({
      ok: true,
      patientId,
      vitals: { saved: vitalsSaved, error: vitalsError },
      triage: { saved: triageSaved, error: triageError }
    })

  } catch (err: any) {
    console.error('Global Function Error:', err)
    return json({ 
      ok: false, 
      error: `Critical Error: ${err?.message || 'Unexpected crash.'}` 
    })
  }
})
