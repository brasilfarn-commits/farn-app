/* =====================================================================
   PORTAL DO USUARIO - permissoes por DOCENTE e acoes de docente/aluno
   ---------------------------------------------------------------------
   Carregado por index.html (admin) e portal-usuario.html (portal).
   O catálogo abaixo e usado pelo quadro PERMISSÕES dos registros de
   Docente (tabela docentesAdmin). Todo item novo entra automaticamente
   com "Ver" ligado e "Editar" desligado.
   ===================================================================== */

var PU_PERM_FIXO = [
    { titulo: 'VISÃO GERAL', itens: [
        { chave: 'pu:inicio', rotulo: 'Seção Início liberada' },
        { chave: 'pu:relatorios', rotulo: 'Seção Relatórios' }
    ]},
    { titulo: 'CURSOS / DOCENTE', itens: [
        { chave: 'pu:apontarAlunos', rotulo: 'Apontar alunos (cursos vinculados)' },
        { chave: 'pu:liberarAv', rotulo: 'Liberar AV Teórica' },
        { chave: 'pu:minhasAulas', rotulo: 'Minhas aulas' },
        { chave: 'pu:responderAv', rotulo: 'Responder AV Teórica (alunos em andamento)' }
    ]}
];

/* Novos relatórios implantados no portal entram sozinhos no quadro,
   marcados apenas para visualização. */
function puItensDinamicos() {
    var out = [], vistos = {};
    function add(chave, rotulo) {
        if (!chave || vistos[chave]) return;
        vistos[chave] = true;
        out.push({ chave: chave, rotulo: rotulo, acao: false, dinamico: true });
    }
    var area = document.getElementById('pu-view-relatorios');
    if (area) {
        area.querySelectorAll('[data-rel]').forEach(function (node) {
            add('rel:' + node.getAttribute('data-rel'), node.textContent.trim() || node.getAttribute('data-rel'));
        });
    }
    var chavesFixas = {};
    PU_PERM_FIXO.forEach(function (g) {
        g.itens.forEach(function (i) { chavesFixas[i.chave] = true; });
    });
    document.querySelectorAll('#pu-drawer .pu-drawer-nav button[id^="pu-menu-"]').forEach(function (btn) {
        var chave = 'pu:menu:' + btn.id.replace('pu-menu-', '');
        if (!chavesFixas[chave]) add(chave, btn.textContent.trim());
    });
    /* O quadro de permissoes fica no admin, sem o DOM do portal. O portal
       registra aqui os relatorios que encontrar, para que itens novos
       aparecam automaticamente marcados apenas para visualizacao. */
    try {
        var salvos = JSON.parse(localStorage.getItem('pu_relatorios_detectados') || '[]');
        (salvos || []).forEach(function (r) { add(r.chave, r.rotulo); });
    } catch (e) {}
    return out;
}
/* Chamado pelo Portal sempre que a area de relatorios e montada. */
function puRegistrarRelatorios() {
    var area = document.getElementById('pu-view-relatorios');
    if (!area) return;
    var encontrados = [];
    area.querySelectorAll('[data-rel]').forEach(function (node) {
        var chave = 'rel:' + node.getAttribute('data-rel');
        if (!encontrados.some(function (r) { return r.chave === chave; })) {
            encontrados.push({ chave: chave, rotulo: node.textContent.trim() || node.getAttribute('data-rel') });
        }
    });
    try { localStorage.setItem('pu_relatorios_detectados', JSON.stringify(encontrados)); } catch (e) {}
}
function puCatalogoPermissoes() {
    var grupos = PU_PERM_FIXO.map(function (g) {
        return { titulo: g.titulo, itens: g.itens.slice() };
    });
    var dinamicos = puItensDinamicos();
    if (dinamicos.length) grupos.push({ titulo: 'ITENS DINÂMICOS (NOVOS RELATÓRIOS)', itens: dinamicos });
    return grupos;
}
function puPermissoesPadrao() {
    var itens = {};
    puCatalogoPermissoes().forEach(function (g) {
        g.itens.forEach(function (i) { itens[i.chave] = { ver: true, editar: false }; });
    });
    return itens;
}
function puUserAtual() {
    if (typeof puUser !== 'undefined' && puUser) return puUser;
    if (typeof currentUserData !== 'undefined' && currentUserData) return currentUserData;
    try { return JSON.parse(localStorage.getItem('pu_sessao') || 'null'); } catch (e) { return null; }
}
function puEhDocente() {
    var u = puUserAtual();
    return !!(u && (u._origem === 'docentesAdmin' || u._origem === 'docentes'));
}
function puPermItem(chave, acao) {
    var u = puUserAtual();
    if (!u) return false;
    if (u.cpf === '05004959471' || (u.permissoes || []).indexOf('admin') >= 0) return true;
    if (!puEhDocente()) return true;
    var itens = (u.permPortal && u.permPortal.itens) || {};
    var item = itens[chave];
    if (item && typeof item[acao] === 'boolean') return item[acao];
    var catalogo = puCatalogoPermissoes();
    for (var g = 0; g < catalogo.length; g++) {
        for (var i = 0; i < catalogo[g].itens.length; i++) {
            if (catalogo[g].itens[i].chave === chave) return acao === 'ver';
        }
    }
    return acao === 'ver';
}
var PU_PERM_MENU_DOCENTE = {
    inicio: 'pu:inicio',
    relatorios: 'pu:relatorios',
    apontar: 'pu:apontarAlunos',
    libav: 'pu:liberarAv',
    aulasdoc: 'pu:minhasAulas',
    av: 'pu:responderAv'
};
function puPermMenuDocente(chave) {
    if (!puEhDocente()) return true;
    var permissao = PU_PERM_MENU_DOCENTE[chave];
    if (!permissao) return true;
    return puPermItem(permissao, 'ver') !== false;
}
function puAplicarPermissoes() {
    /* Os botoes do menu sao tratados por puAplicarMenuPortal(), que aplica a
       permissao individual do docente. Se esta funcao tambem escrevesse
       style.display, uma das duas regras sobrescreveria a outra. */
    document.querySelectorAll('#pu-view-relatorios [data-rel]').forEach(function (node) {
        node.style.display = puPermItem('rel:' + node.getAttribute('data-rel'), 'ver') ? '' : 'none';
    });
}

/* ---------- ACOES DO DOCENTE ---------- */
function puDocCursos() {
    var u = puUserAtual();
    if (!u) return Promise.resolve([]);
    var db = (typeof dbFirestore !== 'undefined') ? dbFirestore : null;
    if (!db) return Promise.resolve([]);
    return db.collection('cursosCadastro').get().then(function (snap) {
        return snap.docs.filter(function (d) {
            var c = d.data() || {};
            return String(c.docenteResponsavelId || '') === String(u._docId || '');
        }).map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); });
    });
}
var PU_DOC_CURSOS = [];
async function puDocCarregarCursos(alvo) {
    var box = document.getElementById(alvo);
    if (!box) return [];
    try {
        PU_DOC_CURSOS = await puDocCursos();
        if (!PU_DOC_CURSOS.length) {
            box.innerHTML = '<div class="pu-aviso">Nenhum curso vinculado ao seu cadastro. O vínculo é feito no campo <b>Docente responsável</b> do Cadastro de Cursos.</div>';
        }
        return PU_DOC_CURSOS;
    } catch (e) {
        box.innerHTML = '<div class="pu-aviso">Não foi possível carregar seus cursos: ' + puEsc(e.message) + '</div>';
        return [];
    }
}
function puDocCurso(id) {
    return PU_DOC_CURSOS.find(function (c) { return String(c._id) === String(id); }) || null;
}
async function puDocCarregarApontamentos() {
    var box = document.getElementById('pu-apontar-lista');
    if (!box) return;
    var cursos = await puDocCarregarCursos('pu-apontar-cursos');
    if (!cursos.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < cursos.length; i++) {
        var c = cursos[i];
        var aulasSnap = await dbFirestore.collection('cursosCadastro').doc(c._id).collection('aulas').get();
        var aptSnap = await dbFirestore.collection('cursosCadastro').doc(c._id).collection('apontamentos').get();
        var aulas = aulasSnap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); });
        var apts = aptSnap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); });
        html += '<div class="pu-curso-card"><div class="pu-curso-nome">' + puEsc(c.nome) + '</div>'
            + '<div style="font-size:11px;color:#64748b;margin:4px 0 8px">' + aulas.length + ' aula(s) • ' + apts.length + ' apontamento(s)</div>';
        if (!aulas.length) html += '<div class="pu-aviso">Nenhuma aula cadastrada neste curso.</div>';
        aulas.forEach(function (a) {
            var apt = apts.find(function (x) { return String(x.aulaId || '') === String(a._id); });
            html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding:8px 0;font-size:12px">'
                + '<b>' + puEsc(a.data || a.disciplina || 'Aula') + '</b>'
                + (a.disciplina ? '<span style="color:#64748b">' + puEsc(a.disciplina) + '</span>' : '')
                + (apt ? '<span class="pu-badge">P: ' + (apt.presentes || 0) + ' • F: ' + (apt.faltas || 0) + '</span>'
                       : '<span style="color:#94a3b8">Sem apontamento</span>')
                + '<button class="btn-primary btn-sm" style="margin-left:auto" onclick="puDocAbrirApontamento(\'' + c._id + '\',\'' + a._id + '\')"><i class="fa-solid fa-user-check"></i> APONTAR ALUNO</button>'
                + '</div>';
        });
        html += '</div>';
    }
    box.innerHTML = html;
}
var PU_APT = { cursoId: null, aulaId: null, alunos: [], status: {} };
async function puDocAbrirApontamento(cursoId, aulaId) {
    if (!puPermItem('pu:apontarAlunos', 'editar')) {
        alert('Seu perfil tem apenas visualização em Apontar alunos. Peça a liberação de Edição nas permissões.'); return;
    }
    try {
        var indSnap = await dbFirestore.collection('cursosCadastro').doc(cursoId).collection('individuos').get();
        var aulaSnap = await dbFirestore.collection('cursosCadastro').doc(cursoId).collection('aulas').doc(aulaId).get();
        var aula = aulaSnap.data() || {};
        PU_APT = { cursoId: cursoId, aulaId: aulaId, alunos: indSnap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); }), status: {} };
        var html = PU_APT.alunos.map(function (a, i) {
            PU_APT.status[i] = 'Falta';
            return '<div style="display:flex;gap:8px;align-items:center;border-bottom:1px solid #e2e8f0;padding:7px 0">'
                + '<span style="flex:1;font-size:12px"><b>' + puEsc(a.nome || '') + '</b><br><span style="color:#64748b">' + puEsc(a.matricula || a.cpf || '') + '</span></span>'
                + ['Presente', 'Falta', 'Justificada'].map(function (s) {
                    return '<button class="btn-outline btn-sm pu-apt-btn' + (s === 'Falta' ? ' btn-primary' : '') + '" data-i="' + i + '" data-s="' + s + '" onclick="puDocAptStatus(' + i + ',\'' + s + '\')">' + s.charAt(0) + '</button>';
                }).join('') + '</div>';
        }).join('');
        puModalAbrir('Apontar alunos — ' + (aula.disciplina || aula.data || 'Aula'),
            'Marque Presente, Falta ou Justificada para cada aluno.', html,
            'Salvar apontamento', 'puDocAptSalvar()');
    } catch (e) { alert('Erro ao abrir apontamento: ' + e.message); }
}
function puDocAptStatus(i, s) {
    PU_APT.status[i] = s;
    var botoes = document.querySelectorAll('.pu-apt-btn[data-i="' + i + '"]');
    botoes.forEach(function (b) { b.className = 'btn-outline btn-sm pu-apt-btn' + (b.getAttribute('data-s') === s ? ' btn-primary' : ''); });
}
async function puDocAptSalvar() {
    var aula = (PU_DOC_CURSOS.find(function (c) { return c._id === PU_APT.cursoId; }) || {});
    var presentes = 0, faltas = 0, just = 0;
    var lista = PU_APT.alunos.map(function (a, i) {
        var s = PU_APT.status[i] || 'Falta';
        if (s === 'Presente') presentes++; else if (s === 'Justificada') just++; else faltas++;
        return Object.assign({}, a, { status: s });
    });
    var agora = new Date().toISOString();
    var cab = {
        aulaId: PU_APT.aulaId, aula: '', disciplina: '', dataAula: '',
        alunos: lista, presentes: presentes, faltas: faltas, justificadas: just, criadoEm: agora
    };
    try {
        var base = dbFirestore.collection('cursosCadastro').doc(PU_APT.cursoId);
        var ref = await base.collection('apontamentos').add(cab);
        for (var i = 0; i < lista.length; i++) {
            await base.collection('presencas').add(Object.assign({}, lista[i], {
                aulaId: PU_APT.aulaId, apontamentoId: ref.id, criadoEm: agora
            }));
        }
        await base.collection('aulas').doc(PU_APT.aulaId).update({ apontada: true });
        puModalFechar();
        puDocCarregarApontamentos();
        alert('Apontamento salvo.');
    } catch (e) { alert('Erro ao salvar apontamento: ' + e.message); }
}
async function puDocCarregarLibAv() {
    var box = document.getElementById('pu-libav-lista');
    if (!box) return;
    var cursos = await puDocCarregarCursos('pu-libav-cursos');
    if (!cursos.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < cursos.length; i++) {
        var c = cursos[i];
        var snap = await dbFirestore.collection('cursosCadastro').doc(c._id).collection('avaliacoes').get();
        html += '<div class="pu-curso-card"><div class="pu-curso-nome">' + puEsc(c.nome) + '</div>';
        var avs = snap.docs.filter(function (d) {
            var a = d.data() || {}; return String(a.tipo || 'teorica').indexOf('teorica') >= 0;
        });
        if (!avs.length) html += '<div class="pu-aviso">Nenhuma AV Teórica cadastrada neste curso.</div>';
        avs.forEach(function (d) {
            var a = Object.assign({ _id: d.id }, d.data() || {});
            html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding:8px 0;font-size:12px">'
                + '<b>' + puEsc(a.nome || 'AV Teórica') + '</b>'
                + (a.disciplina ? '<span style="color:#64748b">' + puEsc(a.disciplina) + '</span>' : '')
                + (a.enviada ? '<span class="pu-badge">LIBERADA</span>' : '<span style="color:#f57f17;font-weight:700">AGUARDANDO LIBERAÇÃO</span>')
                + '<button class="btn-primary btn-sm" style="margin-left:auto" onclick="puDocLiberarAv(\'' + c._id + '\',\'' + a._id + '\')"><i class="fa-solid fa-paper-plane"></i> LIBERAR PARA O ALUNO</button>'
                + '</div>';
        });
        html += '</div>';
    }
    box.innerHTML = html;
}
async function puDocLiberarAv(cursoId, avId) {
    if (!puPermItem('pu:liberarAv', 'editar')) {
        alert('Seu perfil tem apenas visualização em Liberar AV Teórica. Peça a liberação de Edição nas permissões.'); return;
    }
    try {
        var base = dbFirestore.collection('cursosCadastro').doc(cursoId);
        var ind = await base.collection('individuos').get();
        var cpfLista = [];
        ind.forEach(function (d) { var x = d.data() || {}; if (x.cpf) cpfLista.push(String(x.cpf).replace(/\D/g, '')); });
        var agora = new Date().toISOString();
        await base.collection('avaliacoes').doc(avId).update({
            enviada: true, enviadaEm: agora, ativa: true, ativadaEm: agora,
            alunosSelecionados: cpfLista, cursoId: cursoId
        });
        alert('AV liberada para os alunos do curso.');
        puDocCarregarLibAv();
    } catch (e) { alert('Erro ao liberar AV: ' + e.message); }
}
async function puDocCarregarAulas() {
    var box = document.getElementById('pu-aulasdoc-lista');
    if (!box) return;
    var cursos = await puDocCarregarCursos('pu-aulasdoc-cursos');
    if (!cursos.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < cursos.length; i++) {
        var c = cursos[i];
        var snap = await dbFirestore.collection('cursosCadastro').doc(c._id).collection('aulas').get();
        html += '<div class="pu-curso-card"><div class="pu-curso-nome">' + puEsc(c.nome) + '</div>';
        if (snap.empty) html += '<div class="pu-aviso">Nenhuma aula cadastrada.</div>';
        snap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); })
            .sort(function (a, b) { return String(a.data || '').localeCompare(String(b.data || '')); })
            .forEach(function (a) {
                html += '<div style="border-top:1px solid #e2e8f0;padding:8px 0;font-size:12px">'
                    + '<b>' + puEsc(a.data || 'Data não informada') + '</b> '
                    + (a.disciplina ? '• ' + puEsc(a.disciplina) : '')
                    + (a.horario ? ' • ' + puEsc(a.horario) : '')
                    + (a.conteudo ? '<div style="color:#64748b;margin-top:3px">' + puEsc(a.conteudo) + '</div>' : '')
                    + '</div>';
            });
        html += '</div>';
    }
    box.innerHTML = html;
}

/* ---------- RESPONDER AV TEORICA (ALUNO EM ANDAMENTO) ---------- */
var PU_AV = { cursoId: null, avaliacoes: [], respostas: [], atual: null };
function puAvLiberada(av) {
    if (!av || av.enviada !== true || av.ativa === false) return false;
    var sel = av.alunosSelecionados || [];
    if (!sel.length) return true;
    var cpf = puSoDigitos((puUserAtual() || {}).cpf);
    return sel.some(function (c) { return puSoDigitos(c) === cpf; });
}
async function puAvAbrirLista(cursoId) {
    PU_AV.cursoId = cursoId;
    var box = document.getElementById('pu-av-lista');
    if (!box) return;
    box.innerHTML = '<div class="pu-aviso">Carregando avaliações...</div>';
    try {
        var base = dbFirestore.collection('cursosCadastro').doc(cursoId);
        var avs = await base.collection('avaliacoes').get();
        var resp = await base.collection('respostas').where('cpf', '==', puSoDigitos((puUserAtual() || {}).cpf)).get();
        PU_AV.avaliacoes = avs.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); })
            .filter(function (a) { return String(a.tipo || 'teorica').indexOf('teorica') >= 0; });
        PU_AV.respostas = resp.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data() || {}); });
        var html = '';
        PU_AV.avaliacoes.forEach(function (a) {
            var liberada = puAvLiberada(a);
            var r = PU_AV.respostas.find(function (x) { return String(x.avaliacaoId) === String(a._id); });
            html += '<div class="pu-curso-card"><div class="pu-curso-nome">' + puEsc(a.nome || 'AV Teórica') + '</div>'
                + '<div style="font-size:11px;color:#64748b;margin-top:4px">'
                + (a.disciplina ? puEsc(a.disciplina) + ' • ' : '') + (a.questoes || []).length + ' questão(ões)</div>'
                + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px">'
                + (liberada ? '<span class="pu-badge">LIBERADA PELO DOCENTE</span>' : '<span style="color:#f57f17;font-weight:700;font-size:11px">AGUARDANDO LIBERAÇÃO DO DOCENTE</span>')
                + (r ? '<span class="pu-badge">RESPONDIDA • NOTA ' + puEsc(String(r.nota != null ? r.nota : r.pontos != null ? r.pontos : '—')) + '</span>' : '')
                + (liberada && !r ? '<button class="btn-primary btn-sm" onclick="puAvAbrir(\'' + a._id + '\')"><i class="fa-solid fa-pen-to-square"></i> RESPONDER AGORA</button>' : '')
                + '</div></div>';
        });
        if (!html) html = '<div class="pu-aviso">Nenhuma AV Teórica cadastrada neste curso.</div>';
        box.innerHTML = html;
    } catch (e) { box.innerHTML = '<div class="pu-aviso">Erro ao carregar avaliações: ' + puEsc(e.message) + '</div>'; }
}
function puAvAbrir(id) {
    var av = PU_AV.avaliacoes.find(function (a) { return a._id === id; });
    if (!av || !puAvLiberada(av)) { alert('Esta avaliação ainda não foi liberada pelo docente.'); return; }
    PU_AV.atual = av;
    var html = (av.questoes || []).map(function (q, i) {
        var s = '<div style="margin-bottom:12px"><b>' + (i + 1) + '. ' + puEsc(q.enunciado || '') + '</b>';
        ['a', 'b', 'c', 'd'].forEach(function (k) {
            var txt = (q.opcoes && q.opcoes[k]) ? q.opcoes[k] : '';
            if (!txt) return;
            s += '<label style="display:block;margin:4px 0;font-size:12px"><input type="radio" name="pu-q-' + i + '" value="' + k + '"> ' + k.toUpperCase() + ') ' + puEsc(txt) + '</label>';
        });
        return s + '</div>';
    }).join('');
    puModalAbrir(av.nome || 'AV Teórica', (av.disciplina || '') + ' • ' + (av.questoes || []).length + ' questão(ões)', html || '<div class="pu-aviso">Sem questões cadastradas.</div>', 'Enviar respostas', 'puAvEnviar()');
}
async function puAvEnviar() {
    var av = PU_AV.atual; if (!av) return;
    var questoes = av.questoes || [], respostas = {}, certas = 0;
    for (var i = 0; i < questoes.length; i++) {
        var sel = document.querySelector('input[name="pu-q-' + i + '"]:checked');
        if (!sel) { alert('Responda todas as questões antes de enviar.'); return; }
        respostas[i] = sel.value;
        if (String(sel.value).toLowerCase() === String(questoes[i].correta || '').toLowerCase()) certas++;
    }
    var total = questoes.length || 1;
    var peso = total === 10 ? 1 : (total === 20 ? 0.5 : 10 / total);
    var nota = Math.round(Math.min(10, certas * peso) * 10) / 10;
    var u = puUserAtual() || {};
    var dados = {
        cpf: puSoDigitos(u.cpf), nome: u.nome || '', matricula: u.matricula || '',
        avaliacaoId: av._id, respostas: respostas, respostasCertas: certas,
        totalQuestoes: total, pontos: nota, nota: nota,
        enviadoEm: new Date().toISOString(), cursoId: PU_AV.cursoId
    };
    try {
        await dbFirestore.collection('cursosCadastro').doc(PU_AV.cursoId).collection('respostas').add(dados);
        puModalFechar();
        puAvAbrirLista(PU_AV.cursoId);
        alert('Respostas enviadas. Nota: ' + String(nota).replace('.', ','));
    } catch (e) { alert('Erro ao enviar respostas: ' + e.message); }
}
function puModalAbrir(titulo, sub, corpo, rotuloBotao, onclickBotao) {
    var t = document.getElementById('pu-modal-titulo'); if (t) t.textContent = titulo;
    var s = document.getElementById('pu-modal-sub'); if (s) s.textContent = sub || '';
    var c = document.getElementById('pu-modal-corpo'); if (c) c.innerHTML = corpo;
    var b = document.getElementById('pu-modal-enviar');
    if (b) { b.textContent = rotuloBotao || 'Salvar'; b.onclick = null; if (onclickBotao) b.setAttribute('onclick', onclickBotao); }
    var m = document.getElementById('pu-modal'); if (m) m.classList.add('aberto');
}
function puModalFechar() {
    var m = document.getElementById('pu-modal'); if (m) m.classList.remove('aberto');
    PU_AV.atual = null;
}

/* =====================================================================
   SECOES DO MENU HAMBURGUER DO PORTAL DO USUARIO
   ---------------------------------------------------------------------
   A visibilidade das secoes e definida apenas pelas permissoes do docente
   (permPortal). As regras SIM/NAO por curso do Cadastro de Cursos foram
   removidas: nenhuma configuracao permissoesPortal e mais lida.
   ===================================================================== */
var PU_MENU_PORTAL_ITENS = ['inicio','dados','cursos','av','relatorios','apontar','libav','aulasdoc'];
/* Procura em qual(is) curso(s) o CPF consta como individuo. O login confere
   candidatos/usuarios ANTES do cadastro de cursos, entao quem esta nas duas
   partes loga pela colecao geral e nunca ganhava o _cursoId — e as
   permissoes do curso nao eram aplicadas. */
async function puVincularCursosPorCpf(cpf) {
    var c = String(cpf || '').replace(/\D/g, '');
    if (!c || typeof dbFirestore === 'undefined' || !dbFirestore) return [];
    var ids = [];
    try {
        var snap = await dbFirestore.collection('cursosCadastro').get();
        var cursos = snap.docs || [];
        /* Teto de 30 cursos para nao travar o login em base grande. */
        for (var i = 0; i < cursos.length && i < 30; i++) {
            try {
                var ind = await dbFirestore.collection('cursosCadastro').doc(cursos[i].id)
                    .collection('individuos').where('cpf', '==', c).limit(1).get();
                if (!ind.empty) ids.push(cursos[i].id);
            } catch (e) {}
        }
    } catch (e) {}
    return ids;
}
/* Cursos vinculados ao usuario logado. Aluno que entrou pelo curso tem
   _cursoId; docenteResponsavel e encontrado pelo docenteResponsavelId. */
async function puCursosDoUsuario() {
    var u = puUserAtual();
    if (!u || typeof dbFirestore === 'undefined' || !dbFirestore) return [];
    if (u._cursoIds && u._cursoIds.length) return u._cursoIds.map(String);
    if (u._cursoId) return [String(u._cursoId)];
    if (puEhDocente() && u._docId) {
        try {
            var snap = await dbFirestore.collection('cursosCadastro')
                .where('docenteResponsavelId', '==', u._docId).get();
            return (snap.docs || []).map(function (d) { return d.id; });
        } catch (e) { return []; }
    }
    return [];
}
async function puCarregarMenuPortalPermissoes() {
    var final = {};
    PU_MENU_PORTAL_ITENS.forEach(function (k) {
        final[k] = puPermMenuDocente(k) !== false;
    });
    return final;
}
async function puAplicarMenuPortal() {
    var final = await puCarregarMenuPortalPermissoes();
    PU_MENU_PORTAL_ITENS.forEach(function (k) {
        var btn = document.getElementById('pu-menu-' + k);
        if (btn) btn.style.display = final[k] ? '' : 'none';
        var view = document.getElementById('pu-view-' + k);
        if (view) view.setAttribute('data-portal-menu-visivel', final[k] ? '1' : '0');
    });
    var ativo = document.querySelector('#pu-tela-app .pu-view.ativo');
    if (ativo && ativo.getAttribute('data-portal-menu-visivel') === '0') {
        var primeiro = PU_MENU_PORTAL_ITENS.filter(function (k) { return final[k]; })[0];
        if (primeiro && typeof puSetView === 'function') puSetView(primeiro);
    }
    return final;
}
/* Mantido para compatibilidade com chamadas antigas: nao ha mais observador. */
function puObservarMenuPortal() {}

/* Exposto para os scripts inline do portal. */
window.puAplicarMenuPortal = puAplicarMenuPortal;
window.puObservarMenuPortal = puObservarMenuPortal;
window.puVincularCursosPorCpf = puVincularCursosPorCpf;
window.puCursosDoUsuario = puCursosDoUsuario;
window.puCatalogoPermissoes = puCatalogoPermissoes;
window.puPermissoesPadrao = puPermissoesPadrao;
window.puRegistrarRelatorios = puRegistrarRelatorios;
window.puEhDocente = puEhDocente;
window.puPermItem = puPermItem;
window.puAplicarPermissoes = puAplicarPermissoes;
window.puDocCarregarApontamentos = puDocCarregarApontamentos;
window.puDocAbrirApontamento = puDocAbrirApontamento;
window.puDocAptStatus = puDocAptStatus;
window.puDocAptSalvar = puDocAptSalvar;
window.puDocCarregarLibAv = puDocCarregarLibAv;
window.puDocLiberarAv = puDocLiberarAv;
window.puDocCarregarAulas = puDocCarregarAulas;
window.puAvAbrirLista = puAvAbrirLista;
window.puAvAbrir = puAvAbrir;
window.puAvEnviar = puAvEnviar;
window.puModalAbrir = puModalAbrir;
window.puModalFechar = puModalFechar;
