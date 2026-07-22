/* ===== CHAT DOS PORTAIS - ADMIN ===== */
var chatPortaisUnsub = null;
var chatPortaisList = [];
var chatPortaisSelected = null;
var chatPortaisMsgUnsub = null;
var chatPortaisNotifUnsub = null;

function chatPortaisLoad() {
    if (chatPortaisUnsub) chatPortaisUnsub();
    var listEl = document.getElementById('chat-p-list');
    listEl.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando...</div>';

    chatPortaisUnsub = dbFirestore.collection('chatAdmin').orderBy('ultimaHora', 'desc').onSnapshot(function(snap) {
        chatPortaisList = [];
        listEl.innerHTML = '';
        if (snap.empty) {
            listEl.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-inbox"></i><br>Nenhuma conversa ainda</div>';
            chatPortaisUpdateBadge();
            return;
        }
        snap.forEach(function(doc) {
            var c = doc.data();
            c._id = doc.id;
            chatPortaisList.push(c);
        });
        chatPortaisRenderList(chatPortaisList);
        chatPortaisUpdateBadge();
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
        var tipoLabel = c.tipo === 'formado' ? 'Formado' : 'Aluno';
        var tipoColor = c.tipo === 'formado' ? '#4caf50' : '#2196f3';
        var tipoIcon = c.tipo === 'formado' ? 'fa-graduation-cap' : 'fa-user';
        var isSelected = chatPortaisSelected === c._id;
        var naoLidas = c.naoLidas || 0;
        var bgSel = isSelected ? 'background:#1a1a2e;' : '';

        var avatarBg = c.tipo === 'formado' ? '#2e7d32' : '#1565c0';

        var html = '<div class="chat-p-item" onclick="chatPortaisSelect(\'' + c._id + '\')" style="padding:14px 16px;border-bottom:1px solid #2a2a3a;cursor:pointer;transition:background .2s;' + bgSel + '" onmouseover="this.style.background=\'#1a1a2e\'" onmouseout="this.style.background=\'' + (isSelected ? '#1a1a2e' : 'transparent') + '\'">' +
            '<div style="display:flex;gap:12px;align-items:center">' +
            '<div style="width:44px;height:44px;border-radius:50%;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0;position:relative">' + initials +
            '<div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#0d1117;display:flex;align-items:center;justify-content:center"><i class="fa-solid ' + tipoIcon + '" style="font-size:9px;color:' + tipoColor + '"></i></div>' +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (naoLidas > 0 ? '#fff' : '#ddd') + '">' + (c.nome || '---') + '</span>' +
            '<span style="font-size:11px;color:#888;flex-shrink:0">' + timeStr + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;margin-top:2px">' +
            '<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;background:' + tipoColor + '22;color:' + tipoColor + ';border:1px solid ' + tipoColor + '44"><i class="fa-solid ' + tipoIcon + '" style="margin-right:3px"></i>' + tipoLabel + '</span>' +
            '<span style="font-size:11px;color:#666">' + cpfDisp + '</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">' +
            '<span style="font-size:12px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">' + (c.ultimaMsg || '') + '</span>' +
            (naoLidas > 0 ? '<span style="background:#f44336;color:#fff;font-size:10px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:8px;padding:0 6px">' + naoLidas + '</span>' : '') +
            '</div>' +
            '</div></div></div>';
        listEl.innerHTML += html;
    });
}

function chatPortaisFilter() {
    var q = (document.getElementById('chat-p-search').value || '').toLowerCase();
    if (!q) { chatPortaisRenderList(chatPortaisList); return; }
    var filtered = chatPortaisList.filter(function(c) {
        return (c.nome || '').toLowerCase().includes(q) || (c.cpf || '').includes(q);
    });
    chatPortaisRenderList(filtered);
}

function chatPortaisSelect(cpf) {
    chatPortaisSelected = cpf;
    var user = chatPortaisList.find(function(c) { return c._id === cpf; });
    if (!user) return;

    var initials = (user.nome || '??').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
    var cpfDisp = user.cpf || '';
    if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    var tipoLabel = user.tipo === 'formado' ? 'Formado' : 'Aluno';
    var tipoColor = user.tipo === 'formado' ? '#4caf50' : '#2196f3';
    var tipoIcon = user.tipo === 'formado' ? 'fa-graduation-cap' : 'fa-user';

    document.getElementById('chat-p-header').style.display = 'block';
    document.getElementById('chat-p-input-area').style.display = 'flex';
    document.getElementById('chat-p-user-avatar').textContent = initials;
    document.getElementById('chat-p-user-name').innerHTML = (user.nome || '---') + ' <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:' + tipoColor + '22;color:' + tipoColor + ';border:1px solid ' + tipoColor + '44;margin-left:6px"><i class="fa-solid ' + tipoIcon + '" style="margin-right:3px"></i>' + tipoLabel + '</span>';
    document.getElementById('chat-p-user-info').textContent = 'CPF: ' + cpfDisp + ' | Projeto: ' + (user.projeto || '---');

    chatPortaisRenderList(chatPortaisList);

    dbFirestore.collection('chatAdmin').doc(cpf).set({ naoLidas: 0 }, { merge: true });

    if (chatPortaisMsgUnsub) chatPortaisMsgUnsub();
    var msgEl = document.getElementById('chat-p-messages');
    msgEl.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    chatPortaisMsgUnsub = dbFirestore.collection('chatAdmin').doc(cpf).collection('msgs').orderBy('hora').onSnapshot(function(snap) {
        msgEl.innerHTML = '';
        if (snap.empty) {
            msgEl.innerHTML = '<div style="text-align:center;color:#666;padding:30px">Nenhuma mensagem</div>';
            return;
        }
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) {
            var m = doc.data();
            if (m.remetente !== 'admin' && !m.lida) {
                batch.set(doc.ref, { lida: true }, { merge: true });
            }
            var isAdmin = m.remetente === 'admin';
            var bubble = document.createElement('div');
            bubble.style.cssText = 'max-width:70%;margin-bottom:12px;' + (isAdmin ? 'margin-left:auto;text-align:right' : '');

            var tipoRemetente = m.tipo || (m.remetente === 'admin' ? 'admin' : user.tipo || 'aluno');
            var remetenteLabel = '';
            var remetenteColor = '';
            if (isAdmin) {
                remetenteLabel = '<i class="fa-solid fa-shield-halved" style="margin-right:3px"></i> Administracao FARN';
                remetenteColor = '#ff9800';
            } else if (tipoRemetente === 'formado') {
                remetenteLabel = '<i class="fa-solid fa-graduation-cap" style="margin-right:3px"></i> Portal do Formado';
                remetenteColor = '#4caf50';
            } else {
                remetenteLabel = '<i class="fa-solid fa-user" style="margin-right:3px"></i> Portal do Aluno';
                remetenteColor = '#2196f3';
            }

            var time = m.hora ? new Date(m.hora.seconds ? m.hora.seconds * 1000 : m.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            var bg = isAdmin ? 'background:#f57c00;color:#fff;border-radius:12px 12px 2px 12px' : 'background:#1a1a2e;border:1px solid #2a2a3a;border-radius:12px 12px 12px 2px';
            var senderLabel = '<div style="font-size:11px;color:' + remetenteColor + ';margin-bottom:2px">' + remetenteLabel + '</div>';
            bubble.innerHTML = senderLabel +
                '<div style="padding:10px 14px;' + bg + '">' + (m.texto || '') + '</div>' +
                '<div style="font-size:10px;color:#666;margin-top:2px">' + time + '</div>';
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
    input.value = '';

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
