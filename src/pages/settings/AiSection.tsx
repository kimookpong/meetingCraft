import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting, uid, type AiProviderConfig } from '../../db/schema'
import { PRESETS } from '../../ai/presets'
import { EXTRACTIVE_ID, createProvider } from '../../ai/registry'
import { OpenAiCompatibleProvider } from '../../ai/providers/openaiCompatible'
import { testAnthropic } from '../../ai/providers/anthropic'
import { Notice, Section, Sheet } from '../../components/ui'
import { confirmDialog, toast } from '../../components/feedback'
import { IconPlus, IconShield } from '../../components/icons'
import type { ProviderPreset } from '../../ai/types'

const badge = (p: ProviderPreset) => (
  <div className="mt-1.5 flex flex-wrap gap-1">
    <span className="chip">ไทย: {p.thai}</span>
    <span className={`chip ${p.free.startsWith('ฟรี') ? 'bg-emerald-100 text-emerald-800' : ''}`}>{p.free}</span>
    <span className={`chip ${p.privacy === 'ส่งออกนอกเครื่อง' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{p.privacy}</span>
    {p.sizeMB && <span className="chip">~{p.sizeMB >= 1000 ? `${(p.sizeMB / 1000).toFixed(1)} GB` : `${p.sizeMB} MB`}</span>}
  </div>
)

export function AiSection() {
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  const [def, setDef] = useState(EXTRACTIVE_ID)
  const [picker, setPicker] = useState(false)
  const [edit, setEdit] = useState<AiProviderConfig | null>(null)
  useEffect(() => { getSetting('ai.default', EXTRACTIVE_ID).then(setDef) }, [])
  const webgpu = 'gpu' in navigator

  const addPreset = (p: ProviderPreset) => {
    setPicker(false)
    setEdit({ id: uid(), kind: p.kind, label: p.label, baseUrl: p.baseUrl, model: p.model, chunkChars: p.chunkChars, createdAt: Date.now() })
  }

  return (
    <Section title="AI ช่วยสรุป" desc="เลือกได้หลายตัว แล้วกดวงกลมเพื่อตั้งเป็นค่าเริ่มต้น" action={<button className="btn-ghost min-h-9 px-2 text-sm text-brand-700" onClick={() => setPicker(true)}><IconPlus width={18} />เพิ่ม</button>}>
      <div className="card divide-y divide-slate-100 p-0">
        <ProviderRow label="สรุปแบบดึงประโยค (ไม่ใช้ AI)" sub="ในเครื่อง • ไม่ต้องตั้งค่า" active={def === EXTRACTIVE_ID} onDefault={() => { setDef(EXTRACTIVE_ID); setSetting('ai.default', EXTRACTIVE_ID) }} />
        {providers?.map((p) => (
          <ProviderRow key={p.id} label={p.label} sub={`${p.model}${p.baseUrl ? ` • ${new URL(p.baseUrl).host}` : ''}`} active={def === p.id}
            onDefault={() => { setDef(p.id); setSetting('ai.default', p.id) }} onEdit={() => setEdit(p)} />
        ))}
      </div>
      <p className="hint mt-2 px-1">แนะนำ: ข้อมูลลับใช้โมเดล ONNX ในเครื่องหรือ Ollama • ข้อมูลทั่วไปใช้ Typhoon API (ภาษาไทยดีที่สุด ฟรี)</p>

      <Sheet open={picker} onClose={() => setPicker(false)} title="เลือก AI ที่จะเพิ่ม">
        <div className="space-y-2">
          {[...PRESETS].filter((p) => p.kind !== 'extractive').sort((a, b) => Number(b.key === 'typhoon') - Number(a.key === 'typhoon')).map((p) => {
            const disabled = p.kind === 'onnx-local' && !webgpu
            return (
              <button key={p.key} disabled={disabled} onClick={() => addPreset(p)} className="card block w-full text-left disabled:opacity-50">
                <div className="flex items-center gap-2 font-semibold">{p.label}{p.key === 'typhoon' && <span className="chip bg-accent-100 text-accent-700">แนะนำ</span>}</div>
                <div className="text-sm text-slate-500">{disabled ? 'ต้องใช้เบราว์เซอร์ที่รองรับ WebGPU' : p.note}</div>
                {badge(p)}
              </button>
            )
          })}
          <button onClick={() => addPreset({ ...PRESETS.find((x) => x.key === 'ollama')!, label: 'Custom (OpenAI-compatible)', baseUrl: 'https://', model: '' })} className="card block w-full text-left">
            <div className="font-medium">กำหนดเอง (OpenAI-compatible)</div>
            <div className="text-sm text-slate-500">vLLM, llama.cpp server, LiteLLM, Azure, หรือ endpoint อื่นที่รองรับ /chat/completions</div>
          </button>
        </div>
      </Sheet>
      {edit && <ProviderEditor cfg={edit} onClose={() => setEdit(null)} />}
    </Section>
  )
}

function ProviderRow({ label, sub, active, onDefault, onEdit }: { label: string; sub: string; active: boolean; onDefault: () => void; onEdit?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={onDefault} aria-label="ตั้งเป็นค่าเริ่มต้น" className={`h-5 w-5 shrink-0 rounded-full border-2 ${active ? 'border-brand-600 bg-brand-600 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300'}`} />
      <div className="min-w-0 flex-1" onClick={onEdit ?? onDefault}>
        <div className="truncate text-[15px]">{label}</div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
      {onEdit && <button className="btn-ghost min-h-9 px-3 text-sm" onClick={onEdit}>แก้ไข</button>}
    </div>
  )
}

function ProviderEditor({ cfg, onClose }: { cfg: AiProviderConfig; onClose: () => void }) {
  const [c, setC] = useState(cfg)
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)
  const [models, setModels] = useState<string[]>([])
  const preset = PRESETS.find((p) => p.kind === c.kind && (p.baseUrl === cfg.baseUrl || p.kind !== 'openai-compatible'))
  const isNew = !cfg.createdAt || cfg.createdAt > Date.now() - 1000

  const save = async () => { await db.providers.put(c); toast(`บันทึก ${c.label} แล้ว`); onClose() }
  const remove = async () => { if (await confirmDialog({ title: `ลบ ${c.label}?`, body: 'ลบเฉพาะการตั้งค่านี้ สรุปที่เคยทำไว้ยังอยู่ครบ', ok: 'ลบ', danger: true })) { await db.providers.delete(c.id); toast('ลบแล้ว'); onClose() } }
  const test = async () => {
    setStatus({ tone: 'info', text: 'กำลังทดสอบ…' })
    try {
      if (c.kind === 'openai-compatible') {
        const list = await new OpenAiCompatibleProvider(c).listModels().catch(() => [] as string[])
        setModels(list)
        const out = await createProvider(c).complete({ system: 'ตอบสั้นที่สุด', prompt: 'ตอบคำว่า "พร้อม" คำเดียว' })
        setStatus({ tone: 'ok', text: `เชื่อมต่อได้ ✓ ตอบกลับ: ${out.slice(0, 60)}` })
      } else if (c.kind === 'anthropic') {
        await testAnthropic(c.apiKey ?? '')
        setStatus({ tone: 'ok', text: 'API key ใช้งานได้ ✓' })
      } else if (c.kind === 'onnx-local') {
        setStatus({ tone: 'info', text: 'กำลังดาวน์โหลด/โหลดโมเดล… (ครั้งแรกใช้เวลานาน)' })
        const out = await createProvider(c).complete({ system: 'ตอบสั้นที่สุด', prompt: 'สวัสดี' })
        setStatus({ tone: 'ok', text: `โมเดลทำงานในเครื่องได้ ✓ ${out.slice(0, 60)}` })
      }
    } catch (e) {
      const msg = (e as Error).message
      const hint = /Failed to fetch|NetworkError|Load failed/i.test(msg) ? ' — อาจติด CORS หรือเซิร์ฟเวอร์ไม่ได้เปิด (Ollama: ตั้ง OLLAMA_ORIGINS=*)' : ''
      setStatus({ tone: 'bad', text: msg + hint })
    }
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'เพิ่ม AI' : 'แก้ไข AI'}
      footer={<div className="flex gap-2">{!isNew && <button className="btn-outline text-rose-600" onClick={remove}>ลบ</button>}<button className="btn-outline flex-1" onClick={test}>ทดสอบ</button><button className="btn-primary flex-1" onClick={save}>บันทึก</button></div>}>
      <div className="space-y-3">
        {preset?.note && <Notice tone={preset.privacy === 'ส่งออกนอกเครื่อง' ? 'warn' : 'ok'}>{preset.privacy !== 'ส่งออกนอกเครื่อง' && <IconShield width={16} className="mr-1 inline" />}{preset.note}</Notice>}
        <div><label className="label">ชื่อที่แสดง</label><input className="input" value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} /></div>
        {c.kind === 'openai-compatible' && (
          <div><label className="label">Base URL</label><input className="input font-mono text-sm" inputMode="url" value={c.baseUrl ?? ''} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} /></div>
        )}
        <div>
          <label className="label">{c.kind === 'onnx-local' ? 'Hugging Face repo (ONNX)' : 'Model'}</label>
          <input className="input font-mono text-sm" list="model-list" value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} />
          <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
          {models.length > 0 && <p className="mt-1 text-xs text-slate-500">พบ {models.length} โมเดลจาก endpoint — พิมพ์เพื่อเลือก</p>}
        </div>
        {(c.kind === 'openai-compatible' || c.kind === 'anthropic') && (
          <div>
            <label className="label">API key {preset?.keyUrl && <a className="ml-1 text-brand-700 underline" href={preset.keyUrl} target="_blank" rel="noreferrer">ขอ key</a>}</label>
            <input className="input font-mono text-sm" type="password" autoComplete="off" value={c.apiKey ?? ''} onChange={(e) => setC({ ...c, apiKey: e.target.value })} placeholder={preset?.needsKey === false ? 'ไม่จำเป็น' : ''} />
            <p className="mt-1 text-xs text-slate-500">เก็บใน IndexedDB ของเครื่องนี้เท่านั้น (ไม่ได้เข้ารหัส) และไม่ถูกรวมในไฟล์สำรองข้อมูล</p>
          </div>
        )}
        <div>
          <label className="label">ขนาดข้อความต่อคำขอ (ตัวอักษร)</label>
          <input className="input" type="number" inputMode="numeric" value={c.chunkChars ?? 24000} onChange={(e) => setC({ ...c, chunkChars: Number(e.target.value) || 24000 })} />
          <p className="mt-1 text-xs text-slate-500">ถ้าบันทึกยาวกว่านี้ จะสรุปทีละช่วงแล้วรวม (map-reduce)</p>
        </div>
        {status && <Notice tone={status.tone}>{status.text}</Notice>}
      </div>
    </Sheet>
  )
}
