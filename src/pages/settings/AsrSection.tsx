import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../../db/schema'
import { TYPHOON_ASR_MODELS, unloadAsr, useAsrConfig } from '../../asr/recorder'
import { connectTyphoon } from '../../ai/typhoon'
import { Notice, Section, Spinner } from '../../components/ui'
import { toast } from '../../components/feedback'
import { IconCheck } from '../../components/icons'
import { useT } from '../../i18n'

export function AsrSection() {
  const t = useT()
  const A = t.settings.asr
  const asr = useAsrConfig()
  const [model, setModel] = useState(TYPHOON_ASR_MODELS[0])
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [own, setOwn] = useState(false)
  const system = !!asr?.system
  useEffect(() => { getSetting('asr.cloudModel', TYPHOON_ASR_MODELS[0]).then(setModel) }, [])

  const connect = async () => {
    setBusy(true); setErr('')
    try { await connectTyphoon(key.trim()); setKey(''); setOwn(false); unloadAsr(); toast(A.ok) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Section title={A.title} desc={A.desc}>
      <div className="card">
        {asr?.available ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><IconCheck width={20} /></span>
              <div>
                <div className="text-[15px] font-semibold">{A.connected}</div>
                <div className="text-[13px] text-slate-600">{system ? A.viaProxy : A.ownKey} · {A.scope}</div>
              </div>
            </div>
            <label htmlFor="asr-model" className="label">{A.model}</label>
            <select id="asr-model" className="input" value={model} onChange={(e) => { setModel(e.target.value); setSetting('asr.cloudModel', e.target.value); unloadAsr() }}>
              <option value="typhoon-asr-realtime">{A.realtime}</option>
              <option value="typhoon-asr-edge">{A.edge}</option>
            </select>
            {system && !own && (
              <button className="mt-3 min-h-10 text-[13px] font-semibold text-brand-700 underline decoration-dotted underline-offset-2" onClick={() => setOwn(true)}>
                {A.useOwn}
              </button>
            )}
          </>
        ) : null}
        {(!asr?.available || own) && (
          <div className={asr?.available ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
            <p className="mb-3 text-[15px]">{A.pastePrompt} <b>{t.common.free}</b></p>
            <label htmlFor="typhoon-key" className="label">{A.keyLabel}</label>
            <input id="typhoon-key" className="input font-mono text-sm" type="password" autoComplete="off" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} />
            <p className="hint">{A.noKey} <a className="font-semibold text-brand-700 underline" href="https://playground.opentyphoon.ai/" target="_blank" rel="noreferrer">{A.signup}</a> {A.keyLocal}</p>
            {err && <div className="mt-3"><Notice tone="bad">{err}</Notice></div>}
            <button className="btn-primary mt-3 w-full" disabled={!key.trim() || busy} onClick={connect}>{busy ? <><Spinner className="h-4 w-4" />{A.checking}</> : t.common.connect}</button>
          </div>
        )}
        <p className="hint mt-3">{A.footnote}</p>
      </div>
    </Section>
  )
}
