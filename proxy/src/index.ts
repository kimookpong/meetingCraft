/**
 * meetingCraft → Typhoon API proxy.
 *
 * Keeps the Typhoon key server-side (Worker secret) so the static PWA on GitHub Pages
 * never ships it. Hardening: origin allowlist (CORS), per-IP rate limit, endpoint and
 * model allowlists, request-size caps, max_tokens cap. Responses (incl. SSE) are streamed.
 */
const UPSTREAM = 'https://api.opentyphoon.ai'
const ROUTES: Record<string, { method: 'GET' | 'POST'; maxBytes: number }> = {
  '/v1/chat/completions': { method: 'POST', maxBytes: 1_500_000 },
  '/v1/audio/transcriptions': { method: 'POST', maxBytes: 4_000_000 }, // ≤ ~20 s of 16 kHz WAV is ~640 KB
  '/v1/models': { method: 'GET', maxBytes: 0 },
}
const CHAT_MODELS = /^typhoon-/
const MAX_TOKENS = 4096

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function json(status: number, error: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { message: error } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const t0 = Date.now()
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    const originOk = allowed.includes(origin)
    const cors = originOk ? corsHeaders(origin) : {}

    if (url.pathname === '/health') return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } })
    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors })
    // Browsers always send Origin on cross-origin requests; scripts can spoof it, hence the rate limit below.
    if (!originOk) return json(403, 'origin not allowed')

    const route = ROUTES[url.pathname]
    if (!route) return json(404, 'not found', cors)
    if (request.method !== route.method) return json(405, 'method not allowed', cors)

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const { success } = await env.RL_IP.limit({ key: ip })
    if (!success) return json(429, 'คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', { ...cors, 'Retry-After': '60' })

    const headers = new Headers({ Authorization: `Bearer ${env.TYPHOON_API_KEY.trim()}` })
    let body: BodyInit | null = null

    if (route.method === 'POST') {
      const len = Number(request.headers.get('Content-Length') ?? NaN)
      if (!Number.isFinite(len)) return json(411, 'content-length required', cors)
      if (len > route.maxBytes) return json(413, 'request too large', cors)
      const ct = request.headers.get('Content-Type') ?? ''
      headers.set('Content-Type', ct)

      if (url.pathname === '/v1/chat/completions') {
        // Small, size-capped JSON: safe to parse so we can enforce model + output limits.
        let payload: { model?: unknown; max_tokens?: unknown; [k: string]: unknown }
        try { payload = await request.json() } catch { return json(400, 'invalid json', cors) }
        if (typeof payload.model !== 'string' || !CHAT_MODELS.test(payload.model)) return json(400, 'model not allowed', cors)
        payload.max_tokens = Math.min(Number(payload.max_tokens) || MAX_TOKENS, MAX_TOKENS)
        body = JSON.stringify(payload)
        headers.set('Content-Type', 'application/json')
      } else {
        if (!ct.startsWith('multipart/form-data')) return json(415, 'multipart/form-data required', cors)
        body = request.body // stream the audio through without buffering
      }
    }

    const upstream = await fetch(`${UPSTREAM}${url.pathname}`, { method: route.method, headers, body })
    const out = new Headers(cors)
    for (const h of ['Content-Type', 'Cache-Control', 'Retry-After']) {
      const v = upstream.headers.get(h)
      if (v) out.set(h, v)
    }
    console.log(JSON.stringify({ path: url.pathname, status: upstream.status, ms: Date.now() - t0 }))
    return new Response(upstream.body, { status: upstream.status, headers: out })
  },
} satisfies ExportedHandler<Env>
