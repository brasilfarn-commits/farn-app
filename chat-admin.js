/* ===== CHAT DOS PORTAIS - ADMIN ===== */
var chatPortaisUnsub = null;
var chatPortaisList = [];
var chatPortaisSelected = null;
var chatPortaisMsgUnsub = null;
var chatPortaisNotifUnsub = null;
var chatPortaisEmojiPanelOpen = false;
var chatPortaisEditingMsg = null;
var chatPortaisTab = 'todas';

function chatPortaisLoad() {
    if (chatPortaisUnsub) chatPortaisUnsub();
    var listEl = document.getElementById('chat-p-list');
    listEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando...</div>';

    chatPortaisUnsub = dbFirestore.collection('chatAdmin').orderBy('ultimaHora', 'desc').onSnapshot(function(snap) {
        chatPortaisList = [];
        listEl.innerHTML = '';
        if (snap.empty) {
            listEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-inbox"></i><br>Nenhuma conversa ainda</div>';
            chatPortaisUpdateBadge();
            return;
        }
        snap.forEach(function(doc) {
            var c = doc.data();
            c._id = doc.id;
            chatPortaisList.push(c);
        });
        chatPortaisFilter();
    }, function(e) {
        console.error('Erro chat admin:', e);
        listEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar conversas</div>';
    });
}

function chatPortaisRenderList(lista) {
    var listEl = document.getElementById('chat-p-list');
    listEl.innerHTML = '';
    lista.forEach(function(c) {
        var initials = (c.nome || '??').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
        var cpfDisp = c.cpf || '';
        if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        var timeStr = c.ultimaHora ? new Date(c.ultimaHora.seconds ? c.ultimaHora.seconds * 1000 : c.ultimaHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        var tipoLabel = c.tipo === 'formado' ? 'Formado' : c.tipo === 'grupo' ? 'Grupo' : 'Aluno';
        var tipoColor = c.tipo === 'formado' ? '#16a34a' : c.tipo === 'grupo' ? '#2563eb' : '#2563eb';
        var tipoIcon = c.tipo === 'formado' ? 'fa-graduation-cap' : c.tipo === 'grupo' ? 'fa-users' : 'fa-user';
        var isSelected = chatPortaisSelected === c._id;
        var naoLidas = c.naoLidas || 0;
        var bgSel = isSelected ? 'background:#f0fdf4;' : '';

        var avatarBg = c.tipo === 'formado' ? '#16a34a' : c.tipo === 'grupo' ? '#2563eb' : '#2563eb';

        var html = '<div class="chat-p-item" onclick="chatPortaisSelect(\'' + c._id + '\')" style="padding:14px 16px;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background .2s;position:relative;' + bgSel + '" onmouseover="this.style.background=\'#f0fdf4\';var b=this.querySelector(\'.chat-p-del-btn\');if(b)b.style.display=\'flex\'" onmouseout="this.style.background=\'' + (isSelected ? '#f0fdf4' : 'transparent') + '\';var b=this.querySelector(\'.chat-p-del-btn\');if(b)b.style.display=\'none\'">' +
            '<div style="display:flex;gap:12px;align-items:center">' +
            '<div style="width:44px;height:44px;border-radius:50%;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0;position:relative">' + initials +
            '<div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#0d1117;display:flex;align-items:center;justify-content:center"><i class="fa-solid ' + tipoIcon + '" style="font-size:9px;color:' + tipoColor + '"></i></div>' +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (naoLidas > 0 ? '#fff' : '#ddd') + '">' + (c.nome || '---') + '</span>' +
            '<span style="font-size:11px;color:#64748b;flex-shrink:0">' + timeStr + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;margin-top:2px">' +
            '<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;background:' + tipoColor + '22;color:' + tipoColor + ';border:1px solid ' + tipoColor + '44"><i class="fa-solid ' + tipoIcon + '" style="margin-right:3px"></i>' + tipoLabel + '</span>' +
            '<span style="font-size:11px;color:#64748b">' + cpfDisp + '</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">' +
            '<span style="font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">' + (c.ultimaMsg || '') + '</span>' +
            (naoLidas > 0 ? '<span style="background:#f44336;color:#fff;font-size:10px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:8px;padding:0 6px">' + naoLidas + '</span>' : '') +
            '</div>' +
            '</div>' +
            '<button class="chat-p-del-btn" onclick="event.stopPropagation();chatPortaisDeleteConversation(\'' + c._id + '\',\'' + (c.nome || '').replace(/'/g, "\\'") + '\')" title="Excluir conversa" style="display:none;position:absolute;top:8px;right:8px;background:rgba(244,67,54,.12);border:1px solid rgba(244,67,54,.3);color:#f44336;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px;align-items:center;justify-content:center;transition:all .15s;z-index:2" onmouseover="this.style.background=\'rgba(244,67,54,.35)\'" onmouseout="this.style.background=\'rgba(244,67,54,.12)\'"><i class="fa-solid fa-trash"></i></button>' +
            '</div></div>';
        listEl.innerHTML += html;
    });
}

function chatPortaisFilter() {
    var q = (document.getElementById('chat-p-search').value || '').toLowerCase();
    var filtered = chatPortaisList;
    if (chatPortaisTab === 'alunos') filtered = filtered.filter(function(c) { return c.tipo !== 'formado' && c.tipo !== 'grupo'; });
    else if (chatPortaisTab === 'formados') filtered = filtered.filter(function(c) { return c.tipo === 'formado'; });
    else if (chatPortaisTab === 'grupos') filtered = filtered.filter(function(c) { return c.tipo === 'grupo'; });
    if (q) filtered = filtered.filter(function(c) {
        return (c.nome || '').toLowerCase().includes(q) || (c.cpf || '').includes(q);
    });
    chatPortaisRenderList(filtered);
}

function chatPortaisSetTab(tab) {
    chatPortaisTab = tab;
    document.querySelectorAll('.chat-p-tab').forEach(function(el) {
        if (el.dataset.tab === tab) { el.style.color = '#16a34a'; el.style.borderBottomColor = '#16a34a'; }
        else { el.style.color = '#64748b'; el.style.borderBottomColor = 'transparent'; }
    });
    chatPortaisFilter();
}

function chatPortaisSelect(cpf) {
    if (cpf.startsWith('grupo_')) {
        var g = chatPortaisList.find(function(c) { return c._id === cpf; });
        if (g) chatPortaisAbrirGrupo(cpf, g.nome || cpf, (g.membros || []).map(function(m) { return { cpf: m, nome: '' }; }));
        return;
    }
    chatPortaisSelected = cpf;
    chatPortaisEditingMsg = null;
    var user = chatPortaisList.find(function(c) { return c._id === cpf; });
    if (!user) return;

    var initials = (user.nome || '??').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
    var cpfDisp = user.cpf || '';
    if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    var tipoLabel = user.tipo === 'formado' ? 'Formado' : 'Aluno';
    var tipoColor = user.tipo === 'formado' ? '#16a34a' : '#2563eb';
    var tipoIcon = user.tipo === 'formado' ? 'fa-graduation-cap' : 'fa-user';

    document.getElementById('chat-p-header').style.display = 'block';
    document.getElementById('chat-p-input-area').style.display = 'flex';
    document.getElementById('chat-p-user-avatar').textContent = initials;
    document.getElementById('chat-p-user-name').innerHTML = (user.nome || '---') + ' <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:' + tipoColor + '22;color:' + tipoColor + ';border:1px solid ' + tipoColor + '44;margin-left:6px"><i class="fa-solid ' + tipoIcon + '" style="margin-right:3px"></i>' + tipoLabel + '</span>';
    document.getElementById('chat-p-user-info').textContent = 'CPF: ' + cpfDisp + ' | Projeto: ' + (user.projeto || '---');

    chatPortaisFilter();

    dbFirestore.collection('chatAdmin').doc(cpf).set({ naoLidas: 0 }, { merge: true });
    var msgEl = document.getElementById('chat-p-messages');
    msgEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    chatPortaisMsgUnsub = dbFirestore.collection('chatAdmin').doc(cpf).collection('msgs').orderBy('hora').onSnapshot(function(snap) {
        msgEl.innerHTML = '';
        if (snap.empty) {
            msgEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px">Nenhuma mensagem</div>';
            return;
        }
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) {
            var m = doc.data();
            m._docId = doc.id;
            if (m.remetente !== 'admin' && !m.lida) {
                batch.set(doc.ref, { lida: true }, { merge: true });
            }
            if (m.apagada) return;
            var isAdmin = m.remetente === 'admin';
            var bubble = document.createElement('div');
            bubble.className = 'chat-p-bubble-wrap';
            bubble.style.cssText = 'max-width:70%;margin-bottom:12px;position:relative;' + (isAdmin ? 'margin-left:auto;text-align:right' : '');

            var tipoRemetente = m.tipo || (m.remetente === 'admin' ? 'admin' : user.tipo || 'aluno');
            var remetenteLabel = '';
            var remetenteColor = '';
            if (isAdmin) {
                remetenteLabel = '<i class="fa-solid fa-shield-halved" style="margin-right:3px"></i> Administracao FARN';
                remetenteColor = '#16a34a';
            } else if (tipoRemetente === 'formado') {
                remetenteLabel = '<i class="fa-solid fa-graduation-cap" style="margin-right:3px"></i> Portal do Formado';
                remetenteColor = '#16a34a';
            } else {
                remetenteLabel = '<i class="fa-solid fa-user" style="margin-right:3px"></i> Portal do Aluno';
                remetenteColor = '#2563eb';
            }

            var time = m.hora ? new Date(m.hora.seconds ? m.hora.seconds * 1000 : m.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            var bg = isAdmin ? 'background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-radius:12px 12px 2px 12px' : 'background:#ffffff;border:1px solid #e2e8f0;border-radius:12px 12px 12px 2px;color:#1e293b';
            var editLabel = m.editado ? '<span style="font-size:9px;opacity:.6;font-style:italic">(editado)</span> ' : '';
            var senderLabel = '<div style="font-size:11px;color:' + remetenteColor + ';margin-bottom:2px">' + remetenteLabel + '</div>';

            var actionsHtml = '';
            if (isAdmin) {
                actionsHtml = '<div class="chat-p-msg-actions" style="display:none;position:absolute;top:-8px;' + (isAdmin ? 'left:-8px' : 'right:-8px') + ';display:none;background:#f0fdf4;border:1px solid #e2e8f0;border-radius:8px;padding:2px;gap:2px;z-index:5">' +
                    '<button onclick="event.stopPropagation();chatPortaisEditMsg(\'' + m._docId + '\',\'' + (m.texto || '').replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\')" title="Editar" style="background:none;border:none;color:#2563eb;cursor:pointer;padding:4px 6px;font-size:11px;border-radius:4px" onmouseover="this.style.background=\'rgba(37,99,235,.1)\'" onmouseout="this.style.background=\'none\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="event.stopPropagation();chatPortaisDeleteMsg(\'' + m._docId + '\')" title="Apagar para mim" style="background:none;border:none;color:#dc2626;cursor:pointer;padding:4px 6px;font-size:11px;border-radius:4px" onmouseover="this.style.background=\'rgba(220,38,38,.1)\'" onmouseout="this.style.background=\'none\'"><i class="fa-solid fa-trash"></i></button>' +
                    '</div>';
            }

            bubble.innerHTML = senderLabel +
                '<div style="padding:10px 14px;' + bg + ';position:relative">' + editLabel + (m.texto || '') + actionsHtml + '</div>' +
                '<div style="font-size:10px;color:#64748b;margin-top:2px">' + time + '</div>';
            msgEl.appendChild(bubble);
        });
        batch.commit().catch(function() {});
        msgEl.scrollTop = msgEl.scrollHeight;
    }, function() {
        msgEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar mensagens</div>';
    });
}

function chatPortaisSend() {
    var input = document.getElementById('chat-p-input');
    var texto = input.value.trim();
    if (!texto || !chatPortaisSelected) return;

    if (chatPortaisEditingMsg) {
        chatPortaisSaveEdit(chatPortaisEditingMsg, texto);
        chatPortaisEditingMsg = null;
        input.value = '';
        return;
    }

    input.value = '';

    if (chatPortaisSelected.startsWith('grupo_')) {
        chatPortaisSendGrupo(texto);
        return;
    }

    var msgData = {
        texto: texto,
        remetente: 'admin',
        nome: 'Administracao FARN',
        hora: firebase.firestore.FieldValue.serverTimestamp(),
        lida: false
    };

    dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).collection('msgs').add(msgData).then(function() {
        return dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).set({
            ultimaMsg: texto,
            ultimaHora: firebase.firestore.FieldValue.serverTimestamp(),
            ultimaRemetente: 'admin'
        }, { merge: true });
    }).catch(function(e) { console.error('Erro ao enviar:', e); });
}

/* ===== EDITAR MENSAGEM ===== */
function chatPortaisEditMsg(docId, textoAtual) {
    var novoTexto = prompt('Editar mensagem:', textoAtual);
    if (novoTexto === null || novoTexto.trim() === '' || novoTexto.trim() === textoAtual) return;
    chatPortaisEditingMsg = null;
    dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).collection('msgs').doc(docId).update({
        texto: novoTexto.trim(),
        editado: true
    }).catch(function(e) { console.error('Erro ao editar:', e); });
}

function chatPortaisSaveEdit(docId, novoTexto) {
    if (!novoTexto || !chatPortaisSelected) return;
    dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).collection('msgs').doc(docId).update({
        texto: novoTexto,
        editado: true
    }).catch(function(e) { console.error('Erro ao editar:', e); });
}

/* ===== APAGAR PARA MIM ===== */
function chatPortaisDeleteMsg(docId) {
    if (!confirm('Apagar esta mensagem para voce?')) return;
    dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).collection('msgs').doc(docId).update({
        apagada: true,
        apagadaPor: 'admin'
    }).catch(function(e) { console.error('Erro ao apagar:', e); });
}

/* ===== LIMPAR TELA PARA TODOS ===== */
function chatPortaisClearAll() {
    if (!chatPortaisSelected) return;
    var user = chatPortaisList.find(function(c) { return c._id === chatPortaisSelected; });
    var nome = user ? user.nome : '';
    if (!confirm('ATENCAO: Isso ira apagar TODAS as mensagens desta conversa para TODOS os participantes.\n\nConversa com: ' + nome + '\n\nEsta acao nao pode ser desfeita!')) return;
    if (!confirm('Tem CERTEZA ABSOLUTA que deseja apagar toda a conversa?')) return;

    chatPortaisClearAllBatch(0).then(function() {
        return dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).set({
            ultimaMsg: 'Conversa encerrada pelo administrador',
            ultimaHora: firebase.firestore.FieldValue.serverTimestamp(),
            ultimaRemetente: 'admin',
            naoLidas: 0
        }, { merge: true });
    }).then(function() {
        alert('Conversa limpa com sucesso!');
    }).catch(function(e) {
        console.error('Erro ao limpar:', e);
        alert('Erro ao limpar conversa: ' + e.message);
    });
}

function chatPortaisClearAllBatch() {
    var msgsRef = dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).collection('msgs');
    return msgsRef.limit(450).get().then(function(snap) {
        if (snap.empty) return;
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) {
            batch.delete(doc.ref);
        });
        return batch.commit().then(function() {
            return chatPortaisClearAllBatch();
        });
    });
}

/* ===== EXCLUIR CONVERSA (DA LISTA) ===== */
function chatPortaisDeleteConversation(cpf, nome) {
    if (!confirm('Excluir toda a conversa com "' + nome + '"?\n\nTodas as mensagens serao apagadas. Esta acao nao pode ser desfeita.')) return;

    var msgsRef = dbFirestore.collection('chatAdmin').doc(cpf).collection('msgs');

    function deleteBatchRecursive() {
        return msgsRef.limit(450).get().then(function(snap) {
            if (snap.empty) return;
            var batch = dbFirestore.batch();
            snap.forEach(function(doc) { batch.delete(doc.ref); });
            return batch.commit().then(function() { return deleteBatchRecursive(); });
        });
    }

    deleteBatchRecursive().then(function() {
        return dbFirestore.collection('chatAdmin').doc(cpf).delete();
    }).then(function() {
        if (chatPortaisSelected === cpf) {
            chatPortaisSelected = null;
            document.getElementById('chat-p-header').style.display = 'none';
            document.getElementById('chat-p-input-area').style.display = 'none';
            document.getElementById('chat-p-messages').innerHTML = '<div style="text-align:center;color:#64748b;padding:60px 20px"><i class="fa-solid fa-comments" style="font-size:48px;margin-bottom:12px;display:block;opacity:0.3"></i><p>Selecione uma conversa para visualizar</p></div>';
        }
        alert('Conversa excluida com sucesso!');
    }).catch(function(e) {
        console.error('Erro ao excluir conversa:', e);
        alert('Erro ao excluir: ' + e.message);
    });
}

/* ===== EMOJI PICKER ===== */
var chatPortaisEmojiList = [
    '\u{1F600}','\u{1F601}','\u{1F602}','\u{1F603}','\u{1F604}','\u{1F605}','\u{1F606}','\u{1F607}',
    '\u{1F608}','\u{1F609}','\u{1F60A}','\u{1F60B}','\u{1F60C}','\u{1F60D}','\u{1F60E}','\u{1F60F}',
    '\u{1F610}','\u{1F611}','\u{1F612}','\u{1F613}','\u{1F614}','\u{1F615}','\u{1F616}','\u{1F617}',
    '\u{1F618}','\u{1F619}','\u{1F61A}','\u{1F61B}','\u{1F61C}','\u{1F61D}','\u{1F61E}','\u{1F61F}',
    '\u{1F620}','\u{1F621}','\u{1F622}','\u{1F623}','\u{1F624}','\u{1F625}','\u{1F626}','\u{1F627}',
    '\u{1F628}','\u{1F629}','\u{1F62A}','\u{1F62B}','\u{1F62C}','\u{1F62D}','\u{1F62E}','\u{1F62F}',
    '\u{1F630}','\u{1F631}','\u{1F632}','\u{1F633}','\u{1F634}','\u{1F635}','\u{1F636}','\u{1F637}',
    '\u{1F44D}','\u{1F44E}','\u{1F44F}','\u{1F450}','\u{1F64F}','\u{1F44B}','\u{1F44C}','\u{1F446}',
    '\u{1F447}','\u{1F448}','\u{1F449}','\u{1F44A}','\u{270A}','\u{270B}','\u{1F445}','\u{1F4AF}',
    '\u{2764}','\u{1F494}','\u{1F495}','\u{1F496}','\u{1F497}','\u{1F498}','\u{1F49D}','\u{1F49E}',
    '\u{1F525}','\u{2B50}','\u{1F31F}','\u{1F4AB}','\u{2728}','\u{1F4A4}','\u{1F4A3}','\u{1F4A6}',
    '\u{1F4A8}','\u{1F4A9}','\u{1F4AA}','\u{1F440}','\u{1F4A1}','\u{1F4A5}','\u{1F4AC}','\u{1F4AD}',
    '\u{1F389}','\u{1F38A}','\u{1F381}','\u{1F388}','\u{1F386}','\u{1F387}','\u{1F382}','\u{1F380}',
    '\u{1F680}','\u{1F4E1}','\u{1F4E2}','\u{1F4E3}','\u{1F4AC}','\u{1F4DD}','\u{1F4CB}','\u{1F4DA}',
    '\u{1F514}','\u{1F512}','\u{1F511}','\u{1F50E}','\u{1F50D}','\u{1F4F7}','\u{1F4F9}','\u{1F4FA}',
    '\u{1F3A4}','\u{1F3A5}','\u{1F3B5}','\u{1F3B6}','\u{1F3BA}','\u{1F3B8}','\u{1F3B9}','\u{1F3BB}',
    '\u{26BD}','\u{1F3C0}','\u{1F3C8}','\u{1F3BE}','\u{1F3BF}','\u{26F5}','\u{1F697}','\u{1F699}',
    '\u{1F44D}\u{1F3FB}','\u{1F44D}\u{1F3FC}','\u{1F44D}\u{1F3FD}','\u{1F44D}\u{1F3FE}','\u{1F44D}\u{1F3FF}',
    '\u{1F64B}','\u{1F64C}','\u{1F64D}','\u{1F64E}','\u{1F645}','\u{1F646}','\u{1F647}','\u{1F648}'
];

function chatPortaisInitEmoji() {
    var grid = document.getElementById('chat-p-emoji-grid');
    if (!grid || grid.children.length > 0) return;
    chatPortaisEmojiList.forEach(function(em) {
        var btn = document.createElement('button');
        btn.textContent = em;
        btn.style.cssText = 'background:none;border:none;font-size:22px;cursor:pointer;padding:4px;border-radius:6px;transition:background .15s;line-height:1';
        btn.onmouseover = function() { this.style.background = 'rgba(249,168,37,.2)'; };
        btn.onmouseout = function() { this.style.background = 'none'; };
        btn.onclick = function(e) {
            e.stopPropagation();
            var input = document.getElementById('chat-p-input');
            if (input) input.value += em;
            input.focus();
        };
        grid.appendChild(btn);
    });
}

function chatPortaisToggleEmoji() {
    var panel = document.getElementById('chat-p-emoji-panel');
    if (!panel) return;
    chatPortaisEmojiPanelOpen = !chatPortaisEmojiPanelOpen;
    panel.style.display = chatPortaisEmojiPanelOpen ? 'block' : 'none';
    if (chatPortaisEmojiPanelOpen) chatPortaisInitEmoji();
}

/* ===== ATUALIZAR BADGE ===== */
function chatPortaisUpdateBadge() {
    var total = 0;
    chatPortaisList.forEach(function(c) {
        total += (c.naoLidas || 0);
    });
    var badge = document.getElementById('chat-p-badge');
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function chatPortaisStartNotifListener() {
    if (chatPortaisNotifUnsub) chatPortaisNotifUnsub();
    chatPortaisNotifUnsub = dbFirestore.collection('chatAdmin').orderBy('ultimaHora', 'desc').onSnapshot(function(snap) {
        var total = 0;
        snap.forEach(function(doc) {
            var d = doc.data();
            total += (d.naoLidas || 0);
        });
        var badge = document.getElementById('chat-p-badge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total > 99 ? '99+' : total;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    });
}

/* ===== CONTATOS POR PROJETO ===== */
var chatPortaisContactsOpen = false;

function chatPortaisToggleContacts() {
    chatPortaisContactsOpen = !chatPortaisContactsOpen;
    var panel = document.getElementById('chat-p-contacts-panel');
    if (!panel) return;
    panel.style.display = chatPortaisContactsOpen ? 'block' : 'none';
    if (chatPortaisContactsOpen) {
        chatPortaisLoadContacts();
    }
}

async function chatPortaisLoadContacts() {
    var container = document.getElementById('chat-p-contacts-list');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando contatos...</div>';

    if (typeof dbFirestore === 'undefined' || !dbFirestore) {
        container.innerHTML = '<div style="text-align:center;color:#f44336;padding:20px">Firestore nao inicializado</div>';
        return;
    }

    var allUsers = [];
    var allProjetos = [];
    var allTurmas = [];

    try {
        var results = await Promise.all([
            dbFirestore.collection('recadastramentos').get(),
            dbFirestore.collection('parceiros').get(),
            dbFirestore.collection('turmas').get()
        ]);
        results[0].forEach(function(doc) {
            var r = doc.data();
            r._docId = doc.id;
            r._origem = 'recadastramento';
            allUsers.push(r);
        });

        try {
            var candSnap = await dbFirestore.collection('candidatos').get();
            candSnap.forEach(function(doc) {
                var c = doc.data();
                if (!c.cpf) return;
                var exists = allUsers.some(function(u) { return u.cpf === c.cpf; });
                if (!exists) {
                    c._docId = doc.id;
                    c._origem = 'candidato';
                    allUsers.push(c);
                }
            });
        } catch(e2) { console.warn('candidatos indisponivel:', e2); }

        results[1].forEach(function(doc) {
            var p = doc.data();
            if (doc.id === '_index') return;
            allProjetos.push(p);
        });
        results[2].forEach(function(doc) {
            var t = doc.data();
            if (doc.id === '_index') return;
            allTurmas.push(t);
        });
    } catch(e) {
        console.error('Erro ao buscar contatos:', e);
        container.innerHTML = '<div style="text-align:center;color:#f44336;padding:20px"><i class="fa-solid fa-triangle-exclamation" style="font-size:24px;display:block;margin-bottom:8px"></i>Erro: ' + e.message + '</div>';
        return;
    }

    var projetosMap = {};
    allProjetos.forEach(function(p) {
        if (p.nome) projetosMap[p.nome] = p;
    });

    allUsers = allUsers.filter(function(r) { return !!r.projeto; });

    allUsers.forEach(function(r) {
        var proj = r.projeto || '';
        if (proj && !projetosMap[proj]) projetosMap[proj] = { nome: proj };
    });

    var turmasByProj = {};
    allTurmas.forEach(function(t) {
        var proj = t.projeto || '';
        if (!turmasByProj[proj]) turmasByProj[proj] = [];
        turmasByProj[proj].push(t);
    });

    var usersByTurma = {};
    var usersByProjNoTurma = {};
    allUsers.forEach(function(r) {
        var proj = r.projeto || 'Sem Projeto';
        var turma = r.turma || '';
        if (turma) {
            var key = proj + '||' + turma;
            if (!usersByTurma[key]) usersByTurma[key] = [];
            usersByTurma[key].push(r);
        } else {
            if (!usersByProjNoTurma[proj]) usersByProjNoTurma[proj] = [];
            usersByProjNoTurma[proj].push(r);
        }
    });

    var projetos = Object.keys(projetosMap).sort();
    container.innerHTML = '';

    function renderContact(u) {
        var cpf = u.cpf || '';
        var cpfDisp = cpf;
        if (cpf.length === 11) cpfDisp = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        var initials = (u.nome || '??').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
        var status = u.status || 'Pendente';
        var isAtivo = status === 'Ativo';
        var isRejeitado = status === 'Rejeitado';
        var tipoColor = isAtivo ? '#16a34a' : (isRejeitado ? '#dc2626' : '#ca8a04');
        var tipoIcon = isAtivo ? 'fa-graduation-cap' : (isRejeitado ? 'fa-ban' : 'fa-user');
        var tipoLabel = isAtivo ? 'Formado' : (isRejeitado ? 'Rejeitado' : 'Aluno');
        var avatarBg = isAtivo ? '#2e7d32' : (isRejeitado ? '#c62828' : '#1565c0');
        var statusDot = isAtivo ? '#16a34a' : (isRejeitado ? '#dc2626' : '#ca8a04');

        var item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px 8px 32px;cursor:pointer;border-radius:8px;transition:background .15s;margin-bottom:2px';
        item.onmouseover = function() { this.style.background = 'rgba(255,255,255,.06)'; };
        item.onmouseout = function() { this.style.background = 'transparent'; };
        item.onclick = function() { chatPortaisStartFromContact(cpf, u.nome, isAtivo ? 'formado' : 'aluno'); };

        item.innerHTML = '<div style="width:30px;height:30px;border-radius:50%;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;flex-shrink:0;position:relative">' + initials +
            '<div style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:' + statusDot + ';border:2px solid #0d1117"></div></div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;font-size:12px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (u.nome || '---') + '</div>' +
            '<div style="display:flex;gap:4px;align-items:center;margin-top:1px">' +
            '<span style="font-size:8px;padding:1px 5px;border-radius:8px;font-weight:600;background:' + tipoColor + '22;color:' + tipoColor + ';border:1px solid ' + tipoColor + '44"><i class="fa-solid ' + tipoIcon + '" style="margin-right:2px"></i>' + tipoLabel + '</span>' +
            '<span style="font-size:9px;color:#64748b">' + cpfDisp + '</span>' +
            '</div></div>' +
            '<i class="fa-solid fa-comment-dots" style="color:#4caf50;font-size:12px;opacity:.5;flex-shrink:0"></i>';

        return item;
    }

    projetos.forEach(function(proj) {
        var projeto = projetosMap[proj] || {};
        var turmas = turmasByProj[proj] || [];
        var usersSemTurma = usersByProjNoTurma[proj] || [];
        var collapseId = 'chat-proj-' + proj.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        var projStatus = projeto.status || 'Em Andamento';
        var statusDotColor = projStatus === 'Em Andamento' ? '#16a34a' : (projStatus === 'Concluido' ? '#2563eb' : '#ca8a04');
        var totalUsers = usersSemTurma.length;
        turmas.forEach(function(t) {
            totalUsers += (usersByTurma[proj + '||' + t.nome] || []).length;
        });

        var header = document.createElement('div');
        header.style.cssText = 'margin-bottom:4px';
        header.innerHTML = '<div onclick="chatPortaisToggleProject(\'' + collapseId + '\')" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(249,168,37,.08);border:1px solid rgba(249,168,37,.15);border-radius:10px;cursor:pointer;transition:background .2s" onmouseover="this.style.background=\'rgba(249,168,37,.18)\'" onmouseout="this.style.background=\'rgba(249,168,37,.08)\'">' +
'<i class="fa-solid fa-folder-open" style="color:#16a34a;font-size:14px"></i>' +
            '<span style="flex:1;font-weight:700;font-size:13px;color:#16a34a">' + proj + '</span>' +
            '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">' + totalUsers + '</span>' +
            '<i class="fa-solid fa-chevron-down" id="chat-proj-icon-' + collapseId + '" style="color:#64748b;font-size:10px;transition:transform .2s"></i>' +
            '</div>';
        container.appendChild(header);

        var list = document.createElement('div');
        list.id = collapseId;
        list.style.cssText = 'display:none;padding:4px 0 8px 0';

        turmas.forEach(function(t) {
            var turmaUsers = usersByTurma[proj + '||' + t.nome] || [];
            var turmaCollapseId = 'chat-turma-' + collapseId + '-' + (t.nome || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

            var turmaHeader = document.createElement('div');
            turmaHeader.style.cssText = 'margin-bottom:2px';
            turmaHeader.innerHTML = '<div onclick="chatPortaisToggleProject(\'' + turmaCollapseId + '\')" style="display:flex;align-items:center;gap:8px;padding:8px 12px 8px 20px;cursor:pointer;border-radius:8px;transition:background .15s" onmouseover="this.style.background=\'rgba(255,255,255,.04)\'" onmouseout="this.style.background=\'transparent\'">' +
                '<i class="fa-solid fa-users" style="color:#64748b;font-size:12px"></i>' +
                '<span style="flex:1;font-weight:600;font-size:12px;color:#475569">' + (t.nome || '---') + (t.descricao ? ' <span style="color:#64748b;font-weight:400;font-size:10px">- ' + t.descricao + '</span>' : '') + '</span>' +
                '<span style="background:rgba(22,163,74,.06);color:#64748b;font-size:10px;font-weight:600;padding:2px 6px;border-radius:8px">' + turmaUsers.length + '</span>' +
                '<i class="fa-solid fa-chevron-down" id="chat-proj-icon-' + turmaCollapseId + '" style="color:#64748b;font-size:9px;transition:transform .2s"></i>' +
                '</div>';
            list.appendChild(turmaHeader);

            var turmaList = document.createElement('div');
            turmaList.id = turmaCollapseId;
            turmaList.style.cssText = 'display:none;padding:2px 0';

            turmaUsers.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
            turmaUsers.forEach(function(u) { turmaList.appendChild(renderContact(u)); });
            list.appendChild(turmaList);
        });

        if (usersSemTurma.length > 0) {
            usersSemTurma.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
            usersSemTurma.forEach(function(u) { list.appendChild(renderContact(u)); });
        }

        container.appendChild(list);
    });

}

function chatPortaisToggleProject(id) {
    var el = document.getElementById(id);
    var icon = document.getElementById('chat-proj-icon-' + id);
    if (!el) return;
    var isVisible = el.style.display !== 'none';
    el.style.display = isVisible ? 'none' : 'block';
    if (icon) icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
}

function chatPortaisStartFromContact(cpf, nome, tipo) {
    chatPortaisSelected = cpf;
    chatPortaisEditingMsg = null;

    var initials = (nome || '??').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
    var cpfDisp = cpf || '';
    if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    var tipoLabel = tipo === 'formado' ? 'Formado' : 'Aluno';
    var tipoColor = tipo === 'formado' ? '#16a34a' : '#2563eb';
    var tipoIcon = tipo === 'formado' ? 'fa-graduation-cap' : 'fa-user';

    document.getElementById('chat-p-header').style.display = 'block';
    document.getElementById('chat-p-input-area').style.display = 'flex';
    document.getElementById('chat-p-user-avatar').textContent = initials;
    document.getElementById('chat-p-user-name').innerHTML = (nome || '---') + ' <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:' + tipoColor + '22;color:' + tipoColor + ';border:1px solid ' + tipoColor + '44;margin-left:6px"><i class="fa-solid ' + tipoIcon + '" style="margin-right:3px"></i>' + tipoLabel + '</span>';
    document.getElementById('chat-p-user-info').textContent = 'CPF: ' + cpfDisp;

    dbFirestore.collection('chatAdmin').doc(cpf).set({
        cpf: cpf,
        nome: nome,
        tipo: tipo,
        naoLidas: 0
    }, { merge: true });

    if (chatPortaisMsgUnsub) chatPortaisMsgUnsub();
    var msgEl = document.getElementById('chat-p-messages');
    msgEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    chatPortaisMsgUnsub = dbFirestore.collection('chatAdmin').doc(cpf).collection('msgs').orderBy('hora').onSnapshot(function(snap) {
        msgEl.innerHTML = '';
        if (snap.empty) {
            msgEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px">Nenhuma mensagem ainda. Envie a primeira mensagem!</div>';
            return;
        }
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) {
            var m = doc.data();
            m._docId = doc.id;
            if (m.remetente !== 'admin' && !m.lida) {
                batch.set(doc.ref, { lida: true }, { merge: true });
            }
            if (m.apagada) return;
            var isAdmin = m.remetente === 'admin';
            var bubble = document.createElement('div');
            bubble.className = 'chat-p-bubble-wrap';
            bubble.style.cssText = 'max-width:70%;margin-bottom:12px;position:relative;' + (isAdmin ? 'margin-left:auto;text-align:right' : '');

            var tipoRemetente = m.tipo || (m.remetente === 'admin' ? 'admin' : tipo || 'aluno');
            var remetenteLabel = '';
            var remetenteColor = '';
            if (isAdmin) {
                remetenteLabel = '<i class="fa-solid fa-shield-halved" style="margin-right:3px"></i> Administracao FARN';
                remetenteColor = '#16a34a';
            } else if (tipoRemetente === 'formado') {
                remetenteLabel = '<i class="fa-solid fa-graduation-cap" style="margin-right:3px"></i> Portal do Formado';
                remetenteColor = '#16a34a';
            } else {
                remetenteLabel = '<i class="fa-solid fa-user" style="margin-right:3px"></i> Portal do Aluno';
                remetenteColor = '#2563eb';
            }

            var time = m.hora ? new Date(m.hora.seconds ? m.hora.seconds * 1000 : m.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            var bg = isAdmin ? 'background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-radius:12px 12px 2px 12px' : 'background:#ffffff;border:1px solid #e2e8f0;border-radius:12px 12px 12px 2px;color:#1e293b';
            var editLabel = m.editado ? '<span style="font-size:9px;opacity:.6;font-style:italic">(editado)</span> ' : '';
            var senderLabel = '<div style="font-size:11px;color:' + remetenteColor + ';margin-bottom:2px">' + remetenteLabel + '</div>';

            var actionsHtml = '';
            if (isAdmin) {
                actionsHtml = '<div class="chat-p-msg-actions" style="display:none;position:absolute;top:-8px;' + (isAdmin ? 'left:-8px' : 'right:-8px') + ';background:#f0fdf4;border:1px solid #e2e8f0;border-radius:8px;padding:2px;gap:2px;z-index:5">' +
                    '<button onclick="event.stopPropagation();chatPortaisEditMsg(\'' + m._docId + '\',\'' + (m.texto || '').replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\')" title="Editar" style="background:none;border:none;color:#2563eb;cursor:pointer;padding:4px 6px;font-size:11px;border-radius:4px" onmouseover="this.style.background=\'rgba(37,99,235,.1)\'" onmouseout="this.style.background=\'none\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="event.stopPropagation();chatPortaisDeleteMsg(\'' + m._docId + '\')" title="Apagar para mim" style="background:none;border:none;color:#dc2626;cursor:pointer;padding:4px 6px;font-size:11px;border-radius:4px" onmouseover="this.style.background=\'rgba(220,38,38,.1)\'" onmouseout="this.style.background=\'none\'"><i class="fa-solid fa-trash"></i></button>' +
                    '</div>';
            }

            bubble.innerHTML = senderLabel +
                '<div style="padding:10px 14px;' + bg + ';position:relative">' + editLabel + (m.texto || '') + actionsHtml + '</div>' +
                '<div style="font-size:10px;color:#64748b;margin-top:2px">' + time + '</div>';
            msgEl.appendChild(bubble);
        });
        batch.commit().catch(function() {});
        msgEl.scrollTop = msgEl.scrollHeight;
    }, function() {
        msgEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar mensagens</div>';
    });

    chatPortaisRenderList(chatPortaisList);
    document.getElementById('chat-p-input').focus();
}

function chatPortaisGerarGrupos() {
    var modal = document.getElementById('chat-p-grupos-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'chat-p-grupos-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);overflow-y:auto;padding:20px';
        modal.onclick = function(e) { if (e.target === modal) chatPortaisFecharGrupos(); };
        modal.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:700px;margin:0 auto;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden">' +
            '<div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:20px 24px;display:flex;justify-content:space-between;align-items:center">' +
            '<div><div style="font-size:18px;font-weight:700;color:#fff"><i class="fa-solid fa-users" style="margin-right:8px"></i> Grupos por Turma</div>' +
            '<div style="font-size:12px;color:#bfdbfe;margin-top:2px">Gerencie conversas em grupo por turma</div></div>' +
            '<button onclick="chatPortaisFecharGrupos()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div id="chat-p-grupos-list" style="padding:16px 20px;max-height:60vh;overflow-y:auto"></div>' +
            '<div style="padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:flex-end;gap:8px">' +
            '<button onclick="chatPortaisCriarTodosGrupos()" style="background:#2563eb;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-wand-magic-sparkles"></i> Criar Todos os Grupos</button>' +
            '<button onclick="chatPortaisFecharGrupos()" style="background:#e2e8f0;color:#475569;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Fechar</button></div></div>';
        document.body.appendChild(modal);
    }
    modal.style.display = 'block';
    document.getElementById('chat-p-grupos-list').innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando turmas...</div>';
    chatPortaisCarregarGrupos();
}

function chatPortaisFecharGrupos() {
    var modal = document.getElementById('chat-p-grupos-modal');
    if (modal) modal.style.display = 'none';
}

async function chatPortaisCarregarGrupos() {
    var container = document.getElementById('chat-p-grupos-list');
    try {
        var turSnap = await dbFirestore.collection('turmas').get();
        var turmas = [];
        turSnap.forEach(function(doc) { var t = doc.data(); t._id = doc.id; turmas.push(t); });

        var candSnap = await dbFirestore.collection('candidatos').get();
        var todosCand = [];
        candSnap.forEach(function(doc) { var c = doc.data(); c._docId = doc.id; todosCand.push(c); });

        var chatsSnap = await dbFirestore.collection('chatAdmin').where('tipo', '==', 'grupo').get();
        var gruposExistentes = {};
        chatsSnap.forEach(function(doc) { gruposExistentes[doc.id] = doc.data(); });

        if (!turmas.length) {
            container.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-layer-group" style="font-size:32px;display:block;margin-bottom:8px;opacity:.3"></i>Nenhuma turma encontrada</div>';
            return;
        }

        var html = '';
        turmas.forEach(function(t) {
            var turmaNome = t.nome || t.id || t._id;
            var alunos = todosCand.filter(function(c) { return c.turma === turmaNome; });
            var grupoId = 'grupo_' + turmaNome.replace(/\s+/g, '_').toUpperCase();
            var existe = !!gruposExistentes[grupoId];
            var msgCount = gruposExistentes[grupoId] ? (gruposExistentes[grupoId].totalMsgs || 0) : 0;
            var projeto = t.projeto || '';

            html += '<div style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid ' + (existe ? '#e2e8f0' : '#fde68a') + ';border-radius:12px;margin-bottom:10px;background:' + (existe ? '#fff' : '#fffbeb') + '">' +
                '<div style="width:44px;height:44px;border-radius:12px;background:' + (existe ? '#2563eb' : '#ca8a04') + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;flex-shrink:0"><i class="fa-solid fa-users"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                '<div style="font-weight:700;font-size:14px;color:#1e293b">' + turmaNome + '</div>' +
                '<div style="font-size:11px;color:#64748b">' + (projeto || 'Sem projeto') + ' &bull; ' + alunos.length + ' aluno(s)' + (existe ? ' &bull; ' + msgCount + ' msg(s)' : ' &bull; <span style="color:#ca8a04;font-weight:600">Nao criado</span>') + '</div>' +
                '</div>' +
                '<button onclick="chatPortaisAbrirGrupo(\'' + grupoId + '\',\'' + turmaNome.replace(/'/g, "\\'") + '\',' + JSON.stringify(alunos.map(function(a){return {cpf:a.cpf||a.id,nome:a.nome||''}})).replace(/"/g, '&quot;') + ')" style="background:' + (existe ? '#2563eb' : '#16a34a') + ';color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;display:flex;align-items:center;gap:5px"><i class="fa-solid ' + (existe ? 'fa-comment-dots' : 'fa-plus') + '"></i> ' + (existe ? 'Abrir' : 'Criar') + '</button>' +
                '</div>';
        });
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div style="text-align:center;color:#dc2626;padding:30px">Erro: ' + e.message + '</div>';
    }
}

async function chatPortaisCriarTodosGrupos() {
    var btn = event.target.closest('button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';
    try {
        var turSnap = await dbFirestore.collection('turmas').get();
        var candSnap = await dbFirestore.collection('candidatos').get();
        var chatsSnap = await dbFirestore.collection('chatAdmin').where('tipo', '==', 'grupo').get();
        var existentes = {};
        chatsSnap.forEach(function(doc) { existentes[doc.id] = true; });

        var todosCand = [];
        candSnap.forEach(function(doc) { var c = doc.data(); c._docId = doc.id; todosCand.push(c); });

        var criados = 0;
        turSnap.forEach(function(doc) {
            var t = doc.data();
            var turmaNome = t.nome || doc.id;
            var grupoId = 'grupo_' + turmaNome.replace(/\s+/g, '_').toUpperCase();
            if (existentes[grupoId]) return;

            var alunos = todosCand.filter(function(c) { return c.turma === turmaNome; });
            dbFirestore.collection('chatAdmin').doc(grupoId).set({
                tipo: 'grupo',
                nome: turmaNome,
                projeto: t.projeto || '',
                turma: turmaNome,
                membros: alunos.map(function(a) { return a.cpf || a._docId; }),
                nomesMembros: alunos.map(function(a) { return a.nome || ''; }),
                totalMsgs: 0,
                ultimaMsg: 'Grupo criado',
                ultimaHora: firebase.firestore.FieldValue.serverTimestamp(),
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            criados++;
        });

        alert(criados + ' grupo(s) criado(s) com sucesso!');
        chatPortaisCarregarGrupos();
    } catch(e) {
        alert('Erro ao criar grupos: ' + e.message);
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Criar Todos os Grupos';
}

function chatPortaisAbrirGrupo(grupoId, turmaNome, membros) {
    chatPortaisFecharGrupos();
    chatPortaisSelected = grupoId;
    chatPortaisGrupoMembros = membros;
    chatPortaisGrupoTurma = turmaNome;
    chatPortaisEditingMsg = null;

    var initials = turmaNome.substring(0, 2).toUpperCase();

    document.getElementById('chat-p-header').style.display = 'block';
    document.getElementById('chat-p-input-area').style.display = 'flex';
    document.getElementById('chat-p-user-avatar').textContent = initials;
    document.getElementById('chat-p-user-avatar').style.background = '#2563eb';
    document.getElementById('chat-p-user-name').innerHTML = '<i class="fa-solid fa-users" style="margin-right:6px"></i>' + turmaNome + ' <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:rgba(37,99,235,.12);color:#2563eb;border:1px solid rgba(37,99,235,.3);margin-left:6px"><i class="fa-solid fa-users" style="margin-right:3px"></i>Grupo</span>';
    document.getElementById('chat-p-user-info').textContent = membros.length + ' membro(s) &bull; Chat em grupo';

    chatPortaisFilter();

    var msgEl = document.getElementById('chat-p-messages');
    msgEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    if (chatPortaisMsgUnsub) chatPortaisMsgUnsub();
    chatPortaisMsgUnsub = dbFirestore.collection('chatAdmin').doc(grupoId).collection('msgs').orderBy('hora').onSnapshot(function(snap) {
        msgEl.innerHTML = '';
        if (snap.empty) {
            msgEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px">Nenhuma mensagem neste grupo</div>';
            return;
        }
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) {
            var m = doc.data();
            m._docId = doc.id;
            if (m.remetente !== 'admin' && !m.lida) {
                batch.set(doc.ref, { lida: true }, { merge: true });
            }
            if (m.apagada) return;
            var isAdmin = m.remetente === 'admin';
            var bubble = document.createElement('div');
            bubble.style.cssText = 'max-width:70%;margin-bottom:12px;position:relative;' + (isAdmin ? 'margin-left:auto;text-align:right' : '');

            var remetenteLabel = isAdmin ? '<i class="fa-solid fa-shield-halved" style="margin-right:3px"></i> Administracao FARN' : '<i class="fa-solid fa-user" style="margin-right:3px"></i> ' + (m.nome || 'Aluno');
            var remetenteColor = isAdmin ? '#16a34a' : '#2563eb';
            var time = m.hora ? new Date(m.hora.seconds ? m.hora.seconds * 1000 : m.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            var bg = isAdmin ? 'background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-radius:12px 12px 2px 12px' : 'background:#ffffff;border:1px solid #e2e8f0;border-radius:12px 12px 12px 2px;color:#1e293b';
            var editLabel = m.editado ? '<span style="font-size:9px;opacity:.6;font-style:italic">(editado)</span> ' : '';

            bubble.innerHTML = '<div style="font-size:11px;color:' + remetenteColor + ';margin-bottom:2px">' + remetenteLabel + '</div>' +
                '<div style="padding:10px 14px;' + bg + '">' + editLabel + (m.texto || '') + '</div>' +
                '<div style="font-size:10px;color:#64748b;margin-top:2px">' + time + '</div>';
            msgEl.appendChild(bubble);
        });
        batch.commit().catch(function() {});
        msgEl.scrollTop = msgEl.scrollHeight;
    }, function() {
        msgEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar mensagens</div>';
    });

    chatPortaisFilter();
    document.getElementById('chat-p-input').focus();
}

var chatPortaisGrupoMembros = [];
var chatPortaisGrupoTurma = '';

function chatPortaisSendGrupo(texto) {
    if (!texto || !chatPortaisSelected || !chatPortaisSelected.startsWith('grupo_')) return false;

    var msgData = {
        texto: texto,
        remetente: 'admin',
        nome: 'Administracao FARN',
        hora: firebase.firestore.FieldValue.serverTimestamp(),
        lida: false
    };

    dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).collection('msgs').add(msgData);
    dbFirestore.collection('chatAdmin').doc(chatPortaisSelected).set({
        ultimaMsg: texto,
        ultimaHora: firebase.firestore.FieldValue.serverTimestamp(),
        ultimaRemetente: 'admin',
        totalMsgs: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });

    if (chatPortaisGrupoMembros && chatPortaisGrupoMembros.length) {
        var fanMsg = {
            texto: texto,
            remetente: 'admin',
            nome: 'Administracao FARN',
            hora: firebase.firestore.FieldValue.serverTimestamp(),
            lida: false,
            grupo: chatPortaisGrupoTurma
        };
        var batch = dbFirestore.batch();
        var count = 0;
        chatPortaisGrupoMembros.forEach(function(m) {
            var cpf = m.cpf || m;
            var ref = dbFirestore.collection('chatAdmin').doc(String(cpf)).collection('msgs').doc();
            batch.set(ref, fanMsg);
            count++;
            dbFirestore.collection('chatAdmin').doc(String(cpf)).set({
                ultimaMsg: '[Grupo ' + chatPortaisGrupoTurma + '] ' + texto,
                ultimaHora: firebase.firestore.FieldValue.serverTimestamp(),
                ultimaRemetente: 'admin',
                nome: m.nome || cpf,
                cpf: String(cpf),
                tipo: 'aluno',
                projeto: '',
                naoLidas: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });
        });
        batch.commit().catch(function(e) { console.error('Erro fan-out grupo:', e); });
    }
    return true;
}
