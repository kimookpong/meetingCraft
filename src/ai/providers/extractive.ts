import type { AiProviderConfig } from '../../db/schema'
import type { CompleteRequest, LlmProvider } from '../types'

/**
 * Offline, no-AI fallback: scores sentences by content-word frequency and pulls
 * out decisions / action items by Thai cue phrases. Expects the raw context in `prompt`.
 */
const DECISION = /(decided|approved|agreed|resolved|มติ|ที่ประชุม(เห็นชอบ|อนุมัติ|รับทราบ|มีมติ)|อนุมัติ|เห็นชอบ|ตกลง|สรุปว่า|ให้ดำเนินการ)/
const ACTION = /(assigned|will (send|prepare|follow|check)|responsible|action item|by (monday|tuesday|wednesday|thursday|friday|next week)|มอบหมาย|รับผิดชอบ|ดำเนินการ|จัดทำ|ติดตาม|ประสาน|ส่ง(ให้|ภายใน)|ภายในวันที่|ภายใน\s*\d|deadline|กำหนดส่ง)/i
const ISSUE = /(not (yet )?decided|pending|open issue|follow[- ]up|next meeting|ยังไม่(ได้)?(ข้อ)?สรุป|ค้าง(อยู่)?|รอ(ใบ|การ|ผล|ข้อ|คำ|อนุมัติ|ความ)|ปัญหา|ข้อกังวล|พิจารณาอีกครั้ง|ครั้งหน้า|ครั้งถัดไป)/
const STOP = new Set('and or but that which of in is are was the a to for on with it this และ หรือ แต่ ที่ ซึ่ง ของ ใน การ ความ ได้ ให้ ไป มา ว่า จะ ก็ คือ เป็น มี ไม่ นี้ นั้น กับ แล้ว ครับ ค่ะ คะ นะ ๆ the a to of'.split(' '))

function sentences(text: string) {
  return text
    .split(/\n+|(?<=[.!?])\s+|\s{2,}|(?<=ครับ|ค่ะ|นะคะ|นะครับ)\s+/)
    .map((s) => s.replace(/^\[[^\]]*\]\s*/, '').trim())
    .filter((s) => [...s].length >= 12)
}

function words(s: string): string[] {
  const seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (seg) return [...new seg('th', { granularity: 'word' }).segment(s)].filter((w) => w.isWordLike).map((w) => w.segment.toLowerCase())
  return s.split(/\s+/)
}

const HEADINGS = {
  th: { title: 'สรุปการประชุม', note: 'สรุปอัตโนมัติแบบดึงประโยค (ไม่ใช้ AI) — ควรตรวจทานก่อนเผยแพร่', overview: 'ภาพรวม', noData: 'ไม่มีข้อมูลเพียงพอ', decisions: 'มติที่ประชุม', noDecisions: 'ไม่พบถ้อยคำที่ระบุมติ', actions: 'งานที่ต้องดำเนินการ (Action items)', noActions: 'ไม่พบการมอบหมายงาน', issues: 'ประเด็นค้าง / ติดตาม', docs: 'เอกสารประกอบ' },
  en: { title: 'Meeting summary', note: 'Automatic extractive summary (no AI) — please review before sharing', overview: 'Overview', noData: 'Not enough information', decisions: 'Decisions', noDecisions: 'No decision statements found', actions: 'Action items', noActions: 'No assignments found', issues: 'Open issues / follow-ups', docs: 'Documents' },
}

export function extractiveSummary(transcript: string, docs: string, title: string, lang: 'th' | 'en' = 'th'): string {
  const sents = sentences(transcript)
  const freq = new Map<string, number>()
  for (const s of sents) for (const w of words(s)) if (!STOP.has(w) && w.length > 1) freq.set(w, (freq.get(w) ?? 0) + 1)
  const scored = sents.map((s, i) => {
    const ws = words(s).filter((w) => !STOP.has(w))
    const score = ws.reduce((a, w) => a + (freq.get(w) ?? 0), 0) / Math.sqrt(ws.length + 1)
    return { s, i, score }
  })
  const n = Math.min(8, Math.max(3, Math.round(sents.length * 0.08)))
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i)
  const uniq = (xs: string[]) => [...new Set(xs)].slice(0, 12)
  const decisions = uniq(sents.filter((s) => DECISION.test(s)))
  const actions = uniq(sents.filter((s) => ACTION.test(s) && !DECISION.test(s)))
  const issues = uniq(sents.filter((s) => ISSUE.test(s) && !ACTION.test(s) && !DECISION.test(s)))
  const list = (xs: string[], empty: string) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : `- ${empty}`)
  const H = HEADINGS[lang]
  return [
    `# ${H.title}: ${title}`,
    `> ${H.note}`,
    `## ${H.overview}`,
    list(top.map((t) => t.s), H.noData),
    `## ${H.decisions}`,
    list(decisions, H.noDecisions),
    `## ${H.actions}`,
    list(actions, H.noActions),
    `## ${H.issues}`,
    list(issues, '-'),
    docs ? `## ${H.docs}\n${docs.split('\n').filter(Boolean).slice(0, 5).map((l) => `- ${l.slice(0, 160)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

export class ExtractiveProvider implements LlmProvider {
  readonly remote = false
  constructor(readonly config: AiProviderConfig) {}
  async complete({ prompt, onText }: CompleteRequest): Promise<string> {
    const out = prompt
    onText?.(out)
    return out
  }
}
