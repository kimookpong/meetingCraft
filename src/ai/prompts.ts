import { getSetting, setSetting } from '../db/schema'
import { locale, type Locale } from '../i18n'

const SYSTEM: Record<Locale, string> = {
  th: `คุณคือเลขานุการการประชุมมืออาชีพ หน้าที่ของคุณคือสรุปรายงานการประชุมภาษาไทยจากบันทึกถอดเสียง (ซึ่งอาจมีคำผิดจากการถอดเสียงอัตโนมัติ) และข้อความจากเอกสารประกอบ
หลักการ:
- ใช้เฉพาะข้อมูลที่ปรากฏในบันทึก ห้ามแต่งเติมข้อเท็จจริง ชื่อคน ตัวเลข หรือวันที่
- แก้คำที่ถอดเสียงผิดอย่างชัดเจนให้ถูกตามบริบทได้ แต่ถ้าไม่แน่ใจให้คงไว้
- ถ้าไม่มีข้อมูลในหัวข้อใด ให้เขียนว่า "ไม่มี"
- ตอบเป็น Markdown ภาษาไทย กระชับ อ่านง่ายบนมือถือ`,
  en: `You are a professional meeting secretary. Write meeting minutes from a speech-to-text transcript (often in Thai, and possibly containing recognition errors) and text from supporting documents.
Rules:
- Use only information present in the record; never invent facts, names, numbers or dates.
- Fix obvious transcription errors from context; if unsure, keep the original.
- If a section has no information, write "None".
- Write the minutes in English Markdown, concise and easy to read on a phone. Keep Thai names as written.`,
}

const FORMAT: Record<Locale, string> = {
  th: `จัดรูปแบบผลลัพธ์ดังนี้:
# สรุปการประชุม: {title}
## ภาพรวม
(3–6 bullet สรุปสาระสำคัญ)
## ประเด็นที่หารือ
(แยกตามหัวข้อ แต่ละหัวข้อ 1–3 bullet)
## มติที่ประชุม
(bullet ละหนึ่งมติ)
## งานที่ต้องดำเนินการ (Action items)
| งาน | ผู้รับผิดชอบ | กำหนดเสร็จ |
|---|---|---|
## ประเด็นค้าง / ติดตามครั้งถัดไป`,
  en: `Format the output as:
# Meeting summary: {title}
## Overview
(3–6 bullets with the key points)
## Discussion
(grouped by topic, 1–3 bullets each)
## Decisions
(one bullet per decision)
## Action items
| Task | Owner | Due |
|---|---|---|
## Open issues / follow-ups`,
}

const MAP: Record<Locale, string> = {
  th: `ต่อไปนี้คือบันทึกการประชุม "{title}" ช่วงที่ {part}/{parts}
สรุปช่วงนี้เป็น bullet สั้น ๆ ภาษาไทย โดยเก็บ: ประเด็นที่หารือ, มติ, งานที่มอบหมาย (ใคร/อะไร/เมื่อไร), ตัวเลขและวันที่สำคัญ ห้ามแต่งเติม

{text}`,
  en: `Below is part {part}/{parts} of the record of the meeting "{title}".
Summarize this part as short English bullets, keeping: topics discussed, decisions, assignments (who/what/when), key numbers and dates. Do not invent anything.

{text}`,
}

export const CONTEXT_LABELS: Record<Locale, { doc: string; title: string; date: string; place: string; people: string; agenda: string; notes: string; partNotes: string; transcript: string; part: string; ocr: string; none: string }> = {
  th: { doc: 'เอกสาร', title: 'ชื่อการประชุม', date: 'วันที่', place: 'สถานที่', people: 'ผู้เข้าร่วม', agenda: 'วาระ', notes: 'บันทึกเพิ่มเติมของผู้จด', partNotes: 'บันทึกย่อรายช่วง', transcript: 'บันทึกถอดเสียง', part: 'ช่วงที่', ocr: 'ข้อความจากเอกสารประกอบ (OCR)', none: '(ไม่มี)' },
  en: { doc: 'Document', title: 'Meeting title', date: 'Date', place: 'Place', people: 'Attendees', agenda: 'Agenda', notes: 'Note-taker’s notes', partNotes: 'Notes per part', transcript: 'Transcript', part: 'Part', ocr: 'Text from documents (OCR)', none: '(none)' },
}

export const defaultSystem = (l: Locale = locale.get()) => SYSTEM[l]
export const defaultFormat = (l: Locale = locale.get()) => FORMAT[l]
export const mapPrompt = (l: Locale = locale.get()) => MAP[l]

/** Saved prompt for a language (falls back to the legacy un-suffixed Thai setting, then the default). */
export async function getPrompt(kind: 'system' | 'format', l: Locale = locale.get()): Promise<string> {
  const def = kind === 'system' ? SYSTEM[l] : FORMAT[l]
  const legacy = l === 'th' ? await getSetting<string | undefined>(`prompt.${kind}`, undefined) : undefined
  return getSetting(`prompt.${kind}.${l}`, legacy ?? def)
}
export const savePrompt = (kind: 'system' | 'format', value: string, l: Locale = locale.get()) => setSetting(`prompt.${kind}.${l}`, value)

export function fill(t: string, vars: Record<string, string | number>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
