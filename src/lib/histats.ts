/**
 * Histats visitor counter (site stats only — never receives meeting data).
 * Loaded on the production site only, so local development and tests aren't counted.
 * The widget renders into #histats_counter, which lives in index.html and is moved
 * into the Settings "about" section while that page is open (see HistatsCounter).
 */
type HistatsQueue = unknown[][]

export function initHistats() {
  if (!import.meta.env.PROD || typeof window === 'undefined') return
  const w = window as unknown as { _Hasync?: HistatsQueue }
  const q = (w._Hasync = w._Hasync || [])
  q.push(['Histats.start', '1,5066016,4,1035,150,25,00010001'])
  q.push(['Histats.fasi', '1'])
  q.push(['Histats.track_hits', ''])
  const hs = document.createElement('script')
  hs.type = 'text/javascript'
  hs.async = true
  hs.src = 'https://s10.histats.com/js15_as.js'
  ;(document.head || document.body).appendChild(hs)
}
