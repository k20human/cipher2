// CACHE_VERSION names the offline copy and nothing more. It no longer gates
// whether an update is visible — the fetch handler below goes to the network
// first, so the server's files always win while it is running. Bump it only to
// discard an offline copy on purpose; the old cache is dropped on activate.
const CACHE_VERSION = 'cipher2-v56'

const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/src/main.js',
  '/src/core/build.js',
  '/src/core/schema.js',
  '/src/core/store.js',
  '/src/core/theme.js',
  '/src/core/registry.js',
  '/src/core/journal.js',
  '/src/core/telemetry.js',
  '/src/core/effects.js',
  '/src/core/fullscreen.js',
  '/src/ambient/engine.js',
  '/src/ambient/rain.js',
  '/src/modules/cipher.js',
  '/src/modules/clock.js',
  '/src/modules/status.js',
  '/src/modules/shortcuts.js',
  '/src/modules/logo.js',
  '/src/settings/panel.js',
  '/src/settings/core-settings.js',
  '/src/settings/transfer.js',
  '/src/styles/theme.css',
  '/src/styles/base.css',
  '/src/styles/layout.css',
  '/src/styles/panel.css',
  '/src/styles/logo.css',
  '/src/styles/avatars.css',
  '/src/styles/effects.css',
  '/src/ai/registry.js',
  '/src/ai/avatars/core.js',
  '/src/ai/avatars/halo.js',
  '/src/ai/avatars/wave.js',
  '/src/ai/avatars/iris.js',
  '/src/ai/avatars/lattice.js',
  '/src/ai/avatars/shared.js',
  '/src/ai/avatars/nexus.js',
  '/src/ai/avatars/vortex.js',
  '/src/ai/avatars/cipher-core.js',
  '/src/ai/avatars/halo-live.js',
  '/src/ai/avatars/wave-live.js',
  '/src/ai/avatars/lattice-live.js',
  '/src/ai/avatars/nexus-pulse.js',
]

// cache: 'reload' on every precache request, rather than a bare addAll(ASSETS):
// addAll fetches through the browser's own HTTP cache, so a file the browser
// still considers fresh is copied into the new cache unchanged. The result was
// a cache correctly named for the new version and holding the previous
// version's files — a bumped CACHE_VERSION that published nothing, which is
// the one thing this whole mechanism exists to do. serve.py now sends
// no-cache on every asset, which fixes it from the other side; this fixes it
// here, where it cannot depend on what a server happens to send.
const precacheRequests = () => ASSETS.map((url) => new Request(url, { cache: 'reload' }))

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(precacheRequests()))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

// NETWORK FIRST, falling back to the cache. This used to be the reverse, and
// cache-first was simply the wrong policy for this app: the server it talks to
// runs on the same device, at 127.0.0.1, over the loopback interface. There is
// no latency to save and no bandwidth to spare, so preferring the cache bought
// nothing at all — while costing the one thing that matters, which is that the
// files on disk are the files you see. Every code change needed a
// CACHE_VERSION bump plus a second load to appear, and getting either wrong
// produced a page mixing new files with old ones.
//
// Going to the network first inverts that: whatever the server has is what
// runs, always, and the cache is consulted only when there is no server to
// ask. That is the case it was added for — the deck opening before Termux is
// started — and the only one it is now used in.
//
// The cache is refreshed from each successful response, so the offline copy
// tracks the running version instead of whichever one was current at install.
// Only 200s are stored: caching a 404 or a 500 would serve that error back
// forever, which is worse than having nothing.
const isApi = (url) => new URL(url).pathname.startsWith('/api/')

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // /api/status is a live reading of the device. A stale one served from the
  // cache while offline would not be a degraded answer, it would be a wrong
  // one — and status.js already has a degraded mode of its own, built to
  // handle exactly the failure this would hide from it.
  if (isApi(event.request.url)) return

  // Every navigation resolves to the one document this app has, whatever URL
  // it was opened by. ASSETS holds '/index.html' — the manifest's start_url —
  // but the bare origin is a different cache key, so http://host:port/ would
  // otherwise miss the cache entirely and show nothing at all with the server
  // down.
  const cacheKey = event.request.mode === 'navigate'
    ? new Request('/index.html')
    : event.request

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(cacheKey, copy)))
        }
        return response
      })
      // No server. This is the whole reason the cache exists.
      .catch(() => caches.match(cacheKey).then((hit) => hit ?? Response.error())),
  )
})
