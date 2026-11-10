/* ===== SECAO CERTIFICADO (ADMIN) =====
   Cada registro e um modelo de certificado: curso, declaracao, instituicao e o
   papel A4 onde a frente sera montada. Alimentam a secao Certificacoes do
   portal do formado (portais: ['formado']). */
(function () {
    if (typeof firebase === 'undefined') return;

    var COLECAO = 'certificados';
    /* A4 a ~170 dpi: serve para impressao e ainda cabe no documento. */
    var A4_RETRATO = { largura: 1414, altura: 2000 };
    var A4_PAISAGEM = { largura: 2000, altura: 1414 };
    /* O Firestore aceita no maximo 1 MiB por documento. Como o mesmo registro
       guarda frente E verso, cada papel precisa caber em ~450 KB de base64
       (≈330 KB de imagem), assim os dois juntos ficam com folga no limite. */
    var PAPEL_MAX_CHARS = 450000;
    var DOC_MAX_CHARS = 1000000;
    var ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;

    var db = null;
    var listaCache = [];
    var editarId = null;
    var papelDataUrl = '';
    var papelInfo = null;
    var papelVersoDataUrl = '';
    var papelVersoInfo = null;
    var instituicaoAtual = null;
    var cursosToken = 0;
    var carregandoLista = false;

    function banco() {
        if (!db) db = (typeof dbFirestore !== 'undefined' && dbFirestore) ? dbFirestore : firebase.firestore();
        return db;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function dataBr(iso) {
        var s = String(iso || '');
        if (!s) return '';
        var d = new Date(s);
        if (isNaN(d.getTime())) return s.slice(0, 10);
        return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    }

    function bytesDoDataUrl(url) {
        var i = String(url || '').indexOf(',');
        if (i < 0) return 0;
        return Math.round((url.length - i - 1) * 3 / 4);
    }

    function kb(chars) { return Math.round(chars / 1024) + ' KB'; }

    /* ---------- avisos do formulario ---------- */
    function aviso(texto, erro) {
        var el = document.getElementById('cert-form-msg');
        if (!el) { alert(texto); return; }
        el.innerHTML = '<i class="fa-solid ' + (erro ? 'fa-triangle-exclamation' : 'fa-circle-check') + '" style="margin-right:6px"></i>' + esc(texto);
        el.style.display = 'block';
        el.style.background = erro ? '#fef2f2' : '#f0fdf4';
        el.style.color = erro ? '#b91c1c' : '#166534';
        el.style.border = '1px solid ' + (erro ? '#fecaca' : '#bbf7d0');
    }

    function ocultarMsg() {
        var el = document.getElementById('cert-form-msg');
        if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    }

    /* ---------- lista ---------- */
    window.certInicializar = function () {
        carregarLista();
    };

    function carregarLista() {
        var lista = document.getElementById('cert-lista');
        if (!lista || carregandoLista) return;
        carregandoLista = true;
        lista.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:34px;color:#94a3b8"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px"></i><p style="margin:10px 0 0;font-size:13px">Carregando certificados...</p></div>';
        banco().collection(COLECAO).get().then(function (snap) {
            var out = [];
            snap.forEach(function (d) {
                var o = d.data() || {};
                o.id = d.id;
                out.push(o);
            });
            out.sort(function (a, b) {
                return String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || ''));
            });
            listaCache = out;
            render();
        }).catch(function (e) {
            console.error('Erro ao carregar certificados:', e);
            listaCache = [];
            lista.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:34px;color:#dc2626"><i class="fa-solid fa-triangle-exclamation" style="font-size:20px"></i><p style="margin:10px 0 0;font-size:13px">Erro ao carregar: ' + esc(e.message) + '</p></div>';
            var empty = document.getElementById('cert-empty');
            if (empty) empty.style.display = 'none';
        }).then(function () { carregandoLista = false; });
    }

    window.certRender = function () { render(); };

    function render() {
        var lista = document.getElementById('cert-lista');
        if (!lista) return;
        var busca = String(((document.getElementById('cert-busca') || {}).value) || '').trim().toLowerCase();
        var filtrados = listaCache.filter(function (r) {
            if (!busca) return true;
            var inst = r.instituicao || {};
            return [r.curso, r.declaracao, inst.razaoSocial, inst.nomeFantasia, inst.cnpj]
                .join(' ').toLowerCase().indexOf(busca) !== -1;
        });

        var badge = document.getElementById('cert-count-badge');
        if (badge) badge.textContent = filtrados.length + ' certificado' + (filtrados.length !== 1 ? 's' : '');

        var empty = document.getElementById('cert-empty');
        if (!filtrados.length) {
            lista.innerHTML = '';
            if (empty) {
                empty.style.display = 'block';
                empty.querySelector('p').textContent = listaCache.length
                    ? 'Nenhum certificado encontrado para a busca'
                    : 'Nenhum certificado criado ainda';
            }
            return;
        }
        if (empty) empty.style.display = 'none';
        lista.innerHTML = filtrados.map(cardHtml).join('');
    }

    function cardHtml(r) {
        var inst = r.instituicao || {};
        var nomeInst = inst.nomeFantasia || inst.razaoSocial || 'Instituicao nao informada';
        var paisagem = r.papelOrientacao === 'paisagem';
        var resumo = String(r.declaracao || '').replace(/\s+/g, ' ').trim();
        var portais = Array.isArray(r.portais) ? r.portais : [];
        var exForm = (typeof r.exibirFormado === 'boolean') ? r.exibirFormado : (portais.indexOf('formado') !== -1 || portais.length === 0);
        var exDoc = (typeof r.exibirDocente === 'boolean') ? r.exibirDocente : (portais.indexOf('docente') !== -1);
        var badges = '';
        if (exForm) badges += '<span style="background:#16a34a;color:#fff;font-size:9px;font-weight:800;letter-spacing:.3px;padding:3px 8px;border-radius:999px"><i class="fa-solid fa-user-graduate" style="margin-right:3px"></i>FORMADO</span>';
        if (exDoc) badges += '<span style="background:#2563eb;color:#fff;font-size:9px;font-weight:800;letter-spacing:.3px;padding:3px 8px;border-radius:999px"><i class="fa-solid fa-chalkboard-user" style="margin-right:3px"></i>DOCENTE</span>';
        if (!badges) badges = '<span style="background:#64748b;color:#fff;font-size:9px;font-weight:800;padding:3px 8px;border-radius:999px">SEM EXIBICAO</span>';
        return '<div style="background:#fff;border:1px solid #dbeafe;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(15,23,42,.06)">' +
            '<div style="position:relative;background:linear-gradient(135deg,#eff6ff,#e0e7ff);padding:14px;display:flex;justify-content:center;border-bottom:1px solid #dbeafe">' +
                '<div style="width:' + (paisagem ? '100%' : '150px') + ';max-width:' + (paisagem ? '280px' : '150px') + ';aspect-ratio:' + (paisagem ? '2000 / 1414' : '1414 / 2000') + ';background:#fff;border:1px solid #bfdbfe;border-radius:6px;overflow:hidden;box-shadow:0 4px 14px rgba(30,64,175,.18)">' +
                    (r.papel
                        ? '<img src="' + esc(r.papel) + '" alt="Papel do certificado" style="width:100%;height:100%;object-fit:cover;display:block">'
                        : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#93c5fd"><i class="fa-solid fa-file-image" style="font-size:26px"></i></div>') +
                '</div>' +
                '<div style="position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:4px;align-items:flex-end">' + badges + '</div>' +
            '</div>' +
            '<div style="padding:14px 16px;flex:1;display:flex;flex-direction:column;gap:7px">' +
                '<div style="font-size:14px;font-weight:800;color:#1e3a8a;line-height:1.35">' + esc(r.curso || 'Sem curso') + '</div>' +
                '<div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:5px"><i class="fa-solid fa-building-columns" style="color:#1d4ed8"></i>' + esc(nomeInst) + '</div>' +
                '<div style="font-size:12px;color:#475569;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">' + esc(resumo || 'Sem declaracao') + '</div>' +
                '<div style="margin-top:auto;padding-top:8px;border-top:1px solid #eff6ff;display:flex;align-items:center;gap:8px;font-size:10px;color:#94a3b8">' +
                    '<i class="fa-regular fa-calendar"></i>' + esc(dataBr(r.atualizadoEm || r.criadoEm)) +
                    '<span style="margin-left:auto">' + esc(kb(String(r.papel || '').length)) + ' no papel</span>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;padding:0 16px 14px;flex-wrap:wrap">' +
                '<button class="btn-icon btn-info" title="Visualizar" onclick="certAbrirVer(\'' + esc(r.id) + '\')"><i class="fa-solid fa-eye"></i></button>' +
                '<button class="btn-icon" title="Editar" onclick="certAbrirForm(\'' + esc(r.id) + '\')"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="certExcluir(\'' + esc(r.id) + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div>' +
        '</div>';
    }

    /* ---------- cursos ---------- */
    function cursosCarregar(selecionado) {
        var sel = document.getElementById('cert-curso');
        if (!sel) return;
        /* Cada abertura incrementa o token: uma leitura antiga nao pode
           desenhar por cima da selecao atual. */
        var token = ++cursosToken;
        sel.innerHTML = '<option value="">Carregando cursos...</option>';
        sel.disabled = true;
        banco().collection('cursos').orderBy('nome').get().then(function (snap) {
            if (token !== cursosToken) return;
            var html = '<option value="">Selecione o curso...</option>';
            var nomes = [];
            snap.forEach(function (d) {
                var c = d.data() || {};
                var nome = String(c.nome || '').trim();
                if (!nome || nomes.indexOf(nome) !== -1) return;
                nomes.push(nome);
                var extra = '';
                if (c.tipo) extra += ' — ' + c.tipo;
                if (c.cargaHoraria != null && c.cargaHoraria !== '') extra += ' (' + c.cargaHoraria + 'h)';
                html += '<option value="' + esc(nome) + '" data-id="' + esc(d.id) + '">' + esc(nome + extra) + '</option>';
            });
            sel.innerHTML = html;
            sel.disabled = false;
            if (selecionado && nomes.indexOf(selecionado) !== -1) sel.value = selecionado;
            var hint = document.getElementById('cert-curso-hint');
            if (hint) {
                hint.innerHTML = nomes.length
                    ? '<i class="fa-solid fa-circle-info" style="margin-right:4px"></i>' + nomes.length + ' curso(s) da secao Cursos do administrador.'
                    : '<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px"></i>Nenhum curso cadastrado. Cadastre em <strong>Cursos</strong> antes de criar o certificado.';
                hint.style.color = nomes.length ? '#64748b' : '#b45309';
            }
        }).catch(function (e) {
            if (token !== cursosToken) return;
            console.error('Erro ao carregar cursos:', e);
            sel.innerHTML = '<option value="">Erro ao carregar cursos</option>';
            sel.disabled = false;
            aviso('Erro ao carregar os cursos: ' + e.message, true);
        });
    }

    /* ---------- instituicao ---------- */
    function instituicaoCarregar(forcar) {
        var box = document.getElementById('cert-inst-box');
        if (box) box.innerHTML = '<div style="padding:16px;color:#64748b;font-size:12px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Lendo os dados da instituicao...</div>';
        /* O mesmo accessor da Ficha Geral: le configuracoes/instituicao uma vez,
           guarda em cache e devolve so os campos que podem sair impressos —
           a senha do administrador nunca entra no certificado. */
        fichaGeralCarregarInstituicao(!!forcar).then(function () {
            instituicaoAtual = fichaGeralDadosInstituicao();
            pintarInstituicao();
        });
    }

    function pintarInstituicao() {
        var box = document.getElementById('cert-inst-box');
        if (!box) return;
        var d = instituicaoAtual || {};
        if (!d.razaoSocial && !d.nomeFantasia) {
            box.innerHTML = '<div style="padding:18px;text-align:center">' +
                '<i class="fa-solid fa-building-columns" style="font-size:26px;color:#f59e0b"></i>' +
                '<p style="margin:10px 0 4px;font-size:13px;font-weight:700;color:#92400e">Instituicao ainda nao cadastrada</p>' +
                '<p style="margin:0 0 12px;font-size:12px;color:#78350f;line-height:1.6">O certificado usa os dados de Configuracoes &rsaquo; Instituicao. Cadastre-os para continuar.</p>' +
                '<button type="button" class="btn-outline btn-sm" onclick="certAbrirConfigInstituicao()"><i class="fa-solid fa-gear"></i> Abrir Instituicao</button>' +
                '</div>';
            return;
        }
        var linha = function (rotulo, valor, icone) {
            if (!valor) return '';
            return '<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid #eff6ff">' +
                '<i class="fa-solid ' + icone + '" style="color:#1d4ed8;font-size:11px;margin-top:3px;width:14px"></i>' +
                '<span style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;min-width:88px">' + rotulo + '</span>' +
                '<span style="font-size:12px;color:#1e293b;font-weight:600;flex:1;word-break:break-word">' + esc(valor) + '</span>' +
                '</div>';
        };
        box.innerHTML = '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
            '<div style="width:64px;height:64px;flex:0 0 64px;border-radius:12px;background:#fff;border:1px solid #dbeafe;display:flex;align-items:center;justify-content:center;overflow:hidden">' +
                (d.logo ? '<img src="' + esc(d.logo) + '" alt="Logo da instituicao" style="width:100%;height:100%;object-fit:contain">' : '<i class="fa-solid fa-building-columns" style="color:#93c5fd;font-size:22px"></i>') +
            '</div>' +
            '<div style="flex:1;min-width:220px">' +
                linha('Razao social', d.razaoSocial, 'fa-file-signature') +
                linha('Nome fantasia', d.nomeFantasia, 'fa-building') +
                linha('CNPJ', d.cnpj, 'fa-id-card') +
                linha('Telefone', d.fone, 'fa-phone') +
                linha('E-mail', d.email, 'fa-envelope') +
            '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
            '<button type="button" class="btn-outline btn-sm" onclick="certInstituicaoAtualizar(true)"><i class="fa-solid fa-rotate"></i> Reler instituicao</button>' +
            '<button type="button" class="btn-outline btn-sm" onclick="certAbrirConfigInstituicao()"><i class="fa-solid fa-gear"></i> Editar em Configuracoes</button>' +
        '</div>';
    }

    window.certInstituicaoAtualizar = function (forcar) { instituicaoCarregar(!!forcar); };

    window.certAbrirConfigInstituicao = function () {
        if (typeof configInstituicaoOpen === 'function') configInstituicaoOpen();
        else alert('Abra Configuracoes > Instituicao para cadastrar os dados.');
    };

    /* ---------- papel A4 ---------- */
    function comprimirPapel(file) {
        return new Promise(function (resolve, reject) {
            if (!/^image\//.test(file.type || '')) { reject(new Error('Selecione um arquivo de imagem (PNG ou JPG).')); return; }
            if (file.size > ARQUIVO_MAX_BYTES) { reject(new Error('Imagem muito grande. Maximo 10 MB.')); return; }
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('Falha ao ler o arquivo.')); };
            reader.onload = function (ev) {
                var img = new Image();
                img.onerror = function () { reject(new Error('Nao foi possivel abrir a imagem.')); };
                img.onload = function () {
                    try {
                        var base = img.width > img.height ? A4_PAISAGEM : A4_RETRATO;
                        /* Escada de qualidade e, no fim, de tamanho: a proporcao A4
                           se mantem em todas as tentativas para o papel sair correto. */
                        var tentativas = [[1, 0.92], [1, 0.85], [1, 0.78], [1, 0.7], [1, 0.6], [1, 0.5], [0.8, 0.6], [0.8, 0.5], [0.65, 0.55], [0.5, 0.6], [0.4, 0.65], [0.3, 0.7]];
                        var saida = '';
                        var w = 0, h = 0;
                        for (var i = 0; i < tentativas.length; i++) {
                            w = Math.max(1, Math.round(base.largura * tentativas[i][0]));
                            h = Math.max(1, Math.round(base.altura * tentativas[i][0]));
                            var canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            var ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, w, h);
                            /* contain: a arte enviada nunca e cortada, o que sobra vira margem branca. */
                            var escala = Math.min(w / img.width, h / img.height);
                            var dw = Math.max(1, Math.round(img.width * escala));
                            var dh = Math.max(1, Math.round(img.height * escala));
                            ctx.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
                            saida = canvas.toDataURL('image/jpeg', tentativas[i][1]);
                            if (saida.length <= PAPEL_MAX_CHARS) break;
                        }
                        resolve({
                            dataUrl: saida,
                            largura: w,
                            altura: h,
                            orientacao: w > h ? 'paisagem' : 'retrato',
                            original: { largura: img.width, altura: img.height, nome: file.name || '' }
                        });
                    } catch (e) { reject(e); }
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function pintarPapel() {
        var img = document.getElementById('cert-papel-img');
        var vazio = document.getElementById('cert-papel-vazio');
        var status = document.getElementById('cert-papel-status');
        var remover = document.getElementById('cert-papel-remover');
        var moldura = document.getElementById('cert-papel-moldura');
        if (moldura) {
            var paisagem = papelInfo && papelInfo.orientacao === 'paisagem';
            moldura.style.aspectRatio = paisagem ? '2000 / 1414' : '1414 / 2000';
            moldura.style.width = paisagem ? '100%' : '210px';
            moldura.style.maxWidth = '100%';
        }
        if (img) {
            if (papelDataUrl) { img.src = papelDataUrl; img.style.display = 'block'; }
            else { img.removeAttribute('src'); img.style.display = 'none'; }
        }
        if (vazio) vazio.style.display = papelDataUrl ? 'none' : 'flex';
        if (remover) remover.style.display = papelDataUrl ? 'inline-flex' : 'none';
        if (status) {
            if (!papelInfo) {
                status.innerHTML = 'Anexe a imagem do papel. Ela e ajustada para A4 (210 &times; 297 mm) sem cortar a arte.';
                status.style.color = '#64748b';
            } else {
                var peso = bytesDoDataUrl(papelDataUrl);
                var apertado = papelDataUrl.length > PAPEL_MAX_CHARS;
                status.innerHTML = '<i class="fa-solid fa-circle-check" style="margin-right:4px"></i>A4 ' + papelInfo.orientacao +
                    ' &middot; ' + papelInfo.largura + '&times;' + papelInfo.altura + ' px &middot; ' + kb(peso) +
                    (papelInfo.original && papelInfo.original.nome ? ' &middot; origem ' + esc(papelInfo.original.nome) + ' (' + papelInfo.original.largura + '&times;' + papelInfo.original.altura + ')' : '') +
                    (apertado ? ' &middot; <strong>imagem pesada, reanexe para reduzir</strong>' : '');
                status.style.color = apertado ? '#b91c1c' : '#166534';
            }
        }
    }

    window.certPapelSelecionar = function (input) {
        var file = input && input.files && input.files[0];
        if (!file) return;
        ocultarMsg();
        var status = document.getElementById('cert-papel-status');
        if (status) { status.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i>Ajustando a imagem para A4...'; status.style.color = '#1d4ed8'; }
        comprimirPapel(file).then(function (r) {
            papelDataUrl = r.dataUrl;
            papelInfo = r;
            pintarPapel();
            if (r.dataUrl.length > PAPEL_MAX_CHARS) aviso('A imagem ficou pesada demais para o papel. Use uma arte mais simples ou com menos detalhes.', true);
        }).catch(function (e) {
            console.error('Erro no papel do certificado:', e);
            papelDataUrl = '';
            papelInfo = null;
            pintarPapel();
            aviso(e.message || 'Nao foi possivel ler a imagem.', true);
        }).then(function () { if (input) input.value = ''; });
    };

    window.certPapelRemover = function () {
        papelDataUrl = '';
        papelInfo = null;
        var input = document.getElementById('cert-papel-file');
        if (input) input.value = '';
        pintarPapel();
    };

    function pintarPapelVerso() {
        var img = document.getElementById('cert-papel-verso-img');
        var vazio = document.getElementById('cert-papel-verso-vazio');
        var status = document.getElementById('cert-papel-verso-status');
        var remover = document.getElementById('cert-papel-verso-remover');
        var moldura = document.getElementById('cert-papel-verso-moldura');
        if (moldura) {
            var paisagem = papelVersoInfo && papelVersoInfo.orientacao === 'paisagem';
            moldura.style.aspectRatio = paisagem ? '2000 / 1414' : '1414 / 2000';
            moldura.style.width = paisagem ? '100%' : '210px';
            moldura.style.maxWidth = paisagem ? '320px' : '210px';
        }
        if (img) {
            if (papelVersoDataUrl) { img.src = papelVersoDataUrl; img.style.display = 'block'; }
            else { img.removeAttribute('src'); img.style.display = 'none'; }
        }
        if (vazio) vazio.style.display = papelVersoDataUrl ? 'none' : 'flex';
        if (remover) remover.style.display = papelVersoDataUrl ? 'inline-flex' : 'none';
        if (status) {
            if (!papelVersoInfo) {
                status.innerHTML = 'Opcional: anexe a imagem do verso do certificado (A4, sem cortar a arte).';
                status.style.color = '#64748b';
            } else {
                var peso = bytesDoDataUrl(papelVersoDataUrl);
                var apertado = papelVersoDataUrl.length > PAPEL_MAX_CHARS;
                status.innerHTML = '<i class="fa-solid fa-circle-check" style="margin-right:4px"></i>A4 ' + papelVersoInfo.orientacao +
                    ' &middot; ' + papelVersoInfo.largura + '&times;' + papelVersoInfo.altura + ' px &middot; ' + kb(peso) +
                    (papelVersoInfo.original && papelVersoInfo.original.nome ? ' &middot; origem ' + esc(papelVersoInfo.original.nome) + ' (' + papelVersoInfo.original.largura + '&times;' + papelVersoInfo.original.altura + ')' : '') +
                    (apertado ? ' &middot; <strong>imagem pesada, reanexe para reduzir</strong>' : '');
                status.style.color = apertado ? '#b91c1c' : '#166534';
            }
        }
    }

    window.certPapelVersoSelecionar = function (input) {
        var file = input && input.files && input.files[0];
        if (!file) return;
        ocultarMsg();
        var status = document.getElementById('cert-papel-verso-status');
        if (status) { status.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i>Ajustando a imagem para A4...'; status.style.color = '#1d4ed8'; }
        comprimirPapel(file).then(function (r) {
            papelVersoDataUrl = r.dataUrl;
            papelVersoInfo = r;
            pintarPapelVerso();
            if (r.dataUrl.length > PAPEL_MAX_CHARS) aviso('A imagem do verso ficou pesada demais para o papel. Use uma arte mais simples ou com menos detalhes.', true);
        }).catch(function (e) {
            console.error('Erro no papel verso do certificado:', e);
            papelVersoDataUrl = '';
            papelVersoInfo = null;
            pintarPapelVerso();
            aviso(e.message || 'Nao foi possivel ler a imagem do verso.', true);
        }).then(function () { if (input) input.value = ''; });
    };

    window.certPapelVersoRemover = function () {
        papelVersoDataUrl = '';
        papelVersoInfo = null;
        var input = document.getElementById('cert-papel-verso-file');
        if (input) input.value = '';
        pintarPapelVerso();
    };

    /* ---------- formulario ---------- */
    window.certAbrirForm = function (id) {
        editarId = id || null;
        ocultarMsg();
        papelDataUrl = '';
        papelInfo = null;
        papelVersoDataUrl = '';
        papelVersoInfo = null;

        var titulo = document.getElementById('cert-form-titulo');
        if (titulo) titulo.textContent = id ? 'Editar Certificado' : 'Criar Certificado';
        var dec = document.getElementById('cert-declaracao');
        if (dec) dec.value = '';
        var input = document.getElementById('cert-papel-file');
        if (input) input.value = '';
        var inputVerso = document.getElementById('cert-papel-verso-file');
        if (inputVerso) inputVerso.value = '';
        var busca = document.getElementById('cert-busca');
        var chkFormado = document.getElementById('cert-exibir-formado');
        var chkDocente = document.getElementById('cert-exibir-docente');
        // defaults para novo: formado marcado, docente desmarcado (comportamento anterior)
        if (chkFormado) chkFormado.checked = true;
        if (chkDocente) chkDocente.checked = false;

        var reg = null;
        if (id) {
            reg = listaCache.filter(function (r) { return r.id === id; })[0] || null;
            if (!reg) { alert('Certificado nao encontrado na lista. Atualize a secao e tente de novo.'); return; }
            if (dec) dec.value = reg.declaracao || '';
            if (reg.papel) {
                papelDataUrl = reg.papel;
                papelInfo = {
                    dataUrl: reg.papel,
                    largura: reg.papelLargura || 0,
                    altura: reg.papelAltura || 0,
                    orientacao: reg.papelOrientacao || (reg.papelLargura > reg.papelAltura ? 'paisagem' : 'retrato')
                };
            }
            if (reg.papelVerso) {
                papelVersoDataUrl = reg.papelVerso;
                papelVersoInfo = {
                    dataUrl: reg.papelVerso,
                    largura: reg.papelVersoLargura || 0,
                    altura: reg.papelVersoAltura || 0,
                    orientacao: reg.papelVersoOrientacao || (reg.papelVersoLargura > reg.papelVersoAltura ? 'paisagem' : 'retrato')
                };
            }
            instituicaoAtual = reg.instituicao ? {
                razaoSocial: reg.instituicao.razaoSocial || '',
                nomeFantasia: reg.instituicao.nomeFantasia || '',
                cnpj: reg.instituicao.cnpj || '',
                fone: reg.instituicao.fone || '',
                email: reg.instituicao.email || '',
                logo: ''
            } : null;
            // restaurar permissoes (compat: registros antigos tinham portais:['formado'])
            var portais = Array.isArray(reg.portais) ? reg.portais : [];
            var exForm = (typeof reg.exibirFormado === 'boolean') ? reg.exibirFormado : (portais.indexOf('formado') !== -1 || portais.length === 0);
            var exDoc = (typeof reg.exibirDocente === 'boolean') ? reg.exibirDocente : (portais.indexOf('docente') !== -1);
            if (chkFormado) chkFormado.checked = !!exForm;
            if (chkDocente) chkDocente.checked = !!exDoc;
        }

        cursosCarregar(reg ? reg.curso : '');
        pintarPapel();
        pintarPapelVerso();
        if (instituicaoAtual) pintarInstituicao();
        else instituicaoCarregar(false);
        if (busca) busca.blur();

        var ov = document.getElementById('cert-form-overlay');
        if (ov) ov.classList.remove('hidden');
        var corpo = ov ? ov.querySelector('.modal-body') : null;
        if (corpo) corpo.scrollTop = 0;
    };

    window.certFecharForm = function () {
        var ov = document.getElementById('cert-form-overlay');
        if (ov) ov.classList.add('hidden');
        ocultarMsg();
        editarId = null;
    };

    function montarDados() {
        var sel = document.getElementById('cert-curso');
        var opt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
        var dec = document.getElementById('cert-declaracao');
        var inst = instituicaoAtual || {};
        var agora = new Date().toISOString();
        var autor = 'Administrador';
        if (typeof currentUserData !== 'undefined' && currentUserData) autor = currentUserData.nome || currentUserData.usuario || autor;
        var original = editarId ? (listaCache.filter(function (r) { return r.id === editarId; })[0] || null) : null;
        var chkFormado = document.getElementById('cert-exibir-formado');
        var chkDocente = document.getElementById('cert-exibir-docente');
        var exibirFormado = chkFormado ? chkFormado.checked : true;
        var exibirDocente = chkDocente ? chkDocente.checked : false;
        var portais = [];
        if (exibirFormado) portais.push('formado');
        if (exibirDocente) portais.push('docente');
        return {
            curso: sel ? String(sel.value || '').trim() : '',
            cursoId: opt ? String(opt.getAttribute('data-id') || '') : '',
            declaracao: dec ? String(dec.value || '').trim() : '',
            /* So os dados que podem sair impressos. O logo continua morando em
               configuracoes/instituicao e e lido de la na montagem da frente:
               repeti-lo aqui, junto do papel, estouraria o 1 MiB do documento. */
            instituicao: {
                razaoSocial: String(inst.razaoSocial || '').trim(),
                nomeFantasia: String(inst.nomeFantasia || '').trim(),
                cnpj: String(inst.cnpj || '').trim(),
                fone: String(inst.fone || '').trim(),
                email: String(inst.email || '').trim()
            },
            papel: papelDataUrl,
            papelLargura: papelInfo ? papelInfo.largura : 0,
            papelAltura: papelInfo ? papelInfo.altura : 0,
            papelOrientacao: papelInfo ? papelInfo.orientacao : '',
            papelVerso: papelVersoDataUrl,
            papelVersoLargura: papelVersoInfo ? papelVersoInfo.largura : 0,
            papelVersoAltura: papelVersoInfo ? papelVersoInfo.altura : 0,
            papelVersoOrientacao: papelVersoInfo ? papelVersoInfo.orientacao : '',
            exibirFormado: exibirFormado,
            exibirDocente: exibirDocente,
            portais: portais,
            criadoEm: original ? (original.criadoEm || agora) : agora,
            criadoPor: original ? (original.criadoPor || autor) : autor,
            atualizadoEm: agora,
            atualizadoPor: autor
        };
    }

    window.certSalvar = function (event) {
        if (event) event.preventDefault();
        ocultarMsg();
        var dados = montarDados();
        if (!dados.curso) { aviso('Selecione o curso.', true); return false; }
        if (!dados.declaracao) { aviso('Escreva a declaracao do certificado.', true); return false; }
        if (!dados.instituicao.razaoSocial && !dados.instituicao.nomeFantasia) {
            aviso('Cadastre a instituicao em Configuracoes > Instituicao antes de criar o certificado.', true);
            return false;
        }
        if (!dados.papel) { aviso('Anexe o papel A4 do certificado.', true); return false; }
        if (!dados.exibirFormado && !dados.exibirDocente) {
            if (!confirm('Nenhum portal marcado para exibir este certificado. Deseja salvar mesmo assim (ele não aparecerá nos portais)?')) return false;
        }
        var chars = JSON.stringify(dados).length;
        if (chars > DOC_MAX_CHARS) {
            var partes = 'frente ' + kb(String(dados.papel || '').length);
            if (dados.papelVerso) partes += ' + verso ' + kb(String(dados.papelVerso).length);
            aviso('O registro ficaria com ' + kb(chars) + ' (' + partes + '), acima do limite de 1 MiB do Firestore. ' +
                'Isso acontece quando frente e verso sao grandes. Reanexe as imagens (elas sao reajustadas automaticamente) ou use uma arte mais leve.', true);
            return false;
        }

        var btn = document.getElementById('cert-salvar-btn');
        var rotuloOriginal = btn ? btn.innerHTML : '';
        function restaurar() { if (btn) { btn.disabled = false; btn.innerHTML = rotuloOriginal; } }
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SALVANDO...'; }

        var alvo = editarId ? banco().collection(COLECAO).doc(editarId) : null;
        var promessa = alvo ? alvo.set(dados, { merge: true }) : banco().collection(COLECAO).add(dados);
        promessa.then(function () {
            restaurar();
            alert('Certificado salvo com sucesso!');
            certFecharForm();
            carregarLista();
        }).catch(function (e) {
            restaurar();
            console.error('Erro ao salvar certificado:', e);
            aviso('Erro ao salvar: ' + e.message, true);
        });
        return false;
    };

    /* ---------- visualizar ---------- */
    window.certAbrirVer = function (id) {
        var r = listaCache.filter(function (x) { return x.id === id; })[0];
        if (!r) { alert('Certificado nao encontrado na lista.'); return; }
        var inst = r.instituicao || {};
        var img = document.getElementById('cert-ver-papel');
        var moldura = document.getElementById('cert-ver-moldura');
        var paisagem = r.papelOrientacao === 'paisagem';
        if (moldura) moldura.style.aspectRatio = paisagem ? '2000 / 1414' : '1414 / 2000';
        if (img) {
            if (r.papel) { img.src = r.papel; img.style.display = 'block'; }
            else { img.removeAttribute('src'); img.style.display = 'none'; }
        }
        var imgVerso = document.getElementById('cert-ver-papel-verso');
        var molduraVerso = document.getElementById('cert-ver-moldura-verso');
        var wrapVerso = document.getElementById('cert-ver-verso-wrap');
        var versoPaisagem = r.papelVersoOrientacao === 'paisagem';
        if (molduraVerso) molduraVerso.style.aspectRatio = versoPaisagem ? '2000 / 1414' : '1414 / 2000';
        if (imgVerso) {
            if (r.papelVerso) { imgVerso.src = r.papelVerso; imgVerso.style.display = 'block'; }
            else { imgVerso.removeAttribute('src'); imgVerso.style.display = 'none'; }
        }
        if (wrapVerso) wrapVerso.style.display = r.papelVerso ? 'flex' : 'none';
        var titulo = document.getElementById('cert-ver-titulo');
        if (titulo) titulo.textContent = r.curso || 'Certificado';
        var dados = document.getElementById('cert-ver-dados');
        if (dados) {
            var portais = Array.isArray(r.portais) ? r.portais : [];
            var exForm = (typeof r.exibirFormado === 'boolean') ? r.exibirFormado : (portais.indexOf('formado') !== -1 || portais.length === 0);
            var exDoc = (typeof r.exibirDocente === 'boolean') ? r.exibirDocente : (portais.indexOf('docente') !== -1);
            var onde = [];
            if (exForm) onde.push('<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px"><i class="fa-solid fa-user-graduate" style="margin-right:4px"></i>Portal do Formado</span>');
            if (exDoc) onde.push('<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px"><i class="fa-solid fa-chalkboard-user" style="margin-right:4px"></i>Portal do Docente</span>');
            if (!onde.length) onde.push('<span style="color:#94a3b8">Nenhum portal selecionado</span>');
            dados.innerHTML =
                '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Curso</div>' +
                '<div style="font-size:15px;font-weight:800;color:#1e3a8a;margin-bottom:14px">' + esc(r.curso || '-') + '</div>' +
                '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Exibido em</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' + onde.join('') + '</div>' +
                '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Declaracao</div>' +
                '<div style="font-size:13px;color:#334155;line-height:1.75;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px">' + esc(r.declaracao || '-') + '</div>' +
                '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Instituicao</div>' +
                '<div style="font-size:13px;color:#334155;line-height:1.7">' +
                    '<strong>' + esc(inst.nomeFantasia || inst.razaoSocial || '-') + '</strong>' +
                    (inst.razaoSocial && inst.nomeFantasia ? '<br>' + esc(inst.razaoSocial) : '') +
                    (inst.cnpj ? '<br>CNPJ: ' + esc(inst.cnpj) : '') +
                    (inst.fone ? '<br>Tel: ' + esc(inst.fone) : '') +
                    (inst.email ? '<br>' + esc(inst.email) : '') +
                '</div>' +
                '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">' +
                    'Criado em ' + esc(dataBr(r.criadoEm)) + ' por ' + esc(r.criadoPor || '-') +
                    '<br>Atualizado em ' + esc(dataBr(r.atualizadoEm)) + ' por ' + esc(r.atualizadoPor || '-') +
                    '<br>Papel A4 ' + esc(r.papelOrientacao || '-') + (r.papelLargura ? ' &middot; ' + esc(r.papelLargura) + '&times;' + esc(r.papelAltura) + ' px' : '') +
                    (r.papelVerso ? '<br>Papel verso ' + esc(r.papelVersoOrientacao || '-') + (r.papelVersoLargura ? ' &middot; ' + esc(r.papelVersoLargura) + '&times;' + esc(r.papelVersoAltura) + ' px' : '') : '<br>Sem papel verso') +
                '</div>';
        }
        var ov = document.getElementById('cert-ver-overlay');
        if (ov) ov.classList.remove('hidden');
        var corpo = ov ? ov.querySelector('.modal-body') : null;
        if (corpo) corpo.scrollTop = 0;
    };

    window.certFecharVer = function () {
        var ov = document.getElementById('cert-ver-overlay');
        if (ov) ov.classList.add('hidden');
    };

    window.certExcluir = function (id) {
        var r = listaCache.filter(function (x) { return x.id === id; })[0];
        var nome = r ? (r.curso || 'sem curso') : '';
        if (!confirm('Excluir este certificado' + (nome ? ' de "' + nome + '"' : '') + '?\n\nEle deixa de aparecer nos portais onde estava habilitado.')) return;
        banco().collection(COLECAO).doc(id).delete().then(function () {
            carregarLista();
        }).catch(function (e) {
            console.error('Erro ao excluir certificado:', e);
            alert('Erro ao excluir: ' + e.message);
        });
    };
})();