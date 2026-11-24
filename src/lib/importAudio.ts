import { db, touchMeeting, uid } from '../db/schema'
import { floatToPcm16Blob } from './audio'
import { resolveAsr, transcribePcm } from '../asr/recorder'
import { getT } from '../i18n'

const MAX_BYTES = 1.5 * 1024 ** 3
const SR = 16000
const CHUNK = SR * 600 // store in 10-minute chunks

/** Decode any browser-supported audio/video file to 16 kHz mono PCM (resampled by the decoder). */
export async function decodeToPcm16k(file: Blob): Promise<Float32Array> {
  if (file.size > MAX_BYTES) throw new Error(getT().import.tooLarge)
  const data = await file.arrayBuffer()
  let buf: AudioBuffer
  try {
    buf = await new OfflineAudioContext(1, 1, SR).decodeAudioData(data)
  } catch {
    throw new Error(getT().import.decodeFailed)
  }
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice()
  const out = new Float32Array(buf.length)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels
  }
  return out
}

export type ImportStage = 'decoding' | 'saving' | 'transcribing'

/**
 * Import a Zoom/Meet (or any) recording into a meeting: the audio is appended after what was
 * already recorded, stored locally, then transcribed. Returns whether transcription ran.
 */
export async function importRecording(meetingId: string, file: Blob, onStage: (s: ImportStage) => void): Promise<boolean> {
  onStage('decoding')
  const pcm = await decodeToPcm16k(file)
  onStage('saving')
  const meeting = await db.meetings.get(meetingId)
  const base = meeting?.durationMs ?? 0
  const last = await db.audio.where('[meetingId+seq]').between([meetingId, -Infinity], [meetingId, Infinity]).last()
  let seq = last ? last.seq + 1 : 0
  for (let o = 0; o < pcm.length; o += CHUNK) {
    const part = pcm.subarray(o, Math.min(pcm.length, o + CHUNK))
    await db.audio.add({ id: uid(), meetingId, seq: seq++, startMs: base + (o / SR) * 1000, sampleRate: SR, pcm: floatToPcm16Blob(part) })
  }
  await touchMeeting(meetingId, { durationMs: base + (pcm.length / SR) * 1000, status: 'done', endedAt: Date.now() })
  if (!(await resolveAsr()).available) return false
  onStage('transcribing')
  await transcribePcm(meetingId, pcm, base)
  return true
}
