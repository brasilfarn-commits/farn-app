/* ==========================================================================
   VIDEO AULA - NUCLEO COMPARTILHADO (PORTAL DO DOCENTE E PORTAL DO ALUNO)
   --------------------------------------------------------------------------
   Este arquivo e a unica fonte da camada ao vivo da Video Aula: a sessao, a
   presenca (quadro 02), o quadro do docente (03), o quadro de material (04) e
   a lista da turma. E carregado por:
     - portal-docente.html
     - portal-aluno.html
   Um ajuste na tela vale para os dois lados ao mesmo tempo, exatamente como a
   Ficha Geral faz com o administrador.

   ONDE CADA COISA MORA, E POR QUE:

   Firestore            o que precisa sobreviver a dia seguinte: a Video Aula,
                        a midia programada, a avaliacao e as respostas.
   Storage              as imagens e os videos de ate 1MB. Base64 dentro do
                        Firestore estouraria o limite de 1MB do documento -- um
                        JPEG de 1MB vira 1,3MB em base64 e nao entra.
   Realtime Database    o que so importa ENQUANTO a aula acontece: presenca,
                        os quadros da camera, qual material esta liberado. Sao
                        escritas pequenas e frequentes; no Firestore isso
                        seria uma leitura e uma escrita por aluno a cada 2
                        segundos, e o Firestore cobra por leitura.

   O quadro 03 NAO e transmissao de video: e o recorte da camera do docente
   publicado a cada ~2,5 segundos. Video ao vivo de verdade exigiria uma
   conexao ponto a ponto por aluno -- trinta conexoes e o pior caso para quem
   sobe -- e um servidor TURN para atravessar rede com NAT restritivo, que nao
   existe aqui. Com quadros a aula funciona em 3G e em rede escolar com
   filtro, e o custo para o docente e o mesmo nos dois casos.
   ========================================================================== */

/* ============================== configuracao ============================ */

var VAC_CFG = {
    /* Batimento de presenca. 20s contra uma janela de 60s de obsolescencia
       dao tres batidas de folga: quem perde a conexao por meio minuto nao
       some da lista, e quem sai e fecha a aba some em no maximo um minuto. */
    batimentoPresenca: 20000,
    presencaExpirada: 60000,
    /* Publicacao do quadro 03. 2,5s da a sensacao de ao vivo sem encher o
       Realtime Database: ~15KB por quadro, o equivalente a ~6KB/s. */
    quadroMs: 2500,
    /* Acima disso o quadro nao e publicado. Um quadro grande demais trava a
       conexao de todo mundo da aula, e perder um quadro e melhor do que
       derrubar a sala. */
    quadroBytesMax: 300000,
    larguraQuadro: 480,
    /* Ordenacao da lista do quadro 02. O docente primeiro: ele e quem esta
       dando a aula, e a lista e lida por ele. */
    ordemPapel: { docente: 0, aluno: 1 }
};

/* ================================ internos ============================== */

var vacDbCache = null;
var vacStream = null;
var vacVideo = null;
var vacCtx = null;
var vacTimerQuadro = null;
var vacTimerPresenca = null;
var vacUnsubPresenca = null;
var vacUnsubQuadro03 = null;
var vacUnsubQuadro04 = null;
var vacUnsubSessao = null;
var vacIdAtual = '';
var vacEu = null;
var vacPresencas = {};

/* =============================== utilitarios ============================ */

/* Escapa o que vai para HTML. Os dois portais tem o proprio (pdEsc e paEsc),
   mas este arquivo e carregado pelos dois e nao pode depender do nome de
   nenhum deles. */
function vacEsc(v) {
    if (v == null) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* O CPF vira chave no Realtime Database, e chave ali nao aceita . # $ [ ] /
   nem espaco. So os digitos resolvem, e CPF nao tem outro caractere. */
function vacCpf(cpf) {
    return String(cpf == null ? '' : cpf).replace(/\D/g, '');
}

/* Uma inicial e um nome, para o quadro 02 nao mostrar "sem nome" quando o
   cadastro veio incompleto. O admin ve o mesmo quadro, entao a diferenca
   aparece para ele tambem -- e ele e quem pode corrigir o cadastro. */
function vacIniciais(nome) {
    var partes = String(nome || '').trim().split(/\s+/).filter(function (p) { return p.length; });
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function vacDb() {
    if (vacDbCache) return vacDbCache;
    /* O Realtime Database so existe se o portal carregou o
       firebase-database-compat.js. Sem ele a tela da Video Aula abriria e
       nao conectaria, e o docente culparia a camera -- por isso o erro
       precisa ser um erro, e nao um console.log. */
    if (typeof firebase === 'undefined' || !firebase.database) {
        throw new Error('O Realtime Database nao foi carregado neste portal.');
    }
    if (!firebase.apps || !firebase.apps.length) {
        throw new Error('O Firebase nao foi inicializado neste portal.');
    }
    vacDbCache = firebase.database();
    return vacDbCache;
}

/* Caminho dentro da Video Aula. O id vem do Firestore, que nao usa os
   caracteres proibidos -- mas o id tambem pode vir da query string de um
   link, e ai nao ha garantia nenhuma. Trocar por _ e melhor do que o
   Realtime Database recusar a escrita. */
function vacRef(vaId, caminho) {
    if (!vaId) throw new Error('Video Aula sem id.');
    var id = String(vaId).replace(/[.#$\[\]\/]/g, '_');
    return vacDb().ref('videoaulas/' + id + (caminho ? '/' + caminho : ''));
}

/* O estilo entra uma vez, por este arquivo. Ele esta aqui, e nao copiado
   para os dois portais, porque e o mesmo que impede os dois lados de
   divergirem no primeiro ajuste de largura. */
function vacAplicarEstilo() {
    if (document.getElementById('vac-style')) return;
    var css = [
        '.vac-grade{display:grid;gap:12px;grid-template-columns:1fr 1fr}',
        '@media(max-width:900px){.vac-grade{grid-template-columns:1fr}}',
        '.vac-quadro{background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}',
        '.vac-quadro-titulo{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#94a3b8;background:#1e293b;padding:7px 10px;display:flex;align-items:center;gap:6px}',
        '.vac-quadro-corpo{flex:1;min-height:150px;background:#020617;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}',
        '.vac-quadro-corpo img{max-width:100%;max-height:100%;object-fit:contain;display:block}',
        '.vac-quadro-corpo video{width:100%;height:100%;object-fit:cover;display:block;background:#000}',
        '.vac-vazio{color:#475569;font-size:12px;text-align:center;padding:18px;line-height:1.5}',
        '.vac-presenca{display:flex;flex-wrap:wrap;gap:6px;padding:8px;max-height:230px;overflow-y:auto;width:100%;align-content:flex-start}',
        '.vac-pres-item{width:84px;background:#111c31;border:1px solid #1e293b;border-radius:8px;padding:4px;text-align:center;position:relative}',
        '.vac-pres-item.on{border-color:#22c55e}',
        '.vac-pres-foto{width:100%;height:56px;object-fit:cover;border-radius:5px;background:#020617;display:block}',
        '.vac-pres-ini{width:100%;height:56px;border-radius:5px;background:#1e293b;color:#64748b;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800}',
        '.vac-pres-nome{font-size:9.5px;color:#cbd5e1;margin-top:3px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.vac-pres-selo{position:absolute;top:5px;right:5px;width:9px;height:9px;border-radius:50%;background:#475569;border:1px solid #020617}',
        '.vac-pres-selo.on{background:#22c55e}',
        '.vac-pres-doc{position:absolute;bottom:22px;left:5px;font-size:8px;font-weight:800;background:#7c3aed;color:#fff;padding:1px 5px;border-radius:4px;letter-spacing:.3px}',
        '.vac-presenca.vac-pequeno .vac-pres-item{width:62px}',
        '.vac-presenca.vac-pequeno .vac-pres-foto,.vac-presenca.vac-pequeno .vac-pres-ini{height:40px;font-size:14px}',
        '.vac-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'vac-style';
    st.textContent = css;
    document.head.appendChild(st);
}

/* ================================ sessao ================================ */

/* O estado da sessao (agendada / ao vivo / encerrada) fica no Realtime
   Database e nao no Firestore porque e estado de HOJE, nao registro. Um
   "ao vivo" de maracao guardada no Firestore seria mentira: amanha o Firestore
   continuaria dizendo que a aula comeca ao meio-dia de ontem. */
function vacGravarSessao(vaId, patch) {
    var dados = { ts: Date.now() };
    for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) dados[k] = patch[k];
    }
    return vacRef(vaId, 'sessao').update(dados);
}

function vacObservarSessao(vaId, cb) {
    if (vacUnsubSessao) { vacUnsubSessao(); vacUnsubSessao = null; }
    vacUnsubSessao = vacRef(vaId, 'sessao').on('value', function (snap) {
        if (cb) cb(snap.val() || {});
    }, function (e) {
        console.error('Video Aula: falha ao observar a sessao:', e && e.message);
        if (cb) cb({});
    });
    return vacUnsubSessao;
}

/* =============================== presenca =============================== */

/* Entra na Video Aula. `eu` e {cpf, nome, papel}, com papel 'docente' ou
   'aluno'.

   A presenca fica na raiz da sessao e nao no cadastro do aluno: o quadro 02
   precisa saber quem esta NA AULA agora, nao quem esta com o portal aberto.
   Registrar no cadastro exigiria mexer no login dos dois portais -- e mexer
   no login e mexer na coisa que o usuario precisa que nunca falhe. */
function vacEntrar(vaId, eu) {
    var cpf = vacCpf(eu && eu.cpf);
    if (!vaId) return Promise.reject(new Error('Sem Video Aula nao da para entrar.'));
    if (!cpf) return Promise.reject(new Error('Sem CPF nao da para registrar presenca.'));

    vacIdAtual = vaId;
    vacEu = { cpf: cpf, nome: (eu && eu.nome) || '', papel: (eu && eu.papel) || 'aluno' };

    var escrever = function () {
        return vacRef(vaId, 'presenca/' + cpf).set({
            nome: vacEu.nome,
            papel: vacEu.papel,
            ts: Date.now()
        });
    };

    if (vacTimerPresenca) clearInterval(vacTimerPresenca);
    vacTimerPresenca = setInterval(function () {
        /* update e nao set de proposito: um set reescreveria o nome a cada
           batida e dispararia o listener de todos os alunos da sala a cada
           20 segundos, sem motivo. */
        vacRef(vaId, 'presenca/' + cpf).update({ ts: Date.now() }).catch(function (e) {
            console.warn('Video Aula: batimento de presenca falhou:', e && e.message);
        });
    }, VAC_CFG.batimentoPresenca);

    return escrever();
}

/* Sai da Video Aula. A presenca e o que o quadro 02 mostra, entao sair e
   obrigatorio: sem isto, quem fechou a aba continua marcado como online e o
   docente ve a turma inteira numa sala vazia.

   O timer para ANTES da escrita, senao ele sobrevive a saida e recoloca a
   pessoa no quadro 02 poucos segundos depois -- a sala "enche" sozinha. */
function vacSair(vaId, cpf) {
    if (vacTimerPresenca) { clearInterval(vacTimerPresenca); vacTimerPresenca = null; }
    var id = vacCpf(cpf);
    if (!vaId || !id) return Promise.resolve();
    return vacRef(vaId, 'presenca/' + id).remove().catch(function (e) {
        console.warn('Video Aula: nao deu para remover a presenca:', e && e.message);
    });
}

/* cb recebe o mapa bruto de quem mandou batimento, com `online` ja calculado.
   Quem esta offline NAO vem daqui: vem da lista da turma, com online=false.
   O quadro 02 mostra a turma, nao so quem deu as caras. */
function vacObservarPresenca(vaId, cb) {
    if (vacUnsubPresenca) { vacUnsubPresenca(); vacUnsubPresenca = null; }
    vacUnsubPresenca = vacRef(vaId, 'presenca').on('value', function (snap) {
        var mapa = {};
        var agora = Date.now();
        snap.forEach(function (c) {
            var d = c.val() || {};
            mapa[c.key] = {
                cpf: c.key,
                nome: d.nome || '',
                papel: d.papel || 'aluno',
                online: (agora - (d.ts || 0)) <= VAC_CFG.presencaExpirada,
                ts: d.ts || 0
            };
        });
        vacPresencas = mapa;
        if (cb) cb(mapa);
    }, function (e) {
        console.error('Video Aula: falha ao observar a presenca:', e && e.message);
        if (cb) cb({});
    });
    return vacUnsubPresenca;
}

/* Desenha o quadro 02. `roster` e a turma inteira (de vacTurma) e `mapa` e o
   que veio da presenca. Os dois vao juntos de proposito: quem nao mandou
   batimento precisa aparecer mesmo assim, marcado como offline -- e e
   justamente essa a informacao que o docente usa para chamar quem faltou.

   A lista e remontada inteira a cada batida, em vez de mexer so no que
   mudou. Sao 20 segundos e algumas dezenas de divs: o codigo fica reto e
   nao existe caminho em que a tela e a presenca discordem uma da outra. */
function vacDesenharPresenca(el, roster, mapa, opcoes) {
    if (!el) return;
    var quadros = mapa || {};

    /* Quem entrou na sala sem estar no roster (aula antiga, aluno que entrou
       na turma depois do cadastro) entra na lista em vez de sumir: o quadro 02
       e a lista de quem esta NA AULA, e nao uma conferencia de cadastro. */
    var pessoas = (roster || []).map(function (p) {
        return { cpf: p.cpf, nome: p.nome || '' };
    });
    var noRoster = {};
    (roster || []).forEach(function (p) { noRoster[vacCpf(p.cpf)] = true; });
    Object.keys(quadros).forEach(function (cpf) {
        if (!noRoster[cpf]) pessoas.push({ cpf: cpf, nome: quadros[cpf].nome || cpf });
    });

    var linhas = vacOrdenarPresenca(pessoas, quadros).map(function (p) {
        var cpf = vacCpf(p.cpf);
        var aoVivo = quadros[cpf] || null;
        var online = !!(aoVivo && aoVivo.online);
        var foto = aoVivo && aoVivo.img
            ? '<img class="vac-pres-foto" src="' + vacEsc(aoVivo.img) + '" alt="">'
            : '<div class="vac-pres-ini">' + vacEsc(vacIniciais(p.nome)) + '</div>';
        return '<div class="vac-pres-item' + (online ? ' on' : '') + '" title="'
            + vacEsc(p.nome || cpf) + (online ? ' (online)' : ' (offline)') + '">'
            + '<span class="vac-pres-selo' + (online ? ' on' : '') + '"></span>'
            + (aoVivo && aoVivo.papel === 'docente' ? '<span class="vac-pres-doc">DOC</span>' : '')
            + foto
            + '<div class="vac-pres-nome">' + vacEsc(p.nome || 'Sem nome') + '</div>'
            + '</div>';
    });

    el.className = 'vac-presenca' + (opcoes && opcoes.pequeno ? ' vac-pequeno' : '');
    if (!linhas.length) {
        el.innerHTML = '<div class="vac-vazio" style="width:100%">Nenhum aluno nesta turma.</div>';
        return;
    }
    el.innerHTML = linhas.join('');
}

/* ============================== quadro 03 =============================== */

/* Liga a camera. `videoEl` e onde a imagem aparece para quem esta com a camera
   ligada: no docente, o proprio quadro 03; no aluno, a caixa da camera dele.
   Um video escondido em `display:none` seria mais curto, porem o navegador
   deixa de decodificar quadro nele e o recorte sai preto -- por isso o video
   precisa estar visivel, ainda que pequeno. */
function vacAbrirCamera(videoEl) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return Promise.reject(new Error('Este navegador nao da acesso a camera.'));
    }
    vacPararCamera();
    return navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
    }).then(function (stream) {
        vacStream = stream;
        vacVideo = videoEl || null;
        if (vacVideo) {
            vacVideo.srcObject = stream;
            var r = vacVideo.play();
            /* Um autoplay barrado nao impede a camera: o recorte continua
               valendo, so o preview nao roda sozinho. */
            if (r && r.catch) r.catch(function () { });
        }
        return true;
    });
}

function vacPararCamera() {
    if (vacStream) {
        vacStream.getTracks().forEach(function (t) { t.stop(); });
    }
    vacStream = null;
    if (vacVideo) { try { vacVideo.srcObject = null; } catch (e) { } }
    vacVideo = null;
}

function vacCameraLigada() { return !!vacStream; }

/* Recorta um quadro da camera num JPEG pequeno. 480px de largura e qualidade
   0.5 dao ~15KB: grande o bastante para ler um slide a distancia, pequeno o
   bastante para subir pelo 3G de uma escola. */
function vacQuadro() {
    if (!vacVideo || !vacStream) return null;
    var vw = vacVideo.videoWidth;
    var vh = vacVideo.videoHeight;
    if (!vw || !vh) return null;
    var w = Math.min(VAC_CFG.larguraQuadro, vw);
    var h = Math.max(1, Math.round(vh * (w / vw)));
    if (!vacCtx) vacCtx = document.createElement('canvas').getContext('2d');
    vacCtx.canvas.width = w;
    vacCtx.canvas.height = h;
    vacCtx.drawImage(vacVideo, 0, 0, w, h);
    try {
        return vacCtx.canvas.toDataURL('image/jpeg', 0.5);
    } catch (e) {
        return null;
    }
}

/* Publica UM quadro. Devolve o que aconteceu, porque quem chama precisa
   distinguir "nao mandou" de "mandou": o botao do aluno depende disso para
   avisar que a imagem saiu. */
function vacPublicarQuadro(vaId, eu) {
    var cpf = vacCpf(eu && eu.cpf);
    if (!vaId) return Promise.resolve({ ok: false, motivo: 'Sem Video Aula.' });
    if (!cpf) return Promise.resolve({ ok: false, motivo: 'Sem CPF nao da para publicar a imagem.' });
    if (!vacCameraLigada()) return Promise.resolve({ ok: false, motivo: 'A camera esta desligada.' });
    var img = vacQuadro();
    if (!img) return Promise.resolve({ ok: false, motivo: 'A camera ainda nao entregou nenhum quadro.' });
    if (img.length > VAC_CFG.quadroBytesMax) {
        return Promise.resolve({ ok: false, motivo: 'O quadro ficou grande demais e nao foi publicado.' });
    }
    return vacRef(vaId, 'quadro03/' + cpf).set({
        img: img,
        nome: (eu && eu.nome) || '',
        papel: (eu && eu.papel) || 'aluno',
        ts: Date.now()
    }).then(function () {
        return { ok: true };
    }).catch(function (e) {
        console.warn('Video Aula: quadro nao publicado:', e && e.message);
        return { ok: false, motivo: e && e.message ? e.message : 'Falha ao publicar a imagem.' };
    });
}

/* Publica em laco. SO para o docente: um laco por aluno transformaria a aula
   em trinta envios a cada 2,5 segundos, e o Realtime Database nao e um
   servidor de transmissao. O aluno publica o dele uma vez, quando aperta o
   botao de enviar a imagem. */
function vacIniciarQuadro(vaId, eu) {
    vacPararQuadro();
    vacPublicarQuadro(vaId, eu);
    vacTimerQuadro = setInterval(function () {
        vacPublicarQuadro(vaId, eu);
    }, VAC_CFG.quadroMs);
}

function vacPararQuadro() {
    if (vacTimerQuadro) { clearInterval(vacTimerQuadro); vacTimerQuadro = null; }
}

function vacObservarQuadro03(vaId, cb) {
    if (vacUnsubQuadro03) { vacUnsubQuadro03(); vacUnsubQuadro03 = null; }
    vacUnsubQuadro03 = vacRef(vaId, 'quadro03').on('value', function (snap) {
        var mapa = {};
        snap.forEach(function (c) {
            var d = c.val() || {};
            mapa[c.key] = {
                cpf: c.key,
                img: d.img || '',
                nome: d.nome || '',
                papel: d.papel || 'aluno',
                ts: d.ts || 0
            };
        });
        if (cb) cb(mapa);
    }, function (e) {
        console.error('Video Aula: falha ao observar o quadro 03:', e && e.message);
        if (cb) cb({});
    });
    return vacUnsubQuadro03;
}

/* O quadro 03 mostra o docente. Quando o quadro do docente nao chegou, o que
   aparece e o aviso de espera -- e nao a ultima imagem vista. Uma foto
   congelada sem aviso e pior que um vazio honesto: o aluno acha que a aula
   parou quando so faltou o primeiro quadro. */
function vacDesenharQuadroDocente(el, mapa) {
    if (!el) return;
    var d = null;
    Object.keys(mapa || {}).forEach(function (cpf) {
        var q = mapa[cpf];
        if (q.papel === 'docente' && (!d || (q.ts || 0) > (d.ts || 0))) d = q;
    });
    if (!d || !d.img) {
        el.innerHTML = '<div class="vac-vazio">Aguardando a imagem do docente...</div>';
        return;
    }
    el.innerHTML = '<img src="' + vacEsc(d.img) + '" alt="Imagem do docente">';
}

/* ============================== quadro 04 =============================== */

/* O quadro 04 mostra UM item por vez: o docente escolhe na programacao e
   aperta exibir. Por isso o caminho e um objeto e nao uma lista -- a tela tem
   um so lugar de exibicao, e dois itens "liberados ao mesmo tempo" nao teriam
   resposta. Passar null limpa o quadro. */
function vacLiberarMidia(vaId, midia) {
    if (!vaId) return Promise.resolve();
    if (!midia) return vacRef(vaId, 'quadro04').remove();
    return vacRef(vaId, 'quadro04').set({
        midiaId: midia.id || '',
        url: midia.url || '',
        tipo: midia.tipo || '',
        nome: midia.nome || '',
        ts: Date.now()
    });
}

function vacObservarQuadro04(vaId, cb) {
    if (vacUnsubQuadro04) { vacUnsubQuadro04(); vacUnsubQuadro04 = null; }
    vacUnsubQuadro04 = vacRef(vaId, 'quadro04').on('value', function (snap) {
        if (cb) cb(snap.val() || null);
    }, function (e) {
        console.error('Video Aula: falha ao observar o quadro 04:', e && e.message);
        if (cb) cb(null);
    });
    return vacUnsubQuadro04;
}

function vacDesenharQuadroMidia(el, atual) {
    if (!el) return;
    if (!atual || !atual.url) {
        el.innerHTML = '<div class="vac-vazio">O docente ainda nao liberou material.</div>';
        return;
    }
    if (atual.tipo === 'video') {
        el.innerHTML = '<video src="' + vacEsc(atual.url) + '" controls playsinline></video>';
        return;
    }
    el.innerHTML = '<img src="' + vacEsc(atual.url) + '" alt="' + vacEsc(atual.nome || 'Material') + '">';
}

/* ============================ lista da turma ============================ */

/* A turma da Video Aula. Os alunos vem de `candidatos` (status Ativo) ou de
   `cffAlunos`, conforme a origem escolhida pelo admin -- a mesma regra que a
   criacao da Video Aula usou para contar os participantes. Se as duas
   telas usassem criterios diferentes, o quadro 02 mostraria uma turma e a
   Video Aula seria de outra, e ninguem teria como saber qual das duas e a
   certa. */
function vacTurma(projeto, turma, origem) {
    var ehCff = origem === 'cff';
    var col = dbFirestore.collection(ehCff ? 'cffAlunos' : 'candidatos');
    var q = ehCff ? col : col.where('status', '==', 'Ativo');
    return q.get().then(function (snap) {
        var lista = [];
        snap.forEach(function (doc) {
            var d = doc.data() || {};
            if (projeto && d.projeto !== projeto) return;
            if (turma && d.turma !== turma) return;
            if (!d.cpf) return;
            lista.push({ cpf: d.cpf, nome: d.nome || '' });
        });
        return lista;
    });
}

/* Ordena a lista do quadro 02: docente primeiro, depois por nome. Comparar
   nome com localeCompare e o que impede "Silva, Ana" de aparecer depois de
   "Souza, Bruno" so porque a letra S do segundo nome e maior. */
function vacOrdenarPresenca(roster, mapa) {
    var quadros = mapa || {};
    return (roster || []).slice().sort(function (a, b) {
        var pa = quadros[vacCpf(a.cpf)];
        var pb = quadros[vacCpf(b.cpf)];
        var oa = pa && pa.papel === 'docente' ? VAC_CFG.ordemPapel.docente : VAC_CFG.ordemPapel.aluno;
        var ob = pb && pb.papel === 'docente' ? VAC_CFG.ordemPapel.docente : VAC_CFG.ordemPapel.aluno;
        if (oa !== ob) return oa - ob;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
}

/* =============================== saida ================================== */

/* Derruba tudo que a sessao abriu: camera, timers, ouvintes e presenca.
   Precisa ser chamado em TODO caminho de saida -- botao, fechar a tela, sair
   da pagina. Um unico caminho esquecido deixa a pessoa marcada como online
   na aula seguinte, e o quadro 02 passa a mentir sem ninguem perceber. */
function vacEncerrarTudo(vaId, cpf) {
    vacPararCamera();
    vacPararQuadro();
    if (vacTimerPresenca) { clearInterval(vacTimerPresenca); vacTimerPresenca = null; }
    [vacUnsubPresenca, vacUnsubQuadro03, vacUnsubQuadro04, vacUnsubSessao].forEach(function (u) {
        if (u) { try { u(); } catch (e) { } }
    });
    vacUnsubPresenca = null;
    vacUnsubQuadro03 = null;
    vacUnsubQuadro04 = null;
    vacUnsubSessao = null;
    vacPresencas = {};
    vacIdAtual = '';
    vacEu = null;
    return vacSair(vaId, cpf);
}

/* Fechar a aba e o caminho de saida mais comum de todos -- e o mais facil de
   esquecer. A remocao no pagehide e uma cortesia: a rede pode cair antes de
   a escrita sair. Quem garante mesmo e a janela de obsolescencia de 60s do
   quadro 02, e por isso ela existe. */
window.addEventListener('pagehide', function () {
    if (vacIdAtual && vacEu) vacSair(vacIdAtual, vacEu.cpf);
});

/* ===================== a Ficha Geral nao muda aqui ======================= */
/* Este arquivo nao monta Ficha Geral e nao altera a versao dela. A regra
   institucional continua sendo cumprida pelo lado que a exibe: o que o
   Video Aula grava e um evento de turma, nao um campo de pessoa, entao nao
   entra na Ficha Geral do aluno nem na do administrador. */
