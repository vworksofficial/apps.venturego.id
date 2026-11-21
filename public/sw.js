// VentureGo VSV Service Worker
const CACHE_NAME = 'vsv-cache-v1'

const PRECACHE_ASSETS = [
  '/offline',
  '/favicon.svg',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/venturego-mark.svg',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key)
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Skip API routes, chrome extensions, and non-http(s) schemes
  if (url.pathname.startsWith('/api/') || !url.protocol.startsWith('http')) {
    return
  }

  // Handle navigation requests (pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        const cachedOffline = await cache.match('/offline')
        if (cachedOffline) {
          return cachedOffline
        }
        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })
      }),
    )
    return
  }

  // For static assets: Next.js static chunks, public icons, and images
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2|woff|ttf|webmanifest)$/))
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const responseToCache = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache))
            }
            return networkResponse
          })
          .catch(() => null)

        return cachedResponse || fetchPromise
      }),
    )
  }
})
