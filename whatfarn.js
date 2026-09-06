/* ============================================================
   WHATFARN - Mensagens instantaneas entre Aluno e Administrativo
   Usado em: index.html (admin) e portal-aluno.html
   ============================================================ */

var WF_ADMIN_ID = 'administrativo';
var WF_ADMIN_NOME = 'Administrativo FARN';

var wfState = {
    modo: null,          // 'admin' | 'aluno'
    me: null,            // {id, nome, foto}
    contato: null,       // {id, nome, foto}
    convId: null,
    unsubs: [],
    msgsUnsub: null,
    presencaUnsub: null,
    lista: [],
    listaFiltro: '',
    msgs: [],
    presencaTimer: null,
    typingTimer: null,
    digitando: false,
    marcaLidaTimer: null,
    contatos: [],
    contatosFiltro: '',
    iniciado: false
};

/* ---------- Utilidades ---------- */

function wfEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wfDataVez(ts) {
    var d = new Date(ts);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
}

function wfDataExtenso(ts) {
    var d = new Date(ts);
    var hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return 'Hoje ' + wfDataVez(ts);
    var ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return 'Ontem ' + wfDataVez(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + wfDataVez(ts);
}

function wfDataLista(ts) {
    var d = new Date(ts), hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return wfDataVez(ts);
    var ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return 'Ontem';
    if (d.getFullYear() === hoje.getFullYear()) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/* ---------- Versao do app (APK) e atualizacao ---------- */

var WF_APK_DOC = 'utils/whatfarn-app';
var WF_APK_VERSAO_ATUAL = 7;

function wfVersaoLocal() {
    var v = 0;
    try { v = parseInt(localStorage.getItem('wf_apk_versao') || '0', 10) || 0; } catch (e) {}
    return v;
}

function wfDownloadAPK(nome) {
    if (!dbFirestore) return;
    dbFirestore.collection('utils').doc('whatfarn-app').get().then(function (doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var b64 = d.apk || '';
        nome = nome || d.apkNome || 'WhatFarn.apk';
        if (!b64) { alert('Arquivo do aplicativo indisponivel. Tente novamente.'); return; }
        try {
            var bin = atob(b64);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var blob = new Blob([bytes], { type: 'application/vnd.android.package-archive' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = nome;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        } catch (e) {
            alert('Nao foi possivel baixar o aplicativo.');
            console.error('wf: download apk', e);
        }
    }).catch(function (e) { console.error('wf: download apk', e); alert('Erro ao baixar o aplicativo. Tente novamente.'); });
}

function wfVerificarAtualizacao(auto) {
    if (!dbFirestore) return;
    dbFirestore.collection('utils').doc('whatfarn-app').get().then(function (doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var remota = parseInt(d.versao || '0', 10) || 0;
        var local = wfVersaoLocal();
        if (auto && (!local || local >= remota)) return;
        var responder = function (resp, id) {
            if (resp === 'baixar') {
                wfDownloadAPK(d.apkNome || 'WhatFarn.apk');
            } else if (resp === 'memorizar') {
                var v = parseInt(d.versao || '0', 10) || 0;
                if (v) { try { localStorage.setItem('wf_apk_versao', String(v)); } catch (e) {} }
            }
            var el = document.getElementById(id);
            if (el) el.remove();
        };
        var modal = document.createElement('div');
        modal.className = 'wf-modal';
        modal.id = 'wf-modal-apk-' + Date.now();
        modal.innerHTML = '<div class="wf-modal-box">' +
            '<div class="wf-m-title"><i class="fa-brands fa-whatsapp"></i> WhatFarn</div>' +
            '<div class="wf-m-text">' + (d.msg || 'Nova versao do WhatFarn disponivel!') + '<br>Clique em baixar e instale o arquivo no seu celular.</div>' +
            '<div class="wf-m-btns">' +
            '<button class="wf-m-btn" onclick="wfRespostaAtualizacao(this,\'baixar\')"><i class="fa-solid fa-download"></i> Baixar</button>' +
            '<button class="wf-m-btn later" onclick="wfRespostaAtualizacao(this,\'memorizar\')">Fechar</button>' +
            '</div>' +
            '<div class="wf-m-eps"><b>Como instalar:</b><br>1. Toque em Baixar<br>2. Abra o arquivo baixado<br>3. Se pedir, permita instalar de fontes desconhecidas<br>4. Toque em Instalar</div>' +
            '</div>';
        document.body.appendChild(modal);
    }).catch(function (e) { console.error('wf: verificar atualizacao', e); });
}

window.wfVerificarAtualizacao = wfVerificarAtualizacao;
window.wfDownloadAPK = wfDownloadAPK;

function wfAbrirInstrucoesAdmin() {
    if (typeof wfMostrarInstrucoes === 'function') { wfMostrarInstrucoes(); return; }
    var m = document.getElementById('wf-bv-modal');
    if (m) m.classList.add('show');
    else alert('Para instalar no celular:\n\n1. Baixe o arquivo WhatFarn.apk.\n2. Abra o arquivo baixado.\n3. Se pedir, permita instalar de fontes desconhecidas.\n4. Instale e entre com o mesmo CPF e senha do cadastro.');
}

function wfRespostaAtualizacao(btn, resp) {
    var f = btn.closest('.wf-modal-box');
    if (resp === 'baixar') {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Baixando...';
        wfDownloadAPK();
    }
    if (f) {
        setTimeout(function () {
            var modal = f.parentNode;
            if (modal) modal.remove();
        }, resp === 'baixar' ? 1200 : 0);
    }
}
window.wfRespostaAtualizacao = wfRespostaAtualizacao;

function wfEventual(fn) {
    var unsub = null;
    try { unsub = fn(); } catch (e) { console.error('wf: erro ao registrar listener', e); }
    return unsub || (function () {});
}

function wfConvId(idA, idB) {
    var arr = [String(idA), String(idB)].sort();
    return 'wf_' + arr[0] + '__' + arr[1];
}

function wfPreView(msgTexto, tipo) {
    if (tipo === 'imagem') return 'FOTO';
    return String(msgTexto || '').replace(/\n/g, ' ').slice(0, 60);
}

/* ---------- Identidade do usuario logado ---------- */

function wfQuemSou(modo) {
    if (modo === 'aluno') {
        var sess = wfSessao();
        if (sess && sess.cpf) return { id: String(sess.cpf), nome: sess.nome || 'Aluno', foto: '' };
        if (typeof paUser !== 'undefined' && paUser && paUser.cpf) {
            var foto = wfFotoLocal(paUser.cpf) || '';
            return { id: String(paUser.cpf), nome: paUser.nome || 'Aluno', foto: foto };
        }
    }
    if (modo === 'admin') {
        var nome = (typeof currentUserData !== 'undefined' && currentUserData) ? (currentUserData.nome || WF_ADMIN_NOME) : WF_ADMIN_NOME;
        return { id: WF_ADMIN_ID, nome: WF_ADMIN_NOME, foto: '' };
    }
    return null;
}

function wfSessao() {
    try { return JSON.parse(localStorage.getItem('wf_sessao') || 'null'); } catch (e) { return null; }
}

function wfSetSessao(s) {
    try {
        if (s) localStorage.setItem('wf_sessao', JSON.stringify({ cpf: s.cpf, nome: s.nome || 'Aluno' }));
        else localStorage.removeItem('wf_sessao');
    } catch (e) {}
    wfState.sessao = s || null;
}

function wfLogin(cpf, senha, cb) {
    if (!dbFirestore) { if (cb) cb(false, 'Sistema indisponivel. Verifique sua conexao.'); return; }
    cpf = String(cpf || '').replace(/\D/g, '');
    senha = String(senha == null ? '' : senha);
    if (cpf.length !== 11) { if (cb) cb(false, 'CPF invalido.'); return; }
    if (!senha) { if (cb) cb(false, 'Informe sua senha.'); return; }
    dbFirestore.collection('candidatos').where('cpf', '==', cpf).limit(1).get().then(function (snap) {
        if (snap.empty) { if (cb) cb(false, 'CPF nao encontrado.'); return; }
        var dados = snap.docs[0].data();
        if (dados.senha !== senha) { if (cb) cb(false, 'Senha incorreta.'); return; }
        if (dados.pediuBaixa) { if (cb) cb(false, 'Voce solicitou a baixa do curso. Seu acesso sera restabelecido somente apos autorizacao da administracao.'); return; }
        if (dados.ativo === false) { if (cb) cb(false, 'Seu acesso ainda nao foi liberado. Aguarde aprovacao da administracao.'); return; }
        if (dados.status !== 'Ativo' && dados.status !== 'Inativo por Falta') { if (cb) cb(false, 'Somente alunos com status Ativo ou Inativo por Falta podem acessar.'); return; }
        var sess = { cpf: String(dados.cpf), nome: dados.nome || 'Aluno' };
        wfSetSessao(sess);
        if (cb) cb(true, sess);
    }).catch(function () {
        if (cb) cb(false, 'Erro ao conectar com o servidor. Tente novamente.');
    });
}

function wfLogout() {
    wfSair();
    wfSetSessao(null);
}

function wfFotoLocal(cpf) {
    if (!cpf) return '';
    try { return localStorage.getItem('foto3x4_' + cpf) || localStorage.getItem('farn_photo_' + cpf) || ''; }
    catch (e) { return ''; }
}

/* ---------- CSS injetado (uma vez) ---------- */

function wfCss() {
    if (document.getElementById('wf-styles')) return;
    var st = document.createElement('style');
    st.id = 'wf-styles';
    st.textContent = [
        '.wf-app{--wf-green:#16a34a;--wf-green-d:#15803d;--wf-green-l:#dcfce7;--wf-bg:#efe7db;display:flex;position:relative;overflow:hidden;height:calc(100vh - 118px);border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 8px 30px rgba(0,0,0,.08);background:var(--wf-bg);font-family:"Segoe UI",system-ui,sans-serif}',
        '.wf-col{display:flex;flex-direction:column;min-width:0}',
        '.wf-col-list{width:340px;flex-shrink:0;background:#fff;border-right:1px solid #e2e8f0;position:relative}',
        '.wf-col-chat{flex:1;position:relative;background:var(--wf-bg)}',
        '.wf-app.wf-mobile .wf-col-list{width:100%}.wf-app.wf-mobile .wf-col-chat{display:none}.wf-app.wf-mobile.wf-open .wf-col-list{display:none}.wf-app.wf-mobile.wf-open .wf-col-chat{display:flex}',
        '.wf-list-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid #e2e8f0}',
        '.wf-list-title{font-size:17px;font-weight:800;color:#15803d;display:flex;align-items:center;gap:8px;flex:1}',
        '.wf-list-title i{font-size:20px}',
        '.wf-btn-novo{width:38px;height:38px;border-radius:50%;border:none;background:#dcfce7;color:#15803d;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s}.wf-btn-novo:hover{background:#16a34a;color:#fff}',
        '.wf-search{padding:10px 12px;background:#fff;border-bottom:1px solid #e2e8f0}',
        '.wf-search-box{display:flex;align-items:center;gap:8px;background:#f1f5f9;border-radius:10px;padding:8px 12px;color:#94a3b8}.wf-search-box i{font-size:13px}.wf-search-box input{flex:1;border:none;outline:none;background:transparent;font-size:13px;color:#1e293b}',
        '.wf-convs{flex:1;overflow-y:auto;background:#fff}',
        '.wf-conv{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-bottom:1px solid #f1f5f9;transition:background .15s;position:relative}.wf-conv:hover{background:#f8fafc}.wf-conv.wf-ativo{background:#e8f7ee}',
        '.wf-avatar{width:46px;height:46px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#16a34a,#0ea5e9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;overflow:hidden}.wf-avatar img{width:100%;height:100%;object-fit:cover}',
        '.wf-avatar.wf-a2{background:linear-gradient(135deg,#0ea5e9,#6366f1)}',
        '.wf-conv-main{flex:1;min-width:0}',
        '.wf-conv-top{display:flex;align-items:center;gap:6px}.wf-conv-nome{font-size:14px;font-weight:600;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-conv-hora{font-size:11px;color:#94a3b8;flex-shrink:0}',
        '.wf-conv-bot{display:flex;align-items:center;gap:6px;margin-top:2px}.wf-conv-pv{font-size:12px;color:#94a3b8;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-conv-pv.wf-nao-lida{color:#1e293b;font-weight:600}.wf-conv-pv i{font-size:10px;color:#64748b;margin-right:3px}',
        '.wf-badge{min-width:20px;height:20px;border-radius:10px;background:#16a34a;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 6px;flex-shrink:0}',
        '.wf-conv-del{width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:#cbd5e1;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0;transition:.15s}.wf-conv:hover .wf-conv-del{opacity:1}.wf-conv-del:hover{background:#fee2e2;color:#dc2626}',
        '.wf-vazio{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px 20px;text-align:center;color:#94a3b8;font-size:13px}',
        '.wf-chat-head{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border-bottom:1px solid #e2e8f0;position:relative;z-index:2}',
        '.wf-back{display:none;width:36px;height:36px;border-radius:50%;border:none;background:#f1f5f9;color:#334155;cursor:pointer;align-items:center;justify-content:center;font-size:15px}.wf-app.wf-mobile .wf-back{display:flex}',
        '.wf-chat-info{flex:1;min-width:0}.wf-chat-nome{font-size:15px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-chat-status{font-size:12px;color:#16a34a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-chat-status.wf-cinza{color:#94a3b8}',
        '.wf-msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:3px;background:var(--wf-bg);background-image:radial-gradient(rgba(22,163,74,.05) 1px,transparent 1px);background-size:22px 22px}',
        '.wf-msg-wrap{display:flex;align-items:flex-end;gap:6px;max-width:80%;animation:wfSlide .18s ease}.wf-msg-wrap.me{align-self:flex-end;flex-direction:row-reverse}.wf-msg-wrap.other{align-self:flex-start}',
        '.wf-msg{border-radius:13px;padding:7px 11px;font-size:13.5px;line-height:1.45;position:relative;box-shadow:0 1px 1px rgba(0,0,0,.05)}',
        '.wf-msg.me{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-bottom-right-radius:3px}.wf-msg.other{background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-bottom-left-radius:3px}',
        '.wf-msg-text{white-space:pre-wrap;word-wrap:break-word}.wf-msg-me{display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-top:3px;font-size:10.5px}',
        '.wf-msg-me.time-me{color:rgba(255,255,255,.75)}.wf-msg.other .wf-msg-me{color:#94a3b8}',
        '.wf-msg-me .fa-check{color:rgba(255,255,255,.75)}.wf-msg-me .fa-check-double{color:#dbeafe}.wf-msg-me .wf-lido .fa-check-double{color:#93c5fd}.wf-msg.other .wf-msg-me .fa-check-double{color:#2563eb}',
        '.wf-msg-img{max-width:240px;border-radius:11px;display:block;cursor:pointer;margin-bottom:3px}.wf-msg .wf-msg-img{width:100%}',
        '.wf-msg-temp{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;text-align:center}',
        '.wf-msg-temp i{font-size:30px}.wf-msg-temp span{font-size:11.5px;opacity:.9}',
        '.wf-data-sep{align-self:center;background:rgba(255,255,255,.92);color:#94a3b8;font-size:11px;padding:4px 14px;border-radius:8px;margin:8px 0;box-shadow:0 1px 2px rgba(0,0,0,.05)}',
        '.wf-composer{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-top:1px solid #e2e8f0}',
        '.wf-ic-btn{width:40px;height:40px;border-radius:50%;border:none;background:none;color:#15803d;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;transition:.15s}.wf-ic-btn:hover{background:#dcfce7}',
        '.wf-input{flex:1;padding:11px 14px;background:#f1f5f9;border:1px solid transparent;border-radius:22px;outline:none;font-size:13.5px;color:#1e293b;transition:.2s}.wf-input:focus{border-color:#16a34a;background:#fff}',
        '.wf-send{width:44px;height:44px;border-radius:50%;border:none;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;box-shadow:0 4px 12px rgba(22,163,74,.35)}.wf-send:hover{transform:scale(1.06)}',
        '.wf-lightbox{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}.wf-lightbox img{max-width:94vw;max-height:90vh;border-radius:10px;box-shadow:0 10px 50px rgba(0,0,0,.5)}',
        '.wf-contatos{position:absolute;inset:0;background:#fff;z-index:5;display:flex;flex-direction:column;animation:wfSlide .2s ease}',
        '.wf-contatos-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid #e2e8f0}.wf-contatos-head strong{flex:1;color:#1e293b;font-size:15px}.wf-contatos-head button{border:none;background:#f1f5f9;width:34px;height:34px;border-radius:50%;cursor:pointer;color:#334155;font-size:14px}',
        '.wf-contatos-list{flex:1;overflow-y:auto}',
        '.wf-contato{display:flex;align-items:center;gap:12px;padding:11px 16px;cursor:pointer;border-bottom:1px solid #f1f5f9;transition:background .15s}.wf-contato:hover{background:#f8fafc}.wf-contato-info{flex:1;min-width:0}.wf-contato-nome{font-size:14px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-contato-sub{font-size:12px;color:#94a3b8}',
        '@keyframes wfSlide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
        '.wf-loading{display:flex;align-items:center;justify-content:center;padding:40px;color:#94a3b8;font-size:13px}',
        '.wf-col-chat.wf-vazio-apenas{background:var(--wf-bg)}',
        '.wf-app.wf-mobile .wf-conv-del{opacity:1;color:#94a3b8}',
        '@media(max-width:920px){.wf-app{height:calc(100dvh - 140px)}}',
        '@media(max-width:600px){.wf-app{height:calc(100dvh - 120px)}.wf-msg-wrap{max-width:88%}}',
        '.wf-modal{position:fixed;inset:0;z-index:2147483100;background:rgba(8,15,32,.6);display:flex;align-items:flex-end;justify-content:center;padding:0;font-family:"Segoe UI",system-ui,sans-serif}',
        '.wf-modal-box{width:100%;max-width:440px;background:#fff;border-radius:18px 18px 0 0;padding:22px 20px 24px;box-shadow:0 -10px 50px rgba(0,0,0,.3);animation:wfSheet .22s ease}',
        '@keyframes wfSheet{from{transform:translateY(100%)}to{transform:none}}',
        '.wf-modal-box .wf-m-title{font-size:17px;font-weight:800;color:#14532d;display:flex;align-items:center;gap:8px;margin-bottom:8px}',
        '.wf-modal-box .wf-m-text{font-size:13.5px;color:#334155;line-height:1.55;margin-bottom:16px}',
        '.wf-modal-box .wf-m-btns{display:flex;gap:10px;flex-wrap:wrap}',
        '.wf-modal-box .wf-m-btn{flex:1;min-width:120px;border:none;border-radius:11px;padding:12px;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;background:#16a34a;color:#fff}',
        '.wf-modal-box .wf-m-btn.later{background:#eef2f7;color:#334155}',
        '.wf-modal-box .wf-m-btn.small{background:#fff;color:#16a34a;border:1px solid #16a34a}',
        '.wf-modal-box .wf-m-eps{font-size:12px;color:#64748b;margin-top:14px;line-height:1.7;border-top:1px solid #eef2f7;padding-top:12px}',
        '.wf-modal-box .wf-m-eps b{color:#334155}',
        '@media(min-width:600px){.wf-modal{align-items:center}.wf-modal-box{border-radius:18px}.wf-modal-box .wf-m-eps{display:none}}'
    ].join('');
    document.head.appendChild(st);
}

/* ---------- Montagem da interface ---------- */

function wfHTML() {
    var lista = '';
    if (wfState.modo === 'admin') {
        lista += '<div class="wf-list-head"><div class="wf-list-title"><i class="fa-brands fa-whatsapp"></i> WhatFarn</div>' +
            '<button class="wf-btn-novo" onclick="wfMostrarContatos()" title="Nova conversa"><i class="fa-solid fa-square-plus"></i></button></div>' +
            '<div class="wf-search"><div class="wf-search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="wf-busca" type="text" placeholder="Pesquisar conversas ou contatos..." oninput="wfRenderLista()"></div></div>' +
            '<div class="wf-convs" id="wf-convs"></div>' +
            '<div class="wf-contatos" id="wf-contatos" style="display:none">' +
            '<div class="wf-contatos-head"><strong>Novo Chat</strong><button onclick="wfFecharContatos()"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="wf-search"><div class="wf-search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="wf-contatos-busca" type="text" placeholder="Pesquisar aluno com status Ativo..." oninput="wfFiltrarContatos()"></div></div>' +
            '<div class="wf-contatos-list" id="wf-contatos-list"></div></div>';
    } else {
        lista += '<div class="wf-list-head"><div class="wf-list-title"><i class="fa-brands fa-whatsapp"></i> WhatFarn</div>' +
            '<button class="wf-btn-novo" onclick="wfMostrarContatos()" title="Nova conversa"><i class="fa-solid fa-square-plus"></i></button></div>' +
            '<div class="wf-search"><div class="wf-search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="wf-busca" type="text" placeholder="Pesquisar conversas ou contatos..." oninput="wfRenderLista()"></div></div>' +
            '<div class="wf-convs" id="wf-convs"></div>' +
            '<div class="wf-contatos" id="wf-contatos" style="display:none">' +
            '<div class="wf-contatos-head"><strong>Novo Chat</strong><button onclick="wfFecharContatos()"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="wf-search"><div class="wf-search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="wf-contatos-busca" type="text" placeholder="Pesquisar aluno com status Ativo..." oninput="wfFiltrarContatos()"></div></div>' +
            '<div class="wf-contatos-list" id="wf-contatos-list"></div></div>';
    }
    var chat = '<div class="wf-chat-head">' +
        '<button class="wf-back" onclick="wfVoltarLista()" title="Voltar"><i class="fa-solid fa-arrow-left"></i></button>' +
        '<div class="wf-avatar wf-a2" id="wf-chat-avatar"><i class="fa-solid fa-headset"></i></div>' +
        '<div class="wf-chat-info"><div class="wf-chat-nome" id="wf-chat-nome">Selecione uma conversa</div><div class="wf-chat-status wf-cinza" id="wf-chat-status">&nbsp;</div></div>' +
        '</div>' +
        '<div class="wf-msgs" id="wf-msgs"><div class="wf-vazio"><i class="fa-solid fa-comments" style="font-size:34px;opacity:.4"></i><p>Selecione uma conversa ao lado para começar a conversar.</p></div></div>' +
        '<div class="wf-composer" id="wf-composer">' +
        '<label class="wf-ic-btn" title="Anexar imagem (galeria)"><i class="fa-solid fa-paperclip"></i><input type="file" accept="image/*" style="display:none" onchange="wfAnexarPermanente(this)"></label>' +
        '<label class="wf-ic-btn" title="Tirar foto temporaria (camera)"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" capture="environment" style="display:none" onchange="wfAnexarTemporaria(this)"></label>' +
        '<input class="wf-input" id="wf-input" type="text" placeholder="Digite uma mensagem..." oninput="wfDigitando()" onkeydown="if(event.key===\'Enter\')wfEnviar()">' +
        '<button class="wf-send" onclick="wfEnviar()" type="button" title="Enviar"><i class="fa-solid fa-paper-plane"></i></button>' +
        '</div>';
    var html = '<div class="wf-col wf-col-list">' + lista + '</div>' +
        '<div class="wf-col wf-col-chat" id="wf-col-chat">' + chat + '</div>';
    var root = document.getElementById('wf-root');
    if (!root) return;
    root.className = 'wf-app';
    root.innerHTML = html;
    root.classList.toggle('wf-mobile', wfState.modo === 'aluno' || window.innerWidth <= 920);
}

/* ---------- Gerenciamento de listeners / estado ---------- */

function wfLimpar() {
    (wfState.unsubs || []).forEach(function (u) { try { if (u) u(); } catch (e) {} });
    wfState.unsubs = [];
    if (wfState.msgsUnsub) { try { wfState.msgsUnsub(); } catch (e) {} wfState.msgsUnsub = null; }
    if (wfState.presencaUnsub) { try { wfState.presencaUnsub(); } catch (e) {} wfState.presencaUnsub = null; }
    if (wfState.presencaTimer) { clearInterval(wfState.presencaTimer); wfState.presencaTimer = null; }
    if (wfState.typingTimer) { clearTimeout(wfState.typingTimer); wfState.typingTimer = null; }
}

function wfSair() {
    if (!wfState.me) return;
    wfPresencaEnviar(false, false);
    wfLimpar();
    wfState.iniciado = false;
}

function wfPresencaEnviar(online, digitando) {
    if (!wfState.me || !dbFirestore) return;
    var data = { online: !!online, ultimaVez: Date.now() };
    if (typeof digitando === 'boolean') { data.digitando = digitando; data.digitandoEm = Date.now(); }
    try { dbFirestore.collection('whatfarnPresenca').doc(wfState.me.id).set(data, { merge: true }); } catch (e) {}
}

/* ---------- Presenca do contato ---------- */

function wfLigarPresencaContato() {
    if (wfState.presencaUnsub) { try { wfState.presencaUnsub(); } catch (e) {} wfState.presencaUnsub = null; }
    if (!wfState.contato || !dbFirestore) return;
    wfState.presencaUnsub = wfEventual(function () {
        return dbFirestore.collection('whatfarnPresenca').doc(wfState.contato.id).onSnapshot(function (doc) {
            var d = doc.exists ? doc.data() : {};
            wfRenderStatusContato(d);
        });
    });
}

function wfRenderStatusContato(d) {
    var el = document.getElementById('wf-chat-status');
    if (!el) return;
    if (d && d.digitando && d.digitandoEm && (Date.now() - d.digitandoEm < 6000)) {
        el.classList.remove('wf-cinza');
        el.textContent = 'Digitando...';
        return;
    }
    if (d && d.online) {
        el.classList.remove('wf-cinza');
        el.textContent = 'Online';
        return;
    }
    el.classList.add('wf-cinza');
    var last = d && d.ultimaVez ? d.ultimaVez : 0;
    el.textContent = last ? 'Visto por último ' + wfDataExtenso(last) : 'Offline';
}

/* ---------- Lista de conversas ---------- */

function wfCarregarConversas() {
    if (!dbFirestore) return;
    var unsub = wfEventual(function () {
        return dbFirestore.collection('whatfarnConversas').onSnapshot(function (snap) {
            wfState.lista = [];
            snap.forEach(function (doc) {
                var d = doc.data();
                if (d.membros && d.membros.indexOf(wfState.me.id) !== -1) {
                    wfState.lista.push({ id: doc.id, data: d });
                }
            });
            wfState.lista.sort(function (a, b) { return (b.data.ultimaHora || 0) - (a.data.ultimaHora || 0); });
            wfRenderLista();
        });
    });
    wfState.unsubs.push(unsub);
}

function wfRenderLista() {
    var q = ((document.getElementById('wf-busca')) ? document.getElementById('wf-busca').value : '').trim().toLowerCase();
    var el = document.getElementById('wf-convs');
    if (!el) return;
    var itens = wfState.lista.filter(function (c) {
        if (!q) return true;
        var p = c.data.participantes || {};
        for (var k in p) {
            if (k === wfState.me.id) continue;
            var n = (p[k].nome || '').toLowerCase();
            if (n.indexOf(q) !== -1 || String(k).indexOf(q) !== -1) return true;
        }
        return false;
    });
    var html = '';
    if (!itens.length) {
        html += '<div class="wf-vazio"><i class="fa-solid fa-comment-slash" style="font-size:30px;opacity:.4"></i><p>' + (wfState.modo === 'admin' ? 'Nenhuma conversa. Clique no + para iniciar um novo chat com um aluno ativo.' : 'Nenhuma conversa ainda. Inicie um chat com o Administrativo.') + '</p></div>';
    }
    itens.forEach(function (c) {
        var p = c.data.participantes || {};
        var outro = null;
        for (var k in p) if (k !== wfState.me.id) outro = p[k];
        var nome = outro ? (outro.nome || k) : 'Contato';
        var foto = outro ? (outro.foto || '') : '';
        var pvC = wfState.me.id === WF_ADMIN_ID ? c.data.naoLidasAdmin : c.data.naoLidasAluno;
        var naoLidas = pvC || 0;
        var pvM = c.data.ultimaMsg || '';
        var isImg = pvM === 'FOTO';
        var hora = c.data.ultimaHora ? wfDataLista(c.data.ultimaHora) : '';
        var ativo = wfState.convId === c.id ? ' wf-ativo' : '';
        var ini = (nome || '?').trim().charAt(0).toUpperCase();
        var avatar = foto
            ? '<img src="' + wfEsc(foto) + '" alt="">'
            : '<i class="fa-solid fa-user"></i>';
        var lidaIcon = '';
        if (c.data.ultimaRemetente === wfState.me.id && isImg) lidaIcon = '<i class="fa-solid fa-camera"></i> ';
        else if (c.data.ultimaRemetente === wfState.me.id && pvM) lidaIcon = '<i class="fa-solid fa-check-double"></i> ';
        html += '<div class="wf-conv' + ativo + '" onclick="wfSelecionarConversa(\'' + wfEsc(c.id) + '\')">' +
            '<div class="wf-avatar">' + avatar + '</div>' +
            '<div class="wf-conv-main"><div class="wf-conv-top"><span class="wf-conv-nome">' + wfEsc(nome) + '</span><span class="wf-conv-hora">' + wfEsc(hora) + '</span></div>' +
            '<div class="wf-conv-bot"><span class="wf-conv-pv' + (naoLidas ? ' wf-nao-lida' : '') + '">' + lidaIcon + wfEsc(pvM) + '</span>' +
            (naoLidas ? '<span class="wf-badge">' + naoLidas + '</span>' : '') + '</div></div>' +
            '<button class="wf-conv-del" title="Excluir conversa" onclick="event.stopPropagation();wfExcluirConversa(\'' + wfEsc(c.id) + '\')"><i class="fa-solid fa-trash-can"></i></button></div>';
    });
    el.innerHTML = html;
}

/* ---------- Contatos (admin) ---------- */

function wfMostrarContatos() {
    var c = document.getElementById('wf-contatos');
    if (c) { c.style.display = 'flex'; if (c._loaded) { return; } c._loaded = true; }
    var list = document.getElementById('wf-contatos-list');
    if (list) list.innerHTML = '<div class="wf-loading"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i> Carregando contatos...</div>';
    if (!dbFirestore) return;

    function montar(adminFix) {
        if (wfState.modo === 'aluno' && adminFix) {
            wfState.contatos = [{ id: WF_ADMIN_ID, nome: WF_ADMIN_NOME, foto: '', sub: 'Administrativo FARN' }];
        }
        wfFiltrarContatos();
    }

    if (wfState.modo === 'aluno' && wfState.contatos && wfState.contatos.length) {
        if (!wfState.contatos.some(function (x) { return x.id === WF_ADMIN_ID; })) {
            wfState.contatos.unshift({ id: WF_ADMIN_ID, nome: WF_ADMIN_NOME, foto: '', sub: 'Administrativo FARN' });
        }
        wfFiltrarContatos();
        return;
    }

    dbFirestore.collection('candidatos').get().then(function (snap) {
        if (wfState.modo === 'aluno') wfState.contatos = [{ id: WF_ADMIN_ID, nome: WF_ADMIN_NOME, foto: '', sub: 'Administrativo FARN' }];
        else wfState.contatos = [];
        snap.forEach(function (doc) {
            var d = doc.data();
            if (!d || !d.cpf) return;
            if (d.status !== 'Ativo') return;
            if (d.tipoPessoa && d.tipoPessoa === 'F') return;
            if (String(d.cpf) === wfState.me.id) return;
            var foto = d.photoDataUrl || wfFotoLocal(String(d.cpf)) || '';
            var turma = d.turma || d.projeto || '';
            wfState.contatos.push({ id: String(d.cpf), nome: d.nome || 'Aluno', foto: foto, sub: turma || 'Aluno ativo' });
        });
        montar(false);
    }).catch(function () {
        montar(true);
        if (list) list.innerHTML = '<div class="wf-vazio"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar contatos.</p></div>';
    });
}

function wfFecharContatos() {
    var c = document.getElementById('wf-contatos');
    if (c) c.style.display = 'none';
}

function wfFiltrarContatos() {
    var q = ((document.getElementById('wf-contatos-busca')) ? document.getElementById('wf-contatos-busca').value : '').trim().toLowerCase();
    var html = '';
    var arr = wfState.contatos.filter(function (c) {
        if (!q) return true;
        return c.nome.toLowerCase().indexOf(q) !== -1 || c.id.indexOf(q) !== -1;
    });
    if (!arr.length) html = '<div class="wf-vazio"><i class="fa-solid fa-user-slash" style="font-size:28px;opacity:.4"></i><p>Nenhum contato encontrado. Lembre-se: apenas alunos com status Ativo aparecem aqui.</p></div>';
    arr.forEach(function (c) {
        var ini = (c.nome || '?').trim().charAt(0).toUpperCase();
        html += '<div class="wf-contato" onclick="wfSelecionarContato(\'' + wfEsc(c.id) + '\',\'' + wfEsc(c.nome) + '\',\'' + wfEsc(c.foto) + '\')">' +
            '<div class="wf-avatar wf-a2">' + (c.foto ? '<img src="' + wfEsc(c.foto) + '" alt="">' : '<i class="fa-solid fa-user-graduate"></i>') + '</div>' +
            '<div class="wf-contato-info"><div class="wf-contato-nome">' + wfEsc(c.nome) + '</div><div class="wf-contato-sub">' + wfEsc(c.sub) + '</div></div></div>';
    });
    var list = document.getElementById('wf-contatos-list');
    if (list) list.innerHTML = html;
}

function wfSelecionarContato(id, nome, foto) {
    wfFecharContatos();
    wfSelecionarConversa(wfConvId(wfState.me.id, id), nome, foto);
}

/* ---------- Conversa ---------- */

function wfSelecionarConversa(convId, nomeOverride, fotoOverride) {
    if (!dbFirestore) return;
    var conv = wfState.lista.find(function (c) { return c.id === convId; });
    var outro = { id: null, nome: nomeOverride || null, foto: fotoOverride || null };
    if (conv) {
        var p = conv.data.participantes || {};
        for (var k in p) if (k !== wfState.me.id) { outro.id = k; if (!outro.nome) outro.nome = p[k].nome; if (outro.foto === null) outro.foto = p[k].foto || ''; }
    } else if (!outro.nome) {
        var parts = convId.replace(/^wf_/, '').split('__');
        outro.id = parts[0] === wfState.me.id ? parts[1] : parts[0];
        outro.nome = outro.id === WF_ADMIN_ID ? WF_ADMIN_NOME : (outro.nome || outro.id);
    }
    if (!outro.nome) outro.nome = outro.id || 'Contato';
    wfState.contato = { id: outro.id, nome: outro.nome, foto: outro.foto || '' };
    wfState.convId = convId;

    var updP = {};
    updP['participantes.' + wfState.me.id] = { nome: wfState.me.nome || 'Voce', foto: wfState.me.foto || '' };
    updP['participantes.' + wfState.contato.id] = { nome: wfState.contato.nome, foto: wfState.contato.foto || '' };
    dbFirestore.collection('whatfarnConversas').doc(convId).set(updP, { merge: true }).catch(function () {});

    document.getElementById('wf-col-chat').classList.add('wf-open-chat');
    var app = document.getElementById('wf-root');
    if (app) app.classList.add('wf-open');

    var elNome = document.getElementById('wf-chat-nome');
    if (elNome) elNome.textContent = wfState.contato.nome;
    var elAv = document.getElementById('wf-chat-avatar');
    if (elAv) {
        elAv.innerHTML = wfState.contato.foto
            ? '<img src="' + wfEsc(wfState.contato.foto) + '" alt="">'
            : '<i class="fa-solid fa-headset"></i>';
    }

    wfLigarPresencaContato();

    if (conv) {
        var campo = wfState.me.id === WF_ADMIN_ID ? 'naoLidasAdmin' : 'naoLidasAluno';
        var upd = {};
        upd[campo] = 0;
        dbFirestore.collection('whatfarnConversas').doc(convId).update(upd).catch(function () {});
        wfCarregarMsgs();
    } else {
        var participantes = {};
        participantes[wfState.me.id] = { nome: wfState.me.nome || 'Voce', foto: wfState.me.foto || '' };
        participantes[outro.id] = { nome: outro.nome || outro.id, foto: outro.foto || '' };
        dbFirestore.collection('whatfarnConversas').doc(convId).set({
            membros: [wfState.me.id, outro.id].sort(),
            participantes: participantes,
            ultimaHora: Date.now(),
            ultimaMsg: '',
            criadoEm: Date.now()
        }, { merge: true }).then(function () {
            wfCarregarMsgs();
        }).catch(function (e) { console.error(e); });
    }
}

function wfVoltarLista() {
    var app = document.getElementById('wf-root');
    if (app) app.classList.remove('wf-open');
}

function wfManterInputVisivel() {
    if (!window.visualViewport) return;
    var input = document.getElementById('wf-input');
    var composer = document.getElementById('wf-composer');
    var root0 = document.getElementById('wf-root');
    if (!input || !composer || !root0) return;
    try {
        var vp = window.visualViewport;
        var vh = vp.height || window.innerHeight;
        var diff = Math.round(window.innerHeight - vh);
        if (diff > 60) {
            var headerH = 56;
            var alvo = Math.max(180, vh - headerH);
            root0.style.height = alvo + 'px';
            if (root0.getBoundingClientRect().height < vh) {
                var sobra = vh - (composer.getBoundingClientRect().bottom + root0.getBoundingClientRect().top);
                if (sobra > 0) composer.style.marginBottom = '0px';
            }
        } else {
            root0.style.height = '';
        }
    } catch (e) {}
    try {
        var rect = composer.getBoundingClientRect();
        var sobra = (rect.bottom - (window.visualViewport.height || window.innerHeight));
        if (sobra > 0) {
            var msgs = document.getElementById('wf-msgs');
            if (msgs) msgs.scrollTop += sobra + 8;
        }
    } catch (e) {}
    try { if (typeof input.scrollIntoViewIfNeeded === 'function') input.scrollIntoViewIfNeeded(); } catch (e) {}
}

function wfExcluirConversa(convId) {
    if (!convId || !dbFirestore) return;
    if (!confirm('Excluir esta conversa?\nTodas as mensagens serao apagadas permanentemente.')) return;
    var fezEle = function () {
        wfState.lista = wfState.lista.filter(function (c) { return c.id !== convId; });
        if (wfState.convId === convId) {
            wfState.convId = null;
            wfState.contato = null;
            if (wfState.msgsUnsub) { try { wfState.msgsUnsub(); } catch (e) {} wfState.msgsUnsub = null; }
            wfState.msgs = [];
            wfLimparConversaUI();
        }
        wfRenderLista();
    };
    try {
        firebase.storage().ref('whatfarn/' + convId).listAll().then(function (res) {
            var items = res.items.slice();
            var p = Promise.resolve();
            items.forEach(function (it) { p = p.then(function () { return it.delete().catch(function () {}); }); });
            return p;
        }).catch(function () {});
    } catch (e) {}
    var ref = dbFirestore.collection('whatfarnConversas').doc(convId);
    ref.collection('msgs').get().then(function (snap) {
        var batch = dbFirestore.batch();
        snap.forEach(function (d) { batch.delete(d.ref); });
        return batch.commit();
    }).then(function () {
        return ref.delete();
    }).then(function () {
        fezEle();
    }).catch(function (e) {
        console.error('wf: falha ao excluir', e);
        alert('Nao foi possivel excluir a conversa. Tente novamente.');
    });
}

function wfLimparConversaUI() {
    var el = document.getElementById('wf-msgs');
    if (el) el.innerHTML = '<div class="wf-vazio"><i class="fa-solid fa-comments" style="font-size:34px;opacity:.4"></i><p>Selecione uma conversa ao lado para comecar a conversar.</p></div>';
    var n = document.getElementById('wf-chat-nome');
    if (n) n.textContent = 'Selecione uma conversa';
    var s = document.getElementById('wf-chat-status');
    if (s) { s.classList.add('wf-cinza'); s.textContent = '&nbsp;'; }
    var app = document.getElementById('wf-root');
    if (app) app.classList.remove('wf-open');
}

/* ---------- Mensagens ---------- */

function wfCarregarMsgs() {
    if (wfState.msgsUnsub) { try { wfState.msgsUnsub(); } catch (e) {} wfState.msgsUnsub = null; }
    if (!wfState.convId || !dbFirestore) return;
    wfState.msgs = [];
    wfState.msgsUnsub = wfEventual(function () {
        return dbFirestore.collection('whatfarnConversas').doc(wfState.convId).collection('msgs')
            .orderBy('ts', 'asc').onSnapshot(function (snap) {
                wfState.msgs = [];
                snap.forEach(function (doc) { wfState.msgs.push({ id: doc.id, data: doc.data() }); });
                wfRenderMsgs();
                setTimeout(wfMarcarLidas, 400);
            });
    });
}

function wfMarcarLidas() {
    if (!wfState.me || !wfState.convId || !dbFirestore) return;
    var me = wfState.me.id;
    var pendentes = wfState.msgs.filter(function (m) {
        return m.data.destinatario === me && !m.data.lida;
    });
    if (!pendentes.length) return;
    var batch = dbFirestore.batch();
    pendentes.forEach(function (m) {
        batch.update(dbFirestore.collection('whatfarnConversas').doc(wfState.convId).collection('msgs').doc(m.id), {
            lida: true,
            lidaEm: Date.now()
        });
    });
    batch.commit().catch(function () {});
    var conv = wfState.lista.find(function (c) { return c.id === wfState.convId; });
    if (conv) {
        var campo = me === WF_ADMIN_ID ? 'naoLidasAdmin' : 'naoLidasAluno';
        var upd = {};
        upd[campo] = 0;
        dbFirestore.collection('whatfarnConversas').doc(wfState.convId).update(upd).catch(function () {});
    }
}

function wfRenderMsgs() {
    var el = document.getElementById('wf-msgs');
    if (!el) return;
    if (!wfState.msgs.length) {
        el.innerHTML = '<div class="wf-vazio"><i class="fa-solid fa-comment-dots" style="font-size:34px;opacity:.4"></i><p>Nenhuma mensagem ainda. Envie a primeira mensagem!</p></div>';
        return;
    }
    var html = '';
    var lastDay = '';
    wfState.msgs.forEach(function (m) {
        var d = m.data;
        if (!d.ts) return;
        var day = new Date(d.ts).toDateString();
        if (day !== lastDay) {
            lastDay = day;
            html += '<div class="wf-data-sep">' + wfEsc(wfDataExtenso(d.ts)) + '</div>';
        }
        var me = d.remetente === wfState.me.id;
        html += wfBalcaoMsg(m.id, d, me);
    });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
}

function wfBalcaoMsg(msgId, d, me) {
    var cls = me ? 'me' : 'other';
    var pv = '';
    if (d.tipo === 'imagem') {
        if (d.temporaria) {
            if (d.vista) {
                pv = '<div class="wf-msg-temp"><i class="fa-solid fa-eye-slash"></i><span>Foto temporária aberta</span>' +
                    (me ? '<span class="wf-msg-me">' + wfEstado(d) + '</span>' : '') + '</div>';
            } else {
                pv = '<div class="wf-msg-temp" style="cursor:pointer" onclick="wfVerTemporaria(\'' + wfEsc(msgId) + '\')">' +
                    '<i class="fa-solid fa-lock"></i><span>Foto temporária — toque para abrir</span>' +
                    (me ? '<span class="wf-msg-me">' + wfEstado(d) + '</span>' : '') + '</div>';
            }
        } else {
            var src = d.mediaThumb || d.mediaUrl || '';
            pv = '<img class="wf-msg-img" src="' + wfEsc(src) + '" onclick="wfAbrirImagem(\'' + wfEsc(d.mediaUrl || '') + '\')" alt="Foto">';
        }
    } else {
        pv = '<div class="wf-msg-text">' + wfEsc(d.texto) + '</div>';
    }
    return '<div class="wf-msg-wrap ' + cls + '"><div class="wf-msg ' + cls + '">' + pv +
        '<div class="wf-msg-me ' + (me ? '' : 'time-me') + '">' + wfDataVez(d.ts) +
        (me ? ' ' + wfEstado(d) : '') + '</div></div></div>';
}

function wfEstado(d) {
    var cGeral = d.temporaria ? ' time-me' : '';
    if (d.lida) return '<span class="wf-lido' + cGeral + '"><i class="fa-solid fa-check-double"></i></span>';
    return '<i class="fa-solid fa-check' + cGeral + '"></i>';
}

function wfVerTemporaria(msgId) {
    if (!wfState.convId || !dbFirestore) return;
    var m = wfState.msgs.find(function (x) { return x.id === msgId; });
    if (!m) return;
    var url = m.data.mediaUrl || '';
    dbFirestore.collection('whatfarnConversas').doc(wfState.convId).collection('msgs').doc(msgId)
        .set({ vista: true, vistaEm: Date.now() }, { merge: true }).catch(function () {});
    if (url) wfAbrirImagem(url);
}

/* ---------- Envio ---------- */

function wfEnviar() {
    var input = document.getElementById('wf-input');
    if (!input) return;
    var texto = input.value.trim();
    if (!texto || !wfState.convId || !wfState.contato) return;
    input.value = '';
    wfDigitando(false);
    try { input.focus({ preventScroll: true }); } catch (e) {}
    wfMsgsEnviar({ tipo: 'texto', texto: texto }).then(function () {
        try { input.focus({ preventScroll: true }); } catch (e) {}
    });
}

function wfDigitando(forcar) {
    if (wfState.typingTimer) { clearTimeout(wfState.typingTimer); wfState.typingTimer = null; }
    var estado = forcar === true;
    if (typeof forcar === 'undefined') {
        estado = true;
        wfState.typingTimer = setTimeout(function () { wfPresencaEnviar(true, false); }, 3500);
    }
    if (estado !== wfState.digitando) {
        wfState.digitando = estado;
        if (estado) wfPresencaEnviar(true, true);
        else wfPresencaEnviar(true, false);
    }
}

function wfMsgsEnviar(payload) {
    if (!dbFirestore || !wfState.convId || !wfState.me || !wfState.contato) return;
    var ts = Date.now();
    var ref = dbFirestore.collection('whatfarnConversas').doc(wfState.convId);
    var msg = {
        remetente: wfState.me.id,
        destinatario: wfState.contato.id,
        texto: payload.texto || '',
        tipo: payload.tipo || 'texto',
        temporaria: !!payload.temporaria,
        vista: false,
        ts: ts,
        lida: false
    };
    if (payload.mediaUrl) msg.mediaUrl = payload.mediaUrl;
    if (payload.mediaThumb) msg.mediaThumb = payload.mediaThumb;
    var campo = wfState.me.id === WF_ADMIN_ID ? 'naoLidasAluno' : 'naoLidasAdmin';
    var updateData = {};
    updateData[campo] = firebase.firestore.FieldValue.increment(1);
    return ref.collection('msgs').add(msg).then(function () {
        return ref.set({
            ultimaHora: ts,
            ultimaMsg: payload.tipo === 'imagem' ? 'FOTO' : payload.texto,
            ultimaRemetente: wfState.me.id
        }, { merge: true }).then(function () {
            return ref.update(updateData).catch(function () {});
        });
    }).catch(function (e) {
        console.error('wf: erro ao enviar', e);
        alert('Não foi possível enviar a mensagem. Tente novamente.');
    });
}

/* ---------- Imagens / Storage ---------- */

function wfComprimirImagem(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (ev) {
            var img = new Image();
            img.onload = function () {
                var max = 1200;
                var scale = Math.min(1, max / Math.max(img.width, img.height));
                var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
                var cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                var ctx = cv.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var dataUrl = cv.toDataURL('image/jpeg', 0.72);
                var thumb = cv.toDataURL('image/jpeg', 0.35);
                resolve({ full: dataUrl, thumb: thumb });
            };
            img.onerror = function () { reject(new Error('imagem invalida')); };
            img.src = ev.target.result;
        };
        reader.onerror = function () { reject(new Error('falha ao ler')); };
        reader.readAsDataURL(file);
    });
}

function wfUploadImagem(dataUrl, temporaria) {
    if (!dbFirestore || !wfState.convId || !wfState.me) return;
    var path = 'whatfarn/' + wfState.convId + '/' + Date.now() + '.jpg';
    var loading = document.getElementById('wf-msgs');
    if (loading) {
        var tmp = document.createElement('div');
        tmp.id = 'wf-upload-status';
        tmp.style.cssText = 'align-self:flex-end;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-radius:13px 13px 3px 13px;padding:9px 13px;font-size:13px;display:flex;align-items:center;gap:8px';
        tmp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando imagem...';
        loading.appendChild(tmp);
        loading.scrollTop = loading.scrollHeight;
    }
    return firebase.storage().ref(path).putString(dataUrl, 'data_url').then(function (snap) {
        return snap.ref.getDownloadURL();
    }).then(function (url) {
        return wfMsgsEnviar({ tipo: 'imagem', mediaUrl: url, temporaria: temporaria });
    }).catch(function (e) {
        console.error('wf: upload', e);
        alert('Falha ao enviar a imagem.');
    }).finally(function () {
        var st = document.getElementById('wf-upload-status');
        if (st) st.remove();
    });
}

function wfAnexarPermanente(input) {
    if (!input || !input.files || !input.files[0]) return;
    var f = input.files[0];
    input.value = '';
    if (!f.type || f.type.indexOf('image') === -1) { alert('Envie apenas imagens.'); return; }
    wfComprimirImagem(f).then(function (r) {
        return wfUploadImagem(r.full, false);
    }).catch(function () { alert('Não foi possível processar a imagem.'); });
}

function wfAnexarTemporaria(input) {
    if (!input || !input.files || !input.files[0]) return;
    var f = input.files[0];
    input.value = '';
    if (!f.type || f.type.indexOf('image') === -1) { alert('Envie apenas imagens.'); return; }
    wfComprimirImagem(f).then(function (r) {
        return wfUploadImagem(r.full, true);
    }).catch(function () { alert('Não foi possível processar a imagem.'); });
}

function wfAbrirImagem(url) {
    if (!url) return;
    var lb = document.createElement('div');
    lb.className = 'wf-lightbox';
    lb.innerHTML = '<img src="' + wfEsc(url) + '" alt="">';
    lb.onclick = function () { lb.remove(); };
    document.body.appendChild(lb);
}

/* ---------- Inicializacao ---------- */

function wfIniciar(modo) {
    if (!dbFirestore) return;
    wfCss();
    var me = wfQuemSou(modo);
    if (!me) { alert('Sessão não detectada. Faça login novamente.'); return; }
    if (wfState.iniciado && wfState.modo === modo && wfState.me && wfState.me.id === me.id) {
        if (wfState.modo === 'aluno' && !wfState.lista.length) { wfRenderLista(); }
        return;
    }
    wfSair();
    wfState.modo = modo;
    wfState.me = me;
    wfState.iniciado = true;
    wfHTML();

    if (!wfState._lisPresos) {
        wfState._lisPresos = true;
        window.addEventListener('resize', function () {
            var app = document.getElementById('wf-root');
            if (app) app.classList.toggle('wf-mobile', wfState.modo === 'aluno' || window.innerWidth <= 920);
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { try { wfPresencaEnviar(false, false); } catch (e) {} }
            else if (wfState.iniciado && wfState.me) wfPresencaEnviar(true, false);
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function () { wfManterInputVisivel(); });
            window.visualViewport.addEventListener('scroll', function () { wfManterInputVisivel(); });
        }
        document.addEventListener('focusin', function () {
            setTimeout(wfManterInputVisivel, 350);
        });
    }

    if (modo === 'aluno') {
        wfCarregarConversas();
        var convId = wfConvId(me.id, WF_ADMIN_ID);
        var outro = { id: WF_ADMIN_ID, nome: WF_ADMIN_NOME, foto: '' };
        wfState.contato = outro;
        wfState.convId = convId;
        var elNome = document.getElementById('wf-chat-nome');
        if (elNome) elNome.textContent = WF_ADMIN_NOME;
        wfLigarPresencaContato();
        dbFirestore.collection('whatfarnConversas').doc(convId).get().then(function (doc) {
            if (!doc.exists) {
                var participantes = {};
                participantes[me.id] = { nome: me.nome || 'Aluno', foto: me.foto || '' };
                participantes[WF_ADMIN_ID] = { nome: WF_ADMIN_NOME, foto: '' };
                dbFirestore.collection('whatfarnConversas').doc(convId).set({
                    membros: [me.id, WF_ADMIN_ID].sort(),
                    participantes: participantes,
                    ultimaHora: Date.now(),
                    ultimaMsg: '',
                    criadoEm: Date.now()
                }, { merge: true }).catch(function () {});
            }
            wfCarregarMsgs();
            wfRenderLista();
            var appAb = document.getElementById('wf-root');
            if (appAb) appAb.classList.remove('wf-open');
        });
    } else {
        wfCarregarConversas();
    }

    wfPresencaEnviar(true, false);
    wfState.presencaTimer = setInterval(function () { wfPresencaEnviar(true, false); }, 45000);
}

/* Exposicao global (usadas em onclick e nos portais) */
window.wfIniciar = wfIniciar;
window.wfSair = wfSair;
window.wfLogin = wfLogin;
window.wfLogout = wfLogout;
window.wfSessao = wfSessao;
window.wfRenderLista = wfRenderLista;
window.wfMostrarContatos = wfMostrarContatos;
window.wfFecharContatos = wfFecharContatos;
window.wfFiltrarContatos = wfFiltrarContatos;
window.wfSelecionarContato = wfSelecionarContato;
window.wfSelecionarConversa = wfSelecionarConversa;
window.wfVoltarLista = wfVoltarLista;
window.wfExcluirConversa = wfExcluirConversa;
window.wfEnviar = wfEnviar;
window.wfDigitando = wfDigitando;
window.wfVerTemporaria = wfVerTemporaria;
window.wfAnexarPermanente = wfAnexarPermanente;
window.wfAnexarTemporaria = wfAnexarTemporaria;
window.wfAbrirImagem = wfAbrirImagem;