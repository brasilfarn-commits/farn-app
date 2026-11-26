/* =====================================================================
   FARN - visualizador de foto 3x4 com ZOOM
   ---------------------------------------------------------------------
   Botao "Ampliar" sobreposto a qualquer miniatura de foto 3x4.
   Uso: coloque o botao com a classe .farn-foto-ampliar dentro do mesmo
   container da <img>. O clique e capturado por delegacao, entao funciona
   tambem em linhas geradas dinamicamente.

   API: FarnFotoViewer.abrir(src, titulo)
   ===================================================================== */
(function (global) {
    'use strict';

    var ZMIN = 0.5, ZMAX = 6;
    var ui = null, viewport = null, imagem = null, percentual = null, tituloEl = null, infoEl = null;
    var estado = { fonte: '', zoom: 1, x: 0, y: 0, arrastando: false, ux: 0, uy: 0, pincho: 0, pinchoZoom: 1 };

    function injetarCSS() {
        if (document.getElementById('farn-foto-viewer-css')) return;
        var css = document.createElement('style');
        css.id = 'farn-foto-viewer-css';
        css.textContent = '.farn-foto-wrap{position:relative;display:inline-block;max-width:100%}'
            + '.farn-foto-ampliar{position:absolute;top:3px;right:3px;width:26px;height:26px;'
            + 'border-radius:50%;border:1px solid rgba(255,255,255,.9);background:rgba(15,23,42,.75);'
            + 'color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;'
            + 'z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.35);padding:0;font-size:12px;line-height:1}'
            + '.farn-foto-ampliar:hover{background:#2563eb}'
            + '@media print{.farn-foto-ampliar{display:none!important}}';
        document.head.appendChild(css);
    }

    function garantirUI() {
        injetarCSS();
        if (ui) return ui;

        ui = document.createElement('div');
        ui.setAttribute('role', 'dialog');
        ui.setAttribute('aria-modal', 'true');
        ui.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(2,6,23,.94);'
            + 'flex-direction:column;padding:14px;box-sizing:border-box';
        ui.innerHTML = ''
            + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;color:#fff">'
            + '<strong id="fv-titulo" style="font-size:15px;flex:1;min-width:180px">Foto 3x4</strong>'
            + '<div style="display:flex;align-items:center;gap:5px">'
            + '<button type="button" id="fv-menos" title="Diminuir zoom" style="width:34px;height:34px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:17px">−</button>'
            + '<span id="fv-percentual" style="min-width:52px;text-align:center;font-size:12px;font-weight:700">100%</span>'
            + '<button type="button" id="fv-mais" title="Aumentar zoom" style="width:34px;height:34px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:17px">+</button>'
            + '</div>'
            + '<button type="button" id="fv-ajustar" style="height:34px;padding:0 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:12px">Ajustar</button>'
            + '<button type="button" id="fv-baixar" style="height:34px;padding:0 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:12px">Baixar</button>'
            + '<button type="button" id="fv-fechar" title="Fechar (Esc)" style="width:34px;height:34px;border-radius:8px;border:1px solid #475569;background:#b91c1c;color:#fff;cursor:pointer;font-size:17px">×</button>'
            + '</div>'
            + '<div id="fv-viewport" style="flex:1;position:relative;overflow:hidden;border-radius:12px;background:#0f172a;'
            + 'display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab">'
            + '<img id="fv-img" alt="Foto 3x4 ampliada" style="max-width:none;max-height:none;display:block;user-select:none;'
            + '-webkit-user-select:none;transform-origin:center center;will-change:transform">'
            + '</div>'
            + '<div id="fv-info" style="color:#cbd5e1;font-size:12px;margin-top:8px;text-align:center"></div>'
            + '<div style="color:#64748b;font-size:11px;margin-top:4px;text-align:center">'
            + 'Use + / −, a roda do mouse ou arraste a imagem. No celular, use pinça. Esc para fechar.'
            + '</div>';
        document.body.appendChild(ui);

        viewport = ui.querySelector('#fv-viewport');
        imagem = ui.querySelector('#fv-img');
        percentual = ui.querySelector('#fv-percentual');
        tituloEl = ui.querySelector('#fv-titulo');
        infoEl = ui.querySelector('#fv-info');

        ui.querySelector('#fv-fechar').addEventListener('click', fechar);
        ui.addEventListener('click', function (ev) { if (ev.target === ui) fechar(); });
        ui.querySelector('#fv-mais').addEventListener('click', function () { zoom(estado.zoom * 1.25); });
        ui.querySelector('#fv-menos').addEventListener('click', function () { zoom(estado.zoom / 1.25); });
        ui.querySelector('#fv-ajustar').addEventListener('click', ajustar);
        ui.querySelector('#fv-baixar').addEventListener('click', baixar);

        viewport.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            zoom(estado.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
        }, { passive: false });
        viewport.addEventListener('dblclick', function () {
            zoom(estado.zoom > 1.2 ? 1 : 2);
            if (estado.zoom <= 1.2) { estado.x = 0; estado.y = 0; aplicar(); }
        });

        viewport.addEventListener('mousedown', function (ev) {
            if (ev.button !== 0) return;
            estado.arrastando = true; estado.ux = ev.clientX; estado.uy = ev.clientY;
            viewport.style.cursor = 'grabbing';
            ev.preventDefault();
        });
        window.addEventListener('mousemove', function (ev) {
            if (!estado.arrastando || ui.style.display === 'none') return;
            estado.x += ev.clientX - estado.ux; estado.y += ev.clientY - estado.uy;
            estado.ux = ev.clientX; estado.uy = ev.clientY;
            aplicar();
        });
        window.addEventListener('mouseup', function () {
            estado.arrastando = false;
            if (viewport) viewport.style.cursor = 'grab';
        });

        viewport.addEventListener('touchstart', function (ev) {
            if (ev.touches.length === 2) {
                estado.pincho = distancia(ev.touches);
                estado.pinchoZoom = estado.zoom;
                return;
            }
            if (ev.touches.length === 1) {
                estado.arrastando = true;
                estado.ux = ev.touches[0].clientX; estado.uy = ev.touches[0].clientY;
            }
        }, { passive: false });
        viewport.addEventListener('touchmove', function (ev) {
            ev.preventDefault();
            if (ev.touches.length === 2 && estado.pincho) {
                zoom(estado.pinchoZoom * (distancia(ev.touches) / estado.pincho));
                return;
            }
            if (ev.touches.length === 1 && estado.arrastando) {
                estado.x += ev.touches[0].clientX - estado.ux;
                estado.y += ev.touches[0].clientY - estado.uy;
                estado.ux = ev.touches[0].clientX; estado.uy = ev.touches[0].clientY;
                aplicar();
            }
        }, { passive: false });
        viewport.addEventListener('touchend', function () {
            estado.arrastando = false; estado.pincho = 0;
        });
        return ui;
    }

    function distancia(touches) {
        var dx = touches[0].clientX - touches[1].clientX;
        var dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy) || 1;
    }

    function aplicar() {
        if (!imagem) return;
        imagem.style.transform = 'translate(' + estado.x + 'px,' + estado.y + 'px) scale(' + estado.zoom + ')';
        if (percentual) percentual.textContent = Math.round(estado.zoom * 100) + '%';
    }

    function zoom(valor) {
        estado.zoom = Math.min(ZMAX, Math.max(ZMIN, valor));
        aplicar();
    }

    function ajustar() {
        if (!imagem || !viewport) return;
        var w = imagem.naturalWidth || 300, h = imagem.naturalHeight || 400;
        var vw = Math.max(100, viewport.clientWidth - 48), vh = Math.max(100, viewport.clientHeight - 48);
        estado.zoom = Math.min(vw / w, vh / h, ZMAX);
        if (!isFinite(estado.zoom) || estado.zoom <= 0) estado.zoom = 1;
        estado.x = 0; estado.y = 0;
        aplicar();
    }

    function abrir(src, titulo, info) {
        if (!src) return;
        garantirUI();
        estado.fonte = src;
        estado.zoom = 1; estado.x = 0; estado.y = 0; estado.pincho = 0;
        if (tituloEl) tituloEl.textContent = titulo || 'Foto 3x4';
        if (infoEl) infoEl.textContent = info || '';
        imagem.onload = ajustar;
        imagem.src = src;
        ui.style.display = 'flex';
        if (imagem.complete && imagem.naturalWidth) ajustar(); else aplicar();
    }

    function fechar() {
        if (!ui) return;
        ui.style.display = 'none';
        estado.arrastando = false;
        if (imagem) imagem.removeAttribute('src');
    }

    function baixar() {
        if (!estado.fonte) return;
        var a = document.createElement('a');
        a.href = estado.fonte;
        a.download = 'foto3x4_' + String(tituloEl ? tituloEl.textContent : 'aluno')
            .replace(/[^\w\-]+/g, '_') + '.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    document.addEventListener('keydown', function (ev) {
        if (!ui || ui.style.display === 'none') return;
        if (ev.key === 'Escape') { fechar(); return; }
        if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); zoom(estado.zoom * 1.25); }
        if (ev.key === '-') { ev.preventDefault(); zoom(estado.zoom / 1.25); }
        if (ev.key === '0') { ev.preventDefault(); ajustar(); }
    });

    /* Delegacao: qualquer .farn-foto-ampliar abre a img do mesmo container. */
    document.addEventListener('click', function (ev) {
        var alvo = ev.target;
        if (!alvo || !alvo.closest) return;
        var btn = alvo.closest('.farn-foto-ampliar');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        var area = btn.parentElement;
        var imgEl = area ? area.querySelector('img') : null;
        var src = imgEl ? (imgEl.currentSrc || imgEl.src || '') : (btn.getAttribute('data-src') || '');
        var titulo = btn.getAttribute('data-titulo') || (imgEl ? imgEl.alt : '') || 'Foto 3x4';

        /* Na lista do admin a miniatura e preenchida depois. Se o botao for
           clicado antes disso, busca a foto pelo CPF gravado no botao. */
        if (!src && btn.getAttribute('data-cpf') && typeof global.getFoto === 'function') {
            var cpf = btn.getAttribute('data-cpf');
            btn.setAttribute('aria-busy', 'true');
            global.getFoto(cpf).then(function (foto) {
                btn.removeAttribute('aria-busy');
                if (foto) abrir(foto, titulo);
                else alert('Este cadastro ainda não tem foto 3x4.');
            }).catch(function () {
                btn.removeAttribute('aria-busy');
                alert('Não foi possível carregar a foto agora. Tente novamente.');
            });
            return;
        }
        if (!src) { alert('Este cadastro ainda não tem foto 3x4.'); return; }
        abrir(src, titulo);
    });

    global.FarnFotoViewer = { abrir: abrir, fechar: fechar, zoom: zoom, ajustar: ajustar, botaoClasse: 'farn-foto-ampliar' };
})(window);
