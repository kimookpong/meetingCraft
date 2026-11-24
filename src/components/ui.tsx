import { useEffect, useId, type ReactNode } from 'react'
import { useT } from '../i18n'

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const id = useId()
  const t = useT()
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-labelledby={id}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-pop pb-safe relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[1.75rem] bg-white shadow-2xl sm:rounded-[1.75rem]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2">
          <h2 id={id} className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost -mr-2 min-h-11 px-3 text-sm" onClick={onClose}>{t.common.close}</button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Progress({ value, className = '', label }: { value: number; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}
      className={`h-2.5 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${Math.max(3, pct)}%` }} />
    </div>
  )
}

/** Friendly empty state: illustration + one sentence of guidance + the next action. */
export function Empty({ art, title, children, action }: { art: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4">{art}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="mt-1.5 max-w-xs text-[15px] text-slate-600">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode; icon?: ReactNode }) {
  const cls = {
    info: 'bg-brand-50 text-brand-900',
    warn: 'bg-accent-50 text-accent-700',
    bad: 'bg-rose-50 text-rose-800',
    ok: 'bg-emerald-50 text-emerald-800',
  }[tone]
  return <div className={`flex gap-2.5 rounded-2xl px-4 py-3 text-sm leading-relaxed ${cls}`}>{icon && <span className="mt-0.5 shrink-0">{icon}</span>}<div>{children}</div></div>
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-slate-600">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

export function Section({ title, desc, children, action }: { title: string; desc?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-[17px] font-bold">{title}</h2>
          {desc && <p className="text-[13px] text-slate-600">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function TopBar({ title, left, right, sub }: { title: ReactNode; left?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-30 bg-canvas/90 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-1 px-2">
        {left}
        <div className="min-w-0 flex-1 px-2">
          <div className="truncate text-lg font-bold">{title}</div>
          {sub && <div className="truncate text-[13px] text-slate-600">{sub}</div>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
}
