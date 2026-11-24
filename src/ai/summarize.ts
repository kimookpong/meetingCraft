import { db, uid, type AiProviderConfig, type Meeting } from '../db/schema'
import { createProvider } from './registry'
import { extractiveSummary } from './providers/extractive'
import { CONTEXT_LABELS, fill, getPrompt, mapPrompt } from './prompts'
import { dateTag, getT, locale } from '../i18n'
import { providerLabel } from './labels'
import { fmtClock } from '../lib/format'

export async function buildContext(meeting: Meeting) {
  const L = CONTEXT_LABELS[locale.get()]
  const segs = await db.segments.where('[meetingId+startMs]').between([meeting.id, -Infinity], [meeting.id, Infinity]).toArray()
  const docs = await db.documents.where('meetingId').equals(meeting.id).sortBy('createdAt')
  const transcript = segs.map((s) => `[${fmtClock(s.startMs)}] ${s.text}`).join('\n')
  const docText = docs.map((d, i) => `--- ${L.doc} ${i + 1}: ${d.title} ---\n${d.text}`).join('\n\n')
  const header = [
    `${L.title}: ${meeting.title}`,
    `${L.date}: ${new Date(meeting.startedAt).toLocaleString(dateTag(), { dateStyle: 'long', timeStyle: 'short' })}`,
    meeting.location ? `${L.place}: ${meeting.location}` : '',
    meeting.attendees.length ? `${L.people}: ${meeting.attendees.join(', ')}` : '',
    meeting.agenda ? `${L.agenda}:\n${meeting.agenda}` : '',
    meeting.notes ? `${L.notes}:\n${meeting.notes}` : '',
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
  if (!transcript.trim() && !docText.trim() && !meeting.notes) throw new Error(getT().summary.nothing)

  let markdown: string
  if (cfg.kind === 'extractive') {
    markdown = extractiveSummary(transcript + '\n' + (meeting.notes ?? ''), docText, meeting.title, locale.get())
    onProgress({ stage: 'done', text: markdown })
  } else {
    const provider = createProvider(cfg)
    const L = CONTEXT_LABELS[locale.get()]
    const system = await getPrompt('system')
    const format = fill(await getPrompt('format'), { title: meeting.title })
    const budget = cfg.chunkChars ?? 24000
    let body = transcript
    const chunks = split(transcript, budget)
    if (chunks.length > 1) {
      // Map: condense each part, then reduce over the condensed notes.
      const notes: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        onProgress({ stage: getT().summary.stage.part(i + 1, chunks.length), text: '' })
        notes.push(await provider.complete({
          system, signal,
          prompt: fill(mapPrompt(), { title: meeting.title, part: i + 1, parts: chunks.length, text: chunks[i] }),
        }))
      }
      body = notes.map((n, i) => `### ${L.part} ${i + 1}\n${n}`).join('\n\n')
    }
    const docs = docText ? `

${L.ocr}:
${docText.slice(0, Math.max(2000, budget / 3))}` : ''
    const prompt = `${header}

${chunks.length > 1 ? L.partNotes : L.transcript}:
${body || L.none}${docs}\n\n${format}`
    let text = ''
    onProgress({ stage: getT().summary.stage.writing, text })
    markdown = await provider.complete({
      system, prompt, signal,
      onText: (d) => { text += d; onProgress({ stage: getT().summary.stage.writing, text }) },
    })
  }
  const summary = {
    id: uid(), meetingId: meeting.id, providerId: cfg.id, providerLabel: providerLabel(cfg, getT()), model: cfg.model,
    createdAt: Date.now(), markdown,
  }
  await db.summaries.add(summary)
  return summary
}
