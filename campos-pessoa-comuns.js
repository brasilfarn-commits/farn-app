/* =====================================================================
   CAMPOS COMUNS DE PESSOA - FOTO 3X4 + QR CODE
   ---------------------------------------------------------------------
   Usado por TODOS os formularios de cadastro: Pre-Inscricao/Aluno/
   Formado/Cadastro Geral, Usuario, Docente, Coordenacao, Cadastro de
   Cursos (pre-inscricao e individuo), CFF e pre-inscricao via link.

   Regras:
   - Foto 3x4: recorte 300x400 em JPEG, com editor de zoom/arraste e
     compressao final com teto de 1 MB antes de gravar. Isso evita estourar
     o limite de 1 MiB por documento do Firestore.
   - QR Code: o CONTEUDO do QR e exatamente a credencial/matricula da
     pessoa (sem URL, sem JSON e sem prefixo). Os leitores de apontamento
     comparam o texto lido diretamente com `matricula`,Entao qualquer
     outro formato quebraria o apontamento por camera.
   - Campos gravados: foto3x4 (dataURL curto) e qrCode (texto).
   ===================================================================== */
(function (global) {
    'use strict';

    /* Teto da foto gravada: 1 MB (1000 KB). O recorte 3x4 em JPEG normalmente
       fica bem menor, mas "Usar sem ajuste" e imagens muito detalhadas podem
       passar disso. Por isso a compressao final sempre e conferida. */
    var LIMITE_FOTO_KB = 1000;
    var QR_API = 'https://api.qrserver.com/v1/create-qr-code/';
    var opcoesPorPrefixo = {};

    function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function kb(dataUrl) { return Math.round(String(dataUrl || '').length * 3 / 4 / 1024); }

    /* Os leitores comparam o TEXTO lido com a matricula/credencial gravada.
       Por isso o QR nao pode levar URL, JSON, prefixo FARN-INICIO nem ser
       convertido para maiusculas: o valor precisa ser o identificador puro. */
    function puro(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return '';
        if (/^https?:\/\//i.test(s)) return '';
        if (/^FARN-/i.test(s)) return '';
        if (s.charAt(0) === '{' || s.charAt(0) === '[') return '';
        if (/[?&]cred(encial)?=|[?&]matricula=/i.test(s)) return '';
        return s;
    }

    /* Ordem obrigatoria para compatibilidade com os leitores:
       1) credencial do formado, 2) matricula, 3) CPF. */
    function qrValor(reg) {
        var r = reg || {};
        var v = puro(r.qrCode);
        if (!v) v = puro(r.credencial);
        if (!v) v = puro(r.matricula);
        if (!v) v = digitos(r.cpf);
        return puro(v);
    }
    function qrUrl(valor, tamanho) {
        var v = String(valor || '').trim();
        if (!v) return '';
        return QR_API + '?data=' + encodeURIComponent(v) + '&size=' + (tamanho || 96) + 'x' + (tamanho || 96) + '&margin=2';
    }

    /* HTML do bloco. `prefixo` segue o padrao de cada formulario
       (fc, uf, intr, coord, doc, ccpf, ccif, cffc, f). */
    function html(prefixo, reg, opcoes) {
        var r = reg || {}, o = opcoes || {};
        opcoesPorPrefixo[prefixo] = o;
        var limiteKb = Number(o.limiteKb) || LIMITE_FOTO_KB;
        /* So grava no campo novo o que ja era foto3x4 (ou um dataUrl antigo em
           fotoUrl). photoDataUrl so serve de preview: copia-lo para foto3x4
           duplicaria imagens grandes e estouraria o limite do documento. */
        var foto = String(r.foto3x4 || '').trim();
        if (!foto && String(r.fotoUrl || '').indexOf('data:') === 0) foto = r.fotoUrl;
        var preview = foto || String(r.photoDataUrl || '').trim();
        var qr = qrValor(r);
        var partes = [];

        /* Mesmo nos formularios que ja tem anexo de foto proprio (docente),
           o campo oculto preserva um foto3x4 ja gravado. Nao duplicamos
           photoDataUrl: ele pode ser grande e estourar o limite do Firestore. */
        if (o.soQr) {
            partes.push('<input type="hidden" id="' + prefixo + '-foto3x4" value="' + esc(foto) + '">');
        }

        if (!o.soQr) {
            partes.push('<div class="form-group pcp-foto-grupo" style="grid-column:1/-1">'
                + '<label><i class="fa-solid fa-id-card" style="color:#2563eb;margin-right:6px"></i> Foto 3x4</label>'
                + '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">'
                + '<div class="farn-foto-wrap">'
                + '<div id="' + prefixo + '-foto3x4-preview" style="width:72px;height:96px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex:none">'
                + (preview ? '<img src="' + esc(preview) + '" style="width:100%;height:100%;object-fit:cover" alt="Foto 3x4">'
                        : '<i class="fa-solid fa-user" style="font-size:24px;color:#94a3b8"></i>')
                + '</div>'
                + '<button type="button" class="farn-foto-ampliar" data-titulo="' + esc(r.nome || 'Foto 3x4') + '"'
                + (String(r.cpf || '').replace(/\D/g, '') ? ' data-cpf="' + String(r.cpf).replace(/\D/g, '') + '"' : '')
                + ' title="Ampliar foto com zoom" aria-label="Ampliar foto com zoom"' + (preview ? '' : ' style="display:none"') + '><i class="fa-solid fa-magnifying-glass-plus"></i></button>'
                + '</div>'
                + '<div style="min-width:180px">'
                + '<input type="hidden" id="' + prefixo + '-foto3x4" value="' + esc(foto) + '">'
                + '<input type="file" id="' + prefixo + '-foto3x4-file" accept="image/*" style="display:none" onchange="FarnPessoaCampos.arquivo(\'' + prefixo + '\', this.files)">'
                + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
                + '<button type="button" class="btn-outline btn-sm" onclick="document.getElementById(\'' + prefixo + '-foto3x4-file\').click()"><i class="fa-solid fa-paperclip"></i> ANEXAR / TROCAR FOTO</button>'
                + '<button type="button" class="btn-outline btn-sm" onclick="FarnPessoaCampos.remover(\'' + prefixo + '\')"><i class="fa-solid fa-trash"></i> REMOVER</button>'
                 + (o.editor && (foto || preview)
                    ? '<button type="button" class="btn-outline btn-sm" onclick="FarnPessoaCampos.editar(\'' + prefixo + '\')"><i class="fa-solid fa-crop"></i> EDITAR ZOOM / RECORTE</button>'
                    : '')
                + '</div>'
                + '<div id="' + prefixo + '-foto3x4-status" style="font-size:10px;color:#64748b;margin-top:5px">'
                + (foto
                    ? 'Foto cadastrada (' + kb(foto) + ' KB). Teto: ' + limiteKb + ' KB (1 MB).'
                    : 'JPG/PNG — o editor permite ampliar, arrastar e recortar em 3x4. Teto: ' + limiteKb + ' KB (1 MB).')
                + '</div></div></div></div>');
        }

        partes.push('<div class="form-group pcp-qr-grupo" style="grid-column:1/-1">'
            + '<label><i class="fa-solid fa-qrcode" style="color:#16a34a;margin-right:6px"></i> QR Code</label>'
            + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid #dcfce7;border-radius:8px;background:#f0fdf4">'
            + '<img id="' + prefixo + '-qr-img" src="' + esc(qr ? qrUrl(qr, 96) : '') + '" alt="QR Code" style="width:80px;height:80px;padding:4px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;' + (qr ? '' : 'display:none') + '">'
            + '<div style="min-width:180px">'
            + '<div style="font-size:10px;font-weight:700;color:#15803d;letter-spacing:.5px">CONTEUDO DO QR</div>'
            + '<div id="' + prefixo + '-qr-valor" style="font-family:\'Courier New\',monospace;font-size:16px;font-weight:800;color:#166534;word-break:break-all">' + esc(qr || '—') + '</div>'
            + '<input type="hidden" id="' + prefixo + '-qr-code" value="' + esc(qr) + '">'
            + '<div style="font-size:10px;color:#64748b;margin-top:4px">O QR usa a credencial, a matrícula ou o CPF.apos salvar, o código aparece aqui e pode ser lido no apontamento.</div>'
            + '</div></div></div>');

        return partes.join('');
    }

    function montar(prefixo, alvoId, reg, opcoes) {
        var alvo = document.getElementById(alvoId) || document.getElementById(prefixo + '-foto-qr-box');
        if (!alvo) return;
        alvo.innerHTML = html(prefixo, reg, opcoes);
    }

    function atualizarQr(prefixo, regOuValor) {
        var valor = (typeof regOuValor === 'string') ? regOuValor : qrValor(regOuValor);
        var txt = document.getElementById(prefixo + '-qr-valor');
        var img = document.getElementById(prefixo + '-qr-img');
        var hidden = document.getElementById(prefixo + '-qr-code');
        if (txt) txt.textContent = valor || '—';
        if (hidden) hidden.value = valor;
        if (img) {
            if (valor) { img.src = qrUrl(valor, 96); img.style.display = ''; }
            else { img.removeAttribute('src'); img.style.display = 'none'; }
        }
    }

    /* Recorte 3x4 com o editor compartilhado (zoom + arrastar). Mesmo quando
       o usuario escolhe "Usar sem ajuste" a imagem passa pela compressao
       final, para nunca gravar um dataUrl maior que o teto de 1 MB. */
    function aplicarRecorte(prefixo, fonte, arquivo, nome) {
        var status = document.getElementById(prefixo + '-foto3x4-status');
        var limiteKb = Number((opcoesPorPrefixo[prefixo] || {}).limiteKb) || LIMITE_FOTO_KB;

        function gravar(dataUrl) {
            var hidden = document.getElementById(prefixo + '-foto3x4');
            var prev = document.getElementById(prefixo + '-foto3x4-preview');
            if (hidden) hidden.value = dataUrl;
            if (prev) prev.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover" alt="Foto 3x4">';
            atualizarBotaoZoom(prefixo);
            if (status) {
                status.textContent = 'Foto ajustada (' + kb(dataUrl) + ' KB / teto ' + limiteKb + ' KB). Clique em Salvar para gravar.';
                status.style.color = '#16a34a';
            }
        }
        function concluir(dataUrl) {
            if (!dataUrl) return;
            if (kb(dataUrl) > limiteKb) { comprimir(dataUrl, gravar); return; }
            gravar(dataUrl);
        }
        function comprimir(origem, cb) {
            var img = new Image();
            img.onerror = function () { if (status) { status.textContent = 'Não foi possível ler a imagem.'; status.style.color = '#dc2626'; } };
            img.onload = function () {
                var alvoW = 300, alvoH = 400;
                var escala = Math.max(alvoW / img.width, alvoH / img.height);
                var w = Math.max(1, Math.round(img.width * escala)), h = Math.max(1, Math.round(img.height * escala));
                var canvas = document.createElement('canvas');
                canvas.width = alvoW; canvas.height = alvoH;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, alvoW, alvoH);
                ctx.drawImage(img, Math.round((alvoW - w) / 2), Math.round((alvoH - h) / 2), w, h);
                var qualidades = [0.92, 0.85, 0.75, 0.65, 0.5, 0.4, 0.3, 0.2, 0.1];
                var saida = canvas.toDataURL('image/jpeg', 0.1);
                for (var i = 0; i < qualidades.length; i++) {
                    var tentativa = canvas.toDataURL('image/jpeg', qualidades[i]);
                    if (kb(tentativa) <= limiteKb) { saida = tentativa; break; }
                }
                cb(saida);
            };
            img.src = origem;
        }
        if (global.Foto3x4Editor && typeof global.Foto3x4Editor.abrir === 'function') {
            global.Foto3x4Editor.abrir({
                nome: nome || 'Pessoa', fonte: fonte, largura: 300, altura: 400,
                limiteKb: limiteKb,
                aoConcluir: function (dataUrl, recortado) {
                    if (!dataUrl) return;
                    /* "Usar sem ajuste" devolve a original; comprime antes de gravar. */
                    if (!recortado) { comprimir(dataUrl, gravar); return; }
                    concluir(dataUrl);
                }
            });
        } else {
            comprimir(fonte, gravar);
        }
    }

    /* Botao de ampliar so aparece quando ha imagem no preview. */
    function atualizarBotaoZoom(prefixo) {
        var prev = document.getElementById(prefixo + '-foto3x4-preview');
        if (!prev || !prev.parentElement) return;
        var btn = prev.parentElement.querySelector('.farn-foto-ampliar');
        if (btn) btn.style.display = prev.querySelector('img') ? '' : 'none';
    }

    function arquivo(prefixo, files) {
        var arquivo = files && files[0];
        if (!arquivo) return;
        if (String(arquivo.type || '').indexOf('image/') !== 0) { alert('Escolha um arquivo de imagem.'); return; }
        if (arquivo.size > 8 * 1024 * 1024) { alert('Imagem maior que 8 MB. Escolha uma menor.'); return; }
        var status = document.getElementById(prefixo + '-foto3x4-status');
        if (status) { status.textContent = 'Ajustando foto para 3x4...'; status.style.color = '#64748b'; }
        var leitor = new FileReader();
        var nomeEl = document.getElementById(prefixo + '-nome')
            || document.getElementById(prefixo + '-edit-nome');
        var nome = nomeEl ? nomeEl.value.trim() : '';
        leitor.onload = function (ev) { aplicarRecorte(prefixo, ev.target.result, arquivo, nome); };
        leitor.onerror = function () { if (status) { status.textContent = 'Não foi possível ler o arquivo.'; status.style.color = '#dc2626'; } };
        leitor.readAsDataURL(arquivo);
    }

    /* Reabre o enquadramento de uma foto ja anexa: o usuario pode dar zoom,
       arrastar para a posicao que quiser e salvar um novo recorte 3x4. */
    function editar(prefixo) {
        var hidden = document.getElementById(prefixo + '-foto3x4');
        var prev = document.getElementById(prefixo + '-foto3x4-preview');
        var img = prev ? prev.querySelector('img') : null;
        var fonte = hidden && String(hidden.value || '').indexOf('data:') === 0
            ? String(hidden.value) : (img ? img.src : '');
        if (!fonte) { alert('Anexe uma foto antes de editar o enquadramento.'); return; }
        if (!global.Foto3x4Editor || typeof global.Foto3x4Editor.abrir !== 'function') {
            alert('Editor de foto indisponível nesta página.'); return;
        }
        var nomeEl = document.getElementById(prefixo + '-nome')
            || document.getElementById(prefixo + '-edit-nome');
        var nome = nomeEl ? nomeEl.value.trim() : '';
        aplicarRecorte(prefixo, fonte, null, nome);
    }

    function remover(prefixo) {
        var hidden = document.getElementById(prefixo + '-foto3x4');
        var input = document.getElementById(prefixo + '-foto3x4-file');
        var prev = document.getElementById(prefixo + '-foto3x4-preview');
        var status = document.getElementById(prefixo + '-foto3x4-status');
        if (hidden) hidden.value = '';
        if (input) input.value = '';
        if (prev) prev.innerHTML = '<i class="fa-solid fa-user" style="font-size:24px;color:#94a3b8"></i>';
        atualizarBotaoZoom(prefixo);
        if (status) { status.textContent = 'Foto será removida ao salvar.'; status.style.color = '#f57f17'; }
    }

    /* Retorna os campos a gravar. `reg` deve ser o objeto ja com a matricula
       e a credencial finais calculadas pelo formulario. */
    function coletar(prefixo, reg) {
        var r = reg || {};
        var hiddenFoto = document.getElementById(prefixo + '-foto3x4');
        var foto = hiddenFoto ? String(hiddenFoto.value || '').trim() : '';
        if (!foto) foto = String(r.foto3x4 || '').trim();
        if (!foto) foto = null;
        /* Ultima barreira: nada acima de 1 MB pode entrar no documento. */
        if (foto && kb(foto) > LIMITE_FOTO_KB) {
            alert('A foto passou de 1 MB e não foi gravada. Anexe a imagem novamente para ajustar o recorte.');
            foto = null;
        }
        return { foto3x4: foto, qrCode: qrValor(r) };
    }

    global.FarnPessoaCampos = {
        qrValor: qrValor,
        qrUrl: qrUrl,
        html: html,
        montar: montar,
        atualizarQr: atualizarQr,
        arquivo: arquivo,
        editar: editar,
        remover: remover,
        coletar: coletar,
        kb: kb
    };
})(typeof window !== 'undefined' ? window : this);
