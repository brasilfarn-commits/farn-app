const ADMIN_CPF = '05004959471';
const ADMIN_SENHA = '212121';
let selectedLoginRole = 'admin';
let editingIndex = null;
let candidatos = [];
let turmas = [];
let uploadedFiles = [];
let pendingDeleteIndex = null;
let pendingDeleteTurmaIndex = null;
let editingTurmaIndex = null;
let currentAluno = null;
let usuarios = [];
let currentUserData = null;

/* ===== FIREBASE SINCRONIZACAO (Firestore) ===== */

const FB_CANDIDATOS = 'candidatos';
const FB_TURMAS = 'turmas';
const FB_USUARIOS = 'usuarios';
let firebaseReady = false;
let firebaseError = false;

function showFirebaseStatus(ok) {
    let el = document.getElementById('firebase-status');
    if (!el) {
        el = document.createElement('div');
        el.id = 'firebase-status';
        el.style.cssText = 'position:fixed;bottom:8px;left:8px;padding:6px 12px;border-radius:6px;font-size:11px;z-index:99999;font-weight:600;';
        document.body.appendChild(el);
    }
    if (ok) {
        el.style.background = '#1b5e20';
        el.style.color = '#a5d6a7';
        el.textContent = 'Online';
    } else {
        el.style.background = '#b71c1c';
        el.style.color = '#ef9a9a';
        el.textContent = 'Offline';
    }
}

function candidatoToDoc(c) {
    const copy = Object.assign({}, c);
    delete copy.photoDataUrl;
    return copy;
}

function backupCandidatos() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_CANDIDATOS);
    batch.set(ref.doc('_index'), { count: candidatos.length, timestamp: Date.now() });
    candidatos.forEach((c, i) => {
        const id = c.id ? String(c.id) : String(i);
        batch.set(ref.doc(id), candidatoToDoc(c));
    });
    batch.commit().catch(e => console.error('Erro ao salvar candidatos:', e));
}

function backupTurmas() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_TURMAS);
    batch.set(ref.doc('_index'), { count: turmas.length, timestamp: Date.now() });
    turmas.forEach((t, i) => {
        const id = t.id ? String(t.id) : String(i);
        batch.set(ref.doc(id), t);
    });
    batch.commit().catch(e => console.error('Erro ao salvar turmas:', e));
}

function initFirebaseListeners() {
    return new Promise((resolve) => {
        let loaded = 0;
        const checkReady = () => {
            loaded++;
            if (loaded >= 3) {
                firebaseReady = true;
                showFirebaseStatus(true);
                resolve();
            }
        };

        dbFirestore.collection(FB_CANDIDATOS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.id = parseInt(doc.id) || doc.id;
                    result.push(data);
                }
            });
            candidatos = result;
            if (firebaseReady) {
                renderList();
                if (typeof renderAlunosList === 'function') renderAlunosList();
            }
            checkReady();
        }, (error) => {
            console.error('Erro Firestore candidatos:', error);
            firebaseError = true;
            showFirebaseStatus(false);
            checkReady();
        });

        dbFirestore.collection(FB_TURMAS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.id = parseInt(doc.id) || doc.id;
                    result.push(data);
                }
            });
            turmas = result;
            if (firebaseReady) {
                renderTurmasList();
                populateTurmaSelect();
            }
            checkReady();
        }, (error) => {
            console.error('Erro Firestore turmas:', error);
            firebaseError = true;
            showFirebaseStatus(false);
            checkReady();
        });

        dbFirestore.collection(FB_USUARIOS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.docId = doc.id;
                    result.push(data);
                }
            });
            usuarios = result;
            if (firebaseReady && typeof renderUsuariosList === 'function') renderUsuariosList();
            checkReady();
        }, (error) => {
            console.error('Erro Firestore usuarios:', error);
            checkReady();
        });

        setTimeout(() => { if (!firebaseReady) { firebaseReady = true; showFirebaseStatus(false); resolve(); } }, 8000);
    });
}

/* ===== INICIALIZACAO ===== */

function migrateLocalStorage() {
    try {
        const lsCandidatos = localStorage.getItem('farn_candidatos');
        const lsTurmas = localStorage.getItem('farn_turmas');
        if (lsCandidatos) {
            const parsed = JSON.parse(lsCandidatos);
            if (parsed.length > candidatos.length) {
                candidatos = parsed;
                backupCandidatos();
            }
            localStorage.removeItem('farn_candidatos');
        }
        if (lsTurmas) {
            const parsed = JSON.parse(lsTurmas);
            if (parsed.length > turmas.length) {
                turmas = parsed;
                backupTurmas();
            }
            localStorage.removeItem('farn_turmas');
        }
    } catch(e) {}
}

function migrateIndexedDB() {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open('FARN_DB', 2);
            request.onsuccess = function(e) {
                const database = e.target.result;
                if (!database.objectStoreNames.contains('candidatos') && !database.objectStoreNames.contains('turmas')) {
                    resolve();
                    return;
                }
                let pending = 0;
                const done = () => { pending--; if (pending <= 0) resolve(); };

                if (database.objectStoreNames.contains('candidatos')) {
                    pending++;
                    const tx = database.transaction('candidatos', 'readonly');
                    const store = tx.objectStore('candidatos');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        const data = req.result || [];
                        if (data.length > candidatos.length) {
                            candidatos = data;
                            backupCandidatos();
                        }
                        done();
                    };
                    req.onerror = () => done();
                }

                if (database.objectStoreNames.contains('turmas')) {
                    pending++;
                    const tx = database.transaction('turmas', 'readonly');
                    const store = tx.objectStore('turmas');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        const data = req.result || [];
                        if (data.length > turmas.length) {
                            turmas = data;
                            backupTurmas();
                        }
                        done();
                    };
                    req.onerror = () => done();
                }
            };
            request.onerror = () => resolve();
        } catch(e) { resolve(); }
    });
}

async function initApp() {
    migrateLocalStorage();
    await migrateIndexedDB();
    await initFirebaseListeners();

    if (restoreLoginState()) {
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-admin').classList.add('active');
        applyUserPermissions();
        showAdminSection('admin-home', document.querySelector('.nav-item'));
        await populateTurmaSelect();
        renderList();
        renderTurmasList();
        if (restoreFormState()) {
            showAdminSection('admin-form-candidato', document.querySelector('.nav-item:nth-child(2)'));
            await populateTurmaSelect();
        }
    }
}

initApp();

/* ===== MASCARAS ===== */

function formatCPF(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    input.value = v;
}

function formatPhone(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 6) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    input.value = v;
}

function formatCPFDisplay(cpf) {
    const c = (cpf || '').replace(/\D/g, '');
    if (c.length !== 11) return cpf || '';
    return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/* ===== PASSWORD ===== */

function togglePassword() {
    const input = document.getElementById('password');
    const icon = document.getElementById('eye-icon');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

function selectLoginRole(btn) {
    document.querySelectorAll('.login-role-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedLoginRole = btn.getAttribute('data-role');
    document.getElementById('login-role-error').classList.add('hidden');
}

/* ===== LOGIN ===== */

async function handleLogin(event) {
    event.preventDefault();
    const cpf = document.getElementById('cpf').value.replace(/\D/g, '');
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const roleErrorEl = document.getElementById('login-role-error');
    errorEl.classList.add('hidden');
    roleErrorEl.classList.add('hidden');
    if (!selectedLoginRole) { roleErrorEl.classList.remove('hidden'); return false; }

    if (selectedLoginRole === 'admin') {
        if (cpf === ADMIN_CPF && password === ADMIN_SENHA) {
            currentUserData = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'instrutor', 'usuarios'] };
            enterAdminPanel();
            saveLoginState();
            return false;
        }
        const user = usuarios.find(u => u.cpf === cpf && u.senha === password && u.ativo !== false);
        if (!user) {
            errorEl.querySelector('span').textContent = 'CPF ou senha invalidos';
            errorEl.classList.remove('hidden');
            document.getElementById('password').value = '';
            return false;
        }
        currentUserData = user;
        enterAdminPanel();
        saveLoginState();
    } else if (selectedLoginRole === 'aluno') {
        const aluno = candidatos.find(c => c.cpf === cpf && c.senha === password && c.status === 'Aprovado');
        if (!aluno) {
            errorEl.querySelector('span').textContent = 'CPF ou senha invalidos, ou aluno nao aprovado';
            errorEl.classList.remove('hidden');
            document.getElementById('password').value = '';
            return false;
        }
        currentAluno = aluno;
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-portal').classList.add('active');
        const primeiroNome = (aluno.nome || '').split(' ')[0];
        document.getElementById('portal-aluno-nome').textContent = primeiroNome;
        const portalPhotoBox = document.querySelector('.portal-photo-box');
        if (aluno.photoDataUrl) {
            portalPhotoBox.innerHTML = `<img src="${aluno.photoDataUrl}" alt="Foto 3x4" class="portal-photo">`;
        } else {
            portalPhotoBox.innerHTML = '<i class="fa-solid fa-user" style="font-size:56px;color:#444"></i>';
        }
    }
    return false;
}

function enterAdminPanel() {
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('screen-admin').classList.add('active');
    applyUserPermissions();
    showAdminSection('admin-home', document.querySelector('.nav-item'));
    populateTurmaSelect();
    renderList();
    renderTurmasList();
}

function applyUserPermissions() {
    if (!currentUserData) return;
    const p = currentUserData.permissoes || [];
    const isGeral = currentUserData.cpf === ADMIN_CPF;
    const navUsuarios = document.querySelector('.nav-usuarios');
    if (navUsuarios) navUsuarios.style.display = isGeral ? '' : 'none';
    const navItems = {
        'admin-pre-inscricao': p.includes('pre-inscricao') || p.includes('admin') || isGeral,
        'admin-alunos': p.includes('pre-inscricao') || p.includes('admin') || isGeral,
        'admin-turmas': p.includes('instrutor') || p.includes('admin') || isGeral,
        'admin-instrutores': p.includes('instrutor') || p.includes('admin') || isGeral,
        'admin-formados': p.includes('pre-inscricao') || p.includes('admin') || isGeral,
        'admin-relatorios': p.includes('admin') || isGeral,
        'admin-config': p.includes('admin') || isGeral
    };
    document.querySelectorAll('#screen-admin .sidebar-nav .nav-item').forEach(item => {
        const onclick = item.getAttribute('onclick') || '';
        const match = onclick.match(/showAdminSection\('([^']+)'/);
        if (match) {
            const section = match[1];
            if (navItems[section] !== undefined) {
                item.style.display = navItems[section] ? '' : 'none';
            }
        }
    });
    document.querySelectorAll('#screen-admin .admin-home-card').forEach(card => {
        const onclick = card.getAttribute('onclick') || '';
        const match = onclick.match(/showAdminSection\('([^']+)'/);
        if (match) {
            const section = match[1];
            if (navItems[section] !== undefined) {
                card.style.display = navItems[section] ? '' : 'none';
            }
        }
    });
}

function handleLogout() {
    document.getElementById('screen-admin').classList.remove('active');
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('cpf').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').classList.add('hidden');
    editingIndex = null;
    currentUserData = null;
    clearLoginState();
}

function logoutPortal() {
    document.getElementById('screen-portal').classList.remove('active');
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('cpf').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').classList.add('hidden');
    currentAluno = null;
    selectedLoginRole = 'admin';
    document.querySelectorAll('.login-role-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.login-role-btn[data-role="admin"]').classList.add('selected');
}

function showDownloadModal() {
    document.getElementById('modal-download-overlay').classList.remove('hidden');
}

function closeDownloadModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-download-overlay').classList.add('hidden');
}

/* ===== NAVIGACAO ADMIN ===== */

function showAdminSection(sectionId, navEl) {
    document.querySelectorAll('#screen-admin .admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    document.querySelectorAll('#screen-admin .nav-item').forEach(n => n.classList.remove('active'));
    if (navEl) navEl.classList.add('active');
    const titles = { 'admin-home': 'Inicio', 'admin-pre-inscricao': 'Pre-Inscricao', 'admin-form-candidato': editingIndex !== null ? 'Editar Pre-Cadastro' : 'Novo Pre-Cadastro', 'admin-alunos': 'Alunos', 'admin-turmas': 'Turmas', 'admin-instrutores': 'Instrutores', 'admin-formados': 'Formados', 'admin-relatorios': 'Relatorios', 'admin-config': 'Configuracoes', 'admin-usuarios': 'Usuarios', 'admin-form-usuario': 'Novo Usuario' };
    document.getElementById('admin-page-title').textContent = titles[sectionId] || 'Admin';
}

/* ===== FORM CANDIDATO ===== */

const formFields = ['fc-turma','fc-nome','fc-cpf','fc-nascimento','fc-estado-civil','fc-nacionalidade','fc-naturalidade','fc-titulo','fc-profissao','fc-mae','fc-pai','fc-email','fc-whatsapp','fc-endereco','fc-numero','fc-bairro','fc-cidade','fc-estado','fc-local-votacao','fc-altura','fc-peso','fc-fator-rh','fc-hipertensao','fc-diabetes','fc-deficiencia','fc-tatuagem','fc-cirurgia','fc-alcool','fc-medicamento','fc-cansaco','fc-calca','fc-camisa','fc-calcado','fc-senha'];

async function openFormCandidato() {
    editingIndex = null;
    resetFormCandidato();
    await populateTurmaSelect();
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#f57c00;margin-right:8px"></i> Novo Pre-Cadastro';
    showAdminSection('admin-form-candidato');
}

async function editCandidato(index) {
    const c = candidatos[index]; if (!c) return;
    editingIndex = index;
    await populateTurmaSelect();
    document.getElementById('fc-nome').value = c.nome || '';
    document.getElementById('fc-cpf').value = formatCPFDisplay(c.cpf || '');
    document.getElementById('fc-nascimento').value = c.nascimento || '';
    document.getElementById('fc-estado-civil').value = c.estadoCivil || '';
    document.getElementById('fc-nacionalidade').value = c.nacionalidade || '';
    document.getElementById('fc-naturalidade').value = c.naturalidade || '';
    document.getElementById('fc-titulo').value = c.tituloEleitor || '';
    document.getElementById('fc-mae').value = c.mae || '';
    document.getElementById('fc-pai').value = c.pai || '';
    document.getElementById('fc-email').value = c.email || '';
    document.getElementById('fc-whatsapp').value = c.whatsapp || '';
    document.getElementById('fc-endereco').value = c.endereco || '';
    document.getElementById('fc-numero').value = c.numero || '';
    document.getElementById('fc-bairro').value = c.bairro || '';
    document.getElementById('fc-cidade').value = c.cidade || '';
    document.getElementById('fc-estado').value = c.estado || '';
    document.getElementById('fc-local-votacao').value = c.localVotacao || '';
    document.getElementById('fc-altura').value = c.altura || '';
    document.getElementById('fc-peso').value = c.peso || '';
    document.getElementById('fc-fator-rh').value = c.fatorRh || '';
    document.getElementById('fc-hipertensao').value = c.hipertensao || 'Nao';
    document.getElementById('fc-diabetes').value = c.diabetes || 'Nao';
    document.getElementById('fc-deficiencia').value = c.deficiencia || 'Nao';
    document.getElementById('fc-tatuagem').value = c.tatuagem || 'Nao';
    document.getElementById('fc-cirurgia').value = c.cirurgia || 'Nao';
    document.getElementById('fc-alcool').value = c.alcool || 'Nao';
    document.getElementById('fc-medicamento').value = c.medicamento || '';
    document.getElementById('fc-cansaco').value = c.cansaco || 'Nao';
    document.getElementById('fc-calca').value = c.calca || '';
    document.getElementById('fc-camisa').value = c.camisa || '';
    document.getElementById('fc-calcado').value = c.calcado || '';
    document.getElementById('fc-turma').value = c.turma || '';
    if (c.hasPhoto) {
        const saved = localStorage.getItem('farn_photo_' + c.cpf);
        if (saved) {
            document.getElementById('photo-preview').src = saved;
            document.getElementById('photo-preview').classList.remove('hidden');
            document.getElementById('photo-placeholder').style.display = 'none';
            document.getElementById('btn-remove-photo').style.display = '';
        } else {
            removePhoto();
        }
    } else {
        removePhoto();
    }
    const senhaWrapper = document.getElementById('senha-field-wrapper');
    if (c.status === 'Aprovado') {
        senhaWrapper.style.display = '';
        document.getElementById('fc-senha').value = c.senha || (c.cpf ? c.cpf.substring(0, 6) : '');
        document.getElementById('fc-senha').required = true;
    } else {
        senhaWrapper.style.display = 'none';
        document.getElementById('fc-senha').value = '';
        document.getElementById('fc-senha').required = false;
    }
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:#f57c00;margin-right:8px"></i> Editar - ' + c.nome;
    showAdminSection('admin-form-candidato');
}

function resetFormCandidato() {
    editingIndex = null;
    formFields.forEach(id => { const el = document.getElementById(id); if (el) { if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; } });
    document.getElementById('senha-field-wrapper').style.display = 'none';
    document.getElementById('fc-senha').required = false;
    removePhoto();
    uploadedFiles = [];
    renderFilesList();
}

async function handleCandidatoSubmit(event) {
    event.preventDefault();
    const data = {};
    formFields.forEach(id => {
        const key = id.replace('fc-', '').replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'fc-cpf') data[key] = el.value.replace(/\D/g, '');
        else data[key] = el.value;
    });
    data.status = editingIndex !== null ? candidatos[editingIndex].status : 'Pendente';
    data.dataCadastro = editingIndex !== null ? candidatos[editingIndex].dataCadastro : new Date().toLocaleDateString('pt-BR');

    const photoPreview = document.getElementById('photo-preview');
    if (photoPreview && !photoPreview.classList.contains('hidden') && photoPreview.src) {
        try { localStorage.setItem('farn_photo_' + data.cpf, photoPreview.src); } catch(e) {}
        data.hasPhoto = true;
    } else if (editingIndex !== null && candidatos[editingIndex].hasPhoto) {
        data.hasPhoto = true;
    }

    if (editingIndex !== null) {
        data.id = candidatos[editingIndex].id;
        candidatos[editingIndex] = data;
        editingIndex = null;
    } else {
        data.id = Date.now();
        candidatos.push(data);
    }

    backupCandidatos();
    showAdminSection('admin-pre-inscricao');
    renderList();
    return false;
}

/* ===== LISTA ===== */

function renderList() {
    const tbody = document.getElementById('pre-table-body');
    const badge = document.getElementById('pre-count-badge');
    if (!tbody) return;
    const p = candidatos.filter(c => c.status === 'Pendente').length;
    if (badge) badge.textContent = p + ' pendente' + (p !== 1 ? 's' : '');
    if (!candidatos.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:24px">Nenhum candidato cadastrado</td></tr>'; return; }
    tbody.innerHTML = candidatos.map((c, i) => {
        const sc = c.status === 'Aprovado' ? 'green' : c.status === 'Rejeitado' ? 'rejeitado' : 'pendente';
        return `<tr>
            <td>${c.nome}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td>${c.nascimento || '-'}</td>
            <td>${c.turma || '-'}</td>
            <td><span class="badge ${sc}">${c.status}</span></td>
            <td><div class="actions-cell">
                <button class="btn-icon btn-info" title="Visualizar" onclick="viewCandidato(${i})"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-icon" title="Editar" onclick="editCandidato(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteCandidato(${i})"><i class="fa-solid fa-trash"></i></button>
                <button class="btn-icon btn-success" title="Imprimir" onclick="printCandidato(${i})"><i class="fa-solid fa-print"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

/* ===== ACOES CANDIDATO ===== */

function viewCandidato(i) {
    const c = candidatos[i]; if (!c) return;
    document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-user" style="color:#1e88e5"></i> Detalhes do Candidato';
    const photoSrc = c.hasPhoto ? localStorage.getItem('farn_photo_' + c.cpf) : null;
    document.getElementById('modal-body').innerHTML = `
        ${photoSrc ? `<div style="text-align:center;margin-bottom:16px"><img src="${photoSrc}" style="width:120px;height:160px;object-fit:cover;border:2px solid #1e88e5;border-radius:8px" alt="Foto 3x4"></div>` : ''}
        <div class="detail-grid">
            <div class="detail-section-title">Dados Pessoais</div>
            <div class="detail-item full"><span class="detail-label">Nome</span><span class="detail-value">${c.nome}</span></div>
            <div class="detail-item"><span class="detail-label">CPF</span><span class="detail-value">${formatCPFDisplay(c.cpf)}</span></div>
            <div class="detail-item"><span class="detail-label">Nascimento</span><span class="detail-value">${c.nascimento||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Estado Civil</span><span class="detail-value">${c.estadoCivil||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Nacionalidade</span><span class="detail-value">${c.nacionalidade||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Naturalidade</span><span class="detail-value">${c.naturalidade||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Mae</span><span class="detail-value">${c.mae||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Pai</span><span class="detail-value">${c.pai||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Titulo Eleitor</span><span class="detail-value">${c.tituloEleitor||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Profissao</span><span class="detail-value">${c.profissao||'---'}</span></div>
            <div class="detail-section-title">Contato</div>
            <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${c.email||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">WhatsApp</span><span class="detail-value">${c.whatsapp||'---'}</span></div>
            <div class="detail-section-title">Endereco</div>
            <div class="detail-item full"><span class="detail-label">Endereco</span><span class="detail-value">${c.endereco||'---'}, ${c.numero||''}</span></div>
            <div class="detail-item"><span class="detail-label">Bairro</span><span class="detail-value">${c.bairro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cidade/UF</span><span class="detail-value">${c.cidade||'---'} - ${c.estado||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Local Votacao</span><span class="detail-value">${c.localVotacao||'---'}</span></div>
            <div class="detail-section-title">Dados Fisicos</div>
            <div class="detail-item"><span class="detail-label">Altura</span><span class="detail-value">${c.altura||'---'} cm</span></div>
            <div class="detail-item"><span class="detail-label">Peso</span><span class="detail-value">${c.peso||'---'} kg</span></div>
            <div class="detail-item"><span class="detail-label">Fator RH</span><span class="detail-value">${c.fatorRh||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Hipertensao</span><span class="detail-value">${c.hipertensao||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Diabetes</span><span class="detail-value">${c.diabetes||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Deficiencia</span><span class="detail-value">${c.deficiencia||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Tatuagem</span><span class="detail-value">${c.tatuagem||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cirurgia</span><span class="detail-value">${c.cirurgia||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Alcool</span><span class="detail-value">${c.alcool||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Medicamento</span><span class="detail-value">${c.medicamento||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cansaco</span><span class="detail-value">${c.cansaco||'---'}</span></div>
            <div class="detail-section-title">Uniforme</div>
            <div class="detail-item"><span class="detail-label">Calca</span><span class="detail-value">${c.calca||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Camisa</span><span class="detail-value">${c.camisa||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Calcado</span><span class="detail-value">${c.calcado||'---'}</span></div>
            <div class="detail-section-title">Turma e Acesso</div>
            <div class="detail-item"><span class="detail-label">Turma</span><span class="detail-value">${c.turma||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${c.status}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastro</span><span class="detail-value">${c.dataCadastro}</span></div>
            ${c.status === 'Aprovado' && c.senha ? `<div class="detail-item"><span class="detail-label">Senha de Acesso</span><span class="detail-value" style="color:#4caf50;font-weight:700">${c.senha}</span></div>` : ''}
        </div>`;
    openModal();
}

function deleteCandidato(i) {
    pendingDeleteIndex = i;
    pendingDeleteTurmaIndex = null;
    document.getElementById('confirm-text').innerHTML = `Tem certeza que deseja excluir o candidato <strong>${candidatos[i].nome}</strong>?`;
    document.getElementById('modal-confirm-overlay').classList.remove('hidden');
}

async function confirmDelete() {
    if (pendingDeleteTurmaIndex !== null) {
        if (pendingDeleteTurmaIndex !== null) {
            turmas.splice(pendingDeleteTurmaIndex, 1);
            backupTurmas();
            renderTurmasList();
            await populateTurmaSelect();
        }
    } else if (pendingDeleteIndex !== null) {
        candidatos.splice(pendingDeleteIndex, 1);
        backupCandidatos();
        renderList();
        if (typeof renderAlunosList === 'function') renderAlunosList();
    }
    closeConfirmModal();
}

function printCandidato(i) {
    const c = candidatos[i]; if (!c) return;
    const photoSrc = c.hasPhoto ? localStorage.getItem('farn_photo_' + c.cpf) : null;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - ${c.nome}</title><style>
        body{font-family:Arial,sans-serif;padding:40px;color:#222}h1{color:#1a237e;font-size:20px}h2{font-size:16px;margin:20px 0 10px;border-bottom:2px solid #1a237e;padding-bottom:6px}
        .row{display:flex;gap:20px;margin-bottom:8px}.col{flex:1}.label{font-size:11px;color:#666;text-transform:uppercase}.val{font-size:14px;margin-top:2px}
        .header-row{display:flex;align-items:flex-start;gap:24px;margin-bottom:16px}.photo-print{width:100px;height:130px;object-fit:cover;border:2px solid #1a237e;border-radius:6px;flex-shrink:0}
        @media print{body{padding:20px}}</style></head><body>
        <div class="header-row">
            ${c.photoDataUrl ? `<img src="${c.photoDataUrl}" class="photo-print" alt="Foto 3x4">` : ''}
            <div><h1>FARN - Forca Auxiliar de Resgate Nacional</h1><p style="color:#666">Ficha do Candidato</p></div>
        </div>
        <h2>Dados Pessoais</h2>
        <div class="row"><div class="col"><div class="label">Nome</div><div class="val">${c.nome}</div></div></div>
        <div class="row"><div class="col"><div class="label">CPF</div><div class="val">${formatCPFDisplay(c.cpf)}</div></div><div class="col"><div class="label">Nascimento</div><div class="val">${c.nascimento||'---'}</div></div></div>
        <div class="row"><div class="col"><div class="label">Estado Civil</div><div class="val">${c.estadoCivil||'---'}</div></div><div class="col"><div class="label">Nacionalidade</div><div class="val">${c.nacionalidade||'---'}</div></div></div>
        <div class="row"><div class="col"><div class="label">Profissao</div><div class="val">${c.profissao||'---'}</div></div></div>
        <div class="row"><div class="col"><div class="label">Mae</div><div class="val">${c.mae||'---'}</div></div><div class="col"><div class="label">Pai</div><div class="val">${c.pai||'---'}</div></div></div>
        <h2>Contato</h2>
        <div class="row"><div class="col"><div class="label">Email</div><div class="val">${c.email||'---'}</div></div><div class="col"><div class="label">WhatsApp</div><div class="val">${c.whatsapp||'---'}</div></div></div>
        <h2>Endereco</h2>
        <div class="row"><div class="col"><div class="label">Endereco</div><div class="val">${c.endereco||'---'}, ${c.numero||''}</div></div></div>
        <div class="row"><div class="col"><div class="label">Bairro</div><div class="val">${c.bairro||'---'}</div></div><div class="col"><div class="label">Cidade/UF</div><div class="val">${c.cidade||'---'} - ${c.estado||'---'}</div></div></div>
        <h2>Dados Fisicos</h2>
        <div class="row"><div class="col"><div class="label">Altura</div><div class="val">${c.altura||'---'} cm</div></div><div class="col"><div class="label">Peso</div><div class="val">${c.peso||'---'} kg</div></div><div class="col"><div class="label">Fator RH</div><div class="val">${c.fatorRh||'---'}</div></div></div>
        <div class="row"><div class="col"><div class="label">Hipertensao</div><div class="val">${c.hipertensao||'---'}</div></div><div class="col"><div class="label">Diabetes</div><div class="val">${c.diabetes||'---'}</div></div><div class="col"><div class="label">Deficiencia</div><div class="val">${c.deficiencia||'---'}</div></div></div>
        <h2>Uniforme</h2>
        <div class="row"><div class="col"><div class="label">Calca</div><div class="val">${c.calca||'---'}</div></div><div class="col"><div class="label">Camisa</div><div class="val">${c.camisa||'---'}</div></div><div class="col"><div class="label">Calcado</div><div class="val">${c.calcado||'---'}</div></div></div>
        <h2>Turma</h2>
        <div class="row"><div class="col"><div class="label">Turma</div><div class="val">${c.turma||'---'}</div></div><div class="col"><div class="label">Status</div><div class="val">${c.status}</div></div></div>
        ${c.status === 'Aprovado' && c.senha ? `<div class="row"><div class="col"><div class="label">Senha de Acesso</div><div class="val" style="color:#2e7d32;font-weight:bold">${c.senha}</div></div></div>` : ''}
        <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
}

function gerarContratoBC(i) {
    const c = candidatos[i]; if (!c) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Contrato de ACD - ${c.nome}</title><style>
        @page{size:A4;margin:25mm 20mm 25mm 20mm}
        body{font-family:'Times New Roman',Times,serif;font-size:13pt;line-height:1.8;color:#000;padding:0;margin:0}
        .header{text-align:center;margin-bottom:30px}
        .header h1{font-size:16pt;margin:0;text-transform:uppercase;letter-spacing:1px}
        .header h2{font-size:13pt;margin:6px 0 0;font-weight:normal}
        .title{text-align:center;font-size:15pt;font-weight:bold;margin:30px 0 24px;text-transform:uppercase;letter-spacing:2px}
        .text{margin:0 0 16px;text-align:justify;text-indent:40px}
        .field-line{margin:0 0 14px;text-align:justify}
        .blank{display:inline-block;min-width:200px;border-bottom:1px solid #000;text-align:center;padding:0 8px;font-weight:bold}
        .blank-wide{display:inline-block;min-width:350px;border-bottom:1px solid #000;text-align:center;padding:0 8px;font-weight:bold}
        .signatures{display:flex;justify-content:space-between;margin-top:80px;padding:0 40px}
        .sign-block{text-align:center;width:40%}
        .sign-block .line{border-top:1px solid #000;margin-top:80px;padding-top:6px;font-size:11pt}
        .local-date{text-align:right;margin-top:40px;margin-bottom:20px}
        @media print{body{padding:0}}
    </style></head><body>
        <div class="header">
            <h1>Forca Auxiliar de Resgate Nacional</h1>
            <h2>FARN</h2>
        </div>
        <div class="title">Contrato de ACD</div>
        <div class="text">
            Pelo presente instrumento particular, as partes abaixo qualificadas, de um lado, a <strong>FORCA AUXILIAR DE RESGATE NACIONAL - FARN</strong>, e de outro lado, o(a) candidato(a) abaixo identificado(a), resolvem celebrar o presente contrato de acordo com as clausulas e condicoes seguintes:
        </div>
        <div class="text">
            <strong>CLausula 1a - DO OBJETO</strong><br>
            O presente contrato tem por objeto o vinculo entre o(a) candidato(a) e a FARN, para fins de integracao ao quadro de membros da instituicao.
        </div>
        <div class="text">
            <strong>CLausula 2a - DOS DADOS DO CANDIDATO(A)</strong><br>
            O(A) candidato(a) declara, para os devidos fins, que as informacoes abaixo sao verdadeiras:
        </div>
        <div class="field-line" style="margin-left:40px">
            <strong>Nome:</strong> <span class="blank-wide">${c.nome || '_______________________________'}</span>
        </div>
        <div class="field-line" style="margin-left:40px">
            <strong>Nacionalidade:</strong> <span class="blank">${c.nacionalidade || '_______________'}</span>
            &nbsp;&nbsp;&nbsp;
            <strong>Estado Civil:</strong> <span class="blank">${c.estadoCivil || '_______________'}</span>
        </div>
        <div class="field-line" style="margin-left:40px">
            <strong>Profissao:</strong> <span class="blank">${c.profissao || '_______________'}</span>
        </div>
        <div class="field-line" style="margin-left:40px">
            <strong>CPF:</strong> <span class="blank">${formatCPFDisplay(c.cpf) || '_______________'}</span>
        </div>
        <div class="field-line" style="margin-left:40px">
            <strong>Endereco:</strong> <span class="blank-wide">${(c.endereco || '') + (c.numero ? ', ' + c.numero : '') + (c.bairro ? ' - ' + c.bairro : '') + (c.cidade ? ' - ' + c.cidade : '') + (c.estado ? '/' + c.estado : '') || '_________________________________________'}</span>
        </div>
        <div class="text">
            <strong>CLausula 3a - DAS OBRIGACOES</strong><br>
            O(A) candidato(a) se compromete a cumprir as normas internas da FARN, a participar das atividades programadas e a zelar pela imagem e pelos valores da instituicao.
        </div>
        <div class="text">
            <strong>CLausula 4a - DA VIGENCIA</strong><br>
            O presente contrato tera vigencia a partir da data de sua assinatura, pelo periodo determinado pelas normas internas da FARN.
        </div>
        <div class="text">
            E por estarem assim justos e acordados, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.
        </div>
        <div class="local-date">___________________, _____ de _________________ de ________</div>
        <div class="signatures">
            <div class="sign-block">
                <div class="line">FARN</div>
            </div>
            <div class="sign-block">
                <div class="line">${c.nome || 'Candidato(a)'}</div>
            </div>
        </div>
        <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
}

function printTable() {
    const table = document.getElementById('pre-table'); if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    if (!rows.length || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) { alert('Nenhum dado para imprimir.'); return; }
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - Pre-Inscritos</title><style>
        body{font-family:Arial,sans-serif;padding:30px;color:#222}h1{color:#1a237e;font-size:18px;margin-bottom:4px}p.sub{color:#888;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse}th{background:#1a237e;color:#fff;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase}
        td{padding:8px 12px;border-bottom:1px solid #ddd;font-size:13px}tr:nth-child(even){background:#f5f5f5}
        @media print{body{padding:20px}}</style></head><body>
        <h1>FARN - Pre-Inscritos</h1><p class="sub">Impressao: ${new Date().toLocaleDateString('pt-BR')}</p>
        ${table.outerHTML}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
}

function downloadExcelTemplate() {
    const headers = [
        'Nome Completo', 'CPF', 'Data de Nascimento', 'Estado Civil', 'Nacionalidade',
        'Naturalidade', 'Profissao', 'Titulo de Eleitor', 'Mae', 'Pai', 'Email', 'WhatsApp',
        'Endereco', 'Numero', 'Bairro', 'Cidade', 'Estado', 'Local de Votacao',
        'Altura (cm)', 'Peso (kg)', 'Fator RH', 'Hipertensao', 'Diabetes',
        'Deficiencia Fisica', 'Tatuagem', 'Cirurgia', 'Bebida Alcoolica',
        'Medicamento em uso', 'Cansaco frequente', 'Calca', 'Camisa', 'Calcado',
        'Turma', 'Senha de Acesso'
    ];

    const exampleRow = [
        'Joao da Silva', '00000000000', '1990-01-15', 'Solteiro(a)', 'Brasileira',
        'Natal/RN', 'Soldado', '0000.0000.0000', 'Maria da Silva', 'Jose da Silva', 'joao@email.com', '(84) 99999-0000',
        'Rua Exemplo', '123', 'Centro', 'Natal', 'RN', 'Escola Municipal',
        '175', '80', 'O+', 'Nao', 'Nao',
        'Nao', 'Nao', 'Nao', 'Nao',
        'Nenhum', 'Nao',
        '38', 'M', '40',
        '', '123456'
    ];

    const ws_data = [headers, exampleRow];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    ws['!cols'] = headers.map(() => ({ wch: 22 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pre-Cadastro');
    XLSX.writeFile(wb, 'modelo_pre_cadastro_farn.xlsx');
}

async function importExcelFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rows.length < 2) { alert('A planilha esta vazia ou nao contem dados.'); return; }

        const fieldMap = [
            'nome', 'cpf', 'nascimento', 'estadoCivil', 'nacionalidade',
            'naturalidade', 'profissao', 'tituloEleitor', 'mae', 'pai', 'email', 'whatsapp',
            'endereco', 'numero', 'bairro', 'cidade', 'estado', 'localVotacao',
            'altura', 'peso', 'fatorRh', 'hipertensao', 'diabetes',
            'deficiencia', 'tatuagem', 'cirurgia', 'alcool',
            'medicamento', 'cansaco', 'calca', 'camisa', 'calcado',
            'turma', 'senha'
        ];

        let importados = 0;
        let erros = 0;

        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || !row[0]) { erros++; continue; }

            const data = { status: 'Pendente', dataCadastro: new Date().toLocaleDateString('pt-BR') };

            for (let c = 0; c < Math.min(fieldMap.length, row.length); c++) {
                let val = row[c] !== undefined ? String(row[c]).trim() : '';
                if (fieldMap[c] === 'cpf') val = val.replace(/\D/g, '');
                data[fieldMap[c]] = val;
            }

            if (!data.nome || !data.cpf) { erros++; continue; }

            if (data.status === 'Aprovado' && !data.senha) {
                data.senha = data.cpf.substring(0, 6);
            }

            data.id = Date.now() + importados;
            candidatos.push(data);
            importados++;
        }

        backupCandidatos();
        renderList();
        alert(`Importacao concluida!\n\nImportados: ${importados}\Erros: ${erros}`);
    } catch(e) {
        alert('Erro ao ler o arquivo: ' + e.message);
    }

    event.target.value = '';
}

function exportExcel() {
    if (!candidatos.length) { alert('Nenhum candidato para exportar.'); return; }
    let csv = 'Nome,CPF,Nascimento,Estado Civil,Nacionalidade,Naturalidade,Profissao,Mae,Pai,Titulo,Email,WhatsApp,Endereco,Numero,Bairro,Cidade,Estado,Altura,Peso,Fator RH,Hipertensao,Diabetes,Deficiencia,Tatuagem,Cirurgia,Alcool,Medicamento,Cansaco,Calca,Camisa,Calcado,Turma,Status,Senha,Cadastro\n';
    candidatos.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.nascimento||''}","${c.estadoCivil||''}","${c.nacionalidade||''}","${c.naturalidade||''}","${c.profissao||''}","${c.mae||''}","${c.pai||''}","${c.tituloEleitor||''}","${c.email||''}","${c.whatsapp||''}","${c.endereco||''}","${c.numero||''}","${c.bairro||''}","${c.cidade||''}","${c.estado||''}","${c.altura||''}","${c.peso||''}","${c.fatorRh||''}","${c.hipertensao||''}","${c.diabetes||''}","${c.deficiencia||''}","${c.tatuagem||''}","${c.cirurgia||''}","${c.alcool||''}","${c.medicamento||''}","${c.cansaco||''}","${c.calca||''}","${c.camisa||''}","${c.calcado||''}","${c.turma||''}","${c.status}","${c.senha||''}","${c.dataCadastro}"\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pre_inscritos_farn.csv'; a.click();
}

function filterList() {
    const search = document.getElementById('pre-search').value.toLowerCase();
    const filter = document.getElementById('pre-filter').value;
    document.querySelectorAll('#pre-table-body tr').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = ((!search || text.includes(search)) && (!filter || text.includes(filter.toLowerCase()))) ? '' : 'none';
    });
}

/* ===== ALUNOS - GUIAS POR STATUS ===== */

let currentAlunosTab = 'aprovados';

const STATUS_MAP = {
    'aprovados': 'Aprovado',
    'pendentes': 'Pendente',
    'reprovados': 'Rejeitado',
    'segunda-chamada': 'Segunda Chamada'
};

function switchAlunosTab(tab, btn) {
    currentAlunosTab = tab;
    document.querySelectorAll('.alunos-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAlunosList();
}

function renderAlunosList() {
    const tbody = document.getElementById('alunos-table-body');
    if (!tbody) return;

    const statusFilter = STATUS_MAP[currentAlunosTab];
    const filtered = candidatos.filter(c => c.status === statusFilter);

    document.getElementById('tab-count-aprovados').textContent = candidatos.filter(c => c.status === 'Aprovado').length;
    document.getElementById('tab-count-pendentes').textContent = candidatos.filter(c => c.status === 'Pendente').length;
    document.getElementById('tab-count-reprovados').textContent = candidatos.filter(c => c.status === 'Rejeitado').length;
    document.getElementById('tab-count-segunda-chamada').textContent = candidatos.filter(c => c.status === 'Segunda Chamada').length;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#888;padding:24px">Nenhum aluno na aba "${statusFilter}"</td></tr>`;
        return;
    }

    const idxMap = filtered.map(c => candidatos.indexOf(c));

    const allStatuses = [
        { value: 'Pendente', label: 'Pendente', icon: 'fa-clock', color: '#f57c00', tab: 'pendentes' },
        { value: 'Aprovado', label: 'Aprovado', icon: 'fa-check-circle', color: '#4caf50', tab: 'aprovados' },
        { value: 'Rejeitado', label: 'Reprovado', icon: 'fa-times-circle', color: '#f44336', tab: 'reprovados' },
        { value: 'Segunda Chamada', label: '2a Chamada', icon: 'fa-rotate', color: '#2196f3', tab: 'segunda-chamada' }
    ];

    tbody.innerHTML = filtered.map((c, fi) => {
        const i = idxMap[fi];
        const otherStatuses = allStatuses.filter(s => s.value !== c.status);
        return `<tr>
            <td>${c.nome}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td>${c.turma || '-'}</td>
            <td>${c.dataCadastro || '-'}</td>
            <td><div class="actions-cell">
                <button class="btn-icon btn-info" title="Visualizar" onclick="viewCandidato(${i})"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-icon" title="Editar" onclick="editCandidato(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteCandidatoAlunos(${i})"><i class="fa-solid fa-trash"></i></button>
                <button class="btn-icon btn-success" title="Imprimir" onclick="printCandidato(${i})"><i class="fa-solid fa-print"></i></button>
                ${c.status === 'Aprovado' ? `<button class="btn-icon btn-contrato" title="Contrato de BC" onclick="gerarContratoBC(${i})"><i class="fa-solid fa-file-contract"></i></button>` : ''}
                <div class="status-dropdown">
                    <button class="btn-icon btn-status" title="Alterar Status" onclick="toggleStatusDropdown(event, ${i})"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>
                    <div class="status-dropdown-menu hidden" id="status-dd-${i}">
                        ${otherStatuses.map(s => `
                            <button onclick="changeStatus(${i}, '${s.value}')">
                                <i class="fa-solid ${s.icon}" style="color:${s.color}"></i>
                                <span>${s.label}</span>
                                <i class="fa-solid fa-arrow-right status-dd-arrow"></i>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div></td>
        </tr>`;
    }).join('');
}

function toggleStatusDropdown(e, i) {
    e.stopPropagation();
    document.querySelectorAll('.status-dropdown-menu').forEach(d => d.classList.add('hidden'));
    const dd = document.getElementById('status-dd-' + i);
    if (dd) dd.classList.toggle('hidden');
}

document.addEventListener('click', () => {
    document.querySelectorAll('.status-dropdown-menu').forEach(d => d.classList.add('hidden'));
});

async function changeStatus(i, newStatus) {
    if (!candidatos[i]) return;
    candidatos[i].status = newStatus;
    if (newStatus === 'Aprovado' && candidatos[i].cpf) {
        candidatos[i].senha = candidatos[i].cpf.substring(0, 6);
    }
    backupCandidatos();
    document.querySelectorAll('.status-dropdown-menu').forEach(d => d.classList.add('hidden'));
    renderAlunosList();
    renderList();
}

function deleteCandidatoAlunos(i) {
    pendingDeleteIndex = i;
    pendingDeleteTurmaIndex = null;
    document.getElementById('confirm-text').innerHTML = `Tem certeza que deseja excluir o aluno <strong>${candidatos[i].nome}</strong>?`;
    document.getElementById('modal-confirm-overlay').classList.remove('hidden');
}

function filterAlunos() {
    const search = document.getElementById('alunos-search').value.toLowerCase();
    document.querySelectorAll('#alunos-table-body tr').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = (!search || text.includes(search)) ? '' : 'none';
    });
}

function exportExcelAlunos() {
    const statusFilter = STATUS_MAP[currentAlunosTab];
    const filtered = candidatos.filter(c => c.status === statusFilter);
    if (!filtered.length) { alert('Nenhum aluno para exportar nesta aba.'); return; }
    let csv = 'Nome,CPF,Nascimento,Turma,Status,Data Cadastro\n';
    filtered.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.nascimento||''}","${c.turma||''}","${c.status}","${c.dataCadastro||''}"\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `alunos_${statusFilter.toLowerCase().replace(/\s/g,'_')}_farn.csv`; a.click();
}

function printTableAlunos() {
    const statusFilter = STATUS_MAP[currentAlunosTab];
    const filtered = candidatos.filter(c => c.status === statusFilter);
    if (!filtered.length) { alert('Nenhum aluno para imprimir nesta aba.'); return; }
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - Alunos - ${statusFilter}</title><style>
        body{font-family:Arial,sans-serif;padding:30px;color:#222}h1{color:#1a237e;font-size:18px;margin-bottom:4px}p.sub{color:#888;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse}th{background:#1a237e;color:#fff;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase}
        td{padding:8px 12px;border-bottom:1px solid #ddd;font-size:13px}tr:nth-child(even){background:#f5f5f5}
        @media print{body{padding:20px}}</style></head><body>
        <h1>FARN - Alunos (${statusFilter})</h1><p class="sub">Impressao: ${new Date().toLocaleDateString('pt-BR')}</p>
        <table><thead><tr><th>Nome</th><th>CPF</th><th>Turma</th><th>Data Cadastro</th></tr></thead><tbody>
        ${filtered.map(c => `<tr><td>${c.nome}</td><td>${formatCPFDisplay(c.cpf)}</td><td>${c.turma||'-'}</td><td>${c.dataCadastro||'-'}</td></tr>`).join('')}
        </tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
}

/* ===== TURMAS CRUD ===== */

function renderTurmasList() {
    const tbody = document.getElementById('turmas-table-body');
    const badge = document.getElementById('turmas-count-badge');
    if (!tbody) return;
    if (badge) badge.textContent = turmas.length + ' turma' + (turmas.length !== 1 ? 's' : '');
    if (!turmas.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:24px">Nenhuma turma cadastrada</td></tr>'; return; }
    tbody.innerHTML = turmas.map((t, i) => {
        const candidatosNaTurma = candidatos.filter(c => c.turma === t.nome).length;
        return `<tr>
            <td>${t.nome}</td>
            <td>${t.descricao || '-'}</td>
            <td><span class="badge green">${candidatosNaTurma} aluno(s)</span></td>
            <td><div class="actions-cell">
                <button class="btn-icon" title="Editar" onclick="editTurma(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteTurma(${i})"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

function openFormTurma() {
    editingTurmaIndex = null;
    document.getElementById('turma-nome').value = '';
    document.getElementById('turma-descricao').value = '';
    document.getElementById('turma-form-title').innerHTML = '<i class="fa-solid fa-plus" style="color:#4caf50;margin-right:8px"></i> Nova Turma';
    document.getElementById('modal-turma-overlay').classList.remove('hidden');
}

function editTurma(i) {
    const t = turmas[i]; if (!t) return;
    editingTurmaIndex = i;
    document.getElementById('turma-nome').value = t.nome || '';
    document.getElementById('turma-descricao').value = t.descricao || '';
    document.getElementById('turma-form-title').innerHTML = '<i class="fa-solid fa-pen" style="color:#4caf50;margin-right:8px"></i> Editar Turma';
    document.getElementById('modal-turma-overlay').classList.remove('hidden');
}

function deleteTurma(i) {
    pendingDeleteTurmaIndex = i;
    pendingDeleteIndex = null;
    document.getElementById('confirm-text').innerHTML = `Tem certeza que deseja excluir a turma <strong>${turmas[i].nome}</strong>?`;
    document.getElementById('modal-confirm-overlay').classList.remove('hidden');
}

async function handleTurmaSubmit(event) {
    event.preventDefault();
    const nome = document.getElementById('turma-nome').value.trim();
    const descricao = document.getElementById('turma-descricao').value.trim();
    if (!nome) { alert('Nome da turma e obrigatorio.'); return false; }

    if (editingTurmaIndex !== null) {
        const turma = turmas[editingTurmaIndex];
        turma.nome = nome;
        turma.descricao = descricao;
        editingTurmaIndex = null;
    } else {
        const nova = { id: Date.now(), nome, descricao };
        turmas.push(nova);
    }

    backupTurmas();
    document.getElementById('modal-turma-overlay').classList.add('hidden');
    renderTurmasList();
    await populateTurmaSelect();
    return false;
}

function closeTurmaModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-turma-overlay').classList.add('hidden');
    editingTurmaIndex = null;
}

/* ===== POPULATE TURMA SELECT ===== */

async function populateTurmaSelect() {
    const select = document.getElementById('fc-turma');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione a turma...</option>';
    turmas.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.nome;
        opt.textContent = t.nome;
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

/* ===== MODAL ===== */

function openModal() { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById('modal-overlay').classList.add('hidden'); }
function printModal() { window.print(); }
function closeConfirmModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById('modal-confirm-overlay').classList.add('hidden'); pendingDeleteIndex = null; pendingDeleteTurmaIndex = null; }

/* ===== FOTO E ANEXOS ===== */

function saveFormState() {
    try {
        const state = {};
        formFields.forEach(id => { const el = document.getElementById(id); if (el) state[id] = el.value; });
        state._editingIndex = editingIndex;
        state._screen = 'admin-form-candidato';
        localStorage.setItem('farn_form_state', JSON.stringify(state));
    } catch(e) {}
}

function restoreFormState() {
    try {
        const raw = localStorage.getItem('farn_form_state');
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (state._screen !== 'admin-form-candidato') return false;
        formFields.forEach(id => { if (state[id] !== undefined) { const el = document.getElementById(id); if (el) el.value = state[id]; } });
        if (state._editingIndex !== null && state._editingIndex !== undefined) {
            editingIndex = state._editingIndex;
        }
        localStorage.removeItem('farn_form_state');
        return true;
    } catch(e) { return false; }
}

function saveLoginState() {
    try {
        localStorage.setItem('farn_login', 'admin');
        if (currentUserData) localStorage.setItem('farn_user_data', JSON.stringify(currentUserData));
    } catch(e) {}
}

function restoreLoginState() {
    try {
        if (localStorage.getItem('farn_login') !== 'admin') return false;
        const ud = localStorage.getItem('farn_user_data');
        if (ud) currentUserData = JSON.parse(ud);
        return true;
    } catch(e) { return false; }
}

function clearLoginState() {
    try {
        localStorage.removeItem('farn_login');
        localStorage.removeItem('farn_user_data');
    } catch(e) {}
}

function handlePhotoUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        alert('Foto muito grande (' + Math.round(file.size/1024/1024) + 'MB). Maximo 3MB.');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 400;
            canvas.getContext('2d').drawImage(img, 0, 0, 300, 400);
            img.src = '';
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                document.getElementById('photo-preview').src = url;
                document.getElementById('photo-preview').classList.remove('hidden');
                document.getElementById('photo-placeholder').style.display = 'none';
                document.getElementById('btn-remove-photo').style.display = '';
            }, 'image/jpeg', 0.5);
        };
        img.onerror = function() { alert('Erro ao processar foto.'); };
        img.src = e.target.result;
    };
    reader.onerror = function() { alert('Erro ao ler arquivo.'); };
    reader.readAsDataURL(file);
}

function openCamera() {
    saveFormState();
    saveLoginState();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        openBrowserCamera();
    } else {
        const i = document.getElementById('photo-input');
        i.setAttribute('capture', 'user');
        i.click();
    }
}

function openBrowserCamera() {
    const overlay = document.createElement('div');
    overlay.id = 'camera-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px"><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
    document.body.appendChild(overlay);

    const video = document.getElementById('camera-video');
    let stream = null;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 800 }, height: { ideal: 600 } } })
    .then(function(s) {
        stream = s;
        video.srcObject = stream;
    })
    .catch(function(err) {
        document.body.removeChild(overlay);
        alert('Nao foi possivel acessar a camera: ' + err.message);
    });

    document.getElementById('camera-capture').onclick = function() {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 400;
        canvas.getContext('2d').drawImage(video, 0, 0, 300, 400);
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
        canvas.toBlob(function(blob) {
            const url = URL.createObjectURL(blob);
            document.getElementById('photo-preview').src = url;
            document.getElementById('photo-preview').classList.remove('hidden');
            document.getElementById('photo-placeholder').style.display = 'none';
            document.getElementById('btn-remove-photo').style.display = '';
        }, 'image/jpeg', 0.5);
    };

    document.getElementById('camera-cancel').onclick = function() {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
    };
}

function openDocCamera() {
    saveFormState();
    saveLoginState();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        openDocCameraBrowser();
    } else {
        document.getElementById('camera-input').click();
    }
}

function openDocCameraBrowser() {
    const overlay = document.createElement('div');
    overlay.id = 'camera-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px"><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
    document.body.appendChild(overlay);

    const video = document.getElementById('camera-video');
    let stream = null;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1200 }, height: { ideal: 900 } } })
    .then(function(s) {
        stream = s;
        video.srcObject = stream;
    })
    .catch(function(err) {
        document.body.removeChild(overlay);
        alert('Nao foi possivel acessar a camera: ' + err.message);
    });

    document.getElementById('camera-capture').onclick = function() {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 800;
        canvas.height = video.videoHeight || 600;
        canvas.getContext('2d').drawImage(video, 0, 0);
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
        canvas.toBlob(function(blob) {
            const file = new File([blob], 'documento_' + Date.now() + '.jpg', { type: 'image/jpeg' });
            addFile(file);
        }, 'image/jpeg', 0.7);
    };

    document.getElementById('camera-cancel').onclick = function() {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
    };
}

function removePhoto() {
    document.getElementById('photo-preview').src = '';
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('photo-placeholder').style.display = '';
    document.getElementById('photo-input').value = '';
    document.getElementById('btn-remove-photo').style.display = 'none';
}

function handleFilesUpload(event) { Array.from(event.target.files).forEach(f => addFile(f)); }
function handleFileDrop(event) { event.preventDefault(); event.currentTarget.classList.remove('dragover'); Array.from(event.dataTransfer.files).forEach(f => addFile(f)); }

function addFile(file) {
    if (uploadedFiles.length >= 5) { alert('Maximo de 5 arquivos.'); return; }
    uploadedFiles.push({ id: Date.now() + Math.random(), file });
    renderFilesList();
}

function removeFile(id) { uploadedFiles = uploadedFiles.filter(f => f.id !== id); renderFilesList(); }

function renderFilesList() {
    const list = document.getElementById('files-list'); if (!list) return;
    list.innerHTML = uploadedFiles.map(f => {
        const icon = f.file.name.endsWith('.pdf') ? 'fa-file-pdf' : f.file.name.match(/\.(jpg|jpeg|png)$/i) ? 'fa-file-image' : 'fa-file';
        return `<div class="file-item"><i class="fa-solid ${icon}" style="color:#f57c00"></i><span class="file-name">${f.file.name}</span><span class="file-size">${(f.file.size/1024).toFixed(1)}KB</span><button type="button" class="btn-icon btn-danger-icon" onclick="removeFile(${f.id})"><i class="fa-solid fa-trash"></i></button></div>`;
    }).join('');
}

/* ===== GERENCIAR USUARIOS ===== */

let editingUsuarioDocId = null;

function renderUsuariosList() {
    const list = document.getElementById('usuarios-list');
    const empty = document.getElementById('usuarios-empty');
    if (!list) return;
    if (usuarios.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = usuarios.map(u => {
        const permTags = (u.permissoes || []).map(p => {
            if (p === 'pre-inscricao') return '<span class="usuario-tag usuario-tag-pre">Pre-Inscricao</span>';
            if (p === 'admin') return '<span class="usuario-tag usuario-tag-admin">Admin</span>';
            if (p === 'instrutor') return '<span class="usuario-tag usuario-tag-instrutor">Instrutor</span>';
            return '';
        }).join('');
        const statusBadge = u.ativo === false ? '<span style="color:#f44336;font-size:11px;font-weight:600">Inativo</span>' : '<span style="color:#4caf50;font-size:11px;font-weight:600">Ativo</span>';
        return `<div class="usuario-row">
            <div class="usuario-info">
                <div class="usuario-nome">${u.nome || ''} ${statusBadge}</div>
                <div class="usuario-cpf">CPF: ${formatCPFDisplay(u.cpf)}</div>
                <div class="usuario-permissoes">${permTags}</div>
            </div>
            <div class="usuario-actions">
                <button class="btn-outline btn-sm" onclick="editUsuario('${u.docId}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-outline btn-sm" onclick="toggleUsuarioAtivo('${u.docId}', ${u.ativo !== false})" title="${u.ativo !== false ? 'Desativar' : 'Ativar'}"><i class="fa-solid fa-${u.ativo !== false ? 'ban' : 'check'}"></i></button>
                <button class="btn-outline btn-sm btn-danger" onclick="deleteUsuario('${u.docId}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function openUsuarioForm(docId) {
    editingUsuarioDocId = docId || null;
    const form = document.getElementById('usuario-form');
    form.reset();
    document.getElementById('uf-perm-pre').checked = false;
    document.getElementById('uf-perm-admin').checked = false;
    document.getElementById('uf-perm-instrutor').checked = false;
    if (docId) {
        const u = usuarios.find(u => u.docId === docId);
        if (u) {
            document.getElementById('usuario-form-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:#2196f3;margin-right:8px"></i> Editar Usuario';
            document.getElementById('uf-nome').value = u.nome || '';
            document.getElementById('uf-cpf').value = u.cpf || '';
            document.getElementById('uf-senha').value = u.senha || '';
            const p = u.permissoes || [];
            if (p.includes('pre-inscricao')) document.getElementById('uf-perm-pre').checked = true;
            if (p.includes('admin')) document.getElementById('uf-perm-admin').checked = true;
            if (p.includes('instrutor')) document.getElementById('uf-perm-instrutor').checked = true;
        }
    } else {
        document.getElementById('usuario-form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#2196f3;margin-right:8px"></i> Novo Usuario';
    }
    showAdminSection('admin-form-usuario', document.querySelector('.nav-usuarios'));
}

function editUsuario(docId) {
    openUsuarioForm(docId);
}

async function handleSaveUsuario(event) {
    event.preventDefault();
    const nome = document.getElementById('uf-nome').value.trim();
    const cpf = document.getElementById('uf-cpf').value.replace(/\D/g, '');
    const senha = document.getElementById('uf-senha').value;
    if (!nome || !cpf || !senha) { alert('Preencha nome, CPF e senha.'); return false; }
    if (cpf.length !== 11) { alert('CPF invalido.'); return false; }
    if (senha.length < 4) { alert('Senha deve ter minimo 4 caracteres.'); return false; }
    const permissoes = [];
    if (document.getElementById('uf-perm-pre').checked) permissoes.push('pre-inscricao');
    if (document.getElementById('uf-perm-admin').checked) permissoes.push('admin');
    if (document.getElementById('uf-perm-instrutor').checked) permissoes.push('instrutor');
    if (permissoes.length === 0) { alert('Selecione pelo menos uma permissao.'); return false; }
    const userData = { nome, cpf, senha, permissoes, ativo: true };
    try {
        if (editingUsuarioDocId) {
            await dbFirestore.collection(FB_USUARIOS).doc(editingUsuarioDocId).set(userData, { merge: true });
        } else {
            const exists = usuarios.find(u => u.cpf === cpf);
            if (exists) { alert('Ja existe um usuario com este CPF.'); return false; }
            await dbFirestore.collection(FB_USUARIOS).doc(cpf).set(userData);
        }
        editingUsuarioDocId = null;
        showAdminSection('admin-usuarios', document.querySelector('.nav-usuarios'));
    } catch(e) {
        alert('Erro ao salvar usuario: ' + e.message);
    }
    return false;
}

async function toggleUsuarioAtivo(docId, currentAtivo) {
    try {
        await dbFirestore.collection(FB_USUARIOS).doc(docId).set({ ativo: !currentAtivo }, { merge: true });
    } catch(e) {
        alert('Erro ao alterar status: ' + e.message);
    }
}

async function deleteUsuario(docId) {
    if (!confirm('Excluir este usuario permanentemente?')) return;
    try {
        await dbFirestore.collection(FB_USUARIOS).doc(docId).delete();
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

function toggleUsuarioSenha() {
    const input = document.getElementById('uf-senha');
    const icon = document.getElementById('uf-eye-icon');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}
