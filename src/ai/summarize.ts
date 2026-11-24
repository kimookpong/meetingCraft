import { db, getSetting, uid, type AiProviderConfig, type Meeting } from '../db/schema'
import { createProvider } from './registry'
import { extractiveSummary } from './providers/extractive'
import { DEFAULT_FORMAT, DEFAULT_SYSTEM_PROMPT, MAP_PROMPT, fill } from './prompts'
import { fmtClock } from '../lib/format'

export async function buildContext(meeting: Meeting) {
  const segs = await db.segments.where('[meetingId+startMs]').between([meeting.id, -Infinity], [meeting.id, Infinity]).toArray()
  const docs = await db.documents.where('meetingId').equals(meeting.id).sortBy('createdAt')
  const transcript = segs.map((s) => `[${fmtClock(s.startMs)}] ${s.text}`).join('\n')
  const docText = docs.map((d, i) => `--- เอกสาร ${i + 1}: ${d.title} ---\n${d.text}`).join('\n\n')
  const header = [
    `ชื่อการประชุม: ${meeting.title}`,
    `วันที่: ${new Date(meeting.startedAt).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })}`,
    meeting.location ? `สถานที่: ${meeting.location}` : '',
    meeting.attendees.length ? `ผู้เข้าร่วม: ${meeting.attendees.join(', ')}` : '',
    meeting.agenda ? `วาระ:\n${meeting.agenda}` : '',
    meeting.notes ? `บันทึกเพิ่มเติมของผู้จด:\n${meeting.notes}` : '',
  ].filter(Boolean).join('\n')
  return { header, transcript, docText }
}

function split(text: string, size: number): string[] {
  if (text.length <= size) return [text]
  const out: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    if (cur.length + line.length + 1 > size && cur) { out.push(cur); cur = '' }
    cur += (cur ? '\n' : '') + line
  }
  if (cur) out.push(cur)
  return out
}

export interface SummarizeProgress { stage: string; text: string }

export async function summarizeMeeting(
  meeting: Meeting,
  cfg: AiProviderConfig,
  onProgress: (p: SummarizeProgress) => void,
  signal?: AbortSignal,
) {
  const { header, transcript, docText } = await buildContext(meeting)
  if (!transcript.trim() && !docText.trim() && !meeting.notes) throw new Error('ยังไม่มีบันทึกเสียง เอกสาร หรือโน้ตให้สรุป')

  let markdown: string
  if (cfg.kind === 'extractive') {
    markdown = extractiveSummary(transcript + '\n' + (meeting.notes ?? ''), docText, meeting.title)
    onProgress({ stage: 'done', text: markdown })
  } else {
    const provider = createProvider(cfg)
    const system = await getSetting('prompt.system', DEFAULT_SYSTEM_PROMPT)
    const format = fill(await getSetting('prompt.format', DEFAULT_FORMAT), { title: meeting.title })
    const budget = cfg.chunkChars ?? 24000
    let body = transcript
    const chunks = split(transcript, budget)
    if (chunks.length > 1) {
      // Map: condense each part, then reduce over the condensed notes.
      const notes: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        onProgress({ stage: `สรุปช่วงที่ ${i + 1}/${chunks.length}`, text: '' })
        notes.push(await provider.complete({
          system, signal,
          prompt: fill(MAP_PROMPT, { title: meeting.title, part: i + 1, parts: chunks.length, text: chunks[i] }),
        }))
      }
      body = notes.map((n, i) => `### ช่วงที่ ${i + 1}\n${n}`).join('\n\n')
    }
    const docs = docText ? `\n\nข้อความจากเอกสารประกอบ (OCR):\n${docText.slice(0, Math.max(2000, budget / 3))}` : ''
    const prompt = `${header}\n\n${chunks.length > 1 ? 'บันทึกย่อรายช่วง' : 'บันทึกถอดเสียง'}:\n${body || '(ไม่มี)'}${docs}\n\n${format}`
    let text = ''
    onProgress({ stage: 'กำลังเขียนสรุป', text })
    markdown = await provider.complete({
      system, prompt, signal,
      onText: (d) => { text += d; onProgress({ stage: 'กำลังเขียนสรุป', text }) },
    })
  }
  const summary = {
    id: uid(), meetingId: meeting.id, providerId: cfg.id, providerLabel: cfg.label, model: cfg.model,
    createdAt: Date.now(), markdown,
  }
  await db.summaries.add(summary)
  return summary
}
