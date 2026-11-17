/* FARN API - Cloudflare Worker sobre D1
   Substitui o Firestore com uma API REST simples. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function agora() { return Date.now(); }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB;

    try {
      /* Health check */
      if (path === '/api/ping') return json({ ok: true, agora: agora() });

      /* Lista todos os documentos de uma colecao */
      if (path === '/api/all' && request.method === 'GET') {
        const col = url.searchParams.get('col');
        if (!col) return json({ error: 'col obrigatoria' }, 400);
        const r = await db.prepare('SELECT id, data FROM docs WHERE col = ?').bind(col).all();
        return json({ docs: (r.results || []).map(x => ({ id: x.id, data: JSON.parse(x.data) })) });
      }

      /* Mudancas desde um timestamp (para onSnapshot via polling) */
      if (path === '/api/changes' && request.method === 'GET') {
        const since = Number(url.searchParams.get('since') || 0);
        const r = await db.prepare('SELECT col, id, data, updated_at FROM docs WHERE updated_at > ? ORDER BY updated_at ASC LIMIT 2000').bind(since).all();
        const docs = (r.results || []).map(x => ({
          col: x.col, id: x.id, data: JSON.parse(x.data), updated_at: x.updated_at
        }));
        const ultimo = docs.length ? docs[docs.length - 1].updated_at : since;
        return json({ docs, since: ultimo });
      }

      /* Grava (upsert) um documento */
      if (path === '/api/set' && request.method === 'POST') {
        const b = await request.json();
        if (!b.col || !b.id || !b.data) return json({ error: 'col, id e data obrigatorios' }, 400);
        let data = b.data;
        if (b.merge) {
          const atual = await db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?').bind(b.col, String(b.id)).first();
          const anterior = atual ? JSON.parse(atual.data) : {};
          data = { ...anterior, ...data };
          for (const k of Object.keys(data)) if (data[k] && data[k].__farnDelete) delete data[k];
        }
        const t = agora();
        await db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
          .bind(b.col, String(b.id), JSON.stringify(data), t).run();
        return json({ ok: true, updated_at: t });
      }

      /* Exclui um documento */
      if (path === '/api/delete' && request.method === 'POST') {
        const b = await request.json();
        if (!b.col || !b.id) return json({ error: 'col e id obrigatorios' }, 400);
        await db.prepare('DELETE FROM docs WHERE col = ? AND id = ?').bind(b.col, String(b.id)).run();
        return json({ ok: true });
      }

      /* Lote atomico de operacoes */
      if (path === '/api/batch' && request.method === 'POST') {
        const b = await request.json();
        const ops = b.ops || [];
        const stmts = [];
        for (const op of ops) {
          if (op.type === 'delete') {
            stmts.push(db.prepare('DELETE FROM docs WHERE col = ? AND id = ?').bind(op.col, String(op.id)));
          } else {
            let data = op.data || {};
            if (op.merge) {
              const atual = await db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?').bind(op.col, String(op.id)).first();
              data = { ...(atual ? JSON.parse(atual.data) : {}), ...data };
              for (const k of Object.keys(data)) if (data[k] && data[k].__farnDelete) delete data[k];
            }
            stmts.push(db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
              .bind(op.col, String(op.id), JSON.stringify(data), agora()));
          }
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true, ops: stmts.length });
      }

      /* Importacao em massa (usada na migracao do Firestore) */
      if (path === '/api/import' && request.method === 'POST') {
        const b = await request.json();
        const docs = b.docs || [];
        const stmts = [];
        for (const d of docs) {
          stmts.push(db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
            .bind(d.col, String(d.id), JSON.stringify(d.data || {}), agora()));
          if (stmts.length >= 500) { await db.batch(stmts); stmts.length = 0; }
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true, importados: docs.length });
      }

      return json({ error: 'Rota nao encontrada', path }, 404);
    } catch (e) {
      return json({ error: e && e.message ? e.message : String(e) }, 500);
    }
  }
};
