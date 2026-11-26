const CACHE_NAME = 'farn-v129';
const OFFLINE_URLS = [
    './',
    './index.html',
    './style.css',
    './tema-game.css',
    './app.js',
    './farn-db.js',
    './campos-pessoa-comuns.js',
    './foto3x4-editor.js',
    './foto3x4-visualizar.js',
    './cadastro-cursos-nucleo.js',
    './cadastro-cursos.js',
    './coordenacao.js',
    './apontamentos-adm.js',
    './estatistica.js',
    './portal-permissoes.js',
    './aluno-acesso.js',
    './formado-acesso.js',
    './noticias-feed.js',
    './certificados.js',
    './ficha-geral-compartilhar.js',
    './manifest.json',
    './logo-farn.png.png',
    './consultar-regularidade.html',
    './configurar-servidor.html',
    './portal-aluno.html',
    './portal-formado.html',
    './portal-formado.js',
    './portal-docente.html',
    './portal-docente.js',
    './portal-coordenacao.html',
    './portal-coordenacao.js',
    './portal-curso.html',
    './portal-curso.js'
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
        }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(cached => {
            if (cached) return cached;
            /* Nunca devolver HTML para um .js/.css: o navegador executaria
               o HTML como script e funcoes como landingLogin ficariam
               "indefinidas". So navegacoes podem cair no index.html. */
            if (e.request.mode === 'navigate') return caches.match('./index.html');
            const tipo = e.request.destination === 'script' ? 'application/javascript'
                : e.request.destination === 'style' ? 'text/css' : 'text/plain';
            return new Response('', { status: 503, headers: { 'Content-Type': tipo } });
        }))
    );
});
