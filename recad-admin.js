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
            '<td><span style="background:' + statusBg + ';color:' + statusColor + ';padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">' + (r.status || 'Pendente') + '</span></td>' +
            '<td style="white-space:nowrap">' +
            '<button class="btn-outline btn-sm" onclick="recadViewDetail(\'' + docId + '\')" title="Ver detalhes"><i class="fa-solid fa-eye"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadEdit(\'' + docId + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadDelete(\'' + docId + '\')" title="Excluir" style="color:#f44336;border-color:#f44336"><i class="fa-solid fa-trash"></i></button> ' +
            '<button class="btn-outline btn-sm" onclick="recadPrint(\'' + docId + '\')" title="Imprimir"><i class="fa-solid fa-print"></i></button>' +
            '</td>' +
            '</tr>';
    }).join('');
}

function recadFilter() {
    recadRenderTable();
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
        '<div style="display:flex;gap:8px">' +
            '<button class="btn-primary btn-sm" onclick="recadUpdateStatus(\'' + docId + '\',\'Ativo\')" style="background:#4caf50"><i class="fa-solid fa-check"></i> Ativar</button>' +
            '<button class="btn-primary btn-sm" onclick="recadUpdateStatus(\'' + docId + '\',\'Rejeitado\')" style="background:#f44336"><i class="fa-solid fa-xmark"></i> Rejeitar</button>' +
            '<button class="btn-primary btn-sm" onclick="recadUpdateStatus(\'' + docId + '\',\'Pendente\')" style="background:#ffc107;color:#000"><i class="fa-solid fa-hourglass-half"></i> Pendente</button>' +
        '</div>' +
    '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

    function detailSection(icon, title, fields) {
        var s = '<div class="recad-section" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.1)">' +
            '<i class="fa-solid ' + icon + '" style="color:#f57c00"></i><h3 style="color:#f57c00;font-size:15px">' + title + '</h3></div>';
        fields.forEach(function(f) {
            var val = f.val || '---';
            if (val !== '---' && f.type === 'img') {
                s += '<div style="margin-bottom:10px"><label style="font-size:12px;color:#888;display:block;margin-bottom:4px">' + f.label + '</label>' +
                    '<img src="' + val + '" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid rgba(255,255,255,.1)"></div>';
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
        { label: 'Foto Frente', val: r.certificadoFrente, type: 'img' },
        { label: 'Foto Verso', val: r.certificadoVerso, type: 'img' }
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
