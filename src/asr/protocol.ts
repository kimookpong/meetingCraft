/** Typhoon ASR (OpenAI-compatible /audio/transcriptions), e.g. `typhoon-asr-realtime`. */
export interface CloudAsr { baseUrl: string; apiKey?: string; model: string }

export type AsrIn =
  | { type: 'init'; cloud: CloudAsr }
  | { type: 'audio'; pcm: Float32Array }
  | { type: 'flush' }
  | { type: 'reset'; offsetMs: number }
  | { type: 'transcribe'; pcm: Float32Array; offsetMs: number }

export type AsrOut =
  | { type: 'ready'; backend: string }
  | { type: 'error'; message: string }
  | { type: 'level'; db: number; speaking: boolean }
  | { type: 'partial'; startMs: number; endMs: number; text: string }
  | { type: 'final'; startMs: number; endMs: number; text: string; rtf: number }
  | { type: 'progress'; doneMs: number; totalMs: number }
  | { type: 'transcribed' }
  /** All pending utterances after a 'flush' have been transcribed (or failed). */
  | { type: 'flushed' }
