import { createMeeting } from '../db/schema'

/** Create a meeting and open it (optionally straight on the documents tab). */
export async function startNewMeeting(nav: (to: string) => void, tab?: 'docs') {
  const m = await createMeeting()
  if (tab) sessionStorage.setItem(`tab:${m.id}`, tab)
  nav(`/m/${m.id}`)
}

/** File picked on the home screen, handed to the meeting page that imports it. */
let pendingImport: { meetingId: string; file: File } | null = null
export const takePendingImport = (meetingId: string) => {
  if (pendingImport?.meetingId !== meetingId) return null
  const f = pendingImport.file
  pendingImport = null
  return f
}

/** New meeting named after the imported file, then open it to run the import. */
export async function startImport(nav: (to: string) => void, file: File) {
  const m = await createMeeting({ title: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || undefined })
  pendingImport = { meetingId: m.id, file }
  nav(`/m/${m.id}`)
}
