import type { AiProviderConfig, ProviderKind } from '../db/schema'

export interface CompleteRequest {
  system: string
  prompt: string
  signal?: AbortSignal
  onText?: (delta: string) => void
}

/** A pluggable AI backend. Add a new one by implementing this and registering it in registry.ts. */
export interface LlmProvider {
  readonly config: AiProviderConfig
  /** True when the request leaves the device (shown to the user before sending). */
  readonly remote: boolean
  complete(req: CompleteRequest): Promise<string>
}

export interface ProviderPreset {
  key: string
  kind: ProviderKind
  label: string
  baseUrl?: string
  model: string
  needsKey: boolean
  free: string
  thai: 'ดีมาก' | 'ดี' | 'พอใช้'
  privacy: 'ในเครื่อง' | 'ในเครือข่าย' | 'ส่งออกนอกเครื่อง'
  chunkChars: number
  note: string
  keyUrl?: string
  sizeMB?: number
  models?: string[]
}
