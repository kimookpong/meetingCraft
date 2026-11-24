import type { ProviderPreset } from './types'

/**
 * Curated AI options for meeting summaries (see docs/ARCHITECTURE.md §11).
 * Display text (label/note/free tier) lives in the i18n dictionaries under `presets.<key>`.
 */
export const PRESETS: ProviderPreset[] = [
  {
    key: 'extractive', kind: 'extractive', label: 'Extractive (no AI)', model: 'extractive-th',
    needsKey: false, thai: 'fair', privacy: 'local', chunkChars: 1e9,
  },
  {
    key: 'onnx-qwen35-08b', kind: 'onnx-local', label: 'Qwen3.5 0.8B (ONNX)', model: 'onnx-community/Qwen3.5-0.8B-Text-ONNX',
    needsKey: false, thai: 'fair', privacy: 'local', chunkChars: 5000, sizeMB: 470,
  },
  {
    key: 'onnx-gemma3-1b', kind: 'onnx-local', label: 'Gemma 3 1B (ONNX)', model: 'onnx-community/gemma-3-1b-it-ONNX',
    needsKey: false, thai: 'good', privacy: 'local', chunkChars: 6000, sizeMB: 760,
  },
  {
    key: 'onnx-typhoon2-1b', kind: 'onnx-local', label: 'Typhoon2 1B Instruct (ONNX)', model: 'Natthaset/llama3.2-typhoon2-1b-instruct-onnx',
    needsKey: false, thai: 'great', privacy: 'local', chunkChars: 6000, sizeMB: 1070,
  },
  {
    key: 'onnx-qwen3-17b', kind: 'onnx-local', label: 'Qwen3 1.7B (ONNX)', model: 'onnx-community/Qwen3-1.7B-ONNX',
    needsKey: false, thai: 'good', privacy: 'local', chunkChars: 8000, sizeMB: 1430,
  },
  {
    key: 'onnx-qwen3-4b', kind: 'onnx-local', label: 'Qwen3 4B Instruct 2507 (ONNX)', model: 'onnx-community/Qwen3-4B-Instruct-2507-ONNX',
    needsKey: false, thai: 'great', privacy: 'local', chunkChars: 20000, sizeMB: 2900,
  },
  {
    key: 'typhoon', kind: 'openai-compatible', label: 'Typhoon API (SCB 10X)', baseUrl: 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-v2.5-30b-a3b-instruct', needsKey: true, thai: 'great', privacy: 'remote', chunkChars: 60000, keyUrl: 'https://playground.opentyphoon.ai/',
  },
  {
    key: 'gemini', kind: 'openai-compatible', label: 'Google Gemini API', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-flash-latest', needsKey: true, thai: 'great', privacy: 'remote', chunkChars: 400000, keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    key: 'groq', kind: 'openai-compatible', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile', needsKey: true, thai: 'good', privacy: 'remote', chunkChars: 30000, keyUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'openrouter', kind: 'openai-compatible', label: 'OpenRouter (:free models)', baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3-235b-a22b:free', needsKey: true, thai: 'good', privacy: 'remote', chunkChars: 60000, keyUrl: 'https://openrouter.ai/keys',
  },
  {
    key: 'ollama', kind: 'openai-compatible', label: 'Ollama (LAN)', baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3:8b', needsKey: false, thai: 'great', privacy: 'lan', chunkChars: 24000,
  },
  {
    key: 'lmstudio', kind: 'openai-compatible', label: 'LM Studio (LAN)', baseUrl: 'http://localhost:1234/v1',
    model: 'local-model', needsKey: false, thai: 'good', privacy: 'lan', chunkChars: 24000,
  },
  {
    key: 'anthropic', kind: 'anthropic', label: 'Anthropic Claude', model: 'claude-opus-5-5', paid: true,
    needsKey: true, thai: 'great', privacy: 'remote', chunkChars: 600000, keyUrl: 'https://console.anthropic.com/settings/keys',
  },
]

export const presetFor = (key: string) => PRESETS.find((p) => p.key === key)
