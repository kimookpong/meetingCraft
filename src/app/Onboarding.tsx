import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db/schema'
import { ArtPrivate, ArtRecord, ArtSummary } from '../components/art'
import { LangToggle } from '../components/LangToggle'
import { useT } from '../i18n'

/** Three short, skippable intro cards — shown once. */
export function Onboarding() {
  const t = useT()
  const [show, setShow] = useState(false)
  const [i, setI] = useState(0)
  useEffect(() => { getSetting('onboarded', false).then((v) => setShow(!v)) }, [])
  if (!show) return null
  const steps = [
    { art: <ArtRecord size={176} />, title: t.onboarding.s1t, body: t.onboarding.s1b },
    { art: <ArtSummary size={176} />, title: t.onboarding.s2t, body: t.onboarding.s2b },
    { art: <ArtPrivate size={176} />, title: t.onboarding.s3t, body: t.onboarding.s3b },
  ]
  const done = () => { setSetting('onboarded', true); setShow(false) }
  const s = steps[i]
  const last = i === steps.length - 1
  return (
    <div className="pt-safe pb-safe fixed inset-0 z-[70] flex flex-col bg-canvas" role="dialog" aria-modal aria-label={t.onboarding.aria}>
      <div className="flex items-center justify-between p-3">
        <LangToggle />
        <button className="btn-ghost min-h-11 px-4 text-sm" onClick={done}>{t.common.skip}</button>
      </div>
      <div key={i} className="animate-pop mx-auto flex max-w-sm flex-1 flex-col items-center justify-center px-8 text-center">
        {s.art}
        <h1 className="mt-6 text-2xl font-bold">{s.title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-slate-600">{s.body}</p>
      </div>
      <div className="mx-auto w-full max-w-sm px-6 pb-6">
        <div className="mb-5 flex justify-center gap-2" aria-label={t.onboarding.step(i + 1, steps.length)}>
          {steps.map((_, k) => <span key={k} className={`h-2 rounded-full transition-all duration-300 ${k === i ? 'w-6 bg-brand-600' : 'w-2 bg-slate-300'}`} />)}
        </div>
        <div className="flex gap-2">
          {i > 0 && <button className="btn-outline flex-1" onClick={() => setI(i - 1)}>{t.common.back}</button>}
          <button className="btn-primary flex-[2]" onClick={() => (last ? done() : setI(i + 1))}>{last ? t.onboarding.start : t.common.next}</button>
        </div>
      </div>
    </div>
  )
}
