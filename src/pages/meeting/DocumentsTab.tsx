import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type DocumentItem, type Meeting } from '../../db/schema'
import { downloadModel, modelStates } from '../../models/modelStore'
import { normalizePhoto, ocrImage } from '../../ocr/client'
import { Empty, Notice, Sheet, Spinner } from '../../components/ui'
import { ArtDocs } from '../../components/art'
import { confirmDialog, toast } from '../../components/feedback'
import { IconCamera, IconCopy, IconImage, IconSpeaker, IconTrash } from '../../components/icons'
import { speak, stopSpeaking, ttsState } from '../../tts/player'
import { useT } from '../../i18n'

function Thumb({ blob, className, alt }: { blob: Blob; className?: string; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} className={className} alt={alt} loading="lazy" />
}

export function DocumentsTab({ meeting }: { meeting: Meeting }) {
  const docs = useLiveQuery(() => db.documents.where('meetingId').equals(meeting.id).sortBy('createdAt'), [meeting.id])
  const models = modelStates.use()
  const t = useT()
  const [working, setWorking] = useState('')
  const [open, setOpen] = useState<DocumentItem | null>(null)
  const cam = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const ocr = models.ocr
  const ready = ocr.status === 'ready'

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    let n = docs?.length ?? 0
    for (const file of Array.from(files)) {
      setWorking(t.docs.preparing)
      try {
        const image = await normalizePhoto(file)
        let text = '', lines: DocumentItem['lines'] = []
        if (ready) {
          const r = await ocrImage(image, (s) => setWorking(s.startsWith('recognize') ? t.docs.reading(s.split(' ')[1]) : t.docs.detecting))
          text = r.text
          lines = r.lines
        }
        const doc: DocumentItem = { id: uid(), meetingId: meeting.id, createdAt: Date.now(), title: t.docs.docName(++n), image, text, lines }
        await db.documents.add(doc)
        if (files.length === 1) setOpen(doc)
        else toast(t.docs.added(doc.title))
      } catch (e) {
        toast(t.docs.failed((e as Error).message), 'bad')
      }
    }
    setWorking('')
  }

  return (
    <div>
      {!ready && (
        <div className="mb-4">
          <Notice tone="warn">
            <b>{t.docs.needModelTitle}</b> {t.docs.needModelBody}
            <div className="mt-2">
              {ocr.status === 'downloading'
                ? <span className="inline-flex items-center gap-2 font-semibold"><Spinner className="h-4 w-4" /> {t.docs.downloading(Math.round((ocr.loaded / ocr.total) * 100))}</span>
                : <button className="btn-soft min-h-10 px-4 text-sm" onClick={() => downloadModel('ocr').then(() => toast(t.docs.ready)).catch(() => toast(t.docs.dlFailed, 'bad'))}>{t.common.downloadNow}</button>}
            </div>
          </Notice>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <button className="btn-primary min-h-14" onClick={() => cam.current?.click()} disabled={!!working}><IconCamera /> {t.docs.camera}</button>
        <button className="btn-outline min-h-14" onClick={() => pick.current?.click()} disabled={!!working}><IconImage /> {t.docs.gallery}</button>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
        <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      </div>

      {working && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-[15px] font-medium text-brand-900" role="status">
          <Spinner className="h-5 w-5" />{working}
        </div>
      )}

      {docs?.length === 0 && !working && (
        <Empty art={<ArtDocs />} title={t.docs.emptyTitle}>
          {t.docs.emptyBody}
        </Empty>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {docs?.map((d) => (
          <li key={d.id}>
            <button className="card block w-full overflow-hidden p-0 text-left transition-colors duration-200 hover:border-brand-200" onClick={() => setOpen(d)}>
              <Thumb blob={d.image} alt={d.title} className="aspect-[3/4] w-full bg-slate-100 object-cover" />
              <div className="p-3">
                <div className="truncate text-[15px] font-semibold">{d.title}</div>
                <div className="line-clamp-2 text-[13px] text-slate-600">{d.text || t.docs.notRead}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {open && <DocSheet doc={open} onClose={() => setOpen(null)} canOcr={ready} />}
    </div>
  )
}

function DocSheet({ doc, onClose, canOcr }: { doc: DocumentItem; onClose: () => void; canOcr: boolean }) {
  const t = useT()
  const [title, setTitle] = useState(doc.title)
  const [text, setText] = useState(doc.text)
  const [lines, setLines] = useState(doc.lines)
  const [showBoxes, setShowBoxes] = useState(false)
  const [busy, setBusy] = useState(false)
  const tts = ttsState.use()
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const save = async () => { await db.documents.update(doc.id, { title, text }); toast(t.common.saved); onClose() }
  const reread = async () => {
    setBusy(true)
    try {
      const r = await ocrImage(doc.image)
      setText(r.text)
      setLines(r.lines)
      await db.documents.update(doc.id, { text: r.text, lines: r.lines })
      toast(t.docs.readLines(r.lines.length))
    } catch (e) { toast((e as Error).message, 'bad') } finally { setBusy(false) }
  }
  const reading = tts.speaking && tts.key === doc.id
  return (
    <Sheet open onClose={onClose} title={t.docs.sheetTitle} footer={<button className="btn-primary w-full" onClick={save}>{t.common.save}</button>}>
      <label htmlFor="doc-title" className="label">{t.docs.name}</label>
      <input id="doc-title" className="input mb-4" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className="relative mb-1 block w-full overflow-hidden rounded-2xl border border-slate-200" onClick={() => setShowBoxes(!showBoxes)} aria-pressed={showBoxes}>
        <Thumb blob={doc.image} alt={title} className="w-full" />
        {showBoxes && <BoxOverlay doc={{ ...doc, lines }} onDims={setDims} dims={dims} />}
      </button>
      <p className="hint mb-4">{t.docs.boxesHint(showBoxes, lines.length)}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-soft min-h-10 px-4 text-sm" onClick={() => (reading ? stopSpeaking() : speak(text, doc.id))}><IconSpeaker width={18} />{reading ? t.common.stop : t.common.listen}</button>
        <button className="btn-soft min-h-10 px-4 text-sm" onClick={async () => { await navigator.clipboard.writeText(text); toast(t.common.copied) }}><IconCopy width={18} />{t.common.copy}</button>
        {canOcr && <button className="btn-soft min-h-10 px-4 text-sm" disabled={busy} onClick={reread}>{busy ? <><Spinner className="h-4 w-4" />{t.docs.rereading}</> : t.docs.reread}</button>}
        <button className="btn-ghost min-h-10 px-3 text-sm text-rose-600" aria-label={t.docs.deleteAria} onClick={async () => {
          if (await confirmDialog({ title: t.docs.deleteQ, body: t.docs.deleteBody, ok: t.common.delete, danger: true })) { await db.documents.delete(doc.id); toast(t.docs.deleted); onClose() }
        }}><IconTrash width={18} /></button>
      </div>
      <label htmlFor="doc-text" className="label">{t.docs.text}</label>
      <textarea id="doc-text" className="input min-h-60 py-3 leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.docs.textPlaceholder} />
    </Sheet>
  )
}

function BoxOverlay({ doc, dims, onDims }: { doc: DocumentItem; dims: { w: number; h: number } | null; onDims: (d: { w: number; h: number }) => void }) {
  useEffect(() => { if (!dims) createImageBitmap(doc.image).then((b) => { onDims({ w: b.width, h: b.height }); b.close() }) }, [doc.image, dims, onDims])
  if (!dims) return null
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" aria-hidden>
      {doc.lines.map((l, i) => (
        <rect key={i} x={l.box[0]} y={l.box[1]} width={l.box[2] - l.box[0]} height={l.box[3] - l.box[1]} rx={4}
          fill="rgb(59 130 246 / .15)" stroke="rgb(37 99 235)" strokeWidth={Math.max(1, dims.w / 400)} />
      ))}
    </svg>
  )
}
