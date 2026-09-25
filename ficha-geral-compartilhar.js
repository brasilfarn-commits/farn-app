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
    if (!lista || !lista.length) return '<div style="font-size:11px;color:#94a3b8;padding:4px 2px">Nenhum FO ' + (positivo ? '+' : '-') + ' registrado.</div>';
    let html = '';
    lista.forEach(fo => {
        html += '<div style="display:flex;justify-content:space-between;gap:8px;background:' + cores[1] + ';border:1px solid ' + cores[2] + ';border-radius:8px;padding:5px 8px;margin-top:4px;font-size:11px">'
            + '<span style="font-weight:700;color:' + cores[0] + ';white-space:nowrap">' + (positivo ? 'FO +' : 'FO -') + ' ' + fichaGeralData(fo.data) + '</span>'
            + '<span style="color:#475569;flex:1;text-align:right">' + fgEsc(fo.obs || '') + '</span></div>';
    });
    return html;
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
    if (!db) return { av: { foPositivos: [], foNegativos: [], notasTeoricas: {}, notasPraticas: {}, mediaTeoricaManual: '', mediaPraticaManual: '' }, presencas: [] };
    let av = { foPositivos: [], foNegativos: [], notasTeoricas: {}, notasPraticas: {}, mediaTeoricaManual: '', mediaPraticaManual: '' };
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

function fichaGeralCalcular(c, dados, aulas) {
    const av = dados.av || {};
    // AV Apontamento
    const totalAulas = (aulas.todas || []).length;
    let pres = 0, fal = 0, just = 0;
    (dados.presencas || []).forEach(p => {
        if (p.turma !== c.turma || p.projeto !== c.projeto) return;
        if (p.status === 'Presente') pres++;
        else if (p.status === 'Falta') fal++;
        else if (p.status === 'Justificada') just++;
    });
    const pct = totalAulas ? Math.min(100, Math.round(((pres + just) / totalAulas) * 100)) : 0;
    const notaAp = totalAulas ? Math.min(10, Math.round(((pres + just) / totalAulas) * 100) / 10) : 0;
    // AV Comportamento
    const foP = (av.foPositivos || []).length;
    const foN = (av.foNegativos || []).length;
    const pontosComp = Math.floor(foP / 10) - Math.floor(foN / 5);
    // AV Teorica / Pratica (medias automaticas)
    let somaT = 0, qtdT = 0;
    (aulas.teorica || []).forEach(a => {
        const n = parseFloat((av.notasTeoricas || {})[a._id]);
        if (!isNaN(n) && n >= 0) { somaT += n; qtdT++; }
    });
    const notaTeor = qtdT ? Math.round((somaT / qtdT) * 10) / 10 : 0;
    let somaP = 0, qtdP = 0;
    (aulas.pratica || []).forEach(a => {
        const n = parseFloat((av.notasPraticas || {})[a._id]);
        if (!isNaN(n) && n >= 0) { somaP += n; qtdP++; }
    });
    const notaPrat = qtdP ? Math.round((somaP / qtdP) * 10) / 10 : 0;
    // AV Final
    let mT = parseFloat(String(av.mediaTeoricaManual || '').replace(',', '.'));
    let mP = parseFloat(String(av.mediaPraticaManual || '').replace(',', '.'));
    if (isNaN(mT)) mT = 0;
    if (isNaN(mP)) mP = 0;
    const mediaFinal = Math.round(((mT + mP) / 2) * 10) / 10;
    const mediaSala = Math.round(((notaAp + pontosComp + notaTeor + notaPrat) / 4) * 10) / 10;
    const mediaCertificada = Math.round(((mediaFinal + mediaSala) / 2) * 10) / 10;
    return {
        av: av,
        presencas: dados.presencas || [],
        totalAulas: totalAulas, pres: pres, fal: fal, just: just, pct: pct,
        foP: foP, foN: foN, pontosComp: pontosComp,
        notaTeor: notaTeor, notaPrat: notaPrat,
        mT: mT, mP: mP, mediaFinal: mediaFinal, mediaSala: mediaSala,
        mediaCertificada: mediaCertificada, notaAp: notaAp
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
        + '<div style="flex-shrink:0;text-align:center">' + fotoHtml
        + '<div style="font-size:9px;color:#94a3b8;margin-top:4px;font-weight:700;letter-spacing:.5px">FOTO 3X4</div>'
        + '</div></div>'
        + linha
        + '</div>';
}

/* ===== MONTAGEM DA FICHA ===== */
function fichaGeralFolha(c, calc, fotoSrc, idx, aulas) {
    const aulasRef = aulas || fichaGeralAulasCache || { teorica: [], pratica: [] };
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

    // Secao 7 - Avaliacoes
    const corAp = fichaGeralCorNota(calc.notaAp);
    const corComp = calc.pontosComp >= 0 ? '#16a34a' : '#dc2626';
    const corTeor = fichaGeralCorNota(calc.notaTeor);
    const corPrat = fichaGeralCorNota(calc.notaPrat);
    const corMF = fichaGeralCorNota(calc.mediaFinal);
    const corMs = fichaGeralCorNota(calc.mediaSala);
    const corMc = fichaGeralCorNota(calc.mediaCertificada);

    let avHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
        + fgNotaPill('AV Apontamento', fichaGeralNum(calc.notaAp) + ' / 10,0', corAp)
        + fgNotaPill('AV Comportamento', (calc.pontosComp >= 0 ? '+' : '') + calc.pontosComp + ' pts', corComp)
        + fgNotaPill('AV Teorica', fichaGeralNum(calc.notaTeor) + ' / 10,0', corTeor)
        + fgNotaPill('AV Pratica', fichaGeralNum(calc.notaPrat) + ' / 10,0', corPrat)
        + '</div>';

    // Detalhe apontamento
    avHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-clipboard-user" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">Detalhe - AV Apontamento</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgCampo('Aulas da Turma', calc.totalAulas + ' aula(s)')
        + fgCampo('Presentes', calc.pres)
        + fgCampo('Faltas', calc.fal)
        + fgCampo('Justificadas', calc.just)
        + fgCampo('Presenca', calc.pct + '%')
        + '</div>'
        + fgBarra(calc.pct, corAp)
        + '</div>';

    // Detalhe comportamento
    avHtml += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fa-solid fa-face-smile" style="color:#0ea5e9;font-size:12px"></i>'
        + '<span style="font-size:11.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.4px">Detalhe - AV Comportamento (FO+ / FO-)</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
        + fgCampo('Total FO+', calc.foP)
        + fgCampo('Total FO-', calc.foN)
        + fgCampo('Pontos (FO+/10 - FO-/5)', (calc.pontosComp >= 0 ? '+' : '') + calc.pontosComp)
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
        + fgCampo('Media Teorica (manual)', calc.mT ? fichaGeralNum(calc.mT) : '')
        + fgCampo('Media Pratica (manual)', calc.mP ? fichaGeralNum(calc.mP) : '')
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + fgNotaPill('Media Final (T+P)/2', fichaGeralNum(calc.mediaFinal), corMF)
        + fgNotaPill('Media de Sala /4', fichaGeralNum(calc.mediaSala) + ' pts', corMs)
        + fgNotaPill('Media Certificada', fichaGeralNum(calc.mediaCertificada), corMc)
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
