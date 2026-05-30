// PrimeHub-Portal — minimaler Service Worker für Installierbarkeit + App-Shell-Cache.
// Bewusst klein gehalten; HTML-Routen werden network-first geliefert, damit
// Updates am Portal sofort sichtbar sind.

const CACHE_NAME = 'primehub-portal-v1'

const STATIC_ASSETS = [
  '/icons/app-icon.svg',
  '/icons/app-icon-maskable.svg',
  '/icons/wordmark.svg',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // API-Requests: kein Cache, immer frisch
  if (url.pathname.startsWith('/api/')) return

  // Statische Assets: Cache-first
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        return (
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone()
              caches.open(CACHE_NAME).then((c) => c.put(req, clone))
            }
            return res
          })
        )
      })
    )
    return
  }

  // Portal-Routen: network-first mit Cache-Fallback (für Offline-Installierbarkeit)
  if (url.pathname.startsWith('/portal')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/portal')))
    )
  }
})
