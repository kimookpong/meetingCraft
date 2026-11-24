import type { AiProviderConfig } from '../db/schema'
import type { LlmProvider } from './types'
import { OpenAiCompatibleProvider } from './providers/openaiCompatible'
import { AnthropicProvider } from './providers/anthropic'
import { OnnxLocalProvider } from './providers/onnxLocal'
import { ExtractiveProvider } from './providers/extractive'

/** Plug-in point: map a stored provider config to an implementation. */
export function createProvider(cfg: AiProviderConfig): LlmProvider {
  switch (cfg.kind) {
    case 'openai-compatible': return new OpenAiCompatibleProvider(cfg)
    case 'anthropic': return new AnthropicProvider(cfg)
    case 'onnx-local': return new OnnxLocalProvider(cfg)
    case 'extractive': return new ExtractiveProvider(cfg)
  }
}

export const EXTRACTIVE_ID = 'builtin-extractive'
export const builtinExtractive: AiProviderConfig = {
  id: EXTRACTIVE_ID, kind: 'extractive', label: 'สรุปแบบดึงประโยค (ไม่ใช้ AI)', model: 'extractive-th', createdAt: 0,
}
