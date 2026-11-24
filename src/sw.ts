/// <reference lib="webworker" />
/**
 * meetingCraft service worker.
 *  - Precaches the app shell (offline PWA).
 *  - Adds COOP/COEP headers to every same-origin response it serves. Static hosts such as
 *    GitHub Pages can't set headers, and without cross-origin isolation ONNX Runtime falls back
 *    to single-threaded WASM (local ASR ~3-4x slower). Same idea as coi-serviceworker.
 */
import { clientsClaim } from 'workbox-core'
import { addPlugins, cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }

function isolate(res: Response): Response {
  if (!res || res.status === 0 || res.type === 'opaque' || res.type === 'opaqueredirect') return res
  const h = new Headers(res.headers)
  h.set('Cross-Origin-Opener-Policy', 'same-origin')
  h.set('Cross-Origin-Embedder-Policy', 'credentialless')
  h.set('Cross-Origin-Resource-Policy', 'same-origin')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
}

addPlugins([{ handlerWillRespond: async ({ response }) => isolate(response) }])
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Same-origin files that were not precached (e.g. the large ORT .wasm emitted by transformers.js).
registerRoute(
  ({ url, request }) => url.origin === self.location.origin && request.mode !== 'navigate',
  new CacheFirst({
    cacheName: 'app-assets',
    plugins: [{ handlerWillRespond: async ({ response }) => isolate(response) }, new ExpirationPlugin({ maxEntries: 40 })],
  }),
)
registerRoute(/^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@/, new CacheFirst({ cacheName: 'ort-wasm', plugins: [new ExpirationPlugin({ maxEntries: 20 })] }))
registerRoute(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, new StaleWhileRevalidate({ cacheName: 'fonts' }))

self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })
clientsClaim()
