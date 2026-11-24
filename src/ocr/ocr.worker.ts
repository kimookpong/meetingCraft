/// <reference lib="webworker" />
/**
 * OpenThai2.1-OCR-Text in a worker, ported from the reference `line_engine.py`:
 *   det.onnx (PP-OCRv6-tiny DB)  → line boxes
 *   per-line crop → "flatten" background removal → rec.onnx (H=48) → CTC
 * Simplifications vs. the reference (see docs/ARCHITECTURE.md §9): axis-aligned
 * boxes, no deskew/rotation pass, simple row-based reading order. Ported: rec2 re-read of
 * loopless-font lines, thai_norm.canonical and fix_scripts.
 */
import { getOrt } from '../models/ort'
import { MODELS } from '../models/registry'
import { readFile } from '../models/opfs'
import type { OcrIn, OcrOut } from './protocol'
import type { OcrLine } from '../db/schema'
import type { InferenceSession, Tensor } from 'onnxruntime-web'

const ort = getOrt()
const post = (m: OcrOut) => (self as unknown as Worker).postMessage(m)

const CFG = {
  det: { limit: 1280, thresh: 0.2, boxThresh: 0.4, unclip: 1.4, minSize: 3 },
  // OpenThai2.1 config.json (2.1.4): short digit / single-Latin lines kept only if tall enough (not ornaments).
  rec: { height: 48, maxW: 3200, dropBelow: 0.8, minChars: 2, minCharsDigits: 1, minCharsLatin: true, minShortHeight: 0.62 },
}
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let det: InferenceSession | null = null
let rec: InferenceSession | null = null
let rec2: InferenceSession | null = null
let chars: string[] = []

async function init() {
  if (det && rec) return
  const id = MODELS.ocr.id
  const load = async (n: string) => new Uint8Array(await (await readFile(id, n)).arrayBuffer())
  const dict = (await (await readFile(id, 'rec_dict.txt')).text()).split('\n').filter((c) => c.length)
  chars = ['', ...dict, ' ']
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' as const }
  det = await ort.InferenceSession.create(await load('det.onnx'), opts)
  rec = await ort.InferenceSession.create(await load('rec.onnx'), opts)
  // rec2: second recognizer trained with loopless Thai fonts; only re-reads suspicious lines.
  rec2 = await ort.InferenceSession.create(await load('rec2.onnx'), opts).catch(() => null)
}

/** Latin letters inside tokens that also hold Thai letters ("งUประมาณ" → 1): a loopless face misread. */
function mixed(text: string) {
  let n = 0
  for (const tok of text.split(/\s+/)) if (/[\u0e01-\u0e4e]/.test(tok)) n += (tok.match(/[A-Za-z]/g) ?? []).length
  return n
}

/** Port of thai_norm.canonical + fix_scripts. */
const VOWELS = 'ัิีึืฺุู็', TONES = '่้๊๋์๎'
function canonical(text: string) {
  let t = text.normalize('NFC').replace(/[\u200b\u200c\u200d\u2060\u00ad\ufeff]/g, '').replace(/\u00a0/g, ' ')
  t = t.replace(/[ัิีึืฺุู็่้๊๋์๎ํ]{2,}/g, (run) => {
    const rank = (c: string) => (VOWELS.includes(c) ? 0 : TONES.includes(c) ? 1 : 2)
    return [...run].sort((a, b) => rank(a) - rank(b)).filter((c, i, a) => i === 0 || a[i - 1] !== c).join('')
  })
  t = t.replace(/([่-๋]?)ํ([่-๋]?)า/g, '$1$2ำ').replace(/\u0e40\u0e40/g, '\u0e41').replace(/\u0e33\u0e33/g, '\u0e33')
  t = t.replace(/(?<![A-Za-z])[Ww](?=\.?[\u0E01-\u0E2E\u0E40-\u0E44])/g, 'พ').replace(/(?<=[๐-๙])[Oo0]|[Oo0](?=[๐-๙])/g, '๐')
  return t.replace(/[ \t]+/g, ' ').trim()
}

async function detect(img: ImageBitmap) {
  const W0 = img.width, H0 = img.height
  const pad = Math.max(8, Math.floor(0.05 * Math.min(H0, W0)))
  const h = H0 + 2 * pad, w = W0 + 2 * pad
  const s = Math.min(CFG.det.limit / Math.max(h, w), 4)
  const rh = Math.max(32, Math.round((h * s) / 32) * 32)
  const rw = Math.max(32, Math.round((w * s) / 32) * 32)
  // Draw padded page onto a white canvas at detector resolution.
  const c = new OffscreenCanvas(rw, rh)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, rw, rh)
  g.drawImage(img, (pad * rw) / w, (pad * rh) / h, (W0 * rw) / w, (H0 * rh) / h)
  const px = g.getImageData(0, 0, rw, rh).data
  const plane = rw * rh
  const x = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    // Model expects BGR channel order (cv2), each normalised with ImageNet stats.
    const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255
    x[i] = (b - MEAN[0]) / STD[0]
    x[plane + i] = (gg - MEAN[1]) / STD[1]
    x[2 * plane + i] = (r - MEAN[2]) / STD[2]
  }
  const out = await det!.run({ [det!.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, rh, rw]) })
  const probT = out[det!.outputNames[0]] as Tensor
  const [ph, pw] = (probT.dims as number[]).slice(-2)
  const prob = probT.data as Float32Array
  return boxesFromProb(prob, pw, ph, w / pw, h / ph, pad, W0, H0)
}

/** DB post-process with connected components → axis-aligned, unclipped boxes. */
function boxesFromProb(prob: Float32Array, pw: number, ph: number, sx: number, sy: number, pad: number, W0: number, H0: number) {
  const seen = new Uint8Array(pw * ph)
  const boxes: [number, number, number, number][] = []
  const stack: number[] = []
  for (let start = 0; start < pw * ph; start++) {
    if (seen[start] || prob[start] <= CFG.det.thresh) continue
    let x0 = pw, y0 = ph, x1 = 0, y1 = 0, sum = 0, n = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const px = p % pw, py = (p - px) / pw
      sum += prob[p]; n++
      if (px < x0) x0 = px; if (px > x1) x1 = px
      if (py < y0) y0 = py; if (py > y1) y1 = py
      const nb = [p - 1, p + 1, p - pw, p + pw]
      for (let k = 0; k < 4; k++) {
        const q = nb[k]
        if (q < 0 || q >= pw * ph) continue
        if ((k === 0 && px === 0) || (k === 1 && px === pw - 1)) continue
        if (!seen[q] && prob[q] > CFG.det.thresh) { seen[q] = 1; stack.push(q) }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (Math.min(bw, bh) < CFG.det.minSize || sum / n < CFG.det.boxThresh) continue
    const dist = (bw * bh * CFG.det.unclip) / (2 * (bw + bh))
    const X0 = Math.max(0, (x0 - dist) * sx - pad)
    const Y0 = Math.max(0, (y0 - dist) * sy - pad)
    const X1 = Math.min(W0 - 1, (x1 + 1 + dist) * sx - pad)
    const Y1 = Math.min(H0 - 1, (y1 + 1 + dist) * sy - pad)
    if (X1 - X0 >= 2 && Y1 - Y0 >= 2) boxes.push([X0, Y0, X1, Y1])
  }
  return boxes
}

/** Port of `_flatten`: per-column background from top/bottom margins → dark text on white. */
function flatten(gray: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const k = Math.max(2, Math.floor(h / 6))
  const bg0 = new Float32Array(w)
  const col: number[] = []
  for (let x = 0; x < w; x++) {
    col.length = 0
    for (let y = 0; y < k; y++) col.push(gray[y * w + x], gray[(h - 1 - y) * w + x])
    col.sort((a, b) => a - b)
    bg0[x] = col[col.length >> 1]
  }
  const win = Math.max(3, Math.min(h | 1, 255))
  const half = win >> 1
  const bg = new Float32Array(w)
  const tmp: number[] = []
  for (let x = 0; x < w; x++) {
    tmp.length = 0
    for (let j = x - half; j <= x + half; j++) tmp.push(bg0[Math.min(w - 1, Math.max(0, j))])
    tmp.sort((a, b) => a - b)
    bg[x] = tmp[half]
  }
  const d = new Float32Array(w * h)
  const hist = new Uint32Array(256)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.abs(gray[y * w + x] - bg[x])
    d[y * w + x] = v
    hist[Math.min(255, v | 0)]++
  }
  let acc = 0, hi = 0
  const target = 0.98 * w * h
  for (; hi < 256; hi++) { acc += hist[hi]; if (acc >= target) break }
  hi = Math.max(hi, 24)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = 255 - Math.min(255, Math.max(0, d[i] * (255 / hi)))
  return out
}

async function recognize(img: ImageBitmap, box: [number, number, number, number]): Promise<[string, number]> {
  const first = await recognizeWith(rec!, img, box)
  if (rec2 && mixed(first[0]) >= 1) {
    const alt = await recognizeWith(rec2, img, box)
    if (mixed(alt[0]) < mixed(first[0])) return alt
  }
  return first
}

async function recognizeWith(model: InferenceSession, img: ImageBitmap, box: [number, number, number, number]): Promise<[string, number]> {
  const [x0, y0, x1, y1] = box
  const cw = Math.max(1, Math.round(x1 - x0)), ch = Math.max(1, Math.round(y1 - y0))
  const H = CFG.rec.height
  const W = Math.min(CFG.rec.maxW, Math.max(16, Math.ceil((H * cw) / ch)))
  const c = new OffscreenCanvas(W, H)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, x0, y0, cw, ch, 0, 0, W, H)
  const px = g.getImageData(0, 0, W, H).data
  const gray = new Uint8Array(W * H)
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
  const flat = flatten(gray, W, H)
  const plane = W * H
  const x = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    const v = (flat[i] / 255 - 0.5) / 0.5
    x[i] = v; x[plane + i] = v; x[2 * plane + i] = v
  }
  const out = await model.run({ [model.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, H, W]) })
  const t = out[model.outputNames[0]] as Tensor
  const [, T, C] = t.dims as number[]
  const p = t.data as Float32Array
  let text = '', confSum = 0, n = 0, prev = -1
  for (let i = 0; i < T; i++) {
    let best = 0, bv = -Infinity
    for (let k = 0; k < C; k++) if (p[i * C + k] > bv) { bv = p[i * C + k]; best = k }
    if (best !== prev && best !== 0) { text += chars[best] ?? ''; confSum += bv; n++ }
    prev = best
  }
  return [canonical(text), n ? confSum / n : 0]
}

/** Row-based reading order: group by vertical overlap, then left→right. */
function readingOrder(lines: OcrLine[]) {
  if (!lines.length) return lines
  const hs = lines.map((l) => l.box[3] - l.box[1]).sort((a, b) => a - b)
  const hmed = hs[hs.length >> 1]
  const sorted = [...lines].sort((a, b) => (a.box[1] + a.box[3]) - (b.box[1] + b.box[3]))
  const rows: OcrLine[][] = []
  for (const l of sorted) {
    const cy = (l.box[1] + l.box[3]) / 2
    const row = rows[rows.length - 1]
    if (row && Math.abs(cy - row.reduce((a, r) => a + (r.box[1] + r.box[3]) / 2, 0) / row.length) <= 0.5 * hmed) row.push(l)
    else rows.push([l])
  }
  return rows.flatMap((r) => r.sort((a, b) => a.box[0] - b.box[0]))
}

const isDigits = (s: string) => /^[0-9๐-๙.,]+$/.test(s)

async function read(id: number, blob: Blob) {
  const t0 = performance.now()
  await init()
  const img = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  post({ type: 'stage', id, stage: 'detect' })
  const boxes = await detect(img)
  post({ type: 'stage', id, stage: `recognize ${boxes.length}` })
  const lines: OcrLine[] = []
  const hs = boxes.map((b) => b[3] - b[1]).sort((a, b) => a - b)
  const lineH = hs[hs.length >> 1] || 1
  for (const b of boxes) {
    const [text, confidence] = await recognize(img, b)
    if (confidence < CFG.rec.dropBelow) continue
    const n = [...text].length
    if (n < CFG.rec.minChars) {
      // Height-gated exception: table digits ("2") and Latin day codes ("M") vs. stamps/ornaments.
      const tallEnough = (b[3] - b[1]) / lineH >= CFG.rec.minShortHeight
      const shortOk = (isDigits(text) && n >= CFG.rec.minCharsDigits) || (CFG.rec.minCharsLatin && /^[A-Za-z]$/.test(text))
      if (!(shortOk && tallEnough)) continue
    }
    lines.push({ text, confidence, box: b.map(Math.round) as OcrLine['box'] })
  }
  const ordered = readingOrder(lines)
  // Join rows: lines on the same row are separated by spaces, rows by newlines.
  let textOut = ''
  let lastCy = -Infinity
  const hmed = ordered.length ? ordered.map((l) => l.box[3] - l.box[1]).sort((a, b) => a - b)[ordered.length >> 1] : 0
  for (const l of ordered) {
    const cy = (l.box[1] + l.box[3]) / 2
    textOut += textOut ? (Math.abs(cy - lastCy) <= 0.5 * hmed ? ' ' : '\n') : ''
    textOut += l.text
    lastCy = cy
  }
  post({ type: 'result', id, lines: ordered, text: textOut.normalize('NFC'), width: img.width, height: img.height, ms: performance.now() - t0 })
  img.close()
}

self.onmessage = async (e: MessageEvent<OcrIn>) => {
  const m = e.data
  try {
    if (m.type === 'init') { await init(); post({ type: 'ready' }) }
    else await read(m.id, m.image)
  } catch (err) {
    post({ type: 'error', id: m.type === 'read' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
