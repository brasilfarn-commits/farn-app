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
        '.farn-news-date{font-size:11px;color:#a3a1bb;margin-top:9px;display:flex;align-items:center;justify-content:space-between;gap:5px;width:100%;flex-wrap:wrap;row-gap:2px}',
        '.farn-news-comment-cta{color:#7c5cff;font-weight:600;display:inline-flex;align-items:center;gap:4px}',
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
        '.farn-news-comments{margin-top:20px;border-top:1px solid #eceaf6;padding-top:16px}',
        '.farn-news-comments-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:700;color:#3d3d57;margin-bottom:11px}',
        '.farn-news-comments-head b{color:#7c5cff}',
        '.farn-news-comments-list{display:flex;flex-direction:column;gap:12px;max-height:300px;overflow-y:auto;padding-right:4px;scrollbar-width:thin}',
        '.farn-news-comment{display:flex;gap:9px;align-items:flex-start}',
        '.farn-news-comment-avatar{width:30px;height:30px;border-radius:50%;background:#f1edff;color:#5a3fe0;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 30px;letter-spacing:.2px}',
        '.farn-news-comment-main{flex:1;min-width:0}',
        '.farn-news-comment-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:20px}',
        '.farn-news-comment-top b{font-size:12px;color:#14142b;line-height:1.35}',
        '.farn-news-comment-date{font-size:10px;color:#a3a1bb}',
        '.farn-news-comment-actions{margin-left:auto;display:flex;align-items:center;gap:1px}',
        '.farn-news-comment-actions button{border:0;background:transparent;color:#b3b1c8;cursor:pointer;font-size:11px;padding:4px 5px;border-radius:7px;line-height:1;transition:background .15s,color .15s}',
        '.farn-news-comment-actions button:hover{background:#f1edff;color:#5a3fe0}',
        '.farn-news-comment-actions button[data-farn-comment-del]:hover{background:#fff0f5;color:#e11d48}',
        '.farn-news-comment-text{font-size:12.5px;color:#52526b;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-top:3px}',
        '.farn-news-comments-empty{font-size:12px;color:#a3a1bb;padding:6px 0 4px;line-height:1.5}',
        '.farn-news-comment-form{margin-top:14px;border-top:1px dashed #eceaf6;padding-top:13px}',
        '.farn-news-commenting-as{font-size:11.5px;color:#8b8ba7;margin-bottom:7px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}',
        '.farn-news-commenting-as b{color:#5a3fe0;font-weight:700}',
        '.farn-news-commenting-as i{color:#37d0b0;font-size:11px}',
        '.farn-news-comment-name-input{width:100%;border:1px solid #e3ddf7;border-radius:10px;padding:9px 11px;font:inherit;font-size:12.5px;color:#14142b;background:#fbfaff;margin-bottom:7px;outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}',
        '.farn-news-comment-name-input::placeholder{color:#b3b1c8}',
        '.farn-news-comment-name-input:focus{border-color:#a78bfa;box-shadow:0 0 0 3px rgba(124,92,255,.12)}',
        '.farn-news-comment-textarea{width:100%;border:1px solid #e3ddf7;border-radius:12px;padding:10px 12px;font:inherit;font-size:12.5px;color:#14142b;background:#fbfaff;resize:vertical;min-height:46px;max-height:140px;outline:none;box-sizing:border-box;line-height:1.5;transition:border-color .15s,box-shadow .15s}',
        '.farn-news-comment-textarea::placeholder{color:#b3b1c8}',
        '.farn-news-comment-textarea:focus{border-color:#a78bfa;box-shadow:0 0 0 3px rgba(124,92,255,.12)}',
        '.farn-news-comment-form-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;flex-wrap:wrap}',
        '.farn-news-comment-hint{font-size:10.5px;color:#a3a1bb;line-height:1.4}',
        '.farn-news-comment-send{border:0;border-radius:999px;background:#7c5cff;color:#fff;font:inherit;font-size:11.5px;font-weight:700;padding:9px 16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 6px 16px rgba(124,92,255,.24);transition:background .15s,transform .1s}',
        '.farn-news-comment-send:hover{background:#5a3fe0}',
        '.farn-news-comment-send:active{transform:scale(.97)}',
        '.farn-news-comment-send:disabled{opacity:.6;cursor:default;transform:none}',
        '.farn-news-comment-error{font-size:11px;color:#dc2626;margin-top:6px;display:none;line-height:1.45}',
        '@media(max-width:560px){.farn-news-modal-body{padding:18px 18px 22px}.farn-news-modal-body h2{font-size:18px}.farn-news-comments-list{max-height:none}.farn-news-comment-send{width:100%}}'
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

    var postAtual = null;
    var commentsUnsub = null;
    var comentarios = [];
    var enviando = false;
    var anonMemo = null;

    function digits(v) {
        return String(v == null ? '' : v).replace(/\D/g, '');
    }

    function fmtDataHora(v) {
        if (!v) return '';
        if (v && typeof v.toDate === 'function') v = v.toDate();
        var d = new Date(v);
        if (isNaN(d.getTime())) return '';
        try {
            return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return d.toLocaleString('pt-BR'); }
    }

    function iniciaisDe(nome) {
        var parts = String(nome || '?').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        return ((parts[0].charAt(0) || '?') + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
    }

    function anonId() {
        if (anonMemo) return anonMemo;
        try {
            var k = 'farn_news_anon_id';
            var v = localStorage.getItem(k);
            if (!v) {
                v = 'anon:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
                localStorage.setItem(k, v);
            }
            anonMemo = v;
        } catch (e) {
            anonMemo = 'anon:temp';
        }
        return anonMemo;
    }

    function normalizarUsuario(o) {
        if (!o || typeof o !== 'object') return null;
        var nome = String(o.nome || o.name || o.nomeCompleto || '').trim();
        var cpf = digits(o.cpf || o.CPF || '');
        if (!nome && !cpf) return null;
        var permissoes = Array.isArray(o.permissoes) ? o.permissoes : [];
        return {
            nome: nome || 'Usuário cadastrado',
            cpf: cpf,
            admin: permissoes.indexOf('admin') !== -1,
            autorId: cpf ? ('cpf:' + cpf) : ('usuario:' + (nome || 'sem-nome'))
        };
    }

    function usuarioAtual() {
        var fontes = [];
        try { if (window.paUser) fontes.push(window.paUser); } catch (e) {}
        try { if (window.pfUser) fontes.push(window.pfUser); } catch (e) {}
        try { if (window.pcUser) fontes.push(window.pcUser); } catch (e) {}
        try { if (window.cffUser) fontes.push(window.cffUser); } catch (e) {}
        try { var pd = JSON.parse(sessionStorage.getItem('pd_sessao') || 'null'); if (pd) fontes.push(pd); } catch (e) {}
        try { var cff = JSON.parse(sessionStorage.getItem('cff_sessao') || 'null'); if (cff) fontes.push(cff); } catch (e) {}
        try { var adm = JSON.parse(localStorage.getItem('farn_user_data') || 'null'); if (adm) fontes.push(adm); } catch (e) {}
        for (var i = 0; i < fontes.length; i++) {
            var u = normalizarUsuario(fontes[i]);
            if (u) return u;
        }
        return null;
    }

    function podeGerenciar(c) {
        if (!c) return false;
        var u = usuarioAtual();
        var anon = null;
        try { anon = localStorage.getItem('farn_news_anon_id'); } catch (e) {}
        if (anon && c.autorId && c.autorId === anon) return true;
        if (!u) return false;
        if (c.autorId && c.autorId === u.autorId) return true;
        if (u.cpf && digits(c.cpf) === u.cpf) return true;
        return !!u.admin;
    }

    function comentarioPorId(id) {
        for (var i = 0; i < comentarios.length; i++) {
            if (comentarios[i].id === id) return comentarios[i];
        }
        return null;
    }

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
                '<div class="farn-news-date"><span><i class="fa-regular fa-calendar"></i> ' + esc(fmtData(n.data)) + '</span><span class="farn-news-comment-cta" data-farn-comment-cta="1"><i class="fa-regular fa-comment"></i> Comentar</span></div>' +
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

    function open(idOrPost, opts) {
        opts = opts || {};
        var n = typeof idOrPost === 'string' ? postsPorId[idOrPost] : idOrPost;
        if (!n) return;
        pararComentarios();
        postAtual = n;
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
                '<div class="farn-news-comments" id="farn-news-comments">' +
                    '<div class="farn-news-comments-head"><span><i class="fa-regular fa-comment" style="color:#7c5cff;margin-right:4px"></i> Comentários (<b id="farn-news-comments-count">0</b>)</span></div>' +
                    '<div class="farn-news-comments-list" id="farn-news-comments-list"><div class="farn-news-comments-empty">Carregando comentários...</div></div>' +
                    '<div id="farn-news-comments-form"></div>' +
                '</div>' +
            '</div>';
        document.getElementById('farn-news-modal-conteudo').innerHTML = html;
        modal.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        renderComposer();
        carregarComentarios(n.id);
        var closeBtn = modal.querySelector('.farn-news-modal-close');
        if (closeBtn) closeBtn.focus();
        if (opts.focusComments) {
            setTimeout(function() {
                if (!postAtual || postAtual.id !== n.id) return;
                var box = document.getElementById('farn-news-comments');
                if (box) {
                    try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                    catch (e) { box.scrollIntoView(); }
                }
                var nomeEl = document.getElementById('farn-news-comm-nome');
                var txtEl = document.getElementById('farn-news-comm-texto');
                if (nomeEl && !nomeEl.value) { try { nomeEl.focus({ preventScroll: true }); } catch (e) { nomeEl.focus(); } }
                else if (txtEl) { try { txtEl.focus({ preventScroll: true }); } catch (e) { txtEl.focus(); } }
            }, 260);
        }
    }

    function close() {
        var modal = document.getElementById('farn-news-modal');
        if (modal) modal.classList.remove('open');
        document.documentElement.style.overflow = '';
        pararComentarios();
    }

    function pararComentarios() {
        if (commentsUnsub) {
            try { commentsUnsub(); } catch (e) {}
            commentsUnsub = null;
        }
        comentarios = [];
        postAtual = null;
        enviando = false;
    }

    function renderComposer() {
        var box = document.getElementById('farn-news-comments-form');
        if (!box) return;
        var u = usuarioAtual();
        var nomeSalvo = '';
        try { nomeSalvo = localStorage.getItem('farn_news_anon_nome') || ''; } catch (e) {}
        var topo = u ?
            '<div class="farn-news-commenting-as"><i class="fa-solid fa-circle-check"></i> Comentando como <b>' + esc(u.nome) + '</b></div>' :
            '<div class="farn-news-commenting-as">Comentando como visitante</div>' +
            '<input type="text" id="farn-news-comm-nome" class="farn-news-comment-name-input" maxlength="60" placeholder="Seu nome" value="' + esc(nomeSalvo) + '" autocomplete="name">';
        box.innerHTML = '<div class="farn-news-comment-form">' + topo +
            '<textarea id="farn-news-comm-texto" class="farn-news-comment-textarea" maxlength="1200" rows="2" placeholder="Escreva seu comentário..."></textarea>' +
            '<div class="farn-news-comment-form-foot">' +
                '<span class="farn-news-comment-hint">' + (u ? 'Seu comentário será público.' : 'Informe seu nome para publicar.') + '</span>' +
                '<button type="button" id="farn-news-comm-enviar" class="farn-news-comment-send"><i class="fa-solid fa-paper-plane"></i> Publicar</button>' +
            '</div>' +
            '<div class="farn-news-comment-error" id="farn-news-comm-erro"></div>' +
        '</div>';
        var btn = document.getElementById('farn-news-comm-enviar');
        if (btn) btn.addEventListener('click', enviarComentario);
        var txt = document.getElementById('farn-news-comm-texto');
        if (txt) {
            txt.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault();
                    enviarComentario();
                }
            });
        }
    }

    function carregarComentarios(id) {
        var list = document.getElementById('farn-news-comments-list');
        if (typeof dbFirestore === 'undefined') {
            if (list) list.innerHTML = '<div class="farn-news-comments-empty">Não foi possível carregar os comentários agora.</div>';
            return;
        }
        var base = dbFirestore.collection('noticiasAlunos').doc(id).collection('comentarios');
        var aplicar = function (snap) {
            if (!postAtual || postAtual.id !== id) return;
            comentarios = snap.docs.map(function (d) {
                var x = d.data();
                x.id = d.id;
                return x;
            });
            comentarios.sort(function (a, b) {
                return String(a.data || '').localeCompare(String(b.data || ''));
            });
            renderComentarios();
        };
        var primeira = base.orderBy('data', 'asc').onSnapshot(aplicar, function () {
            if (!postAtual || postAtual.id !== id) return;
            try { primeira(); } catch (e) {}
            if (commentsUnsub === primeira) commentsUnsub = null;
            var segunda = base.onSnapshot(aplicar, function () {
                if (list) list.innerHTML = '<div class="farn-news-comments-empty">Não foi possível carregar os comentários agora.</div>';
            });
            if (postAtual && postAtual.id === id) commentsUnsub = segunda;
            else { try { segunda(); } catch (e) {} }
        });
        commentsUnsub = primeira;
    }

    function renderComentarios() {
        var list = document.getElementById('farn-news-comments-list');
        var countEl = document.getElementById('farn-news-comments-count');
        if (countEl) countEl.textContent = comentarios.length;
        if (!list) return;
        if (!comentarios.length) {
            list.innerHTML = '<div class="farn-news-comments-empty">Nenhum comentário ainda. Seja o primeiro!</div>';
            return;
        }
        list.innerHTML = comentarios.map(function (c) {
            var nome = String(c.nome || 'Visitante').trim() || 'Visitante';
            var data = fmtDataHora(c.data || c.atualizadoEm || c.criadoEm);
            var acoes = podeGerenciar(c) ?
                '<span class="farn-news-comment-actions">' +
                    '<button type="button" data-farn-comment-edit="' + esc(c.id) + '" title="Editar comentário" aria-label="Editar comentário"><i class="fa-solid fa-pen"></i></button>' +
                    '<button type="button" data-farn-comment-del="' + esc(c.id) + '" title="Excluir comentário" aria-label="Excluir comentário"><i class="fa-solid fa-trash"></i></button>' +
                '</span>' : '';
            return '<div class="farn-news-comment" data-farn-comment="' + esc(c.id) + '">' +
                '<div class="farn-news-comment-avatar">' + esc(iniciaisDe(nome)) + '</div>' +
                '<div class="farn-news-comment-main">' +
                    '<div class="farn-news-comment-top"><b>' + esc(nome) + '</b>' + (data ? '<span class="farn-news-comment-date">' + esc(data) + '</span>' : '') + acoes + '</div>' +
                    '<div class="farn-news-comment-text">' + esc(c.texto || '') + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function enviarComentario() {
        if (enviando || !postAtual) return;
        var postId = postAtual.id;
        var u = usuarioAtual();
        var erroEl = document.getElementById('farn-news-comm-erro');
        var mostrarErro = function (msg) {
            if (!erroEl) return;
            erroEl.textContent = msg;
            erroEl.style.display = 'block';
        };
        if (erroEl) { erroEl.textContent = ''; erroEl.style.display = 'none'; }
        var nome = '', autorId = '', autorTipo = '', cpf = '';
        if (u) {
            nome = u.nome;
            cpf = u.cpf;
            autorId = u.autorId;
            autorTipo = 'cadastrado';
        } else {
            var nomeEl = document.getElementById('farn-news-comm-nome');
            nome = String((nomeEl && nomeEl.value) || '').trim().replace(/\s+/g, ' ');
            if (nome.length < 2) {
                mostrarErro('Informe seu nome para publicar.');
                if (nomeEl) nomeEl.focus();
                return;
            }
            if (nome.length > 60) nome = nome.slice(0, 60);
            autorId = anonId();
            autorTipo = 'anonimo';
            try { localStorage.setItem('farn_news_anon_nome', nome); } catch (e) {}
        }
        var txtEl = document.getElementById('farn-news-comm-texto');
        var texto = String((txtEl && txtEl.value) || '').trim();
        if (!texto) {
            mostrarErro('Escreva um comentário.');
            if (txtEl) txtEl.focus();
            return;
        }
        if (texto.length > 1200) texto = texto.slice(0, 1200);
        var btn = document.getElementById('farn-news-comm-enviar');
        var btnHtml = '<i class="fa-solid fa-paper-plane"></i> Publicar';
        enviando = true;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publicando...'; }
        var dados = {
            nome: nome,
            texto: texto,
            data: new Date().toISOString(),
            autorId: autorId,
            autorTipo: autorTipo
        };
        if (cpf) dados.cpf = cpf;
        dbFirestore.collection('noticiasAlunos').doc(postId).collection('comentarios').add(dados)
            .then(function () {
                if (postAtual && postAtual.id === postId && txtEl) {
                    txtEl.value = '';
                    txtEl.focus();
                }
            })
            .catch(function (err) {
                console.warn('FarnNoticias: erro ao publicar comentário', err);
                mostrarErro('Não foi possível publicar o comentário. Tente novamente.');
            })
            .then(function () {
                enviando = false;
                if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
            });
    }

    function editarComentario(id) {
        var c = comentarioPorId(id);
        if (!c) return;
        if (!podeGerenciar(c)) return;
        var novo = prompt('Editar comentário:', c.texto || '');
        if (novo === null) return;
        novo = String(novo).trim();
        if (!novo) { alert('O comentário não pode ficar vazio.'); return; }
        if (novo.length > 1200) novo = novo.slice(0, 1200);
        dbFirestore.collection('noticiasAlunos').doc(postAtual.id).collection('comentarios').doc(id)
            .update({ texto: novo, atualizadoEm: new Date().toISOString() })
            .catch(function (err) {
                console.warn('FarnNoticias: erro ao editar comentário', err);
                alert('Não foi possível editar o comentário. Tente novamente.');
            });
    }

    function excluirComentario(id) {
        var c = comentarioPorId(id);
        if (!c) return;
        if (!podeGerenciar(c)) return;
        if (!confirm('Excluir este comentário?')) return;
        dbFirestore.collection('noticiasAlunos').doc(postAtual.id).collection('comentarios').doc(id)
            .delete()
            .catch(function (err) {
                console.warn('FarnNoticias: erro ao excluir comentário', err);
                alert('Não foi possível excluir o comentário. Tente novamente.');
            });
    }

    document.addEventListener('click', function (ev) {
        var editBtn = ev.target.closest ? ev.target.closest('[data-farn-comment-edit]') : null;
        if (editBtn) {
            ev.preventDefault();
            editarComentario(editBtn.getAttribute('data-farn-comment-edit'));
            return;
        }
        var delBtn = ev.target.closest ? ev.target.closest('[data-farn-comment-del]') : null;
        if (delBtn) {
            ev.preventDefault();
            excluirComentario(delBtn.getAttribute('data-farn-comment-del'));
        }
    });

    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') close();
    });

    document.addEventListener('click', function (ev) {
        var card = ev.target.closest ? ev.target.closest('[data-farn-news]') : null;
        if (!card) return;
        var cta = ev.target.closest ? ev.target.closest('[data-farn-comment-cta]') : null;
        var id = card.getAttribute('data-farn-news');
        if (id && postsPorId[id]) {
            ev.preventDefault();
            open(id, { focusComments: !!cta });
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
