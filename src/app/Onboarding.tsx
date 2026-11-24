import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db/schema'
import { ArtPrivate, ArtRecord, ArtSummary } from '../components/art'

const STEPS = [
  { art: <ArtRecord size={176} />, title: 'จดประชุมแทนคุณ', body: 'กดปุ่มไมค์ แล้วคุยกันตามปกติ meetingCraft จะถอดเสียงภาษาไทยเป็นข้อความให้ทันที และถามตอบเรื่องในประชุมด้วยเสียงได้' },
  { art: <ArtSummary size={176} />, title: 'สรุปให้ในคลิกเดียว', body: 'ได้ภาพรวม มติที่ประชุม และงานที่ต้องทำ พร้อมผู้รับผิดชอบ ถ่ายเอกสารประกอบเข้ามาได้ด้วย' },
  { art: <ArtPrivate size={176} />, title: 'ข้อมูลอยู่กับคุณ', body: 'บันทึก เสียง รูป และข้อความเก็บไว้ในเครื่องนี้ ไม่มีเซิร์ฟเวอร์กลาง ส่งไปเฉพาะช่วงเสียงสั้น ๆ เพื่อถอดความเท่านั้น' },
]

/** Three short, skippable intro cards — shown once. */
export function Onboarding() {
  const [show, setShow] = useState(false)
  const [i, setI] = useState(0)
  useEffect(() => { getSetting('onboarded', false).then((v) => setShow(!v)) }, [])
  if (!show) return null
  const done = () => { setSetting('onboarded', true); setShow(false) }
  const s = STEPS[i]
  const last = i === STEPS.length - 1
  return (
    <div className="pt-safe pb-safe fixed inset-0 z-[70] flex flex-col bg-canvas" role="dialog" aria-modal aria-label="แนะนำการใช้งาน">
      <div className="flex justify-end p-3">
        <button className="btn-ghost min-h-11 px-4 text-sm" onClick={done}>ข้าม</button>
      </div>
      <div key={i} className="animate-pop mx-auto flex max-w-sm flex-1 flex-col items-center justify-center px-8 text-center">
        {s.art}
        <h1 className="mt-6 text-2xl font-bold">{s.title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-slate-600">{s.body}</p>
      </div>
      <div className="mx-auto w-full max-w-sm px-6 pb-6">
        <div className="mb-5 flex justify-center gap-2" aria-label={`ขั้นที่ ${i + 1} จาก ${STEPS.length}`}>
          {STEPS.map((_, k) => <span key={k} className={`h-2 rounded-full transition-all duration-300 ${k === i ? 'w-6 bg-brand-600' : 'w-2 bg-slate-300'}`} />)}
        </div>
        <div className="flex gap-2">
          {i > 0 && <button className="btn-outline flex-1" onClick={() => setI(i - 1)}>ย้อนกลับ</button>}
          <button className="btn-primary flex-[2]" onClick={() => (last ? done() : setI(i + 1))}>{last ? 'เริ่มใช้งาน' : 'ถัดไป'}</button>
        </div>
      </div>
    </div>
  )
}
