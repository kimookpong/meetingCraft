import { db, type Meeting } from '../db/schema'
import { buildContext } from '../ai/summarize'
import { dateTag, locale } from '../i18n'

const SYSTEM = {
  th: `คุณคือ "ผู้ช่วยการประชุม" ที่คุยด้วยเสียงกับผู้ใช้ในแอป meetingCraft
- ตอบเป็นภาษาไทยแบบภาษาพูด สุภาพ เป็นกันเอง สั้น 1–3 ประโยค เพราะคำตอบจะถูกอ่านออกเสียง (ถ้าผู้ใช้พูดภาษาอังกฤษ ให้ตอบเป็นภาษาอังกฤษ)
- ห้ามใช้ Markdown, ตาราง, หัวข้อ หรือสัญลักษณ์พิเศษ เขียนตัวเลขให้อ่านง่าย
- ตอบจากข้อมูลการประชุมที่ให้มาเท่านั้น ถ้าไม่มีข้อมูลให้บอกตรง ๆ ว่าไม่พบในบันทึก ห้ามเดา
- บันทึกถอดเสียงอาจมีคำผิดจากการถอดเสียงอัตโนมัติ ให้ตีความตามบริบท
- ถ้าผู้ใช้ขอให้ "บันทึก/เพิ่ม/จด/แก้ไข" ข้อมูล หรือแจ้งข้อเท็จจริงใหม่ของการประชุม ให้ยืนยันสั้น ๆ ในคำตอบ
  แล้วเพิ่มบรรทัดท้ายคำตอบในรูปแบบ  บันทึก: <ข้อความที่สมบูรณ์ เข้าใจได้โดยไม่ต้องอ่านบทสนทนา>
  (หนึ่งเรื่องต่อหนึ่งบรรทัด ใส่ได้หลายบรรทัด) ระบบจะนำไปบันทึกในโน้ตของการประชุมให้อัตโนมัติ
- บันทึกเฉพาะข้อมูลใหม่ที่ผู้ใช้ขอให้จด ห้ามบันทึกสิ่งที่มีอยู่แล้วในบันทึกการประชุม และห้ามใส่บรรทัด บันทึก: เมื่อผู้ใช้แค่ถามคำถาม`,
  en: `You are the "meeting assistant", talking by voice with the user in the meetingCraft app.
- Reply in natural spoken English, friendly and brief (1–3 sentences), because replies are read aloud. If the user speaks Thai, reply in Thai.
- No Markdown, tables, headings or special symbols. Write numbers so they are easy to say.
- Answer only from the meeting data provided. If something isn't there, say it isn't in the notes — never guess.
- Transcripts come from automatic speech recognition (often Thai) and may contain errors; interpret by context.
- If the user asks you to note/add/record/correct something, or states a new fact about the meeting, confirm briefly,
  then add at the end one line per item in the form  NOTE: <a complete sentence understandable without the conversation>
  The app saves these lines to the meeting notes automatically.
- Only note new information the user asked you to record; never note things already in the meeting record, and never add NOTE: lines when the user only asks a question.`,
}

const DEBRIEF = {
  th: `(ข้อความจากระบบ ไม่ใช่ผู้ใช้) การบันทึกการประชุมเพิ่งจบลง
ให้เริ่มบทสนทนาด้วยการสรุปสาระสำคัญให้ฟังแบบภาษาพูด 2–3 ประโยค เน้นมติและงานที่ต้องทำพร้อมผู้รับผิดชอบ
แล้วปิดท้ายด้วยคำถามสั้น ๆ ว่ามีอะไรอยากแก้ไขหรือเพิ่มเติมไหม ห้ามใส่บรรทัด บันทึก:
ถ้ายังไม่มีบันทึกถอดเสียงเลย ให้บอกว่ายังไม่ได้ยินเนื้อหาการประชุม แล้วถามว่าอยากให้จดอะไรไว้บ้าง`,
  en: `(System message, not from the user) The meeting recording has just ended.
Open the conversation with a spoken recap in 2–3 sentences, focusing on decisions and action items with owners,
then end with a short question asking whether anything should be corrected or added. Do not add NOTE: lines.
If there is no transcript yet, say you haven't heard the meeting content and ask what should be noted.`,
}

const LABELS = {
  th: { info: 'ข้อมูลการประชุม', now: 'เวลาตอนนี้', summary: 'สรุปล่าสุด', transcript: 'บันทึกถอดเสียง', none: '(ยังไม่มี)', cut: '…(ตัดช่วงต้น)', docs: 'เอกสารประกอบ', convo: 'บทสนทนาก่อนหน้า', user: 'ผู้ใช้', bot: 'ผู้ช่วย', ask: 'ผู้ใช้ถามว่า' },
  en: { info: 'Meeting data', now: 'Current time', summary: 'Latest summary', transcript: 'Transcript', none: '(none yet)', cut: '…(earlier part trimmed)', docs: 'Documents', convo: 'Conversation so far', user: 'User', bot: 'Assistant', ask: 'The user says' },
}

export const chatSystem = () => SYSTEM[locale.get()]
export const debriefRequest = () => DEBRIEF[locale.get()]

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
  const L = LABELS[locale.get()]
  const { header, transcript, docText } = await buildContext(meeting)
  const summary = (await db.summaries.where('meetingId').equals(meeting.id).sortBy('createdAt')).pop()
  const room = Math.max(4000, budget - 6000)
  // Keep the most recent part of a long transcript; the summary covers the rest.
  const tx = transcript.length > room ? `${L.cut}\n` + transcript.slice(-room) : transcript
  const convo = history.slice(-8).map((t) => `${t.role === 'user' ? L.user : L.bot}: ${t.text}`).join('\n')
  return [
    `${L.info}\n${header}`,
    `${L.now}: ${new Date().toLocaleString(dateTag(), { dateStyle: 'medium', timeStyle: 'short' })}`,
    summary ? `${L.summary}:\n${summary.markdown}` : '',
    tx ? `${L.transcript}:\n${tx}` : `${L.transcript}: ${L.none}`,
    docText ? `${L.docs}:\n${docText.slice(0, 6000)}` : '',
    convo ? `${L.convo}:\n${convo}` : '',
    `${L.ask}: ${question}`,
  ].filter(Boolean).join('\n\n')
}
