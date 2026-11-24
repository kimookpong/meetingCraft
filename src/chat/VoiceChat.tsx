import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import type { Meeting } from '../db/schema'
import { chat, ask, closeChat, interrupt, micActive, openChat, resetConversation, setVoiceReply, toggleMic, type Phase } from './engine'
import { IconBack, IconCheck, IconMic, IconSparkles, IconSpeaker } from '../components/icons'
import { Notice, Spinner } from '../components/ui'
import { useT } from '../i18n'

export function VoiceChat({ meeting, onClose, debrief = false }: { meeting: Meeting; onClose: () => void; debrief?: boolean }) {
  const s = chat.use()
  const t = useT()
  const LABEL: Record<Phase, string> = { off: '', ...t.chat.phase }
  const [text, setText] = useState('')
  const mic = micActive() // re-evaluated on every chat-state update
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    openChat(meeting, { listen: true, debrief }).catch(() => {})
    return () => closeChat()
  }, [meeting.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [s.turns.length, s.draft, s.partial])

  const close = () => { closeChat(); onClose() }
  const busy = s.phase === 'thinking' || s.phase === 'speaking'
  const send = (q: string) => { if (q.trim()) { ask(q.trim()); setText('') } }
  const needsAi = s.phase === 'off' && s.error?.includes('AI')

  const orbTone = s.phase === 'hearing' ? 'bg-rose-500 shadow-rose-500/40'
    : s.phase === 'speaking' ? 'bg-accent-500 shadow-accent-500/40'
    : s.phase === 'thinking' ? 'bg-brand-500 shadow-brand-500/40'
    : mic ? 'bg-brand-600 shadow-brand-600/30' : 'bg-slate-400 shadow-slate-400/30'
  const scale = s.phase === 'hearing' ? 1 + Math.max(0, Math.min(0.25, (s.level + 50) / 160)) : 1

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-[55] flex flex-col bg-canvas" role="dialog" aria-modal aria-label={t.chat.aria}>
      <header className="mx-auto flex w-full max-w-2xl items-center gap-1 px-2 py-2">
        <button className="btn-ghost min-h-11 px-2.5" onClick={close} aria-label={t.common.close}><IconBack /></button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-[17px] font-bold">{debrief ? t.chat.debriefTitle : t.chat.title}</div>
          <div className="truncate text-[12px] text-slate-600">
            {meeting.title}{s.provider ? ` · ${s.provider}` : ''}
          </div>
        </div>
        <button onClick={() => setVoiceReply(!s.voiceReply)} aria-pressed={s.voiceReply}
          className={`btn min-h-10 px-3 text-[13px] ${s.voiceReply ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
          <IconSpeaker width={18} />{s.voiceReply ? t.chat.voiceOn : t.chat.voiceOff}
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-4">
        {needsAi ? (
          <div className="pt-10">
            <Notice tone="warn">{s.error}</Notice>
            <Link href="/settings" onClick={() => { sessionStorage.setItem('settings:focus', 'ai'); close() }} className="btn-primary mt-4 w-full">{t.chat.addAi}</Link>
          </div>
        ) : s.turns.length === 0 && !s.draft && debrief ? (
          <div className="pt-16 text-center">
            <Spinner className="h-8 w-8 text-accent-500" />
            <p className="mt-3 text-[15px] text-slate-600">{t.chat.reviewing}</p>
          </div>
        ) : s.turns.length === 0 && !s.draft ? (
          <div className="pt-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-100 text-accent-700"><IconSparkles /></div>
            <h2 className="text-lg font-bold">{t.chat.emptyTitle}</h2>
            <p className="mx-auto mt-1 max-w-xs text-[14px] text-slate-600">{t.chat.emptyBody}</p>
            <div className="mt-5 flex flex-col gap-2">
              {t.chat.suggestions.map((q) => (
                <button key={q} onClick={() => send(q)} disabled={busy || s.phase === 'starting'}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-left text-[15px] transition-colors duration-200 hover:bg-brand-50">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-3 pt-2" aria-live="polite">
            {s.turns.map((turn, i) => (
              <li key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-[16px] leading-relaxed ${turn.role === 'user' ? 'rounded-br-lg bg-brand-600 text-white' : 'rounded-bl-lg border border-slate-200 bg-white'}`}>
                  {turn.text}
                  {!!turn.notes?.length && (
                    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                      {turn.notes.map((n, k) => (
                        <div key={k} className="flex gap-1.5 text-[13px] text-emerald-700">
                          <IconCheck width={16} className="mt-0.5 shrink-0" /><span>{t.chat.savedNote(n)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {s.draft && (
              <li className="flex justify-start">
                <div className="max-w-[85%] rounded-3xl rounded-bl-lg border border-slate-200 bg-white px-4 py-2.5 text-[16px] leading-relaxed">{s.draft}</div>
              </li>
            )}
            {s.partial && (
              <li className="flex justify-end">
                <div className="max-w-[85%] rounded-3xl rounded-br-lg border border-dashed border-brand-300 px-4 py-2.5 text-[16px] text-slate-600">{s.partial}</div>
              </li>
            )}
          </ol>
        )}
        {s.error && !needsAi && <div className="mt-3"><Notice tone="bad">{s.error}</Notice></div>}
        <div ref={endRef} />
      </main>

      {!needsAi && (
        <footer className="mx-auto w-full max-w-2xl px-4 pt-2 pb-3">
          <div className="mb-3 flex flex-col items-center">
            <button
              onClick={() => (busy ? interrupt() : toggleMic())}
              disabled={s.phase === 'starting'}
              aria-label={busy ? t.chat.interrupt : mic ? t.chat.closeMic : t.chat.openMic}
              style={{ transform: `scale(${scale})` }}
              className={`grid h-20 w-20 place-items-center rounded-full text-white shadow-xl transition-[transform,background-color] duration-150 ${orbTone} ${s.phase === 'speaking' || s.phase === 'hearing' ? 'animate-rec' : ''}`}>
              {s.phase === 'starting' || s.phase === 'thinking' ? <Spinner className="h-7 w-7" /> : <IconMic width={32} height={32} />}
            </button>
            <p className="mt-2 min-h-5 text-[14px] font-medium text-slate-700" role="status">
              {mic || busy ? LABEL[s.phase] : t.chat.micOff}
            </p>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text) }}>
            <label htmlFor="chat-input" className="sr-only">{t.chat.inputLabel}</label>
            <input id="chat-input" className="input flex-1" placeholder={t.chat.inputPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary px-4" disabled={!text.trim()}>{t.chat.send}</button>
          </form>
          {s.turns.length > 0 && <button className="mt-1 min-h-10 w-full text-[13px] text-slate-500 hover:text-slate-700" onClick={resetConversation}>{t.chat.reset}</button>}
        </footer>
      )}
    </div>
  )
}
