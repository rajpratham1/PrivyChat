/* PrivyChat v2.5.1 — Live Update & Offline Mesh Service Worker
 *
 * Strategy:
 * - Network-First for HTML/JS/CSS (always serves latest website when online, falls back to cache offline).
 * - Stale-While-Revalidate for remote CDNs/fonts.
 * - Instant activation via skipWaiting() and clients.claim() to prevent stale device caches.
 */
const CACHE_NAME = 'privychat-v2.5.1-live';
const RUNTIME_CACHE = 'privychat-v2.5.1-runtime';

const CORE_ASSETS = [
    '/',
    '/index.html',
    '/nearby.html',
    '/about.html',
    '/manual.html',
    '/nearby.js',
    '/nearby.css',
    '/app.js',
    '/style.css',
    '/crypto-utils.js',
    '/sound-utils.js',
    '/steg-utils.js',
    '/manifest.json',
    '/service-worker.js',
    '/sw.js',
    '/icon-mask.svg',
    '/logo.png',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/socket.io/socket.io.js',
    '/cdn/lucide.min.js',
    '/cdn/qrcode.min.js',
    '/cdn/jsQR.min.js',
    '/cdn/socket.io.min.js'
];

const OPTIONAL_REMOTE_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Courier+Prime:wght@400;700&display=swap'
];

const REMOTE_ALIASES = [
    { local: '/cdn/lucide.min.js', remote: 'https://unpkg.com/lucide@latest' },
    { local: '/cdn/qrcode.min.js', remote: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js' },
    { local: '/cdn/jsQR.min.js', remote: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js' },
    { local: '/cdn/socket.io.min.js', remote: 'https://cdn.socket.io/4.8.3/socket.io.min.js' }
];

function requestFor(url) {
    return new Request(url, url.startsWith('http') ? { mode: 'no-cors' } : { cache: 'reload' });
}

async function bestEffortPrecache(cache, urls) {
    await Promise.all(urls.map(async url => {
        try {
            const response = await fetch(requestFor(url));
            if (response.ok || response.type === 'opaque') await cache.put(url, response);
        } catch (error) {}
    }));
}

async function bestEffortPrecacheAliases(cache) {
    await Promise.all(REMOTE_ALIASES.map(async ({ local, remote }) => {
        try {
            const response = await fetch(requestFor(remote));
            if (response.ok || response.type === 'opaque') await cache.put(local, response.clone());
        } catch (error) {}
    }));
}

// 1. Install Event: Precache and immediately take over without waiting
self.addEventListener('install', event => {
    self.skipWaiting(); // Force active immediately
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await bestEffortPrecache(cache, CORE_ASSETS);
        await bestEffortPrecacheAliases(cache);
        await bestEffortPrecache(cache, OPTIONAL_REMOTE_ASSETS);
    })());
});

// 2. Activate Event: Obliterate ALL old caches from previous versions
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map(key => {
                console.log('[SW] Purging old cache:', key);
                return caches.delete(key);
            }));
        await self.clients.claim(); // Take control of all clients immediately
    })());
});

function isSocketOrSignalingRequest(request) {
    return request.url.includes('/socket.io/') ||
        request.url.includes('/download') ||
        request.url.endsWith('.apk') ||
        request.headers.get('upgrade') === 'websocket';
}

// Network-First Strategy for Local Application Code
// Always fetches fresh updates from server when online; falls back to cache when offline
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    } catch (error) {
        // Offline Fallback
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
            return (await caches.match('/nearby.html')) ||
                (await caches.match('/index.html')) ||
                new Response('PrivyChat is offline.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
        }
        return new Response('', { status: 503, statusText: 'Offline asset unavailable' });
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);
    const refresh = fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') {
            return caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, response.clone());
                return response;
            });
        }
        return response;
    }).catch(() => cached || new Response('', { status: 503, statusText: 'Offline asset unavailable' }));
    return cached || refresh;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || isSocketOrSignalingRequest(request)) return;

    const url = new URL(request.url);
    const isRemoteLibrary = url.origin !== self.location.origin &&
        (url.hostname === 'unpkg.com' || url.hostname === 'cdnjs.cloudflare.com' ||
            url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdn.socket.io' ||
            url.hostname === 'fonts.googleapis.com' ||
            url.hostname === 'fonts.gstatic.com');

    event.respondWith(isRemoteLibrary ? staleWhileRevalidate(request) : networkFirst(request));
});

self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
