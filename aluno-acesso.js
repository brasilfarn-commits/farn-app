/* =====================================================================
   FARN - ACESSO DO ALUNO
   ---------------------------------------------------------------------
   Regra unica de liberacao usada pelo index (login) e pelo portal-aluno:
   so entra quem esta como individuo em algum curso do Cadastro de Cursos
   cuja turma da guia "Projetos e Turmas" esteja EM ANDAMENTO.
   Nao mexe nas permissoes do Portal do Docente nem do Portal do Curso.

   Alem do login, este arquivo tambem fornece a lista completa de cursos
   do aluno para a secao "Cursos" do portal, sem aplicar filtros de status
   ou permissoes do Cadastro de Cursos.
   ===================================================================== */
(function (global) {
    'use strict';

    function normalizar(txt) {
        return String(txt == null ? '' : txt)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim();
    }

    /* Nomes de turma variam: o individuo grava "ARA - 01" e a guia de
       turmas grava "ARA-01". Compara so letras e numeros. */
    function chaveTurma(txt) {
        return normalizar(txt).replace(/[^a-z0-9]/g, '');
    }

    /* Status gravado no cadastro e "Em Andamento". Documentos antigos sem
       status sao tratados como andamento, mesmo criterio usado no app. */
    function turmaEmAndamento(status) {
        var s = normalizar(status);
        if (!s) return true;
        return s.indexOf('em andamento') >= 0 || s === 'andamento' || s === 'ativo';
    }

    /* Sem filtro de status: a secao Cursos mostra todos os vinculos. */

    /* Le o campo "Cursos em que participa" do cadastro do individuo.
       Aceita IDs, nomes ou objetos { id } (formatos usados no formulario). */
    function participacaoIds(dados) {
        var raw = (dados && (dados.cursosParticipaIds || dados.cursosParticipa)) || [];
        var ids = [];
        function add(v) {
            var s = String(v == null ? '' : v).trim();
            if (s && ids.indexOf(s) < 0) ids.push(s);
        }
        if (Array.isArray(raw)) {
            raw.forEach(function (item) {
                if (item && typeof item === 'object') add(item.id || item._id || item.cursoId);
                else add(item);
            });
        } else if (typeof raw === 'string') {
            raw.split(/[;,]/).forEach(add);
        }
        return ids;
    }

    /* Monta o registro de um vinculo. Nos cursos marcados somente no campo
       de participacao nao ha individuo proprio: nao mostramos turma/projecto
       emprestados do curso de origem. */
    function montarVinculo(cursoDoc, dados, indivId, turmaValida, projetoValido, indireto) {
        var curso = cursoDoc.data() || {};
        var dadosTurma = turmaValida || {};
        return Object.assign({}, dados, {
            _origem: 'cursosCadastro',
            _tipo: 'aluno',
            _rotulo: 'Aluno — ' + String(curso.nome || ''),
            _docId: indivId,
            cursoId: cursoDoc.id,
            cursoNome: String(curso.nome || ''),
            _cursoId: cursoDoc.id,
            _cursoIds: [cursoDoc.id],
            _cursoNome: String(curso.nome || ''),
            _cursoStatus: curso.status || 'Em Andamento',
            _turma: indireto ? '' : String(dados.turma || dados.formadoTurma || '').trim(),
            _projeto: indireto ? '' : String(dados.projeto || ''),
            _turmaStatus: indireto ? '' : (dadosTurma.status || dadosTurma.situacao || ''),
            _turmaDados: turmaValida ? Object.assign({}, turmaValida) : null,
            _projetoDados: projetoValido ? Object.assign({}, projetoValido) : null,
            _participacaoIndireta: !!indireto
        });
    }

    /* Varre todos os cursos e devolve um registro por curso onde o CPF
       consta como individuo. Nenhum status de curso e filtrado: a secao
       Cursos do portal mostra todos os vinculos cadastrados.
       opcoes.exigirTurma = true exige turma em andamento (regra do login).
       opcoes.apenasPrimeiro = true encerra no primeiro vinculo (login).
       opcoes.incluirParticipacao = true inclui tambem os cursos marcados no
       campo "Cursos em que participa" do formulario do individuo. */
    async function farnAlunoListarCursos(db, cpf, senha, opcoes) {
        cpf = String(cpf || '').replace(/\D/g, '');
        if (!db || !cpf) return [];
        opcoes = opcoes || {};
        var exigirTurma = !!opcoes.exigirTurma;
        var apenasPrimeiro = !!opcoes.apenasPrimeiro;
        var incluirParticipacao = !!opcoes.incluirParticipacao;

        var snapshot = await db.collection('cursosCadastro').get();
        var mapaCursos = {};
        snapshot.docs.forEach(function (doc) { mapaCursos[doc.id] = doc; });
        var lista = [];
        var encontrados = [];
        var idsNaLista = {};
        for (var i = 0; i < snapshot.docs.length; i++) {
            var cursoDoc = snapshot.docs[i];
            var curso = cursoDoc.data() || {};

            var indiv = await db.collection('cursosCadastro').doc(cursoDoc.id)
                .collection('individuos').where('cpf', '==', cpf).limit(1).get();
            if (indiv.empty) continue;
            var dados = indiv.docs[0].data() || {};
            if (senha != null && String(dados.senha || '') !== String(senha)) continue;
            if (dados.pediuBaixa === true || normalizar(dados.situacaoCurso) === 'pediu baixa') continue;

            var nomeTurma = String(dados.turma || dados.formadoTurma || '').trim();
            if (exigirTurma && !nomeTurma) continue;
            var turmaValida = null;
            if (nomeTurma) {
                var turmas = await db.collection('cursosCadastro').doc(cursoDoc.id)
                    .collection('turmas').get();
                for (var t = 0; t < turmas.docs.length; t++) {
                    var turma = turmas.docs[t].data() || {};
                    if (chaveTurma(turma.nome) !== chaveTurma(nomeTurma)) continue;
                    if (!turmaEmAndamento(turma.status || turma.situacao)) continue;
                    turmaValida = turma;
                    break;
                }
            }
            /* O login so libera com turma em andamento; a lista de cursos do
               portal nao exige isso, pois o filtro la e o status do curso. */
            if (exigirTurma && !turmaValida) continue;
            var dadosTurma = turmaValida || {};

            /* Le tambem o projeto cadastrado na mesma guia "Projetos e Turmas"
               para o portal do aluno mostrar os dados oficiais da turma. */
            var projetoValido = null;
            try {
                var projetos = await db.collection('cursosCadastro').doc(cursoDoc.id)
                    .collection('projetos').get();
                var chaveProjeto = chaveTurma(dadosTurma.projeto || dados.projeto || '');
                for (var p = 0; p < projetos.docs.length; p++) {
                    var proj = projetos.docs[p].data() || {};
                    if (!chaveProjeto || chaveTurma(proj.nome) === chaveProjeto) {
                        projetoValido = proj;
                        break;
                    }
                }
            } catch (e) {}

            lista.push(montarVinculo(cursoDoc, dados, indiv.docs[0].id, turmaValida, projetoValido, false));
            idsNaLista[cursoDoc.id] = true;
            encontrados.push({ cursoDoc: cursoDoc, dados: dados });
            if (apenasPrimeiro) return lista;
        }

        /* Cursos marcados no campo do formulario que nao tem registro proprio
           de individuo tambem aparecem (sem turma emprestada do origem). */
        if (incluirParticipacao) {
            for (var e = 0; e < encontrados.length; e++) {
                var refs = participacaoIds(encontrados[e].dados);
                for (var r = 0; r < refs.length; r++) {
                    var alvo = mapaCursos[refs[r]];
                    if (!alvo) {
                        for (var k in mapaCursos) {
                            if (String((mapaCursos[k].data() || {}).nome || '') === refs[r]) {
                                alvo = mapaCursos[k];
                                break;
                            }
                        }
                    }
                    if (!alvo || idsNaLista[alvo.id]) continue;
                    idsNaLista[alvo.id] = true;
                    lista.push(montarVinculo(alvo, encontrados[e].dados, '', null, null, true));
                }
            }
        }
        return lista;
    }

    /* Mantem o comportamento do login: primeiro vinculo encontrado com
       turma em andamento, sem filtrar o status do curso. */
    async function farnAlunoLocalizar(db, cpf, senha) {
        var lista = await farnAlunoListarCursos(db, cpf, senha, {
            exigirTurma: true,
            apenasPrimeiro: true
        });
        return lista.length ? lista[0] : null;
    }

    global.farnAlunoLocalizar = farnAlunoLocalizar;
    global.farnAlunoListarCursos = farnAlunoListarCursos;
    global.farnAlunoNormalizar = normalizar;
    global.farnAlunoChaveTurma = chaveTurma;
    global.farnAlunoTurmaEmAndamento = turmaEmAndamento;
})(window);
