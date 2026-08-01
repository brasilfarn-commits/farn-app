/* SLIDE DE NOTICIAS - FARN
 * Carrossel de imagens compartilhado entre a tela inicial (landing) e os portais.
 * Le as imagens da colecao 'noticiasSlides' (doc por imagem, campo 'ordem') e
 * renderiza um slider que faz translacao para a esquerda automaticamente.
 *
 * Alvo: qualquer elemento com o atributo data-noticias-slider.
 * Opcional: data-noticias-slider-replace="#seletor" esconde o elemento apontado
 * quando ha slides e o exibe novamente quando nao ha (usado no lugar do quadro
 * da logo/nome da instituicao na tela inicial).
 */
(function() {
    if (window.__farnNoticiasSliderLoaded) return;
    window.__farnNoticiasSliderLoaded = true;

    var CSS = [
        '.farn-slider{position:relative;overflow:hidden;border-radius:16px;background:#0f172a;box-shadow:0 8px 24px rgba(0,0,0,.25);width:100%}',
        '.farn-slider-track{display:flex;transition:transform .55s ease;will-change:transform}',
        '.farn-slide{flex:0 0 100%;min-width:100%;height:var(--farn-slider-h,260px);position:relative;overflow:hidden}',
        '.farn-slide img{width:100%;height:100%;object-fit:cover;display:block}',
        '.farn-slide-titulo{position:absolute;left:0;right:0;bottom:0;padding:22px 16px 12px;color:#fff;font-size:14px;font-weight:700;background:linear-gradient(transparent,rgba(0,0,0,.75));text-align:left}',
        '.farn-slider-btn{position:absolute;top:50%;transform:translateY(-50%);z-index:5;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.25);color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:.2s}',
        '.farn-slider-btn:hover{background:rgba(255,255,255,.45)}',
        '.farn-slider-prev{left:10px}',
        '.farn-slider-next{right:10px}',
        '.farn-slider-dots{position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:5}',
        '.farn-slider-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.45);cursor:pointer;transition:.2s;border:none;padding:0}',
        '.farn-slider-dot.active{background:#fff;width:18px;border-radius:4px}'
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
            html += '<div class="farn-slide">' +
                (s.titulo ? '<div class="farn-slide-titulo">' + esc(s.titulo) + '</div>' : '') +
                '<img src="' + esc(s.imagem) + '" alt="' + (s.titulo ? esc(s.titulo) : 'Noticia') + '"></div>';
        });
        html += '</div>' +
            '<button type="button" class="farn-slider-btn farn-slider-prev" aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button>' +
            '<button type="button" class="farn-slider-btn farn-slider-next" aria-label="Proximo"><i class="fa-solid fa-chevron-right"></i></button>' +
            '<div class="farn-slider-dots">' + slides.map(function(_, i) {
                return '<button type="button" class="farn-slider-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"></button>';
            }).join('') + '</div></div>';
        container.innerHTML = html;

        var track = container.querySelector('.farn-slider-track');
        var dots = Array.prototype.slice.call(container.querySelectorAll('.farn-slider-dot'));
        var idx = 0;
        var timer = null;

        function go(n) {
            idx = (n + slides.length) % slides.length;
            track.style.transform = 'translateX(-' + (idx * 100) + '%)';
            dots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
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

        start();
    }

    function initTargets() {
        var targets = document.querySelectorAll('[data-noticias-slider]');
        if (!targets.length) return;
        loadSlides().then(function(slides) {
            targets.forEach(function(t) {
                var repl = t.getAttribute('data-noticias-slider-replace');
                if (repl) {
                    var ref = document.querySelector(repl);
                    if (ref) ref.style.display = slides.length ? 'none' : '';
                }
                if (t.hasAttribute('data-noticias-slider-empty') && t.parentElement) {
                    t.parentElement.style.display = slides.length ? '' : 'none';
                }
                t.style.display = slides.length ? '' : 'none';
                renderSlider(t, slides);
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
