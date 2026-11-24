import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation } from 'wouter'
import { db, deleteMeeting } from '../db/schema'
import { TopBar, Sheet, Spinner } from '../components/ui'
import { confirmDialog, toast } from '../components/feedback'
import { IconBack, IconDoc, IconDownload, IconImport, IconMore, IconPen, IconPin, IconShare, IconSparkles, IconTrash, IconUsers, IconWave } from '../components/icons'
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
import { useT } from '../i18n'
import { importRecording, type ImportStage } from '../lib/importAudio'
import { takePendingImport } from '../lib/actions'

type Tab = 'transcript' | 'docs' | 'summary'

export function MeetingPage({ id }: { id: string }) {
  const [, nav] = useLocation()
  const t = useT()
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
  const [talk, setTalk] = useState<false | 'chat' | 'debrief'>(false)
  const [offer, setOffer] = useState(false)
  const rec = recorder.use()
  const asr = useAsrConfig()

  useEffect(() => {
    const t = sessionStorage.getItem(`tab:${id}`)
    if (t) { setTab(t as Tab); sessionStorage.removeItem(`tab:${id}`) }
  }, [id])

  const fileRef = useRef<HTMLInputElement>(null)
  const stages: Record<ImportStage, string> = { decoding: t.import.decoding, saving: t.import.saving, transcribing: t.import.transcribing }
  const runImport = async (file: File) => {
    setTab('transcript')
    setBusy(t.import.decoding)
    try {
      const transcribed = await importRecording(id, file, (s) => setBusy(stages[s]))
      toast(transcribed ? t.import.done : t.import.savedOnly, transcribed ? 'ok' : 'info')
      if (transcribed) setOffer(true)
    } catch (e) { toast((e as Error).message, 'bad') } finally { setBusy('') }
  }
  // A file picked on the home screen ("Import file") is imported once this page opens.
  useEffect(() => { const f = takePendingImport(id); if (f) runImport(f) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Offer a spoken debrief right after a recording of this meeting ends (button or end of screen share).
  const lastStop = useRef(rec.stoppedAt)
  useEffect(() => {
    if (!rec.stoppedAt || rec.stoppedAt === lastStop.current) return
    lastStop.current = rec.stoppedAt
    if (rec.meetingId !== id) return
    db.segments.where('meetingId').equals(id).count().then((n) => (n > 0 ? setOffer(true) : toast(t.meeting.audioSaved)))
  }, [rec.stoppedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (meeting === undefined) return <div className="grid min-h-dvh place-items-center"><Spinner className="h-8 w-8 text-brand-600" /></div>
  if (!meeting) return <div className="p-6">{t.meeting.notFound}</div>
  const isRecordingHere = rec.status !== 'idle' && rec.meetingId === id

  const run = async (label: string, f: () => Promise<unknown>, done?: string) => {
    setMenu(false)
    setBusy(label)
    try { await f(); if (done) toast(done) } catch (e) { toast((e as Error).message, 'bad') } finally { setBusy('') }
  }

  const tabs: [Tab, string, React.ReactNode, number | undefined][] = [
    ['transcript', t.meeting.tabTranscript, <IconWave width={18} />, counts?.s],
    ['docs', t.meeting.tabDocs, <IconDoc width={18} />, counts?.d],
    ['summary', t.meeting.tabSummary, <IconSparkles width={18} />, counts?.y],
  ]

  return (
    <div className="min-h-dvh pb-48">
      <TopBar
        left={<button className="btn-ghost min-h-11 px-2.5" onClick={() => nav('/')} aria-label={t.meeting.back}><IconBack /></button>}
        title={meeting.title}
        sub={`${fmtDate(meeting.startedAt)}${meeting.durationMs || isRecordingHere ? t.meeting.length(fmtClock(isRecordingHere ? rec.elapsedMs : meeting.durationMs)) : ''}`}
        right={<button className="btn-ghost min-h-11 px-2.5" onClick={() => setMenu(true)} aria-label={t.meeting.more}><IconMore /></button>}
      />

      <div className="mx-auto max-w-2xl px-4">
        <button onClick={() => setDetails(true)} className="mb-3 flex w-full flex-wrap items-center gap-2 rounded-2xl text-left">
          <span className="chip min-h-8 px-3"><IconPin width={14} />{meeting.location || t.meeting.addPlace}</span>
          <span className="chip min-h-8 px-3"><IconUsers width={14} />{meeting.attendees.length ? t.common.people(meeting.attendees.length) : t.meeting.addPeople}</span>
          <span className="chip min-h-8 bg-brand-50 px-3 text-brand-700"><IconPen width={14} />{t.meeting.editDetails}</span>
        </button>
        <button onClick={() => (isRecordingHere || rec.status !== 'idle' ? toast(t.meeting.stopFirst, 'info') : setTalk('chat'))}
          className="mb-3 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-accent-50 px-4 text-left transition-colors duration-200 hover:bg-accent-100">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-500 text-white"><IconSparkles width={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-accent-700">{t.meeting.talkTitle}</span>
            <span className="block truncate text-[13px] text-slate-600">{t.meeting.talkDesc}</span>
          </span>
        </button>
      </div>

      <div className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 bg-canvas/90 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-2">
          <div className="flex gap-1 rounded-2xl bg-slate-200/60 p-1" role="tablist" aria-label={t.meeting.tabsAria}>
            {tabs.map(([k, label, icon, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold whitespace-nowrap transition-colors duration-200 ${tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}>
                <span className="hidden min-[400px]:inline">{icon}</span>{label}{!!n && <span className={`rounded-full px-1.5 text-[11px] ${tab === k ? 'bg-brand-100' : 'bg-slate-300/70'}`}>{n}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {busy && (
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 pt-2 text-sm font-medium text-brand-700" role="status">
          <Spinner className="h-4 w-4" />{busy}{rec.offline !== undefined && ` ${Math.round(rec.offline * 100)}%`}
        </div>
      )}
      <main className="mx-auto max-w-2xl px-4 pt-3">
        {tab === 'transcript' && <TranscriptTab meeting={meeting} live={isRecordingHere} onImport={() => fileRef.current?.click()} />}
        {tab === 'docs' && <DocumentsTab meeting={meeting} />}
        {tab === 'summary' && <SummaryTab meeting={meeting} onGoTranscript={() => setTab('transcript')} />}
      </main>
      <RecordDock meeting={meeting} />
      <input ref={fileRef} type="file" hidden accept="audio/*,video/*,.m4a,.mp4,.mp3,.wav,.webm,.ogg,.aac"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) runImport(f) }} />
      <Sheet open={offer} onClose={() => setOffer(false)} title={t.meeting.offerTitle}>
        <div className="pb-2 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-accent-100 text-accent-700"><IconSparkles width={30} height={30} /></div>
          <p className="text-[16px] font-semibold">{t.meeting.offerQ}</p>
          <p className="mx-auto mt-1 max-w-xs text-[14px] text-slate-600">{t.meeting.offerBody}</p>
          <div className="mt-5 flex flex-col gap-2">
            <button className="btn-primary" onClick={() => { setOffer(false); setTalk('debrief') }}><IconSparkles /> {t.meeting.offerTalk}</button>
            <button className="btn-soft" onClick={() => { setOffer(false); setTab('summary') }}>{t.meeting.offerText}</button>
            <button className="btn-ghost text-sm" onClick={() => setOffer(false)}>{t.common.later}</button>
          </div>
        </div>
      </Sheet>

      <DetailsSheet meeting={meeting} open={details} onClose={() => setDetails(false)} />
      {talk && <VoiceChat meeting={meeting} debrief={talk === 'debrief'} onClose={() => setTalk(false)} />}
      <Sheet open={menu} onClose={() => setMenu(false)} title={t.meeting.menuTitle}>
        <div className="flex flex-col gap-1 pb-1">
          <MenuItem icon={<IconPen />} label={t.meeting.menuEdit} onClick={() => { setMenu(false); setDetails(true) }} />
          <MenuItem icon={<IconShare />} label={t.meeting.menuShare} hint={t.meeting.menuShareHint}
            onClick={() => run(t.meeting.preparing, async () => shareOrDownload(await meetingMarkdown(meeting), `${fileBase(meeting)}.md`))} />
          <MenuItem icon={<IconDownload />} label={t.meeting.menuAudio} hint={t.meeting.menuAudioHint}
            onClick={() => run(t.meeting.preparingAudio, async () => {
              const chunks = await db.audio.where('[meetingId+seq]').between([id, -Infinity], [id, Infinity]).toArray()
              if (!chunks.length) throw new Error(t.meeting.noAudio)
              downloadBlob(await pcm16ToWav(chunks.map((c) => c.pcm)), `${fileBase(meeting)}.wav`)
            })} />
          <MenuItem icon={<IconImport />} label={t.import.menu} hint={t.import.menuHint} disabled={isRecordingHere}
            onClick={() => { setMenu(false); fileRef.current?.click() }} />
          <MenuItem icon={<IconWave />} label={t.meeting.menuRetranscribe} hint={!asr?.available ? asr?.reason : t.meeting.menuRetranscribeHint}
            disabled={!asr?.available || isRecordingHere}
            onClick={() => run(t.meeting.retranscribing, () => transcribeRecording(id), t.meeting.retranscribed)} />
          <MenuItem icon={<IconTrash />} label={t.meeting.menuDelete} danger disabled={isRecordingHere} onClick={async () => {
            setMenu(false)
            if (!(await confirmDialog({ title: t.meeting.deleteQ, body: t.meeting.deleteBody, ok: t.meeting.deleteOk, danger: true }))) return
            await deleteMeeting(id)
            toast(t.meeting.deleted)
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
      className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left transition-colors duration-200 hover:bg-slate-100 disabled:opacity-50 ${danger ? 'text-rose-600' : ''}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-rose-50' : 'bg-slate-100'}`}>{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-slate-600">{hint}</span>}
      </span>
    </button>
  )
}
