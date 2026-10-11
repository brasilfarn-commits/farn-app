/* ==========================================================================
   FICHA GERAL - NUCLEO COMPARTILHADO (ADMINISTRADOR E PORTAL DO ALUNO)
   --------------------------------------------------------------------------
   Este arquivo e a unica fonte da montagem da Ficha Geral e do calculo das
   avaliacoes. E carregado por:
     - index.html         (administrador, secao Ficha Geral)
     - portal-aluno.html  (portal do aluno, secao Ficha Geral)
   Assim, qualquer ajuste na ficha vale para as duas telas ao mesmo tempo.

   Dependencias opcionais do host (usa as funcoes do host quando existirem,
   com fallback proprio):
     - dbFirestore         instancia do Firestore
     - escHTML             escape de HTML
     - formatCPFDisplay    formatacao de CPF
     - generateMatricula   matricula gerada a partir do CPF
   ========================================================================== */

/* Contexto do filtro do administrador (vazio no portal do aluno: a ficha usa
   o projeto e a turma do proprio cadastro). */
var fichaGeralProjeto = '';
var fichaGeralTurma = '';

/* Cache de aulas do projeto/turma em uso. */
var fichaGeralAulasCache = null;

/* Cada tela define o handler de impressao da ficha. */
var fichaGeralImprimirHandler = null;
function fichaGeralImprimirFicha(idx) {
    if (typeof fichaGeralImprimirHandler === 'function') { fichaGeralImprimirHandler(idx); return; }
    alert('Impressao indisponivel nesta tela.');
}

/* Ponte com o ambiente (host) */
function fgEsc(v) {
    if (typeof escHTML === 'function') return escHTML(v);
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fgCPF(cpf) {
    if (typeof formatCPFDisplay === 'function') return formatCPFDisplay(cpf);
    const c = (cpf || '').replace(/\D/g, '');
    if (c.length !== 11) return cpf || '';
    return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
function fgMatricula(cpf) {
    if (typeof generateMatricula === 'function') return generateMatricula(cpf);
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length < 5) return '';
    return 'ACD' + d.slice(-5);
}
function fgDb() {
    return (typeof dbFirestore !== 'undefined' && dbFirestore) ? dbFirestore : null;
}

/* Monta e abre a janela de impressao (A4) da ficha. */
function fichaGeralAbrirImpressao(titulo, bodyHtml, imprimirAgora) {
    fichaGeralPrepararLogo();
    var w = window.open('', '_blank', 'width=900,height=720');
    if (!w) { alert('Permita a abertura de pop-ups para imprimir a ficha.'); return null; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + fgEsc(titulo) + '</title>'
        + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">'
        + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">'
        + '<style>'
        + '@page{size:A4;margin:12mm}'
        + 'body{margin:0;padding:14px;font-family:Inter,Arial,sans-serif;background:#eef2f7;color:#0f172a}'
        + '.fg-quebra{page-break-after:always}'
        + '.fg-quebra:last-child{page-break-after:auto}'
        + '.fg-somente-tela{display:none}'
        + '@media print{body{background:#fff;padding:0}.fg-quebra{box-shadow:none;border:none;border-radius:0;max-width:none}}'
        + '</style>'
        + '</head><body>' + bodyHtml + fichaGeralScriptLogo() + '</body></html>');
    w.document.close();
    w.focus();
    if (imprimirAgora) setTimeout(function() { w.print(); }, 600);
    return w;
}

/* ===== HELPERS DE EXIBICAO ===== */
function fichaGeralData(v) {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const p = s.split('T')[0].split('-');
        return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
}

function fichaGeralNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '0,0';
    return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
}

function fichaGeralCorNota(n) {
    if (n === null || n === undefined || isNaN(n)) return '#94a3b8';
    return n >= 7 ? '#16a34a' : (n >= 5 ? '#f59e0b' : '#dc2626');
}

function fichaGeralStatusCor(status) {
    const s = String(status || '');
    if (s === 'Ativo') return ['#16a34a', '#dcfce7', '#bbf7d0'];
    if (s === 'Pendente') return ['#f59e0b', '#fef3c7', '#fde68a'];
    return ['#64748b', '#f1f5f9', '#cbd5e1'];
}

function fgCampo(rotulo, valor) {
    const v = (valor === null || valor === undefined || valor === '') ? '—' : String(valor);
    return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 9px;background:#f8fafc;min-width:0">'
        + '<div style="font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px">' + fgEsc(rotulo) + '</div>'
        + '<div style="font-size:12px;font-weight:600;color:#0f172a;margin-top:2px;word-break:break-word">' + fgEsc(v) + '</div></div>';
}

function fgCampoDestaque(rotulo, valor) {
    const v = (valor === null || valor === undefined || valor === '') ? '—' : String(valor);
    return '<div style="grid-column:1/-1;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;background:#fef2f2;min-width:0">'
        + '<div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:.5px">' + fgEsc(rotulo) + '</div>'
        + '<div style="font-size:14px;font-weight:800;color:#dc2626;margin-top:2px;word-break:break-word">' + fgEsc(v) + '</div></div>';
}

function fgSimNao(rotulo, v) {
    const sim = String(v || '').toLowerCase() === 'sim';
    const badge = sim
        ? '<span style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700">SIM</span>'
        : '<span style="background:#dcfce7;color:#16a34a;border:1px solid #bbf7d0;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700">NAO</span>';
    return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 9px;background:#f8fafc">'
        + '<div style="font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px">' + fgEsc(rotulo) + '</div>'
        + '<div style="margin-top:3px">' + badge + '</div></div>';
}

function fgSecao(icone, titulo, conteudoHtml) {
    return '<div style="margin-bottom:14px">'
        + '<div style="display:flex;align-items:center;gap:8px;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px">'
        + '<i class="fa-solid ' + icone + '" style="color:#0ea5e9;font-size:13px"></i>'
        + '<span style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.6px">' + fgEsc(titulo) + '</span></div>'
        + conteudoHtml + '</div>';
}

function fgGrid(html) {
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:8px">' + html + '</div>';
}

function fgBarra(pct, cor) {
    return '<div style="height:9px;background:#e2e8f0;border-radius:20px;overflow:hidden;margin-top:6px">'
        + '<div style="height:100%;width:' + Math.min(100, Math.max(0, pct)) + '%;background:' + cor + ';border-radius:20px"></div></div>';
}

function fgNotaPill(rotulo, nota, cor) {
    return '<div style="flex:1;min-width:110px;border:1px solid ' + cor + '44;background:' + cor + '12;border-radius:10px;padding:8px;text-align:center">'
        + '<div style="font-size:20px;font-weight:800;color:' + cor + '">' + nota + '</div>'
        + '<div style="font-size:9.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.4px;margin-top:2px">' + fgEsc(rotulo) + '</div></div>';
}

function fgTabelaNotas(listaAulas, notas) {
    if (!listaAulas || !listaAulas.length) return '<div style="font-size:11px;color:#94a3b8;padding:6px 2px">Nenhuma aula cadastrada com AV para esta turma.</div>';
    let rows = '';
    listaAulas.forEach(a => {
        const n = notas ? notas[a._id] : undefined;
        const notaVal = (n === undefined || n === null || n === '') ? '—' : fgEsc(String(n).replace('.', ','));
        rows += '<tr style="border-bottom:1px solid #eef2f7">'
            + '<td style="padding:5px 6px;font-size:11px;color:#475569;white-space:nowrap">' + fichaGeralData(a.data) + '</td>'
            + '<td style="padding:5px 6px;font-size:11px;font-weight:600;color:#0f172a">' + fgEsc(a.disciplina || '—') + '</td>'
            + '<td style="padding:5px 6px;font-size:10.5px;color:#64748b">' + fgEsc((a.conteudo || '').substring(0, 42)) + '</td>'
            + '<td style="padding:5px 6px;font-size:11px;font-weight:700;color:#0f172a;text-align:center;min-width:40px">' + notaVal + '</td></tr>';
    });
    return '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="background:#f1f5f9">'
        + '<th style="padding:5px 6px;font-size:9.5px;text-transform:uppercase;color:#64748b;text-align:left;letter-spacing:.3px">Data</th>'
        + '<th style="padding:5px 6px;font-size:9.5px;text-transform:uppercase;color:#64748b;text-align:left;letter-spacing:.3px">Disciplina</th>'
        + '<th style="padding:5px 6px;font-size:9.5px;text-transform:uppercase;color:#64748b;text-align:left;letter-spacing:.3px">Conteudo</th>'
        + '<th style="padding:5px 6px;font-size:9.5px;text-transform:uppercase;color:#64748b;text-align:center;letter-spacing:.3px">Nota</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function fgFOLista(lista, positivo) {
    const cores = positivo ? ['#16a34a', '#dcfce7', '#bbf7d0'] : ['#dc2626', '#fee2e2', '#fecaca'];
    const sig = positivo ? '+' : '-';
    /* Mostra somente os FO com observacao preenchida (os totais acima do
       quadro continuam contando todos os registros). */
    const comObs = (lista || []).filter(fo => String((fo && fo.obs) || '').trim() !== '');
    if (!comObs.length) {
        return '<div style="font-size:10.5px;color:#94a3b8;padding:4px 2px">Nenhum FO ' + sig + ' com observacao registrada.</div>';
    }
    let html = '<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">'
        + comObs.length + ' de ' + (lista || []).length + ' registro(s) com observacao</div>';
    comObs.forEach(fo => {
        html += '<div style="display:flex;justify-content:space-between;gap:8px;background:' + cores[1] + ';border:1px solid ' + cores[2] + ';border-radius:8px;padding:5px 8px;margin-top:4px;font-size:11px">'
            + '<span style="font-weight:700;color:' + cores[0] + ';white-space:nowrap">FO ' + sig + ' ' + fichaGeralData(fo.data) + '</span>'
            + '<span style="color:#475569;flex:1;text-align:right">' + fgEsc(fo.obs) + '</span></div>';
    });
    return html;
}

/* ===== APONTAMENTO POR AULA =====
   Lista, em fonte menor, as aulas da turma com o apontamento do aluno e a
   observacao da justificativa de cada falta/justificativa. */

function fgAptBadge(status) {
    const s = String(status || '');
    if (s === 'Presente') return ['PRESENTE', '#16a34a', '#dcfce7', '#bbf7d0'];
    if (s === 'Falta') return ['FALTA', '#dc2626', '#fee2e2', '#fecaca'];
    if (s === 'Justificada') return ['JUSTIFICADA', '#ca8a04', '#fef3c7', '#fde68a'];
    return ['SEM APONTAMENTO', '#64748b', '#f1f5f9', '#cbd5e1'];
}

/* Chave que liga o apontamento a aula. Prioriza o id do doc em aulas
   (mesmo criterio de verificarInativosPorFalta no admin); registros antigos
   sem id caem para data + disciplina e, sem referencia, ficam soltos. */
function fgAptChave(p) {
    const id = String(p.aulaId || '').trim();
    if (id && id !== 'n/a') return 'id:' + id;
    const data = String(p.dataAula || '').trim();
    const disc = String(p.disciplina || '').trim();
    if (data || disc) return 'ad:' + data + '|' + disc;
    return '';
}

/* Assunto gravado no apontamento ("Nome da aula (10/01/2026)" -> "Nome da aula"). */
function fgAptTexto(p) {
    return String((p && p.aula) || '').replace(/\s*\(\s*\d{1,2}\/\d{1,2}\/\d{4}\s*\)\s*$/, '').trim();
}

function fgAptObservacao(p) {
    const obs = String((p && (p.observacaoJustificativa || p.obs)) || '').trim();
    if (!obs) return '';
    return (p.status === 'Justificada' ? 'Justificativa: ' : 'Obs: ') + obs;
}

function fgAptLinha(data, assunto, disciplina, status, obs, marca) {
    /* b = [rotulo, cor do texto, fundo claro, borda] */
    const b = fgAptBadge(status);
    const obsHtml = obs
        ? '<span style="display:inline-block;background:' + b[2] + ';border:1px solid ' + b[3] + ';border-radius:6px;padding:1px 6px;color:' + b[1] + ';font-weight:600">' + fgEsc(obs) + '</span>'
        : '';
    return '<tr style="border-bottom:1px solid #f1f5f9;vertical-align:top">'
        + '<td style="padding:3px 8px 3px 0;font-size:10px;color:#475569;white-space:nowrap">' + fgEsc(data) + marca + '</td>'
        + '<td style="padding:3px 8px 3px 0;min-width:110px">'
        + '<div style="font-size:10.5px;font-weight:700;color:#0f172a;word-break:break-word">' + fgEsc(assunto) + '</div>'
        + ((disciplina && disciplina !== assunto) ? '<div style="font-size:9px;color:#94a3b8">' + fgEsc(disciplina) + '</div>' : '')
        + '</td>'
        + '<td style="padding:3px 8px 3px 0"><span style="background:' + b[2] + ';color:' + b[1] + ';border:1px solid ' + b[3] + ';border-radius:20px;padding:1px 7px;font-size:8.5px;font-weight:800;white-space:nowrap">' + b[0] + '</span></td>'
        + '<td style="padding:3px 0;font-size:9.5px">' + obsHtml + '</td>'
        + '</tr>';
}

function fgTabelaApontamento(listaAulas, presencas) {
    if (!listaAulas || !listaAulas.length) {
        return '<div style="font-size:10.5px;color:#94a3b8;padding:4px 2px">Nenhuma aula cadastrada para esta turma.</div>';
    }
    /* Agrupa os apontamentos por aula (mantem o mais recente quando a mesma
       aula foi apontada mais de uma vez). */
    const grupos = {};
    const ordem = [];
    (presencas || []).forEach((p, i) => {
        const k = fgAptChave(p);
        const key = k ? k : 'avulso#' + i;
        const ts = String(p.criadoEm || p.justificadaEm || '');
        if (!grupos[key]) {
            grupos[key] = { reg: p, ts: ts, qtd: 1 };
            ordem.push(key);
        } else {
            grupos[key].qtd++;
            if (ts >= grupos[key].ts) { grupos[key].reg = p; grupos[key].ts = ts; }
        }
    });

    const usadas = {};
    let rows = '';
    listaAulas.forEach(a => {
        const key = 'id:' + a._id;
        const alt = 'ad:' + String(a.data || '').trim() + '|' + String(a.disciplina || '').trim();
        const g = grupos[key] || grupos[alt] || null;
        const usadasKey = grupos[key] ? key : (grupos[alt] ? alt : null);
        if (usadasKey) usadas[usadasKey] = true;
        const p = g ? g.reg : null;
        const data = a.data || (p ? p.dataAula : '') || '';
        /* Conteudo / assunto da aula; a disciplina fica na linha de apoio */
        const assunto = String(a.nome || a.conteudo || '').trim()
            || (p ? (fgAptTexto(p) || String(p.disciplina || '').trim()) : '')
            || String(a.disciplina || '').trim()
            || 'Aula sem assunto cadastrado';
        const disciplina = String(a.disciplina || (p ? p.disciplina : '') || '').trim();
        const marca = g && g.qtd > 1 ? ' <span style="color:#94a3b8" title="Aula apontada mais de uma vez">*</span>' : '';
        rows += fgAptLinha(fichaGeralData(data) || '—', assunto, disciplina, p ? p.status : '', p ? fgAptObservacao(p) : '', marca);
    });

    /* Apontamentos de aulas que nao estao mais na lista cadastrada */
    let extras = 0;
    ordem.forEach(key => {
        if (usadas[key]) return;
        const g = grupos[key];
        const p = g.reg;
        const data = p.dataAula || '';
        const assunto = fgAptTexto(p) || String(p.disciplina || '').trim() || 'Aula sem assunto cadastrado';
        const disciplina = String(p.disciplina || '').trim();
        rows += fgAptLinha(fichaGeralData(data) || '—', assunto, disciplina, p.status, fgAptObservacao(p), '');
        extras++;
    });

    const titulo = '<div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px;padding-top:6px;border-top:1px dashed #e2e8f0">'
        + '<i class="fa-solid fa-list-check" style="color:#0ea5e9;font-size:10px"></i>'
        + '<span style="font-size:9.5px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.5px">Aulas e apontamento</span>'
        + (extras ? '<span style="font-size:8.5px;color:#94a3b8">inclui ' + extras + ' apontamento(s) de aula fora da lista atual</span>' : '')
        + '</div>';

    return titulo
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="background:#f8fafc">'
        + '<th style="padding:3px 8px 3px 0;font-size:8.5px;text-transform:uppercase;color:#64748b;text-align:left;letter-spacing:.3px">Data</th>'
        + '<th style="padding:3px 8px 3px 0;font-size:8.5px;text-transform:uppercase;color:#64748b;text-align:left;letter-spacing:.3px">Conteudo / Assunto</th>'
        + '<th style="padding:3px 8px 3px 0;font-size:8.5px;text-transform:uppercase;color:#64748b;text-align:center;letter-spacing:.3px">Apontamento</th>'
        + '<th style="padding:3px 0;font-size:8.5px;text-transform:uppercase;color:#64748b;text-align:left;letter-spacing:.3px">Justificativa</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ===== DADOS E CALCULO DAS AVALIACOES ===== */
function fichaGeralCarregarAulas(projeto, turma) {
    const db = fgDb();
    if (!db) return Promise.resolve({ todas: [], teorica: [], pratica: [] });
    if (fichaGeralAulasCache) return Promise.resolve(fichaGeralAulasCache);
    fichaGeralAulasCache = { todas: [], teorica: [], pratica: [] };
    return db.collection('aulas').get().then(snap => {
        snap.forEach(doc => {
            const a = doc.data();
            a._id = doc.id;
            if (a.projeto === projeto && a.turma === turma) {
                fichaGeralAulasCache.todas.push(a);
                if (a.avTeorica === 'Sim') fichaGeralAulasCache.teorica.push(a);
                if (a.avPratica === 'Sim') fichaGeralAulasCache.pratica.push(a);
            }
        });
        const sorter = (x, y) => (x.data || '').localeCompare(y.data || '');
        fichaGeralAulasCache.todas.sort(sorter);
        fichaGeralAulasCache.teorica.sort(sorter);
        fichaGeralAulasCache.pratica.sort(sorter);
        return fichaGeralAulasCache;
    }).catch(e => {
        console.error('Erro ao carregar aulas para ficha geral:', e);
        return fichaGeralAulasCache;
    });
}

async function fichaGeralDadosAluno(c) {
    const db = fgDb();
    if (!db) return { av: { foPositivos: [], foNegativos: [], notasTeoricas: {}, notasPraticas: {}, mediaTeoricaManual: '', mediaPraticaManual: '', avFinalTeorica: '', avFinalPratica: '' }, presencas: [] };
    let av = { foPositivos: [], foNegativos: [], notasTeoricas: {}, notasPraticas: {}, mediaTeoricaManual: '', mediaPraticaManual: '', avFinalTeorica: '', avFinalPratica: '' };
    let presencas = [];
    try {
        const doc = await db.collection('avaliacoesAlunos').doc(String(c.cpf)).get();
        if (doc.exists) av = Object.assign(av, doc.data() || {});
    } catch (e) { console.error('Erro ao carregar avaliacao:', e); }
    try {
        const snap = await db.collection('presencasAlunos').where('cpf', '==', c.cpf).get();
        snap.forEach(d => presencas.push(d.data()));
    } catch (e) { console.error('Erro ao carregar presencas:', e); }
    return { av: av, presencas: presencas };
}

/* Regra de pontuacao reformada (tambem na Secao de Avaliacao):
   1. O apontamento registra a presenca e NAO gera nota na AV Final.
   2. Comportamento: a cada 10 FO+ soma 1 ponto na AV Final; a cada 5 FO-
      tira 1 ponto (os pontos somam/subtraem da media).
   3. AV Teorica e AV Pratica continuam como medias das notas das aulas (0-10).
   4. AV Final = media (Teorica + Pratica) / 2 com os pontos do
      comportamento, na escala de 0 a 10.
   5. Aprovacao: AV Final >= corte abaixo. */
var FG_AV_CORTE_APROVACAO = 7;

/* Media final de um bloco: valor manual se preenchido; senao a media
   automatica das aulas. */
function fichaGeralMediaFinal(manual, automatica) {
    const v = parseFloat(String(manual == null ? '' : manual).replace(',', '.'));
    if (isNaN(v)) return automatica;
    return Math.round(Math.max(0, Math.min(10, v)) * 10) / 10;
}

function fichaGeralCalcular(c, dados, aulas) {
    const av = dados.av || {};
    // Presenca registrada (apontamento). NAO gera nota na AV Final.
    const totalAulas = (aulas.todas || []).length;
    const presencasTurma = (dados.presencas || []).filter(p => p.turma === c.turma && p.projeto === c.projeto);
    let pres = 0, fal = 0, just = 0;
    presencasTurma.forEach(p => {
        if (p.status === 'Presente') pres++;
        else if (p.status === 'Falta') fal++;
        else if (p.status === 'Justificada') just++;
    });
    const pct = totalAulas ? Math.min(100, Math.round(((pres + just) / totalAulas) * 100)) : 0;
    // AV Comportamento: pontos que somam ou retiram da AV Final.
    const foP = (av.foPositivos || []).length;
    const foN = (av.foNegativos || []).length;
    const pontosComp = Math.floor(foP / 10) - Math.floor(foN / 5);
    // AV Teorica / Pratica (medias automaticas): soma de todas as notas
    // registradas dividida pela quantidade de aulas daquele tipo (aula sem
    // nota conta 0 no denominador).
    let somaT = 0;
    const totalT = (aulas.teorica || []).length;
    (aulas.teorica || []).forEach(a => {
        const n = parseFloat((av.notasTeoricas || {})[a._id]);
        if (!isNaN(n) && n >= 0) somaT += n;
    });
    const notaTeor = totalT ? Math.round((somaT / totalT) * 10) / 10 : 0;
    let somaP = 0;
    const totalP = (aulas.pratica || []).length;
    (aulas.pratica || []).forEach(a => {
        const n = parseFloat((av.notasPraticas || {})[a._id]);
        if (!isNaN(n) && n >= 0) somaP += n;
    });
    const notaPrat = totalP ? Math.round((somaP / totalP) * 10) / 10 : 0;
    // Media teorica e pratica finais: manual se preenchida; senao automatica.
    const mT = fichaGeralMediaFinal(av.mediaTeoricaManual, notaTeor);
    const mP = fichaGeralMediaFinal(av.mediaPraticaManual, notaPrat);
    // AV Final = media (T+P)/2 com os pontos do comportamento, na escala 0-10.
    const mediaFinal = Math.round(((mT + mP) / 2) * 10) / 10;
    const avFinal = Math.max(0, Math.min(10, Math.round((mediaFinal + pontosComp) * 10) / 10));
    // AV Final Teorica/Pratica (provas finais criadas em Criar Avaliacao).
    // FIN = (AV Final Teorica + AV Final Pratica) / 2.
    const avFTnum = parseFloat(String(av.avFinalTeorica == null ? '' : av.avFinalTeorica).replace(',', '.'));
    const avFPnum = parseFloat(String(av.avFinalPratica == null ? '' : av.avFinalPratica).replace(',', '.'));
    const temFT = !isNaN(avFTnum);
    const temFP = !isNaN(avFPnum);
    const temFinal = temFT || temFP;
    let fin = temFinal ? (((temFT ? avFTnum : 0) + (temFP ? avFPnum : 0)) / 2) : 0;
    fin = Math.round(fin * 10) / 10;
    // Nota certificadora: (media (T+P)/2 + FIN) / 2. Sem AV Final Teorica/Pratica, conta como zero (provisoria).
    const notaCertificadora = Math.round(Math.max(0, Math.min(10, (mediaFinal + fin) / 2)) * 10) / 10;
    // Situacao Final: a Nota Certificadora decide a aprovacao quando ha provas finais; senao, a AV Final.
    const notaSituacao = temFinal ? notaCertificadora : avFinal;
    const aprovado = notaSituacao >= FG_AV_CORTE_APROVACAO;
    return {
        av: av,
        presencas: dados.presencas || [],
        presencasTurma: presencasTurma,
        totalAulas: totalAulas, pres: pres, fal: fal, just: just, pct: pct,
        foP: foP, foN: foN, pontosComp: pontosComp,
        notaTeor: notaTeor, notaPrat: notaPrat,
        mT: mT, mP: mP, mediaFinal: mediaFinal,
        avFinal: avFinal, aprovado: aprovado,
        avFinalTeorica: temFT ? Math.round(avFTnum * 10) / 10 : '',
        avFinalPratica: temFP ? Math.round(avFPnum * 10) / 10 : '',
        fin: fin, temFinal: temFinal,
        notaCertificadora: notaCertificadora,
        notaSituacao: notaSituacao
    };
}

/* ===== DADOS DA INSTITUICAO (Configuracoes > Dados da Instituicao) =====
   Le o mesmo documento usado pelo administrativo (configuracoes/instituicao)
   e monta o cabecalho institucional da ficha. */
var fichaGeralInstCache = null;
var fichaGeralInstPromise = null;
var FICHA_GERAL_LOGO_KEY = 'fichaGeralLogo';

async function fichaGeralCarregarInstituicao(forcar) {
    const db = fgDb();
    if (!db) { fichaGeralInstCache = null; return null; }
    if (fichaGeralInstCache && !forcar) return fichaGeralInstCache;
    if (fichaGeralInstPromise && !forcar) return fichaGeralInstPromise;
    fichaGeralInstPromise = db.collection('configuracoes').doc('instituicao').get()
        .then(doc => {
            fichaGeralInstCache = doc.exists ? (doc.data() || null) : null;
            return fichaGeralInstCache;
        })
        .catch(e => {
            console.error('Erro ao carregar os dados da instituicao:', e);
            fichaGeralInstCache = null;
            return null;
        });
    return fichaGeralInstPromise;
}

/* Somente os campos que podem sair impressos. A senha do administrador
   cadastrada no admin nunca e levada para a ficha. */
function fichaGeralDadosInstituicao() {
    const d = fichaGeralInstCache || {};
    const txt = v => String(v == null ? '' : v).trim();
    return {
        razaoSocial: txt(d.razaoSocial),
        nomeFantasia: txt(d.nomeFantasia),
        cnpj: txt(d.cnpj),
        fone: txt(d.fone),
        email: txt(d.email),
        logo: typeof d.logo === 'string' ? d.logo : ''
    };
}

/* O logo cadastrado no admin e um data URL (base64) que pode chegar a 2MB.
   Para nao repetir esse texto dentro do HTML de cada ficha, a folha usa
   <img data-fg-logo> sem src: a tela aplica a imagem e a janela de impressao
   le o logo do sessionStorage. */
function fichaGeralAplicarLogo(raiz) {
    const logo = fichaGeralDadosInstituicao().logo;
    if (!logo) return;
    const base = raiz || (typeof document !== 'undefined' ? document : null);
    if (!base || !base.querySelectorAll) return;
    const imgs = base.querySelectorAll('img[data-fg-logo]');
    for (let i = 0; i < imgs.length; i++) {
        if (imgs[i].getAttribute('data-fg-pronto')) continue;
        imgs[i].setAttribute('data-fg-pronto', '1');
        imgs[i].src = logo;
        imgs[i].style.display = '';
    }
}

function fichaGeralPrepararLogo() {
    try {
        const logo = fichaGeralDadosInstituicao().logo;
        if (logo) sessionStorage.setItem(FICHA_GERAL_LOGO_KEY, logo);
        else sessionStorage.removeItem(FICHA_GERAL_LOGO_KEY);
    } catch (e) { /* sessionStorage indisponivel: a ficha sai sem logo */ }
}

/* Script injetado na janela de impressao: aplica o logo em todas as folhas. */
function fichaGeralScriptLogo() {
    return '<scr' + 'ipt>(function(){try{var l=sessionStorage.getItem("' + FICHA_GERAL_LOGO_KEY + '")||"";'
        + 'if(!l)return;var n=document.querySelectorAll("img[data-fg-logo]");'
        + 'for(var i=0;i<n.length;i++){if(n[i].getAttribute("data-fg-pronto"))continue;'
        + 'n[i].setAttribute("data-fg-pronto","1");n[i].src=l;n[i].style.display="";}}catch(e){}})();</scr' + 'ipt>';
}

function fgChipContato(icone, rotulo, valor) {
    return '<div style="display:flex;align-items:center;gap:5px;background:#fff;border:1px solid #bae6fd;border-radius:20px;padding:4px 10px;max-width:100%">'
        + '<i class="fa-solid ' + icone + '" style="color:#0ea5e9;font-size:9.5px;flex-shrink:0"></i>'
        + '<span style="font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;flex-shrink:0">' + fgEsc(rotulo) + '</span>'
        + '<span style="font-size:11px;font-weight:700;color:#0f172a;word-break:break-word">' + fgEsc(valor) + '</span></div>';
}

/* ---- insignia da patente: resolvida AQUI, e nao em cada tela ----
   A insignia pertence a PATENTE, nao a pessoa. Quem monta a ficha
   entrega o catalogo uma vez, e o nucleo resolve o codigo que a pessoa
   tem. E o que mantem o administrador e o portal do aluno com a mesma
   ficha: nenhum dos dois precisa lembrar de preencher nada, e o que
   entrar no nucleo vale para os dois por construcao. */
var fichaGeralInsignias = {};

function fichaGeralCatalogoRecebido(catalogo) {
    fichaGeralInsignias = {};
    (Array.isArray(catalogo) ? catalogo : []).forEach(function (p) {
        if (!p) return;
        var codigo = String(p.codigo || '').trim();
        var url = String(p.insigniaUrl || '').trim();
        if (codigo && url) fichaGeralInsignias[codigo] = url;
    });
    return fichaGeralInsignias;
}

function fichaGeralInsigniaUrl(codigo) {
    var c = String(codigo || '').trim();
    if (!c) return '';
    return fichaGeralInsignias[c] || '';
}

/* A insignia da patente, do MESMO tamanho da foto 3x4 e a ESQUERDA dela.
   A moldura repete a declaracao da foto -- 86x114 com a mesma borda de
   2px -- para as duas ficarem iguais de olho. A insignia e quadrada
   (recorte 1x1), entao entra com `contain`: preenche o que cabe sem
   esticar nem cortar o desenho. O campo que a tela ja trouxe tem
   precedencia; quando ele nao vem, o nucleo resolve pelo codigo da
   patente que a pessoa tem. */
function fichaGeralInsignia(c) {
    const url = (c && c.patenteInsigniaUrl) || fichaGeralInsigniaUrl(c && c.patente);
    if (!url) return '';
    return '<div style="text-align:center">'
        + '<img src="' + fgEsc(url) + '" alt="Insignia da patente"'
        + ' style="width:86px;height:114px;object-fit:contain;background:#fff;'
        + 'border:2px solid #0ea5e9;border-radius:8px;padding:2px;'
        + '-webkit-print-color-adjust:exact;print-color-adjust:exact">'
        + '<div style="font-size:9px;color:#0ea5e9;margin-top:4px;font-weight:700;'
        + 'letter-spacing:.5px">INSIGNIA</div>'
        + '</div>';
}

/* Cabecalho institucional (espaco superior da ficha): logo, razao social,
   nome fantasia, contatos e o projeto/turma do aluno. */
function fichaGeralCabecalho(inst, c, fotoHtml) {
    const razao = inst.razaoSocial || 'FARN - FORCA AUXILIAR DE RESGATE NACIONAL';
    const chips = (inst.cnpj ? fgChipContato('fa-file-invoice', 'CNPJ', inst.cnpj) : '')
        + (inst.fone ? fgChipContato('fa-phone', 'Telefone', inst.fone) : '')
        + (inst.email ? fgChipContato('fa-envelope', 'E-mail', inst.email) : '');
    const marca = inst.logo
        ? '<img data-fg-logo="1" alt="Logo da instituicao" style="width:54px;height:54px;border-radius:12px;object-fit:contain;background:#fff;border:1px solid #bae6fd;padding:2px;flex-shrink:0;display:none">'
        : '<div style="width:54px;height:54px;border-radius:12px;background:linear-gradient(135deg,#0ea5e9,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;flex-shrink:0"><i class="fa-solid fa-building-columns"></i></div>';

    let linha = '<div style="border-top:1px dashed #7dd3fc;margin-top:10px;padding-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">';
    linha += chips
        ? '<div style="display:flex;gap:6px;flex-wrap:wrap;min-width:0">' + chips + '</div>'
        : '<div style="font-size:10.5px;color:#64748b;font-style:italic">Dados da instituicao nao cadastrados no administrativo.</div>';
    linha += '<div style="font-size:11px;font-weight:800;color:#0284c7;white-space:nowrap">'
        + '<i class="fa-solid fa-layer-group" style="margin-right:4px"></i>Projeto: ' + fgEsc(fichaGeralProjeto || c.projeto || '')
        + '  &bull;  Turma: ' + fgEsc(fichaGeralTurma || c.turma || '') + '</div>';
    linha += '</div>';

    return '<div style="border:1px solid #bae6fd;border-radius:12px;background:linear-gradient(135deg,#f0f9ff,#e0f2fe);padding:12px 16px;margin-bottom:14px">'
        + '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">'
        + marca
        + '<div style="flex:1;min-width:190px">'
        + '<div style="font-size:9.5px;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:1.1px">'
        + '<i class="fa-solid fa-building-columns" style="margin-right:4px"></i>Dados da Instituicao</div>'
        + '<div style="font-size:15px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.3px;margin-top:3px;line-height:1.25">' + fgEsc(razao) + '</div>'
        + (inst.nomeFantasia ? '<div style="font-size:12.5px;font-weight:700;color:#0ea5e9;margin-top:2px">' + fgEsc(inst.nomeFantasia) + '</div>' : '')
        + '<div style="font-size:9.5px;font-weight:700;color:#475569;letter-spacing:.9px;margin-top:5px">FICHA GERAL DO CADASTRO E AVALIACOES</div>'
        + '</div>'
        /* Foto 3x4 e insignia lado a lado, com a insignia na ESQUERDA.
           Quem nao tem patente fica so com a foto, como sempre. */
        + '<div style="flex-shrink:0;display:flex;align-items:flex-start;gap:9px">'
        + fichaGeralInsignia(c)
        + '<div style="text-align:center">' + fotoHtml
        + '<div style="font-size:9px;color:#94a3b8;margin-top:4px;font-weight:700;letter-spacing:.5px">FOTO 3X4</div>'
        + '</div></div>'
        + linha
        + '</div>';
}

/* ===== MONTAGEM DA FICHA ===== */
function fichaGeralFolha(c, calc, fotoSrc, idx, aulas) {
    const aulasRef = aulas || fichaGeralAulasCache || { todas: [], teorica: [], pratica: [] };
    const nome = c.nome || '—';
    const cpf = fgCPF(c.cpf) || '—';
    const mat = c.matricula || fgMatricula(c.cpf) || '—';
    const cursos = Array.isArray(c.cursos) ? c.cursos.filter(Boolean) : (c.cursos ? [c.cursos] : []);
    const st = c.status || '—';
    const stCor = fichaGeralStatusCor(st);
    const fotoHtml = fotoSrc
        ? '<img src="' + fotoSrc + '" alt="Foto 3x4" style="width:86px;height:114px;object-fit:cover;border-radius:8px;border:2px solid #0ea5e9">'
        : '<div id="fg-foto-' + idx + '" style="width:86px;height:114px;border:2px dashed #94a3b8;border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;text-align:center;padding:4px;box-sizing:border-box">Carregando foto...<i class="fa-solid fa-spinner fa-spin" style="margin-left:6px"></i></div>';

    // Secao 1 - Dados Pessoais
    const secoes = [];
    secoes.push(fgSecao('fa-user', 'Dados Pessoais', fgGrid(
        fgCampo('Nome Completo', nome) +
        fgCampo('CPF', cpf) +
        fgCampo('Data de Nascimento', fichaGeralData(c.nascimento)) +
        fgCampo('Idade', c.idade ? c.idade + ' anos' : '') +
        fgCampo('Estado Civil', c.estadoCivil) +
        fgCampo('Genero', c.genero) +
        fgCampo('Nacionalidade', c.nacionalidade) +
        fgCampo('Naturalidade', c.naturalidade) +
        fgCampo('Titulo de Eleitor', c.tituloEleitor) +
        fgCampo('Profissao', c.profissao) +
        fgCampo('Matricula', mat)
    )));

    // Secao 2 - Filiação e Contato
    secoes.push(fgSecao('fa-people-roof', 'Filiacao e Contato', fgGrid(
        fgCampo('Nome da Mae', c.mae) +
        fgCampo('Nome do Pai', c.pai) +
        fgCampo('E-mail', c.email) +
        fgCampo('WhatsApp', c.whatsapp)
    )));

    // Secao 3 - Endereco
    secoes.push(fgSecao('fa-location-dot', 'Endereco', fgGrid(
        fgCampo('Endereco', c.endereco) +
        fgCampo('Numero', c.numero) +
        fgCampo('Bairro', c.bairro) +
        fgCampo('Cidade', c.cidade) +
        fgCampo('Estado', c.estado) +
        fgCampo('Local de Votacao', c.localVotacao)
    )));

    // Secao 4 - Caracteristicas Fisicas e Saude
    secoes.push(fgSecao('fa-heart-pulse', 'Caracteristicas Fisicas e Saude', fgGrid(
        fgCampo('Altura', c.altura ? c.altura + ' m' : '') +
        fgCampo('Peso', c.peso ? c.peso + ' kg' : '') +
        fgCampo('Fator RH', c.fatorRh) +
        fgSimNao('Hipertensao', c.hipertensao) +
        fgSimNao('Diabetes', c.diabetes) +
        fgSimNao('Deficiencia', c.deficiencia) +
        fgSimNao('Tatuagem', c.tatuagem) +
        fgSimNao('Cirurgia', c.cirurgia) +
        fgSimNao('Alcool', c.alcool) +
        fgSimNao('Medicamento', c.medicamento) +
        fgSimNao('Cansaco', c.cansaco)
    )));

    // Secao 5 - Uniforme
    secoes.push(fgSecao('fa-shirt', 'Uniforme', fgGrid(
        fgCampo('Calca', c.calca) +
        fgCampo('Camisa', c.camisa) +
        fgCampo('Calcado', c.calcado)
    )));

    // Secao 6 - Registro
    secoes.push(fgSecao('fa-calendar-check', 'Registro', fgGrid(
        fgCampo('Projeto', c.projeto) +
        fgCampo('Turma', c.turma) +
        fgCampo('Data de Inscricao', fichaGeralData(c.dataInscricao)) +
        fgCampo('Data do Cadastro', fichaGeralData(c.dataCadastro)) +
        fgCampo('Data/Hora Cadastro', c.dataHoraCadastro) +
        fgCampo('Cadastrado Por', c.cadastradoPor) +
        fgCampoDestaque('Cursos', cursos.join(', '))
    )));

    /* ===== Secao - Baixa e Reingresso =====
       Registra TODAS as solicitacoes de baixa e reingresso (historico
       completo) e separa o STATUS POR GUIA (Guia Baixa / Guia Reingresso /
       guias de alunos em que o aluno aparece). O nucleo e compartilhado:
       portal do aluno e administrador leem os mesmos dados. */
    const histBaixa = Array.isArray(c.historicoBaixa) ? c.historicoBaixa : [];
    const histReingresso = Array.isArray(c.historicoReingresso) ? c.historicoReingresso : [];
    const temBaixa = !!(c.pediuBaixa || c.obsBaixa || c.obsReingresso || c.reingressoSolicitado || c.pediuBaixaEm || c.reingressoEm || histBaixa.length || histReingresso.length);
    if (temBaixa) {
        const statusBaixa = c.pediuBaixa
            ? (c.reingressoSolicitado ? 'Aguardando autorizacao de reingresso' : 'Baixa solicitada - acesso bloqueado')
            : 'Regular';
        const obsFull = function (rotulo, valor) {
            const v = (valor === null || valor === undefined || valor === '') ? '—' : String(valor);
            return '<div style="grid-column:1/-1;border:1px solid #fbcfe8;border-radius:8px;padding:6px 9px;background:#fdf2f8;min-width:0">'
                + '<div style="font-size:8.5px;font-weight:700;color:#9d174d;text-transform:uppercase;letter-spacing:.4px">' + fgEsc(rotulo) + '</div>'
                + '<div style="font-size:12px;font-weight:600;color:#0f172a;margin-top:2px;word-break:break-word;white-space:pre-wrap">' + fgEsc(v) + '</div></div>';
        };
        /* Guias de alunos em que o aluno aparece hoje (status por guia) */
        const guiasAtuais = (function () {
            const g = [];
            if (c.pediuBaixa) g.push('Aluno que pediu baixa');
            if (c.status === 'Ativo' && !c.pediuBaixa) g.push('Ativos');
            if (c.status === 'Inativo por Falta') g.push('Inativo por Falta');
            if (c.status === 'Pendente') g.push('Pendentes');
            if (c.status === 'Rejeitado') g.push('Reprovados');
            if (c.status === 'Segunda Chamada') g.push('Segunda Chamada');
            return g.length ? g.join(', ') : (c.status || 'Pre-Inscricao');
        })();
        const statusGuiaBaixa = c.pediuBaixa ? 'Baixa em aberto - na guia "Aluno que pediu baixa"' : 'Baixa resolvida / sem baixa em aberto';
        const statusGuiaReingresso = c.reingressoSolicitado ? 'Reingresso em analise pela administracao' : (c.pediuBaixa ? 'Disponivel para solicitar' : 'Sem reingresso pendente');
        /* Render do historico por guia: Data/hora + Acao + Obs */
        const fgTabelaHist = function (lista, corAcao) {
            if (!lista.length) return '<div style="font-size:11px;color:#94a3b8;padding:4px 2px">Nenhuma solicitacao registrada neste guia.</div>';
            const linhas = lista.map(function (ev) {
                const d = ev && ev.data ? new Date(ev.data).toLocaleString('pt-BR') : '---';
                const fim = ev && ev.dataFim ? ' ate ' + new Date(ev.dataFim).toLocaleString('pt-BR') : '';
                const obs = ev && ev.obs ? String(ev.obs) : '';
                const acao = ev && ev.acao ? fgEsc(String(ev.acao)) : '---';
                return '<div style="display:grid;grid-template-columns:150px 1fr;gap:6px;padding:5px 2px;border-bottom:1px dashed #fbcfe8;font-size:11px;align-items:start">'
                    + '<div style="display:flex;flex-direction:column;min-width:0"><span style="color:' + corAcao + ';font-weight:800;text-transform:uppercase;letter-spacing:.4px">' + acao + '</span><span style="color:#94a3b8;font-size:10px">' + d + fim + '</span></div>'
                    + '<span style="color:#334155;word-break:break-word;white-space:pre-wrap;min-width:0">' + (obs ? fgEsc(obs) : '—') + '</span></div>';
            }).join('');
            return linhas;
        };
        const fgGuiaHist = function (titulo, icone, lista, corBase) {
            return '<div style="grid-column:1/-1;border:1px solid #fbcfe8;border-radius:10px;padding:8px 10px;background:#fdf2f8;min-width:0">'
                + '<div style="display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:800;color:#9d174d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px"><i class="fa-solid ' + icone + '" style="color:' + corBase + '"></i> ' + fgEsc(titulo) + ' <span style="margin-left:auto;background:' + corBase + ';color:#fff;border-radius:20px;padding:1px 8px;font-size:9px;font-weight:800;white-space:nowrap">' + lista.length + ' registro(s)</span></div>'
                + fgTabelaHist(lista, corBase)
                + '</div>';
        };
        secoes.push(fgSecao('fa-power-off', 'Baixa e Reingresso', fgGrid(
            fgCampo('Situacao Atual', statusBaixa) +
            fgCampo('Guias de Alunos', guiasAtuais) +
            fgCampo('Guia Baixa', statusGuiaBaixa) +
            fgCampo('Guia Reingresso', statusGuiaReingresso) +
            fgCampo('Solicitou Baixa em', c.pediuBaixaEm ? new Date(c.pediuBaixaEm).toLocaleString('pt-BR') : '') +
            fgCampo('Reingresso em', c.reingressoEm ? new Date(c.reingressoEm).toLocaleString('pt-BR') : '') +
            obsFull('OBS. BAIXA', c.obsBaixa) +
            obsFull('OBS. REINGRESSO', c.obsReingresso) +
            fgGuiaHist('Guia Baixa - Historico de Solicitacoes', 'fa-power-off', histBaixa, '#be185d') +
            fgGuiaHist('Guia Reingresso - Historico de Solicitacoes', 'fa-rotate', histReingresso, '#9d174d')
        )));
    }

    // Secao 7 - Avaliacoes
    const corPres = calc.pct >= 75 ? '#16a34a' : (calc.pct >= 50 ? '#d97706' : '#dc2626');
    const corComp = calc.pontosComp >= 0 ? '#16a34a' : '#dc2626';
    const corTeor = fichaGeralCorNota(calc.notaTeor);
    const corPrat = fichaGeralCorNota(calc.notaPrat);
    const corMF = fichaGeralCorNota(calc.mediaFinal);
    const corAV = fichaGeralCorNota(calc.avFinal);
    const corAprov = calc.aprovado ? '#16a34a' : '#dc2626';

    let avHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
        + fgNotaPill('Presenca', calc.pct + '%', corPres)
        + fgNotaPill('AV Comportamento', (calc.pontosComp >= 0 ? '+' : '') + calc.pontosComp + ' pts', corComp)
        + fgNotaPill('AV Teorica', fichaGeralNum(calc.notaTeor) + ' / 10,0', corTeor)
        + fgNotaPill('AV Pratica', fichaGeralNum(calc.notaPrat) + ' / 10,0', corPrat)
        + '</div>';

    // Detalhe presenca (apontamento) - informativo, nao gera nota
    avHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-clipboard-user" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">Detalhe - Presenca (Apontamento)</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgCampo('Aulas da Turma', calc.totalAulas + ' aula(s)')
        + fgCampo('Presentes', calc.pres)
        + fgCampo('Faltas', calc.fal)
        + fgCampo('Justificadas', calc.just)
        + fgCampo('Presenca', calc.pct + '%')
        + '</div>'
        + fgBarra(calc.pct, corPres)
        + '<div style="font-size:10px;color:#64748b;margin:-4px 0 6px"><i class="fa-solid fa-circle-info" style="margin-right:4px"></i>O apontamento registra a presenca e NAO gera nota na AV Final.</div>'
        /* Aulas da turma com o apontamento e a observacao da justificativa */
        + fgTabelaApontamento(aulasRef.todas, calc.presencasTurma)
        + '</div>';

    // Detalhe comportamento
    avHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap"><i class="fa-solid fa-face-smile" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">Detalhe - AV Comportamento (FO+ / FO-)</span>'
        + '<span style="font-size:9.5px;color:#94a3b8">a cada 10 FO+ soma 1 ponto; a cada 5 FO- tira 1 ponto da AV Final</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
        + fgCampo('Total FO+', calc.foP)
        + fgCampo('Total FO-', calc.foN)
        + fgCampo('Pontos (10 FO+ = +1 / 5 FO- = -1)', (calc.pontosComp >= 0 ? '+' : '') + calc.pontosComp)
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + fgFOLista(calc.av.foPositivos, true)
        + fgFOLista(calc.av.foNegativos, false)
        + '</div>'
        + '</div>';

    // Detalhe teorica / pratica
    avHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">'
        + '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-book-open" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">AV Teorica - Media ' + fichaGeralNum(calc.notaTeor) + '</span></div>'
        + fgTabelaNotas(aulasRef.teorica, calc.av.notasTeoricas)
        + '</div>'
        + '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-hammer" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">AV Pratica - Media ' + fichaGeralNum(calc.notaPrat) + '</span></div>'
        + fgTabelaNotas(aulasRef.pratica, calc.av.notasPraticas)
        + '</div>'
        + '</div>';

    // AV Final
    avHtml += '<div style="border:1.5px solid #0ea5e9;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#f0f9ff,#e0f2fe)">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><i class="fa-solid fa-medal" style="color:#0ea5e9;font-size:13px"></i>'
        + '<span style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">AV Final</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
        + fgCampo('Media Teorica (manual ou auto)', fichaGeralNum(calc.mT != null ? calc.mT : ''))
        + fgCampo('Media Pratica (manual ou auto)', fichaGeralNum(calc.mP != null ? calc.mP : ''))
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgNotaPill('Media (T+P)/2', fichaGeralNum(calc.mediaFinal), corMF)
        + fgNotaPill('Comportamento', (calc.pontosComp >= 0 ? '+' : '') + calc.pontosComp + ' pts', corComp)
        + fgNotaPill('AV Final', fichaGeralNum(calc.avFinal) + ' / 10,0', corAV)
        + '</div>'
        + '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-size:10px;color:#475569">' + (calc.temFinal
            ? 'SITUACAO FINAL pela Nota Certificadora (corte ' + FG_AV_CORTE_APROVACAO + '): ' + fichaGeralNum(calc.notaSituacao) + ' / 10,0. A AV Final e a media (teorica+pratica)/2 + comportamento.'
            : 'A AV Final e a media (teorica+pratica)/2 com os pontos do comportamento, na escala 0-10. Aprovacao: AV Final >= ' + FG_AV_CORTE_APROVACAO + '.') + '</span>'
        + '<span style="background:' + corAprov + ';color:#fff;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:800">' + (calc.aprovado ? 'APROVADO' : 'NAO APROVADO') + '</span>'
        + '</div>'
        + '<div style="margin-top:10px;border-top:1px dashed #bae6fd;padding-top:8px">'
        + '<div style="font-size:10px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Provas finais (nota certificadora)</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgNotaPill('AV Final Teorica', calc.avFinalTeorica === '' ? '—' : fichaGeralNum(calc.avFinalTeorica) + ' / 10,0', corComp)
        + fgNotaPill('AV Final Pratica', calc.avFinalPratica === '' ? '—' : fichaGeralNum(calc.avFinalPratica) + ' / 10,0', corComp)
        + fgNotaPill('FIN (media das duas)', calc.temFinal ? fichaGeralNum(calc.fin) : '0,0', corMF)
        + fgNotaPill('Nota Certificadora', fichaGeralNum(calc.notaCertificadora) + ' / 10,0' + (calc.temFinal ? '' : ' (provisoria)'), corAV)
        + '</div>'
        + '<div style="font-size:10px;color:#475569;margin-top:6px">FIN = (AV Final Teorica + AV Final Pratica) / 2. Nota Certificadora = (Media (T+P)/2 + FIN) / 2.</div>'
        + '</div>'
        + '</div>';
    secoes.push(fgSecao('fa-clipboard-check', 'Avaliacoes', avHtml));

    // Assinaturas
    const assinaturas = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:22px">'
        + '<div style="text-align:center;border-top:2px solid #94a3b8;padding-top:6px;font-size:11px;font-weight:700;color:#475569">ASSINATURA DO ALUNO</div>'
        + '<div style="text-align:center;border-top:2px solid #94a3b8;padding-top:6px;font-size:11px;font-weight:700;color:#475569">ASSINATURA DA COORDENACAO</div>'
        + '</div>';

    const rodape = '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:12px;font-size:10px;color:#94a3b8">'
        + '<span>Emitido em ' + new Date().toLocaleDateString('pt-BR') + ' as ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - Sistema FARN</span>'
        + '<button class="fg-somente-tela btn-outline btn-sm" onclick="fichaGeralImprimirFicha(' + idx + ')"><i class="fa-solid fa-print"></i> Imprimir</button>'
        + '</div>';

    return '<div class="fg-quebra" style="background:#fff;border-radius:14px;box-shadow:0 12px 34px rgba(2,6,23,.14);border:1px solid #e2e8f0;padding:24px 26px;max-width:800px;margin:0 auto;color:#0f172a;font-family:Inter,Arial,sans-serif">'
        + fichaGeralCabecalho(fichaGeralDadosInstituicao(), c, fotoHtml)
        + '<div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div><div style="font-size:17px;font-weight:800;color:#0f172a">' + fgEsc(nome) + '</div>'
        + '<div style="font-size:11px;color:#475569;margin-top:2px">Matricula: ' + fgEsc(mat) + '  •  CPF: ' + fgEsc(cpf) + '  •  Turma: ' + fgEsc(fichaGeralTurma || c.turma) + '</div></div>'
        + '<span style="background:' + stCor[1] + ';color:' + stCor[0] + ';border:1px solid ' + stCor[2] + ';border-radius:20px;padding:4px 12px;font-size:11px;font-weight:800">' + fgEsc(st) + '</span>'
        + '</div>'
        + secoes.join('')
        + assinaturas
        + rodape
        + '</div>';
}

/* Fim da Ficha Geral - nucleo compartilhado. */
