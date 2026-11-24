import { createStore } from '../lib/store'
import { th } from './th'
import { en } from './en'

export type Locale = 'th' | 'en'
export type Dict = typeof th
const DICTS: Record<Locale, Dict> = { th, en }
const KEY = 'mc.lang'

/** ?lang=en|th (shareable) → saved choice → browser languages (any Thai → th) → en. */
function initial(): Locale {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'th' || q === 'en') return q
    const s = localStorage.getItem(KEY)
    if (s === 'th' || s === 'en') return s
  } catch { /* storage unavailable */ }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => l?.toLowerCase().startsWith('th')) ? 'th' : 'en'
}

export const locale = createStore<Locale>(initial())

function applyDocument(l: Locale) {
  document.documentElement.lang = l
  document.title = DICTS[l].meta.title
}
applyDocument(locale.get())

export function setLocale(l: Locale) {
  try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  locale.set(l)
  applyDocument(l)
}

/** Current dictionary for non-React code (prompts, exporters, engines). */
export const getT = (): Dict => DICTS[locale.get()]
/** React hook: re-renders on language change. */
export const useT = (): Dict => DICTS[locale.use()]
export const useLocale = (): Locale => locale.use()
/** BCP-47 tag for Intl / toLocale* (th-TH uses the Buddhist-era calendar). */
export const dateTag = () => DICTS[locale.get()].meta.dateTag
