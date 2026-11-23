/* =====================================================================
   APONTAMENTOS ADM - apontamento manual de presença do docente na aula
   ---------------------------------------------------------------------
   Campos espelham o "criar disciplina e aula" do Cadastro de Cursos.
   Cada registro guarda o docente (docentesAdmin), o curso, a aula e a
   localização capturada pelo GPS do navegador. Nada é gravado dentro de
   cursosCadastro: a aula existente é referenciada pelo aulaId. O QR de início
   da aula, quando lido pela Coordenação, também fica no registro.
   ===================================================================== */
(function () {
    'use strict';

    var P = 'aptadm';
    var COLECAO = 'apontamentosAdm';

    var cache = [];
    var docentes = [];
    var cursos = [];
    var aulasCache = {};
    var discCache = {};
    var editando = null;
    var localAtual = null;
    var apontando = null;
    var presencas = {};
    var alunos = [];
    var verAtual = null;
    var localAtualRegistro = null;
    var carregando = false;
    var coordenadoresCpfs = [];
    var qrAtual = null;
    var qrScanner = null;
    var qrEscaneando = false;
    var aulaIndex = {};
    var aulasEmCarga = {};

    function db() {
        if (typeof dbFirestore !== 'undefined' && dbFirestore) return dbFirestore;
        if (typeof ccDb === 'function') return ccDb();
        return null;
    }
    function el(sufixo) { return document.getElementById(P + '-' + sufixo); }
    function esc(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function pode(chave, acao) {
        if (typeof admPermItem === 'function') return admPermItem(chave, acao || 'ver');
        return true;
    }
    function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function ehCoordenador() {
        var u = (typeof currentUserData !== 'undefined') ? currentUserData : null;
        if (!u) return false;
        if (u._origem === 'coordenacao') return true;
        var cpf = digitos(u.cpf);
        return !!(cpf && coordenadoresCpfs.indexOf(cpf) >= 0);
    }
    /* A leitura do QR de início de aula é uma ação de conferência da
       Coordenação. Docente e demais perfis não recebem o botão ativo. */
    function podeCapturarQr() { return ehCoordenador(); }
    function fmtData(v) {
        if (!v) return '-';
        try { return new Date(v).toLocaleString('pt-BR'); } catch (e) { return String(v); }
    }
    function hoje() {
        var d = new Date(), m = String(d.getMonth() + 1).padStart(2, '0'), x = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + x;
    }
    function norm(v) {
        return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }
    function nomeDocente(docenteId) {
        var d = docentes.find(function (x) { return String(x.id) === String(docenteId || ''); });
        return d ? d.nome : '';
    }
    function aulaEhDoDocente(a, docenteId) {
        if (!a) return false;
        if (docenteId && String(a.docenteId || '') === String(docenteId)) return true;
        var nome = norm(nomeDocente(docenteId));
        return !!(nome && norm(a.docente || a.docenteNome || '') === nome);
    }
    function disciplinaEhDoDocente(x, docenteId) {
        if (!x) return false;
        if (docenteId && String(x.docenteId || '') === String(docenteId)) return true;
        var nome = norm(nomeDocente(docenteId));
        return !!(nome && norm(x.docente || x.docenteNome || '') === nome);
    }
    function dona(reg) {
        return (reg && (reg.docenteNome || reg.docente)) || 'Docente não informado';
    }
    function temLocal(reg) {
        var l = reg && reg.localizacao;
        return !!(l && typeof l.latitude === 'number' && typeof l.longitude === 'number');
    }
    function coords(reg) {
        var l = reg && reg.localizacao;
        if (!temLocal(reg)) return '';
        return Number(l.latitude).toFixed(6) + ', ' + Number(l.longitude).toFixed(6);
    }
    function mapaHtml(lat, lon) {
        var d = 0.0025;
        var bbox = (lon - d) + '%2C' + (lat - d) + '%2C' + (lon + d) + '%2C' + (lat + d);
        var src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat + '%2C' + lon;
        var link = 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon;
        return '<iframe title="Mapa do local do apontamento" src="' + src + '" '
            + 'style="width:100%;height:340px;border:1px solid #cbd5e1;border-radius:10px" loading="lazy"></iframe>'
            + '<div style="margin-top:8px;font-size:12px"><a href="' + link + '" target="_blank" rel="noopener">Abrir no Google Maps</a></div>';
    }

    /* ------------------------------ CARGA ------------------------------ */

    async function carregarTudo() {
        var d = db();
        if (!d) {
            var tb0 = el('tbody');
            if (tb0) tb0.innerHTML = '<tr><td colspan="5" style="color:#dc2626">Firebase não conectado. Recarregue a página.</td></tr>';
            return;
        }
        carregando = true;
        try {
            var snapD = await d.collection('docentesAdmin').get();
            docentes = [];
            snapD.forEach(function (x) {
                var v = x.data() || {};
                docentes.push({ id: x.id, nome: v.nome || 'Docente sem nome', cpf: v.cpf || '', matricula: v.matricula || '' });
            });
            docentes.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });

            var snapC = await d.collection('cursosCadastro').get();
            cursos = [];
            snapC.forEach(function (x) {
                var v = x.data() || {};
                cursos.push({ id: x.id, nome: v.nome || x.id, docenteId: String(v.docenteResponsavelId || '') });
            });
            cursos.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });

            try {
                var snapCoord = await d.collection('coordenacao').get();
                coordenadoresCpfs = [];
                snapCoord.forEach(function (x) {
                    var cpf = digitos((x.data() || {}).cpf);
                    if (cpf) coordenadoresCpfs.push(cpf);
                });
            } catch (e) {
                coordenadoresCpfs = [];
            }

            /* Carrega disciplinas e aulas subordinadas aos cursos para que o
               select de Apontamento ADM mostre também as aulas cujo docente é
               o selecionado na guia Disciplina e Aulas do Cadastro de Cursos. */
            await carregarTodasAulas();

            var snapR = await d.collection(COLECAO).orderBy('criadoEm', 'desc').limit(300).get();
            cache = [];
            snapR.forEach(function (x) { cache.push(Object.assign({ _id: x.id }, x.data() || {})); });
        } catch (e) {
            console.error('apontAdm: erro ao carregar', e);
            var tb1 = el('tbody');
            if (tb1) tb1.innerHTML = '<tr><td colspan="5" style="color:#dc2626">' + esc(e && e.message ? e.message : e) + '</td></tr>';
        } finally {
            carregando = false;
        }
        render();
    }

    async function inicializar() {
        if (!pode('sec:apontamentosAdm', 'ver')) return;
        await carregarTudo();
    }

    /* ------------------------------- LISTA ------------------------------ */

    function render() {
        var tb = el('tbody');
        if (!tb) return;
        var termo = norm((el('busca') || {}).value || '');
        var lista = cache.filter(function (r) {
            if (!termo) return true;
            return norm([dona(r), r.cursoNome, r.disciplina, r.aula, r.dataAula, coords(r), r.aulaId].join(' ')).indexOf(termo) >= 0;
        });
        var cnt = el('count'); if (cnt) cnt.textContent = lista.length + ' registro(s)';

        if (!lista.length) {
            tb.innerHTML = '<tr><td colspan="5" style="color:#94a3b8;font-size:12px">'
                + (carregando ? 'Carregando...' : 'Nenhum apontamento manual encontrado.') + '</td></tr>';
            return;
        }

        var podeEditar = pode('aptadm:edicao', 'editar');
        var podeExcluir = pode('aptadm:exclusao', 'editar');
        var podeImprimir = pode('aptadm:impressao', 'editar');

        tb.innerHTML = lista.map(function (r) {
            var id = esc(r._id);
            var disciplina = r.disciplina || '-';
            var aula = r.aula || r.conteudo || (r.aulaId ? 'Aula ' + r.aulaId : '-');
            var acoes = ''
                + '<button class="btn-icon btn-info" title="Visualizar registro" onclick="apontAdmVer(\'' + id + '\')"><i class="fa-solid fa-eye"></i></button>'
                + '<button class="btn-icon" title="REGISTRO DE LOCAL" style="color:#16a34a;border-color:#16a34a" onclick="apontAdmVerLocal(\'' + id + '\')"><i class="fa-solid fa-map-location-dot"></i></button>'
                + '<button class="btn-outline btn-sm" title="Apontar alunos" onclick="apontAdmAbrirApontamento(\'' + id + '\')"><i class="fa-solid fa-clipboard-check"></i> APONTAR</button>'
                + (podeEditar ? '<button class="btn-icon" title="Editar" onclick="apontAdmEditar(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>' : '')
                + (podeImprimir ? '<button class="btn-icon" title="Imprimir" onclick="apontAdmImprimir(\'' + id + '\')"><i class="fa-solid fa-print"></i></button>' : '')
                + (podeExcluir ? '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="apontAdmExcluir(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>' : '');
            return '<tr>'
                + '<td><b style="font-size:12px">' + esc(dona(r)) + '</b><br><span style="font-size:10px;color:#64748b">' + esc(r.docenteCpf || r.docenteMatricula || '') + '</span></td>'
                + '<td><span style="font-size:12px">' + esc(disciplina) + '</span><br><span style="font-size:11px;color:#64748b">' + esc(aula) + '</span>'
                + (r.origem === 'manual-admin' ? '<br><span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:8px">Manual</span>' : '')
                + (r.origem === 'aula-cadastro-cursos'
                    ? '<br><span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:8px">Aula enviada pelo Cadastro de Cursos</span>'
                        + (r.apontadoEm
                            ? '<br><span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:8px">Apontado</span>'
                            : '<br><span style="font-size:9px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:8px">Pendente</span>')
                    : '')
                + (r.aulaExcluida ? '<br><span style="font-size:9px;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:8px">Aula excluída</span>' : '')
                + (r.aulaId ? '<br><span style="font-size:9px;background:#e0e7ff;color:#3730a3;padding:2px 6px;border-radius:8px">Aula vinculada</span>' : '')
                + (r.qrAula ? '<br><span style="font-size:9px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:8px">QR capturado</span>' : '') + '</td>'
                + '<td style="font-size:12px">' + esc(r.dataAula || '-') + '<br><span style="font-size:10px;color:#64748b">' + esc(r.horaAula || '') + '</span></td>'
                + '<td style="font-size:11px">' + (temLocal(r)
                    ? '<span style="color:#16a34a;font-weight:700">GPS capturado</span><br>' + esc(coords(r))
                    : '<span style="color:#dc2626">Sem localização</span>')
                + (r.qrAula ? '<br><span style="color:#92400e;font-size:9px">QR: ' + esc(r.qrAula.aulaDescricao || r.qrAula.aulaId || 'capturado') + '</span>' : '') + '</td>'
                + '<td><div class="actions-cell" style="display:flex;gap:5px;flex-wrap:wrap">' + acoes + '</div></td>'
                + '</tr>';
        }).join('');
    }

    /* ------------------------------ FORMULARIO -------------------------- */

    function opcoesDocentes(selecionado) {
        return '<option value="">— Selecione o docente —</option>' + docentes.map(function (d) {
            return '<option value="' + esc(d.id) + '" data-nome="' + esc(d.nome) + '" data-cpf="' + esc(d.cpf) + '"'
                + (String(selecionado || '') === d.id ? ' selected' : '') + '>' + esc(d.nome)
                + (d.matricula ? ' — ' + esc(d.matricula) : '') + '</option>';
        }).join('');
    }
    function cursosDoDocente(docenteId) {
        if (!docenteId) return cursos.slice();
        return cursos.filter(function (c) {
            if (String(c.docenteId || '') === String(docenteId)) return true;
            var cid = String(c.id || '');
            return (aulasCache[cid] || []).some(function (a) { return aulaEhDoDocente(a, docenteId); })
                || (discCache[cid] || []).some(function (x) { return disciplinaEhDoDocente(x, docenteId); });
        });
    }
    function opcoesCursos(docenteId, selecionado) {
        var lista = cursosDoDocente(docenteId);
        return '<option value="">— Selecione o curso —</option>' + lista.map(function (c) {
            return '<option value="' + esc(c.id) + '"' + (String(selecionado || '') === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
        }).join('') + (lista.length ? '' : '<option value="" disabled>Nenhuma aula/curso vinculado a este docente</option>');
    }

    async function carregarAulasCurso(cursoId, selecionado) {
        var chave = String(cursoId || '');
        if (!chave) { aulasCache[chave] = []; discCache[chave] = []; return; }
        if (aulasCache[chave]) {
            if (selecionado) preencherAula(selecionado);
            return;
        }
        if (aulasEmCarga[chave]) {
            await aulasEmCarga[chave];
            if (selecionado) preencherAula(selecionado);
            return;
        }
        var d = db();
        aulasEmCarga[chave] = (async function () {
            try {
                var base = d.collection('cursosCadastro').doc(chave);
                var sa = await base.collection('aulas').orderBy('data', 'desc').get();
                aulasCache[chave] = [];
                sa.forEach(function (x) {
                    var aula = Object.assign({ _id: x.id }, x.data() || {});
                    aulasCache[chave].push(aula);
                    aulaIndex[String(aula._id)] = Object.assign({ cursoId: chave }, aula);
                });
                var sd = await base.collection('disciplinas').get();
                discCache[chave] = [];
                sd.forEach(function (x) { discCache[chave].push(Object.assign({ _id: x.id }, x.data() || {})); });
            } catch (e) {
                aulasCache[chave] = []; discCache[chave] = [];
                console.warn('apontAdm: não foi possível ler aulas do curso', e);
            }
        })();
        try { await aulasEmCarga[chave]; } finally { delete aulasEmCarga[chave]; }
        if (selecionado) preencherAula(selecionado);
    }

    async function carregarTodasAulas() {
        if (!cursos.length) return;
        await Promise.all(cursos.map(function (c) {
            return carregarAulasCurso(c.id, '').catch(function () {});
        }));
    }

    function aulasDoDocente(cursoId, docenteId) {
        var lista = aulasCache[String(cursoId || '')] || [];
        if (!docenteId) return lista;
        return lista.filter(function (a) { return aulaEhDoDocente(a, docenteId); });
    }
    function disciplinasDoDocente(cursoId, docenteId) {
        var lista = discCache[String(cursoId || '')] || [];
        if (!docenteId) return lista;
        return lista.filter(function (x) { return disciplinaEhDoDocente(x, docenteId); });
    }
    function opcoesDisciplinas(cursoId, selecionado, docenteId) {
        var cid = String(cursoId || '');
        var nomes = [];
        disciplinasDoDocente(cid, docenteId).forEach(function (x) {
            var n = x.nome || x.disciplina || '';
            if (n && nomes.indexOf(n) < 0) nomes.push(n);
        });
        aulasDoDocente(cid, docenteId).forEach(function (a) {
            if (a.disciplina && nomes.indexOf(a.disciplina) < 0) nomes.push(a.disciplina);
        });
        if (selecionado && selecionado !== '__nova__' && nomes.indexOf(selecionado) < 0) nomes.unshift(selecionado);
        return '<option value="">— Selecione a disciplina —</option>' + nomes.map(function (n) {
            return '<option value="' + esc(n) + '"' + (String(selecionado || '') === n ? ' selected' : '') + '>' + esc(n) + '</option>';
        }).join('') + '<option value="__nova__"' + (selecionado === '__nova__' ? ' selected' : '') + '>Nova disciplina...</option>';
    }
    function opcoesAulas(cursoId, selecionado, docenteId) {
        var cid = String(cursoId || '');
        var lista = aulasDoDocente(cid, docenteId).slice();
        var atual = lista.find(function (a) { return String(a._id) === String(selecionado || ''); });
        if (!atual && selecionado && selecionado !== '__nova__' && aulaIndex[String(selecionado)]) {
            lista.unshift(Object.assign({ cursoId: cid }, aulaIndex[String(selecionado)]));
        }
        lista.sort(function (a, b) { return String(b.data || '').localeCompare(String(a.data || '')); });
        return '<option value="">— Selecione a aula —</option>' + lista.map(function (a) {
            var lbl = (a.data ? a.data + ' - ' : '') + (a.conteudo || a.disciplina || a._id)
                + (a.conteudo && a.disciplina ? ' (' + a.disciplina + ')' : '');
            return '<option value="' + esc(a._id) + '"' + (String(selecionado || '') === String(a._id) ? ' selected' : '') + '>' + esc(lbl) + '</option>';
        }).join('') + '<option value="__nova__"' + (selecionado === '__nova__' ? ' selected' : '') + '>Nova aula (informar abaixo)...</option>';
    }

    function preencherAula(aulaId) {
        var cursoId = (el('curso') || {}).value || '';
        var aula = ((aulasCache[String(cursoId)] || []).find(function (a) { return String(a._id) === String(aulaId || ''); })) || null;
        function set(id, v) { var x = el(id); if (x) x.value = v || ''; }
        if (aula) {
            var ds = el('disciplina');
            if (ds && aula.disciplina && !existeOpcao(ds, aula.disciplina)) {
                ds.insertBefore(new Option(aula.disciplina, aula.disciplina), ds.options[1] || null);
            }
            set('disciplina', aula.disciplina || '');
            set('data', aula.data || '');
            set('horario', aula.horario || '');
            set('conteudo', aula.conteudo || '');
            set('av-teorica', aula.avTeorica || '');
            set('av-pratica', aula.avPratica || '');
        } else {
            set('data', ''); set('horario', ''); set('conteudo', '');
            set('av-teorica', ''); set('av-pratica', '');
        }
    }
    function existeOpcao(sel, valor) {
        if (!sel) return false;
        for (var i = 0; i < sel.options.length; i++) {
            if (String(sel.options[i].value) === String(valor || '')) return true;
        }
        return false;
    }

    function formHtml(reg) {
        var p = reg || {};
        var docenteId = p.docenteId || '';
        var cursoId = p.cursoId || '';
        var disciplina = p.disciplina || '';
        var aulaId = p.aulaId || '';
        var temDisciplina = !!disciplina;
        var temAula = !!aulaId;
        return '<div class="card full-width">'
            + '<div class="card-header"><h3><i class="fa-solid fa-clipboard-user" style="color:#16a34a;margin-right:8px"></i> '
            + (reg ? 'Editar apontamento manual' : 'Criar apontamento manual') + '</h3>'
            + '<small>Disciplina e aula vinculadas ao docente selecionado, exatamente como cadastradas em Disciplina e Aulas. O apontamento registra o local pelo GPS e, quando capturado pela Coordenação, o QR de início da aula.</small></div>'
            + '<div class="card-body">'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">'
            + '<div><label style="font-size:11px;font-weight:700;color:#166534;display:block;margin-bottom:4px">Docente *</label>'
            + '<select id="aptadm-docente" class="config-input" style="width:100%" onchange="apontAdmDocenteChange()">' + opcoesDocentes(docenteId) + '</select></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#166534;display:block;margin-bottom:4px">Curso do docente *</label>'
            + '<select id="aptadm-curso" class="config-input" style="width:100%" onchange="apontAdmCursoChange()">' + opcoesCursos(docenteId, cursoId) + '</select></div>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:10px">'
            + '<div><label style="font-size:11px;font-weight:700;color:#166534;display:block;margin-bottom:4px">Disciplina *</label>'
            + '<select id="aptadm-disciplina" class="config-input" style="width:100%" onchange="apontAdmDisciplinaChange()">' + opcoesDisciplinas(cursoId, disciplina, docenteId) + '</select></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#166534;display:block;margin-bottom:4px">Nova disciplina</label>'
            + '<input id="aptadm-disciplina-nova" class="config-input" style="width:100%" placeholder="Nome da disciplina" value="' + (temDisciplina ? '' : esc(p.disciplinaNova || '')) + '"></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#166534;display:block;margin-bottom:4px">Aula do docente *</label>'
            + '<select id="aptadm-aula" class="config-input" style="width:100%" onchange="apontAdmAulaChange()">' + opcoesAulas(cursoId, aulaId, docenteId) + '</select></div>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:10px">'
            + '<div><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Data *</label>'
            + '<input type="date" id="aptadm-data" class="config-input" style="width:100%" value="' + esc(p.dataAula || hoje()) + '"></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Horário</label>'
            + '<input id="aptadm-horario" class="config-input" style="width:100%" placeholder="14:00 às 17:00" value="' + esc(p.horaAula || '') + '"></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Conteúdo / nome da aula</label>'
            + '<input id="aptadm-conteudo" class="config-input" style="width:100%" placeholder="Conteúdo da aula" value="' + esc(p.aula || p.conteudo || '') + '"></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px">AV Teórica</label>'
            + '<select id="aptadm-av-teorica" class="config-input" style="width:100%">'
            + opcoesSimNao(p.avTeorica, 'AV Teórica') + '</select></div>'
            + '<div><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px">AV Prática</label>'
            + '<select id="aptadm-av-pratica" class="config-input" style="width:100%">'
            + opcoesSimNao(p.avPratica, 'AV Prática') + '</select></div>'
            + '</div>'
            + '<div style="margin-top:12px;padding:12px;border:1px solid #86efac;background:#f0fdf4;border-radius:10px">'
            + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
            + '<button type="button" class="btn-outline btn-sm" onclick="apontAdmCapturarGps()"><i class="fa-solid fa-location-crosshairs"></i> Capturar GPS</button>'
            + '<button type="button" class="btn-outline btn-sm" id="aptadm-qr-btn" onclick="apontAdmCapturarQr()"'
            + (podeCapturarQr() ? '' : ' disabled title="Somente o Coordenador pode capturar o QR Code da aula"')
            + '><i class="fa-solid fa-qrcode"></i> Capturar QR Code</button>'
            + '<span id="aptadm-gps-status" style="font-size:12px;color:#166534;font-weight:700">Localização não capturada.</span></div>'
            + '<div id="aptadm-gps-detalhe" style="font-size:11px;color:#15803d;margin-top:6px"></div>'
            + '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #86efac">'
            + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
            + '<span id="aptadm-qr-status" style="font-size:12px;font-weight:700"></span>'
            + '<button type="button" class="btn-outline btn-sm" id="aptadm-qr-parar" style="display:none" onclick="apontAdmPararQr()"><i class="fa-solid fa-stop"></i> Parar leitura</button></div>'
            + '<div id="aptadm-qr-detalhe" style="font-size:11px;color:#15803d;margin-top:6px"></div>'
            + '<div id="aptadm-qr-reader" style="display:none;width:100%;min-height:180px;background:#fff;border-radius:8px;margin-top:8px"></div>'
            + '</div></div>'
            + '<div style="display:flex;gap:8px;margin-top:14px">'
            + '<button type="button" class="btn-primary" onclick="apontAdmSalvar()"><i class="fa-solid fa-floppy-disk"></i> Salvar apontamento</button>'
            + '<button type="button" class="btn-outline" onclick="apontAdmVoltarForm()"><i class="fa-solid fa-arrow-left"></i> Cancelar</button>'
            + '</div></div></div>';
    }
    function opcoesSimNao(valor, rotulo) {
        return '<option value="">' + esc(rotulo) + '</option>'
            + '<option value="Sim"' + (valor === 'Sim' ? ' selected' : '') + '>Sim</option>'
            + '<option value="Nao"' + (valor === 'Nao' ? ' selected' : '') + '>Não</option>';
    }

    function abrirForm(id) {
        if (!pode(id ? 'aptadm:edicao' : 'aptadm:criar', 'editar')) {
            alert('Seu perfil não permite ' + (id ? 'editar' : 'criar') + ' apontamentos manuais.'); return;
        }
        var reg = id ? cache.find(function (r) { return r._id === id; }) : null;
        if (id && !reg) { alert('Registro não encontrado.'); return; }
        editando = reg || null;
        localAtual = (reg && reg.localizacao) ? Object.assign({}, reg.localizacao) : null;
        qrAtual = null;
        if (reg && reg.qrAula && reg.qrAula.aulaId) {
            qrAtual = Object.assign({}, reg.qrAula);
        } else if (reg && reg.qrCode) {
            var infoQr = aulaIndex[String(extrairAulaId(reg.qrCode) || '')];
            if (infoQr) {
                qrAtual = {
                    valor: reg.qrCode,
                    aulaId: String(infoQr._id),
                    cursoId: String(infoQr.cursoId),
                    docenteId: String(infoQr.docenteId || ''),
                    aulaDescricao: infoQr.conteudo || infoQr.disciplina || infoQr._id,
                    capturadaEm: (reg.qrAula && reg.qrAula.capturadaEm) || reg.atualizadoEm || '',
                    capturadaPor: (reg.qrAula && reg.qrAula.capturadaPor) || ''
                };
            }
        }
        var painel = el('form-painel'); if (!painel) return;
        pararQr();
        painel.innerHTML = formHtml(reg);
        painel.style.display = 'block';
        renderQr();
        var docSel = el('docente');
        if (reg && reg.docenteId && docSel && !docSel.value) {
            /* Docente removido do cadastro: mantém o nome visível no formulário. */
            var op = document.createElement('option');
            op.value = reg.docenteId; op.textContent = (reg.docenteNome || 'Docente removido') + ' (não cadastrado)';
            docSel.insertBefore(op, docSel.options[1] || null); docSel.value = reg.docenteId;
        }
        if (reg && reg.cursoId && el('curso') && !el('curso').value) {
            var opc = document.createElement('option');
            opc.value = reg.cursoId; opc.textContent = (reg.cursoNome || 'Curso removido') + ' (não cadastrado)';
            el('curso').insertBefore(opc, el('curso').options[1] || null); el('curso').value = reg.cursoId;
        }
        var cursoId = (el('curso') || {}).value || '';
        var docenteIdAtual = (el('docente') || {}).value || '';
        carregarAulasCurso(cursoId, reg ? reg.aulaId : '').then(function () {
            var dsel = el('disciplina'), asel = el('aula');
            if (dsel && reg && reg.disciplina && !existeOpcao(dsel, reg.disciplina)) {
                dsel.insertBefore(new Option(reg.disciplina, reg.disciplina), dsel.options[1] || null);
            }
            if (asel && reg && reg.aulaId && !existeOpcao(asel, reg.aulaId)) {
                asel.insertBefore(new Option((reg.dataAula || '') + ' - ' + (reg.aula || reg.aulaId), reg.aulaId), asel.options[1] || null);
            }
            if (dsel) {
                var valorDisc = dsel.value;
                dsel.innerHTML = opcoesDisciplinas(cursoId, valorDisc, docenteIdAtual);
            }
            if (asel) {
                var valorAula = asel.value;
                asel.innerHTML = opcoesAulas(cursoId, valorAula, docenteIdAtual);
            }
            renderGps(); renderQr();
        });
        if (typeof window.scrollTo === 'function') window.scrollTo({ top: painel.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
        if (navigator.geolocation) capturarGps(true);
    }

    function novo() { abrirForm(null); }
    function editar(id) { abrirForm(id); }
    function voltarForm() {
        pararQr();
        editando = null; localAtual = null; qrAtual = null;
        var painel = el('form-painel'); if (painel) { painel.innerHTML = ''; painel.style.display = 'none'; }
    }

    function docenteChange() {
        var sel = el('curso'); if (!sel) return;
        var docenteId = (el('docente') || {}).value || '';
        sel.innerHTML = opcoesCursos(docenteId, '');
        var ds = el('disciplina'); if (ds) ds.innerHTML = opcoesDisciplinas('', '', docenteId);
        var as = el('aula'); if (as) as.innerHTML = opcoesAulas('', '', docenteId);
    }
    async function cursoChange() {
        var cursoId = (el('curso') || {}).value || '';
        var docenteId = (el('docente') || {}).value || '';
        var ds = el('disciplina'); if (ds) ds.innerHTML = opcoesDisciplinas(cursoId, '', docenteId);
        var as = el('aula'); if (as) as.innerHTML = opcoesAulas(cursoId, '', docenteId);
        await carregarAulasCurso(cursoId, '');
        var ds2 = el('disciplina'); if (ds2) ds2.innerHTML = opcoesDisciplinas(cursoId, '', docenteId);
        var as2 = el('aula'); if (as2) as2.innerHTML = opcoesAulas(cursoId, '', docenteId);
    }
    function disciplinaChange() {
        var nova = (el('disciplina') || {}).value === '__nova__';
        var campo = el('disciplina-nova'); if (campo) { campo.disabled = !nova; if (!nova) campo.value = ''; }
    }
    function aulaChange() {
        var v = (el('aula') || {}).value || '';
        preencherAula(v === '__nova__' ? '' : v);
    }

    /* -------------------------------- GPS ------------------------------- */

    function renderGps() {
        var st = el('gps-status'), dt = el('gps-detalhe');
        if (!st) return;
        if (localAtual && typeof localAtual.latitude === 'number') {
            st.textContent = 'Localização capturada ✓';
            st.style.color = '#15803d';
            dt.innerHTML = '<b>Latitude:</b> ' + Number(localAtual.latitude).toFixed(6)
                + ' &nbsp; <b>Longitude:</b> ' + Number(localAtual.longitude).toFixed(6)
                + '<br><b>Precisão:</b> ' + (localAtual.precisao ? Math.round(localAtual.precisao) + ' m' : '-')
                + ' &nbsp; <b>Capturada em:</b> ' + fmtData(localAtual.capturadaEm);
        } else {
            st.textContent = 'Localização não capturada.';
            st.style.color = '#b45309';
            dt.innerHTML = (localAtual && localAtual.erro) ? esc(localAtual.erro) : '';
        }
    }
    function capturarGps(silencioso) {
        if (!navigator.geolocation) {
            localAtual = { erro: 'Este navegador não oferece GPS. Libere a localização no site.' };
            renderGps(); if (!silencioso) alert(localAtual.erro); return;
        }
        var st = el('gps-status'); if (st) { st.textContent = 'Capturando localização...'; st.style.color = '#2563eb'; }
        navigator.geolocation.getCurrentPosition(function (pos) {
            localAtual = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                precisao: pos.coords.accuracy,
                capturadaEm: new Date().toISOString()
            };
            renderGps();
        }, function (err) {
            var msg = err && err.code === 1 ? 'Permissão de localização negada. Libere o GPS no navegador e tente novamente.'
                : 'Não foi possível capturar o GPS. Verifique se a localização está ativa.';
            localAtual = { erro: msg };
            renderGps(); if (!silencioso) alert(msg);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }

    /* --------------------------- QR DA AULA ------------------------------ */

    /* O QR gerado em Cadastro de Cursos contém FARN-INICIO:<aulaId>.
       Também aceita URLs que carreguem o mesmo conteúdo, para não depender
       de mudança no leitor caso o QR seja repassado por link. */
    function extrairAulaId(texto) {
        var s = String(texto == null ? '' : texto).trim();
        if (!s) return '';
        var m = s.match(/^FARN-INICIO\s*:\s*(.+)$/i);
        if (m) return m[1].trim();
        try {
            var dec = decodeURIComponent(s);
            if (dec !== s) return extrairAulaId(dec);
        } catch (e) { /* texto com % inválido */ }
        try {
            var u = new URL(s);
            var p = u.searchParams.get('aula') || u.searchParams.get('aulaId') || u.searchParams.get('id') || '';
            if (p) return p.trim();
            var hash = decodeURIComponent(u.hash.replace(/^#/, ''));
            var mh = hash.match(/FARN-INICIO\s*:\s*(.+)$/i);
            if (mh) return mh[1].trim();
        } catch (e) { /* texto não é URL */ }
        return aulaIndex[s] ? s : '';
    }
    function renderQr() {
        var st = el('qr-status'), dt = el('qr-detalhe');
        if (!st) return;
        if (!podeCapturarQr()) {
            st.textContent = 'Leitura de QR restrita à Coordenação.';
            st.style.color = '#64748b';
            if (dt) dt.textContent = '';
            return;
        }
        if (qrEscaneando) {
            st.textContent = 'Lendo QR Code...'; st.style.color = '#2563eb';
            if (dt) dt.textContent = 'Aponte a câmera para o QR de início exibido no Cadastro de Cursos.';
            return;
        }
        if (qrAtual) {
            st.textContent = 'QR da aula capturado ✓';
            st.style.color = '#15803d';
            if (dt) dt.innerHTML = '<b>Aula:</b> ' + esc(qrAtual.aulaDescricao || qrAtual.aulaId)
                + ' &nbsp; <b>Capturada em:</b> ' + fmtData(qrAtual.capturadaEm)
                + '<br><b>Capturada por:</b> ' + esc(qrAtual.capturadaPor || 'Coordenação')
                + '<br><b>Conteúdo:</b> ' + esc(qrAtual.valor);
        } else {
            st.textContent = 'QR da aula não capturado.';
            st.style.color = '#b45309';
            if (dt) dt.textContent = '';
        }
    }
    function pararQr() {
        if (qrScanner && qrEscaneando) {
            try {
                var p = qrScanner.stop();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) { /* câmera já encerrada */ }
        }
        qrScanner = null; qrEscaneando = false;
        var rd = el('qr-reader'), btn = el('qr-parar');
        if (rd) { rd.innerHTML = ''; rd.style.display = 'none'; }
        if (btn) btn.style.display = 'none';
    }
    async function capturarQr() {
        if (!podeCapturarQr()) {
            alert('Somente o Coordenador pode capturar o QR Code da aula.'); return;
        }
        if (qrEscaneando) { pararQr(); renderQr(); return; }
        if (typeof Html5Qrcode === 'undefined') {
            alert('Biblioteca de leitura de QR não carregada.'); return;
        }
        var rd = el('qr-reader'); if (!rd) return;
        rd.innerHTML = ''; rd.style.display = 'block';
        var btn = el('qr-parar'); if (btn) btn.style.display = '';
        renderQr();
        try {
            qrScanner = new Html5Qrcode('aptadm-qr-reader');
            qrEscaneando = true;
            await qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (texto) {
                if (!qrEscaneando) return;
                var id = extrairAulaId(texto);
                if (!id) return;
                var info = aulaIndex[String(id)];
                if (!info) {
                    alert('QR lido, mas esta aula não foi encontrada no Cadastro de Cursos.');
                    return;
                }
                pararQr();
                aplicarQrAula(String(texto).trim(), info);
            }, function () { /* quadro de leitura: ignora falhas isoladas */ });
        } catch (e) {
            pararQr(); renderQr();
            alert('Não foi possível iniciar a câmera: ' + (e && e.message ? e.message : e));
        }
    }
    function nomeCurso(cursoId) {
        var c = cursos.find(function (x) { return String(x.id) === String(cursoId || ''); });
        return c ? c.nome : 'Curso do QR';
    }
    async function aplicarQrAula(texto, info) {
        var docenteId = info.docenteId ? String(info.docenteId) : '';
        var curso = cursos.find(function (c) { return String(c.id) === String(info.cursoId || ''); });
        if (!docenteId && curso) docenteId = String(curso.docenteId || '');

        var docSel = el('docente');
        if (docSel) {
            if (docenteId && !existeOpcao(docSel, docenteId)) {
                var op = document.createElement('option');
                op.value = docenteId;
                op.textContent = (info.docente || nomeDocente(docenteId) || 'Docente da aula') + ' (do QR)';
                docSel.insertBefore(op, docSel.options[1] || null);
            }
            docSel.value = docenteId;
        }
        docenteChange();

        var cursoSel = el('curso');
        if (cursoSel) {
            if (info.cursoId && !existeOpcao(cursoSel, info.cursoId)) {
                var opc = document.createElement('option');
                opc.value = info.cursoId; opc.textContent = nomeCurso(info.cursoId) + ' (do QR)';
                cursoSel.insertBefore(opc, cursoSel.options[1] || null);
            }
            cursoSel.value = String(info.cursoId || '');
        }
        await cursoChange();

        var aulaSel = el('aula');
        if (aulaSel) {
            if (!existeOpcao(aulaSel, info._id)) {
                aulaSel.insertBefore(new Option((info.data || '') + ' - ' + (info.conteudo || info.disciplina || info._id), info._id), aulaSel.options[1] || null);
            }
            aulaSel.value = String(info._id);
        }
        aulaChange();
        function set(id, v) { var x = el(id); if (x) x.value = v || ''; }
        set('data', info.data || '');
        set('horario', info.horario || '');
        set('conteudo', info.conteudo || '');
        set('av-teorica', info.avTeorica || '');
        set('av-pratica', info.avPratica || '');

        qrAtual = {
            valor: String(texto || '').trim(),
            aulaId: String(info._id),
            cursoId: String(info.cursoId || ''),
            docenteId: docenteId,
            aulaDescricao: info.conteudo || info.disciplina || info._id,
            capturadaEm: new Date().toISOString(),
            capturadaPor: (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.nome) ? currentUserData.nome : 'Coordenação'
        };
        renderQr();
        alert('Aula identificada pelo QR: ' + (info.conteudo || info.disciplina || info._id) + '. Docente, curso e aula foram preenchidos.');
    }

    /* ------------------------------- SALVAR ----------------------------- */

    async function salvar() {
        var d = db(); if (!d) { alert('Firebase não conectado.'); return; }
        var docSel = el('docente'), cursoSel = el('curso');
        var docenteId = docSel ? docSel.value : '';
        var cursoId = cursoSel ? cursoSel.value : '';
        if (!docenteId) { alert('Selecione o docente.'); return; }
        if (!cursoId) { alert('Selecione o curso vinculado a este docente.'); return; }

        var docOp = docSel.options[docSel.selectedIndex];
        var discSel = el('disciplina');
        var disciplina = discSel ? discSel.value : '';
        if (disciplina === '__nova__') disciplina = (el('disciplina-nova') || {}).value || '';
        if (!disciplina.trim()) { alert('Informe a disciplina.'); return; }
        disciplina = disciplina.trim();

        var aulaSel = el('aula');
        var aulaValor = aulaSel ? aulaSel.value : '';
        var aulaId = aulaValor && aulaValor !== '__nova__' ? aulaValor : '';
        var dataAula = (el('data') || {}).value || '';
        if (!dataAula) { alert('Informe a data da aula.'); return; }

        var regSalvo = editando || {};
        var dados = {
            /* Registros vindos das aulas do Cadastro de Cursos mantem a origem
               para continuarem identificados como pendentes/enviados. */
            origem: regSalvo.origem === 'aula-cadastro-cursos' ? regSalvo.origem : 'manual-admin',
            docenteId: docenteId,
            docenteNome: docOp ? (docOp.getAttribute('data-nome') || docOp.textContent.split(' — ')[0]) : (regSalvo.docenteNome || ''),
            docenteCpf: docOp ? (docOp.getAttribute('data-cpf') || '') : (regSalvo.docenteCpf || ''),
            docenteMatricula: docOp ? (docOp.textContent.indexOf(' — ') >= 0 ? docOp.textContent.split(' — ')[1] : '') : (regSalvo.docenteMatricula || ''),
            cursoId: cursoId,
            cursoNome: cursoSel.options[cursoSel.selectedIndex] ? cursoSel.options[cursoSel.selectedIndex].textContent : (regSalvo.cursoNome || ''),
            disciplina: disciplina,
            disciplinaId: (discSel && discSel.selectedIndex >= 0 && discSel.options[discSel.selectedIndex].getAttribute('data-id')) || regSalvo.disciplinaId || '',
            aulaId: aulaId,
            aulaVinculada: !!aulaId,
            qrCode: qrAtual ? qrAtual.valor : '',
            qrAula: qrAtual ? {
                valor: qrAtual.valor,
                aulaId: qrAtual.aulaId,
                cursoId: qrAtual.cursoId,
                docenteId: qrAtual.docenteId,
                aulaDescricao: qrAtual.aulaDescricao,
                capturadaEm: qrAtual.capturadaEm,
                capturadaPor: qrAtual.capturadaPor
            } : null,
            aula: ((el('conteudo') || {}).value || '').trim(),
            dataAula: dataAula,
            horaAula: ((el('horario') || {}).value || '').trim(),
            avTeorica: (el('av-teorica') || {}).value || '',
            avPratica: (el('av-pratica') || {}).value || '',
            localizacao: (localAtual && typeof localAtual.latitude === 'number') ? {
                latitude: localAtual.latitude,
                longitude: localAtual.longitude,
                precisao: localAtual.precisao || null,
                capturadaEm: localAtual.capturadaEm || new Date().toISOString()
            } : null,
            localizacaoStatus: (localAtual && typeof localAtual.latitude === 'number') ? 'capturado' : 'indisponivel',
            atualizadoEm: new Date().toISOString()
        };
        if (!editando) {
            dados.criadoEm = new Date().toISOString();
            dados.criadoPor = (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.nome) ? currentUserData.nome : 'Administrador';
            dados.alunos = []; dados.presentes = 0; dados.faltas = 0; dados.justificadas = 0;
        } else {
            dados.alunos = regSalvo.alunos || [];
            dados.presentes = regSalvo.presentes || 0;
            dados.faltas = regSalvo.faltas || 0;
            dados.justificadas = regSalvo.justificadas || 0;
            dados.apontadoEm = regSalvo.apontadoEm || null;
        }
        if (!dados.localizacao && !confirm('O GPS não foi capturado. Salvar o apontamento sem registro de localização?')) return;
        try {
            if (editando) await d.collection(COLECAO).doc(editando._id).update(dados);
            else await d.collection(COLECAO).add(dados);
            voltarForm();
            await carregarTudo();
            alert(editando ? 'Apontamento atualizado.' : 'Apontamento manual criado.');
        } catch (e) { alert('Erro ao salvar: ' + (e && e.message ? e.message : e)); }
    }

    async function excluir(id) {
        if (!pode('aptadm:exclusao', 'editar')) { alert('Seu perfil não permite excluir.'); return; }
        if (!confirm('Excluir este apontamento manual?')) return;
        try {
            await db().collection(COLECAO).doc(id).delete();
            await carregarTudo();
        } catch (e) { alert('Erro ao excluir: ' + (e && e.message ? e.message : e)); }
    }

    /* --------------------- APONTAR ALUNOS (como no CADASTRO DE CURSOS) --- */

    function garantirModalApontamento() {
        var m = document.getElementById('aptadm-apt-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'aptadm-apt-modal';
        m.className = 'modal-overlay hidden';
        m.innerHTML = '<div class="modal-content" onclick="event.stopPropagation()" style="max-width:900px;max-height:92vh;overflow-y:auto">'
            + '<div class="modal-header"><h3><i class="fa-solid fa-clipboard-check" style="color:#16a34a;margin-right:8px"></i> Apontar alunos</h3>'
            + '<button class="modal-close" onclick="apontAdmFecharApontamento()"><i class="fa-solid fa-xmark"></i></button></div>'
            + '<div class="modal-body"><div id="aptadm-apt-info" style="font-size:12px;color:#475569;margin-bottom:10px"></div>'
            + '<div id="aptadm-apt-lista"></div></div>'
            + '<div class="modal-header" style="border-top:1px solid #e2e8f0;border-bottom:none;justify-content:flex-end;gap:10px;padding:14px 20px">'
            + '<button type="button" class="btn-icon" onclick="apontAdmFecharApontamento()">Fechar</button>'
            + '<button type="button" class="btn-primary" onclick="apontAdmSalvarApontamento()"><i class="fa-solid fa-floppy-disk"></i> Salvar apontamento</button>'
            + '</div></div>';
        m.onclick = function (ev) { if (ev.target === m) apontAdmFecharApontamento(); };
        document.body.appendChild(m);
        return m;
    }

    async function abrirApontamento(id) {
        if (!pode('aptadm:criar', 'editar')) { alert('Seu perfil não permite apontar.'); return; }
        var reg = cache.find(function (r) { return r._id === id; });
        if (!reg) return;
        var m = garantirModalApontamento();
        var info = document.getElementById('aptadm-apt-info');
        if (info) info.innerHTML = '<b>' + esc(dona(reg)) + '</b> • ' + esc(reg.disciplina || '') + ' • '
            + esc(reg.aula || reg.aulaId || '') + ' • ' + esc(reg.dataAula || '');
        m.classList.remove('hidden');
        try {
            var snap = await db().collection('cursosCadastro').doc(reg.cursoId).collection('individuos').get();
            alunos = [];
            snap.forEach(function (x) { alunos.push(Object.assign({ _id: x.id }, x.data() || {})); });
        } catch (e) { alunos = []; }
        if (!alunos.length) {
            document.getElementById('aptadm-apt-lista').innerHTML = '<p style="color:#b45309">Este curso não tem indivíduos cadastrados. Cadre indivíduos no Cadastro de Cursos antes de apontar.</p>';
            return;
        }
        var anteriores = reg.alunos || [];
        presencas = {};
        alunos.forEach(function (p) {
            var ant = anteriores.find(function (a) { return String(a.cpf) === String(p.cpf); }) || {};
            presencas[String(p.cpf)] = Object.assign({
                cpf: p.cpf || '', nome: p.nome || '', matricula: p.matricula || '',
                status: 'Falta', obs: '', foP: 0, foN: 0, inicioPresente: false, inicioHora: ''
            }, ant);
        });
        apontando = reg;
        renderListaApontamento();
    }
    function renderListaApontamento() {
        var box = document.getElementById('aptadm-apt-lista'); if (!box) return;
        box.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f5f9">'
            + '<th style="padding:6px;text-align:left;font-size:10px">Matrícula</th><th style="padding:6px;text-align:left;font-size:10px">Nome</th>'
            + '<th style="padding:6px;font-size:10px">P / F / J</th><th style="padding:6px;text-align:left;font-size:10px">Obs</th></tr></thead><tbody>'
            + alunos.map(function (p) {
                var s = presencas[String(p.cpf)] || {};
                return '<tr style="border-bottom:1px solid #eef2f7">'
                    + '<td style="padding:6px;font-size:11px">' + esc(s.matricula || '-') + '</td>'
                    + '<td style="padding:6px;font-size:12px">' + esc(s.nome || p.nome || '') + '</td>'
                    + '<td style="padding:6px;text-align:center">'
                    + ['Presente', 'Falta', 'Justificada'].map(function (st) {
                        var lbl = st === 'Presente' ? 'P' : (st === 'Falta' ? 'F' : 'J');
                        var cor = s.status === st ? (st === 'Presente' ? '#16a34a' : (st === 'Falta' ? '#dc2626' : '#d97706')) : '#94a3b8';
                        return '<button onclick="apontAdmSetStatus(\'' + esc(String(p.cpf)) + '\',\'' + st + '\')" '
                            + 'style="border:1px solid ' + cor + ';color:' + cor + ';background:' + (s.status === st ? cor + '22' : 'transparent') + ';border-radius:5px;padding:2px 7px;margin:0 1px;font-size:10px;font-weight:800">' + lbl + '</button>';
                    }).join('') + '</td>'
                    + '<td style="padding:6px"><input value="' + esc(s.obs || '') + '" onchange="apontAdmSetObs(\'' + esc(String(p.cpf)) + '\',this.value)" '
                    + 'style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px"></td>'
                    + '</tr>';
            }).join('') + '</tbody></table>';
    }
    function setStatus(cpf, st) { if (presencas[cpf]) { presencas[cpf].status = st; renderListaApontamento(); } }
    function setObs(cpf, v) { if (presencas[cpf]) presencas[cpf].obs = v; }
    function fecharApontamento() {
        var m = document.getElementById('aptadm-apt-modal'); if (m) m.classList.add('hidden');
        apontando = null; presencas = {}; alunos = [];
    }
    async function salvarApontamento() {
        if (!apontando) return;
        var presentes = 0, faltas = 0, just = 0;
        var lista = alunos.map(function (p) {
            var s = presencas[String(p.cpf)] || {};
            if (s.status === 'Presente') presentes++; else if (s.status === 'Justificada') just++; else faltas++;
            return Object.assign({}, s, { cpf: s.cpf || p.cpf || '', nome: s.nome || p.nome || '', matricula: s.matricula || p.matricula || '' });
        });
        try {
            await db().collection(COLECAO).doc(apontando._id).update({
                alunos: lista, presentes: presentes, faltas: faltas, justificadas: just,
                apontadoEm: new Date().toISOString()
            });
            fecharApontamento();
            await carregarTudo();
            alert('Apontamento salvo: ' + presentes + ' presente(s), ' + faltas + ' falta(s), ' + just + ' justificada(s).');
        } catch (e) { alert('Erro ao salvar: ' + (e && e.message ? e.message : e)); }
    }

    /* ----------------------- VISUALIZAR / LOCAL / IMPRIMIR --------------- */

    function registroHtml(r) {
        var l = r.localizacao || {};
        return '<div style="font-size:13px;line-height:1.7">'
            + '<p><b>Docente:</b> ' + esc(dona(r)) + '<br><b>CPF:</b> ' + esc(r.docenteCpf || '-')
            + '<br><b>Curso:</b> ' + esc(r.cursoNome || '-') + '</p>'
            + '<p><b>Disciplina:</b> ' + esc(r.disciplina || '-') + '<br><b>Aula:</b> ' + esc(r.aula || r.aulaId || '-')
            + (r.aulaId ? ' <span style="font-size:9px;background:#e0e7ff;color:#3730a3;padding:2px 6px;border-radius:8px">Vinculada ao Cadastro de Cursos</span>' : '')
            + '<br><b>Data:</b> ' + esc(r.dataAula || '-') + ' <b>Horário:</b> ' + esc(r.horaAula || '-')
            + '<br><b>AV Teórica:</b> ' + esc(r.avTeorica || '-') + ' <b>AV Prática:</b> ' + esc(r.avPratica || '-') + '</p>'
            + '<p><b>Criado em:</b> ' + fmtData(r.criadoEm) + ' por ' + esc(r.criadoPor || '-')
            + '<br><b>Apontado em:</b> ' + fmtData(r.apontadoEm) + '</p>'
            + '<p><b>Origem:</b> ' + (r.origem === 'aula-cadastro-cursos'
                ? 'Aula do Cadastro de Cursos' + (r.aulaExcluida ? ' (aula excluída)' : '')
                    + ' <span style="font-size:9px;background:' + (r.apontadoEm ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e')
                    + ';padding:2px 6px;border-radius:8px">' + (r.apontadoEm ? 'Apontado' : 'Pendente') + '</span>'
                    + (r.enviadoEm ? '<br><b>Enviada em:</b> ' + fmtData(r.enviadoEm) + ' por ' + esc(r.enviadoPor || '-') : '')
                : 'Apontamento manual') + '</p>'
            + '<p><b>Presença:</b> ' + (r.presentes || 0) + ' presente(s), ' + (r.faltas || 0) + ' falta(s), ' + (r.justificadas || 0) + ' justificada(s)</p>'
            + '<p><b>Localização:</b> ' + (temLocal(r) ? esc(coords(r)) : '<span style="color:#dc2626">Não capturada</span>')
            + '<br><b>Precisão:</b> ' + (l.precisao ? Math.round(l.precisao) + ' m' : '-')
            + '<br><b>Capturada em:</b> ' + fmtData(l.capturadaEm) + '</p>'
            + '<p><b>QR da aula:</b> ' + (r.qrAula
                ? esc(r.qrAula.aulaDescricao || r.qrAula.aulaId || 'capturado')
                    + ' <span style="font-size:9px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:8px">Capturado pela Coordenação</span>'
                    + '<br><b>Conteúdo:</b> ' + esc(r.qrAula.valor || r.qrCode || '-')
                    + '<br><b>Capturado em:</b> ' + fmtData(r.qrAula.capturadaEm)
                    + '<br><b>Capturado por:</b> ' + esc(r.qrAula.capturadaPor || '-')
                : '<span style="color:#94a3b8">Não capturado</span>') + '</p>'
            + (r.alunos && r.alunos.length ? '<p><b>Alunos:</b></p><table style="width:100%;border-collapse:collapse;font-size:11px">'
                + r.alunos.map(function (a) {
                    return '<tr><td style="padding:4px;border-bottom:1px solid #eef2f7">' + esc(a.nome || '') + '</td>'
                        + '<td style="padding:4px;border-bottom:1px solid #eef2f7">' + esc(a.status || '-') + '</td>'
                        + '<td style="padding:4px;border-bottom:1px solid #eef2f7">' + esc(a.obs || '') + '</td></tr>';
                }).join('') + '</table>' : '')
            + '</div>';
    }
    function ver(id) {
        var r = cache.find(function (x) { return x._id === id; }); if (!r) return;
        verAtual = r;
        var body = el('ver-body'); if (body) body.innerHTML = registroHtml(r);
        var ov = el('ver-overlay'); if (ov) ov.classList.remove('hidden');
    }
    function fecharVer() { var ov = el('ver-overlay'); if (ov) ov.classList.add('hidden'); verAtual = null; }
    function verLocal(id) {
        var r = cache.find(function (x) { return x._id === id; }); if (!r) return;
        localAtualRegistro = r;
        var body = el('local-body'); if (!body) return;
        if (!temLocal(r)) {
            body.innerHTML = '<p style="color:#dc2626;font-size:13px">Este apontamento não possui registro de localização (GPS indisponível no momento).</p>';
        } else {
            body.innerHTML = '<div style="font-size:13px;margin-bottom:10px">'
                + '<b>Docente:</b> ' + esc(dona(r)) + ' &nbsp; <b>Aula:</b> ' + esc(r.aula || r.disciplina || '-')
                + '<br><b>Latitude:</b> ' + Number(r.localizacao.latitude).toFixed(6)
                + ' &nbsp; <b>Longitude:</b> ' + Number(r.localizacao.longitude).toFixed(6)
                + '<br><b>Precisão:</b> ' + (r.localizacao.precisao ? Math.round(r.localizacao.precisao) + ' m' : '-')
                + ' &nbsp; <b>Capturada em:</b> ' + fmtData(r.localizacao.capturadaEm)
                + '</div>' + mapaHtml(Number(r.localizacao.latitude), Number(r.localizacao.longitude));
        }
        var ov = el('local-overlay'); if (ov) ov.classList.remove('hidden');
    }
    function fecharLocal() { var ov = el('local-overlay'); if (ov) ov.classList.add('hidden'); localAtualRegistro = null; }

    function imprimir(id) {
        if (!pode('aptadm:impressao', 'editar')) { alert('Seu perfil não permite imprimir.'); return; }
        var r = cache.find(function (x) { return x._id === id; }) || verAtual;
        if (!r) return;
        var w = window.open('', '_blank');
        if (!w) { alert('Permita pop-ups para imprimir.'); return; }
        var html = '<!doctype html><html><head><meta charset="utf-8"><title>Apontamento ADM</title>'
            + '<style>body{font-family:Arial,sans-serif;padding:28px;color:#0f172a}h1{font-size:20px}'
            + 'p{font-size:13px;line-height:1.7}table{border-collapse:collapse;width:100%;font-size:12px}'
            + 'td,th{border:1px solid #cbd5e1;padding:6px;text-align:left}@media print{.no-print{display:none}}</style></head><body>'
            + '<div class="no-print"><button onclick="window.print()">Imprimir</button></div>'
            + '<h1>Registro de Apontamento Manual — Docente</h1>' + registroHtml(r)
            + '<script>window.addEventListener("load",function(){window.print();});<\/script></body></html>';
        w.document.write(html); w.document.close();
    }

    /* ------------------------------ EXPORTS ----------------------------- */

    window.apontAdmInicializar = inicializar;
    window.apontAdmRender = render;
    window.apontAdmNovo = novo;
    window.apontAdmEditar = editar;
    window.apontAdmVoltarForm = voltarForm;
    window.apontAdmDocenteChange = docenteChange;
    window.apontAdmCursoChange = cursoChange;
    window.apontAdmDisciplinaChange = disciplinaChange;
    window.apontAdmAulaChange = aulaChange;
    window.apontAdmCapturarGps = capturarGps;
    window.apontAdmCapturarQr = capturarQr;
    window.apontAdmPararQr = pararQr;
    window.apontAdmSalvar = salvar;
    window.apontAdmExcluir = excluir;
    window.apontAdmAbrirApontamento = abrirApontamento;
    window.apontAdmFecharApontamento = fecharApontamento;
    window.apontAdmSetStatus = setStatus;
    window.apontAdmSetObs = setObs;
    window.apontAdmSalvarApontamento = salvarApontamento;
    window.apontAdmVer = ver;
    window.apontAdmFecharVer = fecharVer;
    window.apontAdmVerLocal = verLocal;
    window.apontAdmFecharLocal = fecharLocal;
    window.apontAdmImprimir = imprimir;
})();
