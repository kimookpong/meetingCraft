import { createStore } from '../lib/store'
import { modelStates } from '../models/modelStore'
import { getSetting } from '../db/schema'
import type { TtsOut } from './protocol'

export type TtsEngine = 'makham' | 'web-speech'
export interface TtsSettings { engine: TtsEngine; speed: number; voiceURI?: string }
export const DEFAULT_TTS: TtsSettings = { engine: 'makham', speed: 1, voiceURI: undefined }

export const ttsState = createStore<{ speaking: boolean; key?: string; progress?: number; error?: string }>({ speaking: false })

let worker: Worker | null = null
let ctx: AudioContext | null = null
let seq = 0
let current = 0
let sources: AudioBufferSourceNode[] = []

/** Create/resume the AudioContext inside a user gesture (required on iOS before async playback). */
export function primeTts() {
  ctx ??= new AudioContext()
  ctx.resume()
}

/** Resolves when the current utterance has finished playing (or was stopped). */
export function waitSpeechEnd(): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsState.get().speaking) return resolve()
    const un = ttsState.subscribe(() => { if (!ttsState.get().speaking) { un(); resolve() } })
  })
}

export function stopSpeaking() {
  current = ++seq
  sources.forEach((s) => { try { s.stop() } catch { /* already stopped */ } })
  sources = []
  speechSynthesis?.cancel()
  ttsState.set({ speaking: false })
}

/** Strip Markdown so TTS doesn't read symbols aloud. */
export function speakable(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_`>#]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
}

export async function speak(text: string, key?: string) {
  stopSpeaking()
  const s = await getSetting<TtsSettings>('tts', DEFAULT_TTS)
  const lang = textLang(text)
  // MakHam only speaks Thai; English text always uses the system's English voice.
  const engine = lang === 'th' && s.engine === 'makham' && modelStates.get().tts.status === 'ready' ? 'makham' : 'web-speech'
  ttsState.set({ speaking: true, key, progress: 0 })
  if (engine === 'web-speech') return speakWeb(speakable(text), s, lang)
  return speakMakham(speakable(text), s.speed, key)
}

/** 'th' when a meaningful share of letters are Thai, otherwise 'en'. */
export function textLang(text: string): 'th' | 'en' {
  const thai = (text.match(/[\u0E00-\u0E7F]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return thai >= latin * 0.3 && thai > 0 ? 'th' : 'en'
}

function speakWeb(text: string, s: TtsSettings, lang: 'th' | 'en') {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'th' ? 'th-TH' : 'en-US'
  u.rate = s.speed
  const voices = speechSynthesis.getVoices()
  const chosen = voices.find((v) => v.voiceURI === s.voiceURI)
  const v = (chosen && chosen.lang.toLowerCase().startsWith(lang) ? chosen : undefined) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang))
  if (v) u.voice = v
  u.onend = u.onerror = () => ttsState.set({ speaking: false })
  speechSynthesis.speak(u)
}

function speakMakham(text: string, speed: number, key?: string) {
  const id = (current = ++seq)
  worker ??= new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
  ctx ??= new AudioContext()
  ctx.resume()
  let at = ctx.currentTime + 0.05
  let pendingEnd = 0
  worker.onmessage = (e: MessageEvent<TtsOut>) => {
    const m = e.data
    if (m.id !== current) return
    if (m.type === 'chunk') {
      const buf = ctx!.createBuffer(1, m.audio.length, m.sampleRate)
      buf.copyToChannel(new Float32Array(m.audio), 0)
      const src = ctx!.createBufferSource()
      src.buffer = buf
      src.connect(ctx!.destination)
      at = Math.max(at, ctx!.currentTime + 0.02)
      src.start(at)
      at += buf.duration + m.pauseMs / 1000 // breathing room between phrases
      sources.push(src)
      pendingEnd++
      src.onended = () => {
        pendingEnd--
        if (id === current && pendingEnd === 0 && ttsState.get().progress === 1) ttsState.set({ speaking: false })
      }
      ttsState.set({ speaking: true, key, progress: (m.index + 1) / m.total })
    } else if (m.type === 'done') {
      ttsState.set({ ...ttsState.get(), progress: 1 })
      if (pendingEnd === 0) ttsState.set({ speaking: false })
    } else if (m.type === 'error') ttsState.set({ speaking: false, error: m.message })
  }
  worker.postMessage({ type: 'speak', id, text, speed })
}

export function listWebVoices(lang: 'th' | 'en' = 'th'): SpeechSynthesisVoice[] {
  return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
}
