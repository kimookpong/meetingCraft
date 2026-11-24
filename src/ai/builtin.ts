import { db, getSetting, setSetting } from '../db/schema'
import { presetFor } from './presets'
import { EXTRACTIVE_ID } from './registry'

/**
 * Built-in Typhoon access through the meetingCraft proxy (Cloudflare Worker, see /proxy).
 * The Worker holds the API key as a secret, so nothing sensitive ships in this static app.
 * VITE_TYPHOON_PROXY_URL is public, e.g. https://meetingcraft-typhoon-proxy.<sub>.workers.dev/v1
 */
export const BUILTIN_TYPHOON_ID = 'builtin-typhoon'
export const BUILTIN_TYPHOON_URL = (import.meta.env.VITE_TYPHOON_PROXY_URL ?? '').trim().replace(/\/$/, '')

export async function ensureBuiltinTyphoon() {
  const existing = await db.providers.get(BUILTIN_TYPHOON_ID)
  if (!BUILTIN_TYPHOON_URL) { if (existing) await db.providers.delete(BUILTIN_TYPHOON_ID); return }
  const p = presetFor('typhoon')!
  await db.providers.put({
    id: BUILTIN_TYPHOON_ID, kind: 'openai-compatible', label: 'Typhoon (meetingCraft)', baseUrl: BUILTIN_TYPHOON_URL,
    model: existing?.model ?? p.model, chunkChars: existing?.chunkChars ?? p.chunkChars, managed: true,
    createdAt: existing?.createdAt ?? Date.now(),
  })
  if ((await getSetting('ai.default', EXTRACTIVE_ID)) === EXTRACTIVE_ID) await setSetting('ai.default', BUILTIN_TYPHOON_ID)
}
