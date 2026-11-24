import workletUrl from './capture.worklet.js?url'
import { createStore } from '../lib/store'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, touchMeeting, uid, type AsrLanguage } from '../db/schema'
import { floatToPcm16Blob, pcm16BlobsToFloat } from '../lib/audio'
import type { AsrIn, AsrOut, CloudAsr } from './protocol'

export interface RecorderState {
  status: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'
  meetingId?: string
  elapsedMs: number
  level: number
  speaking: boolean
  partial: string
  asr: 'off' | 'loading' | 'ready' | 'error'
  asrStage?: string
  backend?: string
  rtf?: number
  message?: string
  /** Offline (re)transcription progress 0..1, when running. */
  offline?: number
}

export const recorder = createStore<RecorderState>({
  status: 'idle', elapsedMs: 0, level: -90, speaking: false, partial: '', asr: 'off',
})
const patch = (p: Partial<RecorderState>) => recorder.set((s) => ({ ...s, ...p }))

// ---- engine: Typhoon ASR ----------------------------------------------------
export const TYPHOON_ASR_MODELS = ['typhoon-asr-realtime', 'typhoon-asr-edge']
export interface AsrConfig { available: boolean; reason?: string; cloud?: CloudAsr; host?: string; system?: boolean }

/** Typhoon ASR: the user's own Typhoon key if set, otherwise the built-in proxy (no key on device). */
export async function resolveAsr(): Promise<AsrConfig> {
  const all = await db.providers.toArray()
  const p = all.find((x) => x.baseUrl?.includes('opentyphoon') && x.apiKey) ?? all.find((x) => x.managed)
  if (!p) return { available: false, reason: 'ต้องเชื่อมต่อ Typhoon API ก่อน' }
  const model = await getSetting('asr.cloudModel', TYPHOON_ASR_MODELS[0])
  return { available: true, system: !!p.managed, host: new URL(p.baseUrl!).host, cloud: { baseUrl: p.baseUrl!, apiKey: p.apiKey, model } }
}

export function useAsrConfig(): AsrConfig | undefined {
  return useLiveQuery(resolveAsr, [])
}

// ---- ASR worker (singleton) -------------------------------------------------
let worker: Worker | null = null
let asrReady: Promise<void> | null = null
let onFinal: ((m: Extract<AsrOut, { type: 'final' }>) => void) | null = null
let onOffline: ((m: AsrOut) => void) | null = null

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<AsrOut>) => {
    const m = e.data
    switch (m.type) {
      case 'level': patch({ level: m.db, speaking: m.speaking }); break
      case 'partial': patch({ partial: m.text }); break
      case 'final': patch({ partial: '', rtf: m.rtf }); onFinal?.(m); break
      case 'error': patch({ message: m.message }); break
    }
    onOffline?.(m)
  }
  return worker
}
const send = (m: AsrIn, transfer?: Transferable[]) => getWorker().postMessage(m, transfer ?? [])

/** Shared access to the ASR worker for other features such as voice chat. */
export const asrSend = send
export function onAsrMessage(cb: (m: AsrOut) => void): () => void {
  const w = getWorker()
  const h = (e: MessageEvent<AsrOut>) => cb(e.data)
  w.addEventListener('message', h)
  return () => w.removeEventListener('message', h)
}
export { workletUrl as captureWorkletUrl }

let workerKey = ''

export async function ensureAsr(): Promise<AsrConfig> {
  const cfg = await resolveAsr()
  if (!cfg.available || !cfg.cloud) throw new Error(cfg.reason)
  const key = `${cfg.cloud.baseUrl}:${cfg.cloud.model}:${(cfg.cloud.apiKey ?? '').slice(-6)}`
  if (worker && key !== workerKey) { worker.terminate(); worker = null; asrReady = null }
  workerKey = key
  if (!asrReady) {
    patch({ asr: 'loading' })
    asrReady = new Promise<void>((resolve, reject) => {
      const w = getWorker()
      const h = (e: MessageEvent<AsrOut>) => {
        if (e.data.type === 'ready') { w.removeEventListener('message', h); patch({ asr: 'ready', backend: e.data.backend }); resolve() }
        if (e.data.type === 'error') { w.removeEventListener('message', h); patch({ asr: 'error' }); asrReady = null; reject(new Error(e.data.message)) }
      }
      w.addEventListener('message', h)
      send({ type: 'init', cloud: cfg.cloud! })
    })
  }
  await asrReady
  return cfg
}

/** Restart the ASR worker (e.g. after the Typhoon model/key changed). */
export function unloadAsr() {
  if (recorder.get().status !== 'idle') return
  worker?.terminate()
  worker = null
  asrReady = null
  patch({ asr: 'off', backend: undefined })
}

// ---- live recording ----------------------------------------------------------
let ctx: AudioContext | null = null
let stream: MediaStream | null = null
let node: AudioWorkletNode | null = null
let wakeLock: { release(): Promise<void> } | null = null
let timer = 0
let startedAt = 0
let baseMs = 0
let pending: Float32Array[] = []
let pendingLen = 0
let chunkSeq = 0
let chunkStartMs = 0
const CHUNK_SAMPLES = 16000 * 10

async function savePending(meetingId: string) {
  if (!pendingLen) return
  const all = new Float32Array(pendingLen)
  let o = 0
  for (const p of pending) { all.set(p, o); o += p.length }
  pending = []
  pendingLen = 0
  const startMs = chunkStartMs
  chunkStartMs += (all.length / 16000) * 1000
  await db.audio.add({ id: uid(), meetingId, seq: chunkSeq++, startMs, sampleRate: 16000, pcm: floatToPcm16Blob(all) })
}

export async function startRecording(meetingId: string, language: AsrLanguage, transcribe: boolean) {
  if (recorder.get().status !== 'idle') return
  patch({ status: 'starting', meetingId, message: undefined, partial: '' })
  // Create the AudioContext synchronously inside the tap: browsers (iOS Safari especially)
  // start contexts created after an await as "suspended" and the worklet would get no audio.
  ctx = new AudioContext()
  ctx.resume()
  try {
    const meeting = await db.meetings.get(meetingId)
    baseMs = meeting?.durationMs ?? 0
    const lastChunk = await db.audio.where('[meetingId+seq]').between([meetingId, -Infinity], [meetingId, Infinity]).last()
    chunkSeq = lastChunk ? lastChunk.seq + 1 : 0
    chunkStartMs = baseMs

    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    let asrOn = false
    if (transcribe) {
      try {
        await ensureAsr()
        send({ type: 'reset', offsetMs: baseMs })
        asrOn = true
      } catch (err) {
        patch({ message: `บันทึกเสียงอย่างเดียว: ${(err as Error).message}` })
      }
    }
    onFinal = (m) => {
      if (!m.text) return
      db.segments.add({ id: uid(), meetingId, startMs: m.startMs, endMs: m.endMs, text: m.text, source: 'asr' })
    }
    await ctx.audioWorklet.addModule(workletUrl)
    await ctx.resume()
    const src = ctx.createMediaStreamSource(stream)
    node = new AudioWorkletNode(ctx, 'capture-processor')
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (recorder.get().status !== 'recording') return
      const pcm = e.data
      pending.push(pcm)
      pendingLen += pcm.length
      if (pendingLen >= CHUNK_SAMPLES) savePending(meetingId)
      if (asrOn) send({ type: 'audio', pcm: pcm.slice() }, [])
      else {
        let e2 = 0
        for (let i = 0; i < pcm.length; i++) e2 += pcm[i] * pcm[i]
        patch({ level: 10 * Math.log10(e2 / pcm.length + 1e-12) })
      }
    }
    src.connect(node)
    try { wakeLock = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { wakeLock = null }
    startedAt = performance.now()
    timer = window.setInterval(() => patch({ elapsedMs: baseMs + performance.now() - startedAt }), 250)
    await touchMeeting(meetingId, { status: 'recording', language })
    patch({ status: 'recording', elapsedMs: baseMs })
  } catch (err) {
    await teardown()
    patch({ status: 'idle', message: err instanceof Error ? err.message : String(err) })
  }
}

export function pauseRecording() {
  const s = recorder.get()
  if (s.status === 'recording') {
    ctx?.suspend()
    baseMs = s.elapsedMs
    clearInterval(timer)
    send({ type: 'flush' })
    patch({ status: 'paused' })
  } else if (s.status === 'paused') {
    ctx?.resume()
    startedAt = performance.now()
    timer = window.setInterval(() => patch({ elapsedMs: baseMs + performance.now() - startedAt }), 250)
    patch({ status: 'recording' })
  }
}

async function teardown() {
  clearInterval(timer)
  onFinal = null // stop writing segments once this recording is over (voice chat shares the worker)
  node?.disconnect()
  stream?.getTracks().forEach((t) => t.stop())
  await ctx?.close().catch(() => {})
  await wakeLock?.release().catch(() => {})
  ctx = null; stream = null; node = null; wakeLock = null
}

export async function stopRecording() {
  const s = recorder.get()
  if (s.status !== 'recording' && s.status !== 'paused') return
  const meetingId = s.meetingId!
  patch({ status: 'stopping' })
  const elapsed = s.status === 'recording' ? baseMs + performance.now() - startedAt : baseMs
  await teardown()
  if (worker) send({ type: 'flush' })
  await savePending(meetingId)
  await touchMeeting(meetingId, { status: 'done', durationMs: elapsed, endedAt: Date.now() })
  patch({ status: 'idle', elapsedMs: 0, level: -90, speaking: false, partial: '' })
}

// ---- offline (re)transcription -------------------------------------------------
export async function transcribeRecording(meetingId: string) {
  await ensureAsr()
  const chunks = await db.audio.where('[meetingId+seq]').between([meetingId, -Infinity], [meetingId, Infinity]).toArray()
  if (!chunks.length) throw new Error('ไม่มีไฟล์เสียงของการประชุมนี้')
  await db.segments.where('meetingId').equals(meetingId).filter((s) => s.source === 'asr' && !s.edited).delete()
  const pcm = await pcm16BlobsToFloat(chunks.map((c) => c.pcm))
  patch({ offline: 0 })
  await new Promise<void>((resolve) => {
    onOffline = (m) => {
      if (m.type === 'final' && m.text) db.segments.add({ id: uid(), meetingId, startMs: m.startMs, endMs: m.endMs, text: m.text, source: 'asr' })
      if (m.type === 'progress') patch({ offline: m.doneMs / m.totalMs })
      if (m.type === 'transcribed' || m.type === 'error') { onOffline = null; resolve() }
    }
    send({ type: 'transcribe', pcm, offsetMs: chunks[0].startMs }, [pcm.buffer])
  })
  patch({ offline: undefined })
}
