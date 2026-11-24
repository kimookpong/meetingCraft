/// <reference lib="webworker" />
/**
 * MakHam TTS (pythainlp/MakHamTTS, Paradee Thai int8) in a worker.
 * Pipeline: normalise → dictionary max-match tokenise → G2P (Kokoro phonemes)
 * → vocab ids → ONNX (input_ids, speed) → 24 kHz waveform, streamed per sentence.
 */
import { G2P } from './makham/g2p.js'
import { getOrt } from '../models/ort'
import { MODELS } from '../models/registry'
import { readFile } from '../models/opfs'
import type { TtsIn, TtsOut } from './protocol'
import type { InferenceSession, Tensor } from 'onnxruntime-web'

const ort = getOrt()
const post = (m: TtsOut, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t)
const MAX_PHONEMES = 510

let session: InferenceSession | null = null
let g2p: G2P | null = null
let vocab: Record<string, number> = {}
let sampleRate = 24000

async function init() {
  if (session) return
  const id = MODELS.tts.id
  const cfg = JSON.parse(await (await readFile(id, 'config.json')).text())
  vocab = cfg.vocab
  sampleRate = cfg.sample_rate || 24000
  g2p = new G2P(JSON.parse(await (await readFile(id, 'dict.json')).text()))
  const bytes = new Uint8Array(await (await readFile(id, 'paradee_thai_int8.onnx')).arrayBuffer())
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
}

/** Pause lengths (ms) after a phrase space, a sentence end and a line break. */
const PAUSE = { phrase: 180, sentence: 350, line: 500 }
const MIN_PHRASE = 14 // merge shorter fragments into the next one so intonation stays natural

/**
 * Split text into speakable pieces with a pause after each. Thai marks phrase boundaries
 * with spaces, so every space becomes a short breath instead of one long run-on sentence.
 */
function chunks(text: string): { ph: string; pause: number }[] {
  const pieces: { t: string; pause: number }[] = []
  for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const sentences = line.split(/(?<=[.!?…ฯ])\s+/).filter(Boolean)
    sentences.forEach((sent, si) => {
      const phrases = sent.split(/\s+/).filter(Boolean)
      let buf = ''
      phrases.forEach((p, pi) => {
        buf = buf ? `${buf} ${p}` : p
        const last = pi === phrases.length - 1
        if ([...buf].length >= MIN_PHRASE || last) {
          const pause = !last ? PAUSE.phrase : si < sentences.length - 1 ? PAUSE.sentence : PAUSE.line
          pieces.push({ t: buf, pause })
          buf = ''
        }
      })
    })
  }
  const out: { ph: string; pause: number }[] = []
  for (const { t, pause } of pieces) {
    let ps = g2p!.convert(t)
    while (ps.length > MAX_PHONEMES) {
      let cut = ps.lastIndexOf(' ', MAX_PHONEMES)
      if (cut <= 0) cut = MAX_PHONEMES
      out.push({ ph: ps.slice(0, cut).trim(), pause: PAUSE.phrase })
      ps = ps.slice(cut).trim()
    }
    if (ps) out.push({ ph: ps, pause })
  }
  return out
}

async function synth(phonemes: string, speed: number): Promise<Float32Array> {
  const ids = [0]
  for (const ch of phonemes) if (vocab[ch] !== undefined) ids.push(vocab[ch])
  ids.push(0)
  const r = await session!.run({
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    speed: new ort.Tensor('float32', Float32Array.from([speed]), [1]),
  })
  return ((r.waveform ?? r[session!.outputNames[0]]) as Tensor).data as Float32Array
}

self.onmessage = async (e: MessageEvent<TtsIn>) => {
  const { id, text, speed } = e.data
  try {
    await init()
    const t0 = performance.now()
    const parts = chunks(text)
    let samples = 0
    for (let i = 0; i < parts.length; i++) {
      const audio = new Float32Array(await synth(parts[i].ph, speed))
      samples += audio.length
      post({ type: 'chunk', id, audio, sampleRate, index: i, total: parts.length, pauseMs: parts[i].pause / speed }, [audio.buffer])
    }
    post({ type: 'done', id, rtf: (performance.now() - t0) / 1000 / Math.max(samples / sampleRate, 0.01) })
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
