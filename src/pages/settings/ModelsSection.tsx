import { useEffect, useState } from 'react'
import { MODELS, totalSize, type ModelKey } from '../../models/registry'
import { cancelDownload, deleteModel, downloadModel, modelStates } from '../../models/modelStore'
import { Progress, Section } from '../../components/ui'
import { fmtBytes } from '../../lib/format'
import { confirmDialog, toast } from '../../components/feedback'
import { deviceInfo, type DeviceInfo } from '../../lib/device'
import { useT } from '../../i18n'

const ORDER: ModelKey[] = ['ocr', 'tts']

export function ModelsSection() {
  const t = useT()
  const M = t.settings.models
  const states = modelStates.use()
  const [dev, setDev] = useState<DeviceInfo | null>(null)
  useEffect(() => { deviceInfo().then(setDev) }, [states])
  const use: Record<ModelKey, string> = { ocr: M.useOcr, tts: M.useTts }
  const desc: Record<ModelKey, string> = { ocr: M.ocrDesc, tts: M.ttsDesc }

  return (
    <Section title={M.title} desc={M.desc}>
      <div className="space-y-2">
        {ORDER.map((k) => {
          const spec = MODELS[k]
          const s = states[k]
          return (
            <div key={k} className="card">
              <div className="flex items-center gap-2">
                <span className="chip">{use[k]}</span>
                {s.status === 'ready' && <span className="chip bg-emerald-100 text-emerald-800">{M.ready}</span>}
              </div>
              <div className="mt-1.5 font-medium">{spec.label}</div>
              <div className="text-sm text-slate-600">{desc[k]}</div>
              <div className="mt-1 text-xs text-slate-500">{fmtBytes(totalSize(spec))} • {spec.license} • {spec.repo}</div>
              {s.status === 'downloading' && (
                <div className="mt-3">
                  <Progress value={s.loaded / s.total} />
                  <div className="mt-1 flex justify-between text-xs text-slate-600">
                    <span>{s.file} — {t.common.of(fmtBytes(s.loaded), fmtBytes(s.total))}</span>
                    <button className="text-rose-600" onClick={() => cancelDownload(k)}>{t.common.cancel}</button>
                  </div>
                </div>
              )}
              {s.status === 'error' && <div className="mt-2 text-sm text-rose-600">{s.message} — {M.stalledInline}</div>}
              <div className="mt-3 flex gap-2">
                {(s.status === 'absent' || s.status === 'error') && (
                  <button className="btn-primary flex-1" onClick={() => downloadModel(k).then(() => toast(M.readyToast(spec.label))).catch(() => toast(M.stalled, 'bad'))}>
                    {t.common.download} {fmtBytes(totalSize(spec))}
                  </button>
                )}
                {s.status === 'ready' && (
                  <button className="btn-outline text-rose-600" onClick={async () => {
                    if (await confirmDialog({ title: M.deleteQ(spec.label), body: M.deleteBody, ok: M.deleteOk, danger: true })) { await deleteModel(k); toast(M.deleted) }
                  }}>{M.deleteOk}</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {dev && <p className="mt-2 px-1 text-xs text-slate-500">{M.device(dev.memoryGB ? `RAM ~${dev.memoryGB} GB • ` : '', dev.cores, dev.webgpu, dev.isolated)}</p>}
    </Section>
  )
}
