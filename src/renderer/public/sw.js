/* Service worker: precache the app shell, then cache-first for same-origin GETs. */
const CACHE = 'yacv-cache-v1'
// Resolve against this file's own URL so it works at any host path (/, /repo/, ...).
const BASE = new URL('.', self.location).href
const PRECACHE = [BASE, `${BASE}manifest.webmanifest`, `${BASE}icon-192.png`, `${BASE}icon-512.png`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch(BASE)
      .then((res) => res.text())
      .then((html) => {
        // Precache the fixed files plus every asset index.html references
        // (hashed names change per build, so parse them at install time).
        // A Set dedupes URLs that appear in both lists — cache.addAll()
        // rejects duplicate requests.
        const fresh = new Set(PRECACHE)
        for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          try {
            fresh.add(new URL(m[1], BASE).href)
          } catch {
            /* ignore malformed references */
          }
        }
        return caches.open(CACHE).then(async (cache) => {
          await cache.addAll([...fresh])
          // Drop stale entries left over from previous builds.
          const keys = await cache.keys()
          await Promise.all(keys.filter((r) => !fresh.has(r.url)).map((r) => cache.delete(r)))
        })
      })
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    caches.match(request).then((cached) => {
      // Cache-first: serve the cache hit immediately while refreshing it in the background.
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
