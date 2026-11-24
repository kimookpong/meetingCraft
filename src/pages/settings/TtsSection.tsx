import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../../db/schema'
import { DEFAULT_TTS, listWebVoices, speak, stopSpeaking, ttsState, type TtsSettings } from '../../tts/player'
import { modelStates } from '../../models/modelStore'
import { Section } from '../../components/ui'
import { IconSpeaker } from '../../components/icons'
import { useLocale, useT } from '../../i18n'

export function TtsSection() {
  const t = useT()
  const T = t.settings.tts
  const l = useLocale()
  const [s, setS] = useState<TtsSettings>(DEFAULT_TTS)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const models = modelStates.use()
  const tts = ttsState.use()
  useEffect(() => {
    getSetting('tts', DEFAULT_TTS).then(setS)
    const load = () => setVoices(listWebVoices(l))
    load()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = load
  }, [l])
  const update = (p: Partial<TtsSettings>) => { const n = { ...s, ...p }; setS(n); setSetting('tts', n) }
  const makhamReady = models.tts.status === 'ready'

  return (
    <Section title={T.title} desc={T.desc}>
      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="tts-engine">{T.engine}</label>
          <select id="tts-engine" className="input" value={s.engine} onChange={(e) => update({ engine: e.target.value as TtsSettings['engine'] })}>
            <option value="makham">{T.makham}{makhamReady ? '' : T.notDownloaded}</option>
            <option value="web-speech">{T.webSpeech}</option>
          </select>
          {s.engine === 'makham' && !makhamReady && <p className="mt-1 text-xs text-amber-700">{T.fallbackNote}</p>}
          {s.engine === 'makham' && <p className="hint">{T.englishNote}</p>}
        </div>
        {s.engine === 'web-speech' && (
          <div>
            <label className="label" htmlFor="tts-voice">{T.voice}</label>
            <select id="tts-voice" className="input" value={s.voiceURI ?? ''} onChange={(e) => update({ voiceURI: e.target.value || undefined })}>
              <option value="">{T.auto}</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{v.localService ? '' : T.online}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="tts-speed">{T.speed(s.speed.toFixed(1))}</label>
          <input id="tts-speed" type="range" min={0.6} max={1.6} step={0.1} value={s.speed} onChange={(e) => update({ speed: Number(e.target.value) })} className="w-full accent-brand-600" />
        </div>
        <button className="btn-outline w-full" onClick={() => (tts.speaking ? stopSpeaking() : speak(T.sample, 'test'))}>
          <IconSpeaker /> {tts.speaking ? t.common.stop : T.test}
        </button>
        {tts.error && <p className="text-sm text-rose-600">{tts.error}</p>}
      </div>
    </Section>
  )
}
