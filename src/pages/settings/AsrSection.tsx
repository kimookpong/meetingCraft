import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../../db/schema'
import { TYPHOON_ASR_MODELS, unloadAsr, useAsrConfig } from '../../asr/recorder'
import { connectTyphoon } from '../../ai/typhoon'
import { Notice, Section, Spinner } from '../../components/ui'
import { toast } from '../../components/feedback'
import { IconCheck } from '../../components/icons'

export function AsrSection() {
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
    try { await connectTyphoon(key.trim()); setKey(''); setOwn(false); unloadAsr(); toast('เชื่อมต่อ Typhoon สำเร็จ พร้อมถอดเสียงและสรุปแล้ว') }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Section title="การถอดเสียง" desc="แปลงเสียงพูดภาษาไทยเป็นข้อความด้วย Typhoon ASR">
      <div className="card">
        {asr?.available ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><IconCheck width={20} /></span>
              <div>
                <div className="text-[15px] font-semibold">เชื่อมต่อ Typhoon แล้ว</div>
                <div className="text-[13px] text-slate-600">{system ? 'ผ่านเซิร์ฟเวอร์ meetingCraft — ไม่ต้องใช้ key' : 'ใช้ API key ของคุณเอง'} · ถอดเสียงและสรุปการประชุม</div>
              </div>
            </div>
            <label htmlFor="asr-model" className="label">โมเดลถอดเสียง</label>
            <select id="asr-model" className="input" value={model} onChange={(e) => { setModel(e.target.value); setSetting('asr.cloudModel', e.target.value); unloadAsr() }}>
              <option value="typhoon-asr-realtime">typhoon-asr-realtime — แม่นกว่า (แนะนำ)</option>
              <option value="typhoon-asr-edge">typhoon-asr-edge — เบากว่า</option>
            </select>
            {system && !own && (
              <button className="mt-3 min-h-10 text-[13px] font-semibold text-brand-700 underline decoration-dotted underline-offset-2" onClick={() => setOwn(true)}>
                ใช้ API key ของฉันเองแทน (เมื่อระบบใช้งานหนาแน่น)
              </button>
            )}
          </>
        ) : null}
        {(!asr?.available || own) && (
          <div className={asr?.available ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
            <p className="mb-3 text-[15px]">วาง API key ของ Typhoon เพื่อเปิดการถอดเสียงและการสรุปด้วย AI ภาษาไทย <b>ใช้ฟรี</b></p>
            <label htmlFor="typhoon-key" className="label">Typhoon API key</label>
            <input id="typhoon-key" className="input font-mono text-sm" type="password" autoComplete="off" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} />
            <p className="hint">ยังไม่มี key? <a className="font-semibold text-brand-700 underline" href="https://playground.opentyphoon.ai/" target="_blank" rel="noreferrer">สมัครฟรีที่ opentyphoon.ai</a> · key เก็บไว้ในเครื่องนี้เท่านั้น</p>
            {err && <div className="mt-3"><Notice tone="bad">{err}</Notice></div>}
            <button className="btn-primary mt-3 w-full" disabled={!key.trim() || busy} onClick={connect}>{busy ? <><Spinner className="h-4 w-4" />กำลังตรวจสอบ…</> : 'เชื่อมต่อ'}</button>
          </div>
        )}
        <p className="hint mt-3">ระบบตัดเสียงเป็นช่วงตามจังหวะหยุดพูด แล้วส่งเฉพาะช่วงเสียงสั้น ๆ ไปถอดความที่เซิร์ฟเวอร์ Typhoon · ไฟล์เสียงเต็มและข้อความทั้งหมดเก็บไว้ในเครื่องนี้</p>
      </div>
    </Section>
  )
}
