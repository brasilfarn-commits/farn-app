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
  var KEY_SYNC = 'farn_db_sync_v1';
  var URL_PADRAO = 'https://howto-alliance-pest-contest.trycloudflare.com';
  var URLS_TUNEIS_ANTIGOS = [
    'https://planets-linear-vbulletin-colin.trycloudflare.com',
    'https://location-anthropology-martial-fares.trycloudflare.com'
  ];

  function FarnDB(baseUrl) {
    /* Servidor proprio: a configuracao salva em configurar-servidor.html
       prevalece sobre a URL fixa passada pelas paginas. Assim basta trocar
       a URL do tunel em um unico lugar, sem editar os HTMLs. */
    var cfg = null;
    try { cfg = JSON.parse(localStorage.getItem('farn_api_config') || 'null'); } catch (e) {}
    /* Tunel rapido troca de endereco ao reiniciar. Migracao automatica:
       navegadores que salvaram qualquer URL antiga passam para a nova sem
       que o usuario precise abrir a pagina de configuracao. */
    if (cfg) {
      var urlSalva = String(cfg.url || '').replace(/\/$/, '');
      if (URLS_TUNEIS_ANTIGOS.indexOf(urlSalva) >= 0) {
        cfg.url = URL_PADRAO;
        try { localStorage.setItem('farn_api_config', JSON.stringify(cfg)); } catch (e) {}
      }
    }
    var escolhida = (typeof window !== 'undefined' && window.FARN_API_URL)
        || (cfg && cfg.url) || baseUrl || URL_PADRAO;
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
    this._flushPromise = null;
    this.ultimaSincronizacao = null;
    this.erroSincronizacao = null;
    this._ciclos = 0;
    this._proxCol = 0;
    this._carregarLocal();
    /* Nunca pedir o historico inteiro: /api/changes?since=0 devolve milhares
       de documentos e estoura o tunel. O dados antigos ja vem via /api/all
       quando a tela acessa a colecao; aqui so interessam mudancas recentes. */
    var agoraMs = Date.now();
    if (!this.since || !Object.keys(this.cache).length || this.since < agoraMs - 30 * 86400000) {
      this.since = agoraMs;
    }
    var self = this;
    window.addEventListener('online', function () { self.online = true; self.sincronizar(); });
    window.addEventListener('offline', function () { self.online = false; });
    this._iniciarPolling();
    this.sincronizar();
  }

  /* ---------- persistencia local (offline) ---------- */
  /* O espelho completo passa de 7 MB neste projeto e nao cabe no
     localStorage (~5 MB). Por isso a fila (pequena) eh salva primeiro e as
     gravacoes pendentes sao reaplicadas ao carregar: assim o ultimo cadastro
     sobrevive a recarga mesmo quando o espelho grande nao coube. */
  var LIMITE_CACHE = 4000000;
  var COLECOES_PROTEGIDAS = { docentesAdmin: true, coordenacao: true };

  FarnDB.prototype._carregarLocal = function () {
    var self = this;
    try {
      var c = JSON.parse(localStorage.getItem(KEY_CACHE) || 'null');
      if (c && typeof c === 'object') this.cache = c;
      var s = Number(localStorage.getItem(KEY_SINCE) || 0);
      if (s) this.since = s;
      var q = JSON.parse(localStorage.getItem(KEY_QUEUE) || '[]');
      if (Array.isArray(q)) this.fila = q;
      var cols = {};
      this.fila.forEach(function (op) { cols[op.col] = true; });
      Object.keys(cols).forEach(function (col) {
        if (!self.cache[col]) self.cache[col] = {};
        self._reaplicarPendentes(col, self.cache[col]);
      });
    } catch (e) {}
  };
  FarnDB.prototype._salvarLocal = function () {
    try { localStorage.setItem(KEY_SINCE, String(this.since)); } catch (e) {}
    try { localStorage.setItem(KEY_QUEUE, JSON.stringify(this.fila)); } catch (e) {}
    var json = '';
    try { json = JSON.stringify(this.cache); } catch (e) { return; }
    var espelho = this.cache;
    if (json.length > LIMITE_CACHE) {
      var copia = {};
      Object.keys(espelho).forEach(function (k) { copia[k] = espelho[k]; });
      var pesos = Object.keys(copia).filter(function (k) { return !COLECOES_PROTEGIDAS[k]; })
        .map(function (k) { return { k: k, n: JSON.stringify(copia[k] || {}).length }; })
        .sort(function (a, b) { return b.n - a.n; });
      for (var i = 0; i < pesos.length && json.length > LIMITE_CACHE; i++) {
        delete copia[pesos[i].k];
        json = JSON.stringify(copia);
      }
      espelho = copia;
    }
    try { localStorage.setItem(KEY_CACHE, json); }
    catch (e) {
      try {
        var minimo = {};
        Object.keys(COLECOES_PROTEGIDAS).forEach(function (k) {
          if (espelho[k]) minimo[k] = espelho[k];
        });
        localStorage.setItem(KEY_CACHE, JSON.stringify(minimo));
      } catch (e2) {}
    }
  };
  FarnDB.prototype._enfileirar = function (op) {
    this.fila.push(op);
    this._salvarLocal();
    /* Nao await: a interface nao pode travar esperando a rede. A fila fica
       salva e o proximo ciclo de sincronizacao tenta de novo. */
    this._flush().catch(function () {});
  };
  /* Envia LOCAL -> SERVIDOR. Uma unica promessa por vez evita que o mesmo
     lote seja enviado duas vezes quando ha varias gravacoes em sequencia. */
  FarnDB.prototype._flush = function () {
    if (this._flushPromise) return this._flushPromise;
    if (!this.fila.length || !navigator.onLine) return Promise.resolve();
    var self = this;
    var lote = this.fila.slice();
    this._flushPromise = (async function () {
      try {
        await self._req('/api/batch', { method: 'POST', body: JSON.stringify({ ops: lote }) });
        self.fila = self.fila.filter(function (op) { return lote.indexOf(op) < 0; });
        self._salvarLocal();
        self.online = true;
        self._avisarTodos();
      } catch (e) {
        self.online = false;
        throw e;
      }
    })();
    var promessa = this._flushPromise;
    var limpar = function () { if (self._flushPromise === promessa) self._flushPromise = null; };
    promessa.then(limpar, limpar);
    return promessa;
  };
  FarnDB.prototype._avisarTodos = function () {
    this.listeners.slice().forEach(function (l) { l.emitir(); });
  };
  FarnDB.prototype.status = function () {
    return {
      online: this.online && navigator.onLine !== false,
      pendentes: this.fila.length,
      ultimaSincronizacao: this.ultimaSincronizacao,
      erro: this.erroSincronizacao
    };
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
      (r.docs || []).forEach(function (d) {
        if (d.data && d.data.__farnDelete) return;
        mapa[d.id] = d.data;
      });
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
    self.timer = setInterval(function () { self.sincronizar(); }, 5000);
  };

  /* Ciclo completo: envia o que foi gravado offline e depois traz o que
     mudou no servidor. Roda a cada 5 s e tambem ao voltar a conexao. */
  FarnDB.prototype.sincronizar = async function () {
    if (!navigator.onLine) { this.online = false; return; }
    var EstadoAntes = this.online;
    try { await this._flush(); } catch (e) { this.online = false; }
    try {
      await this._poll();
      this.online = true;
      this.erroSincronizacao = null;
      this.ultimaSincronizacao = new Date().toISOString();
    } catch (e) {
      this.online = false;
      this.erroSincronizacao = String((e && e.message) || e);
    }
    /* Reconciliacao lenta: uma colecao carregada por minuto. Serve para
       pegar exclusoes feitas antes do servidor gravar lapides e qualquer
       diferenca que o /api/changes nao tenha alcancado. */
    this._ciclos++;
    if (this.online && this._ciclos % 12 === 0) {
      var cols = Object.keys(this._carregadas);
      if (cols.length) {
        var col = cols[this._proxCol % cols.length];
        this._proxCol = (this._proxCol + 1) % cols.length;
        await this._buscarColecao(col);
      }
    }
    try {
      localStorage.setItem(KEY_SYNC, JSON.stringify({
        em: this.ultimaSincronizacao,
        pendentes: this.fila.length,
        online: this.online,
        erro: this.erroSincronizacao
      }));
    } catch (e) {}
    if (EstadoAntes !== this.online) this._avisarTodos();
  };

  /* Recebe SERVIDOR -> LOCAL. Exclusoes chegam como lapide (__farnDelete). */
  FarnDB.prototype._poll = async function () {
    var self = this;
    if (!this.since) this.since = Date.now();
    var sinceAntes = this.since;
    var r = await this._req('/api/changes?since=' + this.since);
    var mudou = false;
    (r.docs || []).forEach(function (d) {
      if (!self.cache[d.col]) self.cache[d.col] = {};
      /* Nunca deixa uma versao antiga do servidor sobrescrever uma
         gravacao local que ainda aguarda confirmacao. */
      if (self._temPendente(d.col, d.id)) return;
      if (d.data && d.data.__farnDelete) {
        if (Object.prototype.hasOwnProperty.call(self.cache[d.col], d.id)) {
          delete self.cache[d.col][d.id];
          mudou = true;
        }
        return;
      }
      self.cache[d.col][d.id] = d.data;
      mudou = true;
    });
    this.since = r.since || this.since;
    if (mudou || this.since !== sinceAntes) this._salvarLocal();
    if (mudou) this._avisarTodos();
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
  /* onSnapshot de um documento unico, igual ao Firestore. Sem isso o portal
     so descobria mudancas de permissoes depois de relogar. */
  DocRef.prototype.onSnapshot = function (cb, errCb) {
    var self = this, ultima = null;
    var listener = {
      emitir: async function () {
        try {
          var snap = await self.get();
          var chave = JSON.stringify(snap.data() === undefined ? null : snap.data());
          if (chave !== ultima) { ultima = chave; cb(snap); }
        } catch (e) { if (errCb) errCb(e); }
      }
    };
    this._db.listeners.push(listener);
    listener.emitir();
    var db = this._db;
    return function () { db.listeners = db.listeners.filter(function (l) { return l !== listener; }); };
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
    self._db._flush().catch(function () {});
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

  /* Utilitario: forca um ciclo completo local -> servidor -> local. */
  global.farnSincronizarAgora = function () {
    if (!global.dbFirestore) return Promise.resolve(null);
    return global.dbFirestore.sincronizar();
  };

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
