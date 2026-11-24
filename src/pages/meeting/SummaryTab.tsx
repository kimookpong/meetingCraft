import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'wouter'
import { db, getSetting, setSetting, type Meeting } from '../../db/schema'
import { builtinExtractive, createProvider, EXTRACTIVE_ID } from '../../ai/registry'
import { summarizeMeeting } from '../../ai/summarize'
import { llmLoad } from '../../ai/providers/onnxLocal'
import { renderMarkdown } from '../../lib/markdown'
import { shareOrDownload, fileBase } from '../../lib/exporters'
import { Empty, Notice, Progress, Sheet, Spinner } from '../../components/ui'
import { ArtSummary } from '../../components/art'
import { confirmDialog, toast } from '../../components/feedback'
import { IconCheck, IconChevron, IconCopy, IconShare, IconShield, IconSparkles, IconSpeaker, IconTrash } from '../../components/icons'
import { speak, stopSpeaking, ttsState } from '../../tts/player'
import { fmtBytes, fmtDate } from '../../lib/format'
import type { AiProviderConfig } from '../../db/schema'
import { useT } from '../../i18n'
import { providerLabel } from '../../ai/labels'

/** Where data goes, in user terms (the built-in proxy is shown simply as Typhoon). */
const hostOf = (c: AiProviderConfig) => (c.managed ? 'Typhoon' : c.baseUrl ? new URL(c.baseUrl).host : c.kind === 'anthropic' ? 'api.anthropic.com' : '')

export function SummaryTab({ meeting, onGoTranscript }: { meeting: Meeting; onGoTranscript: () => void }) {
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray(), [])
  const summaries = useLiveQuery(() => db.summaries.where('meetingId').equals(meeting.id).reverse().sortBy('createdAt'), [meeting.id])
  const hasContent = useLiveQuery(async () => (await db.segments.where('meetingId').equals(meeting.id).count()) + (await db.documents.where('meetingId').equals(meeting.id).count()) > 0 || !!meeting.notes, [meeting.id, meeting.notes])
  const [providerId, setProviderId] = useState(EXTRACTIVE_ID)
  const [pick, setPick] = useState(false)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const llm = llmLoad.use()
  const t = useT()
  const tts = ttsState.use()

  useEffect(() => { getSetting('ai.default', EXTRACTIVE_ID).then(setProviderId) }, [])
  const all = useMemo(() => [builtinExtractive, ...(providers ?? [])], [providers])
  const cfg = all.find((p) => p.id === providerId) ?? builtinExtractive
  const remote = useMemo(() => createProvider(cfg).remote, [cfg])
  const current = summaries?.find((s) => s.id === shown) ?? summaries?.[0]
  const hasTyphoon = providers?.some((p) => p.baseUrl?.includes('opentyphoon'))

  const choose = (id: string) => { setProviderId(id); setSetting('ai.default', id); setPick(false) }

  const run = async () => {
    if (remote && !(await confirmDialog({
      title: t.summary.remoteQ,
      body: t.summary.remoteBody(hostOf(cfg)),
      ok: t.summary.remoteOk,
    }))) return
    setRunning(true); setError(''); setDraft(''); setStage(t.summary.gathering)
    abort.current = new AbortController()
    try {
      const s = await summarizeMeeting(meeting, cfg, (p) => { setStage(p.stage); setDraft(p.text) }, abort.current.signal)
      setShown(s.id)
      toast(t.summary.done)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setRunning(false); setDraft(''); setStage('')
    }
  }

  if (hasContent === false && !summaries?.length) {
    return (
      <Empty art={<ArtSummary />} title={t.summary.emptyTitle}
        action={<button className="btn-soft" onClick={onGoTranscript}>{t.summary.goRecord}</button>}>
        {t.summary.emptyBody}
      </Empty>
    )
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="label">{t.summary.who}</div>
        <button onClick={() => setPick(true)} disabled={running}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 px-3.5 text-left transition-colors duration-200 hover:bg-slate-50">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${remote ? 'bg-accent-100 text-accent-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {remote ? <IconSparkles width={20} /> : <IconShield width={20} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{providerLabel(cfg, t)}</span>
            <span className="block truncate text-[13px] text-slate-600">{remote ? t.summary.sentTo(hostOf(cfg)) : t.summary.local}</span>
          </span>
          <span className="text-[13px] font-semibold text-brand-700">{t.common.change}</span>
        </button>

        {!hasTyphoon && cfg.kind === 'extractive' && (
          <Link href="/settings" onClick={() => sessionStorage.setItem('settings:focus', 'ai')} className="mt-3 flex items-center gap-3 rounded-2xl bg-brand-50 px-3.5 py-3 text-[14px] text-brand-900 transition-colors duration-200 hover:bg-brand-100">
            <IconSparkles width={20} className="shrink-0 text-accent-500" />
            <span className="flex-1"><b>{t.summary.upsellTitle}</b> {t.summary.upsellBody}</span>
            <IconChevron width={18} />
          </Link>
        )}

        <div className="mt-4">
          {running
            ? <button className="btn-outline w-full" onClick={() => abort.current?.abort()}>{t.summary.stopRun}</button>
            : <button className="btn-primary w-full" onClick={run}><IconSparkles /> {current ? t.summary.again : t.summary.run}</button>}
        </div>
        {running && cfg.kind === 'onnx-local' && llm.loading && (
          <div className="mt-3 text-[13px] text-slate-600">
            {t.summary.loadingModel(llm.total ? `${fmtBytes(llm.loaded)} / ${fmtBytes(llm.total)}` : '')}
            <Progress className="mt-1.5" value={llm.total ? llm.loaded / llm.total : 0} label={t.summary.loadingModelAria} />
          </div>
        )}
        {running && stage && <div className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-700" role="status"><Spinner className="h-4 w-4" />{stage}…</div>}
        {error && <div className="mt-3"><Notice tone="bad"><b>{t.summary.failed}</b> — {error}</Notice></div>}
      </div>

      {running && draft && <article className="prose-md card mb-4" aria-live="polite" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft) }} />}

      {!running && !current && (
        <p className="px-2 py-6 text-center text-[15px] text-slate-600">{t.summary.hint}</p>
      )}

      {!running && current && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <span className="text-[13px] text-slate-600">{t.summary.by(current.providerLabel, fmtDate(current.createdAt))}</span>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-2">
            <ActionBtn label={tts.speaking && tts.key === current.id ? t.common.stop : t.common.listen} icon={<IconSpeaker width={20} />} onClick={() => (tts.speaking && tts.key === current.id ? stopSpeaking() : speak(current.markdown, current.id))} />
            <ActionBtn label={t.common.copy} icon={<IconCopy width={20} />} onClick={async () => { await navigator.clipboard.writeText(current.markdown); toast(t.common.copied) }} />
            <ActionBtn label={t.common.share} icon={<IconShare width={20} />} onClick={() => shareOrDownload(current.markdown, t.summary.fileName(fileBase(meeting)))} />
            <ActionBtn label={t.common.delete} danger icon={<IconTrash width={20} />} onClick={async () => {
              if (await confirmDialog({ title: t.summary.deleteQ, body: t.summary.deleteBody, ok: t.common.delete, danger: true })) { await db.summaries.delete(current.id); toast(t.summary.deleted) }
            }} />
          </div>
          <article className="prose-md card" dangerouslySetInnerHTML={{ __html: renderMarkdown(current.markdown) }} />
          {summaries!.length > 1 && (
            <div className="mt-5">
              <div className="label">{t.summary.others}</div>
              <div className="flex flex-wrap gap-2">
                {summaries!.map((s) => (
                  <button key={s.id} onClick={() => setShown(s.id)} aria-pressed={s.id === current.id}
                    className={`min-h-10 rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${s.id === current.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    {s.providerLabel.split(' (')[0]} · {new Date(s.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Sheet open={pick} onClose={() => setPick(false)} title={t.summary.pickTitle}>
        <div className="space-y-2 pb-2">
          {all.map((p) => {
            const r = createProvider(p).remote
            return (
              <button key={p.id} onClick={() => choose(p.id)} aria-pressed={p.id === providerId}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors duration-200 ${p.id === providerId ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{providerLabel(p, t)}</span>
                  <span className="block text-[13px] text-slate-600">{p.kind === 'extractive' ? t.summary.extractiveDesc : r ? t.summary.sendTo(hostOf(p)) : t.summary.localShort}</span>
                </span>
                {p.id === providerId && <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white"><IconCheck width={16} /></span>}
              </button>
            )
          })}
          <Link href="/settings" onClick={() => sessionStorage.setItem('settings:focus', 'ai')} className="btn-soft mt-2 w-full">{t.summary.addMore}</Link>
        </div>
      </Sheet>
    </div>
  )
}

function ActionBtn({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white text-[12px] font-semibold transition-colors duration-200 hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-700'} border border-slate-200/80`}>
      {icon}{label}
    </button>
  )
}
