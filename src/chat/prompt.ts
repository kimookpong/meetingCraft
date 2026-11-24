import { db, type Meeting } from '../db/schema'
import { buildContext } from '../ai/summarize'

export const CHAT_SYSTEM = `คุณคือ "ผู้ช่วยการประชุม" ที่คุยด้วยเสียงกับผู้ใช้ในแอป meetingCraft
- ตอบเป็นภาษาไทยแบบภาษาพูด สุภาพ เป็นกันเอง สั้น 1–3 ประโยค เพราะคำตอบจะถูกอ่านออกเสียง
- ห้ามใช้ Markdown, ตาราง, หัวข้อ หรือสัญลักษณ์พิเศษ เขียนตัวเลขให้อ่านง่าย
- ตอบจากข้อมูลการประชุมที่ให้มาเท่านั้น ถ้าไม่มีข้อมูลให้บอกตรง ๆ ว่าไม่พบในบันทึก ห้ามเดา
- บันทึกถอดเสียงอาจมีคำผิดจากการถอดเสียงอัตโนมัติ ให้ตีความตามบริบท
- ถ้าผู้ใช้ขอให้ "บันทึก/เพิ่ม/จด/แก้ไข" ข้อมูล หรือแจ้งข้อเท็จจริงใหม่ของการประชุม ให้ยืนยันสั้น ๆ ในคำตอบ
  แล้วเพิ่มบรรทัดท้ายคำตอบในรูปแบบ  บันทึก: <ข้อความที่สมบูรณ์ เข้าใจได้โดยไม่ต้องอ่านบทสนทนา>
  (หนึ่งเรื่องต่อหนึ่งบรรทัด ใส่ได้หลายบรรทัด) ระบบจะนำไปบันทึกในโน้ตของการประชุมให้อัตโนมัติ
- บันทึกเฉพาะข้อมูลใหม่ที่ผู้ใช้ขอให้จด ห้ามบันทึกสิ่งที่มีอยู่แล้วในบันทึกการประชุม และห้ามใส่บรรทัด บันทึก: เมื่อผู้ใช้แค่ถามคำถาม`

export interface Turn { role: 'user' | 'assistant'; text: string; notes?: string[] }

const NOTE_RE = /^\s*(?:บันทึก|NOTE)\s*[:：]\s*(.+)$/i

/** Split an assistant reply into the spoken part and the note lines to save. */
export function parseReply(raw: string): { reply: string; notes: string[] } {
  const notes: string[] = []
  const keep: string[] = []
  for (const line of raw.replace(/<think>[\s\S]*?<\/think>/g, '').split('\n')) {
    const m = line.match(NOTE_RE)
    if (m) notes.push(m[1].trim())
    else keep.push(line)
  }
  return { reply: keep.join('\n').replace(/[*_#`|>]/g, '').trim(), notes }
}

/** Visible text while streaming: hide (possibly partial) note lines. */
export const visibleWhileStreaming = (raw: string) =>
  raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').split('\n').filter((l) => !/^\s*(บันทึก|NOTE)\s*[:：]?/i.test(l)).join('\n').trim()

export async function buildChatPrompt(meeting: Meeting, history: Turn[], question: string, budget: number) {
  const { header, transcript, docText } = await buildContext(meeting)
  const summary = (await db.summaries.where('meetingId').equals(meeting.id).sortBy('createdAt')).pop()
  const room = Math.max(4000, budget - 6000)
  // Keep the most recent part of a long transcript; the summary covers the rest.
  const tx = transcript.length > room ? '…(ตัดช่วงต้น)\n' + transcript.slice(-room) : transcript
  const convo = history.slice(-8).map((t) => `${t.role === 'user' ? 'ผู้ใช้' : 'ผู้ช่วย'}: ${t.text}`).join('\n')
  return [
    `ข้อมูลการประชุม\n${header}`,
    `เวลาตอนนี้: ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`,
    summary ? `สรุปล่าสุด:\n${summary.markdown}` : '',
    tx ? `บันทึกถอดเสียง:\n${tx}` : 'บันทึกถอดเสียง: (ยังไม่มี)',
    docText ? `เอกสารประกอบ:\n${docText.slice(0, 6000)}` : '',
    convo ? `บทสนทนาก่อนหน้า:\n${convo}` : '',
    `ผู้ใช้ถามว่า: ${question}`,
  ].filter(Boolean).join('\n\n')
}
