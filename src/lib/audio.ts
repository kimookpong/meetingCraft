export function floatToPcm16Blob(f: Float32Array): Blob {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return new Blob([out.buffer], { type: 'audio/L16;rate=16000' })
}

export async function pcm16BlobsToFloat(blobs: Blob[]): Promise<Float32Array> {
  const bufs = await Promise.all(blobs.map((b) => b.arrayBuffer()))
  const total = bufs.reduce((a, b) => a + b.byteLength / 2, 0)
  const out = new Float32Array(total)
  let o = 0
  for (const b of bufs) {
    const i16 = new Int16Array(b)
    for (let i = 0; i < i16.length; i++) out[o++] = i16[i] / 0x8000
  }
  return out
}

/** Wrap 16 kHz mono PCM16 as a WAV file for playback / export. */
export async function pcm16ToWav(blobs: Blob[], sampleRate = 16000): Promise<Blob> {
  const size = blobs.reduce((a, b) => a + b.size, 0)
  const h = new DataView(new ArrayBuffer(44))
  const str = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); h.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt ')
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true)
  h.setUint32(24, sampleRate, true); h.setUint32(28, sampleRate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true)
  str(36, 'data'); h.setUint32(40, size, true)
  return new Blob([h.buffer, ...blobs], { type: 'audio/wav' })
}

export function floatToWav(f: Float32Array, sampleRate: number): Blob {
  const pcm = floatToPcm16Blob(f)
  const size = pcm.size
  const h = new DataView(new ArrayBuffer(44))
  const str = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); h.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt ')
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true)
  h.setUint32(24, sampleRate, true); h.setUint32(28, sampleRate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true)
  str(36, 'data'); h.setUint32(40, size, true)
  return new Blob([h.buffer, pcm], { type: 'audio/wav' })
}
