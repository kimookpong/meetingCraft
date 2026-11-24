/// <reference lib="webworker" />
/**
 * Resumable model downloader. Runs in a worker so it can use OPFS
 * `createSyncAccessHandle` (supported by Chrome, Edge, Firefox and Safari),
 * writing multi-hundred-MB files without holding them in memory.
 */
import { inflateSync } from 'fflate'
import { fileName, fileUrl, type ModelSpec } from '../models/registry'
import { modelDir } from '../models/opfs'

type In = { type: 'download'; spec: ModelSpec } | { type: 'abort' }
export type DownloadMsg =
  | { type: 'progress'; loaded: number; total: number; file: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

let controller: AbortController | null = null
const post = (m: DownloadMsg) => (self as unknown as Worker).postMessage(m)

self.onmessage = async (e: MessageEvent<In>) => {
  if (e.data.type === 'abort') {
    controller?.abort()
    return
  }
  controller = new AbortController()
  try {
    await download(e.data.spec, controller.signal)
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

async function download(spec: ModelSpec, signal: AbortSignal) {
  const dir = await modelDir(spec.id, true)
  const total = spec.files.reduce((a, f) => a + f.size, 0)
  let doneBytes = 0

  for (const f of spec.files) {
    const name = fileName(f)
    // Already extracted on a previous run?
    if (f.extract && (await allExist(dir, f.extract))) {
      doneBytes += f.size
      continue
    }
    const handle = await dir.getFileHandle(name, { create: true })
    const access = await handle.createSyncAccessHandle()
    try {
      let offset = access.getSize()
      const head = await fetch(fileUrl(spec, f), { method: 'HEAD', signal })
      const remoteSize = Number(head.headers.get('content-length') || 0) || f.size
      if (offset < remoteSize) {
        const res = await fetch(fileUrl(spec, f), {
          signal,
          headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
        })
        // 416 = our Range starts at/after EOF → the file is already complete.
        if (res.status === 416) {
          res.body?.cancel()
        } else if (!res.ok) throw new Error(`Download of ${name} failed (HTTP ${res.status})`)
        else {
          if (offset > 0 && res.status === 200) {
            access.truncate(0) // server ignored Range → restart this file
            offset = 0
          }
          const reader = res.body!.getReader()
          let lastPost = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            access.write(value, { at: offset })
            offset += value.byteLength
            const now = performance.now()
            if (now - lastPost > 200) {
              lastPost = now
              post({ type: 'progress', loaded: doneBytes + offset, total, file: name })
            }
          }
          access.flush()
        }
      }
      if (f.extract) await extractZip(access, dir, f.extract)
    } finally {
      access.close()
    }
    if (f.extract) await dir.removeEntry(name)
    doneBytes += f.size
    post({ type: 'progress', loaded: doneBytes, total, file: name })
  }
  const marker = await dir.getFileHandle('.complete', { create: true })
  const w = await marker.createSyncAccessHandle()
  w.truncate(0)
  w.write(new TextEncoder().encode(JSON.stringify({ at: Date.now(), repo: spec.repo })), { at: 0 })
  w.close()
}

async function allExist(dir: FileSystemDirectoryHandle, names: string[]) {
  try {
    for (const n of names) await dir.getFileHandle(n)
    return true
  } catch {
    return false
  }
}

/** Minimal ZIP reader (stored or deflated entries, non-zip64) over a sync access handle. */
async function extractZip(src: FileSystemSyncAccessHandle, dir: FileSystemDirectoryHandle, wanted: string[]) {
  const size = src.getSize()
  const tailLen = Math.min(size, 65557)
  const tail = new Uint8Array(tailLen)
  src.read(tail, { at: size - tailLen })
  const tv = new DataView(tail.buffer)
  let eocd = -1
  for (let i = tailLen - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Invalid ZIP file')
  const count = tv.getUint16(eocd + 10, true)
  const cdSize = tv.getUint32(eocd + 12, true)
  const cdOff = tv.getUint32(eocd + 16, true)
  const cd = new Uint8Array(cdSize)
  src.read(cd, { at: cdOff })
  const cv = new DataView(cd.buffer)
  const dec = new TextDecoder()
  let p = 0
  for (let n = 0; n < count; n++) {
    const method = cv.getUint16(p + 10, true)
    const compSize = cv.getUint32(p + 20, true)
    const nameLen = cv.getUint16(p + 28, true)
    const extraLen = cv.getUint16(p + 30, true)
    const commentLen = cv.getUint16(p + 32, true)
    const localOff = cv.getUint32(p + 42, true)
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen)).split('/').pop()!
    p += 46 + nameLen + extraLen + commentLen
    if (!wanted.includes(name)) continue
    const lh = new Uint8Array(30)
    src.read(lh, { at: localOff })
    const lv = new DataView(lh.buffer)
    const dataOff = localOff + 30 + lv.getUint16(26, true) + lv.getUint16(28, true)
    const out = await (await dir.getFileHandle(name, { create: true })).createSyncAccessHandle()
    out.truncate(0)
    try {
      if (method === 0) {
        const CH = 8 * 1024 * 1024
        const buf = new Uint8Array(CH)
        for (let o = 0; o < compSize; o += CH) {
          const len = Math.min(CH, compSize - o)
          const view = buf.subarray(0, len)
          src.read(view, { at: dataOff + o })
          out.write(view, { at: o })
        }
      } else if (method === 8) {
        const comp = new Uint8Array(compSize)
        src.read(comp, { at: dataOff })
        out.write(inflateSync(comp), { at: 0 })
      } else {
        throw new Error(`Unsupported ZIP method ${method}`)
      }
      out.flush()
    } finally {
      out.close()
    }
  }
}
