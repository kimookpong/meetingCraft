import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../../db/schema'
import { DEFAULT_FORMAT, DEFAULT_SYSTEM_PROMPT } from '../../ai/prompts'
import { Section } from '../../components/ui'

export function PromptSection() {
  const [open, setOpen] = useState(false)
  const [sys, setSys] = useState('')
  const [fmt, setFmt] = useState('')
  useEffect(() => {
    getSetting('prompt.system', DEFAULT_SYSTEM_PROMPT).then(setSys)
    getSetting('prompt.format', DEFAULT_FORMAT).then(setFmt)
  }, [])
  return (
    <Section title="รูปแบบรายงานสรุป" desc="สำหรับผู้ที่อยากปรับหัวข้อหรือสำนวนเอง">
      <div className="card">
        {!open ? (
          <button className="btn-ghost w-full justify-between" onClick={() => setOpen(true)}>แก้ไขคำสั่งและรูปแบบรายงาน <span>›</span></button>
        ) : (
          <div className="space-y-3">
            <div><label className="label">บทบาท / หลักการ (system)</label><textarea className="input min-h-40 py-2 text-sm" value={sys} onChange={(e) => setSys(e.target.value)} onBlur={() => setSetting('prompt.system', sys)} /></div>
            <div><label className="label">รูปแบบรายงาน ({'{title}'} = ชื่อการประชุม)</label><textarea className="input min-h-52 py-2 font-mono text-xs" value={fmt} onChange={(e) => setFmt(e.target.value)} onBlur={() => setSetting('prompt.format', fmt)} /></div>
            <button className="btn-outline w-full text-sm" onClick={() => { setSys(DEFAULT_SYSTEM_PROMPT); setFmt(DEFAULT_FORMAT); setSetting('prompt.system', DEFAULT_SYSTEM_PROMPT); setSetting('prompt.format', DEFAULT_FORMAT) }}>คืนค่าเริ่มต้น</button>
          </div>
        )}
      </div>
    </Section>
  )
}
