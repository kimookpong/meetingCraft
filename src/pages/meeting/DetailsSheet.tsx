import { useEffect, useState } from 'react'
import { touchMeeting, type Meeting } from '../../db/schema'
import { Sheet } from '../../components/ui'

export function DetailsSheet({ meeting, open, onClose }: { meeting: Meeting; open: boolean; onClose: () => void }) {
  const [f, setF] = useState(meeting)
  useEffect(() => { if (open) setF(meeting) }, [open, meeting])
  const save = async () => {
    await touchMeeting(meeting.id, {
      title: f.title.trim() || meeting.title, location: f.location, agenda: f.agenda, language: f.language,
      attendees: (Array.isArray(f.attendees) ? f.attendees : String(f.attendees).split(',')).map((s) => s.trim()).filter(Boolean),
    })
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="รายละเอียดการประชุม" footer={<button className="btn-primary w-full" onClick={save}>บันทึก</button>}>
      <div className="space-y-3">
        <div><label className="label">ชื่อการประชุม</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">สถานที่ / ช่องทาง</label><input className="input" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        <div>
          <label className="label">ผู้เข้าร่วม (คั่นด้วยจุลภาค)</label>
          <input className="input" value={Array.isArray(f.attendees) ? f.attendees.join(', ') : f.attendees}
            onChange={(e) => setF({ ...f, attendees: e.target.value as unknown as string[] })} />
        </div>
        <div><label className="label">วาระการประชุม</label><textarea className="input min-h-24 py-2" value={f.agenda ?? ''} onChange={(e) => setF({ ...f, agenda: e.target.value })} /></div>
        <div>
          <label className="label">ภาษาที่พูด (สำหรับถอดเสียง)</label>
          <select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as Meeting['language'] })}>
            <option value="th-TH">ภาษาไทย</option>
            <option value="th-mix">ไทยปนอังกฤษ (code-switching)</option>
          </select>
        </div>
      </div>
    </Sheet>
  )
}
