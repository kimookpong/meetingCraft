import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate'
import { db, type Meeting } from '../db/schema'
import { fmtClock } from './format'
import { dateTag, getT } from '../i18n'

export async function meetingMarkdown(m: Meeting) {
  const e = getT().export
  const segs = await db.segments.where('[meetingId+startMs]').between([m.id, -Infinity], [m.id, Infinity]).toArray()
  const docs = await db.documents.where('meetingId').equals(m.id).sortBy('createdAt')
  const sum = (await db.summaries.where('meetingId').equals(m.id).sortBy('createdAt')).pop()
  return [
    `# ${m.title}`,
    `- ${e.date}: ${new Date(m.startedAt).toLocaleString(dateTag(), { dateStyle: 'long', timeStyle: 'short' })}`,
    m.location ? `- ${e.place}: ${m.location}` : '',
    m.attendees.length ? `- ${e.people}: ${m.attendees.join(', ')}` : '',
    m.agenda ? `\n## ${e.agenda}\n${m.agenda}` : '',
    sum ? `\n${sum.markdown}` : '',
    m.notes ? `\n## ${e.notes}\n${m.notes}` : '',
    segs.length ? `\n## ${e.transcript}\n${segs.map((s) => `**[${fmtClock(s.startMs)}]** ${s.text}`).join('\n\n')}` : '',
    docs.length ? `\n## ${e.docs}\n${docs.map((d) => `### ${d.title}\n${d.text}`).join('\n\n')}` : '',
  ].filter(Boolean).join('\n')
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function shareOrDownload(text: string, name: string) {
  const file = new File([text], name, { type: 'text/markdown' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return } catch { /* cancelled → fall through */ }
  }
  downloadBlob(file, name)
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
export const fileBase = (m: Meeting) => safe(`${m.title}`)

/** Full local backup (all meetings, audio and images) as a single .zip. */
export async function exportBackup(includeAudio: boolean): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  const meetings = await db.meetings.toArray()
  const segments = await db.segments.toArray()
  const summaries = await db.summaries.toArray()
  const providers = (await db.providers.toArray()).map((p) => ({ ...p, apiKey: undefined }))
  const docs = await db.documents.toArray()
  const audio = includeAudio ? await db.audio.toArray() : []
  for (const d of docs) files[`images/${d.id}.jpg`] = new Uint8Array(await d.image.arrayBuffer())
  for (const a of audio) files[`audio/${a.id}.pcm`] = new Uint8Array(await a.pcm.arrayBuffer())
  const json = {
    version: 1, exportedAt: Date.now(), meetings, segments, summaries, providers,
    documents: docs.map(({ image: _i, ...d }) => d),
    audio: audio.map(({ pcm: _p, ...a }) => a),
  }
  files['meetingcraft.json'] = strToU8(JSON.stringify(json))
  return new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export async function importBackup(file: Blob) {
  const z = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const j = JSON.parse(strFromU8(z['meetingcraft.json']))
  await db.transaction('rw', [db.meetings, db.segments, db.summaries, db.documents, db.audio, db.providers], async () => {
    await db.meetings.bulkPut(j.meetings)
    await db.segments.bulkPut(j.segments)
    await db.summaries.bulkPut(j.summaries)
    for (const p of j.providers ?? []) if (!(await db.providers.get(p.id))) await db.providers.put(p)
    await db.documents.bulkPut(j.documents.map((d: { id: string }) => ({ ...d, image: new Blob([z[`images/${d.id}.jpg`] as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }) })))
    await db.audio.bulkPut(j.audio.filter((a: { id: string }) => z[`audio/${a.id}.pcm`]).map((a: { id: string }) => ({ ...a, pcm: new Blob([z[`audio/${a.id}.pcm`] as Uint8Array<ArrayBuffer>]) })))
  })
  return j.meetings.length as number
}
