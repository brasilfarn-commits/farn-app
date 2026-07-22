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
const FB_DISCIPLINAS = 'disciplinas';
const FB_AULAS = 'aulas';
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

function backupDisciplinas() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_DISCIPLINAS);
    batch.set(ref.doc('_index'), { count: disciplinas.length, timestamp: Date.now() });
    disciplinas.forEach((d) => {
        const id = d.id ? String(d.id) : String(Date.now() + Math.random());
        const copy = Object.assign({}, d);
        batch.set(ref.doc(id), copy, { merge: true });
    });
    batch.commit().catch(e => console.error('Erro ao salvar disciplinas:', e));
}

function backupAulas() {
    if (!firebaseReady && !firebaseError) return;
    const batch = dbFirestore.batch();
    const ref = dbFirestore.collection(FB_AULAS);
    batch.set(ref.doc('_index'), { count: aulas.length, timestamp: Date.now() });
    aulas.forEach((a) => {
        const id = a.id ? String(a.id) : String(Date.now() + Math.random());
        const copy = Object.assign({}, a);
        batch.set(ref.doc(id), copy, { merge: true });
    });
    batch.commit().catch(e => console.error('Erro ao salvar aulas:', e));
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
        backupDisciplinas();
        backupAulas();
        await dbFirestore.collection(FB_CANDIDATOS).get();
        await dbFirestore.collection(FB_TURMAS).get();
        await dbFirestore.collection(FB_USUARIOS).get();
        await dbFirestore.collection(FB_PROJETOS).get();
        await dbFirestore.collection(FB_DISCIPLINAS).get();
        await dbFirestore.collection(FB_AULAS).get();
        renderList();
        populateTurmaSelect();
        populateProjetoSelect();
        const fcProjeto = document.getElementById('fc-projeto');
        if (fcProjeto && fcProjeto.value) {
            fcProjetoOnTurmaChange();
        }
        if (typeof renderUsuariosList === 'function') renderUsuariosList();
        if (typeof renderProjetosList === 'function') renderProjetosList();
        if (typeof disciplinaRenderList === 'function') disciplinaRenderList();
        if (typeof renderAulasList === 'function') renderAulasList();
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
        const totalListeners = 6;
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

        dbFirestore.collection(FB_DISCIPLINAS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.id = doc.id;
                    result.push(data);
                }
            });
            disciplinas = result;
            if (firebaseReady && typeof disciplinaRenderList === 'function') disciplinaRenderList();
            checkReady();
        }, (error) => {
            console.error('Erro Firestore disciplinas:', error);
            checkReady();
        });

        dbFirestore.collection(FB_AULAS).onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.id = doc.id;
                    result.push(data);
                }
            });
            aulas = result;
            if (firebaseReady && typeof renderAulasList === 'function') renderAulasList();
            checkReady();
        }, (error) => {
            console.error('Erro Firestore aulas:', error);
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
            if (document.getElementById('remember-me').checked) saveCredentials(cpf, password);
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
        if (currentAluno && currentAluno.cpf) currentAluno.cpf = currentAluno.cpf.replace(/\D/g, '');
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-portal').classList.add('active');
        const primeiroNome = (aluno.nome || '').split(' ')[0];
        document.getElementById('portal-aluno-nome').textContent = primeiroNome;
        const mat = aluno.matricula || '---';
        document.getElementById('portal-aluno-matricula').textContent = 'Matricula: ' + mat;
        if (mat !== '---') {
            const qrEl = document.getElementById('portal-aluno-qr');
            qrEl.src = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(mat) + '&size=100x100&margin=2';
            qrEl.style.display = 'block';
        }
        setAlunoOnline(currentAluno.cpf);
        showPortalSection('noticias');
        portalLoadSidebarFoto();
        if (document.getElementById('remember-me').checked) saveCredentials(cpf, password);
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
}

function applyUserPermissions() {
    if (!currentUserData) return;
    const p = currentUserData.permissoes || [];
    const isGeral = currentUserData.cpf === ADMIN_CPF;
    const navItems = {
        'admin-pre-inscricao': p.includes('pre-inscricao') || isGeral,
        'admin-alunos': p.includes('alunos') || isGeral,
        'admin-disciplinas': p.includes('turmas') || isGeral,
        'admin-instrutores': p.includes('instrutores') || isGeral,
        'admin-relatorios': p.includes('relatorios') || isGeral,
        'admin-projetos': p.includes('projetos') || isGeral,
        'admin-form-projeto': p.includes('projetos') || isGeral,
        'admin-config': p.includes('config') || isGeral,
        'admin-recadastramento': p.includes('admin') || isGeral,
        'admin-recad-detalhe': p.includes('admin') || isGeral
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
    if (chatUnsub) { chatUnsub(); chatUnsub = null; chatLoaded = false; chatMode = 'turma'; chatPrivateTarget = null; chatPendingPhoto = null; chatEditingMsg = null; chatCtxMsg = null; chatConversations = {}; if (chatRecording) portalChatCancelRecording(); if (chatExpireInterval) { clearInterval(chatExpireInterval); chatExpireInterval = null; } if (chatConvRefreshInterval) { clearInterval(chatConvRefreshInterval); chatConvRefreshInterval = null; } }
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
    var maxW = 640, maxH = 800;
    var w = video.videoWidth, h = video.videoHeight;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    img.src = dataUrl;
    img.style.display = 'block';
    portalFoto3x4StopCamera();
    if (currentAluno && currentAluno.cpf) {
        setFoto(currentAluno.cpf, dataUrl);
        portalFoto3x4Msg('Foto capturada e enviada ao servidor!', 'success');
        portalLoadSidebarFoto();
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
    if (!dataUrl || dataUrl === '' || dataUrl === 'about:blank') {
        portalFoto3x4Msg('Nenhuma foto para enviar.', 'error');
        return;
    }
    portalFoto3x4Msg('Enviando foto...', 'info');
    var btn = document.getElementById('btn-foto3x4-enviar');
    btn.disabled = true;
    var cpf = currentAluno.cpf;
    setFoto(cpf, dataUrl);
    portalFoto3x4Msg('Foto enviada com sucesso!', 'success');
    portalLoadSidebarFoto();
    btn.style.display = 'none';
    btn.disabled = false;
}

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
    if (!confirm('Apagar sua foto 3x4?')) return;
    var cpf = currentAluno.cpf;
    try { localStorage.removeItem('foto3x4_' + cpf); } catch(e) {}
    try { localStorage.removeItem('farn_photo_' + cpf); } catch(e) {}
    var c = candidatos.find(function(x) { return x.cpf === cpf; });
    if (c) { c.photoDataUrl = null; c.hasPhoto = false; }
    currentAluno.photoDataUrl = null;
    currentAluno.hasPhoto = false;
    if (c && c.id) {
        dbFirestore.collection('candidatos').doc(String(c.id)).set({ photoDataUrl: null, hasPhoto: false }, { merge: true }).catch(function() {});
    }
    portalFoto3x4Nova();
    portalFoto3x4Msg('Foto apagada.', 'success');
    portalLoadSidebarFoto();
}

function portalFoto3x4LoadLocal() {
    if (!currentAluno || !currentAluno.cpf) return;
    var img = document.getElementById('portal-foto3x4-img');
    var placeholder = document.getElementById('portal-foto3x4-placeholder');
    getFoto(currentAluno.cpf).then(function(dataUrl) {
        if (dataUrl) {
            img.src = dataUrl;
            img.style.display = 'block';
            placeholder.style.display = 'none';
            document.getElementById('btn-foto3x4-iniciar').style.display = 'none';
            document.getElementById('btn-foto3x4-capturar').style.display = 'none';
            document.getElementById('btn-foto3x4-enviar').style.display = 'none';
            document.getElementById('btn-foto3x4-nova').style.display = '';
            document.getElementById('btn-foto3x4-apagar').style.display = '';
            portalFoto3x4Msg('Foto carregada do servidor.', 'info');
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
    });
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
    var img = document.getElementById('portal-sidebar-foto');
    var icon = document.getElementById('portal-sidebar-foto-icon');
    getFoto(currentAluno.cpf).then(function(dataUrl) {
        if (dataUrl) {
            img.src = dataUrl;
            img.style.display = 'block';
            icon.style.display = 'none';
        } else {
            img.style.display = 'none';
            icon.style.display = '';
        }
    });
    // Atualizar turma na sidebar
    var turmaEl = document.getElementById('portal-aluno-turma');
    if (turmaEl && currentAluno.turma) {
        turmaEl.innerHTML = '<i class="fa-solid fa-users"></i> ' + currentAluno.turma;
    }
}

var chatUnsub = null;
var chatLoaded = false;
var chatView = 'main';
var chatPrivateTarget = null;
var chatPendingPhoto = null;
var chatConversations = {};
var chatEditingMsg = null;
var chatCtxMsg = null;

var waEmojis = {
    'Frequentes': ['😀','😂','😍','🥰','😎','🤩','😭','🥺','🤔','😴','🤷','🙄','😏','🤦','💪','👍','👎','🙏','❤️','🔥','✅','⭐','🎉','😢','😡','🤮','💀','👀','🫡','🤝'],
    'Pessoas': ['👨','👩','🧑','👴','👵','👦','👧','👶','🦸','🧑‍🚒','👮','🧑‍🎓','🧑‍💼','🧑‍🔧','🧑‍⚕️','🧑‍🍳','🤷','🤦','👋','🤙','✌️','🤟','🤝','🫶','👏','🙌'],
    'Animais': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦆','🦉','🐴','🐝','🐛','🦋','🐢'],
    'Comida': ['🍕','🍔','🍟','🌭','🍿','🧀','🥚','🍳','🥞','🧇','🥓','🍗','🍖','🥩','🍝','🍜','🍛','🍣','🍱','🍙','🍚','🍘','🍥','🥮','🍢','🍡'],
    'Atividades': ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','🎯','🎮','🎲','🧩','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🥁','🎸','🎹'],
    'Objetos': ['📱','💻','⌨️','🖥️','🖨️','📷','📸','📹','🎥','📞','☎️','📺','📻','🔔','🔕','⏰','💡','🔦','🕯️','💰','💳','📦','🔑','🗝️','✂️','🔧'],
    'Simbolos': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','💫','✨','⚡','🔥','💥','❄️','🌈'],
    'Bandeiras': ['🇧🇷','🏳️','🏴','🏁','🚩','🎌','🏴‍☠️','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇪🇸','🇮🇹','🇯🇵','🇨🇳','🇰🇷','🇮🇳','🇲🇽','🇦🇷','🇨🇴','🇨🇱','🇵🇪','🇻🇪','🇺🇾']
};

function portalChatInit() {
    if (!currentAluno || !currentAluno.cpf) return;
    if (!chatLoaded) {
        chatLoaded = true;
        portalChatSetupInput();
        portalChatSetupContextMenu();
        portalChatStartExpireChecker();
    }
    portalChatShowMain();
}

function portalChatShowMain() {
    chatView = 'main';
    chatPrivateTarget = null;
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
    portalChatListen();
}

function portalChatOpenGroup() {
    chatView = 'turma';
    chatPrivateTarget = null;
    if (chatConvRefreshInterval) { clearInterval(chatConvRefreshInterval); chatConvRefreshInterval = null; }
    document.getElementById('wa-main-header').style.display = 'none';
    document.getElementById('wa-conversations-panel').style.display = 'none';
    document.getElementById('wa-contacts-panel').style.display = 'none';
    var chatViewEl = document.getElementById('wa-chat-view');
    chatViewEl.style.display = 'flex';
    document.getElementById('wa-chat-avatar').style.background = '#cfe9da';
    document.getElementById('wa-chat-avatar').innerHTML = '<i class="fa-solid fa-users" style="color:#008069"></i>';
    document.getElementById('wa-chat-name').textContent = 'Chat da Turma';
    document.getElementById('wa-chat-status').textContent = 'online';
    portalChatListen();
}

function portalChatOpenPrivate(candidato) {
    chatView = 'privado';
    chatPrivateTarget = candidato;
    if (chatConvRefreshInterval) { clearInterval(chatConvRefreshInterval); chatConvRefreshInterval = null; }
    document.getElementById('wa-main-header').style.display = 'none';
    document.getElementById('wa-conversations-panel').style.display = 'none';
    document.getElementById('wa-contacts-panel').style.display = 'none';
    var chatViewEl = document.getElementById('wa-chat-view');
    chatViewEl.style.display = 'flex';
    var nome = candidato.nome || 'Aluno';
    var cores = ['#6b4fbb','#06a77d','#d45c2c','#d93d63','#7a6f2b','#0078a8','#9c3fbf'];
    var hash = 0;
    for (var i = 0; i < nome.length; i++) hash = ((hash << 5) - hash) + nome.charCodeAt(i);
    var cor = cores[Math.abs(hash) % cores.length];
    var initials = nome.split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
    document.getElementById('wa-chat-avatar').style.background = cor;
    document.getElementById('wa-chat-avatar').innerHTML = initials;
    document.getElementById('wa-chat-name').textContent = nome;
    document.getElementById('wa-chat-status').textContent = 'online';
    portalChatListen();
}

function portalChatGoToContacts() {
    if (chatConvRefreshInterval) { clearInterval(chatConvRefreshInterval); chatConvRefreshInterval = null; }
    document.getElementById('wa-conversations-panel').style.display = 'none';
    document.getElementById('wa-contacts-panel').style.display = '';
    portalChatLoadContacts();
}

function portalChatBackToMain() {
    portalChatShowMain();
}

function portalChatGetCurrentCol() {
    if (!currentAluno || !currentAluno.cpf) return null;
    return dbFirestore.collection('chatAdmin').doc(currentAluno.cpf).collection('msgs');
}

function portalChatListen() {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
    var col = portalChatGetCurrentCol();
    if (!col) return;
    var container = document.getElementById('portal-chat-messages');
    container.innerHTML = '<div class="wa-empty"><div class="wa-empty-icon"><i class="fa-solid fa-spinner fa-spin"></i></div><p>Carregando...</p></div>';
    chatUnsub = col.orderBy('hora').onSnapshot(function(snap) {
        var msgs = [];
        snap.forEach(function(doc) { msgs.push(Object.assign({ _id: doc.id }, doc.data())); });
        portalChatRender(msgs);
    }, function() {
        container.innerHTML = '<div class="wa-empty"><div class="wa-empty-icon" style="background:#fef0f0;color:#e53935"><i class="fa-solid fa-triangle-exclamation"></i></div><p>Erro ao carregar.</p></div>';
    });
}

function portalChatRender(msgs) {
    var container = document.getElementById('portal-chat-messages');
    if (msgs.length === 0) {
        container.innerHTML = '<div class="wa-empty"><div class="wa-empty-icon"><i class="fa-solid fa-comment-dots"></i></div><p>Envie sua mensagem para a equipe FARN</p></div>';
        return;
    }
    var wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 60;
    container.innerHTML = '';
    var lastDate = '';
    msgs.forEach(function(m) {
        var dt = m.hora && m.hora.seconds ? new Date(m.hora.seconds * 1000) : new Date();
        var dateStr = dt.toLocaleDateString('pt-BR');
        if (dateStr !== lastDate) {
            lastDate = dateStr;
            var divider = document.createElement('div');
            divider.className = 'wa-date-divider';
            divider.innerHTML = '<span>' + dateStr + '</span>';
            container.appendChild(divider);
        }
        var isMe = m.remetente === 'aluno';
        var wrap = document.createElement('div');
        wrap.className = 'wa-bubble-wrap' + (isMe ? ' me' : ' other');
        var senderHtml = '';
        if (!isMe) {
            senderHtml = '<div class="wa-sender-name" style="color:#f57c00">Administracao FARN</div>';
        }
        var time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        var bodyHtml = '';
        if (m.texto) bodyHtml += '<span class="wa-text">' + m.texto.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
        wrap.innerHTML = senderHtml + '<div class="wa-bubble">' + bodyHtml + '<span class="wa-meta"><span class="wa-time">' + time + '</span></span></div>';
        container.appendChild(wrap);
    });
    if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

function portalChatLoadAllConversations() {
    portalChatListen();
}

function portalChatRenderConversations() {}

function portalChatLoadContacts() {
    if (!currentAluno) return;
    var list = document.getElementById('wa-contacts-list');
    var approved = candidatos.filter(function(c) {
        return c.cpf !== currentAluno.cpf && (c.status === 'aprovado' || c.status === 'Aprovado');
    });
    if (currentAluno.cpf !== ADMIN_CPF) {
        approved.unshift({ cpf: ADMIN_CPF, nome: 'Administrador Geral', matricula: 'ADMIN' });
    }
    approved.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
    if (approved.length === 0) { list.innerHTML = '<div class="wa-contacts-empty"><i class="fa-solid fa-user-slash"></i><p>Nenhum aluno aprovado.</p></div>'; return; }
    list.innerHTML = '';
    var cores = ['#6b4fbb','#06a77d','#d45c2c','#d93d63','#7a6f2b','#0078a8','#9c3fbf','#c04060','#2e7d32','#6a1b9a'];
    approved.forEach(function(c) {
        var nome = c.nome || 'Aluno';
        var hash = 0;
        for (var i = 0; i < nome.length; i++) hash = ((hash << 5) - hash) + nome.charCodeAt(i);
        var cor = cores[Math.abs(hash) % cores.length];
        var initials = nome.split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
        var item = document.createElement('div');
        item.className = 'wa-contact-item';
        item.setAttribute('data-nome', nome.toLowerCase());
        item.innerHTML = '<div class="wa-contact-avatar" style="background:' + cor + '">' + initials + '</div><div class="wa-contact-info"><div class="wa-contact-name">' + nome + '</div><div class="wa-contact-mat">' + (c.matricula || '') + '</div></div>';
        item.onclick = function() { document.getElementById('wa-contacts-panel').style.display = 'none'; portalChatOpenPrivate(c); };
        list.appendChild(item);
    });
}

function portalChatFilterContacts() {
    var search = document.getElementById('wa-contacts-search').value.toLowerCase();
    document.querySelectorAll('.wa-contact-item').forEach(function(item) {
        item.style.display = (item.getAttribute('data-nome') || '').includes(search) ? '' : 'none';
    });
}

function portalChatDeleteAll() {
    var label = chatView === 'turma' ? 'todas as mensagens do grupo' : 'esta conversa';
    if (!confirm('Apagar ' + label + '? Esta acao nao pode ser desfeita.')) return;
    var col = portalChatGetCurrentCol();
    if (!col) return;
    col.get().then(function(snap) {
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) { batch.delete(doc.ref); });
        return batch.commit();
    }).then(function() {
        if (chatView === 'privado' && chatPrivateTarget) delete chatConversations[chatPrivateTarget.cpf];
        alert('Conversa apagada.');
    }).catch(function(e) { alert('Erro ao apagar: ' + e.message); });
}

var portalChatInput = null;
function portalChatSetupInput() {
    portalChatInput = document.getElementById('portal-chat-input');
}

function portalChatSend() {
    if (!currentAluno) return;
    var input = document.getElementById('portal-chat-input');
    var texto = input.value.trim();
    if (!texto) return;
    input.value = '';

    var col = portalChatGetCurrentCol();
    if (!col) return;

    var msgData = {
        texto: texto,
        remetente: 'aluno',
        nome: currentAluno.nome || 'Aluno',
        cpf: currentAluno.cpf,
        hora: firebase.firestore.FieldValue.serverTimestamp()
    };

    col.add(msgData).then(function() {
        return dbFirestore.collection('chatAdmin').doc(currentAluno.cpf).set({
            cpf: currentAluno.cpf,
            nome: currentAluno.nome || 'Aluno',
            projeto: currentAluno.projeto || currentAluno.turma || '',
            ultimaMsg: texto,
            ultimaHora: firebase.firestore.FieldValue.serverTimestamp(),
            tipo: 'aluno'
        }, { merge: true });
    }).catch(function(e) { console.error('Erro ao enviar:', e); });
}

function portalChatSetupContextMenu() {
    var container = document.getElementById('portal-chat-messages');
    if (!container) return;
    container.addEventListener('click', function(e) {
        var bubble = e.target.closest('.wa-bubble');
        if (!bubble) { portalChatCloseContextMenu(); return; }
        var msgId = bubble.getAttribute('data-msgid');
        var msgCpf = bubble.getAttribute('data-cpf');
        var msgTexto = bubble.getAttribute('data-texto');
        if (!msgId || msgCpf !== currentAluno.cpf) { portalChatCloseContextMenu(); return; }
        e.preventDefault();
        e.stopPropagation();
        portalChatCtxMsg = { _id: msgId, cpf: msgCpf, texto: msgTexto };
        var menu = document.getElementById('wa-context-menu');
        var rect = bubble.getBoundingClientRect();
        menu.style.display = 'block';
        menu.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
        menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 120) + 'px';
    });
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.wa-context-menu')) portalChatCloseContextMenu();
    });
}

function portalChatCloseContextMenu() {
    var menu = document.getElementById('wa-context-menu');
    if (menu) menu.style.display = 'none';
    portalChatCtxMsg = null;
}

function portalChatCtxAction(action) {
    portalChatCloseContextMenu();
    if (!portalChatCtxMsg) return;
    var col = portalChatGetCurrentCol();
    if (!col) return;
    if (action === 'edit') {
        chatEditingMsg = portalChatCtxMsg;
        var editBar = document.getElementById('wa-edit-bar');
        var editBarText = document.getElementById('wa-edit-bar-text');
        editBar.style.display = '';
        editBarText.textContent = 'Editando: ' + (portalChatCtxMsg.texto || '').substring(0, 40);
        var input = document.getElementById('portal-chat-input');
        input.value = portalChatCtxMsg.texto || '';
        input.focus();
        var micBtn = document.getElementById('portal-chat-mic-btn');
        var sendBtn = document.getElementById('portal-chat-send-btn');
        if (micBtn) micBtn.style.display = 'none';
        if (sendBtn) sendBtn.style.display = '';
    } else if (action === 'deleteForMe') {
        if (!confirm('Apagar esta mensagem apenas para voce?')) return;
        col.doc(portalChatCtxMsg._id).update({
            deletedFor: firebase.firestore.FieldValue.arrayUnion(currentAluno.cpf)
        }).catch(function(e) { alert('Erro ao apagar: ' + e.message); });
    } else if (action === 'deleteForAll') {
        if (!confirm('Apagar esta mensagem para todos?')) return;
        col.doc(portalChatCtxMsg._id).delete().catch(function(e) { alert('Erro ao apagar: ' + e.message); });
    }
    portalChatCtxMsg = null;
}

function portalChatCancelEdit() {
    chatEditingMsg = null;
    var editBar = document.getElementById('wa-edit-bar');
    if (editBar) editBar.style.display = 'none';
    var input = document.getElementById('portal-chat-input');
    if (input) input.value = '';
}

function portalChatToggleEmoji() {
    var picker = document.getElementById('wa-emoji-picker');
    if (picker.style.display === 'none' || !picker.style.display) {
        if (!picker.innerHTML) {
            var html = '';
            Object.keys(waEmojis).forEach(function(cat) {
                html += '<div class="wa-emoji-category-title">' + cat + '</div><div class="wa-emoji-grid">';
                waEmojis[cat].forEach(function(em) {
                    html += '<button class="wa-emoji-btn" onclick="portalChatInsertEmoji(\'' + em + '\')">' + em + '</button>';
                });
                html += '</div>';
            });
            picker.innerHTML = html;
        }
        picker.style.display = '';
    } else {
        picker.style.display = 'none';
    }
}

function portalChatInsertEmoji(em) {
    var input = document.getElementById('portal-chat-input');
    var pos = input.selectionStart || input.value.length;
    input.value = input.value.substring(0, pos) + em + input.value.substring(pos);
    input.focus();
    input.selectionStart = input.selectionEnd = pos + em.length;
    input.dispatchEvent(new Event('input'));
}

function portalChatOpenCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('Camera nao disponivel.'); return; }
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    overlay.innerHTML = '<video id="chat-camera-video" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video><div style="margin-top:16px;display:flex;gap:12px;align-items:center"><button id="chat-camera-switch" style="padding:12px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:18px;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-camera-rotate"></i></button><button id="chat-camera-capture" style="padding:14px 32px;border:none;border-radius:50%;background:#008069;color:#fff;font-size:16px;font-weight:700;cursor:pointer">Capturar</button><button id="chat-camera-cancel" style="padding:14px 24px;border:none;border-radius:8px;background:#444;color:#fff;font-size:14px;cursor:pointer">Cancelar</button></div>';
    document.body.appendChild(overlay);
    var video = document.getElementById('chat-camera-video');
    var stream = null;
    var currentFacing = 'user';
    function startCam(facing) {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 320 }, height: { ideal: 240 } } });
    }
    startCam(currentFacing).then(function(s) { stream = s; video.srcObject = stream; }).catch(function(err) { document.body.removeChild(overlay); alert('Camera: ' + err.message); });
    document.getElementById('chat-camera-switch').onclick = function() {
        currentFacing = currentFacing === 'user' ? 'environment' : 'user';
        startCam(currentFacing).then(function(s) { stream = s; video.srcObject = stream; }).catch(function() { currentFacing = currentFacing === 'user' ? 'environment' : 'user'; });
    };
    document.getElementById('chat-camera-capture').onclick = function() {
        var canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 240;
        canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
        canvas.toBlob(function(blob) {
            var reader = new FileReader();
            reader.onloadend = function() {
                chatPendingPhoto = reader.result;
                document.getElementById('wa-photo-preview-img').src = chatPendingPhoto;
                document.getElementById('wa-photo-preview').style.display = '';
                var micBtn = document.getElementById('portal-chat-mic-btn');
                var sendBtn = document.getElementById('portal-chat-send-btn');
                if (micBtn) micBtn.style.display = 'none';
                if (sendBtn) sendBtn.style.display = '';
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.3);
    };
    document.getElementById('chat-camera-cancel').onclick = function() {
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        document.body.removeChild(overlay);
    };
}

function portalChatRemovePhoto() {
    chatPendingPhoto = null;
    var preview = document.getElementById('wa-photo-preview');
    if (preview) preview.style.display = 'none';
    var check = document.getElementById('wa-viewonce-check');
    if (check) check.checked = false;
    var input = document.getElementById('portal-chat-input');
    var micBtn = document.getElementById('portal-chat-mic-btn');
    var sendBtn = document.getElementById('portal-chat-send-btn');
    if (input && micBtn && sendBtn && !input.value.trim()) { micBtn.style.display = ''; sendBtn.style.display = 'none'; }
}

function portalChatExpandPhoto(src) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:999999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:95%;max-height:90%;border-radius:4px;';
    overlay.appendChild(img);
    overlay.onclick = function() { document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
}

var chatRecording = false;
var chatMediaRecorder = null;
var chatAudioChunks = [];
var chatRecStream = null;
var chatRecTimer = null;
var chatRecSeconds = 0;
var chatRecMaxSeconds = 30;
var chatAudioIdCounter = 0;
var chatActiveAudio = null;
var chatExpireInterval = null;
var chatConvRefreshInterval = null;

function portalChatToggleRecording() { chatRecording ? portalChatStopRecording() : portalChatStartRecording(); }

function portalChatStartRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('Microfone nao disponivel.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        chatRecStream = stream;
        chatAudioChunks = [];
        var options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : (MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {});
        chatMediaRecorder = new MediaRecorder(stream, options);
        chatMediaRecorder.ondataavailable = function(e) { if (e.data && e.data.size > 0) chatAudioChunks.push(e.data); };
        chatMediaRecorder.onstop = function() { stream.getTracks().forEach(function(t) { t.stop(); }); };
        chatMediaRecorder.start(500);
        chatRecording = true;
        chatRecSeconds = 0;
        document.getElementById('wa-recording-bar').style.display = '';
        document.getElementById('wa-rec-timer').textContent = '00:00';
        document.querySelector('.wa-input-area').style.display = 'none';
        document.getElementById('wa-emoji-picker').style.display = 'none';
        chatRecTimer = setInterval(function() {
            chatRecSeconds++;
            var m = Math.floor(chatRecSeconds / 60);
            var s = chatRecSeconds % 60;
            document.getElementById('wa-rec-timer').textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            if (chatRecSeconds >= chatRecMaxSeconds) portalChatStopRecording();
        }, 1000);
    }).catch(function(err) { alert('Microfone: ' + err.message); });
}

function portalChatStopRecording() {
    if (!chatRecording || !chatMediaRecorder) return;
    chatRecording = false;
    clearInterval(chatRecTimer);
    document.getElementById('wa-recording-bar').style.display = 'none';
    document.querySelector('.wa-input-area').style.display = '';
    chatMediaRecorder.onstop = function() {
        if (chatRecStream) chatRecStream.getTracks().forEach(function(t) { t.stop(); });
        if (chatAudioChunks.length === 0) return;
        portalChatSendAudio(new Blob(chatAudioChunks, { type: chatMediaRecorder.mimeType || 'audio/webm' }));
        chatAudioChunks = [];
    };
    chatMediaRecorder.stop();
}

function portalChatCancelRecording() {
    if (!chatRecording || !chatMediaRecorder) return;
    chatRecording = false;
    clearInterval(chatRecTimer);
    chatAudioChunks = [];
    document.getElementById('wa-recording-bar').style.display = 'none';
    document.querySelector('.wa-input-area').style.display = '';
    chatMediaRecorder.onstop = function() { if (chatRecStream) chatRecStream.getTracks().forEach(function(t) { t.stop(); }); };
    chatMediaRecorder.stop();
}

function portalChatSendAudio(blob) {
    if (!currentAluno || !blob) return;
    var reader = new FileReader();
    reader.onloadend = function() {
        var dataUrl = reader.result;
        if (!dataUrl) return;
        var byteLen = Math.ceil((dataUrl.length - 'data:audio/webm;base64,'.length) * 3 / 4);
        if (byteLen > 900000) { alert('Audio muito grande.'); return; }
        var col = portalChatGetCurrentCol();
        if (!col) return;
        col.add({
            audioDataUrl: dataUrl, audioDuracao: chatRecSeconds,
            audioId: 'au_' + (++chatAudioIdCounter) + '_' + Date.now(),
            remetente: currentAluno.nome || 'Aluno', cpf: currentAluno.cpf, hora: new Date()
        }).catch(function(e) { alert('Erro audio: ' + e.message); });
    };
    reader.readAsDataURL(blob);
}

function portalChatPlayAudio(audioId, btn) {
    var audio = document.getElementById('audio_' + audioId);
    if (!audio) return;
    if (chatActiveAudio && chatActiveAudio !== audio) {
        chatActiveAudio.pause(); chatActiveAudio.currentTime = 0;
        var prevBtn = chatActiveAudio.parentElement ? chatActiveAudio.parentElement.querySelector('.wa-audio-play') : null;
        if (prevBtn) { prevBtn.classList.remove('playing'); prevBtn.innerHTML = '<i class="fa-solid fa-play"></i>'; }
    }
    if (audio.paused) {
        audio.play(); chatActiveAudio = audio;
        btn.classList.add('playing'); btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        audio.pause();
        btn.classList.remove('playing'); btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
    audio.onended = function() {
        btn.classList.remove('playing'); btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        chatActiveAudio = null;
        btn.closest('.wa-audio-player').querySelectorAll('.wa-audio-wave span').forEach(function(b) { b.classList.remove('active'); });
    };
    var waveBars = btn.closest('.wa-audio-player').querySelectorAll('.wa-audio-wave span');
    if (!audio.paused) {
        audio.ontimeupdate = function() {
            var pct = audio.duration ? audio.currentTime / audio.duration : 0;
            var activeCount = Math.floor(pct * waveBars.length);
            waveBars.forEach(function(b, i) { b.classList.toggle('active', i <= activeCount); });
        };
    }
}

function portalChatFormatTime(sec) {
    sec = Math.floor(sec || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function portalChatGenWaveform(count) {
    var bars = '';
    for (var i = 0; i < count; i++) bars += '<span style="height:' + (4 + Math.floor(Math.random() * 18)) + 'px"></span>';
    return bars;
}

function portalChatCheckExpired() {
    var now = Date.now();
    var expiredIds = [];
    document.querySelectorAll('.wa-bubble[data-audioid]').forEach(function(bubble) {
        var audioId = bubble.getAttribute('data-audioid');
        var criadoEm = parseInt(bubble.getAttribute('data-criado') || '0', 10);
        if (criadoEm && (now - criadoEm) > 300000) {
            var wrap = bubble.closest('.wa-bubble-wrap');
            if (wrap) {
                var inner = wrap.querySelector('.wa-audio-bubble') || bubble;
                inner.innerHTML = '<div class="wa-audio-expired"><i class="fa-solid fa-clock-rotate-left"></i> Audio expirado</div>';
                bubble.removeAttribute('data-audioid');
            }
            expiredIds.push(audioId);
        }
    });
    if (expiredIds.length > 0) portalChatDeleteExpiredFromFirestore(expiredIds);
}

function portalChatDeleteExpiredFromFirestore(ids) {
    if (!ids.length) return;
    var col = portalChatGetCurrentCol();
    if (!col) return;
    ids.forEach(function(aid) {
        col.where('audioId', '==', aid).get().then(function(snap) {
            snap.forEach(function(doc) { doc.ref.delete().catch(function() {}); });
        }).catch(function() {});
    });
}

function portalChatStartExpireChecker() {
    if (chatExpireInterval) return;
    chatExpireInterval = setInterval(portalChatCheckExpired, 15000);
}

function portalChatOpenViewOnce(el, vid) {
    el.onclick = null;
    var wrap = el.closest('.wa-bubble-wrap');
    if (!wrap) return;
    var bubble = wrap.querySelector('.wa-bubble');
    if (!bubble) return;
    var imgEl = bubble.querySelector('.wa-photo-viewonce');
    if (!imgEl) return;
    var badge = bubble.querySelector('.wa-viewonce-badge');
    imgEl.outerHTML = '<div class="wa-photo-viewonce opened"><i class="fa-solid fa-eye-slash"></i><span>Visualizado</span></div>';
    if (badge) badge.remove();
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.wa-emoji-picker') && !e.target.closest('.wa-icon-btn')) {
        var picker = document.getElementById('wa-emoji-picker');
        if (picker) picker.style.display = 'none';
    }
});

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
            (section === 'foto3x4' && n.textContent.trim() === 'Foto 3x4') ||
            (section === 'chat' && n.textContent.trim() === 'Chat Turma')) {
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
            (section === 'foto3x4' && text === 'foto') ||
            (section === 'chat' && text === 'chat')) {
            n.classList.add('active');
        }
    });
    if (section === 'foto3x4') portalFoto3x4LoadLocal();
    if (section === 'chat') portalChatInit();
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
    try {
        currentAluno.email = email;
        currentAluno.whatsapp = whatsapp;
        const idx = candidatos.findIndex(function(c) { return c.cpf === currentAluno.cpf; });
        if (idx !== -1) {
            candidatos[idx].email = email;
            candidatos[idx].whatsapp = whatsapp;
        }
        if (portalAlunoFotoDataUrl) setFoto(currentAluno.cpf, portalAlunoFotoDataUrl);
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
    const titles = { 'admin-home': 'Inicio', 'admin-pre-inscricao': 'Pre-Inscricao', 'admin-form-candidato': editingIndex !== null ? 'Editar Pre-Cadastro' : 'Novo Pre-Cadastro', 'admin-alunos': 'Alunos', 'admin-disciplinas': 'Disciplinas e Aulas', 'admin-instrutores': 'Instrutores', 'admin-relatorios': 'Relatorios', 'admin-projetos': 'Projetos', 'admin-form-projeto': editingProjetoIndex !== null ? 'Editar Projeto' : 'Novo Projeto', 'admin-config': 'Configuracoes', 'admin-usuarios': 'Usuarios', 'admin-form-usuario': 'Novo Usuario', 'admin-recadastramento': 'Campanha de Recadastramento', 'admin-recad-detalhe': 'Detalhe do Recadastramento', 'admin-chat-portais': 'Chat dos Portais' };
    document.getElementById('admin-page-title').textContent = titles[sectionId] || 'Admin';
    if (sectionId === 'admin-disciplinas') {
        carregarDisciplinas().then(() => carregarAulas()).then(() => disciplinaRenderList());
    }
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
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#f57c00;margin-right:8px"></i> Novo Pre-Cadastro';
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
            ${mat ? `<div class="detail-item full"><span class="detail-label">Matricula</span><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><span class="detail-value" style="color:#f57c00;font-size:20px;font-weight:800;letter-spacing:2px;font-family:'Courier New',monospace">${mat}</span><img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(mat)}&size=100x100&margin=2" alt="QR Code Matricula" style="width:80px;height:80px;border:1px solid #eee;border-radius:8px;padding:4px;background:#fff"></div></div>` : ''}
            <div class="detail-item"><span class="detail-label">Turma</span><span class="detail-value">${c.turma||'---'}${c.turma ? '<br><small style="color:#888;font-size:7px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</span></div>
            <div class="detail-item"><span class="detail-label">Projeto</span><span class="detail-value" style="color:#ff9800;font-weight:600">${c.projeto||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Tipo</span><span class="detail-value" style="color:${(c.tipoPessoa||'A')==='F'?'#ff9800':'#2196f3'};font-weight:700">${(c.tipoPessoa||'A')==='F'?'Formado (A)':'Academico (A)'}</span></div>
            <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${c.status}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastro</span><span class="detail-value">${c.dataCadastro}</span></div>
            <div class="detail-item full"><span class="detail-label">Data/Hora 1o Cadastro</span><span class="detail-value" style="color:#4caf50;font-weight:600">${c.dataHoraCadastro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastrado por</span><span class="detail-value" style="color:#f57c00;font-weight:600">${c.cadastradoPor || '---'}</span></div>
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
    projetos.forEach(p => {
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
                <td style="color:#f57c00;font-weight:800;letter-spacing:1px;font-family:'Courier New',monospace;font-size:13px">${mat || '-'}</td>
                <td style="color:#ff9800;font-weight:600">${c.projeto || '-'}</td>
                <td>${actionsHtml}</td>
            </tr>`;
        }

        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${onlineDot}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td style="color:#f57c00;font-weight:800;letter-spacing:1px;font-family:'Courier New',monospace;font-size:13px">${mat || '-'}</td>
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
                setFoto(currentAluno.cpf, reader.result);
            };
            reader.readAsDataURL(blob);
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

// ===== CADASTRO DE DISCIPLINAS E AULAS =====
let disciplinas = [];
let aulas = [];
let currentDisciplinaId = null;
let editingAulaId = null;

function disciplinaLimparForm() {
    document.getElementById('disciplina-nome').value = '';
    document.getElementById('disciplina-codigo').value = '';
    document.getElementById('disciplina-carga').value = '';
    document.getElementById('disciplina-descricao').value = '';
    currentDisciplinaId = null;
}

async function disciplinaSalvar() {
    const nome = document.getElementById('disciplina-nome').value.trim();
    if (!nome) { alert('Informe o nome da disciplina'); return; }
    const dados = {
        nome: nome,
        codigo: document.getElementById('disciplina-codigo').value.trim(),
        cargaHoraria: document.getElementById('disciplina-carga').value.trim(),
        descricao: document.getElementById('disciplina-descricao').value.trim(),
        atualizadoEm: new Date().toISOString()
    };
    try {
        if (currentDisciplinaId) {
            await dbFirestore.collection('disciplinas').doc(currentDisciplinaId).update(dados);
            const idx = disciplinas.findIndex(d => d.id === currentDisciplinaId);
            if (idx !== -1) Object.assign(disciplinas[idx], dados);
            alert('Disciplina atualizada com sucesso!');
        } else {
            dados.criadoEm = new Date().toISOString();
            const ref = await dbFirestore.collection('disciplinas').add(dados);
            dados.id = ref.id;
            disciplinas.push(dados);
            alert('Disciplina cadastrada com sucesso!');
        }
        disciplinaLimparForm();
        disciplinaRenderList();
    } catch (e) {
        console.error('Erro ao salvar disciplina:', e);
        alert('Erro ao salvar disciplina: ' + e.message);
    }
}

function disciplinaRenderList() {
    const tbody = document.getElementById('disciplinas-table-body');
    const empty = document.getElementById('disciplinas-empty');
    const lista = document.getElementById('disciplinas-lista');
    if (!tbody) return;
    if (!disciplinas.length) {
        if (empty) empty.style.display = 'block';
        if (lista) lista.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (lista) lista.style.display = 'block';
    tbody.innerHTML = disciplinas.map((d, i) => {
        const aulasCount = aulas.filter(a => a.disciplinaId === d.id).length;
        return `<tr>
            <td style="font-weight:600">${d.nome}</td>
            <td>${d.codigo || '-'}</td>
            <td>${d.cargaHoraria ? d.cargaHoraria + 'h' : '-'}</td>
            <td>${d.descricao || '-'}</td>
            <td><span class="badge blue">${aulasCount} aula(s)</span></td>
            <td><div class="actions-cell">
                <button class="btn-icon" title="Gerenciar Aulas" onclick="disciplinaGerenciarAulas('${d.id}')"><i class="fa-solid fa-calendar-days"></i></button>
                <button class="btn-icon" title="Editar" onclick="disciplinaEditar('${d.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="disciplinaExcluir('${d.id}')"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

function disciplinaEditar(id) {
    const d = disciplinas.find(d => d.id === id);
    if (!d) return;
    currentDisciplinaId = id;
    document.getElementById('disciplina-nome').value = d.nome || '';
    document.getElementById('disciplina-codigo').value = d.codigo || '';
    document.getElementById('disciplina-carga').value = d.cargaHoraria || '';
    document.getElementById('disciplina-descricao').value = d.descricao || '';
}

async function disciplinaExcluir(id) {
    if (!confirm('Excluir esta disciplina e todas as suas aulas?')) return;
    try {
        await dbFirestore.collection('disciplinas').doc(id).delete();
        disciplinas = disciplinas.filter(d => d.id !== id);
        aulas = aulas.filter(a => a.disciplinaId !== id);
        disciplinaRenderList();
        alert('Disciplina excluída com sucesso!');
    } catch (e) {
        console.error('Erro ao excluir disciplina:', e);
        alert('Erro ao excluir disciplina: ' + e.message);
    }
}

function disciplinaGerenciarAulas(disciplinaId) {
    currentDisciplinaId = disciplinaId;
    renderAulasList();
}

function renderAulasList() {
    const tbody = document.getElementById('aulas-table-body');
    const empty = document.getElementById('aulas-empty');
    const lista = document.getElementById('aulas-lista');
    if (!tbody) return;
    const filtered = aulas.filter(a => a.disciplinaId === currentDisciplinaId);
    if (!filtered.length) {
        if (empty) empty.style.display = 'block';
        if (lista) lista.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (lista) lista.style.display = 'block';
    tbody.innerHTML = filtered.sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.hora || '').localeCompare(b.hora || '')).map((a, i) => {
        const dataFormatada = a.data ? new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        return `<tr>
            <td style="text-align:center;font-weight:700;color:#888">${i + 1}</td>
            <td style="font-weight:600">${a.nome || '-'}</td>
            <td><span class="badge green">${a.turma || '-'}</span></td>
            <td>${dataFormatada}</td>
            <td>${a.hora || '-'}</td>
            <td><div class="actions-cell">
                <button class="btn-icon" title="Editar" onclick="aulaEditar('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="aulaExcluir('${a.id}')"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

function aulaPopulateTurmaCheckboxes(selectedArr) {
    const container = document.getElementById('aula-turmas-checks');
    if (!container) return;
    container.innerHTML = '';
    if (!turmas.length) {
        container.innerHTML = '<span style="color:#666;font-size:13px">Nenhuma turma cadastrada</span>';
        return;
    }
    turmas.forEach(t => {
        const checked = selectedArr && selectedArr.includes(t.nome) ? 'checked' : '';
        container.innerHTML += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;background:#1e1e1e;border:1px solid #333;border-radius:6px;padding:4px 10px;font-size:13px;color:#ccc;white-space:nowrap"><input type="checkbox" value="' + t.nome + '" class="aula-turma-check" ' + checked + '> ' + t.nome + '</label>';
    });
}

function aulaGetSelectedTurmas() {
    return Array.from(document.querySelectorAll('.aula-turma-check:checked')).map(cb => cb.value);
}

function aulaAbrirModalNova() {
    if (!currentDisciplinaId) { alert('Selecione uma disciplina primeiro'); return; }
    editingAulaId = null;
    document.getElementById('aula-id').value = '';
    document.getElementById('aula-disciplina-id').value = currentDisciplinaId;
    document.getElementById('aula-nome').value = '';
    aulaPopulateTurmaCheckboxes([]);
    document.getElementById('aula-data').value = '';
    document.getElementById('aula-hora').value = '';
    document.getElementById('aula-obs').value = '';
    document.getElementById('aula-form-title').innerHTML = '<i class="fa-solid fa-plus" style="color:#4caf50;margin-right:8px"></i> Nova Aula';
    document.getElementById('modal-aula-overlay').classList.remove('hidden');
}

function aulaEditar(aulaId) {
    const a = aulas.find(a => a.id === aulaId);
    if (!a) return;
    editingAulaId = aulaId;
    document.getElementById('aula-id').value = aulaId;
    document.getElementById('aula-disciplina-id').value = a.disciplinaId;
    document.getElementById('aula-nome').value = a.nome || '';
    const turmasArr = Array.isArray(a.turmas) ? a.turmas : (a.turma ? [a.turma] : []);
    aulaPopulateTurmaCheckboxes(turmasArr);
    document.getElementById('aula-data').value = a.data || '';
    document.getElementById('aula-hora').value = a.hora || '';
    document.getElementById('aula-obs').value = a.observacoes || '';
    document.getElementById('aula-form-title').innerHTML = '<i class="fa-solid fa-pen" style="color:#4caf50;margin-right:8px"></i> Editar Aula';
    document.getElementById('modal-aula-overlay').classList.remove('hidden');
}

async function handleAulaSubmit(e) {
    e.preventDefault();
    const nome = document.getElementById('aula-nome').value.trim();
    const data = document.getElementById('aula-data').value;
    const hora = document.getElementById('aula-hora').value;
    const turmasSelecionadas = aulaGetSelectedTurmas();
    if (!nome || !data || !hora || !turmasSelecionadas.length) { alert('Preencha nome, ao menos uma turma, data e hora da aula'); return; }
    const dados = {
        disciplinaId: currentDisciplinaId,
        nome: nome,
        turmas: turmasSelecionadas,
        turma: turmasSelecionadas.join(', '),
        data: data,
        hora: hora,
        observacoes: document.getElementById('aula-obs').value.trim(),
        atualizadoEm: new Date().toISOString()
    };
    try {
        if (editingAulaId) {
            await dbFirestore.collection('aulas').doc(editingAulaId).update(dados);
            const idx = aulas.findIndex(a => a.id === editingAulaId);
            if (idx !== -1) Object.assign(aulas[idx], dados);
        } else {
            dados.criadoEm = new Date().toISOString();
            const ref = await dbFirestore.collection('aulas').add(dados);
            dados.id = ref.id;
            aulas.push(dados);
        }
        closeAulaModal();
        renderAulasList();
    } catch (e) {
        console.error('Erro ao salvar aula:', e);
        alert('Erro ao salvar aula: ' + e.message);
    }
}

async function aulaExcluir(aulaId) {
    if (!confirm('Excluir esta aula?')) return;
    try {
        await dbFirestore.collection('aulas').doc(aulaId).delete();
        aulas = aulas.filter(a => a.id !== aulaId);
        renderAulasList();
    } catch (e) {
        console.error('Erro ao excluir aula:', e);
        alert('Erro ao excluir aula: ' + e.message);
    }
}

function closeAulaModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-aula-overlay').classList.add('hidden');
}

async function carregarDisciplinas() {
    try {
        const snap = await dbFirestore.collection('disciplinas').get();
        disciplinas = [];
        snap.forEach(doc => { disciplinas.push({ id: doc.id, ...doc.data() }); });
    } catch (e) { console.warn('Erro ao carregar disciplinas:', e); }
}

async function carregarAulas() {
    try {
        const snap = await dbFirestore.collection('aulas').get();
        aulas = [];
        snap.forEach(doc => { aulas.push({ id: doc.id, ...doc.data() }); });
    } catch (e) { console.warn('Erro ao carregar aulas:', e); }
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
    await carregarDisciplinas();
    await carregarAulas();
    const selTurma = document.getElementById('apt-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma</option>';
    turmas.forEach(t => {
        if (t.projeto === projetoSelecionado) {
            selTurma.innerHTML += '<option value="' + t.nome + '"' + (t.nome === turmaSelecionada ? ' selected' : '') + '>' + t.nome + '</option>';
        }
    });
    const selDisc = document.getElementById('apt-disciplina');
    selDisc.innerHTML = '<option value="">Selecione a disciplina</option>';
    disciplinas.forEach(d => {
        selDisc.innerHTML += '<option value="' + d.id + '">' + d.nome + '</option>';
    });
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
    const turma = document.getElementById('apt-turma').value;
    const disciplinaId = document.getElementById('apt-disciplina').value;
    const selAula = document.getElementById('apt-aula');
    selAula.innerHTML = '<option value="">Selecione...</option>';
    if (!turma || !disciplinaId) return;
    const filtradas = aulas.filter(a => a.disciplinaId === disciplinaId && Array.isArray(a.turmas) && a.turmas.includes(turma));
    filtradas.forEach(a => {
        const dataFmt = a.data ? new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
        selAula.innerHTML += '<option value="' + a.id + '">' + a.nome + ' (' + dataFmt + ' ' + (a.hora || '') + ')</option>';
    });
}

function apontamentoOnAulaChange() {
    const aulaId = document.getElementById('apt-aula').value;
    const btnScan = document.getElementById('apt-btn-scan');
    document.getElementById('apt-presenca-area').style.display = 'none';
    if (!aulaId) { btnScan.disabled = true; return; }
    btnScan.disabled = false;
    const turma = document.getElementById('apt-turma').value;
    aptAlunosNaTurma = candidatos.filter(c => c.turma === turma);
    aptPresencas = {};
    aptAlunosNaTurma.forEach(c => {
        aptPresencas[c.cpf] = { matricula: c.matricula || '', nome: c.nome || '', cpf: c.cpf || '', status: '', obs: '' };
    });
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
    if (!turma || !disciplinaId || !aulaId) { alert('Selecione turma, disciplina e aula'); return; }
    const todos = Object.values(aptPresencas);
    if (!todos.length) { alert('Nenhum aluno na lista'); return; }
    const aulaSelecionada = aulas.find(a => a.id === aulaId);
    const disciplinaSelecionada = disciplinas.find(d => d.id === disciplinaId);
    const dados = {
        turma: turma,
        disciplina: disciplinaSelecionada ? disciplinaSelecionada.nome : '',
        disciplinaId: disciplinaId,
        aula: aulaSelecionada ? aulaSelecionada.nome : '',
        aulaId: aulaId,
        dataAula: aulaSelecionada ? aulaSelecionada.data : '',
        horaAula: aulaSelecionada ? aulaSelecionada.hora : '',
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
                '<td style="padding:8px 12px;font-size:13px;font-weight:700;color:#f57c00;font-family:Courier New,monospace;white-space:nowrap">' + (a.matricula || '-') + '</td>' +
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
