/* =====================================================================
   FARN ARQUIVO - envia e apaga arquivos no servidor proprio (Ubuntu)
   ---------------------------------------------------------------------
   Substitui o Firebase Storage para arquivos novos (videos de noticia,
   imagens do blog, insignias de patentes, fotos, apostilas, oportunidades).
   Endpoints:
     POST {api}/api/upload?caminho=...   -> { ok, url }
     GET  {api}/api/arquivo/<caminho>    -> o arquivo
     POST {api}/api/arquivo/excluir      -> { caminho } ou { prefixo }
   URLs antigas do Firebase Storage continuam valendo para leitura;
   para excluir, o codigo antigo continua tratando as URLs do Firebase.
   ===================================================================== */
(function (global) {
    'use strict';

    function faConfig() {
        try { return JSON.parse(localStorage.getItem('farn_api_config') || 'null') || {}; } catch (e) { return {}; }
    }

    /* Mesma base da API usada pelo farn-db.js. Quando a pagina ja e servida
       pelo proprio servidor, fica vazio e as URLs ficam relativas. */
    function faBaseUrl() {
        if (typeof dbFirestore !== 'undefined' && dbFirestore && dbFirestore.baseUrl) {
            return String(dbFirestore.baseUrl).replace(/\/$/, '');
        }
        var cfg = faConfig();
        if (cfg.url) return String(cfg.url).replace(/\/$/, '');
        if (typeof location !== 'undefined' && location.protocol && location.protocol !== 'file:') {
            return location.origin;
        }
        return '';
    }

    function faToken() {
        var cfg = faConfig();
        return cfg.token ? String(cfg.token) : '';
    }

    function faDisponivel() {
        return !!faBaseUrl();
    }

    /* True quando a pagina e o servidor estao no mesmo host (site publicado
       no Ubuntu). Nesse caso as URLs de arquivo ficam relativas. */
    function faMesmaOrigem() {
        var base = faBaseUrl();
        if (!base) return true;
        try {
            if (typeof location !== 'undefined' && location.origin
                && new URL(base).origin === location.origin) return true;
        } catch (e) {}
        return false;
    }

    function faCaminhoDaUrl(url) {
        var u = String(url || '');
        var i = u.indexOf('/api/arquivo/');
        if (i < 0) return null;
        return u.slice(i + '/api/arquivo/'.length);
    }

    function faURL(caminho) {
        var partes = String(caminho).split('/').map(encodeURIComponent).join('/');
        return (faMesmaOrigem() ? '' : faBaseUrl()) + '/api/arquivo/' + partes;
    }

    function faHeaders(conteudoTipo) {
        var h = {};
        if (conteudoTipo) h['Content-Type'] = conteudoTipo;
        var tok = faToken();
        if (tok) h['X-Farn-Token'] = tok;
        return h;
    }

    /* Envia um Blob/File e devolve a URL publica. Lanca erro se falhar. */
    async function faUpload(caminho, blob, contentType) {
        var base = faBaseUrl();
        if (!base) throw new Error('Servidor proprio nao configurado.');
        if (!blob) throw new Error('Nada para enviar.');
        var ct = contentType || blob.type || 'application/octet-stream';
        var resp = await fetch(base + '/api/upload?caminho=' + encodeURIComponent(caminho), {
            method: 'POST',
            headers: faHeaders(ct),
            body: blob
        });
        if (!resp.ok) {
            var msg = '';
            try { msg = (await resp.json()).error || ''; } catch (e) {}
            throw new Error(msg || ('Falha no envio (HTTP ' + resp.status + ').'));
        }
        var j = await resp.json();
        if (!j || !j.url) throw new Error('Servidor nao devolveu a URL do arquivo.');
        /* Quando o site ja e servido pelo proprio servidor, guarda URL
           relativa: se o túnel trocar de endereco, a imagem continua abrindo. */
        if (faMesmaOrigem() && faCaminhoDaUrl(j.url)) return faURL(faCaminhoDaUrl(j.url));
        return j.url;
    }

    function faDataUrlParaBlob(dataUrl) {
        if (typeof fsDataUrlToBlob === 'function') return fsDataUrlToBlob(dataUrl);
        try {
            var partes = String(dataUrl || '').split(',');
            if (partes.length < 2) return null;
            var mime = (partes[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
            var bin = atob(partes[1]);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        } catch (e) { return null; }
    }

    /* Aceita dataUrl (base64) e devolve a URL publica, ou null se falhar. */
    async function faUploadDataUrl(caminho, dataUrl) {
        var blob = faDataUrlParaBlob(dataUrl);
        if (!blob) return null;
        try {
            return await faUpload(caminho, blob, blob.type);
        } catch (e) {
            console.warn('Falha ao enviar arquivo ao servidor:', e);
            return null;
        }
    }

    /* Exclui um arquivo pelo URL (ou caminho). URLs do Firebase sao
       ignoradas aqui — quem cuida delas e o codigo antigo. */
    async function faExcluir(urlOuCaminho) {
        var caminho = faCaminhoDaUrl(urlOuCaminho) || (String(urlOuCaminho || '').indexOf('/') >= 0 && !/^https?:/i.test(urlOuCaminho) ? String(urlOuCaminho) : '');
        if (!caminho) return false;
        var base = faBaseUrl();
        if (!base) return false;
        try {
            var resp = await fetch(base + '/api/arquivo/excluir', {
                method: 'POST',
                headers: faHeaders('application/json'),
                body: JSON.stringify({ caminho: caminho })
            });
            return resp.ok;
        } catch (e) { return false; }
    }

    /* Exclui todos os arquivos de uma pasta (ex.: imagens de uma conversa). */
    async function faExcluirPasta(prefixo) {
        if (!prefixo) return false;
        var base = faBaseUrl();
        if (!base) return false;
        try {
            var resp = await fetch(base + '/api/arquivo/excluir', {
                method: 'POST',
                headers: faHeaders('application/json'),
                body: JSON.stringify({ prefixo: String(prefixo) })
            });
            return resp.ok;
        } catch (e) { return false; }
    }

    /* URLs antigas gravadas com outro endereço de túnel: se a imagem/vídeo
       falhar, troca só o host pelo caminho atual (ou relativo). */
    if (typeof document !== 'undefined') {
        document.addEventListener('error', function (e) {
            var el = e.target;
            if (!el || !el.tagName || ['IMG', 'VIDEO', 'SOURCE'].indexOf(el.tagName.toUpperCase()) < 0) return;
            var src = el.getAttribute('src') || '';
            var caminho = src.indexOf('/api/arquivo/') >= 0 ? faCaminhoDaUrl(src) : null;
            if (!caminho) return;
            var nova = faURL(caminho);
            if (nova && nova !== src) el.src = nova;
        }, true);
    }

    global.FarnArquivo = {
        disponivel: faDisponivel,
        url: faURL,
        caminhoDaUrl: faCaminhoDaUrl,
        upload: faUpload,
        uploadDataUrl: faUploadDataUrl,
        excluir: faExcluir,
        excluirPasta: faExcluirPasta
    };
})(window);
