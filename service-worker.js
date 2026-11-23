const CACHE_NAME = 'farn-v98';
const OFFLINE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './farn-db.js',
    './campos-pessoa-comuns.js',
    './foto3x4-editor.js',
    './cadastro-cursos-nucleo.js',
    './cadastro-cursos.js',
    './coordenacao.js',
    './apontamentos-adm.js',
    './estatistica.js',
    './portal-permissoes.js',
    './manifest.json',
    './logo-farn.png.png',
    './consultar-regularidade.html',
    './configurar-servidor.html',
    './portal-usuario.html',
    './portal-curso.html'
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
    /* A API do banco NAO pode ser servida do cache do service worker:
       o FarnDB ja mantem seus proprios dados offline e a fila de escrita.
       Antes so era ignorado o workers.dev; com o servidor proprio (tunel
       trycloudflare.com, ou qualquer outro dominio) as chamadas de API
       acabavam sendo cacheadas aqui, servindo dados velhos e ate quebrando
       telas. Por isso agora TODO request cross-origin passa direto. */
    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request).then(resp => {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            return resp;
        }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
});
