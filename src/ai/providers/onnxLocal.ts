import { createStore } from '../../lib/store'
import type { AiProviderConfig } from '../../db/schema'
import type { CompleteRequest, LlmProvider } from '../types'
import type { LlmIn, LlmOut } from '../llm.worker'
import { stripThink } from './openaiCompatible'

export const llmLoad = createStore<{ model?: string; loading: boolean; loaded: number; total: number; file?: string; error?: string }>({
  loading: false, loaded: 0, total: 0,
})

let worker: Worker | null = null
let seq = 0
const files = new Map<string, { loaded: number; total: number }>()

function getWorker() {
  worker ??= new Worker(new URL('../llm.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function loadLocalModel(model: string): Promise<void> {
  const w = getWorker()
  files.clear()
  llmLoad.set({ model, loading: true, loaded: 0, total: 0 })
  return new Promise((resolve, reject) => {
    const h = (e: MessageEvent<LlmOut>) => {
      const m = e.data
      if (m.type === 'progress') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        let loaded = 0, total = 0
        files.forEach((f) => { loaded += f.loaded; total += f.total })
        llmLoad.set({ model, loading: true, loaded, total, file: m.file })
      } else if (m.type === 'ready') {
        w.removeEventListener('message', h)
        llmLoad.set({ model, loading: false, loaded: 1, total: 1 })
        resolve()
      } else if (m.type === 'error' && m.id === undefined) {
        w.removeEventListener('message', h)
        llmLoad.set({ model, loading: false, loaded: 0, total: 0, error: m.message })
        reject(new Error(m.message))
      }
    }
    w.addEventListener('message', h)
    w.postMessage({ type: 'load', model } satisfies LlmIn)
  })
}

export function unloadLocalModel() {
  worker?.terminate()
  worker = null
  llmLoad.set({ loading: false, loaded: 0, total: 0 })
}

export class OnnxLocalProvider implements LlmProvider {
  readonly remote = false
  constructor(readonly config: AiProviderConfig) {}

  async complete({ system, prompt, signal, onText }: CompleteRequest): Promise<string> {
    await loadLocalModel(this.config.model)
    const w = getWorker()
    const id = ++seq
    return new Promise((resolve, reject) => {
      const h = (e: MessageEvent<LlmOut>) => {
        const m = e.data
        if (!('id' in m) || m.id !== id) return
        if (m.type === 'delta') onText?.(m.text)
        if (m.type === 'done') { w.removeEventListener('message', h); resolve(stripThink(m.text)) }
        if (m.type === 'error') { w.removeEventListener('message', h); reject(new Error(m.message)) }
      }
      w.addEventListener('message', h)
      signal?.addEventListener('abort', () => { unloadLocalModel(); reject(new DOMException('Aborted', 'AbortError')) })
      w.postMessage({ type: 'generate', id, system, prompt, maxNewTokens: 1200 } satisfies LlmIn)
    })
  }
}
