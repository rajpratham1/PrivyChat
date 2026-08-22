/* PrivyChat v2.4 — offline-first application shell.
 *
 * This worker only caches public application assets. Messages, identities,
 * ECDH keys, media chunks, and relay traffic are never written to Cache
 * Storage, IndexedDB, or any other persistent store.
 */
const CACHE_NAME = 'privychat-v2.4-offline';
const RUNTIME_CACHE = 'privychat-v2.4-runtime';

const CORE_ASSETS = [
    '/',
    '/index.html',
    '/nearby.html',
    '/about.html',
    '/manual.html',
    '/nearby.js',
    '/nearby.css',
    '/app.js',
    '/script.js',
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
    // Requested stable local aliases. They are populated when a deployment
    // provides vendored builds, while the CDN URLs below cover this repo.
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
        } catch (error) {
            // A first install may happen offline. Missing optional assets are
            // retried by stale-while-revalidate when connectivity returns.
        }
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

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await bestEffortPrecache(cache, CORE_ASSETS);
        await bestEffortPrecacheAliases(cache);
        await bestEffortPrecache(cache, OPTIONAL_REMOTE_ASSETS);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => ![CACHE_NAME, RUNTIME_CACHE].includes(key))
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

function isSocketOrSignalingRequest(request) {
    return request.url.includes('/socket.io/') ||
        request.headers.get('upgrade') === 'websocket';
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    } catch (error) {
        if (request.mode === 'navigate') {
            return (await caches.match('/nearby.html')) ||
                (await caches.match('/index.html')) ||
                new Response('PrivyChat is offline and the app shell is not cached yet.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
        }
        return new Response('', { status: 503, statusText: 'Offline asset unavailable' });
    }
}

async function cacheFirstAlias(request, remoteUrl) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const localResponse = await fetch(request);
        if (localResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, localResponse.clone()).catch(() => {});
            return localResponse;
        }
    } catch (error) {}

    try {
        const remoteResponse = await fetch(requestFor(remoteUrl));
        if (remoteResponse.ok || remoteResponse.type === 'opaque') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, remoteResponse.clone()).catch(() => {});
            return remoteResponse;
        }
    } catch (error) {}
    return new Response('', { status: 503, statusText: 'Offline library unavailable' });
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
    const localAlias = url.origin === self.location.origin &&
        REMOTE_ALIASES.find(alias => alias.local === url.pathname);
    if (localAlias) {
        event.respondWith(cacheFirstAlias(request, localAlias.remote));
        return;
    }
    const isRemoteLibrary = url.origin !== self.location.origin &&
        (url.hostname === 'unpkg.com' || url.hostname === 'cdnjs.cloudflare.com' ||
            url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdn.socket.io' ||
            url.hostname === 'fonts.googleapis.com' ||
            url.hostname === 'fonts.gstatic.com');

    event.respondWith(isRemoteLibrary ? staleWhileRevalidate(request) : cacheFirst(request));
});

self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
