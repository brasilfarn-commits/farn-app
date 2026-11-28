/* ============================================================
   PORTAL DO CURSO (aluno)
   Pagina isolada aberta pela secao Cursos.
   Todo dado vem de cursosCadastro/{id}/... — nenhuma colecao
   global do administrador e escrita aqui, alem de respostas de AV.
   ============================================================ */
const firebaseConfig = {
    apiKey: "AIzaSyCjKeFfSkQp9wPxsEytxr9Vrl9g_HmdfF0",
    authDomain: "farn-app.firebaseapp.com",
    databaseURL: "https://farn-app-default-rtdb.firebaseio.com",
    projectId: "farn-app",
    storageBucket: "farn-app.firebasestorage.app",
    messagingSenderId: "16254677061",
    appId: "1:16254677061:web:3d42c64edfe5cdbffcf32c"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const dbFirestore = new FarnDB('https://lessons-refinance-likelihood-hop.trycloudflare.com');

var pcCursoId = '', pcCurso = {}, pcAluno = {}, pcCpf = '';
var pcAulas = [], pcApontamentos = [], pcAvs = [], pcRespostas = [], pcFicha = {};
var pcView = 'inicio', pcAvAberta = null;

/* ---------- utilitarios ---------- */
function pcGetParam(nome) { return new URLSearchParams(window.location.search).get(nome) || ''; }
function pcSoDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function pcEsc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function pcNorm(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function pcData(v) {
    if (!v) return '—';
    if (typeof v === 'object' && typeof v.toDate === 'function') {
        try { return v.toDate().toLocaleDateString('pt-BR'); } catch (e) {}
    }
    if (v instanceof Date) return v.toLocaleDateString('pt-BR');
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        var d = new Date(s);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
    }
    return s;
}
function pcBadge(status) {
    var mapa = {
        Presente: ['PRESENTE', 'presente'],
        Falta: ['FALTA', 'falta'],
        Justificada: ['JUSTIFICADA', 'justificada']
    };
    var x = mapa[String(status || '')] || ['AINDA NÃO APONTADA', 'sem'];
    return '<span class="pc-badge ' + x[1] + '">' + x[0] + '</span>';
}
function pcLegenda() {
    return '<div class="pc-legenda">'
        + '<span class="pc-badge presente">VERDE = PRESENTE</span>'
        + '<span class="pc-badge falta">VERMELHO = FALTA</span>'
        + '<span class="pc-badge justificada">AMARELO = JUSTIFICADA</span>'
        + '<span class="pc-badge sem">AZUL = AINDA NÃO APONTADA</span>'
        + '</div>';
}

/* ---------- navegacao ---------- */
function pcAbrirMenu() {
    var d = document.getElementById('pc-drawer'), o = document.getElementById('pc-overlay');
    if (d) d.classList.add('aberto'); if (o) o.classList.add('aberto');
}
function pcFecharMenu() {
    var d = document.getElementById('pc-drawer'), o = document.getElementById('pc-overlay');
    if (d) d.classList.remove('aberto'); if (o) o.classList.remove('aberto');
}
function pcVoltar() { location.href = 'index.html'; }
function pcSetView(view) {
    pcView = view;
    ['inicio', 'apontamento', 'aulas', 'av-teorica', 'av-pratica', 'apostilas'].forEach(function (v) {
        var el = document.getElementById('pc-view-' + v);
        if (el) el.className = 'pc-view' + (v === view ? ' ativo' : '');
        var btn = document.getElementById('pc-menu-' + v);
        if (btn) btn.className = (v === view ? 'ativo' : '');
    });
    pcFecharMenu();
    if (view === 'inicio') pcRenderInicio();
    if (view === 'apontamento') pcRenderApontamento();
    if (view === 'aulas') pcRenderAulas();
    if (view === 'av-teorica') pcRenderAvTeorica();
    if (view === 'av-pratica') pcRenderAvPratica();
    if (view === 'apostilas') pcRenderApostilas();
}
function pcMostrarErro(titulo, texto) {
    var load = document.getElementById('pc-loading'), inv = document.getElementById('pc-invalido'), app = document.getElementById('pc-app');
    if (load) load.style.display = 'none';
    if (app) app.style.display = 'none';
    var t = document.getElementById('pc-invalido-titulo'); if (t) t.textContent = titulo;
    var p = document.getElementById('pc-invalido-texto'); if (p) p.textContent = texto;
    if (inv) inv.style.display = 'flex';
}

/* ---------- inicializacao ---------- */
async function pcInit() {
    pcCursoId = pcGetParam('curso');
    var sessao = null;
    try { sessao = JSON.parse(localStorage.getItem('pu_sessao') || 'null'); } catch (e) {}
    if (!pcCursoId || !sessao || !sessao.cpf) {
        pcMostrarErro('Sessão não encontrada', 'Entre no app e abra o curso pela seção Cursos.');
        return;
    }
    pcCpf = pcSoDigitos(sessao.cpf);
    try {
        var base = dbFirestore.collection('cursosCadastro').doc(pcCursoId);
        var resultado = await Promise.all([
            base.get(),
            base.collection('individuos').where('cpf', '==', pcCpf).limit(1).get(),
            base.collection('aulas').get(),
            base.collection('apontamentos').get(),
            base.collection('avaliacoes').get(),
            base.collection('respostas').get(),
            base.collection('fichaAvaliacoes').doc(pcCpf).get()
        ]);
        if (!resultado[0].exists || resultado[1].empty) {
            pcMostrarErro('Curso indisponível', 'Seu CPF não está vinculado aos indivíduos deste curso.');
            return;
        }
        pcCurso = Object.assign({ _id: pcCursoId }, resultado[0].data() || {});
        pcAluno = Object.assign({ _id: resultado[1].docs[0].id }, resultado[1].docs[0].data() || {});
        if (!pcAluno.nome) pcAluno.nome = sessao.nome || '';

        resultado[2].forEach(function (d) { pcAulas.push(Object.assign({ _id: d.id }, d.data() || {})); });
        pcAulas.sort(function (a, b) { return String(a.data || '').localeCompare(String(b.data || '')); });

        resultado[3].forEach(function (d) {
            var apt = Object.assign({ _id: d.id }, d.data() || {});
            (apt.alunos || []).forEach(function (al) {
                if (pcSoDigitos(al.cpf) !== pcCpf) return;
                pcApontamentos.push(Object.assign({}, al, {
                    _apontamentoId: apt._id,
                    aulaId: apt.aulaId || al.aulaId || '',
                    aula: apt.aula || al.aula || '',
                    dataAula: apt.dataAula || al.dataAula || '',
                    disciplina: apt.disciplina || al.disciplina || '',
                    obs: al.obs || al.observacaoJustificativa || '',
                    criadoEm: apt.criadoEm || al.criadoEm || '',
                    justificadaEm: al.justificadaEm || ''
                }));
            });
        });
        pcApontamentos.sort(function (a, b) { return String(b.dataAula || '').localeCompare(String(a.dataAula || '')); });

        resultado[4].forEach(function (d) { pcAvs.push(Object.assign({ _id: d.id }, d.data() || {})); });
        pcAvs.sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });

        resultado[5].forEach(function (d) {
            var r = Object.assign({ _id: d.id }, d.data() || {});
            if (pcSoDigitos(r.cpf) === pcCpf) pcRespostas.push(r);
        });
        pcFicha = resultado[6].exists ? (resultado[6].data() || {}) : {};

        var nomeCurso = pcCurso.nome || 'Curso';
        var nomeAluno = pcAluno.nome || sessao.nome || 'Aluno';
        var tit = document.getElementById('pc-curso-nome'); if (tit) tit.textContent = nomeCurso;
        var al = document.getElementById('pc-aluno-nome'); if (al) al.textContent = nomeAluno;
        var nm = document.getElementById('pc-nome-menu'); if (nm) nm.textContent = nomeAluno;
        var cm = document.getElementById('pc-curso-menu'); if (cm) cm.textContent = nomeCurso;

        var load = document.getElementById('pc-loading'), app = document.getElementById('pc-app');
        if (load) load.style.display = 'none';
        if (app) app.style.display = '';
        pcSetView('inicio');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js').catch(function () {});
        }
    } catch (e) {
        console.error('Portal do curso: falha ao carregar', e);
        pcMostrarErro('Falha de conexão', 'Não foi possível carregar os dados do curso: ' + (e && e.message ? e.message : 'erro desconhecido'));
    }
}

/* ---------- regras de apontamento ---------- */
function pcChaveAula(aula) {
    return 'id:' + String(aula._id || '');
}
function pcChaveAlternativaAula(aula) {
    return 'ad:' + String(aula.data || '').trim() + '|' + pcNorm(aula.disciplina);
}
function pcChaveApontamento(ap) {
    var id = String(ap.aulaId || '').trim();
    if (id && id !== 'n/a') return 'id:' + id;
    var data = String(ap.dataAula || '').trim();
    var disc = pcNorm(ap.disciplina);
    if (data || disc) return 'ad:' + data + '|' + disc;
    return '';
}
function pcApontamentoDaAula(aula) {
    var chave = pcChaveAula(aula), alt = pcChaveAlternativaAula(aula);
    for (var i = 0; i < pcApontamentos.length; i++) {
        var k = pcChaveApontamento(pcApontamentos[i]);
        if (k === chave || (k === alt && alt !== 'ad:|')) return pcApontamentos[i];
    }
    return null;
}

/* ---------- render: INICIO ---------- */
function pcRenderInicio() {
    var box = document.getElementById('pc-inicio-conteudo'); if (!box) return;
    var presentes = pcApontamentos.filter(function (p) { return p.status === 'Presente'; }).length;
    var faltas = pcApontamentos.filter(function (p) { return p.status === 'Falta'; }).length;
    var just = pcApontamentos.filter(function (p) { return p.status === 'Justificada'; }).length;
    var liberadas = pcAvs.filter(pcAvLiberada).length;
    var linha = [pcAluno.projeto, pcAluno.turma].filter(Boolean).map(pcEsc).join(' • ') || '—';
    var situacao = pcAluno.situacaoCurso || '—';
    var tiles = [
        ['Curso', pcCurso.nome || '—'],
        ['Situação no curso', situacao],
        ['Projeto / Turma', linha],
        ['Aulas cadastradas', pcAulas.length],
        ['Presentes', presentes],
        ['Faltas', faltas],
        ['Justificadas', just],
        ['AVs liberadas', liberadas]
    ];
    var html = '<div class="pc-card"><h2>Resumo do curso</h2><div class="pc-grid">'
        + tiles.map(function (t) { return '<div class="pc-tile"><span>' + t[0] + '</span><b>' + t[1] + '</b></div>'; }).join('')
        + '</div><div class="pc-acoes">'
        + '<button class="pc-btn primary" onclick="pcSetView(\'aulas\')"><i class="fa-solid fa-chalkboard-user"></i> Ver aulas</button>'
        + '<button class="pc-btn" onclick="pcSetView(\'apontamento\')"><i class="fa-solid fa-clipboard-check"></i> Ver apontamento</button>'
        + '<button class="pc-btn" onclick="pcSetView(\'av-teorica\')"><i class="fa-solid fa-brain"></i> Responder AV</button>'
        + '<button class="pc-btn" onclick="pcSetView(\'apostilas\')"><i class="fa-solid fa-file-pdf"></i> Apostilas</button>'
        + '</div></div>';
    if (!pcApontamentos.length) {
        html += '<div class="pc-aviso">Ainda não há apontamento de aulas feito pelo docente neste curso.</div>';
    }
    box.innerHTML = html;
}

/* ---------- render: APONTAMENTO ---------- */
function pcRenderApontamento() {
    var box = document.getElementById('pc-apontamento-lista'); if (!box) return;
    if (!pcApontamentos.length) {
        box.innerHTML = '<div class="pc-aviso">Nenhuma aula apontada pelo docente até o momento.</div>'; return;
    }
    var html = pcLegenda() + '<table class="pc-tabela"><thead><tr>'
        + '<th>Data</th><th>Aula / Disciplina</th><th>Status</th><th>Observação / Justificativa</th>'
        + '</tr></thead><tbody>';
    pcApontamentos.forEach(function (p) {
        var obs = String(p.obs || '').trim();
        var texto = p.status === 'Justificada' ? (obs ? 'Justificativa: ' + obs : 'Justificada')
            : (obs ? 'Obs: ' + obs : '—');
        html += '<tr><td>' + pcEsc(pcData(p.dataAula || p.criadoEm)) + '</td>'
            + '<td><b>' + pcEsc(p.aula || 'Aula') + '</b>'
            + (p.disciplina ? '<div style="font-size:11px;color:#64748b">' + pcEsc(p.disciplina) + '</div>' : '') + '</td>'
            + '<td>' + pcBadge(p.status) + '</td>'
            + '<td style="font-size:11px;color:#64748b">' + pcEsc(texto) + '</td></tr>';
    });
    box.innerHTML = html + '</tbody></table>';
}

/* ---------- render: AULAS ---------- */
function pcRenderAulas() {
    var box = document.getElementById('pc-aulas-lista'); if (!box) return;
    var leg = document.getElementById('pc-legenda'); if (leg) leg.innerHTML = pcLegenda();
    if (!pcAulas.length) {
        box.innerHTML = '<div class="pc-aviso">Nenhuma aula cadastrada na guia Disciplinas e Aulas deste curso.</div>'; return;
    }
    var html = '<table class="pc-tabela"><thead><tr>'
        + '<th>Data</th><th>Disciplina</th><th>Conteúdo</th><th>Docente</th><th>Apontamento</th>'
        + '</tr></thead><tbody>';
    pcAulas.forEach(function (a) {
        var ap = pcApontamentoDaAula(a);
        var status = ap ? String(ap.status || '') : '';
        var cls = status === 'Presente' ? 'presente' : (status === 'Falta' ? 'falta' : (status === 'Justificada' ? 'justificada' : 'sem'));
        html += '<tr class="pc-linha-aulas ' + cls + '">'
            + '<td>' + pcEsc(pcData(a.data)) + '</td>'
            + '<td>' + pcEsc(a.disciplina || '—') + '</td>'
            + '<td><b>' + pcEsc(a.conteudo || a.nome || 'Aula') + '</b>'
            + (a.horario ? '<div style="font-size:11px;color:#64748b">' + pcEsc(a.horario) + '</div>' : '') + '</td>'
            + '<td>' + pcEsc(a.docente || '—') + '</td>'
            + '<td>' + pcBadge(status) + '</td></tr>';
    });
    box.innerHTML = html + '</tbody></table>';
}

/* ---------- avaliacoes ---------- */
function pcTipoAv(av) { return String((av && av.tipo) || 'teorica'); }
function pcEhPratica(av) { return pcTipoAv(av).indexOf('pratica') >= 0; }
function pcAvLiberada(av) {
    if (!av || (av.enviada !== true)) return false;
    if (av.ativa === false) return false;
    var selecionados = av.alunosSelecionados || [];
    if (!selecionados.length) return true;
    return selecionados.some(function (c) { return pcSoDigitos(c) === pcCpf; });
}
function pcRespostaDaAv(id) {
    return pcRespostas.find(function (r) { return String(r.avaliacaoId || '') === String(id); }) || null;
}
function pcPesoQuestoes(total) {
    return total === 10 ? 1 : (total === 20 ? 0.5 : (total > 0 ? 10 / total : 0));
}
function pcNotaDaAv(av) {
    var tipo = pcTipoAv(av), chave = String(av.aulaId || av._id);
    var avSnapshot = pcFicha.av || {};
    var nota = null;
    if (tipo === 'final_teorica') nota = avSnapshot.avFinalTeorica;
    else if (tipo === 'final_pratica') nota = avSnapshot.avFinalPratica;
    else if (tipo === 'pratica') nota = (avSnapshot.notasPraticas || {})[chave];
    else nota = (avSnapshot.notasTeoricas || {})[chave];
    if (nota == null || nota === '') {
        var r = pcRespostaDaAv(av._id);
        if (r) {
            if (r.nota != null && r.nota !== '') nota = r.nota;
            else if (r.pontos != null && r.pontos !== '') nota = r.pontos;
            else if (r.respostasCertas != null) nota = Number(r.respostasCertas) * pcPesoQuestoes((r.totalQuestoes || (av.questoes || []).length));
        }
    }
    if (nota == null || nota === '') return '—';
    var n = parseFloat(String(nota).replace(',', '.'));
    return isNaN(n) ? '—' : (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
}
function pcRenderAvTeorica() {
    var box = document.getElementById('pc-av-teorica-lista'); if (!box) return;
    var lista = pcAvs.filter(function (a) { return !pcEhPratica(a); });
    if (!lista.length) {
        box.innerHTML = '<div class="pc-aviso">Nenhuma AV Teórica cadastrada neste curso.</div>'; return;
    }
    var html = '';
    lista.forEach(function (av) {
        var liberada = pcAvLiberada(av);
        var resp = pcRespostaDaAv(av._id);
        var sub = (av.disciplina ? pcEsc(av.disciplina) + ' • ' : '') + (av.questoes || []).length + ' questão(ões)'
            + (av.aula ? ' • ' + pcEsc(av.aula) : '');
        html += '<div class="pc-item"><b>' + pcEsc(av.nome || 'Avaliação') + '</b>'
            + '<p>' + sub + '</p>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
        if (!liberada) html += '<span class="pc-badge neutro">AGUARDANDO LIBERAÇÃO DO DOCENTE</span>';
        if (resp) html += '<span class="pc-badge presente">RESPONDIDA • NOTA ' + pcNotaDaAv(av) + '</span>';
        if (liberada && !resp) {
            html += '<button class="pc-btn primary" onclick="pcAbrirAv(\'' + av._id + '\')"><i class="fa-solid fa-pen-to-square"></i> Responder questão</button>';
        } else if (resp) {
            html += '<button class="pc-btn" onclick="pcVerResposta(\'' + av._id + '\')"><i class="fa-solid fa-eye"></i> Ver resposta</button>';
        }
        html += '</div></div>';
    });
    box.innerHTML = html;
}
function pcRenderAvPratica() {
    var box = document.getElementById('pc-av-pratica-lista'); if (!box) return;
    var lista = pcAvs.filter(pcEhPratica);
    if (!lista.length) {
        box.innerHTML = '<div class="pc-aviso">Nenhuma AV Prática cadastrada neste curso.</div>'; return;
    }
    var html = '';
    lista.forEach(function (av) {
        var sub = (av.disciplina ? pcEsc(av.disciplina) + ' • ' : '') + (av.questoes || []).length + ' questão(ões)'
            + (av.aula ? ' • ' + pcEsc(av.aula) : '');
        html += '<div class="pc-item"><b>' + pcEsc(av.nome || 'Avaliação prática') + '</b>'
            + '<p>' + sub + '</p>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
            + '<span class="pc-badge neutro">PONTUAÇÃO: ' + pcNotaDaAv(av) + '</span>'
            + '<button class="pc-btn primary" onclick="pcVerAvPratica(\'' + av._id + '\')"><i class="fa-solid fa-eye"></i> Visualizar pontuação e questões</button>'
            + (pcAvLiberada(av) ? '' : '<span class="pc-badge neutro">AGUARDANDO LIBERAÇÃO DO DOCENTE</span>')
            + '</div></div>';
    });
    box.innerHTML = html;
}

/* ---------- modal de AV ---------- */
function pcAbrirModal(titulo, sub, corpo, mostrarEnviar) {
    var t = document.getElementById('pc-modal-titulo'); if (t) t.textContent = titulo;
    var s = document.getElementById('pc-modal-sub'); if (s) s.innerHTML = sub || '';
    var c = document.getElementById('pc-modal-corpo'); if (c) c.innerHTML = corpo;
    var b = document.getElementById('pc-modal-enviar'); if (b) b.style.display = mostrarEnviar ? '' : 'none';
    var m = document.getElementById('pc-modal'); if (m) m.classList.add('aberto');
}
function pcFecharModal() {
    var m = document.getElementById('pc-modal'); if (m) m.classList.remove('aberto');
    pcAvAberta = null;
}
function pcAbrirAv(id) {
    var av = pcAvs.find(function (a) { return a._id === id; });
    if (!av) return;
    if (!pcAvLiberada(av)) { alert('Esta avaliação ainda não foi liberada pelo docente.'); return; }
    if (pcRespostaDaAv(id)) { pcVerResposta(id); return; }
    pcAvAberta = av;
    var questoes = av.questoes || [];
    var html = '';
    questoes.forEach(function (q, i) {
        html += '<div class="pc-questao"><p>' + (i + 1) + '. ' + pcEsc(q.enunciado || '') + '</p>';
        ['a', 'b', 'c', 'd'].forEach(function (k) {
            var txt = (q.opcoes && q.opcoes[k]) ? q.opcoes[k] : '';
            if (!txt) return;
            html += '<label class="pc-opcao"><input type="radio" name="pc-q-' + i + '" value="' + k + '"> '
                + k.toUpperCase() + ') ' + pcEsc(txt) + '</label>';
        });
        html += '</div>';
    });
    if (!html) html = '<div class="pc-aviso">Esta avaliação não possui questões cadastradas.</div>';
    pcAbrirModal(av.nome || 'AV Teórica',
        (av.disciplina ? pcEsc(av.disciplina) + ' • ' : '') + questoes.length + ' questão(ões)', html, !!questoes.length);
}
async function pcEnviarResposta() {
    var av = pcAvAberta; if (!av) return;
    var questoes = av.questoes || [];
    var respostas = {}, certas = 0;
    for (var i = 0; i < questoes.length; i++) {
        var sel = document.querySelector('input[name="pc-q-' + i + '"]:checked');
        if (!sel) { alert('Responda todas as questões antes de enviar.'); return; }
        respostas[i] = sel.value;
        if (String(sel.value).toLowerCase() === String(questoes[i].correta || '').toLowerCase()) certas++;
    }
    var total = questoes.length || 1;
    var nota = Math.round(Math.min(10, certas * pcPesoQuestoes(total)) * 10) / 10;
    var dados = {
        cpf: pcCpf,
        nome: pcAluno.nome || '',
        matricula: pcAluno.matricula || '',
        avaliacaoId: av._id,
        respostas: respostas,
        respostasCertas: certas,
        totalQuestoes: total,
        pontos: nota,
        nota: nota,
        enviadoEm: new Date().toISOString(),
        cursoId: pcCursoId
    };
    var btn = document.getElementById('pc-modal-enviar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }
    try {
        var ref = dbFirestore.collection('cursosCadastro').doc(pcCursoId).collection('respostas');
        var existente = pcRespostaDaAv(av._id);
        if (existente && existente._id) await ref.doc(existente._id).update(dados);
        else {
            var nova = await ref.add(dados);
            pcRespostas.push(Object.assign({ _id: nova.id }, dados));
        }
        if (existente && existente._id) {
            pcRespostas = pcRespostas.map(function (r) { return r._id === existente._id ? Object.assign({}, r, dados) : r; });
        }
        pcFecharModal();
        pcRenderAvTeorica();
        alert('Respostas enviadas. Nota: ' + String(nota).replace('.', ','));
    } catch (e) {
        alert('Erro ao enviar respostas: ' + (e && e.message ? e.message : 'erro desconhecido'));
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar respostas'; }
}
function pcVerResposta(id) {
    var av = pcAvs.find(function (a) { return a._id === id; });
    var r = pcRespostaDaAv(id);
    if (!av || !r) return;
    var questoes = av.questoes || [], respostas = r.respostas || {};
    var html = '<div style="margin-bottom:12px"><span class="pc-badge presente">NOTA ' + pcNotaDaAv(av) + '</span></div>';
    questoes.forEach(function (q, i) {
        var marcada = respostas[i] == null ? respostas[String(i)] : respostas[i];
        var texto = (q.opcoes && q.opcoes[marcada]) ? marcada.toUpperCase() + ') ' + q.opcoes[marcada] : '—';
        html += '<div class="pc-questao"><p>' + (i + 1) + '. ' + pcEsc(q.enunciado || '') + '</p>'
            + '<div style="font-size:12px;color:#334155">Sua resposta: <b>' + pcEsc(texto) + '</b></div></div>';
    });
    pcAbrirModal(av.nome || 'Resposta', 'Enviada em ' + pcEsc(pcData(r.enviadoEm)), html, false);
}
function pcVerAvPratica(id) {
    var av = pcAvs.find(function (a) { return a._id === id; });
    if (!av) return;
    var questoes = av.questoes || [];
    var html = '<div style="margin-bottom:12px"><span class="pc-badge neutro">PONTUAÇÃO: ' + pcNotaDaAv(av) + '</span></div>';
    if (!questoes.length) html += '<div class="pc-aviso">Nenhuma questão cadastrada nesta AV prática.</div>';
    questoes.forEach(function (q, i) {
        html += '<div class="pc-questao"><p>' + (i + 1) + '. ' + pcEsc(q.enunciado || '') + '</p></div>';
    });
    pcAbrirModal(av.nome || 'AV Prática',
        (av.disciplina ? pcEsc(av.disciplina) + ' • ' : '') + questoes.length + ' questão(ões)',
        html, false);
}

/* ---------- render: APOSTILAS ---------- */
function pcRenderApostilas() {
    var box = document.getElementById('pc-apostilas-lista'); if (!box) return;
    var pdf = pcCurso.apostilaPdfUrl || pcCurso.apostilaPdf || '';
    var url = pcCurso.apostilaUrl || '';
    var html = '';
    if (pdf) {
        html += '<div class="pc-item"><b><i class="fa-solid fa-file-pdf" style="color:#dc2626;margin-right:6px"></i> Apostila em PDF</b>'
            + '<p>Material anexado pela coordenação do curso.</p>'
            + '<a class="pc-btn primary" href="' + pcEsc(pdf) + '" download="apostila.pdf" target="_blank"><i class="fa-solid fa-download"></i> Baixar apostila</a>'
            + ' <a class="pc-btn" href="' + pcEsc(pdf) + '" target="_blank"><i class="fa-solid fa-up-right-from-square"></i> Abrir</a></div>';
    }
    if (url) {
        html += '<div class="pc-item"><b><i class="fa-solid fa-link" style="color:#2563eb;margin-right:6px"></i> Link da apostila</b>'
            + '<p>' + pcEsc(url) + '</p>'
            + '<a class="pc-btn primary" href="' + pcEsc(url) + '" target="_blank"><i class="fa-solid fa-up-right-from-square"></i> Abrir link</a></div>';
    }
    box.innerHTML = html || '<div class="pc-aviso">Nenhuma apostila anexada a este curso.</div>';
}

window.addEventListener('DOMContentLoaded', pcInit);
