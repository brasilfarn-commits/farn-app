/* =====================================================================
   FARN - PORTAL DO FORMADO
   ---------------------------------------------------------------------
   Menu: Inicio, Meus Dados, Certificados e Blog.
   Certificados: apenas modelos/registros ligados a cursos/turmas com
   status CONCLUIDO em que o formado esta cadastrado.
   Blog: todas as noticias ativas publicadas na secao Blog do admin.
   ===================================================================== */
(function (global) {
    'use strict';

    var firebaseConfig = {
        apiKey: "AIzaSyCjKeFfSkQp9wPxsEytxr9Vrl9g_HmdfF0",
        authDomain: "farn-app.firebaseapp.com",
        databaseURL: "https://farn-app-default-rtdb.firebaseio.com",
        projectId: "farn-app",
        storageBucket: "farn-app.firebasestorage.app",
        messagingSenderId: "16254677061",
        appId: "1:16254677061:web:3d42c64edfe5cdbffcf32c"
    };
    if (window.firebase && firebase.apps && !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    var dbFirestore = new FarnDB();
    global.dbFirestore = dbFirestore;

    var PF_CHAVE = 'formado_sessao';
    var pfUser = null;
    var pfCursos = [];
    var pfCertificados = [];

    function pfEsc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function pfSoDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function pfFmtCpf(v) {
        v = pfSoDigitos(v);
        return v.length === 11 ? v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : v;
    }
    function pfFormatCpf(el) {
        var v = pfSoDigitos(el.value).slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        el.value = v;
    }
    function pfNormalizar(v) {
        return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }
    function pfDataBr(v) {
        var s = String(v || '').trim();
        if (!s) return '';
        /* Data do input type=date (AAAA-MM-DD): converte sem passar por Date,
           para nao deslocar um dia por causa do fuso horario. */
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
        if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
        var d = new Date(s);
        if (isNaN(d.getTime())) return s.slice(0, 10);
        return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    }
    function pfErro(msg) {
        var e = document.getElementById('pf-erro');
        if (e) { e.textContent = msg; e.style.display = 'block'; }
    }
    function pfCampo(rotulo, valor) {
        return '<div class="pf-campo"><span>' + pfEsc(rotulo) + '</span><b>' + (valor ? pfEsc(valor) : '—') + '</b></div>';
    }
    function pfCampoSe(rotulo, valor) {
        var v = String(valor == null ? '' : valor).trim();
        return v ? pfCampo(rotulo, v) : '';
    }
    function pfNome() { return (pfUser && (pfUser.nome || pfUser.nomeCompleto)) || 'Formado'; }
    function pfMatricula() {
        var m = (pfUser && (pfUser.matricula || pfUser.credencial)) || '';
        return m || ('FRM' + pfSoDigitos(pfUser && pfUser.cpf).slice(-5));
    }

    function pfAbrirMenu() {
        document.getElementById('pf-drawer').classList.add('aberto');
        document.getElementById('pf-overlay').classList.add('aberto');
    }
    function pfFecharMenu() {
        document.getElementById('pf-drawer').classList.remove('aberto');
        document.getElementById('pf-overlay').classList.remove('aberto');
    }
    function pfSetView(view) {
        ['inicio', 'dados', 'certificados', 'blog'].forEach(function (v) {
            var box = document.getElementById('pf-view-' + v);
            if (box) box.className = 'pf-view' + (v === view ? ' ativo' : '');
            var btn = document.getElementById('pf-menu-' + v);
            if (btn) btn.className = (v === view ? 'ativo' : '');
        });
        pfFecharMenu();
        if (view === 'dados') pfCarregarDados();
        if (view === 'certificados') pfCarregarCertificados();
        if (view === 'blog') pfIniciarBlog();
    }

    function pfFoto() {
        if (!pfUser) return null;
        var cpf = pfSoDigitos(pfUser.cpf), foto = null;
        try { foto = localStorage.getItem('farn_photo_' + cpf) || localStorage.getItem('foto3x4_' + cpf); } catch (e) {}
        return pfUser.foto3x4 || pfUser.photoDataUrl || pfUser.foto || pfUser.fotoUrl || foto || null;
    }
    function pfAplicarFoto() {
        var foto = pfFoto();
        var nomes = ['pf-foto-topo', 'pf-inicio-foto'];
        nomes.forEach(function (id) {
            var img = document.getElementById(id);
            if (!img) return;
            if (foto) { img.src = foto; img.style.display = ''; img.classList.remove('pf-sem-foto'); }
            else { img.classList.add('pf-sem-foto'); if (id !== 'pf-foto-topo') img.style.display = 'none'; }
        });
        ['pf-foto-topo-ampliar', 'pf-inicio-foto-ampliar'].forEach(function (id) {
            var b = document.getElementById(id);
            if (!b) return;
            b.style.display = foto ? '' : 'none';
            if (pfUser) b.setAttribute('data-cpf', pfSoDigitos(pfUser.cpf));
        });
    }
    /* Mostra no cartao inicial o icone cadastrado no curso do formado logado.
       Caminho relativo para funcionar no site e no tunel. */
    function pfAplicarIconeCurso() {
        var card = document.querySelector('#pf-view-inicio > .pf-card:first-child');
        if (!card) return;
        var id = String((pfUser && (pfUser._cursoId || pfUser.cursoId)) || '');
        if (!id) return;
        var url = '/api/arquivo/cursos/' + encodeURIComponent(id) + '/icone.jpg';
        var img = new Image();
        img.onload = function () {
            card.style.setProperty('background-image',
                'linear-gradient(100deg, rgba(11,16,32,.90) 0%, rgba(139,92,246,.78) 55%, rgba(249,115,22,.62) 100%), url("' + url + '")', 'important');
            card.style.setProperty('background-position', 'center, right center', 'important');
            card.style.setProperty('background-size', 'cover, contain', 'important');
            card.style.setProperty('background-repeat', 'no-repeat', 'important');
        };
        img.src = url;
    }

    function pfAtualizarCursos() {
        var box = document.getElementById('pf-inicio-cursos');
        if (!box) return;
        if (!pfCursos.length) {
            box.innerHTML = '<div class="pf-aviso">Nenhum curso concluído encontrado para o seu CPF.</div>';
            return;
        }
        box.innerHTML = pfCursos.map(function (c) {
            return '<div class="pf-item">'
                + '<h3><i class="fa-solid fa-award" style="color:#1e40af"></i> ' + pfEsc(c._cursoNome || 'Curso')
                + ' <span class="pf-badge">CONCLUÍDO</span></h3>'
                + '<div class="pf-grid">'
                + pfCampo('Turma', c._turma || '—')
                + pfCampo('Status da turma', c._turmaStatus || 'Concluído')
                + pfCampo('Situação', c.situacaoCurso || c.status || 'Formado')
                + pfCampo('Concluído em', pfDataBr(c.formadoEm))
                + '</div></div>';
        }).join('');
    }

    function pfMostrarApp() {
        document.getElementById('pf-tela-login').style.display = 'none';
        document.getElementById('pf-tela-app').style.display = 'block';
        var nome = pfNome();
        var el = document.getElementById('pf-nome-topo'); if (el) el.textContent = nome;
        el = document.getElementById('pf-matricula-topo'); if (el) el.textContent = 'Matrícula: ' + pfMatricula();
        el = document.getElementById('pf-nome-menu'); if (el) el.textContent = nome;
        el = document.getElementById('pf-turma-menu'); if (el) el.textContent = (pfCursos[0] && pfCursos[0]._turma) || '—';
        el = document.getElementById('pf-boas-vindas-nome'); if (el) el.textContent = nome.split(' ')[0];
        pfAtualizarCursos();
        pfAplicarFoto();
        pfAplicarIconeCurso();
        pfSetView('inicio');
    }

    function pfCarregarDados() {
        if (!pfUser) return;
        var box = document.getElementById('pf-dados');
        if (!box) return;
        var curso = pfCursos[0] || {};
        box.innerHTML = pfCampo('Nome completo', pfNome())
            + pfCampo('CPF', pfFmtCpf(pfUser.cpf))
            + pfCampo('Matrícula / Credencial', pfMatricula())
            + pfCampo('Curso concluído', curso._cursoNome)
            + pfCampo('Turma', curso._turma)
            + pfCampo('Projeto', curso._projeto)
            + pfCampo('Concluído em', pfDataBr(pfUser.formadoEm || curso.formadoEm))
            + pfCampo('E-mail', pfUser.email)
            + pfCampo('WhatsApp', pfUser.whatsapp);
    }

    /* ---------- CERTIFICADOS ---------- */
    function pfCertVisivel(r) {
        if (r.exibirFormado === false) return false;
        var portais = r.portais;
        if (Array.isArray(portais)) return portais.indexOf('formado') !== -1;
        if (portais && typeof portais === 'object') return !!portais.formado;
        return true;
    }

    async function pfCarregarCertificados() {
        var box = document.getElementById('pf-lista-certificados');
        if (!box) return;
        if (!pfUser || !pfCursos.length) {
            box.innerHTML = '<div class="pf-aviso">Entre novamente para ver seus certificados.</div>';
            return;
        }
        box.innerHTML = '<div class="pf-aviso">Carregando certificados...</div>';
        var ids = pfCursos.map(function (c) { return c._cursoId || c.cursoId; }).filter(Boolean);
        var nomes = pfCursos.map(function (c) { return pfNormalizar(c._cursoNome); }).filter(Boolean);
        var out = [];
        try {
            var snap = await dbFirestore.collection('certificados').get();
            snap.forEach(function (d) {
                var r = Object.assign({}, d.data() || {}, { _id: d.id, _origem: 'modelo' });
                if (!pfCertVisivel(r)) return;
                var cid = String(r.cursoId || '');
                var nome = pfNormalizar(r.curso);
                var ligado = (cid && ids.indexOf(cid) !== -1);
                if (!ligado) {
                    ligado = nomes.some(function (n) {
                        return n && nome && (nome === n || nome.indexOf(n) !== -1 || n.indexOf(nome) !== -1);
                    });
                }
                if (ligado) out.push(r);
            });
        } catch (e) { console.warn('Formado: falha ao ler modelos de certificado', e); }

        for (var i = 0; i < ids.length; i++) {
            try {
                var s = await dbFirestore.collection('cursosCadastro').doc(ids[i]).collection('certificados').get();
                s.forEach(function (d) {
                    var r = Object.assign({}, d.data() || {}, { _id: d.id, _origem: 'curso', _cursoId: ids[i] });
                    if (r.ativo === false) return;
                    out.push(r);
                });
            } catch (e) { console.warn('Formado: falha ao ler certificados do curso ' + ids[i], e); }
        }

        var vistos = {};
        out = out.filter(function (r) {
            var k = r._origem + '|' + r._id + '|' + (r._cursoId || '');
            if (vistos[k]) return false;
            vistos[k] = 1;
            return true;
        });
        out.sort(function (a, b) {
            return String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || ''));
        });
        pfCertificados = out;
        pfRenderCertificados();
    }

    function pfRenderCertificados() {
        var box = document.getElementById('pf-lista-certificados');
        if (!box) return;
        if (!pfCertificados.length) {
            box.innerHTML = '<div class="pf-aviso">Nenhum certificado cadastrado para os seus cursos concluídos.</div>';
            return;
        }
        box.innerHTML = pfCertificados.map(function (r, i) {
            var inst = r.instituicao || {};
            var resumo = pfPersonalizar(r.declaracao || '').replace(/\s+/g, ' ').trim();
            return '<div class="pf-item">'
                + '<h3><i class="fa-solid fa-award" style="color:#1e40af"></i> ' + pfEsc(r.curso || r.nome || 'Certificado')
                + ' <span class="pf-badge">CURSO CONCLUÍDO</span></h3>'
                + '<div class="pf-grid">'
                + pfCampo('Instituição', inst.nomeFantasia || inst.razaoSocial)
                + pfCampo('Atualizado em', pfDataBr(r.atualizadoEm || r.criadoEm))
                + pfCampo('Origem', r._origem === 'curso' ? 'Certificado do curso' : 'Modelo administrativo')
                + '</div>'
                + (resumo ? '<p>' + pfEsc(resumo.slice(0, 260)) + (resumo.length > 260 ? '...' : '') + '</p>' : '')
                + '<button type="button" class="pf-btn" onclick="pfAbrirCertificado(' + i + ')"><i class="fa-solid fa-eye" style="margin-right:5px"></i> Visualizar</button>'
                + '</div>';
        }).join('');
    }

    /* Usa a mesma regra do Cadastro de Curso (formado-acesso.js) para que a
       declaracao exibida no portal seja identica a pre-via do administrador. */
    function pfPersonalizar(txt) {
        var curso = pfCursos[0] || {};
        if (typeof farnDeclaracaoPersonalizar !== 'function') return String(txt || '');
        return farnDeclaracaoPersonalizar(txt, pfUser, {
            curso: {
                _cursoNome: curso._cursoNome,
                _cursoPrevisao: curso._cursoPrevisao,
                _turma: curso._turma,
                _projeto: curso._projeto
            },
            turma: curso._turmaDados || {},
            turmaCert: curso._certTurmaDados || {}
        });
    }

    function pfAbrirCertificado(i) {
        var r = pfCertificados[i];
        if (!r) return;
        var titulo = document.getElementById('pf-cert-titulo');
        if (titulo) titulo.textContent = r.curso || r.nome || 'Certificado';
        var papel = r.papel || r.frente || '';
        var moldura = document.getElementById('pf-cert-papel');
        if (moldura) {
            moldura.innerHTML = papel
                ? '<img src="' + pfEsc(papel) + '" alt="Papel do certificado">'
                : '<div class="pf-aviso">Este certificado ainda não possui papel anexado.</div>';
        }
        var inst = r.instituicao || {};
        var texto = pfPersonalizar(r.declaracao || '');
        var rodape = [inst.nomeFantasia || inst.razaoSocial, inst.cnpj ? ('CNPJ: ' + inst.cnpj) : '']
            .filter(Boolean).join(' | ');
        var alvo = document.getElementById('pf-cert-texto');
        if (alvo) alvo.textContent = (texto || 'Sem declaração cadastrada.') + (rodape ? '\n\n' + rodape : '');
        var ov = document.getElementById('pf-cert-overlay');
        if (ov) { ov.style.display = 'flex'; ov.querySelector('.pf-cert-modal').scrollTop = 0; }
    }

    function pfFecharCertificado(ev) {
        var ov = document.getElementById('pf-cert-overlay');
        if (!ov) return;
        if (ev && ev.target !== ov) return;
        ov.style.display = 'none';
    }

    /* ---------- BLOG ---------- */
    function pfIniciarBlog() {
        if (window.FarnNoticias && typeof dbFirestore !== 'undefined') {
            FarnNoticias.render('pf-lista-noticias', 'todos', {
                compact: true,
                emptyText: 'Nenhuma notícia publicada ainda.'
            });
        } else {
            setTimeout(pfIniciarBlog, 400);
        }
    }

    /* ---------- SESSAO ---------- */
    function pfEncerrar(msg) {
        pfUser = null;
        pfCursos = [];
        pfCertificados = [];
        try { localStorage.removeItem(PF_CHAVE); } catch (e) {}
        document.getElementById('pf-tela-app').style.display = 'none';
        document.getElementById('pf-tela-login').style.display = 'flex';
        pfErro(msg);
    }

    async function pfValidarSessao() {
        if (!pfUser || !pfUser.senha || typeof farnFormadoLocalizar !== 'function') return;
        try {
            var ainda = await farnFormadoLocalizar(dbFirestore, pfUser.cpf, pfUser.senha);
            if (!ainda) {
                pfEncerrar('Seu acesso foi encerrado: não há curso/turma CONCLUÍDO vinculado ao seu CPF.');
                return;
            }
            pfUser = ainda;
            pfCursos = await farnFormadoListarCursos(dbFirestore, pfUser.cpf, pfUser.senha, {});
            try { localStorage.setItem(PF_CHAVE, JSON.stringify(ainda)); } catch (e) {}
            pfAtualizarCursos();
            pfAplicarFoto();
            pfAplicarIconeCurso();
        } catch (e) { console.warn('Validação da sessão do formado:', e); }
    }

    async function pfLogin(ev) {
        if (ev) ev.preventDefault();
        var cpf = pfSoDigitos((document.getElementById('pf-cpf') || {}).value);
        var senha = (document.getElementById('pf-senha') || {}).value || '';
        var erro = document.getElementById('pf-erro'); if (erro) erro.style.display = 'none';
        var btn = document.getElementById('pf-btn-login');
        if (cpf.length !== 11 || !senha) { pfErro('Informe CPF e senha.'); return false; }
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...'; }
        try {
            if (typeof farnFormadoLocalizar !== 'function') throw new Error('Regra de acesso indisponível.');
            var formado = await farnFormadoLocalizar(dbFirestore, cpf, senha);
            if (!formado) {
                pfErro('CPF/senha inválidos ou nenhum curso/turma CONCLUÍDO encontrado para este CPF.');
            } else {
                pfUser = formado;
                pfCursos = await farnFormadoListarCursos(dbFirestore, cpf, senha, {});
                try { localStorage.setItem(PF_CHAVE, JSON.stringify(formado)); } catch (e) {}
                pfMostrarApp();
            }
        } catch (e) {
            console.error('Login do formado:', e);
            pfErro('Falha de conexão. Tente novamente.');
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket" style="margin-right:6px"></i> Entrar'; }
        return false;
    }

    function pfLogout() {
        pfUser = null;
        pfCursos = [];
        try { localStorage.removeItem(PF_CHAVE); } catch (e) {}
        location.href = 'index.html';
    }

    global.pfAbrirMenu = pfAbrirMenu;
    global.pfFecharMenu = pfFecharMenu;
    global.pfSetView = pfSetView;
    global.pfFormatCpf = pfFormatCpf;
    global.pfLogin = pfLogin;
    global.pfLogout = pfLogout;
    global.pfAbrirCertificado = pfAbrirCertificado;
    global.pfFecharCertificado = pfFecharCertificado;

    window.addEventListener('DOMContentLoaded', function () {
        var salvo = null;
        try { salvo = JSON.parse(localStorage.getItem(PF_CHAVE) || 'null'); } catch (e) {}
        if (!salvo || !salvo.cpf) return;
        pfUser = salvo;
        (async function () {
            try {
                pfCursos = await farnFormadoListarCursos(dbFirestore, pfUser.cpf, pfUser.senha, {});
            } catch (e) { console.warn('Erro ao carregar cursos do formado:', e); }
            pfMostrarApp();
            pfValidarSessao();
        })();
    });
})(window);
