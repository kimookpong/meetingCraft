import type { AiProviderConfig } from '../db/schema'
import type { Dict } from '../i18n'
import { EXTRACTIVE_ID } from './registry'

/** Display name in the current language for built-in providers; user-named ones as stored. */
export function providerLabel(p: AiProviderConfig, t: Dict): string {
  if (p.id === EXTRACTIVE_ID) return t.settings.ai.extractive
  if (p.managed) return t.builtin.typhoon
  return p.label
}
