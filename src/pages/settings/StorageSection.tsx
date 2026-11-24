import { useEffect, useRef, useState } from 'react'
import { Section, Toggle } from '../../components/ui'
import { deviceInfo, type DeviceInfo } from '../../lib/device'
import { downloadBlob, exportBackup, importBackup } from '../../lib/exporters'
import { fmtBytes } from '../../lib/format'
import { toast } from '../../components/feedback'
import { useT } from '../../i18n'

export function StorageSection() {
  const t = useT()
  const S = t.settings.storage
  const [d, setD] = useState<DeviceInfo | null>(null)
  const [audio, setAudio] = useState(true)
  const [busy, setBusy] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const refresh = () => deviceInfo().then(setD)
  useEffect(() => { refresh() }, [])

  return (
    <Section title={S.title} desc={S.desc}>
      <div className="card space-y-3">
        {d?.quota && (
          <div className="text-sm">
            {S.used(fmtBytes(d.usage ?? 0), fmtBytes(d.quota))}
            <div className="text-xs text-slate-500">{d.persisted ? S.persisted : S.notPersisted}</div>
          </div>
        )}
        {!d?.persisted && <button className="btn-outline w-full text-sm" onClick={async () => { await navigator.storage.persist(); refresh() }}>{S.persist}</button>}
        <Toggle checked={audio} onChange={setAudio} label={S.includeAudio} hint={S.includeAudioHint} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary text-sm" disabled={!!busy} onClick={async () => {
            setBusy(S.backingUp)
            try { downloadBlob(await exportBackup(audio), `meetingcraft-backup-${new Date().toISOString().slice(0, 10)}.zip`) } finally { setBusy('') }
          }}>{busy || S.backup}</button>
          <button className="btn-outline text-sm" disabled={!!busy} onClick={() => file.current?.click()}>{S.restore}</button>
          <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy(S.restoring)
            try { toast(S.restored(await importBackup(f))) } catch (err) { toast(S.restoreFailed((err as Error).message), 'bad') } finally { setBusy(''); refresh() }
          }} />
        </div>
      </div>
    </Section>
  )
}
