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

    /* Devolve o Firestore somente se ele estiver realmente utilizavel. O
       firebase-firestore-compat carrega de forma assincrona: dbFirestore pode
       existir e ainda nao ter os metodos. Sem essa checagem a leitura estoura
       dentro do modulo e derruba a verificacao do bloqueio na pagina. */
    function db() {
        var d = (typeof dbFirestore !== 'undefined' && dbFirestore) ? dbFirestore
              : ((typeof db !== 'undefined' && db) ? db : null);
        if (!d) return null;
        if (typeof d.collection !== 'function') return null;
        try {
            if (!d.collection(COLEC) || typeof d.collection(COLEC).doc !== 'function') return null;
        } catch (e) { return null; }
        return d;
    }

    /* Sentinela de exclusao do Firestore, quando disponivel. */
    function campoApagar() {
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore
                && firebase.firestore.FieldValue && firebase.firestore.FieldValue.delete) {
                return firebase.firestore.FieldValue.delete();
            }
        } catch (e) {}
        return null;
    }

    /* Nome de turma comparavel: sem espacos nas pontas e sem diferenciar
       maiuscula/minuscula (BA-ALPHA = ba-alpha). */
    function normalizarTurma(t) {
        return String(t == null ? '' : t).trim().toUpperCase();
    }

    /* Le o documento em QUALQUER um dos formatos ja usados na base:
       1) mapa aninhado:  { turmas: { 'BA-ALPHA': true } }
       2) campo com ponto literal (o que o SDK compat grava quando se passa
          'turmas.BA-ALPHA' como chave): { 'turmas.BA-ALPHA': true }
       3) formato antigo global: { bloqueado: true }
       Assim o portal entende o bloqueio mesmo de um documento gravado pela
       versao anterior do botao. */
    function mapaDoc(dados) {
        var m = {};
        if (!dados) return m;
        /* O mapa aninhado (formato novo) tem prioridade: o campo literal e
           apenas sobra de versao antiga do botao. */
        var bruto = dados.turmas;
        if (bruto && typeof bruto === 'object') {
            Object.keys(bruto).forEach(function (k) {
                var nome = normalizarTurma(k);
                if (nome) m[nome] = bruto[k] === true;
            });
        }
        /* Campo literal 'turmas.<TURMA>' (ponto faz parte do nome). So vale
           quando o mapa aninhado nao tem aquela turma. */
        Object.keys(dados).forEach(function (k) {
            var casa = /^turmas\.(.+)$/.exec(k);
            if (!casa) return;
            var nome = normalizarTurma(casa[1]);
            if (nome && !Object.prototype.hasOwnProperty.call(m, nome)) m[nome] = dados[k] === true;
        });
        /* Formato antigo (versao global): ainda e respeitado para nao deixar
           nenhuma turma bloqueada fora do ar. */
        if (dados.bloqueado === true && !m['__global__']) m['__global__'] = true;
        return m;
    }

    /* Le o mapa de turmas bloqueadas. Devolve Promise<mapa>. Nunca estoura de
       forma sincrona: qualquer falha vira Promise resolvida com o ultimo mapa
       conhecido (sem leitura nao bloqueia ninguem). */
    function lerMapa(forcar) {
        var agora = Date.now();
        if (!forcar && cacheTurmas && (agora - ultimaLeitura) < TTL) {
            return Promise.resolve(cacheTurmas);
        }
        if (promessa && !forcar) return promessa;
        var d = db();
        if (!d) return Promise.resolve(cacheTurmas || {});
        try {
            promessa = d.collection(COLEC).doc(DOC).get()
                .then(function (doc) {
                    cacheTurmas = (doc && doc.exists) ? mapaDoc(doc.data() || {}) : {};
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
        } catch (e) {
            console.error('Erro ao ler o bloqueio da foto 3x4:', e);
            promessa = null;
            return Promise.resolve(cacheTurmas || {});
        }
        return promessa;
    }
    /* Bloqueio de uma turma. Devolve Promise<boolean>. */
    function ler(turma, forcar) {
        var nome = normalizarTurma(turma);
        if (!nome) return Promise.resolve(false);
        return lerMapa(forcar).then(function (mapa) {
            return mapa[nome] === true || mapa['__global__'] === true;
        });
    }

    /* Liga/desliga o bloqueio de uma turma. Devolve Promise<boolean>.
       Grava o mapa 'turmas' inteiro (aninhado) com merge, para o portal ler
       dados.turmas[<TURMA>]. Preserva as demais turmas: le o documento atual,
       atualiza somente a turma pedida e remove o campo de ponto literal que
       versoes antigas possam ter deixado. */
    function gravar(turma, bloqueado) {
        var d = db();
        var nome = normalizarTurma(turma);
        if (!d) return Promise.reject(new Error('Firestore indisponivel'));
        if (!nome) return Promise.reject(new Error('Turma nao informada'));
        var ref = d.collection(COLEC).doc(DOC);
        var lerAtual = (typeof ref.get === 'function')
            ? ref.get().then(function (doc) { return (doc && doc.exists) ? (doc.data() || {}) : {}; })
                  .catch(function () { return {}; })
            : Promise.resolve({});
        return lerAtual.then(function (dados) {
            var mapaTurmas = {};
            var bruto = dados && dados.turmas;
            if (bruto && typeof bruto === 'object') {
                Object.keys(bruto).forEach(function (k) { mapaTurmas[k] = bruto[k] === true; });
            }
            /* Traz tambem o que estiver em campos de ponto literal, mas o mapa
               aninhado manda (mesma regra da leitura). */
            Object.keys(dados || {}).forEach(function (k) {
                var casa = /^turmas\.(.+)$/.exec(k);
                if (casa && !Object.prototype.hasOwnProperty.call(mapaTurmas, casa[1])) {
                    mapaTurmas[casa[1]] = dados[k] === true;
                }
            });
            mapaTurmas[nome] = !!bloqueado;
            var patch = {
                turmas: mapaTurmas,
                atualizadoEm: new Date().toISOString(),
                atualizadoPor: 'Administrador'
            };
            return ref.set(patch, { merge: true }).then(function () {
                /* Remove os campos de ponto literal deixados pela versao antiga
                   (eles sobrescreviam o mapa e travavam o desbloqueio). */
                var literais = Object.keys(dados || {}).filter(function (k) {
                    return /^turmas\./.test(k);
                });
                if (!literais.length) return null;
                var del = {};
                var apagar = campoApagar();
                literais.forEach(function (k) {
                    /* Se nao houver como apagar, marca false (equivalente
                       funcional: a leitura prioriza o mapa aninhado). */
                    del[k] = apagar || false;
                });
                return (typeof ref.update === 'function'
                    ? ref.update(del)
                    : ref.set(del, { merge: true })
                ).catch(function (e) {
                    console.error('Nao foi possivel limpar o formato antigo do bloqueio:', e);
                });
            });
        }).then(function () {
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
