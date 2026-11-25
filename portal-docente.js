/* =====================================================================
   PORTAL DO DOCENTE
   ---------------------------------------------------------------------
   Fonte unica de login e vinculos: docentesAdmin (secao Docente do admin).
   As aulas vem de cursosCadastro/{cid}/aulas e sao filtradas pelo docente
   gravado no campo "Selecione o Docente" (docenteId ou docente).

   O apontamento e salvo em tres lugares, sempre com o mesmo aulaId:
   1) cursosCadastro/{cid}/apontamentos -> guia Apontamento do Cadastro de
      Cursos do administrador (mesmo formato usado por ccSalvarApontamento);
   2) docentesAdmin/{docenteId}/apontamentos -> lista propria do docente;
   3) apontamentosAdm/aula-<aulaId> -> status "Apontado" no Apontamento ADM.
   ===================================================================== */
(function () {
    'use strict';

    var CHAVE_SESSAO = 'docente_sessao';
    var firebaseConfig = {
        apiKey: 'AIzaSyCjKeFfSkQp9wPxsEytxr9Vrl9g_HmdfF0',
        authDomain: 'farn-app.firebaseapp.com',
        databaseURL: 'https://farn-app-default-rtdb.firebaseio.com',
        projectId: 'farn-app',
        storageBucket: 'farn-app.firebasestorage.app',
        messagingSenderId: '16254677061',
        appId: '1:16254677061:web:3d42c64edfe5cdbffcf32c'
    };
    if (window.firebase && firebase.apps && !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    var db = new FarnDB('https://howto-alliance-pest-contest.trycloudflare.com');

    var pdUser = null;
    var pdCursos = [];
    var pdTurmas = [];
    var pdAulas = [];
    var pdAula = null;
    var pdAlunos = [];
    var pdPresencas = {};
    var scanner = null;
    var escaneando = false;
    var ultimoScan = { texto: '', em: 0 };
    var ultimoAluno = { cpf: '', em: 0 };
    var audioCtx = null;

    /* ---------- helpers ---------- */
    function pdDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function pdUpper(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
    function pdKey(v) {
        return pdUpper(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9]/g, '');
    }
    function pdEsc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function pdFormatCpf(el) {
        var v = pdDigitos(el.value).slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        el.value = v;
    }
    function pdLista(v) {
        if (v == null || v === '') return [];
        if (Array.isArray(v)) return v.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
        return String(v).split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    function pdNome() { return (pdUser && (pdUser.nome || pdUser.guerra)) || 'Docente'; }
    function pdMatricula() { return (pdUser && (pdUser.matricula || pdUser.matriculaDocente)) || '—'; }
    function pdFoto() {
        if (!pdUser) return null;
        var cpf = pdDigitos(pdUser.cpf);
        var local = null;
        try { local = localStorage.getItem('farn_photo_' + cpf) || localStorage.getItem('foto3x4_' + cpf); } catch (e) {}
        return pdUser.foto3x4 || pdUser.photoDataUrl || pdUser.foto || pdUser.fotoUrl || local || null;
    }
    function pdErro(msg) {
        var e = document.getElementById('pd-erro');
        if (e) { e.textContent = msg; e.style.display = 'block'; }
    }
    function pdCampo(rotulo, valor) {
        var v = Array.isArray(valor) ? valor.join(', ') : valor;
        return '<div class="pd-campo"><span>' + pdEsc(rotulo) + '</span><b>' + (v ? pdEsc(v) : '—') + '</b></div>';
    }
    function pdDataHora(v) {
        if (!v) return '—';
        try { return new Date(v).toLocaleString('pt-BR'); } catch (e) { return String(v); }
    }
    function pdDataCurto(v) {
        if (!v) return '';
        try { return new Date(v).toLocaleDateString('pt-BR'); } catch (e) { return String(v); }
    }
    function pdStatus(msg, tipo) {
        var el = document.getElementById('pd-qr-status');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = tipo === 'ok' ? '#166534' : (tipo === 'erro' ? '#991b1b' : '#1d4ed8');
    }

    /* ---------- login / sessao ---------- */
    function pdSalvarSessao() {
        try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(pdUser)); } catch (e) {}
        try { localStorage.setItem('farn_user_data', JSON.stringify(pdUser)); } catch (e) {}
        try { localStorage.setItem('farn_last_cpf', pdDigitos(pdUser && pdUser.cpf)); } catch (e) {}
    }

    function pdLogin(event) {
        if (event) event.preventDefault();
        var cpf = pdDigitos((document.getElementById('pd-cpf') || {}).value);
        var senha = (document.getElementById('pd-senha') || {}).value || '';
        var btn = document.getElementById('pd-btn-login');
        if (!cpf || !senha) { pdErro('Informe o CPF e a senha.'); return false; }
        if (btn) { btn.disabled = true; }
        var erro = document.getElementById('pd-erro'); if (erro) erro.style.display = 'none';
        db.collection('docentesAdmin').where('cpf', '==', cpf).limit(1).get().then(function (snap) {
            var encontrado = null;
            snap.forEach(function (doc) {
                if (encontrado) return;
                var d = doc.data() || {};
                if (d.senha !== senha) return;
                encontrado = Object.assign({}, d, { _origem: 'docentesAdmin', _docId: doc.id, cpf: cpf });
            });
            if (!encontrado) {
                pdErro('CPF/senha inválidos ou docente não cadastrado na seção Docente do administrador.');
                if (btn) btn.disabled = false;
                return;
            }
            pdUser = encontrado;
            pdSalvarSessao();
            pdMostrarApp();
        }).catch(function (e) {
            console.error('Portal do Docente - login:', e);
            pdErro('Falha de conexão. Tente novamente.');
            if (btn) btn.disabled = false;
        });
        return false;
    }

    function pdRestaurarSessao() {
        var salvo = null;
        try { salvo = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) {}
        if (!salvo || !salvo._docId) { pdMostrarLogin(); return; }
        db.collection('docentesAdmin').doc(salvo._docId).get().then(function (doc) {
            if (!doc || !doc.exists) { pdSair(false); return; }
            pdUser = Object.assign({}, doc.data() || {}, {
                _origem: 'docentesAdmin',
                _docId: salvo._docId,
                cpf: (doc.data() || {}).cpf || salvo.cpf
            });
            pdSalvarSessao();
            pdMostrarApp();
        }).catch(function (e) {
            console.warn('Portal do Docente - revalidacao:', e);
            if (navigator.onLine === false) {
                pdUser = salvo;
                pdMostrarApp();
                return;
            }
            pdMostrarLogin();
            pdErro('Não foi possível validar sua sessão no servidor. Entre novamente.');
        });
    }

    function pdMostrarLogin() {
        var login = document.getElementById('pd-tela-login'), app = document.getElementById('pd-tela-app');
        if (login) login.style.display = 'flex';
        if (app) app.style.display = 'none';
    }
    function pdMostrarApp() {
        var login = document.getElementById('pd-tela-login'), app = document.getElementById('pd-tela-app');
        if (login) login.style.display = 'none';
        if (app) app.style.display = 'block';
        pdCursos = pdLista(pdUser.cursos);
        pdTurmas = pdLista(pdUser.turma);
        pdAplicarCabecalho();
        pdRenderInicio();
        pdRenderDados();
        pdCarregarAulas();
        pdCarregarHistorico();
    }
    function pdAplicarCabecalho() {
        var nome = pdNome(), mat = pdMatricula();
        [['pd-nome-menu', nome], ['pd-nome-topo', nome], ['pd-inicio-nome', nome]].forEach(function (x) {
            var el = document.getElementById(x[0]); if (el) el.textContent = x[1];
        });
        [['pd-matricula-menu', 'Matrícula: ' + mat], ['pd-matricula-topo', 'Matrícula: ' + mat], ['pd-inicio-guerra', (pdUser && pdUser.guerra) || '—']].forEach(function (x) {
            var el = document.getElementById(x[0]); if (el) el.textContent = x[1];
        });
        var foto = pdFoto();
        [['pd-foto-topo', 'pd-sem-foto'], ['pd-inicio-foto', '']].forEach(function (x) {
            var el = document.getElementById(x[0]);
            if (!el) return;
            if (foto) { el.src = foto; el.style.display = ''; el.classList.remove(x[1]); }
            else { el.style.display = 'none'; el.classList.add(x[1]); }
        });
        var badges = document.getElementById('pd-inicio-badges');
        if (badges) {
            badges.innerHTML = '<span class="pd-selo pd-selo-presente">' + pdCursos.length + ' curso(s)</span> '
                + '<span class="pd-selo pd-selo-presente">' + pdTurmas.length + ' turma(s)</span>';
        }
    }

    /* ---------- menu ---------- */
    function pdAbrirMenu() {
        var d = document.getElementById('pd-drawer'), o = document.getElementById('pd-overlay');
        if (d) d.classList.add('aberto'); if (o) o.classList.add('aberto');
    }
    function pdFecharMenu() {
        var d = document.getElementById('pd-drawer'), o = document.getElementById('pd-overlay');
        if (d) d.classList.remove('aberto'); if (o) o.classList.remove('aberto');
    }
    function pdSetView(view) {
        ['inicio', 'dados', 'aulas', 'apontar'].forEach(function (v) {
            var box = document.getElementById('pd-view-' + v); if (box) box.className = 'pd-view' + (v === view ? ' ativo' : '');
            var btn = document.getElementById('pd-menu-' + v); if (btn) btn.className = (v === view ? 'ativo' : '');
        });
        pdFecharMenu();
        if (view === 'dados') pdRenderDados();
        if (view === 'aulas') pdRenderMinhasAulas();
        if (view === 'apontar') { if (!pdAulas.length) pdCarregarAulas(); pdCarregarHistorico(); }
    }

    /* ---------- inicio / dados ---------- */
    function pdRenderInicio() {
        var box = document.getElementById('pd-inicio-vinculos');
        if (!box) return;
        box.innerHTML = pdCampo('Nome completo', pdUser.nome)
            + pdCampo('Nome de guerra', pdUser.guerra)
            + pdCampo('Matrícula', pdMatricula())
            + pdCampo('Cursos em que atua', pdCursos.join(', '))
            + pdCampo('Turmas', pdTurmas.join(', '))
            + pdCampo('Projetos', pdLista(pdUser.projeto).join(', '))
            + pdCampo('Disciplinas', pdLista(pdUser.disciplinas).join(', '));
    }
    function pdRenderDados() {
        var box = document.getElementById('pd-dados-grid');
        if (!box || !pdUser) return;
        var campos = [
            ['Nome completo', pdUser.nome], ['Nome de guerra', pdUser.guerra], ['CPF', pdDigitos(pdUser.cpf)],
            ['Matrícula', pdUser.matricula], ['Gênero', pdUser.genero], ['Nascimento', pdUser.nascimento],
            ['Fone / WhatsApp', pdUser.fone], ['E-mail', pdUser.email], ['Patente / Posto', pdUser.patente],
            ['Cursos em que atua', pdCursos.join(', ')], ['Turmas', pdTurmas.join(', ')],
            ['Projetos', pdLista(pdUser.projeto).join(', ')], ['Disciplinas', pdLista(pdUser.disciplinas).join(', ')]
        ];
        box.innerHTML = campos.map(function (c) { return pdCampo(c[0], c[1]); }).join('');
    }

    /* ---------- secao MINHAS AULAS ---------- */
    function pdAulaApontada(a) {
        if (!a) return false;
        if (a.apontada === true || a.apontada === 'true' || a.apontada === 'Sim') return true;
        if (a.apontamentoId) return true;
        return !!a.apontadoPorDocenteId;
    }
    function pdRenderMinhasAulas() {
        var box = document.getElementById('pd-minhas-aulas-lista'); if (!box) return;
        var aviso = document.getElementById('pd-aulas-aviso');
        if (aviso) {
            var apontadas = pdAulas.filter(pdAulaApontada).length;
            aviso.textContent = pdAulas.length
                ? pdAulas.length + ' aula(s) cadastrada(s) para você · ' + apontadas + ' apontada(s)'
                : 'Nenhuma aula cadastrada para você na guia Disciplinas e Aulas do Cadastro de Cursos.';
            aviso.className = 'pd-aviso ' + (pdAulas.length ? 'pd-ok' : 'pd-erro-box');
        }
        if (!pdAulas.length) { box.innerHTML = ''; return; }
        var grupos = {};
        pdAulas.forEach(function (a) {
            var chave = String(a.cursoNome || 'Curso') + '|' + String(a.turma || a.projeto || 'Sem turma');
            if (!grupos[chave]) {
                grupos[chave] = {
                    curso: a.cursoNome || 'Curso',
                    turma: a.turma || a.projeto || 'Sem turma',
                    aulas: []
                };
            }
            grupos[chave].aulas.push(a);
        });
        box.innerHTML = Object.keys(grupos).map(function (k) {
            var g = grupos[k];
            var temRepassada = g.aulas.some(function (a) { return !!a.repassadaDeDocenteNome; });
            return '<div style="margin-bottom:18px">'
                + '<div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px">'
                + pdEsc(g.curso) + (g.turma !== 'Sem turma' ? ' · ' + pdEsc(g.turma) : '')
                + ' <span style="font-size:10px;color:#64748b">(' + g.aulas.length + ' aula(s))</span>'
                + (temRepassada ? ' <span style="font-size:10px;color:#b91c1c">· contém aula repassada</span>' : '')
                + '</div>'
                + g.aulas.map(function (a) {
                    var apontada = pdAulaApontada(a);
                    var instrutor = a.docente || a.instrutor || 'Não informado';
                    if (apontada && (a.instrutorQueMinistrou || a.docenteOriginalNome)) {
                        instrutor = a.instrutorQueMinistrou || a.docenteOriginalNome;
                    }
                    var proximo = a.proximoDocente || a.docenteDestino || '';
                    return '<div class="pd-aula-linha' + (apontada ? ' pd-apontada' : '') + '">'
                        + '<div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">'
                        + '<div style="flex:1;min-width:190px">'
                        + '<b>' + pdEsc(a.conteudo || a.disciplina || 'Aula') + '</b>'
                        + '<small>' + pdEsc([pdDataCurto(a.data), a.horario].filter(Boolean).join(' · ')) + '</small>'
                        + '<div class="pd-instrutor"><i class="fa-solid fa-chalkboard-user" style="margin-right:5px"></i> '
                        + (apontada ? 'Ministrada por: ' : 'Vai ministrar: ') + pdEsc(instrutor) + '</div>'
                        + (proximo ? '<div class="pd-instrutor" style="color:#1d4ed8">Próximo docente: ' + pdEsc(proximo) + '</div>' : '')
                        + (a.repassadaDeDocenteNome
                            ? '<div class="pd-repasso">Repassada por: ' + pdEsc(a.repassadaDeDocenteNome) + '</div>'
                            : '')
                        + '</div>'
                        + '<div style="text-align:right">'
                        + '<span class="pd-selo ' + (apontada ? 'pd-selo-apontada' : 'pd-selo-pendente') + '">'
                        + (apontada ? 'Encerrada e apontada' : 'Ainda não apontada') + '</span>'
                        + '<div style="margin-top:8px"><button class="pd-btn pd-btn-warn" onclick="pdAbrirRepassar(\'' + pdEsc(a._id) + '\')">'
                        + '<i class="fa-solid fa-arrow-right-arrow-left" style="margin-right:5px"></i> Repassar Aula</button></div>'
                        + '</div></div></div>';
                }).join('')
                + '</div>';
        }).join('');
    }

    var pdRepassarAulaId = '';
    function pdAbrirRepassar(id) {
        var a = pdAulas.find(function (x) { return String(x._id) === String(id); });
        if (!a) { pdStatus('Aula não encontrada.', 'erro'); return; }
        pdRepassarAulaId = String(a._id);
        var det = document.getElementById('pd-repassar-detalhe');
        if (det) {
            det.innerHTML = 'Aula: <b>' + pdEsc(a.conteudo || a.disciplina || '') + '</b><br>'
                + 'Curso: ' + pdEsc(a.cursoNome || '') + '<br>'
                + 'Docente atual: <b>' + pdEsc(a.docente || 'não informado') + '</b>';
        }
        var sel = document.getElementById('pd-repassar-docente');
        if (sel) {
            sel.innerHTML = '<option value="">Carregando docentes...</option>';
            db.collection('docentesAdmin').get().then(function (snap) {
                var lista = [];
                snap.forEach(function (d) {
                    var x = d.data() || {};
                    if (String(d.id) === String(pdUser && pdUser._docId)) return;
                    if (String(a.docenteId || '') === String(d.id)) return;
                    lista.push({ id: d.id, nome: x.nome || '', matricula: x.matricula || '' });
                });
                lista.sort(function (x, y) { return String(x.nome).localeCompare(String(y.nome), 'pt-BR'); });
                sel.innerHTML = '<option value="">Selecione o docente...</option>' + lista.map(function (x) {
                    return '<option value="' + pdEsc(x.id) + '" data-nome="' + pdEsc(x.nome) + '">'
                        + pdEsc(x.nome) + (x.matricula ? ' — ' + pdEsc(x.matricula) : '') + '</option>';
                }).join('');
            }).catch(function (e) {
                sel.innerHTML = '<option value="">Erro ao carregar docentes</option>';
                console.warn('Docentes para repasse:', e);
            });
        }
        var modal = document.getElementById('pd-repassar-modal');
        if (modal) modal.classList.add('aberto');
    }
    function pdFecharRepassar() {
        pdRepassarAulaId = '';
        var modal = document.getElementById('pd-repassar-modal');
        if (modal) modal.classList.remove('aberto');
    }
    function pdConfirmarRepassar() {
        var a = pdAulas.find(function (x) { return String(x._id) === String(pdRepassarAulaId); });
        var sel = document.getElementById('pd-repassar-docente');
        var destId = sel ? String(sel.value || '') : '';
        var destNome = '';
        if (sel && sel.selectedIndex >= 0) destNome = sel.options[sel.selectedIndex].getAttribute('data-nome') || '';
        if (!a || !destId || !destNome) { alert('Selecione o docente que vai receber a aula.'); return false; }
        var deId = String(pdUser && pdUser._docId || '');
        var deNome = pdNome();
        var agora = new Date().toISOString();
        var btn = document.querySelector('#pd-repassar-modal .pd-btn-primary');
        if (btn) btn.disabled = true;
        var cid = String(a.cursoId || '');
        db.collection('cursosCadastro').doc(cid).collection('aulas').doc(String(a._id)).update({
            docenteId: destId,
            docente: destNome,
            docenteOriginalNome: deNome || a.docenteOriginalNome || a.docente || '',
            repassadaDeDocenteId: deId,
            repassadaDeDocenteNome: deNome,
            repassadaEm: agora,
            repassadaPor: deNome,
            atualizadoEm: agora
        }).then(function () {
            var docId = 'aula-' + String(a._id).replace(/[^A-Za-z0-9_-]/g, '_');
            return db.collection('apontamentosAdm').doc(docId).set({
                docenteId: destId,
                docenteNome: destNome,
                instrutorQueMinistrou: deNome || a.docenteOriginalNome || a.docente || '',
                repassadaDeDocenteId: deId,
                repassadaDeDocenteNome: deNome,
                repassadaEm: agora,
                atualizadoEm: agora
            }, { merge: true }).catch(function (e) { console.warn('Sync repasse ADM:', e); });
        }).then(function () {
            pdFecharRepassar();
            return pdCarregarAulas();
        }).then(function () {
            pdRenderMinhasAulas();
            alert('Aula repassada para ' + destNome + '. Ela foi bloqueada para você e liberada para o novo docente.');
            if (btn) btn.disabled = false;
        }).catch(function (e) {
            console.error('Erro ao repassar aula:', e);
            alert('Erro ao repassar aula: ' + (e && e.message ? e.message : e));
            if (btn) btn.disabled = false;
        });
        return false;
    }

    /* ---------- aulas do docente ---------- */
    function pdCursoPermitido(cursoDoc) {
        if (!pdCursos.length) return true;
        var dados = cursoDoc.data() || {};
        var alvos = [cursoDoc.id, dados.nome].map(pdKey);
        return pdCursos.some(function (c) { var k = pdKey(c); return alvos.indexOf(k) >= 0; });
    }
    function pdAulaEhDoDocente(aula) {
        var id = String(aula.docenteId || '');
        if (id && pdUser && pdKey(id) === pdKey(pdUser._docId)) return true;
        var texto = pdKey(aula.docente || '');
        if (!texto || !pdUser) return false;
        return [pdUser.nome, pdUser.guerra, pdUser.matricula, pdUser.cpf].some(function (x) {
            var k = pdKey(x);
            return !!k && (texto === k || texto.indexOf(k) >= 0);
        });
    }
    function pdCarregarAulas() {
        var aviso = document.getElementById('pd-apt-aviso');
        if (aviso) { aviso.textContent = 'Carregando suas aulas...'; aviso.className = 'pd-aviso'; }
        pdAulas = [];
        if (!pdUser) return Promise.resolve([]);
        return db.collection('cursosCadastro').get().then(function (cursosSnap) {
            var tarefas = [];
            cursosSnap.forEach(function (cursoDoc) {
                if (!pdCursoPermitido(cursoDoc)) return;
                var dadosCurso = cursoDoc.data() || {};
                tarefas.push(
                    Promise.all([
                        db.collection('cursosCadastro').doc(cursoDoc.id).collection('aulas').get(),
                        db.collection('cursosCadastro').doc(cursoDoc.id).collection('individuos').get()
                    ]).then(function (resultados) {
                        var snap = resultados[0];
                        var turmasIndividuos = {};
                        resultados[1].forEach(function (p) {
                            var t = String((p.data() || {}).turma || '').trim();
                            if (t) turmasIndividuos[pdKey(t)] = t;
                        });
                        snap.forEach(function (doc) {
                            var a = Object.assign({ _id: doc.id }, doc.data() || {});
                            if (!pdAulaEhDoDocente(a)) return;
                            a.cursoId = String(a.cursoId || cursoDoc.id);
                            a.cursoNome = String(a.cursoNome || dadosCurso.nome || 'Curso');
                            a.projeto = String(a.projeto || dadosCurso.projeto || '');
                            var tk = pdKey(a.turma || '');
                            if (!a.turma && tk && turmasIndividuos[tk]) a.turma = turmasIndividuos[tk];
                            pdAulas.push(a);
                        });
                    })
                    .catch(function (e) { console.warn('Aulas do curso ' + cursoDoc.id + ':', e); })
                );
            });
            return Promise.all(tarefas);
        }).then(function () {
            pdAulas.sort(function (a, b) {
                return String(b.data || b.criadoEm || '').localeCompare(String(a.data || a.criadoEm || ''));
            });
            pdPreencherCursos();
            pdRenderMinhasAulas();
            if (aviso) {
                if (pdAulas.length) {
                    aviso.textContent = pdAulas.length + ' aula(s) encontrada(s) para o seu cadastro.';
                    aviso.className = 'pd-aviso pd-ok';
                } else {
                    aviso.textContent = 'Nenhuma aula encontrada com o seu nome no campo "Selecione o Docente" do Cadastro de Cursos.';
                    aviso.className = 'pd-aviso pd-erro-box';
                }
            }
            return pdAulas;
        }).catch(function (e) {
            console.error('Portal do Docente - aulas:', e);
            if (aviso) { aviso.textContent = 'Erro ao carregar aulas: ' + (e && e.message ? e.message : e); aviso.className = 'pd-aviso pd-erro-box'; }
            return [];
        });
    }
    function pdPreencherCursos() {
        var sel = document.getElementById('pd-curso'); if (!sel) return;
        var nomes = {}, lista = [];
        pdAulas.forEach(function (a) { var k = pdKey(a.cursoId); if (!nomes[k]) { nomes[k] = true; lista.push({ id: a.cursoId, nome: a.cursoNome }); } });
        lista.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
        sel.innerHTML = '<option value="">Selecione o curso...</option>' + lista.map(function (c) {
            return '<option value="' + pdEsc(c.id) + '">' + pdEsc(c.nome) + '</option>';
        }).join('');
        var turmaSel = document.getElementById('pd-turma'), aulaSel = document.getElementById('pd-aula');
        if (turmaSel) turmaSel.innerHTML = '<option value="">Selecione a turma...</option>';
        if (aulaSel) aulaSel.innerHTML = '<option value="">Selecione a aula...</option>';
    }
    function pdTurmasDoCurso(cid) {
        return db.collection('cursosCadastro').doc(cid).collection('individuos').get().then(function (snap) {
            var mapa = {};
            snap.forEach(function (doc) {
                var p = doc.data() || {}, t = String(p.turma || '').trim();
                if (t) mapa[pdKey(t)] = t;
            });
            return Object.keys(mapa).map(function (k) { return mapa[k]; })
                .sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR', { numeric: true }); });
        });
    }
    function pdOnCursoChange() {
        var cid = (document.getElementById('pd-curso') || {}).value || '';
        var turmaSel = document.getElementById('pd-turma'), aulaSel = document.getElementById('pd-aula');
        if (turmaSel) turmaSel.innerHTML = '<option value="">Carregando turmas...</option>';
        if (aulaSel) aulaSel.innerHTML = '<option value="">Selecione a aula...</option>';
        pdFecharAula();
        if (!cid) {
            if (turmaSel) turmaSel.innerHTML = '<option value="">Selecione a turma...</option>';
            return;
        }
        pdTurmasDoCurso(cid).then(function (disponiveis) {
            var permitidas = pdTurmas.length
                ? disponiveis.filter(function (t) { return pdTurmas.some(function (u) { return pdKey(u) === pdKey(t); }); })
                : disponiveis;
            var usar = permitidas.length ? permitidas : [];
            if (turmaSel) {
                turmaSel.innerHTML = '<option value="">' + (usar.length ? 'Selecione a turma...' : 'Nenhuma turma do seu cadastro neste curso') + '</option>'
                    + usar.map(function (t) { return '<option value="' + pdEsc(t) + '">' + pdEsc(t) + '</option>'; }).join('');
            }
            pdPreencherAulas(cid, '');
        }).catch(function (e) {
            if (turmaSel) turmaSel.innerHTML = '<option value="">Erro ao carregar turmas</option>';
            console.warn('Turmas do curso:', e);
        });
    }
    function pdPreencherAulas(cid, turma) {
        var sel = document.getElementById('pd-aula'); if (!sel) return;
        var lista = pdAulas.filter(function (a) {
            if (String(a.cursoId) !== String(cid)) return false;
            if (turma && a.turma && pdKey(a.turma) !== pdKey(turma)) return false;
            return true;
        });
        sel.innerHTML = '<option value="">Selecione a aula...</option>' + lista.map(function (a) {
            return '<option value="' + pdEsc(a._id) + '">'
                + pdEsc([pdDataCurto(a.data), a.horario, a.conteudo || a.disciplina || 'Aula'].filter(Boolean).join(' · '))
                + '</option>';
        }).join('');
    }
    function pdOnTurmaChange() {
        var cid = (document.getElementById('pd-curso') || {}).value || '';
        var turma = (document.getElementById('pd-turma') || {}).value || '';
        pdFecharAula();
        pdPreencherAulas(cid, turma);
    }

    /* ---------- apontamento ---------- */
    function pdFecharAula() {
        pdPararQr();
        pdAula = null; pdAlunos = []; pdPresencas = {};
        var box = document.getElementById('pd-aula-box'); if (box) box.classList.remove('aberto');
        var lista = document.getElementById('pd-lista-alunos'); if (lista) lista.innerHTML = '';
        var cnt = document.getElementById('pd-contador'); if (cnt) cnt.textContent = '0';
        var info = document.getElementById('pd-aula-info'); if (info) info.textContent = '';
    }
    function pdSelecionarAula(id, manterQr) {
        var turma = (document.getElementById('pd-turma') || {}).value || '';
        pdAula = pdAulas.find(function (a) { return String(a._id) === String(id); }) || null;
        if (!pdAula) { pdStatus('Aula não encontrada entre as aulas do seu cadastro.', 'erro'); return; }
        if (pdAulaApontada(pdAula)) {
            pdStatus('Esta aula já foi encerrada e apontada. Não é possível apontar novamente.', 'erro');
            return;
        }
        var cid = String(pdAula.cursoId || (document.getElementById('pd-curso') || {}).value || '');
        var box = document.getElementById('pd-aula-box'); if (box) box.classList.add('aberto');
        var info = document.getElementById('pd-aula-info');
        if (info) info.textContent = pdAula.conteudo || pdAula.disciplina || 'Aula';
        if (!manterQr) pdPararQr();
        ultimoAluno = { cpf: '', em: 0 };
        db.collection('cursosCadastro').doc(cid).collection('individuos').get().then(function (snap) {
            pdAlunos = []; pdPresencas = {};
            snap.forEach(function (doc) {
                var p = Object.assign({ _id: doc.id }, doc.data() || {});
                if (p.pediuBaixa === true || pdKey(p.situacaoCurso) === 'PEDIUBAIXA') return;
                if (turma && pdKey(p.turma) !== pdKey(turma)) return;
                pdAlunos.push(p);
                pdPresencas[pdDigitos(p.cpf) || ('tmp_' + doc.id)] = {
                    cpf: pdDigitos(p.cpf), nome: p.nome || '', matricula: p.matricula || '',
                    status: 'Falta', obs: '', confirmadoEm: ''
                };
            });
            pdAlunos.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'); });
            pdRenderAlunos();
            if (!pdAlunos.length) {
                pdStatus('Nenhum aluno cadastrado nesta turma.', 'erro');
                return;
            }
            pdStatus(manterQr
                ? 'Aula "' + (pdAula.conteudo || pdAula.disciplina || 'Aula') + '" aberta pelo QR. Continue lendo os QR Codes dos alunos.'
                : 'Aula aberta. Toque em "Abrir leitor de QR Code" para começar.', '');
        }).catch(function (e) {
            console.error('Alunos da aula:', e);
            pdStatus('Erro ao carregar os alunos: ' + (e && e.message ? e.message : e), 'erro');
        });
    }
    function pdAbrirAula() {
        var id = (document.getElementById('pd-aula') || {}).value || '';
        if (!id) { alert('Selecione a aula.'); return; }
        pdSelecionarAula(id, false);
    }
    function pdChavesAluno(p) {
        var extras = [];
        try {
            if (window.FarnPessoaCampos && typeof FarnPessoaCampos.qrValor === 'function') extras.push(FarnPessoaCampos.qrValor(p));
        } catch (e) {}
        var brutos = [p.qrCode, p.credencial, p.matricula, p.cpf].concat(extras);
        var chaves = [];
        brutos.forEach(function (x) {
            var s = pdUpper(x), d = pdDigitos(x);
            if (s) chaves.push(s);
            if (d) chaves.push(d);
        });
        return chaves;
    }
    function pdLocalizarAluno(texto) {
        var alvo = pdUpper(texto), alvoDigitos = pdDigitos(texto);
        return pdAlunos.find(function (p) {
            return pdChavesAluno(p).some(function (k) { return k === alvo || (alvoDigitos && k === alvoDigitos); });
        }) || null;
    }
    function pdRenderAlunos() {
        var box = document.getElementById('pd-lista-alunos'); if (!box) return;
        var linhas = pdAlunos.map(function (p) {
            var cpf = pdDigitos(p.cpf) || ('tmp_' + p._id);
            var s = pdPresencas[cpf] || {};
            var presente = s.status === 'Presente';
            return '<tr class="' + (presente ? 'pd-linha-presente' : '') + '">'
                + '<td style="font-family:monospace;font-size:11px">' + pdEsc(p.matricula || '—') + '</td>'
                + '<td>' + pdEsc(p.nome || '—') + '<div style="font-size:10px;color:#64748b">' + pdEsc(p.turma || '') + '</div></td>'
                + '<td>' + (presente
                    ? '<span class="pd-selo pd-selo-presente">Presente</span><div style="font-size:9px;color:#64748b">' + pdEsc(s.confirmadoEm || '') + '</div>'
                    : '<span class="pd-selo pd-selo-falta">Falta</span>') + '</td>'
                + '<td style="white-space:nowrap">'
                + ['Presente', 'Falta', 'Justificada'].map(function (st) {
                    var lbl = st === 'Presente' ? 'P' : (st === 'Falta' ? 'F' : 'J');
                    var ativo = s.status === st;
                    return '<button class="pd-btn" onclick="pdSetStatus(\'' + pdEsc(cpf) + '\',\'' + st + '\')" style="padding:3px 7px;margin:0 1px;font-size:10px;background:' + (ativo ? '#1d4ed8' : '#e2e8f0') + ';color:' + (ativo ? '#fff' : '#475569') + '">' + lbl + '</button>';
                }).join('') + '</td></tr>';
        }).join('');
        box.innerHTML = '<table class="pd-tabela"><thead><tr><th>Matrícula</th><th>Aluno</th><th>Status</th><th>Ajustar</th></tr></thead><tbody>' + linhas + '</tbody></table>';
        var cnt = document.getElementById('pd-contador');
        if (cnt) cnt.textContent = Object.keys(pdPresencas).filter(function (k) { return pdPresencas[k].status === 'Presente'; }).length;
    }
    function pdSetStatus(cpf, status) {
        if (!pdPresencas[cpf]) return;
        pdPresencas[cpf].status = status;
        pdRenderAlunos();
    }

    /* ---------- leitor de QR com bip continuo ---------- */
    function pdBeep(frequencia, duracao) {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!audioCtx) audioCtx = new Ctx();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequencia || 880;
            gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (duracao || 0.09));
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(); osc.stop(audioCtx.currentTime + (duracao || 0.09) + 0.02);
        } catch (e) { console.warn('Bip indisponível:', e); }
    }
    function pdAlternarQr() { if (escaneando) pdPararQr(); else pdIniciarQr(); }
    function pdIniciarQr() {
        if (!pdAula) { alert('Abra uma aula antes de ler QR Codes.'); return; }
        if (typeof Html5Qrcode === 'undefined') { alert('Biblioteca de leitura de QR não carregada.'); return; }
        var el = document.getElementById('pd-qr-reader'); if (!el) return;
        el.style.display = 'block';
        pdBeep(660, 0.05);

        function aoLer(texto) {
            if (!escaneando) return;
            var bruto = String(texto || '').trim();
            var agora = Date.now();
            if (ultimoScan.texto === bruto && agora - ultimoScan.em < 1500) return;
            ultimoScan = { texto: bruto, em: agora };

            /* QR de inicio da aula (gerado no Cadastro de Cursos): abre a aula
               sem parar o leitor e continua pronto para os QRs dos alunos. */
            var ini = bruto.match(/^FARN-INICIO:\s*(.+)$/i);
            if (ini) {
                var aulaInicio = pdAulas.find(function (a) { return pdKey(a._id) === pdKey(ini[1]); });
                if (!aulaInicio) { pdStatus('QR de início: aula não encontrada no seu cadastro.', 'erro'); return; }
                var cursoSel = document.getElementById('pd-curso');
                var turmaSel = document.getElementById('pd-turma');
                var aulaSel = document.getElementById('pd-aula');
                if (cursoSel) cursoSel.value = String(aulaInicio.cursoId);
                if (turmaSel) turmaSel.value = '';
                pdPreencherAulas(aulaInicio.cursoId, '');
                if (aulaSel) aulaSel.value = String(aulaInicio._id);
                pdSelecionarAula(aulaInicio._id, true);
                pdBeep(880, 0.09);
                pdStatus('Aula "' + (aulaInicio.conteudo || aulaInicio.disciplina || 'Aula') + '" aberta pelo QR de início — leia o QR do próximo aluno.', 'ok');
                return;
            }

            var aluno = pdLocalizarAluno(bruto);
            if (!aluno) {
                pdStatus('QR não encontrado nesta turma: ' + bruto, 'erro');
                return;
            }
            var cpf = pdDigitos(aluno.cpf) || ('tmp_' + aluno._id);
            var reg = pdPresencas[cpf];
            if (!reg) { pdStatus('Aluno sem registro de presença: ' + (aluno.nome || bruto), 'erro'); return; }
            if (ultimoAluno.cpf === cpf && agora - ultimoAluno.em < 1500) return;
            ultimoAluno = { cpf: cpf, em: agora };
            var jaEstava = reg.status === 'Presente';
            reg.status = 'Presente';
            reg.confirmadoEm = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            pdRenderAlunos();
            pdBeep(880, 0.09);
            pdStatus((jaEstava ? 'Já estava presente: ' : 'Presente confirmado: ') + (aluno.nome || '-') + ' — leia o próximo QR Code.', 'ok');
        }

        function iniciar(facing) {
            return scanner.start({ facingMode: facing }, { fps: 10, qrbox: 240 }, aoLer, function () { /* quadros sem QR */ });
        }
        try {
            scanner = new Html5Qrcode('pd-qr-reader');
            escaneando = true;
            iniciar('environment').catch(function (e) {
                if (!escaneando) return;
                console.warn('Camera traseira falhou, tentando frontal:', e);
                try { scanner.clear(); } catch (e2) {}
                return iniciar('user').catch(function (e3) {
                    escaneando = false;
                    pdStatus('Não foi possível abrir a câmera: ' + (e3 && e3.message ? e3.message : e3), 'erro');
                    var btnErro = document.getElementById('pd-btn-qr');
                    if (btnErro) btnErro.innerHTML = '<i class="fa-solid fa-qrcode" style="margin-right:6px"></i> Abrir leitor de QR Code';
                });
            });
            var btn = document.getElementById('pd-btn-qr');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-qrcode" style="margin-right:6px"></i> Leitor ativo';
        } catch (e) {
            escaneando = false;
            pdStatus('Erro ao iniciar a câmera: ' + (e && e.message ? e.message : e), 'erro');
        }
    }
    function pdPararQr() {
        if (scanner && escaneando) {
            try { scanner.stop().then(function () { try { scanner.clear(); } catch (e) {} }).catch(function () {}); }
            catch (e) {}
        }
        scanner = null; escaneando = false;
        ultimoScan = { texto: '', em: 0 }; ultimoAluno = { cpf: '', em: 0 };
        var el = document.getElementById('pd-qr-reader'); if (el) { el.innerHTML = ''; el.style.display = 'none'; }
        var btn = document.getElementById('pd-btn-qr');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-qrcode" style="margin-right:6px"></i> Abrir leitor de QR Code';
        pdStatus('');
    }
    function pdSalvarApontamento() {
        if (!pdAula) { alert('Abra uma aula antes de salvar.'); return false; }
        var agora = new Date().toISOString();
        var presentes = 0, faltas = 0, just = 0;
        var alunos = pdAlunos.map(function (p) {
            var cpf = pdDigitos(p.cpf) || ('tmp_' + p._id);
            var s = pdPresencas[cpf] || {};
            var status = s.status || 'Falta';
            if (status === 'Presente') presentes++; else if (status === 'Justificada') just++; else faltas++;
            return {
                cpf: pdDigitos(p.cpf), nome: p.nome || '', matricula: p.matricula || '',
                status: status, obs: s.obs || '', foP: 0, foN: 0,
                inicioPresente: status === 'Presente', inicioHora: s.confirmadoEm || '',
                turma: p.turma || '', projeto: p.projeto || ''
            };
        });
        if (!alunos.length) { alert('Nenhum aluno nesta aula.'); return false; }
        var turma = (document.getElementById('pd-turma') || {}).value || '';
        var cid = String(pdAula.cursoId || (document.getElementById('pd-curso') || {}).value || '');
        var aulaId = String(pdAula._id);
        var cab = {
            origem: 'portal-docente',
            aulaId: aulaId,
            aula: pdAula.conteudo || pdAula.disciplina || '',
            disciplina: pdAula.disciplina || '',
            dataAula: pdAula.data || '',
            horaAula: pdAula.horario || '',
            turma: turma,
            projeto: pdAula.projeto || '',
            cursoId: cid,
            cursoNome: pdAula.cursoNome || '',
            docenteId: pdUser._docId || '',
            docenteNome: pdNome(),
            docenteCpf: pdDigitos(pdUser.cpf),
            alunos: alunos,
            presentes: presentes, faltas: faltas, justificadas: just,
            criadoEm: agora,
            salvoPor: pdNome()
        };
        var btn = document.getElementById('pd-btn-salvar'); if (btn) btn.disabled = true;
        /* ID determinístico: um apontamento por docente + aula + dia. Assim um
           retry do botão atualiza o mesmo registro em vez de duplicar. */
        var aptId = 'apt-' + String(pdUser._docId || 'doc').replace(/[^A-Za-z0-9_-]/g, '_')
            + '-' + aulaId.replace(/[^A-Za-z0-9_-]/g, '_') + '-' + agora.slice(0, 10);
        var refApt = db.collection('cursosCadastro').doc(cid).collection('apontamentos').doc(aptId);
        refApt.set(cab, { merge: true }).then(function () {
            var proprio = Object.assign({}, cab, { apontamentoId: aptId });
            return db.collection('docentesAdmin').doc(pdUser._docId).collection('apontamentos')
                .doc(aptId).set(proprio, { merge: true });
        }).then(function () {
            var tarefas = [
                db.collection('cursosCadastro').doc(cid).collection('aulas').doc(aulaId).update({
                    apontada: true,
                    apontamentoId: aptId,
                    apontadoPorDocenteId: pdUser._docId || '',
                    apontadoPorDocente: pdNome(),
                    atualizadoEm: agora
                })
            ];
            var idAdm = 'aula-' + aulaId.replace(/[^A-Za-z0-9_-]/g, '_');
            tarefas.push(
                db.collection('apontamentosAdm').doc(idAdm).set({
                    status: 'Apontado',
                    apontado: true,
                    apontadoEm: agora,
                    apontadoPor: pdNome(),
                    apontadoPorDocenteId: pdUser._docId || '',
                    apontamentoId: aptId,
                    atualizadoEm: agora
                }, { merge: true })
            );
            return Promise.all(tarefas.map(function (t) { return t.catch(function (e) { console.warn('Sync apontamento:', e); }); }));
        }).then(function () {
            pdPararQr();
            pdFecharAula();
            pdCarregarAulas();
            pdCarregarHistorico();
            var msg = 'Apontamento salvo: ' + presentes + ' presente(s), ' + faltas + ' falta(s), ' + just + ' justificada(s).';
            var st = db.status && db.status();
            if (st && (st.online === false || st.pendentes > 0)) {
                msg += '\nSalvo localmente; aguardando sincronização com o servidor.';
            }
            alert(msg);
            if (btn) btn.disabled = false;
        }).catch(function (e) {
            console.error('Erro ao salvar apontamento:', e);
            alert('Erro ao salvar apontamento: ' + (e && e.message ? e.message : e));
            if (btn) btn.disabled = false;
        });
        return false;
    }

    /* ---------- historico do docente ---------- */
    function pdCarregarHistorico() {
        var box = document.getElementById('pd-historico'); if (!box || !pdUser || !pdUser._docId) return;
        box.innerHTML = '<div class="pd-aviso">Carregando histórico...</div>';
        db.collection('docentesAdmin').doc(pdUser._docId).collection('apontamentos')
            .orderBy('criadoEm', 'desc').limit(100).get().then(function (snap) {
                var itens = [];
                snap.forEach(function (d) { itens.push(Object.assign({ _id: d.id }, d.data() || {})); });
                if (!itens.length) { box.innerHTML = '<div class="pd-aviso">Nenhum apontamento salvo ainda.</div>'; return; }
                box.innerHTML = itens.map(function (r) {
                    return '<div class="pd-hist-item"><b>' + pdEsc(r.aula || r.disciplina || 'Aula') + '</b>'
                        + '<div style="color:#64748b;font-size:11px;margin-top:3px">'
                        + pdEsc([r.cursoNome, r.turma, pdDataHora(r.criadoEm)].filter(Boolean).join(' · '))
                        + ' · P:' + (r.presentes || 0) + ' F:' + (r.faltas || 0) + ' J:' + (r.justificadas || 0)
                        + '</div></div>';
                }).join('');
            }).catch(function (e) {
                console.warn('Historico do docente:', e);
                box.innerHTML = '<div class="pd-aviso pd-erro-box">Erro ao carregar histórico: ' + pdEsc(e && e.message ? e.message : e) + '</div>';
            });
    }

    /* ---------- saida ---------- */
    function pdSair(redirecionar) {
        pdPararQr();
        try {
            localStorage.removeItem(CHAVE_SESSAO);
            localStorage.removeItem('farn_user_data');
            localStorage.removeItem('farn_last_cpf');
            localStorage.removeItem('farn_login');
        } catch (e) {}
        pdUser = null; pdAulas = []; pdAula = null;
        if (redirecionar !== false) location.href = 'index.html';
    }

    /* API global usada pelos eventos inline do HTML. */
    window.pdLogin = pdLogin;
    window.pdFormatCpf = pdFormatCpf;
    window.pdAbrirMenu = pdAbrirMenu;
    window.pdFecharMenu = pdFecharMenu;
    window.pdSetView = pdSetView;
    window.pdOnCursoChange = pdOnCursoChange;
    window.pdOnTurmaChange = pdOnTurmaChange;
    window.pdAbrirAula = pdAbrirAula;
    window.pdFecharAula = pdFecharAula;
    window.pdAbrirRepassar = pdAbrirRepassar;
    window.pdFecharRepassar = pdFecharRepassar;
    window.pdConfirmarRepassar = pdConfirmarRepassar;
    window.pdAlternarQr = pdAlternarQr;
    window.pdPararQr = pdPararQr;
    window.pdSetStatus = pdSetStatus;
    window.pdSalvarApontamento = pdSalvarApontamento;
    window.pdLogout = function () { pdSair(true); };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pdRestaurarSessao);
    else pdRestaurarSessao();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(function () {});
    }
})();
