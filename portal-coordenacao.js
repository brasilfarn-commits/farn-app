/* =====================================================================
   PORTAL DA COORDENAÇÃO
   ---------------------------------------------------------------------
   Login: somente CPF + senha de quem esta cadastrado na secao Coordenação
   do administrador (colecao coordenacao). Sessao isolada em
   localStorage.coordenacao_sessao.

   Todos os dados exibidos/editados vem das mesmas colecoes do painel
   administrativo, atraves do FarnDB:
     - coordenacao        -> Meus Dados
     - docentesAdmin      -> Dados de Docente
     - cursosCadastro/{id}/individuos|disciplinas|aulas|avaliacoes
                          -> Dados de Aluno (edicao)
     - cursosCadastro/{id}/apontamentos|fichaAvaliacoes|presencas
                          -> Apontamento e Secao de Avaliacao (somente leitura)
     - apontamentosAdm    -> Apontamento ADM (exibir e editar)
   ===================================================================== */
(function () {
    'use strict';

    var CHAVE_SESSAO = 'coordenacao_sessao';
    /* Usa a MESMA instancia dos modulos do administrador (coordenacao.js e
       portal-permissoes.js), definida no inline script do HTML. */
    var db = window.dbFirestore || new FarnDB('https://howto-alliance-pest-contest.trycloudflare.com');

    var pcoUser = null;
    var pcoCursos = [];
    var pcoCursoId = '';
    var pcoAba = 'individuos';
    var pcoCache = {
        docentes: [], individuos: [], disciplinas: [], aulas: [], avaliacoes: [],
        apontamentos: [], fichaAvaliacoes: [], presencas: [], adm: []
    };
    var pcoForm = null;
    var pcoCarregouGeral = false;

    var TIPO_PESSOA = [
        { v: 'A', l: 'Acadêmico' }, { v: 'F', l: 'Formado' }
    ];
    var SITUACOES = [
        { v: 'Ativo', l: 'Ativo' }, { v: 'Inativo por Falta', l: 'Inativo por Falta' },
        { v: 'Pediu Baixa', l: 'Pediu Baixa' }, { v: 'Rebaixado', l: 'Rebaixado' },
        { v: 'Formado', l: 'Formado' }
    ];
    var COORD_CAMPOS = [
        { c: 'nome', l: 'Nome completo' }, { c: 'cpf', l: 'CPF' },
        { c: 'matricula', l: 'Matrícula' }, { c: 'nascimento', l: 'Nascimento', t: 'date' },
        { c: 'estadoCivil', l: 'Estado civil' }, { c: 'telefone', l: 'Telefone / WhatsApp' },
        { c: 'email', l: 'E-mail' }, { c: 'genero', l: 'Gênero' },
        { c: 'mae', l: 'Nome da mãe' }, { c: 'pai', l: 'Nome do pai' },
        { c: 'nacionalidade', l: 'Nacionalidade' }, { c: 'naturalidade', l: 'Naturalidade' },
        { c: 'profissao', l: 'Profissão' }, { c: 'cidade', l: 'Cidade' },
        { c: 'estado', l: 'Estado' }, { c: 'senha', l: 'Senha do portal', t: 'password' },
        { c: 'fotoUrl', l: 'URL da foto 3x4' }, { c: 'observacoes', l: 'Observações', t: 'textarea' }
    ];
    var IND_CAMPOS = [
        { c: 'nome', l: 'Nome completo' }, { c: 'cpf', l: 'CPF' },
        { c: 'matricula', l: 'Matrícula' }, { c: 'credencial', l: 'Credencial' },
        { c: 'senha', l: 'Senha do portal', t: 'password' }, { c: 'turma', l: 'Turma' },
        { c: 'projeto', l: 'Projeto' }, { c: 'nascimento', l: 'Nascimento', t: 'date' },
        { c: 'telefone', l: 'Telefone / WhatsApp' }, { c: 'email', l: 'E-mail' },
        { c: 'tipoPessoa', l: 'Tipo de pessoa', t: 'select', o: TIPO_PESSOA },
        { c: 'situacaoCurso', l: 'Situação no curso', t: 'select', o: SITUACOES },
        { c: 'mae', l: 'Nome da mãe' }, { c: 'pai', l: 'Nome do pai' },
        { c: 'cidade', l: 'Cidade' }, { c: 'estado', l: 'Estado' },
        { c: 'fotoUrl', l: 'URL da foto 3x4' }, { c: 'observacoes', l: 'Observações', t: 'textarea' }
    ];
    var DISC_CAMPOS = [
        { c: 'nome', l: 'Nome da disciplina' }, { c: 'docente', l: 'Docente' },
        { c: 'docenteId', l: 'ID do docente' }
    ];
    var AULA_CAMPOS = [
        { c: 'disciplina', l: 'Disciplina' }, { c: 'conteudo', l: 'Conteúdo' },
        { c: 'descricao', l: 'Descrição da aula', t: 'textarea' },
        { c: 'data', l: 'Data' }, { c: 'horario', l: 'Horário' },
        { c: 'docente', l: 'Docente' }, { c: 'docenteId', l: 'ID do docente' },
        { c: 'avTeorica', l: 'AV teórica' }, { c: 'avPratica', l: 'AV prática' }
    ];
    var AV_CAMPOS = [
        { c: 'nome', l: 'Nome da avaliação' },
        { c: 'tipo', l: 'Tipo', t: 'select', o: [
            { v: 'teorica', l: 'Teórica' }, { v: 'pratica', l: 'Prática' },
            { v: 'final_teorica', l: 'Final teórica' }, { v: 'final_pratica', l: 'Final prática' }
        ] },
        { c: 'disciplina', l: 'Disciplina' }, { c: 'aula', l: 'Aula' },
        { c: 'ativa', l: 'Ativa', t: 'bool' },
        { c: 'questoes', l: 'Questões (JSON)', t: 'json' }
    ];
    var ADM_CAMPOS = [
        { c: 'status', l: 'Status' }, { c: 'apontado', l: 'Apontado', t: 'bool' },
        { c: 'docenteId', l: 'ID do docente' }, { c: 'docenteNome', l: 'Docente' },
        { c: 'cursoId', l: 'ID do curso' }, { c: 'cursoNome', l: 'Curso' },
        { c: 'disciplina', l: 'Disciplina' }, { c: 'aula', l: 'Aula' },
        { c: 'aulaDescricao', l: 'Descrição da aula' },
        { c: 'dataAula', l: 'Data da aula' }, { c: 'horaAula', l: 'Hora da aula' },
        { c: 'instrutorQueMinistrou', l: 'Instrutor que ministrou' },
        { c: 'apontadoPorDocente', l: 'Apontado por docente' },
        { c: 'presentes', l: 'Presentes', t: 'number' },
        { c: 'faltas', l: 'Faltas', t: 'number' },
        { c: 'justificadas', l: 'Justificadas', t: 'number' },
        { c: 'docenteApontadoEm', l: 'Apontamento do docente em' },
        { c: 'alunosApontadosEm', l: 'Fechamento dos alunos em' },
        { c: 'apontadoEm', l: 'Apontado em' },
        { c: 'presencaDocente', l: 'Presença do docente (JSON)', t: 'json' },
        { c: 'justificativa', l: 'Justificativa (JSON)', t: 'json' },
        { c: 'localizacao', l: 'Localização / GPS (JSON)', t: 'json' },
        { c: 'qrAula', l: 'QR da aula (JSON)', t: 'json' },
        { c: 'alunos', l: 'Alunos (JSON)', t: 'json' }
    ];

    /* --------------------------- helpers --------------------------- */
    function pcoDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function pcoNormal(v) {
        return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    function pcoEsc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function pcoDataHora(v) {
        if (!v) return '—';
        try { return new Date(v).toLocaleString('pt-BR'); } catch (e) { return String(v); }
    }
    function pcoData(v) {
        if (!v) return '—';
        try { return new Date(v).toLocaleDateString('pt-BR'); } catch (e) { return String(v); }
    }
    function pcoFormatCpf(el) {
        var v = pcoDigitos(el.value).slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        el.value = v;
    }
    function pcoNome() { return (pcoUser && (pcoUser.nome || pcoUser.guerra)) || 'Coordenação'; }
    function pcoMatricula() { return (pcoUser && pcoUser.matricula) || '—'; }
    function pcoFoto() {
        if (!pcoUser) return null;
        var cpf = pcoDigitos(pcoUser.cpf), local = null;
        try { local = localStorage.getItem('farn_photo_' + cpf) || localStorage.getItem('foto3x4_' + cpf); } catch (e) {}
        return pcoUser.foto3x4 || pcoUser.photoDataUrl || pcoUser.foto || pcoUser.fotoUrl || local || null;
    }
    function pcoErro(msg) {
        var e = document.getElementById('pco-erro');
        if (e) { e.textContent = msg; e.style.display = 'block'; }
    }
    function pcoAviso(msg, tipo) {
        var el = document.getElementById('pco-sync-aviso');
        if (!el) return;
        el.textContent = msg;
        el.className = 'pco-aviso' + (tipo ? ' ' + tipo : '');
    }
    function pcoCampo(rotulo, valor) {
        var v = Array.isArray(valor) ? valor.join(', ') : valor;
        return '<div class="pco-campo"><span>' + pcoEsc(rotulo) + '</span><b>' + (v ? pcoEsc(v) : '—') + '</b></div>';
    }
    function pcoCursoRef(sub, id) {
        var base = db.collection('cursosCadastro').doc(String(pcoCursoId)).collection(sub);
        return id ? base.doc(String(id)) : base;
    }
    function pcoLer(ref) {
        var lista = [];
        return ref.get().then(function (snap) {
            snap.forEach(function (d) { lista.push(Object.assign({ _id: d.id }, d.data() || {})); });
            return lista;
        });
    }
    function pcoOrdenar(lista, campo) {
        return lista.sort(function (a, b) {
            return String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR');
        });
    }
    function pcoCursoEmAndamento(c) {
        return pcoNormal(c.status || '') !== 'concluido';
    }
    function pcoSelo(txt, cor) {
        return '<span class="pco-selo ' + cor + '">' + pcoEsc(txt) + '</span>';
    }

    /* ------------------------ sessao / login ----------------------- */
    function pcoSalvarSessao() {
        /* Os modulos do administrador leem currentUserData e ADMIN_CPF para
           liberar as acoes. A coordenacao tera controle total, entao o CPF
           atual e tratado como o CPF administrativo dentro deste portal. */
        window.currentUserData = pcoUser;
        window.ADMIN_CPF = (pcoUser && pcoUser.cpf) || '';
        try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(pcoUser)); } catch (e) {}
        try { localStorage.setItem('farn_user_data', JSON.stringify(pcoUser)); } catch (e) {}
        try { localStorage.setItem('farn_last_cpf', pcoDigitos(pcoUser && pcoUser.cpf)); } catch (e) {}
        /* Nunca herdar sessao administrativa ao abrir o portal isolado. */
        try { localStorage.removeItem('farn_login'); } catch (e) {}
        try { localStorage.removeItem('farn_admin_session'); } catch (e) {}
    }
    function pcoLogin(event) {
        if (event) event.preventDefault();
        var cpf = pcoDigitos((document.getElementById('pco-cpf') || {}).value);
        var senha = (document.getElementById('pco-senha') || {}).value || '';
        var btn = document.getElementById('pco-btn-login');
        if (!cpf || !senha) { pcoErro('Informe o CPF e a senha.'); return false; }
        if (btn) btn.disabled = true;
        var erro = document.getElementById('pco-erro'); if (erro) erro.style.display = 'none';
        db.collection('coordenacao').get().then(function (snap) {
            var encontrado = null;
            snap.forEach(function (doc) {
                if (encontrado) return;
                var d = doc.data() || {};
                if (pcoDigitos(d.cpf) !== cpf) return;
                if (String(d.senha || '') !== senha) return;
                if (String(d.situacao || 'Ativo').toLowerCase() === 'inativo') return;
                encontrado = Object.assign({}, d, { _origem: 'coordenacao', _docId: doc.id, cpf: cpf });
            });
            if (!encontrado) {
                pcoErro('CPF/senha inválidos ou coordenador não cadastrado na seção Coordenação do administrador.');
                if (btn) btn.disabled = false;
                return;
            }
            pcoUser = encontrado;
            pcoSalvarSessao();
            pcoMostrarApp();
        }).catch(function (e) {
            console.error('Portal da Coordenação - login:', e);
            pcoErro('Falha de conexão. Tente novamente.');
            if (btn) btn.disabled = false;
        });
        return false;
    }
    function pcoRestaurarSessao() {
        var salvo = null;
        try { salvo = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) {}
        if (!salvo || !salvo._docId) { pcoMostrarLogin(); return; }
        db.collection('coordenacao').doc(salvo._docId).get().then(function (doc) {
            if (!doc || !doc.exists) { pcoSair(false); pcoMostrarLogin(); return; }
            var dados = doc.data() || {};
            if (String(dados.situacao || 'Ativo').toLowerCase() === 'inativo') {
                pcoSair(false); pcoMostrarLogin(); return;
            }
            pcoUser = Object.assign({}, dados, {
                _origem: 'coordenacao', _docId: salvo._docId,
                cpf: dados.cpf || salvo.cpf
            });
            pcoSalvarSessao();
            pcoMostrarApp();
        }).catch(function (e) {
            console.warn('Portal da Coordenação - revalidacao:', e);
            if (navigator.onLine === false) { pcoUser = salvo; pcoMostrarApp(); return; }
            pcoMostrarLogin();
            pcoErro('Não foi possível validar sua sessão no servidor. Entre novamente.');
        });
    }
    function pcoMostrarLogin() {
        var login = document.getElementById('pco-tela-login'), app = document.getElementById('pco-tela-app');
        if (login) login.style.display = 'flex';
        if (app) app.style.display = 'none';
    }
    function pcoAtualizarCabecalho() {
        ['pco-nome-menu', 'pco-nome-topo', 'pco-inicio-nome'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.textContent = pcoNome();
        });
        var mat = document.getElementById('pco-matricula-menu');
        if (mat) mat.textContent = 'Matrícula: ' + pcoMatricula();
        var mat2 = document.getElementById('pco-matricula-topo');
        if (mat2) mat2.textContent = 'Matrícula: ' + pcoMatricula();
        var info = document.getElementById('pco-inicio-info');
        if (info) info.textContent = 'CPF: ' + pcoDigitos(pcoUser && pcoUser.cpf) + ' · ' + (pcoUser && pcoUser.email ? pcoUser.email : 'Coordenação');
        var badge = document.getElementById('pco-inicio-badges');
        if (badge) badge.innerHTML = pcoSelo(pcoUser && pcoUser.situacao ? pcoUser.situacao : 'Ativo', 'pco-selo-apontada');
        ['pco-foto-topo', 'pco-inicio-foto'].forEach(function (id) {
            var img = document.getElementById(id);
            if (!img) return;
            var foto = pcoFoto();
            if (foto) { img.src = foto; img.style.display = ''; img.classList.remove('pco-sem-foto'); }
            else { img.style.display = 'none'; img.classList.add('pco-sem-foto'); }
        });
        ['pco-foto-topo-ampliar', 'pco-inicio-foto-ampliar'].forEach(function (id) {
            var b = document.getElementById(id);
            if (b) b.style.display = foto ? '' : 'none';
        });
    }
    function pcoMostrarApp() {
        var login = document.getElementById('pco-tela-login'), app = document.getElementById('pco-tela-app');
        if (login) login.style.display = 'none';
        if (app) app.style.display = 'block';
        pcoAtualizarCabecalho();
        pcoRenderDados();
        pcoSetView('inicio');
        if (!pcoCarregouGeral) {
            pcoCarregouGeral = true;
            pcoCarregarTudo();
        }
    }
    function pcoCarregarTudo() {
        pcoCarregarDocentes();
        pcoCarregarCursos();
        pcoCarregarAdm();
    }
    function pcoSair(redirecionar) {
        try {
            localStorage.removeItem(CHAVE_SESSAO);
            localStorage.removeItem('farn_user_data');
            localStorage.removeItem('farn_last_cpf');
            localStorage.removeItem('farn_login');
        } catch (e) {}
        pcoUser = null;
        window.currentUserData = null;
        window.ADMIN_CPF = '';
        pcoCursos = []; pcoCursoId = ''; pcoCarregouGeral = false;
        if (redirecionar !== false) location.href = 'index.html';
    }
    function pcoLogout() { pcoSair(true); }

    /* ---------------------------- menu ----------------------------- */
    function pcoAbrirMenu() {
        var d = document.getElementById('pco-drawer'), o = document.getElementById('pco-overlay');
        if (d) d.classList.add('aberto'); if (o) o.classList.add('aberto');
    }
    function pcoFecharMenu() {
        var d = document.getElementById('pco-drawer'), o = document.getElementById('pco-overlay');
        if (d) d.classList.remove('aberto'); if (o) o.classList.remove('aberto');
    }
    function pcoSetView(view) {
        ['inicio', 'dados', 'docentes', 'alunos', 'apontamento-adm'].forEach(function (v) {
            var box = document.getElementById('pco-view-' + v);
            if (box) box.className = 'pco-view' + (v === view ? ' ativo' : '');
            var btn = document.getElementById('pco-menu-' + v);
            if (btn) btn.className = (v === view ? 'ativo' : '');
        });
        pcoFecharMenu();
        if (view === 'inicio') { pcoRenderResumo(); pcoAtualizarSync(); }
        if (view === 'dados') pcoRenderDados();
        if (view === 'docentes') pcoCarregarDocentes();
        if (view === 'alunos') pcoCarregarCursos();
        if (view === 'apontamento-adm') pcoCarregarAdm();
    }

    /* -------------------------- inicio ----------------------------- */
    function pcoRenderResumo() {
        var box = document.getElementById('pco-resumo-grid');
        if (!box) return;
        box.innerHTML = pcoCampo('Docentes cadastrados', pcoCache.docentes.length)
            + pcoCampo('Cursos em andamento', pcoCursos.length)
            + pcoCampo('Registros do Apontamento ADM', pcoCache.adm.length);
    }
    function pcoAtualizarSync() {
        try {
            var st = db.status() || {};
            pcoAviso('Banco: ' + (st.online === false ? 'offline' : 'online')
                + ' · Pendências de sincronização: ' + (st.pendentes || 0)
                + (st.ultimaSincronizacao ? ' · Última sincronização: ' + pcoDataHora(st.ultimaSincronizacao) : '')
                + '. As alterações são gravadas nas mesmas coleções do administrador.',
                st.online === false ? 'pco-erro-box' : 'pco-ok');
        } catch (e) { pcoAviso('Sincronização gerenciada pelo FarnDB.'); }
    }
    function pcoSincronizar() {
        if (typeof db.sincronizar !== 'function') { alert('Sincronização automática já está ativa.'); return; }
        var r = db.sincronizar();
        Promise.resolve(r).then(function () {
            pcoAtualizarSync();
            alert('Sincronização concluída.');
        }).catch(function (e) {
            pcoAtualizarSync();
            alert('Erro ao sincronizar: ' + (e && e.message ? e.message : e));
        });
    }

    /* ------------------------ meus dados --------------------------- */
    function pcoRenderDados() {
        var box = document.getElementById('pco-dados-grid');
        if (!box || !pcoUser) return;
        box.innerHTML = COORD_CAMPOS.map(function (c) {
            var valor = c.c === 'senha' ? '••••••' : pcoUser[c.c];
            return pcoCampo(c.l, valor);
        }).join('')
            + pcoCampo('Situação', pcoUser.situacao || 'Ativo')
            + pcoCampo('Tipo de registro', pcoUser.tipo || 'coordenacao');
    }
    function pcoEditarMeusDados() {
        if (!pcoUser || !pcoUser._docId) { alert('Sessão sem identificação do cadastro.'); return; }
        pcoAbrirForm('Editar meus dados (Coordenação)', COORD_CAMPOS, pcoUser, function (dados) {
            return db.collection('coordenacao').doc(pcoUser._docId).update(dados).then(function () {
                pcoUser = Object.assign({}, pcoUser, dados);
                pcoSalvarSessao();
                pcoRenderDados();
                pcoAtualizarCabecalho();
            });
        });
    }

    /* ---------------------- dados de docente ----------------------- */
    /* A seção Docente deste portal É o módulo do administrador
       (coordenacao.js): mesmos campos, tabela, botões e ações. Aqui apenas
       carregamos a lista e atualizamos o resumo. */
    function pcoCarregarDocentes() {
        pcoLer(db.collection('docentesAdmin')).then(function (lista) {
            pcoCache.docentes = pcoOrdenar(lista, 'nome');
            if (typeof window.docenteAdminInicializar === 'function') window.docenteAdminInicializar(true);
            pcoRenderResumo();
        }).catch(function (e) {
            console.error('Portal da Coordenação - docentes:', e);
            if (typeof window.docenteAdminInicializar === 'function') window.docenteAdminInicializar(true);
        });
    }
    function pcoRenderDocentes() {
        if (typeof window.docRender === 'function') window.docRender();
    }
    function pcoEditarDocente(id) {
        if (typeof window.docEditar === 'function') window.docEditar(id);
    }

    /* ----------------------- dados de aluno ------------------------ */
    function pcoCarregarCursos() {
        pcoLer(db.collection('cursosCadastro')).then(function (lista) {
            pcoCursos = pcoOrdenar(lista.filter(pcoCursoEmAndamento), 'nome');
            var sel = document.getElementById('pco-curso');
            if (sel) {
                sel.innerHTML = pcoCursos.map(function (c) {
                    return '<option value="' + pcoEsc(c._id) + '">' + pcoEsc(c.nome || c._id) + '</option>';
                }).join('') || '<option value="">Nenhum curso em andamento</option>';
                if (pcoCursoId && pcoCursos.some(function (c) { return String(c._id) === String(pcoCursoId); })) {
                    sel.value = pcoCursoId;
                } else {
                    pcoCursoId = pcoCursos.length ? String(pcoCursos[0]._id) : '';
                }
            }
            pcoRenderResumo();
            if (pcoCursoId) pcoCarregarAlunos(); else pcoLimparAlunos();
        }).catch(function (e) {
            var sel = document.getElementById('pco-curso');
            if (sel) sel.innerHTML = '<option value="">Erro ao carregar cursos</option>';
            console.error('Portal da Coordenação - cursos:', e);
        });
    }
    function pcoOnCursoChange() {
        var sel = document.getElementById('pco-curso');
        pcoCursoId = sel ? String(sel.value || '') : '';
        if (pcoCursoId) pcoCarregarAlunos(); else pcoLimparAlunos();
    }
    function pcoLimparAlunos() {
        Object.keys(pcoCache).forEach(function (k) {
            if (k !== 'docentes' && k !== 'adm') pcoCache[k] = [];
        });
        ['pco-ind-lista', 'pco-disc-lista', 'pco-aula-lista', 'pco-av-lista', 'pco-apt-lista', 'pco-secao-lista']
            .forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = ''; });
    }
    function pcoCarregarAlunos() {
        var subs = ['individuos', 'disciplinas', 'aulas', 'avaliacoes', 'apontamentos', 'fichaAvaliacoes', 'presencas'];
        Promise.all(subs.map(function (s) { return pcoLer(pcoCursoRef(s)); })).then(function (res) {
            subs.forEach(function (s, i) { pcoCache[s] = pcoOrdenar(res[i], s === 'aulas' ? 'data' : 'nome'); });
            pcoRenderIndividuos();
            pcoRenderDisciplinas();
            pcoRenderAulas();
            pcoRenderAvaliacoes();
            pcoRenderApontamentos();
            pcoRenderSecaoAvaliacao();
        }).catch(function (e) {
            console.error('Portal da Coordenação - curso:', e);
            var el = document.getElementById('pco-ind-lista');
            if (el) el.innerHTML = '<p style="color:#dc2626">Erro ao carregar dados do curso: ' + pcoEsc(e.message) + '</p>';
        });
    }
    function pcoSetAba(aba) {
        pcoAba = aba;
        ['individuos', 'aulas', 'avaliacao', 'apontamento', 'secaoavaliacao'].forEach(function (v) {
            var box = document.getElementById('pco-tab-' + v);
            if (box) box.className = 'pco-tab' + (v === aba ? ' ativo' : '');
            var btn = document.getElementById('pco-aba-' + v);
            if (btn) btn.className = (v === aba ? 'ativo' : '');
        });
    }
    function pcoRenderIndividuos() {
        var box = document.getElementById('pco-ind-lista');
        if (!box) return;
        var busca = pcoNormal((document.getElementById('pco-ind-busca') || {}).value || '');
        var lista = pcoCache.individuos.filter(function (p) {
            return !busca || pcoNormal([p.nome, p.cpf, p.matricula, p.turma].join(' ')).indexOf(busca) >= 0;
        });
        if (!lista.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum indivíduo neste curso.</p>'; return; }
        box.innerHTML = '<table class="pco-tabela"><thead><tr><th>Nome</th><th>CPF</th><th>Matrícula</th>'
            + '<th>Turma</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'
            + lista.map(function (p) {
                var sit = p.situacaoCurso || p.status || (p.tipoPessoa === 'F' ? 'Formado' : 'Ativo');
                return '<tr><td><b>' + pcoEsc(p.nome || '—') + '</b></td>'
                    + '<td>' + pcoEsc(pcoDigitos(p.cpf) || '—') + '</td>'
                    + '<td>' + pcoEsc(p.matricula || '—') + '</td>'
                    + '<td>' + pcoEsc(p.turma || '—') + '</td>'
                    + '<td>' + pcoSelo(sit, pcoNormal(sit).indexOf('formado') >= 0 ? 'pco-selo-apontada' : 'pco-selo-pendente') + '</td>'
                    + '<td><button class="pco-btn pco-btn-primary" onclick="pcoEditarIndividuo(\'' + pcoEsc(p._id) + '\')">'
                    + '<i class="fa-solid fa-pen"></i> Editar</button></td></tr>';
            }).join('') + '</tbody></table>';
    }
    /* Espelha a regra do Cadastro de Cursos (ccIndAplicarSituacao) para que
       a edicao da situacao nao fique divergente do painel administrativo. */
    function pcoAplicarSituacao(dados, anterior) {
        var chave = dados.situacaoCurso;
        if (!chave || chave === anterior.situacaoCurso) return dados;
        var agora = new Date().toISOString();
        if (chave === 'Formado') {
            dados.tipoPessoa = 'F';
            dados.status = 'Formado';
            dados.statusOriginal = 'Ativo';
            dados.rebaixado = false;
            dados.pediuBaixa = false;
            dados.inativoPorFaltaEm = '';
            dados.formadoEm = anterior.formadoEm || agora;
            dados.formadoProjeto = anterior.formadoProjeto || anterior.projeto || '';
            dados.formadoTurma = anterior.formadoTurma || anterior.turma || '';
            dados.credencial = anterior.credencial || dados.matricula || '';
        } else {
            dados.tipoPessoa = 'A';
            dados.status = 'Acadêmico';
            dados.rebaixado = (chave === 'Rebaixado');
            dados.pediuBaixa = (chave === 'Pediu Baixa');
            dados.inativoPorFaltaEm = (chave === 'Inativo por Falta') ? (anterior.inativoPorFaltaEm || agora) : '';
            dados.pediuBaixaEm = (chave === 'Pediu Baixa') ? (anterior.pediuBaixaEm || agora) : '';
            dados.rebaixadoEm = (chave === 'Rebaixado') ? (anterior.rebaixadoEm || agora) : '';
            dados.statusOriginal = (chave === 'Ativo') ? 'Ativo' : chave;
        }
        dados.statusAtualizadoEm = agora;
        return dados;
    }
    function pcoEditarIndividuo(id) {
        var p = pcoCache.individuos.find(function (x) { return String(x._id) === String(id); });
        if (!p) { alert('Indivíduo não encontrado.'); return; }
        pcoAbrirForm('Editar indivíduo: ' + (p.nome || ''), IND_CAMPOS, p, function (dados) {
            dados.cpf = pcoDigitos(dados.cpf);
            pcoAplicarSituacao(dados, p);
            return pcoCursoRef('individuos', id).update(dados).then(function () {
                pcoCache.individuos = pcoCache.individuos.map(function (x) {
                    return String(x._id) === String(id) ? Object.assign({}, x, dados) : x;
                });
                pcoRenderIndividuos();
            });
        });
    }
    function pcoRenderDisciplinas() {
        var box = document.getElementById('pco-disc-lista');
        if (!box) return;
        if (!pcoCache.disciplinas.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhuma disciplina cadastrada.</p>'; return; }
        box.innerHTML = '<table class="pco-tabela"><thead><tr><th>Disciplina</th><th>Docente</th><th>ID do docente</th><th>Ações</th></tr></thead><tbody>'
            + pcoCache.disciplinas.map(function (d) {
                return '<tr><td><b>' + pcoEsc(d.nome || '—') + '</b></td><td>' + pcoEsc(d.docente || '—') + '</td>'
                    + '<td>' + pcoEsc(d.docenteId || '—') + '</td>'
                    + '<td><button class="pco-btn pco-btn-primary" onclick="pcoEditarDisciplina(\'' + pcoEsc(d._id) + '\')">'
                    + '<i class="fa-solid fa-pen"></i> Editar</button></td></tr>';
            }).join('') + '</tbody></table>';
    }
    function pcoEditarDisciplina(id) {
        var d = pcoCache.disciplinas.find(function (x) { return String(x._id) === String(id); });
        if (!d) return;
        pcoAbrirForm('Editar disciplina: ' + (d.nome || ''), DISC_CAMPOS, d, function (dados) {
            return pcoCursoRef('disciplinas', id).update(dados).then(function () {
                pcoCache.disciplinas = pcoCache.disciplinas.map(function (x) {
                    return String(x._id) === String(id) ? Object.assign({}, x, dados) : x;
                });
                pcoRenderDisciplinas();
            });
        });
    }
    function pcoRenderAulas() {
        var box = document.getElementById('pco-aula-lista');
        if (!box) return;
        if (!pcoCache.aulas.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhuma aula cadastrada.</p>'; return; }
        box.innerHTML = '<table class="pco-tabela"><thead><tr><th>Data</th><th>Conteúdo / disciplina</th><th>Docente</th>'
            + '<th>Situação</th><th>Ações</th></tr></thead><tbody>'
            + pcoCache.aulas.map(function (a) {
                var seloRepasse = a.repassadaDeDocenteNome ? pcoSelo('Repassada por ' + a.repassadaDeDocenteNome, 'pco-selo-repassada') : '';
                var selo = a.apontada ? pcoSelo('Apontada', 'pco-selo-apontada') : pcoSelo('Não apontada', 'pco-selo-pendente');
                return '<tr><td>' + pcoEsc(a.data || '—') + (a.horario ? ' ' + pcoEsc(a.horario) : '') + '</td>'
                    + '<td><b>' + pcoEsc(a.conteudo || a.descricao || a.disciplina || '—') + '</b>'
                    + (a.disciplina ? '<small>' + pcoEsc(a.disciplina) + '</small>' : '') + '</td>'
                    + '<td>' + pcoEsc(a.docente || '—') + '</td>'
                    + '<td>' + selo + (seloRepasse ? '<br>' + seloRepasse : '') + '</td>'
                    + '<td><button class="pco-btn pco-btn-primary" onclick="pcoEditarAula(\'' + pcoEsc(a._id) + '\')">'
                    + '<i class="fa-solid fa-pen"></i> Editar</button></td></tr>';
            }).join('') + '</tbody></table>';
    }
    function pcoEditarAula(id) {
        var a = pcoCache.aulas.find(function (x) { return String(x._id) === String(id); });
        if (!a) return;
        pcoAbrirForm('Editar aula: ' + (a.conteudo || a.data || ''), AULA_CAMPOS, a, function (dados) {
            return pcoCursoRef('aulas', id).update(dados).then(function () {
                pcoCache.aulas = pcoCache.aulas.map(function (x) {
                    return String(x._id) === String(id) ? Object.assign({}, x, dados) : x;
                });
                pcoRenderAulas();
            });
        });
    }
    function pcoRenderAvaliacoes() {
        var box = document.getElementById('pco-av-lista');
        if (!box) return;
        if (!pcoCache.avaliacoes.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhuma avaliação criada neste curso.</p>'; return; }
        box.innerHTML = '<table class="pco-tabela"><thead><tr><th>Avaliação</th><th>Tipo</th><th>Disciplina / aula</th>'
            + '<th>Questões</th><th>Status</th><th>Ações</th></tr></thead><tbody>'
            + pcoCache.avaliacoes.map(function (a) {
                var tipo = String(a.tipo || 'teorica').replace('_', ' ');
                return '<tr><td><b>' + pcoEsc(a.nome || '—') + '</b></td><td>' + pcoEsc(tipo) + '</td>'
                    + '<td>' + pcoEsc([a.disciplina, a.aula].filter(Boolean).join(' · ') || '—') + '</td>'
                    + '<td>' + ((a.questoes || []).length) + '</td>'
                    + '<td>' + pcoSelo(a.ativa ? 'Ativa' : (a.enviada ? 'Enviada' : 'Inativa'), a.ativa ? 'pco-selo-apontada' : 'pco-selo-pendente') + '</td>'
                    + '<td><button class="pco-btn pco-btn-primary" onclick="pcoEditarAvaliacao(\'' + pcoEsc(a._id) + '\')">'
                    + '<i class="fa-solid fa-pen"></i> Editar</button></td></tr>';
            }).join('') + '</tbody></table>';
    }
    function pcoEditarAvaliacao(id) {
        var a = pcoCache.avaliacoes.find(function (x) { return String(x._id) === String(id); });
        if (!a) return;
        pcoAbrirForm('Editar avaliação: ' + (a.nome || ''), AV_CAMPOS, a, function (dados) {
            return pcoCursoRef('avaliacoes', id).update(Object.assign({}, dados, {
                atualizadoEm: new Date().toISOString()
            })).then(function () {
                pcoCache.avaliacoes = pcoCache.avaliacoes.map(function (x) {
                    return String(x._id) === String(id) ? Object.assign({}, x, dados) : x;
                });
                pcoRenderAvaliacoes();
            });
        });
    }
    function pcoNovaAvaliacao() {
        if (!pcoCursoId) { alert('Selecione um curso em andamento.'); return; }
        var agora = new Date().toISOString();
        pcoAbrirForm('Nova avaliação', AV_CAMPOS, {
            tipo: 'teorica', ativa: false, questoes: []
        }, function (dados) {
            return pcoCursoRef('avaliacoes').add(Object.assign({}, dados, {
                cursoId: pcoCursoId,
                criadoEm: agora,
                atualizadoEm: agora
            })).then(function () {
                pcoRenderAvaliacoes();
                pcoCarregarAlunos();
            });
        });
    }
    function pcoRenderApontamentos() {
        var box = document.getElementById('pco-apt-lista');
        if (!box) return;
        if (!pcoCache.apontamentos.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum apontamento neste curso.</p>'; return; }
        box.innerHTML = '<table class="pco-tabela"><thead><tr><th>Aula</th><th>Disciplina</th><th>Data</th>'
            + '<th>Presentes</th><th>Faltas</th><th>Justificadas</th><th>Ações</th></tr></thead><tbody>'
            + pcoCache.apontamentos.map(function (a) {
                return '<tr><td><b>' + pcoEsc(a.aula || '—') + '</b></td><td>' + pcoEsc(a.disciplina || '—') + '</td>'
                    + '<td>' + pcoEsc(a.dataAula || pcoData(a.criadoEm)) + '</td>'
                    + '<td>' + (a.presentes || 0) + '</td><td>' + (a.faltas || 0) + '</td><td>' + (a.justificadas || 0) + '</td>'
                    + '<td>' + pcoSelo('Somente leitura', 'pco-selo-pendente') + '</td></tr>';
            }).join('') + '</tbody></table>';
    }
    function pcoRenderSecaoAvaliacao() {
        var box = document.getElementById('pco-secao-lista');
        if (!box) return;
        if (!pcoCache.individuos.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum indivíduo neste curso.</p>'; return; }
        box.innerHTML = pcoCache.individuos.map(function (p) {
            var cpfAluno = pcoDigitos(p.cpf);
            var snap = pcoCache.fichaAvaliacoes.find(function (f) {
                return pcoDigitos(f.cpf) === cpfAluno || String(f._id) === cpfAluno;
            }) || {};
            var av = snap.av || {};
            var notasT = Object.keys(av.notasTeoricas || {}).map(function (k) { return Number(av.notasTeoricas[k]) || 0; });
            var notasP = Object.keys(av.notasPraticas || {}).map(function (k) { return Number(av.notasPraticas[k]) || 0; });
            function media(arr) { return arr.length ? (arr.reduce(function (a, b) { return a + b; }, 0) / arr.length).toFixed(1) : '—'; }
            return '<div class="pco-linha"><b>' + pcoEsc(p.nome || '—') + '</b> · ' + pcoEsc(pcoDigitos(p.cpf) || '—')
                + '<small>Média teórica: ' + media(notasT) + ' · Média prática: ' + media(notasP)
                + ' · AV final: ' + (av.avFinalTeorica || av.avFinalPratica ? pcoEsc(String(av.avFinalTeorica || '—') + ' / ' + String(av.avFinalPratica || '—')) : '—')
                + ' · Fichas sincronizadas: ' + ((snap.presencas || []).length) + ' presenças / ' + ((snap.apontamentos || []).length) + ' apontamentos</small>'
                + '<div style="margin-top:6px">' + pcoSelo('Somente leitura', 'pco-selo-pendente') + '</div></div>';
        }).join('');
    }

    /* ---------------------- apontamento ADM ------------------------ */
    function pcoCarregarAdm() {
        pcoLer(db.collection('apontamentosAdm')).then(function (lista) {
            lista.sort(function (a, b) {
                return String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || ''));
            });
            pcoCache.adm = lista;
            pcoRenderAdm();
            pcoRenderResumo();
        }).catch(function (e) {
            var box = document.getElementById('pco-adm-lista');
            if (box) box.innerHTML = '<p style="color:#dc2626">Erro ao carregar apontamentos: ' + pcoEsc(e.message) + '</p>';
        });
    }
    function pcoRenderAdm() {
        var box = document.getElementById('pco-adm-lista');
        if (!box) return;
        var busca = pcoNormal((document.getElementById('pco-adm-busca') || {}).value || '');
        var lista = pcoCache.adm.filter(function (a) {
            return !busca || pcoNormal([a.docenteNome, a.cursoNome, a.disciplina, a.aula, a.aulaDescricao, a.status].join(' ')).indexOf(busca) >= 0;
        });
        if (!lista.length) { box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Nenhum apontamento encontrado.</p>'; return; }
        box.innerHTML = '<table class="pco-tabela"><thead><tr><th>Docente</th><th>Curso</th><th>Aula</th>'
            + '<th>Status</th><th>Docente em</th><th>Alunos em</th><th>Ações</th></tr></thead><tbody>'
            + lista.map(function (a) {
                return '<tr><td><b>' + pcoEsc(a.docenteNome || '—') + '</b></td>'
                    + '<td>' + pcoEsc(a.cursoNome || '—') + '</td>'
                    + '<td>' + pcoEsc(a.aulaDescricao || a.aula || a.disciplina || '—') + '</td>'
                    + '<td>' + pcoSelo(a.status || 'Pendente', a.apontado ? 'pco-selo-apontada' : 'pco-selo-pendente') + '</td>'
                    + '<td>' + pcoEsc(pcoDataHora(a.docenteApontadoEm)) + '</td>'
                    + '<td>' + pcoEsc(pcoDataHora(a.alunosApontadosEm)) + '</td>'
                    + '<td><button class="pco-btn pco-btn-primary" onclick="pcoEditarAdm(\'' + pcoEsc(a._id) + '\')">'
                    + '<i class="fa-solid fa-pen"></i> Editar</button></td></tr>';
            }).join('') + '</tbody></table>';
    }
    function pcoEditarAdm(id) {
        var a = pcoCache.adm.find(function (x) { return String(x._id) === String(id); });
        if (!a) return;
        pcoAbrirForm('Editar apontamento ADM: ' + (a._id || ''), ADM_CAMPOS, a, function (dados) {
            return db.collection('apontamentosAdm').doc(String(id)).update(Object.assign({}, dados, {
                atualizadoEm: new Date().toISOString()
            })).then(function () {
                pcoCache.adm = pcoCache.adm.map(function (x) {
                    return String(x._id) === String(id) ? Object.assign({}, x, dados) : x;
                });
                pcoRenderAdm();
            });
        });
    }

    /* ------------------------- formulario -------------------------- */
    function pcoCampoHtml(c, valor) {
        var id = 'pco-campo-' + c.c;
        var tipo = c.t || 'text';
        var v = valor == null ? '' : valor;
        if (tipo === 'json') v = JSON.stringify(valor == null ? {} : valor, null, 2);
        if (tipo === 'bool') {
            var sim = v === true || String(v).toLowerCase() === 'sim' || String(v) === 'true' || String(v) === '1';
            return '<label for="' + id + '">' + pcoEsc(c.l) + '</label><select id="' + id + '">'
                + '<option value="0"' + (sim ? '' : ' selected') + '>Não</option>'
                + '<option value="1"' + (sim ? ' selected' : '') + '>Sim</option></select>';
        }
        if (tipo === 'select') {
            var opcoes = (c.o || []).map(function (o) {
                return '<option value="' + pcoEsc(o.v) + '"' + (String(v) === String(o.v) ? ' selected' : '') + '>' + pcoEsc(o.l) + '</option>';
            }).join('');
            return '<label for="' + id + '">' + pcoEsc(c.l) + '</label><select id="' + id + '">' + opcoes + '</select>';
        }
        var estilo = (tipo === 'textarea' || tipo === 'json') ? 'grid-column:1/-1;min-height:90px;font-family:monospace' : '';
        if (tipo === 'textarea' || tipo === 'json') {
            return '<label for="' + id + '">' + pcoEsc(c.l) + '</label><textarea id="' + id + '" rows="4" style="' + estilo + '">'
                + pcoEsc(v) + '</textarea>';
        }
        var htmlType = tipo === 'date' ? 'date' : (tipo === 'password' ? 'password' : 'text');
        return '<label for="' + id + '">' + pcoEsc(c.l) + '</label><input type="' + htmlType + '" id="' + id + '" value="' + pcoEsc(v) + '">';
    }
    function pcoAbrirForm(titulo, campos, dados, salvar) {
        pcoForm = { titulo: titulo, campos: campos, dados: dados || {}, salvar: salvar };
        var tit = document.getElementById('pco-modal-titulo');
        var box = document.getElementById('pco-modal-corpo');
        var m = document.getElementById('pco-modal');
        if (!tit || !box || !m) { alert('Janela de edição indisponível.'); return; }
        tit.textContent = titulo;
        box.innerHTML = '<div style="font-size:10px;color:#64748b;margin-bottom:10px">'
            + 'Alteração gravada na mesma coleção usada pelo administrador e sincronizada pelo FarnDB.</div>'
            + '<div class="pco-form-grid">' + campos.map(function (c) {
                return pcoCampoHtml(c, pcoForm.dados[c.c]);
            }).join('') + '</div>';
        var btn = document.getElementById('pco-modal-salvar');
        if (btn) btn.disabled = false;
        m.classList.add('aberto');
    }
    function pcoFecharForm() {
        pcoForm = null;
        var m = document.getElementById('pco-modal');
        if (m) m.classList.remove('aberto');
    }
    function pcoColetarForm() {
        if (!pcoForm) return {};
        var saida = {};
        pcoForm.campos.forEach(function (c) {
            var el = document.getElementById('pco-campo-' + c.c);
            if (!el) return;
            var tipo = c.t || 'text';
            var v = el.value;
            if (tipo === 'json') {
                try { v = JSON.parse(v || '{}'); }
                catch (e) { throw new Error('JSON inválido no campo "' + c.l + '".'); }
            } else if (tipo === 'bool') {
                v = String(v) === '1';
            } else if (tipo === 'number') {
                v = Number(v || 0);
            } else {
                v = String(v || '').trim();
            }
            saida[c.c] = v;
        });
        return saida;
    }
    function pcoFormSalvar() {
        if (!pcoForm) return;
        var btn = document.getElementById('pco-modal-salvar');
        if (btn) btn.disabled = true;
        var dados;
        try { dados = pcoColetarForm(); }
        catch (e) { alert(e.message); if (btn) btn.disabled = false; return; }
        Promise.resolve(pcoForm.salvar(dados)).then(function () {
            pcoFecharForm();
            try {
                var st = db.status() || {};
                if (st.online === false || st.pendentes > 0) alert('Alteração salva localmente. Aguardando sincronização com o servidor.');
                else alert('Alteração salva e sincronizada com o administrador.');
            } catch (e) { alert('Alteração salva.'); }
        }).catch(function (e) {
            console.error('Portal da Coordenação - salvar:', e);
            alert('Erro ao salvar: ' + (e && e.message ? e.message : e));
            if (btn) btn.disabled = false;
        });
    }

    /* --------------------------- exports --------------------------- */
    window.pcoLogin = pcoLogin;
    window.pcoFormatCpf = pcoFormatCpf;
    window.pcoLogout = pcoLogout;
    window.pcoAbrirMenu = pcoAbrirMenu;
    window.pcoFecharMenu = pcoFecharMenu;
    window.pcoSetView = pcoSetView;
    window.pcoSincronizar = pcoSincronizar;
    window.pcoEditarMeusDados = pcoEditarMeusDados;
    window.pcoRenderDocentes = pcoRenderDocentes;
    window.pcoEditarDocente = pcoEditarDocente;
    window.pcoOnCursoChange = pcoOnCursoChange;
    window.pcoSetAba = pcoSetAba;
    window.pcoRenderIndividuos = pcoRenderIndividuos;
    window.pcoEditarIndividuo = pcoEditarIndividuo;
    window.pcoEditarDisciplina = pcoEditarDisciplina;
    window.pcoEditarAula = pcoEditarAula;
    window.pcoEditarAvaliacao = pcoEditarAvaliacao;
    window.pcoNovaAvaliacao = pcoNovaAvaliacao;
    window.pcoRenderAdm = pcoRenderAdm;
    window.pcoEditarAdm = pcoEditarAdm;
    window.pcoFecharForm = pcoFecharForm;
    window.pcoFormSalvar = pcoFormSalvar;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pcoRestaurarSessao);
    else pcoRestaurarSessao();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('service-worker.js').catch(function () {});
        });
    }
})();
