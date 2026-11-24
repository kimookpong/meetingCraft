export type TtsIn = { type: 'speak'; id: number; text: string; speed: number }
export type TtsOut =
  /** pauseMs: silence to leave after this chunk (phrase / sentence / line break). */
  | { type: 'chunk'; id: number; audio: Float32Array; sampleRate: number; index: number; total: number; pauseMs: number }
  | { type: 'done'; id: number; rtf: number }
  | { type: 'error'; id: number; message: string }
