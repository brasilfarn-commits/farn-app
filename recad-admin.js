/* ===== CAMPANHA RECADASTRAMENTO DE FORMADOS ===== */

var recadData = [];

function recadGetBaseUrl() {
    return window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '/') + 'recadastramento.html';
}

function recadCopyLink() {
    var url = recadGetBaseUrl();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function() {
            alert('Link copiado para a area de transferencia!\n\n' + url);
        });
    } else {
        prompt('Copie o link abaixo:', url);
    }
}

function recadOpenLink() {
    window.open(recadGetBaseUrl(), '_blank');
}

async function recadLoadAll() {
    try {
        var snap = await dbFirestore.collection('recadastramentos').orderBy('dataHoraCadastro', 'desc').get();
        recadData = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            d._docId = doc.id;
            recadData.push(d);
        });
        recadRenderTable();
        recadUpdateCounts();
        recadPopulateProjectFilter();
    } catch (e) {
        console.error('Erro ao carregar recadastramentos:', e);
    }
}

function recadRenderTable() {
    var tbody = document.getElementById('rc-table-body');
    var empty = document.getElementById('rc-empty');
    if (!tbody) return;
    var search = (document.getElementById('rc-search').value || '').toLowerCase();
    var filterStatus = document.getElementById('rc-filter-status').value;
    var filterProjeto = document.getElementById('rc-filter-projeto').value;

    var filtered = recadData.filter(function(r) {
        var matchSearch = !search || (r.nome || '').toLowerCase().includes(search) || (r.cpf || '').includes(search) || (r.projeto || '').toLowerCase().includes(search);
        var matchStatus = !filterStatus || r.status === filterStatus;
        var matchProjeto = !filterProjeto || r.projeto === filterProjeto;
        return matchSearch && matchStatus && matchProjeto;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = filtered.map(function(r) {
        var cpf = r.cpf || '';
        if (cpf.length === 11) cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        var cidadeUf = (r.cidade || '') + (r.estado ? '/' + r.estado : '');
        var dataEnvio = r.dataHoraCadastro ? new Date(r.dataHoraCadastro).toLocaleDateString('pt-BR') : '---';
        var statusColor = r.status === 'Ativo' ? '#4caf50' : r.status === 'Rejeitado' ? '#f44336' : '#ffc107';
        var statusBg = r.status === 'Ativo' ? 'rgba(76,175,80,.15)' : r.status === 'Rejeitado' ? 'rgba(244,67,54,.15)' : 'rgba(255,193,7,.15)';
        var docId = r._docId;
        return '<tr>' +
            '<td style="font-weight:600">' + (r.nome || '---') + '</td>' +
            '<td>' + cpf + '</td>' +
            '<td>' + (r.matricula || '---') + '</td>' +
            '<td>' + (r.projeto || '---') + '</td>' +
            '<td>' + cidadeUf + '</td>' +
            '<td>' + dataEnvio + '</td>' +
            '<td><span style="background:' + statusBg + ';color:' + statusColor + ';padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">' + (r.status || 'Pendente') + '</span>' + (r.mensagemAdmin ? ' <i class="fa-solid fa-envelope" style="color:#2563eb;margin-left:4px;font-size:11px" title="Mensagem enviada"></i>' : '') + '</td>' +
            '<td style="white-space:nowrap">' +
            '<button class="btn-outline btn-sm" onclick="recadViewDetail(\'' + docId + '\')" title="Ver detalhes"><i class="fa-solid fa-eye"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadEdit(\'' + docId + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadDelete(\'' + docId + '\')" title="Excluir" style="color:#f44336;border-color:#f44336"><i class="fa-solid fa-trash"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadPrint(\'' + docId + '\')" title="Imprimir"><i class="fa-solid fa-print"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadEnviarMensagem(\'' + docId + '\')" title="Enviar mensagem" style="color:#2563eb;border-color:#2563eb"><i class="fa-solid fa-envelope"></i></button> ' +
            '</td>' +
            '</tr>';
    }).join('');
}

function recadFilter() {
    recadRenderTable();
}

function recadEnviarMensagem(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    var nome = r.nome || '---';
    var msgAtual = r.mensagemAdmin || '';
    var novaMsg = prompt('Enviar mensagem para: ' + nome + '\n\nMensagem atual: ' + (msgAtual || '(nenhuma)') + '\n\nDigite a mensagem (deixe vazio para remover):', msgAtual);
    if (novaMsg === null) return;
    novaMsg = novaMsg.trim();
    var updateData = { mensagemAdmin: novaMsg };
    dbFirestore.collection('recadastramentos').doc(docId).update(updateData).then(function() {
        r.mensagemAdmin = novaMsg;
        recadRenderTable();
        alert(novaMsg ? 'Mensagem enviada com sucesso!' : 'Mensagem removida com sucesso!');
    }).catch(function(e) {
        alert('Erro ao enviar mensagem: ' + e.message);
    });
}

function recadPopulateProjectFilter() {
    var sel = document.getElementById('rc-filter-projeto');
    if (!sel) return;
    var projetos = [];
    recadData.forEach(function(r) {
        if (r.projeto && projetos.indexOf(r.projeto) === -1) projetos.push(r.projeto);
    });
    projetos.sort();
    sel.innerHTML = '<option value="">Todos os projetos</option>';
    projetos.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
    });
}

function recadUpdateCounts() {
    var total = recadData.length;
    var pendentes = recadData.filter(function(r) { return r.status === 'Pendente'; }).length;
    var aprovados = recadData.filter(function(r) { return r.status === 'Ativo'; }).length;
    var rejeitados = recadData.filter(function(r) { return r.status === 'Rejeitado'; }).length;
    var elTotal = document.getElementById('rc-total-count');
    var elPend = document.getElementById('rc-pendente-count');
    var elAprov = document.getElementById('rc-aprovado-count');
    var elRej = document.getElementById('rc-rejeitado-count');
    if (elTotal) elTotal.textContent = total;
    if (elPend) elPend.textContent = pendentes;
    if (elAprov) elAprov.textContent = aprovados;
    if (elRej) elRej.textContent = rejeitados;
}

function recadViewDetail(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    var cpf = r.cpf || '';
    if (cpf.length === 11) cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    var dataEnvio = r.dataHoraCadastro ? new Date(r.dataHoraCadastro).toLocaleString('pt-BR') : '---';
    var statusColor = r.status === 'Ativo' ? '#4caf50' : r.status === 'Rejeitado' ? '#f44336' : '#ffc107';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">' +
        '<div><h2 style="color:#f57c00;margin:0">' + (r.nome || '---') + '</h2><p style="color:#888;font-size:13px;margin:4px 0 0">Enviado em: ' + dataEnvio + '</p></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn-primary btn-sm" onclick="recadEditInline(\'' + docId + '\')" style="background:#2196f3"><i class="fa-solid fa-pen"></i> Editar</button>' +
            '<button class="btn-primary btn-sm" onclick="recadUpdateStatus(\'' + docId + '\',\'Ativo\')" style="background:#4caf50"><i class="fa-solid fa-check"></i> Ativar</button>' +
            '<button class="btn-primary btn-sm" onclick="recadUpdateStatus(\'' + docId + '\',\'Rejeitado\')" style="background:#f44336"><i class="fa-solid fa-xmark"></i> Rejeitar</button>' +
            '<button class="btn-primary btn-sm" onclick="recadUpdateStatus(\'' + docId + '\',\'Pendente\')" style="background:#ffc107;color:#000"><i class="fa-solid fa-hourglass-half"></i> Pendente</button>' +
        '</div>' +
    '</div>';

    if (r.mensagemAdmin) {
        html += '<div style="margin:16px 0;padding:16px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);border-radius:12px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<div><i class="fa-solid fa-envelope" style="color:#2563eb;margin-right:6px"></i><strong style="color:#2563eb;font-size:13px">Mensagem para o aluno:</strong></div>' +
            '<button class="btn-outline btn-sm" onclick="recadEnviarMensagem(\'' + docId + '\')" style="font-size:11px;padding:3px 8px"><i class="fa-solid fa-pen"></i> Editar</button>' +
            '</div>' +
            '<p style="color:#1e293b;font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap">' + r.mensagemAdmin + '</p>' +
            '</div>';
    }

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

    function detailSection(icon, title, fields) {
        var s = '<div class="recad-section" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.1)">' +
            '<i class="fa-solid ' + icon + '" style="color:#f57c00"></i><h3 style="color:#f57c00;font-size:15px">' + title + '</h3></div>';
        fields.forEach(function(f) {
            var val = f.val || '---';
            if (val !== '---' && f.type === 'img') {
                var fieldKey = f.field || 'certificadoFrente';
                s += '<div style="margin-bottom:10px"><label style="font-size:12px;color:#888;display:block;margin-bottom:4px">' + f.label + '</label>' +
                    '<img src="' + val + '" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid rgba(255,255,255,.1);cursor:pointer;transition:transform .2s" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'" onclick="event.stopPropagation();recadOpenPhoto(\'' + val.replace(/'/g, "\\'") + '\',\'' + f.label.replace(/'/g, "\\'") + '\',\'' + docId + '\',\'' + fieldKey + '\')"></div>';
            } else {
                s += '<div style="margin-bottom:8px"><label style="font-size:12px;color:#888;display:block">' + f.label + '</label>' +
                    '<span style="color:#fff;font-size:14px;font-weight:600">' + val + '</span></div>';
            }
        });
        s += '</div>';
        return s;
    }

    html += detailSection('fa-folder-open', 'Projeto', [
        { label: 'Projeto', val: r.projeto },
        { label: 'Matricula', val: r.matricula || '---' }
    ]);

    html += detailSection('fa-user', 'Dados Pessoais', [
        { label: 'Nome Completo', val: r.nome },
        { label: 'CPF', val: cpf },
        { label: 'RG', val: r.rg },
        { label: 'Data de Nascimento', val: r.nascimento },
        { label: 'Idade', val: r.idade },
        { label: 'Genero de Nascimento', val: r.genero },
        { label: 'Estado Civil', val: r.estadoCivil },
        { label: 'Nacionalidade', val: r.nacionalidade },
        { label: 'Naturalidade', val: r.naturalidade },
        { label: 'Mae', val: r.mae },
        { label: 'Pai', val: r.pai },
        { label: 'Profissao', val: r.profissao },
        { label: 'Titulo de Eleitor', val: r.titulo }
    ]);

    html += detailSection('fa-address-book', 'Contato', [
        { label: 'Email', val: r.email },
        { label: 'WhatsApp', val: r.whatsapp }
    ]);

    html += detailSection('fa-location-dot', 'Endereco', [
        { label: 'Endereco', val: r.endereco },
        { label: 'Numero', val: r.numero },
        { label: 'Bairro', val: r.bairro },
        { label: 'Cidade', val: r.cidade },
        { label: 'Estado', val: r.estado }
    ]);

    html += detailSection('fa-heart-pulse', 'Dados Fisicos', [
        { label: 'Altura', val: r.altura ? r.altura + ' cm' : null },
        { label: 'Peso', val: r.peso ? r.peso + ' kg' : null },
        { label: 'Fator RH', val: r.fatorRh },
        { label: 'Hipertensao', val: r.hipertensao },
        { label: 'Diabetes', val: r.diabetes },
        { label: 'Deficiencia', val: r.deficiencia },
        { label: 'Tatuagem', val: r.tatuagem },
        { label: 'Cirurgia', val: r.cirurgia },
        { label: 'Alcool', val: r.alcool },
        { label: 'Medicamento', val: r.medicamento },
        { label: 'Cansaco', val: r.cansaco }
    ]);

    html += detailSection('fa-certificate', 'Certificado', [
        { label: 'Data de Emissao', val: r.dataCertificado },
        { label: 'Foto Frente', val: r.certificadoFrente, type: 'img', field: 'certificadoFrente' },
        { label: 'Foto Verso', val: r.certificadoVerso, type: 'img', field: 'certificadoVerso' }
    ]);

    html += detailSection('fa-lock', 'Senha de Acesso', [
        { label: 'Senha', val: r.senha ? '******' : '---' }
    ]);

    html += detailSection('fa-shirt', 'Uniforme', [
        { label: 'Calca', val: r.calca },
        { label: 'Camisa', val: r.camisa },
        { label: 'Calcado', val: r.calcado }
    ]);

    html += '</div>';

    document.getElementById('rc-detalhe-body').innerHTML = html;
    showAdminSection('admin-recad-detalhe');
}

async function recadUpdateStatus(docId, newStatus) {
    var msg = newStatus === 'Ativo' ? 'Ativar' : newStatus === 'Rejeitado' ? 'Rejeitar' : 'Marcar como Pendente';
    if (!confirm(msg + ' este recadastramento?')) return;
    try {
        var updateData = { status: newStatus };

        if (newStatus === 'Ativo') {
            var r = recadData.find(function(x) { return x._docId === docId; });
            if (r) {
                var cpf = (r.cpf || '').replace(/\D/g, '');
                var ultimos5 = cpf.slice(-5);
                var ano = r.dataCertificado ? new Date(r.dataCertificado).getFullYear() : new Date().getFullYear();
                updateData.matricula = ano + ultimos5;
            }
        }

        await dbFirestore.collection('recadastramentos').doc(docId).update(updateData);
        var r2 = recadData.find(function(x) { return x._docId === docId; });
        if (r2) {
            r2.status = newStatus;
            if (updateData.matricula) r2.matricula = updateData.matricula;
        }
        recadRenderTable();
        recadUpdateCounts();
        recadViewDetail(docId);
        alert('Status atualizado com sucesso!' + (updateData.matricula ? '\nMatricula gerada: ' + updateData.matricula : ''));
    } catch (e) {
        console.error('Erro ao atualizar status:', e);
        alert('Erro ao atualizar status: ' + e.message);
    }
}

function recadExportExcel() {
    if (recadData.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }
    var rows = recadData.map(function(r) {
        var cpf = r.cpf || '';
        if (cpf.length === 11) cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        return {
            'Nome': r.nome || '',
            'CPF': cpf,
            'Projeto': r.projeto || '',
            'Matricula': r.matricula || '',
            'RG': r.rg || '',
            'Nascimento': r.nascimento || '',
            'Idade': r.idade || '',
            'Genero de Nascimento': r.genero || '',
            'Estado Civil': r.estadoCivil || '',
            'Email': r.email || '',
            'WhatsApp': r.whatsapp || '',
            'Cidade': r.cidade || '',
            'Estado': r.estado || '',
            'Data Certificado': r.dataCertificado || '',
            'Senha': r.senha || '',
            'Status': r.status || '',
            'Data Envio': r.dataHoraCadastro || ''
        };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recadastramentos');
    XLSX.writeFile(wb, 'recadastramento_formados.xlsx');
}

function recadEdit(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    recadViewDetail(docId);
    setTimeout(function() {
        var body = document.getElementById('rc-detalhe-body');
        if (!body) return;
        var html = '<div style="display:grid;gap:12px">';
        var fields = [
            { key: 'nome', label: 'Nome Completo', type: 'text' },
            { key: 'cpf', label: 'CPF', type: 'text' },
            { key: 'rg', label: 'RG', type: 'text' },
            { key: 'nascimento', label: 'Nascimento', type: 'date' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
            { key: 'projeto', label: 'Projeto', type: 'text' },
            { key: 'matricula', label: 'Matricula', type: 'text' },
            { key: 'endereco', label: 'Endereco', type: 'text' },
            { key: 'numero', label: 'Numero', type: 'text' },
            { key: 'bairro', label: 'Bairro', type: 'text' },
            { key: 'cidade', label: 'Cidade', type: 'text' },
            { key: 'estado', label: 'Estado', type: 'text' },
            { key: 'dataCertificado', label: 'Data Certificado', type: 'date' },
            { key: 'senha', label: 'Senha', type: 'text' }
        ];
        fields.forEach(function(f) {
            html += '<div><label style="font-size:12px;color:#aaa;display:block;margin-bottom:4px">' + f.label + '</label>' +
                '<input type="' + f.type + '" id="rc-edit-' + f.key + '" value="' + (r[f.key] || '').toString().replace(/"/g, '&quot;') + '" class="config-input" style="width:100%"></div>';
        });
        html += '</div>' +
            '<div style="margin-top:16px;display:flex;gap:8px">' +
            '<button class="btn-primary" onclick="recadSaveEdit(\'' + docId + '\')"><i class="fa-solid fa-check"></i> Salvar</button>' +
            '<button class="btn-outline" onclick="recadViewDetail(\'' + docId + '\')"><i class="fa-solid fa-xmark"></i> Cancelar</button>' +
            '</div>';
        body.innerHTML = html;
    }, 100);
}

async function recadSaveEdit(docId) {
    var updates = {};
    var fields = ['nome','cpf','rg','nascimento','email','whatsapp','projeto','matricula','endereco','numero','bairro','cidade','estado','dataCertificado','senha'];
    fields.forEach(function(f) {
        var el = document.getElementById('rc-edit-' + f);
        if (el) updates[f] = el.value.trim();
    });
    try {
        await dbFirestore.collection('recadastramentos').doc(docId).update(updates);
        var r = recadData.find(function(x) { return x._docId === docId; });
        if (r) Object.assign(r, updates);
        recadRenderTable();
        recadViewDetail(docId);
        alert('Dados atualizados com sucesso!');
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    }
}

async function recadDelete(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    var nome = r ? r.nome : '';
    if (!confirm('Excluir o recadastramento de "' + nome + '"?\nEsta acao nao pode ser desfeita.')) return;
    try {
        await dbFirestore.collection('recadastramentos').doc(docId).delete();
        recadData = recadData.filter(function(x) { return x._docId !== docId; });
        recadRenderTable();
        recadUpdateCounts();
        showAdminSection('admin-recadastramento');
        alert('Excluido com sucesso!');
    } catch (e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

function recadPrint(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    var cpf = r.cpf || '';
    if (cpf.length === 11) cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    var printHtml = '<html><head><title>Ficha de Recadastramento</title>' +
        '<style>body{font-family:Arial,sans-serif;padding:30px;color:#333}' +
        'h2{text-align:center;color:#f57c00;margin-bottom:4px}h3{text-align:center;font-size:13px;color:#666;margin-bottom:20px}' +
        '.field{margin-bottom:8px}.label{font-weight:700;font-size:12px;color:#555}.val{font-size:14px}' +
        '.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
        '.full{grid-column:1/-1}.status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700}' +
        '.ativo{background:#e8f5e9;color:#2e7d32}.pendente{background:#fff8e1;color:#f57f17}.rejeitado{background:#ffebee;color:#c62828}' +
        '.footer{text-align:center;margin-top:30px;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:10px}' +
        '</style></head><body>' +
        '<img src="logo-farn.png.png" style="width:60px;display:block;margin:0 auto 10px">' +
        '<h2>FARN - Ficha de Recadastramento</h2>' +
        '<h3>Forca Auxiliar de Resgate Nacional</h3>';
    printHtml += '<div class="status ' + (r.status === 'Ativo' ? 'ativo' : r.status === 'Rejeitado' ? 'rejeitado' : 'pendente') + '">' +
        'Status: ' + (r.status || 'Pendente') + '</div>';
    if (r.matricula) printHtml += '<p style="font-size:16px;font-weight:700;margin-top:12px">Matricula: ' + r.matricula + '</p>';
    printHtml += '<div class="grid" style="margin-top:16px">';
    var pFields = [
        { l: 'Nome Completo', v: r.nome, full: true },
        { l: 'CPF', v: cpf },
        { l: 'RG', v: r.rg },
        { l: 'Nascimento', v: r.nascimento },
        { l: 'Idade', v: r.idade },
        { l: 'Genero de Nascimento', v: r.genero },
        { l: 'Estado Civil', v: r.estadoCivil },
        { l: 'Nacionalidade', v: r.nacionalidade },
        { l: 'Naturalidade', v: r.naturalidade },
        { l: 'Mae', v: r.mae, full: true },
        { l: 'Pai', v: r.pai, full: true },
        { l: 'Profissao', v: r.profissao },
        { l: 'Titulo', v: r.titulo },
        { l: 'Email', v: r.email, full: true },
        { l: 'WhatsApp', v: r.whatsapp },
        { l: 'Projeto', v: r.projeto },
        { l: 'Matricula', v: r.matricula },
        { l: 'Endereco', v: (r.endereco||'') + ', ' + (r.numero||'') + ' - ' + (r.bairro||'') + ' - ' + (r.cidade||'') + '/' + (r.estado||''), full: true },
        { l: 'Altura', v: r.altura ? r.altura + ' cm' : '' },
        { l: 'Peso', v: r.peso ? r.peso + ' kg' : '' },
        { l: 'Fator RH', v: r.fatorRh },
        { l: 'Hipertensao', v: r.hipertensao },
        { l: 'Diabetes', v: r.diabetes },
        { l: 'Deficiencia', v: r.deficiencia },
        { l: 'Tatuagem', v: r.tatuagem },
        { l: 'Cirurgia', v: r.cirurgia },
        { l: 'Data Certificado', v: r.dataCertificado },
        { l: 'Tamanho Uniforme', v: r.tamanhoUniforme }
    ];
    pFields.forEach(function(f) {
        if (!f.v) return;
        printHtml += '<div class="field' + (f.full ? ' full' : '') + '"><div class="label">' + f.l + '</div><div class="val">' + f.v + '</div></div>';
    });
    printHtml += '</div>';
    printHtml += '<div class="footer">FARN - Forca Auxiliar de Resgate Nacional - BRASIL<br>Documento gerado em ' + new Date().toLocaleDateString('pt-BR') + '</div>';
    printHtml += '</body></html>';
    var win = window.open('', '_blank');
    win.document.write(printHtml);
    win.document.close();
    win.print();
}

/* ===== RECAD PHOTO VIEWER STATE ===== */
var recadPhotoState = { rotation: 0, zoom: 1, dragX: 0, dragY: 0, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, pinchDist: 0 };
var recadPhotoOriginalSrc = '';
var recadPhotoDocId = '';
var recadPhotoField = '';

function recadOpenPhoto(src, label, docId, field) {
    var modal = document.getElementById('recad-photo-modal');
    var img = document.getElementById('recad-photo-modal-img');
    var lbl = document.getElementById('recad-photo-modal-label');
    if (!modal || !img) return;
    recadPhotoOriginalSrc = src;
    recadPhotoDocId = docId || '';
    recadPhotoField = field || 'certificadoFrente';
    recadPhotoState = { rotation: 0, zoom: 1, dragX: 0, dragY: 0, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, pinchDist: 0 };
    img.src = src;
    img.style.transform = 'rotate(0deg) scale(1) translate(0px, 0px)';
    if (lbl) lbl.textContent = label || '';
    modal.style.display = 'flex';
    var saveBtn = document.getElementById('recad-photo-save-btn');
    if (saveBtn) saveBtn.style.display = recadPhotoDocId ? '' : 'none';
    recadPhotoShowZoom();
    img.onload = function() { recadPhotoCenter(); };
}

function recadClosePhoto(e) {
    if (e && e.target && e.target.id !== 'recad-photo-modal' && e.target.id !== 'recad-photo-viewport') return;
    var modal = document.getElementById('recad-photo-modal');
    if (modal) modal.style.display = 'none';
    recadPhotoState.dragging = false;
}

function recadPhotoApply() {
    var img = document.getElementById('recad-photo-modal-img');
    if (!img) return;
    img.style.transform = 'rotate(' + recadPhotoState.rotation + 'deg) scale(' + recadPhotoState.zoom + ') translate(' + recadPhotoState.dragX + 'px, ' + recadPhotoState.dragY + 'px)';
}

function recadPhotoCenter() {
    var viewport = document.getElementById('recad-photo-viewport');
    var img = document.getElementById('recad-photo-modal-img');
    if (!viewport || !img) return;
    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var fitZoom = Math.min((vw - 40) / iw, (vh - 40) / ih, 1);
    recadPhotoState.zoom = fitZoom;
    recadPhotoState.dragX = 0;
    recadPhotoState.dragY = 0;
    recadPhotoState.rotation = 0;
    recadPhotoApply();
    recadPhotoShowZoom();
}

function recadPhotoRotate(deg) {
    recadPhotoState.rotation = (recadPhotoState.rotation + deg) % 360;
    recadPhotoApply();
}

function recadPhotoZoom(delta) {
    var newZoom = recadPhotoState.zoom + delta;
    newZoom = Math.max(0.1, Math.min(5, newZoom));
    recadPhotoState.zoom = newZoom;
    recadPhotoApply();
    recadPhotoShowZoom();
}

function recadPhotoReset() {
    recadPhotoCenter();
}

function recadPhotoShowZoom() {
    var indicator = document.getElementById('recad-photo-zoom-indicator');
    if (!indicator) return;
    indicator.textContent = Math.round(recadPhotoState.zoom * 100) + '%';
    indicator.style.display = '';
    clearTimeout(recadPhotoState._zoomTimer);
    recadPhotoState._zoomTimer = setTimeout(function() { indicator.style.display = 'none'; }, 1500);
}

/* Drag */
function recadPhotoDragStart(e) {
    if (e.target.closest('.recad-photo-ctrl')) return;
    e.preventDefault();
    recadPhotoState.dragging = true;
    recadPhotoState.startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    recadPhotoState.startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    recadPhotoState.lastX = recadPhotoState.dragX;
    recadPhotoState.lastY = recadPhotoState.dragY;
    var viewport = document.getElementById('recad-photo-viewport');
    if (viewport) viewport.classList.add('dragging');
    document.addEventListener('mousemove', recadPhotoDragMove);
    document.addEventListener('mouseup', recadPhotoDragEnd);
    document.addEventListener('touchmove', recadPhotoDragMove, { passive: false });
    document.addEventListener('touchend', recadPhotoDragEnd);
}

function recadPhotoDragMove(e) {
    if (!recadPhotoState.dragging) return;
    e.preventDefault();
    var cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    var cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    var dx = (cx - recadPhotoState.startX) / recadPhotoState.zoom;
    var dy = (cy - recadPhotoState.startY) / recadPhotoState.zoom;
    recadPhotoState.dragX = recadPhotoState.lastX + dx;
    recadPhotoState.dragY = recadPhotoState.lastY + dy;
    recadPhotoApply();
}

function recadPhotoDragEnd() {
    recadPhotoState.dragging = false;
    var viewport = document.getElementById('recad-photo-viewport');
    if (viewport) viewport.classList.remove('dragging');
    document.removeEventListener('mousemove', recadPhotoDragMove);
    document.removeEventListener('mouseup', recadPhotoDragEnd);
    document.removeEventListener('touchmove', recadPhotoDragMove);
    document.removeEventListener('touchend', recadPhotoDragEnd);
}

/* Mouse wheel zoom */
(function() {
    var vp = document.getElementById('recad-photo-viewport');
    if (vp) {
        vp.addEventListener('wheel', function(e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? -0.08 : 0.08;
            recadPhotoZoom(delta);
        }, { passive: false });
    }
})();

/* Pinch zoom (touch) */
function recadPhotoTouchStart(e) {
    if (e.touches && e.touches.length === 2) {
        e.preventDefault();
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        recadPhotoState.pinchDist = Math.sqrt(dx * dx + dy * dy);
        recadPhotoState._lastPinchZoom = recadPhotoState.zoom;
        document.addEventListener('touchmove', recadPhotoPinchMove, { passive: false });
        document.addEventListener('touchend', recadPhotoPinchEnd);
    } else {
        recadPhotoDragStart(e);
    }
}

function recadPhotoPinchMove(e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var scale = dist / recadPhotoState.pinchDist;
    recadPhotoState.zoom = Math.max(0.1, Math.min(5, recadPhotoState._lastPinchZoom * scale));
    recadPhotoApply();
    recadPhotoShowZoom();
}

function recadPhotoPinchEnd() {
    document.removeEventListener('touchmove', recadPhotoPinchMove);
    document.removeEventListener('touchend', recadPhotoPinchEnd);
}

/* Salvar foto editada no Firestore */
async function recadPhotoSave() {
    if (!recadPhotoDocId) return;
    var img = document.getElementById('recad-photo-modal-img');
    if (!img || !img.naturalWidth) { alert('Imagem nao carregada.'); return; }
    var btn = document.getElementById('recad-photo-save-btn');
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true; }
    try {
        var canvas = document.createElement('canvas');
        var iw = img.naturalWidth;
        var ih = img.naturalHeight;
        var rot = ((recadPhotoState.rotation % 360) + 360) % 360;
        var isSide = rot === 90 || rot === 270;
        canvas.width = isSide ? ih : iw;
        canvas.height = isSide ? iw : ih;
        var ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        await dbFirestore.collection('recadastramentos').doc(recadPhotoDocId).update(recadPhotoField === 'certificadoVerso' ? { certificadoVerso: dataUrl } : { certificadoFrente: dataUrl });
        var r = recadData.find(function(x) { return x._docId === recadPhotoDocId; });
        if (r) {
            if (recadPhotoField === 'certificadoVerso') r.certificadoVerso = dataUrl;
            else r.certificadoFrente = dataUrl;
        }
        img.src = dataUrl;
        recadPhotoState = { rotation: 0, zoom: 1, dragX: 0, dragY: 0, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, pinchDist: 0 };
        recadPhotoCenter();
        recadRenderTable();
        if (recadPhotoDocId) recadViewDetail(recadPhotoDocId);
        alert('Foto salva com sucesso!');
    } catch (e) {
        alert('Erro ao salvar foto: ' + e.message);
    }
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar'; btn.disabled = false; }
}

function recadEditInline(docId) {
    recadInlineEditDocId = docId;
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    var body = document.getElementById('rc-detalhe-body');
    if (!body) return;

    var editFields = [
        { key: 'nome', label: 'Nome Completo', type: 'text', full: true },
        { key: 'cpf', label: 'CPF', type: 'text' },
        { key: 'rg', label: 'RG', type: 'text' },
        { key: 'nascimento', label: 'Nascimento', type: 'date' },
        { key: 'idade', label: 'Idade', type: 'text' },
        { key: 'genero', label: 'Genero de Nascimento', type: 'select', options: ['','Masculino','Feminino'] },
        { key: 'estadoCivil', label: 'Estado Civil', type: 'select', options: ['','Solteiro(a)','Casado(a)','Divorciado(a)','Viuvo(a)','Uniao Estavel'] },
        { key: 'nacionalidade', label: 'Nacionalidade', type: 'text' },
        { key: 'naturalidade', label: 'Naturalidade', type: 'text' },
        { key: 'mae', label: 'Mae', type: 'text', full: true },
        { key: 'pai', label: 'Pai', type: 'text', full: true },
        { key: 'profissao', label: 'Profissao', type: 'text' },
        { key: 'titulo', label: 'Titulo de Eleitor', type: 'text' },
        { key: 'email', label: 'Email', type: 'email', full: true },
        { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
        { key: 'endereco', label: 'Endereco', type: 'text', full: true },
        { key: 'numero', label: 'Numero', type: 'text' },
        { key: 'bairro', label: 'Bairro', type: 'text' },
        { key: 'cidade', label: 'Cidade', type: 'text' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'projeto', label: 'Projeto', type: 'text', full: true },
        { key: 'matricula', label: 'Matricula', type: 'text' },
        { key: 'dataCertificado', label: 'Data Certificado', type: 'date' },
        { key: 'senha', label: 'Senha', type: 'text' }
    ];

    var inputStyle = 'width:100%;padding:10px 12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#fff;font-size:13px;box-sizing:border-box';
    var selectStyle = inputStyle;

    var html = '<div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        '<h2 style="color:#f57c00;margin:0"><i class="fa-solid fa-pen" style="margin-right:8px"></i> Editando: ' + (r.nome || '---') + '</h2>' +
        '<div style="display:flex;gap:8px">' +
            '<button class="btn-primary btn-sm" onclick="recadSaveEditInline(\'' + docId + '\')" style="background:#4caf50"><i class="fa-solid fa-check"></i> Salvar</button>' +
            '<button class="btn-outline btn-sm" onclick="recadViewDetail(\'' + docId + '\')"><i class="fa-solid fa-xmark"></i> Cancelar</button>' +
        '</div></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    editFields.forEach(function(f) {
        var val = r[f.key] || '';
        var colSpan = f.full ? 'grid-column:1/-1;' : '';
        html += '<div style="' + colSpan + '"><label style="font-size:12px;color:#888;display:block;margin-bottom:4px">' + f.label + '</label>';
        if (f.type === 'select') {
            html += '<select id="rc-edit-' + f.key + '" style="' + selectStyle + '">';
            f.options.forEach(function(o) {
                html += '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + (o || '-- Selecione --') + '</option>';
            });
            html += '</select>';
        } else {
            html += '<input type="' + f.type + '" id="rc-edit-' + f.key + '" value="' + val.toString().replace(/"/g, '&quot;') + '" style="' + inputStyle + '">';
        }
        html += '</div>';
    });
    html += '</div>';

    html += '<div style="margin-top:20px;padding:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px">' +
        '<label style="font-size:13px;color:#f57c00;font-weight:600;display:block;margin-bottom:10px"><i class="fa-solid fa-image" style="margin-right:6px"></i> Foto do Certificado (Frente)</label>' +
        '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">';
    if (r.certificadoFrente) {
        html += '<div style="position:relative">' +
            '<img src="' + r.certificadoFrente + '" style="max-width:200px;max-height:140px;border-radius:8px;border:1px solid rgba(255,255,255,.15);cursor:pointer" onclick="recadOpenPhoto(\'' + r.certificadoFrente.replace(/'/g, "\\'") + '\',\'Foto do Certificado\',\'' + docId + '\',\'certificadoFrente\')" id="rc-edit-foto-preview">' +
            '<button onclick="recadRemovePhoto()" style="position:absolute;top:-6px;right:-6px;background:#f44336;border:none;color:#fff;width:22px;height:22px;border-radius:50%;font-size:11px;cursor:pointer" title="Remover foto"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>';
    } else {
        html += '<div id="rc-edit-foto-preview" style="width:160px;height:100px;background:rgba(255,255,255,.05);border:2px dashed rgba(255,255,255,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px">Sem foto</div>';
    }
    html += '<div><input type="file" id="rc-edit-foto-input" accept="image/*" style="display:none" onchange="recadPreviewEditPhoto(this)">' +
        '<button class="btn-outline btn-sm" onclick="document.getElementById(\'rc-edit-foto-input\').click()"><i class="fa-solid fa-camera"></i> ' + (r.certificadoFrente ? 'Trocar Foto' : 'Adicionar Foto') + '</button></div>' +
        '</div></div>';

    html += '<div style="margin-top:12px;display:flex;gap:8px">' +
        '<button class="btn-primary" onclick="recadSaveEditInline(\'' + docId + '\')" style="background:#4caf50"><i class="fa-solid fa-check"></i> Salvar Alteracoes</button>' +
        '<button class="btn-outline" onclick="recadViewDetail(\'' + docId + '\')"><i class="fa-solid fa-xmark"></i> Cancelar</button>' +
        '</div>';

    body.innerHTML = html;
}

var recadEditPhotoFile = null;
var recadEditPhotoRemoved = false;
var recadInlineEditDocId = '';

function recadPreviewEditPhoto(input) {
    if (input.files && input.files[0]) {
        var file = input.files[0];
        if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande. Maximo 10MB.'); return; }
        recadEditPhotoFile = file;
        recadEditPhotoRemoved = false;
        var reader = new FileReader();
        reader.onload = function(e) {
            var preview = document.getElementById('rc-edit-foto-preview');
            if (preview) {
                preview.outerHTML = '<div style="position:relative;display:inline-block"><img id="rc-edit-foto-preview" src="' + e.target.result + '" style="max-width:200px;max-height:140px;border-radius:8px;border:1px solid rgba(255,255,255,.15);cursor:pointer" onclick="recadOpenPhoto(this.src,\'Foto do Certificado\',\'' + recadInlineEditDocId + '\',\'certificadoFrente\')"><button onclick="recadRemovePhoto()" style="position:absolute;top:-6px;right:-6px;background:#f44336;border:none;color:#fff;width:22px;height:22px;border-radius:50%;font-size:11px;cursor:pointer" title="Remover foto"><i class="fa-solid fa-xmark"></i></button></div>';
            }
        };
        reader.readAsDataURL(file);
    }
}

function recadRemovePhoto() {
    recadEditPhotoFile = null;
    recadEditPhotoRemoved = true;
    var preview = document.getElementById('rc-edit-foto-preview');
    if (preview) {
        var parent = preview.parentElement || preview;
        if (parent !== preview) parent.outerHTML = '<div id="rc-edit-foto-preview" style="width:160px;height:100px;background:rgba(255,255,255,.05);border:2px dashed rgba(255,255,255,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px">Sem foto</div>';
        else preview.outerHTML = '<div id="rc-edit-foto-preview" style="width:160px;height:100px;background:rgba(255,255,255,.05);border:2px dashed rgba(255,255,255,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px">Sem foto</div>';
    }
}

async function recadSaveEditInline(docId) {
    var updates = {};
    var textFields = ['nome','cpf','rg','nascimento','idade','genero','estadoCivil','nacionalidade','naturalidade','mae','pai','profissao','titulo','email','whatsapp','endereco','numero','bairro','cidade','estado','projeto','matricula','dataCertificado','senha'];
    textFields.forEach(function(f) {
        var el = document.getElementById('rc-edit-' + f);
        if (el) updates[f] = el.value.trim();
    });

    try {
        if (recadEditPhotoRemoved) {
            updates.certificadoFrente = '';
        } else if (recadEditPhotoFile) {
            var reader = new FileReader();
            var dataUrl = await new Promise(function(resolve, reject) {
                reader.onload = function(e) { resolve(e.target.result); };
                reader.onerror = reject;
                reader.readAsDataURL(recadEditPhotoFile);
            });
            updates.certificadoFrente = dataUrl;
        }

        await dbFirestore.collection('recadastramentos').doc(docId).update(updates);
        var r = recadData.find(function(x) { return x._docId === docId; });
        if (r) Object.assign(r, updates);
        recadEditPhotoFile = null;
        recadEditPhotoRemoved = false;
        recadRenderTable();
        recadViewDetail(docId);
        alert('Dados atualizados com sucesso!');
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    }
}
