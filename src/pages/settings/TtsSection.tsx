import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../../db/schema'
import { DEFAULT_TTS, listWebVoices, speak, stopSpeaking, ttsState, type TtsSettings } from '../../tts/player'
import { modelStates } from '../../models/modelStore'
import { Section } from '../../components/ui'
import { IconSpeaker } from '../../components/icons'

export function TtsSection() {
  const [s, setS] = useState<TtsSettings>(DEFAULT_TTS)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const models = modelStates.use()
  const tts = ttsState.use()
  useEffect(() => {
    getSetting('tts', DEFAULT_TTS).then(setS)
    const load = () => setVoices(listWebVoices())
    load()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = load
  }, [])
  const update = (p: Partial<TtsSettings>) => { const n = { ...s, ...p }; setS(n); setSetting('tts', n) }
  const makhamReady = models.tts.status === 'ready'

  return (
    <Section title="เสียงอ่าน" desc="ให้แอปอ่านสรุปหรือเอกสารให้ฟัง">
      <div className="card space-y-3">
        <div>
          <label className="label">เครื่องสังเคราะห์เสียง</label>
          <select className="input" value={s.engine} onChange={(e) => update({ engine: e.target.value as TtsSettings['engine'] })}>
            <option value="makham">MakHam TTS (ONNX ในเครื่อง){makhamReady ? '' : ' — ยังไม่ได้ดาวน์โหลด'}</option>
            <option value="web-speech">เสียงของระบบ (Web Speech)</option>
          </select>
          {s.engine === 'makham' && !makhamReady && <p className="mt-1 text-xs text-amber-700">จะใช้เสียงของระบบแทนจนกว่าจะดาวน์โหลด MakHam ในหัวข้อโมเดลด้านบน</p>}
        </div>
        {s.engine === 'web-speech' && (
          <div>
            <label className="label">เสียง</label>
            <select className="input" value={s.voiceURI ?? ''} onChange={(e) => update({ voiceURI: e.target.value || undefined })}>
              <option value="">อัตโนมัติ (ภาษาไทย)</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{v.localService ? '' : ' (ออนไลน์)'}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">ความเร็ว {s.speed.toFixed(1)}×</label>
          <input type="range" min={0.6} max={1.6} step={0.1} value={s.speed} onChange={(e) => update({ speed: Number(e.target.value) })} className="w-full accent-brand-700" />
        </div>
        <button className="btn-outline w-full" onClick={() => (tts.speaking ? stopSpeaking() : speak('สวัสดีค่ะ ยินดีต้อนรับสู่ระบบบันทึกการประชุม มีทคราฟต์ การประชุมวันนี้มีวาระทั้งหมดสามวาระ', 'test'))}>
          <IconSpeaker /> {tts.speaking ? 'หยุด' : 'ทดสอบเสียง'}
        </button>
        {tts.error && <p className="text-sm text-rose-600">{tts.error}</p>}
      </div>
    </Section>
  )
}
