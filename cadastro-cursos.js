/* =====================================================================
   CADASTRO DE CURSOS - area isolada por curso
   Cada curso guarda seus proprios dados em subcolecoes:
   cursosCadastro/{id}/avaliacoes, respostas, disciplinas, aulas,
   individuos, apontamentos, presencas.
   ===================================================================== */

var CC_COLECAO = 'cursosCadastro';
var CC_BACKUP_KEY = 'farn_cursos_backup_local';

/* Copia local dos cursos: se o Firestore falhar ou os documentos sumirem,
   o administrador ainda consegue recria-los. */
function ccSalvarBackupLocal() {
    try {
        var dados = (ccCursos || []).map(function (c) {
            return { _id: c._id, nome: c.nome, icone: c.icone || '', iconeUrl: c.iconeUrl || '', apostilaUrl: c.apostilaUrl || '', apostilaPdfUrl: c.apostilaPdfUrl || '', criadoEm: c.criadoEm || '' };
        });
        localStorage.setItem(CC_BACKUP_KEY, JSON.stringify({ salvoEm: new Date().toISOString(), cursos: dados }));
    } catch (e) { console.warn('Nao foi possivel salvar backup local dos cursos:', e); }
}
function ccLerBackupLocal() {
    try { return JSON.parse(localStorage.getItem(CC_BACKUP_KEY) || 'null'); }
    catch (e) { return null; }
}
var ccCursos = [];
var ccAtual = null;          // { id, nome, icone, ... }
var ccAba = 'geral';
var ccEditandoCursoId = null;
var ccEditandoAvId = null;
var ccQuestoesTemp = [];
var ccImportSel = {};
var ccImportFiltro = '';
var ccScanner = null;
var ccAptPresencas = {};
var ccAptAlunos = [];
var ccAptAula = null;
var ccAptDisciplina = '';
var ccAptEscaneando = false;

function ccDb() { return (typeof dbFirestore !== 'undefined') ? dbFirestore : null; }
function ccEsc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function ccId() { return String(Date.now()) + Math.random().toString(36).slice(2, 8); }
function ccRef(sub, docId) {
    var base = ccDb().collection(CC_COLECAO).doc(ccAtual._id).collection(sub);
    return docId ? base.doc(String(docId)) : base;
}

/* ============ INICIALIZACAO / LISTA DE CURSOS ============ */
var ccTentativasInit = 0;
function ccInicializar() {
    if (!ccDb()) {
        if (ccTentativasInit++ < 20) { setTimeout(ccInicializar, 300); return; }
        var l0 = document.getElementById('cc-lista');
        if (l0) l0.innerHTML = '<p style="color:#dc2626">Firebase nao conectado. Recarregue a pagina.</p>';
        return;
    }
    ccTentativasInit = 0;
    /* Sem orderBy: documentos sem o campo criadoEm também devem aparecer. */
    ccDb().collection(CC_COLECAO).onSnapshot(function (snap) {
        ccCursos = [];
        snap.forEach(function (d) { ccCursos.push(Object.assign({ _id: d.id }, d.data() || {})); });
        ccCursos.sort(function (a, b) {
            return String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
        });
        if (ccCursos.length) ccSalvarBackupLocal();
        ccRenderLista();
    }, function (e) {
        console.error('Erro ao listar cursos:', e);
        var lb = document.getElementById('cc-lista');
        if (lb) lb.innerHTML = '<p style="color:#dc2626">Erro ao carregar cursos: ' + ccEsc(e && e.message ? e.message : e) + '</p>';
    });
    ccPopularTurmasAdmin();
    ccMostrarWorkspace(false);
}

function ccRenderLista() {
    var box = document.getElementById('cc-lista');
    if (!box) return;
    if (!ccCursos.length) {
        box.innerHTML = '<div style="text-align:center;padding:42px;color:#64748b">'
            + '<i class="fa-solid fa-book-open" style="font-size:42px;color:#cbd5e1;display:block;margin-bottom:12px"></i>'
            + 'Nenhum curso cadastrado. Clique em <b>Criar novo curso</b> para comecar.</div>';
        return;
    }
    box.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">'
        + ccCursos.map(function (c) {
            return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff;display:flex;gap:12px;align-items:center">'
                + '<div style="width:52px;height:52px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">'
                + ((c.iconeUrl || c.icone) ? '<img src="' + (c.iconeUrl || c.icone) + '" alt="Icone" style="width:100%;height:100%;object-fit:contain">'
                           : '<i class="fa-solid fa-book" style="color:#2563eb;font-size:22px"></i>')
                + '</div>'
                + '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ccEsc(c.nome) + '</div>'
                + '<div style="font-size:11px;color:#64748b;margin-top:3px">'
                + (c.criadoEm ? new Date(c.criadoEm).toLocaleDateString('pt-BR') : '')
                + '</div></div>'
                + '<button class="btn-primary btn-sm" onclick="ccAbrirCurso(\'' + c._id + '\')"><i class="fa-solid fa-door-open"></i> Abrir</button>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirCurso(\'' + c._id + '\')" title="Excluir curso"><i class="fa-solid fa-trash"></i></button>'
                + '</div>';
        }).join('') + '</div>';
}

/* Recria no Firestore os cursos que estao no backup local e nao estao mais
   na lista. Nao apaga nada. */
async function ccRestaurarCursosLocal() {
    var backup = ccLerBackupLocal();
    if (!backup || !backup.cursos || !backup.cursos.length) { alert('Nenhum backup local de cursos encontrado neste navegador.'); return; }
    var existentes = {};
    (ccCursos || []).forEach(function (c) { existentes[c._id] = true; });
    var faltando = backup.cursos.filter(function (c) { return c._id && !existentes[c._id]; });
    if (!faltando.length) { alert('Todos os cursos do backup já estão na lista.'); return; }
    if (!confirm('Recriar ' + faltando.length + ' curso(s) a partir do backup local deste navegador?')) return;
    try {
        for (var i = 0; i < faltando.length; i++) {
            var c = faltando[i];
            var dados = {
                nome: c.nome || 'Curso',
                icone: c.icone || '',
                apostilaUrl: c.apostilaUrl || '',
                criadoEm: c.criadoEm || new Date().toISOString(),
                restauradoEm: new Date().toISOString()
            };
            await dbFirestore.collection(CC_COLECAO).doc(c._id).set(dados);
        }
        alert(faltando.length + ' curso(s) restaurado(s). Recarregue a lista.');
        ccInicializar();
    } catch (e) { alert('Erro ao restaurar cursos: ' + e.message); }
}

function ccMostrarWorkspace(mostrar) {
    var lista = document.getElementById('cc-lista');
    var ws = document.getElementById('cc-workspace');
    var btnNovo = document.getElementById('cc-btn-novo');
    if (lista) lista.style.display = mostrar ? 'none' : '';
    if (ws) ws.style.display = mostrar ? '' : 'none';
    if (btnNovo) btnNovo.style.display = mostrar ? 'none' : '';
}

/* ============ CRIAR / EDITAR CURSO ============ */
function ccAbrirFormCurso(id) {
    ccEditandoCursoId = id || null;
    window._ccIconeDataUrl = null;
    window._ccApostilaDataUrl = null;
    var titulo = document.getElementById('cc-curso-titulo');
    var nome = document.getElementById('cc-curso-nome');
    var prev = document.getElementById('cc-curso-icone-preview');
    var curso = id ? ccCursos.find(function (c) { return c._id === id; }) : null;
    if (titulo) titulo.textContent = curso ? 'Editar curso' : 'Criar novo curso';
    if (nome) nome.value = curso ? (curso.nome || '') : '';
    if (prev) prev.innerHTML = curso && (curso.iconeUrl || curso.icone)
        ? '<img src="' + (curso.iconeUrl || curso.icone) + '" style="max-width:120px;max-height:120px;object-fit:contain">'
        : '<i class="fa-solid fa-image" style="font-size:32px;color:#94a3b8"></i>';
    var file = document.getElementById('cc-curso-icone-file'); if (file) file.value = '';
    var apostUrl = document.getElementById('cc-curso-apostila-url');
    if (apostUrl) apostUrl.value = curso ? (curso.apostilaUrl || '') : '';
    var apostFile = document.getElementById('cc-curso-apostila-file'); if (apostFile) apostFile.value = '';
    var prevA = document.getElementById('cc-apostila-preview');
    if (prevA) prevA.innerHTML = curso && (curso.apostilaPdfUrl || curso.apostilaPdf) ? '<i class="fa-solid fa-file-pdf" style="color:#dc2626"></i> PDF anexado ao curso'
        : (curso && curso.apostilaUrl ? '<i class="fa-solid fa-link" style="color:#2563eb"></i> Link configurado' : 'Nenhuma apostila anexada');
    var modal = document.getElementById('cc-modal-curso'); if (modal) modal.classList.remove('hidden');
}

function ccFecharFormCurso() {
    var modal = document.getElementById('cc-modal-curso'); if (modal) modal.classList.add('hidden');
}

/* APOSTILA: PDF anexado (dataURL) ou link externo. */
function ccSelecionarApostila(input) {
    var arquivo = input.files && input.files[0];
    if (!arquivo) return;
    if (arquivo.type !== 'application/pdf' && !/\.pdf$/i.test(arquivo.name)) { alert('Selecione um arquivo PDF.'); return; }
    if (arquivo.size > 850 * 1024) { alert('PDF muito grande (máx. 850 KB). Use um link externo para arquivos maiores.'); return; }
    var reader = new FileReader();
    reader.onload = function (ev) {
        window._ccApostilaDataUrl = ev.target.result;
        var prev = document.getElementById('cc-apostila-preview');
        if (prev) prev.innerHTML = '<i class="fa-solid fa-file-pdf" style="color:#dc2626;margin-right:6px"></i> ' + ccEsc(arquivo.name)
            + ' <span style="color:#16a34a;font-size:11px">(' + Math.round(arquivo.size / 1024) + ' KB)</span>';
    };
    reader.readAsDataURL(arquivo);
}

function ccSelecionarIcone(input) {
    var prev = document.getElementById('cc-curso-icone-preview');
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
            var max = 256, escala = Math.min(1, max / Math.max(img.width, img.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * escala); canvas.height = Math.round(img.height * escala);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            window._ccIconeDataUrl = canvas.toDataURL('image/jpeg', 0.82);
            if (prev) prev.innerHTML = '<img src="' + window._ccIconeDataUrl + '" style="max-width:120px;max-height:120px;object-fit:contain">';
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

async function ccSalvarCurso() {
    var nome = ((document.getElementById('cc-curso-nome') || {}).value || '').trim();
    if (!nome) { alert('Informe o nome do curso.'); return; }
    var dados = { nome: nome, atualizadoEm: new Date().toISOString() };
    dados.apostilaUrl = ((document.getElementById('cc-curso-apostila-url') || {}).value || '').trim();
    var novoRef = ccEditandoCursoId ? null : ccDb().collection(CC_COLECAO).doc();
    var cursoId = ccEditandoCursoId || (novoRef && novoRef.id);
    try {
        /* Arquivos no Storage; so as URLs ficam no documento do curso. */
        if (typeof fsSalvarArquivoCurso === 'function' && cursoId) {
            if (window._ccIconeDataUrl) {
                var u = await fsSalvarArquivoCurso(cursoId, 'icone', window._ccIconeDataUrl);
                if (u) dados.iconeUrl = u;
            }
            if (window._ccApostilaDataUrl) {
                var u2 = await fsSalvarArquivoCurso(cursoId, 'apostila', window._ccApostilaDataUrl);
                if (u2) dados.apostilaPdfUrl = u2;
            }
        }
        if (ccEditandoCursoId) {
            await ccDb().collection(CC_COLECAO).doc(ccEditandoCursoId).update(dados);
        } else {
            dados.criadoEm = new Date().toISOString();
            await novoRef.set(dados);
        }
        window._ccIconeDataUrl = null;
        window._ccApostilaDataUrl = null;
        ccFecharFormCurso();
    } catch (e) { alert('Erro ao salvar curso: ' + e.message); }
}

async function ccExcluirCurso(id) {
    if (!confirm('Excluir este curso e TODOS os seus dados (avaliacoes, disciplinas, aulas, individuos e apontamentos)?')) return;
    try {
        var base = ccDb().collection(CC_COLECAO).doc(id);
        var subs = ['avaliacoes','respostas','disciplinas','aulas','individuos','apontamentos','presencas','inicios'];
        for (var s = 0; s < subs.length; s++) {
            var snap = await base.collection(subs[s]).get();
            var batch = ccDb().batch(); var n = 0;
            snap.forEach(function (d) { batch.delete(d.ref); n++; });
            if (n) await batch.commit();
        }
        await base.delete();
    } catch (e) { alert('Erro ao excluir curso: ' + e.message); }
}

/* ============ ABRIR CURSO / ABAS ============ */
function ccAbrirCurso(id) {
    ccAtual = ccCursos.find(function (c) { return c._id === id; }) || null;
    if (!ccAtual) return;
    ccMostrarWorkspace(true);
    var tit = document.getElementById('cc-workspace-titulo');
    if (tit) tit.textContent = ccAtual.nome;
    var ic = document.getElementById('cc-workspace-icone');
    if (ic) ic.innerHTML = (ccAtual.iconeUrl || ccAtual.icone) ? '<img src="' + (ccAtual.iconeUrl || ccAtual.icone) + '" style="width:100%;height:100%;object-fit:contain">' : '<i class="fa-solid fa-book"></i>';
    ccSetAba('geral');
}

function ccSetAba(aba) {
    ccAba = aba;
    ['geral','avaliacao','disciplinas','individuos','apontamento','ficha','certificado','secaoavaliacao'].forEach(function (a) {
        var el = document.getElementById('cc-tab-' + a);
        if (el) el.style.display = (a === aba) ? '' : 'none';
        var btn = document.getElementById('cc-aba-' + a);
        if (btn) btn.className = (a === aba) ? 'nav-item active' : 'nav-item';
    });
    if (aba === 'geral') ccRenderGeral();
    if (aba === 'avaliacao') ccLoadAvaliacoes();
    if (aba === 'disciplinas') { ccLoadDisciplinas(); ccLoadAulas(); }
    if (aba === 'individuos') { ccLoadIndividuos(); ccRenderImportar(); }
    if (aba === 'apontamento') ccInitApontamento();
    if (aba === 'ficha') ccInitFicha();
    if (aba === 'certificado') ccInitCertificados();
    if (aba === 'secaoavaliacao') ccInitAvaliacao();
}

/* ============ IMPORTAÇÃO DO ADMINISTRADOR ============
   Traz para o curso os dados do administrador gerados para uma turma. */
var ccTurmasAdmin = [];
async function ccPopularTurmasAdmin() {
    var sel = document.getElementById('cc-turma-admin');
    if (!sel) return;
    var atual = sel.value;
    if (typeof turmas !== 'undefined' && turmas && turmas.length) {
        ccTurmasAdmin = turmas.slice();
    } else {
        try {
            var snap = await ccDb().collection('turmas').orderBy('nome').get();
            ccTurmasAdmin = [];
            snap.forEach(function (d) { ccTurmasAdmin.push(Object.assign({ nome: d.id }, d.data() || {})); });
        } catch (e) { ccTurmasAdmin = []; }
    }
    var nomes = [];
    ccTurmasAdmin.forEach(function (t) { if (t.nome && nomes.indexOf(t.nome) < 0) nomes.push(t.nome); });
    nomes.sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });
    sel.innerHTML = '<option value="">Selecione a turma...</option>' + nomes.map(function (n) {
        return '<option value="' + ccEsc(n) + '">' + ccEsc(n) + '</option>';
    }).join('');
    if (atual) sel.value = atual;
}
function ccTurmaOrigem() { return ((document.getElementById('cc-turma-admin') || {}).value || '').trim(); }
function ccExigirTurma() {
    var t = ccTurmaOrigem();
    if (!t) { alert('Selecione a turma do administrador no topo da página.'); return null; }
    return t;
}
async function ccGravarLote(sub, documentos) {
    var total = 0;
    for (var i = 0; i < documentos.length; i += 400) {
        var lote = documentos.slice(i, i + 400);
        var batch = ccDb().batch();
        lote.forEach(function (d) { batch.set(ccRef(sub).doc(), d); });
        await batch.commit();
        total += lote.length;
    }
    return total;
}
function ccLimparSub(sub) {
    return ccRef(sub).get().then(function (snap) {
        if (snap.empty) return 0;
        return ccGravarLoteExclusao(snap);
    });
}
async function ccGravarLoteExclusao(snap) {
    var refs = [];
    snap.forEach(function (d) { refs.push(d.ref); });
    for (var i = 0; i < refs.length; i += 400) {
        var batch = ccDb().batch();
        refs.slice(i, i + 400).forEach(function (r) { batch.delete(r); });
        await batch.commit();
    }
    return refs.length;
}
async function ccImportarFicha() {
    var turma = ccExigirTurma(); if (!turma) return;
    var pessoas = (typeof candidatos !== 'undefined' ? candidatos : []).filter(function (c) { return c.turma === turma; });
    if (!pessoas.length) { alert('Nenhum indivíduo encontrado nesta turma no administrador.'); return; }
    if (!confirm('Importar ' + pessoas.length + ' indivíduo(s) da turma ' + turma + ' para a Ficha Geral deste curso?')) return;
    try {
        var snapshot = {};
        for (var i = 0; i < pessoas.length; i++) {
            var p = pessoas[i];
            try {
                var av = await ccDb().collection('avaliacoesAlunos').doc(String(p.cpf)).get();
                if (av.exists) snapshot[String(p.cpf)] = av.data() || {};
            } catch (e) {}
        }
        await ccLimparSub('individuos');
        await ccLimparSub('fichaAvaliacoes');
        var docs = pessoas.map(function (p) {
            var copia = Object.assign({}, p);
            delete copia.docKey; delete copia._id;
            Object.keys(copia).forEach(function (k) { if (copia[k] === undefined) delete copia[k]; });
            copia.cursoId = ccAtual._id; copia.importadoEm = new Date().toISOString(); copia.turmaOrigem = turma;
            return copia;
        });
        var n = await ccGravarLote('individuos', docs);
        var avDocs = Object.keys(snapshot).map(function (cpf) { return Object.assign({ cpf: cpf }, snapshot[cpf]); });
        if (avDocs.length) await ccGravarLote('fichaAvaliacoes', avDocs);
        ccLoadIndividuos(); ccInitFicha();
        alert(n + ' indivíduo(s) e ' + avDocs.length + ' ficha(s) de avaliação importados.');
    } catch (e) { alert('Erro ao importar fichas: ' + e.message); }
}
async function ccImportarApontamentos() {
    var turma = ccExigirTurma(); if (!turma) return;
    try {
        var snap = await ccDb().collection('apontamentos').where('turma', '==', turma).get();
        if (snap.empty) { alert('Nenhum apontamento encontrado para esta turma.'); return; }
        if (!confirm('Importar ' + snap.size + ' apontamento(s) da turma ' + turma + '?')) return;
        var ids = [], copias = [];
        snap.forEach(function (d) {
            var copia = Object.assign({}, d.data() || {});
            delete copia.docKey; delete copia._id;
            Object.keys(copia).forEach(function (k) { if (copia[k] === undefined) delete copia[k]; });
            copia.turmaOrigem = turma; copia.cursoId = ccAtual._id; copia.importadoEm = new Date().toISOString();
            var ref = ccRef('apontamentos').doc();
            ids.push({ antigo: d.id, novo: ref.id });
            copias.push({ ref: ref, dados: copia });
        });
        await ccLimparSub('apontamentos'); await ccLimparSub('presencas');
        var batch = ccDb().batch();
        copias.forEach(function (c) { batch.set(c.ref, c.dados); });
        await batch.commit();
        var mapa = {}; ids.forEach(function (x) { mapa[x.antigo] = x.novo; });
        var pres = await ccDb().collection('presencasAlunos').where('turma', '==', turma).get();
        var pDocs = [];
        pres.forEach(function (d) {
            var p = Object.assign({}, d.data() || {});
            delete p.docKey; delete p._id;
            Object.keys(p).forEach(function (k) { if (p[k] === undefined) delete p[k]; });
            p.apontamentoId = mapa[p.apontamentoId] || p.apontamentoId || '';
            p.cursoId = ccAtual._id; p.importadoEm = new Date().toISOString();
            pDocs.push(p);
        });
        if (pDocs.length) await ccGravarLote('presencas', pDocs);
        ccCarregarHistorico(); ccLoadAulas();
        alert(copias.length + ' apontamento(s) e ' + pDocs.length + ' presença(s) importados.');
    } catch (e) { alert('Erro ao importar apontamentos: ' + e.message); }
}
async function ccImportarDisciplinasAulas() {
    var turma = ccExigirTurma(); if (!turma) return;
    try {
        var dSnap = await ccDb().collection('disciplinas').where('turma', '==', turma).get();
        var aSnap = await ccDb().collection('aulas').where('turma', '==', turma).get();
        if (dSnap.empty && aSnap.empty) { alert('Nenhuma disciplina/aula encontrada para esta turma.'); return; }
        if (!confirm('Importar ' + dSnap.size + ' disciplina(s) e ' + aSnap.size + ' aula(s) da turma ' + turma + '?')) return;
        await ccLimparSub('disciplinas'); await ccLimparSub('aulas');
        function copiar(snap) {
            var out = [];
            snap.forEach(function (d) {
                var o = Object.assign({}, d.data() || {});
                delete o.docKey; delete o._id;
                Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; });
                o.turmaOrigem = turma; o.cursoId = ccAtual._id; o.importadoEm = new Date().toISOString();
                out.push(o);
            });
            return out;
        }
        var nd = await ccGravarLote('disciplinas', copiar(dSnap));
        var na = await ccGravarLote('aulas', copiar(aSnap));
        ccLoadDisciplinas(); ccLoadAulas();
        alert(nd + ' disciplina(s) e ' + na + ' aula(s) importadas.');
    } catch (e) { alert('Erro ao importar disciplinas/aulas: ' + e.message); }
}
async function ccImportarAvaliacoes() {
    var turma = ccExigirTurma(); if (!turma) return;
    try {
        var snap = await ccDb().collection('avaliacoes').where('turma', '==', turma).get();
        if (snap.empty) { alert('Nenhuma avaliação encontrada para esta turma.'); return; }
        if (!confirm('Importar ' + snap.size + ' avaliação(ões) da turma ' + turma + '?')) return;
        var ids = [], copias = [];
        snap.forEach(function (d) {
            var o = Object.assign({}, d.data() || {});
            delete o.docKey; delete o._id;
            Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; });
            o.turmaOrigem = turma; o.cursoId = ccAtual._id; o.importadoEm = new Date().toISOString();
            var ref = ccRef('avaliacoes').doc();
            ids.push({ antigo: d.id, novo: ref.id });
            copias.push({ ref: ref, dados: o });
        });
        await ccLimparSub('avaliacoes'); await ccLimparSub('respostas');
        var batch = ccDb().batch(); copias.forEach(function (c) { batch.set(c.ref, c.dados); }); await batch.commit();
        var mapa = {}; ids.forEach(function (x) { mapa[x.antigo] = x.novo; });
        /* Nem toda resposta tem o campo turma preenchido: busca todas e
           filtra pelo ID da avaliacao importada. */
        var rSnap = await ccDb().collection('avaliacoesRespostas').get();
        var rDocs = [];
        rSnap.forEach(function (d) {
            var r = d.data() || {};
            var destino = mapa[String(r.avaliacaoId || '')];
            if (!destino) return;
            var copia = Object.assign({}, r);
            delete copia.docKey; delete copia._id;
            Object.keys(copia).forEach(function (k) { if (copia[k] === undefined) delete copia[k]; });
            copia.avaliacaoId = destino;
            copia.cursoId = ccAtual._id; copia.importadoEm = new Date().toISOString();
            rDocs.push(copia);
        });
        if (rDocs.length) await ccGravarLote('respostas', rDocs);
        ccLoadAvaliacoes();
        alert(copias.length + ' avaliação(ões) e ' + rDocs.length + ' resposta(s) importadas.');
    } catch (e) { alert('Erro ao importar avaliações: ' + e.message); }
}

/* ============ ABA VISÃO GERAL ============ */
function ccRenderGeral() {
    var box = document.getElementById('cc-geral-conteudo');
    if (!box || !ccAtual) return;
    box.innerHTML = '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">'
        + '<div style="width:86px;height:86px;border-radius:16px;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;overflow:hidden">'
        + ((ccAtual.iconeUrl || ccAtual.icone) ? '<img src="' + (ccAtual.iconeUrl || ccAtual.icone) + '" style="width:100%;height:100%;object-fit:contain">' : '<i class="fa-solid fa-book" style="font-size:34px;color:#2563eb"></i>')
        + '</div>'
        + '<div style="flex:1;min-width:200px"><div style="font-size:20px;font-weight:800;color:#0f172a">' + ccEsc(ccAtual.nome) + '</div>'
        + '<div style="font-size:12px;color:#64748b;margin-top:4px">Cadastrado em ' + (ccAtual.criadoEm ? new Date(ccAtual.criadoEm).toLocaleDateString('pt-BR') : '-') + '</div></div>'
        + '<button class="btn-outline" onclick="ccAbrirFormCurso(\'' + ccAtual._id + '\')"><i class="fa-solid fa-pen"></i> Editar curso</button>'
        + '</div>'
        + '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;margin-top:12px">'
        + '<h3 style="margin:0 0 10px;font-size:14px;color:#0f172a"><i class="fa-solid fa-file-pdf" style="color:#dc2626;margin-right:8px"></i> Apostila do curso</h3>'
        + (ccAtual.apostilaPdfUrl || ccAtual.apostilaPdf
            ? '<a class="btn-outline btn-sm" href="' + (ccAtual.apostilaPdfUrl || ccAtual.apostilaPdf) + '" download="apostila-' + ccEsc(ccAtual.nome) + '.pdf" target="_blank"><i class="fa-solid fa-download"></i> Baixar apostila (PDF)</a>'
            : '')
        + (ccAtual.apostilaUrl
            ? '<a class="btn-outline btn-sm" href="' + ccEsc(ccAtual.apostilaUrl) + '" target="_blank" style="margin-left:6px"><i class="fa-solid fa-link"></i> Abrir link da apostila</a>'
            : '')
        + ((!(ccAtual.apostilaPdfUrl || ccAtual.apostilaPdf) && !ccAtual.apostilaUrl) ? '<p style="font-size:12px;color:#94a3b8">Nenhuma apostila anexada. Use "Editar curso" para anexar.</p>' : '')
        + '</div>';
}

/* ============ ABA AVALIACAO ============ */
var ccAvsCache = [];
async function ccLoadAvaliacoes() {
    var box = document.getElementById('cc-avaliacoes-lista');
    if (!box || !ccAtual) return;
    box.innerHTML = '<p style="color:#64748b">Carregando avaliações...</p>';
    try {
        var snap = await ccRef('avaliacoes').orderBy('criadoEm', 'desc').get();
        ccAvsCache = [];
        snap.forEach(function (d) { ccAvsCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        if (!ccAvsCache.length) { box.innerHTML = '<p style="color:#94a3b8;padding:16px">Nenhuma avaliação criada neste curso.</p>'; return; }
        box.innerHTML = '<div style="display:grid;gap:10px">' + ccAvsCache.map(function (a) {
            return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#fff;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
                + '<div style="flex:1;min-width:180px"><div style="font-weight:700;color:#0f172a">' + ccEsc(a.nome) + '</div>'
                + '<div style="font-size:11px;color:#64748b;margin-top:3px">' + ccEsc(a.tipo || '') + ' • ' + ccQtdQuestoes(a) + ' questão(ões)'
                + (a.ativa ? ' • <span style="color:#16a34a">ATIVA</span>' : '')
                + (a.enviada ? ' • <span style="color:#2563eb">ENVIADA</span>' : '')
                + (a.recuperacaoEm ? ' • <span style="color:#ca8a04">RECUPERAÇÃO' + (a.recuperacaoParada ? ' PARADA' : '') + '</span>' : '')
                + (a.embaralhamentos ? ' • <span style="color:#7c3aed">embaralhada x' + a.embaralhamentos + '</span>' : '')
                + '</div></div>'
                + '<button class="btn-outline btn-sm" onclick="ccEditarAv(\'' + a._id + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-outline btn-sm" onclick="ccEnviarAv(\'' + a._id + '\')" title="Enviar para os indivíduos"><i class="fa-solid fa-paper-plane"></i> Enviar</button>'
                + '<button class="btn-outline btn-sm" onclick="ccAbrirRecuperacao(\'' + a._id + '\')" title="Recuperação">' + (a.recuperacaoEm ? 'Recuperação' : 'Recuperação') + '</button>'
                + '<button class="btn-outline btn-sm" onclick="ccEmbaralharAv(\'' + a._id + '\')" title="Embaralhar respostas"><i class="fa-solid fa-shuffle"></i></button>'
                + '<button class="btn-outline btn-sm" onclick="ccVerAvaliados(\'' + a._id + '\')"><i class="fa-solid fa-users"></i> Avaliados</button>'
                + '<button class="btn-outline btn-sm" onclick="ccImprimirAv(\'' + a._id + '\')" title="Imprimir"><i class="fa-solid fa-print"></i></button>'
                + '<button class="btn-outline btn-sm" onclick="ccAlternarAv(\'' + a._id + '\',' + (a.ativa ? 'false' : 'true') + ')">' + (a.ativa ? 'Desativar' : 'Ativar') + '</button>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirAv(\'' + a._id + '\')" title="Excluir"><i class="fa-solid fa-trash"></i></button>'
                + '</div>';
        }).join('') + '</div>';
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">Erro: ' + ccEsc(e.message) + '</p>'; }
}

function ccQtdQuestoes(a) { return (a.questoes || []).length; }

function ccNovaAv() { ccAbrirFormAv(null); }

function ccAbrirFormAv(id) {
    ccEditandoAvId = id || null;
    var av = id ? ccAvsCache.find(function (a) { return a._id === id; }) : null;
    var nome = document.getElementById('cc-av-nome'); if (nome) nome.value = av ? (av.nome || '') : '';
    var tipo = document.getElementById('cc-av-tipo'); if (tipo) tipo.value = av ? (av.tipo || 'teorica') : 'teorica';
    var disc = document.getElementById('cc-av-disciplina'); if (disc) disc.value = av ? (av.disciplina || '') : '';
    var aula = document.getElementById('cc-av-aula'); if (aula) aula.value = av ? (av.aula || '') : '';
    ccQuestoesTemp = av ? (JSON.parse(JSON.stringify(av.questoes || []))) : [];
    ccRenderQuestoes();
    var modal = document.getElementById('cc-modal-av'); if (modal) modal.classList.remove('hidden');
}
function ccFecharFormAv() { var m = document.getElementById('cc-modal-av'); if (m) m.classList.add('hidden'); }

function ccAddQuestao() {
    var tipo = (document.getElementById('cc-av-tipo') || {}).value || 'teorica';
    var q = { enunciado: '', opcoes: { a:'', b:'', c:'', d:'' }, correta: 'a' };
    ccQuestoesTemp.push(q); ccRenderQuestoes();
}
function ccRemQuestao(i) { ccQuestoesTemp.splice(i, 1); ccRenderQuestoes(); }

function ccRenderQuestoes() {
    var box = document.getElementById('cc-av-questoes');
    if (!box) return;
    var pratica = ((document.getElementById('cc-av-tipo') || {}).value || 'teorica').indexOf('pratica') >= 0;
    if (!ccQuestoesTemp.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhuma questão adicionada.</p>'; return; }
    box.innerHTML = ccQuestoesTemp.map(function (q, i) {
        return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px;background:#fff">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="font-size:12px;color:#2563eb">Questão ' + (i + 1) + '</b>'
            + '<button class="btn-danger btn-sm" style="margin-left:auto" onclick="ccRemQuestao(' + i + ')"><i class="fa-solid fa-trash"></i></button></div>'
            + '<textarea id="cc-q-' + i + '-enun" placeholder="Enunciado" style="width:100%;min-height:52px;padding:8px;border:1px solid #cbd5e1;border-radius:6px">' + ccEsc(q.enunciado) + '</textarea>'
            + (pratica ? '' : '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">'
                + ['a','b','c','d'].map(function (k) {
                    return '<label style="font-size:11px;color:#475569">'
                        + '<input type="radio" name="cc-q-' + i + '-correta" value="' + k + '" ' + (q.correta === k ? 'checked' : '') + '> '
                        + k.toUpperCase() + ': <input id="cc-q-' + i + '-' + k + '" value="' + ccEsc(q.opcoes[k]) + '" style="width:calc(100% - 40px);padding:5px;border:1px solid #cbd5e1;border-radius:5px"></label>';
                }).join('') + '</div>')
            + '</div>';
    }).join('');
}

function ccColetarQuestoes() {
    var pratica = ((document.getElementById('cc-av-tipo') || {}).value || 'teorica').indexOf('pratica') >= 0;
    return ccQuestoesTemp.map(function (q, i) {
        var item = { enunciado: (document.getElementById('cc-q-' + i + '-enun') || {}).value || '' };
        if (!pratica) {
            item.opcoes = {};
            ['a','b','c','d'].forEach(function (k) { item.opcoes[k] = (document.getElementById('cc-q-' + i + '-' + k) || {}).value || ''; });
            var sel = document.querySelector('input[name="cc-q-' + i + '-correta"]:checked');
            item.correta = sel ? sel.value : 'a';
        }
        return item;
    });
}

async function ccSalvarAv() {
    var nome = ((document.getElementById('cc-av-nome') || {}).value || '').trim();
    if (!nome) { alert('Informe o nome da avaliação.'); return; }
    var questoes = ccColetarQuestoes();
    if (!questoes.length) { alert('Adicione pelo menos uma questão.'); return; }
    var dados = {
        nome: nome,
        tipo: (document.getElementById('cc-av-tipo') || {}).value || 'teorica',
        disciplina: (document.getElementById('cc-av-disciplina') || {}).value || '',
        aula: (document.getElementById('cc-av-aula') || {}).value || '',
        questoes: questoes,
        atualizadoEm: new Date().toISOString()
    };
    try {
        if (ccEditandoAvId) await ccRef('avaliacoes', ccEditandoAvId).update(dados);
        else { dados.criadoEm = new Date().toISOString(); dados.ativa = false; await ccRef('avaliacoes').add(dados); }
        ccFecharFormAv(); ccLoadAvaliacoes();
        await ccSincronizarFicha(true);
    } catch (e) { alert('Erro ao salvar avaliação: ' + e.message); }
}
async function ccExcluirAv(id) {
    if (!confirm('Excluir esta avaliação?')) return;
    try { await ccRef('avaliacoes', id).delete(); ccLoadAvaliacoes(); } catch (e) { alert(e.message); }
}
async function ccAlternarAv(id, ativar) {
    try {
        await ccRef('avaliacoes', id).update({ ativa: ativar === true, ativadaEm: new Date().toISOString() });
        ccLoadAvaliacoes();
    } catch (e) { alert(e.message); }
}

/* ENVIO EM LOTE: marca a AV como enviada para os indivíduos do curso. */
async function ccEnviarAv(id) {
    var av = ccAvsCache.find(function (a) { return a._id === id; });
    if (!av) return;
    var cpfs = ccIndividuosCache.map(function (p) { return String(p.cpf || ''); }).filter(Boolean);
    if (!cpfs.length) {
        try {
            var snap = await ccRef('individuos').get();
            snap.forEach(function (d) { var p = d.data() || {}; if (p.cpf) cpfs.push(String(p.cpf)); });
        } catch (e) {}
    }
    if (!cpfs.length) { alert('Importe indivíduos para este curso antes de enviar.'); return; }
    if (!confirm('Enviar a avaliação "' + (av.nome || '') + '" para ' + cpfs.length + ' indivíduo(s) deste curso?')) return;
    try {
        await ccRef('avaliacoes', id).update({
            enviada: true, enviadaEm: new Date().toISOString(),
            alunosSelecionados: cpfs, cursoId: ccAtual._id
        });
        ccLoadAvaliacoes();
        await ccSincronizarFicha(true);
        alert('Avaliação enviada para ' + cpfs.length + ' indivíduo(s).');
    } catch (e) { alert('Erro ao enviar: ' + e.message); }
}

/* RECUPERACAO: abre modal com os indivíduos do curso para escolher quem
   pode responder/refazer. Lista vazia = todos. */
var ccRecAvId = null, ccRecSel = {}, ccRecFiltro = '';
async function ccAbrirRecuperacao(id) {
    ccRecAvId = id; ccRecSel = {}; ccRecFiltro = '';
    var av = ccAvsCache.find(function (a) { return a._id === id; });
    if (!av) return;
    var snap = await ccRef('individuos').get();
    var pessoas = [];
    snap.forEach(function (d) { pessoas.push(Object.assign({ _id: d.id }, d.data() || {})); });
    (av.alunosSelecionados || []).forEach(function (cpf) { ccRecSel[String(cpf)] = true; });
    var tit = document.getElementById('cc-generico-titulo'); var body = document.getElementById('cc-generico-body'); var m = document.getElementById('cc-modal-generico');
    if (tit) tit.textContent = 'Recuperação - ' + (av.nome || '');
    if (body) body.innerHTML =
        '<div style="font-size:12px;color:#64748b;margin-bottom:10px">Marque quem poderá responder/refazer. Nenhum marcado = turma inteira.</div>'
        + '<input id="cc-rec-filtro" class="config-input" placeholder="Filtrar por nome ou CPF" oninput="ccRecFiltrar()" style="width:100%;margin-bottom:10px">'
        + '<div id="cc-rec-lista" style="max-height:300px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px"></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
        + '<button class="btn-outline btn-sm" onclick="ccRecMarcarTodos(true)">Marcar todos</button>'
        + '<button class="btn-outline btn-sm" onclick="ccRecMarcarTodos(false)">Limpar</button>'
        + (av.recuperacaoEm ? '<button class="btn-outline btn-sm" onclick="ccPararRecuperacao()"><i class="fa-solid fa-stop"></i> Parar recuperação</button>' : '')
        + '<button class="btn-primary btn-sm" onclick="ccRecSalvar()" style="margin-left:auto"><i class="fa-solid fa-check"></i> Salvar recuperação</button>'
        + '</div>';
    window._ccRecPessoas = pessoas;
    ccRecRender();
    if (m) m.classList.remove('hidden');
}
function ccRecRender() {
    var box = document.getElementById('cc-rec-lista'); if (!box) return;
    var f = ccRecFiltro.toLowerCase();
    var pessoas = (window._ccRecPessoas || []).filter(function (p) {
        return !f || String(p.nome || '').toLowerCase().indexOf(f) >= 0 || String(p.cpf || '').indexOf(f) >= 0;
    });
    box.innerHTML = pessoas.map(function (p) {
        var chave = String(p.cpf || p._id);
        return '<label style="display:flex;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;cursor:pointer">'
            + '<input type="checkbox" ' + (ccRecSel[chave] ? 'checked' : '') + ' onchange="ccRecSel[\'' + ccEsc(chave) + '\']=this.checked">'
            + '<span style="flex:1">' + ccEsc(p.nome) + '</span><span style="color:#64748b;font-size:11px">' + ccEsc(p.cpf || '') + '</span></label>';
    }).join('') || '<p style="padding:10px;color:#94a3b8;font-size:12px">Nenhum indivíduo encontrado.</p>';
}
function ccRecFiltrar() { ccRecFiltro = (document.getElementById('cc-rec-filtro') || {}).value || ''; ccRecRender(); }
function ccRecMarcarTodos(v) {
    (window._ccRecPessoas || []).forEach(function (p) { ccRecSel[String(p.cpf || p._id)] = v; });
    ccRecRender();
}
async function ccRecSalvar() {
    var cpfs = Object.keys(ccRecSel).filter(function (k) { return ccRecSel[k]; });
    try {
        await ccRef('avaliacoes', ccRecAvId).update({
            alunosSelecionados: cpfs,
            recuperacaoEm: new Date().toISOString(),
            recuperacaoParada: false,
            recuperacaoParadaEm: null
        });
        ccFecharGenerico(); ccLoadAvaliacoes();
        alert('Recuperação configurada para ' + cpfs.length + ' indivíduo(s).' + (!cpfs.length ? ' (turma inteira)' : ''));
    } catch (e) { alert('Erro: ' + e.message); }
}
async function ccPararRecuperacao() {
    if (!confirm('Parar a recuperação desta avaliação?')) return;
    try {
        await ccRef('avaliacoes', ccRecAvId).update({ recuperacaoParada: true, recuperacaoParadaEm: new Date().toISOString() });
        ccFecharGenerico(); ccLoadAvaliacoes();
    } catch (e) { alert(e.message); }
}

/* EMBARALHAMENTO: embaralha as opcoes e reajusta o gabarito preservando as
   respostas ja enviadas (remapeia letras para o mesmo texto). */
async function ccEmbaralharAv(id) {
    var av = ccAvsCache.find(function (a) { return a._id === id; });
    if (!av) return;
    if (!confirm('Embaralhar as alternativas desta avaliação?\n\nO gabarito será reajustado e as respostas já enviadas serão remapeadas (acertos e notas preservados).')) return;
    try {
        var doc = await ccRef('avaliacoes', id).get();
        var dados = doc.data() || {};
        var questoes = dados.questoes || [];
        if (!questoes.length) { alert('Esta avaliação não possui questões.'); return; }
        var letras = ['a','b','c','d'];
        var mapas = [];
        var novas = questoes.map(function (q) {
            if (!q.opcoes) { mapas.push(null); return q; }
            var ordem = letras.map(function (l) { return { texto: q.opcoes[l] || '', correta: (l === (q.correta || '')), antiga: l }; });
            for (var i = ordem.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = ordem[i]; ordem[i] = ordem[j]; ordem[j] = tmp;
            }
            var igual = ordem.every(function (it, i) { return it.texto === (q.opcoes[letras[i]] || ''); });
            if (igual && ordem.length > 1) ordem.push(ordem.shift());
            var opcoes = {}, mapa = {}, correta = '';
            ordem.forEach(function (it, i) {
                var nova = letras[i];
                opcoes[nova] = it.texto; mapa[it.antiga] = nova;
                if (it.correta) correta = nova;
            });
            mapas.push(mapa);
            return { enunciado: q.enunciado || '', opcoes: opcoes, correta: correta };
        });
        var total = Number(dados.embaralhamentos || 0) + 1;
        var rSnap = await ccRef('respostas').where('avaliacaoId', '==', id).get();
        var batch = ccDb().batch(), remapeadas = 0;
        rSnap.forEach(function (rDoc) {
            var r = rDoc.data() || {}, resp = r.respostas || {}, novo = {}, mudou = false;
            Object.keys(resp).forEach(function (k) {
                var mapa = mapas[Number(k)], letra = resp[k];
                novo[k] = (mapa && mapa[letra]) ? mapa[letra] : letra;
                if (novo[k] !== letra) mudou = true;
            });
            if (mudou) { batch.set(rDoc.ref, { respostas: novo, respostasEmbaralhadasEm: new Date().toISOString() }, { merge: true }); remapeadas++; }
        });
        batch.set(ccRef('avaliacoes', id), { questoes: novas, embaralhamentos: total }, { merge: true });
        await batch.commit();
        ccLoadAvaliacoes();
        alert('Alternativas embaralhadas. Embaralhamentos: ' + total + '.' + (remapeadas ? '\nRespostas de ' + remapeadas + ' aluno(s) remapeadas (notas preservadas).' : ''));
    } catch (e) { alert('Erro ao embaralhar: ' + e.message); }
}

async function ccVerAvaliados(id) {
    var av = ccAvsCache.find(function (a) { return a._id === id; });
    try {
        var snap = await ccRef('respostas').where('avaliacaoId', '==', id).get();
        var linhas = [];
        snap.forEach(function (d) { var r = d.data() || {}; linhas.push('<tr><td style="padding:6px;border-bottom:1px solid #eef2f7">' + ccEsc(r.nome) + '</td><td style="padding:6px;border-bottom:1px solid #eef2f7">' + ccEsc(r.cpf) + '</td><td style="padding:6px;border-bottom:1px solid #eef2f7;font-weight:800">' + ccEsc(r.nota != null ? r.nota : '-') + '</td></tr>'); });
        var html = '<h3 style="margin:0 0 10px">Avaliados - ' + ccEsc(av ? av.nome : '') + '</h3>'
            + (linhas.length ? '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f5f9"><th style="padding:6px;text-align:left">Nome</th><th style="padding:6px;text-align:left">CPF</th><th style="padding:6px;text-align:left">Nota</th></tr></thead><tbody>' + linhas.join('') + '</tbody></table>'
                : '<p style="color:#94a3b8">Nenhuma resposta registrada.</p>');
        var modal = document.getElementById('cc-modal-generico'); var body = document.getElementById('cc-generico-body'); var tit = document.getElementById('cc-generico-titulo');
        if (tit) tit.textContent = 'Avaliados'; if (body) body.innerHTML = html; if (modal) modal.classList.remove('hidden');
    } catch (e) { alert(e.message); }
}

function ccImprimirAv(id) {
    var av = ccAvsCache.find(function (a) { return a._id === id; });
    if (!av) return;
    var html = '<html><head><meta charset="utf-8"><title>' + ccEsc(av.nome) + '</title></head><body style="font-family:Arial;padding:28px">'
        + '<h2>' + ccEsc(av.nome) + '</h2><p>' + ccEsc(av.tipo || '') + '</p>'
        + (av.questoes || []).map(function (q, i) {
            return '<div style="margin-bottom:16px"><b>' + (i + 1) + ') ' + ccEsc(q.enunciado) + '</b>'
                + (q.opcoes ? '<div style="margin-left:16px">' + ['a','b','c','d'].map(function (k) { return '<div>' + k.toUpperCase() + ') ' + ccEsc(q.opcoes[k]) + '</div>'; }).join('') + '</div>' : '')
                + '</div>';
        }).join('')
        + '<h3>Gabarito</h3>' + (av.questoes || []).map(function (q, i) { return '<div>' + (i + 1) + ') ' + ccEsc((q.correta || '').toUpperCase()) + '</div>'; }).join('')
        + '</body></html>';
    var w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); setTimeout(function () { w.print(); }, 400); }
}

function ccFecharGenerico() { var m = document.getElementById('cc-modal-generico'); if (m) m.classList.add('hidden'); }

/* ============ ABA DISCIPLINAS E AULAS ============ */
var ccDiscCache = [], ccAulasCache = [];
async function ccLoadDisciplinas() {
    var box = document.getElementById('cc-disc-lista'); if (!box || !ccAtual) return;
    try {
        var snap = await ccRef('disciplinas').orderBy('nome').get();
        ccDiscCache = []; snap.forEach(function (d) { ccDiscCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        box.innerHTML = ccDiscCache.length ? ccDiscCache.map(function (d) {
            return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:6px;display:flex;align-items:center;gap:8px;background:#fff">'
                + '<b style="font-size:13px;color:#0f172a;flex:1">' + ccEsc(d.nome) + '</b>'
                + '<span style="font-size:11px;color:#64748b">' + ccEsc(d.docente || '') + '</span>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirDisc(\'' + d._id + '\')"><i class="fa-solid fa-trash"></i></button></div>';
        }).join('') : '<p style="color:#94a3b8;font-size:12px">Nenhuma disciplina cadastrada.</p>';
        var sel = document.getElementById('cc-aula-disciplina');
        if (sel) sel.innerHTML = '<option value="">Selecione...</option>' + ccDiscCache.map(function (d) { return '<option value="' + ccEsc(d.nome) + '">' + ccEsc(d.nome) + '</option>'; }).join('');
        var selAv = document.getElementById('cc-av-disciplina');
        if (selAv) selAv.innerHTML = '<option value="">Selecione...</option>' + ccDiscCache.map(function (d) { return '<option value="' + ccEsc(d.nome) + '">' + ccEsc(d.nome) + '</option>'; }).join('');
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
async function ccSalvarDisc() {
    var nomeEl = document.getElementById('cc-disc-nome');
    var nome = ((nomeEl || {}).value || '').trim();
    if (!nome) { alert('Informe o nome da disciplina.'); return; }
    if (!ccAtual || !ccAtual._id) { alert('Nenhum curso aberto. Volte à lista e abra o curso novamente.'); return; }
    var docenteEl = document.getElementById('cc-disc-docente');
    var docente = ((docenteEl || {}).value || '').trim();
    try {
        await dbFirestore.collection(CC_COLECAO).doc(ccAtual._id)
            .collection('disciplinas').add({
                nome: nome,
                docente: docente,
                cursoId: ccAtual._id,
                criadoEm: new Date().toISOString()
            });
        if (nomeEl) nomeEl.value = '';
        if (docenteEl) docenteEl.value = '';
        await ccLoadDisciplinas();
        alert('Disciplina salva com sucesso.');
    } catch (e) {
        console.error('Erro ao salvar disciplina:', e);
        alert('Erro ao salvar disciplina: ' + (e && e.message ? e.message : e));
    }
}
async function ccExcluirDisc(id) { if (!confirm('Excluir disciplina?')) return; try { await ccRef('disciplinas', id).delete(); ccLoadDisciplinas(); } catch (e) { alert(e.message); } }

async function ccLoadAulas() {
    var box = document.getElementById('cc-aula-lista'); if (!box || !ccAtual) return;
    try {
        var snap = await ccRef('aulas').orderBy('data', 'desc').get();
        ccAulasCache = []; snap.forEach(function (d) { ccAulasCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        box.innerHTML = ccAulasCache.length ? ccAulasCache.map(function (a) {
            return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:9px;margin-bottom:6px;background:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
                + '<b style="font-size:13px;color:#0f172a">' + ccEsc(a.conteudo || a.disciplina) + '</b>'
                + '<span style="font-size:11px;color:#64748b">' + ccEsc(a.data || '') + ' ' + ccEsc(a.horario || '') + '</span>'
                + (a.apontada ? '<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:8px">Apontada</span>' : '')
                + '<button class="btn-outline btn-sm" style="margin-left:auto" onclick="ccQrInicio(\'' + a._id + '\')" title="QR de início"><i class="fa-solid fa-qrcode"></i></button>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirAula(\'' + a._id + '\')"><i class="fa-solid fa-trash"></i></button></div>';
        }).join('') : '<p style="color:#94a3b8;font-size:12px">Nenhuma aula cadastrada.</p>';
        var sa = document.getElementById('cc-av-aula');
        if (sa) sa.innerHTML = '<option value="">Selecione...</option>' + ccAulasCache.map(function (a) { return '<option value="' + ccEsc(a.conteudo) + '">' + ccEsc(a.conteudo || '') + '</option>'; }).join('');
        var spa = document.getElementById('cc-apt-aula');
        if (spa) spa.innerHTML = '<option value="">Selecione a aula...</option>' + ccAulasCache.map(function (a) { return '<option value="' + a._id + '">' + ccEsc((a.data || '') + ' - ' + (a.conteudo || '')) + '</option>'; }).join('');
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
async function ccSalvarAula() {
    var disc = ((document.getElementById('cc-aula-disciplina') || {}).value || '').trim();
    var data = ((document.getElementById('cc-aula-data') || {}).value || '').trim();
    if (!disc || !data) { alert('Informe disciplina e data da aula.'); return; }
    try {
        await ccRef('aulas').add({
            disciplina: disc,
            docente: ((document.getElementById('cc-aula-docente') || {}).value || '').trim(),
            data: data,
            horario: ((document.getElementById('cc-aula-horario') || {}).value || '').trim(),
            conteudo: ((document.getElementById('cc-aula-conteudo') || {}).value || '').trim(),
            avTeorica: ((document.getElementById('cc-aula-av-teorica') || {}).value || ''),
            avPratica: ((document.getElementById('cc-aula-av-pratica') || {}).value || ''),
            criadoEm: new Date().toISOString()
        });
        ['cc-aula-data','cc-aula-horario','cc-aula-conteudo'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        ccLoadAulas();
    } catch (e) { alert(e.message); }
}
async function ccExcluirAula(id) { if (!confirm('Excluir aula?')) return; try { await ccRef('aulas', id).delete(); ccLoadAulas(); } catch (e) { alert(e.message); } }

function ccQrInicio(aulaId) {
    var aula = ccAulasCache.find(function (a) { return a._id === aulaId; });
    var texto = 'FARN-INICIO:' + aulaId;
    var url = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(texto) + '&size=220x220&margin=2';
    var tit = document.getElementById('cc-generico-titulo'); var body = document.getElementById('cc-generico-body'); var m = document.getElementById('cc-modal-generico');
    if (tit) tit.textContent = 'QR de início da aula';
    if (body) body.innerHTML = '<div style="text-align:center"><img src="' + url + '" alt="QR"><p style="font-size:12px;color:#475569;margin-top:10px">' + ccEsc(aula ? (aula.conteudo || aula.data) : '') + '</p><p style="font-size:11px;color:#94a3b8">Conteúdo: ' + ccEsc(texto) + '</p></div>';
    if (m) m.classList.remove('hidden');
}

/* ============ ABA INDIVIDUOS (IMPORTAR) ============ */
var ccIndividuosCache = [];
async function ccLoadIndividuos() {
    var box = document.getElementById('cc-individuos-lista'); if (!box || !ccAtual) return;
    try {
        var snap = await ccRef('individuos').get();
        ccIndividuosCache = [];
        snap.forEach(function (d) {
            var p = Object.assign({ _id: d.id }, d.data() || {});
            /* Defesa extra: mesmo que o banco devolva algo de outro curso,
               nada de outro curso aparece na lista deste. */
            if (p.cursoId && String(p.cursoId) !== String(ccAtual._id)) return;
            ccIndividuosCache.push(p);
        });
        box.innerHTML = ccIndividuosCache.length ? '<div style="display:grid;gap:6px">' + ccIndividuosCache.map(function (p) {
            return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:9px;background:#fff;display:flex;align-items:center;gap:8px">'
                + '<b style="font-size:13px;flex:1">' + ccEsc(p.nome) + '</b><span style="font-size:11px;color:#64748b">' + ccEsc(p.cpf || '') + '</span>'
                + '<button class="btn-danger btn-sm" onclick="ccRemoverIndividuo(\'' + p._id + '\')"><i class="fa-solid fa-trash"></i></button></div>';
        }).join('') + '</div>' : '<p style="color:#94a3b8;font-size:12px">Nenhum indivíduo importado.</p>';
        var cnt = document.getElementById('cc-individuos-count'); if (cnt) cnt.textContent = ccIndividuosCache.length;
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
function ccRenderImportar() {
    var box = document.getElementById('cc-importar-lista'); if (!box) return;
    var f = ccImportFiltro.toLowerCase();
    var lista = (typeof candidatos !== 'undefined' ? candidatos : []).filter(function (c) {
        if (!f) return true;
        return [c.nome, c.cpf, c.projeto, c.turma, c.matricula].some(function (v) { return String(v || '').toLowerCase().indexOf(f) >= 0; });
    });
    box.innerHTML = '<label style="font-size:12px;color:#475569;display:block;margin-bottom:6px">Filtrar (nome, CPF, projeto, turma, matrícula)</label>'
        + '<input id="cc-importar-filtro" class="config-input" value="' + ccEsc(ccImportFiltro) + '" oninput="ccImportFiltro=this.value;ccRenderImportar()" style="width:100%;margin-bottom:10px">'
        + '<div style="max-height:300px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px">'
        + lista.map(function (c) {
            var chave = String(c.cpf || c.id || '');
            return '<label style="display:flex;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;cursor:pointer">'
                + '<input type="checkbox" ' + (ccImportSel[chave] ? 'checked' : '') + ' onchange="ccImportSel[\'' + ccEsc(chave) + '\']=this.checked">'
                + '<span style="flex:1">' + ccEsc(c.nome) + '</span><span style="color:#64748b;font-size:11px">' + ccEsc(c.projeto || '') + ' / ' + ccEsc(c.turma || '') + '</span></label>';
        }).join('') + '</div>';
}
async function ccImportarSelecionados() {
    var todos = (typeof candidatos !== 'undefined' ? candidatos : []);
    var selecionados = todos.filter(function (c) { return ccImportSel[String(c.cpf || c.id || '')]; });
    if (!selecionados.length) { alert('Marque pelo menos um indivíduo.'); return; }
    if (!ccAtual || !ccAtual._id || ccAtual._id === 'undefined') {
        alert('Este curso está com ID inválido (criado antes de uma correção). Recrie o curso antes de importar.');
        return;
    }
    try {
        var batch = ccDb().batch(); var n = 0;
        selecionados.forEach(function (c) {
            var dados = Object.assign({}, c);
            delete dados.docKey; delete dados._id;
            /* O Firestore nao aceita undefined em nenhum campo. */
            Object.keys(dados).forEach(function (k) {
                if (dados[k] === undefined) delete dados[k];
            });
            /* Marca o dono dos dados: nada compartilha com outro curso. */
            dados.cursoId = ccAtual._id;
            dados.cursoNome = ccAtual.nome || '';
            dados.importadoEm = new Date().toISOString();
            batch.set(ccRef('individuos').doc(), dados); n++;
        });
        await batch.commit();
        ccImportSel = {}; ccLoadIndividuos(); ccRenderImportar();
        alert(n + ' indivíduo(s) importado(s) como cópia.');
    } catch (e) { alert(e.message); }
}
async function ccRemoverIndividuo(id) { if (!confirm('Remover indivíduo deste curso?')) return; try { await ccRef('individuos', id).delete(); ccLoadIndividuos(); } catch (e) { alert(e.message); } }

/* ============ ABA APONTAMENTO ============ */
function ccInitApontamento() {
    ccLoadAulas();
    ccLoadIndividuos();
    ccCarregarHistorico();
}
function ccAptCarregarIndividuos() {
    return ccIndividuosCache.slice();
}
async function ccAbrirApontamento() {
    var aulaId = (document.getElementById('cc-apt-aula') || {}).value || '';
    if (!aulaId) { alert('Selecione a aula.'); return; }
    ccAptAula = ccAulasCache.find(function (a) { return a._id === aulaId; }) || null;
    ccAptDisciplina = ccAptAula ? (ccAptAula.disciplina || '') : '';
    ccAptPresencas = {};
    ccAptAlunos = ccAptCarregarIndividuos();
    ccAptAlunos.forEach(function (p) {
        ccAptPresencas[String(p.cpf)] = { cpf: p.cpf, nome: p.nome, matricula: p.matricula || '', status: 'Falta', obs: '', foP: 0, foN: 0, inicioPresente: false, inicioHora: '' };
    });
    if (!ccAptAlunos.length) { alert('Importe indivíduos para este curso antes de apontar.'); return; }
    ccRenderAptLista();
    var m = document.getElementById('cc-modal-apontamento'); if (m) m.classList.remove('hidden');
}
function ccFecharApontamento() { ccPararScanner(); var m = document.getElementById('cc-modal-apontamento'); if (m) m.classList.add('hidden'); }

function ccRenderAptLista() {
    var box = document.getElementById('cc-apt-lista'); if (!box) return;
    var linhas = ccAptAlunos.map(function (p, i) {
        var s = ccAptPresencas[String(p.cpf)] || {};
        return '<tr style="border-bottom:1px solid #eef2f7">'
            + '<td style="padding:6px;font-family:monospace;font-size:11px">' + ccEsc(s.matricula || p.matricula || '-') + '</td>'
            + '<td style="padding:6px;font-size:12px">' + ccEsc(p.nome) + '</td>'
            + '<td style="padding:6px;text-align:center">' + (s.inicioPresente ? '<span style="color:#16a34a">✓ ' + ccEsc(s.inicioHora || '') + '</span>' : '-') + '</td>'
            + '<td style="padding:6px;text-align:center">' + (s.foP || 0) + ' / ' + (s.foN || 0) + '</td>'
            + '<td style="padding:6px;text-align:center">'
            + ['Presente','Falta','Justificada'].map(function (st) {
                var lbl = st === 'Presente' ? 'P' : (st === 'Falta' ? 'F' : 'J');
                var cor = s.status === st ? (st === 'Presente' ? '#16a34a' : (st === 'Falta' ? '#dc2626' : '#d97706')) : '#94a3b8';
                return '<button onclick="ccAptSetStatus(\'' + ccEsc(String(p.cpf)) + '\',\'' + st + '\')" style="border:1px solid ' + cor + ';color:' + cor + ';background:' + (s.status === st ? cor + '22' : 'transparent') + ';border-radius:5px;padding:2px 7px;margin:0 1px;font-size:10px;font-weight:800">' + lbl + '</button>';
            }).join('') + '</td>'
            + '<td style="padding:6px"><input value="' + ccEsc(s.obs || '') + '" onchange="ccAptSetObs(\'' + ccEsc(String(p.cpf)) + '\',this.value)" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px"></td>'
            + '</tr>';
    }).join('');
    var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f5f9">'
        + '<th style="padding:6px;text-align:left;font-size:10px">Matrícula</th><th style="padding:6px;text-align:left;font-size:10px">Nome</th>'
        + '<th style="padding:6px;font-size:10px">Início</th><th style="padding:6px;font-size:10px">FO+ / FO-</th><th style="padding:6px;font-size:10px">P / F / J</th><th style="padding:6px;text-align:left;font-size:10px">Obs</th>'
        + '</tr></thead><tbody>' + linhas + '</tbody></table>';
    box.innerHTML = html;
    var cnt = document.getElementById('cc-apt-count'); if (cnt) cnt.textContent = ccAptAlunos.length;
}
function ccAptSetStatus(cpf, st) { if (ccAptPresencas[cpf]) { ccAptPresencas[cpf].status = st; ccRenderAptLista(); } }
function ccAptSetObs(cpf, v) { if (ccAptPresencas[cpf]) ccAptPresencas[cpf].obs = v; }
function ccAptBuscarMatricula() {
    var val = ((document.getElementById('cc-apt-matricula') || {}).value || '').trim().toUpperCase();
    if (!val) return;
    var p = ccAptAlunos.find(function (x) { return String(x.matricula || '').toUpperCase() === val || String(x.cpf) === val.replace(/\D/g, ''); });
    if (!p) { alert('Matrícula não encontrada nos indivíduos deste curso.'); return; }
    if (ccAptPresencas[String(p.cpf)]) { ccAptPresencas[String(p.cpf)].status = 'Presente'; ccRenderAptLista(); }
    var inp = document.getElementById('cc-apt-matricula'); if (inp) inp.value = '';
}

async function ccIniciarScanner() {
    if (ccAptEscaneando) { ccPararScanner(); return; }
    if (typeof Html5Qrcode === 'undefined') { alert('Biblioteca de leitura de QR não carregada.'); return; }
    var el = document.getElementById('cc-apt-qr');
    if (!el) return;
    try {
        ccScanner = new Html5Qrcode('cc-apt-qr');
        await ccScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (texto) {
            var val = String(texto || '').trim().toUpperCase();
            var p = ccAptAlunos.find(function (x) { return String(x.matricula || '').toUpperCase() === val; });
            if (p && ccAptPresencas[String(p.cpf)]) {
                ccAptPresencas[String(p.cpf)].status = 'Presente';
                ccRenderAptLista();
            }
        }, function () {});
        ccAptEscaneando = true;
        var b = document.getElementById('cc-apt-btn-scanner'); if (b) b.textContent = 'Parar leitura';
    } catch (e) { alert('Erro ao iniciar câmera: ' + e.message); }
}
function ccPararScanner() {
    if (ccScanner && ccAptEscaneando) { try { ccScanner.stop().then(function () { ccScanner.clear(); }); } catch (e) {} }
    ccScanner = null; ccAptEscaneando = false;
    var b = document.getElementById('cc-apt-btn-scanner'); if (b) b.textContent = 'Ler QR Code';
    var el = document.getElementById('cc-apt-qr'); if (el) el.innerHTML = '';
}

async function ccSalvarApontamento() {
    if (!ccAptAula) { alert('Selecione a aula.'); return; }
    var presentes = 0, faltas = 0, just = 0;
    var alunos = ccAptAlunos.map(function (p) {
        var s = ccAptPresencas[String(p.cpf)] || {};
        if (s.status === 'Presente') presentes++; else if (s.status === 'Falta') faltas++; else if (s.status === 'Justificada') just++;
        return { cpf: p.cpf, nome: p.nome, matricula: p.matricula || '', status: s.status || 'Falta', obs: s.obs || '', foP: s.foP || 0, foN: s.foN || 0, inicioPresente: !!s.inicioPresente, inicioHora: s.inicioHora || '' };
    });
    var agora = new Date().toISOString();
    var cab = {
        aulaId: ccAptAula._id, aula: ccAptAula.conteudo || '', disciplina: ccAptDisciplina,
        dataAula: ccAptAula.data || '', horaAula: ccAptAula.horario || '',
        alunos: alunos, presentes: presentes, faltas: faltas, justificadas: just,
        criadoEm: agora
    };
    try {
        var ref = await ccRef('apontamentos').add(cab);
        var batch = ccDb().batch();
        alunos.forEach(function (a) {
            var pessoa = ccAptAlunos.find(function (x) { return String(x.cpf) === String(a.cpf); }) || {};
            batch.set(ccRef('presencas').doc(), Object.assign({}, a, {
                aulaId: ccAptAula._id, dataAula: ccAptAula.data || '', disciplina: ccAptDisciplina,
                turma: pessoa.turma || '', projeto: pessoa.projeto || '',
                apontamentoId: ref.id, criadoEm: agora
            }));
        });
        await batch.commit();
        try { await ccRef('aulas', ccAptAula._id).update({ apontada: true }); } catch (e) {}
        ccFecharApontamento();
        ccLoadAulas(); ccCarregarHistorico();
        alert('Apontamento salvo: ' + presentes + ' presente(s), ' + faltas + ' falta(s), ' + just + ' justificada(s).');
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
}

var ccHistCache = [];
async function ccCarregarHistorico() {
    var box = document.getElementById('cc-apt-historico'); if (!box || !ccAtual) return;
    try {
        var snap = await ccRef('apontamentos').orderBy('criadoEm', 'desc').limit(100).get();
        ccHistCache = []; snap.forEach(function (d) { ccHistCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        box.innerHTML = ccHistCache.length ? ccHistCache.map(function (r) {
            return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:9px;margin-bottom:6px;background:#fff;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
                + '<div style="flex:1;min-width:160px"><b style="font-size:12px">' + ccEsc(r.aula || r.disciplina || 'Apontamento') + '</b>'
                + '<div style="font-size:11px;color:#64748b">' + ccEsc(r.dataAula || '') + ' • ' + ccFmtData(r.criadoEm)
                + ' • P:' + (r.presentes || 0) + ' F:' + (r.faltas || 0) + ' J:' + (r.justificadas || 0) + '</div></div>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirApt(\'' + r._id + '\')"><i class="fa-solid fa-trash"></i></button></div>';
        }).join('') : '<p style="color:#94a3b8;font-size:12px">Nenhum apontamento registrado.</p>';
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
function ccFmtData(v) { if (!v) return ''; try { return new Date(v).toLocaleString('pt-BR'); } catch (e) { return String(v); } }
async function ccExcluirApt(id) {
    if (!confirm('Excluir este apontamento e suas presenças?')) return;
    try {
        var batch = ccDb().batch();
        var snap = await ccRef('presencas').where('apontamentoId', '==', id).get();
        snap.forEach(function (d) { batch.delete(d.ref); });
        batch.delete(ccRef('apontamentos', id));
        await batch.commit();
        ccCarregarHistorico();
    } catch (e) { alert(e.message); }
}

/* ============ SINCRONIZAÇÃO DA FICHA GERAL DO CURSO ============
   Consolida em fichaAvaliacoes os dados gerados nas outras guias do curso:
   respostas das avaliações (Criar Avaliação) e presenças (Apontamentos).
   As aulas/disciplinas ja sao lidas diretamente da subcolecao do curso. */
async function ccSincronizarFicha(silent) {
    if (!ccAtual || !ccAtual._id) return;
    try {
        var [indSnap, avSnap, respSnap, presSnap, aulaSnap] = await Promise.all([
            ccRef('individuos').get(),
            ccRef('avaliacoes').get(),
            ccRef('respostas').get(),
            ccRef('presencas').get(),
            ccRef('aulas').get()
        ]);
        var aulasCurso = [];
        aulaSnap.forEach(function (d) { aulasCurso.push(Object.assign({ _id: d.id }, d.data() || {})); });
        var avs = {};
        avSnap.forEach(function (d) {
            var av = Object.assign({ _id: d.id }, d.data() || {});
            /* A aula importada do administrador ganhou outro ID no curso;
               resolve pelo conteudo para a nota aparecer na Ficha Geral. */
            var local = aulasCurso.find(function (a) { return a._id === av.aulaId; });
            if (!local && av.aula) local = aulasCurso.find(function (a) { return String(a.conteudo || '') === String(av.aula); });
            if (!local && av.disciplina) {
                var candidatas = aulasCurso.filter(function (a) { return String(a.disciplina || '') === String(av.disciplina); });
                if (candidatas.length === 1) local = candidatas[0];
            }
            if (!local && av.data) {
                var porData = aulasCurso.filter(function (a) { return String(a.data || '') === String(av.data); });
                if (porData.length === 1) local = porData[0];
            }
            if (local) av.aulaIdLocal = local._id;
            avs[d.id] = av;
        });
        var respostasPorCpf = {}, presencasPorCpf = {};
        respSnap.forEach(function (d) {
            var r = d.data() || {}, cpf = String(r.cpf || '');
            if (!cpf) return;
            if (!respostasPorCpf[cpf]) respostasPorCpf[cpf] = [];
            respostasPorCpf[cpf].push(r);
        });
        presSnap.forEach(function (d) {
            var p = d.data() || {}, cpf = String(p.cpf || '');
            if (!cpf) return;
            if (!presencasPorCpf[cpf]) presencasPorCpf[cpf] = [];
            presencasPorCpf[cpf].push(Object.assign({ _id: d.id }, p));
        });
        var individuos = [];
        indSnap.forEach(function (d) { individuos.push(Object.assign({ _id: d.id }, d.data() || {})); });
        var batch = ccDb().batch(), n = 0, agora = new Date().toISOString();
        for (var i = 0; i < individuos.length; i++) {
            var p = individuos[i], cpf = String(p.cpf || '');
            if (!cpf) continue;
            var atual = await ccRef('fichaAvaliacoes', cpf).get();
            var base = (atual.exists && atual.data()) ? atual.data() : {};
            var av = Object.assign({}, base.av || {});
            ['notasTeoricas','notasPraticas','avTeoricaManual','avPraticaManual'].forEach(function (k) {
                if (!av[k] || typeof av[k] !== 'object') av[k] = {};
            });
            (respostasPorCpf[cpf] || []).forEach(function (r) {
                var avDoc = avs[String(r.avaliacaoId || '')];
                if (!avDoc) return;
                var tipo = String(avDoc.tipo || 'teorica');
                var questoes = avDoc.questoes || [];
                var respostas = r.respostas || {};
                var certas = 0;
                Object.keys(respostas).forEach(function (k) {
                    var q = questoes[Number(k)];
                    if (q && q.correta && String(respostas[k]).toLowerCase() === String(q.correta).toLowerCase()) certas++;
                });
                var total = questoes.length || Number(r.totalQuestoes || 0) || 1;
                var peso = total === 10 ? 1 : (total === 20 ? 0.5 : 10 / total);
                var nota = (r.nota != null && r.nota !== '') ? parseFloat(String(r.nota).replace(',', '.'))
                    : (r.pontos != null && r.pontos !== '') ? parseFloat(String(r.pontos).replace(',', '.'))
                    : Math.round(Math.max(0, Math.min(10, certas * peso)) * 10) / 10;
                if (isNaN(nota)) return;
                if (tipo === 'final_teorica') av.avFinalTeorica = nota;
                else if (tipo === 'final_pratica') av.avFinalPratica = nota;
                else if (tipo === 'pratica') {
                    if (avDoc.aulaIdLocal) av.notasPraticas[avDoc.aulaIdLocal] = nota;
                    else av.notasPraticas[avDoc._id] = nota;
                    av.avPraticaManual[avDoc._id] = {
                        avaliacaoId: avDoc._id, avaliacaoNome: avDoc.nome || '',
                        respostas: respostas, totalQuestoes: total, nota: nota,
                        respondidoEm: r.enviadoEm || agora
                    };
                } else {
                    var chaveTeorica = avDoc.aulaIdLocal || avDoc._id;
                    av.notasTeoricas[chaveTeorica] = nota;
                    av.avTeoricaManual[avDoc._id] = {
                        avaliacaoId: avDoc._id, avaliacaoNome: avDoc.nome || '',
                        respostas: respostas, totalQuestoes: total, nota: nota,
                        respondidoEm: r.enviadoEm || agora
                    };
                }
            });
            batch.set(ccRef('fichaAvaliacoes', cpf), {
                cpf: cpf,
                av: av,
                presencas: presencasPorCpf[cpf] || base.presencas || [],
                sincronizadoEm: agora,
                cursoId: ccAtual._id
            });
            n++;
        }
        if (n) await batch.commit();
        if (!silent) alert('Ficha Geral sincronizada: ' + n + ' indivíduo(s) atualizado(s) com avaliações e apontamentos do curso.');
        return n;
    } catch (e) {
        console.error('Erro ao sincronizar ficha do curso:', e);
        if (!silent) alert('Erro ao sincronizar: ' + e.message);
        return 0;
    }
}

/* ============ ABA FICHA GERAL DO CURSO ============ */
var ccFichaCache = [];
async function ccInitFicha() {
    var box = document.getElementById('cc-ficha-lista');
    if (!box || !ccAtual) return;
    box.innerHTML = '<p style="color:#64748b">Carregando fichas...</p>';
    try {
        /* Trai as respostas e apontamentos do proprio curso para a ficha. */
        await ccSincronizarFicha(true);
        var resultado = await Promise.all([
            ccRef('individuos').get(),
            ccRef('aulas').orderBy('data').get(),
            ccRef('fichaAvaliacoes').get()
        ]);
        var fichasSnapshot = {};
        resultado[2].forEach(function (d) {
            var f = d.data() || {};
            if (f.cpf) fichasSnapshot[String(f.cpf)] = f;
        });
        var aulas = { todas: [], teorica: [], pratica: [] };
        resultado[1].forEach(function (d) {
            var a = Object.assign({ _id: d.id }, d.data() || {});
            aulas.todas.push(a);
            if (a.avTeorica === 'Sim') aulas.teorica.push(a);
            if (a.avPratica === 'Sim') aulas.pratica.push(a);
        });
        var pessoas = [];
        resultado[0].forEach(function (d) { pessoas.push(Object.assign({ _id: d.id }, d.data() || {})); });
        ccFichaCache = [];
        if (!pessoas.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum indivíduo importado para este curso.</p>'; return; }
        var html = '';
        for (var i = 0; i < pessoas.length; i++) {
            var p = pessoas[i];
            try {
                if (typeof fichaGeralCarregarInstituicao === 'function') await fichaGeralCarregarInstituicao(true);
                var dados = await fichaGeralDadosAluno(p);
                var snapshot = fichasSnapshot[String(p.cpf)];
                if (snapshot) {
                    dados.av = Object.assign({}, snapshot, dados.av || {});
                    ['notasTeoricas','notasPraticas','avTeoricaManual','avPraticaManual'].forEach(function (k) {
                        dados.av[k] = Object.assign({}, snapshot[k] || {}, (dados.av && dados.av[k]) || {});
                    });
                    if (snapshot.presencas && snapshot.presencas.length) dados.presencas = snapshot.presencas;
                }
                var calc = fichaGeralCalcular(p, dados, aulas);
                if (typeof fichaGeralProjeto !== 'undefined') fichaGeralProjeto = ccAtual.nome;
                if (typeof fichaGeralTurma !== 'undefined') fichaGeralTurma = String(p.turma || '');
                ccFichaCache.push({ p: p, calc: calc, aulas: aulas });
                html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;background:#fff;overflow:hidden">'
                    + '<div onclick="ccToggleFicha(' + i + ')" style="display:flex;gap:10px;align-items:center;padding:12px;cursor:pointer;background:#f8fafc">'
                    + '<b style="font-size:13px;flex:1">' + ccEsc(p.nome) + '</b>'
                    + '<span style="font-size:11px;color:#64748b">' + ccEsc(p.cpf || '') + '</span>'
                    + '<button class="btn-outline btn-sm" onclick="event.stopPropagation();ccImprimirFichaCurso(' + i + ')"><i class="fa-solid fa-print"></i></button>'
                    + '</div><div id="cc-ficha-' + i + '" style="display:none;padding:12px">'
                    + fichaGeralFolha(p, calc, null, i, aulas) + '</div></div>';
            } catch (e) { console.warn('Erro ao montar ficha do curso:', e); }
        }
        box.innerHTML = html;
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
function ccToggleFicha(i) { var el = document.getElementById('cc-ficha-' + i); if (el) el.style.display = (el.style.display === 'none') ? '' : 'none'; }
function ccImprimirFichaCurso(i) {
    var item = ccFichaCache[i]; if (!item) return;
    var html = fichaGeralFolha(item.p, item.calc, null, i, item.aulas);
    var w = window.open('', '_blank');
    if (w) { w.document.write('<html><head><meta charset="utf-8"><title>Ficha Geral</title><link rel="stylesheet" href="style.css"></head><body>' + html + '</body></html>'); w.document.close(); setTimeout(function () { w.print(); }, 400); }
}

/* ============ ABA SEÇÃO DE AVALIAÇÃO (POR CURSO) ============
   Reproduz a experiencia da Seção de Avaliação do administrador: escolhe o
   individuo do curso e abre a ficha com as abas Apontamento, Comportamento,
   Teorica, Pratica, Finais e Resultado. */
var ccAvalPessoas = [], ccAvalAtual = null, ccAvalAba = 'apontamento', ccAvalCache = null;

/* Sincroniza manualmente as notas das avaliações com a ficha. */
async function ccSincronizarNotasAvaliacao() {
    try {
        await ccSincronizarFicha(false);
        ccInitAvaliacao();
    } catch (e) { alert('Erro ao sincronizar: ' + e.message); }
}

async function ccInitAvaliacao() {
    var box = document.getElementById('cc-avaliacao-lista');
    if (!box || !ccAtual) return;
    box.innerHTML = '<p style="color:#64748b">Sincronizando notas das avaliações...</p>';
    try {
        /* Traz as notas geradas em Criar Avaliação para a ficha de cada
           individuo antes de mostrar a Seção de Avaliação. */
        await ccSincronizarFicha(true);
        var snap = await ccRef('individuos').get();
        ccAvalPessoas = [];
        snap.forEach(function (d) { ccAvalPessoas.push(Object.assign({ _id: d.id }, d.data() || {})); });
        if (!ccAvalPessoas.length) {
            box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum indivíduo importado. Use a guia Indivíduos ou o botão de importação abaixo.</p>';
            return;
        }
        box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">'
            + ccAvalPessoas.map(function (p) {
                return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#fff;display:flex;align-items:center;gap:10px">'
                    + '<div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;color:#6d28d9;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px">'
                    + ccEsc(String(p.nome || '?').substring(0, 2).toUpperCase()) + '</div>'
                    + '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ccEsc(p.nome) + '</div>'
                    + '<div style="font-size:10px;color:#64748b">' + ccEsc(p.cpf || '') + '</div></div>'
                    + '<button class="btn-outline btn-sm" onclick="ccAbrirFichaAvaliacao(\'' + ccEsc(String(p.cpf || '')) + '\')"><i class="fa-solid fa-file-lines"></i> Abrir avaliação</button>'
                    + '</div>';
            }).join('') + '</div>';
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}

async function ccAbrirFichaAvaliacao(cpf) {
    var p = ccAvalPessoas.find(function (x) { return String(x.cpf) === String(cpf); });
    if (!p) return;
    ccAvalAtual = p;
    try {
        var resultado = await Promise.all([
            ccRef('aulas').orderBy('data').get(),
            ccRef('fichaAvaliacoes').get(),
            ccRef('presencas').get(),
            ccRef('avaliacoes').get()
        ]);
        var aulas = { todas: [], teorica: [], pratica: [] };
        resultado[0].forEach(function (d) {
            var a = Object.assign({ _id: d.id }, d.data() || {});
            aulas.todas.push(a);
            if (a.avTeorica === 'Sim') aulas.teorica.push(a);
            if (a.avPratica === 'Sim') aulas.pratica.push(a);
        });
        var dados = (typeof fichaGeralDadosAluno === 'function') ? await fichaGeralDadosAluno(p) : { av: {}, presencas: [] };
        var snapshot = null;
        resultado[1].forEach(function (d) {
            var f = d.data() || {};
            if (String(f.cpf) === String(cpf)) snapshot = f;
        });
        if (snapshot) {
            dados.av = Object.assign({}, snapshot.av || {}, dados.av || {});
            ['notasTeoricas','notasPraticas','avTeoricaManual','avPraticaManual'].forEach(function (k) {
                dados.av[k] = Object.assign({}, (snapshot.av || {})[k] || {}, (dados.av || {})[k] || {});
            });
            var presencasCurso = [];
            resultado[2].forEach(function (d) {
                var pr = d.data() || {};
                if (String(pr.cpf) === String(cpf)) presencasCurso.push(pr);
            });
            if (presencasCurso.length) dados.presencas = presencasCurso;
            else if (snapshot.presencas) dados.presencas = snapshot.presencas;
        }
        var avs = [];
        resultado[3].forEach(function (d) { avs.push(Object.assign({ _id: d.id }, d.data() || {})); });
        var calc = (typeof fichaGeralCalcular === 'function') ? fichaGeralCalcular(p, dados, aulas) : null;
        ccAvalCache = { p: p, calc: calc, aulas: aulas, dados: dados, avs: avs };
        var tit = document.getElementById('cc-generico-titulo'); var body = document.getElementById('cc-generico-body'); var m = document.getElementById('cc-modal-generico');
        if (tit) tit.textContent = 'Avaliação - ' + (p.nome || '');
        if (body) body.innerHTML = ccAvalRenderModal();
        if (m) m.classList.remove('hidden');
    } catch (e) { alert('Erro ao abrir avaliação: ' + e.message); }
}

function ccAvalRenderModal() {
    var c = ccAvalCache; if (!c) return '';
    var abas = [
        ['apontamento','Apontamento'], ['comportamento','Comportamento'],
        ['teorica','Teórica'], ['pratica','Prática'],
        ['final_teorica','Final Teórica'], ['final_pratica','Final Prática'], ['resultado','Resultado']
    ];
    var html = '<div style="display:flex;gap:6px;flex-wrap:wrap;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px">'
        + abas.map(function (a) {
            return '<button class="btn-outline btn-sm" onclick="ccAvalSetAba(\'' + a[0] + '\')" style="'
                + (ccAvalAba === a[0] ? 'background:#ede9fe;color:#6d28d9;border-color:#c4b5fd;font-weight:800' : '') + '">'
                + a[1] + '</button>';
        }).join('') + '</div><div id="cc-avaliacao-conteudo">' + ccAvalRenderAba() + '</div>';
    return html;
}
function ccAvalSetAba(aba) {
    ccAvalAba = aba;
    var box = document.getElementById('cc-avaliacao-conteudo');
    if (box) box.innerHTML = ccAvalRenderAba();
    var modal = document.getElementById('cc-generico-body');
    if (modal) modal.innerHTML = ccAvalRenderModal();
}
function ccAvalLinha(rotulo, valor) {
    return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px">'
        + '<span style="color:#64748b">' + ccEsc(rotulo) + '</span><b style="color:#0f172a">' + ccEsc(valor == null || valor === '' ? '—' : valor) + '</b></div>';
}
function ccAvalRenderAba() {
    var c = ccAvalCache; if (!c || !c.calc) return '<p style="color:#94a3b8">Sem dados calculados.</p>';
    var calc = c.calc, av = c.dados.av || {};
    var html = '';
    if (ccAvalAba === 'apontamento') {
        html = '<h4 style="margin:0 0 10px;font-size:14px">Apontamento de presença</h4>'
            + ccAvalLinha('Aulas da turma', calc.totalAulas)
            + ccAvalLinha('Presentes', calc.pres)
            + ccAvalLinha('Faltas', calc.fal)
            + ccAvalLinha('Justificadas', calc.just)
            + ccAvalLinha('Percentual', calc.pct + '%')
            + '<div style="margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">'
            + c.aulas.todas.map(function (a) {
                var pr = (calc.presencasTurma || []).find(function (p) { return p.aulaId === a._id; });
                return '<div style="display:flex;gap:8px;padding:7px 9px;border-bottom:1px solid #f1f5f9;font-size:11px">'
                    + '<span style="color:#64748b;width:80px">' + ccEsc(a.data || '') + '</span>'
                    + '<span style="flex:1">' + ccEsc(a.conteudo || a.disciplina || '') + '</span>'
                    + '<b style="color:' + (pr && pr.status === 'Presente' ? '#16a34a' : '#dc2626') + '">' + ccEsc(pr ? pr.status : 'Sem registro') + '</b></div>';
            }).join('') + '</div>';
    } else if (ccAvalAba === 'comportamento') {
        html = '<h4 style="margin:0 0 10px;font-size:14px">AV Comportamento</h4>'
            + ccAvalLinha('FO positivos', calc.foP)
            + ccAvalLinha('FO negativos', calc.foN)
            + ccAvalLinha('Pontos', (calc.pontosComp >= 0 ? '+' : '') + calc.pontosComp);
        (av.foPositivos || []).forEach(function (f) { html += ccAvalLinha('FO+ ' + (f.data || ''), f.obs || ''); });
        (av.foNegativos || []).forEach(function (f) { html += ccAvalLinha('FO- ' + (f.data || ''), f.obs || ''); });
    } else if (ccAvalAba === 'teorica' || ccAvalAba === 'pratica') {
        var pratica = ccAvalAba === 'pratica';
        var tipoAv = pratica ? 'pratica' : 'teorica';
        var notas = pratica ? (av.notasPraticas || {}) : (av.notasTeoricas || {});
        var manuais = pratica ? (av.avPraticaManual || {}) : (av.avTeoricaManual || {});
        /* As notas vem das AVs criadas em Criar Avaliação: mostra uma linha
           por avaliação do tipo, com a nota já calculada pela sincronização. */
        var listaAv = (c.avs || []).filter(function (a) { return String(a.tipo || 'teorica') === tipoAv; });
        var linhas = [];
        listaAv.forEach(function (a) {
            var manual = manuais[a._id] || {};
            var nota = manual.nota;
            if (nota == null) {
                var chave = notas[a._id] != null ? a._id : null;
                if (chave == null) {
                    var aulaRel = (c.aulas.todas || []).find(function (x) {
                        return x._id === a.aulaId || (a.aula && x.conteudo === a.aula);
                    });
                    if (aulaRel && notas[aulaRel._id] != null) chave = aulaRel._id;
                }
                nota = chave != null ? notas[chave] : null;
            }
            linhas.push({ rotulo: a.nome || 'Avaliação', detalhe: a.data || a.disciplina || '', nota: nota });
        });
        /* Aulas com nota lancada mas sem AV vinculada também aparecem. */
        (c.aulas.todas || []).forEach(function (aula) {
            if (notas[aula._id] == null) return;
            if (linhas.some(function (l) { return l.nota === notas[aula._id]; })) return;
            linhas.push({ rotulo: aula.conteudo || aula.disciplina || 'Aula', detalhe: aula.data || '', nota: notas[aula._id] });
        });
        /* Notas vindas do administrador (ou de avaliações excluídas) usam IDs
           diferentes: mesmo assim devem aparecer na ficha. */
        Object.keys(manuais).forEach(function (k) {
            var m = manuais[k] || {};
            if (m.nota == null || linhas.some(function (l) { return l.nota === m.nota; })) return;
            linhas.push({ rotulo: m.avaliacaoNome || 'Avaliação', detalhe: '', nota: m.nota });
        });
        Object.keys(notas).forEach(function (k) {
            var valor = notas[k];
            if (valor == null || linhas.some(function (l) { return l.nota === valor; })) return;
            var aulaRel = (c.aulas.todas || []).find(function (a) { return a._id === k; });
            linhas.push({ rotulo: aulaRel ? (aulaRel.conteudo || aulaRel.disciplina || 'Aula') : 'Nota lançada', detalhe: aulaRel ? (aulaRel.data || '') : '', nota: valor });
        });
        html = '<h4 style="margin:0 0 10px;font-size:14px">AV ' + (pratica ? 'Prática' : 'Teórica') + '</h4>'
            + ccAvalLinha('Média', pratica ? calc.notaPrat : calc.notaTeor)
            + ccAvalLinha('Avaliações', linhas.length);
        html += '<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-top:8px">'
            + (linhas.length ? linhas.map(function (l) {
                return '<div style="display:flex;gap:8px;padding:7px 9px;border-bottom:1px solid #f1f5f9;font-size:11px">'
                    + '<span style="flex:1">' + ccEsc(l.rotulo) + (l.detalhe ? ' <span style="color:#94a3b8">(' + ccEsc(l.detalhe) + ')</span>' : '') + '</span>'
                    + '<b style="color:' + (l.nota != null ? '#0f766e' : '#94a3b8') + '">' + ccEsc(l.nota != null ? l.nota : '—') + '</b></div>';
            }).join('') : '<div style="padding:10px;color:#94a3b8;font-size:11px">Nenhuma avaliação ' + (pratica ? 'prática' : 'teórica') + ' com nota registrada.</div>')
            + '</div>';
    } else if (ccAvalAba === 'final_teorica' || ccAvalAba === 'final_pratica') {
        var ft = ccAvalAba === 'final_teorica';
        html = '<h4 style="margin:0 0 10px;font-size:14px">AV Final ' + (ft ? 'Teórica' : 'Prática') + '</h4>'
            + ccAvalLinha('Nota', ft ? (calc.avFinalTeorica === '' ? '—' : calc.avFinalTeorica) : (calc.avFinalPratica === '' ? '—' : calc.avFinalPratica))
            + ccAvalLinha('Média manual', ft ? (av.mediaTeoricaManual || '—') : (av.mediaPraticaManual || '—'));
        var manuais = ft ? (av.avTeoricaManual || {}) : (av.avPraticaManual || {});
        Object.keys(manuais).forEach(function (k) {
            var m = manuais[k] || {};
            html += ccAvalLinha(m.avaliacaoNome || 'Avaliação', m.nota != null ? m.nota : '—');
        });
    } else {
        html = '<h4 style="margin:0 0 10px;font-size:14px">Resultado final</h4>'
            + ccAvalLinha('Média Teórica', calc.mT)
            + ccAvalLinha('Média Prática', calc.mP)
            + ccAvalLinha('Média (T+P)/2', calc.mediaFinal)
            + ccAvalLinha('Comportamento', calc.pontosComp)
            + ccAvalLinha('AV Final', calc.avFinal)
            + ccAvalLinha('FIN', calc.fin)
            + ccAvalLinha('Nota Certificadora', calc.notaCertificadora)
            + '<div style="margin-top:12px;text-align:center;padding:10px;border-radius:8px;background:'
            + (calc.aprovado ? '#dcfce7;color:#166534' : '#fee2e2;color:#991b1b') + ';font-weight:800">'
            + (calc.aprovado ? 'APROVADO' : 'NÃO APROVADO') + '</div>';
    }
    return html;
}

/* Importa da Seção de Avaliação do administrador os dados ligados a turma. */
async function ccImportarDadosAvaliacao() {
    var turma = ccExigirTurma(); if (!turma) return;
    try {
        var snapCand = await ccDb().collection('candidatos').where('turma', '==', turma).get();
        if (snapCand.empty) { alert('Nenhum indivíduo encontrado nesta turma no administrador.'); return; }
        if (!confirm('Importar os dados da Seção de Avaliação da turma ' + turma + ' para este curso?')) return;
        var cpfs = [];
        snapCand.forEach(function (d) { var c = d.data() || {}; if (c.cpf) cpfs.push(String(c.cpf)); });
        var ok = 0;
        for (var i = 0; i < cpfs.length; i++) {
            var cpf = cpfs[i];
            var avDoc = await ccDb().collection('avaliacoesAlunos').doc(cpf).get();
            var pres = await ccDb().collection('presencasAlunos').where('cpf', '==', cpf).get();
            var presencas = [];
            pres.forEach(function (d) { presencas.push(Object.assign({ _id: d.id }, d.data() || {})); });
            if (!avDoc.exists && !presencas.length) continue;
            var av = avDoc.exists ? (avDoc.data() || {}) : {};
            await ccRef('fichaAvaliacoes', cpf).set({
                cpf: cpf, av: av, presencas: presencas,
                turmaOrigem: turma, cursoId: ccAtual._id, importadoEm: new Date().toISOString()
            });
            ok++;
        }
        await ccSincronizarFicha(true);
        ccInitAvaliacao();
        alert(ok + ' avaliação(ões) importada(s) da turma ' + turma + '.');
    } catch (e) { alert('Erro ao importar avaliações: ' + e.message); }
}

/* ============ ABA CERTIFICADOS DO CURSO ============ */
var ccCertsCache = [];
async function ccInitCertificados() {
    var box = document.getElementById('cc-certs-lista');
    if (!box || !ccAtual) return;
    try {
        var snap = await ccRef('certificados').orderBy('criadoEm', 'desc').get();
        ccCertsCache = [];
        snap.forEach(function (d) { ccCertsCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        box.innerHTML = ccCertsCache.length ? ccCertsCache.map(function (c) {
            return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:8px;background:#fff">'
                + '<b style="font-size:13px">' + ccEsc(c.nome || 'Certificado') + '</b> '
                + (c.ativo !== false ? '<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:8px;font-weight:800">ATIVO</span>' : '')
                + '<div style="font-size:11px;color:#64748b;margin-top:4px">' + ccEsc((c.declaracao || '').substring(0, 90)) + '</div>'
                + '<div style="display:flex;gap:6px;margin-top:8px">'
                + '<button class="btn-outline btn-sm" onclick="ccVerCertificado(\'' + c._id + '\')"><i class="fa-solid fa-eye"></i> Ver</button>'
                + '<button class="btn-outline btn-sm" onclick="ccAbrirFormCert(\'' + c._id + '\')"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirCertificado(\'' + c._id + '\')"><i class="fa-solid fa-trash"></i></button>'
                + '</div></div>';
        }).join('') : '<p style="color:#94a3b8;font-size:12px">Nenhum certificado cadastrado neste curso.</p>';
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
function ccAbrirFormCert(id) {
    var c = id ? ccCertsCache.find(function (x) { return x._id === id; }) : null;
    var f = document.getElementById('cc-cert-form'); if (f) f.style.display = '';
    function set(id2, v) { var el = document.getElementById(id2); if (el) el.value = v || ''; }
    set('cc-cert-id', c ? c._id : '');
    set('cc-cert-nome', c ? c.nome : '');
    set('cc-cert-declaracao', c ? c.declaracao : '');
    set('cc-cert-instituicao', c ? c.instituicao : '');
    var at = document.getElementById('cc-cert-ativo'); if (at) at.checked = c ? c.ativo !== false : true;
}
function ccFecharFormCert() { var f = document.getElementById('cc-cert-form'); if (f) f.style.display = 'none'; }
async function ccSalvarCertificado() {
    var nome = ((document.getElementById('cc-cert-nome') || {}).value || '').trim();
    if (!nome) { alert('Informe o nome do certificado.'); return; }
    var id = (document.getElementById('cc-cert-id') || {}).value || '';
    var dados = {
        nome: nome,
        declaracao: ((document.getElementById('cc-cert-declaracao') || {}).value || '').trim(),
        instituicao: ((document.getElementById('cc-cert-instituicao') || {}).value || '').trim(),
        ativo: !!(document.getElementById('cc-cert-ativo') || {}).checked,
        atualizadoEm: new Date().toISOString()
    };
    try {
        if (id) await ccRef('certificados', id).update(dados);
        else { dados.criadoEm = new Date().toISOString(); await ccRef('certificados').add(dados); }
        ccFecharFormCert(); ccInitCertificados();
    } catch (e) { alert('Erro ao salvar certificado: ' + e.message); }
}
async function ccExcluirCertificado(id) {
    if (!confirm('Excluir este certificado?')) return;
    try { await ccRef('certificados', id).delete(); ccInitCertificados(); } catch (e) { alert(e.message); }
}
function ccVerCertificado(id) {
    var c = ccCertsCache.find(function (x) { return x._id === id; }); if (!c) return;
    var html = '<div style="border:3px double #1d4ed8;padding:34px;text-align:center;background:#fff">'
        + '<div style="font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:2px">' + ccEsc(c.instituicao || 'FARN') + '</div>'
        + '<h2 style="margin:18px 0;color:#0f172a">CERTIFICADO</h2>'
        + '<p style="font-size:14px;color:#334155;line-height:1.8">' + ccEsc(c.declaracao || '') + '</p>'
        + '<div style="margin-top:36px;font-size:12px;color:#64748b">' + ccEsc(ccAtual ? ccAtual.nome : '') + '</div></div>';
    var tit = document.getElementById('cc-generico-titulo'); var body = document.getElementById('cc-generico-body'); var m = document.getElementById('cc-modal-generico');
    if (tit) tit.textContent = c.nome || 'Certificado';
    if (body) body.innerHTML = html;
    if (m) m.classList.remove('hidden');
}

/* Carrega as aulas tambem no modal de avaliacao quando a aba e aberta */
document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('cc-btn-novo');
    if (btn) btn.addEventListener('click', function () { ccAbrirFormCurso(null); });
});
