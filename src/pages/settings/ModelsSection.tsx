import { useEffect, useState } from 'react'
import { MODELS, totalSize, type ModelKey } from '../../models/registry'
import { cancelDownload, deleteModel, downloadModel, modelStates } from '../../models/modelStore'
import { Progress, Section } from '../../components/ui'
import { fmtBytes } from '../../lib/format'
import { confirmDialog, toast } from '../../components/feedback'
import { deviceInfo, type DeviceInfo } from '../../lib/device'

const ORDER: ModelKey[] = ['ocr', 'tts']
const USE: Record<ModelKey, string> = { ocr: 'สแกนเอกสาร', tts: 'อ่านออกเสียง' }

export function ModelsSection() {
  const states = modelStates.use()
  const [dev, setDev] = useState<DeviceInfo | null>(null)
  useEffect(() => { deviceInfo().then(setDev) }, [states])

  return (
    <Section title="โมเดลในเครื่อง" desc="ดาวน์โหลดครั้งเดียว ทำงานได้แม้ออฟไลน์">
      <div className="space-y-2">
        {ORDER.map((k) => {
          const spec = MODELS[k]
          const s = states[k]
          return (
            <div key={k} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="chip">{USE[k]}</span>
                    {s.status === 'ready' && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">พร้อมใช้</span>}
                  </div>
                  <div className="mt-1.5 font-medium">{spec.label}</div>
                  <div className="text-sm text-slate-500">{spec.description}</div>
                  <div className="mt-1 text-xs text-slate-400">{fmtBytes(totalSize(spec))} • {spec.license} • {spec.repo}</div>
                </div>
              </div>
              {s.status === 'downloading' && (
                <div className="mt-3">
                  <Progress value={s.loaded / s.total} />
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>{s.file} — {fmtBytes(s.loaded)} / {fmtBytes(s.total)}</span>
                    <button className="text-rose-600" onClick={() => cancelDownload(k)}>ยกเลิก</button>
                  </div>
                </div>
              )}
              {s.status === 'error' && <div className="mt-2 text-sm text-rose-600">{s.message} — กดดาวน์โหลดอีกครั้งเพื่อทำต่อจากเดิม</div>}
              <div className="mt-3 flex gap-2">
                {(s.status === 'absent' || s.status === 'error') && (
                  <button className="btn-primary flex-1" onClick={() => downloadModel(k).then(() => toast(`${spec.label} พร้อมใช้แล้ว`)).catch(() => toast('ดาวน์โหลดสะดุด กดอีกครั้งเพื่อทำต่อ', 'bad'))}>ดาวน์โหลด {fmtBytes(totalSize(spec))}</button>
                )}
                {s.status === 'ready' && (
                  <button className="btn-outline text-rose-600" onClick={async () => { if (await confirmDialog({ title: `ลบ ${spec.label}?`, body: 'คืนพื้นที่ในเครื่อง ดาวน์โหลดใหม่ได้ทุกเมื่อ', ok: 'ลบโมเดล', danger: true })) { await deleteModel(k); toast('ลบโมเดลแล้ว') } }}>ลบโมเดล</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {dev && (
        <p className="mt-2 px-1 text-xs text-slate-400">
          อุปกรณ์: {dev.memoryGB ? `RAM ~${dev.memoryGB} GB • ` : ''}{dev.cores} cores • WebGPU {dev.webgpu ? 'มี' : 'ไม่มี'} • multi-thread {dev.isolated ? 'เปิด' : 'ปิด'}
        </p>
      )}
    </Section>
  )
}
