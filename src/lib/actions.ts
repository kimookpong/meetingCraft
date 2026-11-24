import { createMeeting } from '../db/schema'

/** Create a meeting and open it (optionally straight on the documents tab). */
export async function startNewMeeting(nav: (to: string) => void, tab?: 'docs') {
  const m = await createMeeting()
  if (tab) sessionStorage.setItem(`tab:${m.id}`, tab)
  nav(`/m/${m.id}`)
}
