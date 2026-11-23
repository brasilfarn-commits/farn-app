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

/* Matrícula do DOCENTE: 6 primeiros dígitos do CPF + data de nascimento
   (DDMMAAAA). Ex.: 12345631011980. */
function admDocMatricula(cpf, nascimento) {
    var c = admDigitos(cpf), d = admDigitos(nascimento);
    var partes = String(nascimento || '').split('-');
    if (partes.length === 3 && partes[0].length === 4) d = partes[2] + partes[1] + partes[0]; // DDMMAAAA
    if (c.length < 6 || d.length !== 8) return '';
    return c.slice(0, 6) + d;
}

var ADM_DOC_ESTADO_CIVIL = ['SOLTEIRO (A)', 'CASADO (A)', 'DIVORCIADO (A)', 'VIÚVO (A)', 'AMIGADO (A)'];
var ADM_DOC_GENERO = ['MASCULINO', 'FEMININO', 'OUTROS'];
var ADM_DOC_FATOR_RH = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
var ADM_DOC_CLINICO = [
    ['hipertensao', 'Hipertensão'], ['diabetes', 'Diabetes'], ['fobias', 'Fobias'],
    ['cancaso', 'Câncer'], ['problemasCronicos', 'Problemas crônicos'],
    ['deficienciaFisica', 'Deficiência física'],
    ['deficienciaPsicologica', 'Deficiência psicológica'],
    ['pressaoBaixa', 'Pressão baixa'], ['cicatriz', 'Cicatriz'], ['tatuagem', 'Tatuagem'],
    ['dentesQuebrados', 'Dentes quebrados'], ['deficienciaAuditiva', 'Deficiência auditiva']
];

/* Campos exclusivos do Docente do admin. O de Coordenação continua usando
   ADM_PESSOA_CAMPOS, sem nenhuma destas alterações. */
var ADM_DOC_CAMPOS = [
    ['nome', 'Nome Completo', 'text'], ['cpf', 'CPF', 'text'],
    ['nascimento', 'Data de Nascimento', 'date'],
    ['estadoCivil', 'Estado Civil', 'select', ADM_DOC_ESTADO_CIVIL],
    ['telefone', 'Telefone / WhatsApp', 'text'], ['email', 'E-mail', 'text'],
    ['genero', 'Gênero', 'select', ADM_DOC_GENERO],
    ['mae', 'Nome da mãe', 'text'], ['pai', 'Nome do pai', 'text'],
    ['nacionalidade', 'Nacionalidade', 'text'], ['naturalidade', 'Naturalidade', 'text'],
    ['profissao', 'Profissão', 'text'], ['cidade', 'Cidade', 'text'], ['estado', 'Estado', 'text'],
    ['matricula', 'Matrícula (gerada pelo CPF + nascimento)', 'matricula'],
    ['senha', 'Senha do Portal', 'text'],
    ['fotoUrl', 'Foto 3x4', 'foto'],
    ['fatorRh', 'Fator RH', 'select', ADM_DOC_FATOR_RH]
].concat(ADM_DOC_CLINICO.map(function (x) {
    return [x[0], x[1], 'simnao'];
})).concat([
    ['observacoes', 'Observações', 'textarea']
]);

/* Anexo de foto: recorta em 3x4 (300x400) e reduz a qualidade até caber
   em 1 MB. Nada é enviado a servidor de terceiros. */
function admDocFotoComprimir(arquivo, pronto) {
    var leitor = new FileReader();
    leitor.onerror = function () { pronto(null, 'Não foi possível ler a imagem.'); };
    leitor.onload = function (ev) {
        var img = new Image();
        img.onerror = function () { pronto(null, 'Arquivo de imagem inválido.'); };
        img.onload = function () {
            var alvoW = 300, alvoH = 400;
            var escala = Math.max(alvoW / img.width, alvoH / img.height);
            var w = Math.max(1, Math.round(img.width * escala));
            var h = Math.max(1, Math.round(img.height * escala));
            var x = Math.round((w - alvoW) / 2), y = Math.round((h - alvoH) / 2);
            var canvas = document.createElement('canvas');
            canvas.width = alvoW; canvas.height = alvoH;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, alvoW, alvoH);
            ctx.drawImage(img, -x, -y, w, h);
            /* Limite aplicado ao texto gravado no Firestore (base64), que é
               o que realmente ocupa espaço no documento: ~1 MB. */
            var limite = 1000 * 1024;
            var qualidades = [0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4, 0.32, 0.25, 0.18, 0.1];
            var final = null;
            for (var i = 0; i < qualidades.length; i++) {
                var url = canvas.toDataURL('image/jpeg', qualidades[i]);
                if (url.length <= limite) { final = url; break; }
            }
            if (!final) final = canvas.toDataURL('image/jpeg', 0.08);
            pronto(final, null);
        };
        img.src = ev.target.result;
    };
    leitor.readAsDataURL(arquivo);
}
function admDocFotoKB(dataUrl) {
    return Math.round(String(dataUrl || '').length * 3 / 4 / 1024);
}
function admUsuarioAtual() {
    try {
        var u = JSON.parse(localStorage.getItem('usuarioLogado') || localStorage.getItem('adminUsuario') || 'null');
        if (u && u.nome) return String(u.nome);
    } catch (e) {}
    return 'Administração';
}

/* ---------- CATALOGO DE PERMISSOES DO ADMIN ----------
   Todo item novo (relatorio, aba de curso, acao de docente) entra aqui com
   VER ligado e EDITAR desligado. Itens de acao entram com VER desligado. */
var ADM_PERM_FIXO = [
    { titulo: 'VISÃO GERAL', itens: [
        { chave: 'sec:inicio', rotulo: 'Seção Início liberada' },
        { chave: 'sec:relatorios', rotulo: 'Seção Relatórios' }
    ]},
    { titulo: 'CADASTRO DE CURSOS', itens: [
        { chave: 'sec:cadastroCursos', rotulo: 'Acessar Cadastro de Cursos' },
        { chave: 'cc:cursosAndamento', rotulo: 'Cursos em andamento' },
        { chave: 'cc:cursosConcluidos', rotulo: 'Cursos concluídos' },
        { chave: 'cc:guiasVisaoGeral', rotulo: 'Guias / Visão Geral' },
        { chave: 'cc:criarAvaliacao', rotulo: 'Criar Avaliação' },
        { chave: 'cc:disciplinasAulas', rotulo: 'Disciplinas e Aulas' },
        { chave: 'cc:individuos', rotulo: 'Indivíduos' },
        { chave: 'cc:projeto', rotulo: 'Projeto' },
        { chave: 'cc:preInscricao', rotulo: 'Pré-Inscrição' },
        { chave: 'cc:apontamento', rotulo: 'Apontamento' },
        { chave: 'cc:fichaCurso', rotulo: 'Ficha do Curso' },
        { chave: 'cc:certificados', rotulo: 'Certificados' },
        { chave: 'cc:secaoAvaliacao', rotulo: 'Seção de Avaliação' },
        { chave: 'cc:permissoes', rotulo: 'Permissões (aba do curso)' },
        { chave: 'cc:editarCursos', rotulo: 'Editar cursos (criar, status, excluir)', acao: true }
    ]},
    { titulo: 'SEÇÃO DOCENTE', itens: [
        { chave: 'sec:docente', rotulo: 'Acessar Seção Docente' },
        { chave: 'doc:listaDocentes', rotulo: 'Lista de Docentes' },
        { chave: 'doc:edicao', rotulo: 'Edição de Docentes', acao: true },
        { chave: 'doc:exclusao', rotulo: 'Exclusão de Docentes', acao: true },
        { chave: 'doc:impressao', rotulo: 'Impressão de Docentes', acao: true }
    ]}
];

function admItensDinamicos() {
    var out = [], vistos = {};
    function add(chave, rotulo) {
        if (!chave || vistos[chave]) return;
        vistos[chave] = true;
        out.push({ chave: chave, rotulo: rotulo, acao: false, dinamico: true });
    }
    var area = document.getElementById('admin-relatorios');
    if (area) {
        area.querySelectorAll('.config-card[onclick]').forEach(function (card) {
            var m = (card.getAttribute('onclick') || '').match(/^\s*([A-Za-z_$][\w$]*)/);
            if (!m) return;
            var span = card.querySelector('span');
            add('rel:' + m[1], span ? span.textContent.trim() : m[1]);
        });
    }
    var chavesFixas = {};
    ADM_PERM_FIXO.forEach(function (g) {
        g.itens.forEach(function (i) { chavesFixas[i.chave] = true; });
    });
    document.querySelectorAll('#admin-cadastro-cursos .nav-item[id^="cc-aba-"]').forEach(function (btn) {
        var chave = 'cc:' + btn.id.replace('cc-aba-', '');
        if (!chavesFixas[chave]) add(chave, btn.textContent.trim());
    });
    return out;
}
function admCatalogoPermissoes() {
    var grupos = ADM_PERM_FIXO.map(function (g) {
        return { titulo: g.titulo, itens: g.itens.slice() };
    });
    var dinamicos = admItensDinamicos();
    if (dinamicos.length) {
        grupos.push({ titulo: 'ITENS DINÂMICOS (NOVOS RELATÓRIOS/ABAS)', itens: dinamicos });
    }
    return grupos;
}
function admPermissoesPadrao() {
    var itens = {};
    admCatalogoPermissoes().forEach(function (g) {
        g.itens.forEach(function (i) {
            itens[i.chave] = { ver: true, editar: false };
        });
    });
    return itens;
}
function admEhCoordenador() {
    var u = (typeof currentUserData !== 'undefined') ? currentUserData : null;
    return !!(u && u._origem === 'coordenacao');
}
function admPermItem(chave, acao) {
    var u = (typeof currentUserData !== 'undefined') ? currentUserData : null;
    if (!u) return false;
    if (u.cpf === ADMIN_CPF || (u.permissoes || []).indexOf('admin') >= 0) return true;
    if (!admEhCoordenador()) return true;
    var itens = (u.permAdmin && u.permAdmin.itens) || {};
    var item = itens[chave];
    if (item && typeof item[acao] === 'boolean') return item[acao];
    var catalogo = admCatalogoPermissoes();
    for (var g = 0; g < catalogo.length; g++) {
        for (var i = 0; i < catalogo[g].itens.length; i++) {
            if (catalogo[g].itens[i].chave === chave) {
                return acao === 'ver';
            }
        }
    }
    return acao === 'ver';
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
    var camposCfg = cfg.campos || ADM_PESSOA_CAMPOS;

    function db() { return admDb(); }
    function ref(id) {
        var base = db().collection(Colecao);
        return id ? base.doc(String(id)) : base;
    }
    function el(sufixo) { return document.getElementById(P + '-' + sufixo); }

    /* ---------- FORMULARIO (sem Projeto e sem Turma) ---------- */
    function campo(chave, rotuloCampo, tipo, opcoes, valor) {
        var id = P + '-' + chave;
        var v = admEsc(valor == null ? '' : valor);
        var input;
        if (tipo === 'textarea') {
            input = '<textarea id="' + id + '" class="config-input" rows="2">' + v + '</textarea>';
        } else if (tipo === 'select') {
            var lista = opcoes || [];
            var atual = valor == null ? '' : String(valor);
            var extra = (atual && lista.indexOf(atual) < 0)
                ? '<option value="' + v + '" selected>' + v + '</option>' : '';
            input = '<select id="' + id + '" class="config-input">'
                + '<option value="">— Selecione —</option>' + extra
                + lista.map(function (o) {
                    return '<option value="' + admEsc(o) + '"' + (o === atual ? ' selected' : '') + '>' + admEsc(o) + '</option>';
                }).join('') + '</select>';
        } else if (tipo === 'simnao') {
            var escolhido = valor == null ? '' : String(valor);
            input = '<div style="display:flex;gap:14px;align-items:center;height:38px">'
                + ['Sim', 'Não'].map(function (op) {
                    return '<label style="display:flex;gap:5px;align-items:center;font-size:12px;font-weight:600;margin:0">'
                        + '<input type="radio" name="' + id + '" value="' + op + '"'
                        + (escolhido === op ? ' checked' : '') + ' style="width:15px;height:15px;accent-color:#0d9488">'
                        + op + '</label>';
                }).join('') + '</div>';
        } else if (tipo === 'matricula') {
            input = '<input type="text" id="' + id + '" class="config-input" value="' + v + '" readonly'
                + ' style="background:#f8fafc;font-weight:700;color:#0f766e">'
                + '<div style="font-size:9px;color:#94a3b8;margin-top:3px">6 primeiros dígitos do CPF + data de nascimento (DDMMAAAA)</div>';
        } else if (tipo === 'foto') {
            var fotoAtual = valor ? String(valor) : '';
            input = '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">'
                + '<div id="' + P + '-foto-preview" style="width:72px;height:96px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center">'
                + (fotoAtual ? '<img src="' + v + '" style="width:100%;height:100%;object-fit:cover">'
                             : '<i class="fa-solid fa-image" style="font-size:22px;color:#94a3b8"></i>')
                + '</div>'
                + '<div><input type="hidden" id="' + id + '" value="' + v + '">'
                + '<input type="file" id="' + P + '-foto-file" accept="image/*" style="display:none" onchange="' + P + 'FotoArquivo(this.files)">'
                + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
                + '<button type="button" class="btn-outline btn-sm" onclick="document.getElementById(\'' + P + '-foto-file\').click()"><i class="fa-solid fa-paperclip"></i> ANEXAR FOTO</button>'
                + '<button type="button" class="btn-outline btn-sm" onclick="' + P + 'FotoRemover()"><i class="fa-solid fa-trash"></i> REMOVER</button>'
                + '</div><div id="' + P + '-foto-status" style="font-size:10px;color:#64748b;margin-top:5px">'
                + (fotoAtual ? 'Foto cadastrada (' + admDocFotoKB(fotoAtual) + ' KB).' : 'JPG/PNG — ajustada para 3x4 e no máximo 1 MB.')
                + '</div></div></div>';
        } else {
            input = '<input type="' + tipo + '" id="' + id + '" class="config-input" value="' + v + '">';
        }
        return '<div class="form-group"><label>' + admEsc(rotuloCampo) + '</label>' + input + '</div>';
    }
    function formHTML(reg) {
        var p = reg || {};
        var campos = camposCfg.map(function (x) {
            return campo(x[0], x[1], x[2], x[3], p[x[0]]);
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
        camposCfg.forEach(function (x) {
            var chave = x[0], tipo = x[2];
            if (tipo === 'simnao') {
                var marcado = document.querySelector('input[name="' + P + '-' + chave + '"]:checked');
                dados[chave] = marcado ? marcado.value : 'Não';
            } else {
                var node = el(chave);
                dados[chave] = node ? String(node.value || '').trim() : '';
            }
        });
        dados.cpf = admDigitos(dados.cpf);
        dados.whatsapp = dados.telefone;
        dados.tipoPessoa = ((el('tipoPessoa') || {}).value || 'A');
        dados.idade = dados.nascimento ? admIdade(dados.nascimento) : 0;
        if (cfg.prefixo === 'doc') {
            var gerada = admDocMatricula(dados.cpf, dados.nascimento);
            if (gerada) dados.matricula = gerada;
        }
        return dados;
    }
    function atualizarMatricula() {
        if (cfg.prefixo !== 'doc') return;
        var node = el('matricula');
        if (!node) return;
        var gerada = admDocMatricula((el('cpf') || {}).value || '', (el('nascimento') || {}).value || '');
        if (gerada) node.value = gerada;
    }
    function docFotoArquivo(files) {
        var arquivo = files && files[0];
        if (!arquivo) return;
        if (String(arquivo.type || '').indexOf('image/') !== 0) {
            alert('Escolha um arquivo de imagem.'); return;
        }
        var status = el('foto-status');
        if (status) { status.textContent = 'Ajustando foto para 3x4 e reduzindo para no máximo 1 MB...'; status.style.color = '#64748b'; }
        admDocFotoComprimir(arquivo, function (dataUrl, erro) {
            if (erro || !dataUrl) {
                if (status) { status.textContent = erro || 'Não foi possível processar a imagem.'; status.style.color = '#dc2626'; }
                return;
            }
            var campoFoto = el('fotoUrl');
            if (campoFoto) campoFoto.value = dataUrl;
            var prev = el('foto-preview');
            if (prev) prev.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover">';
            if (status) {
                status.textContent = 'Foto anexada (' + admDocFotoKB(dataUrl) + ' KB). Clique em Salvar para gravar.';
                status.style.color = '#16a34a';
            }
        });
    }
    function docFotoRemover() {
        var campoFoto = el('fotoUrl');
        if (campoFoto) campoFoto.value = '';
        var file = el('foto-file');
        if (file) file.value = '';
        var prev = el('foto-preview');
        if (prev) prev.innerHTML = '<i class="fa-solid fa-image" style="font-size:22px;color:#94a3b8"></i>';
        var status = el('foto-status');
        if (status) { status.textContent = 'Foto será removida ao salvar.'; status.style.color = '#f57f17'; }
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
        if (cfg.prefixo === 'doc') {
            atualizarMatricula();
            ['cpf', 'nascimento'].forEach(function (k) {
                var node = el(k);
                if (node) node.addEventListener('input', atualizarMatricula);
            });
        }
        painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function novo() {
        if (cfg.prefixo === 'doc' && !admPermItem('doc:edicao', 'editar')) {
            alert('Seu perfil não permite editar docentes.'); return;
        }
        abrirForm(null);
    }
    function editar(id) {
        if (cfg.prefixo === 'doc' && !admPermItem('doc:edicao', 'editar')) {
            alert('Seu perfil não permite editar docentes.'); return;
        }
        abrirForm(id);
    }
    function voltarForm() {
        editando = null;
        var painel = el('form-painel');
        var lista = el('lista-wrap');
        if (painel) { painel.style.display = 'none'; painel.innerHTML = ''; }
        if (lista) lista.style.display = '';
    }

    async function salvar() {
        if (cfg.prefixo === 'doc' && !admPermItem('doc:edicao', 'editar')) {
            alert('Seu perfil não permite editar docentes.'); return false;
        }
        var dados = valores();
        if (!dados.nome) { alert('Informe o nome do ' + rotulo + '.'); return false; }
        if (admDigitos(dados.cpf).length !== 11) { alert('Informe um CPF válido.'); return false; }
        var agora = new Date().toISOString();
        if (!dados.matricula) dados.matricula = admMatricula(dados.cpf);
        dados.tipo = cfg.tipoRegistro;
        dados.situacao = (editando && editando.situacao) || 'Ativo';
        /* O login do Portal consulta "status"; sem ele o cadastro cairia no
           fallback e poderia ser recusado em telas que exigem Ativo. */
        if (cfg.prefixo === 'doc') dados.status = (editando && editando.status) || 'Ativo';
        var campoNovo = cfg.prefixo === 'doc' ? 'permPortal' : 'permAdmin';
        dados[campoNovo] = (editando && editando[campoNovo] && editando[campoNovo].itens)
            ? editando[campoNovo]
            : { itens: (cfg.prefixo === 'doc' ? padraoPerm() : admPermissoesPadrao()), atualizadoEm: agora };
        dados.atualizadoEm = agora;
        try {
            if (editando && editando._id) {
                await ref(editando._id).update(dados);
            } else {
                dados.criadoEm = agora;
                dados.cadastradoPor = admUsuarioAtual();
                await ref().add(dados);
            }
            /* Confere se o adaptador conseguiu enviar ao servidor antes de
               confirmar. O cache local pode conter o registro mesmo quando o
               envio falhou; nesse caso o dado some ao recarregar a pagina. */
            var status = null;
            try {
                await new Promise(function (r) { setTimeout(r, 400); });
                var banco = db();
                if (banco && typeof banco.status === 'function') status = banco.status();
            } catch (e2) {}
            var pendente = status && (status.online === false || status.pendentes > 0);
            voltarForm();
            /* Um filtro de busca ativo pode esconder o registro recem-salvo. */
            var campoBusca = el('busca');
            if (campoBusca) campoBusca.value = '';
            await inicializar(true);
            var msg = rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + ' salvo na tabela própria "' + Colecao + '".';
            if (pendente) msg += '\n\nATENÇÃO: o servidor não confirmou a gravação. O registro pode desaparecer ao recarregar. Verifique a conexão com o servidor próprio e tente novamente.';
            alert(msg);
        } catch (e) { alert('Erro ao salvar ' + rotulo + ': ' + e.message); }
        return false;
    }
    async function excluir(id) {
        if (cfg.prefixo === 'doc' && !admPermItem('doc:exclusao', 'editar')) {
            alert('Seu perfil não permite excluir docentes.'); return;
        }
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
        if (cfg.prefixo === 'doc' && !admPermItem('doc:impressao', 'editar')) {
            alert('Seu perfil não permite imprimir docentes.'); return;
        }
        var r = registros.find(function (x) { return x._id === id; }) || null;
        if (!r) return;
        var w = window.open('', '_blank');
        if (!w) { alert('Permita pop-ups para imprimir a ficha.'); return; }
        var foto = r.fotoUrl && /^(https?:\/\/|data:image\/)/i.test(String(r.fotoUrl))
            ? '<img class="foto" src="' + admEsc(r.fotoUrl) + '" alt="Foto">' : '';
        var clinico = '';
        if (cfg.prefixo === 'doc') {
            var colunas = function (rotulo, valor) {
                return '<div class="col"><div class="label">' + admEsc(rotulo) + '</div><div class="val">'
                    + admEsc(valor || 'Não') + '</div></div>';
            };
            clinico = '<h2>Dados clínicos</h2>'
                + '<div class="row">' + colunas('Fator RH', r.fatorRh || '-')
                + colunas('Gênero', r.genero || '-') + colunas('Estado civil', r.estadoCivil || '-') + '</div>'
                + '<div class="row">'
                + ADM_DOC_CLINICO.map(function (c) { return colunas(c[1], r[c[0]] || 'Não'); }).join('')
                + '</div>';
        }
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
            + clinico
            + (r.observacoes ? '<h2>Observações</h2><div class="val">' + admEsc(r.observacoes) + '</div>' : '')
            + '<script>window.addEventListener("load",function(){window.print();});<\/script></body></html>';
        w.document.write(html);
        w.document.close();
    }

    /* ---------- PERMISSOES ----------
       Coordenação: permAdmin (painel administrativo).
       Docente: permPortal (Portal do Usuário). */
    function campoPerm() { return cfg.prefixo === 'doc' ? 'permPortal' : 'permAdmin'; }
    function modalPermId() { return cfg.prefixo === 'doc' ? 'doc-perm-modal' : 'adm-perm-modal'; }
    function catalogoPerm() {
        return cfg.prefixo === 'doc'
            ? ((typeof puCatalogoPermissoes === 'function') ? puCatalogoPermissoes() : [])
            : admCatalogoPermissoes();
    }
    function padraoPerm() {
        return cfg.prefixo === 'doc'
            ? ((typeof puPermissoesPadrao === 'function') ? puPermissoesPadrao() : {})
            : admPermissoesPadrao();
    }
    function abrirPermissoes(id) {
        var r = registros.find(function (x) { return x._id === id; }) || null;
        if (!r) return;
        var campo = campoPerm();
        var itens = padraoPerm();
        if (r[campo] && r[campo].itens) Object.assign(itens, r[campo].itens);
        var catalogo = catalogoPerm();
        var idx = 0;
        var linhas = catalogo.map(function (g) {
            return '<div style="margin-bottom:18px">'
                + '<h4 style="font-size:11px;font-weight:800;color:#7c3aed;letter-spacing:.06em;margin:0 0 8px">' + admEsc(g.titulo) + '</h4>'
                + '<table class="data-table" style="width:100%"><thead><tr>'
                + '<th>Item</th><th style="width:80px;text-align:center">Ver</th><th style="width:80px;text-align:center">Editar</th>'
                + '</tr></thead><tbody>'
                + g.itens.map(function (i) {
                    var v = itens[i.chave] || { ver: false, editar: false };
                    var n = idx++;
                    return '<tr>'
                        + '<td style="padding:7px;font-size:12px">' + admEsc(i.rotulo)
                        + (i.dinamico ? ' <span style="font-size:8px;font-weight:800;color:#0d9488">(novo)</span>' : '') + '</td>'
                        + '<td style="text-align:center"><input type="checkbox" class="admperm-check" data-chave="' + admEsc(i.chave) + '" data-acao="ver" data-i="' + n + '"'
                        + (v.ver ? ' checked' : '') + ' style="width:15px;height:15px;accent-color:#7c3aed"></td>'
                        + '<td style="text-align:center"><input type="checkbox" class="admperm-check" data-chave="' + admEsc(i.chave) + '" data-acao="editar" data-i="' + n + '"'
                        + (v.editar ? ' checked' : '') + ' style="width:15px;height:15px;accent-color:#7c3aed"></td>'
                        + '</tr>';
                }).join('')
                + '</tbody></table></div>';
        }).join('');
        var mid = modalPermId();
        var fechar = P + 'FecharPermissoes';
        var salvar = P + 'SalvarPermissoes';
        var html = '<div class="modal-overlay" id="' + mid + '" onclick="if(event.target===this)' + fechar + '()">'
            + '<div class="modal-content" style="max-width:820px;width:95%">'
            + '<div class="modal-header"><h3><i class="fa-solid fa-shield-halved" style="color:#7c3aed;margin-right:8px"></i> Permissões — ' + admEsc(r.nome) + '</h3>'
            + '<button class="modal-close" onclick="' + fechar + '()"><i class="fa-solid fa-xmark"></i></button></div>'
            + '<div class="modal-body">'
            + '<p style="font-size:12px;color:#475569;margin:0 0 12px">Marque <b>Ver</b> para liberar a tela/aba e <b>Editar</b> para permitir alterações. Itens novos entram marcados apenas para visualização.</p>'
            + linhas
            + '</div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;padding:14px;border-top:1px solid #e2e8f0">'
            + '<button class="btn-outline" onclick="' + fechar + '()">Cancelar</button>'
            + '<button class="btn-primary" onclick="' + salvar + '(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-floppy-disk"></i> Salvar e aplicar no login</button>'
            + '</div></div></div>';
        var antigo = document.getElementById(mid);
        if (antigo) antigo.remove();
        document.body.insertAdjacentHTML('beforeend', html);
    }
    function fecharPermissoes() {
        var m = document.getElementById(modalPermId());
        if (m) m.remove();
    }
    async function salvarPermissoes(id) {
        var itens = {};
        document.querySelectorAll('#' + modalPermId() + ' .admperm-check').forEach(function (cb) {
            var chave = cb.getAttribute('data-chave');
            var acao = cb.getAttribute('data-acao');
            if (!itens[chave]) itens[chave] = { ver: false, editar: false };
            itens[chave][acao] = cb.checked;
        });
        var campo = campoPerm();
        try {
            var dados = {};
            dados[campo] = { itens: itens, atualizadoEm: new Date().toISOString() };
            await ref(id).update(dados);
            fecharPermissoes();
            await inicializar(true);
            var r = registros.find(function (x) { return x._id === id; }) || {};
            var u = (typeof currentUserData !== 'undefined') ? currentUserData : null;
            if (u && u._docId === id) {
                u[campo] = { itens: itens };
                if (cfg.prefixo === 'coord' && typeof applyUserPermissions === 'function') applyUserPermissions();
                if (cfg.prefixo === 'coord' && typeof ccAplicarPermissoesCoord === 'function') ccAplicarPermissoesCoord();
                if (cfg.prefixo === 'doc' && typeof puAplicarPermissoes === 'function') puAplicarPermissoes();
            }
            alert('Permissões salvas para ' + (r.nome || ('o ' + rotulo)) + '.');
        } catch (e) { alert('Erro ao salvar permissões: ' + e.message); }
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
        var podeEditar = admPermItem('doc:edicao', 'ver');
        var podeExcluir = admPermItem('doc:exclusao', 'ver');
        var podeImprimir = admPermItem('doc:impressao', 'ver');
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
                + '<button class="btn-outline btn-sm" title="PERMISSÕES" onclick="' + P + 'Permissoes(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-shield-halved"></i> PERMISSÕES</button>'
                + (podeEditar
                    ? '<button class="btn-icon" title="Editar" onclick="' + P + 'Editar(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-pen"></i></button>'
                    : '')
                + (podeImprimir
                    ? '<button class="btn-icon" title="Imprimir" onclick="' + P + 'Imprimir(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-print"></i></button>'
                    : '')
                + (podeExcluir
                    ? '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="' + P + 'Excluir(\'' + admEsc(r._id) + '\')"><i class="fa-solid fa-trash"></i></button>'
                    : '')
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
    if (cfg.prefixo === 'coord') {
        window.coordPermissoes = abrirPermissoes;
        window.coordSalvarPermissoes = salvarPermissoes;
        window.coordFecharPermissoes = fecharPermissoes;
    }
    if (cfg.prefixo === 'doc') {
        window.docFotoArquivo = docFotoArquivo;
        window.docFotoRemover = docFotoRemover;
        window.docPermissoes = abrirPermissoes;
        window.docSalvarPermissoes = salvarPermissoes;
        window.docFecharPermissoes = fecharPermissoes;
    }
}

/* Helpers globais usados por app.js e cadastro-cursos.js. */
window.admEhCoordenador = admEhCoordenador;
window.admPermItem = admPermItem;
window.admCatalogoPermissoes = admCatalogoPermissoes;
window.admPermissoesPadrao = admPermissoesPadrao;

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
    campos: ADM_DOC_CAMPOS,
    fnInicializar: 'docenteAdminInicializar'
});
