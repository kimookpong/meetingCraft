import { dateTag, getT } from '../i18n'

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function fmtDate(t: number) {
  return new Date(t).toLocaleString(dateTag(), { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString(dateTag(), { hour: '2-digit', minute: '2-digit' }) + getT().meta.timeSuffix
}

export function relDay(t: number) {
  const d = new Date(t)
  const today = new Date()
  const diff = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  if (diff === 0) return getT().common.today
  if (diff === 1) return getT().common.yesterday
  if (diff < 7) return d.toLocaleDateString(dateTag(), { weekday: 'long' })
  return d.toLocaleDateString(dateTag(), { day: 'numeric', month: 'long', year: 'numeric' })
}
