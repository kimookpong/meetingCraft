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

function chunks(text: string): string[] {
  const sentences = text.split(/(?<=[.!?…\n])\s+|\n+|(?<=[ๆฯ])\s+|\s{2,}/).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const s of sentences) {
    let ps = g2p!.convert(s)
    while (ps.length > MAX_PHONEMES) {
      let cut = ps.lastIndexOf(' ', MAX_PHONEMES)
      if (cut <= 0) cut = MAX_PHONEMES
      out.push(ps.slice(0, cut).trim())
      ps = ps.slice(cut).trim()
    }
    if (ps) out.push(ps)
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
      const audio = new Float32Array(await synth(parts[i], speed))
      samples += audio.length
      post({ type: 'chunk', id, audio, sampleRate, index: i, total: parts.length }, [audio.buffer])
    }
    post({ type: 'done', id, rtf: (performance.now() - t0) / 1000 / Math.max(samples / sampleRate, 0.01) })
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
