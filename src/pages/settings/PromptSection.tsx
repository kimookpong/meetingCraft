import { useEffect, useState } from 'react'
import { defaultFormat, defaultSystem, getPrompt, savePrompt } from '../../ai/prompts'
import { Section } from '../../components/ui'
import { useLocale, useT } from '../../i18n'

export function PromptSection() {
  const t = useT()
  const l = useLocale()
  const [open, setOpen] = useState(false)
  const [sys, setSys] = useState('')
  const [fmt, setFmt] = useState('')
  useEffect(() => {
    getPrompt('system', l).then(setSys)
    getPrompt('format', l).then(setFmt)
  }, [l])
  return (
    <Section title={t.settings.prompt.title} desc={t.settings.prompt.desc}>
      <div className="card">
        {!open ? (
          <button className="btn-ghost w-full justify-between" onClick={() => setOpen(true)}>{t.settings.prompt.open} <span>›</span></button>
        ) : (
          <div className="space-y-3">
            <p className="hint mt-0">{t.settings.prompt.note}</p>
            <div><label className="label">{t.settings.prompt.system}</label><textarea className="input min-h-40 py-2 text-sm" value={sys} onChange={(e) => setSys(e.target.value)} onBlur={() => savePrompt('system', sys, l)} /></div>
            <div><label className="label">{t.settings.prompt.format}</label><textarea className="input min-h-52 py-2 font-mono text-xs" value={fmt} onChange={(e) => setFmt(e.target.value)} onBlur={() => savePrompt('format', fmt, l)} /></div>
            <button className="btn-outline w-full text-sm" onClick={() => { setSys(defaultSystem(l)); setFmt(defaultFormat(l)); savePrompt('system', defaultSystem(l), l); savePrompt('format', defaultFormat(l), l) }}>{t.settings.prompt.reset}</button>
          </div>
        )}
      </div>
    </Section>
  )
}
