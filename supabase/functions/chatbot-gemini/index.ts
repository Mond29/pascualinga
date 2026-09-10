import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

type HistoryItem = { from: "user" | "bot"; text: string };

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function ok(data: unknown) {
  return json(data, { status: 200 });
}

function clampText(v: unknown, max = 4000) {
  const s = `${v ?? ""}`.trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function buildPrompt(message: string, history: HistoryItem[]) {
  const historyText = history
    .slice(-12)
    .map((m) => `${m.from === "user" ? "User" : "Assistant"}: ${clampText(m.text, 800)}`)
    .join("\n");

  const system = [
    "You are the Pascualinga Virtual Assistant inside a hospital mobile app.",
    "Respond in English only.",
    "Be concise, helpful, and friendly.",
    "You help users with: booking services, referral attachments, payments, video consultations, schedules, records, and appointment history.",
    "If asked about information you do not have (e.g., exact hospital opening hours, specific fees, private account details), say you do not have that information and suggest contacting the hospital/clinic support desk.",
    "Do not invent facts. Do not provide medical diagnosis. Encourage consulting a clinician for medical advice.",
  ].join(" ");

  return `${system}\n\nConversation so far:\n${historyText || "(none)"}\n\nUser: ${message}\nAssistant:`;
}

function normalizeModelName(name: string) {
  const n = `${name || ""}`.trim();
  if (!n) return "";
  return n.startsWith("models/") ? n.slice("models/".length) : n;
}

async function listModels(apiKey: string, version: "v1beta" | "v1") {
  const url = `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      `${data?.error?.message ?? ""}`.trim() ||
      `ListModels failed (${res.status})`;
    return { ok: false as const, error: errMsg, models: [] as any[] };
  }
  const models = Array.isArray(data?.models) ? data.models : [];
  return { ok: true as const, models };
}

async function generateOnce(apiKey: string, prompt: string, model: string, version: "v1beta" | "v1") {
  const modelName = normalizeModelName(model);
  const url =
    `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      `${data?.error?.message ?? ""}`.trim() ||
      `Gemini request failed (${res.status})`;
    return { ok: false as const, error: errMsg };
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => `${p?.text ?? ""}`).join("") ?? "";
  const reply = `${text}`.trim();
  if (!reply) return { ok: false as const, error: "Empty AI response" };
  return { ok: true as const, reply };
}

function pickBestModel(models: any[]) {
  const usable = models.filter((m) => {
    const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
    const name = `${m?.name || ""}`.trim();
    return name && methods.includes("generateContent");
  });
  if (!usable.length) return "";

  const prefer = (needle: string) =>
    usable.find((m) => `${m?.name || ""}`.toLowerCase().includes(needle));

  return (
    `${prefer("flash")?.name || ""}`.trim() ||
    `${prefer("gemini")?.name || ""}`.trim() ||
    `${usable[0]?.name || ""}`.trim()
  );
}

async function geminiGenerate(apiKey: string, prompt: string) {
  const envModel = `${Deno.env.get("GEMINI_MODEL") ?? ""}`.trim();
  const modelCandidates = [
    envModel,
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-pro",
  ].filter(Boolean);

  const versions: Array<"v1beta" | "v1"> = ["v1beta", "v1"];
  let lastErr = "";

  for (const version of versions) {
    for (const model of modelCandidates) {
      const out = await generateOnce(apiKey, prompt, model, version);
      if (out.ok) return out;
      lastErr = out.error;
      if (!/not found|not supported|unsupported|model/i.test(out.error)) break;
    }

    const listed = await listModels(apiKey, version);
    if (listed.ok) {
      const best = pickBestModel(listed.models);
      if (best) {
        const out2 = await generateOnce(apiKey, prompt, best, version);
        if (out2.ok) return out2;
        lastErr = out2.error;
      } else {
        lastErr = "No available Gemini model supports generateContent for this API key.";
      }
    } else {
      lastErr = listed.error;
    }
  }

  return { ok: false as const, error: lastErr || "AI request failed" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok({ ok: false, error: "Method not allowed" });

  try {
    const payload = await req.json().catch(() => ({}));
    const message = clampText(payload?.message, 1200);
    const history = Array.isArray(payload?.history) ? (payload.history as HistoryItem[]) : [];

    if (!message) return ok({ ok: false, error: "Missing message" });

    const apiKey = `${Deno.env.get("GEMINI_API_KEY") ?? ""}`.trim();
    if (!apiKey) return ok({ ok: false, error: "Missing GEMINI_API_KEY secret" });

    const prompt = buildPrompt(message, history);
    const out = await geminiGenerate(apiKey, prompt);
    if (!out.ok) return ok({ ok: false, error: out.error });

    return ok({ ok: true, reply: out.reply, provider: "gemini" });
  } catch (e) {
    const msg = `${(e as any)?.message ?? ""}`.trim() || "Unexpected error";
    return ok({ ok: false, error: msg });
  }
});
