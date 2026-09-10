import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
  })

const coerceText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const normalize = (v: unknown) => coerceText(v).toLowerCase().trim()

const isPrivateHostname = (hostname: string) => {
  const h = hostname.toLowerCase().trim()
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '127.0.0.1' || h === '::1') return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  const c = Number(m[3])
  const d = Number(m[4])
  const ok = [a, b, c, d].every((x) => Number.isInteger(x) && x >= 0 && x <= 255)
  if (!ok) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

const parseSafeUrl = (raw: string) => {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (isPrivateHostname(u.hostname)) return null
    return u
  } catch (_) {
    return null
  }
}

const scoreFromText = (textRaw: string, ctx: { serviceCategory: string; serviceName: string }) => {
  const text = normalize(textRaw)
  const reasons: string[] = []
  const hasAnyText = text.length >= 30
  if (!hasAnyText) reasons.push('No readable text detected in the image.')

  const needles = [
    { key: 'referral', w: 18, label: 'Referral keyword detected' },
    { key: 'referred', w: 10, label: 'Referred keyword detected' },
    { key: 'doctor', w: 10, label: 'Doctor keyword detected' },
    { key: 'dr.', w: 10, label: 'Doctor title detected' },
    { key: 'md', w: 8, label: 'MD keyword detected' },
    { key: 'prc', w: 10, label: 'PRC keyword detected' },
    { key: 'license', w: 10, label: 'License keyword detected' },
    { key: 'clinic', w: 8, label: 'Clinic keyword detected' },
    { key: 'hospital', w: 8, label: 'Hospital keyword detected' },
    { key: 'patient', w: 6, label: 'Patient keyword detected' },
    { key: 'date', w: 6, label: 'Date keyword detected' },
    { key: 'signature', w: 6, label: 'Signature keyword detected' },
    { key: 'assessment', w: 4, label: 'Assessment keyword detected' },
    { key: 'diagnosis', w: 4, label: 'Diagnosis keyword detected' },
    { key: 'impression', w: 4, label: 'Impression keyword detected' },
  ]

  let score = 0
  if (text.length >= 60) score += 20
  else if (text.length >= 30) score += 10

  let hits = 0
  for (const n of needles) {
    if (text.includes(n.key)) {
      score += n.w
      hits += 1
    }
  }

  const hasDatePattern = /\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/.test(text) || /\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](20\d{2}|19\d{2})\b/.test(text)
  if (hasDatePattern) score += 12
  else reasons.push('No date detected.')

  const hasProvider = text.includes('dr.') || text.includes('doctor') || text.includes('md') || text.includes('prc') || text.includes('license')
  if (!hasProvider) reasons.push('No doctor/provider indicators detected.')

  const serviceNeedle = normalize(ctx.serviceName || ctx.serviceCategory)
  if (serviceNeedle && serviceNeedle.length >= 3 && text.includes(serviceNeedle.slice(0, Math.min(18, serviceNeedle.length)))) {
    score += 8
  }

  if (hits >= 5) score += 10
  if (hits === 0) reasons.push('No referral-related keywords detected.')

  score = Math.max(0, Math.min(100, score))
  const passed = score >= 70 && hasAnyText && hasProvider && hasDatePattern
  const verdict = passed ? 'Passed' : 'Rejected'
  const summary = passed
    ? 'Referral text detected and matched required indicators.'
    : 'Referral verification failed based on OCR content.'

  return { passed, score, verdict, summary, reasons }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, { status: 405 })

  try {
    const body = await req.json().catch(() => ({}))
    const url = coerceText((body as any)?.url || (body as any)?.publicUrl).trim()
    const serviceCategory = coerceText((body as any)?.serviceCategory || (body as any)?.service_category).trim()
    const serviceName = coerceText((body as any)?.serviceName || (body as any)?.service_name).trim()
    const debug = (body as any)?.debug === true

    if (!url) return json({ ok: false, error: 'Missing url' }, { status: 400 })
    const safeUrl = parseSafeUrl(url)
    if (!safeUrl) return json({ ok: false, error: 'Invalid or unsafe url' }, { status: 400 })

    const apiKey = (Deno.env.get('OCRSPACE_API_KEY') ?? 'helloworld').trim()
    const usedDemoKey = apiKey === 'helloworld'

    const imgRes = await fetch(safeUrl.toString())
    if (!imgRes.ok) return json({ ok: false, error: `Failed to fetch image (${imgRes.status})` }, { status: 400 })

    const contentType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim() || 'image/jpeg'
    const bytes = new Uint8Array(await imgRes.arrayBuffer())
    if (!bytes.length) return json({ ok: false, error: 'Empty image' }, { status: 400 })
    if (bytes.length > 10_000_000) return json({ ok: false, error: 'Image too large' }, { status: 413 })

    const dataUri = `data:${contentType};base64,${encodeBase64(bytes)}`
    const form = new FormData()
    form.append('apikey', apiKey)
    form.append('language', 'eng')
    form.append('isOverlayRequired', 'false')
    form.append('OCREngine', '2')
    form.append('base64Image', dataUri)

    const ocrRes = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form })
    const ocrText = await ocrRes.text()
    let ocrJson: any = null
    try {
      ocrJson = ocrText ? JSON.parse(ocrText) : null
    } catch (_) {
      ocrJson = null
    }

    const parsedResults = Array.isArray(ocrJson?.ParsedResults) ? ocrJson.ParsedResults : []
    const extracted = parsedResults.map((r: any) => coerceText(r?.ParsedText)).join('\n').trim()

    const score = scoreFromText(extracted, { serviceCategory, serviceName })
    const sample = extracted ? extracted.slice(0, 280) : ''

    return json({
      ok: true,
      passed: score.passed,
      score: score.score,
      verdict: score.verdict,
      summary: score.summary,
      reasons: score.reasons,
      extracted_text_sample: sample,
      provider: 'ocr.space',
      used_demo_key: usedDemoKey,
      ...(debug ? { debug: { ocr_status: ocrRes.status, raw_len: ocrText.length } } : {}),
    })
  } catch (e) {
    const msg = coerceText((e as any)?.message || e).trim() || 'Unknown error'
    return json({ ok: false, error: msg }, { status: 500 })
  }
})
