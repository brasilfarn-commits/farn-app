/* SLIDE DE NOTICIAS - FARN
 * Carrossel de imagens compartilhado entre a tela inicial (landing) e os portais.
 * Le as imagens da colecao 'noticiasSlides' (doc por imagem, campo 'ordem') e
 * renderiza um slider que faz translacao para a esquerda automaticamente.
 *
 * Alvo: qualquer elemento com o atributo data-noticias-slider.
 * Opcional: data-noticias-coluna="esquerda|meio|direita" filtra os slides por coluna.
 * data-noticias-slider-empty esconde o elemento pai quando nao ha slides.
 */
(function() {
    if (window.__farnNoticiasSliderLoaded) return;
    window.__farnNoticiasSliderLoaded = true;

    var CSS = [
        '.farn-slider{position:relative;overflow:hidden;border-radius:16px;background:#0f172a;box-shadow:0 8px 24px rgba(0,0,0,.25);width:100%}',
        '.farn-slider-track{display:flex;transition:transform .55s ease;will-change:transform}',
        '.farn-slide{flex:0 0 100%;min-width:100%;height:var(--farn-slider-h,260px);position:relative;overflow:hidden}',
        '.farn-slide img{width:100%;height:100%;object-fit:contain;display:block}',
        '.farn-slide-video{width:100%;height:100%;object-fit:contain;display:block;background:#000}',
        '.farn-slide-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;width:58px;height:58px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:.2s;padding-left:4px}',
        '.farn-slide-play:hover{background:rgba(220,38,38,.8)}',
        '.farn-slide-caption{background:#0b1220;border-top:1px solid rgba(255,255,255,.08);padding:12px 14px;text-align:left;border-radius:0 0 16px 16px}',
        '.farn-slide-titulo{color:#fff;font-size:14px;font-weight:700;line-height:1.3}',
        '.farn-slide-texto{color:#e2e8f0;font-size:12px;line-height:1.45;margin-top:4px}',
        '.farn-slider-btn{position:absolute;top:50%;transform:translateY(-50%);z-index:5;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.25);color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:.2s}',
        '.farn-slider-btn:hover{background:rgba(255,255,255,.45)}',
        '.farn-slider-prev{left:10px}',
        '.farn-slider-next{right:10px}',
        '.farn-slider-dots{position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:5}',
        '.farn-slider-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.45);cursor:pointer;transition:.2s;border:none;padding:0}',
        '.farn-slider-dot.active{background:#fff;width:18px;border-radius:4px}',
        '.farn-slider-empty{display:flex;align-items:center;justify-content:center;gap:8px;color:#94a3b8;font-size:13px;border:1px dashed rgba(255,255,255,.2);border-radius:16px;background:#1e293b;height:var(--farn-slider-h,260px)}'
    ].join('');

    var styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    var COL = 'noticiasSlides';
    var slidesCache = null;

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function loadSlides() {
        return new Promise(function(resolve) {
            if (slidesCache) { resolve(slidesCache); return; }
            if (typeof dbFirestore === 'undefined') { resolve([]); return; }
            dbFirestore.collection(COL).orderBy('ordem', 'asc').get().then(function(snap) {
                var arr = [];
                snap.forEach(function(d) {
                    var data = d.data();
                    data.id = d.id;
                    arr.push(data);
                });
                slidesCache = arr;
                resolve(arr);
            }).catch(function() { resolve([]); });
        });
    }

    function renderSlider(container, slides) {
        container.innerHTML = '';
        if (!slides || !slides.length) return;
        var html = '<div class="farn-slider"><div class="farn-slider-track">';
        slides.forEach(function(s, i) {
            var media = s.videoUrl
                ? '<video class="farn-slide-video" src="' + esc(s.videoUrl) + '" poster="' + esc(s.imagem || '') + '" preload="metadata" muted playsinline></video>' +
                  '<button type="button" class="farn-slide-play" aria-label="Reproduzir"><i class="fa-solid fa-play"></i></button>'
                : '<img src="' + esc(s.imagem) + '" alt="' + ((s.titulo || s.texto) ? esc(s.titulo || s.texto) : 'Noticia') + '">';
            html += '<div class="farn-slide">' + media + '</div>';
        });
        html += '</div>' +
            '<button type="button" class="farn-slider-btn farn-slider-prev" aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button>' +
            '<button type="button" class="farn-slider-btn farn-slider-next" aria-label="Proximo"><i class="fa-solid fa-chevron-right"></i></button>' +
            '<div class="farn-slider-dots">' + slides.map(function(_, i) {
                return '<button type="button" class="farn-slider-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"></button>';
            }).join('') + '</div></div>';
        html += '<div class="farn-slider-caption"></div>';
        container.innerHTML = html;

        var track = container.querySelector('.farn-slider-track');
        var dots = Array.prototype.slice.call(container.querySelectorAll('.farn-slider-dot'));
        var idx = 0;
        var timer = null;

        function updateCaption() {
            var box = container.querySelector('.farn-slider-caption');
            if (!box) return;
            var s = slides[idx];
            var cap = '';
            if (s.titulo) cap += '<div class="farn-slide-titulo">' + esc(s.titulo) + '</div>';
            if (s.texto) cap += '<div class="farn-slide-texto">' + esc(s.texto) + '</div>';
            box.style.display = cap ? '' : 'none';
            box.innerHTML = cap;
        }

        function go(n) {
            idx = (n + slides.length) % slides.length;
            track.style.transform = 'translateX(-' + (idx * 100) + '%)';
            dots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
            updateCaption();
        }

        function start() {
            if (slides.length < 2) return;
            stop();
            timer = setInterval(function() { go(idx + 1); }, 4000);
        }

        function stop() {
            if (timer) { clearInterval(timer); timer = null; }
        }

        var prevBtn = container.querySelector('.farn-slider-prev');
        var nextBtn = container.querySelector('.farn-slider-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { go(idx - 1); start(); });
        if (nextBtn) nextBtn.addEventListener('click', function() { go(idx + 1); start(); });
        dots.forEach(function(d) {
            d.addEventListener('click', function() { go(parseInt(d.getAttribute('data-i'), 10)); start(); });
        });
        container.addEventListener('mouseenter', stop);
        container.addEventListener('mouseleave', start);

        var videos = container.querySelectorAll('.farn-slide-video');
        Array.prototype.forEach.call(videos, function(v, i) {
            var playBtn = container.querySelectorAll('.farn-slide-play')[i];
            function toggle() {
                if (v.paused) {
                    stop();
                    v.play();
                    if (playBtn) playBtn.style.display = 'none';
                } else {
                    v.pause();
                    if (playBtn) playBtn.style.display = '';
                    start();
                }
            }
            if (playBtn) playBtn.addEventListener('click', function(e) { e.stopPropagation(); toggle(); });
            v.addEventListener('click', toggle);
            v.addEventListener('ended', function() {
                if (playBtn) playBtn.style.display = '';
                start();
            });
        });

        updateCaption();
        start();
    }

    function renderPlaceholder(container) {
        container.innerHTML = '';
        container.style.display = '';
        var d = document.createElement('div');
        d.className = 'farn-slider farn-slider-empty';
        d.innerHTML = '<i class="fa-solid fa-newspaper"></i><span>Sem notícias nesta coluna</span>';
        container.appendChild(d);
    }

    function initTargets() {
        var targets = document.querySelectorAll('[data-noticias-slider]');
        if (!targets.length) return;
        loadSlides().then(function(slides) {
            targets.forEach(function(t) {
                var coluna = t.getAttribute('data-noticias-coluna');
                var sl = coluna ? slides.filter(function(s) { return s.coluna === coluna; }) : slides;
                var repl = t.getAttribute('data-noticias-slider-replace');
                if (repl) {
                    var ref = document.querySelector(repl);
                    if (ref) ref.style.display = sl.length ? 'none' : '';
                }
                if (t.hasAttribute('data-noticias-slider-empty') && t.parentElement) {
                    t.parentElement.style.display = sl.length ? '' : 'none';
                }
                if (t.hasAttribute('data-noticias-slider-fix')) {
                    if (sl.length) { t.style.display = ''; renderSlider(t, sl); }
                    else renderPlaceholder(t);
                    return;
                }
                t.style.display = sl.length ? '' : 'none';
                renderSlider(t, sl);
            });
        });
    }

    function waitDb(retries) {
        if (typeof dbFirestore !== 'undefined') { initTargets(); return; }
        if (!retries) return;
        setTimeout(function() { waitDb(retries - 1); }, 500);
    }

    window.noticiasSliderRender = renderSlider;
    window.noticiasSliderRefresh = function() {
        slidesCache = null;
        initTargets();
    };

    waitDb(40);
})();
