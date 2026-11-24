import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation } from 'wouter'
import { db, deleteMeeting } from '../db/schema'
import { TopBar, Sheet, Spinner } from '../components/ui'
import { confirmDialog, toast } from '../components/feedback'
import { IconBack, IconDoc, IconDownload, IconMore, IconPen, IconPin, IconShare, IconSparkles, IconTrash, IconUsers, IconWave } from '../components/icons'
import { fmtClock, fmtDate } from '../lib/format'
import { recorder, transcribeRecording, useAsrConfig } from '../asr/recorder'
import { meetingMarkdown, shareOrDownload, downloadBlob, fileBase } from '../lib/exporters'
import { pcm16ToWav } from '../lib/audio'
import { TranscriptTab } from './meeting/TranscriptTab'
import { DocumentsTab } from './meeting/DocumentsTab'
import { SummaryTab } from './meeting/SummaryTab'
import { RecordDock } from './meeting/RecordDock'
import { DetailsSheet } from './meeting/DetailsSheet'
import { VoiceChat } from '../chat/VoiceChat'

type Tab = 'transcript' | 'docs' | 'summary'

export function MeetingPage({ id }: { id: string }) {
  const [, nav] = useLocation()
  const meeting = useLiveQuery(() => db.meetings.get(id), [id])
  const counts = useLiveQuery(async () => ({
    s: await db.segments.where('meetingId').equals(id).count(),
    d: await db.documents.where('meetingId').equals(id).count(),
    y: await db.summaries.where('meetingId').equals(id).count(),
  }), [id])
  const [tab, setTab] = useState<Tab>('transcript')
  const [details, setDetails] = useState(false)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState('')
  const [talk, setTalk] = useState(false)
  const rec = recorder.use()
  const asr = useAsrConfig()

  useEffect(() => {
    const t = sessionStorage.getItem(`tab:${id}`)
    if (t) { setTab(t as Tab); sessionStorage.removeItem(`tab:${id}`) }
  }, [id])

  if (meeting === undefined) return <div className="grid min-h-dvh place-items-center"><Spinner className="h-8 w-8 text-brand-600" /></div>
  if (!meeting) return <div className="p-6">ไม่พบการประชุมนี้ อาจถูกลบไปแล้ว</div>
  const isRecordingHere = rec.status !== 'idle' && rec.meetingId === id

  const run = async (label: string, f: () => Promise<unknown>, done?: string) => {
    setMenu(false)
    setBusy(label)
    try { await f(); if (done) toast(done) } catch (e) { toast((e as Error).message, 'bad') } finally { setBusy('') }
  }

  const tabs: [Tab, string, React.ReactNode, number | undefined][] = [
    ['transcript', 'ถอดเสียง', <IconWave width={18} />, counts?.s],
    ['docs', 'เอกสาร', <IconDoc width={18} />, counts?.d],
    ['summary', 'สรุป', <IconSparkles width={18} />, counts?.y],
  ]

  return (
    <div className="min-h-dvh pb-48">
      <TopBar
        left={<button className="btn-ghost min-h-11 px-2.5" onClick={() => nav('/')} aria-label="กลับหน้าแรก"><IconBack /></button>}
        title={meeting.title}
        sub={`${fmtDate(meeting.startedAt)}${meeting.durationMs || isRecordingHere ? ` · ยาว ${fmtClock(isRecordingHere ? rec.elapsedMs : meeting.durationMs)}` : ''}`}
        right={<button className="btn-ghost min-h-11 px-2.5" onClick={() => setMenu(true)} aria-label="ตัวเลือกเพิ่มเติม"><IconMore /></button>}
      />

      <div className="mx-auto max-w-2xl px-4">
        <button onClick={() => setDetails(true)} className="mb-3 flex w-full flex-wrap items-center gap-2 rounded-2xl text-left">
          <span className="chip min-h-8 px-3"><IconPin width={14} />{meeting.location || 'เพิ่มสถานที่'}</span>
          <span className="chip min-h-8 px-3"><IconUsers width={14} />{meeting.attendees.length ? `${meeting.attendees.length} คน` : 'เพิ่มผู้เข้าร่วม'}</span>
          <span className="chip min-h-8 bg-brand-50 px-3 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><IconPen width={14} />แก้ไขรายละเอียด</span>
        </button>
        <button onClick={() => (isRecordingHere || rec.status !== 'idle' ? toast('หยุดบันทึกก่อน แล้วค่อยคุยกับผู้ช่วย', 'info') : setTalk(true))}
          className="mb-3 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-accent-50 px-4 text-left transition-colors duration-200 hover:bg-accent-100 dark:bg-accent-700/15 dark:hover:bg-accent-700/25">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-500 text-white"><IconSparkles width={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-accent-700 dark:text-accent-100">คุยกับผู้ช่วย</span>
            <span className="block truncate text-[13px] text-slate-600 dark:text-slate-400">ถามเรื่องในประชุม หรือสั่งให้บันทึกเพิ่ม ด้วยเสียง</span>
          </span>
        </button>
      </div>

      <div className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 bg-canvas/90 backdrop-blur dark:bg-slate-950/90">
        <div className="mx-auto max-w-2xl px-4 py-2">
          <div className="flex gap-1 rounded-2xl bg-slate-200/60 p-1 dark:bg-slate-800/70" role="tablist" aria-label="ส่วนของการประชุม">
            {tabs.map(([k, label, icon, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold whitespace-nowrap transition-colors duration-200 ${tab === k ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-200' : 'text-slate-600 dark:text-slate-400'}`}>
                <span className="hidden min-[400px]:inline">{icon}</span>{label}{!!n && <span className={`rounded-full px-1.5 text-[11px] ${tab === k ? 'bg-brand-100 dark:bg-brand-900/50' : 'bg-slate-300/70 dark:bg-slate-700'}`}>{n}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {busy && (
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 pt-2 text-sm font-medium text-brand-700 dark:text-brand-200" role="status">
          <Spinner className="h-4 w-4" />{busy}{rec.offline !== undefined && ` ${Math.round(rec.offline * 100)}%`}
        </div>
      )}
      <main className="mx-auto max-w-2xl px-4 pt-3">
        {tab === 'transcript' && <TranscriptTab meeting={meeting} live={isRecordingHere} />}
        {tab === 'docs' && <DocumentsTab meeting={meeting} />}
        {tab === 'summary' && <SummaryTab meeting={meeting} onGoTranscript={() => setTab('transcript')} />}
      </main>
      <RecordDock meeting={meeting} />

      <DetailsSheet meeting={meeting} open={details} onClose={() => setDetails(false)} />
      {talk && <VoiceChat meeting={meeting} onClose={() => setTalk(false)} />}
      <Sheet open={menu} onClose={() => setMenu(false)} title="ตัวเลือก">
        <div className="flex flex-col gap-1 pb-1">
          <MenuItem icon={<IconPen />} label="แก้ไขรายละเอียดการประชุม" onClick={() => { setMenu(false); setDetails(true) }} />
          <MenuItem icon={<IconShare />} label="แชร์บันทึกการประชุม" hint="ไฟล์ Markdown พร้อมสรุปและข้อความทั้งหมด"
            onClick={() => run('กำลังเตรียมไฟล์…', async () => shareOrDownload(await meetingMarkdown(meeting), `${fileBase(meeting)}.md`))} />
          <MenuItem icon={<IconDownload />} label="ดาวน์โหลดไฟล์เสียง" hint="ไฟล์ WAV สำหรับฟังย้อนหลัง"
            onClick={() => run('กำลังเตรียมไฟล์เสียง…', async () => {
              const chunks = await db.audio.where('[meetingId+seq]').between([id, -Infinity], [id, Infinity]).toArray()
              if (!chunks.length) throw new Error('การประชุมนี้ยังไม่มีไฟล์เสียง')
              downloadBlob(await pcm16ToWav(chunks.map((c) => c.pcm)), `${fileBase(meeting)}.wav`)
            })} />
          <MenuItem icon={<IconWave />} label="ถอดเสียงใหม่จากไฟล์บันทึก" hint={!asr?.available ? asr?.reason : 'ส่งไฟล์เสียงไปถอดที่ Typhoon อีกครั้ง'}
            disabled={!asr?.available || isRecordingHere}
            onClick={() => run('กำลังถอดเสียงจากไฟล์บันทึก…', () => transcribeRecording(id), 'ถอดเสียงเสร็จแล้ว')} />
          <MenuItem icon={<IconTrash />} label="ลบการประชุมนี้" danger disabled={isRecordingHere} onClick={async () => {
            setMenu(false)
            if (!(await confirmDialog({ title: 'ลบการประชุมนี้?', body: 'เสียง เอกสาร และสรุปทั้งหมดของการประชุมนี้จะถูกลบออกจากเครื่อง และกู้คืนไม่ได้', ok: 'ลบเลย', danger: true }))) return
            await deleteMeeting(id)
            toast('ลบการประชุมแล้ว')
            nav('/')
          }} />
        </div>
      </Sheet>
    </div>
  )
}

function MenuItem({ icon, label, hint, onClick, disabled, danger }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left transition-colors duration-200 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800 ${danger ? 'text-rose-600' : ''}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-rose-50 dark:bg-rose-950/50' : 'bg-slate-100 dark:bg-slate-800'}`}>{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-slate-600 dark:text-slate-400">{hint}</span>}
      </span>
    </button>
  )
}
