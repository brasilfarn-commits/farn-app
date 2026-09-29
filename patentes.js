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

    /* O rotulo e sempre derivado do codigo: renomear no futuro nao
       quebra o que ja esta gravado. */
    function rotuloDe(codigo) {
        var c = String(codigo || '').trim().toUpperCase();
        if (!c) return '';
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
    function derivar(codigo) {
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
            rotulo: rotuloDe(c)
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

    /* Preenche um <select> de patente. Se o valor atual nao estiver na
       lista (classe removida, patente antiga), ele e acrescentado no
       fim para o cadastro nao perder a informacao. */
    function popular(el, classes, selecionado) {
        if (!el) return;
        var anterior = (selecionado != null ? selecionado : el.value) || '';
        var opcoes = montarOpcoes(classes);
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
        return { codigo: codigo, rotulo: rotuloDe(codigo), motivo: motivo };
    }

    /* Escreve os campos de patente no objeto que vai para o Firestore.
       Usa string vazia em vez de remover a chave, porque boa parte dos
       formularios grava com `merge: true` e a chave antiga voltaria. */
    function aplicar(dados, codigo, quem, obs) {
        dados = dados || {};
        var anterior = dados.patente || '';
        var d = derivar(codigo);
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
            dados.patenteAnteriorNome = rotuloDe(anterior);
            dados.patenteAlteradoEm = new Date().toISOString();
            dados.patenteAlteradoPor = quem || 'Administrador';
        }
        return dados;
    }

    global.PATENTES = {
        GRUPOS: GRUPOS,
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
        esc: esc
    };
})(typeof window !== 'undefined' ? window : this);
