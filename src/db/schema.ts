import Dexie, { type EntityTable } from 'dexie'
import { dateTag, getT } from '../i18n'

export type AsrLanguage = 'th-TH' | 'th-mix'

export interface Meeting {
  id: string
  title: string
  startedAt: number
  endedAt?: number
  durationMs: number
  location?: string
  attendees: string[]
  agenda?: string
  notes?: string
  language: AsrLanguage
  status: 'draft' | 'recording' | 'done'
  updatedAt: number
}

export interface Segment {
  id: string
  meetingId: string
  startMs: number
  endMs: number
  text: string
  source: 'asr' | 'manual'
  edited?: boolean
}

/** Raw 16 kHz PCM16 audio, stored so a meeting can be (re)transcribed later. */
export interface AudioChunk {
  id: string
  meetingId: string
  seq: number
  startMs: number
  sampleRate: number
  pcm: Blob
}

export interface OcrLine {
  text: string
  confidence: number
  box: [number, number, number, number] // x0, y0, x1, y1 in source-image pixels
}

export interface DocumentItem {
  id: string
  meetingId: string
  createdAt: number
  title: string
  image: Blob
  text: string
  lines: OcrLine[]
}

export interface ActionItem { task: string; owner?: string; due?: string }

export interface Summary {
  id: string
  meetingId: string
  providerId: string
  providerLabel: string
  model: string
  createdAt: number
  markdown: string
}

export type ProviderKind = 'onnx-local' | 'openai-compatible' | 'anthropic' | 'extractive'

export interface AiProviderConfig {
  id: string
  kind: ProviderKind
  label: string
  baseUrl?: string
  apiKey?: string
  model: string
  /** Max characters of transcript sent per request; larger inputs are map-reduced. */
  chunkChars?: number
  /** Built-in provider that goes through the meetingCraft proxy (no key on the device). */
  managed?: boolean
  createdAt: number
}

export interface Setting { key: string; value: unknown }

class MeetingCraftDB extends Dexie {
  meetings!: EntityTable<Meeting, 'id'>
  segments!: EntityTable<Segment, 'id'>
  audio!: EntityTable<AudioChunk, 'id'>
  documents!: EntityTable<DocumentItem, 'id'>
  summaries!: EntityTable<Summary, 'id'>
  providers!: EntityTable<AiProviderConfig, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor() {
    super('meetingcraft')
    this.version(1).stores({
      meetings: 'id, updatedAt, startedAt, status',
      segments: 'id, meetingId, [meetingId+startMs]',
      audio: 'id, meetingId, [meetingId+seq]',
      documents: 'id, meetingId, createdAt',
      summaries: 'id, meetingId, createdAt',
      providers: 'id, kind, createdAt',
      settings: 'key',
    })
  }
}

export const db = new MeetingCraftDB()

export const uid = () => crypto.randomUUID()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

export async function createMeeting(partial: Partial<Meeting> = {}): Promise<Meeting> {
  const now = Date.now()
  const m: Meeting = {
    id: uid(),
    title: partial.title ?? getT().meeting.defaultTitle(new Date(now).toLocaleDateString(dateTag(), dateTag() === 'th-TH' ? { day: 'numeric', month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }), new Date(now).toLocaleTimeString(dateTag(), { hour: '2-digit', minute: '2-digit' })),
    startedAt: now,
    durationMs: 0,
    attendees: [],
    language: 'th-TH',
    status: 'draft',
    updatedAt: now,
    ...partial,
  }
  await db.meetings.add(m)
  return m
}

export async function touchMeeting(id: string, patch: Partial<Meeting> = {}) {
  await db.meetings.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteMeeting(id: string) {
  await db.transaction('rw', [db.meetings, db.segments, db.audio, db.documents, db.summaries], async () => {
    await db.segments.where('meetingId').equals(id).delete()
    await db.audio.where('meetingId').equals(id).delete()
    await db.documents.where('meetingId').equals(id).delete()
    await db.summaries.where('meetingId').equals(id).delete()
    await db.meetings.delete(id)
  })
}
