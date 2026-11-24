/**
 * Lightweight energy VAD with an adaptive noise floor. Frames of 30 ms.
 * Good enough to cut utterances at pauses; can be swapped for Silero VAD later.
 */
export const VAD_FRAME = 480 // 30 ms @ 16 kHz

export class EnergyVad {
  private floorDb = -60
  private speechRun = 0
  private silenceRun = 0
  inSpeech = false

  constructor(
    private readonly marginDb = 9,
    private readonly minSpeechFrames = 3, // 90 ms
    private readonly endSilenceFrames = 24, // ~0.72 s, as recommended by the model card
  ) {}

  /** Returns 'start' | 'end' | null for a 30 ms frame. */
  push(frame: Float32Array): 'start' | 'end' | null {
    let e = 0
    for (let i = 0; i < frame.length; i++) e += frame[i] * frame[i]
    const db = 10 * Math.log10(e / frame.length + 1e-12)
    // Track the noise floor: fast down, slow up (only while not speaking).
    if (db < this.floorDb) this.floorDb = 0.9 * this.floorDb + 0.1 * db
    else if (!this.inSpeech) this.floorDb = 0.995 * this.floorDb + 0.005 * db
    const voiced = db > Math.max(this.floorDb + this.marginDb, -55)
    if (voiced) {
      this.speechRun++
      this.silenceRun = 0
      if (!this.inSpeech && this.speechRun >= this.minSpeechFrames) {
        this.inSpeech = true
        return 'start'
      }
    } else {
      this.silenceRun++
      this.speechRun = 0
      if (this.inSpeech && this.silenceRun >= this.endSilenceFrames) {
        this.inSpeech = false
        return 'end'
      }
    }
    return null
  }

  get level() {
    return this.floorDb
  }
}
