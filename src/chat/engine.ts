/**
 * Realtime voice conversation about a meeting (half-duplex):
 *   mic → VAD/ASR worker (local OpenThai or Typhoon) → LLM with meeting context → TTS (MakHam)
 * While the assistant speaks the mic is muted (no self-transcription); tapping interrupts.
 */
import { createStore } from '../lib/store'
import { db, getSetting, touchMeeting, type AiProviderConfig, type Meeting } from '../db/schema'
import { asrSend, captureWorkletUrl, ensureAsr, onAsrMessage, recorder } from '../asr/recorder'
import { createProvider } from '../ai/registry'
import { primeTts, speak, stopSpeaking, waitSpeechEnd } from '../tts/player'
import { CHAT_SYSTEM, DEBRIEF_REQUEST, buildChatPrompt, parseReply, visibleWhileStreaming, type Turn } from './prompt'

export type Phase = 'off' | 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking'
export interface ChatState {
  phase: Phase
  turns: Turn[]
  partial: string
  draft: string
  error?: string
  level: number
  provider?: string
  asrHost?: string
  voiceReply: boolean
}

export const chat = createStore<ChatState>({ phase: 'off', turns: [], partial: '', draft: '', level: -90, voiceReply: true })
const patch = (p: Partial<ChatState>) => chat.set((s) => ({ ...s, ...p }))

let meeting: Meeting | null = null
let cfg: AiProviderConfig | null = null
let ctx: AudioContext | null = null
let stream: MediaStream | null = null
let node: AudioWorkletNode | null = null
let unsub: (() => void) | null = null
let abort: AbortController | null = null
let micOpen = false
let lastMeetingId = ''

/** Chat needs a real LLM (the extractive summarizer can't converse). */
async function pickProvider(): Promise<AiProviderConfig> {
  const list = await db.providers.orderBy('createdAt').toArray()
  const def = await getSetting('ai.default', '')
  const p = list.find((x) => x.id === def) ?? list.find((x) => x.baseUrl?.includes('opentyphoon')) ?? list[0]
  if (!p) throw new Error('ต้องเพิ่ม AI ก่อน (แนะนำ Typhoon API) ที่หน้า ตั้งค่า → AI ช่วยสรุป')
  return p
}

export async function openChat(m: Meeting, opts: { listen: boolean; debrief?: boolean }) {
  if (recorder.get().status !== 'idle') throw new Error('ปิดการบันทึกก่อน แล้วค่อยคุยกับผู้ช่วย')
  primeTts() // must run inside the user's tap for iOS audio
  // Mic context too: created before any await so it isn't born "suspended".
  const early = opts.listen ? new AudioContext() : undefined
  early?.resume()
  // Conversations are per meeting; a debrief always starts fresh.
  if (lastMeetingId !== m.id || opts.debrief) chat.set((s) => ({ ...s, turns: [] }))
  lastMeetingId = m.id
  meeting = m
  const my = ++session
  patch({ phase: 'starting', error: undefined, partial: '', draft: '' })
  try {
    cfg = await pickProvider()
    if (my !== session) { early?.close(); return }
    patch({ provider: cfg.label })
    if (opts.listen) await startMic(early)
    else patch({ phase: 'listening' })
    // Post-meeting debrief: the assistant speaks first with a short recap.
    if (opts.debrief && my === session && !chat.get().turns.length) await respond(DEBRIEF_REQUEST, false)
  } catch (e) {
    early?.close()
    patch({ phase: 'off', error: (e as Error).message })
    throw e
  }
}

let session = 0 // bumps on every open/close so late async steps from an old session bail out

async function startMic(early?: AudioContext) {
  const my = session
  const ac = early ?? new AudioContext()
  ac.resume()
  let asr
  try { asr = await ensureAsr() } catch (e) { if (!early) ac.close(); throw e }
  if (my !== session) { ac.close(); return }
  patch({ asrHost: asr.host })
  unsub?.()
  unsub = onAsrMessage((m) => {
    if (chat.get().phase === 'off') return
    if (m.type === 'level' && micOpen) patch({ level: m.db, phase: m.speaking ? 'hearing' : chat.get().phase === 'hearing' ? 'listening' : chat.get().phase })
    if (m.type === 'partial' && micOpen) patch({ partial: m.text })
    if (m.type === 'final' && micOpen && m.text.trim()) ask(m.text.trim())
    if (m.type === 'error') patch({ error: m.message })
  })
  asrSend({ type: 'reset', offsetMs: 0 })
  const st = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  try {
    await ac.audioWorklet.addModule(captureWorkletUrl)
    await ac.resume()
  } catch (e) { st.getTracks().forEach((t) => t.stop()); ac.close(); throw e }
  if (my !== session) { st.getTracks().forEach((t) => t.stop()); ac.close(); return } // superseded while awaiting
  const n = new AudioWorkletNode(ac, 'capture-processor')
  n.port.onmessage = (e: MessageEvent<Float32Array>) => { if (micOpen) asrSend({ type: 'audio', pcm: e.data.slice() }) }
  ac.createMediaStreamSource(st).connect(n)
  stream = st; ctx = ac; node = n
  micOpen = true
  patch({ phase: 'listening' })
}

function muteMic() {
  micOpen = false
  asrSend({ type: 'reset', offsetMs: 0 }) // drop half-heard audio so it can't leak into the next turn
}
function unmuteMic() {
  if (!stream) return patch({ phase: 'listening' })
  asrSend({ type: 'reset', offsetMs: 0 })
  micOpen = true
  patch({ phase: 'listening', partial: '' })
}

/** Ask a question (spoken or typed). */
export const ask = (text: string) => respond(text, true)

async function respond(text: string, fromUser: boolean) {
  if (!meeting || !cfg || !text.trim()) return
  muteMic()
  stopSpeaking()
  abort?.abort()
  abort = new AbortController()
  const history = chat.get().turns
  patch({ phase: 'thinking', partial: '', draft: '', error: undefined, turns: fromUser ? [...history, { role: 'user', text }] : history })
  try {
    const fresh = (await db.meetings.get(meeting.id)) ?? meeting
    const prompt = await buildChatPrompt(fresh, history, text, cfg.chunkChars ?? 24000)
    let raw = ''
    const out = await createProvider(cfg).complete({
      system: CHAT_SYSTEM, prompt, signal: abort.signal,
      onText: (d) => { raw += d; patch({ draft: visibleWhileStreaming(raw) }) },
    })
    const { reply, notes } = parseReply(out || raw)
    if (notes.length) await saveNotes(notes)
    patch({ turns: [...chat.get().turns, { role: 'assistant', text: reply || 'บันทึกให้เรียบร้อยแล้วค่ะ', notes }], draft: '' })
    if (chat.get().voiceReply && reply) {
      patch({ phase: 'speaking' })
      await speak(reply, 'chat')
      await waitSpeechEnd()
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') patch({ error: (e as Error).message })
  }
  if (chat.get().phase !== 'off') unmuteMic()
}

async function saveNotes(notes: string[]) {
  const m = await db.meetings.get(meeting!.id)
  if (!m) return
  const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const add = notes.map((n) => `• [${time} ผู้ช่วย] ${n}`).join('\n')
  await touchMeeting(m.id, { notes: m.notes ? `${m.notes.trimEnd()}\n${add}` : add })
}

/** Tap while the assistant is talking/thinking → stop it and listen again. */
export function interrupt() {
  abort?.abort()
  stopSpeaking()
  patch({ draft: '' })
  unmuteMic()
}

export async function toggleMic() {
  if (stream) { closeMic(); patch({ phase: 'listening' }) }
  else await startMic().catch((e) => patch({ error: (e as Error).message }))
}

function closeMic() {
  micOpen = false
  node?.disconnect()
  stream?.getTracks().forEach((t) => t.stop())
  ctx?.close().catch(() => {})
  node = null; stream = null; ctx = null
}

export const micActive = () => !!stream

export function closeChat() {
  session++
  abort?.abort()
  stopSpeaking()
  closeMic()
  unsub?.(); unsub = null
  meeting = null
  patch({ phase: 'off', partial: '', draft: '', level: -90 })
}

export function resetConversation() { chat.set((s) => ({ ...s, turns: [], error: undefined })) }
export function setVoiceReply(v: boolean) { patch({ voiceReply: v }); if (!v) stopSpeaking() }
