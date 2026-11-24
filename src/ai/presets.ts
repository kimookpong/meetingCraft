import type { ProviderPreset } from './types'

/**
 * Curated AI options for Thai meeting summaries (see docs/ARCHITECTURE.md §11).
 * Free-tier quotas change often — the UI links to each provider's page.
 */
export const PRESETS: ProviderPreset[] = [
  {
    key: 'extractive', kind: 'extractive', label: 'สรุปแบบดึงประโยค (ไม่ใช้ AI)', model: 'extractive-th',
    needsKey: false, free: 'ฟรี', thai: 'พอใช้', privacy: 'ในเครื่อง', chunkChars: 1e9,
    note: 'ทำงานทันที ไม่ต้องดาวน์โหลด ไม่ต้องใช้เน็ต — เลือกประโยคสำคัญ มติ และงานที่มอบหมายจากถ้อยคำ',
  },
  {
    key: 'onnx-qwen35-08b', kind: 'onnx-local', label: 'Qwen3.5 0.8B (ONNX ในเครื่อง)', model: 'onnx-community/Qwen3.5-0.8B-Text-ONNX',
    needsKey: false, free: 'ฟรี', thai: 'พอใช้', privacy: 'ในเครื่อง', chunkChars: 5000, sizeMB: 470,
    note: 'เล็กที่สุด เหมาะกับมือถือ (ต้องมี WebGPU) — ใช้แบบ map-reduce สรุปทีละช่วง',
  },
  {
    key: 'onnx-gemma3-1b', kind: 'onnx-local', label: 'Gemma 3 1B (ONNX ในเครื่อง)', model: 'onnx-community/gemma-3-1b-it-ONNX',
    needsKey: false, free: 'ฟรี', thai: 'ดี', privacy: 'ในเครื่อง', chunkChars: 6000, sizeMB: 760,
    note: 'ภาษาไทยดีในขนาดเล็ก, license Gemma',
  },
  {
    key: 'onnx-typhoon2-1b', kind: 'onnx-local', label: 'Typhoon2 1B Instruct (ONNX ในเครื่อง)', model: 'Natthaset/llama3.2-typhoon2-1b-instruct-onnx',
    needsKey: false, free: 'ฟรี', thai: 'ดีมาก', privacy: 'ในเครื่อง', chunkChars: 6000, sizeMB: 1070,
    note: 'เทรนภาษาไทยโดยตรง (community ONNX build), license Llama 3.2',
  },
  {
    key: 'onnx-qwen3-17b', kind: 'onnx-local', label: 'Qwen3 1.7B (ONNX ในเครื่อง)', model: 'onnx-community/Qwen3-1.7B-ONNX',
    needsKey: false, free: 'ฟรี', thai: 'ดี', privacy: 'ในเครื่อง', chunkChars: 8000, sizeMB: 1430,
    note: 'คุณภาพดีขึ้นชัดเจน เหมาะกับแท็บเล็ต/โน้ตบุ๊ก',
  },
  {
    key: 'onnx-qwen3-4b', kind: 'onnx-local', label: 'Qwen3 4B Instruct 2507 (ONNX ในเครื่อง)', model: 'onnx-community/Qwen3-4B-Instruct-2507-ONNX',
    needsKey: false, free: 'ฟรี', thai: 'ดีมาก', privacy: 'ในเครื่อง', chunkChars: 20000, sizeMB: 2900,
    note: 'สำหรับเดสก์ท็อปที่มี GPU ≥ 4 GB',
  },
  {
    key: 'typhoon', kind: 'openai-compatible', label: 'Typhoon API (SCB 10X)', baseUrl: 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-v2.5-30b-a3b-instruct', needsKey: true, free: 'ฟรี (มี rate limit)', thai: 'ดีมาก', privacy: 'ส่งออกนอกเครื่อง', chunkChars: 60000,
    note: 'โมเดลภาษาไทยโดยตรง แนะนำสำหรับข้อมูลทั่วไป — free tier อาจนำข้อมูลไปพัฒนาโมเดล', keyUrl: 'https://playground.opentyphoon.ai/',
  },
  {
    key: 'gemini', kind: 'openai-compatible', label: 'Google Gemini API', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-flash-latest', needsKey: true, free: 'ฟรีเฉพาะรุ่น Flash', thai: 'ดีมาก', privacy: 'ส่งออกนอกเครื่อง', chunkChars: 400000,
    note: 'context ยาวมาก สรุปการประชุมยาวได้ในครั้งเดียว — free tier อาจใช้ข้อมูลไปเทรน', keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    key: 'groq', kind: 'openai-compatible', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile', needsKey: true, free: 'ฟรี (จำกัดต่อนาที/วัน)', thai: 'ดี', privacy: 'ส่งออกนอกเครื่อง', chunkChars: 30000,
    note: 'เร็วมาก', keyUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'openrouter', kind: 'openai-compatible', label: 'OpenRouter (:free models)', baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3-235b-a22b:free', needsKey: true, free: '50 ครั้ง/วัน', thai: 'ดี', privacy: 'ส่งออกนอกเครื่อง', chunkChars: 60000,
    note: 'รายชื่อรุ่นฟรีเปลี่ยนบ่อย ตรวจที่ openrouter.ai/models?q=free', keyUrl: 'https://openrouter.ai/keys',
  },
  {
    key: 'ollama', kind: 'openai-compatible', label: 'Ollama (เครื่องตัวเอง/LAN)', baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3:8b', needsKey: false, free: 'ฟรี', thai: 'ดีมาก', privacy: 'ในเครือข่าย', chunkChars: 24000,
    note: 'ต้องตั้ง OLLAMA_ORIGINS=* เพื่อเปิด CORS — แนะนำโมเดลไทย typhoon2.5-qwen3-4b (GGUF)',
  },
  {
    key: 'lmstudio', kind: 'openai-compatible', label: 'LM Studio (เครื่องตัวเอง/LAN)', baseUrl: 'http://localhost:1234/v1',
    model: 'local-model', needsKey: false, free: 'ฟรี', thai: 'ดี', privacy: 'ในเครือข่าย', chunkChars: 24000,
    note: 'เปิด “Enable CORS” ใน Developer settings ของ LM Studio',
  },
  {
    key: 'anthropic', kind: 'anthropic', label: 'Anthropic Claude', model: 'claude-opus-5-5',
    needsKey: true, free: 'เสียเงิน', thai: 'ดีมาก', privacy: 'ส่งออกนอกเครื่อง', chunkChars: 600000,
    note: 'คุณภาพสูงสุด context 1M — เปิด refusal fallback อัตโนมัติ', keyUrl: 'https://console.anthropic.com/settings/keys',
  },
]

export const presetFor = (key: string) => PRESETS.find((p) => p.key === key)
