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
                '<button class="btn-outline btn-sm" onclick="recadPrint(\'' + docId + '\')" title="Imprimir"><i class="fa-solid fa-print"></i></button> ' +
                '<button class="btn-outline btn-sm" onclick="recadDelete(\'' + docId + '\')" title="Excluir" style="color:#f44336;border-color:rgba(244,67,54,.3)"><i class="fa-solid fa-trash"></i></button>' +
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
        { label: 'Matricula', val: r.matricula || (r.status === 'Ativo' ? 'Gerando...' : '---') }
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
                var anoCert = '';
                if (r.dataCertificado) {
                    var d = new Date(r.dataCertificado);
                    if (!isNaN(d.getTime())) anoCert = d.getFullYear().toString();
                }
                if (!anoCert) anoCert = new Date().getFullYear().toString();
                var matriculaGerada = anoCert + '.' + ultimos5;
                updateData.matricula = matriculaGerada;
                r.matricula = matriculaGerada;
            }
        }

        await dbFirestore.collection('recadastramentos').doc(docId).update(updateData);
        var r2 = recadData.find(function(x) { return x._docId === docId; });
        if (r2) r2.status = newStatus;
        recadRenderTable();
        recadUpdateCounts();
        recadViewDetail(docId);
        alert('Status atualizado com sucesso!' + (newStatus === 'Ativo' && updateData.matricula ? '\nMatricula gerada: ' + updateData.matricula : ''));
    } catch (e) {
        console.error('Erro ao atualizar status:', e);
        alert('Erro ao atualizar status: ' + e.message);
    }
}

function recadEdit(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    var cpf = r.cpf || '';
    if (cpf.length === 11) cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<h2 style="color:#f57c00;margin:0"><i class="fa-solid fa-pen" style="margin-right:8px"></i> Editar: ' + (r.nome || '---') + '</h2>' +
        '<button class="btn-outline" onclick="recadViewDetail(\'' + docId + '\')"><i class="fa-solid fa-arrow-left"></i> Voltar</button></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    var fields = [
        { key:'nome', label:'Nome Completo', val: r.nome },
        { key:'cpf', label:'CPF', val: cpf, disabled:true },
        { key:'rg', label:'RG', val: r.rg },
        { key:'nascimento', label:'Data de Nascimento', val: r.nascimento, type:'date' },
        { key:'estadoCivil', label:'Estado Civil', val: r.estadoCivil, type:'select', options:['','Solteiro(a)','Casado(a)','Divorciado(a)','Viuvo(a)','Uniao Estavel'] },
        { key:'nacionalidade', label:'Nacionalidade', val: r.nacionalidade },
        { key:'naturalidade', label:'Naturalidade', val: r.naturalidade },
        { key:'mae', label:'Mae', val: r.mae },
        { key:'pai', label:'Pai', val: r.pai },
        { key:'profissao', label:'Profissao', val: r.profissao },
        { key:'titulo', label:'Titulo de Eleitor', val: r.titulo },
        { key:'email', label:'Email', val: r.email, type:'email' },
        { key:'whatsapp', label:'WhatsApp', val: r.whatsapp },
        { key:'endereco', label:'Endereco', val: r.endereco },
        { key:'numero', label:'Numero', val: r.numero },
        { key:'bairro', label:'Bairro', val: r.bairro },
        { key:'cidade', label:'Cidade', val: r.cidade },
        { key:'estado', label:'Estado', val: r.estado, type:'select', options:['','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] },
        { key:'altura', label:'Altura (cm)', val: r.altura, type:'number' },
        { key:'peso', label:'Peso (kg)', val: r.peso, type:'number' },
        { key:'fatorRh', label:'Fator RH', val: r.fatorRh, type:'select', options:['','A+','A-','B+','B-','AB+','AB-','O+','O-'] },
        { key:'dataCertificado', label:'Data Certificado', val: r.dataCertificado, type:'date' },
        { key:'senha', label:'Senha de Acesso', val: r.senha }
    ];
    fields.forEach(function(f) {
        var val = f.val || '';
        var input = '';
        if (f.disabled) {
            input = '<input type="text" value="' + val + '" disabled style="opacity:.5">';
        } else if (f.type === 'select') {
            input = '<select id="rc-edit-' + f.key + '">' +
                f.options.map(function(o) { return '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + (o || 'Selecione...') + '</option>'; }).join('') +
                '</select>';
        } else {
            input = '<input type="' + (f.type || 'text') + '" id="rc-edit-' + f.key + '" value="' + val + '">';
        }
        html += '<div><label style="font-size:12px;color:#888;display:block;margin-bottom:4px">' + f.label + '</label>' + input + '</div>';
    });
    html += '</div>';
    html += '<div style="margin-top:20px;text-align:right">' +
        '<button class="btn-primary" onclick="recadSaveEdit(\'' + docId + '\')" style="background:#4caf50"><i class="fa-solid fa-check"></i> Salvar Alteracoes</button></div>';

    document.getElementById('rc-detalhe-body').innerHTML = html;
    showAdminSection('admin-recad-detalhe');
}

async function recadSaveEdit(docId) {
    if (!confirm('Salvar alteracoes?')) return;
    var data = {};
    var fields = ['nome','rg','nascimento','estadoCivil','nacionalidade','naturalidade','mae','pai','profissao','titulo','email','whatsapp','endereco','numero','bairro','cidade','estado','altura','peso','fatorRh','dataCertificado','senha'];
    fields.forEach(function(key) {
        var el = document.getElementById('rc-edit-' + key);
        if (el) data[key] = el.value.trim();
    });
    try {
        await dbFirestore.collection('recadastramentos').doc(docId).update(data);
        var r = recadData.find(function(x) { return x._docId === docId; });
        if (r) Object.assign(r, data);
        recadRenderTable();
        recadViewDetail(docId);
        alert('Cadastro atualizado com sucesso!');
    } catch(e) {
        alert('Erro ao salvar: ' + e.message);
    }
}

function recadPrint(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    var cpf = r.cpf || '';
    if (cpf.length === 11) cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    var win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><title>Recadastramento - ' + (r.nome||'') + '</title>');
    win.document.write('<style>');
    win.document.write('body{font-family:Arial,sans-serif;padding:30px;color:#333}');
    win.document.write('h1{font-size:18px;color:#f57c00;border-bottom:2px solid #f57c00;padding-bottom:8px}');
    win.document.write('h2{font-size:14px;color:#555;margin:16px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}');
    win.document.write('.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}');
    win.document.write('.field{margin-bottom:4px}');
    win.document.write('.label{font-size:11px;color:#888}');
    win.document.write('.val{font-size:13px;font-weight:600}');
    win.document.write('.status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;color:#fff}');
    win.document.write('.status-ativo{background:#4caf50}');
    win.document.write('.status-pendente{background:#ffc107;color:#333}');
    win.document.write('.status-rejeitado{background:#f44336}');
    win.document.write('@media print{body{padding:15px}}');
    win.document.write('</style></head><body>');
    win.document.write('<h1>FARN - Ficha de Recadastramento</h1>');
    var statusClass = r.status === 'Ativo' ? 'status-ativo' : r.status === 'Rejeitado' ? 'status-rejeitado' : 'status-pendente';
    win.document.write('<p><strong>Status:</strong> <span class="status ' + statusClass + '">' + (r.status||'Pendente') + '</span></p>');
    if (r.matricula) win.document.write('<p><strong>Matricula:</strong> ' + r.matricula + '</p>');

    win.document.write('<h2>Projeto</h2><div class="grid">');
    win.document.write('<div class="field"><div class="label">Projeto</div><div class="val">' + (r.projeto||'---') + '</div></div>');
    win.document.write('<div class="field"><div class="label">Matricula</div><div class="val">' + (r.matricula||'---') + '</div></div>');
    win.document.write('</div>');

    win.document.write('<h2>Dados Pessoais</h2><div class="grid">');
    var personalFields = [
        ['Nome', r.nome], ['CPF', cpf], ['RG', r.rg], ['Nascimento', r.nascimento],
        ['Estado Civil', r.estadoCivil], ['Nacionalidade', r.nacionalidade], ['Naturalidade', r.naturalidade],
        ['Mae', r.mae], ['Pai', r.pai], ['Profissao', r.profissao], ['Titulo', r.titulo]
    ];
    personalFields.forEach(function(f) { win.document.write('<div class="field"><div class="label">' + f[0] + '</div><div class="val">' + (f[1]||'---') + '</div></div>'); });
    win.document.write('</div>');

    win.document.write('<h2>Contato</h2><div class="grid">');
    win.document.write('<div class="field"><div class="label">Email</div><div class="val">' + (r.email||'---') + '</div></div>');
    win.document.write('<div class="field"><div class="label">WhatsApp</div><div class="val">' + (r.whatsapp||'---') + '</div></div>');
    win.document.write('</div>');

    win.document.write('<h2>Endereco</h2><div class="grid">');
    win.document.write('<div class="field"><div class="label">Endereco</div><div class="val">' + (r.endereco||'---') + ', ' + (r.numero||'') + '</div></div>');
    win.document.write('<div class="field"><div class="label">Bairro</div><div class="val">' + (r.bairro||'---') + '</div></div>');
    win.document.write('<div class="field"><div class="label">Cidade/UF</div><div class="val">' + (r.cidade||'---') + '/' + (r.estado||'') + '</div></div>');
    win.document.write('</div>');

    win.document.write('<h2>Dados Fisicos</h2><div class="grid">');
    win.document.write('<div class="field"><div class="label">Altura</div><div class="val">' + (r.altura||'---') + ' cm</div></div>');
    win.document.write('<div class="field"><div class="label">Peso</div><div class="val">' + (r.peso||'---') + ' kg</div></div>');
    win.document.write('<div class="field"><div class="label">Fator RH</div><div class="val">' + (r.fatorRh||'---') + '</div></div>');
    win.document.write('</div>');

    win.document.write('<h2>Certificado</h2><div class="grid">');
    win.document.write('<div class="field"><div class="label">Data Emissao</div><div class="val">' + (r.dataCertificado||'---') + '</div></div>');
    win.document.write('</div>');

    win.document.write('<div style="margin-top:30px;text-align:center;font-size:11px;color:#888">Documento gerado em ' + new Date().toLocaleString('pt-BR') + '</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.print();
}

async function recadDelete(docId) {
    var r = recadData.find(function(x) { return x._docId === docId; });
    if (!r) return;
    if (!confirm('EXCLUIR permanentemente o cadastro de "' + (r.nome||'') + '"?\n\nEsta acao NAO pode ser desfeita!')) return;
    if (!confirm('Tem certeza absoluta? Todos os dados serao perdidos.')) return;
    try {
        await dbFirestore.collection('recadastramentos').doc(docId).delete();
        recadData = recadData.filter(function(x) { return x._docId !== docId; });
        recadRenderTable();
        recadUpdateCounts();
        showAdminSection('admin-recadastramento');
        alert('Cadastro excluido com sucesso!');
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
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
