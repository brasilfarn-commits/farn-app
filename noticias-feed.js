/* NOTICIAS - FEED COMPARTILHADO - FARN
 * Le a colecao 'noticiasAlunos' e renderiza as postagens ativas nos portais.
 * Uso: FarnNoticias.render('id-do-container', 'aluno', { compact: true, max: 3 })
 * Portais: aluno | index | formado | cff | docente | coordenacao
 */
(function () {
    if (window.__farnNoticiasFeedLoaded) return;
    window.__farnNoticiasFeedLoaded = true;

    var CSS = [
        '.farn-news-list{display:flex;flex-direction:column;gap:14px}',
        '.farn-news-card{background:#fff;border:1px solid #eceaf6;border-radius:18px;overflow:hidden;box-shadow:0 8px 22px rgba(80,63,205,.06);cursor:pointer;transition:transform .2s,box-shadow .2s;font-family:inherit;text-align:left}',
        '.farn-news-card:hover{transform:translateY(-2px);box-shadow:0 16px 32px rgba(80,63,205,.13)}',
        '.farn-news-media{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#f1edff,#e9f8f4);display:flex;align-items:center;justify-content:center;overflow:hidden}',
        '.farn-news-media img,.farn-news-media video{width:100%;height:100%;object-fit:cover;display:block}',
        '.farn-news-media .farn-news-ico{font-size:30px;color:#a78bfa}',
        '.farn-news-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,20,43,.18)}',
        '.farn-news-play span{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.92);color:#7c5cff;display:flex;align-items:center;justify-content:center;font-size:15px;padding-left:3px;box-shadow:0 8px 20px rgba(20,20,43,.25)}',
        '.farn-news-body{padding:14px 16px 16px}',
        '.farn-news-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#5a3fe0;background:#f1edff;border-radius:999px;padding:3px 9px;margin-bottom:7px}',
        '.farn-news-title{font-size:15px;font-weight:700;color:#14142b;line-height:1.35;margin:0 0 5px}',
        '.farn-news-sub{font-size:12.5px;color:#77778f;line-height:1.55;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
        '.farn-news-date{font-size:11px;color:#a3a1bb;margin-top:9px;display:flex;align-items:center;gap:5px}',
        '.farn-news-empty{text-align:center;padding:30px 18px;color:#9b99b5;font-size:12.5px;line-height:1.5;border:1px dashed #e3ddf7;border-radius:16px;background:#fbfaff}',
        '.farn-news-empty i{display:block;font-size:26px;color:#c9bcff;margin-bottom:8px}',
        '.farn-news-loading{text-align:center;padding:26px 14px;color:#9b99b5;font-size:12.5px}',
        '.farn-news-list--compact{gap:10px}',
        '.farn-news-list--compact .farn-news-card{display:flex;border-radius:14px;align-items:stretch}',
        '.farn-news-list--compact .farn-news-media{width:104px;min-width:104px;aspect-ratio:auto}',
        '.farn-news-list--compact .farn-news-body{padding:10px 12px;min-width:0}',
        '.farn-news-list--compact .farn-news-title{font-size:13px;margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
        '.farn-news-list--compact .farn-news-sub{font-size:11.5px;-webkit-line-clamp:2}',
        '.farn-news-list--compact .farn-news-date{margin-top:6px;font-size:10px}',
        '.farn-news-list--compact .farn-news-badge{font-size:9px;padding:2px 7px;margin-bottom:4px}',
        '.farn-news-list--compact .farn-news-play span{width:32px;height:32px;font-size:11px}',
        '#farn-news-modal{position:fixed;inset:0;z-index:2147483002;background:rgba(20,10,50,.6);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;padding:24px 16px;overflow-y:auto}',
        '#farn-news-modal.open{display:flex}',
        '.farn-news-modal-card{background:#fff;width:100%;max-width:720px;border-radius:22px;box-shadow:0 30px 80px rgba(30,15,90,.35);overflow:hidden;margin:auto;position:relative;font-family:inherit}',
        '.farn-news-modal-close{position:absolute;top:12px;right:12px;z-index:3;width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.94);color:#52526b;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 6px 16px rgba(20,20,43,.2)}',
        '.farn-news-modal-close:hover{background:#f1edff;color:#5a3fe0}',
        '.farn-news-modal-media{background:#14142b;line-height:0}',
        '.farn-news-modal-media img,.farn-news-modal-media video{width:100%;max-height:430px;object-fit:contain;display:block;background:#14142b}',
        '.farn-news-modal-media iframe{width:100%;aspect-ratio:16/9;border:0;display:block}',
        '.farn-news-modal-body{padding:22px 24px 26px}',
        '.farn-news-modal-body h2{font-size:21px;font-weight:700;color:#14142b;line-height:1.3;margin:0 0 6px;font-family:inherit}',
        '.farn-news-modal-sub{font-size:13px;color:#77778f;margin:0 0 12px;line-height:1.5}',
        '.farn-news-modal-meta{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:14px}',
        '.farn-news-modal-text{font-size:13.5px;color:#3d3d57;line-height:1.75;white-space:pre-wrap;word-break:break-word}',
        '@media(max-width:560px){.farn-news-modal-body{padding:18px 18px 22px}.farn-news-modal-body h2{font-size:18px}}'
    ].join('');

    var styleEl = document.createElement('style');
    styleEl.id = 'farn-news-style';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    var PORTAL_LABELS = {
        aluno: 'Portal do Aluno',
        index: 'Notícias',
        formado: 'Portal do Formado',
        cff: 'Portal do CFF',
        docente: 'Portal do Docente',
        coordenacao: 'Portal da Coordenação'
    };

    var PORTAIS_VALIDOS = Object.keys(PORTAL_LABELS);
    var postsPorId = {};

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function fmtData(v) {
        if (!v) return '';
        var d = new Date(v);
        if (isNaN(d.getTime())) return '';
        try { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); }
        catch (e) { return d.toLocaleDateString('pt-BR'); }
    }

    function youtubeId(url) {
        if (!url) return '';
        var m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
        return m ? m[1] : '';
    }

    function ehImagem(url) {
        return /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i.test(url || '');
    }

    function ehVideo(url) {
        return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url || '');
    }

    function thumbDoPost(n) {
        if (n.imagem) return n.imagem;
        if (n.videoPoster) return n.videoPoster;
        var yt = youtubeId(n.link);
        if (yt) return 'https://img.youtube.com/vi/' + yt + '/hqdefault.jpg';
        if (!n.video && ehImagem(n.link)) return n.link;
        return '';
    }

    function mediaHtml(n) {
        var link = n.link || '';
        var yt = youtubeId(link);
        if (yt) {
            return '<iframe src="https://www.youtube.com/embed/' + yt + '" title="Vídeo" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe>';
        }
        if (n.video) {
            return '<video controls playsinline preload="metadata" ' + (n.videoPoster ? 'poster="' + esc(n.videoPoster) + '" ' : '') + 'src="' + esc(n.video) + '"></video>';
        }
        if (link && ehVideo(link)) {
            return '<video controls playsinline preload="metadata" src="' + esc(link) + '"></video>';
        }
        if (n.imagem) {
            return '<img src="' + esc(n.imagem) + '" alt="' + esc(n.titulo || 'Notícia') + '">';
        }
        if (link && ehImagem(link)) {
            return '<img src="' + esc(link) + '" alt="' + esc(n.titulo || 'Notícia') + '">';
        }
        return '';
    }

    function temVideo(n) {
        return !!(n.video || youtubeId(n.link) || ehVideo(n.link));
    }

    function cardHtml(n, compact) {
        var thumb = thumbDoPost(n);
        var midia = '';
        if (thumb) {
            midia += '<img src="' + esc(thumb) + '" alt="' + esc(n.titulo || 'Notícia') + '" loading="lazy">';
        } else {
            midia += '<i class="fa-solid ' + (temVideo(n) ? 'fa-video' : 'fa-newspaper') + ' farn-news-ico"></i>';
        }
        if (temVideo(n) && thumb) {
            midia += '<span class="farn-news-play"><span><i class="fa-solid fa-play"></i></span></span>';
        }
        var cat = n.categoria ? '<span class="farn-news-badge">' + esc(n.categoria) + '</span>' : '';
        var sub = n.subtitulo || (n.texto ? String(n.texto).replace(/\s+/g, ' ').slice(0, 160) : '');
        return '<article class="farn-news-card" data-farn-news="' + esc(n.id) + '" role="button" tabindex="0" aria-label="' + esc(n.titulo || 'Notícia') + '">' +
            '<div class="farn-news-media">' + midia + '</div>' +
            '<div class="farn-news-body">' + cat +
                '<h3 class="farn-news-title">' + esc(n.titulo || 'Sem título') + '</h3>' +
                (sub ? '<p class="farn-news-sub">' + esc(sub) + '</p>' : '') +
                '<div class="farn-news-date"><i class="fa-regular fa-calendar"></i> ' + esc(fmtData(n.data)) + '</div>' +
            '</div>' +
        '</article>';
    }

    function ensureModal() {
        var modal = document.getElementById('farn-news-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'farn-news-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = '<div class="farn-news-modal-card">' +
            '<button type="button" class="farn-news-modal-close" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>' +
            '<div id="farn-news-modal-conteudo"></div>' +
        '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal || ev.target.closest('.farn-news-modal-close')) close();
        });
        return modal;
    }

    function open(idOrPost) {
        var n = typeof idOrPost === 'string' ? postsPorId[idOrPost] : idOrPost;
        if (!n) return;
        var modal = ensureModal();
        var midia = mediaHtml(n);
        var cat = n.categoria ? '<span class="farn-news-badge">' + esc(n.categoria) + '</span>' : '';
        var portais = Array.isArray(n.portais) ? n.portais : ['aluno'];
        var destinos = portais.map(function (p) { return PORTAL_LABELS[p]; }).filter(Boolean);
        var html = (midia ? '<div class="farn-news-modal-media">' + midia + '</div>' : '') +
            '<div class="farn-news-modal-body">' +
                (cat ? '<div>' + cat + '</div>' : '') +
                '<h2>' + esc(n.titulo || 'Sem título') + '</h2>' +
                (n.subtitulo ? '<p class="farn-news-modal-sub">' + esc(n.subtitulo) + '</p>' : '') +
                '<div class="farn-news-modal-meta">' +
                    '<span class="blog-chip" style="font-size:10.5px;padding:3px 9px;border-radius:999px;background:#f5f4fb;color:#8b8ba7;font-weight:600"><i class="fa-regular fa-calendar"></i> ' + esc(fmtData(n.data)) + '</span>' +
                    (destinos.length ? '<span class="blog-chip" style="font-size:10.5px;padding:3px 9px;border-radius:999px;background:#f5f4fb;color:#8b8ba7;font-weight:600"><i class="fa-solid fa-share-nodes"></i> ' + esc(destinos.join(', ')) + '</span>' : '') +
                '</div>' +
                '<div class="farn-news-modal-text">' + esc(n.texto || '') + '</div>' +
            '</div>';
        document.getElementById('farn-news-modal-conteudo').innerHTML = html;
        modal.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        var closeBtn = modal.querySelector('.farn-news-modal-close');
        if (closeBtn) closeBtn.focus();
    }

    function close() {
        var modal = document.getElementById('farn-news-modal');
        if (modal) modal.classList.remove('open');
        document.documentElement.style.overflow = '';
    }

    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') close();
    });

    document.addEventListener('click', function (ev) {
        var card = ev.target.closest ? ev.target.closest('[data-farn-news]') : null;
        if (!card) return;
        var id = card.getAttribute('data-farn-news');
        if (id && postsPorId[id]) {
            ev.preventDefault();
            open(id);
        }
    });

    document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        var card = ev.target.closest ? ev.target.closest('[data-farn-news]') : null;
        if (!card) return;
        ev.preventDefault();
        var id = card.getAttribute('data-farn-news');
        if (id && postsPorId[id]) open(id);
    });

    function postAtivo(n) {
        return n.ativo !== false;
    }

    function postDoPortal(n, portal) {
        var lista = n.portais;
        if (Array.isArray(lista)) {
            return lista.indexOf(portal) !== -1;
        }
        if (lista && typeof lista === 'object') {
            return !!lista[portal];
        }
        return portal === 'aluno';
    }

    function render(containerId, portal, opts) {
        opts = opts || {};
        var el = document.getElementById(containerId);
        if (!el) return;
        if (typeof dbFirestore === 'undefined') {
            el.innerHTML = '<div class="farn-news-loading">Carregando notícias...</div>';
            var tentativas = 0;
            var timer = setInterval(function () {
                tentativas++;
                if (typeof dbFirestore !== 'undefined') { clearInterval(timer); render(containerId, portal, opts); }
                else if (tentativas > 40) {
                    clearInterval(timer);
                    el.innerHTML = '<div class="farn-news-empty"><i class="fa-solid fa-newspaper"></i>Não foi possível carregar as notícias.</div>';
                }
            }, 500);
            return;
        }
        if (el.__farnNewsUnsub) { el.__farnNewsUnsub(); el.__farnNewsUnsub = null; }
        el.innerHTML = '<div class="farn-news-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando notícias...</div>';
        el.__farnNewsUnsub = dbFirestore.collection('noticiasAlunos').onSnapshot(function (snap) {
            var posts = [];
            snap.forEach(function (d) {
                var n = d.data();
                n.id = d.id;
                if (!postAtivo(n)) return;
                if (!postDoPortal(n, portal)) return;
                posts.push(n);
            });
            posts.sort(function (a, b) {
                var oa = a.ordem || new Date(a.data || 0).getTime() || 0;
                var ob = b.ordem || new Date(b.data || 0).getTime() || 0;
                return ob - oa;
            });
            if (opts.max && posts.length > opts.max) posts = posts.slice(0, opts.max);
            posts.forEach(function (n) { postsPorId[n.id] = n; });
            if (!posts.length) {
                el.innerHTML = '<div class="farn-news-empty"><i class="fa-solid fa-newspaper"></i>' + esc(opts.emptyText || 'Nenhuma notícia publicada ainda.') + '</div>';
                return;
            }
            el.innerHTML = '<div class="farn-news-list' + (opts.compact ? ' farn-news-list--compact' : '') + '">' +
                posts.map(function (n) { return cardHtml(n, opts.compact); }).join('') +
                '</div>';
        }, function (err) {
            console.warn('FarnNoticias: erro ao carregar', err);
            el.innerHTML = '<div class="farn-news-empty"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar as notícias agora.</div>';
        });
    }

    window.FarnNoticias = {
        render: render,
        open: open,
        close: close,
        mediaHtml: mediaHtml,
        portalLabel: function (p) { return PORTAL_LABELS[p] || p; }
    };
})();
