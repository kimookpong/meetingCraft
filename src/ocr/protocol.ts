import type { OcrLine } from '../db/schema'
export type OcrIn = { type: 'init' } | { type: 'read'; id: number; image: Blob }
export type OcrOut =
  | { type: 'ready' }
  | { type: 'stage'; id: number; stage: string }
  | { type: 'result'; id: number; lines: OcrLine[]; text: string; width: number; height: number; ms: number }
  | { type: 'error'; id?: number; message: string }
