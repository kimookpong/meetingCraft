import { useEffect, useRef, useState } from 'react'
import { Section, Toggle } from '../../components/ui'
import { deviceInfo, type DeviceInfo } from '../../lib/device'
import { downloadBlob, exportBackup, importBackup } from '../../lib/exporters'
import { fmtBytes } from '../../lib/format'
import { toast } from '../../components/feedback'

export function StorageSection() {
  const [d, setD] = useState<DeviceInfo | null>(null)
  const [audio, setAudio] = useState(true)
  const [busy, setBusy] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const refresh = () => deviceInfo().then(setD)
  useEffect(() => { refresh() }, [])

  return (
    <Section title="สำรองข้อมูล" desc="ย้ายเครื่องหรือกันข้อมูลหาย">
      <div className="card space-y-3">
        {d?.quota && (
          <div className="text-sm">
            ใช้ไป {fmtBytes(d.usage ?? 0)} จาก {fmtBytes(d.quota)}
            <div className="text-xs text-slate-500">{d.persisted ? '✓ เบราว์เซอร์จะไม่ลบข้อมูลอัตโนมัติ' : 'เบราว์เซอร์อาจลบข้อมูลเมื่อพื้นที่เต็ม'}</div>
          </div>
        )}
        {!d?.persisted && <button className="btn-outline w-full text-sm" onClick={async () => { await navigator.storage.persist(); refresh() }}>ขอให้เก็บข้อมูลถาวร</button>}
        <Toggle checked={audio} onChange={setAudio} label="รวมไฟล์เสียงในไฟล์สำรอง" hint="ไฟล์จะใหญ่ขึ้นมาก (~115 MB/ชั่วโมง)" />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary text-sm" disabled={!!busy} onClick={async () => {
            setBusy('กำลังสำรอง…')
            try { downloadBlob(await exportBackup(audio), `meetingcraft-backup-${new Date().toISOString().slice(0, 10)}.zip`) } finally { setBusy('') }
          }}>{busy || 'สำรองข้อมูล'}</button>
          <button className="btn-outline text-sm" disabled={!!busy} onClick={() => file.current?.click()}>กู้คืนจากไฟล์</button>
          <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy('กำลังกู้คืน…')
            try { toast(`กู้คืน ${await importBackup(f)} การประชุมแล้ว`) } catch (err) { toast(`กู้คืนไม่สำเร็จ: ${(err as Error).message}`, 'bad') } finally { setBusy(''); refresh() }
          }} />
        </div>
      </div>
    </Section>
  )
}
