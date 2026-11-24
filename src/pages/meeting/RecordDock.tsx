import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { getSetting, setSetting, type Meeting } from '../../db/schema'
import { pauseRecording, recorder, startRecording, stopRecording, useAsrConfig } from '../../asr/recorder'
import { IconMic, IconPause, IconPlay, IconStop } from '../../components/icons'
import { Spinner } from '../../components/ui'
import { toast } from '../../components/feedback'
import { fmtClock } from '../../lib/format'

function Level({ db, active }: { db: number; active: boolean }) {
  const v = Math.max(0, Math.min(1, (db + 60) / 50))
  return (
    <div className="flex h-7 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => {
        const h = active ? Math.max(0.18, Math.min(1, v * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.3 + db / 4))))) : 0.18
        return <span key={i} className={`w-1 rounded-full transition-[height] duration-150 ${active ? 'bg-rose-500' : 'bg-slate-300'}`} style={{ height: `${h * 100}%` }} />
      })}
    </div>
  )
}

export function RecordDock({ meeting, onStopped }: { meeting: Meeting; onStopped?: () => void }) {
  const r = recorder.use()
  const asr = useAsrConfig()
  const [live, setLive] = useState(true)
  useEffect(() => { getSetting('rec.live', true).then(setLive) }, [])
  const here = r.meetingId === meeting.id
  const busyElsewhere = r.status !== 'idle' && !here
  const asrReady = !!asr?.available
  const active = here && (r.status === 'recording' || r.status === 'paused')
  const starting = here && r.status === 'starting'

  const status = !active ? null
    : r.status === 'paused' ? 'พักไว้ชั่วคราว'
    : r.asr === 'loading' ? 'กำลังเตรียมตัวถอดเสียง…'
    : r.asr === 'ready' ? (r.speaking ? 'กำลังฟังและพิมพ์ตาม…' : 'กำลังฟังอยู่ พูดได้เลย')
    : 'กำลังบันทึกเสียง'

  const stop = async () => { await stopRecording(); if (onStopped) onStopped(); else toast('บันทึกเรียบร้อย') }

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-lg">
      <div className="mx-auto max-w-2xl px-5 pt-3 pb-3">
        {here && r.message && <p className="mb-2 text-center text-[13px] font-medium text-accent-700">{r.message}</p>}

        {!active ? (
          <div className="flex items-center gap-4">
            <button disabled={busyElsewhere || starting} aria-label="เริ่มบันทึก"
              onClick={() => startRecording(meeting.id, meeting.language, live && asrReady)}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition-colors duration-200 hover:bg-rose-700 disabled:opacity-40">
              {starting ? <Spinner className="h-6 w-6" /> : <IconMic width={28} height={28} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold">
                {busyElsewhere ? 'กำลังบันทึกการประชุมอื่นอยู่' : starting ? 'กำลังเปิดไมโครโฟน…' : meeting.durationMs ? 'แตะเพื่อบันทึกต่อ' : 'แตะเพื่อเริ่มบันทึก'}
              </div>
              {asrReady ? (
                <label className="mt-0.5 flex min-h-8 items-center gap-2 text-[13px] text-slate-600">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={live} onChange={(e) => { setLive(e.target.checked); setSetting('rec.live', e.target.checked) }} />
                  ถอดเสียงเป็นข้อความทันที
                </label>
              ) : (
                <Link href="/settings" onClick={() => sessionStorage.setItem('settings:focus', 'asr')} className="mt-0.5 block text-[13px] text-slate-600 underline decoration-dotted underline-offset-2">
                  ตอนนี้บันทึกเสียงอย่างเดียว · เชื่อมต่อ Typhoon เพื่อถอดเสียง
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${r.status === 'paused' ? 'bg-slate-400' : 'animate-pulse bg-rose-500'}`} />
                <span className="font-mono text-2xl font-bold tabular-nums">{fmtClock(r.elapsedMs)}</span>
                <Level db={r.level} active={r.status === 'recording' && (r.speaking || r.asr !== 'ready')} />
              </div>
              <p className="text-[13px] text-slate-600" role="status">{status}</p>
            </div>
            <button onClick={pauseRecording} className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-slate-100 text-[11px] font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-200">
              {r.status === 'paused' ? <IconPlay width={20} /> : <IconPause width={20} />}
              {r.status === 'paused' ? 'ต่อ' : 'พัก'}
            </button>
            <button onClick={stop} disabled={r.status === 'stopping'} aria-label="หยุดและบันทึก"
              className={`grid h-16 w-16 place-items-center rounded-full bg-rose-600 text-white transition-colors duration-200 hover:bg-rose-700 ${r.status === 'recording' ? 'animate-rec' : ''}`}>
              {r.status === 'stopping' ? <Spinner className="h-6 w-6" /> : <IconStop width={24} height={24} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
