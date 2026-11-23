/* =====================================================================
   COORDENAÇÃO E DOCENTE - cadastros independentes do administrador
   ---------------------------------------------------------------------
   Tabelas proprias no Firestore:
     - coordenacao   -> seção Coordenação
     - docentesAdmin -> seção Docente (a antiga 'docentes' continua intacta)

   O formulario replica os campos pessoais do formulario de pessoa usado no
   Cadastro de Cursos (mesmo conteúdo da guia Formados/Indivíduos), mas SEM
   os campos Projeto e Turma. Cada secao tem helpers, cache e gravacao
   exclusivos: nada e escrito em 'candidatos', 'usuarios', 'cursosCadastro'
   ou na tabela antiga 'docentes'.
   ===================================================================== */

var COORD_COLECAO = 'coordenacao';
var DOC_COLECAO = 'docentesAdmin';

/* Mesmos campos de CC_PESSOA_CAMPOS, sem projeto/turma. */
var ADM_PESSOA_CAMPOS = [
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

/* ---------- HELPERS COMPARTILHADOS ---------- */
function admDb() { return (typeof dbFirestore !== 'undefined') ? dbFirestore : null; }

function admEsc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function admDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function admNormalizar(v) {
    return String(v == null ? '' : v)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function admFormatCPF(v) {
    var c = admDigitos(v);
    if (c.length !== 11) return v == null ? '' : String(v);
    return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
function admIdade(nasc) {
    if (!nasc) return 0;
    var d = new Date(String(nasc).slice(0, 10));
    if (isNaN(d.getTime())) return 0;
    var hoje = new Date(), idade = hoje.getFullYear() - d.getFullYear();
    var m = hoje.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade--;
    return idade > 0 ? idade : 0;
}
function admMatricula(cpf) {
    var d = admDigitos(cpf);
    if (d.length < 5) return '';
    return 'ACD' + d.slice(-5);
}
function admUsuarioAtual() {
    try {
        var u = JSON.parse(localStorage.getItem('usuarioLogado') || localStorage.getItem('adminUsuario') || 'null');
        if (u && u.nome) return String(u.nome);
    } catch (e) {}
    return 'Administração';
}

/* ---------- FABRICA DE CADASTRO ---------- */
function criarCadastroAdminPessoa(cfg) {
    var P = cfg.prefixo;                 // coord | doc
    var Colecao = cfg.colecao;
    var rotulo = cfg.rotulo;             // coordenador | docente
    var plural = cfg.plural;
    var cor = cfg.cor;
    var icon = cfg.icon;

    var registros = [];
    var editando = null;
    var tentativas = 0;

    function db() { return admDb(); }
    function ref(id) {
        var base = db().collection(Colecao);
        return id ? base.doc(String(id)) : base;
    }
    function el(sufixo) { return document.getElementById(P + '-' + sufixo); }

    /* ---------- FORMULARIO (sem Projeto e sem Turma) ---------- */
    function campo(chave, rotuloCampo, tipo, valor) {
        var id = P + '-' + chave;
        var v = admEsc(valor == null ? '' : valor);
        var input = tipo === 'textarea'
            ? '<textarea id="' + id + '" class="config-input" rows="2">' + v + '</textarea>'
            : '<input type="' + tipo + '" id="' + id + '" class="config-input" value="' + v + '">';
        return '<div class="form-group"><label>' + admEsc(rotuloCampo) + '</label>' + input + '</div>';
    }
    function formHTML(reg) {
        var p = reg || {};
        var campos = ADM_PESSOA_CAMPOS.map(function (x) {
            return campo(x[0], x[1], x[2], p[x[0]]);
        }).join('');
        var tipo = p.tipoPessoa || 'A';
        return '<div class="card full-width">'
            + '<div class="card-header"><h3><i class="fa-solid ' + icon + '" style="color:' + cor + ';margin-right:8px"></i>'
            + admEsc(reg ? cfg.tituloEditar : cfg.tituloNovo) + '</h3>'
            + '<span style="margin-left:auto;font-size:10px;font-weight:800;padding:3px 9px;border-radius:8px;background:#f1f5f9;color:#475569">TABELA: '
            + admEsc(Colecao) + '</span></div>'
            + '<div class="card-body">'
            + '<div class="form-row">'
            + '<div class="form-group"><label>Tipo</label><select id="' + P + '-tipoPessoa" class="config-input">'
            + '<option value="A"' + (tipo === 'A' ? ' selected' : '') + '>Acadêmico</option>'
            + '<option value="F"' + (tipo === 'F' ? ' selected' : '') + '>Formado</option>'
            + '</select></div>'
            + '</div>'
            + '<div class="form-row">' + campos + '</div>'
            + '<div style="display:flex;gap:8px;margin-top:14px">'
            + '<button type="button" class="btn-primary" onclick="' + P + 'Salvar()"><i class="fa-solid fa-floppy-disk"></i> Salvar ' + admEsc(rotulo) + '</button>'
            + '<button type="button" class="btn-outline" onclick="' + P + 'VoltarForm()"><i class="fa-solid fa-arrow-left"></i> Cancelar</button>'
            + '</div></div></div>';
    }
    function valores() {
        var dados = {};
        ADM_PESSOA_CAMPOS.forEach(function (x) {
            var node = el(x[0]);
            dados[x[0]] = node ? String(node.value || '').trim() : '';
        });
        dados.cpf = admDigitos(dados.cpf);
        dados.whatsapp = dados.telefone;
        dados.tipoPessoa = ((el('tipoPessoa') || {}).value || 'A');
        dados.idade = dados.nascimento ? admIdade(dados.nascimento) : 0;
        return dados;
    }

    async function abrirForm(id) {
        var painel = el('form-painel');
        var lista = el('lista-wrap');
        if (!painel) return;
        if (!db()) { alert('Firebase não conectado. Recarregue a página.'); return; }
        var reg = null;
        if (id) {
            reg = registros.find(function (x) { return x._id === id; }) || null;
            if (!reg) {
                try {
                    var d = await ref(id).get();
                    if (d.exists) reg = Object.assign({ _id: d.id }, d.data() || {});
                } catch (e) {}
            }
            if (!reg) { alert(rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + ' não encontrado.'); return; }
        }
        editando = reg || null;
        painel.innerHTML = formHTML(reg);
        painel.style.display = '';
        if (lista) lista.style.display = 'none';
        painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function novo() { abrirForm(null); }
    function editar(id) { abrirForm(id); }
    function voltarForm() {
        editando = null;
        var painel = el('form-painel');
        var lista = el('lista-wrap');
        if (painel) { painel.style.display = 'none'; painel.innerHTML = ''; }
        if (lista) lista.style.display = '';
    }

    async function salvar() {
        var dados = valores();
        if (!dados.nome) { alert('Informe o nome do ' + rotulo + '.'); return false; }
        if (admDigitos(dados.cpf).length !== 11) { alert('Informe um CPF válido.'); return false; }
        var agora = new Date().toISOString();
        if (!dados.matricula) dados.matricula = admMatricula(dados.cpf);
        dados.tipo = cfg.tipoRegistro;
        dados.situacao = (editando && editando.situacao) || 'Ativo';
        dados.atualizadoEm = agora;
        try {
            if (editando && editando._id) {
                await ref(editando._id).update(dados);
            } else {
                dados.criadoEm = agora;
                dados.cadastradoPor = admUsuarioAtual();
                await ref().add(dados);
            }
            voltarForm();
            await inicializar(true);
            alert(rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + ' salvo na tabela própria "' + Colecao + '".');
        } catch (e) { alert('Erro ao salvar ' + rotulo + ': ' + e.message); }
        return false;
    }
    async function excluir(id) {
        var r = registros.find(function (x) { return x._id === id; }) || null;
        if (!r) return;
        if (!confirm('Excluir "' + (r.nome || '') + '" da tabela de ' + plural + '?')) return;
        try {
            await ref(id).delete();
            await inicializar(true);
        } catch (e) { alert('Erro ao excluir ' + rotulo + ': ' + e.message); }
    }

    /* ---------- IMPRESSAO ---------- */
    function imprimir(id) {
        var r = registros.find(function (x) { return x._id === id; }) || null;
        if (!r) return;
        var w = window.open('', '_blank');
        if (!w) { alert('Permita pop-ups para imprimir a ficha.'); return; }
        var foto = r.fotoUrl && /^https?:\/\//i.test(String(r.fotoUrl))
            ? '<img class="foto" src="' + admEsc(r.fotoUrl) + '" alt="Foto">' : '';
        var html = '<html><head><meta charset="utf-8"><title>FARN - ' + admEsc(r.nome || '') + '</title><style>'
            + 'body{font-family:Arial,sans-serif;padding:36px;color:#222}h1{color:#1a237e;font-size:19px;margin:0}'
            + 'h2{font-size:14px;margin:20px 0 8px;border-bottom:2px solid #1a237e;padding-bottom:5px}'
            + '.row{display:flex;gap:18px;margin-bottom:8px}.col{flex:1}.label{font-size:10px;color:#666;text-transform:uppercase}'
            + '.val{font-size:13px;margin-top:2px}.topo{display:flex;gap:20px;align-items:flex-start;margin-bottom:14px}'
            + '.foto{width:92px;height:120px;object-fit:cover;border:2px solid #1a237e;border-radius:6px}'
            + '.sit{display:inline-block;padding:3px 9px;border-radius:8px;font-size:10px;font-weight:800;background:#f1f5f9;color:#475569}'
            + '@media print{body{padding:18px}}</style></head><body><div class="topo">'
            + foto
            + '<div><h1>FARN - Força Auxiliar de Resgate Nacional</h1>'
            + '<p style="color:#666;margin:4px 0">Ficha do ' + admEsc(rotulo) + '</p>'
            + '<span class="sit">' + admEsc(r.situacao || 'Ativo') + '</span></div></div>'
            + '<h2>Dados pessoais</h2>'
            + '<div class="row"><div class="col"><div class="label">Nome</div><div class="val">' + admEsc(r.nome || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">CPF</div><div class="val">' + admEsc(admFormatCPF(r.cpf)) + '</div></div>'
            + '<div class="col"><div class="label">Nascimento</div><div class="val">' + admEsc(r.nascimento || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">E-mail</div><div class="val">' + admEsc(r.email || '-') + '</div></div>'
            + '<div class="col"><div class="label">Telefone / WhatsApp</div><div class="val">' + admEsc(r.whatsapp || r.telefone || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">Nome da mãe</div><div class="val">' + admEsc(r.mae || '-') + '</div></div>'
            + '<div class="col"><div class="label">Nome do pai</div><div class="val">' + admEsc(r.pai || '-') + '</div></div></div>'
            + '<div class="row"><div class="col"><div class="label">Naturalidade</div><div class="val">' + admEsc(r.naturalidade || '-') + '</div></div>'
            + '<div class="col"><div class="label">Profissão</div><div class="val">' + admEsc(r.profissao || '-') + '</div></div></div>'
            + '<h2>Cadastro</h2>'
            + '<div class="row"><div class="col"><div class="label">Matrícula / Credencial</div><div class="val" style="font-size:17px;font-weight:800;color:#e65100">'
            + admEsc(r.matricula || '-') + '</div></div><div class="col"><div class="label">Tipo</div><div class="val">'
            + admEsc(r.tipoPessoa === 'F' ? 'Formado' : 'Acadêmico') + '</div></div></div>'
            + (r.observacoes ? '<h2>Observações</h2><div class="val">' + admEsc(r.observacoes) + '</div>' : '')
            + '<script>window.addEventListener("load",function(){window.print();});<\/script></body></html>';
        w.document.write(html);
        w.document.close();
    }

    /* ---------- LISTA ---------- */
    async function inicializar(forcar) {
        if (!db()) {
            if (!forcar && tentativas++ < 20) {
                setTimeout(function () { inicializar(); }, 300);
                return;
            }
            var tb0 = el('tbody');
            if (tb0) tb0.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px">Firebase não conectado. Recarregue a página.</td></tr>';
            return;
        }
        tentativas = 0;
        try {
            var snap = await ref().get();
            registros = [];
            snap.forEach(function (d) {
                registros.push(Object.assign({ _id: d.id }, d.data() || {}));
            });
            registros.sort(function (a, b) {
                return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
            });
            render();
        } catch (e) {
            var tb = el('tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px">Erro ao carregar: '
                + admEsc(e.message) + '</td></tr>';
        }
    }
    function render() {
        var tb = el('tbody');
        if (!tb) return;
        var cnt = el('count');
        if (cnt) cnt.textContent = registros.length;
        var busca = admNormalizar(((el('busca') || {}).value || '').trim());
        var lista = registros.filter(function (r) {
            if (!busca) return true;
            return admNormalizar([r.nome, r.cpf, admFormatCPF(r.cpf), r.matricula, r.email].join(' ')).indexOf(busca) >= 0;
        });
        if (!lista.length) {
            tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">'
                + (registros.length ? 'Nenhum ' + rotulo + ' corresponde à busca.' : 'Nenhum ' + rotulo + ' cadastrado. Clique em ' + cfg.botaoNovo + '.')
                + '</td></tr>';
            return;
        }
        tb.innerHTML = lista.map(function (r) {
            var contato = [r.whatsapp || r.telefone, r.email].filter(Boolean).join(' · ') || '-';
            return '<tr style="border-bottom:1px solid #f1f5f9">'
                + '<td style="padding:8px"><b>' + admEsc(r.nome || '-') + '</b>'
                + (r.idade ? '<div style="font-size:9px;color:#94a3b8">' + r.idade + ' anos</div>' : '') + '</td>'
                + '<td style="padding:8px;color:#475569">' + admEsc(admFormatCPF(r.cpf)) + '</td>'
                + '<td style="padding:8px;color:#0f766e;font-weight:700;font-family:\'Courier New\',monospace">' + admEsc(r.matricula || '-') + '</td>'
                + '<td style="padding:8px;color:#475569;font-size:11px">' + admEsc(contato) + '</td>'
                + '<td style="padding:8px"><span class="badge" style="background:#f1f5f9;color:#475569">' + admEsc(r.situacao || 'Ativo') + '</span></td>'
                + '<td style="padding:8px"><div class="actions-cell">'
                + '<button class="btn-icon" title="Editar" onclick="' + P + 'Editar(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-pen"></i></button>'
                + '<button class="btn-icon" title="Imprimir" onclick="' + P + 'Imprimir(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-print"></i></button>'
                + '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="' + P + 'Excluir(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-trash"></i></button>'
                + '</div></td></tr>';
        }).join('');
    }

    /* ---------- EXPOSICAO GLOBAL ---------- */
    window[cfg.fnInicializar] = inicializar;
    window[P + 'AbrirForm'] = abrirForm;
    window[P + 'Novo'] = novo;
    window[P + 'Editar'] = editar;
    window[P + 'VoltarForm'] = voltarForm;
    window[P + 'Salvar'] = salvar;
    window[P + 'Excluir'] = excluir;
    window[P + 'Imprimir'] = imprimir;
    window[P + 'Render'] = render;
    window[P + 'Buscar'] = render;
}

criarCadastroAdminPessoa({
    prefixo: 'coord',
    colecao: COORD_COLECAO,
    rotulo: 'coordenador',
    plural: 'coordenação',
    tipoRegistro: 'coordenacao',
    tituloNovo: 'Novo coordenador',
    tituloEditar: 'Editar coordenador',
    botaoNovo: 'NOVO CORD.',
    cor: '#7c3aed',
    icon: 'fa-user-tie',
    fnInicializar: 'coordenacaoInicializar'
});

criarCadastroAdminPessoa({
    prefixo: 'doc',
    colecao: DOC_COLECAO,
    rotulo: 'docente',
    plural: 'docentes',
    tipoRegistro: 'docente',
    tituloNovo: 'Novo docente',
    tituloEditar: 'Editar docente',
    botaoNovo: 'NOVO DOCENTE',
    cor: '#0d9488',
    icon: 'fa-chalkboard-user',
    fnInicializar: 'docenteAdminInicializar'
});
