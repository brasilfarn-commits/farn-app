/* ==========================================================================
   BLOQUEIO DE ANEXO/MUDANCA DA FOTO 3x4 (ADMINISTRADOR x PORTAL DO ALUNO)
   --------------------------------------------------------------------------
   O administrador, na secao "Foto 3x4", alterna o bloqueio com o botao
   "Bloquear Anexo". O portal do aluno le a mesma flag e desabilita o envio
   ou a troca da foto na Carteira (e em qualquer outro ponto do portal).

   Estado guardado em: configuracoes/foto3x4
     { bloqueado: true|false, atualizadoEm: '...', atualizadoPor: '...' }

   Sem o documento (ou se a leitura falhar) nada e bloqueado: uma falha de
   rede nao pode travar o aluno nem o administrador. O administrador continua
   livre para reenviar a foto para o aparelho do aluno.

   O Firestore deste projeto e lido/escrito direto do navegador, entao o
   bloqueio e de interface: ele impede o aluno de anexar/trocar a foto pelo
   portal, mas nao impede escrita direta na base.
   ========================================================================== */
var Foto3x4Bloqueio = (function () {
    var COLEC = 'configuracoes';
    var DOC = 'foto3x4';
    var cache = null;        // null = estado ainda nao lido
    var promessa = null;

    function db() {
        if (typeof dbFirestore !== 'undefined' && dbFirestore) return dbFirestore;
        if (typeof db !== 'undefined' && db) return db;
        return null;
    }

    /* Le o estado atual. Devolve Promise<boolean>. */
    function ler(forcar) {
        var d = db();
        if (!d) return Promise.resolve(false);
        if (cache !== null && !forcar) return Promise.resolve(cache);
        if (promessa && !forcar) return promessa;
        promessa = d.collection(COLEC).doc(DOC).get()
            .then(function (doc) {
                cache = !!(doc.exists && doc.data() && doc.data().bloqueado === true);
                promessa = null;
                return cache;
            })
            .catch(function (e) {
                console.error('Erro ao ler o bloqueio da foto 3x4:', e);
                promessa = null;
                return false;
            });
        return promessa;
    }

    /* Grava o estado e atualiza o cache local. Devolve Promise<boolean>. */
    function gravar(bloqueado) {
        var d = db();
        if (!d) return Promise.reject(new Error('Firestore indisponivel'));
        var dados = {
            bloqueado: !!bloqueado,
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: 'Administrador'
        };
        return d.collection(COLEC).doc(DOC).set(dados, { merge: true }).then(function () {
            cache = !!bloqueado;
            return cache;
        });
    }

    /* Estado em cache (null = ainda nao lido). */
    function estado() { return cache; }

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

    /* Recarrega o estado e aplica na interface do portal do aluno. */
    function atualizarPortal(forcar) {
        return ler(forcar).then(function (bloqueado) {
            return aplicarPortal(bloqueado);
        });
    }

    return {
        ler: ler,
        gravar: gravar,
        estado: estado,
        aplicarPortal: aplicarPortal,
        atualizarPortal: atualizarPortal
    };
})();
