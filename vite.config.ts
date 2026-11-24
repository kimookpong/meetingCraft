import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Cross-origin isolation unlocks SharedArrayBuffer → multi-threaded ONNX Runtime WASM.
// `credentialless` keeps cross-origin fetches to huggingface.co / CDNs working.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'logo.svg', 'favicon.ico', 'apple-touch-icon-180x180.png', 'og-image.png', 'robots.txt', 'sitemap.xml'],
      manifest: {
        id: './',
        name: 'meetingCraft — บันทึกการประชุม',
        short_name: 'meetingCraft',
        description: 'บันทึกการประชุม ถอดเสียงภาษาไทย สแกนเอกสาร สรุปด้วย AI และคุยถามตอบด้วยเสียง — ข้อมูลอยู่บนเครื่องคุณ',
        lang: 'th',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#2563eb',
        background_color: '#fbfaf7',
        categories: ['productivity', 'business'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Custom SW (src/sw.ts) so we can add COOP/COEP headers on hosts that can't (GitHub Pages).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web', '@huggingface/transformers'] },
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
})
