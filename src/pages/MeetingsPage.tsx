import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation } from 'wouter'
import { db, getSetting, setSetting } from '../db/schema'
import { downloadModel, modelStates, type ModelState } from '../models/modelStore'
import { MODELS, totalSize, type ModelKey } from '../models/registry'
import { Empty, Progress, Spinner } from '../components/ui'
import { ArtRecord, ArtWave } from '../components/art'
import { IconCamera, IconCheck, IconChevron, IconClock, IconDoc, IconMic, IconPin, IconSearch, IconShield, IconSparkles, IconUsers } from '../components/icons'
import { fmtBytes, fmtClock, relDay } from '../lib/format'
import { useAsrConfig } from '../asr/recorder'
import { startNewMeeting } from '../lib/actions'
import { Logo } from '../components/Logo'

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'สวัสดีตอนเช้า'
  if (h < 13) return 'สวัสดีตอนเที่ยง'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

export function MeetingsPage() {
  const [, nav] = useLocation()
  const [q, setQ] = useState('')
  const meetings = useLiveQuery(() => db.meetings.orderBy('updatedAt').reverse().toArray(), [])
  const counts = useLiveQuery(async () => {
    const [segs, docs, sums] = await Promise.all([db.segments.toArray(), db.documents.toArray(), db.summaries.toArray()])
    const c: Record<string, { s: number; d: number; y: boolean }> = {}
    for (const s of segs) (c[s.meetingId] ??= { s: 0, d: 0, y: false }).s++
    for (const d of docs) (c[d.meetingId] ??= { s: 0, d: 0, y: false }).d++
    for (const s of sums) (c[s.meetingId] ??= { s: 0, d: 0, y: false }).y = true
    return c
  }, [])

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = (meetings ?? []).filter((m) => !ql || m.title.toLowerCase().includes(ql) || m.attendees.join(' ').toLowerCase().includes(ql) || (m.location ?? '').toLowerCase().includes(ql))
    const g = new Map<string, typeof list>()
    for (const m of list) {
      const k = relDay(m.startedAt)
      g.set(k, [...(g.get(k) ?? []), m])
    }
    return [...g.entries()]
  }, [meetings, q])

  const hasAny = (meetings?.length ?? 0) > 0

  return (
    <div className="min-h-dvh pb-32">
      <header className="pt-safe mx-auto max-w-2xl px-5 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <Logo size={34} />
          <span className="chip bg-emerald-50 text-emerald-700"><IconShield width={14} />ข้อมูลอยู่ในเครื่อง</span>
        </div>
        <p className="text-[15px] font-medium text-slate-600">{greeting()}</p>
        <h1 className="text-[26px] leading-tight font-bold">วันนี้มีประชุมอะไรบ้าง?</h1>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {/* Primary action, big and obvious */}
        <div className="relative mb-4 overflow-hidden rounded-[1.5rem] bg-brand-600 p-5 text-white">
          <ArtWave className="pointer-events-none absolute top-4 right-4 h-10 w-32 opacity-25" />
          <div className="relative">
            <div className="text-lg font-bold">เริ่มประชุมใหม่</div>
            <p className="mt-0.5 max-w-[16rem] text-[14px] text-brand-100">กดแล้วพูดได้เลย ระบบจะถอดเสียงและช่วยสรุปให้</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => startNewMeeting(nav)} className="btn bg-white text-brand-700 hover:bg-brand-50"><IconMic /> บันทึกเสียง</button>
              <button onClick={() => startNewMeeting(nav, 'docs')} className="btn bg-white/15 text-white hover:bg-white/25"><IconCamera /> ถ่ายเอกสาร</button>
            </div>
          </div>
        </div>

        <SetupChecklist />

        {hasAny && (
          <div className="relative mt-6 mb-4">
            <IconSearch className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-500" width={20} />
            <label htmlFor="search" className="sr-only">ค้นหาการประชุม</label>
            <input id="search" type="search" className="input pl-11" placeholder="ค้นหาชื่อ สถานที่ หรือผู้เข้าร่วม" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}

        {meetings && !hasAny && (
          <Empty art={<ArtRecord />} title="ยังไม่มีบันทึกการประชุม">
            ลองกดปุ่มไมค์สีน้ำเงินด้านล่างดูสิ — แค่วางมือถือไว้กลางโต๊ะ แล้วคุยกันตามปกติ
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-emerald-700">
              <IconShield width={16} /> บันทึกทั้งหมดเก็บไว้ในเครื่องนี้
            </div>
          </Empty>
        )}

        {hasAny && groups.length === 0 && (
          <p className="py-10 text-center text-slate-600">ไม่พบการประชุมที่ตรงกับ “{q}”</p>
        )}

        {groups.map(([day, list]) => (
          <section key={day} className="mb-6">
            <h2 className="mb-2 px-1 text-sm font-bold text-slate-600">{day}</h2>
            <ul className="space-y-2.5">
              {list.map((m) => {
                const c = counts?.[m.id]
                return (
                  <li key={m.id}>
                    <Link href={`/m/${m.id}`} className="card flex items-center gap-3.5 transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/40">
                      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${m.status === 'recording' ? 'bg-rose-100 text-rose-600' : c?.y ? 'bg-accent-100 text-accent-700' : 'bg-brand-50 text-brand-600'}`}>
                        {m.status === 'recording' ? <IconMic /> : c?.y ? <IconSparkles /> : <IconDoc />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-semibold">{m.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-slate-600">
                          <span className="inline-flex items-center gap-1"><IconClock width={14} />{new Date(m.startedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.{m.durationMs > 0 && ` · ${fmtClock(m.durationMs)}`}</span>
                          {m.location && <span className="inline-flex items-center gap-1"><IconPin width={14} />{m.location}</span>}
                          {m.attendees.length > 0 && <span className="inline-flex items-center gap-1"><IconUsers width={14} />{m.attendees.length} คน</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {m.status === 'recording' && <span className="chip bg-rose-100 text-rose-700">กำลังบันทึก</span>}
                          {c?.y && <span className="chip bg-accent-100 text-accent-700">สรุปแล้ว</span>}
                          {!!c?.d && <span className="chip">{c.d} เอกสาร</span>}
                          {!c?.s && !c?.d && m.status !== 'recording' && <span className="chip">ยังว่างอยู่</span>}
                        </div>
                      </div>
                      <IconChevron className="shrink-0 text-slate-400" width={20} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}

/** "Get ready" checklist — one tap per step, disappears when done or dismissed. */
function SetupChecklist() {
  const models = modelStates.use()
  const asr = useAsrConfig()
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  useEffect(() => { getSetting('setup.dismissed', false).then(setDismissed) }, [])

  const steps: { key: ModelKey; title: string; desc: string }[] = [
    { key: 'ocr', title: 'อ่านข้อความจากรูป', desc: 'ถ่ายเอกสารแล้วได้ข้อความ' },
    { key: 'tts', title: 'อ่านออกเสียง', desc: 'ฟังสรุปแทนการอ่าน' },
  ]
  const typhoon = !!asr?.available
  const ready = steps.filter((s) => models[s.key].status === 'ready').length + (typhoon ? 1 : 0)
  const total = steps.length + 1
  if (dismissed === null || dismissed || asr === undefined || ready === total || steps.some((s) => models[s.key].status === 'unknown')) return null

  return (
    <section className="card mb-2" aria-labelledby="setup-title">
      <div className="mb-1 flex items-center justify-between">
        <h2 id="setup-title" className="font-bold">เตรียมความพร้อม</h2>
        <span className="text-[13px] font-semibold text-brand-700">{ready}/{total} เสร็จแล้ว</span>
      </div>
      <p className="hint mb-3 mt-0">ทำครั้งเดียว ใช้ได้ทุกการประชุม</p>
      <Progress value={ready / total} className="mb-3" label="ความพร้อมของระบบ" />
      <ul className="divide-y divide-slate-100">
        <li className="flex min-h-14 items-center gap-3 py-2">
          <StepDot done={typhoon} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">เชื่อมต่อ Typhoon</div>
            <div className="text-[13px] text-slate-600">ถอดเสียง สรุป และคุยกับผู้ช่วย · ใช้ฟรี</div>
          </div>
          {!typhoon && <Link href="/settings" onClick={() => sessionStorage.setItem('settings:focus', 'asr')} className="btn-soft min-h-10 px-4 text-sm">เชื่อมต่อ</Link>}
        </li>
        {steps.map((s) => <StepRow key={s.key} k={s.key} title={s.title} desc={s.desc} state={models[s.key]} />)}
      </ul>
      <button className="mt-1 min-h-11 w-full text-center text-[13px] font-medium text-slate-500 hover:text-slate-700" onClick={() => { setSetting('setup.dismissed', true); setDismissed(true) }}>
        ไว้ทีหลัง
      </button>
    </section>
  )
}

function StepDot({ done }: { done: boolean }) {
  return done
    ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><IconCheck width={16} /></span>
    : <span className="h-7 w-7 shrink-0 rounded-full border-2 border-dashed border-slate-300" />
}

function StepRow({ k, title, desc, state }: { k: ModelKey; title: string; desc: string; state: ModelState }) {
  const size = fmtBytes(totalSize(MODELS[k]))
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <StepDot done={state.status === 'ready'} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        {state.status === 'downloading'
          ? <div className="mt-1"><Progress value={state.loaded / state.total} label={`ดาวน์โหลด${title}`} /><div className="mt-0.5 text-[12px] text-slate-600">{fmtBytes(state.loaded)} จาก {fmtBytes(state.total)}</div></div>
          : <div className="text-[13px] text-slate-600">{state.status === 'error' ? 'ดาวน์โหลดสะดุด — กดเพื่อทำต่อ' : `${desc} · ${size}`}</div>}
      </div>
      {(state.status === 'absent' || state.status === 'error') && (
        <button className="btn-soft min-h-10 px-4 text-sm" onClick={() => downloadModel(k).catch(() => {})}>ดาวน์โหลด</button>
      )}
      {state.status === 'downloading' && <Spinner className="h-5 w-5 text-brand-600" />}
    </li>
  )
}
