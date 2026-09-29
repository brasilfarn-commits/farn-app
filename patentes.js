/* =============================================================
   PATENTES / POSTOS DA INSTITUICAO
   -------------------------------------------------------------
   Este arquivo nao grava nada. Ele so:
     1. sabe ler um codigo de patente ('FOR-C03-ACI') e traduzir no
        rotulo legivel ('Formado Classe 03 Aspirante a Instrutor
        (com CFF)'), nos dados derivados (grupo, classe, CFF, cargo);
     2. monta a lista de opcoes do seletor a partir das classes
        cadastradas, para quando abrir uma turma nova as patentes
        novas nascerem sozinhas;
     3. sugere a patente quando a pessoa e remanejada (virou formado,
        entrou no CFF, virou docente) -- apenas sugere, quem decide
        e o administrador.

   Como o rotulo vem do codigo, renomear uma patente no futuro nao
   quebra nenhum cadastro ja gravado: o codigo e a verdade e o texto
   e sempre re-derivado.
   ============================================================= */
(function (global) {
    'use strict';

    /* --- GRUPOS: o "tipo de pessoa" da instituicao ------------------- */
    var GRUPOS = [
        { codigo: 'PRE', curto: 'PRE', nome: 'Pre-Inscrito (ainda sem matricula)',            cor: '#64748b' },
        { codigo: 'ACD', curto: 'ACD', nome: 'Aluno Ativo',                                    cor: '#2563eb' },
        { codigo: 'ACI', curto: 'ACI', nome: 'Aspirante a Instrutor (aluno do CFF)',           cor: '#0891b2' },
        { codigo: 'FOR', curto: 'FOR', nome: 'Formado',                                        cor: '#16a34a' },
        { codigo: 'DOC', curto: 'DOC', nome: 'Docente (Instrutor Efetivo)',                    cor: '#ea580c' },
        { codigo: 'USU', curto: 'USU', nome: 'Usuario do Sistema',                             cor: '#475569' },
        { codigo: 'COO', curto: 'COO', nome: 'Coordenador',                                    cor: '#7c3aed' },
        { codigo: 'ADM', curto: 'ADM', nome: 'Administrador',                                  cor: '#b91c1c' },
        { codigo: 'OUT', curto: 'OUT', nome: 'Outra patente (descreva abaixo)',               cor: '#334155' }
    ];

    /* --- SECOES: so para agrupar as opcoes no <select> ---------------- */
    var SECOES = [
        { titulo: 'Alunos',           codigos: ['PRE', 'ACD', 'ACI'] },
        { titulo: 'Formados',         codigos: ['FOR'] },
        { titulo: 'Docentes',         codigos: ['DOC'] },
        { titulo: 'Usuarios e Comando', codigos: ['USU', 'COO', 'ADM'] },
        { titulo: 'Outras',           codigos: ['OUT'] }
    ];

    /* --- MODIFICADORES do grupo FOR (o que muda dentro de "Formado") - */
    var MODS = [
        { sufixo: '-ACI',  rotulo: 'Formado Classe {classe} Aspirante a Instrutor (com CFF)',                cargo: '' },
        { sufixo: '-DIR',  rotulo: 'Formado Classe {classe} com CFF e efetivo como Diretor',                 cargo: 'DIRETOR' },
        { sufixo: '-DGAG', rotulo: 'Formado Classe {classe} com CFF, Diretor Geral e Administrador Geral', cargo: 'DIRETOR GERAL E ADMINISTRADOR GERAL' }
    ];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function grupoDe(codigo) {
        var alvo = String(codigo || '').toUpperCase();
        for (var i = 0; i < GRUPOS.length; i++) if (GRUPOS[i].codigo === alvo) return GRUPOS[i];
        return null;
    }

    /* 'FOR-C03-ACI' -> { grupo:'FOR', classe:'03', mods:['ACI'] } */
    function partes(codigo) {
        var p = String(codigo || '').trim().toUpperCase().split('-');
        return {
            grupo: p[0] || '',
            classe: (p[1] || '').replace(/^C/, ''),
            mods: p.slice(2).filter(function (x) { return !!x; })
        };
    }

    /* O rotulo. Quando a patente esta CADASTRADA, vale o nome que o
       administrador deu a ela; sem cadastro, o texto sai do codigo, como
       sempre foi. Por isso renomear uma patente funciona e nao quebra
       cadastro nenhum. */
    function rotuloDe(codigo, catalogo) {
        var c = String(codigo || '').trim().toUpperCase();
        if (!c) return '';
        if (catalogo) {
            var reg = catalogoAchado(catalogo, c);
            if (reg && reg.nome) return reg.nome;
        }
        if (c === 'OUT') return 'Outra patente';
        var p = partes(c);
        if (p.grupo === 'FOR') {
            var base = p.classe ? 'Formado Classe ' + p.classe : 'Formado';
            if (p.mods.indexOf('ACI') >= 0) return base + ' Aspirante a Instrutor (com CFF)';
            if (p.mods.indexOf('DIR') >= 0) return base + ' com CFF e efetivo como Diretor';
            if (p.mods.indexOf('DGAG') >= 0) return base + ' com CFF, Diretor Geral e Administrador Geral';
            return base;
        }
        var g = grupoDe(p.grupo);
        return g ? g.nome : c;
    }

    /* Tudo que da para filtrar e gerar relatorio, sem voce preencher. */
    function derivar(codigo, catalogo) {
        var c = String(codigo || '').trim().toUpperCase();
        var p = partes(c);
        var temCff = p.grupo === 'ACI' || p.mods.indexOf('ACI') >= 0
            || p.mods.indexOf('DIR') >= 0 || p.mods.indexOf('DGAG') >= 0;
        return {
            codigo: c,
            grupo: p.grupo,
            classe: p.classe,
            cff: !!temCff,
            cargo: p.mods.indexOf('DGAG') >= 0 ? 'DIRETOR GERAL E ADMINISTRADOR GERAL'
                : p.mods.indexOf('DIR') >= 0 ? 'DIRETOR' : '',
            rotulo: rotuloDe(c, catalogo)
        };
    }

    /* Classes: '1' vira '01', 'classe 3' vira '03', ordena numerica. */
    function normalizarClasses(classes) {
        var out = [], vistos = {};
        (classes || []).forEach(function (c) {
            var s = String(c == null ? '' : c).trim().toUpperCase().replace(/^CLASSE\s*/, '');
            if (!s) return;
            if (/^\d{1,2}$/.test(s)) s = ('0' + s).slice(-2);
            if (vistos[s]) return;
            vistos[s] = 1;
            out.push(s);
        });
        out.sort(function (a, b) {
            var na = parseInt(a, 10), nb = parseInt(b, 10);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a < b ? -1 : a > b ? 1 : 0;
        });
        return out;
    }

    /* A lista completa de patentes. As de formado sao montadas com as
       classes informadas, entao uma turma nova cria as patentes novas. */
    function montarOpcoes(classes) {
        var cls = normalizarClasses(classes);
        var lista = [];
        SECOES.forEach(function (sec) {
            sec.codigos.forEach(function (cod) {
                if (cod !== 'FOR') {
                    var g = grupoDe(cod);
                    if (g) lista.push({ codigo: g.codigo, rotulo: g.nome, grupo: g.codigo });
                    return;
                }
                lista.push({ codigo: 'FOR', rotulo: 'Formado', grupo: 'FOR', classe: '' });
                cls.forEach(function (k) {
                    lista.push({ codigo: 'FOR-C' + k, rotulo: 'Formado Classe ' + k, grupo: 'FOR', classe: k });
                    MODS.forEach(function (m) {
                        lista.push({
                            codigo: 'FOR-C' + k + m.sufixo,
                            rotulo: m.rotulo.replace('{classe}', k),
                            grupo: 'FOR',
                            classe: k
                        });
                    });
                });
            });
        });
        return lista;
    }

    /* As opcoes vindas do CATALOGO. Inativa continua aparecendo (a pessoa
       ja tem essa patente gravada e o cadastro nao pode ficar sem ela),
       so que marcada como inativa, para o administrador saber que ela
       deixou de ser oferecida. */
    function opcoesDoCatalogo(catalogo, classes) {
        return catalogoEfetivo(catalogo, classes).map(function (r) {
            return {
                codigo: r.codigo,
                rotulo: (r.nome || rotuloDe(r.codigo)) + (r.ativo === false ? ' (inativa)' : ''),
                grupo: r.grupo,
                classe: r.classe
            };
        });
    }

    /* Preenche um <select> de patente. Com `catalogo` vem da secao
       PATENTES; sem ele, vem da lista derivada -- e e assim que o
       formulario continua funcionando antes de existir catalogo. Se o
       valor atual nao estiver na lista (classe removida, patente
       antiga), ele e acrescentado no fim para o cadastro nao perder a
       informacao. */
    function popular(el, classes, selecionado, catalogo) {
        if (!el) return;
        var anterior = (selecionado != null ? selecionado : el.value) || '';
        var opcoes = catalogo ? opcoesDoCatalogo(catalogo, classes) : montarOpcoes(classes);
        var tem = opcoes.some(function (o) { return o.codigo === anterior; });
        if (anterior && !tem) {
            opcoes.push({ codigo: anterior, rotulo: rotuloDe(anterior) + ' (fora da lista atual)', grupo: partes(anterior).grupo });
        }
        var html = '';
        SECOES.forEach(function (sec) {
            var itens = opcoes.filter(function (o) { return sec.codigos.indexOf(o.grupo) >= 0; });
            if (!itens.length) return;
            html += '<optgroup label="' + esc(sec.titulo) + '">';
            itens.forEach(function (o) {
                html += '<option value="' + esc(o.codigo) + '">' + esc(o.rotulo) + '</option>';
            });
            html += '</optgroup>';
        });
        /* itens soltos (patente antiga de grupo desconhecido) */
        var soltos = opcoes.filter(function (o) {
            return SECOES.every(function (sec) { return sec.codigos.indexOf(o.grupo) < 0; });
        });
        if (soltos.length) {
            html += '<optgroup label="Outras">';
            soltos.forEach(function (o) {
                html += '<option value="' + esc(o.codigo) + '">' + esc(o.rotulo) + '</option>';
            });
            html += '</optgroup>';
        }
        el.innerHTML = '<option value="">Sem patente</option>' + html;
        el.value = anterior || '';
        if (el.value !== (anterior || '')) el.selectedIndex = 0;
    }

    /* Etiqueta colorida para as listagens. */
    function badge(codigo) {
        if (!codigo) return '';
        var d = derivar(codigo);
        if (!d.codigo) return '';
        var g = grupoDe(d.grupo);
        var cor = g ? g.cor : '#334155';
        return '<span class="patente-badge" style="--pat:' + cor + '"><b>' + esc(g ? g.curto : d.codigo) + '</b>'
            + (d.classe ? '<span class="pat-classe">' + esc(d.classe) + '</span>' : '')
            + (d.cargo ? '<i class="fa-solid fa-star" title="' + esc(d.cargo) + '"></i>' : '')
            + '</span>';
    }

    /* Classe a partir do nome da turma: so para SUGERIR, nunca para gravar. */
    function classeDaTurma(turma) {
        var m = String(turma || '').match(/(\d{1,2})/);
        if (!m) return '';
        return ('0' + m[1]).slice(-2);
    }

    /* Sugestao de patente quando a pessoa muda de situacao. Devolve
       { codigo, rotulo, motivo } ou null se nao faz sentido sugerir. */
    function sugerir(p) {
        p = p || {};
        var c = classeDaTurma(p.turma);
        var base = c ? 'FOR-C' + c : 'FOR';
        var codigo = null, motivo = '';
        if (p.tipo === 'D') { codigo = 'DOC'; motivo = 'docente cadastrado'; }
        else if (p.tipo === 'F' || p.formado) {
            if (p.cargo === 'DGAG') { codigo = base + '-DGAG'; motivo = 'formado e comando geral'; }
            else if (p.cargo === 'DIR') { codigo = base + '-DIR'; motivo = 'formado efetivo como diretor'; }
            else if (p.cff) { codigo = base + '-ACI'; motivo = 'formado matriculado no CFF'; }
            else { codigo = base; motivo = 'formado'; }
        }
        else if (p.cff) { codigo = 'ACI'; motivo = 'aluno matriculado no CFF'; }
        else if (p.status === 'Ativo') { codigo = 'ACD'; motivo = 'aluno ativo'; }
        else { codigo = 'PRE'; motivo = 'pre-inscrito'; }
        return { codigo: codigo, rotulo: rotuloDe(codigo, p.catalogo), motivo: motivo };
    }

    /* Escreve os campos de patente no objeto que vai para o Firestore.
       Usa string vazia em vez de remover a chave, porque boa parte dos
       formularios grava com `merge: true` e a chave antiga voltaria. */
    function aplicar(dados, codigo, quem, obs, catalogo) {
        dados = dados || {};
        var anterior = dados.patente || '';
        var d = derivar(codigo, catalogo);
        if (d.codigo && d.grupo) {
            dados.patente = d.codigo;
            dados.patenteNome = d.rotulo;
            dados.patenteGrupo = d.grupo;
            dados.patenteClasse = d.classe;
            dados.patenteCff = !!d.cff;
            dados.patenteCargo = d.cargo || '';
            dados.patenteObs = d.grupo === 'OUT' ? String(obs || '').trim() : '';
        } else {
            dados.patente = '';
            dados.patenteNome = '';
            dados.patenteGrupo = '';
            dados.patenteClasse = '';
            dados.patenteCff = false;
            dados.patenteCargo = '';
            dados.patenteObs = '';
        }
        if (anterior && anterior !== dados.patente) {
            dados.patenteAnterior = anterior;
            dados.patenteAnteriorNome = rotuloDe(anterior, catalogo);
            dados.patenteAlteradoEm = new Date().toISOString();
            dados.patenteAlteradoPor = quem || 'Administrador';
        }
        return dados;
    }

    /* =================================================================
       CATALOGO DE PATENTES
       -----------------------------------------------------------------
       A partir de agora cada patente e um REGISTRO, com insignia, ordem
       de exibicao e Situacao (ativo/inativo). O registro continua tendo
       o CODIGO como identidade: e por ele que o cadastro da pessoa
       guarda a patente, entao cadastrar, renomear ou desativar uma
       patente nunca quebra o que ja foi gravado nas pessoas.

       Um registro tem esta forma:
         { codigo, nome, grupo, classe, cff, cargo, obs,
           insigniaUrl, ordem, ativo }

       Se o catalogo estiver VAZIO (ninguem cadastrou ainda), os
       formularios continuam usando a lista derivada de sempre. E por
       isso que nada quebra no meio da implantacao.
       ================================================================= */

    /* A ordem em que os grupos aparecem, montada a partir dos dois
       cadastros acima, para a lista do catalogo sair na ordem da
       instituicao e nao em ordem alfabetica. */
    var ORDEM_GRUPO = (function () {
        var m = {}, n = 0;
        SECOES.forEach(function (sec) {
            sec.codigos.forEach(function (cod) {
                if (!(cod in m)) m[cod] = n++;
            });
        });
        GRUPOS.forEach(function (g) { if (!(g.codigo in m)) m[g.codigo] = n++; });
        return m;
    }());

    function ordemDeGrupo(grupo) {
        var g = String(grupo || '').toUpperCase();
        return (g in ORDEM_GRUPO) ? ORDEM_GRUPO[g] : 999;
    }

    /* Converte o que veio do Firestore (ou do formulario) em registro
       limpo: codigo em caixa alta, ordem numerica, ativo booleano,
       sem duplicidade de codigo, na ordem da instituicao. */
    function catalogoNormalizar(lista) {
        var vistos = {};
        var out = [];
        (lista || []).forEach(function (bruto, i) {
            if (!bruto) return;
            var codigo = String(bruto.codigo || '').trim().toUpperCase();
            if (!codigo) return;
            if (vistos[codigo]) return;
            vistos[codigo] = 1;
            var d = derivar(codigo);
            var ordem = parseInt(bruto.ordem, 10);
            out.push({
                codigo: codigo,
                nome: String(bruto.nome || d.rotulo || codigo).trim(),
                grupo: String(bruto.grupo || d.grupo || '').toUpperCase(),
                classe: String(bruto.classe != null ? bruto.classe : d.classe || '').trim(),
                cff: bruto.cff === undefined ? !!d.cff : !!bruto.cff,
                cargo: String(bruto.cargo != null ? bruto.cargo : d.cargo || '').trim(),
                obs: String(bruto.obs || '').trim(),
                insigniaUrl: insigniaNormalizar(bruto.insigniaUrl),
                ordem: isNaN(ordem) ? 999 : ordem,
                ativo: bruto.ativo === undefined ? true : !!bruto.ativo
            });
        });
        out.sort(function (a, b) {
            if (a.ordem !== b.ordem) return a.ordem - b.ordem;
            var oa = ordemDeGrupo(a.grupo), ob = ordemDeGrupo(b.grupo);
            if (oa !== ob) return oa - ob;
            if (a.classe !== b.classe) {
                var na = parseInt(a.classe, 10), nb = parseInt(b.classe, 10);
                if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
                return a.classe < b.classe ? -1 : 1;
            }
            return a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
        });
        return out;
    }

    /* So aceita o que um <img> pode mostrar sem risco:
         - http(s), que e o link do Storage;
         - data:image de um formato debitmap, que e o fallback quando o
           Storage nao esta disponivel.
       Recusa `javascript:`, `vbscript:`, `data:text/html` e qualquer
       outra coisa: um link colado no campo nao pode virar script.
       O SVG fica de fora de proposito -- em <img> ele seria inofensivo,
       mas e o unico formato que costuma dar problema se um dia a insignia
       for desenhada com <object> em vez de <img>. */
    var DATA_IMAGEM_OK = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;
    function insigniaNormalizar(url) {
        var s = String(url || '').trim();
        if (!s) return '';
        if (/^https?:\/\//i.test(s)) return s;
        if (DATA_IMAGEM_OK.test(s)) return s;
        return '';
    }

    /* O catalogo inicial, derivado das classes, no formato de REGISTRO.
       Usado (a) como fallback dos formularios quando o catalogo esta
       vazio e (b) pela opcao "sugerir catalogo inicial" da secao, que
       so mostra a proposta na tela -- quem grava e o administrador. */
    function catalogoMontar(classes) {
        var out = [];
        montarOpcoes(classes).forEach(function (o, i) {
            var d = derivar(o.codigo);
            out.push({
                codigo: o.codigo,
                nome: o.rotulo,
                grupo: d.grupo,
                classe: d.classe,
                cff: !!d.cff,
                cargo: d.cargo || '',
                obs: '',
                insigniaUrl: '',
                ordem: (i + 1) * 10,
                ativo: true
            });
        });
        return out;
    }

    /* O catalogo efetivo: o que esta cadastrado; se ninguem cadastrou
       nada, a lista derivada. Assim os formularios nunca abrem vazios
       e a secao PATENTES mostra quando esta rodando no modo derivado. */
    function catalogoEfetivo(catalogo, classes) {
        var cat = catalogoNormalizar(catalogo);
        return cat.length ? cat : catalogoMontar(classes);
    }

    function catalogoAchado(catalogo, codigo) {
        var c = String(codigo || '').trim().toUpperCase();
        if (!c) return null;
        var lista = catalogoNormalizar(catalogo);
        for (var i = 0; i < lista.length; i++) if (lista[i].codigo === c) return lista[i];
        return null;
    }

    /* A insignia de uma patente, resolvida pelo codigo que a pessoa ja
       tem no cadastro. A pessoa nao guarda insignia: se a patente
       trocar de imagem, a ficha troca junto, sem saves em lote. */
    function insigniaDe(catalogo, codigo) {
        var r = catalogoAchado(catalogo, codigo);
        return (r && r.insigniaUrl) ? r.insigniaUrl : '';
    }

    /* Preenche os campos do formulario a partir do codigo digitado,
       para quem cadastrar a patente nao precisar repetir o grupo. */
    function catalogoSugerirCampos(codigo) {
        var d = derivar(codigo);
        return {
            codigo: d.codigo,
            nome: d.rotulo,
            grupo: d.grupo,
            classe: d.classe,
            cff: !!d.cff,
            cargo: d.cargo || '',
            obs: ''
        };
    }

    /* O que o formulario precisa ter para a patente ser cadastrada. */
    function catalogoValidar(dados) {
        var erros = [];
        var codigo = String((dados && dados.codigo) || '').trim().toUpperCase();
        if (!codigo) erros.push('Informe o codigo da patente.');
        else if (!/^[A-Z]{2,4}(?:-C\d{2})?(?:-[A-Z]{1,6})*$/.test(codigo)) {
            erros.push('Codigo invalido. Use letras maiusculas e o formato FOR-C03-ACI.');
        }
        if (!String((dados && dados.nome) || '').trim()) erros.push('Informe o nome da patente.');
        if (!(dados && dados.grupo)) erros.push('Escolha o grupo da patente.');
        else if (!grupoDe(dados.grupo)) erros.push('Grupo desconhecido: ' + dados.grupo);
        var url = insigniaNormalizar(dados && dados.insigniaUrl);
        if (String((dados && dados.insigniaUrl) || '').trim() && !url) {
            erros.push('A insignia tem que ser um link http, https ou uma imagem.');
        }
        if (dados && dados.grupo === 'OUT' && !String(dados.obs || '').trim()) {
            erros.push('Descreva a patente no campo de observacao.');
        }
        return { ok: !erros.length, erros: erros };
    }

    global.PATENTES = {
        GRUPOS: GRUPOS,
        SECOES: SECOES,
        grupoDe: grupoDe,
        rotuloDe: rotuloDe,
        derivar: derivar,
        normalizarClasses: normalizarClasses,
        montarOpcoes: montarOpcoes,
        popular: popular,
        badge: badge,
        sugerir: sugerir,
        classeDaTurma: classeDaTurma,
        aplicar: aplicar,
        /* catalogo */
        ordemDeGrupo: ordemDeGrupo,
        insigniaNormalizar: insigniaNormalizar,
        catalogoNormalizar: catalogoNormalizar,
        catalogoMontar: catalogoMontar,
        catalogoEfetivo: catalogoEfetivo,
        catalogoAchado: catalogoAchado,
        opcoesDoCatalogo: opcoesDoCatalogo,
        insigniaDe: insigniaDe,
        catalogoSugerirCampos: catalogoSugerirCampos,
        catalogoValidar: catalogoValidar,
        esc: esc
    };
})(typeof window !== 'undefined' ? window : this);
