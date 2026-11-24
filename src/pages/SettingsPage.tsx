import { useEffect } from 'react'
import { TopBar } from '../components/ui'
import { AsrSection } from './settings/AsrSection'
import { Logo } from '../components/Logo'
import { ModelsSection } from './settings/ModelsSection'
import { AiSection } from './settings/AiSection'
import { TtsSection } from './settings/TtsSection'
import { PromptSection } from './settings/PromptSection'
import { StorageSection } from './settings/StorageSection'

export function SettingsPage() {
  useEffect(() => {
    const f = sessionStorage.getItem('settings:focus')
    if (f) { sessionStorage.removeItem('settings:focus'); setTimeout(() => document.getElementById(f)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }
  }, [])
  return (
    <div className="min-h-dvh pb-28">
      <TopBar title="ตั้งค่า" />
      <main className="mx-auto max-w-2xl px-4 pt-4">
        <div id="asr" className="scroll-mt-20"><AsrSection /></div>
        <ModelsSection />
        <div id="ai" className="scroll-mt-20"><AiSection /></div>
        <TtsSection />
        <PromptSection />
        <StorageSection />
        <section className="mb-8 px-1 text-xs leading-relaxed text-slate-500">
          <Logo size={28} className="mb-3" />
          <p className="mb-1 font-semibold">ความเป็นส่วนตัว</p>
          <p>meetingCraft ไม่มีเซิร์ฟเวอร์ของตัวเอง ข้อมูลการประชุม เสียง รูป และ API key ถูกเก็บใน IndexedDB ของเบราว์เซอร์บนอุปกรณ์นี้ OCR และเสียงอ่านทำงานในเครื่อง ส่วนการถอดเสียงจะส่งช่วงเสียงสั้น ๆ ไปที่ Typhoon และการสรุปจะส่งข้อความไปที่ AI ที่คุณเลือก</p>
          <p className="mt-2">โมเดล: Typhoon ASR/LLM โดย SCB 10X • OpenThai2.1 OCR Text (Apache-2.0) โดย iApp • MakHam TTS (Apache-2.0) โดย PyThaiNLP</p>
        </section>
      </main>
    </div>
  )
}
