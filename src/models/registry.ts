/**
 * Manifest of on-device ONNX models. Files are fetched once from Hugging Face,
 * stored in the Origin Private File System, and never leave the device again.
 */
export interface ModelFile {
  /** Path inside the HF repo. */
  path: string
  /** Approximate size in bytes (for progress / storage estimates). */
  size: number
  /** Absolute URL when the file is not in `repo` (must allow CORS). */
  url?: string
  /** Local file name (defaults to the basename of `path`). */
  name?: string
  /** If set, the file is a ZIP whose entries are extracted next to it, then deleted. */
  extract?: string[]
}

export interface ModelSpec {
  id: string
  label: string
  description: string
  repo: string
  revision: string
  license: string
  files: ModelFile[]
}

const MB = 1024 * 1024

export const MODELS = {
  ocr: {
    id: 'ocr-openthai2-text',
    label: 'OpenThai2.1 OCR Text',
    description: 'Thai/English document OCR (detector + CTC recognizer + rec2)',
    // Pinned to the 2.1.4 release commit (18 Nov 2026) so results stay reproducible.
    // Same id as before: 2.1 ships byte-identical det/rec/rec2 to what the old 2.0 name served.
    repo: 'iapp/OpenThai2.1-OCR-Text-20261118',
    revision: 'c765cb8017c406ddc2a518de51db22bb2e2bbd07',
    license: 'Apache-2.0',
    files: [
      { path: 'det.onnx', size: 1.8 * MB },
      { path: 'rec.onnx', size: 2.4 * MB },
      { path: 'rec2.onnx', size: 2.4 * MB },
      { path: 'rec_dict.txt', size: 2000 },
    ],
  },
  tts: {
    id: 'tts-makham-paradee-int8',
    label: 'MakHam TTS (Paradee Thai int8)',
    description: 'Thai female voice, 24 kHz, 5 tones, 8 MB',
    repo: 'pythainlp/MakHamTTS',
    revision: 'main',
    license: 'Apache-2.0',
    files: [
      { path: 'paradee_thai/paradee_thai_int8.onnx', size: 8.1 * MB },
      { path: 'paradee_thai/config.json', size: 2700 },
      {
        path: 'webdemo/dict.json',
        url: 'https://raw.githubusercontent.com/wannaphong/MakHamTTS/main/webdemo/dict.json',
        size: 3.1 * MB,
      },
    ],
  },
} satisfies Record<string, ModelSpec>

export type ModelKey = keyof typeof MODELS

export function fileUrl(spec: ModelSpec, f: ModelFile) {
  return f.url ?? `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/${f.path}`
}

export const fileName = (f: ModelFile) => f.name ?? f.path.split('/').pop()!

export function totalSize(spec: ModelSpec) {
  return spec.files.reduce((a, f) => a + f.size, 0)
}
