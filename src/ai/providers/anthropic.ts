import Anthropic from '@anthropic-ai/sdk'
import type { AiProviderConfig } from '../../db/schema'
import type { CompleteRequest, LlmProvider } from '../types'

/**
 * Anthropic Claude via the official SDK, called directly from the browser with
 * the user's own key. Server-side refusal fallback is enabled ("default" routing).
 */
export class AnthropicProvider implements LlmProvider {
  readonly remote = true
  private client: Anthropic
  constructor(readonly config: AiProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true })
  }

  async complete({ system, prompt, signal, onText }: CompleteRequest): Promise<string> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.config.model || 'claude-opus-5-5',
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    )
    stream.on('text', (t) => onText?.(t))
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request (refusal)')
    return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  }
}

export async function testAnthropic(apiKey: string) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  await client.models.retrieve('claude-opus-5-5')
}
