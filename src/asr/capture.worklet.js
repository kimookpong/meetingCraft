// AudioWorklet: downmix to mono, resample to 16 kHz, post ~100 ms Float32 chunks.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.pos = 0
    this.out = new Float32Array(1600)
    this.n = 0
    this.prev = 0
  }
  process(inputs) {
    const ch = inputs[0]
    if (!ch || !ch.length) return true
    const len = ch[0].length
    const mono = new Float32Array(len)
    for (let c = 0; c < ch.length; c++) for (let i = 0; i < len; i++) mono[i] += ch[c][i] / ch.length
    // Linear interpolation resampler; `pos` is the fractional read position.
    while (this.pos < len) {
      const i = Math.floor(this.pos)
      const f = this.pos - i
      const a = i === 0 ? this.prev : mono[i - 1]
      const b = mono[i]
      this.out[this.n++] = a + (b - a) * f
      if (this.n === this.out.length) {
        this.port.postMessage(this.out, [this.out.buffer])
        this.out = new Float32Array(1600)
        this.n = 0
      }
      this.pos += this.ratio
    }
    this.pos -= len
    this.prev = mono[len - 1]
    return true
  }
}
registerProcessor('capture-processor', CaptureProcessor)
