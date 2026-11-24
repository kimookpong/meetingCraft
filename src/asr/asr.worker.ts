/// <reference lib="webworker" />
/**
 * Speech-to-text worker (Typhoon ASR, OpenAI-compatible /audio/transcriptions).
 *
 * An energy VAD cuts the 16 kHz mic stream into utterances at ~0.7 s pauses; the
 * open utterance is re-sent every ~3 s for a live "partial", and the closed utterance
 * is sent once more as "final". Only short WAV clips leave the device.
 */
import { EnergyVad, VAD_FRAME } from './vad'
import type { AsrIn, AsrOut, CloudAsr } from './protocol'

const SAMPLE_RATE = 16000
const post = (m: AsrOut) => (self as unknown as Worker).postMessage(m)
const PARTIAL_EVERY = Math.round(3 * SAMPLE_RATE)
const MAX_UTTERANCE = 20 * SAMPLE_RATE
const PREROLL = Math.round(0.3 * SAMPLE_RATE)
const BATCH_MAX = 25 * SAMPLE_RATE
const BATCH_GAP = 3 * SAMPLE_RATE

let cloud: CloudAsr | null = null

function init(remote: CloudAsr) {
  cloud = remote
  post({ type: 'ready', backend: new URL(remote.baseUrl).host })
}

function wav16(audio: Float32Array): Blob {
  const h = new DataView(new ArrayBuffer(44))
  const str = (o: number, t: string) => [...t].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  const pcm = new Int16Array(audio.length)
  for (let i = 0; i < audio.length; i++) pcm[i] = Math.max(-1, Math.min(1, audio[i])) * 0x7fff
  str(0, 'RIFF'); h.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE'); str(12, 'fmt ')
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true)
  h.setUint32(24, SAMPLE_RATE, true); h.setUint32(28, SAMPLE_RATE * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true)
  str(36, 'data'); h.setUint32(40, pcm.byteLength, true)
  return new Blob([h.buffer, pcm.buffer], { type: 'audio/wav' })
}

const normalizeThai = (t: string) => t
  .replace(/([\u0E48-\u0E4B]?)\u0E4D([\u0E48-\u0E4B]?)\u0E32/g, '$1$2\u0E33') // decomposed sara am → ำ
  .normalize('NFC')
  .replace(/\s+/g, ' ')
  .trim()

async function decode(audio: Float32Array): Promise<string> {
  if (!cloud) throw new Error('Typhoon API is not configured')
  const form = new FormData()
  form.append('file', wav16(audio), 'utterance.wav') // must carry audio/wav; octet-stream is rejected
  form.append('model', cloud.model)
  // Ask for phrase timestamps so we can put spaces where the speaker paused.
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  let res: Response
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${cloud.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST', headers: cloud.apiKey ? { Authorization: `Bearer ${cloud.apiKey}` } : {}, body: form,
    })
    // Rate limited (proxy or Typhoon): wait as told, then retry — long imports keep going.
    if (res.status !== 429 || attempt >= 6) break
    const wait = Math.min(60, Number(res.headers.get('Retry-After')) || 10 * (attempt + 1))
    await new Promise((r) => setTimeout(r, wait * 1000))
  }
  if (!res.ok) throw new Error(`Transcription failed (HTTP ${res.status}) ${(await res.text()).slice(0, 160)}`)
  return normalizeThai(spaced(await res.json()))
}

/** Gap (seconds) between timed phrases that becomes a space in the transcript. */
const PAUSE_SPACE = 0.2

/** Join timed phrases with a space at every pause ≥ PAUSE_SPACE; plain text when no timestamps. */
function spaced(j: { text?: string; timestamps?: { word?: { start: number; end: number; text: string }[] } }): string {
  const words = j.timestamps?.word
  if (!words?.length) return String(j.text ?? '')
  let out = ''
  let prevEnd = -1
  for (const w of words) {
    const t = String(w.text ?? '').trim()
    if (!t) continue
    out += out && (w.start - prevEnd >= PAUSE_SPACE || /\s$/.test(w.text)) ? ' ' + t : t
    prevEnd = w.end
  }
  return out
}

// ---- streaming state -------------------------------------------------------
const vad = new EnergyVad()
let offsetMs = 0
let totalSamples = 0
let carry = new Float32Array(0)
const preroll: Float32Array[] = []
let prerollLen = 0
let utter: Float32Array[] = []
let utterLen = 0
let utterStart = 0
let lastPartialAt = 0
let busy = false
const finals: { audio: Float32Array; start: number }[] = []
let levelTick = 0

const concat = (parts: Float32Array[], len: number) => {
  const a = new Float32Array(len)
  let o = 0
  for (const p of parts) { a.set(p, o); o += p.length }
  return a
}
const ms = (samples: number) => offsetMs + (samples / SAMPLE_RATE) * 1000

function closeUtterance() {
  if (utterLen > SAMPLE_RATE * 0.3) finals.push({ audio: concat(utter, utterLen), start: utterStart })
  utter = []
  utterLen = 0
  pump()
}

function pushAudio(pcm: Float32Array) {
  const data = carry.length ? concat([carry, pcm], carry.length + pcm.length) : pcm
  let i = 0
  for (; i + VAD_FRAME <= data.length; i += VAD_FRAME) {
    const f = data.slice(i, i + VAD_FRAME)
    const ev = vad.push(f)
    if (ev === 'start') {
      utter = [...preroll]
      utterLen = prerollLen
      utterStart = totalSamples - prerollLen
      lastPartialAt = utterLen
    }
    if (vad.inSpeech || ev === 'end') {
      utter.push(f)
      utterLen += f.length
    }
    if (ev === 'end') closeUtterance()
    else if (vad.inSpeech && utterLen >= MAX_UTTERANCE) {
      closeUtterance()
      utterStart = totalSamples + f.length
      lastPartialAt = 0
    }
    preroll.push(f)
    prerollLen += f.length
    while (prerollLen - preroll[0].length >= PREROLL) prerollLen -= preroll.shift()!.length
    totalSamples += f.length
    if (++levelTick % 5 === 0) {
      let e = 0
      for (let k = 0; k < f.length; k++) e += f[k] * f[k]
      post({ type: 'level', db: 10 * Math.log10(e / f.length + 1e-12), speaking: vad.inSpeech })
    }
  }
  carry = data.slice(i)
  if (vad.inSpeech && utterLen - lastPartialAt >= PARTIAL_EVERY) pump(true)
}

async function pump(partial = false) {
  if (busy) return
  busy = true
  try {
    while (finals.length) {
      const f = finals.shift()!
      const t0 = performance.now()
      const text = await decode(f.audio)
      const rtf = (performance.now() - t0) / ((f.audio.length / SAMPLE_RATE) * 1000)
      post({ type: 'final', startMs: ms(f.start), endMs: ms(f.start + f.audio.length), text, rtf })
    }
    if (partial && vad.inSpeech && utterLen > 0) {
      lastPartialAt = utterLen
      const audio = concat(utter, utterLen)
      const text = await decode(audio)
      if (vad.inSpeech) post({ type: 'partial', startMs: ms(utterStart), endMs: ms(utterStart + audio.length), text })
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    busy = false
    if (finals.length) pump()
  }
}

/** Offline: transcribe a whole recording by VAD-splitting it. */
async function transcribeAll(pcm: Float32Array, base: number) {
  const v = new EnergyVad()
  const segs: [number, number][] = []
  let start = -1
  for (let i = 0; i + VAD_FRAME <= pcm.length; i += VAD_FRAME) {
    const ev = v.push(pcm.subarray(i, i + VAD_FRAME))
    if (ev === 'start') start = Math.max(0, i - PREROLL)
    if (start >= 0 && (ev === 'end' || i - start >= MAX_UTTERANCE)) {
      segs.push([start, i + VAD_FRAME])
      start = v.inSpeech ? i + VAD_FRAME : -1
    }
  }
  if (start >= 0) segs.push([start, pcm.length])
  // Offline: merge neighbouring utterances into ~25 s requests (fewer API calls, more context).
  const merged: [number, number][] = []
  for (const s of segs) {
    const prev = merged[merged.length - 1]
    if (prev && s[1] - prev[0] <= BATCH_MAX && s[0] - prev[1] <= BATCH_GAP) prev[1] = s[1]
    else merged.push([s[0], s[1]])
  }
  segs.length = 0
  segs.push(...merged)
  const totalMs = (pcm.length / SAMPLE_RATE) * 1000
  for (const [a, b] of segs) {
    if (b - a < SAMPLE_RATE * 0.3) continue
    const t0 = performance.now()
    const text = await decode(pcm.slice(a, b))
    const rtf = (performance.now() - t0) / (((b - a) / SAMPLE_RATE) * 1000)
    post({ type: 'final', startMs: base + (a / SAMPLE_RATE) * 1000, endMs: base + (b / SAMPLE_RATE) * 1000, text, rtf })
    post({ type: 'progress', doneMs: (b / SAMPLE_RATE) * 1000, totalMs })
  }
  post({ type: 'transcribed' })
}

self.onmessage = async (e: MessageEvent<AsrIn>) => {
  const m = e.data
  try {
    switch (m.type) {
      case 'init': init(m.cloud); break
      case 'audio': pushAudio(m.pcm); break
      case 'flush':
        if (utterLen) closeUtterance()
        while (busy || finals.length) await new Promise((r) => setTimeout(r, 50))
        post({ type: 'flushed' })
        break
      case 'reset':
        offsetMs = m.offsetMs; totalSamples = 0; carry = new Float32Array(0); utter = []; utterLen = 0
        preroll.length = 0; prerollLen = 0
        break
      case 'transcribe': await transcribeAll(m.pcm, m.offsetMs); break
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
