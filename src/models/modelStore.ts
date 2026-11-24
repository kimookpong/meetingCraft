import { createStore } from '../lib/store'
import { MODELS, fileName, type ModelKey, type ModelSpec } from './registry'
import { isComplete, removeModel } from './opfs'
import type { DownloadMsg } from '../workers/download.worker'

export type ModelState =
  | { status: 'unknown' | 'absent' | 'ready' }
  | { status: 'downloading'; loaded: number; total: number; file: string }
  | { status: 'error'; message: string }

export const modelStates = createStore<Record<ModelKey, ModelState>>({
  ocr: { status: 'unknown' },
  tts: { status: 'unknown' },
})

const workers: Partial<Record<ModelKey, Worker>> = {}

const setState = (key: ModelKey, s: ModelState) => modelStates.set((all) => ({ ...all, [key]: s }))

/** Models that older versions downloaded but the app no longer uses (frees ~1 GB). */
const RETIRED = ['asr-openthai2-int8']

export async function refreshModelStates() {
  for (const id of RETIRED) removeModel(id)
  for (const key of Object.keys(MODELS) as ModelKey[]) {
    if (modelStates.get()[key].status === 'downloading') continue
    const spec: ModelSpec = MODELS[key]
    setState(key, { status: (await isComplete(spec.id, expectedFiles(spec))) ? 'ready' : 'absent' })
  }
}

const expectedFiles = (spec: ModelSpec) => spec.files.flatMap((f) => f.extract ?? [fileName(f)])

export function downloadModel(key: ModelKey): Promise<void> {
  if (workers[key]) return Promise.resolve()
  // Ask the browser not to evict our (large) model files under storage pressure.
  navigator.storage?.persist?.().catch(() => {})
  const w = new Worker(new URL('../workers/download.worker.ts', import.meta.url), { type: 'module' })
  workers[key] = w
  setState(key, { status: 'downloading', loaded: 0, total: 1, file: '' })
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<DownloadMsg>) => {
      const m = e.data
      if (m.type === 'progress') setState(key, { status: 'downloading', loaded: m.loaded, total: m.total, file: m.file })
      else {
        w.terminate()
        delete workers[key]
        if (m.type === 'done') {
          setState(key, { status: 'ready' })
          resolve()
        } else {
          setState(key, { status: 'error', message: m.message })
          reject(new Error(m.message))
        }
      }
    }
    w.postMessage({ type: 'download', spec: MODELS[key] })
  })
}

export function cancelDownload(key: ModelKey) {
  const w = workers[key]
  if (!w) return
  w.postMessage({ type: 'abort' })
}

export async function deleteModel(key: ModelKey) {
  workers[key]?.terminate()
  delete workers[key]
  await removeModel(MODELS[key].id)
  setState(key, { status: 'absent' })
}
