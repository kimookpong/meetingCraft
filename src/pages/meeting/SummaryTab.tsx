import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'wouter'
import { db, getSetting, setSetting, type Meeting } from '../../db/schema'
import { builtinExtractive, createProvider, EXTRACTIVE_ID } from '../../ai/registry'
import { summarizeMeeting } from '../../ai/summarize'
import { llmLoad } from '../../ai/providers/onnxLocal'
import { renderMarkdown } from '../../lib/markdown'
import { shareOrDownload, fileBase } from '../../lib/exporters'
import { Empty, Notice, Progress, Sheet, Spinner } from '../../components/ui'
import { ArtSummary } from '../../components/art'
import { confirmDialog, toast } from '../../components/feedback'
import { IconCheck, IconChevron, IconCopy, IconShare, IconShield, IconSparkles, IconSpeaker, IconTrash } from '../../components/icons'
import { speak, stopSpeaking, ttsState } from '../../tts/player'
import { fmtBytes, fmtDate } from '../../lib/format'
import type { AiProviderConfig } from '../../db/schema'

const hostOf = (c: AiProviderConfig) => (c.baseUrl ? new URL(c.baseUrl).host : c.kind === 'anthropic' ? 'api.anthropic.com' : '')

export function SummaryTab({ meeting, onGoTranscript }: { meeting: Meeting; onGoTranscript: () => void }) {
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  const summaries = useLiveQuery(() => db.summaries.where('meetingId').equals(meeting.id).reverse().sortBy('createdAt'), [meeting.id])
  const hasContent = useLiveQuery(async () => (await db.segments.where('meetingId').equals(meeting.id).count()) + (await db.documents.where('meetingId').equals(meeting.id).count()) > 0 || !!meeting.notes, [meeting.id, meeting.notes])
  const [providerId, setProviderId] = useState(EXTRACTIVE_ID)
  const [pick, setPick] = useState(false)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const llm = llmLoad.use()
  const tts = ttsState.use()

  useEffect(() => { getSetting('ai.default', EXTRACTIVE_ID).then(setProviderId) }, [])
  const all = useMemo(() => [builtinExtractive, ...(providers ?? [])], [providers])
  const cfg = all.find((p) => p.id === providerId) ?? builtinExtractive
  const remote = useMemo(() => createProvider(cfg).remote, [cfg])
  const current = summaries?.find((s) => s.id === shown) ?? summaries?.[0]
  const hasTyphoon = providers?.some((p) => p.baseUrl?.includes('opentyphoon'))

  const choose = (id: string) => { setProviderId(id); setSetting('ai.default', id); setPick(false) }

  const run = async () => {
    if (remote && !(await confirmDialog({
      title: 'ส่งข้อมูลไปสรุปที่ AI ภายนอก?',
      body: `ข้อความถอดเสียง เอกสาร และโน้ตของการประชุมนี้จะถูกส่งไปที่ ${hostOf(cfg)} เพื่อสรุป ถ้าเป็นเรื่องลับ แนะนำให้ใช้ AI ในเครื่องแทน`,
      ok: 'ส่งและสรุป',
    }))) return
    setRunning(true); setError(''); setDraft(''); setStage('กำลังรวบรวมข้อมูล')
    abort.current = new AbortController()
    try {
      const s = await summarizeMeeting(meeting, cfg, (p) => { setStage(p.stage); setDraft(p.text) }, abort.current.signal)
      setShown(s.id)
      toast('สรุปเสร็จแล้ว')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setRunning(false); setDraft(''); setStage('')
    }
  }

  if (hasContent === false && !summaries?.length) {
    return (
      <Empty art={<ArtSummary />} title="ยังไม่มีอะไรให้สรุป"
        action={<button className="btn-soft" onClick={onGoTranscript}>ไปเริ่มบันทึกเสียง</button>}>
        บันทึกเสียง ถ่ายเอกสาร หรือจดโน้ตก่อน แล้วกลับมากดสรุปได้เลย
      </Empty>
    )
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="label">ให้ใครช่วยสรุป</div>
        <button onClick={() => setPick(true)} disabled={running}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 px-3.5 text-left transition-colors duration-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${remote ? 'bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-100' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
            {remote ? <IconSparkles width={20} /> : <IconShield width={20} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{cfg.label}</span>
            <span className="block truncate text-[13px] text-slate-600 dark:text-slate-400">{remote ? `ส่งไปประมวลผลที่ ${hostOf(cfg)}` : 'ประมวลผลในเครื่อง/เครือข่ายของคุณ'}</span>
          </span>
          <span className="text-[13px] font-semibold text-brand-700 dark:text-brand-200">เปลี่ยน</span>
        </button>

        {!hasTyphoon && cfg.kind === 'extractive' && (
          <Link href="/settings" onClick={() => sessionStorage.setItem('settings:focus', 'ai')} className="mt-3 flex items-center gap-3 rounded-2xl bg-brand-50 px-3.5 py-3 text-[14px] text-brand-900 transition-colors duration-200 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-100">
            <IconSparkles width={20} className="shrink-0 text-accent-500" />
            <span className="flex-1"><b>อยากได้สรุปที่ดีกว่านี้?</b> เพิ่ม Typhoon API — AI ภาษาไทย ใช้ฟรี</span>
            <IconChevron width={18} />
          </Link>
        )}

        <div className="mt-4">
          {running
            ? <button className="btn-outline w-full" onClick={() => abort.current?.abort()}>หยุดการสรุป</button>
            : <button className="btn-primary w-full" onClick={run}><IconSparkles /> {current ? 'สรุปใหม่อีกครั้ง' : 'สรุปการประชุมนี้'}</button>}
        </div>
        {running && cfg.kind === 'onnx-local' && llm.loading && (
          <div className="mt-3 text-[13px] text-slate-600 dark:text-slate-400">
            กำลังโหลดโมเดล AI ในเครื่อง (ครั้งแรกเท่านั้น) {llm.total ? `${fmtBytes(llm.loaded)} / ${fmtBytes(llm.total)}` : ''}
            <Progress className="mt-1.5" value={llm.total ? llm.loaded / llm.total : 0} label="โหลดโมเดล AI" />
          </div>
        )}
        {running && stage && <div className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-700 dark:text-brand-200" role="status"><Spinner className="h-4 w-4" />{stage}…</div>}
        {error && <div className="mt-3"><Notice tone="bad"><b>สรุปไม่สำเร็จ</b> — {error}</Notice></div>}
      </div>

      {running && draft && <article className="prose-md card mb-4" aria-live="polite" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft) }} />}

      {!running && !current && (
        <p className="px-2 py-6 text-center text-[15px] text-slate-600 dark:text-slate-400">กด “สรุปการประชุมนี้” แล้วรอสักครู่ จะได้ภาพรวม มติ และงานที่ต้องทำ</p>
      )}

      {!running && current && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <span className="text-[13px] text-slate-600 dark:text-slate-400">โดย {current.providerLabel} · {fmtDate(current.createdAt)}</span>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-2">
            <ActionBtn label={tts.speaking && tts.key === current.id ? 'หยุด' : 'ฟัง'} icon={<IconSpeaker width={20} />} onClick={() => (tts.speaking && tts.key === current.id ? stopSpeaking() : speak(current.markdown, current.id))} />
            <ActionBtn label="คัดลอก" icon={<IconCopy width={20} />} onClick={async () => { await navigator.clipboard.writeText(current.markdown); toast('คัดลอกแล้ว') }} />
            <ActionBtn label="แชร์" icon={<IconShare width={20} />} onClick={() => shareOrDownload(current.markdown, `สรุป-${fileBase(meeting)}.md`)} />
            <ActionBtn label="ลบ" danger icon={<IconTrash width={20} />} onClick={async () => {
              if (await confirmDialog({ title: 'ลบสรุปนี้?', body: 'ลบเฉพาะสรุปนี้ บันทึกเสียงและเอกสารยังอยู่ครบ', ok: 'ลบ', danger: true })) { await db.summaries.delete(current.id); toast('ลบสรุปแล้ว') }
            }} />
          </div>
          <article className="prose-md card" dangerouslySetInnerHTML={{ __html: renderMarkdown(current.markdown) }} />
          {summaries!.length > 1 && (
            <div className="mt-5">
              <div className="label">สรุปฉบับอื่น</div>
              <div className="flex flex-wrap gap-2">
                {summaries!.map((s) => (
                  <button key={s.id} onClick={() => setShown(s.id)} aria-pressed={s.id === current.id}
                    className={`min-h-10 rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${s.id === current.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {s.providerLabel.split(' (')[0]} · {new Date(s.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Sheet open={pick} onClose={() => setPick(false)} title="เลือก AI ช่วยสรุป">
        <div className="space-y-2 pb-2">
          {all.map((p) => {
            const r = createProvider(p).remote
            return (
              <button key={p.id} onClick={() => choose(p.id)} aria-pressed={p.id === providerId}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors duration-200 ${p.id === providerId ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{p.label}</span>
                  <span className="block text-[13px] text-slate-600 dark:text-slate-400">{p.kind === 'extractive' ? 'เร็ว ไม่ต้องตั้งค่า เลือกประโยคสำคัญให้' : r ? `ส่งไปที่ ${hostOf(p)}` : 'ในเครื่อง/เครือข่ายของคุณ'}</span>
                </span>
                {p.id === providerId && <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white"><IconCheck width={16} /></span>}
              </button>
            )
          })}
          <Link href="/settings" onClick={() => sessionStorage.setItem('settings:focus', 'ai')} className="btn-soft mt-2 w-full">+ เพิ่ม AI ตัวอื่น (Typhoon, Gemini, Ollama…)</Link>
        </div>
      </Sheet>
    </div>
  )
}

function ActionBtn({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white text-[12px] font-semibold transition-colors duration-200 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${danger ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'} border border-slate-200/80 dark:border-slate-800`}>
      {icon}{label}
    </button>
  )
}
