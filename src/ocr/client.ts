import type { OcrIn, OcrOut } from './protocol'
import type { OcrLine } from '../db/schema'

let worker: Worker | null = null
let seq = 0
const waiters = new Map<number, { resolve: (r: OcrResult) => void; reject: (e: Error) => void; onStage?: (s: string) => void }>()

export interface OcrResult { lines: OcrLine[]; text: string; width: number; height: number; ms: number }

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<OcrOut>) => {
    const m = e.data
    if (m.type === 'stage') waiters.get(m.id)?.onStage?.(m.stage)
    if (m.type === 'result') { waiters.get(m.id)?.resolve(m); waiters.delete(m.id) }
    if (m.type === 'error' && m.id !== undefined) { waiters.get(m.id)?.reject(new Error(m.message)); waiters.delete(m.id) }
  }
  return worker
}

export function ocrImage(image: Blob, onStage?: (s: string) => void): Promise<OcrResult> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiters.set(id, { resolve, reject, onStage })
    getWorker().postMessage({ type: 'read', id, image } satisfies OcrIn)
  })
}

/** Downscale large camera photos before storing/OCR (long side ≤ 2400 px, JPEG). */
export async function normalizePhoto(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
}
