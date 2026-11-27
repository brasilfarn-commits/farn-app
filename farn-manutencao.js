/* =====================================================================
   FARN - CONTROLE DE MANUTENCAO POR PORTAL
   ---------------------------------------------------------------------
   Estado gravado em config/portais:
     manutencaoPortais: { aluno, formado, coordenacao, docente, curso }
   O campo antigo "manutencao" (global) continua sendo respeitado para nao
   deixar nenhum portal ligado sem querer apos a migracao.
   ===================================================================== */
(function (global) {
    'use strict';

    var PORTAL_NOMES = {
        aluno: 'ALUNO',
        formado: 'FORMADO',
        coordenacao: 'COORDENAÇÃO',
        docente: 'DOCENTE'
    };
    var SESSOES = {
        aluno: ['aluno_sessao'],
        formado: ['formado_sessao'],
        coordenacao: ['coordenacao_sessao'],
        docente: ['docente_sessao']
    };
    var cache = null;

    function resolverDb(db) {
        if (db) return db;
        if (global.dbFirestore) return global.dbFirestore;
        if (typeof FarnDB === 'function') return new FarnDB();
        return null;
    }

    async function carregar(db) {
        if (cache) return cache;
        var estado = {};
        Object.keys(PORTAL_NOMES).forEach(function (id) { estado[id] = false; });
        var fonte = resolverDb(db);
        try {
            if (!fonte) throw new Error('Banco indisponível');
            var snap = await fonte.collection('config').doc('portais').get();
            var dados = snap.exists ? (snap.data() || {}) : {};
            var porPortal = dados.manutencaoPortais || dados.portais || {};
            var globalDesligado = dados.manutencao === true;
            Object.keys(PORTAL_NOMES).forEach(function (id) {
                estado[id] = globalDesligado || porPortal[id] === true;
            });
        } catch (e) {
            /* Sem banco, nao bloqueia o acesso: falha de rede nao pode
               transformar manutencao em indisponibilidade acidental. */
        }
        cache = estado;
        return estado;
    }

    async function ativo(db, id) {
        var estado = await carregar(db);
        return !!estado[id];
    }

    function mostrar(id) {
        var nome = PORTAL_NOMES[id] || String(id || '').toUpperCase();
        var antigo = document.getElementById('farn-manutencao-overlay');
        if (antigo && antigo.parentNode) antigo.parentNode.removeChild(antigo);
        var overlay = document.createElement('div');
        overlay.id = 'farn-manutencao-overlay';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-label', 'Portal em manutenção');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#080a0c;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Rajdhani,Inter,sans-serif;color:#f4f7fa';
        overlay.innerHTML = '<div style="max-width:420px;width:100%;text-align:center;background:#12161a;border:2px solid #d92d20;border-radius:3px;padding:30px 24px;box-shadow:0 5px 0 #000,0 24px 50px rgba(0,0,0,.6)">'
            + '<div style="width:74px;height:74px;margin:0 auto 18px;border-radius:2px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7f1d1d,#d92d20,#f97316,#facc15);border:3px solid #000;box-shadow:0 5px 0 #000;color:#fff;font-size:30px"><i class="fa-solid fa-screwdriver-wrench"></i></div>'
            + '<div style="font-size:10px;font-weight:700;letter-spacing:.16em;color:#facc15;margin-bottom:8px">FARN • SOCORRO</div>'
            + '<h1 style="font-family:Rajdhani,Inter,sans-serif;font-size:21px;line-height:1.25;margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em;color:#f4f7fa">PORTAL ' + nome + ' EM MANUTENÇÃO</h1>'
            + '<p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0 0 18px">Este portal está temporariamente desligado pela administração. Volte em instantes.</p>'
            + '<button type="button" onclick="location.reload()" style="border:2px solid #000;border-radius:2px;background:linear-gradient(90deg,#d92d20,#f97316);color:#fff;font-weight:700;text-transform:uppercase;padding:11px 22px;box-shadow:0 4px 0 #000;cursor:pointer"><i class="fa-solid fa-rotate-right" style="margin-right:7px"></i> Tentar novamente</button>'
            + '</div>';
        (document.body || document.documentElement).appendChild(overlay);
    }

    async function proteger(db, id, chavesSessao) {
        try {
            if (!(await ativo(db, id))) return false;
            (chavesSessao || SESSOES[id] || []).forEach(function (chave) {
                try { localStorage.removeItem(chave); } catch (e) {}
            });
            mostrar(id);
            return true;
        } catch (e) {
            return false;
        }
    }

    function invalidar() { cache = null; }

    global.farnManutencao = {
        ids: Object.keys(PORTAL_NOMES),
        nomes: PORTAL_NOMES,
        carregar: carregar,
        ativo: ativo,
        mostrar: mostrar,
        proteger: proteger,
        invalidar: invalidar
    };
})(window);
