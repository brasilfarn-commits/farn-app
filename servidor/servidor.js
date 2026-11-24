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

/* Pasta com os arquivos do site (HTML/JS/IMG). Quando existe, o servidor
   tambem publica o app — assim o Ubuntu hospeda site + API no mesmo lugar,
   sem depender do Firebase Hosting. */
const DIR_SITE = path.resolve(process.env.DIR_SITE || path.join(__dirname, 'public'));

/* Arquivos enviados pelo app (videos, insignias, fotos, apostilas):
   substituem o Firebase Storage. */
const DIR_ARQUIVOS = path.resolve(process.env.DIR_ARQUIVOS || path.join(__dirname, 'arquivos'));
const LIMITE_UPLOAD = 512 * 1024 * 1024; /* 512 MB por arquivo */
if (!fs.existsSync(DIR_ARQUIVOS)) fs.mkdirSync(DIR_ARQUIVOS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm', '.zip': 'application/zip'
};

/* Resolve um caminho da URL dentro de DIR_SITE, barrando ".." e nulos. */
function siteArquivo(p) {
  let rel;
  try { rel = decodeURIComponent(p); } catch (e) { return null; }
  if (rel.indexOf('\0') >= 0) return null;
  if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(DIR_SITE, rel));
  if (abs !== DIR_SITE && abs.indexOf(DIR_SITE + path.sep) !== 0) return null;
  try {
    let st = fs.statSync(abs);
    if (st.isDirectory()) {
      abs = path.join(abs, 'index.html');
      st = fs.statSync(abs);
      if (!st.isFile()) return null;
    }
    if (!st.isFile()) return null;
    return { arq: abs, st };
  } catch (e) { return null; }
}

function enviarSite(res, req, p) {
  const alvo = siteArquivo(p);
  if (!alvo) return false;
  const ext = path.extname(alvo.arq).toLowerCase();
  /* HTML/JS/CSS nunca ficam guardados: publicou, ja aparece. */
  const cache = (ext === '.html' || ext === '.htm' || ext === '.js' || ext === '.mjs'
    || ext === '.css' || ext === '.json' || ext === '.webmanifest')
    ? 'no-cache, max-age=0, must-revalidate'
    : 'public, max-age=3600';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': alvo.st.size,
    'Cache-Control': cache
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(alvo.arq).pipe(res);
  return true;
}

/* ---------- arquivos enviados pelo app (no lugar do Firebase Storage) ---------- */

/* Caminho seguro dentro de DIR_ARQUIVOS: barrada ".." e nulos. */
function arquivoSeguro(p) {
  let rel = String(p || '');
  try { rel = decodeURIComponent(rel); } catch (e) { /* caminho ja veio decodificado */ }
  if (!rel || rel.indexOf('\0') >= 0) return null;
  rel = rel.replace(/^\/+/, '');
  const abs = path.normalize(path.join(DIR_ARQUIVOS, rel));
  if (abs.indexOf(DIR_ARQUIVOS + path.sep) !== 0) return null;
  return abs;
}

function urlPublicaArquivo(req, caminho) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const partes = String(caminho).split('/').map(encodeURIComponent).join('/');
  return proto + '://' + req.headers.host + '/api/arquivo/' + partes;
}

/* Grava o corpo da requisicao em disco (streaming, sem carregar na memoria). */
function receberUpload(req, caminho) {
  const abs = arquivoSeguro(caminho);
  if (!abs) return Promise.reject(new Error('caminho invalido'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + '.parcial';
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(tmp);
    let bytes = 0;
    let falhou = false;
    const erro = (e) => {
      if (falhou) return;
      falhou = true;
      try { ws.destroy(); } catch (e2) {}
      try { fs.unlinkSync(tmp); } catch (e2) {}
      reject(e);
    };
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > LIMITE_UPLOAD) erro(new Error('Arquivo maior que 512 MB'));
    });
    req.on('error', erro);
    ws.on('error', erro);
    ws.on('finish', () => {
      if (falhou) return;
      try {
        fs.renameSync(tmp, abs);
        resolve({ abs, bytes });
      } catch (e) { erro(e); }
    });
    req.pipe(ws);
  });
}

/* Apaga arquivo ou todos os de uma pasta (ex.: ao excluir conversa). */
function apagarArquivo(abs) {
  try { fs.unlinkSync(abs); return true; } catch (e) { return false; }
}
function apagarPasta(prefixo) {
  const base = arquivoSeguro(prefixo);
  if (!base) return 0;
  let n = 0;
  const varrer = (dir) => {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    itens.forEach((it) => {
      const caminho = path.join(dir, it.name);
      if (it.isDirectory()) varrer(caminho);
      else if (apagarArquivo(caminho)) n++;
    });
  };
  try {
    if (fs.statSync(base).isDirectory()) varrer(base);
    else if (apagarArquivo(base)) n = 1;
  } catch (e) {}
  return n;
}

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

  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  /* Token protege a API. Downloads de arquivo ficam abertos para o <img>/
     <video> conseguir abrir a URL direto. As paginas do site tambem. */
  if (TOKEN && p.indexOf('/api/') === 0
      && !(req.method === 'GET' && p.indexOf('/api/arquivo/') === 0)
      && req.headers['x-farn-token'] !== TOKEN) {
    return json(res, { error: 'Token invalido' }, 401);
  }

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

    /* ---------- arquivos (substituem o Firebase Storage) ---------- */

    if (p === '/api/upload' && (req.method === 'POST' || req.method === 'PUT')) {
      const caminho = url.searchParams.get('caminho');
      if (!caminho) return json(res, { error: 'caminho obrigatorio' }, 400);
      if (!arquivoSeguro(caminho)) return json(res, { error: 'caminho invalido' }, 400);
      const r = await receberUpload(req, caminho);
      return json(res, { ok: true, url: urlPublicaArquivo(req, caminho), bytes: r.bytes });
    }

    if (p.indexOf('/api/arquivo/') === 0 && req.method === 'GET') {
      const abs = arquivoSeguro(p.slice('/api/arquivo/'.length));
      let st = null;
      try { st = abs ? fs.statSync(abs) : null; } catch (e) {}
      if (!st || !st.isFile()) return json(res, { error: 'Arquivo nao encontrado' }, 404);
      const ext = path.extname(abs).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        /* Fotos tem o mesmo caminho quando atualizadas: sem cache longo,
           senao a foto antiga continua aparecendo por um dia. */
        'Cache-Control': 'no-cache, max-age=0, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      if (req.method === 'HEAD') { res.end(); return; }
      return fs.createReadStream(abs).pipe(res);
    }

    if (p === '/api/arquivo/excluir' && req.method === 'POST') {
      const b = await lerCorpo(req);
      let caminho = String(b.caminho || '');
      if (!caminho && b.url) {
        const u = String(b.url);
        const i = u.indexOf('/api/arquivo/');
        if (i >= 0) caminho = u.slice(i + '/api/arquivo/'.length);
      }
      if (b.prefixo) {
        return json(res, { ok: true, apagados: apagarPasta(String(b.prefixo)) });
      }
      if (!caminho) return json(res, { error: 'caminho ou prefixo obrigatorio' }, 400);
      const abs = arquivoSeguro(caminho);
      if (!abs) return json(res, { error: 'caminho invalido' }, 400);
      return json(res, { ok: true, apagado: apagarArquivo(abs) });
    }

    /* Site estatico: o Ubuntu hospeda o app inteiro. GET/HEAD apenas. */
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (enviarSite(res, req, p)) return;

      if (p === '/' || p === '/status') {
        /* Sem pasta public ainda, mostra o painel do servidor. */
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>FARN Servidor Local</title>'
          + '<h2 style="font-family:Arial;color:#0f766e">FARN - Servidor local ativo</h2>'
          + '<p style="font-family:Arial">Banco: ' + ARQ_DB + '</p>'
          + '<p style="font-family:Arial">Documentos: ' + Number(sqlContar.get().n) + '</p>');
      }

      if (p.indexOf('/api/') !== 0) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>404</title>'
          + '<h1 style="font-family:Arial">404 - arquivo nao encontrado</h1>'
          + '<p style="font-family:Arial"><a href="/">Voltar para o inicio</a></p>');
      }
    }

    return json(res, { error: 'Rota nao encontrada', path: p }, 404);
  } catch (e) {
    console.error('[erro]', e && e.message ? e.message : e);
    return json(res, { error: e && e.message ? e.message : String(e) }, 500);
  }
});

servidor.listen(PORT, '0.0.0.0', () => {
  console.log('FARN Servidor Local');
  console.log('  API:     http://localhost:' + PORT);
  console.log('  Banco:   ' + ARQ_DB);
  console.log('  Site:    ' + DIR_SITE + (fs.existsSync(path.join(DIR_SITE, 'index.html')) ? ' (publicado)' : ' (sem publicar ainda)'));
  console.log('  Arquivos:' + DIR_ARQUIVOS);
  console.log('  Docs:    ' + Number(sqlContar.get().n));
  if (TOKEN) console.log('  Token:   exigido');
});
