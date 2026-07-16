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
let currentFormado = null;
let usuarios = [];
let formados = [];
let currentUserData = null;
let parceiros = [];
let onlineCpfs = new Set();
let onlineHeartbeat = null;
let onlineUnsubscribe = null;

/* ===== FIREBASE SINCRONIZACAO (Firestore) ===== */

const FB_CANDIDATOS = 'candidatos';
const FB_TURMAS = 'turmas';
const FB_USUARIOS = 'usuarios';
const FB_FORMADOS = 'formados';
const FB_PARCEIROS = 'parceiros';
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

function backupUsuarios() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_USUARIOS);
    batch.set(ref.doc('_index'), { count: usuarios.length, timestamp: Date.now() });
    usuarios.forEach((u, i) => {
        const id = u.docId ? String(u.docId) : (u.cpf ? String(u.cpf) : String(i));
        const copy = Object.assign({}, u);
        delete copy.docId;
        batch.set(ref.doc(id), copy);
    });
    batch.commit().catch(e => console.error('Erro ao salvar usuarios:', e));
}

function backupFormados() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_FORMADOS);
    batch.set(ref.doc('_index'), { count: formados.length, timestamp: Date.now() });
    formados.forEach((f, i) => {
        const id = f.docId ? String(f.docId) : (f.cpf ? String(f.cpf) : String(i));
        const copy = Object.assign({}, f);
        delete copy.docId;
        batch.set(ref.doc(id), copy);
    });
    batch.commit().catch(e => console.error('Erro ao salvar formados:', e));
}

function backupParceiros() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_PARCEIROS);
    batch.set(ref.doc('_index'), { count: parceiros.length, timestamp: Date.now() });
    parceiros.forEach((p, i) => {
        const id = p.docId ? String(p.docId) : String(i);
        const copy = Object.assign({}, p);
        delete copy.docId;
        batch.set(ref.doc(id), copy);
    });
    batch.commit().catch(e => console.error('Erro ao salvar parceiros:', e));
}

async function syncAllDatabases() {
    if (!firebaseReady && !firebaseError) {
        alert('Firebase nao conectado. Verifique a conexao.');
        return;
    }
    const btn = document.getElementById('btn-sync-all');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
    }
    try {
        backupCandidatos();
        backupTurmas();
        backupUsuarios();
        backupFormados();
        backupParceiros();
        await dbFirestore.collection(FB_CANDIDATOS).get();
        await dbFirestore.collection(FB_TURMAS).get();
        await dbFirestore.collection(FB_USUARIOS).get();
        await dbFirestore.collection(FB_FORMADOS).get();
        await dbFirestore.collection(FB_PARCEIROS).get();
        renderList();
        renderTurmasList();
        populateTurmaSelect();
        if (typeof renderUsuariosList === 'function') renderUsuariosList();
        if (typeof renderFormadosList === 'function') renderFormadosList();
        if (typeof renderParceirosList === 'function') renderParceirosList();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Sincronizado!';
        setTimeout(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sincronizar Todos os Bancos'; }
        }, 2000);
    } catch (e) {
        console.error('Erro na sincronizacao:', e);
        alert('Erro ao sincronizar: ' + e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sincronizar Todos os Bancos'; }
    }
}

function initFirebaseListeners() {
    return new Promise((resolve) => {
        let loaded = 0;
        const checkReady = () => {
            loaded++;
            if (loaded >= 5) {
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

        dbFirestore.collection(FB_FORMADOS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.docId = doc.id;
                    result.push(data);
                }
            });
            formados = result;
            if (firebaseReady && typeof renderFormadosList === 'function') renderFormadosList();
            checkReady();
        }, (error) => {
            console.error('Erro Firestore formados:', error);
            checkReady();
        });

        dbFirestore.collection(FB_PARCEIROS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.docId = doc.id;
                    result.push(data);
                }
            });
            parceiros = result;
            if (firebaseReady && typeof renderParceirosList === 'function') renderParceirosList();
            checkReady();
        }, (error) => {
            console.error('Erro Firestore parceiros:', error);
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
    startOnlineListener();
    backupUsuarios();
    backupFormados();
    backupParceiros();
    initPcfCursosListeners();
    candidatos.forEach(c => { c.cadastradoPor = 'OZIEL'; });
    candidatos.forEach(c => { if (!c.dataHoraCadastro && c.dataCadastro) c.dataHoraCadastro = c.dataCadastro + ' 00:00'; });
    backupCandidatos();

    if (restoreLoginState()) {
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-admin').classList.add('active');
        document.getElementById('topbar-user-name').textContent = currentUserData ? currentUserData.nome : 'Administrador';
        applyUserPermissions();
        const firstVisible = document.querySelector('#screen-admin .sidebar-nav .nav-item:not([style*="display: none"])');
        if (firstVisible) firstVisible.click();
        await populateTurmaSelect();
        renderList();
        renderTurmasList();
        if (restoreFormState()) {
            showAdminSection('admin-form-candidato', document.querySelector('.nav-item:nth-child(2)'));
            await populateTurmaSelect();
        }
    } else {
        const lastCpf = getLastLogin();
        if (lastCpf) {
            const cpfInput = document.getElementById('cpf');
            if (cpfInput) {
                let v = lastCpf;
                if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                cpfInput.value = v;
            }
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
    updateMatricula(v);
}

function generateMatricula(cpf) {
    const digits = (cpf || '').replace(/\D/g, '');
    if (digits.length < 5) return '';
    return 'ACD' + digits.slice(-5);
}

function updateMatricula(cpfFormatted) {
    const wrapper = document.getElementById('fc-matricula-wrapper');
    const display = document.getElementById('fc-matricula-display');
    if (!wrapper || !display) return;
    const mat = generateMatricula(cpfFormatted);
    if (mat) {
        display.textContent = mat;
        wrapper.style.display = '';
    } else {
        wrapper.style.display = 'none';
        display.textContent = '';
    }
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

function toggleSenhaCadastro() {
    const input = document.getElementById('fc-senha');
    const icon = document.getElementById('eye-icon-cadastro');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

function toggleSenhaFormado() {
    const input = document.getElementById('ff-senha');
    const icon = document.getElementById('eye-icon-formado');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

function toggleSenhaPreCadastro() {
    const input = document.getElementById('pcf-senha');
    const icon = document.getElementById('eye-icon-pcf');
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
    const rawInput = document.getElementById('cpf').value.trim();
    const cpf = rawInput.replace(/\D/g, '');
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const roleErrorEl = document.getElementById('login-role-error');
    errorEl.classList.add('hidden');
    roleErrorEl.classList.add('hidden');
    if (!selectedLoginRole) { roleErrorEl.classList.remove('hidden'); return false; }

    if (selectedLoginRole === 'admin') {
        if (cpf === ADMIN_CPF && password === ADMIN_SENHA) {
            currentUserData = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'instrutor', 'usuarios'] };
            saveLastLogin(cpf);
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
        saveLastLogin(cpf);
        enterAdminPanel();
        saveLoginState();
    } else if (selectedLoginRole === 'aluno') {
        if (cpf === ADMIN_CPF && password === ADMIN_SENHA) {
            currentUserData = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'instrutor', 'usuarios'] };
            currentAluno = { nome: 'Administrador Geral', cpf: ADMIN_CPF, photoDataUrl: null };
            document.getElementById('screen-login').classList.remove('active');
            document.getElementById('screen-portal').classList.add('active');
            document.getElementById('portal-aluno-nome').textContent = 'Administrador';
            const portalPhotoBox = document.querySelector('.portal-photo-box');
            portalPhotoBox.innerHTML = '<i class="fa-solid fa-user-shield" style="font-size:56px;color:#f57c00"></i>';
            saveLastLogin(cpf);
            saveLoginState();
            return false;
        }
        const aluno = candidatos.find(c => {
            const matchCpf = c.cpf === cpf;
            const matchMatricula = c.matricula && c.matricula.toUpperCase() === rawInput.toUpperCase();
            return (matchCpf || matchMatricula) && c.senha === password && c.status === 'Aprovado';
        });
        if (!aluno) {
            errorEl.querySelector('span').textContent = 'CPF, matricula ou senha invalidos, ou aluno nao aprovado';
            errorEl.classList.remove('hidden');
            document.getElementById('password').value = '';
            return false;
        }
        currentAluno = aluno;
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-portal').classList.add('active');
        const primeiroNome = (aluno.nome || '').split(' ')[0];
        document.getElementById('portal-aluno-nome').textContent = primeiroNome;
        document.getElementById('portal-aluno-matricula').textContent = 'Matricula: ' + (aluno.matricula || '---');
        setAlunoOnline(currentAluno.cpf);
        showPortalSection('noticias');
        portalLoadSidebarFoto();
    } else if (selectedLoginRole === 'formado') {
        if (cpf === ADMIN_CPF && password === ADMIN_SENHA) {
            currentUserData = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'instrutor', 'usuarios'] };
            currentFormado = { nome: 'Administrador Geral', cpf: ADMIN_CPF, photoDataUrl: null, matricula: 'ADMIN', cursos: [] };
            document.getElementById('screen-login').classList.remove('active');
            document.getElementById('screen-portal-formado').classList.add('active');
            document.getElementById('portal-formado-nome').textContent = 'Administrador';
            document.getElementById('portal-formado-nome-top').textContent = 'Administrador';
            document.getElementById('portal-formado-matricula').textContent = 'ADMIN';
            document.getElementById('portal-formado-matricula-side').textContent = 'ADMIN';
            document.getElementById('portal-formado-cursos-count').textContent = '0';
            const photoBox = document.querySelector('#screen-portal-formado .portal-photo-box');
            photoBox.innerHTML = '<i class="fa-solid fa-user-shield" style="font-size:56px;color:#f57c00"></i>';
            document.getElementById('portal-formado-cursos-list').innerHTML = '<p class="formado-empty">Acesso administrativo.</p>';
            document.getElementById('portal-formado-certs').innerHTML = '<p class="formado-empty">Acesso administrativo.</p>';
            saveLastLogin(cpf);
            saveLoginState();
            return false;
        }
        const formado = formados.find(f => {
            const matchCpf = f.cpf === cpf;
            const matchMatricula = f.matricula && f.matricula.toUpperCase() === rawInput.toUpperCase();
            return (matchCpf || matchMatricula) && f.senha === password && (f.status === 'Ativo' || !f.status);
        });
        if (!formado) {
            errorEl.querySelector('span').textContent = 'CPF, matricula ou senha invalidos, ou formado nao ativo';
            errorEl.classList.remove('hidden');
            document.getElementById('password').value = '';
            return false;
        }
        currentFormado = formado;
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-portal-formado').classList.add('active');
        const primeiroNome = (formado.nome || '').split(' ')[0];
        document.getElementById('portal-formado-nome').textContent = primeiroNome;
        document.getElementById('portal-formado-nome-top').textContent = primeiroNome;
        document.getElementById('portal-formado-matricula').textContent = formado.matricula || '---';
        document.getElementById('portal-formado-matricula-side').textContent = formado.matricula || '---';
        document.getElementById('portal-formado-cursos-count').textContent = (formado.cursos && formado.cursos.length) ? formado.cursos.length : 0;
        const photoBox = document.querySelector('#screen-portal-formado .portal-photo-box');
        if (formado.photoDataUrl) {
            photoBox.innerHTML = `<img src="${formado.photoDataUrl}" alt="Foto 3x4" class="portal-photo">`;
        } else {
            photoBox.innerHTML = '<i class="fa-solid fa-user" style="font-size:56px;color:#444"></i>';
        }
        const cursosList = document.getElementById('portal-formado-cursos-list');
        if (formado.cursos && formado.cursos.length) {
            cursosList.innerHTML = formado.cursos.map(c => `<span style="display:inline-block;padding:4px 8px;background:#fff3e0;border-radius:6px;font-size:11px;color:#e65100;border:1px solid #ffcc80;margin:3px 2px"><i class="fa-solid fa-check" style="margin-right:4px;font-size:9px"></i>${c}</span>`).join('');
        } else {
            cursosList.innerHTML = '<p class="formado-empty">Nenhum curso registrado ainda.</p>';
        }
        const certsDiv = document.getElementById('portal-formado-certs');
        if (formado.certFrente || formado.certVerso) {
            let html = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">';
            if (formado.certFrente) html += `<div><small style="color:#666">Frente</small><br><img src="${formado.certFrente}" style="max-width:150px;border-radius:8px;border:1px solid #ddd;margin-top:4px">`;
            if (formado.certVerso) html += `</div><div><small style="color:#666">Verso</small><br><img src="${formado.certVerso}" style="max-width:150px;border-radius:8px;border:1px solid #ddd;margin-top:4px">`;
            html += '</div>';
            certsDiv.innerHTML = html;
        } else {
            certsDiv.innerHTML = '<p class="formado-empty">Nenhum certificado anexado ainda.</p>';
        }
    }
    return false;
}

function enterAdminPanel() {
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('screen-admin').classList.add('active');
    document.getElementById('topbar-user-name').textContent = currentUserData ? currentUserData.nome : 'Administrador';
    applyUserPermissions();
    const firstVisible = document.querySelector('#screen-admin .sidebar-nav .nav-item:not([style*="display: none"])');
    if (firstVisible) firstVisible.click();
    populateTurmaSelect();
    renderList();
    renderTurmasList();
}

function applyUserPermissions() {
    if (!currentUserData) return;
    const p = currentUserData.permissoes || [];
    const isGeral = currentUserData.cpf === ADMIN_CPF;
    const navItems = {
        'admin-pre-inscricao': p.includes('pre-inscricao') || isGeral,
        'admin-alunos': p.includes('alunos') || isGeral,
        'admin-turmas': p.includes('turmas') || isGeral,
        'admin-instrutores': p.includes('instrutores') || isGeral,
        'admin-formados': p.includes('formados') || isGeral,
        'admin-form-formado': p.includes('formados') || isGeral,
        'admin-pre-cadastro-formados': p.includes('formados') || isGeral,
        'admin-form-pre-cadastro-formado': p.includes('formados') || isGeral,
        'admin-relatorios': p.includes('relatorios') || isGeral,
        'admin-parceiros': p.includes('parceiros') || isGeral,
        'admin-form-parceiro': p.includes('parceiros') || isGeral,
        'admin-config': p.includes('config') || isGeral
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

/* ===== ONLINE TRACKING ===== */
function setAlunoOnline(cpf) {
    if (!cpf || !dbFirestore) return;
    dbFirestore.collection('onlineAlunos').doc(cpf).set({ online: true, ts: Date.now() }, { merge: true });
    if (onlineHeartbeat) clearInterval(onlineHeartbeat);
    onlineHeartbeat = setInterval(function() {
        if (currentAluno && currentAluno.cpf) {
            dbFirestore.collection('onlineAlunos').doc(currentAluno.cpf).set({ online: true, ts: Date.now() }, { merge: true }).catch(function() {});
        }
    }, 30000);
}

function setAlunoOffline(cpf) {
    if (!cpf || !dbFirestore) return;
    dbFirestore.collection('onlineAlunos').doc(cpf).delete().catch(function() {});
    if (onlineHeartbeat) { clearInterval(onlineHeartbeat); onlineHeartbeat = null; }
}

function startOnlineListener() {
    if (onlineUnsubscribe) return;
    onlineUnsubscribe = dbFirestore.collection('onlineAlunos').onSnapshot(function(snap) {
        onlineCpfs.clear();
        var now = Date.now();
        snap.forEach(function(doc) {
            var d = doc.data();
            if (d.online && (now - (d.ts || 0)) < 90000) {
                onlineCpfs.add(doc.id);
            }
        });
        if (typeof renderAlunosList === 'function') renderAlunosList();
    });
}

function stopOnlineListener() {
    if (onlineUnsubscribe) { onlineUnsubscribe(); onlineUnsubscribe = null; }
}

window.addEventListener('beforeunload', function() {
    if (currentAluno && currentAluno.cpf) setAlunoOffline(currentAluno.cpf);
});

function logoutPortal() {
    portalFoto3x4StopCamera();
    document.getElementById('screen-portal').classList.remove('active');
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('cpf').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').classList.add('hidden');
    if (currentAluno && currentAluno.cpf) setAlunoOffline(currentAluno.cpf);
    currentAluno = null;
    selectedLoginRole = 'admin';
    document.querySelectorAll('.login-role-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.login-role-btn[data-role="admin"]').classList.add('selected');
}

let portalFoto3x4Stream = null;

function portalFoto3x4Iniciar() {
    var video = document.getElementById('portal-foto3x4-video');
    var placeholder = document.getElementById('portal-foto3x4-placeholder');
    var img = document.getElementById('portal-foto3x4-img');
    img.style.display = 'none';
    placeholder.style.display = 'none';
    video.style.display = 'block';
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
        .then(function(stream) {
            portalFoto3x4Stream = stream;
            video.srcObject = stream;
            document.getElementById('btn-foto3x4-iniciar').style.display = 'none';
            document.getElementById('btn-foto3x4-capturar').style.display = '';
            document.getElementById('btn-foto3x4-nova').style.display = 'none';
            document.getElementById('btn-foto3x4-enviar').style.display = 'none';
            document.getElementById('btn-foto3x4-apagar').style.display = 'none';
            portalFoto3x4Msg('', '');
        }).catch(function(err) {
            portalFoto3x4Msg('Erro ao acessar camera: ' + err.message, 'error');
        });
    } else {
        portalFoto3x4Msg('Camera nao disponivel neste navegador.', 'error');
    }
}

function portalFoto3x4StopCamera() {
    var video = document.getElementById('portal-foto3x4-video');
    if (portalFoto3x4Stream) {
        portalFoto3x4Stream.getTracks().forEach(function(t) { t.stop(); });
        portalFoto3x4Stream = null;
    }
    video.srcObject = null;
    video.style.display = 'none';
}

function portalFoto3x4Capturar() {
    var video = document.getElementById('portal-foto3x4-video');
    var canvas = document.getElementById('portal-foto3x4-canvas');
    var img = document.getElementById('portal-foto3x4-img');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    var dataUrl = canvas.toDataURL('image/png');
    img.src = dataUrl;
    img.style.display = 'block';
    portalFoto3x4StopCamera();
    if (currentAluno && currentAluno.cpf) {
        try {
            localStorage.setItem('foto3x4_' + currentAluno.cpf, dataUrl);
            localStorage.setItem('farn_photo_' + currentAluno.cpf, dataUrl);
            portalFoto3x4Msg('Foto capturada e salva no dispositivo!', 'success');
            portalLoadSidebarFoto();
        } catch (e) {
            portalFoto3x4Msg('Foto capturada, erro ao salvar: ' + e.message, 'error');
        }
    } else {
        portalFoto3x4Msg('Foto capturada. Aluno nao identificado.', 'error');
    }
    document.getElementById('btn-foto3x4-capturar').style.display = 'none';
    document.getElementById('btn-foto3x4-enviar').style.display = '';
    document.getElementById('btn-foto3x4-nova').style.display = '';
    document.getElementById('btn-foto3x4-apagar').style.display = '';
}

async function portalFoto3x4Enviar() {
    if (!currentAluno || !currentAluno.cpf) {
        portalFoto3x4Msg('Erro: aluno nao identificado.', 'error');
        return;
    }
    var img = document.getElementById('portal-foto3x4-img');
    var dataUrl = img.src;
    if (!dataUrl) {
        portalFoto3x4Msg('Nenhuma foto para enviar.', 'error');
        return;
    }
    portalFoto3x4Msg('Enviando foto...', 'info');
    document.getElementById('btn-foto3x4-enviar').disabled = true;
    try {
        localStorage.setItem('foto3x4_' + currentAluno.cpf, dataUrl);
        localStorage.setItem('farn_photo_' + currentAluno.cpf, dataUrl);
        currentAluno.photoDataUrl = dataUrl;
        currentAluno.hasPhoto = true;
        var idx = candidatos.findIndex(function(c) { return c.cpf === currentAluno.cpf; });
        if (idx !== -1) {
            candidatos[idx].photoDataUrl = dataUrl;
            candidatos[idx].hasPhoto = true;
        }
        await backupCandidatos();
        try {
            var fIdx = formados.findIndex(function(f) { return f.cpf === currentAluno.cpf; });
            if (fIdx !== -1) {
                formados[fIdx].photoDataUrl = dataUrl;
                await dbFirestore.collection('formados').doc(currentAluno.cpf).set({
                    photoDataUrl: dataUrl
                }, { merge: true });
            }
        } catch(e) {}
        portalFoto3x4Msg('Foto enviada com sucesso para o cadastro!', 'success');
        portalLoadSidebarFoto();
        document.getElementById('btn-foto3x4-enviar').style.display = 'none';
        document.getElementById('btn-foto3x4-enviar').disabled = false;
    } catch (e) {
        portalFoto3x4Msg('Erro ao enviar: ' + e.message, 'error');
        document.getElementById('btn-foto3x4-enviar').disabled = false;
    }
}

function portalFoto3x4Nova() {
    portalFoto3x4StopCamera();
    var img = document.getElementById('portal-foto3x4-img');
    var placeholder = document.getElementById('portal-foto3x4-placeholder');
    img.style.display = 'none';
    img.src = '';
    placeholder.style.display = '';
    document.getElementById('btn-foto3x4-iniciar').style.display = '';
    document.getElementById('btn-foto3x4-capturar').style.display = 'none';
    document.getElementById('btn-foto3x4-enviar').style.display = 'none';
    document.getElementById('btn-foto3x4-nova').style.display = 'none';
    document.getElementById('btn-foto3x4-apagar').style.display = 'none';
    portalFoto3x4Msg('', '');
}

function portalFoto3x4Apagar() {
    if (!currentAluno || !currentAluno.cpf) return;
    if (!confirm('Apagar sua foto 3x4 deste dispositivo?')) return;
    localStorage.removeItem('foto3x4_' + currentAluno.cpf);
    localStorage.removeItem('farn_photo_' + currentAluno.cpf);
    portalFoto3x4Nova();
    portalFoto3x4Msg('Foto apagada.', 'success');
    portalLoadSidebarFoto();
}

function portalFoto3x4LoadLocal() {
    if (!currentAluno || !currentAluno.cpf) return;
    var dataUrl = localStorage.getItem('foto3x4_' + currentAluno.cpf);
    var img = document.getElementById('portal-foto3x4-img');
    var placeholder = document.getElementById('portal-foto3x4-placeholder');
    if (dataUrl) {
        img.src = dataUrl;
        img.style.display = 'block';
        placeholder.style.display = 'none';
        document.getElementById('btn-foto3x4-iniciar').style.display = 'none';
        document.getElementById('btn-foto3x4-capturar').style.display = 'none';
        document.getElementById('btn-foto3x4-enviar').style.display = 'none';
        document.getElementById('btn-foto3x4-nova').style.display = '';
        document.getElementById('btn-foto3x4-apagar').style.display = '';
        portalFoto3x4Msg('Foto salva neste dispositivo.', 'info');
    } else {
        img.style.display = 'none';
        placeholder.style.display = '';
        document.getElementById('btn-foto3x4-iniciar').style.display = '';
        document.getElementById('btn-foto3x4-capturar').style.display = 'none';
        document.getElementById('btn-foto3x4-enviar').style.display = 'none';
        document.getElementById('btn-foto3x4-nova').style.display = 'none';
        document.getElementById('btn-foto3x4-apagar').style.display = 'none';
        portalFoto3x4Msg('', '');
    }
}

function portalFoto3x4Msg(msg, type) {
    var el = document.getElementById('portal-foto3x4-msg');
    if (!msg) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = msg;
    el.className = 'portal-foto3x4-msg ' + (type || '');
}

function portalLoadSidebarFoto() {
    if (!currentAluno || !currentAluno.cpf) return;
    var dataUrl = localStorage.getItem('foto3x4_' + currentAluno.cpf);
    var img = document.getElementById('portal-sidebar-foto');
    var icon = document.getElementById('portal-sidebar-foto-icon');
    if (dataUrl) {
        img.src = dataUrl;
        img.style.display = 'block';
        icon.style.display = 'none';
    } else {
        img.style.display = 'none';
        icon.style.display = '';
    }
}

function fcCheckFoto3x4Local() {
    var cpfInput = document.getElementById('fc-cpf');
    if (!cpfInput) return;
    var cpf = cpfInput.value.replace(/\D/g, '');
    if (cpf.length < 11) {
        document.getElementById('fc-foto3x4-local-box').style.display = 'none';
        return;
    }
    var fullCpf = cpf;
    var dataUrl = localStorage.getItem('foto3x4_' + fullCpf) || localStorage.getItem('farn_photo_' + fullCpf);
    if (!dataUrl && editingIndex !== null && candidatos[editingIndex]) {
        dataUrl = candidatos[editingIndex].photoDataUrl || null;
    }
    var box = document.getElementById('fc-foto3x4-local-box');
    var img = document.getElementById('fc-foto3x4-local-img');
    var msg = document.getElementById('fc-foto3x4-local-msg');
    var btn = document.getElementById('btn-fc-foto3x4-importar');
    if (dataUrl) {
        box.style.display = 'block';
        img.src = dataUrl;
        img.style.display = 'block';
        msg.textContent = 'Foto disponivel para importacao.';
        msg.style.color = '#66bb6a';
        btn.style.display = '';
    } else {
        box.style.display = 'block';
        img.style.display = 'none';
        msg.textContent = 'Nenhuma foto capturada no portal.';
        msg.style.color = '#6a8ab0';
        btn.style.display = 'none';
    }
}

function fcImportFoto3x4Local() {
    var cpf = document.getElementById('fc-cpf').value.replace(/\D/g, '');
    var dataUrl = localStorage.getItem('foto3x4_' + cpf) || localStorage.getItem('farn_photo_' + cpf);
    if (!dataUrl && editingIndex !== null && candidatos[editingIndex]) {
        dataUrl = candidatos[editingIndex].photoDataUrl || null;
    }
    if (!dataUrl) return;
    var preview = document.getElementById('photo-preview');
    var placeholder = document.getElementById('photo-placeholder');
    preview.src = dataUrl;
    preview.classList.remove('hidden');
    placeholder.style.display = 'none';
    document.getElementById('btn-remove-photo').style.display = '';
    currentPhotoDataUrl = dataUrl;
}

let portalAlunoFotoDataUrl = null;
let portalAlunoSaveTimeout = null;

function showPortalSection(section) {
    document.querySelectorAll('.portal-section').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('.portal-nav-item').forEach(function(n) { n.classList.remove('active'); });
    document.querySelectorAll('.portal-mobile-nav-item').forEach(function(n) { n.classList.remove('active'); });
    var sec = document.getElementById('portal-section-' + section);
    if (sec) sec.classList.add('active');
    var navItems = document.querySelectorAll('.portal-nav-item');
    navItems.forEach(function(n) {
        if ((section === 'noticias' && n.textContent.trim() === 'Noticias') ||
            (section === 'apostilas' && n.textContent.trim() === 'Apostilas') ||
            (section === 'notas' && n.textContent.trim() === 'Notas') ||
            (section === 'foto3x4' && n.textContent.trim() === 'Foto 3x4')) {
            n.classList.add('active');
        }
    });
    var mobileNavItems = document.querySelectorAll('.portal-mobile-nav-item');
    mobileNavItems.forEach(function(n) {
        var span = n.querySelector('span');
        if (!span) return;
        var text = span.textContent.trim().toLowerCase();
        if ((section === 'noticias' && text === 'noticias') ||
            (section === 'apostilas' && text === 'apostilas') ||
            (section === 'notas' && text === 'notas') ||
            (section === 'foto3x4' && text === 'foto')) {
            n.classList.add('active');
        }
    });
    if (section === 'foto3x4') portalFoto3x4LoadLocal();
}

function openPortalAlunoDados() {
    if (!currentAluno) return;
    document.getElementById('portal-aluno-email').value = currentAluno.email || '';
    document.getElementById('portal-aluno-whatsapp').value = currentAluno.whatsapp || '';
    portalAlunoFotoDataUrl = null;
    const preview = document.getElementById('portal-aluno-foto-preview');
    const placeholder = document.getElementById('portal-aluno-foto-placeholder');
    if (currentAluno.photoDataUrl) {
        preview.src = currentAluno.photoDataUrl;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        placeholder.style.display = '';
    }
    document.getElementById('portal-aluno-dados-msg').style.display = 'none';
    document.getElementById('modal-portal-aluno-dados').classList.remove('hidden');
}

function closePortalAlunoDados() {
    portalAlunoAutoSave(true);
    document.getElementById('modal-portal-aluno-dados').classList.add('hidden');
}

function handlePortalAlunoFotoUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 400;
            canvas.getContext('2d').drawImage(img, 0, 0, 300, 400);
            canvas.toBlob(function(blob) {
                const innerReader = new FileReader();
                innerReader.onloadend = function() {
                    portalAlunoFotoDataUrl = innerReader.result;
                    document.getElementById('portal-aluno-foto-preview').src = innerReader.result;
                    document.getElementById('portal-aluno-foto-preview').style.display = 'block';
                    document.getElementById('portal-aluno-foto-placeholder').style.display = 'none';
                    portalAlunoAutoSave(true);
                };
                innerReader.readAsDataURL(blob);
            }, 'image/jpeg', 0.5);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function portalAlunoScheduleSave() {
    if (portalAlunoSaveTimeout) clearTimeout(portalAlunoSaveTimeout);
    portalAlunoSaveTimeout = setTimeout(function() { portalAlunoAutoSave(false); }, 800);
}

async function portalAlunoAutoSave(silent) {
    if (!currentAluno) return;
    if (portalAlunoSaveTimeout) { clearTimeout(portalAlunoSaveTimeout); portalAlunoSaveTimeout = null; }
    const email = document.getElementById('portal-aluno-email').value.trim();
    const whatsapp = document.getElementById('portal-aluno-whatsapp').value.trim();
    const msgEl = document.getElementById('portal-aluno-dados-msg');
    const updateData = { email: email, whatsapp: whatsapp };
    if (portalAlunoFotoDataUrl) {
        updateData.photoDataUrl = portalAlunoFotoDataUrl;
        try { localStorage.setItem('farn_photo_' + currentAluno.cpf, portalAlunoFotoDataUrl); } catch(e) {}
    }
    try {
        currentAluno.email = email;
        currentAluno.whatsapp = whatsapp;
        if (portalAlunoFotoDataUrl) currentAluno.photoDataUrl = portalAlunoFotoDataUrl;
        const idx = candidatos.findIndex(function(c) { return c.cpf === currentAluno.cpf; });
        if (idx !== -1) {
            candidatos[idx].email = email;
            candidatos[idx].whatsapp = whatsapp;
            if (portalAlunoFotoDataUrl) candidatos[idx].photoDataUrl = portalAlunoFotoDataUrl;
        }
        await backupCandidatos();
        if (!silent) {
            msgEl.textContent = 'Salvo automaticamente';
            msgEl.style.display = 'block';
            msgEl.style.background = 'rgba(76,175,80,0.15)';
            msgEl.style.color = '#4caf50';
            setTimeout(function() { msgEl.style.display = 'none'; }, 2000);
        }
    } catch(e) {
        if (!silent) {
            msgEl.textContent = 'Erro ao salvar: ' + e.message;
            msgEl.style.display = 'block';
            msgEl.style.background = 'rgba(244,67,54,0.15)';
            msgEl.style.color = '#f44336';
        }
    }
}

function savePortalAlunoDados() { portalAlunoAutoSave(false); }

function logoutPortalFormado() {
    document.getElementById('screen-portal-formado').classList.remove('active');
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('cpf').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').classList.add('hidden');
    currentFormado = null;
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
    const titles = { 'admin-home': 'Inicio', 'admin-pre-inscricao': 'Pre-Inscricao', 'admin-form-candidato': editingIndex !== null ? 'Editar Pre-Cadastro' : 'Novo Pre-Cadastro', 'admin-alunos': 'Alunos', 'admin-turmas': 'Turmas', 'admin-instrutores': 'Instrutores', 'admin-formados': 'Formados', 'admin-form-formado': editingFormadoDocId ? 'Editar Formado' : 'Novo Formado', 'admin-pre-cadastro-formados': 'Pre-Cadastro Formados', 'admin-form-pre-cadastro-formado': 'Novo Pre-Cadastro Formado', 'admin-relatorios': 'Relatorios', 'admin-parceiros': 'Parceiros', 'admin-form-parceiro': editingParceiroIndex !== null ? 'Editar Parceiro' : 'Novo Parceiro', 'admin-config': 'Configuracoes', 'admin-usuarios': 'Usuarios', 'admin-form-usuario': 'Novo Usuario' };
    document.getElementById('admin-page-title').textContent = titles[sectionId] || 'Admin';
}

/* ===== FORM CANDIDATO ===== */

const formFields = ['fc-turma','fc-parceiro','fc-nome','fc-cpf','fc-nascimento','fc-estado-civil','fc-nacionalidade','fc-naturalidade','fc-titulo','fc-profissao','fc-mae','fc-pai','fc-email','fc-whatsapp','fc-endereco','fc-numero','fc-bairro','fc-cidade','fc-estado','fc-local-votacao','fc-altura','fc-peso','fc-fator-rh','fc-hipertensao','fc-diabetes','fc-deficiencia','fc-tatuagem','fc-cirurgia','fc-alcool','fc-medicamento','fc-cansaco','fc-calca','fc-camisa','fc-calcado','fc-senha'];

async function openFormCandidato() {
    editingIndex = null;
    resetFormCandidato();
    await populateTurmaSelect();
    populateParceiroSelect();
    const btnAtualizar = document.getElementById('btn-atualizar-cadastro');
    if (btnAtualizar) btnAtualizar.style.display = 'none';
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#f57c00;margin-right:8px"></i> Novo Pre-Cadastro';
    showAdminSection('admin-form-candidato');
}

async function editCandidato(index) {
    const c = candidatos[index]; if (!c) return;
    editingIndex = index;
    await populateTurmaSelect();
    populateParceiroSelect();
    document.getElementById('fc-nome').value = c.nome || '';
    document.getElementById('fc-cpf').value = formatCPFDisplay(c.cpf || '');
    updateMatricula(formatCPFDisplay(c.cpf || ''));
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
    document.getElementById('fc-parceiro').value = c.parceiro || '';
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
    const btnAtualizar = document.getElementById('btn-atualizar-cadastro');
    if (btnAtualizar) {
        btnAtualizar.style.display = '';
        if (c.atualizarCadastro) {
            btnAtualizar.style.background = '#4caf50';
            btnAtualizar.style.color = '#fff';
            btnAtualizar.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Cadastro (Ativo)';
        } else {
            btnAtualizar.style.background = 'transparent';
            btnAtualizar.style.color = '#4caf50';
            btnAtualizar.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Atualizar Cadastro';
        }
    }
    showAdminSection('admin-form-candidato');
}

function resetFormCandidato() {
    editingIndex = null;
    formFields.forEach(id => { const el = document.getElementById(id); if (el) { if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; } });
    document.getElementById('senha-field-wrapper').style.display = 'none';
    document.getElementById('fc-senha').required = false;
    const mw = document.getElementById('fc-matricula-wrapper');
    const md = document.getElementById('fc-matricula-display');
    if (mw) mw.style.display = 'none';
    if (md) md.textContent = '';
    const btnAtualizar = document.getElementById('btn-atualizar-cadastro');
    if (btnAtualizar) { btnAtualizar.style.display = 'none'; btnAtualizar.style.background = 'transparent'; btnAtualizar.style.color = '#4caf50'; btnAtualizar.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Atualizar Cadastro'; }
    uploadedFiles = [];
    renderFilesList();
}

function toggleAtualizarCadastro() {
    if (editingIndex === null || !candidatos[editingIndex]) return;
    const c = candidatos[editingIndex];
    c.atualizarCadastro = !c.atualizarCadastro;
    backupCandidatos();
    const btn = document.getElementById('btn-atualizar-cadastro');
    if (btn) {
        if (c.atualizarCadastro) {
            btn.style.background = '#4caf50';
            btn.style.color = '#fff';
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Cadastro (Ativo)';
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#4caf50';
            btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Atualizar Cadastro';
        }
    }
    renderList();
    if (typeof renderAlunosList === 'function') renderAlunosList();
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
    data.matricula = generateMatricula(data.cpf);
    data.status = editingIndex !== null ? candidatos[editingIndex].status : 'Pendente';
    data.dataCadastro = editingIndex !== null ? candidatos[editingIndex].dataCadastro : new Date().toLocaleDateString('pt-BR');
    data.dataHoraCadastro = editingIndex !== null ? candidatos[editingIndex].dataHoraCadastro : new Date().toLocaleString('pt-BR');
    if (editingIndex !== null && candidatos[editingIndex].atualizarCadastro) {
        data.atualizarCadastro = true;
    }

    if (editingIndex !== null) {
        data.id = candidatos[editingIndex].id;
        candidatos[editingIndex] = data;
        editingIndex = null;
    } else {
        data.id = Date.now();
        data.cadastradoPor = currentUserData ? currentUserData.nome : 'Desconhecido';
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
    if (!candidatos.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">Nenhum candidato cadastrado</td></tr>'; return; }
    tbody.innerHTML = candidatos.map((c, i) => {
        const sc = c.status === 'Aprovado' ? 'green' : c.status === 'Rejeitado' ? 'rejeitado' : 'pendente';
        const nomeStyle = c.atualizarCadastro ? 'color:#a5d6a7;font-weight:700' : '';
        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td>${c.nascimento || '-'}</td>
            <td>${c.turma || '-'}${c.turma ? '<br><small style="color:#888;font-size:7px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</td>
            <td style="color:#ff9800;font-weight:600">${c.parceiro || '-'}</td>
            <td><span class="badge ${sc}">${c.status}</span></td>
            <td style="color:#aaa;font-size:12px">${c.cadastradoPor || '-'}</td>
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
    const mat = c.matricula || generateMatricula(c.cpf);
    document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-user" style="color:#1e88e5"></i> Detalhes do Candidato';
    const photoSrc = localStorage.getItem('farn_photo_' + c.cpf) || c.photoDataUrl || null;
    document.getElementById('modal-body').innerHTML = `
        ${photoSrc ? `<div style="text-align:center;margin-bottom:16px"><img src="${photoSrc}" style="width:120px;height:160px;object-fit:cover;border:2px solid #1e88e5;border-radius:8px" alt="Foto 3x4"></div>` : ''}
        <div class="detail-grid">
            <div class="detail-section-title">Dados Pessoais</div>
            <div class="detail-item full"><span class="detail-label">Nome</span><span class="detail-value"${c.atualizarCadastro ? ' style="color:#a5d6a7;font-weight:700"' : ''}>${c.nome}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:11px;color:#66bb6a"></i>' : ''}</span></div>
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
            ${mat ? `<div class="detail-item full"><span class="detail-label">Matricula</span><span class="detail-value" style="color:#f57c00;font-size:20px;font-weight:800;letter-spacing:2px;font-family:'Courier New',monospace">${mat}</span></div>` : ''}
            <div class="detail-item"><span class="detail-label">Turma</span><span class="detail-value">${c.turma||'---'}${c.turma ? '<br><small style="color:#888;font-size:7px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</span></div>
            <div class="detail-item"><span class="detail-label">Parceiro</span><span class="detail-value" style="color:#ff9800;font-weight:600">${c.parceiro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${c.status}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastro</span><span class="detail-value">${c.dataCadastro}</span></div>
            <div class="detail-item full"><span class="detail-label">Data/Hora 1o Cadastro</span><span class="detail-value" style="color:#4caf50;font-weight:600">${c.dataHoraCadastro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastrado por</span><span class="detail-value" style="color:#f57c00;font-weight:600">${c.cadastradoPor || '---'}</span></div>
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
    if (window._pendingDeleteFormado) {
        try {
            await dbFirestore.collection(FB_FORMADOS).doc(window._pendingDeleteFormado).delete();
        } catch(e) { alert('Erro ao excluir: ' + e.message); }
        window._pendingDeleteFormado = null;
        closeConfirmModal();
        return;
    }
    if (pendingDeleteTurmaIndex !== null) {
        if (pendingDeleteTurmaIndex !== null) {
            turmas.splice(pendingDeleteTurmaIndex, 1);
            backupTurmas();
            renderTurmasList();
            await populateTurmaSelect();
        }
    } else if (pendingDeleteIndex !== null) {
        const removed = candidatos[pendingDeleteIndex];
        candidatos.splice(pendingDeleteIndex, 1);
        if (removed && removed.cpf) {
            try { await dbFirestore.collection(FB_CANDIDATOS).doc(removed.cpf).delete(); } catch(e) {}
        }
        backupCandidatos();
        renderList();
        if (typeof renderAlunosList === 'function') renderAlunosList();
    }
    closeConfirmModal();
}

function printCandidato(i) {
    const c = candidatos[i]; if (!c) return;
    const mat = c.matricula || generateMatricula(c.cpf);
    const photoSrc = localStorage.getItem('farn_photo_' + c.cpf) || c.photoDataUrl || null;
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
        <div class="row"><div class="col"><div class="label">Nome</div><div class="val"${c.atualizarCadastro ? ' style="color:#2e7d32;font-weight:700"' : ''}>${c.nome}${c.atualizarCadastro ? ' [ATUALIZAR]' : ''}</div></div></div>
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
        ${mat ? `<div class="row"><div class="col"><div class="label">Matricula</div><div class="val" style="color:#e65100;font-size:18px;font-weight:800;letter-spacing:2px;font-family:'Courier New',monospace">${mat}</div></div></div>` : ''}
        <div class="row"><div class="col"><div class="label">Turma</div><div class="val">${c.turma||'---'}${c.turma ? '<br><small style="color:#666;font-size:6px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</div></div><div class="col"><div class="label">Parceiro</div><div class="val" style="color:#e65100;font-weight:700">${c.parceiro||'---'}</div></div></div>
        ${c.status === 'Aprovado' && c.senha ? `<div class="row"><div class="col"><div class="label">Senha de Acesso</div><div class="val" style="color:#2e7d32;font-weight:bold">${c.senha}</div></div></div>` : ''}
        ${c.dataHoraCadastro ? `<div class="row"><div class="col"><div class="label">Data/Hora 1o Cadastro</div><div class="val" style="color:#2e7d32;font-size:11px">${c.dataHoraCadastro}</div></div></div>` : ''}
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
    let csv = 'Nome,CPF,Nascimento,Estado Civil,Nacionalidade,Naturalidade,Profissao,Mae,Pai,Titulo,Email,WhatsApp,Endereco,Numero,Bairro,Cidade,Estado,Altura,Peso,Fator RH,Hipertensao,Diabetes,Deficiencia,Tatuagem,Cirurgia,Alcool,Medicamento,Cansaco,Calca,Camisa,Calcado,Turma,Parceiro,Status,Senha,Cadastro,Data/Hora 1o Cadastro\n';
    candidatos.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.nascimento||''}","${c.estadoCivil||''}","${c.nacionalidade||''}","${c.naturalidade||''}","${c.profissao||''}","${c.mae||''}","${c.pai||''}","${c.tituloEleitor||''}","${c.email||''}","${c.whatsapp||''}","${c.endereco||''}","${c.numero||''}","${c.bairro||''}","${c.cidade||''}","${c.estado||''}","${c.altura||''}","${c.peso||''}","${c.fatorRh||''}","${c.hipertensao||''}","${c.diabetes||''}","${c.deficiencia||''}","${c.tatuagem||''}","${c.cirurgia||''}","${c.alcool||''}","${c.medicamento||''}","${c.cansaco||''}","${c.calca||''}","${c.camisa||''}","${c.calcado||''}","${c.turma||''}","${c.parceiro||''}","${c.status}","${c.senha||''}","${c.dataCadastro}","${c.dataHoraCadastro||''}"\n`;
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">Nenhum aluno na aba "${statusFilter}"</td></tr>`;
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
        const mat = c.matricula || generateMatricula(c.cpf);
        const nomeStyle = c.atualizarCadastro ? 'color:#a5d6a7;font-weight:700' : '';
        const isOnline = onlineCpfs.has(c.cpf);
        const onlineDot = isOnline ? ' <span class="online-dot" title="Online"></span>' : '';
        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${onlineDot}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td style="color:#f57c00;font-weight:800;letter-spacing:1px;font-family:'Courier New',monospace;font-size:13px">${mat || '-'}</td>
            <td>${c.turma || '-'}</td>
            <td style="color:#ff9800;font-weight:600">${c.parceiro || '-'}</td>
            <td>${c.dataCadastro || '-'}${c.dataHoraCadastro ? '<br><small style="color:#4caf50;font-size:9px">' + c.dataHoraCadastro + '</small>' : ''}</td>
            <td><div class="actions-cell">
                <button class="btn-icon btn-info" title="Visualizar" onclick="viewCandidato(${i})"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-icon" title="Editar" onclick="editCandidato(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteCandidatoAlunos(${i})"><i class="fa-solid fa-trash"></i></button>
                <button class="btn-icon btn-success" title="Imprimir" onclick="printCandidato(${i})"><i class="fa-solid fa-print"></i></button>
                ${c.status === 'Aprovado' ? `<button class="btn-icon btn-contrato" title="Contrato de BC" onclick="gerarContratoBC(${i})"><i class="fa-solid fa-file-contract"></i></button>` : ''}
                <button class="btn-icon btn-move-formado" title="Mover para Formados" onclick="openMoveFormadoModal(${i})" style="background:rgba(255,152,0,0.15);color:#ff9800;border:1px solid rgba(255,152,0,0.3)"><i class="fa-solid fa-award"></i></button>
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
    let csv = 'Nome,CPF,Matricula,Nascimento,Turma,Parceiro,Status,Data Cadastro,Data/Hora 1o Cadastro\n';
    filtered.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.matricula || generateMatricula(c.cpf) || ''}","${c.nascimento||''}","${c.turma||''}","${c.parceiro||''}","${c.status}","${c.dataCadastro||''}","${c.dataHoraCadastro||''}"\n`;
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
        <table><thead><tr><th>Nome</th><th>CPF</th><th>Matricula</th><th>Turma</th><th>Parceiro</th><th>Data Cadastro</th><th>Data/Hora 1o Cadastro</th></tr></thead><tbody>
        ${filtered.map(c => `<tr><td>${c.nome}</td><td>${formatCPFDisplay(c.cpf)}</td><td style="color:#e65100;font-weight:800;font-family:'Courier New',monospace">${c.matricula || generateMatricula(c.cpf) || '-'}</td><td>${c.turma||'-'}</td><td style="color:#e65100;font-weight:600">${c.parceiro||'-'}</td><td>${c.dataCadastro||'-'}</td><td style="color:#2e7d32;font-size:11px">${c.dataHoraCadastro||'-'}</td></tr>`).join('')}
        </tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
}

function relatorioUniforme() {
    const aprovados = candidatos.filter(c => c.status === 'Aprovado');
    if (!aprovados.length) { alert('Nenhum aluno aprovado para gerar relatorio.'); return; }
    aprovados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - Relatorio de Uniforme</title><style>
        @page{size:A4 portrait;margin:15mm 15mm 15mm 15mm}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;color:#222;padding:20px;font-size:12px}
        .header{text-align:center;margin-bottom:6px;border-bottom:3px solid #1a237e;padding-bottom:8px}
        .header img{height:50px;margin-bottom:4px}
        .header .title-line{font-size:13px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:1px}
        .header .info-line{font-size:10px;color:#666;margin-top:3px;letter-spacing:0.3px}
        .report-title{text-align:center;font-size:15px;font-weight:800;color:#e65100;margin:10px 0;text-transform:uppercase;letter-spacing:2px;border:2px solid #e65100;padding:7px;border-radius:4px}
        .info-bar{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:10px;padding:0 4px}
        table{width:100%;border-collapse:collapse}
        th{background:#1a237e;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
        td{padding:7px 10px;border-bottom:1px solid #e0e0e0;font-size:11px}
        tr:nth-child(even){background:#f5f7fa}
        tr:hover{background:#e8eaf6}
        td.nome{font-weight:600;max-width:200px}
        td.matricula{color:#e65100;font-weight:800;font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px}
        td.center{text-align:center;font-weight:700;font-size:12px;color:#1a237e}
        th:nth-child(1){width:3%}
        th:nth-child(2){width:25%}
        th:nth-child(3){width:15%}
        th:nth-child(4){width:15%}
        th:nth-child(5){width:12%}
        th:nth-child(6){width:12%}
        th:nth-child(7){width:12%}
        .print-btn{display:block;margin:16px auto 0;padding:12px 32px;background:#1a237e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
        .print-btn:hover{background:#283593}
        .footer{margin-top:14px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:8px}
        .total{text-align:right;font-size:12px;font-weight:700;color:#333;margin-top:8px;padding-right:4px}
        @media print{body{padding:0;font-size:11px}.print-btn{display:none}th{background:#1a237e !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even){background:#f5f7fa !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
        <div class="header">
            <img src="logo-farn.png.png" alt="FARN">
            <div class="title-line">FARN - BRASIL - BS.BRASIL - COMMAND BRASIL</div>
            <div class="info-line">CNPJ: 43.327.929/0001-32 | Telefone: (81) 98403-1538</div>
        </div>
        <div class="report-title">Relatorio de Medidas de Uniforme</div>
        <div class="info-bar">
            <span>Data: ${new Date().toLocaleDateString('pt-BR')}</span>
            <span>Total de Aprovados: ${aprovados.length}</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Nome Completo</th>
                    <th>Matricula</th>
                    <th>Parceiro</th>
                    <th>Calca</th>
                    <th>Camisa</th>
                    <th>Calcado</th>
                </tr>
            </thead>
            <tbody>
                ${aprovados.map((c, i) => {
                    const mat = c.matricula || generateMatricula(c.cpf) || '---';
                    return `<tr>
                        <td>${i + 1}</td>
                        <td class="nome">${c.nome || '---'}</td>
                        <td class="matricula">${mat}</td>
                        <td class="center" style="color:#ff9800;font-weight:600">${c.parceiro || '---'}</td>
                        <td class="center">${c.calca || '---'}</td>
                        <td class="center">${c.camisa || '---'}</td>
                        <td class="center">${c.calcado || '---'}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="total">Total: ${aprovados.length} aluno(s) aprovado(s)</div>
        <button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir Relatorio</button>
        <div class="footer">FARN - Forca Auxiliar de Resgate Nacional | Relatorio gerado em ${new Date().toLocaleString('pt-BR')}</div>
    </body></html>`);
    w.document.close();
}

/* ===== MONTE RELATORIO DE ALUNO ===== */

const camposRelatorio = [
    { key: 'nome', label: 'Nome Completo' },
    { key: 'cpf', label: 'CPF' },
    { key: 'matricula', label: 'Matricula' },
    { key: 'nascimento', label: 'Data de Nascimento' },
    { key: 'estadoCivil', label: 'Estado Civil' },
    { key: 'nacionalidade', label: 'Nacionalidade' },
    { key: 'naturalidade', label: 'Naturalidade' },
    { key: 'tituloEleitor', label: 'Titulo de Eleitor' },
    { key: 'profissao', label: 'Profissao' },
    { key: 'mae', label: 'Mae' },
    { key: 'pai', label: 'Pai' },
    { key: 'email', label: 'Email' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'endereco', label: 'Endereco' },
    { key: 'numero', label: 'Numero' },
    { key: 'bairro', label: 'Bairro' },
    { key: 'cidade', label: 'Cidade' },
    { key: 'estado', label: 'Estado' },
    { key: 'localVotacao', label: 'Local de Votacao' },
    { key: 'altura', label: 'Altura' },
    { key: 'peso', label: 'Peso' },
    { key: 'fatorRh', label: 'Fator RH' },
    { key: 'hipertensao', label: 'Hipertensao' },
    { key: 'diabetes', label: 'Diabetes' },
    { key: 'deficiencia', label: 'Deficiencia' },
    { key: 'tatuagem', label: 'Tatuagem' },
    { key: 'cirurgia', label: 'Cirurgia' },
    { key: 'alcool', label: 'Alcool' },
    { key: 'medicamento', label: 'Medicamento' },
    { key: 'cansaco', label: 'Cansaco' },
    { key: 'calca', label: 'Calca' },
    { key: 'camisa', label: 'Camisa' },
    { key: 'calcado', label: 'Calcado' },
    { key: 'turma', label: 'Turma' },
    { key: 'parceiro', label: 'Parceiro' },
    { key: 'status', label: 'Status' },
    { key: 'senha', label: 'Senha' },
    { key: 'cadastradoPor', label: 'Cadastrado por' },
    { key: 'dataCadastro', label: 'Data Cadastro' },
    { key: 'dataHoraCadastro', label: 'Data/Hora 1o Cadastro' }
];

function abrirModalMontarRelatorio() {
    const grid = document.getElementById('campos-relatorio-grid');
    if (!grid) return;
    grid.innerHTML = camposRelatorio.map(c => `
        <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:#1a1a2e;border-radius:6px;cursor:pointer;font-size:12px;color:#ccc;transition:background 0.2s" onmouseenter="this.style.background='#252545'" onmouseleave="this.style.background='#1a1a2e'">
            <input type="checkbox" class="campo-relatorio-check" value="${c.key}" style="accent-color:#9c27b0;width:14px;height:14px">
            ${c.label}
        </label>
    `).join('');
    document.getElementById('modal-montar-relatorio').classList.remove('hidden');
}

function fecharModalMontarRelatorio() {
    document.getElementById('modal-montar-relatorio').classList.add('hidden');
}

function marcarTodosCampos(marcar) {
    document.querySelectorAll('.campo-relatorio-check').forEach(cb => { cb.checked = marcar; });
}

function getCamposSelecionados() {
    const selected = [];
    document.querySelectorAll('.campo-relatorio-check:checked').forEach(cb => {
        const campo = camposRelatorio.find(c => c.key === cb.value);
        if (campo) selected.push(campo);
    });
    return selected;
}

function getValorCampo(c, key) {
    if (key === 'matricula') return c.matricula || generateMatricula(c.cpf) || '---';
    if (key === 'cpf') return formatCPFDisplay(c.cpf) || '---';
    if (key === 'senha') return c.status === 'Aprovado' && c.senha ? c.senha : '---';
    return c[key] || '---';
}

function gerarRelatorioPersonalizado() {
    const campos = getCamposSelecionados();
    if (!campos.length) { alert('Selecione pelo menos um campo para gerar o relatorio.'); return; }
    if (!candidatos.length) { alert('Nenhum candidato cadastrado.'); return; }
    const statusFilter = document.getElementById('relatorio-status-filter').value;
    fecharModalMontarRelatorio();
    let lista = candidatos.slice();
    if (statusFilter && statusFilter !== 'Todos') {
        lista = lista.filter(c => c.status === statusFilter);
    }
    lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - Relatorio de Alunos</title><style>
        @page{size:A4 landscape;margin:12mm}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;color:#222;padding:16px;font-size:11px}
        .header{text-align:center;margin-bottom:6px;border-bottom:3px solid #1a237e;padding-bottom:8px}
        .header img{height:45px;margin-bottom:4px}
        .header .title-line{font-size:12px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:1px}
        .header .info-line{font-size:9px;color:#666;margin-top:3px;letter-spacing:0.3px}
        .report-title{text-align:center;font-size:14px;font-weight:800;color:#e65100;margin:8px 0;text-transform:uppercase;letter-spacing:2px;border:2px solid #e65100;padding:6px;border-radius:4px}
        .info-bar{display:flex;justify-content:space-between;font-size:10px;color:#666;margin-bottom:8px;padding:0 4px}
        table{width:100%;border-collapse:collapse}
        th{background:#1a237e;color:#fff;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.3px}
        td{padding:5px 8px;border-bottom:1px solid #e0e0e0;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}
        tr:nth-child(even){background:#f5f7fa}
        tr:hover{background:#e8eaf6}
        td.nome{font-weight:600}
        td.matricula{color:#e65100;font-weight:800;font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px}
        th:first-child{width:3%}
        .print-btn{display:block;margin:12px auto 0;padding:10px 28px;background:#1a237e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
        .print-btn:hover{background:#283593}
        .footer{margin-top:10px;text-align:center;font-size:9px;color:#999;border-top:1px solid #ddd;padding-top:6px}
        .total{text-align:right;font-size:11px;font-weight:700;color:#333;margin-top:6px;padding-right:4px}
        @media print{body{padding:0;font-size:9px}.print-btn{display:none}th{background:#1a237e !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even){background:#f5f7fa !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
        <div class="header">
            <img src="logo-farn.png.png" alt="FARN">
            <div class="title-line">FARN - BRASIL - BS.BRASIL - COMMAND BRASIL</div>
            <div class="info-line">CNPJ: 43.327.929/0001-32 | Telefone: (81) 98403-1538</div>
        </div>
        <div class="report-title">Relatorio de Alunos ${statusFilter !== 'Todos' ? '- ' + statusFilter : ''}</div>
        <div class="info-bar">
            <span>Data: ${new Date().toLocaleDateString('pt-BR')} ${statusFilter !== 'Todos' ? '| Status: ' + statusFilter : '| Todos os Status'}</span>
            <span>Campos: ${campos.length} | Total: ${lista.length} aluno(s)</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    ${campos.map(c => `<th>${c.label}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${lista.map((c, i) => {
                    return `<tr>
                        <td>${i + 1}</td>
                        ${campos.map(campo => {
                            const val = getValorCampo(c, campo.key);
                            let cls = '';
                            if (campo.key === 'nome') cls = ' class="nome"';
                            else if (campo.key === 'matricula') cls = ' class="matricula"';
                            return `<td${cls}>${val}</td>`;
                        }).join('')}
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="total">Total: ${lista.length} aluno(s)</div>
        <button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir Relatorio</button>
        <div class="footer">FARN - Forca Auxiliar de Resgate Nacional | Relatorio gerado em ${new Date().toLocaleString('pt-BR')}</div>
    </body></html>`);
    w.document.close();
}

/* ===== PARCEIROS CRUD ===== */

let editingParceiroIndex = null;

function formatCNPJ(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,3})/, '$1.$2');
    input.value = v;
}

function openFormParceiro() {
    editingParceiroIndex = null;
    document.getElementById('pf-nome').value = '';
    document.getElementById('pf-cnpj').value = '';
    document.getElementById('pf-responsavel').value = '';
    document.getElementById('parceiro-form-title').innerHTML = '<i class="fa-solid fa-handshake" style="color:#ff9800;margin-right:8px"></i> Novo Parceiro';
    showAdminSection('admin-form-parceiro');
}

function handleParceiroSubmit(event) {
    event.preventDefault();
    const data = {
        nome: document.getElementById('pf-nome').value.trim(),
        cnpj: document.getElementById('pf-cnpj').value.trim(),
        responsavel: document.getElementById('pf-responsavel').value.trim()
    };
    if (editingParceiroIndex !== null) {
        data.docId = parceiros[editingParceiroIndex].docId;
        data.dataCadastro = parceiros[editingParceiroIndex].dataCadastro;
        parceiros[editingParceiroIndex] = data;
        editingParceiroIndex = null;
    } else {
        data.dataCadastro = new Date().toLocaleDateString('pt-BR');
        parceiros.push(data);
    }
    backupParceiros();
    showAdminSection('admin-parceiros');
    renderParceirosList();
    return false;
}

function renderParceirosList() {
    const tbody = document.getElementById('parceiros-list');
    const empty = document.getElementById('parceiros-empty');
    if (!tbody) return;
    if (!parceiros.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    let html = '<table class="data-table"><thead><tr><th>Nome</th><th>CNPJ</th><th>Responsavel</th><th>Data Cadastro</th><th>Acoes</th></tr></thead><tbody>';
    parceiros.forEach((p, i) => {
        html += `<tr>
            <td>${p.nome || '---'}</td>
            <td>${p.cnpj || '---'}</td>
            <td>${p.responsavel || '---'}</td>
            <td>${p.dataCadastro || '---'}</td>
            <td><div class="actions-cell">
                <button class="btn-icon" title="Editar" onclick="editParceiro(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteParceiro(${i})"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    });
    html += '</tbody></table>';
    tbody.innerHTML = html;
}

function editParceiro(i) {
    const p = parceiros[i]; if (!p) return;
    editingParceiroIndex = i;
    document.getElementById('pf-nome').value = p.nome || '';
    document.getElementById('pf-cnpj').value = p.cnpj || '';
    document.getElementById('pf-responsavel').value = p.responsavel || '';
    document.getElementById('parceiro-form-title').innerHTML = '<i class="fa-solid fa-handshake" style="color:#ff9800;margin-right:8px"></i> Editar - ' + (p.nome || '');
    showAdminSection('admin-form-parceiro');
}

async function deleteParceiro(i) {
    const p = parceiros[i]; if (!p) return;
    if (!confirm('Tem certeza que deseja excluir o parceiro "' + (p.nome || '') + '"?')) return;
    if (p.docId) {
        try { await dbFirestore.collection(FB_PARCEIROS).doc(p.docId).delete(); } catch(e) { console.error(e); }
    }
    parceiros.splice(i, 1);
    backupParceiros();
    renderParceirosList();
}

/* ===== TURMAS CRUD ===== */

function renderTurmasList() {
    const tbody = document.getElementById('turmas-table-body');
    const badge = document.getElementById('turmas-count-badge');
    if (!tbody) return;
    const isGeral = currentUserData && currentUserData.cpf === ADMIN_CPF;
    const tv = currentUserData ? (currentUserData.turmasVinculadas || []) : [];
    const filteredTurmas = isGeral || tv.length === 0 ? turmas : turmas.filter(t => tv.includes(t.nome));
    if (badge) badge.textContent = filteredTurmas.length + ' turma' + (filteredTurmas.length !== 1 ? 's' : '');
    if (!filteredTurmas.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:24px">Nenhuma turma acessivel</td></tr>'; return; }
    tbody.innerHTML = filteredTurmas.map((t, i) => {
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

function getTurmaDescricao(nome) {
    const t = turmas.find(t => t.nome === nome);
    return t ? (t.descricao || '') : '';
}

/* ===== POPULATE TURMA SELECT ===== */

async function populateTurmaSelect() {
    const select = document.getElementById('fc-turma');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione a turma...</option>';
    const isGeral = currentUserData && currentUserData.cpf === ADMIN_CPF;
    const tv = currentUserData ? (currentUserData.turmasVinculadas || []) : [];
    const filtered = isGeral || tv.length === 0 ? turmas : turmas.filter(t => tv.includes(t.nome));
    filtered.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.nome;
        opt.textContent = t.nome + (t.descricao ? ' - ' + t.descricao : '');
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

function populateParceiroSelect() {
    const select = document.getElementById('fc-parceiro');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Nenhum parceiro</option>';
    parceiros.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nome;
        opt.textContent = p.nome + (p.responsavel ? ' (' + p.responsavel + ')' : '');
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

async function populatePcfTurmaSelect() {
    const select = document.getElementById('pcf-turma');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione a turma...</option>';
    const isGeral = currentUserData && currentUserData.cpf === ADMIN_CPF;
    const tv = currentUserData ? (currentUserData.turmasVinculadas || []) : [];
    const filtered = isGeral || tv.length === 0 ? turmas : turmas.filter(t => tv.includes(t.nome));
    filtered.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.nome;
        opt.textContent = t.nome + (t.descricao ? ' - ' + t.descricao : '');
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

function saveLastLogin(cpf) {
    try { localStorage.setItem('farn_last_cpf', cpf); } catch(e) {}
}

function getLastLogin() {
    try { return localStorage.getItem('farn_last_cpf') || ''; } catch(e) { return ''; }
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
                const adminReader = new FileReader();
                adminReader.onloadend = function() {
                    document.getElementById('photo-preview').src = adminReader.result;
                    document.getElementById('photo-preview').classList.remove('hidden');
                    document.getElementById('photo-placeholder').style.display = 'none';
                    document.getElementById('btn-remove-photo').style.display = '';
                };
                adminReader.readAsDataURL(blob);
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
    overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px;align-items:center"><button id="camera-switch" style="padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center" title="Trocar camera"><i class="fa-solid fa-camera-rotate"></i></button><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
    document.body.appendChild(overlay);

    const video = document.getElementById('camera-video');
    let stream = null;
    let currentFacing = 'user';

    function startCamera(facing) {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 800 }, height: { ideal: 600 } } });
    }

    startCamera(currentFacing)
    .then(function(s) {
        stream = s;
        video.srcObject = stream;
    })
    .catch(function(err) {
        document.body.removeChild(overlay);
        alert('Nao foi possivel acessar a camera: ' + err.message);
    });

    document.getElementById('camera-switch').onclick = function() {
        currentFacing = currentFacing === 'user' ? 'environment' : 'user';
        startCamera(currentFacing)
        .then(function(s) {
            stream = s;
            video.srcObject = stream;
        })
        .catch(function(err) {
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            alert('Nao foi possivel trocar a camera: ' + err.message);
        });
    };

    document.getElementById('camera-capture').onclick = function() {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 400;
        canvas.getContext('2d').drawImage(video, 0, 0, 300, 400);
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
        canvas.toBlob(function(blob) {
            const capReader = new FileReader();
            capReader.onloadend = function() {
                document.getElementById('photo-preview').src = capReader.result;
                document.getElementById('photo-preview').classList.remove('hidden');
                document.getElementById('photo-placeholder').style.display = 'none';
                document.getElementById('btn-remove-photo').style.display = '';
            };
            capReader.readAsDataURL(blob);
        }, 'image/jpeg', 0.5);
    };

    document.getElementById('camera-cancel').onclick = function() {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
    };
}

function openPortalPhotoCamera() {
    if (!currentAluno) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('portal-aluno-foto-input').click();
        return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'camera-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px;align-items:center"><button id="camera-switch" style="padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center" title="Trocar camera"><i class="fa-solid fa-camera-rotate"></i></button><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
    document.body.appendChild(overlay);

    const video = document.getElementById('camera-video');
    let stream = null;
    let currentFacing = 'user';

    function startCamera(facing) {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    }

    startCamera(currentFacing)
    .then(function(s) { stream = s; video.srcObject = stream; })
    .catch(function(err) { document.body.removeChild(overlay); alert('Nao foi possivel acessar a camera: ' + err.message); });

    document.getElementById('camera-switch').onclick = function() {
        currentFacing = currentFacing === 'user' ? 'environment' : 'user';
        startCamera(currentFacing)
        .then(function(s) { stream = s; video.srcObject = stream; })
        .catch(function(err) { currentFacing = currentFacing === 'user' ? 'environment' : 'user'; alert('Nao foi possivel trocar a camera: ' + err.message); });
    };

    document.getElementById('camera-capture').onclick = function() {
        const canvas = document.createElement('canvas');
        canvas.width = 300; canvas.height = 400;
        canvas.getContext('2d').drawImage(video, 0, 0, 300, 400);
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
        canvas.toBlob(function(blob) {
            const reader = new FileReader();
            reader.onloadend = function() {
                const dataUrl = reader.result;
                dbFirestore.collection('candidatos').doc(currentAluno.cpf).set({ photoDataUrl: dataUrl }, { merge: true })
                .then(function() {
                    currentAluno.photoDataUrl = dataUrl;
                    const idx = candidatos.findIndex(function(c) { return c.cpf === currentAluno.cpf; });
                    if (idx !== -1) candidatos[idx].photoDataUrl = dataUrl;
                    try { localStorage.setItem('farn_photo_' + currentAluno.cpf, dataUrl); } catch(e) {}
                });
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.4);
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
            const labels = {
                'pre-inscricao': '<span class="usuario-tag usuario-tag-pre">Pre-Inscricao</span>',
                'alunos': '<span class="usuario-tag usuario-tag-pre">Alunos</span>',
                'turmas': '<span class="usuario-tag usuario-tag-instrutor">Turmas</span>',
                'instrutores': '<span class="usuario-tag usuario-tag-instrutor">Instrutores</span>',
                'formados': '<span class="usuario-tag usuario-tag-pre">Formados</span>',
                'relatorios': '<span class="usuario-tag usuario-tag-admin">Relatorios</span>',
                'parceiros': '<span class="usuario-tag usuario-tag-pre">Parceiros</span>',
                'config': '<span class="usuario-tag usuario-tag-admin">Config</span>'
            };
            return labels[p] || '';
        }).join('');
        const statusBadge = u.ativo === false ? '<span style="color:#f44336;font-size:11px;font-weight:600">Inativo</span>' : '<span style="color:#4caf50;font-size:11px;font-weight:600">Ativo</span>';
        const turmaTags = (u.turmasVinculadas || []).map(t => `<span class="usuario-tag usuario-tag-turma">${t}</span>`).join('');
        return `<div class="usuario-row">
            <div class="usuario-info">
                <div class="usuario-nome">${u.nome || ''} ${statusBadge}</div>
                <div class="usuario-cpf">CPF: ${formatCPFDisplay(u.cpf)}</div>
                <div class="usuario-permissoes">${permTags}</div>
                ${turmaTags ? `<div class="usuario-permissoes" style="margin-top:4px"><small style="color:#888">Turmas:</small> ${turmaTags}</div>` : ''}
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
    document.getElementById('uf-perm-alunos').checked = false;
    document.getElementById('uf-perm-turmas').checked = false;
    document.getElementById('uf-perm-instrutores').checked = false;
    document.getElementById('uf-perm-formados').checked = false;
    document.getElementById('uf-perm-relatorios').checked = false;
    document.getElementById('uf-perm-parceiros').checked = false;
    document.getElementById('uf-perm-config').checked = false;
    const turmasListEl = document.getElementById('uf-turmas-list');
    if (turmasListEl) {
        turmasListEl.innerHTML = turmas.map(t => `
            <label class="permissao-item">
                <input type="checkbox" class="uf-turma-check" value="${t.nome}">
                <div class="permissao-card">
                    <i class="fa-solid fa-people-group"></i>
                    <span>${t.nome}</span>
                    <small>${t.descricao || 'Turma'}</small>
                </div>
            </label>
        `).join('');
        if (turmas.length === 0) {
            turmasListEl.innerHTML = '<small style="color:#888">Nenhuma turma cadastrada ainda</small>';
        }
    }
    if (docId) {
        const u = usuarios.find(u => u.docId === docId);
        if (u) {
            document.getElementById('usuario-form-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:#2196f3;margin-right:8px"></i> Editar Usuario';
            document.getElementById('uf-nome').value = u.nome || '';
            document.getElementById('uf-cpf').value = u.cpf || '';
            document.getElementById('uf-senha').value = u.senha || '';
            const p = u.permissoes || [];
            if (p.includes('pre-inscricao')) document.getElementById('uf-perm-pre').checked = true;
            if (p.includes('alunos')) document.getElementById('uf-perm-alunos').checked = true;
            if (p.includes('turmas')) document.getElementById('uf-perm-turmas').checked = true;
            if (p.includes('instrutores')) document.getElementById('uf-perm-instrutores').checked = true;
            if (p.includes('formados')) document.getElementById('uf-perm-formados').checked = true;
            if (p.includes('relatorios')) document.getElementById('uf-perm-relatorios').checked = true;
            if (p.includes('parceiros')) document.getElementById('uf-perm-parceiros').checked = true;
            if (p.includes('config')) document.getElementById('uf-perm-config').checked = true;
            const tv = u.turmasVinculadas || [];
            if (tv.length > 0 && turmasListEl) {
                turmasListEl.querySelectorAll('.uf-turma-check').forEach(cb => {
                    if (tv.includes(cb.value)) cb.checked = true;
                });
            }
        }
    } else {
        document.getElementById('usuario-form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#2196f3;margin-right:8px"></i> Novo Usuario';
    }
    showAdminSection('admin-form-usuario', null);
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
    if (document.getElementById('uf-perm-alunos').checked) permissoes.push('alunos');
    if (document.getElementById('uf-perm-turmas').checked) permissoes.push('turmas');
    if (document.getElementById('uf-perm-instrutores').checked) permissoes.push('instrutores');
    if (document.getElementById('uf-perm-formados').checked) permissoes.push('formados');
    if (document.getElementById('uf-perm-relatorios').checked) permissoes.push('relatorios');
    if (document.getElementById('uf-perm-parceiros').checked) permissoes.push('parceiros');
    if (document.getElementById('uf-perm-config').checked) permissoes.push('config');
    if (permissoes.length === 0) { alert('Selecione pelo menos uma permissao.'); return false; }
    const turmasVinculadas = [];
    document.querySelectorAll('.uf-turma-check:checked').forEach(cb => turmasVinculadas.push(cb.value));
    const userData = { nome, cpf, senha, permissoes, turmasVinculadas, ativo: true };
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

/* ===== GERENCIAR FORMADOS ===== */

let editingFormadoDocId = null;
let formadoUploadedFiles = [];
let formadoCertFrente = null;
let formadoCertVerso = null;
let currentFormadosTab = 'ativos';
let pendingMoveFormadoIndex = null;

/* ===== MOVER ALUNO PARA FORMADOS ===== */

function openMoveFormadoModal(idx) {
    pendingMoveFormadoIndex = idx;
    const c = candidatos[idx];
    if (!c) return;
    document.getElementById('move-formado-text').innerHTML = `Deseja mover o aluno <strong>${c.nome}</strong> (CPF: ${formatCPFDisplay(c.cpf)}) para a pagina de <strong>Formados</strong>?`;
    document.getElementById('move-formado-senha').value = '';
    document.getElementById('move-formado-error').classList.add('hidden');
    document.getElementById('modal-move-formado-overlay').classList.remove('hidden');
}

function closeMoveFormadoModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-move-formado-overlay').classList.add('hidden');
    pendingMoveFormadoIndex = null;
}

async function confirmMoveToFormado() {
    const senha = document.getElementById('move-formado-senha').value;
    const errorEl = document.getElementById('move-formado-error');
    errorEl.classList.add('hidden');
    if (senha !== ADMIN_SENHA) {
        errorEl.classList.remove('hidden');
        return;
    }
    const c = candidatos[pendingMoveFormadoIndex];
    if (!c) { closeMoveFormadoModal(); return; }
    const data = {
        nome: c.nome || '',
        cpf: c.cpf || '',
        nascimento: c.nascimento || '',
        estadoCivil: c.estadoCivil || '',
        nacionalidade: c.nacionalidade || '',
        naturalidade: c.naturalidade || '',
        profissao: c.profissao || '',
        mae: c.mae || '',
        pai: c.pai || '',
        email: c.email || '',
        whatsapp: c.whatsapp || '',
        endereco: c.endereco || '',
        numero: c.numero || '',
        bairro: c.bairro || '',
        cidade: c.cidade || '',
        estado: c.estado || '',
        altura: c.altura || '',
        peso: c.peso || '',
        fatorRh: c.fatorRh || '',
        photoDataUrl: c.photoDataUrl || null,
        hasPhoto: c.hasPhoto || false,
        cursos: [],
        matricula: '',
        dataFormacao: '',
        dataFormacaoRaw: '',
        certFrente: null,
        certVerso: null,
        status: 'Pendente',
        cadastradoPor: currentUserData ? currentUserData.nome : 'Desconhecido',
        dataCadastro: new Date().toLocaleDateString('pt-BR'),
        movedFromAlunos: true
    };
    try {
        const docId = c.cpf;
        await dbFirestore.collection(FB_FORMADOS).doc(docId).set(data);
        closeMoveFormadoModal();
        openFormFormado(docId);
    } catch(e) {
        alert('Erro ao mover para formados: ' + e.message);
    }
}

const formadoFields = ['ff-nome','ff-cpf','ff-nascimento','ff-estado-civil','ff-nacionalidade','ff-naturalidade','ff-profissao','ff-mae','ff-pai','ff-email','ff-whatsapp','ff-endereco','ff-numero','ff-bairro','ff-cidade','ff-estado','ff-altura','ff-peso','ff-fator-rh','ff-data-formacao','ff-matricula'];

function switchFormadosTab(tab, btn) {
    currentFormadosTab = tab;
    document.querySelectorAll('#admin-formados .alunos-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderFormadosList();
}

function renderFormadosList() {
    const tbody = document.getElementById('formados-table-body');
    const badge = document.getElementById('formados-count-badge');
    if (!tbody) return;
    const ativos = formados.filter(f => f.status === 'Ativo' || !f.status).length;
    const pendentes = formados.filter(f => f.status === 'Pendente').length;
    const countAtivos = document.getElementById('tab-count-formados-ativos');
    const countPendentes = document.getElementById('tab-count-formados-pendentes');
    if (countAtivos) countAtivos.textContent = ativos;
    if (countPendentes) countPendentes.textContent = pendentes;
    if (badge) badge.textContent = formados.length + ' formado' + (formados.length !== 1 ? 's' : '');
    if (!formados.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">Nenhum formado cadastrado</td></tr>'; return; }
    const search = (document.getElementById('formados-search') || {}).value || '';
    let filtered = formados.filter(f => {
        const matchTab = currentFormadosTab === 'ativos' ? (f.status === 'Ativo' || !f.status) : f.status === 'Pendente';
        const matchSearch = !search || (f.nome || '').toLowerCase().includes(search.toLowerCase()) || (f.cpf || '').includes(search.replace(/\D/g, ''));
        return matchTab && matchSearch;
    });
    if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">Nenhum formado ${currentFormadosTab === 'ativos' ? 'ativo' : 'pendente'}</td></tr>`; return; }
    tbody.innerHTML = filtered.map((f, i) => {
        let cursos = '-';
        if (f.cursosDetalhes && f.cursosDetalhes.length) {
            cursos = f.cursosDetalhes.map(cd => {
                let info = cd.nome;
                if (cd.dataFormacao) info += ' (' + cd.dataFormacao + ')';
                if (cd.certFrente || cd.certVerso) info += ' <i class="fa-solid fa-certificate" style="color:#4caf50;font-size:9px"></i>';
                return info;
            }).join('<br>');
        } else {
            cursos = (f.cursos || []).join(', ') || '-';
            if (f.dataFormacao) cursos += '<br><small style="color:#888">' + f.dataFormacao + '</small>';
        }
        const sc = f.status === 'Ativo' || !f.status ? 'green' : 'pendente';
        const statusLabel = f.status || 'Pendente';
        return `<tr>
            <td>${f.nome || ''}</td>
            <td>${formatCPFDisplay(f.cpf)}</td>
            <td style="color:#f57c00;font-weight:600">${f.matricula || '-'}</td>
            <td style="font-size:11px;max-width:200px">${cursos}</td>
            <td><span class="badge ${sc}">${statusLabel}</span></td>
            <td style="color:#aaa;font-size:12px">${f.cadastradoPor || '-'}</td>
            <td><div class="actions-cell">
                <button class="btn-icon btn-info" title="Visualizar" onclick="viewFormado('${f.docId}')"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-icon" title="Editar" onclick="editFormado('${f.docId}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-success" title="${f.status === 'Ativo' || !f.status ? 'Manter Ativo' : 'Ativar'}" onclick="changeFormadoStatus('${f.docId}', 'Ativo')"><i class="fa-solid fa-check"></i></button>
                <button class="btn-icon btn-warning" title="Marcar Pendente" onclick="changeFormadoStatus('${f.docId}', 'Pendente')"><i class="fa-solid fa-clock"></i></button>
                <button class="btn-icon btn-info" title="Voltar para Aluno" onclick="formadoParaAluno('${f.docId}')"><i class="fa-solid fa-user-graduate"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteFormado('${f.docId}')"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

function filterFormados() { renderFormadosList(); }

async function changeFormadoStatus(docId, newStatus) {
    try {
        await dbFirestore.collection(FB_FORMADOS).doc(docId).set({ status: newStatus }, { merge: true });
    } catch(e) { alert('Erro ao alterar status: ' + e.message); }
}

async function formadoParaAluno(docId) {
    const f = formados.find(x => x.docId === docId);
    if (!f) return;
    if (!confirm(`Deseja mover "${f.nome}" de volta para Aluno(a) aprovado(a)?`)) return;
    try {
        const candidatoData = {
            nome: f.nome || '',
            cpf: f.cpf || '',
            nascimento: f.nascimento || '',
            estadoCivil: f.estadoCivil || '',
            nacionalidade: f.nacionalidade || '',
            naturalidade: f.naturalidade || '',
            profissao: f.profissao || '',
            mae: f.mae || '',
            pai: f.pai || '',
            email: f.email || '',
            whatsapp: f.whatsapp || '',
            endereco: f.endereco || '',
            numero: f.numero || '',
            bairro: f.bairro || '',
            cidade: f.cidade || '',
            estado: f.estado || '',
            photoDataUrl: f.photoDataUrl || null,
            status: 'Aprovado',
            dataAprovacao: new Date().toLocaleDateString('pt-BR'),
            cadastradoPor: currentUserData ? currentUserData.nome : 'Desconhecido'
        };
        await dbFirestore.collection(FB_CANDIDATOS).doc(f.cpf).set(candidatoData);
        await dbFirestore.collection(FB_FORMADOS).doc(docId).delete();
        renderFormadosList();
    } catch(e) {
        alert('Erro ao mover para aluno: ' + e.message);
    }
}

function generateMatricula(cpf, dataFormacao) {
    let year = new Date().getFullYear();
    if (dataFormacao) {
        const d = new Date(dataFormacao);
        if (!isNaN(d)) year = d.getFullYear();
    }
    const last5 = (cpf || '').replace(/\D/g, '').slice(-5);
    return String(year).slice(-4) + last5;
}

function openFormFormado(docId) {
    editingFormadoDocId = docId || null;
    formadoUploadedFiles = [];
    formadoCertFrente = null;
    formadoCertVerso = null;
    const form = document.getElementById('form-formado');
    form.reset();
    document.getElementById('formado-photo-preview').classList.add('hidden');
    document.getElementById('formado-photo-placeholder').style.display = '';
    document.getElementById('formado-btn-remove-photo').style.display = 'none';
    document.querySelectorAll('.ff-curso-check').forEach(cb => cb.checked = false);
    document.getElementById('ff-cert-frente-preview').innerHTML = '<div class="cert-preview-empty">Nenhuma foto</div>';
    document.getElementById('ff-cert-verso-preview').innerHTML = '<div class="cert-preview-empty">Nenhuma foto</div>';
    document.getElementById('ff-files-list').innerHTML = '';
    if (docId) {
        const f = formados.find(f => f.docId === docId);
        if (f) {
            document.getElementById('formado-form-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:#ff9800;margin-right:8px"></i> Editar Formado';
            document.getElementById('ff-nome').value = f.nome || '';
            document.getElementById('ff-cpf').value = f.cpf || '';
            document.getElementById('ff-nascimento').value = f.nascimento || '';
            document.getElementById('ff-estado-civil').value = f.estadoCivil || '';
            document.getElementById('ff-nacionalidade').value = f.nacionalidade || '';
            document.getElementById('ff-naturalidade').value = f.naturalidade || '';
            document.getElementById('ff-profissao').value = f.profissao || '';
            document.getElementById('ff-mae').value = f.mae || '';
            document.getElementById('ff-pai').value = f.pai || '';
            document.getElementById('ff-email').value = f.email || '';
            document.getElementById('ff-whatsapp').value = f.whatsapp || '';
            document.getElementById('ff-endereco').value = f.endereco || '';
            document.getElementById('ff-numero').value = f.numero || '';
            document.getElementById('ff-bairro').value = f.bairro || '';
            document.getElementById('ff-cidade').value = f.cidade || '';
            document.getElementById('ff-estado').value = f.estado || '';
            document.getElementById('ff-altura').value = f.altura || '';
            document.getElementById('ff-peso').value = f.peso || '';
            document.getElementById('ff-fator-rh').value = f.fatorRh || '';
            document.getElementById('ff-matricula').value = f.matricula || '';
            document.getElementById('ff-senha').value = f.senha || '';
            document.getElementById('ff-data-formacao').value = f.dataFormacaoRaw || '';
            (f.cursos || []).forEach(c => {
                const cb = document.querySelector(`.ff-curso-check[value="${c}"]`);
                if (cb) cb.checked = true;
            });
            if (f.photoDataUrl) {
                document.getElementById('formado-photo-preview').src = f.photoDataUrl;
                document.getElementById('formado-photo-preview').classList.remove('hidden');
                document.getElementById('formado-photo-placeholder').style.display = 'none';
                document.getElementById('formado-btn-remove-photo').style.display = '';
            }
            if (f.certFrente) {
                document.getElementById('ff-cert-frente-preview').innerHTML = `<img src="${f.certFrente}">`;
                formadoCertFrente = f.certFrente;
            }
            if (f.certVerso) {
                document.getElementById('ff-cert-verso-preview').innerHTML = `<img src="${f.certVerso}">`;
                formadoCertVerso = f.certVerso;
            }
        }
    } else {
        document.getElementById('formado-form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#ff9800;margin-right:8px"></i> Novo Formado';
        document.getElementById('ff-cert-frente-preview').innerHTML = '<div class="cert-preview-empty">Nenhuma foto</div>';
        document.getElementById('ff-cert-verso-preview').innerHTML = '<div class="cert-preview-empty">Nenhuma foto</div>';
    }
    showAdminSection('admin-form-formado');
}

function editFormado(docId) { openFormFormado(docId); }

async function handleFormadoSubmit(event) {
    event.preventDefault();
    const cpf = document.getElementById('ff-cpf').value.replace(/\D/g, '');
    if (cpf.length !== 11) { alert('CPF invalido.'); return false; }
    const cursos = [];
    document.querySelectorAll('.ff-curso-check:checked').forEach(cb => cursos.push(cb.value));
    if (cursos.length === 0) { alert('Selecione pelo menos um curso de formacao.'); return false; }
    const data = {};
    formadoFields.forEach(id => {
        const key = id.replace('ff-', '').replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'ff-cpf') data[key] = el.value.replace(/\D/g, '');
        else data[key] = el.value;
    });
    data.cursos = cursos;
    data.dataFormacao = document.getElementById('ff-data-formacao').value ? new Date(document.getElementById('ff-data-formacao').value).toLocaleDateString('pt-BR') : '';
    data.dataFormacaoRaw = document.getElementById('ff-data-formacao').value;
    data.matricula = document.getElementById('ff-matricula').value || generateMatricula(cpf, document.getElementById('ff-data-formacao').value);
    const ffSenha = document.getElementById('ff-senha').value;
    if (ffSenha) data.senha = ffSenha;
    const photoPreview = document.getElementById('formado-photo-preview');
    if (photoPreview && !photoPreview.classList.contains('hidden') && photoPreview.src) {
        data.photoDataUrl = photoPreview.src;
    }
    if (formadoCertFrente) data.certFrente = formadoCertFrente;
    if (formadoCertVerso) data.certVerso = formadoCertVerso;
    data.cadastradoPor = currentUserData ? currentUserData.nome : 'Desconhecido';
    data.status = editingFormadoDocId ? (formados.find(f => f.docId === editingFormadoDocId) || {}).status || 'Pendente' : 'Pendente';
    data.dataCadastro = editingFormadoDocId ? (formados.find(f => f.docId === editingFormadoDocId) || {}).dataCadastro || new Date().toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    try {
        if (editingFormadoDocId) {
            await dbFirestore.collection(FB_FORMADOS).doc(editingFormadoDocId).set(data, { merge: true });
        } else {
            const docId = cpf;
            await dbFirestore.collection(FB_FORMADOS).doc(docId).set(data);
        }
        editingFormadoDocId = null;
        showAdminSection('admin-formados');
    } catch(e) {
        alert('Erro ao salvar formado: ' + e.message);
    }
    return false;
}

async function deleteFormado(docId) {
    const f = formados.find(f => f.docId === docId);
    if (!f) return;
    pendingDeleteIndex = null;
    document.getElementById('confirm-text').innerHTML = `Tem certeza que deseja excluir o formado <strong>${f.nome}</strong>?`;
    document.getElementById('modal-confirm-overlay').classList.remove('hidden');
    window._pendingDeleteFormado = docId;
}

const origConfirmDelete = typeof confirmDelete === 'function' ? confirmDelete : null;

async function confirmDeleteFormados() {
    if (window._pendingDeleteFormado) {
        try {
            await dbFirestore.collection(FB_FORMADOS).doc(window._pendingDeleteFormado).delete();
        } catch(e) { alert('Erro ao excluir: ' + e.message); }
        window._pendingDeleteFormado = null;
        closeConfirmModal();
        return;
    }
    if (origConfirmDelete) origConfirmDelete();
}

function viewFormado(docId) {
    const f = formados.find(f => f.docId === docId); if (!f) return;
    document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-user" style="color:#ff9800"></i> Detalhes do Formado';
    const photoSrc = f.photoDataUrl || null;

    let cursosHtml = '';
    let certHtml = '';
    if (f.cursosDetalhes && f.cursosDetalhes.length) {
        cursosHtml = f.cursosDetalhes.map(cd => {
            let info = '<span class="usuario-tag usuario-tag-pre" style="background:rgba(255,152,0,0.15);color:#ff9800">' + cd.nome;
            if (cd.dataFormacao) info += ' (' + cd.dataFormacao + ')';
            info += '</span>';
            return info;
        }).join(' ');
        certHtml = f.cursosDetalhes.map(cd => {
            let html = '<div style="margin-bottom:12px"><strong style="color:#ff9800;font-size:12px">' + cd.nome + '</strong><div style="display:flex;gap:10px;margin-top:4px">';
            html += '<div>' + (cd.certFrente ? '<span class="detail-label">Frente</span><br><img src="' + cd.certFrente + '" style="max-width:150px;max-height:120px;border-radius:8px;border:1px solid #333">' : '<span class="detail-label">Frente: ---</span>') + '</div>';
            html += '<div>' + (cd.certVerso ? '<span class="detail-label">Verso</span><br><img src="' + cd.certVerso + '" style="max-width:150px;max-height:120px;border-radius:8px;border:1px solid #333">' : '<span class="detail-label">Verso: ---</span>') + '</div>';
            html += '</div></div>';
            return html;
        }).join('');
    } else {
        cursosHtml = (f.cursos || []).map(c => '<span class="usuario-tag usuario-tag-pre" style="background:rgba(255,152,0,0.15);color:#ff9800">' + c + '</span>').join(' ');
        if (f.certFrente || f.certVerso) {
            certHtml = '<div style="display:flex;gap:10px">' +
                '<div>' + (f.certFrente ? '<span class="detail-label">Frente</span><br><img src="' + f.certFrente + '" style="max-width:150px;max-height:120px;border-radius:8px;border:1px solid #333">' : '<span class="detail-label">Frente: ---</span>') + '</div>' +
                '<div>' + (f.certVerso ? '<span class="detail-label">Verso</span><br><img src="' + f.certVerso + '" style="max-width:150px;max-height:120px;border-radius:8px;border:1px solid #333">' : '<span class="detail-label">Verso: ---</span>') + '</div>' +
                '</div>';
        }
    }

    document.getElementById('modal-body').innerHTML = `
        ${photoSrc ? `<div style="text-align:center;margin-bottom:16px"><img src="${photoSrc}" style="width:120px;height:160px;object-fit:cover;border:2px solid #ff9800;border-radius:8px" alt="Foto 3x4"></div>` : ''}
        <div class="detail-grid">
            <div class="detail-section-title">Dados Pessoais</div>
            <div class="detail-item full"><span class="detail-label">Nome</span><span class="detail-value">${f.nome}</span></div>
            <div class="detail-item"><span class="detail-label">CPF</span><span class="detail-value">${formatCPFDisplay(f.cpf)}</span></div>
            <div class="detail-item"><span class="detail-label">Nascimento</span><span class="detail-value">${f.nascimento||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Estado Civil</span><span class="detail-value">${f.estadoCivil||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Nacionalidade</span><span class="detail-value">${f.nacionalidade||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Naturalidade</span><span class="detail-value">${f.naturalidade||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Mae</span><span class="detail-value">${f.mae||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Pai</span><span class="detail-value">${f.pai||'---'}</span></div>
            <div class="detail-section-title">Contato</div>
            <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${f.email||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">WhatsApp</span><span class="detail-value">${f.whatsapp||'---'}</span></div>
            <div class="detail-section-title">Endereco</div>
            <div class="detail-item full"><span class="detail-label">Endereco</span><span class="detail-value">${f.endereco||'---'}, ${f.numero||''}</span></div>
            <div class="detail-item"><span class="detail-label">Bairro</span><span class="detail-value">${f.bairro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cidade/UF</span><span class="detail-value">${f.cidade||'---'} - ${f.estado||'---'}</span></div>
            <div class="detail-section-title">Dados Fisicos</div>
            <div class="detail-item"><span class="detail-label">Altura</span><span class="detail-value">${f.altura||'---'} cm</span></div>
            <div class="detail-item"><span class="detail-label">Peso</span><span class="detail-value">${f.peso||'---'} kg</span></div>
            <div class="detail-item"><span class="detail-label">Fator RH</span><span class="detail-value">${f.fatorRh||'---'}</span></div>
            <div class="detail-section-title">Formacao</div>
            <div class="detail-item"><span class="detail-label">Matricula</span><span class="detail-value" style="color:#f57c00;font-weight:700">${f.matricula||'---'}</span></div>
            <div class="detail-item full"><span class="detail-label">Cursos</span><span class="detail-value">${cursosHtml||'---'}</span></div>
            ${certHtml ? '<div class="detail-section-title">Certificados</div><div class="detail-item full">' + certHtml + '</div>' : ''}
            <div class="detail-section-title">Cadastro</div>
            <div class="detail-item"><span class="detail-label">Cadastrado por</span><span class="detail-value" style="color:#f57c00;font-weight:600">${f.cadastradoPor||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Data Cadastro</span><span class="detail-value">${f.dataCadastro||'---'}</span></div>
        </div>`;
    openModal();
}

function resetFormFormado() {
    document.getElementById('form-formado').reset();
    document.getElementById('formado-photo-preview').classList.add('hidden');
    document.getElementById('formado-photo-placeholder').style.display = '';
    document.getElementById('formado-btn-remove-photo').style.display = 'none';
    document.querySelectorAll('.ff-curso-check').forEach(cb => cb.checked = false);
    document.getElementById('ff-cert-frente-preview').innerHTML = '<div class="cert-preview-empty">Nenhuma foto</div>';
    document.getElementById('ff-cert-verso-preview').innerHTML = '<div class="cert-preview-empty">Nenhuma foto</div>';
    document.getElementById('ff-files-list').innerHTML = '';
    document.getElementById('ff-senha').value = '';
    formadoCertFrente = null;
    formadoCertVerso = null;
    formadoUploadedFiles = [];
}

function handleFormadoPhotoUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 400;
            canvas.getContext('2d').drawImage(img, 0, 0, 300, 400);
            canvas.toBlob(function(blob) {
                const fUpReader = new FileReader();
                fUpReader.onloadend = function() {
                    document.getElementById('formado-photo-preview').src = fUpReader.result;
                    document.getElementById('formado-photo-preview').classList.remove('hidden');
                    document.getElementById('formado-photo-placeholder').style.display = 'none';
                    document.getElementById('formado-btn-remove-photo').style.display = '';
                };
                fUpReader.readAsDataURL(blob);
            }, 'image/jpeg', 0.5);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removeFormadoPhoto() {
    document.getElementById('formado-photo-preview').classList.add('hidden');
    document.getElementById('formado-photo-preview').src = '';
    document.getElementById('formado-photo-placeholder').style.display = '';
    document.getElementById('formado-btn-remove-photo').style.display = 'none';
    document.getElementById('formado-photo-input').value = '';
}

function openFormadoCamera() {
    saveFormState();
    saveLoginState();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const overlay = document.createElement('div');
        overlay.id = 'camera-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px;align-items:center"><button id="camera-switch" style="padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center" title="Trocar camera"><i class="fa-solid fa-camera-rotate"></i></button><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
        document.body.appendChild(overlay);
        const video = document.getElementById('camera-video');
        let stream = null;
        let currentFacing = 'user';

        function startCamera(facing) {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 800 }, height: { ideal: 600 } } });
        }

        startCamera(currentFacing)
        .then(function(s) { stream = s; video.srcObject = stream; })
        .catch(function(err) { document.body.removeChild(overlay); alert('Nao foi possivel acessar a camera: ' + err.message); });

        document.getElementById('camera-switch').onclick = function() {
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            startCamera(currentFacing)
            .then(function(s) { stream = s; video.srcObject = stream; })
            .catch(function(err) { currentFacing = currentFacing === 'user' ? 'environment' : 'user'; alert('Nao foi possivel trocar a camera: ' + err.message); });
        };

        document.getElementById('camera-capture').onclick = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 400;
            canvas.getContext('2d').drawImage(video, 0, 0, 300, 400);
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
            canvas.toBlob(function(blob) {
                const fReader = new FileReader();
                fReader.onloadend = function() {
                    document.getElementById('formado-photo-preview').src = fReader.result;
                    document.getElementById('formado-photo-preview').classList.remove('hidden');
                    document.getElementById('formado-photo-placeholder').style.display = 'none';
                    document.getElementById('formado-btn-remove-photo').style.display = '';
                };
                fReader.readAsDataURL(blob);
            }, 'image/jpeg', 0.5);
        };
        document.getElementById('camera-cancel').onclick = function() {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
        };
    } else {
        document.getElementById('formado-photo-input').click();
    }
}

function handleCertUpload(event, side) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxW = 800;
            const ratio = Math.min(maxW / img.width, maxW / img.height, 1);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function(blob) {
                const reader2 = new FileReader();
                reader2.onload = function(ev) {
                    const dataUrl = ev.target.result;
                    if (side === 'frente') {
                        formadoCertFrente = dataUrl;
                        document.getElementById('ff-cert-frente-preview').innerHTML = `<img src="${dataUrl}">`;
                    } else {
                        formadoCertVerso = dataUrl;
                        document.getElementById('ff-cert-verso-preview').innerHTML = `<img src="${dataUrl}">`;
                    }
                };
                reader2.readAsDataURL(blob);
            }, 'image/jpeg', 0.6);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function openCertCamera(side) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const overlay = document.createElement('div');
        overlay.id = 'camera-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px"><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
        document.body.appendChild(overlay);
        const video = document.getElementById('camera-video');
        let stream = null;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1200 }, height: { ideal: 900 } } })
        .then(function(s) { stream = s; video.srcObject = stream; })
        .catch(function(err) { document.body.removeChild(overlay); alert('Nao foi possivel acessar a camera: ' + err.message); });
        document.getElementById('camera-capture').onclick = function() {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 800;
            canvas.height = video.videoHeight || 600;
            canvas.getContext('2d').drawImage(video, 0, 0);
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
            canvas.toBlob(function(blob) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    const dataUrl = ev.target.result;
                    if (side === 'frente') {
                        formadoCertFrente = dataUrl;
                        document.getElementById('ff-cert-frente-preview').innerHTML = `<img src="${dataUrl}">`;
                    } else {
                        formadoCertVerso = dataUrl;
                        document.getElementById('ff-cert-verso-preview').innerHTML = `<img src="${dataUrl}">`;
                    }
                };
                reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.6);
        };
        document.getElementById('camera-cancel').onclick = function() {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
        };
    } else {
        document.getElementById(side === 'frente' ? 'ff-cert-frente-input' : 'ff-cert-verso-input').click();
    }
}

function handleFormadoFilesUpload(event) { Array.from(event.target.files).forEach(f => addFormadoFile(f)); }

function addFormadoFile(file) {
    if (formadoUploadedFiles.length >= 5) { alert('Maximo de 5 arquivos.'); return; }
    formadoUploadedFiles.push({ id: Date.now() + Math.random(), file });
    renderFormadoFilesList();
}

function renderFormadoFilesList() {
    const list = document.getElementById('ff-files-list'); if (!list) return;
    list.innerHTML = formadoUploadedFiles.map(f => {
        const icon = f.file.name.endsWith('.pdf') ? 'fa-file-pdf' : f.file.name.match(/\.(jpg|jpeg|png)$/i) ? 'fa-file-image' : 'fa-file';
        return `<div class="file-item"><i class="fa-solid ${icon}" style="color:#f57c00"></i><span class="file-name">${f.file.name}</span><span class="file-size">${(f.file.size/1024).toFixed(1)}KB</span><button type="button" class="btn-icon btn-danger-icon" onclick="removeFormadoFile(${f.id})"><i class="fa-solid fa-trash"></i></button></div>`;
    }).join('');
}

function removeFormadoFile(id) { formadoUploadedFiles = formadoUploadedFiles.filter(f => f.id !== id); renderFormadoFilesList(); }

function exportExcelFormados() {
    if (!formados.length) { alert('Nenhum formado para exportar.'); return; }
    let csv = 'Nome,CPF,Matricula,Cursos,Cadastrado por\n';
    formados.forEach(f => {
        let cursos = '';
        if (f.cursosDetalhes && f.cursosDetalhes.length) {
            cursos = f.cursosDetalhes.map(cd => cd.nome + (cd.dataFormacao ? ' (' + cd.dataFormacao + ')' : '')).join('; ');
        } else {
            cursos = (f.cursos || []).join('; ');
            if (f.dataFormacao) cursos += ' (' + f.dataFormacao + ')';
        }
        csv += `"${f.nome||''}","${formatCPFDisplay(f.cpf)}","${f.matricula||''}","${cursos}","${f.cadastradoPor||''}"\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'formados_' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
}

// ===== PRE-CADASTRO FORMADOS =====

let preCadastroFormadoPhotoDataUrl = null;
let pcfCursosData = {};

function initPcfCursosListeners() {
    document.querySelectorAll('.pcf-curso-check').forEach(function(cb) {
        cb.addEventListener('change', function() {
            if (this.checked) {
                pcfCursosData[this.value] = { dataFormacao: '', certFrente: null, certVerso: null };
            } else {
                delete pcfCursosData[this.value];
            }
            renderPcfCursosDetalhes();
        });
    });
}

function renderPcfCursosDetalhes() {
    var container = document.getElementById('pcf-cursos-detalhes');
    if (!container) return;
    var cursos = Object.keys(pcfCursosData);
    if (!cursos.length) { container.innerHTML = ''; return; }
    container.innerHTML = cursos.map(function(curso) {
        var slug = curso.replace(/[^a-zA-Z0-9]/g, '-');
        var data = pcfCursosData[curso];
        return '<div class="pcf-curso-detalhe" data-curso="' + curso + '">' +
            '<div class="pcf-curso-detalhe-header"><i class="fa-solid fa-graduation-cap" style="margin-right:6px"></i>' + curso + '</div>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Data Formacao *</label><input type="date" class="config-input pcf-curso-data" value="' + (data.dataFormacao || '') + '"></div>' +
            '<div class="form-group"><label>Cert. Frente</label>' +
            '<div class="upload-buttons-row">' +
            '<button type="button" class="btn-upload-action pcf-camera-btn" data-side="frente"><i class="fa-solid fa-camera"></i> Camera</button>' +
            '<button type="button" class="btn-upload-action pcf-import-btn" data-side="frente"><i class="fa-solid fa-file-import"></i> Importar</button>' +
            '</div>' +
            '<input type="file" accept="image/*" class="hidden pcf-cert-file" data-side="frente">' +
            '<div class="cert-preview pcf-cert-preview" data-side="frente">' + (data.certFrente ? '<img src="' + data.certFrente + '">' : '<div class="cert-preview-empty">Nenhuma foto</div>') + '</div>' +
            '</div>' +
            '<div class="form-group"><label>Cert. Verso</label>' +
            '<div class="upload-buttons-row">' +
            '<button type="button" class="btn-upload-action pcf-camera-btn" data-side="verso"><i class="fa-solid fa-camera"></i> Camera</button>' +
            '<button type="button" class="btn-upload-action pcf-import-btn" data-side="verso"><i class="fa-solid fa-file-import"></i> Importar</button>' +
            '</div>' +
            '<input type="file" accept="image/*" class="hidden pcf-cert-file" data-side="verso">' +
            '<div class="cert-preview pcf-cert-preview" data-side="verso">' + (data.certVerso ? '<img src="' + data.certVerso + '">' : '<div class="cert-preview-empty">Nenhuma foto</div>') + '</div>' +
            '</div>' +
            '</div></div>';
    }).join('');

    container.querySelectorAll('.pcf-curso-detalhe').forEach(function(el) {
        var curso = el.dataset.curso;
        el.querySelector('.pcf-curso-data').addEventListener('change', function() {
            pcfCursosData[curso].dataFormacao = this.value;
        });
        el.querySelectorAll('.pcf-camera-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                openPcfCertCamera(curso, this.dataset.side);
            });
        });
        el.querySelectorAll('.pcf-import-btn').forEach(function(btn) {
            var side = btn.dataset.side;
            var fileInput = el.querySelector('.pcf-cert-file[data-side="' + side + '"]');
            btn.addEventListener('click', function() {
                fileInput.click();
            });
        });
        el.querySelectorAll('.pcf-cert-file').forEach(function(input) {
            input.addEventListener('change', function() {
                handlePcfCertUpload(this, curso, this.dataset.side);
            });
        });
    });
}

function openPcfCertCamera(cursoName, side) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        var overlay = document.createElement('div');
        overlay.id = 'camera-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px"><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
        document.body.appendChild(overlay);
        var video = document.getElementById('camera-video');
        var stream = null;
        var currentFacing = 'environment';
        function startCam(facing) {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1200 }, height: { ideal: 900 } } });
        }
        startCam(currentFacing)
        .then(function(s) { stream = s; video.srcObject = stream; })
        .catch(function(err) { document.body.removeChild(overlay); alert('Nao foi possivel acessar a camera: ' + err.message); });

        var switchBtn = document.createElement('button');
        switchBtn.id = 'camera-switch';
        switchBtn.style.cssText = 'padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center';
        switchBtn.title = 'Trocar camera';
        switchBtn.innerHTML = '<i class="fa-solid fa-camera-rotate"></i>';
        overlay.querySelector('div:last-child').insertBefore(switchBtn, document.getElementById('camera-capture'));

        switchBtn.onclick = function() {
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            startCam(currentFacing)
            .then(function(s) { stream = s; video.srcObject = stream; })
            .catch(function(err) { currentFacing = currentFacing === 'user' ? 'environment' : 'user'; alert('Nao foi possivel trocar a camera: ' + err.message); });
        };

        document.getElementById('camera-capture').onclick = function() {
            var canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 800;
            canvas.height = video.videoHeight || 600;
            canvas.getContext('2d').drawImage(video, 0, 0);
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
            canvas.toBlob(function(blob) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var dataUrl = ev.target.result;
                    pcfCursosData[cursoName][side === 'frente' ? 'certFrente' : 'certVerso'] = dataUrl;
                    var slug = cursoName.replace(/[^a-zA-Z0-9]/g, '-');
                    var preview = document.querySelector('.pcf-curso-detalhe[data-curso="' + cursoName + '"] .pcf-cert-preview[data-side="' + side + '"]');
                    if (preview) preview.innerHTML = '<img src="' + dataUrl + '">';
                };
                reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.6);
        };
        document.getElementById('camera-cancel').onclick = function() {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
        };
    } else {
        var slug = cursoName.replace(/[^a-zA-Z0-9]/g, '-');
        var fileInput = document.querySelector('.pcf-curso-detalhe[data-curso="' + cursoName + '"] .pcf-cert-file[data-side="' + side + '"]');
        if (fileInput) fileInput.click();
    }
}

function handlePcfCertUpload(fileInput, cursoName, side) {
    var file = fileInput.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var maxW = 800;
            var ratio = Math.min(maxW / img.width, maxW / img.height, 1);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function(blob) {
                var reader2 = new FileReader();
                reader2.onload = function(ev) {
                    var dataUrl = ev.target.result;
                    pcfCursosData[cursoName][side === 'frente' ? 'certFrente' : 'certVerso'] = dataUrl;
                    var preview = document.querySelector('.pcf-curso-detalhe[data-curso="' + cursoName + '"] .pcf-cert-preview[data-side="' + side + '"]');
                    if (preview) preview.innerHTML = '<img src="' + dataUrl + '">';
                };
                reader2.readAsDataURL(blob);
            }, 'image/jpeg', 0.6);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function openFormPreCadastroFormado() {
    resetFormPreCadastroFormado();
    document.getElementById('pre-cad-formado-form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#ff9800;margin-right:8px"></i> Novo Pre-Cadastro';
    populatePcfTurmaSelect();
    showAdminSection('admin-form-pre-cadastro-formado');
}

function renderPreCadastroFormadosList() {
    const pending = formados.filter(f => !f.status || f.status === 'Pendente');
    const tbody = document.getElementById('pre-cad-formados-table-body');
    if (!pending.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:32px">Nenhum pre-cadastro pendente.</td></tr>';
        return;
    }
    tbody.innerHTML = pending.map(f => {
        let cursosHtml = '';
        if (f.cursosDetalhes && f.cursosDetalhes.length) {
            cursosHtml = f.cursosDetalhes.map(cd => {
                let info = cd.nome;
                if (cd.dataFormacao) info += ' (' + cd.dataFormacao + ')';
                if (cd.certFrente || cd.certVerso) info += ' <i class="fa-solid fa-certificate" style="color:#4caf50;font-size:10px"></i>';
                return info;
            }).join('<br>');
        } else {
            cursosHtml = (f.cursos||[]).join(', ');
            if (f.dataFormacao) cursosHtml += '<br><small style="color:#888">' + f.dataFormacao + '</small>';
        }
        return `<tr>
            <td>${f.nome||''}</td>
            <td>${formatCPFDisplay(f.cpf)}</td>
            <td>${f.turma||'---'}</td>
            <td style="font-size:12px">${cursosHtml}</td>
            <td>${f.cadastradoPor||''}</td>
            <td>
                <div style="display:flex;gap:6px">
                    <button class="btn-sm btn-outline" onclick="aprovarPreCadastroFormado('${f.docId}')" title="Aprovar"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-sm btn-outline btn-danger-outline" onclick="excluirPreCadastroFormado('${f.docId}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterPreCadastroFormados() {
    const q = (document.getElementById('pre-cad-formados-search').value || '').toLowerCase();
    const rows = document.querySelectorAll('#pre-cad-formados-table-body tr');
    rows.forEach(r => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
}

function handlePreCadastroFormadoPhotoUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 400;
            canvas.getContext('2d').drawImage(img, 0, 0, 300, 400);
            canvas.toBlob(function(blob) {
                const pcfReader = new FileReader();
                pcfReader.onloadend = function() {
                    preCadastroFormadoPhotoDataUrl = pcfReader.result;
                    document.getElementById('pcf-photo-preview').src = pcfReader.result;
                    document.getElementById('pcf-photo-preview').classList.remove('hidden');
                    document.getElementById('pcf-photo-placeholder').style.display = 'none';
                    document.getElementById('pcf-btn-remove-photo').style.display = '';
                };
                pcfReader.readAsDataURL(blob);
            }, 'image/jpeg', 0.5);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removePreCadastroFormadoPhoto() {
    preCadastroFormadoPhotoDataUrl = null;
    document.getElementById('pcf-photo-preview').classList.add('hidden');
    document.getElementById('pcf-photo-preview').src = '';
    document.getElementById('pcf-photo-placeholder').style.display = '';
    document.getElementById('pcf-btn-remove-photo').style.display = 'none';
    document.getElementById('pcf-photo-input').value = '';
}

function openPcfPhotoCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const overlay = document.createElement('div');
        overlay.id = 'camera-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px;align-items:center"><button id="camera-switch" style="padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center" title="Trocar camera"><i class="fa-solid fa-camera-rotate"></i></button><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#f57c00;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
        document.body.appendChild(overlay);
        const video = document.getElementById('camera-video');
        let stream = null;
        let currentFacing = 'user';

        function startCamera(facing) {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 800 }, height: { ideal: 600 } } });
        }

        startCamera(currentFacing)
        .then(function(s) { stream = s; video.srcObject = stream; })
        .catch(function(err) { document.body.removeChild(overlay); alert('Nao foi possivel acessar a camera: ' + err.message); });

        document.getElementById('camera-switch').onclick = function() {
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            startCamera(currentFacing)
            .then(function(s) { stream = s; video.srcObject = stream; })
            .catch(function(err) { currentFacing = currentFacing === 'user' ? 'environment' : 'user'; alert('Nao foi possivel trocar a camera: ' + err.message); });
        };

        document.getElementById('camera-capture').onclick = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 400;
            canvas.getContext('2d').drawImage(video, 0, 0, 300, 400);
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
            canvas.toBlob(function(blob) {
                const pcfCamReader = new FileReader();
                pcfCamReader.onloadend = function() {
                    preCadastroFormadoPhotoDataUrl = pcfCamReader.result;
                    document.getElementById('pcf-photo-preview').src = pcfCamReader.result;
                    document.getElementById('pcf-photo-preview').classList.remove('hidden');
                    document.getElementById('pcf-photo-placeholder').style.display = 'none';
                    document.getElementById('pcf-btn-remove-photo').style.display = '';
                };
                pcfCamReader.readAsDataURL(blob);
            }, 'image/jpeg', 0.5);
        };

        document.getElementById('camera-cancel').onclick = function() {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            document.body.removeChild(overlay);
        };
    } else {
        document.getElementById('pcf-photo-input').click();
    }
}

function resetFormPreCadastroFormado() {
    document.getElementById('form-pre-cadastro-formado').reset();
    removePreCadastroFormadoPhoto();
    document.querySelectorAll('.pcf-curso-check').forEach(cb => cb.checked = false);
    pcfCursosData = {};
    renderPcfCursosDetalhes();
}

async function handlePreCadastroFormadoSubmit(event) {
    event.preventDefault();
    const cpf = document.getElementById('pcf-cpf').value.replace(/\D/g, '');
    const cursos = [];
    document.querySelectorAll('.pcf-curso-check:checked').forEach(cb => cursos.push(cb.value));
    if (!cursos.length) { alert('Selecione pelo menos um curso.'); return false; }

    const cursosDetalhes = cursos.map(function(curso) {
        const d = pcfCursosData[curso] || {};
        return {
            nome: curso,
            dataFormacao: d.dataFormacao ? new Date(d.dataFormacao + 'T12:00:00').toLocaleDateString('pt-BR') : '',
            dataFormacaoRaw: d.dataFormacao || '',
            certFrente: d.certFrente || null,
            certVerso: d.certVerso || null
        };
    });

    const primeiroCurso = cursosDetalhes[0] || {};

    const data = {
        nome: document.getElementById('pcf-nome').value,
        cpf: cpf,
        nascimento: document.getElementById('pcf-nascimento').value,
        estadoCivil: document.getElementById('pcf-estado-civil').value,
        nacionalidade: document.getElementById('pcf-nacionalidade').value,
        naturalidade: document.getElementById('pcf-naturalidade').value,
        profissao: document.getElementById('pcf-profissao').value,
        mae: document.getElementById('pcf-mae').value,
        pai: document.getElementById('pcf-pai').value,
        email: document.getElementById('pcf-email').value,
        whatsapp: document.getElementById('pcf-whatsapp').value,
        endereco: document.getElementById('pcf-endereco').value,
        numero: document.getElementById('pcf-numero').value,
        bairro: document.getElementById('pcf-bairro').value,
        cidade: document.getElementById('pcf-cidade').value,
        estado: document.getElementById('pcf-estado').value,
        altura: document.getElementById('pcf-altura').value,
        peso: document.getElementById('pcf-peso').value,
        fatorRh: document.getElementById('pcf-fator-rh').value,
        turma: document.getElementById('pcf-turma').value,
        cursos: cursos,
        cursosDetalhes: cursosDetalhes,
        dataFormacao: primeiroCurso.dataFormacao || '',
        dataFormacaoRaw: primeiroCurso.dataFormacaoRaw || '',
        matricula: generateMatricula(cpf, primeiroCurso.dataFormacaoRaw || ''),
        senha: document.getElementById('pcf-senha').value,
        status: 'Pendente',
        cadastradoPor: currentUserData ? currentUserData.nome : 'Desconhecido',
        dataCadastro: new Date().toLocaleDateString('pt-BR')
    };

    if (preCadastroFormadoPhotoDataUrl) {
        data.photoDataUrl = preCadastroFormadoPhotoDataUrl;
    }

    try {
        await dbFirestore.collection(FB_FORMADOS).doc(cpf).set(data);
        resetFormPreCadastroFormado();
        showAdminSection('admin-pre-cadastro-formados');
        renderPreCadastroFormadosList();
    } catch(e) {
        alert('Erro ao salvar pre-cadastro: ' + e.message);
    }
    return false;
}

async function aprovarPreCadastroFormado(docId) {
    try {
        await dbFirestore.collection(FB_FORMADOS).doc(docId).set({ status: 'Ativo' }, { merge: true });
        renderPreCadastroFormadosList();
        renderFormadosList();
    } catch(e) {
        alert('Erro ao aprovar: ' + e.message);
    }
}

async function excluirPreCadastroFormado(docId) {
    if (!confirm('Deseja excluir este pre-cadastro?')) return;
    try {
        await dbFirestore.collection(FB_FORMADOS).doc(docId).delete();
        renderPreCadastroFormadosList();
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

// ===== PWA INSTALL =====

var deferredPrompt = null;
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
var isAndroid = /Android/.test(navigator.userAgent);
var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
});

function installApp() {
    if (isStandalone) {
        alert('O aplicativo ja esta instalado no seu dispositivo.');
        return;
    }

    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choice) {
            deferredPrompt = null;
        });
        return;
    }

    if (isIOS) {
        showIOSInstallGuide();
        return;
    }

    showInstallGuide();
}

function showIOSInstallGuide() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;max-width:380px;width:100%;padding:28px;color:#fff;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:16px"><i class="fa-solid fa-mobile-screen-button" style="color:#f57c00"></i></div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#fff">Instalar FARN no iPhone</h3>' +
        '<p style="color:#aaa;font-size:13px;margin:0 0 20px">Siga os passos abaixo para adicionar o aplicativo a tela inicial:</p>' +
        '<div style="text-align:left;background:#12121e;border-radius:10px;padding:16px;margin-bottom:20px">' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#f57c00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Toque no botao <strong style="color:#fff">Compartilhar</strong> <i class="fa-solid fa-arrow-up-from-bracket" style="color:#f57c00;font-size:12px"></i> na barra inferior do Safari</span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#f57c00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Role para baixo e selecione <strong style="color:#fff">Adicionar a Tela de Inicio</strong></span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span style="background:#f57c00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Toque em <strong style="color:#fff">Adicionar</strong> no canto superior direito</span></div></div>' +
        '<button onclick="this.closest(\'div[style]\').parentElement.remove()" style="background:#f57c00;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:600;cursor:pointer;width:100%">Entendi</button></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function showInstallGuide() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;max-width:380px;width:100%;padding:28px;color:#fff;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:16px"><i class="fa-solid fa-mobile-screen-button" style="color:#f57c00"></i></div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#fff">Instalar FARN</h3>' +
        '<p style="color:#aaa;font-size:13px;margin:0 0 20px">Adicione o aplicativo a tela inicial do seu dispositivo:</p>' +
        '<div style="text-align:left;background:#12121e;border-radius:10px;padding:16px;margin-bottom:20px">' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#f57c00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Toque no menu <strong style="color:#fff"> tres pontos </strong> <i class="fa-solid fa-ellipsis-vertical" style="color:#f57c00;font-size:12px"></i> no canto superior direito</span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#f57c00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Selecione <strong style="color:#fff">Instalar aplicativo</strong> ou <strong style="color:#fff">Adicionar a tela inicial</strong></span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span style="background:#f57c00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Confirme tocando em <strong style="color:#fff">Instalar</strong></span></div></div>' +
        '<button onclick="this.closest(\'div[style]\').parentElement.remove()" style="background:#f57c00;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:600;cursor:pointer;width:100%">Entendi</button></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
});
