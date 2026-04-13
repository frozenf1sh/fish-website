const CACHE_NAME = 'fish-media-cache-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

function isMediaRequest(request) {
  if (request.method !== 'GET') return false

  const destination = request.destination
  if (destination === 'image' || destination === 'video' || destination === 'audio') {
    return true
  }

  try {
    const url = new URL(request.url)
    return /\.(png|jpg|jpeg|gif|webp|avif|svg|mp4|webm|mp3|wav|ogg)$/i.test(url.pathname)
  } catch {
    return false
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (!isMediaRequest(request)) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    if (cached) {
      return cached
    }

    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  })())
})
