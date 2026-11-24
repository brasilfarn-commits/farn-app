/* =====================================================================
   FARN - ACESSO DO ALUNO
   ---------------------------------------------------------------------
   Regra unica de liberacao usada pelo index (login) e pelo portal-aluno:
   so entra quem esta como individuo em algum curso do Cadastro de Cursos
   cuja turma da guia "Projetos e Turmas" esteja EM ANDAMENTO.
   Nao mexe nas permissoes do Portal do Usuario nem do Portal do Curso.
   ===================================================================== */
(function (global) {
    'use strict';

    function normalizar(txt) {
        return String(txt == null ? '' : txt)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim();
    }

    /* Status gravado no cadastro e "Em Andamento". Documentos antigos sem
       status sao tratados como andamento, mesmo criterio usado no app. */
    function turmaEmAndamento(status) {
        var s = normalizar(status);
        if (!s) return true;
        return s.indexOf('em andamento') >= 0 || s === 'andamento' || s === 'ativo';
    }

    /* Procura o CPF+sENHA nos individuos dos cursos e confirma a turma
       pelo nome gravado no individuo (campo "turma"). */
    async function farnAlunoLocalizar(db, cpf, senha) {
        cpf = String(cpf || '').replace(/\D/g, '');
        if (!db || !cpf) return null;
        var snapshot = await db.collection('cursosCadastro').get();
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
            if (!nomeTurma) continue;
            var turmas = await db.collection('cursosCadastro').doc(cursoDoc.id)
                .collection('turmas').get();
            var turmaValida = null;
            for (var t = 0; t < turmas.docs.length; t++) {
                var turma = turmas.docs[t].data() || {};
                if (normalizar(turma.nome) !== normalizar(nomeTurma)) continue;
                if (!turmaEmAndamento(turma.status || turma.situacao)) continue;
                turmaValida = turma;
                break;
            }
            if (!turmaValida) continue;

            return Object.assign({}, dados, {
                _origem: 'cursosCadastro',
                _tipo: 'aluno',
                _rotulo: 'Aluno — ' + String(curso.nome || ''),
                _docId: indiv.docs[0].id,
                _cursoId: cursoDoc.id,
                _cursoIds: [cursoDoc.id],
                _cursoNome: String(curso.nome || ''),
                _turma: nomeTurma,
                _projeto: String(dados.projeto || ''),
                _turmaStatus: turmaValida.status || 'Em Andamento'
            });
        }
        return null;
    }

    global.farnAlunoLocalizar = farnAlunoLocalizar;
    global.farnAlunoNormalizar = normalizar;
    global.farnAlunoTurmaEmAndamento = turmaEmAndamento;
})(window);
