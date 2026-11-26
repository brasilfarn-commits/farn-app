/* =====================================================================
   FARN - ACESSO DO FORMADO
   ---------------------------------------------------------------------
   Regra unica usada pelo index (login) e pelo portal-formado:

   so entra como FORMADO quem esta como individuo no Cadastro de Cursos
   de um curso marcado como CONCLUIDO, com a turma tambem CONCLUIDA e
   com a situacao de formado gravada no cadastro (tipoPessoa F, status
   Formado, situacaoCurso Formado ou formadoEm).

   Quem tem curso/turma EM ANDAMENTO continua entrando normalmente como
   ALUNO; este arquivo nao altera aluno-acesso.js nem o Portal do Aluno.
   ===================================================================== */
(function (global) {
    'use strict';

    function normalizar(txt) {
        return String(txt == null ? '' : txt)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim();
    }

    function chaveTurma(txt) {
        return normalizar(txt).replace(/[^a-z0-9]/g, '');
    }

    /* "Concluido", "Concluído" e ate "Formado" sao aceitos. Documentos
       antigos sem status de curso nao valem como formado: a regra pede
       explicitamente o curso concluido. */
    function concluido(txt) {
        var s = normalizar(txt);
        return s.indexOf('concluid') >= 0 || s.indexOf('formado') >= 0
            || s.indexOf('finalizad') >= 0;
    }

    function ehFormado(dados) {
        if (!dados) return false;
        if (String(dados.tipoPessoa || '').toUpperCase() === 'F') return true;
        if (concluido(dados.status) || concluido(dados.situacaoCurso)) return true;
        return !!dados.formadoEm;
    }

    /* Turma concluida: status gravado na guia Projetos e Turmas. Quando
       nao ha documento de turma (cadastro antigo), o formadoEm do
       individuo e o curso concluido bastam. */
    function turmaConcluida(status) {
        var s = normalizar(status);
        if (!s) return false;
        return concluido(s);
    }

    /* Preenche os vazios de A com os valores de B. Usado para juntar a turma
       do Cadastro de Curso com a turma do formulario geral de Turmas, onde
       ficam os campos inicio e previsao lidos pelo certificado. */
    function mesclarTurma(a, b) {
        var out = Object.assign({}, a || {});
        Object.keys(b || {}).forEach(function (k) {
            var v = b[k];
            if (v !== '' && v !== null && v !== undefined) out[k] = v;
        });
        return out;
    }

    /* Turma do formulario (colecao turmas): e onde o administrador grava
       inicio e previsao usados na declaracao do certificado. */
    async function turmaDoFormulario(db, nomeTurma) {
        var chave = chaveTurma(nomeTurma);
        if (!db || !chave) return null;
        try {
            var snap = await db.collection('turmas').get();
            var achada = null;
            snap.forEach(function (d) {
                var t = d.data() || {};
                if (chaveTurma(t.nome) !== chave) return;
                /* Prefere o registro que realmente tem as datas preenchidas. */
                if (!achada || ((t.inicio || '') + (t.previsao || '')).length
                    > ((achada.inicio || '') + (achada.previsao || '')).length) {
                    achada = Object.assign({ _id: d.id }, t);
                }
            });
            return achada;
        } catch (e) {
            console.warn('Formado: nao foi possivel ler a turma do formulario.', e);
            return null;
        }
    }

    function montarVinculo(cursoDoc, dados, indivId, turmaValida, projetoValido, turmaForm, turmaCert) {
        var curso = cursoDoc.data() || {};
        var turma = turmaValida || {};
        var detalhe = mesclarTurma(turmaForm, turmaValida);
        return Object.assign({}, dados, {
            _origem: 'cursosCadastro',
            _tipo: 'formado',
            _rotulo: 'Formado — ' + String(curso.nome || ''),
            _docId: indivId,
            cursoId: cursoDoc.id,
            _cursoId: cursoDoc.id,
            _cursoNome: String(curso.nome || ''),
            _cursoStatus: curso.status || 'Concluido',
            _cursoPrevisao: String(curso.previsao || curso.previsaoFinal || '').trim(),
            _turma: String(dados.formadoTurma || dados.turma || '').trim(),
            _turmaStatus: turmaValida ? (turma.status || turma.situacao || 'Concluido') : 'Concluido',
            _turmaDados: Object.keys(detalhe).length ? detalhe : null,
            /* Turma do proprio curso, usada para inicio/previsao do certificado
               mesmo quando o cadastro antigo do individuo traz outra turma. */
            _certTurmaDados: turmaCert ? Object.assign({}, turmaCert) : null,
            _projeto: String(detalhe.projeto || turma.projeto || dados.projeto || '').trim(),
            _projetoDados: projetoValido ? Object.assign({}, projetoValido) : null,
            formadoEm: dados.formadoEm || null
        });
    }

    /* Varre os cursos do Cadastro de Cursos e devolve um vinculo por curso
       concluido onde o CPF consta como formado.
       opcoes.apenasPrimeiro encerra no primeiro vinculo (login). */
    async function farnFormadoListarCursos(db, cpf, senha, opcoes) {
        cpf = String(cpf || '').replace(/\D/g, '');
        if (!db || !cpf) return [];
        opcoes = opcoes || {};
        var apenasPrimeiro = !!opcoes.apenasPrimeiro;

        var snapshot = await db.collection('cursosCadastro').get();
        var lista = [];
        for (var i = 0; i < snapshot.docs.length; i++) {
            var cursoDoc = snapshot.docs[i];
            var curso = cursoDoc.data() || {};
            if (!concluido(curso.status)) continue;

            var indiv = await db.collection('cursosCadastro').doc(cursoDoc.id)
                .collection('individuos').where('cpf', '==', cpf).limit(1).get();
            if (indiv.empty) continue;
            var dados = indiv.docs[0].data() || {};
            if (senha != null && String(dados.senha || '') !== String(senha)) continue;
            if (dados.pediuBaixa === true || normalizar(dados.situacaoCurso) === 'pediu baixa') continue;
            if (!ehFormado(dados)) continue;

            var nomeTurma = String(dados.formadoTurma || dados.turma || '').trim();
            var chaveIndividuo = chaveTurma(nomeTurma);
            var turmaValida = null;
            var turmaCert = null;
            var turmaConcluidaAchada = false;
            var turmaEmAndamento = false;
            var turmas = await db.collection('cursosCadastro').doc(cursoDoc.id).collection('turmas').get();
            for (var t = 0; t < turmas.docs.length; t++) {
                var turma = turmas.docs[t].data() || {};
                /* Guarda a turma do curso com as datas preenchidas para a
                   declaracao, independente do nome antigo do individuo. */
                if (!turmaCert || ((turma.inicio || '') + (turma.previsao || '')).length
                    > ((turmaCert.inicio || '') + (turmaCert.previsao || '')).length) {
                    turmaCert = turma;
                }
                var chaveDoc = chaveTurma(turma.nome);
                if (chaveIndividuo && chaveDoc !== chaveIndividuo) continue;
                if (turmaConcluida(turma.status || turma.situacao)) {
                    turmaValida = turma;
                    turmaConcluidaAchada = true;
                    break;
                }
                /* Existe turma com o mesmo nome, mas ela ainda nao foi
                   concluida: ainda e aluno em andamento, nao formado. */
                if (chaveIndividuo && chaveDoc === chaveIndividuo) {
                    turmaEmAndamento = true;
                    break;
                }
            }
            if (turmaEmAndamento) continue;
            /* Mesmo sem documento de turma, quem tem formadoEm e o curso
               concluido e considerado formado (dados migrados do antigo). */
            if (!turmaConcluidaAchada && !dados.formadoEm) continue;

            var projetoValido = null;
            var chaveProjeto = chaveTurma((turmaValida || {}).projeto || dados.projeto || '');
            try {
                var projetos = await db.collection('cursosCadastro').doc(cursoDoc.id).collection('projetos').get();
                for (var pr = 0; pr < projetos.docs.length; pr++) {
                    var proj = projetos.docs[pr].data() || {};
                    if (!chaveProjeto || chaveTurma(proj.nome) === chaveProjeto) {
                        projetoValido = proj;
                        break;
                    }
                }
            } catch (e) {}

            var turmaForm = await turmaDoFormulario(db, nomeTurma);
            lista.push(montarVinculo(cursoDoc, dados, indiv.docs[0].id, turmaValida, projetoValido, turmaForm, turmaCert));
            if (apenasPrimeiro) return lista;
        }
        return lista;
    }

    async function farnFormadoLocalizar(db, cpf, senha) {
        var lista = await farnFormadoListarCursos(db, cpf, senha, { apenasPrimeiro: true });
        return lista.length ? lista[0] : null;
    }

    /* ---------- declaracao do certificado (usada no portal e no admin) ---------- */
    function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
    function fmtCpf(v) {
        var s = soDigitos(v);
        return s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : s;
    }
    function dataBr(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
        if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
        var d = new Date(s);
        if (isNaN(d.getTime())) return s.slice(0, 10);
        return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    }

    /* Substitui os marcadores da declaracao gravada na guia Certificado.
       Executa no navegador do formado e tambem na pre-via do administrador. */
    function declaracaoPersonalizar(txt, individuo, opcoes) {
        var u = individuo || {};
        var o = opcoes || {};
        var curso = o.curso || {};
        var turma = o.turma || {};
        var turmaCert = o.turmaCert || {};
        var matricula = String(u.matricula || u.credencial || '').trim();
        var mapa = {
            '[CRED]': matricula,
            '[MATRICULA]': matricula,
            '[NOME]': String(u.nome || u.nomeCompleto || '').trim(),
            '[CPF]': fmtCpf(u.cpf),
            '[000.000.000-00]': fmtCpf(u.cpf),
            '[0000000000000]': soDigitos(u.cpf),
            '[CURSO]': String(curso._cursoNome || curso.nome || u.cursoNome || '').trim(),
            '[TURMA]': String(curso._turma || u.formadoTurma || u.turma || turma.nome || '').trim(),
            '[PROJETO]': String(curso._projeto || turma.projeto || u.formadoProjeto || u.projeto || '').trim(),
            /* Inicio e Fim vem do formulario da turma do curso. Primeiro a
               turma do proprio curso (turmaCert), depois a turma antiga do
               individuo e, so em ultimo caso, as datas do cadastro dele. */
            '[INICIO]': dataBr(turmaCert.inicio) || dataBr(turma.inicio)
                || dataBr(u.dataInscricao || u.dataCadastro),
            '[FIM]': dataBr(turmaCert.previsao) || dataBr(turma.previsao)
                || dataBr(curso._cursoPrevisao || curso.previsao)
                || dataBr(u.dataFinal || u.formadoEm),
            '[DATA]': dataBr(u.formadoEm) || new Date().toLocaleDateString('pt-BR')
        };
        var out = String(txt == null ? '' : txt);
        Object.keys(mapa).forEach(function (k) { out = out.split(k).join(mapa[k]); });
        return out;
    }

    global.farnFormadoLocalizar = farnFormadoLocalizar;
    global.farnFormadoListarCursos = farnFormadoListarCursos;
    global.farnFormadoConcluido = concluido;
    global.farnFormadoNormalizar = normalizar;
    global.farnFormadoChaveTurma = chaveTurma;
    global.farnDeclaracaoPersonalizar = declaracaoPersonalizar;
})(window);
