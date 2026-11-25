# meetingCraft

ระบบบันทึกการประชุมแบบ **PWA, mobile-first, local-first** — ถอดเสียงภาษาไทยแบบเรียลไทม์, สแกนเอกสารด้วย OCR, อ่านออกเสียงด้วย TTS และสรุปสาระสำคัญด้วย AI ที่คุณเลือกเสียบเองได้ **ข้อมูลทั้งหมดอยู่บนเครื่องของคุณ**

| ความสามารถ | โมเดล / เทคโนโลยี | ทำงานที่ |
|---|---|---|
| ถอดเสียงเรียลไทม์ | Typhoon ASR (`typhoon-asr-realtime`) ผ่าน API — VAD ตัดช่วงเสียงในเครื่อง แล้วส่งเฉพาะช่วงสั้น ๆ | Typhoon API |
| คุยกับผู้ช่วยด้วยเสียง | ไมค์ → Typhoon ASR → LLM (พร้อมข้อมูลการประชุม) → MakHam TTS; สั่ง “บันทึก…” แล้วจดลงโน้ตให้ | API + ในเครื่อง |
| สแกนเอกสาร | [iapp/OpenThai2.1-OCR-Text-20261118](https://huggingface.co/iapp/OpenThai2.1-OCR-Text-20261118) (~6.6 MB) | ในเครื่อง |
| อ่านออกเสียง | [pythainlp/MakHamTTS](https://huggingface.co/pythainlp/MakHamTTS) Paradee int8 (~11 MB) | ในเครื่อง |
| สรุปการประชุม | Plug-in: Typhoon (แนะนำ), LLM ONNX ในเครื่อง, Gemini, Groq, OpenRouter, Ollama, LM Studio, Claude หรือแบบไม่ใช้ AI | ตามที่เลือก |

**ใช้กับ Zoom / Google Meet ได้ 2 แบบ**
- **โหมดประชุมออนไลน์** (คอมพิวเตอร์, Chrome/Edge): เลือก “ประชุมออนไลน์” ที่แถบบันทึก → แชร์แท็บ Google Meet (เปิด “แชร์เสียงแท็บ”) หรือหน้าจอ Zoom พร้อมเสียงระบบ ระบบรวมเสียงคนในประชุมกับไมค์ของคุณ แล้วถอดเสียงสด — ใส่หูฟังได้ ไม่ต้องมีบอทเข้าห้อง (macOS ต้อง 14.2+ สำหรับเสียงทั้งระบบ; มือถือแชร์เสียงจากเบราว์เซอร์ไม่ได้)
- **นำเข้าไฟล์บันทึก**: ปุ่ม “นำเข้าไฟล์” ที่หน้าแรก หรือเมนู ⋯ ในการประชุม รองรับ .m4a .mp4 .mp3 .wav .webm (ไม่เกิน 1.5 GB) ถอดรหัสในเบราว์เซอร์ แล้วรวมช่วงเสียงเป็นชุดละ ~25 วินาทีก่อนส่งถอดความ

รองรับ 2 ภาษา (ไทย / English) — สลับได้ที่หัวหน้าแรก, หน้าแนะนำ หรือ ตั้งค่า; ลิงก์ `?lang=en` / `?lang=th` เปิดเป็นภาษานั้นได้ทันที สรุปและผู้ช่วยตอบตามภาษาที่เลือก

เอกสารวิเคราะห์และออกแบบ: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (รวมผลเปรียบเทียบตัวเลือก AI สำหรับสรุป หัวข้อ 11)

## เริ่มต้น

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ (static, deploy ได้ทุกที่)
```

ครั้งแรก: **ตั้งค่า → การถอดเสียง** วาง Typhoon API key (ฟรีที่ [opentyphoon.ai](https://playground.opentyphoon.ai/)) แล้วดาวน์โหลดโมเดล OCR/เสียงอ่านใน **โมเดลในเครื่อง** (เก็บใน OPFS, ดาวน์โหลดต่อจากเดิมได้)

## การ deploy (GitHub Pages)

- push ขึ้น `main` แล้ว workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) จะ build และ deploy ไปที่ `https://kimookpong.github.io/meetingCraft/`
- ต้องเปิดครั้งแรก: Settings → Pages → Source: **GitHub Actions**

### Typhoon proxy (Cloudflare Worker)

ผู้ใช้ไม่ต้องกรอก API key: แอปเรียก Typhoon ผ่าน Worker ใน [proxy/](proxy/) ซึ่งเก็บ key เป็น secret ฝั่ง Cloudflare — **ไม่มี key อยู่ในไฟล์ JS ของเว็บ**

- ความปลอดภัยของ proxy: รับเฉพาะ origin ที่อนุญาต (`ALLOWED_ORIGINS`), จำกัด 30 ครั้ง/นาที/IP, เปิดเฉพาะ `/v1/chat/completions`, `/v1/audio/transcriptions`, `/v1/models`, บังคับโมเดล `typhoon-*`, จำกัดขนาดคำขอ และ `max_tokens ≤ 4096`
- deploy / เปลี่ยน key (ใส่ key แบบซ่อนตัวอักษร ไม่เขียนลงดิสก์):
  ```bash
  cd proxy && npm install && ./scripts/deploy.sh
  ```
- URL ของ proxy (สาธารณะ) อยู่ใน [.env](.env) → `VITE_TYPHOON_PROXY_URL` (ปัจจุบัน `https://meetingcraft-typhoon-proxy.thasaladev.workers.dev/v1`)
- ดู log: `cd proxy && npx wrangler tail`
- ผู้ใช้ที่มี key ของตัวเองกด “ใช้ API key ของฉันเองแทน” ใน ตั้งค่า → การถอดเสียง ได้

## ใช้ AI ในเครื่องผ่าน Ollama

```bash
OLLAMA_ORIGINS="*" ollama serve
```

จากนั้นใน ตั้งค่า → AI สำหรับสรุป → เพิ่ม → Ollama (ใช้ได้ทั้ง `localhost` และ IP ในวง LAN)

## ความเป็นส่วนตัว

- ไม่มี backend ของระบบ มีเพียงตัวนับผู้เข้าชม Histats บนเว็บจริง (นับการเปิดหน้าเว็บ ไม่ได้รับข้อมูลการประชุม; ไม่โหลดตอนพัฒนาในเครื่อง)
- เสียงเต็ม/รูป/ข้อความ/API key เก็บใน IndexedDB ของเบราว์เซอร์บนเครื่องนี้
- ส่งออกนอกเครื่อง: ช่วงเสียงสั้น ๆ ไปถอดความที่ Typhoon ASR, และข้อความการประชุมไปยัง AI ที่เลือกเมื่อกดสรุป/คุยกับผู้ช่วย (มีหน้าต่างยืนยันก่อนสรุป)
- สำรอง/กู้คืนเป็นไฟล์ `.zip` ได้ใน ตั้งค่า (ไม่รวม API key)

## License ของโมเดลและโค้ดภายนอก

- Typhoon ASR / LLM — ใช้ผ่าน API ของ SCB 10X ตามเงื่อนไขการใช้บริการ
- OpenThai2.1 OCR Text (2.1.4) — Apache-2.0 (iApp Technology), PP-OCRv6 weights Apache-2.0
- MakHam TTS และโค้ด G2P ใน `src/tts/makham/` — Apache-2.0 (PyThaiNLP / Wannaphong Phatthiyaphaibun)
