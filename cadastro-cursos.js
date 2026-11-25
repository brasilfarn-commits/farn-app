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
var ccIndFormaAtiva = false;
var ccIndEditando = null;
var ccIndFormGuardado = null;
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

/* Helpers proprios: o Cadastro de Cursos nao usa funcoes do app.js. */
function ccFormatCPF(v) {
    var c = String(v == null ? '' : v).replace(/\D/g, '');
    if (c.length !== 11) return v == null ? '' : String(v);
    return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
function ccMatriculaGerar(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.length < 5) return '';
    return 'ACD' + d.slice(-5);
}
function ccIdadeCalcular(nasc) {
    if (!nasc) return 0;
    var d = new Date(String(nasc).slice(0, 10));
    if (isNaN(d.getTime())) return 0;
    var hoje = new Date(), idade = hoje.getFullYear() - d.getFullYear();
    var m = hoje.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade--;
    return idade > 0 ? idade : 0;
}
function ccUsuarioAtual() {
    try {
        var u = JSON.parse(localStorage.getItem('usuarioLogado') || localStorage.getItem('adminUsuario') || 'null');
        if (u && u.nome) return String(u.nome);
    } catch (e) {}
    return 'Cadastro de Cursos';
}
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
            var status = (c.status === 'Concluido') ? 'Concluido' : 'Em Andamento';
            var cor = status === 'Concluido' ? '#2563eb' : '#16a34a';
            return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff;display:flex;gap:12px;align-items:center">'
                + '<div style="width:52px;height:52px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">'
                + ((c.iconeUrl || c.icone) ? '<img src="' + (c.iconeUrl || c.icone) + '" alt="Icone" style="width:100%;height:100%;object-fit:contain">'
                           : '<i class="fa-solid fa-book" style="color:#2563eb;font-size:22px"></i>')
                + '</div>'
                + '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ccEsc(c.nome) + '</div>'
                + '<div style="font-size:11px;color:#64748b;margin-top:3px">'
                + (c.criadoEm ? new Date(c.criadoEm).toLocaleDateString('pt-BR') : '')
                + (c.docenteResponsavelNome ? ' · <i class="fa-solid fa-chalkboard-user" style="color:#0d9488"></i> ' + ccEsc(c.docenteResponsavelNome) : '')
                + '</div></div>'
                + '<button class="btn-outline btn-sm" onclick="ccAlternarStatusCurso(\'' + c._id + '\')" title="Alternar status do curso" style="color:' + cor + ';border-color:' + cor + '"><i class="fa-solid fa-circle-check" style="margin-right:4px"></i>' + status + '</button>'
                + '<button class="btn-primary btn-sm" onclick="ccAbrirCurso(\'' + c._id + '\')"><i class="fa-solid fa-door-open"></i> Abrir</button>'
                + '<button class="btn-danger btn-sm" onclick="ccExcluirCurso(\'' + c._id + '\')" title="Excluir curso"><i class="fa-solid fa-trash"></i></button>'
                + '</div>';
        }).join('') + '</div>';
}

/* Alterna o status do curso entre Em Andamento e Concluido. */
async function ccAlternarStatusCurso(id) {
    var c = (ccCursos || []).find(function (x) { return String(x._id) === String(id); });
    if (!c) { alert('Curso não encontrado.'); return; }
    var novo = c.status === 'Concluido' ? 'Em Andamento' : 'Concluido';
    try {
        await dbFirestore.collection(CC_COLECAO).doc(String(id)).update({
            status: novo,
            statusAtualizadoEm: new Date().toISOString()
        });
        c.status = novo;
        ccRenderLista();
    } catch (e) { alert('Erro ao alterar status: ' + (e && e.message ? e.message : e)); }
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
    /* Ao voltar para a lista, nao deixe o formulario escondido dentro da
       aba do curso (pre-inscricao ou individuos). */
    if (!mostrar && ccPreFormaAtiva) ccPreVoltarForm();
    if (!mostrar && ccIndFormaAtiva) ccIndVoltarForm();
    if (!mostrar) { ccAtual = null; ccEditandoCursoId = null; }
    if (lista) lista.style.display = mostrar ? 'none' : '';
    if (ws) ws.style.display = mostrar ? '' : 'none';
    if (btnNovo) btnNovo.style.display = mostrar ? 'none' : '';
}

/* ============ CRIAR / EDITAR CURSO ============ */
/* O campo "Docente responsável" é escolhido entre os docentes cadastrados
   na seção Docente do admin (tabela docentesAdmin). Nada é gravado na tabela
   antiga 'docentes'. */
async function ccCarregarDocentesResponsavel(curso) {
    var sel = document.getElementById('cc-curso-docente');
    if (!sel) return;
    var info = document.getElementById('cc-curso-docente-info');
    var atual = curso && (curso.docenteResponsavelId || '') ? String(curso.docenteResponsavelId) : '';
    sel.innerHTML = '<option value="">— Selecione um docente —</option>';
    if (!ccDb()) {
        if (info) { info.textContent = 'Firebase não conectado. Recarregue a página.'; info.style.color = '#dc2626'; }
        return;
    }
    try {
        var snap = await ccDb().collection('docentesAdmin').get();
        var lista = [];
        snap.forEach(function (d) {
            var x = d.data() || {};
            lista.push({ id: d.id, nome: x.nome || 'Docente sem nome', matricula: x.matricula || '', cpf: x.cpf || '' });
        });
        lista.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
        var existeAtual = false;
        lista.forEach(function (x) {
            if (x.id === atual) existeAtual = true;
            var op = document.createElement('option');
            op.value = x.id;
            op.textContent = x.nome + (x.matricula ? ' — ' + x.matricula : '');
            op.setAttribute('data-nome', x.nome);
            op.setAttribute('data-matricula', x.matricula);
            sel.appendChild(op);
        });
        /* Curso antigo pode apontar para um docente removido: mantém a escolha
           visível até o administrador trocar. */
        if (atual && !existeAtual) {
            var opAntigo = document.createElement('option');
            opAntigo.value = atual;
            opAntigo.textContent = (curso.docenteResponsavelNome || 'Docente removido') + ' (não cadastrado)';
            opAntigo.setAttribute('data-nome', curso.docenteResponsavelNome || 'Docente removido');
            opAntigo.setAttribute('data-matricula', curso.docenteResponsavelMatricula || '');
            sel.appendChild(opAntigo);
        }
        if (atual) sel.value = atual;
        if (info) { info.textContent = lista.length + ' docente(s) cadastrado(s) na seção Docente.'; info.style.color = '#64748b'; }
    } catch (e) {
        if (info) { info.textContent = 'Não foi possível carregar os docentes: ' + (e && e.message ? e.message : e); info.style.color = '#dc2626'; }
    }
}

/* =====================================================================
   CAMPO DOCENTE DE DISCIPLINAS E AULAS
   Fonte unica: docentesAdmin (secao Docente do admin). O value continua
   sendo o nome, para nao quebrar registros antigos que so guardavam texto;
   o id do cadastro vai junto em data-id e tambem e salvo no registro.
   ===================================================================== */
var ccDocentesSelectCache = null;
async function ccCarregarSelectDocentes() {
    var ids = ['cc-disc-docente', 'cc-aula-docente'];
    var atuais = {};
    ids.forEach(function (id) { var s = document.getElementById(id); if (s) atuais[id] = s.value; });
    try {
        if (!ccDocentesSelectCache) {
            var snap = await ccDb().collection('docentesAdmin').get();
            var lista = [];
            snap.forEach(function (d) {
                var x = d.data() || {};
                lista.push({ id: d.id, nome: x.nome || '', matricula: x.matricula || '', cpf: x.cpf || '' });
            });
            lista.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
            ccDocentesSelectCache = lista;
        }
        ids.forEach(function (id) {
            var sel = document.getElementById(id); if (!sel) return;
            var atual = atuais[id] || sel.value || '';
            sel.innerHTML = '<option value="">Selecione o docente...</option>' + ccDocentesSelectCache.map(function (d) {
                return '<option value="' + ccEsc(d.nome) + '" data-id="' + ccEsc(d.id) + '">'
                    + ccEsc(d.nome) + (d.matricula ? ' — ' + ccEsc(d.matricula) : '') + '</option>';
            }).join('');
            if (atual) {
                var achou = false;
                for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === atual) achou = true;
                if (!achou) sel.innerHTML += '<option value="' + ccEsc(atual) + '">' + ccEsc(atual) + ' (fora do cadastro)</option>';
                sel.value = atual;
            }
        });
    } catch (e) {
        console.warn('ccCarregarSelectDocentes', e);
    }
}
function ccDocenteIdDoSelect(id) {
    var sel = document.getElementById(id);
    if (!sel || !sel.value || sel.selectedIndex < 0) return '';
    return sel.options[sel.selectedIndex].getAttribute('data-id') || '';
}

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
    ccCarregarDocentesResponsavel(curso);
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
    ccEditandoCursoId = null;
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
    var selDoc = document.getElementById('cc-curso-docente');
    var opDoc = selDoc && selDoc.selectedIndex >= 0 ? selDoc.options[selDoc.selectedIndex] : null;
    dados.docenteResponsavelId = selDoc && selDoc.value ? String(selDoc.value) : '';
    dados.docenteResponsavelNome = opDoc && dados.docenteResponsavelId ? (opDoc.getAttribute('data-nome') || opDoc.textContent.split(' — ')[0]) : '';
    dados.docenteResponsavelMatricula = opDoc && dados.docenteResponsavelId ? (opDoc.getAttribute('data-matricula') || '') : '';
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
    if (!confirm('Excluir este curso e TODOS os seus dados (projetos, turmas, inscrições, indivíduos, avaliações, fichas e certificados)?')) return;
    try {
        var base = ccDb().collection(CC_COLECAO).doc(id);
        var subs = [
            'projetos','turmas','preInscricoes','linksPreInscricao',
            'individuos','disciplinas','aulas','apontamentos','presencas','inicios',
            'avaliacoes','respostas','fichaAvaliacoes','certificados'
        ];
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
    ccEditandoCursoId = null;
    ccMostrarWorkspace(true);
    var tit = document.getElementById('cc-workspace-titulo');
    if (tit) tit.textContent = ccAtual.nome;
    var ic = document.getElementById('cc-workspace-icone');
    if (ic) ic.innerHTML = (ccAtual.iconeUrl || ccAtual.icone) ? '<img src="' + (ccAtual.iconeUrl || ccAtual.icone) + '" style="width:100%;height:100%;object-fit:contain">' : '<i class="fa-solid fa-book"></i>';
    ccSetAba('geral');
}

/* ============ PROJETO E TURMA DO CURSO (ISOLADOS) ============
   Tudo aqui vive em cursosCadastro/{id}/projetos, /turmas,
   /preInscricoes e /linksPreInscricao. Nenhuma funcao deste bloco
   escreve nas colecoes globais 'parceiros', 'turmas' ou 'candidatos'. */
var ccProjetos = [];
var ccTurmasCurso = [];
var ccPreCandidatos = [];
var ccPreFormaAtiva = false;
var ccPreEditando = null;
var ccPreFormGuardado = null;

function ccCampoSet(id, valor) {
    var el = document.getElementById(id);
    if (el) el.value = valor == null ? '' : valor;
}
function ccMsg(id, texto, cor) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto || '';
    el.style.color = cor || '#16a34a';
    el.style.display = texto ? '' : 'none';
}
function ccIdadeCurto(nasc) {
    var v = ccIdadeCalcular(nasc);
    return v ? v + ' anos' : '-';
}

/* ---------- PROJETOS ---------- */
async function ccCarregarProjetosTurmas() {
    if (!ccAtual || !ccDb()) return;
    try {
        var projetos = [], turmas = [];
        var sp = await ccRef('projetos').get();
        sp.forEach(function (d) { projetos.push(Object.assign({ _id: d.id }, d.data() || {})); });
        projetos.sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
        var st = await ccRef('turmas').get();
        st.forEach(function (d) { turmas.push(Object.assign({ _id: d.id }, d.data() || {})); });
        turmas.sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
        /* So troca o cache quando as duas leituras terminam bem: uma falha
           de rede nao pode apagar o que ja estava carregado na tela. */
        ccProjetos = projetos;
        ccTurmasCurso = turmas;
    } catch (e) {
        console.error('Erro ao carregar projetos/turmas do curso:', e);
        return;
    }
    ccRenderProjetos();
    ccRenderTurmas();
    ccPreencherSelectProjetos();
    ccPreencherSelectTurmas(ccPreProjeto());
}

function ccRenderProjetos() {
    var box = document.getElementById('cc-projetos-lista');
    if (!box) return;
    var cnt = document.getElementById('cc-proj-count');
    if (cnt) cnt.textContent = ccProjetos.length;
    if (!ccProjetos.length) {
        box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum projeto cadastrado neste curso.</p>';
        return;
    }
    box.innerHTML = ccProjetos.map(function (p) {
        var n = ccTurmasCurso.filter(function (t) { return t.projeto === p.nome; }).length;
        return '<div style="border:1px solid #e2e8f0;border-radius:9px;padding:10px;margin-bottom:8px;background:#fff">'
            + '<div style="font-weight:800;color:#0f172a;font-size:13px">' + ccEsc(p.nome) + '</div>'
            + '<div style="font-size:11px;color:#64748b;margin-top:3px">' + ccEsc(p.responsavel || '—') + ' • ' + n + ' turma(s)</div>'
            + '<div style="display:flex;gap:6px;margin-top:7px">'
            + '<button class="btn-outline btn-sm" onclick="ccEditarProjeto(\'' + p._id + '\')"><i class="fa-solid fa-pen"></i> Editar</button>'
            + '<button class="btn-danger btn-sm" onclick="ccExcluirProjeto(\'' + p._id + '\')"><i class="fa-solid fa-trash"></i> Excluir</button>'
            + '</div></div>';
    }).join('');
}

function ccRenderTurmas() {
    var box = document.getElementById('cc-turmas-lista');
    if (!box) return;
    var cnt = document.getElementById('cc-turma-count');
    if (cnt) cnt.textContent = ccTurmasCurso.length;
    if (!ccTurmasCurso.length) {
        box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhuma turma cadastrada neste curso.</p>';
        return;
    }
    box.innerHTML = ccTurmasCurso.map(function (t) {
        var concluida = t.status === 'Concluido';
        return '<div style="border:1px solid #e2e8f0;border-radius:9px;padding:10px;margin-bottom:8px;background:#fff">'
            + '<div style="font-weight:800;color:#0f172a;font-size:13px">' + ccEsc(t.nome) + ' '
            + '<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:8px;background:' + (concluida ? '#eff6ff;color:#1d4ed8' : '#dcfce7;color:#166534') + '">' + (concluida ? 'CONCLUÍDA' : 'EM ANDAMENTO') + '</span></div>'
            + '<div style="font-size:11px;color:#64748b;margin-top:3px">Projeto: <b style="color:#ea580c">' + ccEsc(t.projeto || '—') + '</b>'
            + (t.descricao ? ' • ' + ccEsc(t.descricao) : '') + '</div>'
            + '<div style="font-size:10px;color:#94a3b8;margin-top:2px">' + ccEsc(t.inicio || '') + (t.previsao ? ' → ' + ccEsc(t.previsao) : '') + (t.horarios ? ' • ' + ccEsc(t.horarios) : '') + '</div>'
            + '<div style="display:flex;gap:6px;margin-top:7px">'
            + '<button class="btn-outline btn-sm" onclick="ccEditarTurma(\'' + t._id + '\')"><i class="fa-solid fa-pen"></i> Editar</button>'
            + '<button class="btn-danger btn-sm" onclick="ccExcluirTurma(\'' + t._id + '\')"><i class="fa-solid fa-trash"></i> Excluir</button>'
            + '</div></div>';
    }).join('');
}

function ccPreencherSelectProjetos() {
    var ids = ['cc-turma-projeto', 'cc-pre-projeto'];
    ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var atual = el.value;
        el.innerHTML = '<option value="">Selecione o projeto...</option>' + ccProjetos.map(function (p) {
            return '<option value="' + ccEsc(p.nome) + '">' + ccEsc(p.nome) + '</option>';
        }).join('');
        if (atual && ccProjetos.some(function (p) { return p.nome === atual; })) el.value = atual;
    });
}

function ccPreencherSelectTurmas(projeto) {
    var lista = ccTurmasCurso.filter(function (t) { return !projeto || t.projeto === projeto; });
    ['cc-pre-turma', 'cc-pre-link-turma'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var atual = el.value;
        el.innerHTML = '<option value="">Selecione a turma...</option>' + lista.map(function (t) {
            return '<option value="' + ccEsc(t.nome) + '">' + ccEsc(t.nome) + (t.descricao ? ' - ' + ccEsc(t.descricao) : '') + '</option>';
        }).join('');
        if (atual && lista.some(function (t) { return t.nome === atual; })) el.value = atual;
    });
}

function ccLimparFormProjeto() {
    ['cc-proj-id', 'cc-proj-nome', 'cc-proj-responsavel', 'cc-proj-cnpj'].forEach(function (id) { ccCampoSet(id, ''); });
    var tit = document.getElementById('cc-proj-form-titulo'); if (tit) tit.textContent = 'Novo Projeto';
    ccMsg('cc-proj-msg', '');
}

async function ccSalvarProjeto() {
    var nome = ((document.getElementById('cc-proj-nome') || {}).value || '').trim();
    if (!nome) { alert('Informe o nome do projeto.'); return; }
    var id = ((document.getElementById('cc-proj-id') || {}).value || '').trim();
    var repetido = ccProjetos.some(function (p) { return p._id !== id && String(p.nome).toUpperCase() === nome.toUpperCase(); });
    if (repetido) { alert('Já existe um projeto com esse nome neste curso.'); return; }
    var agora = new Date().toISOString();
    var dados = {
        nome: nome,
        responsavel: ((document.getElementById('cc-proj-responsavel') || {}).value || '').trim(),
        cnpj: ((document.getElementById('cc-proj-cnpj') || {}).value || '').trim(),
        cursoId: ccAtual._id,
        atualizadoEm: agora
    };
    try {
        if (id) await ccRef('projetos', id).update(dados);
        else { dados.criadoEm = agora; await ccRef('projetos').add(dados); }
        ccLimparFormProjeto();
        await ccCarregarProjetosTurmas();
        ccMsg('cc-proj-msg', 'Projeto salvo somente neste curso.');
    } catch (e) { ccMsg('cc-proj-msg', 'Erro ao salvar: ' + e.message, '#dc2626'); }
}

function ccEditarProjeto(id) {
    var p = ccProjetos.find(function (x) { return x._id === id; });
    if (!p) return;
    ccCampoSet('cc-proj-id', p._id);
    ccCampoSet('cc-proj-nome', p.nome);
    ccCampoSet('cc-proj-responsavel', p.responsavel);
    ccCampoSet('cc-proj-cnpj', p.cnpj);
    var tit = document.getElementById('cc-proj-form-titulo'); if (tit) tit.textContent = 'Editar Projeto';
    ccMsg('cc-proj-msg', '');
    var card = document.getElementById('cc-proj-nome'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function ccExcluirProjeto(id) {
    var p = ccProjetos.find(function (x) { return x._id === id; });
    if (!p) return;
    var qtd = ccTurmasCurso.filter(function (t) { return t.projeto === p.nome; }).length;
    if (!confirm('Excluir o projeto "' + p.nome + '" e ' + qtd + ' turma(s) dele DESTE CURSO?\nOs pré-inscritos serão mantidos.')) return;
    try {
        var batch = ccDb().batch();
        ccTurmasCurso.forEach(function (t) { if (t.projeto === p.nome) batch.delete(ccRef('turmas', t._id)); });
        batch.delete(ccRef('projetos', id));
        await batch.commit();
        ccLimparFormProjeto();
        await ccCarregarProjetosTurmas();
    } catch (e) { alert('Erro ao excluir: ' + e.message); }
}

/* ---------- TURMAS ---------- */
function ccLimparFormTurma() {
    ['cc-turma-id', 'cc-turma-nome', 'cc-turma-descricao', 'cc-turma-inicio', 'cc-turma-previsao', 'cc-turma-dias', 'cc-turma-horarios'].forEach(function (id) { ccCampoSet(id, ''); });
    ccCampoSet('cc-turma-status', 'Em Andamento');
    var tit = document.getElementById('cc-turma-form-titulo'); if (tit) tit.textContent = 'Nova Turma';
    ccMsg('cc-turma-msg', '');
}

async function ccSalvarTurma() {
    var nome = ((document.getElementById('cc-turma-nome') || {}).value || '').trim();
    var projeto = ((document.getElementById('cc-turma-projeto') || {}).value || '').trim();
    if (!projeto) { alert('Selecione o projeto deste curso.'); return; }
    if (!nome) { alert('Informe o nome da turma.'); return; }
    var id = ((document.getElementById('cc-turma-id') || {}).value || '').trim();
    var repetido = ccTurmasCurso.some(function (t) { return t._id !== id && t.projeto === projeto && String(t.nome).toUpperCase() === nome.toUpperCase(); });
    if (repetido) { alert('Já existe uma turma com esse nome neste projeto.'); return; }
    var agora = new Date().toISOString();
    var dados = {
        nome: nome,
        projeto: projeto,
        descricao: ((document.getElementById('cc-turma-descricao') || {}).value || '').trim(),
        status: ((document.getElementById('cc-turma-status') || {}).value || 'Em Andamento'),
        inicio: ((document.getElementById('cc-turma-inicio') || {}).value || '').trim(),
        previsao: ((document.getElementById('cc-turma-previsao') || {}).value || '').trim(),
        dias: ((document.getElementById('cc-turma-dias') || {}).value || '').trim(),
        horarios: ((document.getElementById('cc-turma-horarios') || {}).value || '').trim(),
        cursoId: ccAtual._id,
        atualizadoEm: agora
    };
    try {
        if (id) await ccRef('turmas', id).update(dados);
        else { dados.criadoEm = agora; await ccRef('turmas').add(dados); }
        ccLimparFormTurma();
        await ccCarregarProjetosTurmas();
        ccMsg('cc-turma-msg', 'Turma salva somente neste curso.');
    } catch (e) { ccMsg('cc-turma-msg', 'Erro ao salvar: ' + e.message, '#dc2626'); }
}

function ccEditarTurma(id) {
    var t = ccTurmasCurso.find(function (x) { return x._id === id; });
    if (!t) return;
    ccCampoSet('cc-turma-id', t._id);
    ccCampoSet('cc-turma-projeto', t.projeto);
    ccCampoSet('cc-turma-nome', t.nome);
    ccCampoSet('cc-turma-descricao', t.descricao);
    ccCampoSet('cc-turma-status', t.status || 'Em Andamento');
    ccCampoSet('cc-turma-inicio', t.inicio);
    ccCampoSet('cc-turma-previsao', t.previsao);
    ccCampoSet('cc-turma-dias', t.dias);
    ccCampoSet('cc-turma-horarios', t.horarios);
    var tit = document.getElementById('cc-turma-form-titulo'); if (tit) tit.textContent = 'Editar Turma';
    ccMsg('cc-turma-msg', '');
    var el = document.getElementById('cc-turma-nome'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function ccExcluirTurma(id) {
    var t = ccTurmasCurso.find(function (x) { return x._id === id; });
    if (!t) return;
    if (!confirm('Excluir a turma "' + t.nome + '" DESTE CURSO?\nOs pré-inscritos serão mantidos.')) return;
    try {
        await ccRef('turmas', id).delete();
        ccLimparFormTurma();
        await ccCarregarProjetosTurmas();
    } catch (e) { alert('Erro ao excluir: ' + e.message); }
}

/* ---------- PRE-INSCRICAO DO CURSO ---------- */
function ccPreProjeto() { return ((document.getElementById('cc-pre-projeto') || {}).value || '').trim(); }
function ccPreTurma() { return ((document.getElementById('cc-pre-turma') || {}).value || '').trim(); }

function ccPreOnProjetoChange() {
    ccPreencherSelectTurmas(ccPreProjeto());
    var cont = document.getElementById('cc-pre-conteudo');
    if (cont) cont.style.display = 'none';
    ccPreCandidatos = [];
}
function ccPreOnTurmaChange() {
    var cont = document.getElementById('cc-pre-conteudo');
    if (!cont) return;
    if (!ccPreProjeto() || !ccPreTurma()) { cont.style.display = 'none'; ccPreCandidatos = []; return; }
    cont.style.display = '';
    ccInitPreInscricao();
}

async function ccInitPreInscricao() {
    if (!ccAtual || !ccDb()) return;
    var p = ccPreProjeto(), t = ccPreTurma();
    if (!p || !t) return;
    try {
        var snap = await ccRef('preInscricoes').get();
        var lista = [];
        snap.forEach(function (d) {
            var x = Object.assign({ _id: d.id }, d.data() || {});
            if (x.projeto === p && x.turma === t) lista.push(x);
        });
        lista.sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
        ccPreCandidatos = lista;
        ccPreRenderLista();
    } catch (e) {
        var tb = document.getElementById('cc-pre-tbody');
        if (tb) tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#dc2626;padding:24px">Erro ao carregar: ' + ccEsc(e.message) + '</td></tr>';
    }
}

function ccPreRenderLista() {
    var tb = document.getElementById('cc-pre-tbody');
    if (!tb) return;
    var busca = String(((document.getElementById('cc-pre-search') || {}).value || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    var status = ((document.getElementById('cc-pre-filter') || {}).value || '');
    var lista = ccPreCandidatos.filter(function (c) {
        if (status && c.status !== status) return false;
        if (!busca) return true;
        var nome = String(c.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        var cpf = String(c.cpf || '').replace(/\D/g, '');
        var digits = busca.replace(/\D/g, '');
        return nome.indexOf(busca) >= 0 || (digits.length >= 3 && cpf.indexOf(digits) >= 0);
    });
    var badge = document.getElementById('cc-pre-count-badge');
    if (badge) {
        var pend = ccPreCandidatos.filter(function (c) { return c.status === 'Pendente'; }).length;
        badge.textContent = pend + ' pendente' + (pend !== 1 ? 's' : '');
    }
    if (!lista.length) {
        tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:24px">Nenhum pré-inscrito nesta turma do curso.</td></tr>';
        return;
    }
    tb.innerHTML = lista.map(function (c) {
        var cor = c.status === 'Ativo' ? 'green' : c.status === 'Rejeitado' ? 'rejeitado' : 'pendente';
        return '<tr>'
            + '<td>' + ccEsc(c.nome || '-') + '</td>'
            + '<td>' + ccEsc(c.cpf || '-') + '</td>'
            + '<td>' + ccEsc(c.nascimento || '-') + '</td>'
            + '<td>' + ccIdadeCurto(c.nascimento) + '</td>'
            + '<td>' + ccEsc(c.genero || '-') + '</td>'
            + '<td>' + ccEsc(c.turma || '-') + '</td>'
            + '<td style="color:#ea580c;font-weight:600">' + ccEsc(c.projeto || '-') + '</td>'
            + '<td><span class="badge ' + cor + '">' + ccEsc(c.status || 'Pendente') + '</span>'
            + (c.individuoId ? ' <span class="badge green" title="Já está na lista de indivíduos deste curso">INDIVÍDUO</span>' : '') + '</td>'
            + '<td style="color:#aaa;font-size:12px">' + ccEsc(c.cadastradoPor || '-') + '</td>'
            + '<td><div class="actions-cell">'
            + '<button class="btn-icon" title="Editar" onclick="ccPreEditar(\'' + c._id + '\')"><i class="fa-solid fa-pen"></i></button>'
            + ((c.status !== 'Ativo' || !c.individuoId) ? '<button class="btn-icon btn-success" title="Aprovar e incluir nos indivíduos do curso" onclick="ccPreMudarStatus(\'' + c._id + '\',\'Ativo\')"><i class="fa-solid fa-check"></i></button>' : '')
            + (c.status !== 'Rejeitado' ? '<button class="btn-icon" title="Rejeitar" onclick="ccPreMudarStatus(\'' + c._id + '\',\'Rejeitado\')"><i class="fa-solid fa-xmark"></i></button>' : '')
            + '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="ccPreExcluir(\'' + c._id + '\')"><i class="fa-solid fa-trash"></i></button>'
            + '</div></td></tr>';
    }).join('');
}

/* ---------- FORMULARIO PROPRIO DO CADASTRO DE CURSOS ----------
   Nao usa #admin-form-candidato, fcCamposFormulario() nem funcoes de
   patente do app.js. Cada guia tem seu proprio painel com ids prefixados. */
var CC_PESSOA_CAMPOS = [
    ['nome','Nome Completo','text'], ['cpf','CPF','text'],
    ['nascimento','Data de Nascimento','date'], ['estadoCivil','Estado Civil','text'],
    ['telefone','Telefone / WhatsApp','text'], ['email','E-mail','text'],
    ['genero','Gênero','text'], ['mae','Nome da mãe','text'],
    ['pai','Nome do pai','text'], ['nacionalidade','Nacionalidade','text'],
    ['naturalidade','Naturalidade','text'], ['profissao','Profissão','text'],
    ['cidade','Cidade','text'], ['estado','Estado','text'],
    ['matricula','Matrícula','text'], ['senha','Senha do Portal','text'],
    ['fotoUrl','URL da foto 3x4','text'], ['observacoes','Observações','textarea']
];
function ccFormCampo(prefixo, chave, rotulo, tipo, valor) {
    var id = prefixo + '-' + chave;
    var v = ccEsc(valor == null ? '' : valor);
    var input = tipo === 'textarea'
        ? '<textarea id="' + id + '" class="config-input" rows="2">' + v + '</textarea>'
        : '<input type="' + tipo + '" id="' + id + '" class="config-input" value="' + v + '">';
    return '<div class="form-group"><label>' + ccEsc(rotulo) + '</label>' + input + '</div>';
}
/* Campo exclusivo da guia Indivíduos: em quais cursos esta pessoa participa.
   O curso atual fica sempre marcado e nao pode ser desmarcado aqui. */
function ccFormCursosParticipaHTML(p) {
    var atual = String((ccAtual || {})._id || '');
    var ids = ccParticipaIds(p);
    var cursos = (ccCursos || []).slice().sort(function (a, b) {
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
    var checks = cursos.map(function (c) {
        var cid = String(c._id);
        var marcado = ids.indexOf(cid) >= 0;
        var ehAtual = cid === atual;
        var fundo = marcado ? '#f0fdfa' : '#fff';
        var borda = marcado ? '#5eead4' : '#e2e8f0';
        var cor = marcado ? '#0f766e' : '#475569';
        return '<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid ' + borda
            + ';border-radius:8px;background:' + fundo + ';color:' + cor + ';font-size:11px;font-weight:700;cursor:pointer">'
            + '<input type="checkbox" class="cc-participa-curso" value="' + ccEsc(cid) + '"'
            + (marcado ? ' checked' : '') + (ehAtual ? ' disabled' : '') + '> '
            + ccEsc(c.nome || 'Curso')
            + (ehAtual ? ' <span style="font-size:9px;opacity:.75">(atual)</span>' : '')
            + '</label>';
    }).join('');
    return '<div class="form-group" style="margin:10px 0 4px">'
        + '<label>Cursos em que participa</label>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
        + (checks || '<span style="font-size:11px;color:#94a3b8">Nenhum curso cadastrado.</span>')
        + '</div>'
        + '<div style="font-size:10px;color:#64748b;margin-top:5px">O curso atual fica sempre marcado. Para incluir esta pessoa em outros cursos, use <b>Enviar indivíduo</b> na lista.</div>'
        + '</div>';
}
function ccFormPessoaHTML(prefixo, titulo, c, salvarFn, voltarFn) {
    var p = c || {};
    var projetos = ccProjetos.map(function (x) { return ccEsc(x.nome); });
    var projetoAtual = p.projeto || ccPreProjeto();
    var turmaAtual = p.turma || ccPreTurma();
    if (projetoAtual && projetos.indexOf(ccEsc(projetoAtual)) < 0) projetos.push(ccEsc(projetoAtual));
    var turmas = ccTurmasCurso.filter(function (t) { return !projetoAtual || t.projeto === projetoAtual; })
        .map(function (t) { return ccEsc(t.nome); });
    if (turmaAtual && turmas.indexOf(ccEsc(turmaAtual)) < 0) turmas.push(ccEsc(turmaAtual));
    var campos = CC_PESSOA_CAMPOS.map(function (x) {
        return ccFormCampo(prefixo, x[0], x[1], x[2], p[x[0]]);
    }).join('');
    return '<div class="card full-width">'
        + '<div class="card-header"><h3><i class="fa-solid fa-user-pen" style="color:#7c3aed;margin-right:8px"></i>' + ccEsc(titulo) + '</h3></div>'
        + '<div class="card-body">'
        + '<div class="form-row">'
        + '<div class="form-group"><label>Projeto *</label><select id="' + prefixo + '-projeto" class="config-input" onchange="ccFormProjetoChange(\'' + prefixo + '\')">'
        + '<option value="">Selecione...</option>' + projetos.map(function (n) { return '<option value="' + n + '"' + (n === ccEsc(projetoAtual) ? ' selected' : '') + '>' + n + '</option>'; }).join('')
        + '</select></div>'
        + '<div class="form-group"><label>Turma *</label><select id="' + prefixo + '-turma" class="config-input">'
        + '<option value="">Selecione...</option>' + turmas.map(function (n) { return '<option value="' + n + '"' + (n === ccEsc(turmaAtual) ? ' selected' : '') + '>' + n + '</option>'; }).join('')
        + '</select></div>'
        + '<div class="form-group"><label>Tipo</label><select id="' + prefixo + '-tipoPessoa" class="config-input">'
        + '<option value="A"' + ((p.tipoPessoa || 'A') === 'A' ? ' selected' : '') + '>Acadêmico</option>'
        + '<option value="F"' + (p.tipoPessoa === 'F' ? ' selected' : '') + '>Formado</option>'
        + '</select></div>'
        + '</div>'
        + '<div class="form-row">' + campos + '</div>'
        + (prefixo === 'ccif' ? ccFormCursosParticipaHTML(p) : '')
        /* Foto 3x4 + QR Code em pre-inscricao e individuo do curso. */
        + '<div style="margin:8px 0 4px">'
        /* Na guia Indivíduos o campo Foto 3x4 tem editor de zoom/recorte e
           teto de 1 MB; a pré-inscrição continua com o bloco padrão. */
        + (typeof FarnPessoaCampos !== 'undefined'
            ? FarnPessoaCampos.html(prefixo, p, prefixo === 'ccif' ? { editor: true, limiteKb: 1000 } : {})
            : '')
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:14px">'
        + '<button type="button" class="btn-primary" onclick="' + salvarFn + '"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>'
        + '<button type="button" class="btn-outline" onclick="' + voltarFn + '"><i class="fa-solid fa-arrow-left"></i> Cancelar</button>'
        + '</div></div></div>';
}
function ccFormProjetoChange(prefixo) {
    var projeto = ((document.getElementById(prefixo + '-projeto') || {}).value || '').trim();
    var sel = document.getElementById(prefixo + '-turma');
    if (!sel) return;
    var turmas = ccTurmasCurso.filter(function (t) { return t.projeto === projeto; });
    sel.innerHTML = '<option value="">Selecione...</option>' + turmas.map(function (t) {
        return '<option value="' + ccEsc(t.nome) + '">' + ccEsc(t.nome) + '</option>';
    }).join('');
}
function ccFormPessoaValores(prefixo) {
    var dados = {};
    CC_PESSOA_CAMPOS.forEach(function (x) {
        var el = document.getElementById(prefixo + '-' + x[0]);
        dados[x[0]] = el ? String(el.value || '').trim() : '';
    });
    dados.whatsapp = dados.telefone;
    dados.tipoPessoa = ((document.getElementById(prefixo + '-tipoPessoa') || {}).value || 'A');
    dados.projeto = ((document.getElementById(prefixo + '-projeto') || {}).value || '').trim();
    dados.turma = ((document.getElementById(prefixo + '-turma') || {}).value || '').trim();
    if (prefixo === 'ccif') {
        var ids = Array.prototype.slice.call(document.querySelectorAll('.cc-participa-curso:checked'))
            .map(function (el) { return String(el.value || ''); })
            .filter(Boolean);
        var atual = String((ccAtual || {})._id || '');
        if (atual && ids.indexOf(atual) < 0) ids.push(atual);
        ids = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
        dados.cursosParticipaIds = ids;
        dados.cursosParticipa = ccParticipaNomes(ids);
    }
    if (typeof FarnPessoaCampos !== 'undefined') {
        var extra = FarnPessoaCampos.coletar(prefixo, dados);
        dados.foto3x4 = extra.foto3x4;
        dados.qrCode = extra.qrCode;
    }
    return dados;
}

function ccPrePopularFormSelects() { /* formulario proprio ja vem preenchido */ }
function ccPreFormProjetoChange() { ccFormProjetoChange('ccpf'); }
async function ccPreAbrirForm(id) {
    var painel = document.getElementById('cc-pre-form-painel');
    var lista = document.getElementById('cc-pre-lista-wrap');
    if (!painel) return;
    if (ccPreFormaAtiva) ccPreVoltarForm();
    if (ccIndFormaAtiva) ccIndVoltarForm();
    await ccCarregarProjetosTurmas();
    var c = id ? ccPreCandidatos.find(function (x) { return x._id === id; }) : null;
    if (id && !c) return;
    painel.innerHTML = ccFormPessoaHTML('ccpf', c ? 'Editar pré-inscrição' : 'Nova pré-inscrição', c, 'ccPreSalvarCandidato()', 'ccPreVoltarForm()');
    painel.style.display = '';
    if (lista) lista.style.display = 'none';
    ccPreFormaAtiva = true;
    ccPreEditando = c || null;
    painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function ccPreNovo() { ccPreAbrirForm(null); }
function ccPreEditar(id) { ccPreAbrirForm(id); }
function ccPreVoltarForm() {
    ccPreFormaAtiva = false;
    ccPreEditando = null;
    var painel = document.getElementById('cc-pre-form-painel');
    var lista = document.getElementById('cc-pre-lista-wrap');
    if (painel) { painel.style.display = 'none'; painel.innerHTML = ''; }
    if (lista) lista.style.display = '';
}

async function ccPreSalvarCandidato() {
    var dados = ccPreEditando ? Object.assign({}, ccPreEditando) : {};
    delete dados._id;
    Object.assign(dados, ccFormPessoaValores('ccpf'));
    if (!dados.projeto || !dados.turma) { alert('Selecione o projeto e a turma deste curso.'); return false; }
    var agora = new Date().toISOString();
    var hoje = new Date().toLocaleDateString('pt-BR');
    dados.status = (ccPreEditando && ccPreEditando.status) || 'Pendente';
    dados.statusOriginal = (ccPreEditando && ccPreEditando.statusOriginal) || 'Pendente';
    if (!dados.matricula) dados.matricula = ccMatriculaGerar(dados.cpf);
    if (typeof FarnPessoaCampos !== 'undefined') dados.qrCode = FarnPessoaCampos.qrValor(dados);
    dados.cursos = [];
    dados.cursoId = ccAtual._id;
    dados.cursoNome = ccAtual.nome;
    dados.dataCadastro = (ccPreEditando && ccPreEditando.dataCadastro) ? ccPreEditando.dataCadastro : hoje;
    dados.cadastradoPor = (ccPreEditando && ccPreEditando.cadastradoPor) ? ccPreEditando.cadastradoPor : ccUsuarioAtual();
    dados.atualizadoEm = agora;
    try {
        if (ccPreEditando && ccPreEditando._id) await ccRef('preInscricoes', ccPreEditando._id).update(dados);
        else { dados.criadoEm = agora; dados.id = Date.now(); await ccRef('preInscricoes').add(dados); }
        ccPreVoltarForm();
        await ccInitPreInscricao();
    } catch (e) { alert('Erro ao salvar pré-inscrição: ' + e.message); }
    return false;
}

/* Aprovacao na Pre-Inscricao: o candidato entra na lista de individuos
   deste curso. Nada e escrito na colecao global 'candidatos'. */
async function ccPrePromoverIndividuo(c) {
    if (!c || !ccAtual || !ccAtual._id) return null;
    var cpf = String(c.cpf || '').replace(/\D/g, '');
    var dados = Object.assign({}, c);
    delete dados._id; delete dados.docKey; delete dados.individuoId; delete dados.promovidoEm;
    Object.keys(dados).forEach(function (k) { if (dados[k] === undefined) delete dados[k]; });
    dados.cpf = cpf;
    dados.cursoId = ccAtual._id;
    dados.cursoNome = ccAtual.nome || '';
    dados.origem = 'pre-inscricao';
    dados.preInscricaoId = c._id;
    dados.promovidoEm = new Date().toISOString();
    dados.projeto = c.projeto || ccPreProjeto();
    dados.turma = c.turma || ccPreTurma();
    dados.dataCadastro = c.dataCadastro || new Date().toLocaleDateString('pt-BR');
    dados.cadastradoPor = c.cadastradoPor || ccUsuarioAtual();
    dados.cursos = Array.isArray(c.cursos) ? c.cursos : [];
    if (!dados.matricula) dados.matricula = ccMatriculaGerar(cpf);
    if (!dados.senha && cpf) dados.senha = cpf.substring(0, 6);
    /* Curso concluido: o aprovado entra como formado. */
    ccIndAplicarSituacao(dados, ccCursoConcluido() ? 'Formado' : 'Ativo');
    var snap = await ccRef('individuos').get();
    var existente = null;
    snap.forEach(function (d) {
        var p = d.data() || {};
        if (cpf && String(p.cpf || '').replace(/\D/g, '') === cpf) existente = { id: d.id, dados: p };
    });
    if (existente) {
        var patch = Object.assign({}, existente.dados, dados);
        delete patch._id; delete patch.docKey;
        await ccRef('individuos', existente.id).update(patch);
        return existente.id;
    }
    var ref = await ccRef('individuos').add(dados);
    return ref.id;
}
async function ccPreMudarStatus(id, status) {
    var c = ccPreCandidatos.find(function (x) { return x._id === id; });
    if (!c) return;
    var msg = status === 'Ativo'
        ? 'Aprovar "' + (c.nome || '') + '" e incluir como indivíduo deste curso?'
        : 'Alterar o status de "' + (c.nome || '') + '" para "' + status + '"?';
    if (!confirm(msg)) return;
    try {
        var patch = { status: status, statusAtualizadoEm: new Date().toISOString() };
        if (status === 'Ativo' && !c.individuoId) {
            patch.individuoId = await ccPrePromoverIndividuo(c);
            if (patch.individuoId) patch.promovidoEm = new Date().toISOString();
        }
        await ccRef('preInscricoes', id).update(patch);
        await ccInitPreInscricao();
        await ccLoadIndividuos();
        ccIndRefreshVinculos();
        if (status === 'Ativo') alert('Aprovado e incluído na lista de indivíduos deste curso.');
    } catch (e) { alert('Erro ao alterar status: ' + e.message); }
}
async function ccPreExcluir(id) {
    var c = ccPreCandidatos.find(function (x) { return x._id === id; });
    if (!c || !confirm('Excluir a pré-inscrição de "' + (c.nome || '') + '" deste curso?')) return;
    try { await ccRef('preInscricoes', id).delete(); await ccInitPreInscricao(); }
    catch (e) { alert('Erro ao excluir: ' + e.message); }
}

/* ---------- LINKS DE PRE-INSCRICAO DO CURSO ---------- */
function ccPreAbrirLinks() {
    var box = document.getElementById('cc-pre-link-box');
    if (!box) return;
    ccPreencherSelectTurmas(ccPreProjeto());
    box.style.display = '';
}
async function ccPreGerarLink(modo) {
    var turma = ((document.getElementById('cc-pre-link-turma') || {}).value || '').trim();
    var projeto = ccPreProjeto();
    if (!projeto || !turma) { alert('Selecione o projeto e a turma antes de gerar o link.'); return; }
    var res = document.getElementById('cc-pre-link-resultado');
    if (res) res.innerHTML = '<span style="font-size:12px;color:#7c3aed"><i class="fa-solid fa-spinner fa-spin"></i> Gerando...</span>';
    try {
        var token = 'PL' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        var base = (location.hostname.indexOf('github.io') >= 0 || location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'https://farn-app.web.app' : location.origin;
        var link = base + '/pre-inscricao-via-link.html?v=24&curso=' + encodeURIComponent(ccAtual._id) + '&token=' + token;
        await ccRef('linksPreInscricao', token).set({
            token: token, projeto: projeto, turma: turma, curso: projeto,
            coletivo: modo === 'coletivo', usado: false,
            criadoEm: new Date().toISOString(),
            criadoPor: ccUsuarioAtual(),
            cursoId: ccAtual._id, cursoNome: ccAtual.nome, link: link
        });
        var tipoLabel = modo === 'coletivo' ? 'Link coletivo (várias inscrições)' : 'Link único (1 inscrição)';
        if (res) res.innerHTML = '<div style="padding:12px;border-radius:8px;background:#fff;border:1px solid #ddd6fe">'
            + '<div style="font-size:12px;font-weight:800;color:#6d28d9;margin-bottom:6px"><i class="fa-solid fa-circle-check"></i> Link gerado para ESTE CURSO • ' + tipoLabel + '</div>'
            + '<div style="font-size:11px;color:#475569;margin-bottom:8px">' + ccEsc(projeto) + ' / ' + ccEsc(turma) + '</div>'
            + '<input type="text" id="cc-pre-link-copy" readonly value="' + ccEsc(link) + '" style="width:100%;padding:9px;border-radius:7px;border:1px solid #ddd6fe;font-size:11px;background:#fff;color:#1e293b">'
            + '<button class="btn-primary btn-sm" style="margin-top:8px;background:#16a34a;border-color:#16a34a" onclick="ccPreCopiarLink()"><i class="fa-solid fa-copy"></i> Copiar link</button></div>';
    } catch (e) {
        if (res) res.innerHTML = '<span style="color:#dc2626;font-size:12px">Erro ao gerar link: ' + ccEsc(e.message) + '</span>';
    }
}
function ccPreCopiarLink() {
    var i = document.getElementById('cc-pre-link-copy');
    if (!i) return;
    i.select();
    try { document.execCommand('copy'); alert('Link copiado!'); } catch (e) { alert('Selecione e copie o link manualmente.'); }
}

/* ---------- PLANILHA CSV ---------- */
var CC_PRE_CSV_COLS = ['nome', 'cpf', 'nascimento', 'genero', 'whatsapp', 'email', 'mae', 'cidade', 'estado', 'projeto', 'turma', 'status'];
function ccPreCsvBaixar(nomeArquivo, linhas) {
    var csv = '\uFEFF' + linhas.map(function (l) {
        return l.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
function ccPreBaixarModelo() {
    ccPreCsvBaixar('modelo-pre-inscricao-curso.csv', [CC_PRE_CSV_COLS]);
}
function ccPreExportar() {
    var linhas = [CC_PRE_CSV_COLS];
    ccPreCandidatos.forEach(function (c) {
        linhas.push(CC_PRE_CSV_COLS.map(function (k) { return k === 'projeto' ? (c.projeto || ccPreProjeto()) : k === 'turma' ? (c.turma || ccPreTurma()) : c[k]; }));
    });
    ccPreCsvBaixar('pre-inscritos-curso.csv', linhas);
}
function ccPreParseCsv(texto) {
    var linhas = [], linha = [], campo = '', dentro = false;
    var s = String(texto || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (dentro) {
            if (ch === '"' && s.charAt(i + 1) === '"') { campo += '"'; i++; }
            else if (ch === '"') dentro = false;
            else campo += ch;
        } else if (ch === '"') dentro = true;
        else if (ch === ',') { linha.push(campo); campo = ''; }
        else if (ch === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
        else if (ch !== '\r') campo += ch;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas.filter(function (l) { return l.some(function (c) { return String(c || '').trim() !== ''; }); });
}
async function ccPreImportar(ev) {
    var arquivo = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!arquivo) return;
    var projeto = ccPreProjeto(), turma = ccPreTurma();
    if (!projeto || !turma) { alert('Selecione o projeto e a turma antes de importar.'); ev.target.value = ''; return; }
    var texto = await arquivo.text();
    var linhas = ccPreParseCsv(texto);
    if (linhas.length < 2) { alert('Planilha vazia.'); ev.target.value = ''; return; }
    var cab = linhas[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
    var indice = {};
    CC_PRE_CSV_COLS.forEach(function (k) { indice[k] = cab.indexOf(k); });
    var agora = new Date().toISOString(), gravados = 0;
    try {
        for (var i = 1; i < linhas.length; i++) {
            var l = linhas[i];
            var valor = function (k) { return indice[k] >= 0 ? String(l[indice[k]] || '').trim() : ''; };
            var nome = valor('nome');
            if (!nome) continue;
            await ccRef('preInscricoes').add({
                nome: nome, cpf: valor('cpf').replace(/\D/g, ''),
                nascimento: valor('nascimento'), genero: valor('genero'),
                whatsapp: valor('whatsapp'), email: valor('email'), mae: valor('mae'),
                cidade: valor('cidade'), estado: valor('estado'),
                projeto: projeto, turma: turma, status: valor('status') || 'Pendente',
                statusOriginal: 'Pendente', cursoId: ccAtual._id, cursoNome: ccAtual.nome,
                cadastradoPor: 'Importação de planilha (curso)', criadoEm: agora, id: Date.now() + i
            });
            gravados++;
        }
        await ccInitPreInscricao();
        alert(gravados + ' pré-inscrição(ões) importada(s) para este curso.');
    } catch (e) { alert('Erro ao importar: ' + e.message); }
    ev.target.value = '';
}

function ccSetAba(aba) {
    ccAba = aba;
    if (aba !== 'preinscricao' && ccPreFormaAtiva) ccPreVoltarForm();
    if (aba !== 'individuos' && ccIndFormaAtiva) ccIndVoltarForm();
    ['geral','avaliacao','disciplinas','individuos','projeto','preinscricao','apontamento','ficha','certificado','secaoavaliacao'].forEach(function (a) {
        var el = document.getElementById('cc-tab-' + a);
        if (el) el.style.display = (a === aba) ? '' : 'none';
        var btn = document.getElementById('cc-aba-' + a);
        if (btn) btn.className = (a === aba) ? 'nav-item active' : 'nav-item';
    });
    if (aba === 'geral') ccRenderGeral();
    if (aba === 'avaliacao') ccLoadAvaliacoes();
    if (aba === 'disciplinas') { ccLoadDisciplinas(); ccLoadAulas(); }
    if (aba === 'individuos') ccLoadIndividuos();
    if (aba === 'apontamento') ccInitApontamento();
    if (aba === 'ficha') ccInitFicha();
    if (aba === 'certificado') ccInitCertificados();
    if (aba === 'secaoavaliacao') ccInitAvaliacao();
    if (aba === 'projeto' || aba === 'preinscricao') ccCarregarProjetosTurmas();
}

/* ============ DADOS INTERNOS DO CURSO ============
   Nenhuma funcao abaixo le colecao global do administrador. O seletor de
   "turma" usa somente as turmas criadas dentro deste proprio curso. */
var ccTurmasAdmin = [];
async function ccPopularTurmasAdmin() {
    var sel = document.getElementById('cc-turma-admin');
    if (!sel) return;
    var atual = sel.value, nomes = [];
    (ccTurmasCurso || []).forEach(function (t) { if (t.nome && nomes.indexOf(t.nome) < 0) nomes.push(t.nome); });
    try {
        var snap = await ccRef('preInscricoes').get();
        snap.forEach(function (d) {
            var t = (d.data() || {}).turma;
            if (t && nomes.indexOf(t) < 0) nomes.push(t);
        });
    } catch (e) {}
    nomes.sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });
    ccTurmasAdmin = nomes.map(function (n) { return { nome: n }; });
    sel.innerHTML = '<option value="">Selecione a turma...</option>' + nomes.map(function (n) {
        return '<option value="' + ccEsc(n) + '">' + ccEsc(n) + '</option>';
    }).join('');
    if (atual) sel.value = atual;
}
function ccTurmaOrigem() { return ((document.getElementById('cc-turma-admin') || {}).value || '').trim(); }
function ccExigirTurma() {
    var t = ccTurmaOrigem();
    if (!t) { alert('Selecione a turma deste curso no topo da página.'); return null; }
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

/* Antes estas funcoes copiavam dados das telas do administrador. Agora o
   Cadastro de Cursos e a unica fonte: elas apenas consolidam o que ja esta
   nas subcolecoes do curso dentro do snapshot da Ficha do Curso. */
async function ccImportarFicha() {
    var n = await ccSincronizarFicha(true);
    ccLoadIndividuos(); ccInitFicha();
    alert(n + ' indivíduo(s) sincronizado(s) com a Ficha do Curso.');
}
async function ccImportarApontamentos() {
    await ccSincronizarFicha(true);
    ccCarregarHistorico(); ccLoadAulas();
    alert('Apontamentos e presenças deste curso vinculados à Ficha do Curso.');
}
async function ccImportarDisciplinasAulas() {
    ccLoadDisciplinas(); ccLoadAulas();
    alert('Disciplinas e aulas são gerenciadas dentro deste curso. Nada a importar do administrador.');
}
async function ccImportarAvaliacoes() {
    await ccSincronizarFicha(true);
    ccLoadAvaliacoes();
    alert('Avaliações e respostas deste curso sincronizadas com a Ficha do Curso.');
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
function ccTipoAvRotulo(tipo) {
    return ({ teorica: 'AV Teórica', pratica: 'AV Prática',
        final_teorica: 'AV Final Teórica', final_pratica: 'AV Final Prática' })[tipo] || (tipo || 'AV');
}
function ccCartaoAv(a) {
    return '<div style="border:1px solid #e2e8f0;border-radius:9px;padding:10px;background:#fff;margin-bottom:8px">'
        + '<div style="font-weight:700;color:#0f172a;font-size:12px;line-height:1.3">' + ccEsc(a.nome) + '</div>'
        + '<div style="font-size:10px;color:#64748b;margin:5px 0 8px">' + ccQtdQuestoes(a) + ' questão(ões)'
        + (a.ativa ? ' • <span style="color:#16a34a;font-weight:800">ATIVA</span>' : '')
        + (a.enviada ? ' • <span style="color:#2563eb;font-weight:800">ENVIADA</span>' : '')
        + (a.recuperacaoEm ? ' • <span style="color:#ca8a04;font-weight:800">RECUPERAÇÃO' + (a.recuperacaoParada ? ' PARADA' : '') + '</span>' : '')
        + (a.embaralhamentos ? ' • <span style="color:#7c3aed">embaralhada x' + a.embaralhamentos + '</span>' : '')
        + '</div>'
        + '<div style="display:flex;gap:5px;flex-wrap:wrap">'
        + '<button class="btn-outline btn-sm" onclick="ccEditarAv(\'' + a._id + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button>'
        + '<button class="btn-outline btn-sm" onclick="ccEnviarAv(\'' + a._id + '\')" title="Enviar"><i class="fa-solid fa-paper-plane"></i> Enviar</button>'
        + '<button class="btn-outline btn-sm" onclick="ccAbrirRecuperacao(\'' + a._id + '\')" title="Recuperação">Recuperação</button>'
        + '<button class="btn-outline btn-sm" onclick="ccEmbaralharAv(\'' + a._id + '\')" title="Embaralhar"><i class="fa-solid fa-shuffle"></i></button>'
        + '<button class="btn-outline btn-sm" onclick="ccVerAvaliados(\'' + a._id + '\')"><i class="fa-solid fa-users"></i> Avaliados</button>'
        + '<button class="btn-outline btn-sm" onclick="ccImprimirAv(\'' + a._id + '\')" title="Imprimir"><i class="fa-solid fa-print"></i></button>'
        + '<button class="btn-outline btn-sm" onclick="ccAlternarAv(\'' + a._id + '\',' + (a.ativa ? 'false' : 'true') + ')">' + (a.ativa ? 'Desativar' : 'Ativar') + '</button>'
        + '<button class="btn-danger btn-sm" onclick="ccExcluirAv(\'' + a._id + '\')" title="Excluir"><i class="fa-solid fa-trash"></i></button>'
        + '</div></div>';
}
function ccQuadroAv(cfg) {
    var botoes = cfg.botoes.map(function (b) {
        return '<button class="btn-primary btn-sm" onclick="ccNovaAv(\'' + b.tipo + '\')"><i class="fa-solid fa-plus" style="margin-right:4px"></i>' + b.rotulo + '</button>';
    }).join('');
    return '<div style="border:1px solid #e2e8f0;border-top:4px solid ' + cfg.cor + ';border-radius:11px;background:#f8fafc;overflow:hidden">'
        + '<div style="padding:12px 13px;background:#fff;border-bottom:1px solid #e2e8f0">'
        + '<div style="display:flex;align-items:center;gap:8px"><i class="fa-solid ' + cfg.icone + '" style="color:' + cfg.cor + '"></i>'
        + '<h4 style="margin:0;font-size:13px;color:#0f172a;flex:1">' + cfg.titulo + '</h4>'
        + '<span style="font-size:10px;font-weight:800;color:#64748b;background:#e2e8f0;border-radius:10px;padding:2px 8px">' + cfg.lista.length + '</span></div>'
        + '<p style="font-size:10px;color:#94a3b8;margin:5px 0 9px">' + cfg.subtitulo + '</p>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + botoes + '</div></div>'
        + '<div style="padding:11px">' + (cfg.lista.length
            ? cfg.lista.map(ccCartaoAv).join('')
            : '<div style="font-size:11px;color:#94a3b8;text-align:center;padding:18px 6px">Nenhuma avaliação neste quadro.</div>')
        + '</div></div>';
}
async function ccLoadAvaliacoes() {
    var box = document.getElementById('cc-avaliacoes-lista');
    if (!box || !ccAtual) return;
    box.innerHTML = '<p style="color:#64748b">Carregando avaliações...</p>';
    try {
        var snap = await ccRef('avaliacoes').orderBy('criadoEm', 'desc').get();
        ccAvsCache = [];
        snap.forEach(function (d) { ccAvsCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        var teorica = ccAvsCache.filter(function (a) { return String(a.tipo || 'teorica') === 'teorica'; });
        var pratica = ccAvsCache.filter(function (a) { return String(a.tipo || '') === 'pratica'; });
        var final = ccAvsCache.filter(function (a) { return String(a.tipo || '').indexOf('final') === 0; });
        var outros = ccAvsCache.filter(function (a) {
            var t = String(a.tipo || 'teorica');
            return t !== 'teorica' && t !== 'pratica' && t.indexOf('final') !== 0;
        });
        teorica = teorica.concat(outros);
        box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px;align-items:start">'
            + ccQuadroAv({ titulo:'AV Teórica', subtitulo:'Avaliações teóricas por disciplina/aula', cor:'#2563eb', icone:'fa-brain',
                lista:teorica, botoes:[{ tipo:'teorica', rotulo:'Nova AV Teórica' }] })
            + ccQuadroAv({ titulo:'AV Prática', subtitulo:'Avaliações práticas por disciplina/aula', cor:'#16a34a', icone:'fa-hands',
                lista:pratica, botoes:[{ tipo:'pratica', rotulo:'Nova AV Prática' }] })
            + ccQuadroAv({ titulo:'AV Final Teórica / Prática', subtitulo:'Provas finais que compõem o FIN', cor:'#7c3aed', icone:'fa-award',
                lista:final, botoes:[{ tipo:'final_teorica', rotulo:'Final Teórica' }, { tipo:'final_pratica', rotulo:'Final Prática' }] })
            + '</div>';
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">Erro: ' + ccEsc(e.message) + '</p>'; }
}

function ccQtdQuestoes(a) { return (a.questoes || []).length; }

function ccNovaAv(tipo) { ccAbrirFormAv(null, tipo || 'teorica'); }

function ccAbrirFormAv(id, tipoPadrao) {
    ccEditandoAvId = id || null;
    var av = id ? ccAvsCache.find(function (a) { return a._id === id; }) : null;
    var nome = document.getElementById('cc-av-nome'); if (nome) nome.value = av ? (av.nome || '') : '';
    var tipo = document.getElementById('cc-av-tipo'); if (tipo) tipo.value = av ? (av.tipo || 'teorica') : (tipoPadrao || 'teorica');
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
        /* Enviar == liberar para resposta no Portal do Aluno. */
        await ccRef('avaliacoes', id).update({
            enviada: true, enviadaEm: new Date().toISOString(),
            ativa: true, ativadaEm: new Date().toISOString(),
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
var ccEditandoAulaId = null;
async function ccLoadDisciplinas() {
    var box = document.getElementById('cc-disc-lista'); if (!box || !ccAtual) return;
    await ccCarregarSelectDocentes();
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
                docenteId: ccDocenteIdDoSelect('cc-disc-docente'),
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
    await ccCarregarSelectDocentes();
    try {
        var snap = await ccRef('aulas').orderBy('data', 'desc').get();
        ccAulasCache = []; snap.forEach(function (d) { ccAulasCache.push(Object.assign({ _id: d.id }, d.data() || {})); });
        box.innerHTML = ccAulasCache.length ? ccAulasCache.map(function (a) {
            var id = ccEsc(a._id);
            return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:9px;margin-bottom:6px;background:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
                + '<div style="flex:1;min-width:200px">'
                + '<b style="font-size:13px;color:#0f172a">' + ccEsc(a.conteudo || a.disciplina) + '</b><br>'
                + '<span style="font-size:11px;color:#64748b">' + ccEsc(a.data || '') + ' ' + ccEsc(a.horario || '') + '</span>'
                + (a.docente ? ' · <span style="font-size:10px;color:#64748b">Docente: ' + ccEsc(a.docente) + '</span>' : '')
                + (a.enviadoApontamentoAdm ? '<br><span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:8px">Enviada ao Apontamento ADM</span>' : '')
                + (a.apontada ? ' <span style="font-size:9px;background:#dbeafe;color:#1d4ed8;padding:2px 6px;border-radius:8px">Apontada</span>' : '')
                + '</div>'
                + '<div class="actions-cell" style="display:flex;gap:5px;flex-wrap:wrap">'
                + '<button class="btn-icon" title="Editar aula" onclick="ccEditarAula(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-outline btn-sm" title="Enviar/atualizar no Apontamento ADM" onclick="ccEnviarAulaApontamento(\'' + id + '\')"><i class="fa-solid fa-paper-plane"></i> ADM</button>'
                + '<button class="btn-icon" title="QR de início" onclick="ccQrInicio(\'' + id + '\')"><i class="fa-solid fa-qrcode"></i></button>'
                + '<button class="btn-icon btn-danger-icon" title="Excluir aula" onclick="ccExcluirAula(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>'
                + '</div></div>';
        }).join('') : '<p style="color:#94a3b8;font-size:12px">Nenhuma aula cadastrada.</p>';
        var sa = document.getElementById('cc-av-aula');
        if (sa) sa.innerHTML = '<option value="">Selecione...</option>' + ccAulasCache.map(function (a) { return '<option value="' + ccEsc(a.conteudo) + '">' + ccEsc(a.conteudo || '') + '</option>'; }).join('');
        var spa = document.getElementById('cc-apt-aula');
        if (spa) spa.innerHTML = '<option value="">Selecione a aula...</option>' + ccAulasCache.map(function (a) { return '<option value="' + a._id + '">' + ccEsc((a.data || '') + ' - ' + (a.conteudo || '')) + '</option>'; }).join('');
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
/* A aula cadastrada para um docente e enviada para a colecao
   apontamentosAdm como pendente. O registro usa um id previsivel
   (aula-<id>) para atualizar a mesma aula nas edicoes e nao duplicar. */
async function ccEnviarAulaParaApontamento(aula, aulaId) {
    if (!ccDb() || !aulaId) return;
    var docenteId = String(aula.docenteId || '');
    var docenteNome = String(aula.docente || '');
    var docenteCpf = '', docenteMatricula = '';
    var info = (ccDocentesSelectCache || []).find(function (x) {
        return (docenteId && String(x.id) === docenteId) || (!docenteId && String(x.nome) === docenteNome);
    });
    if (info) {
        docenteNome = info.nome || docenteNome;
        docenteMatricula = info.matricula || '';
        docenteCpf = info.cpf || '';
    }
    var agora = new Date().toISOString();
    var docId = 'aula-' + String(aulaId).replace(/[^A-Za-z0-9_-]/g, '_');
    var ref = ccDb().collection('apontamentosAdm').doc(docId);
    var snap = await ref.get();
    var atual = snap && snap.exists ? (snap.data() || {}) : null;
    var dados = {
        origem: 'aula-cadastro-cursos',
        status: (atual && atual.apontadoEm) ? 'Apontado' : 'Pendente',
        apontado: !!(atual && atual.apontadoEm),
        docenteId: docenteId,
        docenteNome: docenteNome,
        docenteCpf: docenteCpf,
        docenteMatricula: docenteMatricula,
        cursoId: String(aula.cursoId || (ccAtual && ccAtual._id) || ''),
        cursoNome: String(aula.cursoNome || (ccAtual && ccAtual.nome) || ''),
        disciplina: String(aula.disciplina || ''),
        aulaId: String(aulaId),
        aulaVinculada: true,
        aula: String(aula.conteudo || ''),
        dataAula: String(aula.data || ''),
        horaAula: String(aula.horario || ''),
        avTeorica: aula.avTeorica || '',
        avPratica: aula.avPratica || '',
        enviadoEm: agora,
        enviadoPor: ccUsuarioAtual(),
        atualizadoEm: agora,
        aulaExcluida: false
    };
    if (!atual) {
        dados.criadoEm = agora;
        dados.criadoPor = ccUsuarioAtual();
        dados.apontadoEm = null;
        dados.presencaDocente = null;
        dados.localizacao = null;
        dados.localizacaoStatus = 'indisponivel';
        dados.qrCode = '';
        dados.qrAula = null;
    }
    await ref.set(dados, { merge: true });
    /* Marca na aula que a sincronizacao aconteceu (nao grava nada dentro de
       apontamentosAdm alem do proprio registro de apontamento). */
    try { await ccRef('aulas', aulaId).update({ enviadoApontamentoAdm: true, apontamentoId: docId }); }
    catch (e) { console.warn('ccEnviarAulaParaApontamento: marcação na aula falhou', e); }
}

async function ccEnviarAulaApontamento(id) {
    var a = ccAulasCache.find(function (x) { return x._id === id; });
    if (!a) { alert('Aula não encontrada.'); return; }
    try {
        await ccEnviarAulaParaApontamento(a, a._id);
        await ccLoadAulas();
        alert('Aula "' + (a.conteudo || a.data || '') + '" enviada/atualizada no Apontamento ADM, vinculada ao docente ' + (a.docente || 'não informado') + '.');
    } catch (e) { alert('Erro ao enviar aula para o Apontamento ADM: ' + (e && e.message ? e.message : e)); }
}

function ccLimparFormAula() {
    ccEditandoAulaId = null;
    ['cc-aula-disciplina','cc-aula-docente','cc-aula-data','cc-aula-horario','cc-aula-conteudo','cc-aula-av-teorica','cc-aula-av-pratica'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    var btn = document.getElementById('cc-aula-salvar');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> Cadastrar aula';
    var cancelar = document.getElementById('cc-aula-cancelar');
    if (cancelar) cancelar.style.display = 'none';
}
function ccCancelarEdicaoAula() { ccLimparFormAula(); }

async function ccEditarAula(id) {
    var a = ccAulasCache.find(function (x) { return x._id === id; });
    if (!a) return;
    await ccCarregarSelectDocentes();
    var disc = document.getElementById('cc-aula-disciplina');
    if (disc && a.disciplina && !Array.prototype.some.call(disc.options, function (o) { return o.value === a.disciplina; })) {
        disc.insertBefore(new Option(a.disciplina, a.disciplina), disc.options[1] || null);
    }
    var doc = document.getElementById('cc-aula-docente');
    if (doc && a.docente && !Array.prototype.some.call(doc.options, function (o) { return o.value === a.docente; })) {
        var op = new Option(a.docente + (a.docenteId ? ' (docente do cadastro)' : ''), a.docente);
        if (a.docenteId) op.setAttribute('data-id', a.docenteId);
        doc.insertBefore(op, doc.options[1] || null);
    }
    function set(id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }
    set('cc-aula-disciplina', a.disciplina || '');
    set('cc-aula-docente', a.docente || '');
    set('cc-aula-data', a.data || '');
    set('cc-aula-horario', a.horario || '');
    set('cc-aula-conteudo', a.conteudo || '');
    set('cc-aula-av-teorica', a.avTeorica || '');
    set('cc-aula-av-pratica', a.avPratica || '');
    ccEditandoAulaId = a._id;
    var btn = document.getElementById('cc-aula-salvar');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Atualizar aula';
    var cancelar = document.getElementById('cc-aula-cancelar');
    if (cancelar) cancelar.style.display = '';
    var alvo = document.getElementById('cc-aula-disciplina');
    if (alvo && typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function ccSalvarAula() {
    var disc = ((document.getElementById('cc-aula-disciplina') || {}).value || '').trim();
    var data = ((document.getElementById('cc-aula-data') || {}).value || '').trim();
    if (!disc || !data) { alert('Informe disciplina e data da aula.'); return; }
    var eraEdicao = !!ccEditandoAulaId;
    var agora = new Date().toISOString();
    var dados = {
        disciplina: disc,
        docente: ((document.getElementById('cc-aula-docente') || {}).value || '').trim(),
        docenteId: ccDocenteIdDoSelect('cc-aula-docente'),
        data: data,
        horario: ((document.getElementById('cc-aula-horario') || {}).value || '').trim(),
        conteudo: ((document.getElementById('cc-aula-conteudo') || {}).value || '').trim(),
        avTeorica: ((document.getElementById('cc-aula-av-teorica') || {}).value || ''),
        avPratica: ((document.getElementById('cc-aula-av-pratica') || {}).value || ''),
        atualizadoEm: agora
    };
    if (ccAtual && ccAtual._id) { dados.cursoId = ccAtual._id; dados.cursoNome = ccAtual.nome || ''; }
    try {
        var aulaId = ccEditandoAulaId;
        if (aulaId) await ccRef('aulas', aulaId).update(dados);
        else { dados.criadoEm = agora; var ref = await ccRef('aulas').add(dados); aulaId = ref.id; }
        await ccEnviarAulaParaApontamento(Object.assign({ _id: aulaId }, dados), aulaId);
        ccLimparFormAula();
        await ccLoadAulas();
        alert(eraEdicao ? 'Aula atualizada e reenviada ao Apontamento ADM.' : 'Aula cadastrada e enviada ao Apontamento ADM.');
    } catch (e) { alert('Erro ao salvar aula: ' + (e && e.message ? e.message : e)); }
}

async function ccExcluirAula(id) {
    if (!confirm('Excluir aula? O apontamento pendente no Apontamento ADM também será removido.')) return;
    try {
        var docId = 'aula-' + String(id).replace(/[^A-Za-z0-9_-]/g, '_');
        var ref = ccDb().collection('apontamentosAdm').doc(docId);
        var snap = await ref.get();
        if (snap && snap.exists) {
            var reg = snap.data() || {};
            if (!reg.apontadoEm) await ref.delete();
            else await ref.update({ aulaExcluida: true, atualizadoEm: new Date().toISOString() });
        }
        await ccRef('aulas', id).delete();
        await ccLoadAulas();
    } catch (e) { alert('Erro ao excluir aula: ' + (e && e.message ? e.message : e)); }
}

function ccQrInicio(aulaId) {
    var aula = ccAulasCache.find(function (a) { return a._id === aulaId; });
    var texto = 'FARN-INICIO:' + aulaId;
    var url = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(texto) + '&size=220x220&margin=2';
    var tit = document.getElementById('cc-generico-titulo'); var body = document.getElementById('cc-generico-body'); var m = document.getElementById('cc-modal-generico');
    if (tit) tit.textContent = 'QR de início da aula';
    if (body) body.innerHTML = '<div style="text-align:center"><img src="' + url + '" alt="QR"><p style="font-size:12px;color:#475569;margin-top:10px">' + ccEsc(aula ? (aula.conteudo || aula.data) : '') + '</p><p style="font-size:11px;color:#94a3b8">Conteúdo: ' + ccEsc(texto) + '</p></div>';
    if (m) m.classList.remove('hidden');
}

/* ============ ABA INDIVIDUOS (LISTA ISOLADA DO CURSO) ============
   Fonte unica: cursosCadastro/{id}/individuos.
   - Os novos entram pela aprovacao na guia Pre-Inscricao.
   - Quem ja estava cadastrado fica no curso, desvinculado do admin.
   - Esta mesma lista alimenta Ficha, Secao de Avaliacao e Apontamento. */
var ccIndividuosCache = [];
var ccIndStatusFiltro = '';

var CC_SITUACOES_INDIVIDUO = [
    { chave: 'Ativo',             rotulo: 'ALUNO ATIVO',       cor: '#dcfce7', texto: '#166534' },
    { chave: 'Inativo por Falta', rotulo: 'INATIVO POR FALTA', cor: '#fef3c7', texto: '#92400e' },
    { chave: 'Pediu Baixa',       rotulo: 'PEDIU BAIXA',       cor: '#fee2e2', texto: '#991b1b' },
    { chave: 'Rebaixado',         rotulo: 'REBAIXADO',         cor: '#ede9fe', texto: '#5b21b6' },
    { chave: 'Formado',           rotulo: 'FORMADO',           cor: '#dbeafe', texto: '#1e40af' }
];
function ccCursoConcluido() {
    if (!ccAtual) return false;
    var s = String(ccAtual.status || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return s === 'CONCLUIDO';
}
function ccPerfilIndividuos() {
    return ccCursoConcluido()
        ? { chave: 'formado', lista: 'Formados do curso', selo: 'CONCLUÍDO', cor: '#eff6ff', corTexto: '#1d4ed8' }
        : { chave: 'ativo', lista: 'Indivíduos do curso', selo: 'EM ANDAMENTO', cor: '#dcfce7', corTexto: '#166534' };
}
/* Situacao de cada pessoa, com compatibilidade para cadastros antigos. */
function ccIndSituacao(c) {
    if (c && c.situacaoCurso) {
        var atual = CC_SITUACOES_INDIVIDUO.find(function (s) { return s.chave === c.situacaoCurso; });
        if (atual) return atual;
    }
    if (c && c.pediuBaixa) return CC_SITUACOES_INDIVIDUO[2];
    if (c && String(c.statusOriginal || '') === 'Inativo por Falta') return CC_SITUACOES_INDIVIDUO[1];
    if (c && (c.rebaixado || c.status === 'Rebaixado')) return CC_SITUACOES_INDIVIDUO[3];
    if (c && ((c.tipoPessoa || 'A') === 'F' || c.status === 'Formado')) return CC_SITUACOES_INDIVIDUO[4];
    return CC_SITUACOES_INDIVIDUO[0];
}
/* Aplica a situacao escolhida sem mexer em nenhum cadastro do administrador. */
function ccIndAplicarSituacao(d, chave) {
    d.situacaoCurso = chave;
    var agora = new Date().toISOString();
    if (chave === 'Formado') {
        d.tipoPessoa = 'F';
        d.status = 'Formado';
        d.statusOriginal = 'Ativo';
        d.rebaixado = false;
        d.pediuBaixa = false;
        d.inativoPorFaltaEm = '';
        d.formadoEm = d.formadoEm || agora;
        d.formadoProjeto = d.formadoProjeto || d.projeto || '';
        d.formadoTurma = d.formadoTurma || d.turma || '';
        d.credencial = d.credencial || d.matricula || '';
    } else {
        d.tipoPessoa = 'A';
        d.status = 'Acadêmico';
        d.rebaixado = (chave === 'Rebaixado');
        d.pediuBaixa = (chave === 'Pediu Baixa');
        d.inativoPorFaltaEm = (chave === 'Inativo por Falta') ? (d.inativoPorFaltaEm || agora) : '';
        d.pediuBaixaEm = (chave === 'Pediu Baixa') ? (d.pediuBaixaEm || agora) : '';
        d.rebaixadoEm = (chave === 'Rebaixado') ? (d.rebaixadoEm || agora) : '';
        d.statusOriginal = (chave === 'Ativo') ? 'Ativo' : chave;
        if (!d.matricula) d.matricula = ccMatriculaGerar(d.cpf);
    }
    return d;
}
function ccAtualizarRotulosIndividuos() {
    var p = ccPerfilIndividuos();
    var tit = document.getElementById('cc-individuos-lista-titulo');
    if (tit) tit.textContent = p.lista;
    var dica = document.getElementById('cc-individuos-dica');
    if (dica) dica.innerHTML = 'Os novos indivíduos vêm da aprovação na guia <b>Pré-Inscrição</b>. Quem já estava cadastrado permanece aqui, desvinculado do administrador e vinculado a todas as guias deste curso.';
    var selo = document.getElementById('cc-individuos-perfil');
    if (selo) {
        selo.textContent = p.selo;
        selo.style.background = p.cor;
        selo.style.color = p.corTexto;
    }
}
/* Guias de status acima da lista: cada guia mostra quantos indivíduos
   estao naquela situacao e filtra a tabela ao ser clicada. */
function ccRenderStatusGuias() {
    var box = document.getElementById('cc-ind-status-guias');
    if (!box) return;
    var contagens = {};
    ccIndividuosCache.forEach(function (p) {
        var k = ccIndSituacao(p).chave;
        contagens[k] = (contagens[k] || 0) + 1;
    });
    function guia(chave, rotulo, cor, texto, total, ativa) {
        var valor = chave ? "'" + ccEsc(chave) + "'" : "''";
        var fundo = ativa ? cor : '#f8fafc';
        var corTexto = ativa ? texto : '#475569';
        var borda = ativa ? texto : '#e2e8f0';
        return '<button type="button" onclick="ccIndFiltrarStatus(' + valor + ')" '
            + 'style="display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:8px;'
            + 'border:1px solid ' + borda + ';background:' + fundo + ';color:' + corTexto + ';'
            + 'font-size:10px;font-weight:800;cursor:pointer">'
            + ccEsc(rotulo) + '<b style="font-size:10px;opacity:.8">(' + total + ')</b></button>';
    }
    var html = guia('', 'TODOS', '#e2e8f0', '#334155', ccIndividuosCache.length, !ccIndStatusFiltro);
    CC_SITUACOES_INDIVIDUO.forEach(function (s) {
        html += guia(s.chave, s.rotulo, s.cor, s.texto, contagens[s.chave] || 0, ccIndStatusFiltro === s.chave);
    });
    box.innerHTML = html;
}
function ccIndFiltrarStatus(chave) {
    ccIndStatusFiltro = chave || '';
    ccRenderIndividuos();
}
function ccIndPorId(id) {
    return ccIndividuosCache.find(function (p) { return p._id === id; }) || null;
}
function ccIndPorCpf(cpf) {
    var dig = String(cpf || '').replace(/\D/g, '');
    if (!dig) return null;
    return ccIndividuosCache.find(function (p) { return String(p.cpf || '').replace(/\D/g, '') === dig; }) || null;
}
/* Cache primeiro; se a guia ainda estiver carregando, le direto do curso. */
async function ccIndBuscar(id) {
    var p = ccIndPorId(id);
    if (p) return p;
    if (!ccDb() || !ccAtual || !id) return null;
    try {
        var d = await ccRef('individuos', id).get();
        if (!d.exists) return null;
        return Object.assign({ _id: d.id }, d.data() || {});
    } catch (e) { return null; }
}

/* ---------- CURSOS QUE O INDIVIDUO PARTICIPA ----------
   Guardamos os IDs (fonte unica) e os nomes (para exibicao e cadastros
   antigos). Aceita tambem lista de nomes, usada antes deste campo existir. */
function ccParticipaIds(p) {
    var raw = p && (p.cursosParticipaIds || p.cursosParticipa);
    var ids = [];
    function add(txt) {
        var v = String(txt == null ? '' : txt).trim();
        if (!v) return;
        var achado = (ccCursos || []).find(function (c) {
            return String(c._id) === v || String(c.nome || '') === v;
        });
        var id = achado ? String(achado._id) : v;
        if (ids.indexOf(id) < 0) ids.push(id);
    }
    if (Array.isArray(raw)) {
        raw.forEach(function (item) {
            if (item && typeof item === 'object') add(item.id || item._id || item.cursoId);
            else add(item);
        });
    } else if (typeof raw === 'string') {
        raw.split(/[;,]/).forEach(add);
    }
    var atual = (ccAtual || {})._id;
    if (atual && ids.indexOf(String(atual)) < 0) ids.push(String(atual));
    return ids;
}
function ccParticipaNomes(ids) {
    return (ids || []).map(function (id) {
        var c = (ccCursos || []).find(function (x) { return String(x._id) === String(id); });
        return c ? String(c.nome || '') : String(id || '');
    }).filter(Boolean);
}

async function ccLoadIndividuos() {
    if (!ccAtual || !ccDb()) return;
    ccAtualizarRotulosIndividuos();
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
        ccIndividuosCache.sort(function (a, b) {
            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
        });
        ccRenderIndividuos();
    } catch (e) {
        var tb = document.getElementById('cc-individuos-tbody');
        if (tb) tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#dc2626;padding:24px">Erro ao carregar: ' + ccEsc(e.message) + '</td></tr>';
    }
}
function ccRenderIndividuos() {
    var tb = document.getElementById('cc-individuos-tbody'); if (!tb) return;
    ccAtualizarRotulosIndividuos();
    ccRenderStatusGuias();
    var busca = String(((document.getElementById('cc-ind-busca') || {}).value || ''))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    var lista = ccIndividuosCache.filter(function (p) {
        if (ccIndStatusFiltro && ccIndSituacao(p).chave !== ccIndStatusFiltro) return false;
        if (!busca) return true;
        var campos = [p.nome, p.cpf, p.matricula, p.projeto, p.turma]
            .concat(ccParticipaNomes(ccParticipaIds(p)));
        return campos.some(function (v) {
            return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().indexOf(busca) >= 0;
        });
    });
    var cnt = document.getElementById('cc-individuos-count');
    if (cnt) cnt.textContent = (busca || ccIndStatusFiltro)
        ? lista.length + '/' + ccIndividuosCache.length
        : String(ccIndividuosCache.length);
    if (!lista.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px">'
            + (ccIndStatusFiltro ? 'Nenhum indivíduo nesta guia de status.'
                : (ccIndividuosCache.length ? 'Nenhum indivíduo corresponde à busca.'
                    : 'Nenhum indivíduo neste curso. Aprove os pré-inscritos na guia Pré-Inscrição.'))
            + '</td></tr>';
        return;
    }
    tb.innerHTML = lista.map(function (p) {
        var sit = ccIndSituacao(p);
        var opcoes = CC_SITUACOES_INDIVIDUO.map(function (s) {
            return '<option value="' + ccEsc(s.chave) + '"' + (s.chave === sit.chave ? ' selected' : '') + '>' + s.rotulo + '</option>';
        }).join('');
        var cpfFmt = ccFormatCPF(p.cpf) || '-';
        var nomesCursos = ccParticipaNomes(ccParticipaIds(p));
        var cursosTxt = nomesCursos.length ? nomesCursos.join(' • ') : '-';
        return '<tr style="border-bottom:1px solid #f1f5f9">'
            + '<td style="padding:8px"><b>' + ccEsc(p.nome || '-') + '</b>'
            + (p.origem === 'pre-inscricao' ? '<div style="font-size:9px;color:#16a34a">via Pré-Inscrição</div>' : '') + '</td>'
            + '<td style="padding:8px;color:#475569">' + ccEsc(cpfFmt) + '</td>'
            + '<td style="padding:8px;color:#ea580c;font-weight:600">' + ccEsc(p.matricula || p.credencial || '-') + '</td>'
            + '<td style="padding:8px;color:#475569">' + ccEsc(p.projeto || '-') + '</td>'
            + '<td style="padding:8px;color:#475569">' + ccEsc(p.turma || '-') + '</td>'
            + '<td style="padding:8px;color:#475569;max-width:240px;font-size:11px" title="' + ccEsc(cursosTxt) + '">' + ccEsc(cursosTxt) + '</td>'
            + '<td style="padding:8px"><select class="config-input" style="padding:4px 6px;font-size:10px;font-weight:800;background:' + sit.cor + ';color:' + sit.texto + ';border:1px solid ' + sit.cor + ';border-radius:8px" onchange="ccIndividuoMudarStatus(\'' + p._id + '\',this.value)">' + opcoes + '</select></td>'
            + '<td style="padding:8px"><div class="actions-cell" style="flex-wrap:wrap">'
            + '<button class="btn-outline btn-sm" title="Enviar cópia deste indivíduo para outros cursos" style="font-size:10px;padding:5px 8px;white-space:nowrap" onclick="ccIndAbrirEnviar(\'' + p._id + '\')"><i class="fa-solid fa-paper-plane" style="margin-right:4px"></i> Enviar indivíduo</button>'
            + '<button class="btn-icon" title="Editar" onclick="ccIndEditar(\'' + p._id + '\')"><i class="fa-solid fa-pen"></i></button>'
            + '<button class="btn-icon" title="Imprimir" onclick="ccIndImprimir(\'' + p._id + '\')"><i class="fa-solid fa-print"></i></button>'
            + '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="ccIndExcluir(\'' + p._id + '\')"><i class="fa-solid fa-trash"></i></button>'
            + '</div></td></tr>';
    }).join('');
}
async function ccIndividuoMudarStatus(id, chave) {
    var p = await ccIndBuscar(id); if (!p) return;
    if (!CC_SITUACOES_INDIVIDUO.some(function (s) { return s.chave === chave; })) return;
    if (!confirm('Alterar o status de "' + (p.nome || '') + '" para ' + chave.toUpperCase() + '?')) { ccRenderIndividuos(); return; }
    try {
        var patch = ccIndAplicarSituacao(Object.assign({}, p), chave);
        patch.statusAtualizadoEm = new Date().toISOString();
        await ccRef('individuos', id).update(patch);
        await ccLoadIndividuos();
        ccIndRefreshVinculos();
        alert('Status alterado para ' + chave.toUpperCase() + '.');
    } catch (e) { alert('Erro ao alterar status: ' + e.message); ccRenderIndividuos(); }
}
/* A lista e a fonte unica: depois de qualquer alteracao, avisa as guias que
   tambem consomem cursosCadastro/{id}/individuos. */
function ccIndRefreshVinculos() {
    if (ccAba === 'ficha' && typeof ccInitFicha === 'function') ccInitFicha();
    if (ccAba === 'secaoavaliacao' && typeof ccInitAvaliacao === 'function') ccInitAvaliacao();
    if (ccAba === 'apontamento') {
        ccAptAlunos = ccAptCarregarIndividuos();
        if (typeof ccRenderAptLista === 'function') ccRenderAptLista();
    }
}
async function ccIndExcluir(id) {
    var p = await ccIndBuscar(id); if (!p) return;
    if (!confirm('Excluir "' + (p.nome || '') + '" deste curso?\n\nOs dados das outras guias deste curso que usam CPF também serão afetados.')) return;
    try {
        await ccRef('individuos', id).delete();
        var cpfs = [];
        try {
            var aux = await ccRef('fichaAvaliacoes').get();
            aux.forEach(function (d) { if (String((d.data() || {}).cpf) === String(p.cpf)) cpfs.push(d.id); });
        } catch (e) {}
        for (var i = 0; i < cpfs.length; i++) { try { await ccRef('fichaAvaliacoes', cpfs[i]).delete(); } catch (e) {} }
        await ccLoadIndividuos();
        ccIndRefreshVinculos();
    } catch (e) { alert('Erro ao excluir: ' + e.message); }
}

/* ---------- ENVIAR COPIA DO INDIVIDUO PARA OUTROS CURSOS ----------
   A pessoa continua no curso de origem; o envio apenas grava uma copia
   do cadastro nos cursos marcados e atualiza o campo de participacao. */
function ccIndAbrirEnviar(id) {
    var p = ccIndPorId(id);
    if (!p) { alert('Indivíduo não encontrado.'); return; }
    var cursos = (ccCursos || []).slice().sort(function (a, b) {
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
    var tit = document.getElementById('cc-generico-titulo');
    var body = document.getElementById('cc-generico-body');
    var m = document.getElementById('cc-modal-generico');
    if (!tit || !body || !m) { alert('Janela de envio indisponível.'); return; }
    var jaParticipa = ccParticipaIds(p);
    var linhas = cursos.map(function (c) {
        var cid = String(c._id);
        var atual = cid === String((ccAtual || {})._id);
        var concluido = String(c.status || '') === 'Concluido';
        var vinculado = jaParticipa.indexOf(cid) >= 0;
        return '<label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid ' + (atual ? '#cbd5e1' : '#e2e8f0') + ';border-radius:9px;margin-bottom:6px;cursor:' + (atual ? 'not-allowed' : 'pointer') + ';background:' + (atual ? '#f8fafc' : '#fff') + '">'
            + '<input type="checkbox" class="cc-enviar-curso" value="' + ccEsc(cid) + '" style="width:16px;height:16px"' + (atual ? ' disabled' : '') + '>'
            + '<span style="flex:1;font-weight:700;color:' + (atual ? '#94a3b8' : '#0f172a') + '">' + ccEsc(c.nome || 'Curso') + '</span>'
            + (atual ? '<span style="font-size:9px;font-weight:800;color:#475569;background:#e2e8f0;padding:2px 7px;border-radius:8px">CURSO ATUAL</span>' : '')
            + (concluido ? '<span style="font-size:9px;font-weight:800;color:#1d4ed8;background:#dbeafe;padding:2px 7px;border-radius:8px">CONCLUÍDO</span>' : '')
            + (!atual && vinculado ? '<span style="font-size:9px;font-weight:800;color:#166534;background:#dcfce7;padding:2px 7px;border-radius:8px">JÁ PARTICIPA</span>' : '')
            + '</label>';
    }).join('');
    tit.textContent = 'Enviar indivíduo — ' + (p.nome || '');
    body.innerHTML = '<p style="font-size:12px;color:#475569;margin-bottom:12px">'
        + 'Selecione os cursos que receberão uma <b>cópia</b> do cadastro de <b>' + ccEsc(p.nome || '') + '</b> '
        + '(CPF ' + ccEsc(ccFormatCPF(p.cpf) || '-') + '). O indivíduo permanece neste curso.</p>'
        + '<div style="max-height:44vh;overflow:auto">' + (linhas || '<p style="color:#94a3b8;font-size:12px">Nenhum outro curso cadastrado.</p>') + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
        + '<button type="button" class="btn-outline" onclick="ccFecharGenerico()">Cancelar</button>'
        + '<button type="button" class="btn-primary" onclick="ccIndEnviarCopia(\'' + p._id + '\')"><i class="fa-solid fa-paper-plane" style="margin-right:6px"></i> Enviar</button>'
        + '</div>';
    m.classList.remove('hidden');
}
async function ccIndEnviarCopia(id) {
    var p = await ccIndBuscar(id);
    if (!p) { alert('Indivíduo não encontrado.'); return; }
    var selecionados = Array.prototype.slice.call(document.querySelectorAll('.cc-enviar-curso:checked'))
        .map(function (el) { return String(el.value || ''); })
        .filter(function (v) { return v && v !== String((ccAtual || {})._id); });
    if (!selecionados.length) { alert('Selecione pelo menos um curso de destino.'); return; }
    if (!ccDb()) { alert('Banco de dados não conectado.'); return; }

    var todosIds = ccParticipaIds(p);
    selecionados.forEach(function (cid) { if (todosIds.indexOf(cid) < 0) todosIds.push(cid); });
    var nomes = ccParticipaNomes(todosIds);
    var cpfDig = String(p.cpf || '').replace(/\D/g, '');
    var enviados = [], erros = [];

    for (var i = 0; i < selecionados.length; i++) {
        var cid = selecionados[i];
        var curso = (ccCursos || []).find(function (c) { return String(c._id) === cid; });
        if (!curso) { erros.push('Curso de destino não encontrado.'); continue; }
        try {
            var copia = Object.assign({}, p);
            delete copia._id;
            copia.cursoId = cid;
            copia.cursoNome = curso.nome || '';
            copia.copiadoDeId = String((ccAtual || {})._id || '');
            copia.copiadoDeNome = (ccAtual || {}).nome || '';
            copia.copiadoEm = new Date().toISOString();
            copia.cursosParticipaIds = todosIds.slice();
            copia.cursosParticipa = nomes.slice();
            copia.atualizadoEm = new Date().toISOString();

            var destino = ccDb().collection('cursosCadastro').doc(cid).collection('individuos');
            var snap = await destino.get();
            var existente = null;
            snap.forEach(function (d) {
                var dados = d.data() || {};
                if (cpfDig && String(dados.cpf || '').replace(/\D/g, '') === cpfDig) existente = d;
            });
            if (existente) await destino.doc(existente.id).update(copia);
            else await destino.add(copia);
            enviados.push(curso.nome || 'Curso');
        } catch (e) {
            erros.push((curso.nome || 'Curso') + ': ' + (e && e.message ? e.message : e));
        }
    }
    /* O cadastro de origem tambem passa a conhecer todos os cursos vinculados. */
    try {
        await ccRef('individuos', id).update({
            cursosParticipaIds: todosIds,
            cursosParticipa: nomes,
            atualizadoEm: new Date().toISOString()
        });
    } catch (e) { erros.push('Atualização do cadastro de origem: ' + e.message); }

    ccFecharGenerico();
    await ccLoadIndividuos();
    var msg = enviados.length ? 'Cópia enviada para: ' + enviados.join(', ') + '.' : 'Nenhuma cópia foi enviada.';
    if (erros.length) msg += '\n\nFalhas:\n' + erros.join('\n');
    alert(msg);
}

/* ---------- EDICAO DENTRO DA GUIA (formulario proprio) ---------- */
function ccIndPopularFormSelects() { /* formulario proprio ja vem preenchido */ }
function ccIndFormProjetoChange() { ccFormProjetoChange('ccif'); }
async function ccIndAbrirForm(id) {
    var painel = document.getElementById('cc-ind-form-painel');
    var lista = document.getElementById('cc-ind-lista-wrap');
    if (!painel) return;
    if (ccPreFormaAtiva) ccPreVoltarForm();
    if (ccIndFormaAtiva) ccIndVoltarForm();
    await ccCarregarProjetosTurmas();
    var p = id ? await ccIndBuscar(id) : null;
    if (id && !p) return;
    painel.innerHTML = ccFormPessoaHTML('ccif', p ? 'Editar indivíduo' : 'Novo indivíduo', p, 'ccIndSalvarCandidato()', 'ccIndVoltarForm()');
    painel.style.display = '';
    if (lista) lista.style.display = 'none';
    ccIndFormaAtiva = true;
    ccIndEditando = p;
    painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function ccIndEditar(id) { ccIndAbrirForm(id); }
function ccIndVoltarForm() {
    ccIndFormaAtiva = false;
    ccIndEditando = null;
    var painel = document.getElementById('cc-ind-form-painel');
    var lista = document.getElementById('cc-ind-lista-wrap');
    if (painel) { painel.style.display = 'none'; painel.innerHTML = ''; }
    if (lista) lista.style.display = '';
}
async function ccIndSalvarCandidato() {
    var p = ccIndEditando; if (!p) return false;
    var dados = Object.assign({}, p);
    delete dados._id;
    Object.assign(dados, ccFormPessoaValores('ccif'));
    if (!dados.projeto || !dados.turma) { alert('Selecione o projeto e a turma deste curso.'); return false; }
    if (!dados.matricula) dados.matricula = ccMatriculaGerar(dados.cpf);
    if (typeof FarnPessoaCampos !== 'undefined') dados.qrCode = FarnPessoaCampos.qrValor(dados);
    dados.cursoId = ccAtual._id;
    dados.cursoNome = ccAtual.nome || '';
    dados.atualizadoEm = new Date().toISOString();
    var sit = ccIndSituacao(p).chave;
    if (sit !== 'Formado' && dados.tipoPessoa === 'F') sit = 'Formado';
    if (sit === 'Formado' && dados.tipoPessoa === 'A') sit = 'Ativo';
    ccIndAplicarSituacao(dados, sit);
    try {
        await ccRef('individuos', p._id).update(dados);
        ccIndVoltarForm();
        await ccLoadIndividuos();
        ccIndRefreshVinculos();
        alert('Cadastro de "' + (dados.nome || '') + '" atualizado neste curso.');
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
    return false;
}

/* ---------- IMPRESSAO DO INDIVIDUO DO CURSO ---------- */
async function ccIndImprimir(id) {
    var p = await ccIndBuscar(id); if (!p) return;
    var foto = '';
    try { foto = await ccFotoCurso(p.cpf, p); } catch (e) {}
    function abrir(src) {
        var w = window.open('', '_blank'); if (!w) return;
        var sit = ccIndSituacao(p);
        var cpfFmt = ccFormatCPF(p.cpf) || '-';
        var mat = p.credencial || p.matricula || '';
        var html = '<html><head><meta charset="utf-8"><title>FARN - ' + ccEsc(p.nome || '') + '</title><style>'
            + 'body{font-family:Arial,sans-serif;padding:36px;color:#222}h1{color:#1a237e;font-size:19px;margin:0}h2{font-size:14px;margin:20px 0 8px;border-bottom:2px solid #1a237e;padding-bottom:5px}'
            + '.row{display:flex;gap:18px;margin-bottom:8px}.col{flex:1}.label{font-size:10px;color:#666;text-transform:uppercase}.val{font-size:13px;margin-top:2px}'
            + '.topo{display:flex;gap:20px;align-items:flex-start;margin-bottom:14px}.foto{width:92px;height:120px;object-fit:cover;border:2px solid #1a237e;border-radius:6px}'
            + '.sit{display:inline-block;padding:3px 9px;border-radius:8px;font-size:10px;font-weight:800;background:' + sit.cor + ';color:' + sit.texto + '}'
            + '@media print{body{padding:18px}}</style></head><body><div class="topo">'
            + (src ? '<img class="foto" src="' + ccEsc(src) + '" alt="Foto">' : '')
            + '<div><h1>FARN - Força Auxiliar de Resgate Nacional</h1><p style="color:#666;margin:4px 0">Ficha do indivíduo — ' + ccEsc(ccAtual ? ccAtual.nome : '') + '</p>'
            + '<span class="sit">' + sit.rotulo + '</span></div></div>'
            + '<h2>Dados pessoais</h2>'
            + '<div class="row"><div class="col"><div class="label">Nome</div><div class="val">' + ccEsc(p.nome || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">CPF</div><div class="val">' + ccEsc(cpfFmt) + '</div></div><div class="col"><div class="label">Nascimento</div><div class="val">' + ccEsc(p.nascimento || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">E-mail</div><div class="val">' + ccEsc(p.email || '-') + '</div></div><div class="col"><div class="label">WhatsApp</div><div class="val">' + ccEsc(p.whatsapp || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">Nome da mãe</div><div class="val">' + ccEsc(p.mae || '-') + '</div></div><div class="col"><div class="label">Nome do pai</div><div class="val">' + ccEsc(p.pai || '-') + '</div></div></div>'
            + '<h2>Vínculo com o curso</h2>'
            + '<div class="row"><div class="col"><div class="label">Projeto</div><div class="val">' + ccEsc(p.projeto || '-') + '</div></div><div class="col"><div class="label">Turma</div><div class="val">' + ccEsc(p.turma || '-') + '</div></div></div>'
            + (mat ? '<div class="row"><div class="col"><div class="label">' + (sit.chave === 'Formado' ? 'Credencial' : 'Matrícula') + '</div><div class="val" style="font-size:17px;font-weight:800;color:#e65100">' + ccEsc(mat) + '</div></div></div>' : '')
            + '<div class="row"><div class="col"><div class="label">Situação</div><div class="val">' + sit.rotulo + '</div></div><div class="col"><div class="label">Origem</div><div class="val">' + (p.origem === 'pre-inscricao' ? 'Pré-Inscrição deste curso' : 'Cadastro deste curso') + '</div></div></div>'
            + '<script>window.onload=function(){window.print();}<\/script></body></html>';
        w.document.write(html); w.document.close();
    }
    Promise.resolve(foto).then(abrir).catch(function () { abrir(''); });
}

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
    if (!ccAptAlunos.length) { alert('Cadastre indivíduos neste curso (aprove pré-inscritos na guia Pré-Inscrição) antes de apontar.'); return; }
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

/* ============ SINCRONIZAÇÃO CANÔNICA DA FICHA DO CURSO ============
   Fonte única de verdade: os proprios dados do curso (individuos, avaliacoes,
   respostas, presencas, apontamentos e aulas) mais o snapshot ja gravado em
   fichaAvaliacoes, que guarda as notas lancadas manualmente. Nenhuma colecao
   global do administrador e consultada. Formato preservado:
   { cpf, av: {...}, presencas: [...], apontamentos: [...] }. */
async function ccSincronizarFicha(silent) {
    if (!ccAtual || !ccAtual._id) return 0;
    try {
        var [indSnap, avSnap, respSnap, presSnap, aptSnap, aulaSnap, fichaSnap] = await Promise.all([
            ccRef('individuos').get(),
            ccRef('avaliacoes').get(),
            ccRef('respostas').get(),
            ccRef('presencas').get(),
            ccRef('apontamentos').get(),
            ccRef('aulas').get(),
            ccRef('fichaAvaliacoes').get()
        ]);
        var aulasCurso = [];
        aulaSnap.forEach(function (d) { aulasCurso.push(Object.assign({ _id: d.id }, d.data() || {})); });

        /* Indexa o snapshot do proprio curso por CPF: é ele que guarda as
           notas teóricas/práticas, provas finais, FO+/- e médias manuais já
           lançadas nesta Ficha do Curso. */
        var avGravado = {};
        fichaSnap.forEach(function (d) {
            var f = d.data() || {};
            if (f.cpf) avGravado[String(f.cpf)] = f;
        });

        var avs = {};
        avSnap.forEach(function (d) {
            var av = Object.assign({ _id: d.id }, d.data() || {});
            /* A nota é indexada pelo aulaId do administrador — a mesma chave
               usada em avaliacoesAlunos.notasTeoricas / notasPraticas. */
            var chave = String(av.aulaId || av._id);
            if (!av.aulaId) {
                var local = aulasCurso.find(function (a) {
                    return String(a.conteudo || '') === String(av.aula || '') &&
                           String(a.disciplina || '') === String(av.disciplina || '');
                });
                if (local) chave = local.aulaId ? String(local.aulaId) : String(local._id);
            }
            av.chaveNota = chave;
            avs[d.id] = av;
        });

        var respostasPorCpf = {}, presencasPorCpf = {};
        respSnap.forEach(function (d) {
            var r = d.data() || {}, cpf = String(r.cpf || '');
            if (!cpf) return;
            (respostasPorCpf[cpf] = respostasPorCpf[cpf] || []).push(r);
        });
        presSnap.forEach(function (d) {
            var p = d.data() || {}, cpf = String(p.cpf || '');
            if (!cpf) return;
            (presencasPorCpf[cpf] = presencasPorCpf[cpf] || []).push(Object.assign({ _id: d.id }, p));
        });

        /* Registros da guia Apontamentos: cada apontamento guarda um array
           "alunos" com o resultado de cada pessoa. Vira a fonte da Ficha
           Geral, junto das presenças. */
        var apontamentosPorCpf = {};
        aptSnap.forEach(function (d) {
            var apt = Object.assign({ _id: d.id }, d.data() || {});
            (apt.alunos || []).forEach(function (al) {
                var cpfAl = String(al.cpf || '').replace(/\D/g, '');
                if (!cpfAl) return;
                (apontamentosPorCpf[cpfAl] = apontamentosPorCpf[cpfAl] || []).push(Object.assign({}, al, {
                    apontamentoId: apt._id,
                    apontamentoData: apt.dataAula || apt.data || '',
                    aula: apt.aula || al.aula || '',
                    aulaId: apt.aulaId || al.aulaId || '',
                    disciplina: apt.disciplina || al.disciplina || '',
                    turma: apt.turma || al.turma || '',
                    projeto: apt.projeto || al.projeto || '',
                    instrutor: apt.instrutor || apt.docente || '',
                    criadoEm: apt.criadoEm || '',
                    criadoPor: apt.criadoPor || ''
                }));
            });
        });
        /* Completa as presenças com os registros dos apontamentos (sem
           duplicar quando a presença ja foi gravada pelo apontamento). */
        Object.keys(apontamentosPorCpf).forEach(function (cpf) {
            apontamentosPorCpf[cpf].forEach(function (reg) {
                var lista = presencasPorCpf[cpf] = presencasPorCpf[cpf] || [];
                var jaExiste = lista.some(function (x) {
                    return String(x.apontamentoId || '') === String(reg.apontamentoId || '');
                });
                if (jaExiste) return;
                lista.push({
                    _id: 'apt-' + reg.apontamentoId,
                    apontamentoId: reg.apontamentoId,
                    aulaId: reg.aulaId,
                    aula: reg.aula,
                    disciplina: reg.disciplina,
                    dataAula: reg.apontamentoData,
                    turma: reg.turma,
                    projeto: reg.projeto,
                    status: reg.status,
                    obs: reg.obs || reg.observacaoJustificativa || '',
                    justificadaEm: reg.justificadaEm || '',
                    instrutor: reg.instrutor,
                    criadoEm: reg.criadoEm,
                    deApontamento: true
                });
            });
        });
        var individuos = [];
        indSnap.forEach(function (d) { individuos.push(Object.assign({ _id: d.id }, d.data() || {})); });

        var batch = ccDb().batch(), n = 0, agora = new Date().toISOString();
        for (var i = 0; i < individuos.length; i++) {
            var p = individuos[i], cpf = String(p.cpf || '');
            if (!cpf) continue;
            var atual = await ccRef('fichaAvaliacoes', cpf).get();
            var base = (atual.exists && atual.data()) ? atual.data() : {};
            /* Começa pelo snapshot gravado neste proprio curso e só
               acrescenta/sobrescreve com as respostas das avaliações do curso.
               IMPORTANTE: um mapa VAZIO nas avaliações NAO pode apagar notas
               lançadas manualmente e ja salvas em fichaAvaliacoes. */
            var gravado = avGravado[cpf] || {}, avBase = base.av || gravado.av || {};
            var av = Object.assign({}, gravado.av || {}, avBase);
            ['notasTeoricas','notasPraticas','avTeoricaManual','avPraticaManual'].forEach(function (k) {
                var a = (gravado.av && gravado.av[k] && typeof gravado.av[k] === 'object') ? gravado.av[k] : {};
                var b = (avBase[k] && typeof avBase[k] === 'object') ? avBase[k] : {};
                av[k] = Object.assign({}, a, b);
            });
            ['foPositivos','foNegativos'].forEach(function (k) {
                av[k] = (Array.isArray(avBase[k]) && avBase[k].length)
                    ? avBase[k] : (Array.isArray(gravado.av && gravado.av[k]) ? gravado.av[k] : []);
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
                    : (r.respostasCertas != null && r.respostasCertas !== '') ? Math.round(Math.max(0, Math.min(10, Number(r.respostasCertas) * peso)) * 10) / 10
                    : Math.round(Math.max(0, Math.min(10, certas * peso)) * 10) / 10;
                if (isNaN(nota)) return;
                var info = {
                    avaliacaoId: avDoc._id, avaliacaoNome: avDoc.nome || '',
                    respostas: respostas, totalQuestoes: total, nota: nota,
                    respondidoEm: r.enviadoEm || agora
                };
                if (tipo === 'final_teorica') av.avFinalTeorica = nota;
                else if (tipo === 'final_pratica') av.avFinalPratica = nota;
                else if (tipo === 'pratica') {
                    av.notasPraticas[avDoc.chaveNota] = nota;
                    av.avPraticaManual[avDoc.chaveNota] = info;
                } else {
                    av.notasTeoricas[avDoc.chaveNota] = nota;
                    av.avTeoricaManual[avDoc.chaveNota] = info;
                }
            });
            batch.set(ccRef('fichaAvaliacoes', cpf), {
                cpf: cpf,
                av: av,
                presencas: presencasPorCpf[cpf] || base.presencas || [],
                apontamentos: apontamentosPorCpf[cpf] || base.apontamentos || [],
                sincronizadoEm: agora,
                cursoId: ccAtual._id
            });
            n++;
        }
        if (n) await batch.commit();
        if (!silent) alert('Ficha do Curso sincronizada: ' + n + ' indivíduo(s). Notas da Seção de Avaliação e do Cadastro de Avaliações reunidas.');
        return n;
    } catch (e) {
        console.error('Erro ao sincronizar ficha do curso:', e);
        if (!silent) alert('Erro ao sincronizar: ' + e.message);
        return 0;
    }
}

/* Vincula os quadros AV Teórica/Prática da Ficha do Curso aos registros da guia
   Criar Avaliação. Cada avaliação vira uma linha do quadro, com o nome da AV,
   e a nota é lida pela mesma chave (aulaId) usada na sincronização. */
function ccDataAvFicha(v) {
    if (!v) return '';
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
function ccAulasDaFicha(avaliacoes, aulasReais) {
    var todas = (aulasReais || []).slice();
    function doTipo(tipo, flag) {
        var lista = (avaliacoes || []).filter(function (a) { return String(a.tipo || 'teorica') === tipo; });
        /* Sem avaliação cadastrada no quadro, mantém o comportamento antigo
           (aulas marcadas como AV Teórica/Prática). */
        if (!lista.length) {
            return (aulasReais || []).filter(function (a) { return a[flag] === 'Sim'; });
        }
        var vistos = {}, out = [];
        lista.forEach(function (a) {
            var chave = String(a.aulaId || a._id);
            if (vistos[chave]) return;
            vistos[chave] = true;
            out.push({
                _id: chave,
                aulaId: a.aulaId || '',
                data: ccDataAvFicha(a.data || a.dataAula || a.criadoEm),
                disciplina: a.disciplina || '',
                conteudo: a.nome || a.aula || 'Avaliação',
                avTeorica: tipo === 'teorica' ? 'Sim' : '',
                avPratica: tipo === 'pratica' ? 'Sim' : '',
                _avaliacaoId: a._id,
                _vinculadoCriarAvaliacao: true
            });
        });
        return out;
    }
    return { todas: todas, teorica: doTipo('teorica', 'avTeorica'), pratica: doTipo('pratica', 'avPratica') };
}

/* Vincula os apontamentos da guia Apontamentos aos registros da Ficha do Curso. */
async function ccSincronizarApontamentosFicha() {
    try {
        await ccSincronizarFicha(true);
        await ccInitFicha();
        alert('Apontamentos do curso vinculados à Ficha do Curso.');
    } catch (e) { alert('Erro ao sincronizar apontamentos: ' + e.message); }
}

/* ============ ABA FICHA DO CURSO ============
   Montagem exclusiva do Cadastro de Cursos. O nucleo compartilhado continua
   responsavel pelo CALCULO e pelos helpers de AV; a folha foi redesenhada na
   ordem pedida: instituicao -> projeto/turma -> foto/matricula ->
   identificacao -> apontamento -> avaliacao. */
var ccFichaCache = [];

async function ccInitFicha() {
    var box = document.getElementById('cc-ficha-lista');
    if (!box || !ccAtual) return;
    box.innerHTML = '<p style="color:#64748b">Carregando fichas...</p>';
    try {
        /* Traz as respostas e apontamentos do proprio curso para a ficha. */
        await ccSincronizarFicha(true);
        var resultado = await Promise.all([
            ccRef('individuos').get(),
            ccRef('aulas').orderBy('data').get(),
            ccRef('fichaAvaliacoes').get(),
            ccRef('avaliacoes').get()
        ]);
        var fichasSnapshot = {};
        resultado[2].forEach(function (d) {
            var f = d.data() || {};
            if (f.cpf) fichasSnapshot[String(f.cpf)] = f;
        });
        var aulasReais = [];
        resultado[1].forEach(function (d) {
            aulasReais.push(Object.assign({ _id: d.id }, d.data() || {}));
        });
        var avsFicha = [];
        resultado[3].forEach(function (d) { avsFicha.push(Object.assign({ _id: d.id }, d.data() || {})); });
        var aulas = ccAulasDaFicha(avsFicha, aulasReais);
        var pessoas = [];
        resultado[0].forEach(function (d) { pessoas.push(Object.assign({ _id: d.id }, d.data() || {})); });
        ccFichaCache = [];

        /* Um unico carregamento institucional para todas as folhas da lista. */
        if (typeof fichaGeralCarregarInstituicao === 'function') await fichaGeralCarregarInstituicao(true);

        if (!pessoas.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum indivíduo importado para este curso.</p>'; return; }
        var html = '', itensRenderizados = [];
        for (var i = 0; i < pessoas.length; i++) {
            var p = pessoas[i];
            try {
                var dados = await fichaGeralDadosAluno(p);
                var snapshot = fichasSnapshot[String(p.cpf)];
                if (snapshot) {
                    /* O nucleo compartilhado calcula com dados.av; o snapshot
                       do curso tem tudo que veio de Apontamento e Avaliacoes.
                       Mapas vazios do curso NAO apagam as notas globais. */
                    var avGlobal = dados.av || {};
                    var avCurso = snapshot.av || snapshot;
                    dados.av = Object.assign({}, avGlobal, avCurso);
                    ['notasTeoricas','notasPraticas','avTeoricaManual','avPraticaManual'].forEach(function (k) {
                        var a = (avGlobal[k] && typeof avGlobal[k] === 'object') ? avGlobal[k] : {};
                        var b = (avCurso[k] && typeof avCurso[k] === 'object') ? avCurso[k] : {};
                        dados.av[k] = Object.assign({}, a, b);
                    });
                    ['foPositivos','foNegativos'].forEach(function (k) {
                        dados.av[k] = (Array.isArray(avCurso[k]) && avCurso[k].length)
                            ? avCurso[k] : (Array.isArray(avGlobal[k]) ? avGlobal[k] : []);
                    });
                    /* Usa projeto/turma do INDIVIDUO no filtro: o apontamento
                       grava o projeto por extenso e o cadastro pode estar com
                       a sigla (ex.: BUENOS AIRES /PE). */
                    function ajustarRegistroCurso(reg) {
                        return Object.assign({}, reg, {
                            turma: p.turma || reg.turma || '',
                            projeto: p.projeto || reg.projeto || ''
                        });
                    }
                    if (snapshot.presencas && snapshot.presencas.length) {
                        dados.presencas = snapshot.presencas.map(ajustarRegistroCurso);
                    }
                    if (snapshot.apontamentos && snapshot.apontamentos.length) {
                        dados.apontamentos = snapshot.apontamentos.map(ajustarRegistroCurso);
                    }
                }
                var calc = fichaGeralCalcular(p, dados, aulas);
                /* Usa o MESMO calculo da guia Seção de Avaliação para os
                   pontos de AV Teórica/Prática e as notas lancadas. Assim a
                   ficha nunca mostra um numero diferente da guia. */
                var calcAval = (typeof ccAvalCalcular === 'function')
                    ? ccAvalCalcular(dados, aulas, avsFicha) : calc;
                var item = {
                    p: p, calc: calc, calcAval: calcAval, aulas: aulas, avs: avsFicha,
                    apontamentos: dados.apontamentos || [], foto: null
                };
                ccFichaCache.push(item);
                itensRenderizados.push({ i: i, item: item, p: p });
                html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;background:#fff;overflow:hidden">'
                    + '<div onclick="ccToggleFicha(' + i + ')" style="display:flex;gap:10px;align-items:center;padding:12px;cursor:pointer;background:#f8fafc">'
                    + '<b style="font-size:13px;flex:1">' + ccEsc(p.nome) + '</b>'
                    + '<span style="font-size:11px;color:#64748b">' + ccEsc(p.cpf || '') + '</span>'
                    + '<span style="font-size:9px;font-weight:800;color:#0284c7;background:#e0f2fe;border-radius:20px;padding:3px 9px">FICHA DO CURSO</span>'
                    + '<button class="btn-outline btn-sm" onclick="event.stopPropagation();ccImprimirFichaCurso(' + i + ')"><i class="fa-solid fa-print"></i></button>'
                    + '</div><div id="cc-ficha-' + i + '" style="display:none;padding:12px">'
                    + ccFichaCursoFolha(item, null, i)
                    + '</div></div>';
            } catch (e) { console.warn('Erro ao montar ficha do curso:', e); }
        }
        box.innerHTML = html;
        if (typeof fichaGeralAplicarLogo === 'function') fichaGeralAplicarLogo(box);

        /* Foto 3x4: primeiro o que ja esta no registro/localStorage; se nao
           houver, usa o mesmo resolvedor de fotos do administrador. */
        itensRenderizados.forEach(function (entrada) {
            var i = entrada.i, item = entrada.item, pessoa = entrada.p;
            var aplicar = function (src) {
                if (!src) return;
                var el = document.getElementById('cc-fg-foto-' + i);
                if (el) el.innerHTML = '<img src="' + ccEsc(src) + '" alt="Foto 3x4" style="width:92px;height:122px;object-fit:cover;border-radius:8px;border:2px solid #0ea5e9">';
                item.foto = src;
            };
            var digits = String(pessoa.cpf || '').replace(/\D/g, '');
            var local = (typeof localStorage !== 'undefined')
                ? (localStorage.getItem('foto3x4_' + digits) || localStorage.getItem('farn_photo_' + digits) || null)
                : null;
            var inicial = pessoa.fotoUrl || pessoa.photoDataUrl || local;
            if (inicial) aplicar(inicial);
            else ccFotoCurso(pessoa.cpf, pessoa).then(aplicar).catch(function () {});
        });
    } catch (e) { box.innerHTML = '<p style="color:#dc2626">' + ccEsc(e.message) + '</p>'; }
}
function ccToggleFicha(i) { var el = document.getElementById('cc-ficha-' + i); if (el) el.style.display = (el.style.display === 'none') ? '' : 'none'; }

/* ---- folha da Ficha do Curso (ordem exata solicitada) ---- */
function ccFichaCursoFolha(item, fotoSrc, idx) {
    var p = item.p || {}, calc = item.calc || {};
    var aulas = item.aulas || { todas: [], teorica: [], pratica: [] };
    var inst = (typeof fichaGeralDadosInstituicao === 'function') ? fichaGeralDadosInstituicao() : {};
    var nome = p.nome || '—';
    var cpf = ((typeof fgCPF === 'function' ? fgCPF(p.cpf) : String(p.cpf || '')) || '—');
    var mat = p.credencial || p.matricula || ((typeof fgMatricula === 'function' ? fgMatricula(p.cpf) : '') || '—');
    var projeto = p.projeto || p.curso || (Array.isArray(p.cursos) ? p.cursos[0] : '') || (ccAtual && ccAtual.nome) || '—';
    var turma = p.turma || '—';
    var telefone = p.telefone || p.fone || p.whatsapp || '';

    var fotoHtml = fotoSrc
        ? '<img src="' + ccEsc(fotoSrc) + '" alt="Foto 3x4" style="width:92px;height:122px;object-fit:cover;border-radius:8px;border:2px solid #0ea5e9">'
        : '<div id="cc-fg-foto-' + idx + '" style="width:92px;height:122px;border:2px dashed #94a3b8;border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;text-align:center;padding:4px;box-sizing:border-box">Sem foto</div>';

    /* 1) Dados da instituicao (configuracoes/instituicao) */
    var contatos = (typeof fgChipContato === 'function')
        ? ((inst.cnpj ? fgChipContato('fa-file-invoice', 'CNPJ', inst.cnpj) : '')
            + (inst.fone ? fgChipContato('fa-phone', 'Telefone', inst.fone) : '')
            + (inst.email ? fgChipContato('fa-envelope', 'E-mail', inst.email) : ''))
        : '';
    var instHtml = '<div style="border:1px solid #bae6fd;border-radius:12px;background:linear-gradient(135deg,#f0f9ff,#e0f2fe);padding:12px 16px;margin-bottom:14px">'
        + '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">'
        + (inst.logo
            ? '<img data-fg-logo="1" alt="Logo da instituicao" style="width:54px;height:54px;border-radius:12px;object-fit:contain;background:#fff;border:1px solid #bae6fd;padding:2px;flex-shrink:0;display:none">'
            : '<div style="width:54px;height:54px;border-radius:12px;background:linear-gradient(135deg,#0ea5e9,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;flex-shrink:0"><i class="fa-solid fa-building-columns"></i></div>')
        + '<div style="flex:1;min-width:190px">'
        + '<div style="font-size:9.5px;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:1.1px"><i class="fa-solid fa-building-columns" style="margin-right:4px"></i>Dados da Instituição</div>'
        + '<div style="font-size:15px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.3px;margin-top:3px;line-height:1.25">' + ccEsc(inst.razaoSocial || 'FARN - FORÇA AUXILIAR DE RESGATE NACIONAL') + '</div>'
        + (inst.nomeFantasia ? '<div style="font-size:12.5px;font-weight:700;color:#0ea5e9;margin-top:2px">' + ccEsc(inst.nomeFantasia) + '</div>' : '')
        + '<div style="font-size:9.5px;font-weight:700;color:#475569;letter-spacing:.9px;margin-top:5px">FICHA DO CURSO</div>'
        + '</div></div>'
        + '<div style="border-top:1px dashed #7dd3fc;margin-top:10px;padding-top:8px;display:flex;gap:6px;flex-wrap:wrap">'
        + (contatos || '<div style="font-size:10.5px;color:#64748b;font-style:italic">Dados da instituição não cadastrados no administrativo.</div>')
        + '</div></div>';

    /* 2) Projeto e turma do curso */
    var projetoHtml = fgSecao('fa-layer-group', 'Projeto e Turma do Curso', fgGrid(
        fgCampo('Curso', (ccAtual && ccAtual.nome) || '') +
        fgCampo('Projeto', projeto) +
        fgCampo('Turma', turma)
    ));

    /* 3) Foto 3x4 e matricula */
    var fotoMatHtml = fgSecao('fa-id-card', 'Foto 3x4 e Matrícula',
        '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">'
        + '<div style="text-align:center">' + fotoHtml
        + '<div style="font-size:9px;color:#94a3b8;margin-top:4px;font-weight:700;letter-spacing:.5px">FOTO 3X4</div></div>'
        + '<div style="flex:1;min-width:180px">' + fgCampo('Matrícula', mat) + '</div>'
        + '</div>');

    /* 4) Nome em destaque + CPF, nascimento, estado civil, telefone e email */
    var destaque = '<div style="border:1px solid #bae6fd;border-radius:10px;background:linear-gradient(135deg,#eff6ff,#f0f9ff);padding:10px 14px;margin-bottom:8px">'
        + '<div style="font-size:9px;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:.9px">Nome Completo</div>'
        + '<div style="font-size:20px;font-weight:900;color:#0f172a;line-height:1.2;margin-top:2px">' + ccEsc(nome) + '</div>'
        + '<div style="font-size:11px;color:#475569;margin-top:3px">CPF <b style="color:#0f172a">' + ccEsc(cpf) + '</b></div>'
        + '</div>';
    var pessoalHtml = fgSecao('fa-user', 'Identificação do Aluno', destaque + fgGrid(
        fgCampo('Data de Nascimento', (typeof fichaGeralData === 'function' ? fichaGeralData(p.nascimento) : p.nascimento)) +
        fgCampo('Estado Civil', p.estadoCivil) +
        fgCampo('Telefone', telefone) +
        fgCampo('E-mail', p.email)
    ));

    /* 5) Lista de apontamento */
    var apontamentoHtml = fgSecao('fa-list-check', 'Lista de Apontamento', ccFichaCursoApontamentoHTML(calc, aulas));

    /* 6) Todos os dados da Secao de Avaliacao */
    var avaliacaoHtml = fgSecao('fa-clipboard-check', 'Avaliação',
        ccFichaCursoAvaliacoesHTML(p, calc, aulas, item.avs || [], item.calcAval || calc));

    var assinaturas = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:22px">'
        + '<div style="text-align:center;border-top:2px solid #94a3b8;padding-top:6px;font-size:11px;font-weight:700;color:#475569">ASSINATURA DO ALUNO</div>'
        + '<div style="text-align:center;border-top:2px solid #94a3b8;padding-top:6px;font-size:11px;font-weight:700;color:#475569">ASSINATURA DA COORDENAÇÃO</div>'
        + '</div>';
    var rodape = '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:12px;font-size:10px;color:#94a3b8">'
        + '<span>Emitido em ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - Sistema FARN</span>'
        + '<button class="fg-somente-tela btn-outline btn-sm" onclick="ccImprimirFichaCurso(' + idx + ')"><i class="fa-solid fa-print"></i> Imprimir</button>'
        + '</div>';

    return '<div class="fg-quebra" style="background:#fff;border-radius:14px;box-shadow:0 12px 34px rgba(2,6,23,.14);border:1px solid #e2e8f0;padding:24px 26px;max-width:800px;margin:0 auto;color:#0f172a;font-family:Inter,Arial,sans-serif">'
        + instHtml
        + projetoHtml
        + fotoMatHtml
        + pessoalHtml
        + apontamentoHtml
        + avaliacaoHtml
        + assinaturas
        + rodape
        + '</div>';
}

/* Apontamento em formato de lista: Presente, Falta e observacao da justificativa. */
function ccFichaCursoApontamentoHTML(calc, aulas) {
    var corPres = calc.pct >= 75 ? '#16a34a' : (calc.pct >= 50 ? '#d97706' : '#dc2626');
    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff">'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
        + fgCampo('Aulas da Turma', (calc.totalAulas || 0) + ' aula(s)')
        + fgCampo('Presente', calc.pres)
        + fgCampo('Falta', calc.fal)
        + fgCampo('Justificada', calc.just)
        + fgCampo('Presença', (calc.pct || 0) + '%')
        + '</div>'
        + fgBarra(calc.pct || 0, corPres)
        + '<div style="font-size:10px;color:#64748b;margin:-4px 0 6px"><i class="fa-solid fa-circle-info" style="margin-right:4px"></i>O apontamento registra a presença e não gera nota na AV Final.</div>'
        + (typeof fgTabelaApontamento === 'function' ? fgTabelaApontamento(aulas.todas, calc.presencasTurma) : '')
        + '</div>';
}

/* Tabela de AV Teórica/Prática IDÊNTICA à da guia Seção de Avaliação:
   Data, Descrição e a nota exatamente como foi lançada (m.nota ou notas[k]),
   incluindo avaliações manuais/criadas na guia Criar Avaliação. */
function ccFichaCursoNotasTabela(av, aulasTodas, avs, tipo) {
    var pratica = tipo === 'pratica';
    var notas = (pratica ? (av && av.notasPraticas) : (av && av.notasTeoricas)) || {};
    var manuais = (pratica ? (av && av.avPraticaManual) : (av && av.avTeoricaManual)) || {};
    var todas = aulasTodas || [];
    var linhas = [], vistos = {}, soma = 0, qtd = 0;

    Object.keys(notas).forEach(function (k) {
        var m = manuais[k] || {};
        var aulaRel = todas.find(function (x) { return String(x.aulaId || x._id) === String(k); }) || {};
        var avRel = (avs || []).find(function (a) { return String(a.aulaId || a._id) === String(k); }) || {};
        linhas.push({
            rotulo: m.avaliacaoNome || avRel.nome || aulaRel.conteudo || aulaRel.disciplina
                || ('Nota de AV ' + (pratica ? 'Prática' : 'Teórica')),
            detalhe: aulaRel.data || avRel.data || '',
            nota: m.nota != null ? m.nota : notas[k]
        });
        vistos[k] = true;
        var n = parseFloat(notas[k]);
        if (!isNaN(n) && n >= 0) { soma += n; qtd++; }
    });
    Object.keys(manuais).forEach(function (k) {
        if (vistos[k]) return;
        var m = manuais[k] || {};
        if (m.nota == null) return;
        linhas.push({ rotulo: m.avaliacaoNome || 'Avaliação', detalhe: '', nota: m.nota });
    });
    var media = qtd ? Math.round((soma / qtd) * 10) / 10 : 0;

    var html = '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="background:#f1f5f9">'
        + '<th style="text-align:left;font-size:10px;text-transform:uppercase;color:#0f766e;padding:8px 10px;border-bottom:1px solid #e2e8f0">Data</th>'
        + '<th style="text-align:left;font-size:10px;text-transform:uppercase;color:#0f766e;padding:8px 10px;border-bottom:1px solid #e2e8f0">Descrição</th>'
        + '<th style="text-align:left;font-size:10px;text-transform:uppercase;color:#0f766e;padding:8px 10px;border-bottom:1px solid #e2e8f0">Nota (0 a 10)</th>'
        + '</tr></thead><tbody>'
        + (linhas.length ? linhas.map(function (l) {
            return '<tr>'
                + '<td style="padding:8px 10px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9">' + ccEsc(ccDataAvFicha(l.detalhe) || '—') + '</td>'
                + '<td style="padding:8px 10px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9">' + ccEsc(l.rotulo) + '</td>'
                + '<td style="padding:8px 10px;font-size:12px;font-weight:800;color:#0f766e;border-bottom:1px solid #f1f5f9">' + ccEsc(l.nota != null ? l.nota : '—') + '</td>'
                + '</tr>';
        }).join('') : '<tr><td colspan="3" style="padding:8px 10px;font-size:11px;color:#94a3b8">Nenhuma nota de AV '
            + (pratica ? 'Prática' : 'Teórica') + ' registrada.</td></tr>')
        + '</tbody></table>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 10px;background:#f0fdfa;border-radius:8px;font-size:12px">'
        + '<span style="color:#0f766e;font-weight:700">Média ' + (pratica ? 'Prática' : 'Teórica') + '</span>'
        + '<span style="font-size:18px;font-weight:800;color:#0f172a">' + ccAvalNum(media) + '</span>'
        + '</div>';
    return html;
}

/* Toda a Seção de Avaliação. Os numeros vem de ccAvalCalcular (a mesma
   funcao da guia Seção de Avaliação), entao a ficha mostra os pontos certinhos
   da guia. O detalhe de presenca ja aparece na lista de apontamento acima. */
function ccFichaCursoAvaliacoesHTML(p, calcBase, aulas, avs, calcAval) {
    var g = calcAval || {};
    var b = calcBase || {};
    /* ccAvalCalcular (guia) e fichaGeralCalcular (nucleo) usam nomes
       diferentes para os mesmos numeros. Normaliza aqui para a ficha mostrar
       exatamente os valores da guia, sem cair em zero por campo ausente. */
    function escolhe(v1, v2) { return (v1 != null) ? v1 : v2; }
    var r = {
        av: g.av || b.av || {},
        pct: escolhe(g.pct, b.pct),
        pontosComp: escolhe(g.comp, b.pontosComp),
        notaTeor: escolhe(g.teor, b.notaTeor),
        notaPrat: escolhe(g.prat, b.notaPrat),
        mT: escolhe(g.mT, b.mT),
        mP: escolhe(g.mP, b.mP),
        mediaFinal: escolhe(g.mediaFinal, b.mediaFinal),
        foP: escolhe(g.foP, b.foP),
        foN: escolhe(g.foN, b.foN),
        avFinal: escolhe(g.avFinal, b.avFinal),
        avFinalTeorica: escolhe(g.ft, b.avFinalTeorica),
        avFinalPratica: escolhe(g.fp, b.avFinalPratica),
        temFinal: escolhe(g.temFinal, b.temFinal),
        fin: escolhe(g.fin, b.fin),
        notaCertificadora: escolhe(g.notaCert, b.notaCertificadora),
        notaSituacao: escolhe(g.notaCert, b.notaSituacao),
        aprovado: escolhe(g.aprovado, b.aprovado)
    };
    var av = r.av;
    var avFT = r.avFinalTeorica;
    var avFP = r.avFinalPratica;
    var notaSituacao = r.notaSituacao;
    var notaCertificadora = r.notaCertificadora;
    var corPres = r.pct >= 75 ? '#16a34a' : (r.pct >= 50 ? '#d97706' : '#dc2626');
    var corComp = r.pontosComp >= 0 ? '#16a34a' : '#dc2626';
    var corTeor = fichaGeralCorNota(r.notaTeor);
    var corPrat = fichaGeralCorNota(r.notaPrat);
    var corMF = fichaGeralCorNota(r.mediaFinal);
    var corAV = fichaGeralCorNota(r.avFinal);
    var corAprov = r.aprovado ? '#16a34a' : '#dc2626';

    var html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
        + fgNotaPill('Presença', r.pct + '%', corPres)
        + fgNotaPill('AV Comportamento', (r.pontosComp >= 0 ? '+' : '') + r.pontosComp + ' pts', corComp)
        + fgNotaPill('AV Teórica', fichaGeralNum(r.notaTeor) + ' / 10,0', corTeor)
        + fgNotaPill('AV Prática', fichaGeralNum(r.notaPrat) + ' / 10,0', corPrat)
        + '</div>';

    html += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap"><i class="fa-solid fa-face-smile" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">Detalhe - AV Comportamento (FO+ / FO-)</span>'
        + '<span style="font-size:9.5px;color:#94a3b8">a cada 10 FO+ soma 1 ponto; a cada 5 FO- tira 1 ponto da AV Final</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
        + fgCampo('Total FO+', r.foP)
        + fgCampo('Total FO-', r.foN)
        + fgCampo('Pontos (10 FO+ = +1 / 5 FO- = -1)', (r.pontosComp >= 0 ? '+' : '') + r.pontosComp)
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + fgFOLista(av.foPositivos, true)
        + fgFOLista(av.foNegativos, false)
        + '</div></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">'
        + '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-book-open" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">AV Teórica - Média ' + fichaGeralNum(r.notaTeor) + '</span></div>'
        + ccFichaCursoNotasTabela(av, aulas.todas, avs, 'teorica')
        + '</div>'
        + '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-hammer" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">AV Prática - Média ' + fichaGeralNum(r.notaPrat) + '</span></div>'
        + ccFichaCursoNotasTabela(av, aulas.todas, avs, 'pratica')
        + '</div></div>';

    html += '<div style="border:1.5px solid #0ea5e9;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#f0f9ff,#e0f2fe)">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><i class="fa-solid fa-medal" style="color:#0ea5e9;font-size:13px"></i>'
        + '<span style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">AV Final</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
        + fgCampo('Média Teórica (manual ou auto)', fichaGeralNum(r.mT != null ? r.mT : ''))
        + fgCampo('Média Prática (manual ou auto)', fichaGeralNum(r.mP != null ? r.mP : ''))
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgNotaPill('Média (T+P)/2', fichaGeralNum(r.mediaFinal), corMF)
        + fgNotaPill('Comportamento', (r.pontosComp >= 0 ? '+' : '') + r.pontosComp + ' pts', corComp)
        + fgNotaPill('AV Final', fichaGeralNum(r.avFinal) + ' / 10,0', corAV)
        + '</div>'
        + '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-size:10px;color:#475569">Situação Final pela Nota Certificadora (corte ' + fichaGeralNum(FG_AV_CORTE_APROVACAO) + '): ' + fichaGeralNum(notaSituacao) + ' / 10,0' + (r.temFinal ? '' : ' (provisória)') + '. A AV Final é a média (teórica+prática)/2 + comportamento.</span>'
        + '<span style="background:' + corAprov + ';color:#fff;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:800">' + (r.aprovado ? 'APROVADO' : 'NÃO APROVADO') + '</span>'
        + '</div>'
        + '<div style="margin-top:10px;border-top:1px dashed #bae6fd;padding-top:8px">'
        + '<div style="font-size:10px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Provas finais (nota certificadora)</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgNotaPill('AV Final Teórica', (avFT === '' || avFT == null) ? '—' : fichaGeralNum(avFT) + ' / 10,0', corComp)
        + fgNotaPill('AV Final Prática', (avFP === '' || avFP == null) ? '—' : fichaGeralNum(avFP) + ' / 10,0', corComp)
        + fgNotaPill('FIN (média das duas)', r.temFinal ? fichaGeralNum(r.fin) : '0,0', corMF)
        + fgNotaPill('Nota Certificadora', fichaGeralNum(notaCertificadora) + ' / 10,0' + (r.temFinal ? '' : ' (provisória)'), corAV)
        + '</div>'
        + (function () {
            var ft = (avFT === '' || avFT == null) ? '' : fichaGeralNum(avFT);
            var necessario = fichaGeralPraticaNecessaria(r.mediaFinal, avFT);
            var alvo = fichaGeralNum(FG_AV_CORTE_APROVACAO);
            if (notaCertificadora >= FG_AV_CORTE_APROVACAO) {
                return '<div style="margin-top:10px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px;text-align:center">'
                    + '<div style="font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#166534">Alvo de aprovação (média ' + alvo + ')</div>'
                    + '<div style="font-size:30px;font-weight:900;color:#16a34a;line-height:1.15;margin-top:2px">APROVADO</div>'
                    + '<div style="font-size:10px;color:#166534;margin-top:2px">Nota certificadora ' + fichaGeralNum(notaCertificadora) + ' já atingiu o corte de ' + alvo + '.</div>'
                    + '</div>';
            }
            if (necessario > 10) {
                return '<div style="margin-top:10px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px;text-align:center">'
                    + '<div style="font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#991b1b">Alvo de aprovação (média ' + alvo + ')</div>'
                    + '<div style="font-size:30px;font-weight:900;color:#dc2626;line-height:1.15;margin-top:2px">NÃO ALCANÇA</div>'
                    + '<div style="font-size:10px;color:#991b1b;margin-top:2px">Precisaria de ' + fichaGeralNum(necessario) + ' na AV Final Prática, mas o máximo é 10,0.</div>'
                    + '<div style="font-size:11.5px;font-weight:600;color:#7f1d1d;line-height:1.55;margin-top:8px;background:#fff;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;text-align:left">'
                    + fgEsc(FG_AV_DISPENSA_TEXTO) + '</div></div>';
            }
            return '<div style="margin-top:10px;background:#fefce8;border:1.5px solid #facc15;border-radius:10px;padding:12px;text-align:center">'
                + '<div style="font-size:10px;font-weight:800;color:#a16207;text-transform:uppercase;letter-spacing:.4px">Pontos necessários na AV Final Prática para aprovação (média ' + alvo + ')</div>'
                + '<div style="font-size:30px;font-weight:900;color:#ca8a04;line-height:1.15;margin-top:2px">' + fichaGeralNum(necessario) + '</div>'
                + '<div style="font-size:10px;color:#713f12;margin-top:2px">AV Final Teórica considerada: ' + (ft === '' ? '0,0 (em branco)' : ft) + '.'
                + ' FIN = (teórica + prática) / 2 e Certificadora = (média + FIN) / 2.'
                + ((avFP === '' || avFP == null) ? '' : ' AV Final Prática já lançada: ' + fichaGeralNum(avFP) + '.')
                + '</div></div>';
        })()
        + '<div style="font-size:10px;color:#475569;margin-top:6px">FIN = (AV Final Teórica + AV Final Prática) / 2. Nota Certificadora = (Média (T+P)/2 + FIN) / 2.</div>'
        + '</div></div>';

    html += '<div style="margin-top:12px;border-top:1px dashed #e2e8f0;padding-top:8px">'
        + '<div style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px"><i class="fa-solid fa-clock-rotate-left" style="color:#0ea5e9;margin-right:6px"></i>Histórico de Notas</div>'
        + (typeof fgHistoricoNotas === 'function' ? fgHistoricoNotas(av, p) : '')
        + '</div>';
    return html;
}

async function ccImprimirFichaCurso(i) {
    var item = ccFichaCache[i]; if (!item) return;
    var foto = item.foto || null;
    if (!foto) {
        try { foto = await ccFotoCurso(item.p.cpf, item.p); } catch (e) { foto = null; }
    }
    var html = ccFichaCursoFolha(item, foto, i);
    var titulo = 'FARN - Ficha do Curso - ' + (item.p.nome || '');
    if (typeof fichaGeralAbrirImpressao === 'function') {
        fichaGeralAbrirImpressao(titulo, html, true);
        return;
    }
    var w = window.open('', '_blank');
    if (w) { w.document.write('<html><head><meta charset="utf-8"><title>' + ccEsc(titulo) + '</title><link rel="stylesheet" href="style.css"></head><body>' + html + '</body></html>'); w.document.close(); setTimeout(function () { w.print(); }, 400); }
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
        var aulasReaisAval = [];
        resultado[0].forEach(function (d) {
            aulasReaisAval.push(Object.assign({ _id: d.id }, d.data() || {}));
        });
        var avsDaAval = [];
        resultado[3].forEach(function (d) { avsDaAval.push(Object.assign({ _id: d.id }, d.data() || {})); });
        var aulas = ccAulasDaFicha(avsDaAval, aulasReaisAval);
        var dados = (typeof fichaGeralDadosAluno === 'function') ? await fichaGeralDadosAluno(p) : { av: {}, presencas: [] };
        var snapshot = null;
        resultado[1].forEach(function (d) {
            var f = d.data() || {};
            if (String(f.cpf) === String(cpf)) snapshot = f;
        });
        if (snapshot) {
            /* O snapshot do curso é a fonte única (admin + avaliações do
               curso); ele prevalece sobre a leitura global do administrador. */
            var avGlobal = dados.av || {}, avCurso = snapshot.av || {};
            dados.av = Object.assign({}, avGlobal, avCurso);
            ['notasTeoricas','notasPraticas','avTeoricaManual','avPraticaManual'].forEach(function (k) {
                var a = (avGlobal[k] && typeof avGlobal[k] === 'object') ? avGlobal[k] : {};
                var b = (avCurso[k] && typeof avCurso[k] === 'object') ? avCurso[k] : {};
                dados.av[k] = Object.assign({}, a, b);
            });
            ['foPositivos','foNegativos'].forEach(function (k) {
                dados.av[k] = (Array.isArray(avCurso[k]) && avCurso[k].length)
                    ? avCurso[k] : (Array.isArray(avGlobal[k]) ? avGlobal[k] : []);
            });
            var presencasCurso = [];
            resultado[2].forEach(function (d) {
                var pr = d.data() || {};
                if (String(pr.cpf) === String(cpf)) presencasCurso.push(pr);
            });
            function ajustarRegistroAvaliacao(reg) {
                return Object.assign({}, reg, {
                    turma: p.turma || reg.turma || '',
                    projeto: p.projeto || reg.projeto || ''
                });
            }
            /* presencas e apontamentos vêm sempre como ARRAYS; o ajuste é
               por registro — Object.assign num array viraria objeto numérico
               e quebraria o .filter()/.forEach() dos consumidores. */
            if (presencasCurso.length) {
                dados.presencas = presencasCurso.map(ajustarRegistroAvaliacao);
            } else if (snapshot.presencas && snapshot.presencas.length) {
                var basePres = Array.isArray(snapshot.presencas) ? snapshot.presencas : [snapshot.presencas];
                dados.presencas = basePres.map(ajustarRegistroAvaliacao);
            }
            if (snapshot.apontamentos && snapshot.apontamentos.length) {
                var baseApt = Array.isArray(snapshot.apontamentos) ? snapshot.apontamentos : [snapshot.apontamentos];
                dados.apontamentos = baseApt.map(ajustarRegistroAvaliacao);
            }
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

/* Estrutura da ficha = mesma da Seção de Avaliação do administrador. */
function ccAvalInjectCss() {
    if (document.getElementById('cc-av-css')) return;
    var s = document.createElement('style');
    s.id = 'cc-av-css';
    s.textContent =
        '.cc-av-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px}' +
        '.cc-av-tab{border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;padding:7px 11px;font-size:11px;font-weight:700;cursor:pointer}' +
        '.cc-av-tab.active{background:#0f766e;border-color:#0f766e;color:#fff}' +
        '.av-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:14px}' +
        '.av-stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}' +
        '.av-stat .valor{font-size:24px;font-weight:800;color:#0f766e}' +
        '.av-stat .rotulo{font-size:10px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:700}' +
        '.av-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px}' +
        '.av-card h4{font-size:13px;font-weight:800;color:#0f172a;margin-bottom:10px}' +
        '.av-card h4 i{margin-right:6px;color:#0f766e}' +
        '.av-bar{height:16px;background:#e2e8f0;border-radius:8px;overflow:hidden}' +
        '.av-bar-fill{height:100%;border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:10px;font-weight:800;color:#fff;min-width:34px}' +
        '.av-bar-rotulo{display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:4px;font-weight:700}' +
        'table.av-tabela{width:100%;border-collapse:collapse}' +
        'table.av-tabela th{text-align:left;font-size:10px;text-transform:uppercase;color:#0f766e;padding:8px 10px;border-bottom:1px solid #e2e8f0}' +
        'table.av-tabela td{padding:8px 10px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9}' +
        '.media-destaque{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 10px;background:#f0fdfa;border-radius:8px;font-size:12px}' +
        '.media-destaque .rotulo{color:#0f766e;font-weight:700}.media-destaque .valor{font-size:18px;font-weight:800;color:#0f172a}' +
        '.av-nota{font-weight:800;color:#0f766e}';
    (document.head || document.body).appendChild(s);
}
function ccAvalBar(pct, cor, texto) {
    return '<div class="av-bar"><div class="av-bar-fill" style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + cor + '">' + ccEsc(texto) + '</div></div>';
}
function ccAvalNum(n) { return (n == null || n === '') ? '—' : (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ','); }

function ccAvalRenderModal() {
    ccAvalInjectCss();
    var abas = [
        ['apontamento','Apontamento'], ['comportamento','Comportamento'],
        ['teorica','AV Teórica'], ['pratica','AV Prática'],
        ['final_teorica','AV Final Teórica'], ['final_pratica','AV Final Prática'],
        ['resultado','Resultado']
    ];
    var html = '<div class="cc-av-tabs">' + abas.map(function (a) {
        return '<button type="button" class="cc-av-tab' + (ccAvalAba === a[0] ? ' active' : '') + '" onclick="ccAvalSetAba(\'' + a[0] + '\')">' + a[1] + '</button>';
    }).join('') + '</div><div id="cc-avaliacao-conteudo">' + ccAvalRenderAba() + '</div>';
    return html;
}
function ccAvalSetAba(aba) {
    ccAvalAba = aba;
    var box = document.getElementById('cc-avaliacao-conteudo');
    if (box) box.innerHTML = ccAvalRenderAba();
    document.querySelectorAll('.cc-av-tab').forEach(function (b) {
        b.className = 'cc-av-tab' + (b.getAttribute('onclick') === 'ccAvalSetAba(\'' + aba + '\')' ? ' active' : '');
    });
}

/* Calculo da guia Seção de Avaliação. Sem argumentos continua usando o
   ccAvalCache do modal; com dados/aulas/avs serve tambem para a Ficha do
   Curso, garantindo que os mesmos numeros aparecam nas duas telas. */
function ccAvalCalcular(dados, aulas, avs) {
    var c = (dados && aulas) ? { dados: dados, aulas: aulas, avs: avs || [] } : ccAvalCache;
    var av = (c && c.dados && c.dados.av) || {};
    var notasT = av.notasTeoricas || {}, notasP = av.notasPraticas || {};
    var somaT = 0, qtdT = 0, somaP = 0, qtdP = 0;
    Object.keys(notasT).forEach(function (k) { var n = parseFloat(notasT[k]); if (!isNaN(n) && n >= 0) { somaT += n; qtdT++; } });
    Object.keys(notasP).forEach(function (k) { var n = parseFloat(notasP[k]); if (!isNaN(n) && n >= 0) { somaP += n; qtdP++; } });
    var teor = qtdT ? Math.round((somaT / qtdT) * 10) / 10 : 0;
    var prat = qtdP ? Math.round((somaP / qtdP) * 10) / 10 : 0;
    var mTmanual = parseFloat(String(av.mediaTeoricaManual == null ? '' : av.mediaTeoricaManual).replace(',', '.'));
    var mPmanual = parseFloat(String(av.mediaPraticaManual == null ? '' : av.mediaPraticaManual).replace(',', '.'));
    var mT = isNaN(mTmanual) ? teor : Math.max(0, Math.min(10, mTmanual));
    var mP = isNaN(mPmanual) ? prat : Math.max(0, Math.min(10, mPmanual));
    var mediaFinal = Math.round(((mT + mP) / 2) * 10) / 10;
    var foP = (av.foPositivos || []).length, foN = (av.foNegativos || []).length;
    var comp = Math.floor(foP / 10) - Math.floor(foN / 5);
    var avFinal = Math.round(Math.max(0, Math.min(10, mediaFinal + comp)) * 10) / 10;
    var ft = parseFloat(String(av.avFinalTeorica == null ? '' : av.avFinalTeorica).replace(',', '.'));
    var fp = parseFloat(String(av.avFinalPratica == null ? '' : av.avFinalPratica).replace(',', '.'));
    var temFT = !isNaN(ft), temFP = !isNaN(fp), temFinal = temFT || temFP;
    var fin = temFinal ? (((temFT ? ft : 0) + (temFP ? fp : 0)) / 2) : 0;
    fin = Math.round(fin * 10) / 10;
    var notaCert = Math.round(Math.max(0, Math.min(10, (mediaFinal + fin) / 2)) * 10) / 10;
    var pres = 0, fal = 0, just = 0;
    (c.dados.presencas || []).forEach(function (p) {
        if (p.status === 'Presente') pres++;
        else if (p.status === 'Falta') fal++;
        else if (p.status === 'Justificada') just++;
    });
    var totalAulas = (c.aulas.todas || []).length;
    var pct = totalAulas ? Math.min(100, Math.round(((pres + just) / totalAulas) * 100)) : 0;
    return { totalAulas: totalAulas, pres: pres, fal: fal, just: just, pct: pct,
        teor: teor, prat: prat, mT: mT, mP: mP, mediaFinal: mediaFinal,
        foP: foP, foN: foN, comp: comp, avFinal: avFinal,
        ft: temFT ? Math.round(ft * 10) / 10 : '', fp: temFP ? Math.round(fp * 10) / 10 : '',
        temFinal: temFinal, fin: fin, notaCert: notaCert, aprovado: notaCert >= 7 };
}

function ccAvalRenderAba() {
    ccAvalInjectCss();
    var c = ccAvalCache; if (!c) return '';
    var av = (c.dados && c.dados.av) || {}, r = ccAvalCalcular();
    var html = '';
    if (ccAvalAba === 'apontamento') {
        var cor = r.pct >= 75 ? '#16a34a' : (r.pct >= 50 ? '#d97706' : '#dc2626');
        html = '<div class="av-grid">' +
            '<div class="av-stat"><div class="valor">' + r.totalAulas + '</div><div class="rotulo">Aulas Cadastradas</div></div>' +
            '<div class="av-stat"><div class="valor" style="color:#16a34a">' + r.pres + '</div><div class="rotulo">Presenças</div></div>' +
            '<div class="av-stat"><div class="valor" style="color:#dc2626">' + r.fal + '</div><div class="rotulo">Faltas</div></div>' +
            '<div class="av-stat"><div class="valor" style="color:#d97706">' + r.just + '</div><div class="rotulo">Justificadas</div></div></div>' +
            '<div class="av-card"><h4><i class="fa-solid fa-chart-column"></i> Gráfico de Presença</h4>' +
            '<div class="av-bar-rotulo"><span>Presença</span><span>' + r.pct + '%</span></div>' +
            ccAvalBar(r.pct, cor, r.pct + '%') +
            '<div class="media-destaque"><span class="rotulo">Presença (informativa)</span><span class="valor">' + r.pct + '%</span></div></div>' +
            '<p style="font-size:11px;color:#64748b"><i class="fa-solid fa-circle-info" style="margin-right:4px"></i>O apontamento registra a frequência e NÃO gera nota na AV Final.</p>';
    } else if (ccAvalAba === 'comportamento') {
        var corComp = r.comp >= 0 ? '#16a34a' : '#dc2626';
        html = '<div class="av-card"><h4><i class="fa-solid fa-plus-circle"></i> Fato Observado Positivo (FO+)</h4>' +
            '<table class="av-tabela"><tbody>' + ((av.foPositivos || []).length
                ? (av.foPositivos || []).map(function (f) { return '<tr><td>' + ccEsc(f.data || '') + '</td><td>' + ccEsc(f.obs || '') + '</td></tr>'; }).join('')
                : '<tr><td colspan="2" style="color:#94a3b8">Nenhum FO+ registrado.</td></tr>') + '</tbody></table></div>' +
            '<div class="av-card"><h4><i class="fa-solid fa-minus-circle"></i> Fato Observado Negativo (FO-)</h4>' +
            '<table class="av-tabela"><tbody>' + ((av.foNegativos || []).length
                ? (av.foNegativos || []).map(function (f) { return '<tr><td>' + ccEsc(f.data || '') + '</td><td>' + ccEsc(f.obs || '') + '</td></tr>'; }).join('')
                : '<tr><td colspan="2" style="color:#94a3b8">Nenhum FO- registrado.</td></tr>') + '</tbody></table></div>' +
            '<div class="av-grid">' +
            '<div class="av-stat"><div class="valor" style="color:#16a34a">' + r.foP + '</div><div class="rotulo">Total FO+</div></div>' +
            '<div class="av-stat"><div class="valor" style="color:#dc2626">' + r.foN + '</div><div class="rotulo">Total FO-</div></div>' +
            '<div class="av-stat"><div class="valor" style="color:' + corComp + '">' + (r.comp >= 0 ? '+' : '') + r.comp + '</div><div class="rotulo">Pontos (AV Final)</div></div></div>' +
            '<div class="av-card"><h4><i class="fa-solid fa-chart-column"></i> Gráfico de Comportamento</h4>' +
            '<div class="av-bar-rotulo"><span>FO+ (verde)</span><span>' + r.foP + '</span></div>' + ccAvalBar(Math.min(100, r.foP * 10), '#16a34a', r.foP) +
            '<div style="height:8px"></div><div class="av-bar-rotulo"><span>FO- (vermelho)</span><span>' + r.foN + '</span></div>' + ccAvalBar(Math.min(100, r.foN * 20), '#dc2626', r.foN) + '</div>';
    } else if (ccAvalAba === 'teorica' || ccAvalAba === 'pratica') {
        var pratica = ccAvalAba === 'pratica';
        var notas = pratica ? (av.notasPraticas || {}) : (av.notasTeoricas || {});
        var manuais = pratica ? (av.avPraticaManual || {}) : (av.avTeoricaManual || {});
        var mediaTipo = pratica ? r.prat : r.teor;
        var linhas = [], vistos = {};
        /* As notas vêm indexadas pelo aulaId do administrador — a mesma
           chave usada em avTeoricaManual / avPraticaManual. */
        Object.keys(notas).forEach(function (k) {
            var m = manuais[k] || {};
            var aulaRel = (c.aulas.todas || []).find(function (x) { return String(x.aulaId || x._id) === String(k); }) || {};
            var avRel = (c.avs || []).find(function (a) { return String(a.aulaId || a._id) === String(k); }) || {};
            linhas.push({
                rotulo: m.avaliacaoNome || avRel.nome || aulaRel.conteudo || aulaRel.disciplina || ('Nota de AV ' + (pratica ? 'Prática' : 'Teórica')),
                detalhe: aulaRel.data || avRel.data || '',
                nota: m.nota != null ? m.nota : notas[k]
            });
            vistos[k] = true;
        });
        Object.keys(manuais).forEach(function (k) {
            if (vistos[k]) return;
            var m = manuais[k] || {};
            if (m.nota == null) return;
            linhas.push({ rotulo: m.avaliacaoNome || 'Avaliação', detalhe: '', nota: m.nota });
        });
        html = '<div class="av-card"><h4><i class="fa-solid fa-list-check"></i> Aulas / Avaliações com AV ' + (pratica ? 'Prática' : 'Teórica') + '</h4>' +
            '<table class="av-tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Nota (0 a 10)</th></tr></thead><tbody>' +
            (linhas.length ? linhas.map(function (l) {
                return '<tr><td>' + ccEsc(l.detalhe || '—') + '</td><td>' + ccEsc(l.rotulo) + '</td><td class="av-nota">' + ccEsc(l.nota != null ? l.nota : '—') + '</td></tr>';
            }).join('') : '<tr><td colspan="3" style="color:#94a3b8">Nenhuma nota de AV ' + (pratica ? 'Prática' : 'Teórica') + ' registrada.</td></tr>') +
            '</tbody></table></div>' +
            '<div class="av-card"><h4><i class="fa-solid fa-chart-column"></i> Gráfico da Média</h4>' +
            '<div class="av-bar-rotulo"><span>Média ' + (pratica ? 'Prática' : 'Teórica') + '</span><span>' + ccAvalNum(mediaTipo) + '</span></div>' +
            ccAvalBar(mediaTipo * 10, mediaTipo >= 7 ? '#16a34a' : (mediaTipo >= 5 ? '#d97706' : '#dc2626'), ccAvalNum(mediaTipo)) +
            '<div class="media-destaque"><span class="rotulo">Média ' + (pratica ? 'Prática' : 'Teórica') + '</span><span class="valor">' + ccAvalNum(mediaTipo) + '</span></div></div>';
    } else if (ccAvalAba === 'final_teorica' || ccAvalAba === 'final_pratica') {
        var ft = ccAvalAba === 'final_teorica';
        var notaFinal = ft ? r.ft : r.fp;
        var manual = ft ? (av.mediaTeoricaManual || '') : (av.mediaPraticaManual || '');
        html = '<div class="av-card"><h4><i class="fa-solid fa-award"></i> AV Final ' + (ft ? 'Teórica' : 'Prática') + '</h4>' +
            '<table class="av-tabela"><tbody><tr><td>Nota da prova final</td><td class="av-nota">' + ccEsc(notaFinal === '' ? '—' : notaFinal) + '</td></tr>' +
            '<tr><td>Média manual do bloco</td><td class="av-nota">' + ccEsc(manual || '—') + '</td></tr></tbody></table></div>' +
            '<div class="av-card"><h4><i class="fa-solid fa-circle-info"></i> Composição</h4>' +
            '<p style="font-size:12px;color:#475569">FIN = (AV Final Teórica + AV Final Prática) / 2. Nota Certificadora = (Média (T+P)/2 + FIN) / 2.</p>' +
            '<div class="media-destaque"><span class="rotulo">FIN</span><span class="valor">' + ccAvalNum(r.fin) + '</span></div></div>';
    } else {
        var corAprov = r.aprovado ? '#16a34a' : '#dc2626';
        html = '<div class="av-grid">' +
            '<div class="av-stat"><div class="valor">' + ccAvalNum(r.mT) + '</div><div class="rotulo">Média Teórica</div></div>' +
            '<div class="av-stat"><div class="valor">' + ccAvalNum(r.mP) + '</div><div class="rotulo">Média Prática</div></div>' +
            '<div class="av-stat"><div class="valor">' + ccAvalNum(r.mediaFinal) + '</div><div class="rotulo">Média (T+P)/2</div></div>' +
            '<div class="av-stat"><div class="valor">' + (r.comp >= 0 ? '+' : '') + r.comp + '</div><div class="rotulo">Comportamento</div></div>' +
            '<div class="av-stat"><div class="valor">' + ccAvalNum(r.avFinal) + '</div><div class="rotulo">AV Final</div></div>' +
            '<div class="av-stat"><div class="valor">' + ccAvalNum(r.fin) + '</div><div class="rotulo">FIN</div></div></div>' +
            '<div class="av-card"><h4><i class="fa-solid fa-award"></i> Situação Final</h4>' +
            '<div class="media-destaque"><span class="rotulo">Nota Certificadora (corte 7,0)</span><span class="valor">' + ccAvalNum(r.notaCert) + '</span></div>' +
            '<div style="margin-top:12px;text-align:center;padding:10px;border-radius:8px;background:' + (r.aprovado ? '#dcfce7;color:#166534' : '#fee2e2;color:#991b1b') + ';font-weight:800">' +
            (r.aprovado ? 'APROVADO' : 'NÃO APROVADO') + '</div></div>';
    }
    return html;
}

/* As notas e presenças da Ficha do Curso vem somente deste curso. A antiga
   importação da Seção de Avaliação do administrador foi removida junto com
   essa seção; use "Sincronizar" na guia da Ficha do Curso. */

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
    ccCertSetImagens(c);
    /* Novo certificado: vincula o campo instituicao com a instituicao
       cadastrada em Configuracoes > Institucao (Admin). */
    if (!c && typeof dbFirestore !== 'undefined' && dbFirestore) {
        dbFirestore.collection('configuracoes').doc('instituicao').get()
            .then(function (doc) {
                var d = (doc && doc.exists) ? doc.data() || {} : {};
                set('cc-cert-instituicao', (d.razaoSocial || d.nomeFantasia || '').trim());
            })
            .catch(function () {});
    }
}
/* Mostra ou esconde a pre-visualizacao das imagens A4 do certificado. */
function ccCertSetImagens(c) {
    var f = document.getElementById('cc-cert-frente-img');
    var v = document.getElementById('cc-cert-verso-img');
    var df = (c && c.frente) || '';
    var dv = (c && c.verso) || '';
    if (f) { f.style.display = df ? '' : 'none'; f.src = df; }
    if (v) { v.style.display = dv ? '' : 'none'; v.src = dv; }
}
/* Le o arquivo anexado (campo de imagem) como data URL. */
function ccCertLerImagem(id) {
    var inp = document.getElementById(id);
    var f = inp && inp.files && inp.files[0];
    if (!f) return Promise.resolve('');
    if (f.size > 4 * 1024 * 1024) { alert('Imagem muito grande. Maximo 4MB.'); return Promise.resolve(''); }
    return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (ev) { resolve(ev.target.result); };
        reader.onerror = function () { resolve(''); };
        reader.readAsDataURL(f);
    });
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
        frente: await ccCertLerImagem('cc-cert-frente'),
        verso: await ccCertLerImagem('cc-cert-verso'),
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
    var img = function (url) {
        return url ? '<img src="' + ccEsc(url) + '" style="max-width:80px;height:112px;object-fit:contain;margin-top:10px;border:1px solid #cbd5e1;border-radius:6px" alt="Imagem do certificado">' : '';
    };
    var html = '<div style="border:3px double #1d4ed8;padding:34px;text-align:center;background:#fff">'
        + '<div style="font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:2px">' + ccEsc(c.instituicao || 'FARN') + '</div>'
        + img(c.frente) + img(c.verso)
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


