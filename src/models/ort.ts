/** Shared ONNX Runtime Web setup for workers. */
import * as ort from 'onnxruntime-web/all'

const ORT_VERSION = '1.31.1'
let configured = false

export function getOrt() {
  if (!configured) {
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
    const cores = (self.navigator as Navigator).hardwareConcurrency || 2
    // Threads require cross-origin isolation (SharedArrayBuffer).
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, cores - 1)) : 1
    ort.env.logLevel = 'error'
    configured = true
  }
  return ort
}

export const hasWebGPU = () => typeof (self.navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined'

export type Ort = ReturnType<typeof getOrt>
