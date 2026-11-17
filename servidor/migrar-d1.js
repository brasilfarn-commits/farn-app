/* =====================================================================
   FARN - Migração D1 (nuvem)  ->  SQLite local
   Copia TODOS os documentos, inclusive subcolecoes, usando /api/changes.
   Importa pagina por pagina: se o D1 estourar a cota no meio, o que já
   veio fica salvo e o comando pode ser repetido (upsert é idempotente).

   Executar:  node servidor/migrar-d1.js
   Requer:    node servidor/servidor.js rodando em outra janela
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ORIGEM = String(process.env.FARN_D1_URL || 'https://farn-api.farn-api-farn.workers.dev').replace(/\/$/, '');
const DESTINO = String(process.env.FARN_LOCAL_URL || 'http://localhost:8787').replace(/\/$/, '');
const PROGRESSO = path.join(__dirname, 'dados', '.migracao.json');

async function get(url) {
  const r = await fetch(url);
  const t = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200));
  return JSON.parse(t);
}
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200));
  return JSON.parse(t);
}
function salvarProgresso(since, total, paginas) {
  fs.mkdirSync(path.dirname(PROGRESSO), { recursive: true });
  fs.writeFileSync(PROGRESSO, JSON.stringify({ since, total, paginas, em: new Date().toISOString() }));
}
function lerProgresso() {
  try { return JSON.parse(fs.readFileSync(PROGRESSO, 'utf8')); } catch (e) { return { since: 0, total: 0, paginas: 0 }; }
}

(async () => {
  console.log('Origem D1 : ' + ORIGEM);
  console.log('Destino   : ' + DESTINO);

  try { await get(ORIGEM + '/api/ping'); console.log('D1 acessivel'); }
  catch (e) { console.error('Falha ao acessar o D1: ' + e.message); process.exit(1); }
  try { await get(DESTINO + '/api/ping'); console.log('Servidor local OK'); }
  catch (e) { console.error('Falha ao acessar o servidor local. Rode: node servidor/servidor.js'); process.exit(1); }

  const prog = lerProgresso();
  let since = Number(prog.since || 0);
  let total = Number(prog.total || 0);
  let paginas = Number(prog.paginas || 0);
  console.log('Retomando desde: ' + since + ' (' + total + ' documentos ja processados)');

  while (true) {
    let resp;
    try {
      resp = await get(ORIGEM + '/api/changes?since=' + since);
    } catch (e) {
      console.error('\nErro ao ler o D1: ' + e.message);
      if (/limit|quota|exceeded|429|500/i.test(e.message)) {
        console.error('O limite diario pode ter sido atingido. O que ja veio foi salvo.');
        console.error('Rode este comando novamente depois das 00:00 UTC (21:00 em Brasilia).');
        salvarProgresso(since, total, paginas);
      }
      process.exit(1);
    }
    const docs = (resp.docs || []).map(d => ({
      col: d.col, id: d.id, data: d.data, updated_at: d.updated_at
    }));
    if (docs.length) {
      try { await post(DESTINO + '/api/import', { docs }); }
      catch (e) { console.error('Erro ao gravar no servidor local: ' + e.message); salvarProgresso(since, total, paginas); process.exit(1); }
    }
    total += docs.length;
    paginas++;
    const novoSince = Number(resp.since || since);
    since = novoSince > since ? novoSince : since + 1;
    salvarProgresso(since, total, paginas);
    process.stdout.write('\rPaginas: ' + paginas + ' | Documentos: ' + total + '   ');
    if (docs.length < 2000) break;
  }
  console.log('');

  const stats = await get(DESTINO + '/api/stats');
  console.log('Concluido! Banco local: ' + stats.docs + ' documentos em ' + stats.colecoes.length + ' colecoes.');
  stats.colecoes.sort((a, b) => a.col.localeCompare(b.col)).forEach(c => console.log('  ' + c.col + ': ' + c.n));
  try { fs.unlinkSync(PROGRESSO); } catch (e) {}
})().catch(e => { console.error('Erro:', e); process.exit(1); });
