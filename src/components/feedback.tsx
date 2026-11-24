import { createStore } from '../lib/store'
import { Sheet } from './ui'
import { getT, useT } from '../i18n'

/* Friendly replacements for window.alert / window.confirm. */

type Toast = { id: number; text: string; tone: 'ok' | 'bad' | 'info' }
const toasts = createStore<Toast[]>([])
let tid = 0

export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const id = ++tid
  toasts.set((t) => [...t, { id, text, tone }])
  setTimeout(() => toasts.set((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3200)
}

type Ask = { title: string; body?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void }
const asks = createStore<Ask | null>(null)

export function confirmDialog(o: { title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => asks.set({ ok: getT().common.ok, ...o, resolve }))
}

export function FeedbackHost() {
  const list = toasts.use()
  const ask = asks.use()
  const t = useT()
  const close = (v: boolean) => { ask?.resolve(v); asks.set(null) }
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} role="status"
            className={`animate-pop pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.tone === 'bad' ? 'bg-rose-600 text-white' : t.tone === 'info' ? 'bg-slate-800 text-white' : 'bg-emerald-600 text-white'}`}>
            {t.text}
          </div>
        ))}
      </div>
      <Sheet open={!!ask} onClose={() => close(false)} title={ask?.title ?? ''}
        footer={
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => close(false)}>{t.common.cancel}</button>
            <button autoFocus className={`flex-1 ${ask?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>{ask?.ok}</button>
          </div>
        }>
        {ask?.body && <p className="pb-2 text-[15px] text-slate-700">{ask.body}</p>}
      </Sheet>
    </>
  )
}
