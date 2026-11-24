import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, touchMeeting, uid, type Meeting, type Segment } from '../../db/schema'
import { recorder } from '../../asr/recorder'
import { Empty } from '../../components/ui'
import { ArtRecord } from '../../components/art'
import { IconPen, IconPlus, IconSpeaker } from '../../components/icons'
import { fmtClock } from '../../lib/format'
import { speak, stopSpeaking, ttsState } from '../../tts/player'

export function TranscriptTab({ meeting, live }: { meeting: Meeting; live: boolean }) {
  const segs = useLiveQuery(
    () => db.segments.where('[meetingId+startMs]').between([meeting.id, -Infinity], [meeting.id, Infinity]).toArray(),
    [meeting.id],
  )
  const rec = recorder.use()
  const tts = ttsState.use()
  const [editing, setEditing] = useState<string | null>(null)
  const [notes, setNotes] = useState(meeting.notes ?? '')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (live) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [segs?.length, rec.partial, live])
  useEffect(() => setNotes(meeting.notes ?? ''), [meeting.id])

  const save = async (s: Segment, text: string) => {
    setEditing(null)
    if (text.trim() === s.text) return
    if (!text.trim()) await db.segments.delete(s.id)
    else await db.segments.update(s.id, { text: text.trim(), edited: true })
  }
  const addManual = async () => {
    const last = segs?.at(-1)
    const t = live ? rec.elapsedMs : (last?.endMs ?? 0)
    const s: Segment = { id: uid(), meetingId: meeting.id, startMs: t, endMs: t, text: '…', source: 'manual' }
    await db.segments.add(s)
    setEditing(s.id)
  }
  const reading = tts.speaking && tts.key === 'transcript'
  const empty = segs && segs.length === 0 && !live

  return (
    <div>
      {empty && (
        <Empty art={<ArtRecord size={132} />} title="พร้อมจดให้แล้ว">
          กดปุ่มไมค์สีแดงด้านล่างเมื่อเริ่มคุยกัน ข้อความจะค่อย ๆ ปรากฏตรงนี้
        </Empty>
      )}

      {!!segs?.length && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] text-slate-600">แตะข้อความเพื่อแก้คำที่ถอดผิดได้</p>
          <button className="btn-soft min-h-10 px-3.5 text-sm" onClick={() => (reading ? stopSpeaking() : speak(segs.map((s) => s.text).join(' '), 'transcript'))}>
            <IconSpeaker width={18} /> {reading ? 'หยุดอ่าน' : 'ฟัง'}
          </button>
        </div>
      )}

      <ol className="space-y-2">
        {segs?.map((s) => (
          <li key={s.id} className={`rounded-2xl px-3.5 py-3 transition-colors duration-200 ${s.source === 'manual' ? 'bg-accent-50' : 'bg-white'} border border-slate-200/70`}>
            <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-slate-500">
              <span className="font-mono tabular-nums">{fmtClock(s.startMs)}</span>
              {s.source === 'manual' && <span className="text-accent-700">· จดเอง</span>}
              {s.edited && <span>· แก้ไขแล้ว</span>}
            </div>
            {editing === s.id ? (
              <textarea autoFocus aria-label="แก้ไขข้อความ" defaultValue={s.text === '…' ? '' : s.text} className="input min-h-24 py-2.5"
                onBlur={(e) => save(s, e.target.value)} />
            ) : (
              <button className="block w-full text-left text-[16px] leading-relaxed" onClick={() => setEditing(s.id)}>{s.text}</button>
            )}
          </li>
        ))}
        {live && rec.partial && (
          <li className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 px-3.5 py-3" aria-live="polite">
            <div className="mb-1 text-[12px] font-semibold text-brand-700">กำลังฟัง…</div>
            <p className="text-[16px] leading-relaxed text-slate-600">{rec.partial}</p>
          </li>
        )}
        {live && !rec.partial && rec.asr === 'ready' && !segs?.length && (
          <li className="py-6 text-center text-[15px] text-slate-600">{rec.speaking ? 'ได้ยินแล้ว กำลังพิมพ์…' : 'พูดได้เลย ระบบกำลังฟังอยู่'}</li>
        )}
      </ol>
      <div ref={endRef} />

      <button className="btn-outline mt-3 w-full text-sm" onClick={addManual}><IconPlus width={18} /> จดข้อความเพิ่มเอง</button>

      <div className="card mt-6">
        <label htmlFor="notes" className="label flex items-center gap-1.5"><IconPen width={16} /> โน้ตส่วนตัว</label>
        <textarea id="notes" className="input min-h-28 py-2.5" placeholder="เช่น ใครรับผิดชอบอะไร ตัวเลขสำคัญ หรือสิ่งที่อยากให้ AI ใส่ในสรุป" value={notes}
          onChange={(e) => setNotes(e.target.value)} onBlur={() => touchMeeting(meeting.id, { notes })} />
        <p className="hint">ระบบจะนำโน้ตนี้ไปประกอบการสรุปด้วย</p>
      </div>
    </div>
  )
}
