/// <reference lib="webworker" />
/**
 * On-device LLM via transformers.js v4 (ONNX Runtime Web + WebGPU, q4f16).
 * Model files are cached by transformers.js in Cache Storage on this device.
 */
import { pipeline, TextStreamer, env, type TextGenerationPipeline } from '@huggingface/transformers'

export type LlmIn =
  | { type: 'load'; model: string }
  | { type: 'generate'; id: number; system: string; prompt: string; maxNewTokens: number }
  | { type: 'unload' }
export type LlmOut =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; model: string }
  | { type: 'delta'; id: number; text: string }
  | { type: 'done'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }

env.allowLocalModels = false
const post = (m: LlmOut) => (self as unknown as Worker).postMessage(m)

let gen: TextGenerationPipeline | null = null
let loaded = ''

async function load(model: string) {
  if (gen && loaded === model) return post({ type: 'ready', model })
  await gen?.dispose()
  gen = null
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available on this device — use an API provider or Ollama instead')
  gen = (await pipeline('text-generation', model, {
    device: 'webgpu',
    dtype: 'q4f16',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file) post({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 })
    },
  })) as TextGenerationPipeline
  loaded = model
  post({ type: 'ready', model })
}

async function generate(id: number, system: string, prompt: string, maxNewTokens: number) {
  if (!gen) throw new Error('Model not loaded')
  const noThink = /qwen3/i.test(loaded) ? ' /no_think' : ''
  let text = ''
  const streamer = new TextStreamer(gen.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t: string) => { text += t; post({ type: 'delta', id, text: t }) },
  })
  await gen(
    [
      { role: 'system', content: system },
      { role: 'user', content: prompt + noThink },
    ],
    { max_new_tokens: maxNewTokens, do_sample: false, repetition_penalty: 1.1, streamer },
  )
  post({ type: 'done', id, text })
}

self.onmessage = async (e: MessageEvent<LlmIn>) => {
  const m = e.data
  try {
    if (m.type === 'load') await load(m.model)
    else if (m.type === 'generate') await generate(m.id, m.system, m.prompt, m.maxNewTokens)
    else { await gen?.dispose(); gen = null; loaded = '' }
  } catch (err) {
    post({ type: 'error', id: m.type === 'generate' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
