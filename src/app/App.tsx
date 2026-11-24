import { useEffect, useState } from 'react'
import { Link, Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { registerSW } from 'virtual:pwa-register'
import { MeetingsPage } from '../pages/MeetingsPage'
import { MeetingPage } from '../pages/MeetingPage'
import { SettingsPage } from '../pages/SettingsPage'
import { IconHome, IconMic, IconSettings } from '../components/icons'
import { FeedbackHost } from '../components/feedback'
import { Onboarding } from './Onboarding'
import { refreshModelStates } from '../models/modelStore'
import { ensureBuiltinTyphoon } from '../ai/builtin'
import { recorder } from '../asr/recorder'
import { startNewMeeting } from '../lib/actions'
import { fmtClock } from '../lib/format'

function BottomNav() {
  const [loc, nav] = useLocation()
  if (loc.startsWith('/m/')) return null
  const item = (href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors duration-200 ${active ? 'text-brand-700' : 'text-slate-600'}`}>
      {icon}
      {label}
    </Link>
  )
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-lg" aria-label="เมนูหลัก">
      <div className="mx-auto flex max-w-md items-center px-4">
        {item('/', 'หน้าแรก', <IconHome />, loc === '/')}
        <div className="flex flex-1 justify-center">
          <button onClick={() => startNewMeeting(nav)} aria-label="เริ่มประชุมใหม่"
            className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-canvas transition-colors duration-200 hover:bg-brand-700">
            <IconMic width={28} height={28} />
          </button>
        </div>
        {item('/settings', 'ตั้งค่า', <IconSettings />, loc.startsWith('/settings'))}
      </div>
    </nav>
  )
}

/** Floating pill to return to an in-progress recording from anywhere. */
function RecordingPill() {
  const r = recorder.use()
  const [loc, nav] = useLocation()
  if (r.status === 'idle' || !r.meetingId || loc === `/m/${r.meetingId}`) return null
  return (
    <button onClick={() => nav(`/m/${r.meetingId}`)} className="bottom-safe fixed left-1/2 z-40 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-semibold text-white shadow-lg">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
      กำลังบันทึก {fmtClock(r.elapsedMs)} — แตะเพื่อกลับไป
    </button>
  )
}

function UpdateToast() {
  const [update, setUpdate] = useState<null | (() => void)>(null)
  useEffect(() => {
    const u = registerSW({
      onNeedRefresh: () => setUpdate(() => () => u(true)),
      // First visit: the SW only starts adding COOP/COEP once it controls the page → reload once.
      onRegisteredSW: () => {
        if (self.crossOriginIsolated || sessionStorage.getItem('coi-reloaded')) return
        navigator.serviceWorker.ready.then(() => {
          if (navigator.serviceWorker.controller) { sessionStorage.setItem('coi-reloaded', '1'); location.reload() }
          else navigator.serviceWorker.addEventListener('controllerchange', () => { sessionStorage.setItem('coi-reloaded', '1'); location.reload() }, { once: true })
        })
      },
    })
  }, [])
  if (!update) return null
  return (
    <div className="bottom-safe animate-pop fixed inset-x-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
      มีเวอร์ชันใหม่พร้อมใช้งาน
      <button className="min-h-11 rounded-xl bg-white/10 px-4 font-semibold" onClick={update}>อัปเดตเลย</button>
    </div>
  )
}

export function App() {
  useEffect(() => {
    refreshModelStates()
    ensureBuiltinTyphoon()
  }, [])
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={MeetingsPage} />
        <Route path="/m/:id">{(p) => <MeetingPage id={p.id} />}</Route>
        <Route path="/settings" component={SettingsPage} />
        <Route><MeetingsPage /></Route>
      </Switch>
      <RecordingPill />
      <BottomNav />
      <UpdateToast />
      <FeedbackHost />
      <Onboarding />
    </Router>
  )
}
