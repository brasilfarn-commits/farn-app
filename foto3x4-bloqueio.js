/* ==========================================================================
   BLOQUEIO DE ANEXO/MUDANCA DA FOTO 3x4 (ADMINISTRADOR x PORTAL DO ALUNO)
   --------------------------------------------------------------------------
   O administrador, na secao "Foto 3x4", escolhe projeto + turma e alterna o
   bloqueio com o botao "Bloquear Anexo". O bloqueio vale SOMENTE para aquela
   turma (BA-ALPHA, BA-BETA...). O portal do aluno le a flag da turma dele e
   desabilita o envio ou a troca da foto na Carteira (e demais lugares).

   Estado guardado em: configuracoes/foto3x4
     { turmas: { 'BA-ALPHA': true, 'BA-BETA': false },
       atualizadoEm: '...', atualizadoPor: '...' }

   Sem o documento, sem a turma marcada ou se a leitura falhar nada e
   bloqueado: uma falha de rede nao pode travar o aluno nem o administrador.
   O administrador continua livre para reenviar a foto para os aparelhos.

   O Firestore deste projeto e lido/escrito direto do navegador, entao o
   bloqueio e de interface: ele impede o aluno de anexar/trocar a foto pelo
   portal, mas nao impede escrita direta na base.
   ========================================================================== */
var Foto3x4Bloqueio = (function () {
    var COLEC = 'configuracoes';
    var DOC = 'foto3x4';
    var cacheTurmas = null;      // mapa { turma: true/false }
    var promessa = null;
    var TTL = 30000;             // o mapa serve por 30s; cada acao do aluno rele
    var ultimaLeitura = 0;

    function db() {
        if (typeof dbFirestore !== 'undefined' && dbFirestore) return dbFirestore;
        if (typeof db !== 'undefined' && db) return db;
        return null;
    }

    function normalizarTurma(t) {
        return String(t == null ? '' : t).trim();
    }

    function mapaDoc(dados) {
        var m = {};
        var bruto = dados && dados.turmas;
        if (bruto && typeof bruto === 'object') {
            Object.keys(bruto).forEach(function (k) {
                var nome = normalizarTurma(k);
                if (nome) m[nome] = bruto[k] === true;
            });
        }
        return m;
    }

    /* Le o mapa de turmas bloqueadas. Devolve Promise<mapa>. */
    function lerMapa(forcar) {
        var agora = Date.now();
        if (!forcar && cacheTurmas && (agora - ultimaLeitura) < TTL) {
            return Promise.resolve(cacheTurmas);
        }
        if (promessa && !forcar) return promessa;
        var d = db();
        if (!d) return Promise.resolve({});
        promessa = d.collection(COLEC).doc(DOC).get()
            .then(function (doc) {
                cacheTurmas = doc.exists ? mapaDoc(doc.data() || {}) : {};
                ultimaLeitura = Date.now();
                promessa = null;
                return cacheTurmas;
            })
            .catch(function (e) {
                console.error('Erro ao ler o bloqueio da foto 3x4:', e);
                promessa = null;
                /* Mantem o ultimo mapa conhecido; sem leitura nao bloqueia. */
                return cacheTurmas || {};
            });
        return promessa;
    }

    /* Bloqueio de uma turma. Devolve Promise<boolean>. */
    function ler(turma, forcar) {
        var nome = normalizarTurma(turma);
        if (!nome) return Promise.resolve(false);
        return lerMapa(forcar).then(function (mapa) {
            return mapa[nome] === true;
        });
    }

    /* Liga/desliga o bloqueio de uma turma. Devolve Promise<boolean>. */
    function gravar(turma, bloqueado) {
        var d = db();
        var nome = normalizarTurma(turma);
        if (!d) return Promise.reject(new Error('Firestore indisponivel'));
        if (!nome) return Promise.reject(new Error('Turma nao informada'));
        var patch = {};
        patch['turmas.' + nome] = !!bloqueado;
        patch.atualizadoEm = new Date().toISOString();
        patch.atualizadoPor = 'Administrador';
        return d.collection(COLEC).doc(DOC).set(patch, { merge: true }).then(function () {
            cacheTurmas = cacheTurmas || {};
            cacheTurmas[nome] = !!bloqueado;
            ultimaLeitura = Date.now();
            return !!bloqueado;
        });
    }

    /* Estado em cache da turma (null = ainda nao lido). */
    function estado(turma) {
        if (!cacheTurmas) return null;
        return cacheTurmas[normalizarTurma(turma)] === true;
    }

    /* Copia do mapa de turmas bloqueadas (para diagnostico/administracao). */
    function mapa() {
        var saida = {};
        Object.keys(cacheTurmas || {}).forEach(function (k) {
            if (cacheTurmas[k] === true) saida[k] = true;
        });
        return saida;
    }

    /* Aplica o estado na interface do portal do aluno: esconde os botoes de
       anexo/camera e mostra o aviso de bloqueio. */
    function aplicarPortal(bloqueado) {
        var botoes = document.getElementById('pf-foto3x4-botoes');
        var aviso = document.getElementById('pf-foto3x4-bloqueio');
        if (botoes) botoes.style.display = bloqueado ? 'none' : '';
        if (aviso) aviso.style.display = bloqueado ? 'flex' : 'none';
        var status = document.getElementById('pf-foto3x4-status');
        if (status && bloqueado) {
            status.textContent = 'O envio e a mudanca da foto 3x4 estao bloqueados pela administracao.';
            status.style.color = '#dc2626';
        }
        return bloqueado;
    }

    /* Recarrega o estado da turma e aplica na interface do portal do aluno. */
    function atualizarPortal(turma, forcar) {
        return ler(turma, forcar).then(function (bloqueado) {
            return aplicarPortal(bloqueado);
        });
    }

    return {
        ler: ler,
        gravar: gravar,
        estado: estado,
        mapa: mapa,
        aplicarPortal: aplicarPortal,
        atualizarPortal: atualizarPortal
    };
})();
