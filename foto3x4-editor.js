/* Editor de recorte da foto 3x4 (zoom + arrastar + centralizar).
   Compartilhado pelos portais: aluno, docente e demais telas que pedem
   a foto 3x4. No celular o seletor de fotos do aparelho ja oferece
   recorte; no computador nao existe isso, e este editor cobre os dois
   casos com a mesma ferramenta.

   Uso:
     Foto3x4Editor.abrir({
       nome: 'Nome da pessoa',        // aparece no titulo
       fonte: dataUrl,                // imagem de origem
       largura: 480,                   // opcional: saida (padrao 480x640)
       altura: 640,                    // opcional: use 256 e 256 para a insignia
       limiteKb: 900,                  // opcional: teto da saida (padrao 900)
       aoConcluir: function (dataUrl, recortado) { ... }
     });
   AoConcluir recebe a imagem recortada nas medidas pedidas (dentro do
   limite) quando o usuario salva o recorte, ou a imagem original com
   recortado=false quando ele escolhe "Usar sem ajuste" (o portal entao
   comprime como fazia antes). Cancelar nao chama nada: nada e gravado. */
(function (global) {
    'use strict';

    var LIMITE_KB = 900;
    var LARGURA = 480, ALTURA = 640;

    /* O editor serve para qualquer proporcao: a 3x4 da foto do cadastro e
       a 1x1 da insignia da patente usam a MESMA janela. Sem `proporcao`,
       continua 3x4 em 480x640, exatamente como sempre foi. */
    function dimensoes(opcoes) {
        var l = Math.round(Number(opcoes && opcoes.largura) || LARGURA);
        var a = Math.round(Number(opcoes && opcoes.altura) || ALTURA);
        if (l < 16) l = LARGURA;
        if (a < 16) a = ALTURA;
        var kb = Number(opcoes && opcoes.limiteKb) || LIMITE_KB;
        if (kb < 10) kb = LIMITE_KB;
        return { largura: l, altura: a, limiteKb: kb };
    }

    var ed = { aberto: false, estado: null, ligou: false };

    /* ---------- janela (criada uma vez, no primeiro uso) ---------- */
    var CSS = [
        '#f3e-modal{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.92);',
        'display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}',
        '#f3e-caixa{background:#fff;border-radius:14px;max-width:440px;width:100%;padding:20px}',
        '#f3e-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}',
        '#f3e-topo h3{margin:0;font-size:16px;color:#0f172a}',
        '#f3e-dica{font-size:12px;color:#475569;line-height:1.5;margin:0 0 12px}',
        '#f3e-moldura{position:relative;margin:0 auto;max-width:280px;width:100%;',
        'aspect-ratio:3/4;background:#0f172a;border-radius:8px;overflow:hidden;cursor:grab;touch-action:none}',
        '#f3e-moldura.arrastando{cursor:grabbing}',
        '#f3e-img{position:absolute;display:block;user-select:none;-webkit-user-select:none;',
        'touch-action:none;max-width:none;pointer-events:none}',
        '#f3e-zoom{display:flex;align-items:center;gap:8px;margin:12px 0 6px}',
        '#f3e-zoom input[type=range]{flex:1;min-width:0}',
        '#f3e-centro{display:flex;justify-content:center;margin-bottom:6px}',
        '#f3e-centro button{background:#f1f5f9;border:1px solid #cbd5e1;color:#334155;',
        'border-radius:8px;width:38px;height:34px;font-size:14px;cursor:pointer}',
        '#f3e-botoes{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}',
        '#f3e-botoes button{border:none;border-radius:8px;padding:10px 16px;font-size:13px;',
        'font-weight:600;cursor:pointer}',
        '#f3e-sem-ajuste{background:#e2e8f0;color:#0f172a}',
        '#f3e-cancelar{background:#e2e8f0;color:#334155}',
        '#f3e-salvar{background:#16a34a;color:#fff}',
        '#f3e-fechar{background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;padding:0 4px}'
    ].join('');

    function id(nome) { return document.getElementById(nome); }

    function garantirJanela() {
        if (id('f3e-modal')) return;
        var estilo = document.createElement('style');
        estilo.id = 'f3e-css';
        estilo.textContent = CSS;
        document.head.appendChild(estilo);

        var tela = document.createElement('div');
        tela.id = 'f3e-modal';
        tela.style.display = 'none';
        /* clicking fora fecha */
        tela.addEventListener('click', function (ev) { if (ev.target === tela) fechar(); });
        tela.innerHTML =
            '<div id="f3e-caixa">' +
            '<div id="f3e-topo">' +
            '<h3><i class="fa-solid fa-crop-simple" style="color:#2563eb;margin-right:8px"></i>' +
            ' <span id="f3e-titulo">Editar Foto 3x4</span> (<span id="f3e-nome">Aluno</span>)</h3>' +
            '<button id="f3e-fechar" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<p id="f3e-dica"><i class="fa-solid fa-info-circle" style="color:#2563eb"></i> ' +
            '<span id="f3e-dica-texto">Arraste a imagem para enquadrar o rosto e use o controle para ' +
            '<strong>ampliar ou reduzir</strong>. ' +
            'A moldura e o corte 3x4 final. Se preferir a foto como ela esta, toque em ' +
            '<strong>Usar sem ajuste</strong>.</span></p>' +
            '<div id="f3e-moldura"><img id="f3e-img" alt="Imagem para recorte"></div>' +
            '<div id="f3e-zoom">' +
            '<i class="fa-solid fa-magnifying-glass-minus" style="color:#64748b"></i>' +
            '<input type="range" id="f3e-zoom-range" min="100" max="500" step="5" value="100">' +
            '<i class="fa-solid fa-magnifying-glass-plus" style="color:#64748b"></i>' +
            '</div>' +
            '<div id="f3e-centro">' +
            '<button id="f3e-centralizar" title="Centralizar (zoom 100%)">' +
            '<i class="fa-solid fa-crosshairs"></i></button>' +
            '</div>' +
            '<div id="f3e-botoes">' +
            '<button id="f3e-sem-ajuste">Usar sem ajuste</button>' +
            '<button id="f3e-cancelar">Cancelar</button>' +
            '<button id="f3e-salvar"><i class="fa-solid fa-crop"></i> Salvar Recorte</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(tela);

        id('f3e-fechar').addEventListener('click', fechar);
        id('f3e-cancelar').addEventListener('click', fechar);
        id('f3e-sem-ajuste').addEventListener('click', usarSemAjuste);
        id('f3e-salvar').addEventListener('click', salvar);
        id('f3e-centralizar').addEventListener('click', centralizar);
        id('f3e-zoom-range').addEventListener('input', function (ev) {
            mudarZoom(ev.target.value);
        });
    }

    function ligarArraste() {
        if (ed.ligou) return;
        var moldura = id('f3e-moldura');
        if (!moldura) return;
        ed.ligou = true;
        moldura.addEventListener('mousedown', aoPressionar);
        moldura.addEventListener('touchstart', aoPressionar, { passive: false });
        global.addEventListener('mousemove', aoMover);
        global.addEventListener('mouseup', aoSoltar);
        global.addEventListener('touchmove', aoMover, { passive: false });
        global.addEventListener('touchend', aoSoltar);
        global.addEventListener('touchcancel', aoSoltar);
    }

    function ponto(ev) {
        if (ev.touches && ev.touches.length) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        return { x: ev.clientX, y: ev.clientY };
    }
    function aoPressionar(ev) {
        var e = ed.estado;
        if (!e) return;
        ev.preventDefault();
        var p = ponto(ev);
        e.arrastando = true;
        e.ultX = p.x; e.ultY = p.y;
        var m = id('f3e-moldura');
        if (m) m.classList.add('arrastando');
    }
    function aoMover(ev) {
        var e = ed.estado;
        if (!e || !e.arrastando) return;
        ev.preventDefault();
        var p = ponto(ev);
        e.offX += p.x - e.ultX;
        e.offY += p.y - e.ultY;
        e.ultX = p.x; e.ultY = p.y;
        posicionar();
    }
    function aoSoltar() {
        var e = ed.estado;
        if (!e) return;
        e.arrastando = false;
        var m = id('f3e-moldura');
        if (m) m.classList.remove('arrastando');
    }

    /* ---------- geometria do recorte ---------- */
    function medidas() {
        var e = ed.estado;
        if (!e || !e.base) return null;
        var moldura = id('f3e-moldura');
        var vw = (moldura && moldura.clientWidth) || 280;
        var vh = (moldura && moldura.clientHeight) || Math.round(vw * e.altura / e.largura);
        var iw = e.base.width || 1, ih = e.base.height || 1;
        var escala = Math.max(vw / iw, vh / ih);
        return { vw: vw, vh: vh, iw: iw, ih: ih, escala: escala };
    }

    function posicionar() {
        var e = ed.estado;
        if (!e || !e.base) return;
        var m = medidas();
        if (!m) return;
        var dw = m.iw * m.escala * e.zoom, dh = m.ih * m.escala * e.zoom;
        /* nunca deixa a imagem descobrir a borda da moldura */
        var maxX = Math.max(0, (dw - m.vw) / 2), maxY = Math.max(0, (dh - m.vh) / 2);
        if (e.offX < -maxX) e.offX = -maxX;
        if (e.offX > maxX) e.offX = maxX;
        if (e.offY < -maxY) e.offY = -maxY;
        if (e.offY > maxY) e.offY = maxY;
        var img = id('f3e-img');
        if (!img) return;
        img.style.width = dw + 'px';
        img.style.height = dh + 'px';
        img.style.left = (e.offX + (m.vw - dw) / 2) + 'px';
        img.style.top = (e.offY + (m.vh - dh) / 2) + 'px';
    }

    function mudarZoom(valor) {
        var e = ed.estado;
        if (!e) return;
        var novo = Math.max(1, (parseInt(valor, 10) || 100) / 100);
        if (novo === e.zoom) return;
        var m = medidas();
        if (!m) return;
        /* mantem o mesmo ponto do quadro (o rosto) ao ampliar ou reduzir */
        var dw0 = m.iw * m.escala * e.zoom, dh0 = m.ih * m.escala * e.zoom;
        var left0 = e.offX + (m.vw - dw0) / 2, top0 = e.offY + (m.vh - dh0) / 2;
        var fx = (m.vw / 2 - left0) / dw0, fy = (m.vh / 2 - top0) / dh0;
        e.zoom = novo;
        var dw1 = m.iw * m.escala * novo, dh1 = m.ih * m.escala * novo;
        e.offX = (m.vw / 2 - fx * dw1) - (m.vw - dw1) / 2;
        e.offY = (m.vh / 2 - fy * dh1) - (m.vh - dh1) / 2;
        posicionar();
    }

    function centralizar() {
        var e = ed.estado;
        if (!e) return;
        e.zoom = 1; e.offX = 0; e.offY = 0;
        var z = id('f3e-zoom-range');
        if (z) z.value = 100;
        posicionar();
    }

    /* ---------- saida ---------- */
    function salvar() {
        var e = ed.estado;
        if (!e || !e.base) return;
        var m = medidas();
        if (!m) return;
        var dw = m.iw * m.escala * e.zoom, dh = m.ih * m.escala * e.zoom;
        var left = e.offX + (m.vw - dw) / 2, top = e.offY + (m.vh - dh) / 2;
        var srcX = Math.max(0, Math.min(((-left) / dw) * m.iw, m.iw - 1));
        var srcY = Math.max(0, Math.min(((-top) / dh) * m.ih, m.ih - 1));
        var srcW = Math.max(1, Math.min((m.vw / dw) * m.iw, m.iw - srcX));
        var srcH = Math.max(1, Math.min((m.vh / dh) * m.ih, m.ih - srcY));
        var out = document.createElement('canvas');
        out.width = e.largura; out.height = e.altura;
        var ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, e.largura, e.altura);
        ctx.drawImage(e.base, srcX, srcY, srcW, srcH, 0, 0, e.largura, e.altura);
        var qualidades = [0.92, 0.85, 0.75, 0.65, 0.5, 0.4, 0.3, 0.2, 0.1];
        var saida = null;
        for (var i = 0; i < qualidades.length; i++) {
            var url = out.toDataURL('image/jpeg', qualidades[i]);
            if (Math.round(url.length * 3 / 4) <= e.limiteKb * 1024) { saida = url; break; }
        }
        if (!saida) saida = out.toDataURL('image/jpeg', 0.1);
        concluir(saida, true);
    }

    function usarSemAjuste() { concluir(ed.estado ? ed.estado.fonte : null, false); }
    function fechar() { concluir(null, false); }

    function concluir(dataUrl, recortado) {
        var cb = ed.estado ? ed.estado.aoConcluir : null;
        ed.estado = null;
        ed.aberto = false;
        var tela = id('f3e-modal');
        if (tela) tela.style.display = 'none';
        var img = id('f3e-img');
        if (img) img.removeAttribute('src');
        if (typeof cb === 'function' && dataUrl) cb(dataUrl, recortado);
    }

    /* ---------- entrada ---------- */
    function abrir(opcoes) {
        opcoes = opcoes || {};
        var fonte = opcoes.fonte;
        if (!fonte) return;
        var dim = dimensoes(opcoes);
        garantirJanela();
        var img = new Image();
        img.onload = function () {
            ed.estado = {
                base: img, fonte: fonte, zoom: 1, offX: 0, offY: 0, arrastando: false,
                ultX: 0, ultY: 0, aoConcluir: opcoes.aoConcluir || null,
                largura: dim.largura, altura: dim.altura, limiteKb: dim.limiteKb
            };
            var nome = id('f3e-nome');
            if (nome) nome.textContent = opcoes.nome || 'Aluno';
            /* O titulo e a dica falam de foto 3x4 por padrao, que e o uso
               principal. Quem reaproveita o editor (a insignia da patente)
               pode trocar os dois. */
            var tit = id('f3e-titulo');
            if (tit) tit.textContent = opcoes.titulo || 'Editar Foto 3x4';
            var dica = id('f3e-dica-texto');
            if (dica) dica.innerHTML = opcoes.dica || ('Arraste a imagem para enquadrar o rosto e use o controle para ' +
                '<strong>ampliar ou reduzir</strong>. ' +
                'A moldura e o corte 3x4 final. Se preferir a foto como ela esta, toque em ' +
                '<strong>Usar sem ajuste</strong>.');
            var z = id('f3e-zoom-range');
            if (z) z.value = 100;
            /* a moldura segue a proporcao pedida (1x1 na insignia) */
            var moldura = id('f3e-moldura');
            if (moldura) moldura.style.aspectRatio = dim.largura + ' / ' + dim.altura;
            var tela = id('f3e-modal');
            if (tela) tela.style.display = 'flex';
            ed.aberto = true;
            var imgEl = id('f3e-img');
            if (imgEl) imgEl.src = fonte;
            ligarArraste();
            posicionar();
        };
        img.onerror = function () {
            /* nao conseguiu ler a imagem: devolve a original, sem ajuste */
            concluir(fonte, false);
        };
        img.src = fonte;
    }

    global.Foto3x4Editor = {
        abrir: abrir,
        salvar: salvar,
        centralizar: centralizar,
        mudarZoom: mudarZoom,
        fechar: fechar,
        aberto: function () { return ed.aberto; }
    };
})(typeof window !== 'undefined' ? window : this);
