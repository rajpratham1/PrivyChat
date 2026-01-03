const CACHE_NAME = 'privychat-v4-static';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/crypto-utils.js',
    '/sound-utils.js',
    '/logo.png',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate Event (Cleanup Old Caches)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event (Network First, fallback to Cache)
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests (e.g., socket.io polling POSTs)
    if (event.request.method !== 'GET') return;

    // Skip socket.io requests entirely from handling
    if (event.request.url.includes('/socket.io/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If network works, return response
                return response;
            })
            .catch(() => {
                // If offline, return from cache
                return caches.match(event.request);
            })
    );
});
