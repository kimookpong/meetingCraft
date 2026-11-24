import { setLocale, useLocale, useT } from '../i18n'

/** Compact ไทย/EN switch. */
export function LangToggle({ className = '' }: { className?: string }) {
  const l = useLocale()
  const t = useT()
  return (
    <div role="group" aria-label={t.lang.label} className={`inline-flex rounded-full bg-slate-200/70 p-0.5 text-[13px] font-bold ${className}`}>
      {(['th', 'en'] as const).map((k) => (
        <button key={k} onClick={() => setLocale(k)} aria-pressed={l === k}
          className={`min-h-9 min-w-11 rounded-full px-3 transition-colors duration-200 ${l === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}>
          {k === 'th' ? 'ไทย' : 'EN'}
        </button>
      ))}
    </div>
  )
}
