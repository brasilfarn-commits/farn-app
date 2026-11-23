/* =====================================================================
   FARN - SERVIDOR PROPRIO (SQLite local)
   Substitui o Cloudflare Worker/D1. Mesma API REST, sem limite de leitura.

   Executar:  node servidor/servidor.js
   Porta:     8787 (configuravel com a variavel PORT)
   Banco:     servidor/dados/farn.db
   ===================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 8787);
const DIR_DADOS = path.join(__dirname, 'dados');
const ARQ_DB = path.join(DIR_DADOS, 'farn.db');
const TOKEN = String(process.env.FARN_TOKEN || '');

if (!fs.existsSync(DIR_DADOS)) fs.mkdirSync(DIR_DADOS, { recursive: true });

const db = new DatabaseSync(ARQ_DB);
db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    col TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (col, id)
  );
  CREATE INDEX IF NOT EXISTS idx_docs_col ON docs(col);
  CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at);
`);

const sqlTudo = db.prepare('SELECT id, data FROM docs WHERE col = ?');
const sqlUm = db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?');
const sqlMudancas = db.prepare('SELECT col, id, data, updated_at FROM docs WHERE updated_at > ? ORDER BY updated_at ASC LIMIT 2000');
const sqlGravar = db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at');
const sqlApagar = db.prepare('DELETE FROM docs WHERE col = ? AND id = ?');
const sqlContar = db.prepare('SELECT COUNT(*) AS n FROM docs');

/* Cache em memoria: leituras repetidas nao tocam nem no SQLite.
   Invalidado a qualquer gravacao. */
const cache = new Map();

function cacheLimpar() { cache.clear(); }
function agora() { return Date.now(); }
function novoId() { return String(Date.now()) + Math.random().toString(36).slice(2); }
function idOuNovo(v) { return (v === undefined || v === null || v === '') ? novoId() : String(v); }

/* Informacoes de capacidade para o painel da pagina de configuracao. */
function espacoDisco() {
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(DIR_DADOS);
      const total = s.blocks * s.bsize;
      const livre = s.bavail * s.bsize;
      return { total, livre, usado: total - livre };
    }
  } catch (e) {}
  try {
    const out = execFileSync('df', ['-kP', DIR_DADOS], { encoding: 'utf8' }).trim().split('\n');
    const p = out[out.length - 1].split(/\s+/);
    const total = Number(p[1]) * 1024;
    const livre = Number(p[3]) * 1024;
    return { total, livre, usado: total - livre };
  } catch (e) { return null; }
}
function tamanhoBanco() {
  const r = db.prepare('SELECT COALESCE(SUM(LENGTH(data)),0) AS bytes, COUNT(*) AS docs, COUNT(DISTINCT col) AS colunas FROM docs').get();
  return {
    bytesDados: Number(r.bytes),
    documentos: Number(r.docs),
    colecoes: Number(r.colunas)
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Farn-Token',
  'Access-Control-Max-Age': '86400'
};

function json(res, body, status = 200) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(JSON.stringify(body));
}
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 60 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function mesclar(col, id, dados, merge) {
  let d = dados || {};
  if (merge) {
    const atual = sqlUm.get(col, String(id));
    let anterior = {};
    if (atual) { try { anterior = JSON.parse(atual.data); } catch (e) {} }
    d = Object.assign({}, anterior, d);
    for (const k of Object.keys(d)) if (d[k] && d[k].__farnDelete) delete d[k];
  }
  /* Reativar um documento excluido: a lapide nunca pode sobreviver a uma
     gravacao nova, senao o registro continuaria invisivel no /api/all. */
  delete d.__farnDelete;
  return d;
}
function lapide(col, id) {
  const t = agora();
  sqlGravar.run(col, String(id), JSON.stringify({ __farnDelete: true, deletadoEm: t }), t);
}

const servidor = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  if (TOKEN && req.headers['x-farn-token'] !== TOKEN) {
    return json(res, { error: 'Token invalido' }, 401);
  }

  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (p === '/api/ping') {
      return json(res, { ok: true, agora: agora(), servidor: 'local', docs: Number(sqlContar.get().n) });
    }

    /* Estatisticas (usadas pela pagina de configuracao) */
    if (p === '/api/stats') {
      const linhas = db.prepare('SELECT col, id, data FROM docs').all();
      const visiveis = linhas.filter(x => {
        try { return !(JSON.parse(x.data) || {}).__farnDelete; } catch (e) { return true; }
      });
      const porCol = {};
      visiveis.forEach(x => { porCol[x.col] = (porCol[x.col] || 0) + 1; });
      const colecoes = Object.keys(porCol).sort().map(col => ({ col, n: porCol[col] }));
      return json(res, { docs: visiveis.length, colecoes });
    }

    /* capacidade do Ubuntu, memoria e tamanho do banco SQLite */
    if (p === '/api/sistema') {
      let bytesArquivo = 0;
      try { bytesArquivo = fs.statSync(ARQ_DB).size; } catch (e) {}
      const banco = tamanhoBanco();
      return json(res, {
        ok: true,
        host: os.hostname(),
        sistema: os.type() + ' ' + os.release(),
        arquitetura: os.arch(),
        node: process.version,
        uptimeSistema: Math.floor(os.uptime()),
        uptimeServidor: Math.floor(process.uptime()),
        cpus: os.cpus().length,
        carga: os.loadavg().map(x => Number(x.toFixed(2))),
        ram: { total: os.totalmem(), livre: os.freemem() },
        processo: { rss: process.memoryUsage().rss },
        disco: espacoDisco(),
        banco: Object.assign({ arquivo: ARQ_DB, bytesArquivo }, banco),
        limites: { leituraBanco: 'ilimitado', observacao: 'O limite pratico e o espaco em disco do Ubuntu' }
      });
    }

    if (p === '/api/all' && req.method === 'GET') {
      const col = url.searchParams.get('col');
      if (!col) return json(res, { error: 'col obrigatoria' }, 400);
      if (cache.has(col)) return json(res, { docs: cache.get(col) });
      const docs = sqlTudo.all(col)
        .map(x => ({ id: x.id, data: JSON.parse(x.data) }))
        .filter(x => !(x.data && x.data.__farnDelete));
      cache.set(col, docs);
      return json(res, { docs });
    }

    if (p === '/api/changes' && req.method === 'GET') {
      const since = Number(url.searchParams.get('since') || 0);
      const docs = sqlMudancas.all(since).map(x => ({
        col: x.col, id: x.id, data: JSON.parse(x.data), updated_at: Number(x.updated_at)
      }));
      const ultimo = docs.length ? docs[docs.length - 1].updated_at : since;
      return json(res, { docs, since: ultimo });
    }

    if (p === '/api/set' && req.method === 'POST') {
      const b = await lerCorpo(req);
      if (!b.col || !b.data) return json(res, { error: 'col e data obrigatorios' }, 400);
      const id = idOuNovo(b.id);
      const dados = mesclar(b.col, id, b.data, b.merge);
      const t = agora();
      sqlGravar.run(b.col, String(id), JSON.stringify(dados), t);
      cacheLimpar();
      return json(res, { ok: true, id: String(id), updated_at: t });
    }

    if (p === '/api/delete' && req.method === 'POST') {
      const b = await lerCorpo(req);
      if (!b.col || !b.id) return json(res, { error: 'col e id obrigatorios' }, 400);
      /* Exclusao vira lapide: o /api/changes propaga para os navegadores
         offline. O /api/all esconde a lapide, entao o usuario nao a ve. */
      lapide(b.col, String(b.id));
      cacheLimpar();
      return json(res, { ok: true });
    }

    if (p === '/api/batch' && req.method === 'POST') {
      const b = await lerCorpo(req);
      const ops = b.ops || [];
      db.exec('BEGIN');
      try {
        for (const op of ops) {
          const id = idOuNovo(op.id);
          if (op.type === 'delete') lapide(op.col, String(id));
          else sqlGravar.run(op.col, String(id), JSON.stringify(mesclar(op.col, id, op.data || {}, op.merge)), agora());
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      cacheLimpar();
      return json(res, { ok: true, ops: ops.length });
    }

    if (p === '/api/import' && req.method === 'POST') {
      const b = await lerCorpo(req);
      const docs = b.docs || [];
      let n = 0;
      db.exec('BEGIN');
      try {
        for (const d of docs) {
          sqlGravar.run(d.col, String(d.id), JSON.stringify(d.data || {}), Number(d.updated_at) || agora());
          n++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      cacheLimpar();
      return json(res, { ok: true, importados: n });
    }

    if (p === '/' || p === '/status') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>FARN Servidor Local</title>'
        + '<h2 style="font-family:Arial;color:#0f766e">FARN - Servidor local ativo</h2>'
        + '<p style="font-family:Arial">Banco: ' + ARQ_DB + '</p>'
        + '<p style="font-family:Arial">Documentos: ' + Number(sqlContar.get().n) + '</p>');
    }

    return json(res, { error: 'Rota nao encontrada', path: p }, 404);
  } catch (e) {
    console.error('[erro]', e && e.message ? e.message : e);
    return json(res, { error: e && e.message ? e.message : String(e) }, 500);
  }
});

servidor.listen(PORT, '0.0.0.0', () => {
  console.log('FARN Servidor Local');
  console.log('  API:  http://localhost:' + PORT);
  console.log('  Banco:' + ARQ_DB);
  console.log('  Docs: ' + Number(sqlContar.get().n));
  if (TOKEN) console.log('  Token: exigido');
});
