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
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Poppins,Inter,sans-serif;color:#111827';
        overlay.innerHTML = '<div style="max-width:420px;width:100%;text-align:center;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:30px 24px;box-shadow:0 24px 70px rgba(17,24,39,.18)">'
            + '<div style="width:74px;height:74px;margin:0 auto 18px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f59e0b,#fbbf24);box-shadow:0 10px 22px rgba(245,158,11,.28);color:#111827;font-size:30px"><i class="fa-solid fa-screwdriver-wrench"></i></div>'
            + '<div style="font-size:10px;font-weight:600;letter-spacing:.16em;color:#d97706;margin-bottom:8px">FARN • SISTEMA</div>'
            + '<h1 style="font-family:Poppins,Inter,sans-serif;font-size:21px;font-weight:600;line-height:1.25;margin:0 0 10px;color:#111827">PORTAL ' + nome + ' EM MANUTENÇÃO</h1>'
            + '<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 18px">Este portal está temporariamente desligado pela administração. Volte em instantes.</p>'
            + '<button type="button" onclick="location.reload()" style="border:none;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#111827;font-weight:600;padding:11px 22px;box-shadow:0 10px 22px rgba(245,158,11,.28);cursor:pointer"><i class="fa-solid fa-rotate-right" style="margin-right:7px"></i> Tentar novamente</button>'
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
