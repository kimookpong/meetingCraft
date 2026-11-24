import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting, uid, type AiProviderConfig } from '../../db/schema'
import { PRESETS } from '../../ai/presets'
import { EXTRACTIVE_ID, createProvider } from '../../ai/registry'
import { OpenAiCompatibleProvider } from '../../ai/providers/openaiCompatible'
import { testAnthropic } from '../../ai/providers/anthropic'
import { providerLabel } from '../../ai/labels'
import { Notice, Section, Sheet } from '../../components/ui'
import { confirmDialog, toast } from '../../components/feedback'
import { IconPlus, IconShield } from '../../components/icons'
import { useT, type Dict } from '../../i18n'
import type { ProviderPreset } from '../../ai/types'

type PresetText = { label: string; note: string; free?: string }
const presetText = (t: Dict, key: string): PresetText | undefined => (t.presets as unknown as Record<string, PresetText>)[key]

function Badges({ p, t }: { p: ProviderPreset; t: Dict }) {
  const A = t.settings.ai
  const free = presetText(t, p.key)?.free ?? t.presets.freeLabel
  const isFree = !p.paid
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      <span className="chip">{A.thai(A.quality[p.thai])}</span>
      <span className={`chip ${isFree ? 'bg-emerald-100 text-emerald-800' : ''}`}>{free}</span>
      <span className={`chip ${p.privacy === 'remote' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{A.privacy[p.privacy]}</span>
      {p.sizeMB && <span className="chip">~{p.sizeMB >= 1000 ? `${(p.sizeMB / 1000).toFixed(1)} GB` : `${p.sizeMB} MB`}</span>}
    </div>
  )
}

export function AiSection() {
  const t = useT()
  const A = t.settings.ai
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  const [def, setDef] = useState(EXTRACTIVE_ID)
  const [picker, setPicker] = useState(false)
  const [edit, setEdit] = useState<AiProviderConfig | null>(null)
  useEffect(() => { getSetting('ai.default', EXTRACTIVE_ID).then(setDef) }, [])
  const webgpu = 'gpu' in navigator

  const addPreset = (p: ProviderPreset, label?: string) => {
    setPicker(false)
    setEdit({ id: uid(), kind: p.kind, label: label ?? presetText(t, p.key)?.label ?? p.label, baseUrl: p.baseUrl, model: p.model, chunkChars: p.chunkChars, createdAt: Date.now() })
  }

  return (
    <Section title={A.title} desc={A.desc} action={<button className="btn-ghost min-h-9 px-2 text-sm text-brand-700" onClick={() => setPicker(true)}><IconPlus width={18} />{t.common.add}</button>}>
      <div className="card divide-y divide-slate-100 p-0">
        <ProviderRow label={A.extractive} sub={A.extractiveSub} active={def === EXTRACTIVE_ID} onDefault={() => { setDef(EXTRACTIVE_ID); setSetting('ai.default', EXTRACTIVE_ID) }} t={t} />
        {providers?.map((p) => (
          <ProviderRow key={p.id} label={providerLabel(p, t)} sub={p.managed ? A.managedSub : `${p.model}${p.baseUrl ? ` • ${new URL(p.baseUrl).host}` : ''}`} active={def === p.id}
            onDefault={() => { setDef(p.id); setSetting('ai.default', p.id) }} onEdit={p.managed ? undefined : () => setEdit(p)} t={t} />
        ))}
      </div>
      <p className="hint mt-2 px-1">{A.tip}</p>

      <Sheet open={picker} onClose={() => setPicker(false)} title={A.pickTitle}>
        <div className="space-y-2">
          {[...PRESETS].filter((p) => p.kind !== 'extractive').sort((a, b) => Number(b.key === 'typhoon') - Number(a.key === 'typhoon')).map((p) => {
            const disabled = p.kind === 'onnx-local' && !webgpu
            const txt = presetText(t, p.key)
            return (
              <button key={p.key} disabled={disabled} onClick={() => addPreset(p)} className="card block w-full text-left disabled:opacity-50">
                <div className="flex items-center gap-2 font-semibold">{txt?.label ?? p.label}{p.key === 'typhoon' && <span className="chip bg-accent-100 text-accent-700">{t.common.recommended}</span>}</div>
                <div className="text-sm text-slate-600">{disabled ? A.needsWebgpu : txt?.note}</div>
                <Badges p={p} t={t} />
              </button>
            )
          })}
          <button onClick={() => addPreset({ ...PRESETS.find((x) => x.key === 'ollama')!, baseUrl: 'https://', model: '' }, A.customTitle)} className="card block w-full text-left">
            <div className="font-semibold">{A.customTitle}</div>
            <div className="text-sm text-slate-600">{A.customDesc}</div>
          </button>
        </div>
      </Sheet>
      {edit && <ProviderEditor cfg={edit} onClose={() => setEdit(null)} />}
    </Section>
  )
}

function ProviderRow({ label, sub, active, onDefault, onEdit, t }: { label: string; sub: string; active: boolean; onDefault: () => void; onEdit?: () => void; t: Dict }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={onDefault} aria-label={t.settings.ai.setDefault} aria-pressed={active} className={`h-5 w-5 shrink-0 rounded-full border-2 ${active ? 'border-brand-600 bg-brand-600 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300'}`} />
      <div className="min-w-0 flex-1" onClick={onEdit ?? onDefault}>
        <div className="truncate text-[15px]">{label}</div>
        <div className="truncate text-xs text-slate-600">{sub}</div>
      </div>
      {onEdit && <button className="btn-ghost min-h-9 px-3 text-sm" onClick={onEdit}>{t.common.edit}</button>}
    </div>
  )
}

function ProviderEditor({ cfg, onClose }: { cfg: AiProviderConfig; onClose: () => void }) {
  const t = useT()
  const A = t.settings.ai
  const [c, setC] = useState(cfg)
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)
  const [models, setModels] = useState<string[]>([])
  const preset = PRESETS.find((p) => p.kind === c.kind && (p.baseUrl === cfg.baseUrl || p.kind !== 'openai-compatible'))
  const note = preset && presetText(t, preset.key)?.note
  const isNew = !cfg.createdAt || cfg.createdAt > Date.now() - 1000

  const save = async () => { await db.providers.put(c); toast(A.savedToast(c.label)); onClose() }
  const remove = async () => {
    if (await confirmDialog({ title: A.deleteQ(c.label), body: A.deleteBody, ok: t.common.delete, danger: true })) { await db.providers.delete(c.id); toast(t.common.deleted); onClose() }
  }
  const test = async () => {
    setStatus({ tone: 'info', text: A.testing })
    try {
      if (c.kind === 'openai-compatible') {
        const list = await new OpenAiCompatibleProvider(c).listModels().catch(() => [] as string[])
        setModels(list)
        const out = await createProvider(c).complete({ system: A.testSystem, prompt: A.testPrompt })
        setStatus({ tone: 'ok', text: A.okReply(out.slice(0, 60)) })
      } else if (c.kind === 'anthropic') {
        await testAnthropic(c.apiKey ?? '')
        setStatus({ tone: 'ok', text: A.okKey })
      } else if (c.kind === 'onnx-local') {
        setStatus({ tone: 'info', text: A.loadingLocal })
        const out = await createProvider(c).complete({ system: A.testSystem, prompt: A.testHello })
        setStatus({ tone: 'ok', text: A.okLocal(out.slice(0, 60)) })
      }
    } catch (e) {
      const msg = (e as Error).message
      const hint = /Failed to fetch|NetworkError|Load failed/i.test(msg) ? A.corsHint : ''
      setStatus({ tone: 'bad', text: msg + hint })
    }
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? A.addTitle : A.editTitle}
      footer={<div className="flex gap-2">{!isNew && <button className="btn-outline text-rose-600" onClick={remove}>{t.common.delete}</button>}<button className="btn-outline flex-1" onClick={test}>{t.common.test}</button><button className="btn-primary flex-1" onClick={save}>{t.common.save}</button></div>}>
      <div className="space-y-3">
        {note && <Notice tone={preset!.privacy === 'remote' ? 'warn' : 'ok'}>{preset!.privacy !== 'remote' && <IconShield width={16} className="mr-1 inline" />}{note}</Notice>}
        <div><label className="label" htmlFor="ai-name">{A.displayName}</label><input id="ai-name" className="input" value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} /></div>
        {c.kind === 'openai-compatible' && (
          <div><label className="label" htmlFor="ai-url">Base URL</label><input id="ai-url" className="input font-mono text-sm" inputMode="url" value={c.baseUrl ?? ''} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} /></div>
        )}
        <div>
          <label className="label" htmlFor="ai-model">{c.kind === 'onnx-local' ? A.hfRepo : 'Model'}</label>
          <input id="ai-model" className="input font-mono text-sm" list="model-list" value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} />
          <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
          {models.length > 0 && <p className="hint">{A.foundModels(models.length)}</p>}
        </div>
        {(c.kind === 'openai-compatible' || c.kind === 'anthropic') && (
          <div>
            <label className="label" htmlFor="ai-key">API key {preset?.keyUrl && <a className="ml-1 text-brand-700 underline" href={preset.keyUrl} target="_blank" rel="noreferrer">{A.getKey}</a>}</label>
            <input id="ai-key" className="input font-mono text-sm" type="password" autoComplete="off" value={c.apiKey ?? ''} onChange={(e) => setC({ ...c, apiKey: e.target.value })} placeholder={preset?.needsKey === false ? A.optional : ''} />
            <p className="hint">{A.keyHint}</p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="ai-chunk">{A.chunk}</label>
          <input id="ai-chunk" className="input" type="number" inputMode="numeric" value={c.chunkChars ?? 24000} onChange={(e) => setC({ ...c, chunkChars: Number(e.target.value) || 24000 })} />
          <p className="hint">{A.chunkHint}</p>
        </div>
        {status && <Notice tone={status.tone}>{status.text}</Notice>}
      </div>
    </Sheet>
  )
}
