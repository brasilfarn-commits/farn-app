const ADMIN_CPF = '05004959471';
const ADMIN_SENHA = '212121';
let selectedLoginRole = 'admin';
let editingIndex = null;
let candidatos = [];
let turmas = [];
let uploadedFiles = [];
let pendingDeleteIndex = null;
let currentAluno = null;
let usuarios = [];
let currentUserData = null;
let projetos = [];
let onlineCpfs = new Set();
let onlineHeartbeat = null;
let onlineUnsubscribe = null;

/* ===== FIREBASE SINCRONIZACAO (Firestore) ===== */

const FB_CANDIDATOS = 'candidatos';
const FB_TURMAS = 'turmas';
const FB_USUARIOS = 'usuarios';
const FB_PROJETOS = 'parceiros';
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

function getFoto(cpf) {
    var fromLocal = localStorage.getItem('farn_photo_' + cpf) || localStorage.getItem('foto3x4_' + cpf);
    if (fromLocal) return Promise.resolve(fromLocal);
    var c = candidatos.find(function(x) { return x.cpf === cpf; });
    if (c && c.photoDataUrl) return Promise.resolve(c.photoDataUrl);
    if (c && c.id) {
        return dbFirestore.collection('candidatos').doc(String(c.id)).get().then(function(doc) {
            if (doc.exists && doc.data().photoDataUrl) {
                c.photoDataUrl = doc.data().photoDataUrl;
                return doc.data().photoDataUrl;
            }
            return null;
        }).catch(function() { return null; });
    }
    return Promise.resolve(null);
}

function setFoto(cpf, dataUrl) {
    try { localStorage.setItem('farn_photo_' + cpf, dataUrl); } catch(e) {}
    try { localStorage.setItem('foto3x4_' + cpf, dataUrl); } catch(e) {}
    var c = candidatos.find(function(x) { return x.cpf === cpf; });
    if (c) { c.photoDataUrl = dataUrl; c.hasPhoto = true; }
    if (currentAluno && currentAluno.cpf === cpf) { currentAluno.photoDataUrl = dataUrl; currentAluno.hasPhoto = true; }
    var docId = c && c.id ? String(c.id) : null;
    if (docId) {
        dbFirestore.collection('candidatos').doc(docId).set({ photoDataUrl: dataUrl, hasPhoto: true }, { merge: true }).catch(function() {});
    }
}

function backupCandidatos() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_CANDIDATOS);
    batch.set(ref.doc('_index'), { count: candidatos.length, timestamp: Date.now() });
    candidatos.forEach((c, i) => {
        const id = c.id ? String(c.id) : String(i);
        batch.set(ref.doc(id), candidatoToDoc(c), { merge: true });
    });
    batch.commit().catch(e => console.error('Erro ao salvar candidatos:', e));
}

async function backupTurmas() {
    if (!firebaseReady && !firebaseError) return;
    try {
        const ref = dbFirestore.collection(FB_TURMAS);
        const snap = await ref.get();
        const existingIds = new Set();
        snap.forEach(doc => {
            if (doc.id !== '_index') existingIds.add(doc.id);
        });
        const currentIds = new Set();
        const batch = dbFirestore.batch();
        batch.set(ref.doc('_index'), { count: turmas.length, timestamp: Date.now() });
        turmas.forEach((t) => {
            let id = t.id ? String(t.id) : null;
            if (!id) {
                id = String(Date.now()) + '_' + String(Math.random()).slice(2, 8);
                t.id = parseInt(id) || id;
            }
            currentIds.add(id);
            batch.set(ref.doc(id), t);
        });
        existingIds.forEach(docId => {
            if (!currentIds.has(docId)) {
                batch.delete(ref.doc(docId));
            }
        });
        await batch.commit();
    } catch(e) { console.error('Erro ao salvar turmas:', e); }
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

function backupProjetos() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_PROJETOS);
    batch.set(ref.doc('_index'), { count: projetos.length, timestamp: Date.now() });
    projetos.forEach((p, i) => {
        const id = p.docId ? String(p.docId) : String(i);
        const copy = Object.assign({}, p);
        delete copy.docId;
        batch.set(ref.doc(id), copy);
    });
    batch.commit().catch(e => console.error('Erro ao salvar projetos:', e));
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
        backupProjetos();
        await dbFirestore.collection(FB_CANDIDATOS).get();
        await dbFirestore.collection(FB_TURMAS).get();
        await dbFirestore.collection(FB_USUARIOS).get();
        await dbFirestore.collection(FB_PROJETOS).get();
        renderList();
        populateTurmaSelect();
        populateProjetoSelect();
        const fcProjeto = document.getElementById('fc-projeto');
        if (fcProjeto && fcProjeto.value) {
            fcProjetoOnTurmaChange();
        }
        if (typeof renderUsuariosList === 'function') renderUsuariosList();
        if (typeof renderProjetosList === 'function') renderProjetosList();
        if (typeof alunosInicializar === 'function') alunosInicializar();
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
        const totalListeners = 5;
        const checkReady = () => {
            loaded++;
            if (loaded >= totalListeners) {
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
                    if (data.cpf) data.cpf = data.cpf.replace(/\D/g, '');
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
                populateTurmaSelect();
                populateProjetoSelect();
                const fcProjeto = document.getElementById('fc-projeto');
                if (fcProjeto && fcProjeto.value) {
                    fcProjetoOnTurmaChange();
                }
                if (typeof alunosOnSelecaoProjetoChange === 'function') {
                    const alSelProj = document.getElementById('alunos-selecao-projeto');
                    if (alSelProj && alSelProj.value) alunosOnSelecaoProjetoChange();
                }
                if (typeof preOnSelecaoProjetoChange === 'function') {
                    const preSelProj = document.getElementById('pre-selecao-projeto');
                    if (preSelProj && preSelProj.value) preOnSelecaoProjetoChange();
                }
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

        dbFirestore.collection(FB_PROJETOS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.docId = doc.id;
                    result.push(data);
                }
            });
            projetos = result;
            if (firebaseReady) {
                if (typeof renderProjetosList === 'function') renderProjetosList();
                populateProjetoSelect();
                populateTurmaSelect();
                const fcProjeto = document.getElementById('fc-projeto');
                if (fcProjeto && fcProjeto.value) {
                    fcProjetoOnTurmaChange();
                }
                if (typeof alunosInicializar === 'function') alunosInicializar();
                if (typeof preInicializar === 'function') preInicializar();
            }
            checkReady();
        }, (error) => {
            console.error('Erro Firestore projetos:', error);
            checkReady();
        });

        dbFirestore.collection('instrutores').onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.id = doc.id;
                    result.push(data);
                }
            });
            instrutores = result;
            if (firebaseReady && typeof instrutorListar === 'function') instrutorListar();
            checkReady();
        }, (error) => {
            console.error('Erro Firestore instrutores:', error);
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
    backupProjetos();
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
        populateProjetoSelect();
        renderList();
        if (restoreFormState()) {
            showAdminSection('admin-form-candidato', document.querySelector('.nav-item:nth-child(2)'));
            await populateTurmaSelect();
            populateProjetoSelect();
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
        // Carregar credenciais salvas (Lembrar-me)
        const creds = loadCredentials();
        if (creds.cpf) {
            const cpfInput = document.getElementById('cpf');
            if (cpfInput) {
                let v = creds.cpf;
                if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                cpfInput.value = v;
            }
            const pwdInput = document.getElementById('password');
            if (pwdInput && creds.pwd) {
                pwdInput.value = creds.pwd;
                document.getElementById('remember-me').checked = true;
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
    const qr = document.getElementById('fc-matricula-qr');
    if (!wrapper || !display) return;
    const mat = generateMatricula(cpfFormatted);
    if (mat) {
        display.textContent = mat;
        wrapper.style.display = '';
        if (qr) {
            qr.src = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(mat) + '&size=100x100&margin=2';
            qr.style.display = 'block';
        }
    } else {
        wrapper.style.display = 'none';
        display.textContent = '';
        if (qr) qr.style.display = 'none';
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
            if (document.getElementById('remember-me').checked) saveCredentials(cpf, password);
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
        if (document.getElementById('remember-me').checked) saveCredentials(cpf, password);
        enterAdminPanel();
        saveLoginState();
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
    populateProjetoSelect();
    renderList();
    if (typeof chatPortaisStartNotifListener === 'function') chatPortaisStartNotifListener();
}

function applyUserPermissions() {
    if (!currentUserData) return;
    const p = currentUserData.permissoes || [];
    const isGeral = currentUserData.cpf === ADMIN_CPF;
    const navItems = {
        'admin-home': true,
        'admin-pre-inscricao': p.includes('pre-inscricao') || isGeral,
        'admin-alunos': p.includes('alunos') || isGeral,
        'admin-instrutores': p.includes('instrutores') || isGeral,
        'admin-relatorios': p.includes('relatorios') || isGeral,
        'admin-projetos': p.includes('projetos') || isGeral,
        'admin-form-projeto': p.includes('projetos') || isGeral,
        'admin-config': p.includes('config') || isGeral,
        'admin-usuarios': p.includes('usuarios') || isGeral,
        'admin-form-usuario': p.includes('usuarios') || isGeral,
        'admin-recadastramento': p.includes('admin') || isGeral,
        'admin-recad-detalhe': p.includes('admin') || isGeral,
        'admin-chat-portais': p.includes('admin') || isGeral,
        'admin-apostilas': p.includes('admin') || isGeral,
        'admin-disciplinas': p.includes('admin') || isGeral,
        'admin-apontamento': p.includes('admin') || isGeral
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
    if (typeof chatPortaisNotifUnsub !== 'undefined' && chatPortaisNotifUnsub) { chatPortaisNotifUnsub(); chatPortaisNotifUnsub = null; }
    if (typeof chatPortaisUnsub !== 'undefined' && chatPortaisUnsub) { chatPortaisUnsub(); chatPortaisUnsub = null; }
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

function compressPhoto(dataUrl, maxW, maxH, quality) {
    return new Promise(function(resolve) {
        var imgEl = new Image();
        imgEl.onload = function() {
            var w = imgEl.width, h = imgEl.height;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(imgEl, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        imgEl.onerror = function() { resolve(dataUrl); };
        imgEl.src = dataUrl;
    });
}

var adminFoto3x4Stream = null;

function fcAdminFoto3x4Load(c) {
    var img = document.getElementById('fc-admin-foto3x4-img');
    var video = document.getElementById('fc-admin-foto3x4-video');
    var placeholder = document.getElementById('fc-admin-foto3x4-placeholder');
    var btnSave = document.getElementById('fc-admin-btn-salvar');
    function applyPhoto(photo) {
        if (photo) {
            img.src = photo;
            img.style.display = 'block';
            video.style.display = 'none';
            placeholder.style.display = 'none';
            if (btnSave) btnSave.style.display = '';
            document.getElementById('fc-admin-btn-nova').style.display = '';
            document.getElementById('fc-admin-btn-apagar').style.display = '';
            document.getElementById('fc-admin-btn-camera').style.display = 'none';
            document.getElementById('fc-admin-btn-capturar').style.display = 'none';
            setTimeout(function() { fcAdminFoto3x4SalvarDevice(); }, 500);
        } else {
            img.style.display = 'none';
            video.style.display = 'none';
            placeholder.style.display = 'flex';
            if (btnSave) btnSave.style.display = 'none';
            document.getElementById('fc-admin-btn-nova').style.display = 'none';
            document.getElementById('fc-admin-btn-apagar').style.display = 'none';
            document.getElementById('fc-admin-btn-camera').style.display = '';
            document.getElementById('fc-admin-btn-capturar').style.display = 'none';
        }
    }
    getFoto(c.cpf).then(applyPhoto);
    document.getElementById('fc-admin-foto3x4-msg').style.display = 'none';
}

function fcAdminFoto3x4Reset() {
    if (adminFoto3x4Stream) {
        adminFoto3x4Stream.getTracks().forEach(function(t) { t.stop(); });
        adminFoto3x4Stream = null;
    }
    var video = document.getElementById('fc-admin-foto3x4-video');
    if (video) { video.srcObject = null; video.style.display = 'none'; }
    var img = document.getElementById('fc-admin-foto3x4-img');
    if (img) { img.style.display = 'none'; img.src = ''; }
    var ph = document.getElementById('fc-admin-foto3x4-placeholder');
    if (ph) ph.style.display = 'flex';
    var msg = document.getElementById('fc-admin-foto3x4-msg');
    if (msg) msg.style.display = 'none';
    var btnSave = document.getElementById('fc-admin-btn-salvar');
    if (btnSave) btnSave.style.display = 'none';
}

function fcAdminFoto3x4Iniciar() {
    var video = document.getElementById('fc-admin-foto3x4-video');
    var placeholder = document.getElementById('fc-admin-foto3x4-placeholder');
    var img = document.getElementById('fc-admin-foto3x4-img');
    img.style.display = 'none';
    placeholder.style.display = 'none';
    video.style.display = 'block';
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
        .then(function(stream) {
            adminFoto3x4Stream = stream;
            video.srcObject = stream;
            document.getElementById('fc-admin-btn-camera').style.display = 'none';
            document.getElementById('fc-admin-btn-capturar').style.display = '';
            document.getElementById('fc-admin-btn-nova').style.display = 'none';
            document.getElementById('fc-admin-btn-apagar').style.display = 'none';
        }).catch(function(err) {
            fcAdminFoto3x4Msg('Erro ao acessar camera: ' + err.message, 'error');
        });
    } else {
        fcAdminFoto3x4Msg('Camera nao disponivel.', 'error');
    }
}

function fcAdminFoto3x4Capturar() {
    var video = document.getElementById('fc-admin-foto3x4-video');
    var canvas = document.getElementById('fc-admin-foto3x4-canvas');
    var img = document.getElementById('fc-admin-foto3x4-img');
    var placeholder = document.getElementById('fc-admin-foto3x4-placeholder');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    var dataUrl = canvas.toDataURL('image/png');
    img.src = dataUrl;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    if (adminFoto3x4Stream) { adminFoto3x4Stream.getTracks().forEach(function(t) { t.stop(); }); adminFoto3x4Stream = null; }
    video.srcObject = null;
    video.style.display = 'none';
    document.getElementById('fc-admin-btn-capturar').style.display = 'none';
    document.getElementById('fc-admin-btn-nova').style.display = '';
    document.getElementById('fc-admin-btn-apagar').style.display = '';
    document.getElementById('fc-admin-btn-salvar').style.display = '';
    fcAdminFoto3x4Save(dataUrl);
}

function fcAdminFoto3x4Importar(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var imgEl = document.getElementById('fc-admin-foto3x4-img');
        var placeholder = document.getElementById('fc-admin-foto3x4-placeholder');
        imgEl.src = e.target.result;
        imgEl.style.display = 'block';
        placeholder.style.display = 'none';
        document.getElementById('fc-admin-btn-nova').style.display = '';
        document.getElementById('fc-admin-btn-apagar').style.display = '';
        document.getElementById('fc-admin-btn-salvar').style.display = '';
        document.getElementById('fc-admin-btn-camera').style.display = 'none';
        fcAdminFoto3x4Save(e.target.result);
    };
    reader.readAsDataURL(file);
}

function fcAdminFoto3x4Nova() {
    fcAdminFoto3x4Reset();
    document.getElementById('fc-admin-btn-camera').style.display = '';
    document.getElementById('fc-admin-btn-capturar').style.display = 'none';
    document.getElementById('fc-admin-btn-salvar').style.display = 'none';
}

function fcAdminFoto3x4Apagar() {
    var img = document.getElementById('fc-admin-foto3x4-img');
    var placeholder = document.getElementById('fc-admin-foto3x4-placeholder');
    img.style.display = 'none';
    img.src = '';
    placeholder.style.display = 'flex';
    document.getElementById('fc-admin-btn-nova').style.display = 'none';
    document.getElementById('fc-admin-btn-apagar').style.display = 'none';
    document.getElementById('fc-admin-btn-salvar').style.display = 'none';
    document.getElementById('fc-admin-btn-camera').style.display = '';
    if (editingIndex !== null && candidatos[editingIndex]) {
        var cpf = candidatos[editingIndex].cpf;
        try { localStorage.removeItem('farn_photo_' + cpf); } catch(e) {}
        try { localStorage.removeItem('foto3x4_' + cpf); } catch(e) {}
        candidatos[editingIndex].photoDataUrl = null;
        candidatos[editingIndex].hasPhoto = false;
        backupCandidatos();
        var docId = candidatos[editingIndex].id ? String(candidatos[editingIndex].id) : null;
        if (docId) {
            dbFirestore.collection('candidatos').doc(docId).set({ photoDataUrl: null, hasPhoto: false }, { merge: true }).catch(function() {});
        }
    }
}

function fcAdminFoto3x4Save(dataUrl) {
    if (editingIndex === null || !candidatos[editingIndex]) return;
    setFoto(candidatos[editingIndex].cpf, dataUrl);
    backupCandidatos();
    fcAdminFoto3x4Msg('Foto salva no cadastro!', 'success');
}

function fcAdminFoto3x4Msg(text, type) {
    var el = document.getElementById('fc-admin-foto3x4-msg');
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
    el.style.color = type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#ff9800';
    el.style.background = type === 'success' ? 'rgba(76,175,80,0.1)' : type === 'error' ? 'rgba(244,67,54,0.1)' : 'rgba(255,152,0,0.1)';
    if (text) setTimeout(function() { el.style.display = 'none'; }, 3000);
}

function fcAdminFoto3x4SalvarDevice() {
    var img = document.getElementById('fc-admin-foto3x4-img');
    if (!img || !img.src || img.style.display === 'none') return;
    var link = document.createElement('a');
    var nome = editingIndex !== null && candidatos[editingIndex] ? (candidatos[editingIndex].nome || 'foto') : 'foto';
    link.download = 'foto3x4_' + nome.replace(/\s+/g, '_') + '.png';
    link.href = img.src;
    link.click();
    fcAdminFoto3x4Msg('Foto salva no dispositivo!', 'success');
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

function showDownloadModal() {
    document.getElementById('modal-download-overlay').classList.remove('hidden');
}

function closeDownloadModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-download-overlay').classList.add('hidden');
}

/* ===== NAVIGACAO ADMIN ===== */

function showAdminSection(sectionId, navEl) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    document.querySelectorAll('#screen-admin .admin-section').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('#screen-admin .nav-item').forEach(n => n.classList.remove('active'));
    if (navEl) navEl.classList.add('active');
    const titles = { 'admin-home': 'Inicio', 'admin-pre-inscricao': 'Pre-Inscricao', 'admin-form-candidato': editingIndex !== null ? 'Editar Pre-Cadastro' : 'Novo Pre-Cadastro', 'admin-alunos': 'Alunos', 'admin-instrutores': 'Instrutores', 'admin-relatorios': 'Relatorios', 'admin-projetos': 'Projetos', 'admin-form-projeto': editingProjetoIndex !== null ? 'Editar Projeto' : 'Novo Projeto', 'admin-config': 'Configuracoes', 'admin-usuarios': 'Usuarios', 'admin-form-usuario': 'Novo Usuario', 'admin-recadastramento': 'Campanha de Recadastramento', 'admin-recad-detalhe': 'Detalhe do Recadastramento', 'admin-chat-portais': 'Chat dos Portais', 'admin-apostilas': 'Apostilas dos Alunos', 'admin-disciplinas': 'Disciplinas e Aulas' };
    document.getElementById('admin-page-title').textContent = titles[sectionId] || 'Admin';
}

/* ===== FORM CANDIDATO ===== */

const formFields = ['fc-projeto','fc-turma','fc-nome','fc-cpf','fc-nascimento','fc-estado-civil','fc-nacionalidade','fc-naturalidade','fc-titulo','fc-profissao','fc-mae','fc-pai','fc-email','fc-whatsapp','fc-endereco','fc-numero','fc-bairro','fc-cidade','fc-estado','fc-local-votacao','fc-altura','fc-peso','fc-fator-rh','fc-hipertensao','fc-diabetes','fc-deficiencia','fc-tatuagem','fc-cirurgia','fc-alcool','fc-medicamento','fc-cansaco','fc-calca','fc-camisa','fc-calcado','fc-senha'];

async function openFormCandidato() {
    editingIndex = null;
    resetFormCandidato();
    await populateTurmaSelect();
    populateProjetoSelect();
    const btnAtualizar = document.getElementById('btn-atualizar-cadastro');
    if (btnAtualizar) btnAtualizar.style.display = 'none';
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#16a34a;margin-right:8px"></i> Novo Pre-Cadastro';
    showAdminSection('admin-form-candidato');
}

async function editCandidato(index) {
    const c = candidatos[index]; if (!c) return;
    editingIndex = index;
    await populateTurmaSelect();
    populateProjetoSelect();
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
    // Setar projeto e turma
    document.getElementById('fc-projeto').value = c.projeto || '';
    fcProjetoOnTurmaChange();
    document.getElementById('fc-turma').value = c.turma || '';
    const tipoPessoa = c.tipoPessoa || 'A';
    const tipoRadio = document.querySelector('input[name="fc-tipo-pessoa"][value="' + tipoPessoa + '"]');
    if (tipoRadio) tipoRadio.checked = true;
    // Atualizar matricula e QR code
    const mat = c.matricula || generateMatricula(c.cpf);
    const wrapper = document.getElementById('fc-matricula-wrapper');
    const display = document.getElementById('fc-matricula-display');
    const qr = document.getElementById('fc-matricula-qr');
    if (wrapper && display) {
        display.textContent = mat;
        wrapper.style.display = '';
        if (qr) {
            qr.src = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(mat) + '&size=100x100&margin=2';
            qr.style.display = 'block';
        }
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
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:#16a34a;margin-right:8px"></i> Editar - ' + c.nome;
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
    const mq = document.getElementById('fc-matricula-qr');
    if (mw) mw.style.display = 'none';
    if (md) md.textContent = '';
    if (mq) { mq.src = ''; mq.style.display = 'none'; }
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
    const tipoRadio = document.querySelector('input[name="fc-tipo-pessoa"]:checked');
    data.tipoPessoa = tipoRadio ? tipoRadio.value : 'A';
    data.matricula = generateMatricula(data.cpf);
    data.status = editingIndex !== null ? candidatos[editingIndex].status : 'Pendente';
    data.dataCadastro = editingIndex !== null ? candidatos[editingIndex].dataCadastro : new Date().toLocaleDateString('pt-BR');
    data.dataHoraCadastro = editingIndex !== null ? candidatos[editingIndex].dataHoraCadastro : new Date().toLocaleString('pt-BR');
    if (editingIndex !== null && candidatos[editingIndex].atualizarCadastro) {
        data.atualizarCadastro = true;
    }

    if (editingIndex !== null) {
        data.id = candidatos[editingIndex].id;
        data.photoDataUrl = candidatos[editingIndex].photoDataUrl || null;
        data.hasPhoto = candidatos[editingIndex].hasPhoto || false;
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

/* ===== PRE-INSCRICAO - FILTRO POR PROJETO/TURMA ===== */

function preInicializar() {
    const selProj = document.getElementById('pre-selecao-projeto');
    if (!selProj) return;
    selProj.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.forEach(p => {
        selProj.innerHTML += '<option value="' + p.nome + '">' + p.nome + (p.responsavel ? ' - ' + p.responsavel : '') + '</option>';
    });
    const conteudo = document.getElementById('pre-conteudo');
    if (conteudo) conteudo.style.display = 'none';
}

function preOnSelecaoProjetoChange() {
    const projetoNome = document.getElementById('pre-selecao-projeto').value;
    const selTurma = document.getElementById('pre-selecao-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    if (projetoNome) {
        const turmasDoProjeto = turmas.filter(t => t.projeto === projetoNome);
        turmasDoProjeto.forEach(t => {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
    preOnSelecaoChange();
}

function preOnSelecaoChange() {
    const projeto = document.getElementById('pre-selecao-projeto').value;
    const turma = document.getElementById('pre-selecao-turma').value;
    const conteudo = document.getElementById('pre-conteudo');
    if (projeto && turma) {
        conteudo.style.display = '';
        renderList();
    } else {
        conteudo.style.display = 'none';
    }
}

/* ===== LISTA ===== */

function renderList() {
    const tbody = document.getElementById('pre-table-body');
    const badge = document.getElementById('pre-count-badge');
    if (!tbody) return;
    const turmaFiltro = document.getElementById('pre-selecao-turma') ? document.getElementById('pre-selecao-turma').value : '';
    const filtrados = candidatos.filter(c => !turmaFiltro || c.turma === turmaFiltro);
    const p = filtrados.filter(c => c.status === 'Pendente').length;
    if (badge) badge.textContent = p + ' pendente' + (p !== 1 ? 's' : '');
    if (!filtrados.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:24px">Nenhum candidato nesta turma</td></tr>'; return; }
    tbody.innerHTML = filtrados.map((c) => {
        const i = candidatos.indexOf(c);
        const sc = c.status === 'Aprovado' ? 'green' : c.status === 'Rejeitado' ? 'rejeitado' : 'pendente';
        const nomeStyle = c.atualizarCadastro ? 'color:#a5d6a7;font-weight:700' : '';
        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td>${c.nascimento || '-'}</td>
            <td>${c.turma || '-'}${c.turma ? '<br><small style="color:#888;font-size:7px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</td>
            <td style="color:#ff9800;font-weight:600">${c.projeto || '-'}</td>
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
    getFoto(c.cpf).then(function(photoSrc) {
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
            ${mat ? `<div class="detail-item full"><span class="detail-label">Matricula</span><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><span class="detail-value" style="color:#16a34a;font-size:20px;font-weight:800;letter-spacing:2px;font-family:'Courier New',monospace">${mat}</span><img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(mat)}&size=100x100&margin=2" alt="QR Code Matricula" style="width:80px;height:80px;border:1px solid #eee;border-radius:8px;padding:4px;background:#fff"></div></div>` : ''}
            <div class="detail-item"><span class="detail-label">Turma</span><span class="detail-value">${c.turma||'---'}${c.turma ? '<br><small style="color:#888;font-size:7px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</span></div>
            <div class="detail-item"><span class="detail-label">Projeto</span><span class="detail-value" style="color:#ff9800;font-weight:600">${c.projeto||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Tipo</span><span class="detail-value" style="color:${(c.tipoPessoa||'A')==='F'?'#ff9800':'#2196f3'};font-weight:700">${(c.tipoPessoa||'A')==='F'?'Formado (A)':'Academico (A)'}</span></div>
            <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${c.status}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastro</span><span class="detail-value">${c.dataCadastro}</span></div>
            <div class="detail-item full"><span class="detail-label">Data/Hora 1o Cadastro</span><span class="detail-value" style="color:#4caf50;font-weight:600">${c.dataHoraCadastro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastrado por</span><span class="detail-value" style="color:#16a34a;font-weight:600">${c.cadastradoPor || '---'}</span></div>
            ${c.status === 'Aprovado' && c.senha ? `<div class="detail-item"><span class="detail-label">Senha de Acesso</span><span class="detail-value" style="color:#4caf50;font-weight:700">${c.senha}</span></div>` : ''}
        </div>`;
    });
    openModal();
}

function deleteCandidato(i) {
    pendingDeleteIndex = i;
    document.getElementById('confirm-text').innerHTML = `Tem certeza que deseja excluir o candidato <strong>${candidatos[i].nome}</strong>?`;
    document.getElementById('modal-confirm-overlay').classList.remove('hidden');
}

async function confirmDelete() {
    if (pendingDeleteIndex !== null) {
        var idx = pendingDeleteIndex;
        var removed = candidatos[idx];
        candidatos.splice(idx, 1);
        if (removed && removed.id) {
            var docId = String(removed.id);
            try {
                await dbFirestore.collection(FB_CANDIDATOS).doc(docId).delete();
            } catch(e) {
                alert('Erro Firestore: ' + e.message);
            }
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
    getFoto(c.cpf).then(function(photoSrc) {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - ${c.nome}</title><style>
        body{font-family:Arial,sans-serif;padding:40px;color:#222}h1{color:#1a237e;font-size:20px}h2{font-size:16px;margin:20px 0 10px;border-bottom:2px solid #1a237e;padding-bottom:6px}
        .row{display:flex;gap:20px;margin-bottom:8px}.col{flex:1}.label{font-size:11px;color:#666;text-transform:uppercase}.val{font-size:14px;margin-top:2px}
        .header-row{display:flex;align-items:flex-start;gap:24px;margin-bottom:16px}.photo-print{width:100px;height:130px;object-fit:cover;border:2px solid #1a237e;border-radius:6px;flex-shrink:0}
        @media print{body{padding:20px}}</style></head><body>
        <div class="header-row">
            ${photoSrc ? `<img src="${photoSrc}" class="photo-print" alt="Foto 3x4">` : ''}
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
        <div class="row"><div class="col"><div class="label">Turma</div><div class="val">${c.turma||'---'}${c.turma ? '<br><small style="color:#666;font-size:6px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</div></div><div class="col"><div class="label">Projeto</div><div class="val" style="color:#e65100;font-weight:700">${c.projeto||'---'}</div></div></div>
        ${c.status === 'Aprovado' && c.senha ? `<div class="row"><div class="col"><div class="label">Senha de Acesso</div><div class="val" style="color:#2e7d32;font-weight:bold">${c.senha}</div></div></div>` : ''}
        ${c.dataHoraCadastro ? `<div class="row"><div class="col"><div class="label">Data/Hora 1o Cadastro</div><div class="val" style="color:#2e7d32;font-size:11px">${c.dataHoraCadastro}</div></div></div>` : ''}
        <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
    });
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
    const turmaFiltro = document.getElementById('pre-selecao-turma') ? document.getElementById('pre-selecao-turma').value : '';
    const filtrados = candidatos.filter(c => !turmaFiltro || c.turma === turmaFiltro);
    if (!filtrados.length) { alert('Nenhum candidato para exportar nesta turma.'); return; }
    let csv = 'Nome,CPF,Nascimento,Estado Civil,Nacionalidade,Naturalidade,Profissao,Mae,Pai,Titulo,Email,WhatsApp,Endereco,Numero,Bairro,Cidade,Estado,Altura,Peso,Fator RH,Hipertensao,Diabetes,Deficiencia,Tatuagem,Cirurgia,Alcool,Medicamento,Cansaco,Calca,Camisa,Calcado,Turma,Projeto,Status,Senha,Cadastro,Data/Hora 1o Cadastro\n';
    filtrados.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.nascimento||''}","${c.estadoCivil||''}","${c.nacionalidade||''}","${c.naturalidade||''}","${c.profissao||''}","${c.mae||''}","${c.pai||''}","${c.tituloEleitor||''}","${c.email||''}","${c.whatsapp||''}","${c.endereco||''}","${c.numero||''}","${c.bairro||''}","${c.cidade||''}","${c.estado||''}","${c.altura||''}","${c.peso||''}","${c.fatorRh||''}","${c.hipertensao||''}","${c.diabetes||''}","${c.deficiencia||''}","${c.tatuagem||''}","${c.cirurgia||''}","${c.alcool||''}","${c.medicamento||''}","${c.cansaco||''}","${c.calca||''}","${c.camisa||''}","${c.calcado||''}","${c.turma||''}","${c.projeto||''}","${c.status}","${c.senha||''}","${c.dataCadastro}","${c.dataHoraCadastro||''}"\n`;
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

function alunosInicializar() {
    const selProj = document.getElementById('alunos-selecao-projeto');
    if (!selProj) return;
    selProj.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').forEach(p => {
        selProj.innerHTML += '<option value="' + p.nome + '">' + p.nome + (p.responsavel ? ' - ' + p.responsavel : '') + '</option>';
    });
    const conteudo = document.getElementById('alunos-conteudo');
    if (conteudo) conteudo.style.display = 'none';
}

function alunosOnSelecaoProjetoChange() {
    const projetoNome = document.getElementById('alunos-selecao-projeto').value;
    const selTurma = document.getElementById('alunos-selecao-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    if (projetoNome) {
        const turmasDoProjeto = turmas.filter(t => t.projeto === projetoNome);
        turmasDoProjeto.forEach(t => {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
    alunosOnSelecaoChange();
}

function alunosOnSelecaoChange() {
    const projeto = document.getElementById('alunos-selecao-projeto').value;
    const turma = document.getElementById('alunos-selecao-turma').value;
    const conteudo = document.getElementById('alunos-conteudo');
    if (projeto && turma) {
        conteudo.style.display = '';
        renderAlunosList();
    } else {
        conteudo.style.display = 'none';
    }
}

function switchAlunosTab(tab, btn) {
    currentAlunosTab = tab;
    document.querySelectorAll('.alunos-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAlunosList();
}

function renderAlunosList() {
    const tbody = document.getElementById('alunos-table-body');
    const thead = document.querySelector('#admin-alunos .data-table thead tr');
    if (!tbody) return;

    const turmaFiltro = document.getElementById('alunos-selecao-turma') ? document.getElementById('alunos-selecao-turma').value : '';
    const statusFilter = STATUS_MAP[currentAlunosTab];
    const filtered = candidatos.filter(c => c.status === statusFilter && (!turmaFiltro || c.turma === turmaFiltro));
    const isAprovados = currentAlunosTab === 'aprovados';

    const allByTurma = candidatos.filter(c => !turmaFiltro || c.turma === turmaFiltro);
    document.getElementById('tab-count-aprovados').textContent = allByTurma.filter(c => c.status === 'Aprovado').length;
    document.getElementById('tab-count-pendentes').textContent = allByTurma.filter(c => c.status === 'Pendente').length;
    document.getElementById('tab-count-reprovados').textContent = allByTurma.filter(c => c.status === 'Rejeitado').length;
    document.getElementById('tab-count-segunda-chamada').textContent = allByTurma.filter(c => c.status === 'Segunda Chamada').length;

    if (thead) {
        if (isAprovados) {
            thead.innerHTML = '<th>Nome</th><th>Matricula</th><th>Projeto</th><th>Acoes</th>';
        } else {
            thead.innerHTML = '<th>Nome</th><th>CPF</th><th>Matricula</th><th>Turma</th><th>Projeto</th><th>Data Cadastro</th><th>Acoes</th>';
        }
    }

    if (!filtered.length) {
        const cols = isAprovados ? 4 : 7;
        tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:#888;padding:24px">Nenhum aluno na aba "${statusFilter}"</td></tr>`;
        return;
    }

    const idxMap = filtered.map(c => candidatos.indexOf(c));

    const allStatuses = [
        { value: 'Pendente', label: 'Pendente', icon: 'fa-clock', color: '#16a34a', tab: 'pendentes' },
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

        const actionsHtml = `<div class="actions-cell">
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
            </div>`;

        if (isAprovados) {
            return `<tr>
                <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${onlineDot}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
                <td style="color:#16a34a;font-weight:800;letter-spacing:1px;font-family:'Courier New',monospace;font-size:13px">${mat || '-'}</td>
                <td style="color:#ff9800;font-weight:600">${c.projeto || '-'}</td>
                <td>${actionsHtml}</td>
            </tr>`;
        }

        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${onlineDot}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td style="color:#16a34a;font-weight:800;letter-spacing:1px;font-family:'Courier New',monospace;font-size:13px">${mat || '-'}</td>
            <td>${c.turma || '-'}</td>
            <td style="color:#ff9800;font-weight:600">${c.projeto || '-'}</td>
            <td>${c.dataCadastro || '-'}${c.dataHoraCadastro ? '<br><small style="color:#4caf50;font-size:9px">' + c.dataHoraCadastro + '</small>' : ''}</td>
            <td>${actionsHtml}</td>
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
    const turmaFiltro = document.getElementById('alunos-selecao-turma') ? document.getElementById('alunos-selecao-turma').value : '';
    const statusFilter = STATUS_MAP[currentAlunosTab];
    const filtered = candidatos.filter(c => c.status === statusFilter && (!turmaFiltro || c.turma === turmaFiltro));
    if (!filtered.length) { alert('Nenhum aluno para exportar nesta aba.'); return; }
    let csv = 'Nome,CPF,Matricula,Nascimento,Turma,Projeto,Status,Data Cadastro,Data/Hora 1o Cadastro\n';
    filtered.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.matricula || generateMatricula(c.cpf) || ''}","${c.nascimento||''}","${c.turma||''}","${c.projeto||''}","${c.status}","${c.dataCadastro||''}","${c.dataHoraCadastro||''}"\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `alunos_${statusFilter.toLowerCase().replace(/\s/g,'_')}_farn.csv`; a.click();
}

function printTableAlunos() {
    const turmaFiltro = document.getElementById('alunos-selecao-turma') ? document.getElementById('alunos-selecao-turma').value : '';
    const statusFilter = STATUS_MAP[currentAlunosTab];
    const filtered = candidatos.filter(c => c.status === statusFilter && (!turmaFiltro || c.turma === turmaFiltro));
    if (!filtered.length) { alert('Nenhum aluno para imprimir nesta aba.'); return; }
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>FARN - Alunos - ${statusFilter}</title><style>
        body{font-family:Arial,sans-serif;padding:30px;color:#222}h1{color:#1a237e;font-size:18px;margin-bottom:4px}p.sub{color:#888;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse}th{background:#1a237e;color:#fff;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase}
        td{padding:8px 12px;border-bottom:1px solid #ddd;font-size:13px}tr:nth-child(even){background:#f5f5f5}
        @media print{body{padding:20px}}</style></head><body>
        <h1>FARN - Alunos (${statusFilter})</h1><p class="sub">Impressao: ${new Date().toLocaleDateString('pt-BR')}</p>
        <table><thead><tr><th>Nome</th><th>CPF</th><th>Matricula</th><th>Turma</th><th>Projeto</th><th>Data Cadastro</th><th>Data/Hora 1o Cadastro</th></tr></thead><tbody>
        ${filtered.map(c => `<tr><td>${c.nome}</td><td>${formatCPFDisplay(c.cpf)}</td><td style="color:#e65100;font-weight:800;font-family:'Courier New',monospace">${c.matricula || generateMatricula(c.cpf) || '-'}</td><td>${c.turma||'-'}</td><td style="color:#e65100;font-weight:600">${c.projeto||'-'}</td><td>${c.dataCadastro||'-'}</td><td style="color:#2e7d32;font-size:11px">${c.dataHoraCadastro||'-'}</td></tr>`).join('')}
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
                    <th>Projeto</th>
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
                        <td class="center" style="color:#ff9800;font-weight:600">${c.projeto || '---'}</td>
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
    { key: 'projeto', label: 'Projeto' },
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

/* ===== PROJETOS CRUD ===== */

let editingProjetoIndex = null;
let projetoTurmasTemp = [];

function formatCNPJ(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,3})/, '$1.$2');
    input.value = v;
}

function projetoRenderTurmas() {
    const lista = document.getElementById('pf-turmas-lista');
    const empty = document.getElementById('pf-turmas-empty');
    if (!lista) return;
    lista.querySelectorAll('.pf-turma-item').forEach(el => el.remove());
    if (!projetoTurmasTemp.length) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    projetoTurmasTemp.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'pf-turma-item';
        div.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid #222;transition:background 0.2s';
        div.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;gap:2px">' +
            '<span style="color:#fff;font-size:13px;font-weight:600"><i class="fa-solid fa-people-group" style="color:#4caf50;margin-right:8px"></i>' + t.nome + '</span>' +
            (t.descricao ? '<span style="color:#888;font-size:12px;margin-left:24px">' + t.descricao + '</span>' : '') +
            '</div>' +
            '<button type="button" class="btn-icon" title="Editar" onclick="projetoEditarTurma(' + i + ')"><i class="fa-solid fa-pen"></i></button>' +
            '<button type="button" class="btn-icon btn-danger-icon" title="Remover" onclick="projetoRemoverTurma(' + i + ')"><i class="fa-solid fa-trash"></i></button>';
        div.addEventListener('mouseenter', function() { this.style.background = '#1a1a2e'; });
        div.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
        lista.appendChild(div);
    });
}

function projetoAdicionarTurma() {
    const nomeEl = document.getElementById('pf-turma-nome');
    const descEl = document.getElementById('pf-turma-desc');
    const nome = nomeEl.value.trim();
    if (!nome) { nomeEl.focus(); nomeEl.style.borderColor = '#f44336'; setTimeout(function() { nomeEl.style.borderColor = ''; }, 2000); return; }
    var duplicada = projetoTurmasTemp.find(function(t) { return t.nome.toLowerCase() === nome.toLowerCase(); });
    if (duplicada) { alert('Ja existe uma turma com esse nome neste projeto.'); return; }
    projetoTurmasTemp.push({ nome: nome, descricao: descEl.value.trim() });
    nomeEl.value = '';
    descEl.value = '';
    nomeEl.focus();
    projetoRenderTurmas();
}

function projetoEditarTurma(i) {
    var t = projetoTurmasTemp[i];
    if (!t) return;
    document.getElementById('pf-turma-nome').value = t.nome;
    document.getElementById('pf-turma-desc').value = t.descricao || '';
    editingProjetoTurmaIdx = i;
    document.getElementById('pf-turma-btn-add').style.display = 'none';
    document.getElementById('pf-turma-btn-salvar').style.display = '';
    document.getElementById('pf-turma-btn-cancelar').style.display = '';
    document.getElementById('pf-turma-nome').focus();
}

function projetoSalvarTurma() {
    var nomeEl = document.getElementById('pf-turma-nome');
    var descEl = document.getElementById('pf-turma-desc');
    var nome = nomeEl.value.trim();
    if (!nome) { nomeEl.focus(); nomeEl.style.borderColor = '#f44336'; setTimeout(function() { nomeEl.style.borderColor = ''; }, 2000); return; }
    var duplicada = projetoTurmasTemp.find(function(t, idx) { return idx !== editingProjetoTurmaIdx && t.nome.toLowerCase() === nome.toLowerCase(); });
    if (duplicada) { alert('Ja existe outra turma com esse nome neste projeto.'); return; }
    projetoTurmasTemp[editingProjetoTurmaIdx].nome = nome;
    projetoTurmasTemp[editingProjetoTurmaIdx].descricao = descEl.value.trim();
    projetoCancelarEdicaoTurma();
    projetoRenderTurmas();
}

function projetoCancelarEdicaoTurma() {
    editingProjetoTurmaIdx = null;
    document.getElementById('pf-turma-nome').value = '';
    document.getElementById('pf-turma-desc').value = '';
    document.getElementById('pf-turma-btn-add').style.display = '';
    document.getElementById('pf-turma-btn-salvar').style.display = 'none';
    document.getElementById('pf-turma-btn-cancelar').style.display = 'none';
}

function projetoRemoverTurma(i) {
    if (!confirm('Remover a turma "' + projetoTurmasTemp[i].nome + '"?')) return;
    projetoTurmasTemp.splice(i, 1);
    if (editingProjetoTurmaIdx === i) projetoCancelarEdicaoTurma();
    projetoRenderTurmas();
}

function openFormProjeto() {
    editingProjetoIndex = null;
    projetoTurmasTemp = [];
    projetoCancelarEdicaoTurma();
    document.getElementById('pf-nome').value = '';
    document.getElementById('pf-cnpj').value = '';
    document.getElementById('pf-responsavel').value = '';
    projetoRenderTurmas();
    document.getElementById('projeto-form-title').innerHTML = '<i class="fa-solid fa-handshake" style="color:#ff9800;margin-right:8px"></i> Novo Projeto';
    showAdminSection('admin-form-projeto');
}

async function handleProjetoSubmit(event) {
    event.preventDefault();
    const nome = document.getElementById('pf-nome').value.trim();
    const cnpj = document.getElementById('pf-cnpj').value.trim();
    const responsavel = document.getElementById('pf-responsavel').value.trim();
    const statusProjeto = document.getElementById('pf-status').value;
    if (!nome) { alert('Nome do projeto e obrigatorio.'); return false; }
    const data = { nome, cnpj, responsavel, status: statusProjeto, turmas: projetoTurmasTemp.map(t => t.nome) };
    try {
        if (editingProjetoIndex !== null) {
            const old = projetos[editingProjetoIndex];
            data.docId = old.docId;
            data.dataCadastro = old.dataCadastro;
            projetos[editingProjetoIndex] = data;
            if (data.docId) {
                await dbFirestore.collection(FB_PROJETOS).doc(String(data.docId)).set(data, { merge: true });
            }
            turmas = turmas.filter(t => t.projeto !== old.nome);
            editingProjetoIndex = null;
        } else {
            data.dataCadastro = new Date().toLocaleDateString('pt-BR');
            const ref = await dbFirestore.collection(FB_PROJETOS).add(data);
            data.docId = ref.id;
            projetos.push(data);
        }
        for (const t of projetoTurmasTemp) {
            const existe = turmas.find(tx => tx.nome === t.nome && tx.projeto === nome);
            if (!existe) {
                const novaTurma = { id: t.nome + '_' + nome, nome: t.nome, descricao: t.descricao, projeto: nome };
                turmas.push(novaTurma);
            }
        }
        await backupTurmas();
        populateProjetoSelect();
        populateTurmaSelect();
        showAdminSection('admin-projetos');
        renderProjetosList();
    } catch (e) {
        console.error('Erro ao salvar projeto:', e);
        alert('Erro ao salvar projeto: ' + e.message);
    }
    return false;
}

function renderProjetosList() {
    const tbody = document.getElementById('projetos-list');
    const empty = document.getElementById('projetos-empty');
    if (!tbody) return;
    if (!projetos.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';
    let html = '<table class="data-table"><thead><tr><th>Nome</th><th>CNPJ</th><th>Responsavel</th><th>Status</th><th>Data Cadastro</th><th>Acoes</th></tr></thead><tbody>';
    projetos.forEach((p, i) => {
        const isConcluido = p.status === 'Concluido';
        const statusColor = isConcluido ? '#2196f3' : '#4caf50';
        const statusBg = isConcluido ? 'rgba(33,150,243,.15)' : 'rgba(76,175,80,.15)';
        const statusLabel = isConcluido ? 'Concluido' : 'Em Andamento';
        const nextStatus = isConcluido ? 'Em Andamento' : 'Concluido';
        html += `<tr>
            <td>${p.nome || '---'}</td>
            <td>${p.cnpj || '---'}</td>
            <td>${p.responsavel || '---'}</td>
            <td><span onclick="projetoToggleStatus(${i})" style="background:${statusBg};color:${statusColor};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${statusColor};transition:all .2s" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Clique para alterar para: ${nextStatus}">${statusLabel}</span></td>
            <td>${p.dataCadastro || '---'}</td>
            <td><div class="actions-cell">
                <button class="btn-icon" title="Editar" onclick="editProjeto(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteProjeto(${i})"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    });
    html += '</tbody></table>';
    tbody.innerHTML = html;
}

async function projetoToggleStatus(i) {
    const p = projetos[i]; if (!p) return;
    const novoStatus = p.status === 'Concluido' ? 'Em Andamento' : 'Concluido';
    const label = novoStatus === 'Concluido' ? 'Concluido (azul)' : 'Em Andamento (verde)';
    if (!confirm('Alterar status do projeto "' + p.nome + '" para ' + label + '?')) return;
    p.status = novoStatus;
    projetos[i] = p;
    if (p.docId) {
        try { await dbFirestore.collection(FB_PROJETOS).doc(String(p.docId)).update({ status: novoStatus }); } catch(e) { console.error(e); }
    }
    renderProjetosList();
}

function editProjeto(i) {
    const p = projetos[i]; if (!p) return;
    editingProjetoIndex = i;
    projetoCancelarEdicaoTurma();
    document.getElementById('pf-nome').value = p.nome || '';
    document.getElementById('pf-cnpj').value = p.cnpj || '';
    document.getElementById('pf-responsavel').value = p.responsavel || '';
    document.getElementById('pf-status').value = p.status || 'Em Andamento';
    projetoTurmasTemp = turmas.filter(t => t.projeto === p.nome).map(t => ({ nome: t.nome, descricao: t.descricao || '' }));
    projetoRenderTurmas();
    document.getElementById('projeto-form-title').innerHTML = '<i class="fa-solid fa-handshake" style="color:#ff9800;margin-right:8px"></i> Editar - ' + (p.nome || '');
    showAdminSection('admin-form-projeto');
}

async function deleteProjeto(i) {
    const p = projetos[i]; if (!p) return;
    if (!confirm('Tem certeza que deseja excluir o projeto "' + (p.nome || '') + '"? Isso tambem excluirá as turmas vinculadas."')) return;
    if (p.docId) {
        try { await dbFirestore.collection(FB_PROJETOS).doc(p.docId).delete(); } catch(e) { console.error(e); }
    }
    turmas = turmas.filter(t => t.projeto !== p.nome);
    await backupTurmas();
    projetos.splice(i, 1);
    backupProjetos();
    renderProjetosList();
    populateProjetoSelect();
    populateTurmaSelect();
}

/* ===== TURMAS CRUD ===== */

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
    turmas.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.nome;
        opt.textContent = t.nome + (t.projeto ? ' (' + t.projeto + ')' : '') + (t.descricao ? ' - ' + t.descricao : '');
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

function populateProjetoSelect() {
    const select = document.getElementById('fc-projeto');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nome;
        opt.textContent = p.nome + (p.responsavel ? ' - ' + p.responsavel : '');
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

function fcProjetoOnTurmaChange() {
    const projetoNome = document.getElementById('fc-projeto').value;
    const select = document.getElementById('fc-turma');
    const infoDiv = document.getElementById('fc-turma-info');
    const infoText = document.getElementById('fc-turma-info-text');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione a turma...</option>';
    if (projetoNome) {
        const turmasDoProjeto = turmas.filter(t => t.projeto === projetoNome);
        turmasDoProjeto.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.nome;
            opt.textContent = t.nome + (t.descricao ? ' - ' + t.descricao : '');
            select.appendChild(opt);
        });
        if (infoDiv && infoText) {
            infoDiv.style.display = 'block';
            infoText.textContent = turmasDoProjeto.length + ' turma(s) vinculada(s) ao projeto "' + projetoNome + '"';
        }
    } else {
        turmas.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.nome;
            opt.textContent = t.nome + (t.projeto ? ' (' + t.projeto + ')' : '') + (t.descricao ? ' - ' + t.descricao : '');
            select.appendChild(opt);
        });
        if (infoDiv) infoDiv.style.display = 'none';
    }
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
function closeConfirmModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById('modal-confirm-overlay').classList.add('hidden'); pendingDeleteIndex = null; }

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

function saveCredentials(cpf, password) {
    try {
        localStorage.setItem('farn_remember_cpf', cpf);
        localStorage.setItem('farn_remember_pwd', btoa(password));
        localStorage.setItem('farn_remember_me', 'true');
    } catch(e) {}
}

function loadCredentials() {
    try {
        if (localStorage.getItem('farn_remember_me') === 'true') {
            const cpf = localStorage.getItem('farn_remember_cpf') || '';
            const pwd = localStorage.getItem('farn_remember_pwd') || '';
            return { cpf, pwd: pwd ? atob(pwd) : '' };
        }
    } catch(e) {}
    return { cpf: '', pwd: '' };
}

function clearCredentials() {
    try {
        localStorage.removeItem('farn_remember_cpf');
        localStorage.removeItem('farn_remember_pwd');
        localStorage.removeItem('farn_remember_me');
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
    overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px;align-items:center"><button id="camera-switch" style="padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center" title="Trocar camera"><i class="fa-solid fa-camera-rotate"></i></button><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
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
    overlay.innerHTML = '<video id="camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px"><button id="camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
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
        return `<div class="file-item"><i class="fa-solid ${icon}" style="color:#16a34a"></i><span class="file-name">${f.file.name}</span><span class="file-size">${(f.file.size/1024).toFixed(1)}KB</span><button type="button" class="btn-icon btn-danger-icon" onclick="removeFile(${f.id})"><i class="fa-solid fa-trash"></i></button></div>`;
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
                'relatorios': '<span class="usuario-tag usuario-tag-admin">Relatorios</span>',
                'projetos': '<span class="usuario-tag usuario-tag-pre">Projetos</span>',
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
    document.getElementById('uf-perm-relatorios').checked = false;
    document.getElementById('uf-perm-projetos').checked = false;
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
            if (p.includes('relatorios')) document.getElementById('uf-perm-relatorios').checked = true;
            if (p.includes('projetos')) document.getElementById('uf-perm-projetos').checked = true;
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
    if (document.getElementById('uf-perm-relatorios').checked) permissoes.push('relatorios');
    if (document.getElementById('uf-perm-projetos').checked) permissoes.push('projetos');
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
        const idx = usuarios.findIndex(u => u.docId === docId);
        if (idx !== -1) usuarios.splice(idx, 1);
        renderUsuariosList();
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
        '<div style="font-size:48px;margin-bottom:16px"><i class="fa-solid fa-mobile-screen-button" style="color:#16a34a"></i></div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#fff">Instalar FARN no iPhone</h3>' +
        '<p style="color:#aaa;font-size:13px;margin:0 0 20px">Siga os passos abaixo para adicionar o aplicativo a tela inicial:</p>' +
        '<div style="text-align:left;background:#12121e;border-radius:10px;padding:16px;margin-bottom:20px">' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#16a34a;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Toque no botao <strong style="color:#fff">Compartilhar</strong> <i class="fa-solid fa-arrow-up-from-bracket" style="color:#16a34a;font-size:12px"></i> na barra inferior do Safari</span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#16a34a;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Role para baixo e selecione <strong style="color:#fff">Adicionar a Tela de Inicio</strong></span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span style="background:#16a34a;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Toque em <strong style="color:#fff">Adicionar</strong> no canto superior direito</span></div></div>' +
        '<button onclick="this.closest(\'div[style]\').parentElement.remove()" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:600;cursor:pointer;width:100%">Entendi</button></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function showInstallGuide() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;max-width:380px;width:100%;padding:28px;color:#fff;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:16px"><i class="fa-solid fa-mobile-screen-button" style="color:#16a34a"></i></div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#fff">Instalar FARN</h3>' +
        '<p style="color:#aaa;font-size:13px;margin:0 0 20px">Adicione o aplicativo a tela inicial do seu dispositivo:</p>' +
        '<div style="text-align:left;background:#12121e;border-radius:10px;padding:16px;margin-bottom:20px">' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#16a34a;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">1</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Toque no menu <strong style="color:#fff"> tres pontos </strong> <i class="fa-solid fa-ellipsis-vertical" style="color:#16a34a;font-size:12px"></i> no canto superior direito</span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">' +
        '<span style="background:#16a34a;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">2</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Selecione <strong style="color:#fff">Instalar aplicativo</strong> ou <strong style="color:#fff">Adicionar a tela inicial</strong></span></div>' +
        '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span style="background:#16a34a;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">3</span>' +
        '<span style="font-size:13px;color:#ccc;line-height:1.5">Confirme tocando em <strong style="color:#fff">Instalar</strong></span></div></div>' +
        '<button onclick="this.closest(\'div[style]\').parentElement.remove()" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:600;cursor:pointer;width:100%">Entendi</button></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// ===== APONTAMENTO DE PRESENÇA =====
let aptScanner = null;
let aptPresencas = {};
let aptAlunosNaTurma = [];

function apontamentoInicializar() {
    apontamentoPopularSelecaoProjeto();
    const conteudo = document.getElementById('apt-conteudo');
    if (conteudo) conteudo.style.display = 'none';
}

function apontamentoPopularSelecaoProjeto() {
    const sel = document.getElementById('apt-selecao-projeto');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.forEach(p => {
        sel.innerHTML += '<option value="' + p.nome + '">' + p.nome + (p.responsavel ? ' - ' + p.responsavel : '') + '</option>';
    });
}

function apontamentoOnSelecaoProjetoChange() {
    const projetoNome = document.getElementById('apt-selecao-projeto').value;
    const selTurma = document.getElementById('apt-selecao-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    if (projetoNome) {
        const turmasDoProjeto = turmas.filter(t => t.projeto === projetoNome);
        turmasDoProjeto.forEach(t => {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
    apontamentoOnSelecaoChange();
}

function apontamentoOnSelecaoChange() {
    const projeto = document.getElementById('apt-selecao-projeto').value;
    const turma = document.getElementById('apt-selecao-turma').value;
    const conteudo = document.getElementById('apt-conteudo');
    if (projeto && turma) {
        conteudo.style.display = '';
        apontamentoPopularFiltroTurma();
        apontamentoFiltrar();
    } else {
        conteudo.style.display = 'none';
    }
}

async function apontamentoAbrirModal() {
    aptPresencas = {};
    const turmaSelecionada = document.getElementById('apt-selecao-turma').value;
    const projetoSelecionado = document.getElementById('apt-selecao-projeto').value;
    document.getElementById('apt-turma').innerHTML = '<option value="">Carregando...</option>';
    document.getElementById('apt-disciplina').innerHTML = '<option value="">Selecione...</option>';
    document.getElementById('apt-aula').innerHTML = '<option value="">Selecione...</option>';
    document.getElementById('apt-presenca-area').style.display = 'none';
    document.getElementById('apt-scanner-area').style.display = 'none';
    document.getElementById('apt-scan-btn-area').style.display = 'block';
    const btnScan = document.getElementById('apt-btn-scan');
    if (btnScan) btnScan.disabled = true;
    const selTurma = document.getElementById('apt-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma</option>';
    turmas.forEach(t => {
        if (t.projeto === projetoSelecionado) {
            selTurma.innerHTML += '<option value="' + t.nome + '"' + (t.nome === turmaSelecionada ? ' selected' : '') + '>' + t.nome + '</option>';
        }
    });
    const selDisc = document.getElementById('apt-disciplina');
    selDisc.innerHTML = '<option value="">Selecione a disciplina</option>';
    document.getElementById('modal-apontamento-overlay').classList.remove('hidden');
    if (turmaSelecionada) {
        apontamentoOnTurmaChange();
    }
}

function apontamentoFecharModal(event) {
    if (event && event.target !== event.currentTarget) return;
    apontamentoPararScanner();
    document.getElementById('modal-apontamento-overlay').classList.add('hidden');
}

function apontamentoOnTurmaChange() {
    document.getElementById('apt-aula').innerHTML = '<option value="">Selecione...</option>';
    document.getElementById('apt-presenca-area').style.display = 'none';
    const turma = document.getElementById('apt-turma').value;
    if (!turma) return;
    apontamentoAtualizarAulas();
}

function apontamentoOnDisciplinaChange() {
    document.getElementById('apt-presenca-area').style.display = 'none';
    apontamentoAtualizarAulas();
}

function apontamentoAtualizarAulas() {
    var selAula = document.getElementById('apt-aula');
    selAula.innerHTML = '<option value="">Selecione...</option>';
}

function apontamentoOnAulaChange() {
    const btnScan = document.getElementById('apt-btn-scan');
    document.getElementById('apt-presenca-area').style.display = 'none';
    btnScan.disabled = true;
}

function apontamentoIniciarScanner() {
    const turma = document.getElementById('apt-turma').value;
    if (!turma) { alert('Selecione a turma primeiro'); return; }
    if (!aptAlunosNaTurma.length) { alert('Nenhum aluno encontrado para esta turma'); return; }
    document.getElementById('apt-scanner-area').style.display = 'block';
    document.getElementById('apt-scan-btn-area').style.display = 'none';
    if (aptScanner) {
        try { aptScanner.stop().then(() => aptScanner.clear()); } catch(e) {}
        aptScanner = null;
    }
    aptScanner = new Html5Qrcode('apt-qr-reader');
    aptScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: function(viewfinderWidth, viewfinderHeight) {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: size };
        }, disableFlip: false, aspectRatio: 1.0 },
        apontamentoOnQrSuccess,
        function() {}
    ).catch(function(err) {
        console.error('Erro ao iniciar câmera (environment):', err);
        aptScanner.start(
            { facingMode: 'user' },
            { fps: 10, qrbox: function(viewfinderWidth, viewfinderHeight) {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.floor(minEdge * 0.7);
                return { width: size, height: size };
            }, disableFlip: false, aspectRatio: 1.0 },
            apontamentoOnQrSuccess,
            function() {}
        ).catch(function(err2) {
            console.error('Erro ao iniciar câmera (user):', err2);
            alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.\n\nDetalhes: ' + err2);
            document.getElementById('apt-scanner-area').style.display = 'none';
            document.getElementById('apt-scan-btn-area').style.display = 'block';
        });
    });
}

function apontamentoPararScanner() {
    if (aptScanner) {
        try { aptScanner.stop().then(() => aptScanner.clear()); } catch(e) {}
        aptScanner = null;
    }
    document.getElementById('apt-scanner-area').style.display = 'none';
    document.getElementById('apt-scan-btn-area').style.display = 'block';
}

function apontamentoOnQrSuccess(decodedText) {
    const matricula = decodedText.trim().toUpperCase();
    let encontrado = null;
    for (const cpf in aptPresencas) {
        if (aptPresencas[cpf].matricula.toUpperCase() === matricula) {
            encontrado = aptPresencas[cpf];
            break;
        }
    }
    if (!encontrado) {
        encontrado = aptAlunosNaTurma.find(c => (c.matricula || '').toUpperCase() === matricula);
        if (encontrado) {
            aptPresencas[encontrado.cpf] = { matricula: encontrado.matricula || '', nome: encontrado.nome || '', cpf: encontrado.cpf || '', status: 'Presente', obs: '' };
        } else {
            alert('Aluno com matrícula ' + matricula + ' não encontrado nesta turma');
            return;
        }
    }
    if (!encontrado.status || encontrado.status === 'Falta' || encontrado.status === 'Justificada') {
        encontrado.status = 'Presente';
    }
    apontamentoRenderLista();
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:#fff;padding:12px 20px;border-radius:8px;z-index:99999;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
    toast.innerHTML = '<i class="fa-solid fa-check" style="margin-right:8px"></i> ' + (encontrado.nome || matricula) + ' — Presente';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

function apontamentoRenderLista() {
    const area = document.getElementById('apt-presenca-area');
    const lista = document.getElementById('apt-presenca-lista');
    const count = document.getElementById('apt-presenca-count');
    area.style.display = 'block';
    const todos = Object.values(aptPresencas);
    const presentes = todos.filter(p => p.status === 'Presente').length;
    const faltas = todos.filter(p => p.status === 'Falta').length;
    const justificadas = todos.filter(p => p.status === 'Justificada').length;
    count.textContent = presentes + ' presente(s) / ' + faltas + ' falta(s) / ' + justificadas + ' justificada(s) / ' + todos.length + ' total';
    lista.innerHTML = '<div class="data-table" style="width:100%"><table style="width:100%;border-collapse:collapse"><thead><tr>' +
        '<th style="text-align:left;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Matrícula</th>' +
        '<th style="text-align:left;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Nome</th>' +
        '<th style="text-align:center;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px;width:260px">Status</th>' +
        '<th style="text-align:left;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Observação</th>' +
        '</tr></thead><tbody>' +
        todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(p => {
            const statusClass = p.status === 'Presente' ? 'green' : p.status === 'Falta' ? 'red' : p.status === 'Justificada' ? 'orange' : 'gray';
            return '<tr style="border-bottom:1px solid #222">' +
                '<td style="padding:8px;font-size:13px;color:#ccc;font-weight:600">' + (p.matricula || '-') + '</td>' +
                '<td style="padding:8px;font-size:13px;color:#ccc">' + (p.nome || '-') + '</td>' +
                '<td style="padding:8px;text-align:center">' +
                    '<div style="display:flex;gap:4px;justify-content:center">' +
                        '<button onclick="apontamentoSetStatus(\'' + p.cpf + '\',\'Presente\')" style="padding:4px 10px;border-radius:6px;border:1px solid ' + (p.status === 'Presente' ? '#4caf50' : '#333') + ';background:' + (p.status === 'Presente' ? 'rgba(76,175,80,0.2)' : 'transparent') + ';color:' + (p.status === 'Presente' ? '#4caf50' : '#888') + ';cursor:pointer;font-size:12px;font-weight:600"><i class="fa-solid fa-check"></i> P</button>' +
                        '<button onclick="apontamentoSetStatus(\'' + p.cpf + '\',\'Falta\')" style="padding:4px 10px;border-radius:6px;border:1px solid ' + (p.status === 'Falta' ? '#f44336' : '#333') + ';background:' + (p.status === 'Falta' ? 'rgba(244,67,54,0.2)' : 'transparent') + ';color:' + (p.status === 'Falta' ? '#f44336' : '#888') + ';cursor:pointer;font-size:12px;font-weight:600"><i class="fa-solid fa-xmark"></i> F</button>' +
                        '<button onclick="apontamentoSetStatus(\'' + p.cpf + '\',\'Justificada\')" style="padding:4px 10px;border-radius:6px;border:1px solid ' + (p.status === 'Justificada' ? '#ff9800' : '#333') + ';background:' + (p.status === 'Justificada' ? 'rgba(255,152,0,0.2)' : 'transparent') + ';color:' + (p.status === 'Justificada' ? '#ff9800' : '#888') + ';cursor:pointer;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-info"></i> J</button>' +
                    '</div></td>' +
                '<td style="padding:8px"><input type="text" class="config-input" style="font-size:12px;padding:6px 8px" placeholder="Observação..." value="' + (p.obs || '').replace(/"/g, '&quot;') + '" onchange="apontamentoSetObs(\'' + p.cpf + '\', this.value)"></td>' +
            '</tr>';
        }).join('') +
        '</tbody></table></div>';
}

function apontamentoSetStatus(cpf, status) {
    if (aptPresencas[cpf]) {
        aptPresencas[cpf].status = aptPresencas[cpf].status === status ? '' : status;
        apontamentoRenderLista();
    }
}

function apontamentoSetObs(cpf, obs) {
    if (aptPresencas[cpf]) aptPresencas[cpf].obs = obs;
}

async function apontamentoSalvar() {
    const turma = document.getElementById('apt-turma').value;
    const disciplinaId = document.getElementById('apt-disciplina').value;
    const aulaId = document.getElementById('apt-aula').value;
    if (!turma || !aulaId) { alert('Selecione turma e aula'); return; }
    const todos = Object.values(aptPresencas);
    if (!todos.length) { alert('Nenhum aluno na lista'); return; }
    const selAula = document.getElementById('apt-aula');
    const aulaNome = selAula.options[selAula.selectedIndex] ? selAula.options[selAula.selectedIndex].text : '';
    const dados = {
        turma: turma,
        aula: aulaNome,
        aulaId: aulaId,
        alunos: todos,
        criadoEm: new Date().toISOString(),
        criadoPor: currentUserData ? currentUserData.nome || '' : ''
    };
    try {
        await dbFirestore.collection('apontamentos').add(dados);
        apontamentoPararScanner();
        document.getElementById('modal-apontamento-overlay').classList.add('hidden');
        alert('Apontamento salvo com sucesso!');
        apontamentoFiltrar();
    } catch (e) {
        console.error('Erro ao salvar apontamento:', e);
        alert('Erro ao salvar: ' + e.message);
    }
}

// ===== HISTÓRICO DE APONTAMENTOS =====
let aptHistoricoCache = [];

async function apontamentoCarregarHistorico() {
    try {
        const snap = await dbFirestore.collection('apontamentos').orderBy('criadoEm', 'desc').limit(200).get();
        aptHistoricoCache = [];
        snap.forEach(doc => {
            aptHistoricoCache.push({ docId: doc.id, ...doc.data() });
        });
    } catch (e) {
        console.error('Erro ao carregar histórico:', e);
    }
}

function apontamentoPopularFiltroTurma() {
}

function apontamentoLimparFiltros() {
    document.getElementById('apt-filtro-data-inicio').value = '';
    document.getElementById('apt-filtro-data-fim').value = '';
    document.getElementById('apt-filtro-matricula').value = '';
    apontamentoFiltrar();
}

async function apontamentoFiltrar() {
    await apontamentoCarregarHistorico();
    const turmaFiltro = document.getElementById('apt-selecao-turma').value;
    const dataInicio = document.getElementById('apt-filtro-data-inicio').value;
    const dataFim = document.getElementById('apt-filtro-data-fim').value;
    const matriculaBusca = document.getElementById('apt-filtro-matricula').value.trim().toLowerCase();
    let registros = aptHistoricoCache;
    if (turmaFiltro) {
        registros = registros.filter(r => r.turma === turmaFiltro);
    }
    if (dataInicio) {
        registros = registros.filter(r => (r.dataAula || r.criadoEm || '').substring(0, 10) >= dataInicio);
    }
    if (dataFim) {
        registros = registros.filter(r => (r.dataAula || r.criadoEm || '').substring(0, 10) <= dataFim);
    }
    if (matriculaBusca) {
        registros = registros.filter(r => {
            if (!r.alunos) return false;
            return r.alunos.some(a => (a.matricula || '').toLowerCase().includes(matriculaBusca) || (a.nome || '').toLowerCase().includes(matriculaBusca));
        });
    }
    apontamentoRenderHistorico(registros);
}

function apontamentoRenderHistorico(registros) {
    const empty = document.getElementById('apontamento-historico-empty');
    const lista = document.getElementById('apontamento-historico-lista');
    const resumo = document.getElementById('apt-resumo');
    if (!lista) return;
    if (!registros.length) {
        empty.style.display = 'block';
        lista.style.display = 'none';
        resumo.style.display = 'none';
        return;
    }
    empty.style.display = 'none';
    lista.style.display = 'block';
    resumo.style.display = 'flex';
    let totalPresentes = 0, totalFaltas = 0, totalJustificadas = 0;
    registros.forEach(r => {
        (r.alunos || []).forEach(a => {
            if (a.status === 'Presente') totalPresentes++;
            else if (a.status === 'Falta') totalFaltas++;
            else if (a.status === 'Justificada') totalJustificadas++;
        });
    });
    document.getElementById('apt-resumo-registros').textContent = registros.length;
    document.getElementById('apt-resumo-presentes').textContent = totalPresentes;
    document.getElementById('apt-resumo-faltas').textContent = totalFaltas;
    document.getElementById('apt-resumo-justificadas').textContent = totalJustificadas;
    lista.innerHTML = registros.map((r, ri) => {
        const dataFmt = r.dataAula ? new Date(r.dataAula + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const horaFmt = r.horaAula || '-';
        const criadoEmFmt = r.criadoEm ? new Date(r.criadoEm).toLocaleString('pt-BR') : '-';
        const alunos = r.alunos || [];
        const presCount = alunos.filter(a => a.status === 'Presente').length;
        const faltaCount = alunos.filter(a => a.status === 'Falta').length;
        const justCount = alunos.filter(a => a.status === 'Justificada').length;
        const rows = alunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map((a, ai) => {
            const stColor = a.status === 'Presente' ? '#4caf50' : a.status === 'Falta' ? '#f44336' : a.status === 'Justificada' ? '#ff9800' : '#666';
            const stIcon = a.status === 'Presente' ? 'fa-check' : a.status === 'Falta' ? 'fa-xmark' : a.status === 'Justificada' ? 'fa-circle-info' : 'fa-question';
            const recId = r.docId || '';
            return '<tr style="border-bottom:1px solid #222">' +
                '<td style="padding:8px 12px;font-size:13px;font-weight:700;color:#16a34a;font-family:Courier New,monospace;white-space:nowrap">' + (a.matricula || '-') + '</td>' +
                '<td style="padding:8px 12px;font-size:13px;color:#ccc">' + (a.nome || '-') + '</td>' +
                '<td style="padding:8px 12px;text-align:center"><span style="color:' + stColor + ';font-weight:700;font-size:13px"><i class="fa-solid ' + stIcon + '" style="margin-right:4px"></i>' + (a.status || '-') + '</span></td>' +
                '<td style="padding:8px 12px;font-size:12px;color:#888">' + (a.obs || '-') + '</td>' +
                '<td style="padding:8px 12px;text-align:center">' +
                    '<button class="btn-icon" style="font-size:11px;padding:4px 6px" title="Editar" onclick="apontamentoEditarAluno(\'' + recId + '\',' + ai + ')"><i class="fa-solid fa-pen"></i></button>' +
                '</td>' +
            '</tr>';
        }).join('');
        const cardId = 'apt-card-' + ri;
        return '<div class="apt-card" id="' + cardId + '" style="background:#1a1a2e;border:1px solid #2a2a3a;border-radius:10px;margin-bottom:16px;overflow:hidden">' +
            '<div style="padding:12px 16px;background:#151525;border-bottom:1px solid #2a2a3a;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;cursor:pointer;user-select:none" onclick="apontamentoToggleCard(\'' + cardId + '\')">' +
                '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
                    '<i class="fa-solid fa-chevron-down" style="color:#666;font-size:12px;transition:transform 0.2s" id="apt-arrow-' + ri + '"></i>' +
                    '<span style="background:rgba(245,127,23,0.2);color:#f57f17;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700">' + (r.turma || '-') + '</span>' +
                    '<span style="color:#ccc;font-size:13px"><i class="fa-solid fa-book" style="color:#f57f17;margin-right:4px"></i>' + (r.disciplina || '-') + '</span>' +
                    '<span style="color:#aaa;font-size:12px"><i class="fa-solid fa-calendar" style="margin-right:3px"></i>' + dataFmt + ' ' + horaFmt + '</span>' +
                    '<span style="color:#666;font-size:11px">Aula: ' + (r.aula || '-') + '</span>' +
                '</div>' +
                '<div style="display:flex;gap:8px;font-size:12px;align-items:center">' +
                    '<span style="color:#4caf50;font-weight:700">' + presCount + ' P</span>' +
                    '<span style="color:#f44336;font-weight:700">' + faltaCount + ' F</span>' +
                    '<span style="color:#ff9800;font-weight:700">' + justCount + ' J</span>' +
                    '<span style="color:#666">/ ' + alunos.length + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="apt-card-body" style="overflow-x:auto">' +
                '<table style="width:100%;border-collapse:collapse">' +
                    '<thead><tr>' +
                        '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#aaa;font-size:11px;min-width:140px">Matricula</th>' +
                        '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#aaa;font-size:11px">Nome</th>' +
                        '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#aaa;font-size:11px;width:140px">Status</th>' +
                        '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#aaa;font-size:11px">Observacao</th>' +
                        '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#aaa;font-size:11px;width:60px">Acoes</th>' +
                    '</tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
            '<div class="apt-card-footer" style="padding:8px 16px;font-size:10px;color:#555;border-top:1px solid #2a2a3a">Registrado por: ' + (r.criadoPor || '-') + ' em ' + criadoEmFmt + '</div>' +
        '</div>';
    }).join('');
}

function apontamentoToggleCard(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const body = card.querySelector('.apt-card-body');
    const footer = card.querySelector('.apt-card-footer');
    const ri = cardId.replace('apt-card-', '');
    const arrow = document.getElementById('apt-arrow-' + ri);
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    if (footer) footer.style.display = isHidden ? '' : 'none';
    if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

function apontamentoEditarAluno(recId, alunoIdx) {
    const senha = prompt('Digite a senha do administrador para editar:');
    if (!senha) return;
    if (senha !== ADMIN_SENHA) { alert('Senha incorreta!'); return; }
    const reg = aptHistoricoCache.find(r => r.docId === recId);
    if (!reg || !reg.alunos || !reg.alunos[alunoIdx]) return;
    const a = reg.alunos[alunoIdx];
    const novoStatus = prompt('Status atual: ' + a.status + '\n\nDigite o novo status:\n1 = Presente\n2 = Falta\n3 = Justificada', a.status === 'Presente' ? '1' : a.status === 'Falta' ? '2' : '3');
    if (novoStatus === null) return;
    const statusMap = { '1': 'Presente', '2': 'Falta', '3': 'Justificada' };
    const statusFinal = statusMap[novoStatus.trim()];
    if (!statusFinal) { alert('Opcao invalida.'); return; }
    const novaObs = prompt('Observacao atual: ' + (a.obs || 'Nenhuma') + '\n\nDigite a nova observacao (deixe vazio para manter):', a.obs || '');
    if (novaObs === null) return;
    a.status = statusFinal;
    a.obs = novaObs.trim() || a.obs;
    if (recId) {
        dbFirestore.collection('apontamentos').doc(recId).update({ alunos: reg.alunos }).then(() => {
            apontamentoFiltrar();
            alert('Alteracao salva com sucesso!');
        }).catch(e => { alert('Erro ao salvar: ' + e.message); });
    }
}

window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
});

/* ===== APOSTILAS ADMIN ===== */
var apostEditingId = null;

async function apostLoadProjetos() {
    var sel = document.getElementById('apost-projeto');
    try {
        var snap = await dbFirestore.collection('parceiros').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o projeto...</option>';
        snap.forEach(function(doc) {
            var p = doc.data();
            sel.innerHTML += '<option value="' + p.nome + '">' + p.nome + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar projetos</option>';
    }
}

function apostOnProjetoChange() {
    var projetoNome = document.getElementById('apost-projeto').value;
    var selTurma = document.getElementById('apost-turma');
    selTurma.innerHTML = '<option value="">Todas as turmas</option>';
    if (projetoNome) {
        var turmasDoProjeto = turmas.filter(function(t) { return t.projeto === projetoNome; });
        turmasDoProjeto.forEach(function(t) {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
}

async function apostSave() {
    var titulo = document.getElementById('apost-titulo').value.trim();
    var projeto = document.getElementById('apost-projeto').value;
    var desc = document.getElementById('apost-desc').value.trim();
    var turma = document.getElementById('apost-turma').value.trim();
    var arquivo = document.getElementById('apost-file').value;
    var btn = document.getElementById('apost-upload-btn');

    if (!titulo) { apostShowMsg('Informe o titulo.', 'err'); return; }
    if (!projeto) { apostShowMsg('Selecione o projeto.', 'err'); return; }
    if (!arquivo) { apostShowMsg('Selecione o arquivo PDF.', 'err'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
        var dados = {
            titulo: titulo,
            descricao: desc,
            projeto: projeto,
            turma: turma,
            url: arquivo
        };

        if (apostEditingId) {
            await dbFirestore.collection('apostilasAlunos').doc(apostEditingId).update(dados);
            apostShowMsg('Apostila atualizada com sucesso!', 'ok');
            apostEditingId = null;
            document.getElementById('apost-upload-btn').innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar';
        } else {
            dados.visivel = false;
            dados.data = new Date().toISOString();
            dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
            await dbFirestore.collection('apostilasAlunos').add(dados);
            apostShowMsg('Apostila cadastrada com sucesso!', 'ok');
        }

        document.getElementById('apost-titulo').value = '';
        document.getElementById('apost-desc').value = '';
        document.getElementById('apost-turma').value = '';
        document.getElementById('apost-file').value = '';
        apostilasLoadList();
    } catch(e) {
        console.error('Erro ao salvar apostila:', e);
        apostShowMsg('Erro: ' + e.message, 'err');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar';
}

async function apostEdit(docId) {
    try {
        var doc = await dbFirestore.collection('apostilasAlunos').doc(docId).get();
        if (!doc.exists) { apostShowMsg('Apostila nao encontrada.', 'err'); return; }
        var a = doc.data();
        document.getElementById('apost-titulo').value = a.titulo || '';
        document.getElementById('apost-desc').value = a.descricao || '';
        document.getElementById('apost-file').value = a.url || '';
        document.getElementById('apost-projeto').value = a.projeto || '';
        apostOnProjetoChange();
        setTimeout(function() {
            document.getElementById('apost-turma').value = a.turma || '';
        }, 100);
        apostEditingId = docId;
        document.getElementById('apost-upload-btn').innerHTML = '<i class="fa-solid fa-check"></i> Atualizar';
        apostShowMsg('Editando: ' + (a.titulo || 'Apostila') + ' — altere os campos e clique Atualizar.', 'ok');
        document.getElementById('apost-titulo').focus();
    } catch(e) {
        apostShowMsg('Erro ao carregar apostila: ' + e.message, 'err');
    }
}

function apostShowMsg(text, type) {
    var el = document.getElementById('apost-msg');
    el.textContent = text;
    el.style.display = 'block';
    el.style.background = type === 'ok' ? 'rgba(76,175,80,.15)' : 'rgba(244,67,54,.15)';
    el.style.border = '1px solid ' + (type === 'ok' ? 'rgba(76,175,80,.3)' : 'rgba(244,67,54,.3)');
    el.style.color = type === 'ok' ? '#4caf50' : '#f44336';
}

async function apostilasLoadList() {
    var container = document.getElementById('apost-list');
    apostLoadProjetos();
    try {
        var snap = await dbFirestore.collection('apostilasAlunos').orderBy('data', 'desc').get();
        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-book-open" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i><p>Nenhuma apostila cadastrada.</p></div>';
            return;
        }
        container.innerHTML = '';
        snap.forEach(function(doc) {
            var a = doc.data();
            var isVisivel = a.visivel !== false;
            var dateStr = a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '';
            var turmaHtml = a.turma ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">' + a.turma + '</span>' : '';
            var statusBadge = isVisivel
                ? '<span style="background:rgba(76,175,80,.15);color:#4caf50;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Visivel</span>'
                : '<span style="background:rgba(255,255,255,.06);color:#666;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Oculto</span>';
            var toggleColor = isVisivel ? 'rgba(33,136,255,.15)' : 'rgba(255,255,255,.06)';
            var toggleBorder = isVisivel ? 'rgba(33,136,255,.3)' : 'rgba(255,255,255,.1)';
            var toggleIconColor = isVisivel ? '#2188ff' : '#666';
            var toggleOver = isVisivel ? 'rgba(33,136,255,.35)' : 'rgba(255,255,255,.12)';
            var toggleTitle = isVisivel ? 'Ocultar do Portal do Aluno' : 'Mostrar no Portal do Aluno';
            var toggleIcon = isVisivel ? 'fa-eye' : 'fa-eye-slash';
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid ' + (isVisivel ? 'rgba(33,136,255,.15)' : 'rgba(255,255,255,.06)') + ';border-radius:10px;margin-bottom:8px';
            card.innerHTML = '<div style="width:42px;height:42px;background:rgba(244,67,54,.12);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-file-pdf" style="color:#f44336;font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (a.titulo || 'Apostila') + '</div>' +
                    '<div style="font-size:11px;color:#888;display:flex;gap:8px;align-items:center;margin-top:2px">' +
                        '<span>' + (a.projeto || '') + '</span>' + turmaHtml + statusBadge + (dateStr ? '<span>' + dateStr + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button onclick="apostToggleVisivel(\'' + doc.id + '\',' + isVisivel + ')" title="' + toggleTitle + '" style="background:' + toggleColor + ';border:1px solid ' + toggleBorder + ';color:' + toggleIconColor + ';width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'' + toggleOver + '\'" onmouseout="this.style.background=\'' + toggleColor + '\'"><i class="fa-solid ' + toggleIcon + '"></i></button>' +
                    '<button onclick="apostEdit(\'' + doc.id + '\')" title="Editar" style="background:rgba(255,152,0,.15);border:1px solid rgba(255,152,0,.3);color:#ff9800;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(255,152,0,.35)\'" onmouseout="this.style.background=\'rgba(255,152,0,.15)\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="window.open(\'' + a.url + '\',\'_blank\')" title="Abrir PDF" style="background:rgba(76,175,80,.15);border:1px solid rgba(76,175,80,.3);color:#4caf50;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(76,175,80,.35)\'" onmouseout="this.style.background=\'rgba(76,175,80,.15)\'"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>' +
                    '<button onclick="apostDelete(\'' + doc.id + '\')" title="Excluir" style="background:rgba(244,67,54,.15);border:1px solid rgba(244,67,54,.3);color:#f44336;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(244,67,54,.35)\'" onmouseout="this.style.background=\'rgba(244,67,54,.15)\'"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
            container.appendChild(card);
        });
    } catch(e) {
        console.error('Erro ao listar apostilas:', e);
        container.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar apostilas.</div>';
    }
}

async function apostToggleVisivel(docId, atual) {
    var novo = !atual;
    try {
        await dbFirestore.collection('apostilasAlunos').doc(docId).update({ visivel: novo });
        apostilasLoadList();
    } catch(e) {
        alert('Erro ao alterar visibilidade: ' + e.message);
    }
}

async function apostDelete(docId) {
    if (!confirm('Excluir esta apostila?')) return;
    try {
        await dbFirestore.collection('apostilasAlunos').doc(docId).delete();
        apostilasLoadList();
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

/* ===== DISCIPLINAS ===== */
let disciplinas = [];
let discEditingId = null;

async function discLoadProjetos() {
    var sel = document.getElementById('disc-projeto');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('parceiros').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o projeto...</option>';
        snap.forEach(function(doc) {
            var p = doc.data();
            sel.innerHTML += '<option value="' + p.nome + '">' + p.nome + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar projetos</option>';
    }
}

async function discLoadTurmas() {
    var sel = document.getElementById('disc-turma');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas as turmas</option>';
    turmas.forEach(function(t) {
        sel.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
    });
}

async function discLoadInstrutores() {
    var sel = document.getElementById('disc-instrutor');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('instrutores').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o instrutor...</option>';
        snap.forEach(function(doc) {
            var i = doc.data();
            sel.innerHTML += '<option value="' + i.nome + '">' + i.nome + (i.guerra ? ' (' + i.guerra + ')' : '') + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar instrutores</option>';
    }
}

function discOnProjetoChange() {
    var projetoNome = document.getElementById('disc-projeto').value;
    var selTurma = document.getElementById('disc-turma');
    selTurma.innerHTML = '<option value="">Todas as turmas</option>';
    if (projetoNome) {
        var turmasDoProjeto = turmas.filter(function(t) { return t.projeto === projetoNome; });
        turmasDoProjeto.forEach(function(t) {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
}

function discShowMsg(msg, type) {
    var el = document.getElementById('disc-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.background = type === 'ok' ? 'rgba(76,175,80,.15)' : 'rgba(244,67,54,.15)';
    el.style.color = type === 'ok' ? '#4caf50' : '#f44336';
    el.textContent = msg;
    setTimeout(function() { el.style.display = 'none'; }, 4000);
}

async function discSave() {
    var nome = document.getElementById('disc-nome').value.trim();
    var projeto = document.getElementById('disc-projeto').value;
    var turma = document.getElementById('disc-turma').value.trim();
    var instrutor = document.getElementById('disc-instrutor').value.trim();
    var btn = document.getElementById('disc-save-btn');

    if (!nome) { discShowMsg('Informe o nome da disciplina.', 'err'); return; }
    if (!projeto) { discShowMsg('Selecione o projeto.', 'err'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
        var dados = {
            nome: nome,
            projeto: projeto,
            turma: turma,
            instrutor: instrutor
        };

        if (discEditingId) {
            await dbFirestore.collection('disciplinas').doc(discEditingId).update(dados);
            discShowMsg('Disciplina atualizada com sucesso!', 'ok');
            discEditingId = null;
            document.getElementById('disc-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar Disciplina';
        } else {
            dados.data = new Date().toISOString();
            await dbFirestore.collection('disciplinas').add(dados);
            discShowMsg('Disciplina cadastrada com sucesso!', 'ok');
        }

        document.getElementById('disc-nome').value = '';
        document.getElementById('disc-turma').value = '';
        document.getElementById('disc-instrutor').value = '';
        discLoadList();
    } catch(e) {
        console.error('Erro ao salvar disciplina:', e);
        discShowMsg('Erro: ' + e.message, 'err');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar Disciplina';
}

async function discLoadList() {
    var container = document.getElementById('disc-list');
    if (!container) return;
    discLoadProjetos();
    discLoadTurmas();
    discLoadInstrutores();
    try {
        var snap = await dbFirestore.collection('disciplinas').orderBy('data', 'desc').get();
        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-graduation-cap" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i><p>Nenhuma disciplina cadastrada.</p></div>';
            return;
        }
        container.innerHTML = '';
        snap.forEach(function(doc) {
            var d = doc.data();
            var dateStr = d.data ? new Date(d.data).toLocaleDateString('pt-BR') : '';
            var turmaHtml = d.turma ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">' + d.turma + '</span>' : '<span style="background:rgba(255,255,255,.06);color:#666;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Todas</span>';
            var instrutorHtml = d.instrutor ? '<span style="background:rgba(33,136,255,.15);color:#2188ff;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-chalkboard-user" style="margin-right:3px"></i>' + d.instrutor + '</span>' : '';
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(156,39,176,.15);border-radius:10px;margin-bottom:8px';
            card.innerHTML = '<div style="width:42px;height:42px;background:rgba(156,39,176,.12);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-graduation-cap" style="color:#ce93d8;font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (d.nome || 'Disciplina') + '</div>' +
                    '<div style="font-size:11px;color:#888;display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">' +
                        '<span>' + (d.projeto || '') + '</span>' + turmaHtml + instrutorHtml + (dateStr ? '<span>' + dateStr + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button onclick="discEdit(\'' + doc.id + '\')" title="Editar" style="background:rgba(255,152,0,.15);border:1px solid rgba(255,152,0,.3);color:#ff9800;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(255,152,0,.35)\'" onmouseout="this.style.background=\'rgba(255,152,0,.15)\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="discDelete(\'' + doc.id + '\')" title="Excluir" style="background:rgba(244,67,54,.15);border:1px solid rgba(244,67,54,.3);color:#f44336;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(244,67,54,.35)\'" onmouseout="this.style.background=\'rgba(244,67,54,.15)\'"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
            container.appendChild(card);
        });
    } catch(e) {
        console.error('Erro ao listar disciplinas:', e);
        container.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar disciplinas.</div>';
    }
}

async function discEdit(docId) {
    try {
        var doc = await dbFirestore.collection('disciplinas').doc(docId).get();
        if (!doc.exists) { alert('Disciplina nao encontrada.'); return; }
        var d = doc.data();
        discEditingId = docId;
        document.getElementById('disc-nome').value = d.nome || '';
        document.getElementById('disc-projeto').value = d.projeto || '';
        discOnProjetoChange();
        setTimeout(function() {
            document.getElementById('disc-turma').value = d.turma || '';
            document.getElementById('disc-instrutor').value = d.instrutor || '';
        }, 100);
        var btn = document.getElementById('disc-save-btn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Disciplina';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) {
        alert('Erro ao carregar disciplina: ' + e.message);
    }
}

async function discDelete(docId) {
    if (!confirm('Excluir esta disciplina?')) return;
    try {
        await dbFirestore.collection('disciplinas').doc(docId).delete();
        discLoadList();
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

/* ===== AULAS ===== */
let aulaEditingId = null;

async function aulaLoadDisciplinas() {
    var sel = document.getElementById('aula-disciplina');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('disciplinas').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione a disciplina...</option>';
        snap.forEach(function(doc) {
            var d = doc.data();
            sel.innerHTML += '<option value="' + d.nome + '" data-projeto="' + (d.projeto || '') + '" data-turma="' + (d.turma || '') + '" data-instrutor="' + (d.instrutor || '') + '">' + d.nome + ' (' + (d.projeto || '') + ')</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar disciplinas</option>';
    }
}

function aulaOnDisciplinaChange() {
    var sel = document.getElementById('aula-disciplina');
    var opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    var projeto = opt.getAttribute('data-projeto') || '';
    var turma = opt.getAttribute('data-turma') || '';
    var instrutor = opt.getAttribute('data-instrutor') || '';
    if (projeto) document.getElementById('aula-projeto').value = projeto;
    if (turma) {
        aulaOnProjetoChange();
        setTimeout(function() { document.getElementById('aula-turma').value = turma; }, 100);
    }
    if (instrutor) document.getElementById('aula-instrutor').value = instrutor;
}

async function aulaLoadProjetos() {
    var sel = document.getElementById('aula-projeto');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('parceiros').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o projeto...</option>';
        snap.forEach(function(doc) {
            var p = doc.data();
            sel.innerHTML += '<option value="' + p.nome + '">' + p.nome + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar projetos</option>';
    }
}

function aulaLoadTurmas() {
    var sel = document.getElementById('aula-turma');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas as turmas</option>';
    turmas.forEach(function(t) {
        sel.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
    });
}

async function aulaLoadInstrutores() {
    var sel = document.getElementById('aula-instrutor');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('instrutores').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o instrutor...</option>';
        snap.forEach(function(doc) {
            var i = doc.data();
            sel.innerHTML += '<option value="' + i.nome + '">' + i.nome + (i.guerra ? ' (' + i.guerra + ')' : '') + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar instrutores</option>';
    }
}

function aulaOnProjetoChange() {
    var projetoNome = document.getElementById('aula-projeto').value;
    var selTurma = document.getElementById('aula-turma');
    selTurma.innerHTML = '<option value="">Todas as turmas</option>';
    if (projetoNome) {
        var turmasDoProjeto = turmas.filter(function(t) { return t.projeto === projetoNome; });
        turmasDoProjeto.forEach(function(t) {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
}

function aulaShowMsg(msg, type) {
    var el = document.getElementById('aula-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.background = type === 'ok' ? 'rgba(76,175,80,.15)' : 'rgba(244,67,54,.15)';
    el.style.color = type === 'ok' ? '#4caf50' : '#f44336';
    el.textContent = msg;
    setTimeout(function() { el.style.display = 'none'; }, 4000);
}

async function aulaSave() {
    var disciplina = document.getElementById('aula-disciplina').value;
    var projeto = document.getElementById('aula-projeto').value;
    var turma = document.getElementById('aula-turma').value.trim();
    var instrutor = document.getElementById('aula-instrutor').value.trim();
    var data = document.getElementById('aula-data').value;
    var horario = document.getElementById('aula-horario').value.trim();
    var conteudo = document.getElementById('aula-conteudo').value.trim();
    var btn = document.getElementById('aula-save-btn');

    if (!disciplina) { aulaShowMsg('Selecione a disciplina.', 'err'); return; }
    if (!projeto) { aulaShowMsg('Selecione o projeto.', 'err'); return; }
    if (!data) { aulaShowMsg('Informe a data da aula.', 'err'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
        var dados = {
            disciplina: disciplina,
            projeto: projeto,
            turma: turma,
            instrutor: instrutor,
            data: data,
            horario: horario,
            conteudo: conteudo
        };

        if (aulaEditingId) {
            await dbFirestore.collection('aulas').doc(aulaEditingId).update(dados);
            aulaShowMsg('Aula atualizada com sucesso!', 'ok');
            aulaEditingId = null;
            document.getElementById('aula-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar Aula';
        } else {
            dados.criadoEm = new Date().toISOString();
            await dbFirestore.collection('aulas').add(dados);
            aulaShowMsg('Aula cadastrada com sucesso!', 'ok');
        }

        document.getElementById('aula-disciplina').value = '';
        document.getElementById('aula-projeto').value = '';
        document.getElementById('aula-turma').innerHTML = '<option value="">Todas as turmas</option>';
        document.getElementById('aula-instrutor').value = '';
        document.getElementById('aula-data').value = '';
        document.getElementById('aula-horario').value = '';
        document.getElementById('aula-conteudo').value = '';
        aulaLoadList();
    } catch(e) {
        console.error('Erro ao salvar aula:', e);
        aulaShowMsg('Erro: ' + e.message, 'err');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar Aula';
}

async function aulaLoadList() {
    var container = document.getElementById('aula-list');
    if (!container) return;
    aulaLoadDisciplinas();
    aulaLoadProjetos();
    aulaLoadTurmas();
    aulaLoadInstrutores();
    try {
        var snap = await dbFirestore.collection('aulas').orderBy('data', 'desc').get();
        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-chalkboard" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i><p>Nenhuma aula cadastrada.</p></div>';
            return;
        }
        container.innerHTML = '';
        snap.forEach(function(doc) {
            var a = doc.data();
            var dateStr = a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
            var turmaHtml = a.turma ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">' + a.turma + '</span>' : '<span style="background:rgba(255,255,255,.06);color:#666;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Todas</span>';
            var instrutorHtml = a.instrutor ? '<span style="background:rgba(33,136,255,.15);color:#2188ff;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-chalkboard-user" style="margin-right:3px"></i>' + a.instrutor + '</span>' : '';
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(33,136,255,.15);border-radius:10px;margin-bottom:8px';
            card.innerHTML = '<div style="width:42px;height:42px;background:rgba(33,136,255,.12);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-chalkboard" style="color:#2188ff;font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (a.disciplina || 'Aula') + (a.conteudo ? ' - ' + a.conteudo : '') + '</div>' +
                    '<div style="font-size:11px;color:#888;display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">' +
                        '<span>' + (a.projeto || '') + '</span>' + turmaHtml + instrutorHtml + (dateStr ? '<span><i class="fa-solid fa-calendar-day" style="margin-right:2px"></i>' + dateStr + '</span>' : '') + (a.horario ? '<span><i class="fa-solid fa-clock" style="margin-right:2px"></i>' + a.horario + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button onclick="aulaEdit(\'' + doc.id + '\')" title="Editar" style="background:rgba(255,152,0,.15);border:1px solid rgba(255,152,0,.3);color:#ff9800;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(255,152,0,.35)\'" onmouseout="this.style.background=\'rgba(255,152,0,.15)\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="aulaDelete(\'' + doc.id + '\')" title="Excluir" style="background:rgba(244,67,54,.15);border:1px solid rgba(244,67,54,.3);color:#f44336;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(244,67,54,.35)\'" onmouseout="this.style.background=\'rgba(244,67,54,.15)\'"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
            container.appendChild(card);
        });
    } catch(e) {
        console.error('Erro ao listar aulas:', e);
        container.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar aulas.</div>';
    }
}

async function aulaEdit(docId) {
    try {
        var doc = await dbFirestore.collection('aulas').doc(docId).get();
        if (!doc.exists) { alert('Aula nao encontrada.'); return; }
        var a = doc.data();
        aulaEditingId = docId;
        document.getElementById('aula-disciplina').value = a.disciplina || '';
        document.getElementById('aula-projeto').value = a.projeto || '';
        aulaOnProjetoChange();
        setTimeout(function() {
            document.getElementById('aula-turma').value = a.turma || '';
            document.getElementById('aula-instrutor').value = a.instrutor || '';
        }, 100);
        document.getElementById('aula-data').value = a.data || '';
        document.getElementById('aula-horario').value = a.horario || '';
        document.getElementById('aula-conteudo').value = a.conteudo || '';
        var btn = document.getElementById('aula-save-btn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Aula';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) {
        alert('Erro ao carregar aula: ' + e.message);
    }
}

async function aulaDelete(docId) {
    if (!confirm('Excluir esta aula?')) return;
    try {
        await dbFirestore.collection('aulas').doc(docId).delete();
        aulaLoadList();
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

/* ===== INSTRUTORES ===== */
let instrutores = [];
let editingInstrutorId = null;

function mascaraCPF(el) {
    var v = el.value.replace(/\D/g, '').substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    el.value = v;
}

function mascaraFone(el) {
    var v = el.value.replace(/\D/g, '').substring(0, 11);
    if (v.length > 6) v = '(' + v.substring(0, 2) + ') ' + v.substring(2, 7) + '-' + v.substring(7);
    else if (v.length > 2) v = '(' + v.substring(0, 2) + ') ' + v.substring(2);
    else if (v.length > 0) v = '(' + v;
    el.value = v;
}

function instrutorAbrirModal(id) {
    editingInstrutorId = id || null;
    instrutorLimparForm();
    var titleEl = document.getElementById('instrutor-form-title');
    if (id) {
        var inst = instrutores.find(i => i.id === id);
        if (!inst) return;
        titleEl.innerHTML = '<i class="fa-solid fa-pen" style="color:#ff9800;margin-right:8px"></i> Editar Instrutor';
        document.getElementById('intr-id').value = inst.id;
        document.getElementById('intr-nome').value = inst.nome || '';
        document.getElementById('intr-guerra').value = inst.guerra || '';
        document.getElementById('intr-cpf').value = inst.cpf || '';
        document.getElementById('intr-matricula').value = inst.matricula || '';
        document.getElementById('intr-fone').value = inst.fone || '';
        document.getElementById('intr-email').value = inst.email || '';
        instrutorPopulateDisciplinas(inst.disciplinas || []);
    } else {
        titleEl.innerHTML = '<i class="fa-solid fa-plus" style="color:#4caf50;margin-right:8px"></i> Novo Instrutor';
        instrutorPopulateDisciplinas([]);
    }
    document.getElementById('modal-instrutor-overlay').classList.remove('hidden');
}

function instrutorFecharModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-instrutor-overlay').classList.add('hidden');
}

function instrutorLimparForm() {
    document.getElementById('intr-id').value = '';
    document.getElementById('intr-nome').value = '';
    document.getElementById('intr-guerra').value = '';
    document.getElementById('intr-cpf').value = '';
    document.getElementById('intr-matricula').value = '';
    document.getElementById('intr-fone').value = '';
    document.getElementById('intr-email').value = '';
    instrutorPopulateDisciplinas([]);
}

function instrutorPopulateDisciplinas(selectedArr) {
    var container = document.getElementById('intr-disciplinas-checks');
    if (!container) return;
    container.innerHTML = '';
    var allDisc = ['APH', 'Legislacao e Normas', 'Gerencia Analitica', 'AP OU E CT'];
    if (!allDisc.length) {
        container.innerHTML = '<span style="color:#666;font-size:13px">Nenhuma disciplina disponivel</span>';
        return;
    }
    allDisc.forEach(function(d) {
        var checked = selectedArr.indexOf(d) !== -1 ? 'checked' : '';
        container.innerHTML += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;background:#1e1e1e;border:1px solid #333;border-radius:6px;padding:4px 10px;font-size:13px;color:#ccc;white-space:nowrap"><input type="checkbox" value="' + d + '" class="intr-disc-check" ' + checked + '> ' + d + '</label>';
    });
}

function instrutorGetSelectedDisciplinas() {
    return Array.from(document.querySelectorAll('.intr-disc-check:checked')).map(function(cb) { return cb.value; });
}

async function instrutorSalvar(e) {
    e.preventDefault();
    var nome = document.getElementById('intr-nome').value.trim();
    var guerra = document.getElementById('intr-guerra').value.trim();
    var cpf = document.getElementById('intr-cpf').value.trim();
    if (!nome || !guerra || !cpf) { alert('Preencha Nome Completo, Nome de Guerra e CPF'); return; }
    var dados = {
        nome: nome,
        guerra: guerra,
        cpf: cpf,
        matricula: document.getElementById('intr-matricula').value.trim(),
        fone: document.getElementById('intr-fone').value.trim(),
        email: document.getElementById('intr-email').value.trim(),
        disciplinas: instrutorGetSelectedDisciplinas(),
        atualizadoEm: new Date().toISOString()
    };
    try {
        if (editingInstrutorId) {
            await dbFirestore.collection('instrutores').doc(editingInstrutorId).update(dados);
            var idx = instrutores.findIndex(i => i.id === editingInstrutorId);
            if (idx !== -1) Object.assign(instrutores[idx], dados);
            alert('Instrutor atualizado com sucesso!');
        } else {
            var dup = instrutores.find(i => i.cpf === cpf);
            if (dup) { alert('Ja existe instrutor com este CPF'); return; }
            dados.criadoEm = new Date().toISOString();
            var ref = await dbFirestore.collection('instrutores').add(dados);
            dados.id = ref.id;
            instrutores.push(dados);
            alert('Instrutor cadastrado com sucesso!');
        }
        instrutorFecharModal();
        instrutorListar();
    } catch (e) {
        console.error('Erro ao salvar instrutor:', e);
        alert('Erro ao salvar instrutor: ' + e.message);
    }
}

function instrutorListar() {
    var tbody = document.getElementById('instrutores-table-body');
    var empty = document.getElementById('instrutores-empty');
    var lista = document.getElementById('instrutores-lista');
    if (!tbody) return;
    if (!instrutores.length) {
        if (empty) empty.style.display = 'block';
        if (lista) lista.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (lista) lista.style.display = 'block';
    tbody.innerHTML = instrutores.map(function(i) {
        var cpfFmt = i.cpf ? i.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-';
        var discHtml = (i.disciplinas || []).map(function(d) { return '<span class="badge blue" style="font-size:10px;margin:1px">' + d + '</span>'; }).join(' ');
        return '<tr>' +
            '<td style="font-weight:600">' + (i.nome || '-') + '</td>' +
            '<td>' + (i.guerra || '-') + '</td>' +
            '<td>' + cpfFmt + '</td>' +
            '<td>' + (i.matricula || '-') + '</td>' +
            '<td>' + (discHtml || '-') + '</td>' +
            '<td>' + (i.fone || '-') + '</td>' +
            '<td>' + (i.email || '-') + '</td>' +
            '<td><div class="actions-cell">' +
                '<button class="btn-icon" title="Editar" onclick="instrutorAbrirModal(\'' + i.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="instrutorExcluir(\'' + i.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
                '<button class="btn-icon" title="Imprimir" onclick="instrutorImprimir(\'' + i.id + '\')" style="color:#4caf50"><i class="fa-solid fa-print"></i></button>' +
            '</div></td></tr>';
    }).join('');
}

async function instrutorExcluir(id) {
    if (!confirm('Excluir este instrutor?')) return;
    try {
        await dbFirestore.collection('instrutores').doc(id).delete();
        instrutores = instrutores.filter(i => i.id !== id);
        instrutorListar();
    } catch (e) {
        console.error('Erro ao excluir instrutor:', e);
        alert('Erro ao excluir instrutor: ' + e.message);
    }
}

function instrutorImprimir(id) {
    var i = instrutores.find(x => x.id === id);
    if (!i) return;
    var cpfFmt = i.cpf ? i.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-';
    var discHtml = (i.disciplinas || []).join(', ') || '-';
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Instrutor - ' + (i.nome || '') + '</title><style>' +
        'body{font-family:Arial,sans-serif;padding:40px;color:#333}' +
        'h2{color:#1a237e;border-bottom:2px solid #1a237e;padding-bottom:8px}' +
        '.field{margin:10px 0;display:flex;gap:8px}' +
        '.label{font-weight:700;min-width:140px;color:#555}' +
        '.val{color:#111}' +
        '.disc-tag{display:inline-block;background:#e3f2fd;color:#1565c0;padding:3px 10px;border-radius:4px;margin:2px;font-size:13px}' +
        '@media print{body{padding:20px}}' +
        '</style></head><body>' +
        '<h2><i class="fa-solid fa-chalkboard-user"></i> Ficha do Instrutor</h2>' +
        '<div class="field"><span class="label">Nome Completo:</span><span class="val">' + (i.nome || '-') + '</span></div>' +
        '<div class="field"><span class="label">Nome de Guerra:</span><span class="val">' + (i.guerra || '-') + '</span></div>' +
        '<div class="field"><span class="label">CPF:</span><span class="val">' + cpfFmt + '</span></div>' +
        '<div class="field"><span class="label">Matricula:</span><span class="val">' + (i.matricula || '-') + '</span></div>' +
        '<div class="field"><span class="label">Fone:</span><span class="val">' + (i.fone || '-') + '</span></div>' +
        '<div class="field"><span class="label">Email:</span><span class="val">' + (i.email || '-') + '</span></div>' +
        '<div class="field"><span class="label">Disciplinas:</span><span class="val">' + ((i.disciplinas || []).map(function(d){ return '<span class="disc-tag">' + d + '</span>'; }).join(' ') || '-') + '</span></div>' +
        '<script>window.onload=function(){window.print();}<\/script></body></html>';
    var win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(html);
    win.document.close();
}

async function instrutoresInicializar() {
    if (instrutores.length) {
        instrutorListar();
        return;
    }
    try {
        var snap = await dbFirestore.collection('instrutores').get();
        instrutores = [];
        snap.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            instrutores.push(data);
        });
        instrutorListar();
    } catch (e) {
        console.error('Erro ao carregar instrutores:', e);
    }
}
