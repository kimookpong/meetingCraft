import { useEffect } from 'react'
import { Section, TopBar } from '../components/ui'
import { AsrSection } from './settings/AsrSection'
import { Logo } from '../components/Logo'
import { HistatsCounter } from '../components/HistatsCounter'
import { ModelsSection } from './settings/ModelsSection'
import { AiSection } from './settings/AiSection'
import { TtsSection } from './settings/TtsSection'
import { PromptSection } from './settings/PromptSection'
import { StorageSection } from './settings/StorageSection'
import { setLocale, useLocale, useT } from '../i18n'

function LanguageSection() {
  const t = useT()
  const l = useLocale()
  return (
    <Section title={l === 'th' ? 'ภาษา / Language' : 'Language / ภาษา'}>
      <div className="card grid grid-cols-2 gap-2 p-2" role="radiogroup" aria-label={t.lang.label}>
        {(['th', 'en'] as const).map((k) => (
          <button key={k} role="radio" aria-checked={l === k} onClick={() => setLocale(k)}
            className={`min-h-12 rounded-xl text-[15px] font-semibold transition-colors duration-200 ${l === k ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
            {k === 'th' ? 'ไทย' : 'English'}
          </button>
        ))}
      </div>
    </Section>
  )
}

export function SettingsPage() {
  const t = useT()
  useEffect(() => {
    const f = sessionStorage.getItem('settings:focus')
    if (f) { sessionStorage.removeItem('settings:focus'); setTimeout(() => document.getElementById(f)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }
  }, [])
  return (
    <div className="min-h-dvh pb-28">
      <TopBar title={t.settings.title} />
      <main className="mx-auto max-w-2xl px-4 pt-4">
        <LanguageSection />
        <div id="asr" className="scroll-mt-20"><AsrSection /></div>
        <ModelsSection />
        <div id="ai" className="scroll-mt-20"><AiSection /></div>
        <TtsSection />
        <PromptSection />
        <StorageSection />
        <section className="mb-8 px-1 text-xs leading-relaxed text-slate-500">
          <Logo size={28} className="mb-3" />
          <p className="mb-1 font-semibold">{t.settings.privacy.title}</p>
          <p>{t.settings.privacy.body}</p>
          <p className="mt-2">{t.settings.privacy.credits}</p>
          <p className="mt-2">{t.settings.privacy.stats}</p>
          <HistatsCounter />
        </section>
      </main>
    </div>
  )
}
