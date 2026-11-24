import { db, setSetting, uid } from '../db/schema'
import { presetFor } from './presets'

/** One-step Typhoon setup: verify the key, save the provider, make it the default summarizer. */
export async function connectTyphoon(apiKey: string) {
  const p = presetFor('typhoon')!
  const existing = (await db.providers.toArray()).find((x) => x.baseUrl?.includes('opentyphoon') && !x.managed)
  const cfg = existing
    ? { ...existing, apiKey }
    : { id: uid(), kind: p.kind, label: 'Typhoon API', baseUrl: p.baseUrl, model: p.model, chunkChars: p.chunkChars, apiKey, createdAt: Date.now() }
  // /v1/models is public on Typhoon (200 without a key), so verify with a 1-token chat call.
  const res = await fetch(`${cfg.baseUrl!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
  })
  if (res.status === 401 || res.status === 403) throw new Error('API key ไม่ถูกต้องหรือถูกยกเลิกแล้ว')
  if (!res.ok) throw new Error(`Typhoon ตอบกลับ HTTP ${res.status}`)
  await db.providers.put(cfg)
  await setSetting('ai.default', cfg.id) // the user explicitly chose their own key
  return cfg
}
