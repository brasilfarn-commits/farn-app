/* =====================================================================
   FARN DB - adaptador compatível com a API do Firestore usada pelo app.
   Backend: Cloudflare Worker + D1 (farn-api).
   Troca apenas a linha que cria dbFirestore; o resto do código continua.
   ===================================================================== */
(function (global) {
  'use strict';

  var DEL = { __farnDelete: true };
  var SERVER_TS = { __farnServerTs: true };
  var KEY_CACHE = 'farn_db_cache_v1';
  var KEY_QUEUE = 'farn_db_queue_v1';
  var KEY_SINCE = 'farn_db_since_v1';

  function FarnDB(baseUrl) {
    /* Servidor proprio: a configuracao salva em configurar-servidor.html
       prevalece sobre a URL fixa passada pelas paginas. Assim basta trocar
       a URL do tunel em um unico lugar, sem editar os HTMLs. */
    var cfg = null;
    try { cfg = JSON.parse(localStorage.getItem('farn_api_config') || 'null'); } catch (e) {}
    var escolhida = (typeof window !== 'undefined' && window.FARN_API_URL)
        || (cfg && cfg.url) || baseUrl
        || 'https://farn-api.farn-api-farn.workers.dev';
    this.baseUrl = String(escolhida).replace(/\/$/, '');
    this.headers = { 'Content-Type': 'application/json' };
    if (cfg && cfg.token) this.headers['X-Farn-Token'] = String(cfg.token);
    this.cache = {};           // col -> { id: data }
    this.listeners = [];
    this.since = 0;
    this.timer = null;
    this.online = true;
    this.fila = [];
    this._carregadas = {};
    this._carregarLocal();
    /* Sempre reconcilia desde o inicio: um since antigo com cache vazio
       deixaria o sistema sem dados mesmo com o banco cheio. */
    this.since = 0;
    var self = this;
    window.addEventListener('online', function () { self.online = true; self._flush(); self._poll(); });
    window.addEventListener('offline', function () { self.online = false; });
    this._iniciarPolling();
    this._flush();
  }

  /* ---------- persistencia local (offline) ---------- */
  FarnDB.prototype._carregarLocal = function () {
    try {
      var c = JSON.parse(localStorage.getItem(KEY_CACHE) || 'null');
      if (c && typeof c === 'object') this.cache = c;
      var s = Number(localStorage.getItem(KEY_SINCE) || 0);
      if (s) this.since = s;
      var q = JSON.parse(localStorage.getItem(KEY_QUEUE) || '[]');
      if (Array.isArray(q)) this.fila = q;
    } catch (e) {}
  };
  FarnDB.prototype._salvarLocal = function () {
    try { localStorage.setItem(KEY_CACHE, JSON.stringify(this.cache)); } catch (e) {}
    try { localStorage.setItem(KEY_SINCE, String(this.since)); } catch (e) {}
    try { localStorage.setItem(KEY_QUEUE, JSON.stringify(this.fila)); } catch (e) {}
  };
  FarnDB.prototype._enfileirar = function (op) {
    this.fila.push(op);
    this._salvarLocal();
    this._flush();
  };
  FarnDB.prototype._flush = async function () {
    if (!this.fila.length || !navigator.onLine) return;
    var lote = this.fila.slice();
    try {
      await this._req('/api/batch', { method: 'POST', body: JSON.stringify({ ops: lote }) });
      this.fila = this.fila.filter(function (op) { return lote.indexOf(op) < 0; });
      this._salvarLocal();
      this.online = true;
      this._avisarTodos();
    } catch (e) { this.online = false; }
  };
  FarnDB.prototype._avisarTodos = function () {
    this.listeners.slice().forEach(function (l) { l.emitir(); });
  };
  FarnDB.prototype.status = function () {
    return { online: this.online && navigator.onLine !== false, pendentes: this.fila.length };
  };

  FarnDB.prototype._req = async function (path, opts) {
    var r = await fetch(this.baseUrl + path, Object.assign({
      headers: this.headers
    }, opts || {}));
    var txt = await r.text();
    var dados;
    try { dados = JSON.parse(txt); } catch (e) { throw new Error('Resposta inválida: ' + txt.slice(0, 120)); }
    if (!r.ok || dados.error) throw new Error(dados.error || ('HTTP ' + r.status));
    return dados;
  };

  /* Reaplica gravacoes que ainda estao na fila depois de Receber dados do
     servidor. Sem isso, um /api/all que ainda nao contem a ultima escrita
     apaga o registro local e o cadastro some da lista ao recarregar. */
  FarnDB.prototype._reaplicarPendentes = function (col, mapa) {
    this.fila.forEach(function (op) {
      if (op.col !== col) return;
      if (op.type === 'delete') { delete mapa[op.id]; return; }
      var atual = mapa[op.id] || {};
      mapa[op.id] = op.merge ? Object.assign({}, atual, op.data) : Object.assign({}, op.data);
    });
    return mapa;
  };
  FarnDB.prototype._temPendente = function (col, id) {
    return this.fila.some(function (op) { return op.col === col && op.id === id; });
  };

  FarnDB.prototype._buscarColecao = async function (col) {
    try {
      var r = await this._req('/api/all?col=' + encodeURIComponent(col));
      var mapa = {};
      (r.docs || []).forEach(function (d) { mapa[d.id] = d.data; });
      this._reaplicarPendentes(col, mapa);
      this.cache[col] = mapa;
      this._salvarLocal();
      this.online = true;
      this._avisarTodos();
    } catch (e) {
      this.online = false;
    }
  };

  FarnDB.prototype._todos = async function (col) {
    if (!this._carregadas[col]) {
      this._carregadas[col] = true;
      var temLocal = !!(this.cache[col] && Object.keys(this.cache[col]).length);
      if (temLocal) {
        /* Mostra o cache na hora e atualiza em segundo plano. */
        this._buscarColecao(col).catch(function () {});
      } else {
        await this._buscarColecao(col);
        if (!this.cache[col]) this.cache[col] = {};
      }
    }
    return this.cache[col] || {};
  };

  FarnDB.prototype._iniciarPolling = function () {
    var self = this;
    if (self.timer) clearInterval(self.timer);
    self.timer = setInterval(function () { self._poll(); }, 5000);
  };

  FarnDB.prototype._poll = async function () {
    if (!this.listeners.length && this.since === 0) return;
    try {
      var r = await this._req('/api/changes?since=' + this.since);
      var mudou = false;
      (r.docs || []).forEach(function (d) {
        if (!self.cache[d.col]) self.cache[d.col] = {};
        /* Nunca deixa uma versao antiga do servidor sobrescrever uma
           gravegacao local que ainda aguarda confirmacao. */
        if (self._temPendente(d.col, d.id)) return;
        self.cache[d.col][d.id] = d.data;
        mudou = true;
      });
      this.since = r.since || this.since;
      this.online = true;
      this._salvarLocal();
      if (mudou) this._avisarTodos();
      if (this.fila.length) this._flush();
    } catch (e) {
      this.online = false;
    }
  };

  /* ---------- snippets ---------- */
  function DocSnap(db, col, id, data) {
    this.id = id;
    this.exists = data !== undefined && data !== null;
    this._data = data;
    this.ref = new DocRef(db, col, id);
  }
  DocSnap.prototype.data = function () { return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined; };

  function QuerySnap(db, docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
  QuerySnap.prototype.forEach = function (cb) { this.docs.forEach(cb); };

  /* ---------- Query ---------- */
  function Query(db, col) {
    this._db = db; this._col = col;
    this._where = []; this._order = null; this._limitN = null;
  }
  Query.prototype.where = function (campo, op, valor) {
    var q = Object.create(Query.prototype);
    Object.assign(q, this);
    q._where = this._where.concat([{ campo: campo, op: op, valor: valor }]);
    return q;
  };
  Query.prototype.orderBy = function (campo, dir) {
    var q = Object.create(Query.prototype); Object.assign(q, this);
    q._order = { campo: campo, dir: String(dir || 'asc').toLowerCase() }; return q;
  };
  Query.prototype.limit = function (n) {
    var q = Object.create(Query.prototype); Object.assign(q, this); q._limitN = n; return q;
  };
  Query.prototype._avaliar = function (d) {
    for (var i = 0; i < this._where.length; i++) {
      var w = this._where[i], v = d[w.campo];
      if (w.op === '==') { if (v !== w.valor) return false; }
      else if (w.op === '!=') { if (v === w.valor) return false; }
      else if (w.op === '>') { if (!(v > w.valor)) return false; }
      else if (w.op === '>=') { if (!(v >= w.valor)) return false; }
      else if (w.op === '<') { if (!(v < w.valor)) return false; }
      else if (w.op === '<=') { if (!(v <= w.valor)) return false; }
      else if (w.op === 'in') { if (!Array.isArray(w.valor) || w.valor.indexOf(v) < 0) return false; }
      else if (w.op === 'array-contains') { if (!Array.isArray(v) || v.indexOf(w.valor) < 0) return false; }
    }
    return true;
  };
  Query.prototype._resultado = async function () {
    var mapa = await this._db._todos(this._col);
    var docs = [];
    for (var id in mapa) {
      if (!Object.prototype.hasOwnProperty.call(mapa, id)) continue;
      var d = mapa[id];
      if (this._avaliar(d)) docs.push(new DocSnap(this._db, this._col, id, d));
    }
    if (this._order) {
      var campo = this._order.campo, dir = this._order.dir;
      docs.sort(function (a, b) {
        var x = a._data && a._data[campo], y = b._data && b._data[campo];
        var c = String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'pt-BR', { numeric: true });
        return dir === 'desc' ? -c : c;
      });
    }
    if (this._limitN != null) docs = docs.slice(0, this._limitN);
    return new QuerySnap(this._db, docs);
  };
  Query.prototype.get = function () { return this._resultado(); };
  Query.prototype.onSnapshot = function (cb, errCb) {
    var self = this, ultima = '';
    var listener = {
      emitir: async function () {
        try {
          var snap = await self._resultado();
          var chave = JSON.stringify(snap.docs.map(function (d) { return [d.id, d._data]; }));
          if (chave !== ultima) { ultima = chave; cb(snap); }
        } catch (e) { if (errCb) errCb(e); }
      }
    };
    this._db.listeners.push(listener);
    listener.emitir();
    var db = this._db;
    return function () { db.listeners = db.listeners.filter(function (l) { return l !== listener; }); };
  };
  /* CollectionReference tambem precisa de doc() (o app usa collection().doc()). */
  Query.prototype.doc = function (id) {
    /* Firestore gera um ID automatico quando doc() vem sem argumento. */
    if (id === undefined || id === null) id = String(Date.now()) + Math.random().toString(36).slice(2, 10);
    return new DocRef(this._db, this._col, id);
  };
  Query.prototype.add = function (data) {
    var id = String(Date.now()) + Math.random().toString(36).slice(2, 8);
    var limpo = limpar(data);
    this._db.cache[this._col] = this._db.cache[this._col] || {};
    this._db.cache[this._col][id] = limpo;
    this._db._salvarLocal();
    this._db._enfileirar({ type: 'set', col: this._col, id: id, data: limpo, merge: false });
    this._db._avisarTodos();
    return Promise.resolve(new DocRef(this._db, this._col, id));
  };

  /* ---------- DocumentReference ---------- */
  function DocRef(db, col, id) { this._db = db; this._col = col; this.id = id; }
  DocRef.prototype.collection = function (nome) { return new Query(this._db, this._col + '/' + this.id + '/' + nome); };
  DocRef.prototype.get = async function () {
    var mapa = await this._db._todos(this._col);
    return new DocSnap(this._db, this._col, this.id, mapa[this.id]);
  };
  DocRef.prototype.set = function (data, opts) {
    var merge = !!(opts && opts.merge);
    var limpo = limpar(data, merge);
    var mapa = this._db.cache[this._col] = this._db.cache[this._col] || {};
    var novo = merge ? Object.assign({}, mapa[this.id] || {}, limpo) : limpo;
    Object.keys(novo).forEach(function (k) { if (novo[k] && novo[k].__farnDelete) delete novo[k]; });
    mapa[this.id] = novo;
    this._db._salvarLocal();
    this._db._enfileirar({ type: 'set', col: this._col, id: this.id, data: limpo, merge: merge });
    this._avisar();
    return Promise.resolve();
  };
  DocRef.prototype.update = function (data) { return this.set(data, { merge: true }); };
  DocRef.prototype.delete = function () {
    if (this._db.cache[this._col]) delete this._db.cache[this._col][this.id];
    this._db._salvarLocal();
    this._db._enfileirar({ type: 'delete', col: this._col, id: this.id });
    this._avisar();
    return Promise.resolve();
  };
  DocRef.prototype._avisar = function () { this._db._avisarTodos(); };

  /* ---------- Batch ---------- */
  function Batch(db) { this._db = db; this._ops = []; }
  Batch.prototype.set = function (ref, data, opts) {
    this._ops.push({ type: 'set', col: ref._col, id: ref.id, data: limpar(data, !!(opts && opts.merge)), merge: !!(opts && opts.merge) }); return this;
  };
  Batch.prototype.update = function (ref, data) {
    this._ops.push({ type: 'set', col: ref._col, id: ref.id, data: limpar(data, true), merge: true }); return this;
  };
  Batch.prototype.delete = function (ref) {
    this._ops.push({ type: 'delete', col: ref._col, id: ref.id }); return this;
  };
  Batch.prototype.commit = function () {
    if (!this._ops.length) return Promise.resolve();
    var self = this;
    self._ops.forEach(function (op) {
      var mapa = self._db.cache[op.col] = self._db.cache[op.col] || {};
      if (op.type === 'delete') delete mapa[op.id];
      else {
        var novo = op.merge ? Object.assign({}, mapa[op.id] || {}, op.data) : op.data;
        Object.keys(novo).forEach(function (k) { if (novo[k] && novo[k].__farnDelete) delete novo[k]; });
        mapa[op.id] = novo;
      }
    });
    self._db._salvarLocal();
    self._ops.forEach(function (op) { self._db.fila.push(op); });
    self._db._salvarLocal();
    self._db._avisarTodos();
    self._db._flush();
    return Promise.resolve();
  };

  function limpar(data, manterDelete) {
    var out = {};
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      if (v === DEL || (v && v.__farnDelete)) {
        if (manterDelete) out[k] = DEL;
        return;
      }
      if (v === SERVER_TS || (v && v.__farnServerTs)) { out[k] = new Date().toISOString(); return; }
      out[k] = v;
    });
    return out;
  }

  /* ---------- API publica ---------- */
  FarnDB.prototype.collection = function (nome) { return new Query(this, nome); };
  FarnDB.prototype.doc = function (caminho) {
    var partes = String(caminho || '').split('/');
    var col = partes.shift(), id = partes.join('/');
    if (!id) id = String(Date.now()) + Math.random().toString(36).slice(2, 10);
    return new DocRef(this, col, id);
  };
  FarnDB.prototype.batch = function () { return new Batch(this); };

  /* Utilitario: descarta o espelho local e volta a ler tudo do servidor. */
  global.farnLimparCache = function () {
    try {
      localStorage.removeItem(KEY_CACHE);
      localStorage.removeItem(KEY_SINCE);
    } catch (e) {}
    if (confirm('Cache local removido. Recarregar a pagina agora?')) location.reload();
  };

  global.FarnDB = FarnDB;
  global.FarnFieldValue = {
    delete: function () { return DEL; },
    serverTimestamp: function () { return SERVER_TS; }
  };
  /* Compatibilidade com firebase.firestore.FieldValue usado em app.js */
  if (!global.firebase) global.firebase = {};
  if (!global.firebase.firestore) global.firebase.firestore = {};
  global.firebase.firestore.FieldValue = global.FarnFieldValue;

})(window);
