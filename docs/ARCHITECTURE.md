# meetingCraft — เอกสารวิเคราะห์และออกแบบระบบ

> **อัปเดต 24 พ.ย. 2026:** เปลี่ยนการถอดเสียงจาก OpenThai 2.0 ASR (ONNX ในเครื่อง ~0.95 GB) เป็น **Typhoon ASR API** ตามการตัดสินใจของเจ้าของโปรเจกต์ — ไม่ต้องดาวน์โหลดโมเดลใหญ่ ใช้ได้กับ iPhone/มือถือทุกรุ่น แลกกับการส่งช่วงเสียงสั้น ๆ ออกนอกเครื่อง; เพิ่ม “คุยกับผู้ช่วยด้วยเสียง” (หัวข้อ 12) และ deploy บน GitHub Pages (หัวข้อ 13) ส่วนหัวข้อ 2.1 คงไว้เป็นบันทึกการวิเคราะห์

> ระบบบันทึกการประชุมแบบ **Local-first PWA** ที่ถอดเสียงภาษาไทยแบบเกือบเรียลไทม์, สแกนเอกสารเข้าระบบด้วย OCR, อ่านออกเสียงด้วย TTS และสรุปสาระสำคัญด้วย AI ที่ผู้ใช้เลือกเสียบเองได้ — โดย **ข้อมูลทั้งหมดอยู่บนเครื่อง client**

---

## 1. เป้าหมายและขอบเขต

| # | ความต้องการ | แนวทาง |
|---|---|---|
| R1 | บันทึกการประชุม + สรุปสาระสำคัญ | Meeting → Transcript segments + เอกสารแนบ → AI Summary (สรุป, มติ, Action items, ประเด็นค้าง) |
| R2 | เป็น PWA, **mobile-first** | Vite + React, Service Worker (Workbox), installable, offline shell, UI ออกแบบจากจอ 360px ขึ้นไป |
| R3 | ASR realtime ด้วย OpenThai 2.0 ASR Streaming (ONNX) | `onnxruntime-web` ใน Web Worker, AudioWorklet 16 kHz, VAD แบ่งช่วง + re-decode ช่วงที่กำลังพูด |
| R4 | TTS ด้วย MakHam TTS | `pythainlp/MakHamTTS` Paradee int8 (8 MB) + G2P JavaScript ใน Worker, fallback `speechSynthesis` |
| R5 | OCR เอกสารด้วย OpenThai2.1-OCR-Text | `det.onnx` + `rec.onnx` + `rec2.onnx` (รวม ~6.6 MB) รันใน Worker, กล้องมือถือ/อัปโหลดรูป |
| R6 | Plug-in AI ได้เอง | Provider interface: LLM ในเครื่องผ่าน ONNX (transformers.js), OpenAI-compatible (Typhoon, Gemini, Groq, OpenRouter, Ollama, LM Studio ฯลฯ), Anthropic Claude, และ “ไม่มี AI” (สรุปแบบ extractive) — ดูหัวข้อ 11 |
| R7 | ข้อมูลอยู่บน client | IndexedDB (Dexie) สำหรับข้อมูล, OPFS/Cache Storage สำหรับไฟล์โมเดล, ไม่มี backend ของระบบ; ส่งข้อมูลออกเฉพาะเมื่อผู้ใช้เปิดใช้ AI provider ภายนอกเอง |

**นอกขอบเขต v1:** การ sync หลายเครื่อง, แยกผู้พูด (diarization), การทำงานร่วมกันแบบ realtime

---

## 2. ผลการวิเคราะห์โมเดล (ตรวจจาก model card และกราฟ ONNX จริง)

### 2.1 ASR — `iapp/OpenThai2.0-ASR-Streaming-ONNX` (license: OpenMDW-1.1)

- สถาปัตยกรรม: Cache-aware FastConformer (24 ชั้น, d=1024) + RNN-T (LSTM 2 ชั้น × 640), 640M พารามิเตอร์
- เสียง: 16 kHz mono, log-mel 128 bands, หน้าต่าง 25 ms (400) Hann, hop 10 ms (160), n_fft 512, pre-emphasis 0.97, ไม่ normalize
- ไฟล์ที่ใช้ (int8): `openthai2.0-asr-streaming-int8.asr.zip` (109 MB: `encoder.int8.onnx` 1.6 MB กราฟ, `decoder_joint.onnx` 107 MB, `tokens.txt` 14,988 tokens) + `encoder.int8.onnx.data` (**0.88 GB**)
- I/O ที่ตรวจจากกราฟ:
  - Encoder: `audio_signal f32[B,128,T]`, `length i64[B]`, `prompt_index i64[B]` (32 = th-TH, 63 = th-mix) → `encoded f32[B,Tenc,1024]`, `encoded_length i64[B]`
  - Decoder+Joint: `encoder_outputs f32[1,1024,1]`, `targets i32[1,1]`, `target_length i32[1]`, `input_states_1/2 f32[2,1,640]` → `outputs f32[1,1,1,14989]` (blank = 14988), `output_states_1/2`
- **ข้อค้นพบสำคัญ:** กราฟ ONNX ที่ export มา **ไม่มี cache-state input** ของ encoder → ไม่สามารถป้อนทีละ chunk แบบ cache-aware ได้ตรง ๆ
  - **การออกแบบ:** “near-realtime” = VAD แบ่ง utterance ที่ช่วงเงียบ ≥ 0.7 วินาที (ตามที่ reference server ทำ) และระหว่างพูดจะ re-encode ช่วงที่ยังเปิดอยู่ทุก ~1.5 วินาทีเพื่อแสดงผลชั่วคราว (partial) → เมื่อจบ utterance จึง commit ผลสุดท้าย, จำกัด utterance สูงสุด ~20 วินาที (ตัดบังคับ) เพื่อคุมเวลาประมวลผล
  - เพิ่ม blank bias −1.0 (−2.5 สำหรับคลิป < 2 วินาที) ก่อน argmax ตามคำแนะนำใน model card
- **ข้อจำกัดบนมือถือ:** น้ำหนัก 0.88 GB โหลดเข้าหน่วยความจำ wasm ได้บนเดสก์ท็อป/Android ระดับกลาง-บน แต่ iOS Safari มีโอกาส crash → ระบบแสดงคำเตือนตามขนาด RAM (`navigator.deviceMemory`) และรองรับ “โหมดบันทึกก่อน ถอดทีหลัง” (บันทึกเสียงเก็บไว้ แล้วถอดเมื่อพร้อม/ต่ออุปกรณ์ที่แรงกว่า)

### 2.2 OCR — `iapp/OpenThai2.1-OCR-Text-20261118` (v2.1.4, pin commit `c765cb8`, license: Apache-2.0)

- ชื่อเดิม `iapp/OpenThai2.0-OCR-Text` redirect มาที่ repo นี้ และไฟล์ det/rec/rec2/config เหมือนกันทุกไบต์ จึงย้ายมาอ้างอิง 2.1 โดยตรง

- Detector `det.onnx` 1.8 MB (PP-OCRv6-tiny, DB): resize ด้านยาว ≤ 1280 ปัดเป็นพหุคูณของ 32, เติมขอบขาว 5%, normalize ImageNet mean/std ลำดับช่อง BGR, threshold 0.2, box_thresh 0.4, unclip 1.4
- Recognizer `rec.onnx` 2.4 MB: input `[N,3,48,W]`, `(x/255 − 0.5)/0.5`, CTC: class 0 = blank, ตามด้วย `rec_dict.txt` (528 ตัว) และ “ช่องว่าง” เป็นตัวสุดท้าย (รวม 530)
- Preprocess ครอปบรรทัดแบบ `flatten` (ลบพื้นหลังรายคอลัมน์) และ filter บรรทัด `drop_below 0.8`, `min_chars 2` ตาม `config.json`; บรรทัดตัวเลข/อักษรละตินตัวเดียวเก็บไว้เมื่อสูง ≥ 0.62 เท่าของความสูงบรรทัด (2.1.4)
- เหมาะกับมือถือมาก (รวม ~4 MB)

### 2.3 TTS — `pythainlp/MakHamTTS` (มะขาม, license: Apache-2.0)

- ใช้รุ่น **Paradee Thai int8** (`paradee_thai/paradee_thai_int8.onnx` 8.1 MB, 7.9M พารามิเตอร์), เสียงหญิงฝังในกราฟ ไม่ต้องใช้ voicepack, 24 kHz, รองรับ 5 วรรณยุกต์
- I/O: `input_ids i64[1,L]` (Kokoro phoneme ids จาก `config.json → vocab` 115 ตัว, ครอบด้วย 0 หัว-ท้าย), `speed f32[1]` → `waveform f32`
- G2P: ใช้ JavaScript port ทางการจาก web demo (normalizer → dictionary max-match tokenizer → G2P) + `dict.json` (62,112 คำ, 3.1 MB จาก GitHub `wannaphong/MakHamTTS`) — vendored ไว้ที่ `src/tts/makham/` พร้อม LICENSE
- แบ่งประโยคละ ≤ 510 phonemes แล้ว stream ทีละท่อนไปเล่นต่อเนื่อง; สำรองด้วย `speechSynthesis` ของระบบหากยังไม่ดาวน์โหลด

### 2.4 ผลทดสอบจริงในเบราว์เซอร์ (Chrome, macOS, WASM 4 threads, 24 พ.ย. 2026)

| Pipeline | ผล |
|---|---|
| MakHam TTS | ประโยคไทย → เสียง 6.4 วินาที ใช้เวลา RTF 0.035 (~28× เร็วกว่า realtime) |
| OCR (det + rec + rec2) | ภาพเอกสาร 5 บรรทัด (ไทย/ตัวเลข/อังกฤษ) อ่าน **ตรงทุกตัวอักษร** ใน 303 ms; rec2 แก้ "งUประมาณ" → "งบประมาณ" ในฟอนต์หัวกลม |
| ASR (offline) | เสียง MakHam 8.5 วินาที → ถอดถูกทุกคำ, decode 0.7 วินาที (RTF 0.10), โหลดโมเดล 1.6 วินาที |
| ASR (streaming จำลอง mic ทีละ 100 ms) | partial ทุก ~1.5 วินาที, final ตัดที่ช่วงเงียบถูกต้อง, แปลง "สอง" → "2" อัตโนมัติ (ITN) |

---

## 3. สถาปัตยกรรมภาพรวม

```
┌─────────────────────────── Browser / PWA (Main thread) ───────────────────────────┐
│  React UI (mobile-first)                                                          │
│   ├─ Meetings list ─ Meeting detail [Transcript | Documents | Summary]            │
│   ├─ Recorder (AudioWorklet 16 kHz → ring buffer)                                 │
│   ├─ Document capture (camera / file)                                             │
│   └─ Settings [Models | AI plug-ins | TTS | Storage & backup]                     │
│                                                                                   │
│  Services                                                                         │
│   ├─ db (Dexie/IndexedDB)  ── meetings, segments, documents, summaries, audio     │
│   ├─ modelStore (OPFS)     ── ดาวน์โหลด/resume/verify ไฟล์โมเดลจาก Hugging Face    │
│   ├─ ai/registry           ── providers (onnx-local, openai-compat, anthropic, …)  │
│   └─ tts/player            ── engines (makham, web-speech)                    │
├──────────────── Web Workers (onnxruntime-web: WebGPU → WASM SIMD fallback) ───────┤
│   asr.worker: VAD → log-mel → encoder → RNN-T greedy → tokens → text              │
│   ocr.worker: det → DB postprocess → crop+flatten → rec → CTC → reading order    │
│   tts.worker: text → G2P → phoneme ids → MakHam → PCM 24 kHz                      │
├──────────────── Service Worker (Workbox) ─────────────────────────────────────────┤
│   precache app shell, runtime cache wasm ของ onnxruntime                          │
└───────────────────────────────────────────────────────────────────────────────────┘
        │ (เฉพาะเมื่อผู้ใช้เปิดใช้)                    │ (ดาวน์โหลดครั้งแรกเท่านั้น)
        ▼                                             ▼
   AI provider ที่ผู้ใช้ตั้งค่าเอง                     huggingface.co (ไฟล์โมเดล)
   (localhost Ollama / cloud API)
```

### 3.1 เหตุผลการเลือกเทคโนโลยี

| เรื่อง | เลือก | เหตุผล |
|---|---|---|
| UI | React 19 + Tailwind v4 | ecosystem ใหญ่, mobile-first ด้วย utility class, dark mode |
| Build/PWA | Vite + vite-plugin-pwa | สร้าง SW/manifest อัตโนมัติ, worker แบบ ES module |
| Storage | Dexie (IndexedDB) | query/index, เก็บ Blob เสียง/รูปได้, reactive hooks |
| ไฟล์โมเดล | OPFS (fallback Cache Storage) | ไฟล์ขนาด GB, เขียนแบบ stream ไม่ต้องอยู่ใน RAM ทั้งก้อน, `navigator.storage.persist()` กันถูกลบ |
| Inference | onnxruntime-web | รองรับ WebGPU + WASM, external data, ทำงานใน Worker |
| Unzip | fflate | zip แบบ store ขนาด 109 MB แตกแบบ stream ได้ |

---

## 4. โมเดลข้อมูล (IndexedDB)

```ts
Meeting   { id, title, startedAt, endedAt?, durationMs, tags[], attendees[], agenda?, language: 'th-TH'|'th-mix', status: 'draft'|'recording'|'done', updatedAt }
Segment   { id, meetingId, startMs, endMs, text, final: boolean, source: 'asr'|'manual', edited?: boolean }
AudioChunk{ id, meetingId, seq, startMs, blob (PCM16 / webm) }         // เก็บเสียงดิบเพื่อถอดซ้ำ/ฟังย้อน
DocumentItem { id, meetingId, createdAt, image: Blob, text, lines: OcrLine[], title? }
Summary   { id, meetingId, providerId, model, createdAt, markdown, sections: { overview, decisions[], actionItems[{task, owner?, due?}], openIssues[] } }
AiProvider{ id, kind: 'openai-compatible'|'anthropic'|'local', name, baseUrl?, apiKey?, model, enabled }
Setting   { key, value }   // asrModelVariant, ttsEngine, promptTemplate, ฯลฯ
ModelFile { id, repo, path, size, sha?, storedAt }                    // metadata ของไฟล์ใน OPFS
```

Index สำคัญ: `segments: [meetingId+startMs]`, `documents: meetingId`, `summaries: meetingId`, `meetings: updatedAt`

---

## 5. Flow หลัก

### 5.1 การบันทึก + ถอดเสียง
1. ผู้ใช้กด “เริ่มบันทึก” → ขอ mic (`getUserMedia` echoCancellation/noiseSuppression) → `navigator.wakeLock` กันจอดับ
2. AudioWorklet resample → 16 kHz Float32 → ส่ง frame ละ 20 ms ไป `asr.worker` (Transferable) และสำรอง PCM เป็น `AudioChunk` ทุก 10 วินาที
3. Worker: energy-VAD (adaptive noise floor) → สะสม utterance → ทุก 1.5 วินาทีถอดชั่วคราว (`partial`) → เงียบ ≥ 0.7 วินาทีหรือยาวเกิน 20 วินาที → ถอดรอบสุดท้าย (`final`)
4. Main thread เขียน Segment ลง DB, UI แสดง partial แบบตัวเอียง, final แบบปกติ, แก้ข้อความได้ทันที
5. หยุดบันทึก → ปิด stream, ปล่อย wake lock, สถานะ `done`

### 5.2 สแกนเอกสาร
กล้อง (`<input capture="environment">` ซึ่งเสถียรที่สุดบนมือถือ) → ลดขนาดรูป → `ocr.worker` → แสดงข้อความ + กรอบบรรทัดให้แก้ไข → บันทึกเป็น DocumentItem ผูกกับการประชุม (นำไปใช้เป็นบริบทในการสรุป)

### 5.3 การสรุปด้วย AI (plug-in)
1. รวบรวม: ข้อมูลการประชุม + transcript (final) + ข้อความเอกสาร
2. ถ้ายาวเกิน budget ของ provider → map-reduce (สรุปทีละช่วง แล้วสรุปรวม)
3. ส่งให้ provider ที่เลือกพร้อม prompt template (แก้ไขได้ใน Settings) ขอผลเป็น Markdown ตามหัวข้อมาตรฐาน: ภาพรวม / มติที่ประชุม / Action items (ผู้รับผิดชอบ, กำหนดส่ง) / ประเด็นค้าง
4. stream ผลกลับมาแสดง → บันทึก Summary (เก็บหลายเวอร์ชันได้) → อ่านออกเสียงด้วย TTS / export Markdown

### 5.4 Plug-in AI Interface
```ts
interface AiProvider {
  id: string; kind: string; label: string;
  complete(req: { system: string; messages: {role:'user'|'assistant'; content:string}[]; signal?: AbortSignal },
           onText: (delta: string) => void): Promise<string>;
  test(): Promise<void>;     // ปุ่ม “ทดสอบการเชื่อมต่อ”
}
```
- **openai-compatible**: `POST {baseUrl}/chat/completions` (stream SSE) — ใช้กับ Ollama (`http://localhost:11434/v1`), LM Studio, vLLM, llama.cpp server, Typhoon, OpenRouter, Gemini (OpenAI-compatible endpoint)
- **anthropic**: `@anthropic-ai/sdk` ใน browser (`dangerouslyAllowBrowser`) ค่าเริ่มต้น `claude-opus-5-5`, adaptive thinking, streaming
- **local**: สรุปแบบ extractive ในเครื่อง (ไม่ใช้เน็ต) — จัดอันดับประโยคด้วยความถี่คำ + ตรวจคำบ่งชี้ “มติ/มอบหมาย/ภายในวันที่”
- เพิ่ม provider ใหม่ = เพิ่มไฟล์ใน `src/ai/providers/` แล้ว register

---

## 6. ความเป็นส่วนตัวและความปลอดภัย

- ไม่มีเซิร์ฟเวอร์ของระบบ; มีตัวนับผู้เข้าชม Histats บนเว็บจริงเท่านั้น (นับการเปิดหน้า ไม่ได้รับข้อมูลการประชุม) — โหลดเฉพาะ production build
- ASR/OCR/TTS ทำงานในเครื่อง 100% หลังดาวน์โหลดโมเดล
- AI provider ภายนอก: แสดงป้าย “ข้อมูลจะถูกส่งไปที่ {host}” ทุกครั้งก่อนสรุป; แนะนำ Ollama/LM Studio บนเครื่องสำหรับข้อมูลลับ
- API key เก็บใน IndexedDB ของ origin นี้เท่านั้น (ระบุชัดใน UI ว่าไม่ได้เข้ารหัส); ตัวเลือก “ไม่จำ key” เก็บเฉพาะใน memory
- `navigator.storage.persist()` กันเบราว์เซอร์ลบข้อมูล, export/import backup (ZIP: JSON + เสียง + รูป) เพื่อย้ายเครื่อง
- CSP: `connect-src` จำกัดเป็น self + huggingface + provider ที่ผู้ใช้กำหนด (ตั้งตอน deploy)

---

## 7. Mobile-first UX

- Layout คอลัมน์เดียว, bottom navigation (การประชุม / บันทึก / ตั้งค่า), ปุ่มบันทึกขนาดใหญ่ใต้หัวแม่มือ
- `env(safe-area-inset-*)` รองรับ notch/home indicator, `100dvh`
- Touch target ≥ 44px, ตัวอักษรไทยใช้ Noto Sans Thai/IBM Plex Sans Thai ขนาดฐาน 16px
- Wake Lock ระหว่างบันทึก, แจ้งเตือนเมื่อแอปไปอยู่ background (iOS จะหยุด mic)
- ตรวจความสามารถเครื่อง (`deviceMemory`, WebGPU, พื้นที่ว่าง `storage.estimate()`) แล้วแนะนำโหมด: realtime / บันทึกก่อนถอดทีหลัง
- Dark mode ตามระบบ

---

## 8. โครงสร้างโปรเจกต์

```
src/
  app/            App shell, router, bottom nav
  pages/          MeetingsPage, MeetingPage, RecordPage, SettingsPage
  components/     UI ย่อย (Sheet, Button, ProgressBar, ...)
  db/             schema.ts (Dexie), repo functions
  models/         registry.ts (manifest โมเดล), modelStore.ts, opfs.ts, ort.ts
  workers/        download.worker.ts (ดาวน์โหลดแบบ resume + แตก ZIP ลง OPFS)
  asr/            capture.worklet.js, mel.ts, vad.ts, asr.worker.ts (RNN-T greedy), recorder.ts
  ocr/            ocr.worker.ts (DB post-process, flatten, CTC, rec2, canonical), client.ts
  tts/            makham/ (G2P ที่ vendored), tts.worker.ts, player.ts (MakHam + Web Speech fallback)
  ai/             types.ts, presets.ts, registry.ts, prompts.ts, summarize.ts, llm.worker.ts,
                  providers/{onnxLocal,openaiCompatible,anthropic,extractive}.ts
  lib/            utils (format เวลา, export markdown, backup)
```

---

## 9. แผนพัฒนา (Roadmap)

| Phase | งาน |
|---|---|
| 1 (เสร็จแล้ว) | โครง PWA, DB, CRUD การประชุม, recorder + ASR pipeline, OCR pipeline (+rec2), MakHam TTS, AI plug-ins 4 ชนิด, Summary map-reduce, Export/Backup |
| 2 | วัด RTF บนมือถือจริง (Android/iOS), เทียบ log-mel กับ NeMo แบบตัวเลข, ปรับ VAD เป็น Silero VAD (ONNX 2 MB), ทดสอบกับเสียงประชุมจริงที่มีเสียงรบกวน |
| 3 | OCR: deskew/หมุนอัตโนมัติ, กรอบเอียง (rotated boxes), reading order หลายคอลัมน์; แปลง typhoon2.5-qwen3-4b เป็น ONNX |
| 4 | Diarization (แยกผู้พูด), ค้นหาข้ามการประชุม (full-text), แชร์ไฟล์สรุปผ่าน Web Share API |

## 10. ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | การลดผลกระทบ |
|---|---|---|
| Encoder 0.88 GB ใหญ่สำหรับมือถือ | crash/โหลดช้า | เตือนตาม RAM, โหมดถอดทีหลัง, WebGPU, รอ export แบบ cache-aware/ขนาดเล็กลง |
| ONNX ไม่มี streaming cache | latency สูงขึ้น (partial ทุก ~1.5 วินาที) | จำกัดความยาว utterance, re-decode เฉพาะช่วงล่าสุด |
| dict.json ของ MakHam โหลดจาก GitHub | ถ้า repo ย้าย ลิงก์เสีย | ไฟล์ถูกเก็บใน OPFS หลังดาวน์โหลดครั้งแรก; เปลี่ยน URL ได้ใน `registry.ts` |
| iOS หยุด mic เมื่ออยู่ background | เสียงขาดช่วง | Wake Lock + แจ้งเตือน + บันทึก chunk ต่อเนื่อง |
| เบราว์เซอร์ลบ storage | ข้อมูลหาย | `storage.persist()` + backup/restore |

---

## 11. วิเคราะห์ตัวเลือก AI สำหรับสรุปการประชุม (ตรวจ ณ 24 พ.ย. 2026)

เกณฑ์: (1) เข้าใจ/เขียนภาษาไทยได้ดี (2) context ยาวพอสำหรับ transcript 1–2 ชั่วโมง (~20–40k tokens ภาษาไทย) (3) รันในเบราว์เซอร์ผ่าน ONNX ได้ หรือมี API ฟรี (4) ความเป็นส่วนตัว

### 11.1 รันในเครื่องผ่าน ONNX (transformers.js v4 + WebGPU) — ข้อมูลไม่ออกจากเครื่อง

ขนาดไฟล์ตรวจจาก Hugging Face API (quantization `q4f16` ซึ่งเป็นแบบที่แนะนำบน WebGPU)

| โมเดล (repo) | ขนาดดาวน์โหลด | ภาษาไทย | เหมาะกับ | หมายเหตุ |
|---|---|---|---|---|
| `onnx-community/Qwen3.5-0.8B-Text-ONNX` | ~0.47 GB | พอใช้ (Qwen รองรับ 100+ ภาษา) | **มือถือ** | เล็กสุดที่ยังสรุปเป็นหัวข้อได้, ควรใช้แบบ map-reduce |
| `onnx-community/Qwen3-0.6B-ONNX` | ~0.57 GB | พอใช้ | มือถือ | มีโหมด thinking (ปิดด้วย `/no_think`) |
| `onnx-community/gemma-3-1b-it-ONNX` | ~0.76 GB | ดี | มือถือระดับบน | license Gemma (ใช้เชิงพาณิชย์ได้ตามเงื่อนไข) |
| `Natthaset/llama3.2-typhoon2-1b-instruct-onnx` | ~1.07 GB | **ดีมาก (เทรนภาษาไทยโดยตรง)** | มือถือระดับบน/แท็บเล็ต | community conversion, license Llama 3.2 |
| `onnx-community/Qwen3-1.7B-ONNX` | ~1.43 GB | ดี | แท็บเล็ต/โน้ตบุ๊ก | คุณภาพสรุปดีขึ้นชัดเจน |
| `onnx-community/Qwen3-4B-Instruct-2507-ONNX` | ~2.9 GB | ดีมาก | เดสก์ท็อป (GPU ≥ 4 GB) | context ยาว, สรุปได้ใกล้เคียงโมเดล cloud ขนาดกลาง |

ข้อสังเกต:
- `typhoon-ai/typhoon2.5-qwen3-4b` (ไทยดีที่สุดในกลุ่มเล็ก, context 256k) **ยังไม่มี ONNX build** — แปลงเองได้ด้วย `optimum`/`onnxruntime-genai` เป็นงาน Phase ถัดไป
- โมเดลกลุ่มนี้ต้องใช้ **WebGPU** (kernel `GatherBlockQuantized` ไม่มีบน WASM) → ใช้ได้บน Chrome/Edge (Android, desktop) และ Safari 26+; ถ้าไม่มี WebGPU ระบบจะซ่อนตัวเลือกนี้
- ASR (0.88 GB) + LLM ไม่ควรโหลดพร้อมกันบนมือถือ → ระบบ **unload ASR ก่อนโหลด LLM** ตอนสรุป
- Chrome Built-in AI (Gemini Nano: Summarizer/Prompt API) **ยังไม่รองรับภาษาไทย** (Chrome 149 รองรับ en/es/ja/de/fr) → ไม่ใช้

### 11.2 API ที่ใช้ฟรีได้ (ข้อมูลถูกส่งออกนอกเครื่อง)

ตัวเลขโควตามาจากแหล่งรวบรวมบุคคลที่สาม/บทความปี 2026 และเปลี่ยนบ่อย — ต้องตรวจหน้า official ก่อนใช้งานจริง

| Provider | Endpoint (OpenAI-compatible) | โมเดลแนะนำ | ฟรี | ภาษาไทย | ข้อควรระวัง |
|---|---|---|---|---|---|
| **Typhoon API** (SCB 10X) | `https://api.opentyphoon.ai/v1` | `typhoon-v2.5-30b-a3b-instruct` | ฟรี ไม่ต้องใช้บัตร (~5 req/s, 200 req/min ตามแหล่งรวบรวม) | **ดีที่สุด (โมเดลไทย)** | free tier เก็บข้อมูลเพื่อพัฒนาโมเดล |
| **Google Gemini API** | `https://generativelanguage.googleapis.com/v1beta/openai` | Gemini Flash รุ่นล่าสุด | ฟรีเฉพาะรุ่น Flash (Pro ถูกถอดจาก free tier เม.ย. 2026) | ดีมาก, context 1M | free tier อาจใช้ prompt ไปเทรน |
| **Groq** | `https://api.groq.com/openai/v1` | Llama 3.3 70B / Qwen | ~30 RPM, ~1,000 req/วัน (แล้วแต่รุ่น) | ดี | เร็วมาก, context จำกัดตามรุ่น |
| **OpenRouter** (`:free` models) | `https://openrouter.ai/api/v1` | โมเดล `:free` ที่มี | 20 RPM, 50 req/วัน (1,000/วัน เมื่อเติม $10) | แล้วแต่รุ่น | รายชื่อรุ่นฟรีเปลี่ยนบ่อย |
| **Ollama / LM Studio** (เครื่องตัวเองหรือ LAN) | `http://localhost:11434/v1` / `http://localhost:1234/v1` | `typhoon2.5-qwen3-4b`, `qwen3:8b`, `gemma3` (GGUF) | ฟรี (ใช้ฮาร์ดแวร์ตัวเอง) | ดี–ดีมาก | ต้องเปิด CORS (`OLLAMA_ORIGINS=*`) — **ข้อมูลไม่ออกนอกเครือข่าย** |
| Anthropic Claude (เสียเงิน) | SDK ทางการ | `claude-opus-5-5` | ไม่ฟรี | ดีมาก, context 1M | ตัวเลือกคุณภาพสูงสุด |

### 11.3 ข้อแนะนำ

| สถานการณ์ | ตัวเลือกแนะนำ |
|---|---|
| ข้อมูลลับ/ราชการ, ใช้บนมือถือ | Qwen3.5-0.8B หรือ Typhoon2-1B (ONNX ในเครื่อง) + map-reduce |
| ข้อมูลลับ, มีโน้ตบุ๊ก/PC ใน LAN | Ollama + `typhoon2.5-qwen3-4b` (คุณภาพไทยดีที่สุดที่ยังไม่ออกนอกองค์กร) |
| ข้อมูลทั่วไป, อยากได้คุณภาพดีฟรี | Typhoon API (ไทยดีที่สุด) → สำรองด้วย Gemini Flash |
| ไม่มีเน็ต/ไม่มี GPU | สรุปแบบ extractive ในเครื่อง (ไม่ใช้ AI) |

ระบบจึงมี provider 4 ชนิด: `onnx-local` (transformers.js ใน Worker), `openai-compatible` (พร้อม preset Typhoon/Gemini/Groq/OpenRouter/Ollama/LM Studio), `anthropic`, `extractive`

---

## 12. คุยกับผู้ช่วยด้วยเสียง (Realtime conversation)

```
แตะ "คุยกับผู้ช่วย" → ไมค์ (AudioWorklet 16 kHz) → VAD ตัดช่วงพูด → Typhoon ASR
   → LLM (Typhoon/ตัวที่เลือก) + บริบท: ข้อมูลการประชุม, สรุปล่าสุด, ถอดเสียง (ช่วงท้ายถ้ายาว), เอกสาร, บทสนทนา 8 รอบล่าสุด
   → คำตอบแบบภาษาพูด 1–3 ประโยค → MakHam TTS อ่านออกเสียง → กลับมาฟังต่อ
```

- **Half-duplex**: ปิดการส่งเสียงขณะผู้ช่วยคิด/พูด เพื่อไม่ให้ถอดเสียงตัวเอง; แตะปุ่มเพื่อพูดแทรก (barge-in)
- **เพิ่มข้อมูลด้วยเสียง**: LLM ใส่บรรทัด `บันทึก: …` ท้ายคำตอบ → ระบบตัดออกจากเสียงพูด แล้วต่อท้ายโน้ตของการประชุม `• [เวลา ผู้ช่วย] …` (นำไปใช้ตอนสรุปด้วย)
- พิมพ์ถามแทนพูดได้, ปิดเสียงตอบได้, บทสนทนาแยกตามการประชุม (เก็บในหน่วยความจำ)
- ทดสอบ e2e ใน Chrome จริงด้วย fake mic (เสียงไทยจาก macOS) + mock API: ASR 3 ครั้ง (partial 2 + final 1), LLM ได้บริบทครบ, โน้ตถูกบันทึก, transcript ไม่ถูกแตะ

## 13. Deploy บน GitHub Pages

- GitHub Actions build → `actions/deploy-pages` → `https://kimookpong.github.io/meetingCraft/` (ใช้ `base: './'` + hash routing จึงทำงานใต้ subpath ได้)
- Service worker แบบ `injectManifest` ([src/sw.ts](../src/sw.ts)) precache แอป และเติม header `COOP: same-origin`, `COEP: credentialless`, `CORP: same-origin` ให้ทุก response ของ origin ตัวเอง → `crossOriginIsolated = true` (ทดสอบแล้วใน Chrome บน static server ที่ไม่ส่ง header)
- ข้อจำกัดที่ทราบ: ขณะออฟไลน์ หน้าที่โหลดซ้ำยังไม่ isolated (ทำงานได้แต่ WASM single-thread); Safari ยังไม่รองรับ `credentialless`

## 14. Typhoon proxy (Cloudflare Worker)

```
PWA (kimookpong.github.io) ──► meetingcraft-typhoon-proxy.thasaladev.workers.dev/v1 ──► api.opentyphoon.ai/v1
         ไม่มี API key                 key อยู่ใน Worker secret (TYPHOON_API_KEY)
```

- โค้ด: [proxy/src/index.ts](../proxy/src/index.ts), config: [proxy/wrangler.jsonc](../proxy/wrangler.jsonc) (บัญชี ThasalaDev)
- ป้องกัน: origin allowlist (CORS), rate limit 30 ครั้ง/นาที/IP (Workers Rate Limiting binding), เปิดเฉพาะ 3 endpoint, บังคับโมเดล `typhoon-*`, จำกัดขนาดคำขอ (chat 1.5 MB / เสียง 4 MB), `max_tokens ≤ 4096`, stream คำตอบโดยไม่ buffer, เปิด Workers Logs + Traces
- deploy/เปลี่ยน key: `cd proxy && ./scripts/deploy.sh` (อ่าน key แบบซ่อน ตรวจกับ Typhoon ก่อน แล้วลบไฟล์ชั่วคราวทันที)
- แอปสร้าง provider “Typhoon (ผ่าน meetingCraft)” อัตโนมัติจาก `VITE_TYPHOON_PROXY_URL` ใน `.env` (URL สาธารณะ ไม่ใช่ความลับ)
- ทดสอบจริง 24 พ.ย. 2026: ASR ผ่าน proxy 0.67 วินาที/เสียง 8 วินาที, chat streaming, voice chat e2e (fake mic → proxy → Typhoon ASR + LLM → บันทึกโน้ต) ผ่าน
- ข้อจำกัด: origin ปลอมได้จากสคริปต์นอกเบราว์เซอร์ → พึ่ง rate limit; เพิ่ม Cloudflare Turnstile ได้ถ้าพบการใช้ผิด

## 15. ใช้ร่วมกับ Zoom / Google Meet

| แนวทาง | สถานะ | ทำงานอย่างไร |
|---|---|---|
| มือถือวางข้างลำโพง | ใช้ได้เดิม | ไมค์ได้ยินเสียงลำโพง (ใช้ไม่ได้ถ้าใส่หูฟัง) |
| **โหมดประชุมออนไลน์** | ทำแล้ว | `getDisplayMedia` (แชร์แท็บ/หน้าจอพร้อมเสียง) + `getUserMedia` (ไมค์) → รวมใน AudioWorklet เดียว → VAD → Typhoon ASR; หยุดแชร์ = หยุดบันทึก + เสนอคุยสรุป |
| **นำเข้าไฟล์บันทึก** | ทำแล้ว | `OfflineAudioContext(16 kHz).decodeAudioData` → mono → เก็บเป็นชิ้นละ 10 นาที → VAD + รวมเป็นคำขอ ~25 วินาที → Typhoon ASR (retry 429 ตาม Retry-After) |
| Zoom RTMS / Meet Media API | ยังไม่ทำ | ต้องมี backend รับเสียง + OAuth/การอนุมัติแพลตฟอร์ม ขัดกับหลัก local-first |

- Proxy แยก rate limit: ถอดเสียง 60 ครั้ง/นาที/IP, แชท 30 ครั้ง/นาที/IP
- ทดสอบ e2e (24 พ.ย. 2026): นำเข้า .m4a 31.6 วินาที (AAC stereo 44.1 kHz) → ถอดเสียง 2 คำขอ ใช้เวลา 1.6 วินาที; โหมดออนไลน์ใน Chrome จริง (แท็บจำลองที่เล่นเสียงไทย) → ถอดเสียงสด 4 ช่วงครบทั้ง 3 วาระ และขึ้นหน้าต่างคุยสรุปหลังหยุด
- ข้อสังเกตการทดสอบ: headless Chrome ได้เสียงแท็บเป็นความเงียบ และ flag `--use-fake-device-for-media-stream` จะแทนที่การแชร์แท็บด้วยสัญญาณปลอม ต้องทดสอบด้วย Chrome แบบมีหน้าต่างและไม่ใช้ flag นั้น
