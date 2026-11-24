import type { AiProviderConfig } from '../../db/schema'
import type { CompleteRequest, LlmProvider } from '../types'

/** Any OpenAI-compatible /chat/completions endpoint (Typhoon, Gemini, Groq, OpenRouter, Ollama, LM Studio, vLLM…). */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly remote: boolean
  constructor(readonly config: AiProviderConfig) {
    const host = new URL(config.baseUrl || 'http://localhost').hostname
    this.remote = !/^(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) && !host.endsWith('.local')
  }

  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`
    return h
  }

  async complete({ system, prompt, signal, onText }: CompleteRequest): Promise<string> {
    const res = await fetch(`${this.config.baseUrl!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal,
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        temperature: 0.3,
        // Some servers (e.g. Typhoon) default to 512 output tokens, which truncates summaries.
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) throw new Error(`${this.config.label}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += value
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return stripThink(out)
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
          if (delta) { out += delta; onText?.(delta) }
        } catch { /* keep-alive or partial line */ }
      }
    }
    return stripThink(out)
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.config.baseUrl!.replace(/\/$/, '')}/models`, { headers: this.headers() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    const list = Array.isArray(j) ? j : (j.data ?? j.models ?? [])
    return list.map((m: { id?: string; name?: string }) => m.id ?? m.name).filter(Boolean)
  }
}

/** Reasoning models (Qwen3, DeepSeek…) may emit <think>…</think>; drop it from the saved summary. */
export const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
