const CACHE_NAME = 'farn-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './logo-farn.png.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(k => caches.delete(k))
        )).then(() => caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).then(res => {
            if (res && res.status === 200) {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            }
            return res;
        }).catch(() => caches.match(e.request))
    );
});
