const CACHE_NAME = 'farn-v9';
const OFFLINE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './logo-farn.png.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request).then(resp => {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            return resp;
        }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
});
