const ADMIN_CPF = '05004959471';
const ADMIN_SENHA = '212121';
let selectedLoginRole = 'admin';
let editingIndex = null;
let editingFormadoMode = false;
let candidatos = [];
let turmas = [];
let uploadedFiles = [];
let pendingDeleteIndex = null;
let currentAluno = null;
let usuarios = [];
let currentUserData = null;
let landingLoginErrorTimer = null;
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
    Object.keys(copy).forEach(k => { if (copy[k] === undefined) delete copy[k]; });
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

/* ===== DADOS DA INSTITUICAO ===== */
var configInstLogoData = null;
var FARN_LOGO = 'logo-farn.png.png';

function configInstituicaoOpen() {
    document.getElementById('modal-config-inst-overlay').classList.remove('hidden');
    configInstituicaoCarregar();
}

function configInstituicaoFechar(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-config-inst-overlay').classList.add('hidden');
}

function configInstituicaoLogoSelect(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Imagem muito grande. Maximo 2MB.'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
        configInstLogoData = ev.target.result;
        var img = document.getElementById('config-inst-logo-img');
        var icon = document.getElementById('config-inst-logo-icon');
        if (img) { img.src = configInstLogoData; img.style.display = 'block'; }
        if (icon) icon.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function configInstituicaoCarregar() {
    if (!firebaseReady) return;
    dbFirestore.collection('configuracoes').doc('instituicao').get().then(function(doc) {
        if (doc.exists) {
            var d = doc.data();
            document.getElementById('config-inst-razao').value = d.razaoSocial || '';
            document.getElementById('config-inst-fantasia').value = d.nomeFantasia || '';
            document.getElementById('config-inst-cnpj').value = d.cnpj || '';
            document.getElementById('config-inst-fone').value = d.fone || '';
            document.getElementById('config-inst-email').value = d.email || '';
            document.getElementById('config-inst-admin-user').value = d.adminUser || '';
            document.getElementById('config-inst-admin-senha').value = d.adminSenha || '';
            if (d.logo) {
                configInstLogoData = d.logo;
                var img = document.getElementById('config-inst-logo-img');
                var icon = document.getElementById('config-inst-logo-icon');
                if (img) { img.src = d.logo; img.style.display = 'block'; }
                if (icon) icon.style.display = 'none';
            }
        }
    }).catch(function(e) { console.error('Erro ao carregar dados da instituicao:', e); });
}

function configInstituicaoSalvar() {
    var razao = document.getElementById('config-inst-razao').value.trim();
    var cnpj = document.getElementById('config-inst-cnpj').value.trim();
    if (!razao) { alert('Informe a Razao Social.'); return; }
    if (!cnpj) { alert('Informe o CNPJ.'); return; }

    var dados = {
        razaoSocial: razao,
        nomeFantasia: document.getElementById('config-inst-fantasia').value.trim(),
        cnpj: cnpj,
        fone: document.getElementById('config-inst-fone').value.trim(),
        email: document.getElementById('config-inst-email').value.trim(),
        adminUser: document.getElementById('config-inst-admin-user').value.trim(),
        adminSenha: document.getElementById('config-inst-admin-senha').value,
        logo: configInstLogoData || null,
        atualizadoEm: new Date().toISOString()
    };

    dbFirestore.collection('configuracoes').doc('instituicao').set(dados, { merge: true })
        .then(function() {
            alert('Dados da instituicao salvos com sucesso!');
            if (dados.logo) {
                FARN_LOGO = dados.logo;
                document.querySelectorAll('[data-farn-logo]').forEach(function(img) { img.src = dados.logo; });
            }
            configInstituicaoFechar();
        })
        .catch(function(e) {
            console.error('Erro ao salvar dados da instituicao:', e);
            alert('Erro ao salvar: ' + e.message);
        });
}

function configInstituicaoCarregarHome() {
    if (!firebaseReady) return;
    dbFirestore.collection('configuracoes').doc('instituicao').get().then(function(doc) {
        if (doc.exists) {
            var d = doc.data();
            if (d.razaoSocial) document.getElementById('admin-home-razao').textContent = d.razaoSocial.toUpperCase();
            if (d.nomeFantasia) document.getElementById('admin-home-fantasia').textContent = d.nomeFantasia;
            if (d.logo) { document.getElementById('admin-home-logo').src = d.logo; FARN_LOGO = d.logo; }
            var infoEl = document.getElementById('admin-home-inst-info');
            var hasInfo = false;
            if (d.cnpj) { document.getElementById('admin-home-cnpj').textContent = 'CNPJ: ' + d.cnpj; hasInfo = true; }
            if (d.fone) { document.getElementById('admin-home-fone').textContent = 'Tel: ' + d.fone; hasInfo = true; }
            if (d.email) { document.getElementById('admin-home-email').textContent = 'Email: ' + d.email; hasInfo = true; }
            if (infoEl && hasInfo) infoEl.style.display = 'block';
        }
    }).catch(function(e) { console.error('Erro ao carregar dados da instituicao:', e); });
}

function migrarDataInscricao() {
    if (!firebaseReady) return;
    var batch = dbFirestore.batch();
    var count = 0;
    dbFirestore.collection('candidatos').get().then(function(snap) {
        snap.forEach(function(doc) {
            var d = doc.data();
            if (!d.dataInscricao) {
                batch.set(doc.ref, { dataInscricao: '28/07/2026' }, { merge: true });
                count++;
            }
        });
        if (count > 0) {
            batch.commit().then(function() {
                console.log('Migracao dataInscricao: ' + candidatos.length + ' candidatos atualizados com 28/07/2026');
            }).catch(function(e) { console.error('Erro na migracao dataInscricao:', e); });
        }
    }).catch(function(e) { console.error('Erro ao buscar candidatos para migracao:', e); });
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

/* ===== BACKUP E RESTAURACAO ===== */

const FB_BACKUP_ALL = ['candidatos','turmas','usuarios','parceiros','tfmAgendamentos','tfmAlunos','apontamentos','formados','recadastramentos','aula','noticia'];

async function backupAllData() {
    if (!firebaseReady && !firebaseError) {
        alert('Firebase nao conectado. Verifique a conexao.');
        return;
    }
    const btn = document.getElementById('btn-backup-all');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';
    }
    try {
        const backup = {};
        const timestamp = new Date().toISOString();
        
        for (const colName of FB_BACKUP_ALL) {
            try {
                const snap = await dbFirestore.collection(colName).get();
                const docs = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.criadoEm && typeof data.criadoEm.toDate === 'function') {
                        data.criadoEm = data.criadoEm.toDate().toISOString();
                    }
                    if (data.dataAgendamento && typeof data.dataAgendamento.toDate === 'function') {
                        data.dataAgendamento = data.dataAgendamento.toDate().toISOString();
                    }
                    docs.push({ id: doc.id, ...data });
                });
                backup[colName] = docs;
            } catch(e) {
                console.error('Erro backup colecao ' + colName + ':', e);
                backup[colName] = [];
            }
        }
        
        backup._timestamp = timestamp;
        backup._totalCollections = Object.keys(backup).filter(k => k !== '_timestamp' && k !== '_totalCollections').length;
        
        const jsonStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'farn-backup-' + timestamp.replace(/[:.]/g, '-').substring(0, 19) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Backup Concluido!';
        setTimeout(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i> Fazer Backup'; }
        }, 2000);
        
        console.log('Backup concluido: ' + backup._totalCollections + ' colecoes');
        
    } catch(e) {
        console.error('Erro no backup:', e);
        alert('Erro ao fazer backup: ' + e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i> Fazer Backup'; }
    }
}

function restaurarAllData() {
    if (!firebaseReady && !firebaseError) {
        alert('Firebase nao conectado. Verifique a conexao.');
        return;
    }
    
    if (!confirm('Esta operacao IRA SOBRESCREVER todos os dados no Firestore!\n\nRecomendacao: Faca um backup primeiro!\n\nDeseja continuar?')) {
        return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const btn = document.getElementById('btn-restore-all');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restaurando...';
        }
        
        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            let restoredCount = 0;
            let errorCount = 0;
            
            for (const colName of FB_BACKUP_ALL) {
                if (!backup[colName] || !Array.isArray(backup[colName])) continue;
                
                try {
                    // Limpar colecao existente
                    const existingSnap = await dbFirestore.collection(colName).get();
                    const batch = dbFirestore.batch();
                    existingSnap.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    
                    // Restaurar documentos
                    const restoreBatch = dbFirestore.batch();
                    let count = 0;
                    for (const docData of backup[colName]) {
                        const { id, ...data } = docData;
                        if (id) {
                            restoreBatch.set(dbFirestore.collection(colName).doc(id), data);
                        } else {
                            restoreBatch.add(dbFirestore.collection(colName), data);
                        }
                        count++;
                    }
                    await restoreBatch.commit();
                    restoredCount += count;
                    
                } catch(e) {
                    console.error('Erro restaurando ' + colName + ':', e);
                    errorCount++;
                }
            }
            
            alert('Restauracao concluida!\n\nDocumentos restaurados: ' + restoredCount + '\nColecoes com erro: ' + errorCount + '\n\nRecarregue a pagina para atualizar os dados.');
            
            if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Restaurado!';
            setTimeout(() => {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Restaurar'; }
            }, 2000);
            
            // Forcar recarregamento
            setTimeout(() => {
                if (confirm('Deseja recarregar a pagina para atualizar os dados?')) {
                    location.reload();
                }
            }, 1000);
            
            console.log('Restauracao concluida: ' + restoredCount + ' documentos');
            
        } catch(e) {
            console.error('Erro na restauracao:', e);
            alert('Erro ao restaurar: ' + (e.message || 'Arquivo invalido'));
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Restaurar'; }
        }
    };
    
    input.click();
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

async function initFirebaseListeners() {
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
                if (typeof renderFormadosList === 'function') renderFormadosList();
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
                if (galeriaAdminVisivel()) galeriaAdminCarregarTurmas();
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
                if (galeriaAdminVisivel()) galeriaAdminCarregarProjetos();
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

        dbFirestore.collection('docentes').onSnapshot((snap) => {
            const result = [];
            snap.forEach(doc => {
                if (doc.id !== '_index') {
                    const data = doc.data();
                    data.id = doc.id;
                    result.push(data);
                }
            });
            docentes = result;
            if (firebaseReady && typeof docenteListar === 'function') docenteListar();
            if (typeof tfmPopulateAgendaDocente === 'function') {
                const selAg = document.getElementById('tfm-agenda-docente');
                const conteudoTfm = document.getElementById('tfm-conteudo');
                if (selAg && conteudoTfm && conteudoTfm.style.display !== 'none') {
                    const atual = selAg.value;
                    tfmPopulateAgendaDocente(selAg);
                    selAg.value = atual;
                }
            }
            checkReady();
        }, (error) => {
            console.error('Erro Firestore docentes:', error);
            checkReady();
        });

        setTimeout(() => { if (!firebaseReady) { firebaseReady = true; showFirebaseStatus(false); resolve(); } }, 8000);
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
        document.body.classList.remove('landing-mode');
        document.getElementById('screen-login').classList.remove('active');
        document.getElementById('screen-admin').classList.add('active');
        document.getElementById('topbar-user-name').textContent = currentUserData ? currentUserData.nome : 'Administrador';
        applyUserPermissions();
        const firstVisible = document.querySelector('#screen-admin .sidebar-nav .nav-item:not([style*="display: none"])');
        if (firstVisible) firstVisible.click();
        await populateTurmaSelect();
        populateProjetoSelect();
        configInstituicaoCarregarHome();
        renderList();
        carregarEstadoPortais();
        apontamentoCarregarHistorico();
        if (restoreFormState()) {
            showAdminSection('admin-form-candidato', document.querySelector('.nav-item:nth-child(2)'));
            await populateTurmaSelect();
            populateProjetoSelect();
        }
    } else {
        document.body.classList.add('landing-mode');
        landingCarregarInstituicao();
        landingPreencherCpfLembrado();
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

function farnGerarLinkWhatsApp(whatsapp, texto) {
    var num = (whatsapp || '').replace(/\D/g, '');
    if (!num) return null;
    if (num.length === 10 || num.length === 11) num = '55' + num;
    else if (num.length === 12 && num[0] === '0') num = '55' + num.slice(1);
    else if (num.length < 13) return null;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
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
            currentUserData = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'docente', 'usuarios'] };
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
    document.documentElement.classList.add('farn-admin-session');
    document.body.classList.remove('landing-mode');
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('screen-admin').classList.add('active');
    document.getElementById('topbar-user-name').textContent = currentUserData ? currentUserData.nome : 'Administrador';
    applyUserPermissions();
    const firstVisible = document.querySelector('#screen-admin .sidebar-nav .nav-item:not([style*="display: none"])');
    if (firstVisible) firstVisible.click();
    populateTurmaSelect();
    populateProjetoSelect();
    renderList();
    configInstituicaoCarregarHome();
    migrarDataInscricao();
    if (typeof atelieProdutosCarregar === 'function') atelieProdutosCarregar();
    carregarEstadoPortais();
}

/* ===== PORTAL LIGA/DESLIGA (MANUTENCAO) ===== */
let portaisManutencao = false;

async function carregarEstadoPortais() {
    try {
        const snap = await dbFirestore.collection('config').doc('portais').get();
        portaisManutencao = snap.exists ? (snap.data().manutencao === true) : false;
    } catch (e) {
        portaisManutencao = false;
    }
    atualizarBotaoPortais();
}

function atualizarBotaoPortais() {
    const btn = document.getElementById('btn-portais');
    const statusEl = document.getElementById('portais-status');
    if (!btn) return;
    const isGeral = currentUserData && currentUserData.cpf === ADMIN_CPF;
    if (!isGeral) {
        btn.style.display = 'none';
        if (statusEl) statusEl.style.display = 'none';
        return;
    }
    btn.style.display = '';
    if (statusEl) statusEl.style.display = '';
    if (portaisManutencao) {
        btn.innerHTML = '<i class="fa-solid fa-power-off"></i> Ligar portais';
        btn.style.background = '#dc2626';
        btn.style.borderColor = '#dc2626';
        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle" style="color:#fbbf24"></i> Portais DESLIGADOS - manutencao ativa';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-power-off"></i> Desligar portais';
        btn.style.background = '#16a34a';
        btn.style.borderColor = '#16a34a';
        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle" style="color:#22c55e"></i> Portais LIGADOS - acesso liberado';
    }
}

async function togglePortais() {
    if (!currentUserData) return;
    const novo = !portaisManutencao;
    try {
        await dbFirestore.collection('config').doc('portais').set({ manutencao: novo }, { merge: true });
        portaisManutencao = novo;
        atualizarBotaoPortais();
        alert(novo ? 'Portais desligados. Os usuarios verao a mensagem de manutencao.' : 'Portais ligados. Acesso liberado aos portais.');
    } catch (e) {
        alert('Erro ao salvar o estado dos portais: ' + e.message);
    }
}

function applyUserPermissions() {
    if (!currentUserData) return;
    const p = currentUserData.permissoes || [];
    const isGeral = currentUserData.cpf === ADMIN_CPF;
    const navItems = {
        'admin-home': true,
        'admin-pre-inscricao': p.includes('pre-inscricao') || isGeral,
        'admin-alunos': p.includes('alunos') || isGeral,
        'admin-docentes': p.includes('docentes') || isGeral,
        'admin-formados': p.includes('formados') || isGeral,
        'admin-relatorios': p.includes('relatorios') || isGeral,
        'admin-projetos': p.includes('projetos') || isGeral,
        'admin-form-projeto': p.includes('projetos') || isGeral,
        'admin-config': p.includes('config') || isGeral,
        'admin-usuarios': p.includes('usuarios') || isGeral,
        'admin-form-usuario': p.includes('usuarios') || isGeral,
        'admin-recadastramento': p.includes('recadastramento') || p.includes('admin') || isGeral,
        'admin-recad-detalhe': p.includes('recadastramento') || p.includes('admin') || isGeral,
        'admin-apostilas': p.includes('apostilas') || p.includes('admin') || isGeral,
        'admin-disciplinas': p.includes('disciplinas') || p.includes('admin') || isGeral,
        'admin-apontamento': p.includes('apontamento') || p.includes('admin') || isGeral,
        'admin-formados': p.includes('formados') || isGeral,
        'admin-tfm': p.includes('tfm') || isGeral,
        'admin-noticias': p.includes('noticias') || isGeral,
        'admin-galeria': p.includes('galeria') || isGeral,
        'admin-atelie': isGeral,
        'admin-avaliacao': p.includes('avaliacao') || isGeral,
        'admin-criar-avaliacao': p.includes('avaliacao') || isGeral
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
    document.documentElement.classList.remove('farn-admin-session');
    document.body.classList.add('landing-mode');
    editingIndex = null;
    editingFormadoMode = false;
    currentUserData = null;
    clearLoginState();
    landingCarregarInstituicao();
}

function landingCarregarInstituicao() {
    if (!dbFirestore) return;
    dbFirestore.collection('configuracoes').doc('instituicao').get().then(function(doc) {
        if (doc.exists) {
            var d = doc.data();
            var nome = d.nomeFantasia || d.razaoSocial || 'FARN';
            var el = document.getElementById('landing-nome');
            if (el) el.textContent = nome.toUpperCase();
            el = document.getElementById('landing-header-nome');
            if (el) el.textContent = nome.toUpperCase();
            el = document.getElementById('landing-footer-nome');
            if (el) el.textContent = nome;
            el = document.getElementById('landing-copy-nome');
            if (el) el.textContent = nome;
            el = document.getElementById('landing-razao');
            if (el) el.textContent = d.razaoSocial || '';
            el = document.getElementById('landing-footer-razao');
            if (el) el.textContent = d.razaoSocial || '';
            el = document.getElementById('landing-sub');
            if (el && d.nomeFantasia) el.textContent = d.nomeFantasia;
            el = document.getElementById('landing-header-sub');
            if (el && d.nomeFantasia) el.textContent = d.nomeFantasia;
            el = document.getElementById('landing-razao-titulo');
            if (el && d.razaoSocial) el.textContent = d.razaoSocial;
            el = document.getElementById('landing-cnpj');
            if (el) el.textContent = d.cnpj ? 'CNPJ: ' + d.cnpj : 'CNPJ: --';
            el = document.getElementById('landing-fone');
            if (el) el.textContent = d.fone ? 'Telefone: ' + d.fone : 'Telefone: --';
            el = document.getElementById('landing-email');
            if (el) el.textContent = d.email ? 'E-mail: ' + d.email : 'E-mail: --';
            if (d.logo) {
                FARN_LOGO = d.logo;
                document.querySelectorAll('#screen-login [data-farn-logo]').forEach(function(img) { img.src = d.logo; });
            }
            document.title = nome || 'FARN';
        }
    }).catch(function(e) { console.error('Erro ao carregar dados da instituicao:', e); });
}

/* ===== LOGIN DO ACESSE AQUI (HEADER DA LANDING) ===== */

function landingPreencherCpfLembrado() {
    var last = localStorage.getItem('farn_remember_cpf') || localStorage.getItem('farn_last_cpf') || '';
    var inp = document.getElementById('landing-login-cpf');
    if (!inp) return;
    if (last) {
        last = last.replace(/\D/g, '');
        if (last.length > 9) last = last.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (last.length > 6) last = last.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (last.length > 3) last = last.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        inp.value = last;
    }
}

function landingFormatCpf(input) {
    var v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    input.value = v;
}

function landingToggleSenha() {
    var input = document.getElementById('landing-login-senha');
    var icon = document.getElementById('landing-login-eye-icon');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

function landingShowLoginError(msg) {
    var el = document.getElementById('landing-login-error');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(landingLoginErrorTimer);
    landingLoginErrorTimer = setTimeout(function() { el.classList.remove('show'); }, 4000);
}

function landingFocarLogin() {
    var inp = document.getElementById('landing-login-cpf');
    if (!inp) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(function() { inp.focus(); }, 350);
}

function landingSelecionarPortal(portal) {
    var sel = document.getElementById('landing-login-portal');
    if (sel && sel.querySelector('option[value="' + portal + '"]')) sel.value = portal;
    landingFocarLogin();
}

function landingToggleMenu() {
    var overlay = document.getElementById('landing-drawer-overlay');
    var drawer = document.getElementById('landing-drawer');
    var btn = document.querySelector('.landing-menu-btn');
    if (!overlay || !drawer) return;
    var abrir = !drawer.classList.contains('open');
    if (abrir) {
        overlay.classList.add('open');
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
        if (btn) { btn.setAttribute('aria-expanded', 'true'); btn.innerHTML = '<i class="fa-solid fa-xmark"></i>'; }
        document.body.style.overflow = 'hidden';
    } else {
        landingCloseMenu();
    }
}

function landingCloseMenu() {
    var overlay = document.getElementById('landing-drawer-overlay');
    var drawer = document.getElementById('landing-drawer');
    var btn = document.querySelector('.landing-menu-btn');
    if (overlay) overlay.classList.remove('open');
    if (drawer) {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
    }
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.innerHTML = '<i class="fa-solid fa-bars"></i>'; }
    document.body.style.overflow = '';
}

async function landingLogin(event) {
    if (event) event.preventDefault();
    var cpf = document.getElementById('landing-login-cpf').value.replace(/\D/g, '');
    var senha = document.getElementById('landing-login-senha').value;
    var btn = document.getElementById('landing-login-btn');
    if (!cpf || !senha) { landingShowLoginError('Informe o CPF e a senha.'); return false; }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
        // Primeiro verifica se é admin na coleção usuarios (inclui admin geral hardcoded)
        var adminUser = null;
        if (cpf === ADMIN_CPF && senha === ADMIN_SENHA) {
            adminUser = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'docente', 'usuarios'] };
        } else {
            var snap = await dbFirestore.collection('usuarios').where('cpf', '==', cpf).limit(1).get();
            snap.forEach(function(doc) {
                var u = doc.data();
                if (u.senha === senha && u.ativo !== false && u.permissoes && u.permissoes.includes('admin')) adminUser = u;
            });
        }

        // Se é admin, tem acesso a TUDO
        if (adminUser) {
            currentUserData = adminUser;
            saveLastLogin(cpf);
            var portal = document.getElementById('landing-login-portal').value;
            saveLoginState(); // salva farn_login = 'admin' e farn_user_data
            if (portal === 'admin') {
                enterAdminPanel();
            } else if (portal === 'formado') {
                location.href = 'portal-formado.html';
            } else if (portal === 'aluno') {
                location.href = 'portal-aluno.html';
            } else if (portal === 'docente') {
                location.href = 'portal-docente.html';
            } else if (portal === 'coordenacao') {
                location.href = 'portal-coordenacao.html';
            }
            if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
            return true;
        }

        // Não é admin - verifica se é usuário do sistema com permissão de acesso ao portal
        var portal = document.getElementById('landing-login-portal').value;
        var ok = false;
        if (portal !== 'admin') {
            ok = await landingLoginPortalPerm(cpf, senha, portal);
        }
        if (!ok) {
            if (portal === 'admin') ok = await landingLoginAdmin(cpf, senha);
            else if (portal === 'formado') ok = await landingLoginFormado(cpf, senha);
            else if (portal === 'aluno') ok = await landingLoginAluno(cpf, senha);
            else if (portal === 'docente') ok = await landingLoginDocente(cpf, senha);
            else if (portal === 'coordenacao') ok = await landingLoginCoordenacao(cpf, senha);
        }
        if (!ok) {
            if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
        }
    } catch (e) {
        console.error('Erro no login:', e);
        landingShowLoginError('Falha de conexão. Tente novamente.');
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
    return false;
}

async function landingLoginPortalPerm(cpf, senha, portal) {
    var permKey = 'portal-' + portal;
    var snap = await dbFirestore.collection('usuarios').where('cpf', '==', cpf).limit(1).get();
    if (snap.empty) return false;
    var user = null;
    snap.forEach(function(doc) {
        var u = doc.data();
        if (u.senha === senha && u.ativo !== false && u.permissoes && u.permissoes.includes(permKey)) user = u;
    });
    if (!user) return false;
    currentUserData = user;
    saveLastLogin(cpf);
    try { localStorage.setItem('farn_user_data', JSON.stringify(user)); } catch(e) {}
    if (portal === 'formado') location.href = 'portal-formado.html';
    else if (portal === 'aluno') location.href = 'portal-aluno.html';
    else if (portal === 'docente') location.href = 'portal-docente.html';
    else if (portal === 'coordenacao') location.href = 'portal-coordenacao.html';
    return true;
}

async function landingLoginAdmin(cpf, senha) {
    var user = null;
    if (cpf === ADMIN_CPF && senha === ADMIN_SENHA) {
        user = { nome: 'Administrador Geral', cpf: ADMIN_CPF, permissoes: ['admin', 'pre-inscricao', 'docente', 'usuarios'] };
    } else {
        var snap = await dbFirestore.collection('usuarios').where('cpf', '==', cpf).limit(1).get();
        snap.forEach(function(doc) {
            var u = doc.data();
            if (u.senha === senha && u.ativo !== false) user = u;
        });
    }
    if (!user) { landingShowLoginError('CPF ou senha inválidos.'); return false; }
    currentUserData = user;
    saveLastLogin(cpf);
    enterAdminPanel();
    saveLoginState();
    return true;
}

async function landingLoginFormado(cpf, senha) {
    var snap = await dbFirestore.collection('recadastramentos').where('cpf', '==', cpf).where('senha', '==', senha).limit(1).get();
    if (!snap.empty) {
        var u = snap.docs[0].data();
        localStorage.setItem('pf_lembrar_cpf', cpf);
        localStorage.setItem('pf_lembrar_senha', senha);
        location.href = 'portal-formado.html';
        return true;
    }
    var snapC = await dbFirestore.collection('candidatos').where('cpf', '==', cpf).get();
    var cand = null;
    var candDoc = null;
    snapC.forEach(function(doc) {
        var d = doc.data();
        if ((d.tipoPessoa || 'A') === 'F') {
            cand = d;
            candDoc = doc;
        }
    });
    if (!cand) { landingShowLoginError('CPF ou senha inválidos.'); return false; }
    if (cand.senha !== senha) { landingShowLoginError('Senha incorreta.'); return false; }
    localStorage.setItem('pf_lembrar_cpf', cpf);
    localStorage.setItem('pf_lembrar_senha', senha);
    location.href = 'portal-formado.html';
    return true;
}

async function landingLoginAluno(cpf, senha) {
    var snap = await dbFirestore.collection('candidatos').where('cpf', '==', cpf).limit(1).get();
    if (snap.empty) { landingShowLoginError('CPF não encontrado.'); return false; }
    var u = snap.docs[0].data();
    if (u.senha !== senha) { landingShowLoginError('Senha incorreta.'); return false; }
    if (u.ativo === false) { landingShowLoginError('Seu acesso ainda não foi liberado. Aguarde aprovação da administração.'); return false; }
    if (u.status !== 'Ativo' && u.status !== 'Inativo por Falta') { landingShowLoginError('Seu cadastro ainda não foi ativado. Somente alunos com status Ativo ou Inativo por Falta podem acessar.'); return false; }
    if (!u.projeto) { landingShowLoginError('Nenhum projeto vinculado ao seu cadastro.'); return false; }
    localStorage.setItem('pa_lembrar_cpf', cpf);
    localStorage.setItem('pa_lembrar_senha', senha);
    location.href = 'portal-aluno.html';
    return true;
}

async function landingLoginDocente(cpf, senha) {
    if (cpf === ADMIN_CPF && senha === ADMIN_SENHA) {
        var adminDoc = { nome: 'Administrador Geral', cpf: cpf, guerra: '', matricula: '', isAdmin: true };
        sessionStorage.setItem('pd_sessao', JSON.stringify(adminDoc));
        localStorage.setItem('pd_lembrar_cpf', cpf);
        localStorage.setItem('pd_lembrar_senha', senha);
        location.href = 'portal-docente.html';
        return true;
    }
    var snap = await dbFirestore.collection('docentes').where('cpf', '==', cpf).limit(1).get();
    if (snap.empty) { landingShowLoginError('CPF não encontrado entre os docentes.'); return false; }
    var u = snap.docs[0].data();
    if (!u.senha) { landingShowLoginError('Senha de acesso não cadastrada. Contate a administração.'); return false; }
    if (u.senha !== senha) { landingShowLoginError('Senha incorreta.'); return false; }
    u._docId = snap.docs[0].id;
    sessionStorage.setItem('pd_sessao', JSON.stringify(u));
    localStorage.setItem('pd_lembrar_cpf', cpf);
    localStorage.setItem('pd_lembrar_senha', senha);
    location.href = 'portal-docente.html';
    return true;
}

async function landingLoginCoordenacao(cpf, senha) {
    var snap = await dbFirestore.collection('usuarios').where('cpf', '==', cpf).limit(1).get();
    if (snap.empty) { landingShowLoginError('CPF ou senha inválidos.'); return false; }
    var u = snap.docs[0].data();
    if (u.senha !== senha) { landingShowLoginError('CPF ou senha inválidos.'); return false; }
    if (u.ativo === false) { landingShowLoginError('Usuário desativado. Contate o administrador.'); return false; }
    localStorage.setItem('pc_lembrar_cpf', cpf);
    localStorage.setItem('pc_lembrar_senha', senha);
    location.href = 'portal-coordenacao.html';
    return true;
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
    const titles = { 'admin-home': 'Inicio', 'admin-pre-inscricao': 'Pre-Inscricao', 'admin-form-candidato': editingIndex !== null ? 'Editar Pre-Cadastro' : 'Novo Pre-Cadastro', 'admin-alunos': 'Alunos', 'admin-docentes': 'Docentes', 'admin-formados': 'Formados', 'admin-relatorios': 'Relatorios', 'admin-projetos': 'Projetos', 'admin-form-projeto': editingProjetoIndex !== null ? 'Editar Projeto' : 'Novo Projeto', 'admin-config': 'Configuracoes', 'admin-usuarios': 'Usuarios', 'admin-form-usuario': 'Novo Usuario', 'admin-recadastramento': 'Campanha de Recadastramento', 'admin-recad-detalhe': 'Detalhe do Recadastramento',  'admin-apostilas': 'Apostilas dos Alunos', 'admin-disciplinas': 'Disciplinas e Aulas', 'admin-tfm': 'TFM do Aluno', 'admin-noticias': 'Noticias', 'admin-atelie': 'Atelie', 'admin-avaliacao': 'Seção de Avaliação', 'admin-criar-avaliacao': 'Criar Avaliação', 'admin-cursos': 'Cursos' };
    document.getElementById('admin-page-title').textContent = titles[sectionId] || 'Admin';
    closeAdminSidebar();
}

function toggleAdminSidebar() {
    const sb = document.querySelector('#screen-admin .sidebar');
    const ov = document.getElementById('sidebar-overlay');
    const aberto = sb ? sb.classList.toggle('open') : false;
    if (ov) ov.classList.toggle('show', aberto);
}

function closeAdminSidebar() {
    const sb = document.querySelector('#screen-admin .sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('show');
}

/* ===== FORM CANDIDATO ===== */

function calcularIdade(dataNascimento) {
    if (!dataNascimento) return '';
    var nasc = new Date(dataNascimento + (dataNascimento.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(nasc.getTime())) return '';
    var hoje = new Date();
    var anos = hoje.getFullYear() - nasc.getFullYear();
    var m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
    return anos >= 0 ? anos : '';
}

function calcularIdadeCampo(nascId, idadeId) {
    var el = document.getElementById(idadeId);
    if (!el) return;
    var v = calcularIdade(document.getElementById(nascId) ? document.getElementById(nascId).value : '');
    el.value = v !== '' ? v + ' anos' : '';
}

const formFields = ['fc-projeto','fc-turma','fc-nome','fc-cpf','fc-nascimento','fc-idade','fc-data-inscricao','fc-estado-civil','fc-genero','fc-nacionalidade','fc-naturalidade','fc-titulo','fc-profissao','fc-mae','fc-pai','fc-email','fc-whatsapp','fc-endereco','fc-numero','fc-bairro','fc-cidade','fc-estado','fc-local-votacao','fc-altura','fc-peso','fc-fator-rh','fc-hipertensao','fc-diabetes','fc-deficiencia','fc-tatuagem','fc-cirurgia','fc-alcool','fc-medicamento','fc-cansaco','fc-calca','fc-camisa','fc-calcado','fc-senha'];

async function openFormCandidato() {
    editingIndex = null;
    editingFormadoMode = false;
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
    calcularIdadeCampo('fc-nascimento', 'fc-idade');
    document.getElementById('fc-data-inscricao').value = c.dataInscricao || '';
    document.getElementById('fc-estado-civil').value = c.estadoCivil || '';
    document.getElementById('fc-genero').value = c.genero || '';
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
    if (c.status === 'Ativo') {
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
    editingFormadoMode = (c.tipoPessoa || 'A') === 'F';
    if (editingFormadoMode) {
        document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-user-graduate" style="color:#2563eb;margin-right:8px"></i> Editar Formado - ' + c.nome;
        const titleEl = document.getElementById('admin-page-title');
        if (titleEl) titleEl.textContent = 'Editar Formado';
    }
    showAdminSection('admin-form-candidato');
    if (editingFormadoMode) {
        const titleEl = document.getElementById('admin-page-title');
        if (titleEl) titleEl.textContent = 'Editar Formado';
    }
}

function resetFormCandidato() {
    editingIndex = null;
    editingFormadoMode = false;
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
    data.dataCadastro = (editingIndex !== null && candidatos[editingIndex].dataCadastro) ? candidatos[editingIndex].dataCadastro : new Date().toLocaleDateString('pt-BR');
    data.dataHoraCadastro = (editingIndex !== null && candidatos[editingIndex].dataHoraCadastro) ? candidatos[editingIndex].dataHoraCadastro : new Date().toLocaleString('pt-BR');
    data.dataInscricao = document.getElementById('fc-data-inscricao').value || '';
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
    if (editingFormadoMode) {
        editingFormadoMode = false;
        showAdminSection('admin-formados');
        if (typeof formadosInicializar === 'function') formadosInicializar();
        renderFormadosList();
    } else {
        showAdminSection('admin-pre-inscricao');
        renderList();
    }
    if (editingIndex === null && data.whatsapp) {
        var linkWa = farnGerarLinkWhatsApp(data.whatsapp, 'Olá ' + (data.nome || 'Aluno') + ', seu cadastro na FARN foi realizado com sucesso! Aguarde a análise da equipe. Qualquer dúvida, entre em contato!');
        if (linkWa && confirm('Cadastro de ' + data.nome + ' finalizado. Enviar confirmação pelo WhatsApp?')) {
            window.open(linkWa, '_blank');
        }
    }
    return false;
}

/* ===== PRE-INSCRICAO - FILTRO POR PROJETO/TURMA ===== */

function preInicializar() {
    const selProj = document.getElementById('pre-selecao-projeto');
    if (!selProj) return;
    selProj.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').forEach(p => {
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

/* ===== LINK DE PRE-INSCRICAO ===== */

function gerarLinkPreAbrir() {
    const body = document.getElementById('modal-pre-link-body');
    if (!body) return;
    const projetosEmAndamento = new Set(projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').map(p => p.nome));
    let options = '<option value="">Selecione a turma...</option>';
    turmas.filter(t => (t.projeto || t.nome) && projetosEmAndamento.has(t.projeto)).forEach(t => {
        options += '<option value="' + (t.nome || '') + '" data-projeto="' + (t.projeto || '') + '">' + (t.nome || '') + (t.projeto ? ' - ' + t.projeto : '') + '</option>';
    });
    body.innerHTML =
        '<p style="font-size:13px;color:#475569;margin-bottom:16px">Gere um link único de pré-inscrição para turmas de projetos em andamento. O link pode ser usado <strong>somente uma vez</strong> — após o preenchimento, ele expira automaticamente. A pessoa acessa sem senha.</p>' +
        '<div class="form-group">' +
        '<label style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;display:block">Escolha a turma do link *</label>' +
        '<select id="pre-link-turma" class="config-input" style="width:100%" onchange="gerarLinkPreAtualizarTurma()">' + options + '</select>' +
        '</div>' +
        '<button class="btn-primary btn-lg" style="width:100%;margin-top:18px;background:#7c3aed;border-color:#7c3aed" onclick="gerarLinkPreGerar()"><i class="fa-solid fa-link"></i> Gerar Link</button>' +
        '<div id="pre-link-resultado" style="margin-top:16px"></div>';
    document.getElementById('modal-pre-link').classList.remove('hidden');
}

function gerarLinkPreAtualizarTurma() {
    const sel = document.getElementById('pre-link-turma');
    if (sel) {
        const opt = sel.options[sel.selectedIndex];
        const projeto = opt ? opt.dataset.projeto || '' : '';
        localStorage.setItem('pre_link_projeto_sel', projeto);
    }
}

async function gerarLinkPreGerar() {
    const sel = document.getElementById('pre-link-turma');
    const turma = sel ? sel.value : '';
    if (!turma) { alert('Selecione uma turma para gerar o link.'); return; }
    const opt = sel.options[sel.selectedIndex];
    const projeto = (opt && opt.dataset.projeto) || '';
    const projEmAndamento = projetos.find(p => p.nome === projeto && (p.status || 'Em Andamento') === 'Em Andamento');
    if (!projEmAndamento) { alert('Só é possível gerar link para turmas de projetos em andamento.'); return; }
    const btn = document.querySelector('#modal-pre-link-body button');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...'; }
    try {
        const token = 'PL' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        const base = (location.hostname.indexOf('github.io') >= 0 || location.hostname.indexOf('127.0.0.1') >= 0 || location.hostname === 'localhost') ? 'https://farn-app.web.app' : location.origin;
        const link = base + '/pre-inscricao-via-link.html?token=' + token;
        const docData = {
            token: token,
            turma: turma,
            projeto: projeto,
            usado: false,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            criadoPor: currentUserData ? currentUserData.nome : 'Desconhecido',
            link: link
        };
        await dbFirestore.collection('linksPreInscricao').doc(token).set(docData);
        let html = '<div style="padding:16px;border-radius:10px;background:#f5f3ff;border:1px solid #ddd6fe;margin-top:6px">' +
            '<div style="font-size:12px;font-weight:700;color:#6d28d9;margin-bottom:8px"><i class="fa-solid fa-circle-check"></i> Link gerado com sucesso!</div>' +
            '<div style="font-size:11px;color:#475569;margin-bottom:6px">Turma: <strong>' + turma + '</strong>' + (projeto ? ' • Projeto: <strong>' + projeto + '</strong>' : '') + '</div>' +
            '<input type="text" id="pre-link-copy" readonly value="' + link + '" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd6fe;font-size:12px;background:#fff;color:#1e293b">' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:14px">' +
            '<button class="btn-primary" style="flex:1;background:#16a34a;border-color:#16a34a" onclick="copiarLinkPre()"><i class="fa-solid fa-copy"></i> Copiar Link</button>' +
            '<button class="btn-primary" style="flex:1;background:#7c3aed;border-color:#7c3aed" onclick="gerarLinkPreGerarNovamente()"><i class="fa-solid fa-plus"></i> Gerar Outro</button>' +
            '</div>';
        document.getElementById('pre-link-resultado').innerHTML = html;
        const copyBtn = document.querySelector('#pre-link-resultado button');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-link"></i> Gerar Link'; }
    } catch (e) {
        console.error('Erro ao gerar link:', e);
        alert('Erro ao gerar o link: ' + e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-link"></i> Gerar Link'; }
    }
}

function copiarLinkPre() {
    const el = document.getElementById('pre-link-copy');
    if (!el) return;
    el.select();
    el.setSelectionRange(0, 99999);
    try {
        navigator.clipboard.writeText(el.value);
    } catch (e) {
        document.execCommand('copy');
    }
    alert('Link copiado! Envie para a pessoa preencher o formulário.');
}

function gerarLinkPreGerarNovamente() {
    document.getElementById('pre-link-resultado').innerHTML = '';
    const sel = document.getElementById('pre-link-turma');
    if (sel) sel.value = '';
}

function gerarLinkPreFechar(ev) {
    if (ev && ev.target !== document.getElementById('modal-pre-link')) return;
    document.getElementById('modal-pre-link').classList.add('hidden');
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
    if (!filtrados.length) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;padding:24px">Nenhum candidato nesta turma</td></tr>'; return; }
    tbody.innerHTML = filtrados.map((c) => {
        const i = candidatos.indexOf(c);
        const sc = c.status === 'Ativo' ? 'green' : c.status === 'Rejeitado' ? 'rejeitado' : 'pendente';
        const nomeStyle = c.pediuBaixa ? 'color:#dc2626;font-weight:700' : (c.atualizarCadastro ? 'color:#a5d6a7;font-weight:700' : '');
        const baixaTag = c.pediuBaixa ? ' <span style="background:rgba(220,38,38,.12);color:#dc2626;font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap"><i class="fa-solid fa-power-off"></i> PEDI BAIXA</span>' : '';
        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${baixaTag}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
            <td>${formatCPFDisplay(c.cpf)}</td>
            <td>${c.nascimento || '-'}</td>
            <td>${calcularIdade(c.nascimento) ? calcularIdade(c.nascimento) + ' anos' : '-'}</td>
            <td>${c.genero || '-'}</td>
            <td>${c.turma || '-'}${c.turma ? '<br><small style="color:#888;font-size:7px">' + getTurmaDescricao(c.turma) + '</small>' : ''}</td>
            <td style="color:#ff9800;font-weight:600">${c.projeto || '-'}</td>
            <td><span class="badge ${sc}">${c.status}</span></td>
            <td style="color:#aaa;font-size:12px">${c.cadastradoPor || '-'}</td>
            <td><div class="actions-cell">
                <button class="btn-icon btn-info" title="Visualizar" onclick="viewCandidato(${i})"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-icon" title="Editar" onclick="editCandidato(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon" title="Mudar Turma" onclick="mudarTurmaCandidato(${i})"><i class="fa-solid fa-arrows-left-right"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteCandidato(${i})"><i class="fa-solid fa-trash"></i></button>
                <button class="btn-icon btn-success" title="Imprimir" onclick="printCandidato(${i})"><i class="fa-solid fa-print"></i></button>
                ${c.pediuBaixa ? `<button class="btn-icon btn-success" title="Autorizar Retorno" onclick="autorizarBaixa(${i})" style="color:#16a34a"><i class="fa-solid fa-check"></i></button>` : ''}
                ${(c.tipoPessoa || 'A') === 'F' && !c.remanejadoDocente ? `<button class="btn-icon" title="Remanejar como Docente" onclick="remanejarFormado(${i})" style="color:#2563eb"><i class="fa-solid fa-arrows-rotate"></i></button>` : ''}
                ${c.remanejadoDocente ? `<span style="display:inline-block;background:rgba(37,99,235,.1);color:#1d4ed8;font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap"><i class="fa-solid fa-user-check"></i> DOCENTE</span>` : ''}
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
            <div class="detail-item full"><span class="detail-label">Nome</span><span class="detail-value"${c.pediuBaixa ? ' style="color:#dc2626;font-weight:700"' : (c.atualizarCadastro ? ' style="color:#a5d6a7;font-weight:700"' : '')}>${c.nome}${c.pediuBaixa ? ' <i class="fa-solid fa-power-off" style="font-size:11px;color:#dc2626"></i>' : ''}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:11px;color:#66bb6a"></i>' : ''}</span></div>
            <div class="detail-item"><span class="detail-label">CPF</span><span class="detail-value">${formatCPFDisplay(c.cpf)}</span></div>
            <div class="detail-item"><span class="detail-label">Nascimento</span><span class="detail-value">${c.nascimento||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Idade</span><span class="detail-value">${calcularIdade(c.nascimento) ? calcularIdade(c.nascimento) + ' anos' : '---'}</span></div>
            <div class="detail-item"><span class="detail-label">Genero de Nascimento</span><span class="detail-value">${c.genero||'---'}</span></div>
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
            <div class="detail-item"><span class="detail-label">Inscricao</span><span class="detail-value">${c.dataInscricao || '---'}</span></div>
            <div class="detail-item full"><span class="detail-label">Data/Hora 1o Cadastro</span><span class="detail-value" style="color:#4caf50;font-weight:600">${c.dataHoraCadastro||'---'}</span></div>
            <div class="detail-item"><span class="detail-label">Cadastrado por</span><span class="detail-value" style="color:#16a34a;font-weight:600">${c.cadastradoPor || '---'}</span></div>
            ${c.status === 'Ativo' && c.senha ? `<div class="detail-item"><span class="detail-label">Senha de Acesso</span><span class="detail-value" style="color:#4caf50;font-weight:700">${c.senha}</span></div>` : ''}
            ${c.pediuBaixa ? `<div style="grid-column:1/-1;margin-top:12px;padding:16px;border:2px solid #dc2626;border-radius:10px;background:rgba(220,38,38,.06)"><p style="font-size:13px;color:#991b1b;margin-bottom:6px;font-weight:800"><i class="fa-solid fa-power-off"></i> ALUNO SOLICITOU BAIXA DO CURSO</p><p style="font-size:12px;color:#7f1d1d;margin-bottom:12px">Solicitado em ${c.pediuBaixaEm ? new Date(c.pediuBaixaEm).toLocaleString('pt-BR') : '---'}. O aluno esta com o acesso ao portal bloqueado.</p><button class="btn-primary" style="background:linear-gradient(135deg,#16a34a,#15803d)" onclick="autorizarBaixa(${i})"><i class="fa-solid fa-check"></i> Autorizar Retorno</button></div>` : ''}
            ${(c.tipoPessoa || 'A') === 'F' ? (c.remanejadoDocente ? `<div class="detail-item full" style="margin-top:8px"><span class="detail-label">Remanejamento</span><span class="detail-value" style="color:#1d4ed8;font-weight:700">Formado remanejado como Docente em ${c.remanejadoEm || '---'} por ${c.remanejadoPor || '---'}</span></div>` : `<div style="grid-column:1/-1;text-align:center;margin-top:14px;padding:16px;border:1px dashed #2563eb;border-radius:10px;background:rgba(37,99,235,.04)"><p style="font-size:13px;color:#475569;margin-bottom:10px;font-weight:600">Formado elegivel para entrar no corpo de docentes.</p><button class="btn-primary" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)" onclick="remanejarFormado(${i})"><i class="fa-solid fa-arrows-rotate"></i> Remanejar como Docente</button></div>`) : ''}
        </div>`;
    });
    openModal();
}

async function autorizarBaixa(i) {
    const c = candidatos[i]; if (!c) return;
    const senha = prompt('Digite a senha do administrador para autorizar o retorno do aluno:');
    if (!senha) return;
    if (senha !== ADMIN_SENHA) { alert('Senha incorreta! Autorizacao cancelada.'); return; }
    try {
        await dbFirestore.collection(FB_CANDIDATOS).doc(String(c.id)).update({
            pediuBaixa: firebase.firestore.FieldValue.delete(),
            pediuBaixaEm: firebase.firestore.FieldValue.delete()
        });
        delete c.pediuBaixa;
        delete c.pediuBaixaEm;
        renderList();
        renderAlunosList();
        closeModal();
        alert('Retorno autorizado! O aluno pode acessar o portal novamente.');
    } catch(e) {
        alert('Erro ao autorizar retorno: ' + e.message);
    }
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
        <div class="row"><div class="col"><div class="label">Idade</div><div class="val">${calcularIdade(c.nascimento) ? calcularIdade(c.nascimento) + ' anos' : '---'}</div></div><div class="col"><div class="label">Genero de Nascimento</div><div class="val">${c.genero||'---'}</div></div></div>
        <div class="row"><div class="col"><div class="label">Estado Civil</div><div class="val">${c.estadoCivil||'---'}</div></div><div class="col"><div class="label">Nacionalidade</div><div class="val">${c.nacionalidade||'---'}</div></div></div>
        <div class="row"><div class="col"><div class="label">Genero de Nascimento</div><div class="val">${c.genero||'---'}</div></div></div>
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
        ${c.status === 'Ativo' && c.senha ? `<div class="row"><div class="col"><div class="label">Senha de Acesso</div><div class="val" style="color:#2e7d32;font-weight:bold">${c.senha}</div></div></div>` : ''}
        ${c.dataHoraCadastro ? `<div class="row"><div class="col"><div class="label">Data/Hora 1o Cadastro</div><div class="val" style="color:#2e7d32;font-size:11px">${c.dataHoraCadastro}</div></div></div>` : ''}
        <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
    });
}

function mudarTurmaCandidato(i) {
    const c = candidatos[i]; if (!c) return;
    
    // Verifica se ha turmas disponiveis
    const turmasProjeto = turmas.filter(t => t.projeto === c.projeto);
    if (!turmasProjeto.length) {
        alert('Nenhuma turma disponivel para este projeto.');
        return;
    }
    
    // Cria modal para selecionar nova turma
    const modalHtml = `
        <div class="modal-overlay" onclick="closeMudarTurmaModal(event)" id="mudar-turma-modal">
            <div class="modal-card" style="max-width:480px">
                <div class="modal-header">
                    <h3><i class="fa-solid fa-arrows-left-right" style="color:#16a34a;margin-right:8px"></i> Mudar Turma</h3>
                    <button class="modal-close" onclick="closeMudarTurmaModal()"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="padding:24px">
                    <div style="margin-bottom:16px;padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #16a34a">
                        <div style="font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px">Candidato</div>
                        <div style="font-weight:600;color:#1a237e">${c.nome}</div>
                        <div style="font-size:12px;color:#666">${formatCPFDisplay(c.cpf)}</div>
                    </div>
                    <div style="margin-bottom:16px;padding:12px;background:#fff3e0;border-radius:8px;border:1px solid #f59e0b">
                        <div style="font-size:11px;color:#f59e0b;font-weight:700;margin-bottom:4px">Turma Atual</div>
                        <div style="font-weight:600;color:#1a237e">${c.turma || '---'}${c.turma ? ' - ' + getTurmaDescricao(c.turma) : ''}</div>
                    </div>
                    <div class="form-group" style="margin-bottom:20px">
                        <label style="font-size:11px;font-weight:600;color:#16a34a;margin-bottom:6px;display:block">Nova Turma *</label>
                        <select id="nova-turma-select" class="config-input" style="width:100%;border-color:#16a34a" required>
                            <option value="">Selecione a nova turma...</option>
                            ${turmasProjeto.map(t => `<option value="${t.nome}"${t.nome === c.turma ? ' disabled' : ''}>${t.nome}${t.descricao ? ' - ' + t.descricao : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="modal-actions" style="display:flex;gap:12px;justify-content:flex-end">
                        <button class="btn-outline" onclick="closeMudarTurmaModal()"><i class="fa-solid fa-xmark"></i> Cancelar</button>
                        <button class="btn-primary" onclick="confirmarMudarTurma(${i})" style="white-space:nowrap"><i class="fa-solid fa-arrows-left-right"></i> Confirmar Mudanca</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove modal anterior se existir
    const oldModal = document.getElementById('mudar-turma-modal');
    if (oldModal) oldModal.remove();
    
    // Adiciona modal ao body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeMudarTurmaModal(e) {
    const modal = document.getElementById('mudar-turma-modal');
    if (modal && (!e || e.target === modal)) {
        modal.remove();
    }
}

async function confirmarMudarTurma(i) {
    const c = candidatos[i]; if (!c) return;
    const novaTurma = document.getElementById('nova-turma-select').value;
    
    if (!novaTurma) {
        alert('Selecione uma turma.');
        return;
    }
    
    if (novaTurma === c.turma) {
        alert('O candidato ja esta nesta turma.');
        return;
    }
    
    const btn = document.querySelector('#mudar-turma-modal .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
    
    try {
        // Atualiza no Firestore
        await dbFirestore.collection('candidatos').doc(String(c.id)).update({ turma: novaTurma });
        
        // Atualiza localmente
        c.turma = novaTurma;
        backupCandidatos();
        renderList();
        
        closeMudarTurmaModal();
        alert('Turma alterada com sucesso!');
    } catch(e) {
        console.error('Erro ao mudar turma:', e);
        alert('Erro ao mudar turma: ' + e.message);
    }
    
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrows-left-right"></i> Confirmar Mudanca'; }
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
            'nome', 'cpf', 'nascimento', 'genero', 'estadoCivil', 'nacionalidade',
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

            if (data.status === 'Ativo' && !data.senha) {
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
    let csv = 'Nome,CPF,Nascimento,Idade,Genero de Nascimento,Estado Civil,Nacionalidade,Naturalidade,Profissao,Mae,Pai,Titulo,Email,WhatsApp,Endereco,Numero,Bairro,Cidade,Estado,Altura,Peso,Fator RH,Hipertensao,Diabetes,Deficiencia,Tatuagem,Cirurgia,Alcool,Medicamento,Cansaco,Calca,Camisa,Calcado,Turma,Projeto,Status,Senha,Cadastro,Data/Hora 1o Cadastro\n';
    filtrados.forEach(c => {
        csv += `"${c.nome}","${c.cpf}","${c.nascimento||''}","${calcularIdade(c.nascimento) ? calcularIdade(c.nascimento) + ' anos' : ''}","${c.genero||''}","${c.estadoCivil||''}","${c.nacionalidade||''}","${c.naturalidade||''}","${c.profissao||''}","${c.mae||''}","${c.pai||''}","${c.tituloEleitor||''}","${c.email||''}","${c.whatsapp||''}","${c.endereco||''}","${c.numero||''}","${c.bairro||''}","${c.cidade||''}","${c.estado||''}","${c.altura||''}","${c.peso||''}","${c.fatorRh||''}","${c.hipertensao||''}","${c.diabetes||''}","${c.deficiencia||''}","${c.tatuagem||''}","${c.cirurgia||''}","${c.alcool||''}","${c.medicamento||''}","${c.cansaco||''}","${c.calca||''}","${c.camisa||''}","${c.calcado||''}","${c.turma||''}","${c.projeto||''}","${c.status}","${c.senha||''}","${c.dataCadastro}","${c.dataHoraCadastro||''}","${c.dataInscricao||''}"\n`;
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
    'aprovados': 'Ativo',
    'inativo-falta': 'Inativo por Falta',
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
        const cpfsAtivos = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && c.status === 'Ativo' && c.turma === turma).map(c => c.cpf);
        if (cpfsAtivos.length) verificarInativosPorFalta(cpfsAtivos);
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
    const filtered = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && c.status === statusFilter && (!turmaFiltro || c.turma === turmaFiltro));
    const isAprovados = currentAlunosTab === 'aprovados' || currentAlunosTab === 'inativo-falta';

    const allByTurma = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && (!turmaFiltro || c.turma === turmaFiltro));
    document.getElementById('tab-count-aprovados').textContent = allByTurma.filter(c => c.status === 'Ativo').length;
    document.getElementById('tab-count-inativo-falta').textContent = allByTurma.filter(c => c.status === 'Inativo por Falta').length;
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
        { value: 'Ativo', label: 'Ativo', icon: 'fa-check-circle', color: '#4caf50', tab: 'aprovados' },
        { value: 'Inativo por Falta', label: 'Inativo por Falta', icon: 'fa-user-slash', color: '#f97316', tab: 'inativo-falta' },
        { value: 'Rejeitado', label: 'Reprovado', icon: 'fa-times-circle', color: '#f44336', tab: 'reprovados' },
        { value: 'Segunda Chamada', label: '2a Chamada', icon: 'fa-rotate', color: '#2196f3', tab: 'segunda-chamada' }
    ];

    tbody.innerHTML = filtered.map((c, fi) => {
        const i = idxMap[fi];
        const otherStatuses = allStatuses.filter(s => s.value !== c.status);
        const mat = c.matricula || generateMatricula(c.cpf);
        const nomeStyle = c.pediuBaixa ? 'color:#dc2626;font-weight:700' : (c.atualizarCadastro ? 'color:#a5d6a7;font-weight:700' : '');
        const isOnline = onlineCpfs.has(c.cpf);
        const onlineDot = isOnline ? ' <span class="online-dot" title="Online"></span>' : '';
        const baixaTag = c.pediuBaixa ? ' <span style="background:rgba(220,38,38,.12);color:#dc2626;font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap"><i class="fa-solid fa-power-off"></i> PEDI BAIXA</span>' : '';

        const actionsHtml = `<div class="actions-cell">
                <button class="btn-icon btn-info" title="Visualizar" onclick="viewCandidato(${i})"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-icon" title="Editar" onclick="editCandidato(${i})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="deleteCandidatoAlunos(${i})"><i class="fa-solid fa-trash"></i></button>
                <button class="btn-icon btn-success" title="Imprimir" onclick="printCandidato(${i})"><i class="fa-solid fa-print"></i></button>
                ${c.pediuBaixa ? `<button class="btn-icon btn-success" title="Autorizar Retorno" onclick="autorizarBaixa(${i})" style="color:#16a34a"><i class="fa-solid fa-check"></i></button>` : ''}
                ${c.status === 'Ativo' ? `<button class="btn-icon btn-contrato" title="Contrato de BC" onclick="gerarContratoBC(${i})"><i class="fa-solid fa-file-contract"></i></button>` : ''}
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
                <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${baixaTag}${onlineDot}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
                <td style="color:#16a34a;font-weight:800;letter-spacing:1px;font-family:'Courier New',monospace;font-size:13px">${mat || '-'}</td>
                <td style="color:#ff9800;font-weight:600">${c.projeto || '-'}</td>
                <td>${actionsHtml}</td>
            </tr>`;
        }

        return `<tr>
            <td${nomeStyle ? ' style="' + nomeStyle + '"' : ''}>${c.nome}${baixaTag}${onlineDot}${c.atualizarCadastro ? ' <i class="fa-solid fa-pen" style="font-size:10px;color:#66bb6a"></i>' : ''}</td>
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
    if (newStatus === 'Ativo' && candidatos[i].cpf) {
        candidatos[i].senha = candidatos[i].cpf.substring(0, 6);
    }
    backupCandidatos();
    document.querySelectorAll('.status-dropdown-menu').forEach(d => d.classList.add('hidden'));
    renderAlunosList();
    renderList();
    if (newStatus === 'Ativo' && candidatos[i].whatsapp) {
        var c = candidatos[i];
        var linkWa = farnGerarLinkWhatsApp(c.whatsapp, 'Parabéns ' + c.nome + '! Seu cadastro na FARN foi ATIVADO!\nAcesse o portal: https://farn-app.web.app\nCPF: ' + c.cpf + '\nSenha: ' + c.senha);
        if (linkWa && confirm('Cadastro de ' + c.nome + ' ativado. Enviar notificação de ativação pelo WhatsApp?')) {
            window.open(linkWa, '_blank');
        }
    }
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
    const filtered = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && c.status === statusFilter && (!turmaFiltro || c.turma === turmaFiltro));
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
    const filtered = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && c.status === statusFilter && (!turmaFiltro || c.turma === turmaFiltro));
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

var regimentoTabAtual = 'aceitaram';
var regimentoAceites = [];
var regimentoPendentes = [];

var termoTabAtual = 'aceitaram';
var termoAceites = [];
var termoPendentes = [];

async function relatorioRegimento() {
    const modal = document.getElementById('modal-relatorio-regimento');
    const tbody = document.getElementById('regimento-aceites-body');
    const statsDiv = document.getElementById('regimento-stats');
    modal.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</td></tr>';
    statsDiv.innerHTML = '';
    regimentoTabAtual = 'aceitaram';
    regimentoAceites = [];
    regimentoPendentes = [];
    document.getElementById('regimento-tab-aceitaram').className = 'regimento-tab active';
    document.getElementById('regimento-tab-aceitaram').style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f0fdf4;color:#16a34a;border-bottom:2px solid #16a34a;transition:all .2s';
    document.getElementById('regimento-tab-pendentes').className = 'regimento-tab';
    document.getElementById('regimento-tab-pendentes').style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f8fafc;color:#64748b;border-bottom:2px solid transparent;transition:all .2s';
    try {
        const snap = await dbFirestore.collection('regimentoAceites').get();
        const aceites = [];
        snap.forEach(doc => aceites.push(doc.data()));

        /* Base: apenas alunos ATIVOS do formulario (status Ativo e nao formados) */
        const aprovados = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && c.status === 'Ativo');
        const aprovadosCpf = {};
        aprovados.forEach(c => { if (c.cpf) aprovadosCpf[c.cpf] = true; });
        const aceitesAtivos = aceites.filter(a => aprovadosCpf[a.cpf]);
        aceitesAtivos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        regimentoAceites = aceitesAtivos;

        const totalAprovados = aprovados.length;
        const totalAceitaram = aceitesAtivos.length;
        const pendentes = totalAprovados - totalAceitaram;

        /* Build pending list: approved students not in aceites */
        const aceitesCpf = {};
        aceitesAtivos.forEach(a => { if (a.cpf) aceitesCpf[a.cpf] = true; });
        regimentoPendentes = aprovados.filter(c => !aceitesCpf[c.cpf]);
        regimentoPendentes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        statsDiv.innerHTML = `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:120px">
                <div style="font-size:24px;font-weight:700;color:#16a34a">${totalAceitaram}</div>
                <div style="font-size:11px;color:#166534;font-weight:600">Aceitaram</div>
            </div>
            <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:120px">
                <div style="font-size:24px;font-weight:700;color:#ca8a04">${pendentes}</div>
                <div style="font-size:11px;color:#92400e;font-weight:600">Pendentes</div>
            </div>
            <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:120px">
                <div style="font-size:24px;font-weight:700;color:#1e293b">${totalAprovados}</div>
                <div style="font-size:11px;color:#475569;font-weight:600">Total de Ativos</div>
            </div>`;

        regimentoRenderTab('aceitaram');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#dc2626">Erro ao carregar: ' + e.message + '</td></tr>';
    }
}

function regimentoSetTab(tab) {
    regimentoTabAtual = tab;
    ['aceitaram', 'pendentes'].forEach(function(t) {
        var el = document.getElementById('regimento-tab-' + t);
        if (t === tab) {
            el.style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f0fdf4;color:#16a34a;border-bottom:2px solid #16a34a;transition:all .2s';
        } else {
            el.style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f8fafc;color:#64748b;border-bottom:2px solid transparent;transition:all .2s';
        }
    });
    regimentoRenderTab(tab);
}

function regimentoRenderTab(tab) {
    const tbody = document.getElementById('regimento-aceites-body');
    if (tab === 'pendentes') {
        if (!regimentoPendentes.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b">Todos os aprovados ja aceitaram o regimento.</td></tr>';
            return;
        }
        tbody.innerHTML = regimentoPendentes.map(function(c) {
            const cpfFmt = (c.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            return '<tr>' +
                '<td style="font-size:12px;font-weight:600">' + (c.nome || '-') + '</td>' +
                '<td style="font-size:12px">' + cpfFmt + '</td>' +
                '<td style="font-size:12px">' + (c.turma || '-') + '</td>' +
                '<td style="font-size:12px">' + (c.projeto || '-') + '</td>' +
                '<td style="font-size:12px;color:#ca8a04"><i class="fa-solid fa-clock"></i> Pendente</td>' +
                '</tr>';
        }).join('');
    } else {
        if (!regimentoAceites.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b">Nenhum aluno aceitou o regimento ainda.</td></tr>';
            return;
        }
        tbody.innerHTML = regimentoAceites.map(function(a) {
            const cpfFmt = (a.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            const dataAceite = a.dataAceite ? new Date(a.dataAceite).toLocaleDateString('pt-BR') + ' ' + new Date(a.dataAceite).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '-';
            return '<tr>' +
                '<td style="font-size:12px;font-weight:600">' + (a.nome || '-') + '</td>' +
                '<td style="font-size:12px">' + cpfFmt + '</td>' +
                '<td style="font-size:12px">' + (a.turma || '-') + '</td>' +
                '<td style="font-size:12px">' + (a.projeto || '-') + '</td>' +
                '<td style="font-size:12px">' + dataAceite + '</td>' +
                '</tr>';
        }).join('');
    }
}

function fecharModalRelatorioRegimento() {
    document.getElementById('modal-relatorio-regimento').classList.add('hidden');
}

function exportarRegimentoCSV() {
    const dados = regimentoTabAtual === 'aceitaram' ? regimentoAceites : regimentoPendentes;
    if (!dados || !dados.length) { alert('Nenhum dado para exportar.'); return; }
    const labelData = regimentoTabAtual === 'aceitaram' ? 'Data do Aceite' : 'Status';
    let csv = 'Nome;CPF;Turma;Projeto;' + labelData + '\n';
    dados.forEach(function(item) {
        const nome = item.nome || '';
        const cpf = (item.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        const turma = item.turma || '';
        const projeto = item.projeto || '';
        const data = regimentoTabAtual === 'aceitaram'
            ? (item.dataAceite ? new Date(item.dataAceite).toLocaleDateString('pt-BR') : '-')
            : 'Pendente';
        csv += '"' + nome.replace(/"/g, '""') + '";"' + cpf + '";"' + turma.replace(/"/g, '""') + '";"' + projeto.replace(/"/g, '""') + '";"' + data + '"\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'regimento_' + regimentoTabAtual + '_' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
}

// ===== RELATORIO TERMO AVALIACAO TEORICA =====
async function relatorioTermo() {
    const modal = document.getElementById('modal-relatorio-termo');
    const tbody = document.getElementById('termo-aceites-body');
    const statsDiv = document.getElementById('termo-stats');
    if (!modal || !tbody || !statsDiv) return;
    modal.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</td></tr>';
    statsDiv.innerHTML = '';
    termoTabAtual = 'aceitaram';
    termoAceites = [];
    termoPendentes = [];
    document.getElementById('termo-tab-aceitaram').className = 'termo-tab active';
    document.getElementById('termo-tab-aceitaram').style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f0fdf4;color:#16a34a;border-bottom:2px solid #16a34a;transition:all .2s';
    document.getElementById('termo-tab-pendentes').className = 'termo-tab';
    document.getElementById('termo-tab-pendentes').style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f8fafc;color:#64748b;border-bottom:2px solid transparent;transition:all .2s';
    try {
        const snap = await dbFirestore.collection('termoAvaliacaoAceites').get();
        const aceites = [];
        snap.forEach(doc => aceites.push(doc.data()));

        const aprovados = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && c.status === 'Ativo');
        const aprovadosCpf = {};
        aprovados.forEach(c => { if (c.cpf) aprovadosCpf[c.cpf] = true; });
        const aceitesAtivos = aceites.filter(a => aprovadosCpf[a.cpf]);
        aceitesAtivos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        termoAceites = aceitesAtivos;

        const totalAprovados = aprovados.length;
        const totalAceitaram = aceitesAtivos.length;
        const pendentes = totalAprovados - totalAceitaram;

        const aceitesCpf = {};
        aceitesAtivos.forEach(a => { if (a.cpf) aceitesCpf[a.cpf] = true; });
        termoPendentes = aprovados.filter(c => !aceitesCpf[c.cpf]);
        termoPendentes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        statsDiv.innerHTML = `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:120px">
                <div style="font-size:24px;font-weight:700;color:#16a34a">${totalAceitaram}</div>
                <div style="font-size:11px;color:#166534;font-weight:600">Aceitaram</div>
            </div>
            <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:120px">
                <div style="font-size:24px;font-weight:700;color:#ca8a04">${pendentes}</div>
                <div style="font-size:11px;color:#92400e;font-weight:600">Pendentes</div>
            </div>
            <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:120px">
                <div style="font-size:24px;font-weight:700;color:#1e293b">${totalAprovados}</div>
                <div style="font-size:11px;color:#475569;font-weight:600">Total de Ativos</div>
            </div>`;

        termoRenderTab('aceitaram');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#dc2626">Erro ao carregar: ' + e.message + '</td></tr>';
    }
}

function termoSetTab(tab) {
    termoTabAtual = tab;
    ['aceitaram', 'pendentes'].forEach(function(t) {
        var el = document.getElementById('termo-tab-' + t);
        if (t === tab) {
            el.style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f0fdf4;color:#16a34a;border-bottom:2px solid #16a34a;transition:all .2s';
        } else {
            el.style.cssText = 'flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;cursor:pointer;background:#f8fafc;color:#64748b;border-bottom:2px solid transparent;transition:all .2s';
        }
    });
    termoRenderTab(tab);
}

function termoRenderTab(tab) {
    const tbody = document.getElementById('termo-aceites-body');
    if (tab === 'pendentes') {
        if (!termoPendentes.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b">Todos os aprovados ja assinaram o termo.</td></tr>';
            return;
        }
        tbody.innerHTML = termoPendentes.map(function(c) {
            const cpfFmt = (c.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            return '<tr>' +
                '<td style="font-size:12px;font-weight:600">' + (c.nome || '-') + '</td>' +
                '<td style="font-size:12px">' + cpfFmt + '</td>' +
                '<td style="font-size:12px">' + (c.turma || '-') + '</td>' +
                '<td style="font-size:12px">' + (c.projeto || '-') + '</td>' +
                '<td style="font-size:12px;color:#ca8a04"><i class="fa-solid fa-clock"></i> Pendente</td>' +
                '</tr>';
        }).join('');
    } else {
        if (!termoAceites.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b">Nenhum aluno assinou o termo ainda.</td></tr>';
            return;
        }
        tbody.innerHTML = termoAceites.map(function(a) {
            const cpfFmt = (a.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            const dataAceite = a.dataAceite ? new Date(a.dataAceite).toLocaleDateString('pt-BR') + ' ' + new Date(a.dataAceite).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '-';
            return '<tr>' +
                '<td style="font-size:12px;font-weight:600">' + (a.nome || '-') + '</td>' +
                '<td style="font-size:12px">' + cpfFmt + '</td>' +
                '<td style="font-size:12px">' + (a.turma || '-') + '</td>' +
                '<td style="font-size:12px">' + (a.projeto || '-') + '</td>' +
                '<td style="font-size:12px">' + dataAceite + '</td>' +
                '</tr>';
        }).join('');
    }
}

function fecharModalRelatorioTermo() {
    document.getElementById('modal-relatorio-termo').classList.add('hidden');
}

function exportarTermoCSV() {
    const dados = termoTabAtual === 'aceitaram' ? termoAceites : termoPendentes;
    if (!dados || !dados.length) { alert('Nenhum dado para exportar.'); return; }
    const labelData = termoTabAtual === 'aceitaram' ? 'Data do Aceite' : 'Status';
    let csv = 'Nome;CPF;Turma;Projeto;' + labelData + '\n';
    dados.forEach(function(item) {
        const nome = item.nome || '';
        const cpf = (item.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        const turma = item.turma || '';
        const projeto = item.projeto || '';
        const data = termoTabAtual === 'aceitaram'
            ? (item.dataAceite ? new Date(item.dataAceite).toLocaleDateString('pt-BR') : '-')
            : 'Pendente';
        csv += '"' + nome.replace(/"/g, '""') + '";"' + cpf + '";"' + turma.replace(/"/g, '""') + '";"' + projeto.replace(/"/g, '""') + '";"' + data + '"\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'termo_avaliacao_' + termoTabAtual + '_' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
}

// ===== MODAL SELECAO CARTEIRA/CERTIFICADO =====
var relDocTipo = '';
var relDocModoSel = '';

function relDocAbrir(tipo) {
    relDocTipo = tipo;
    relDocModoSel = '';
    var modal = document.getElementById('modal-rel-doc');
    var titulo = document.getElementById('rel-doc-titulo');
    var desc = document.getElementById('rel-doc-desc');
    var cpfArea = document.getElementById('rel-doc-cpf-area');
    var turmaArea = document.getElementById('rel-doc-turma-area');
    var errEl = document.getElementById('rel-doc-err');
    var cpfInput = document.getElementById('rel-doc-cpf');
    var turmaSel = document.getElementById('rel-doc-turma-sel');

    cpfArea.style.display = 'none';
    turmaArea.style.display = 'none';
    errEl.style.display = 'none';
    cpfInput.value = '';
    document.getElementById('rel-doc-btn-ind').style.borderColor = '#e2e8f0';
    document.getElementById('rel-doc-btn-ind').style.background = '#f8fafc';
    document.getElementById('rel-doc-btn-ind').querySelector('i').style.color = '#64748b';
    document.getElementById('rel-doc-btn-turma').style.borderColor = '#e2e8f0';
    document.getElementById('rel-doc-btn-turma').style.background = '#f8fafc';
    document.getElementById('rel-doc-btn-turma').querySelector('i').style.color = '#64748b';

    if (tipo === 'carteira-aluno') {
        titulo.innerHTML = '<i class="fa-solid fa-id-card" style="color:#16a34a;margin-right:8px"></i> Carteira de Aluno';
        desc.textContent = 'Gere a carteira de identificacao de aluno individual ou para uma turma inteira.';
    } else if (tipo === 'certificado-formado') {
        titulo.innerHTML = '<i class="fa-solid fa-award" style="color:#2563eb;margin-right:8px"></i> Certificado de Formado';
        desc.textContent = 'Gere o certificado de formacao individual ou para uma turma inteira.';
    } else if (tipo === 'carteira-formado') {
        titulo.innerHTML = '<i class="fa-solid fa-id-card-clip" style="color:#7c3aed;margin-right:8px"></i> Carteira de Formado';
        desc.textContent = 'Gere a carteira de formado individual ou para uma turma inteira.';
    }

    turmaSel.innerHTML = '<option value="">Carregando...</option>';
    modal.classList.remove('hidden');

    var turmas = new Set();
    var fonte = tipo === 'certificado-formado' || tipo === 'carteira-formado'
        ? candidatos.filter(function(c) { return (c.tipoPessoa || 'A') === 'F'; })
        : candidatos.filter(function(c) { return (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo'; });
    fonte.forEach(function(c) { if (c.turma) turmas.add(c.turma); });
    turmaSel.innerHTML = '<option value="">Selecione a turma...</option>';
    Array.from(turmas).sort().forEach(function(t) {
        turmaSel.innerHTML += '<option value="' + t + '">' + t + '</option>';
    });
}

function relDocFechar() {
    document.getElementById('modal-rel-doc').classList.add('hidden');
}

function relDocModo(modo) {
    relDocModoSel = modo;
    var cpfArea = document.getElementById('rel-doc-cpf-area');
    var turmaArea = document.getElementById('rel-doc-turma-area');
    var btnInd = document.getElementById('rel-doc-btn-ind');
    var btnTurma = document.getElementById('rel-doc-btn-turma');
    document.getElementById('rel-doc-err').style.display = 'none';

    if (modo === 'individual') {
        cpfArea.style.display = 'block';
        turmaArea.style.display = 'none';
        btnInd.style.borderColor = '#16a34a'; btnInd.style.background = '#f0fdf4';
        btnInd.querySelector('i').style.color = '#16a34a';
        btnTurma.style.borderColor = '#e2e8f0'; btnTurma.style.background = '#f8fafc';
        btnTurma.querySelector('i').style.color = '#64748b';
    } else {
        cpfArea.style.display = 'none';
        turmaArea.style.display = 'block';
        btnTurma.style.borderColor = '#16a34a'; btnTurma.style.background = '#f0fdf4';
        btnTurma.querySelector('i').style.color = '#16a34a';
        btnInd.style.borderColor = '#e2e8f0'; btnInd.style.background = '#f8fafc';
        btnInd.querySelector('i').style.color = '#64748b';
    }
}

function relDocGerar() {
    var errEl = document.getElementById('rel-doc-err');
    errEl.style.display = 'none';
    if (!relDocModoSel) { errEl.textContent = 'Selecione o modo (Individual ou Por Turma).'; errEl.style.display = 'block'; return; }

    if (relDocModoSel === 'individual') {
        var cpf = document.getElementById('rel-doc-cpf').value.replace(/\D/g, '');
        if (cpf.length < 10) { errEl.textContent = 'Digite um CPF valido.'; errEl.style.display = 'block'; return; }
        var fonte = relDocTipo === 'certificado-formado' || relDocTipo === 'carteira-formado'
            ? candidatos.filter(function(c) { return (c.tipoPessoa || 'A') === 'F'; })
            : candidatos.filter(function(c) { return (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo'; });
        var pessoa = fonte.find(function(c) { return (c.cpf || '').replace(/\D/g, '') === cpf; });
        if (!pessoa) { errEl.textContent = 'Cadastro nao encontrado com este CPF.'; errEl.style.display = 'block'; return; }
        relDocFechar();
        if (relDocTipo === 'carteira-aluno') relGerarCarteiraAluno([pessoa]);
        else if (relDocTipo === 'certificado-formado') relGerarCertificadoFormado([pessoa]);
        else if (relDocTipo === 'carteira-formado') relGerarCarteiraFormado([pessoa]);
    } else {
        var turma = document.getElementById('rel-doc-turma-sel').value;
        if (!turma) { errEl.textContent = 'Selecione uma turma.'; errEl.style.display = 'block'; return; }
        var fonte = relDocTipo === 'certificado-formado' || relDocTipo === 'carteira-formado'
            ? candidatos.filter(function(c) { return (c.tipoPessoa || 'A') === 'F'; })
            : candidatos.filter(function(c) { return (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo'; });
        var lista = fonte.filter(function(c) { return c.turma === turma; });
        if (!lista.length) { errEl.textContent = 'Nenhum cadastro encontrado para esta turma.'; errEl.style.display = 'block'; return; }
        lista.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
        relDocFechar();
        if (relDocTipo === 'carteira-aluno') relGerarCarteiraAluno(lista);
        else if (relDocTipo === 'certificado-formado') relGerarCertificadoFormado(lista);
        else if (relDocTipo === 'carteira-formado') relGerarCarteiraFormado(lista);
    }
}

function relatorioCarteiraAluno() { relDocAbrir('carteira-aluno'); }
function relatorioCertificadoFormado() { relDocAbrir('certificado-formado'); }
function relatorioCarteiraFormado() { relDocAbrir('carteira-formado'); }

function relatorioFaltas() {
    var turmas = new Set();
    candidatos.filter(function(c) { return (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo'; }).forEach(function(c) { if (c.turma) turmas.add(c.turma); });
    if (!turmas.size) { alert('Nenhuma turma encontrada.'); return; }

    var selHtml = '<option value="">Selecione a turma...</option>';
    Array.from(turmas).sort().forEach(function(t) { selHtml += '<option value="' + t + '">' + t + '</option>'; });

    var w = window.open('', '_blank', 'width=500,height=300');
    w.document.write('<!DOCTYPE html><html><head><title>Faltas por Turma - FARN</title><style>' +
        'body{font-family:Arial,sans-serif;padding:30px;background:#f1f5f9}' +
        '.box{max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:30px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center}' +
        'h2{color:#dc2626;margin-bottom:20px;font-size:18px}' +
        'select{width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:16px}' +
        'button{padding:12px 32px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
        '</style></head><body><div class="box">' +
        '<h2><i class="fa-solid fa-user-xmark"></i> Relatorio de Faltas por Turma</h2>' +
        '<select id="sel-turma-faltas">' + selHtml + '</select>' +
        '<br><button onclick="gerarRelatorioFaltas()">Gerar Relatorio</button>' +
        '</div></body></html>');
    w.document.close();
    w.gerarRelatorioFaltas = function() {
        var turma = w.document.getElementById('sel-turma-faltas').value;
        if (!turma) { alert('Selecione uma turma.'); return; }

        dbFirestore.collection('presencasAlunos').where('turma', '==', turma).limit(500).get().then(function(snap) {
            var faltas = {};
            snap.forEach(function(doc) {
                var p = doc.data();
                if (p.status === 'Falta') {
                    var cpf = (p.cpf || '').replace(/\D/g, '');
                    if (!faltas[cpf]) faltas[cpf] = { nome: p.nome || '---', cpf: cpf, matricula: p.matricula || '---', whatsapp: '---', aulas: [], count: 0 };
                    faltas[cpf].aulas.push((p.disciplina || p.aula || '---') + (p.dataAula ? ' (' + p.dataAula + ')' : ''));
                    faltas[cpf].count++;
                }
            });

            /* Busca WhatsApp dos candidatos */
            var cpfs = Object.keys(faltas);
            candidatos.forEach(function(c) {
                var cpfLimpo = (c.cpf || '').replace(/\D/g, '');
                if (faltas[cpfLimpo] && c.whatsapp) faltas[cpfLimpo].whatsapp = c.whatsapp;
            });

            var lista = Object.values(faltas);
            if (!lista.length) {
                w.document.body.innerHTML = '<div style="text-align:center;padding:40px;font-family:Arial"><h2 style="color:#16a34a"><i class="fa-solid fa-check-circle"></i> Nenhuma falta encontrada!</h2><p>Turma: ' + turma + '</p><button onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#1a237e;color:#fff;border:none;border-radius:8px;cursor:pointer">Imprimir</button></div>';
                return;
            }

            lista.sort(function(a, b) { return b.count - a.count || (a.nome || '').localeCompare(b.nome || ''); });

            var header = '<div class="header"><img src="https://firebasestorage.googleapis.com/v0/b/farn-app.appspot.com/o/logofarn.png?alt=media" style="height:50px;margin-bottom:4px"><div class="title-line">FARN - BRASIL - BS.BRASIL - COMMAND BRASIL</div><div class="info-line">CNPJ: 43.327.929/0001-32</div></div>';
            var totalFaltas = lista.reduce(function(s, c) { return s + c.count; }, 0);

            w.document.body.innerHTML = '<style>' +
                '@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#222;padding:20px;font-size:11px}' +
                '.header{text-align:center;margin-bottom:6px;border-bottom:3px solid #1a237e;padding-bottom:8px}' +
                '.header .title-line{font-size:13px;font-weight:800;color:#1a237e;text-transform:uppercase;letter-spacing:1px}' +
                '.header .info-line{font-size:10px;color:#666;margin-top:3px}' +
                '.report-title{text-align:center;font-size:15px;font-weight:800;color:#dc2626;margin:10px 0;text-transform:uppercase;letter-spacing:2px;border:2px solid #dc2626;padding:7px;border-radius:4px}' +
                '.info-bar{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:10px;padding:0 4px}' +
                'table{width:100%;border-collapse:collapse}' +
                'th{background:#dc2626;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}' +
                'td{padding:7px 10px;border-bottom:1px solid #e0e0e0;font-size:11px}' +
                'tr:nth-child(even){background:#fef2f2}' +
                'td.nome{font-weight:600}' +
                'td.matricula{color:#dc2626;font-weight:800;font-family:Courier New,monospace;font-size:12px;letter-spacing:1px}' +
                'td.center{text-align:center;font-weight:700;color:#dc2626}' +
                'th:nth-child(1){width:3%}th:nth-child(2){width:22%}th:nth-child(3){width:13%}th:nth-child(4){width:13%}th:nth-child(5){width:8%}th:nth-child(6){width:41%}' +
                '.print-btn{display:block;margin:16px auto 0;padding:12px 32px;background:#1a237e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
                '.footer{margin-top:14px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:8px}' +
                '.total{text-align:right;font-size:12px;font-weight:700;color:#333;margin-top:8px;padding-right:4px}' +
                '@media print{.print-btn{display:none}th{background:#dc2626!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even){background:#fef2f2!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
                '</style>' +
                header +
                '<div class="report-title">Relatorio de Alunos com Faltas - ' + turma + '</div>' +
                '<div class="info-bar"><span>Data: ' + new Date().toLocaleDateString('pt-BR') + '</span><span>Total: ' + lista.length + ' aluno(s) | ' + totalFaltas + ' falta(s)</span></div>' +
                '<table><thead><tr><th>#</th><th>Nome</th><th>Matricula</th><th>WhatsApp</th><th>Faltas</th><th>Aulas Faltadas</th></tr></thead><tbody>' +
                lista.map(function(c, i) {
                    return '<tr><td>' + (i + 1) + '</td><td class="nome">' + (c.nome || '---') + '</td><td class="matricula">' + c.matricula + '</td><td style="font-size:11px;white-space:nowrap">' + c.whatsapp + '</td><td class="center">' + c.count + '</td><td style="font-size:10px;color:#64748b">' + c.aulas.join(' | ') + '</td></tr>';
                }).join('') +
                '</tbody></table>' +
                '<div class="total">Total de faltas: ' + totalFaltas + '</div>' +
                '<button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir Relatorio</button>' +
                '<div class="footer">FARN - Forca Auxiliar de Resgate Nacional | Relatorio gerado em ' + new Date().toLocaleString('pt-BR') + '</div>';
        }).catch(function(e) { alert('Erro ao buscar presencas: ' + e.message); });
    };
}

function relatorioEquipamentos() {
    var turmasComCurso = turmas.filter(function(t) { return t && t.nome; });
    if (!turmasComCurso.length) { alert('Nenhuma turma encontrada.'); return; }
    turmasComCurso.sort(function(a, b) { return (a.projeto || '').localeCompare(b.projeto || '') || (a.nome || '').localeCompare(b.nome || ''); });

    var selHtml = '<option value="">Selecione a turma...</option>';
    turmasComCurso.forEach(function(t, idx) {
        var label = t.nome + (t.projeto ? ' (' + t.projeto + ')' : '');
        selHtml += '<option value="' + idx + '">' + label + '</option>';
    });

    var w = window.open('', '_blank', 'width=500,height=300');
    w.document.write('<!DOCTYPE html><html><head><title>Equipamentos (EPI) por Turma - FARN</title><style>' +
        'body{font-family:Arial,sans-serif;padding:30px;background:#f1f5f9}' +
        '.box{max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:30px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center}' +
        'h2{color:#f59e0b;margin-bottom:20px;font-size:18px}' +
        'select{width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:16px}' +
        'button{padding:12px 32px;background:#f59e0b;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
        '</style></head><body><div class="box">' +
        '<h2><i class="fa-solid fa-hard-hat"></i> Equipamentos (EPI) por Turma</h2>' +
        '<select id="sel-turma-epi">' + selHtml + '</select>' +
        '<br><button onclick="gerarRelatorioEquipamentos()">Gerar Relatorio</button>' +
        '</div></body></html>');
    w.document.close();

    w.gerarRelatorioEquipamentos = function() {
        var idx = w.document.getElementById('sel-turma-epi').value;
        if (idx === '') { alert('Selecione uma turma.'); return; }
        var turmaSel = turmasComCurso[Number(idx)];
        var turma = turmaSel.nome;
        var nomeCurso = turmaSel.curso || '';

        w.document.body.innerHTML = '<div style="text-align:center;padding:40px;font-family:Arial"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando alunos e equipamentos da turma...</div>';

        var buscaCurso;
        if (nomeCurso) {
            var cursosRef = dbFirestore.collection('cursos').where('nome', '==', nomeCurso).limit(1).get();
            buscaCurso = cursosRef.catch(function() { return { empty: true }; });
        } else {
            buscaCurso = Promise.resolve({ empty: true, docs: [] });
        }

        buscaCurso.then(function(curSnap) {
                var epis = [];
                if (!curSnap.empty && curSnap.docs[0] && curSnap.docs[0].data && curSnap.docs[0].data().epis) {
                    epis = curSnap.docs[0].data().epis || [];
                }

                var alunos = candidatos.filter(function(c) { return c.turma === turma && (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo'; });
                alunos.sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); });

                if (!alunos.length) {
                    w.document.body.innerHTML = '<div style="text-align:center;padding:40px;font-family:Arial"><h2 style="color:#16a34a"><i class="fa-solid fa-check-circle"></i> Nenhum aluno ativo encontrado!</h2><p>Turma: ' + turma + '</p><button onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#1a237e;color:#fff;border:none;border-radius:8px;cursor:pointer">Imprimir</button></div>';
                    return;
                }

                var semEpi = epis.length === 0;

                var header = '<div class="header"><img src="https://firebasestorage.googleapis.com/v0/b/farn-app.appspot.com/o/logofarn.png?alt=media" style="height:50px;margin-bottom:4px"><div class="title-line">FARN - BRASIL - BS.BRASIL - COMMAND BRASIL</div><div class="info-line">CNPJ: 43.327.929/0001-32</div></div>';

                var theadEquip = '';
                epis.forEach(function(e, i) {
                    theadEquip += '<th>EPI ' + (i + 1) + ':<br>' + (e.nome || '---') + '</th>';
                });
                theadEquip += '<th class="col-total">Total de Itens</th>';

                var rows = alunos.map(function(a, idx) {
                    var cols = '';
                    var soma = 0;
                    epis.forEach(function(e) {
                        var qtd = (e.quantidade != null ? e.quantidade : 0);
                        soma += Number(qtd) || 0;
                        cols += '<td class="center">' + (Number(qtd) || 0) + '</td>';
                    });
                    cols += '<td class="center col-total">' + soma + '</td>';
                    return '<tr><td>' + (idx + 1) + '</td><td class="nome">' + (a.nome || '---') + '</td><td class="matricula">' + (a.matricula || '---') + '</td>' + cols + '</tr>';
                }).join('');

                var totalCols = '';
                epis.forEach(function(e) {
                    var qtd = Number(e.quantidade) || 0;
                    var tot = qtd * alunos.length;
                    totalCols += '<td class="center total-row">' + tot + '</td>';
                });
                totalCols += '<td class="center total-row col-total">' + (alunos.length) + ' aluno(s)</td>';

                w.document.body.innerHTML = '<style>' +
                    '@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#222;padding:20px;font-size:11px}' +
                    '.header{text-align:center;margin-bottom:6px;border-bottom:3px solid #b45309;padding-bottom:8px}' +
                    '.header .title-line{font-size:13px;font-weight:800;color:#b45309;text-transform:uppercase;letter-spacing:1px}' +
                    '.header .info-line{font-size:10px;color:#666;margin-top:3px}' +
                    '.report-title{text-align:center;font-size:15px;font-weight:800;color:#b45309;margin:10px 0;text-transform:uppercase;letter-spacing:2px;border:2px solid #b45309;padding:7px;border-radius:4px}' +
                    '.info-bar{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:10px;padding:0 4px}' +
                    'table{width:100%;border-collapse:collapse}' +
                    'th{background:#b45309;color:#fff;padding:7px 8px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.3px;vertical-align:middle}' +
                    'td{padding:6px 8px;border-bottom:1px solid #e0e0e0;font-size:11px}' +
                    'tr:nth-child(even){background:#fef3c7}' +
                    'td.nome{font-weight:600}' +
                    'td.matricula{color:#b45309;font-weight:800;font-family:Courier New,monospace;font-size:11px;letter-spacing:1px}' +
                    'td.center{text-align:center;font-weight:700}' +
                    'td.col-total{background:#fef9c3;color:#92400e}' +
                    'th.col-total{background:#92400e}' +
                    'td.total-row{background:#fef3c7;color:#78350f;font-weight:800}' +
                    'th:nth-child(1){width:3%}th:nth-child(2){width:20%}th:nth-child(3){width:13%}' +
                    '.no-epi{background:#fffbeb;border:2px dashed #f59e0b;color:#92400e;padding:16px;text-align:center;font-size:13px;border-radius:8px;margin-bottom:12px}' +
                    '.print-btn{display:block;margin:16px auto 0;padding:12px 32px;background:#1a237e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
                    '.footer{margin-top:14px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:8px}' +
                    '.total{text-align:right;font-size:12px;font-weight:700;color:#333;margin-top:8px;padding-right:4px}' +
                    '@media print{.print-btn{display:none}th{background:#b45309!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even){background:#fef3c7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}td.col-total{background:#fef9c3!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
                    '</style>' +
                    header +
                    '<div class="report-title">Relatorio de Equipamentos (EPI) dos Alunos - ' + turma + '</div>' +
                    '<div class="info-bar"><span>Data: ' + new Date().toLocaleDateString('pt-BR') + '</span><span>Curso: ' + (nomeCurso || 'Nao vinculado') + '</span><span>Total: ' + alunos.length + ' aluno(s)</span></div>' +
                    (semEpi ? '<div class="no-epi"><i class="fa-solid fa-triangle-exclamation"></i> O curso desta turma nao possui equipamentos (EPI) cadastrados.</div>' : '') +
                    '<table><thead><tr><th>#</th><th>Nome do Aluno</th><th>Matricula</th>' + theadEquip + '</tr></thead><tbody>' +
                    rows +
                    '<tr><td colspan="3" style="text-align:right;font-weight:800;color:#78350f;background:#fef9c3">Total por Equipamento</td>' + totalCols + '</tr>' +
                    '</tbody></table>' +
                    '<div class="total">Total de itens distribuidos por aluno: ' + alunos.length + ' aluno(s) na turma</div>' +
                    '<button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir Relatorio</button>' +
                    '<div class="footer">FARN - Forca Auxiliar de Resgate Nacional | Relatorio gerado em ' + new Date().toLocaleString('pt-BR') + '</div>';
            }).catch(function(e) { alert('Erro ao buscar equipamentos: ' + e.message); });
    };
}


function relGerarCarteiraAluno(lista) {
    var cards = lista.map(function(c) {
        var mat = c.matricula || generateMatricula(c.cpf) || '---';
        var cpfDisp = c.cpf || '';
        if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(mat) + '&size=100x100&margin=2';
        return '<div class="pf-carteira-card" style="page-break-inside:avoid;margin-bottom:16px">' +
            '<img src="CARTEIRA2.png" alt="Carteira FARN" class="pf-carteira-bg">' +
            '<div class="pf-carteira-overlay">' +
                '<div class="pf-carteira-foto-box"><i class="fa-solid fa-user"></i></div>' +
                '<div class="pf-carteira-dados-box">' +
                    '<div class="pf-carteira-dado" style="font-size:12px;font-weight:800;letter-spacing:.5px;color:#1a237e;margin-bottom:2px">' + (c.nome || '---').toUpperCase() + '</div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">MATRICULA:</span> <span class="pf-cd-val pf-cd-mat">' + mat + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">CPF:</span> <span class="pf-cd-val">' + cpfDisp + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">NASC.:</span> <span class="pf-cd-val">' + (c.nascimento || '---') + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">TIPO SANG.:</span> <span class="pf-cd-val">' + (c.fatorRh || '---') + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">TURMA:</span> <span class="pf-cd-val">' + (c.turma || '---') + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">PROJETO:</span> <span class="pf-cd-val" style="color:#c2410c;font-size:10px">' + (c.projeto || '---') + '</span></div>' +
                '</div>' +
                '<div class="pf-carteira-qr-box"><img src="' + qrUrl + '" alt="QR Code"></div>' +
                '<div class="pf-carteira-title-overlay">CARTEIRA DE IDENTIFICACAO DE ALUNO</div>' +
                '<div class="pf-carteira-inst-overlay">FARN - FORCA AUXILIAR DE RESGATE NACIONAL - CNPJ 43.327.929/0001-32</div>' +
                '<div class="pf-carteira-aviso-overlay">NAO E VALIDA COMO CARTEIRA FUNCIONAL. SUJEITO AO CUMPRIMENTO DAS PENALIDADES EM CASO DE USO INDEVIDO.</div>' +
            '</div></div>';
    }).join('');

    var css = '.pf-carteira-card{max-width:700px;margin:0 auto 16px;position:relative;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.2)}' +
        '.pf-carteira-bg{width:100%;display:block}' +
        '.pf-carteira-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:flex;align-items:center;justify-content:center}' +
        '.pf-carteira-foto-box{position:absolute;top:38%;left:9%;width:17%;aspect-ratio:3/4;background:#f5f5f5;border:2px solid #8B6914;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center}' +
        '.pf-carteira-foto-box .fa-user{font-size:28px;color:#bbb}' +
        '.pf-carteira-dados-box{position:absolute;top:36%;left:29%;width:32%;display:flex;flex-direction:column;gap:7px}' +
        '.pf-carteira-dado{font-size:13px;line-height:1.4;color:#1e293b;display:flex;gap:4px;align-items:baseline}' +
        '.pf-cd-label{font-weight:700;color:#374151;font-size:10px;text-transform:uppercase;white-space:nowrap;min-width:58px}' +
        '.pf-cd-val{font-weight:600;font-size:13px}' +
        '.pf-cd-mat{color:#16a34a;font-family:Courier New,monospace;font-size:14px;font-weight:800;letter-spacing:1px}' +
        '.pf-carteira-qr-box{position:absolute;top:52%;right:2%;width:18%;text-align:center}' +
        '.pf-carteira-qr-box img{width:100%;border-radius:4px;background:#fff;padding:2px}' +
        '.pf-carteira-title-overlay{position:absolute;top:3%;left:0;width:100%;text-align:center;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;text-shadow:1px 1px 3px rgba(0,0,0,.6)}' +
        '.pf-carteira-inst-overlay{position:absolute;bottom:15%;left:9%;width:78%;text-align:center;color:#1a237e;font-size:9px;font-weight:700;letter-spacing:.5px}' +
        '.pf-carteira-aviso-overlay{position:absolute;bottom:11%;left:9%;width:78%;text-align:center;color:#555;font-size:7px;font-style:italic;letter-spacing:.3px}' +
        '.print-btn{display:block;margin:16px auto 0;padding:12px 32px;background:#1a237e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
        '@media print{@page{size:auto;margin:5mm}body{padding:0;margin:0;background:#fff}' +
        '.print-btn{display:none}' +
        '.pf-carteira-card{box-shadow:none;width:10cm;height:auto;margin:0 auto;page-break-inside:avoid;overflow:hidden;border-radius:0}' +
        '.pf-carteira-bg{width:100%;height:auto;display:block}' +
        '}' +
        '@media screen{.pf-carteira-card{max-width:10cm}}';

    var w = window.open('', '_blank', 'width=800,height=600');
    w.document.write('<!DOCTYPE html><html><head><title>Carteira de Aluno - FARN</title><style>' + css + '</style></head><body style="padding:20px;background:#f1f5f9">' +
        '<h2 style="text-align:center;color:#1a237e;margin-bottom:16px"><i class="fa-solid fa-id-card"></i> Carteiras de Aluno (' + lista.length + ')</h2>' +
        cards + '<button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir / Salvar PDF</button></body></html>');
    w.document.close();
}

function relGerarCertificadoFormado(lista) {
    var items = lista.map(function(c) {
        var nome = (c.nome || '').toUpperCase();
        var cpfDisp = c.cpf || '';
        if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        var nasc = c.nascimento || '---';
        if (nasc && nasc.indexOf('-') !== -1) { var p = nasc.split('-'); if (p.length === 3) nasc = p[2] + '/' + p[1] + '/' + p[0]; }
        var natural = c.naturalidade || '---';
        var mat = c.matricula || '---';
        var formacao = c.dataCertificado || '---';
        if (formacao && formacao.indexOf('-') !== -1) { var p2 = formacao.split('-'); if (p2.length === 3) formacao = p2[2] + '/' + p2[1] + '/' + p2[0]; }
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(mat) + '&size=200x200&margin=2';
        return '<div style="position:relative;width:100%;max-width:900px;margin:0 auto 20px;page-break-inside:avoid">' +
            '<img src="CERTIFICADO.png" style="width:100%;height:auto;display:block">' +
            '<div style="position:absolute;left:0;right:0;top:36.4%;text-align:center;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#1c1917">' + nome + '</div>' +
            '<div style="position:absolute;left:8%;right:8%;top:40%;text-align:center;font-family:Georgia,serif;font-size:9px;color:#1c1917;white-space:nowrap">' +
                '<span style="margin:0 1.5%">CPF: ' + cpfDisp + '</span>' +
                '<span style="margin:0 1.5%">Nascido em: ' + nasc + '</span>' +
                '<span style="margin:0 1.5%">Natural de: ' + natural + '</span>' +
                '<span style="margin:0 1.5%">Matricula: ' + mat + '</span>' +
                '<span style="margin:0 1.5%">Formacao: ' + formacao + '</span>' +
            '</div>' +
            '<img style="position:absolute;right:8.7%;bottom:21.7%;width:8%;background:#fff;border:2px solid #1c1917;padding:2px;box-sizing:border-box" src="' + qrUrl + '" alt="QR">' +
        '</div>';
    }).join('');

    var w = window.open('', '_blank', 'width=1000,height=700');
    w.document.write('<!DOCTYPE html><html><head><title>Certificado de Formado - FARN</title><style>html,body{margin:0;padding:0;background:#f1f5f9}img{display:block;width:100%}.print-btn{display:block;margin:16px auto 0;padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>' +
        '<h2 style="text-align:center;color:#2563eb;margin:16px 0"><i class="fa-solid fa-award"></i> Certificados de Formado (' + lista.length + ')</h2>' +
        items + '<button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir / Salvar PDF</button></body></html>');
    w.document.close();
}

function relGerarCarteiraFormado(lista) {
    var cards = lista.map(function(c) {
        var mat = c.matricula || '---';
        var cpfDisp = c.cpf || '';
        if (cpfDisp.length === 11) cpfDisp = cpfDisp.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(mat) + '&size=100x100&margin=2';
        return '<div class="pf-carteira-card" style="page-break-inside:avoid;margin-bottom:16px">' +
            '<img src="CARTEIRA2.png" alt="Carteira FARN" class="pf-carteira-bg">' +
            '<div class="pf-carteira-overlay">' +
                '<div class="pf-carteira-foto-box"><i class="fa-solid fa-user"></i></div>' +
                '<div class="pf-carteira-dados-box">' +
                    '<div class="pf-carteira-dado" style="font-size:12px;font-weight:800;letter-spacing:.5px;color:#1a237e;margin-bottom:2px">' + (c.nome || '---').toUpperCase() + '</div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">MATRICULA:</span> <span class="pf-cd-val pf-cd-mat">' + mat + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">CPF:</span> <span class="pf-cd-val">' + cpfDisp + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">NASC.:</span> <span class="pf-cd-val">' + (c.nascimento || '---') + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">TIPO SANG.:</span> <span class="pf-cd-val">' + (c.fatorRh || '---') + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">TURMA:</span> <span class="pf-cd-val">' + (c.turma || '---') + '</span></div>' +
                    '<div class="pf-carteira-dado"><span class="pf-cd-label">PROJETO:</span> <span class="pf-cd-val" style="color:#c2410c;font-size:10px">' + (c.projeto || '---') + '</span></div>' +
                '</div>' +
                '<div class="pf-carteira-qr-box"><img src="' + qrUrl + '" alt="QR Code"></div>' +
                '<div class="pf-carteira-title-overlay">CARTEIRA DE IDENTIFICACAO DE FORMADO</div>' +
                '<div class="pf-carteira-inst-overlay">FARN - FORCA AUXILIAR DE RESGATE NACIONAL - CNPJ 43.327.929/0001-32</div>' +
                '<div class="pf-carteira-aviso-overlay">NAO E VALIDA COMO CARTEIRA FUNCIONAL. SUJEITO AO CUMPRIMENTO DAS PENALIDADES EM CASO DE USO INDEVIDO.</div>' +
            '</div></div>';
    }).join('');

    var css = '.pf-carteira-card{max-width:700px;margin:0 auto 16px;position:relative;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.2)}' +
        '.pf-carteira-bg{width:100%;display:block}' +
        '.pf-carteira-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:flex;align-items:center;justify-content:center}' +
        '.pf-carteira-foto-box{position:absolute;top:38%;left:9%;width:17%;aspect-ratio:3/4;background:#f5f5f5;border:2px solid #8B6914;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center}' +
        '.pf-carteira-foto-box .fa-user{font-size:28px;color:#bbb}' +
        '.pf-carteira-dados-box{position:absolute;top:36%;left:29%;width:32%;display:flex;flex-direction:column;gap:7px}' +
        '.pf-carteira-dado{font-size:13px;line-height:1.4;color:#1e293b;display:flex;gap:4px;align-items:baseline}' +
        '.pf-cd-label{font-weight:700;color:#374151;font-size:10px;text-transform:uppercase;white-space:nowrap;min-width:58px}' +
        '.pf-cd-val{font-weight:600;font-size:13px}' +
        '.pf-cd-mat{color:#7c3aed;font-family:Courier New,monospace;font-size:14px;font-weight:800;letter-spacing:1px}' +
        '.pf-carteira-qr-box{position:absolute;top:52%;right:2%;width:18%;text-align:center}' +
        '.pf-carteira-qr-box img{width:100%;border-radius:4px;background:#fff;padding:2px}' +
        '.pf-carteira-title-overlay{position:absolute;top:3%;left:0;width:100%;text-align:center;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;text-shadow:1px 1px 3px rgba(0,0,0,.6)}' +
        '.pf-carteira-inst-overlay{position:absolute;bottom:15%;left:9%;width:78%;text-align:center;color:#1a237e;font-size:9px;font-weight:700;letter-spacing:.5px}' +
        '.pf-carteira-aviso-overlay{position:absolute;bottom:11%;left:9%;width:78%;text-align:center;color:#555;font-size:7px;font-style:italic;letter-spacing:.3px}' +
        '.print-btn{display:block;margin:16px auto 0;padding:12px 32px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
        '@media print{@page{size:auto;margin:5mm}body{padding:0;margin:0;background:#fff}' +
        '.print-btn{display:none}' +
        '.pf-carteira-card{box-shadow:none;width:10cm;height:auto;margin:0 auto;page-break-inside:avoid;overflow:hidden;border-radius:0}' +
        '.pf-carteira-bg{width:100%;height:auto;display:block}' +
        '}' +
        '@media screen{.pf-carteira-card{max-width:10cm}}';

    var w = window.open('', '_blank', 'width=800,height=600');
    w.document.write('<!DOCTYPE html><html><head><title>Carteira de Formado - FARN</title><style>' + css + '</style></head><body style="padding:20px;background:#f1f5f9">' +
        '<h2 style="text-align:center;color:#7c3aed;margin-bottom:16px"><i class="fa-solid fa-id-card-clip"></i> Carteiras de Formado (' + lista.length + ')</h2>' +
        cards + '<button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir / Salvar PDF</button></body></html>');
    w.document.close();
}

function relatorioUniforme() {
    const aprovados = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo');
    if (!aprovados.length) { alert('Nenhum aluno ativo para gerar relatorio.'); return; }
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
            <img src="${FARN_LOGO}" alt="FARN">
            <div class="title-line">FARN - BRASIL - BS.BRASIL - COMMAND BRASIL</div>
            <div class="info-line">CNPJ: 43.327.929/0001-32 | Telefone: (81) 98403-1538</div>
        </div>
        <div class="report-title">Relatorio de Medidas de Uniforme</div>
        <div class="info-bar">
            <span>Data: ${new Date().toLocaleDateString('pt-BR')}</span>
            <span>Total de Ativos: ${aprovados.length}</span>
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
    { key: 'idade', label: 'Idade' },
    { key: 'genero', label: 'Genero de Nascimento' },
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
    { key: 'dataInscricao', label: 'Data Inscricao' },
    { key: 'dataHoraCadastro', label: 'Data/Hora 1o Cadastro' }
];

function abrirModalMontarRelatorio() {
    const grid = document.getElementById('campos-relatorio-grid');
    if (!grid) return;
    grid.innerHTML = camposRelatorio.map(c => `
        <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:#f0fdf4;border-radius:6px;cursor:pointer;font-size:12px;color:#475569;transition:background 0.2s" onmouseenter="this.style.background='#e2e8f0'" onmouseleave="this.style.background='#f0fdf4'">
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
    if (key === 'senha') return c.status === 'Ativo' && c.senha ? c.senha : '---';
    return c[key] || '---';
}

function gerarRelatorioPersonalizado() {
    const campos = getCamposSelecionados();
    if (!campos.length) { alert('Selecione pelo menos um campo para gerar o relatorio.'); return; }
    if (!candidatos.length) { alert('Nenhum candidato cadastrado.'); return; }
    fecharModalMontarRelatorio();
    let lista = candidatos.filter(c => (c.tipoPessoa || 'A') !== 'F' && !c.remanejadoDocente && c.status === 'Ativo');
    if (!lista.length) { alert('Nenhum aluno ativo para gerar relatorio.'); return; }
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
            <img src="${FARN_LOGO}" alt="FARN">
            <div class="title-line">FARN - BRASIL - BS.BRASIL - COMMAND BRASIL</div>
            <div class="info-line">CNPJ: 43.327.929/0001-32 | Telefone: (81) 98403-1538</div>
        </div>
        <div class="report-title">Relatorio de Alunos - Ativos</div>
        <div class="info-bar">
            <span>Data: ${new Date().toLocaleDateString('pt-BR')} | Status: Ativo</span>
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
        var infoExtra = '';
        if (t.curso) infoExtra += '<span style="color:#94a3b8;font-size:11px"><i class="fa-solid fa-book" style="margin-right:4px"></i>' + t.curso + '</span>';
        if (t.inicio) infoExtra += '<span style="color:#94a3b8;font-size:11px;margin-left:8px"><i class="fa-solid fa-flag" style="margin-right:4px"></i>Inicio: ' + t.inicio + '</span>';
        if (t.previsao) infoExtra += '<span style="color:#94a3b8;font-size:11px;margin-left:8px"><i class="fa-solid fa-calendar" style="margin-right:4px"></i>Previsao: ' + t.previsao + '</span>';
        if (t.dias && t.dias.length) infoExtra += '<span style="color:#94a3b8;font-size:11px;margin-left:8px"><i class="fa-solid fa-calendar-days" style="margin-right:4px"></i>' + t.dias.join(', ') + '</span>';
        if (t.horarios) {
            var hList = Object.entries(t.horarios).map(function(e) { return e[0] + ': ' + e[1].inicio + ' - ' + e[1].fim; }).join(', ');
            if (hList) infoExtra += '<span style="color:#94a3b8;font-size:11px;margin-left:8px"><i class="fa-solid fa-clock" style="margin-right:4px"></i>' + hList + '</span>';
        }
        div.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;gap:2px">' +
            '<span style="color:#fff;font-size:13px;font-weight:600"><i class="fa-solid fa-people-group" style="color:#4caf50;margin-right:8px"></i>' + t.nome + '</span>' +
            (t.descricao ? '<span style="color:#888;font-size:12px;margin-left:24px">' + t.descricao + '</span>' : '') +
            (infoExtra ? '<span style="margin-left:24px;display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">' + infoExtra + '</span>' : '') +
            '</div>' +
            '<button type="button" class="btn-icon" title="Editar" onclick="projetoEditarTurma(' + i + ')"><i class="fa-solid fa-pen"></i></button>' +
            '<button type="button" class="btn-icon btn-danger-icon" title="Remover" onclick="projetoRemoverTurma(' + i + ')"><i class="fa-solid fa-trash"></i></button>';
        div.addEventListener('mouseenter', function() { this.style.background = '#e2e8f0'; });
        div.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
        lista.appendChild(div);
    });
}

function pfTurmaToggleDia(el) {
    el.closest('label').style.background = el.checked ? '#16a34a' : '#fff';
    el.closest('label').style.color = el.checked ? '#fff' : '#1e293b';
    el.closest('label').style.borderColor = el.checked ? '#16a34a' : '#d1d5db';
    pfTurmaAtualizarHorarios();
}

function pfTurmaAtualizarHorarios() {
    var area = document.getElementById('pf-turma-horarios-area');
    if (!area) return;
    var dias = [];
    document.querySelectorAll('#pf-turma-dias input[type=checkbox]:checked').forEach(function(cb) { dias.push(cb.value); });
    if (!dias.length) { area.innerHTML = '<span style="font-size:11px;color:#94a3b8">Selecione os dias da semana para definir horarios</span>'; return; }
    var html = '<label style="font-size:11px;font-weight:600;color:#475569;margin-bottom:6px;display:block">Horarios por Dia</label><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
    dias.forEach(function(d) {
        var val = { inicio: '08:00', fim: '17:00' };
        html += '<div style="display:flex;align-items:center;gap:6px;background:#fff;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px">' +
            '<span style="font-size:12px;font-weight:600;color:#1e293b;min-width:32px">' + d + '</span>' +
            '<input type="time" value="' + val.inicio + '" class="pf-turma-hora-inicio" data-dia="' + d + '" style="font-size:11px;padding:3px 4px;border:1px solid #d1d5db;border-radius:4px;width:75px">' +
            '<span style="color:#94a3b8;font-size:11px">-</span>' +
            '<input type="time" value="' + val.fim + '" class="pf-turma-hora-fim" data-dia="' + d + '" style="font-size:11px;padding:3px 4px;border:1px solid #d1d5db;border-radius:4px;width:75px">' +
            '</div>';
    });
    html += '</div>';
    area.innerHTML = html;
}

function pfTurmaCarregarCursos(valor) {
    var sel = document.getElementById('pf-turma-curso');
    if (!sel) return;
    dbFirestore.collection('cursos').orderBy('nome').get().then(function(snap) {
        var html = '<option value="">Selecione o curso...</option>';
        snap.forEach(function(doc) {
            var c = doc.data();
            var nome = c.nome || '';
            var selAttr = (valor && nome === valor) ? ' selected' : '';
            html += '<option value="' + escHTML(nome) + '"' + selAttr + '>' + escHTML(nome) + '</option>';
        });
        sel.innerHTML = html;
    }).catch(function(e) {
        console.error('Erro ao carregar cursos:', e);
        sel.innerHTML = '<option value="">Selecione o curso...</option>';
    });
}

function pfTurmaColetarDados() {
    var dias = [];
    document.querySelectorAll('#pf-turma-dias input[type=checkbox]:checked').forEach(function(cb) { dias.push(cb.value); });
    var horarios = {};
    dias.forEach(function(d) {
        var ini = document.querySelector('.pf-turma-hora-inicio[data-dia="' + d + '"]');
        var fim = document.querySelector('.pf-turma-hora-fim[data-dia="' + d + '"]');
        horarios[d] = { inicio: ini ? ini.value : '08:00', fim: fim ? fim.value : '17:00' };
    });
    return {
        inicio: (document.getElementById('pf-turma-inicio') && document.getElementById('pf-turma-inicio').value) || '',
        previsao: document.getElementById('pf-turma-previsao').value || '',
        dias: dias,
        horarios: horarios,
        curso: (document.getElementById('pf-turma-curso') ? document.getElementById('pf-turma-curso').value : '') || ''
    };
}

function pfTurmaPreencherForm(t) {
    pfTurmaCarregarCursos(t.curso || '');
    document.getElementById('pf-turma-previsao').value = t.previsao || '';
    if (document.getElementById('pf-turma-inicio')) document.getElementById('pf-turma-inicio').value = t.inicio || '';
    document.querySelectorAll('#pf-turma-dias input[type=checkbox]').forEach(function(cb) {
        var checked = t.dias && t.dias.indexOf(cb.value) !== -1;
        cb.checked = checked;
        cb.closest('label').style.background = checked ? '#16a34a' : '#fff';
        cb.closest('label').style.color = checked ? '#fff' : '#1e293b';
        cb.closest('label').style.borderColor = checked ? '#16a34a' : '#d1d5db';
    });
    pfTurmaAtualizarHorarios();
    if (t.horarios) {
        Object.entries(t.horarios).forEach(function(e) {
            var ini = document.querySelector('.pf-turma-hora-inicio[data-dia="' + e[0] + '"]');
            var fim = document.querySelector('.pf-turma-hora-fim[data-dia="' + e[0] + '"]');
            if (ini) ini.value = e[1].inicio || '08:00';
            if (fim) fim.value = e[1].fim || '17:00';
        });
    }
}

function pfTurmaLimparForm() {
    pfTurmaCarregarCursos('');
    document.getElementById('pf-turma-nome').value = '';
    document.getElementById('pf-turma-desc').value = '';
    document.getElementById('pf-turma-previsao').value = '';
    if (document.getElementById('pf-turma-inicio')) document.getElementById('pf-turma-inicio').value = '';
    document.querySelectorAll('#pf-turma-dias input[type=checkbox]').forEach(function(cb) {
        cb.checked = false;
        cb.closest('label').style.background = '#fff';
        cb.closest('label').style.color = '#1e293b';
        cb.closest('label').style.borderColor = '#d1d5db';
    });
    pfTurmaAtualizarHorarios();
}

function projetoAdicionarTurma() {
    const nomeEl = document.getElementById('pf-turma-nome');
    const descEl = document.getElementById('pf-turma-desc');
    const nome = nomeEl.value.trim();
    if (!nome) { nomeEl.focus(); nomeEl.style.borderColor = '#f44336'; setTimeout(function() { nomeEl.style.borderColor = ''; }, 2000); return; }
    var duplicada = projetoTurmasTemp.find(function(t) { return t.nome.toLowerCase() === nome.toLowerCase(); });
    if (duplicada) { alert('Ja existe uma turma com esse nome neste projeto.'); return; }
    var extras = pfTurmaColetarDados();
    projetoTurmasTemp.push({ nome: nome, descricao: descEl.value.trim(), inicio: extras.inicio, previsao: extras.previsao, dias: extras.dias, horarios: extras.horarios, curso: extras.curso });
    pfTurmaLimparForm();
    nomeEl.focus();
    projetoRenderTurmas();
}

function projetoEditarTurma(i) {
    var t = projetoTurmasTemp[i];
    if (!t) return;
    document.getElementById('pf-turma-nome').value = t.nome;
    document.getElementById('pf-turma-desc').value = t.descricao || '';
    pfTurmaPreencherForm(t);
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
    var extras = pfTurmaColetarDados();
    projetoTurmasTemp[editingProjetoTurmaIdx].nome = nome;
    projetoTurmasTemp[editingProjetoTurmaIdx].descricao = descEl.value.trim();
    projetoTurmasTemp[editingProjetoTurmaIdx].inicio = extras.inicio;
    projetoTurmasTemp[editingProjetoTurmaIdx].previsao = extras.previsao;
    projetoTurmasTemp[editingProjetoTurmaIdx].dias = extras.dias;
    projetoTurmasTemp[editingProjetoTurmaIdx].horarios = extras.horarios;
    projetoTurmasTemp[editingProjetoTurmaIdx].curso = extras.curso;
    projetoCancelarEdicaoTurma();
    projetoRenderTurmas();
}

function projetoCancelarEdicaoTurma() {
    editingProjetoTurmaIdx = null;
    pfTurmaLimparForm();
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
    pfTurmaCarregarCursos('');
    pfTurmaAtualizarHorarios();
    document.getElementById('pf-nome').value = '';
    document.getElementById('pf-cnpj').value = '';
    document.getElementById('pf-responsavel').value = '';
    projetoRenderTurmas();
    document.getElementById('projeto-form-title').innerHTML = '<i class="fa-solid fa-handshake" style="color:#ff9800;margin-right:8px"></i> Novo Projeto';
    showAdminSection('admin-form-projeto');
}

async function sincronizarNomeProjeto(nomeAntigo, nomeNovo) {
    if (!nomeAntigo || !nomeNovo || nomeAntigo === nomeNovo) return;
    try {
        let total = 0;

        const candSnap = await dbFirestore.collection(FB_CANDIDATOS).where('projeto', '==', nomeAntigo).get();
        let batch1 = dbFirestore.batch(); let b1count = 0;
        for (const doc of candSnap.docs) {
            batch1.update(doc.ref, { projeto: nomeNovo }); total++; b1count++;
            if (b1count >= 450) { await batch1.commit(); batch1 = dbFirestore.batch(); b1count = 0; }
        }
        if (b1count) await batch1.commit();

        const turSnap = await dbFirestore.collection(FB_TURMAS).where('projeto', '==', nomeAntigo).get();
        let batch2 = dbFirestore.batch(); let b2count = 0;
        for (const doc of turSnap.docs) {
            batch2.update(doc.ref, { projeto: nomeNovo }); total++; b2count++;
            if (b2count >= 450) { await batch2.commit(); batch2 = dbFirestore.batch(); b2count = 0; }
        }
        if (b2count) await batch2.commit();

        let lastPres = null;
        while (true) {
            let q = dbFirestore.collection('presencasAlunos').where('projeto', '==', nomeAntigo).limit(450);
            if (lastPres) q = q.startAfter(lastPres);
            const presSnap = await q.get();
            if (presSnap.empty) break;
            const batch3 = dbFirestore.batch();
            presSnap.forEach(doc => { batch3.update(doc.ref, { projeto: nomeNovo }); total++; });
            await batch3.commit();
            lastPres = presSnap.docs[presSnap.docs.length - 1];
            if (presSnap.size < 450) break;
        }

        let lastApt = null;
        while (true) {
            let q = dbFirestore.collection('apontamentos').limit(100);
            if (lastApt) q = q.startAfter(lastApt);
            const aptSnap = await q.get();
            if (aptSnap.empty) break;
            for (const doc of aptSnap.docs) {
                if (doc.id === '_index') continue;
                const d = doc.data();
                if (d.alunos && Array.isArray(d.alunos)) {
                    let changed = false;
                    d.alunos.forEach(a => { if (a.projeto === nomeAntigo) { a.projeto = nomeNovo; changed = true; } });
                    if (changed) { await doc.ref.update({ alunos: d.alunos }); total++; }
                }
            }
            lastApt = aptSnap.docs[aptSnap.docs.length - 1];
            if (aptSnap.size < 100) break;
        }

        const aulaSnap = await dbFirestore.collection('aulas').where('projeto', '==', nomeAntigo).get();
        let batch6 = dbFirestore.batch(); let b6count = 0;
        for (const doc of aulaSnap.docs) {
            batch6.update(doc.ref, { projeto: nomeNovo }); total++; b6count++;
            if (b6count >= 450) { await batch6.commit(); batch6 = dbFirestore.batch(); b6count = 0; }
        }
        if (b6count) await batch6.commit();

        alert('Projeto renomeado com sucesso! ' + total + ' registros sincronizados.');
    } catch (e) {
        console.error('Erro ao sincronizar nome do projeto:', e);
        alert('Atencao: projeto renomeado, mas houve erro na sincronizacao: ' + e.message);
    }
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
            if (old.nome && old.nome !== nome) {
                await sincronizarNomeProjeto(old.nome, nome);
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
            const turmaData = { id: t.nome + '_' + nome, nome: t.nome, descricao: t.descricao, projeto: nome, inicio: t.inicio || '', previsao: t.previsao || '', dias: t.dias || [], horarios: t.horarios || {}, curso: t.curso || '' };
            if (existe) {
                Object.assign(existe, turmaData);
            } else {
                turmas.push(turmaData);
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
    pfTurmaCarregarCursos('');
    document.getElementById('pf-nome').value = p.nome || '';
    document.getElementById('pf-cnpj').value = p.cnpj || '';
    document.getElementById('pf-responsavel').value = p.responsavel || '';
    document.getElementById('pf-status').value = p.status || 'Em Andamento';
    projetoTurmasTemp = turmas.filter(t => t.projeto === p.nome).map(t => ({ nome: t.nome, descricao: t.descricao || '', inicio: t.inicio || '', previsao: t.previsao || '', dias: t.dias || [], horarios: t.horarios || {}, curso: t.curso || '' }));
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
    turmas.forEach(t => {
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
                'turmas': '<span class="usuario-tag usuario-tag-docente">Turmas</span>',
                'docentes': '<span class="usuario-tag usuario-tag-docente">Docentes</span>',
                'relatorios': '<span class="usuario-tag usuario-tag-admin">Relatorios</span>',
                'projetos': '<span class="usuario-tag usuario-tag-pre">Projetos</span>',
                'usuarios': '<span class="usuario-tag usuario-tag-admin">Usuarios</span>',
                'config': '<span class="usuario-tag usuario-tag-admin">Config</span>',
                'recadastramento': '<span class="usuario-tag usuario-tag-pre">Recadastramento</span>',
                'apostilas': '<span class="usuario-tag usuario-tag-pre">Apostilas</span>',
                'disciplinas': '<span class="usuario-tag usuario-tag-docente">Disciplinas</span>',
                'apontamento': '<span class="usuario-tag usuario-tag-admin">Apontamento</span>',
                'portal-formado': '<span class="usuario-tag usuario-tag-portal">Portal Formado</span>',
                'portal-aluno': '<span class="usuario-tag usuario-tag-portal">Portal Aluno</span>',
                'portal-docente': '<span class="usuario-tag usuario-tag-portal">Portal Docente</span>',
                'portal-coordenacao': '<span class="usuario-tag usuario-tag-portal">Portal Coordenacao</span>',
                'formados': '<span class="usuario-tag usuario-tag-pre">Formados</span>',
                'tfm': '<span class="usuario-tag usuario-tag-docente">TFM</span>',
                'noticias': '<span class="usuario-tag usuario-tag-admin">Noticias</span>',
                'galeria': '<span class="usuario-tag usuario-tag-docente">Galeria</span>'
            };
            return labels[p] || '';
        }).join('');
        const tipoBadge = u.tipo === 'colaborador' ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px">Colaborador</span>' : u.tipo === 'visitante' ? '<span style="background:rgba(37,99,235,.1);color:#2563eb;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px">Visitante</span>' : u.tipo === 'coordenacao' ? '<span style="background:rgba(147,51,234,.1);color:#9333ea;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px">Coordenacao</span>' : u.tipo === 'admin-sub' ? '<span style="background:rgba(190,18,60,.1);color:#be123c;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px">Administrador (Sub)</span>' : u.tipo === 'diretor-suprimento' ? '<span style="background:rgba(202,138,4,.1);color:#ca8a04;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px">Diretor (Suprimento)</span>' : u.tipo === 'diretor-pedagogico' ? '<span style="background:rgba(14,116,144,.1);color:#0e7490;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px">Diretor (Pedagogico)</span>' : '';
        const statusBadge = u.ativo === false ? '<span style="color:#dc2626;font-size:11px;font-weight:600">Inativo</span>' : '<span style="color:#16a34a;font-size:11px;font-weight:600">Ativo</span>';
        return `<div class="usuario-row">
            <div class="usuario-info">
                <div class="usuario-nome">${u.nome || ''} ${tipoBadge} ${statusBadge}</div>
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
    document.querySelectorAll('.uf-perm-check').forEach(cb => cb.checked = false);
    const allCheck = document.getElementById('uf-perm-all');
    if (allCheck) allCheck.checked = false;
    if (docId) {
        const u = usuarios.find(u => u.docId === docId);
        if (u) {
            document.getElementById('usuario-form-title').innerHTML = '<i class="fa-solid fa-user-pen" style="color:#2563eb;margin-right:8px"></i> Editar Usuario';
            document.getElementById('uf-nome').value = u.nome || '';
            document.getElementById('uf-cpf').value = u.cpf || '';
            document.getElementById('uf-senha').value = u.senha || '';
            document.getElementById('uf-tipo').value = u.tipo || '';
            const p = u.permissoes || [];
            document.querySelectorAll('.uf-perm-check').forEach(cb => {
                if (p.includes(cb.value)) cb.checked = true;
            });
            if (allCheck) allCheck.checked = document.querySelectorAll('.uf-perm-check:checked').length === document.querySelectorAll('.uf-perm-check').length;
        }
    } else {
        document.getElementById('usuario-form-title').innerHTML = '<i class="fa-solid fa-user-plus" style="color:#2563eb;margin-right:8px"></i> Novo Usuario';
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
    const tipo = document.getElementById('uf-tipo').value;
    if (!nome || !cpf || !senha || !tipo) { alert('Preencha nome, CPF, senha e tipo de usuario.'); return false; }
    if (cpf.length !== 11) { alert('CPF invalido.'); return false; }
    if (senha.length < 4) { alert('Senha deve ter minimo 4 caracteres.'); return false; }
    const permissoes = [];
    document.querySelectorAll('.uf-perm-check:checked').forEach(cb => permissoes.push(cb.value));
    if (permissoes.length === 0) { alert('Selecione pelo menos uma permissao.'); return false; }
    const userData = { nome, cpf, senha, tipo, permissoes, ativo: true };
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

function toggleAllPermissoes() {
    const allChecked = document.getElementById('uf-perm-all').checked;
    document.querySelectorAll('.uf-perm-check').forEach(cb => cb.checked = allChecked);
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
    overlay.innerHTML = '<div style="background:#ffffff;border-radius:16px;max-width:380px;width:100%;padding:28px;color:#1e293b;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:16px"><i class="fa-solid fa-mobile-screen-button" style="color:#16a34a"></i></div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#1e293b">Instalar FARN no iPhone</h3>' +
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
    overlay.innerHTML = '<div style="background:#ffffff;border-radius:16px;max-width:380px;width:100%;padding:28px;color:#1e293b;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:16px"><i class="fa-solid fa-mobile-screen-button" style="color:#16a34a"></i></div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#1e293b">Instalar FARN</h3>' +
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
let aptInicioUnsub = null;

function apontamentoInicializar() {
    apontamentoPopularSelecaoProjeto();
    const conteudo = document.getElementById('apt-conteudo');
    if (conteudo) conteudo.style.display = 'none';
}

function apontamentoPopularSelecaoProjeto() {
    const sel = document.getElementById('apt-selecao-projeto');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').forEach(p => {
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

function aptTurmaSelecionada() {
    const sel = document.getElementById('apt-selecao-turma');
    return sel ? sel.value : '';
}

function apontamentoCarregarInicios(turma) {
    const listEl = document.getElementById('apt-inicios-lista');
    if (!listEl) return;
    if (!turma) {
        listEl.innerHTML = '<span style="font-size:12px;color:#94a3b8">Seleciona una turma arriba para ver los inicios registrados.</span>';
        return;
    }
    listEl.innerHTML = '<span style="font-size:12px;color:#64748b"><i class="fa-solid fa-spinner fa-spin"></i> Carregando inicios...</span>';
    dbFirestore.collection('inicioAulas').where('turma', '==', turma).orderBy('criadoEm', 'desc').limit(200).get().then(function(snap) {
        if (snap.empty) {
            listEl.innerHTML = '<span style="font-size:12px;color:#94a3b8">Nenhun inicio registrado para esta turma.</span>';
            return;
        }
        var rows = [];
        snap.forEach(function(doc) { var d = doc.data(); rows.push({ _id: doc.id, ...d }); });
        var html = '<div style="font-size:12px;color:#475569;margin-bottom:4px">Total de inicios: ' + rows.length + '</div>';
        rows.forEach(function(d) {
            var dataFmt = d.dataAula ? new Date(d.dataAula + 'T00:00:00').toLocaleDateString('pt-BR') : '---';
            var horaFmt = d.horaInicio || d.criadoEm || '';
            var horaStr = horaFmt ? new Date(horaFmt).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '---';
            html += '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #16a34a;border-radius:8px;padding:6px 10px;margin-bottom:6px">' +
                '<i class="fa-solid fa-play" style="color:#16a34a"></i>' +
                '<span style="flex:1;font-size:12px;color:#1e293b">' + escHTML(d.nome || '---') + ' <span style="color:#94a3b8">(' + escHTML(d.matricula || '---') + ') \u2013 ' + escHTML(d.disciplina || '---') + ' \u2013 ' + dataFmt + '</span></span>' +
                '<span style="font-size:11px;color:#64748b"><i class="fa-solid fa-clock" style="margin-right:3px"></i>' + horaStr + '</span>' +
                '</div>';
        });
        listEl.innerHTML = html;
    }).catch(function(e) {
        listEl.innerHTML = '<span style="font-size:12px;color:#dc2626">Erro ao cargar inicios: ' + e.message + '</span>';
    });
}

function apontamentoOnSelecaoChange() {
    const projeto = document.getElementById('apt-selecao-projeto').value;
    const turma = document.getElementById('apt-selecao-turma').value;
    const conteudo = document.getElementById('apt-conteudo');
    if (projeto && turma) {
        conteudo.style.display = '';
        apontamentoPopularFiltroTurma();
        apontamentoFiltrar();
        apontamentoCarregarInicios(turma);
    } else {
        conteudo.style.display = 'none';
        apontamentoCarregarInicios('');
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
    if (aptInicioUnsub) { try { aptInicioUnsub(); } catch(e) {} aptInicioUnsub = null; }
    document.getElementById('modal-apontamento-overlay').classList.add('hidden');
}

function apontamentoOnTurmaChange() {
    document.getElementById('apt-aula').innerHTML = '<option value="">Selecione...</option>';
    document.getElementById('apt-presenca-area').style.display = 'none';
    const turma = document.getElementById('apt-turma').value;
    const projeto = document.getElementById('apt-selecao-projeto').value;
    const selDisc = document.getElementById('apt-disciplina');
    selDisc.innerHTML = '<option value="">Carregando...</option>';
    if (!turma) { selDisc.innerHTML = '<option value="">Selecione a disciplina</option>'; return; }
    dbFirestore.collection('disciplinas').where('turma', '==', turma).get().then(snap => {
        selDisc.innerHTML = '<option value="">Selecione a disciplina</option>';
        snap.forEach(doc => {
            const d = doc.data();
            selDisc.innerHTML += '<option value="' + doc.id + '">' + d.nome + '</option>';
        });
        if (snap.empty) selDisc.innerHTML = '<option value="">Nenhuma disciplina encontrada</option>';
    }).catch(() => { selDisc.innerHTML = '<option value="">Erro ao carregar</option>'; });
}

function apontamentoOnDisciplinaChange() {
    document.getElementById('apt-presenca-area').style.display = 'none';
    const selDisc = document.getElementById('apt-disciplina');
    const discName = selDisc.options[selDisc.selectedIndex] ? selDisc.options[selDisc.selectedIndex].text : '';
    const selAula = document.getElementById('apt-aula');
    selAula.innerHTML = '<option value="">Carregando...</option>';
    if (!discName || discName === 'Selecione a disciplina') { selAula.innerHTML = '<option value="">Selecione...</option>'; return; }
    dbFirestore.collection('aulas').where('disciplina', '==', discName).get().then(snap => {
        selAula.innerHTML = '<option value="">Selecione a aula</option>';
        snap.forEach(doc => {
            const a = doc.data();
            const dataFmt = a.data ? new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
            selAula.innerHTML += '<option value="' + doc.id + '">' + (a.nome || a.conteudo || 'Aula') + (dataFmt ? ' (' + dataFmt + ')' : '') + '</option>';
        });
        if (snap.empty) selAula.innerHTML = '<option value="">Nenhuma aula encontrada</option>';
    }).catch(() => { selAula.innerHTML = '<option value="">Erro ao carregar</option>'; });
}

function apontamentoAtualizarAulas() {
}

function apontamentoOnAulaChange() {
    const btnScan = document.getElementById('apt-btn-scan');
    const presencaArea = document.getElementById('apt-presenca-area');
    presencaArea.style.display = 'none';
    btnScan.disabled = true;
    aptPresencas = {};
    const turma = document.getElementById('apt-turma').value;
    if (!turma) return;
    const turmaNorm = (turma || '').trim().toLowerCase();

    const processar = function(snap) {
        aptAlunosNaTurma = [];
        snap.forEach(doc => {
            const c = doc.data();
            if (c.ativo === false) return;
            if (c.status !== 'Ativo') return;
            aptAlunosNaTurma.push({ cpf: c.cpf || '', nome: c.nome || '', matricula: c.matricula || '' });
            aptPresencas[c.cpf] = { cpf: c.cpf || '', nome: c.nome || '', matricula: c.matricula || '', status: 'Falta', obs: '' };
        });
        apontamentoRenderLista();
        if (aptAlunosNaTurma.length) {
            btnScan.disabled = false;
        } else {
            alert('Nenhum aluno ativo encontrado para a turma: ' + turma);
        }
        const cpfs = Object.keys(aptPresencas).filter(c => c && c.indexOf('temp_') !== 0);
        const carregarTotaisFO = function(fila) {
            const lote = fila.splice(0, 10);
            if (!lote.length) { apontamentoRenderLista(); return; }
            dbFirestore.collection('avaliacoesAlunos').where('cpf', 'in', lote).get().then(function(snap) {
                snap.forEach(function(doc) {
                    const d = doc.data();
                    if (aptPresencas[d.cpf]) {
                        aptPresencas[d.cpf].foP = (d.foPositivos || []).length;
                        aptPresencas[d.cpf].foN = (d.foNegativos || []).length;
                    }
                });
                carregarTotaisFO(fila);
            }).catch(function() { carregarTotaisFO(fila); });
        };
        carregarTotaisFO(cpfs.slice());
        apontamentoSincronizarInicio(document.getElementById('apt-aula').value);
    };

    dbFirestore.collection('candidatos').where('turma', '==', turma).get().then(snap => {
        if (!snap.empty) { processar(snap); return; }
        return dbFirestore.collection('candidatos').get().then(snap2 => {
            const docs = [];
            snap2.forEach(doc => {
                const c = doc.data();
                if ((c.turma || '').trim().toLowerCase() === turmaNorm) docs.push(doc);
            });
            processar({ forEach: function(fn) { docs.forEach(fn); } });
        });
    }).catch(err => {
        console.error('Erro ao carregar alunos:', err);
    });
}

// Sincroniza o registro de inicio de aula (QR escaneado pelo aluno - colecao inicioAulas)
// com a lista de presenca do apontamento, em tempo real, por turma e aula selecionadas.
function apontamentoSincronizarInicio(aulaId) {
    if (aptInicioUnsub) {
        try { aptInicioUnsub(); } catch(e) {}
        aptInicioUnsub = null;
    }
    if (!aulaId) return;
    aptInicioUnsub = dbFirestore.collection('inicioAulas')
        .where('aulaId', '==', String(aulaId))
        .onSnapshot(function(snap) {
            const mapa = {};
            snap.forEach(function(doc) {
                const d = doc.data();
                if (!d.cpf) return;
                const existente = mapa[d.cpf];
                if (!existente || (d.horaInicio || '') > (existente.horaInicio || '')) {
                    mapa[d.cpf] = {
                        horaInicio: d.horaInicio || d.criadoEm || '',
                        dataAula: d.dataAula || '',
                        disciplina: d.disciplina || '',
                        aula: d.aula || ''
                    };
                }
            });
            Object.keys(aptPresencas).forEach(function(cpf) {
                const aluno = aptPresencas[cpf];
                if (!aluno) return;
                const reg = mapa[cpf];
                if (reg && reg.horaInicio) {
                    aluno.inicioPresente = true;
                    aluno.inicioHora = reg.horaInicio;
                    if (aluno.status !== 'Justificada') aluno.status = 'Presente';
                } else {
                    aluno.inicioPresente = false;
                    aluno.inicioHora = '';
                    if (!aluno.status) aluno.status = 'Falta';
                }
                aluno.inicioDisciplina = reg ? (reg.disciplina || '') : '';
                aluno.inicioAula = reg ? (reg.aula || '') : '';
            });
            apontamentoRenderLista();
        }, function(e) {
            console.error('Erro ao sincronizar inicios:', e);
        });
}

function apontamentoIniciarScanner() {
    const turma = document.getElementById('apt-turma').value;
    const btnScan = document.getElementById('apt-btn-scan');
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
    let encontrado = apontamentoBuscarAlunoPorMatricula(matricula);
    if (!encontrado) {
        alert('Aluno com matrícula ' + matricula + ' não encontrado nesta turma');
        return;
    }
    apontamentoMarcarPresente(encontrado);
}

function apontamentoBuscarMatricula() {
    const input = document.getElementById('apt-matricula-input');
    const matricula = input.value.trim().toUpperCase();
    if (!matricula) { alert('Digite uma matrícula'); return; }
    let encontrado = apontamentoBuscarAlunoPorMatricula(matricula);
    if (!encontrado) {
        alert('Aluno com matrícula ' + matricula + ' não encontrado nesta turma');
        return;
    }
    apontamentoMarcarPresente(encontrado);
    input.value = '';
    input.focus();
}

function apontamentoBuscarAlunoPorMatricula(matricula) {
    for (const cpf in aptPresencas) {
        if (aptPresencas[cpf].matricula.toUpperCase() === matricula) {
            return aptPresencas[cpf];
        }
    }
    return aptAlunosNaTurma.find(c => (c.matricula || '').toUpperCase() === matricula) || null;
}

function apontamentoMarcarPresente(aluno) {
    if (!aluno.cpf) {
        aptPresencas['temp_' + Date.now()] = { matricula: aluno.matricula || '', nome: aluno.nome || '', cpf: aluno.cpf || '', status: 'Presente', obs: '' };
    } else {
        if (!aptPresencas[aluno.cpf]) {
            aptPresencas[aluno.cpf] = { matricula: aluno.matricula || '', nome: aluno.nome || '', cpf: aluno.cpf || '', status: 'Presente', obs: '' };
        }
        if (!aluno.status || aluno.status === 'Falta' || aluno.status === 'Justificada') {
            aptPresencas[aluno.cpf].status = 'Presente';
        }
    }
    apontamentoRenderLista();
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:#fff;padding:12px 20px;border-radius:8px;z-index:99999;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
    toast.innerHTML = '<i class="fa-solid fa-check" style="margin-right:8px"></i> ' + (aluno.nome || aluno.matricula || 'Aluno') + ' — Presente';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    if (!aluno.cpf) {
        const aviso = document.createElement('div');
        aviso.style.cssText = 'position:fixed;top:60px;right:20px;background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px;z-index:99999;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
        aviso.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-right:8px"></i> ' + (aluno.nome || aluno.matricula || 'Aluno') + ' sem CPF cadastrado — nao e possivel registrar FO';
        document.body.appendChild(aviso);
        setTimeout(() => aviso.remove(), 4000);
    } else {
        apontamentoPararScanner();
        apontamentoFOAbrir(aluno);
    }
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
    const iniciaram = todos.filter(p => p.inicioPresente).length;
    count.textContent = iniciaram + ' iniciaram / ' + presentes + ' presente(s) / ' + faltas + ' falta(s) / ' + justificadas + ' justificada(s) / ' + todos.length + ' total';
    lista.innerHTML = '<div class="data-table" style="width:100%"><table style="width:100%;border-collapse:collapse"><thead><tr>' +
        '<th style="text-align:left;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Matrícula</th>' +
        '<th style="text-align:left;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Nome</th>' +
        '<th style="text-align:center;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px;width:150px">Registro de Inicio</th>' +
        '<th style="text-align:center;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Hora Inicio</th>' +
        '<th style="text-align:center;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px;width:130px">FO</th>' +
        '<th style="text-align:center;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px;width:260px">Status</th>' +
        '<th style="text-align:left;padding:10px 8px;border-bottom:2px solid #333;color:#aaa;font-size:12px">Observação</th>' +
        '</tr></thead><tbody>' +
        todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(p => {
            const statusClass = p.status === 'Presente' ? 'green' : p.status === 'Falta' ? 'red' : p.status === 'Justificada' ? 'orange' : 'gray';
            const inicioPresente = p.inicioPresente;
            const inicioHora = p.inicioHora;
            const horaFmt = inicioHora ? new Date(inicioHora).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '—';
            return '<tr style="border-bottom:1px solid #222">' +
                '<td style="padding:8px;font-size:13px;color:#ccc;font-weight:600">' + (p.matricula || '-') + '</td>' +
                '<td style="padding:8px;font-size:13px;color:#ccc">' + (p.nome || '-') + '</td>' +
                '<td style="padding:8px;text-align:center">' +
                    '<div style="display:flex;gap:4px;justify-content:center">' +
                        '<button onclick="apontamentoSetInicio(\'' + p.cpf + '\',true)" title="Marcar inicio Presente" style="padding:4px 8px;border-radius:6px;border:1px solid ' + (inicioPresente ? '#4caf50' : '#333') + ';background:' + (inicioPresente ? 'rgba(76,175,80,0.25)' : 'transparent') + ';color:' + (inicioPresente ? '#4caf50' : '#777') + ';cursor:pointer;font-size:12px;font-weight:600"><i class="fa-solid fa-check"></i></button>' +
                        '<button onclick="apontamentoSetInicio(\'' + p.cpf + '\',false,false)" title="Marcar Falta no inicio" style="padding:4px 8px;border-radius:6px;border:1px solid ' + (!inicioPresente && p.inicioJustificado !== true ? '#f44336' : '#333') + ';background:' + (!inicioPresente && p.inicioJustificado !== true ? 'rgba(244,67,54,0.25)' : 'transparent') + ';color:' + (!inicioPresente && p.inicioJustificado !== true ? '#f44336' : '#777') + ';cursor:pointer;font-size:12px;font-weight:600"><i class="fa-solid fa-xmark"></i></button>' +
                        '<button onclick="apontamentoSetInicio(\'' + p.cpf + '\',false,true)" title="Marcar Justificado no inicio" style="padding:4px 8px;border-radius:6px;border:1px solid ' + (p.inicioJustificado ? '#ff9800' : '#333') + ';background:' + (p.inicioJustificado ? 'rgba(255,152,0,0.25)' : 'transparent') + ';color:' + (p.inicioJustificado ? '#ff9800' : '#777') + ';cursor:pointer;font-size:12px;font-weight:600"><i class="fa-solid fa-circle-info"></i></button>' +
                    '</div></td>' +
                '<td style="padding:8px;text-align:center;font-size:13px;color:' + (inicioPresente ? '#4caf50' : (p.inicioJustificado ? '#ff9800' : '#f87171')) + ';font-weight:600">' + (inicioPresente ? horaFmt : (p.inicioJustificado ? 'Just' : '—')) + '</td>' +
                '<td style="padding:8px;text-align:center">' + apontamentoFOBadge(p) + '</td>' +
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

function apontamentoFOBadge(p) {
    const foP = p.foP || 0, foN = p.foN || 0;
    if (!foP && !foN) return '<span style="font-size:12px;color:#555">—</span>';
    let html = '<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">';
    if (foP) html += '<span style="background:rgba(22,163,74,0.2);color:#4ade80;border:1px solid #16a34a;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap">FO+ ' + foP + '</span>';
    if (foN) html += '<span style="background:rgba(220,38,38,0.2);color:#f87171;border:1px solid #dc2626;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap">FO- ' + foN + '</span>';
    html += '</div>';
    return html;
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

// Marca o registro de inicio de aula do aluno (Presente/Falta/Justificado)
function apontamentoSetInicio(cpf, presente, justificado) {
    const aluno = aptPresencas[cpf];
    if (!aluno) return;
    if (presente) {
        // Presente manualmente: registra hora atual caso nao tenha
        aluno.inicioPresente = true;
        aluno.inicioJustificado = false;
        aluno.inicioHora = aluno.inicioHora || new Date().toISOString();
        if (aluno.status === 'Falta' || aluno.status === 'Justificada') aluno.status = 'Presente';
    } else if (justificado) {
        const novo = !aluno.inicioJustificado;
        aluno.inicioJustificado = novo;
        if (novo) { aluno.inicioPresente = false; if (aluno.status === 'Falta') aluno.status = 'Justificada'; }
        else if (!aluno.inicioPresente) aluno.status = 'Falta';
    } else {
        // Falta no inicio
        const novoFalta = !(!aluno.inicioPresente && !aluno.inicioJustificado);
        aluno.inicioPresente = false;
        aluno.inicioJustificado = false;
        aluno.inicioHora = '';
        if (novoFalta && (aluno.status === 'Presente')) aluno.status = 'Falta';
        else if (!novoFalta && aluno.status === 'Falta') aluno.status = 'Falta';
    }
    apontamentoRenderLista();
}

// ===== FO+ / FO- NO APONTAMENTO =====
let aptFoTarget = null;
let aptFoTipo = null;

function apontamentoFOAbrir(aluno) {
    if (!aluno || !aluno.cpf) return;
    aptFoTarget = aluno;
    aptFoTipo = null;
    const overlay = document.getElementById('modal-apt-fo-overlay');
    if (!overlay) return;
    document.getElementById('apt-fo-aluno').textContent = (aluno.nome || 'Aluno') + (aluno.matricula ? ' — ' + aluno.matricula : '');
    document.getElementById('apt-fo-lbl').textContent = 'Registrar Fato Observado para a AV de Comportamento?';
    document.getElementById('apt-fo-opcoes').style.display = 'flex';
    document.getElementById('apt-fo-form').style.display = 'none';
    document.getElementById('apt-fo-feito').style.display = 'none';
    document.getElementById('apt-fo-obs').value = '';
    overlay.classList.remove('hidden');
    setTimeout(() => { try { document.getElementById('apt-fo-obs').focus(); } catch(e){} }, 150);
}

function apontamentoFOEscolher(positivo) {
    aptFoTipo = positivo;
    document.getElementById('apt-fo-opcoes').style.display = 'none';
    document.getElementById('apt-fo-form').style.display = 'block';
    document.getElementById('apt-fo-qtd').value = 1;
    document.getElementById('apt-fo-lbl').textContent = (positivo ? 'FO+ — Fato Observado Positivo' : 'FO- — Fato Observado Negativo') + ' — observacao (opcional):';
    document.getElementById('apt-fo-confirmar').innerHTML = '<i class="fa-solid fa-check"></i> Registrar FO' + (positivo ? '+' : '-');
}

function apontamentoFOVoltar() {
    document.getElementById('apt-fo-form').style.display = 'none';
    document.getElementById('apt-fo-opcoes').style.display = 'flex';
}

function apontamentoFOConfirmar() {
    if (!aptFoTarget || aptFoTipo === null) { apontamentoFOCancelar(); return; }
    const obs = document.getElementById('apt-fo-obs').value.trim();
    const qtd = Math.max(1, Math.min(50, parseInt(document.getElementById('apt-fo-qtd').value, 10) || 1));
    const cpf = aptFoTarget.cpf;
    const chave = aptFoTipo ? 'foPositivos' : 'foNegativos';
    const item = { data: new Date().toLocaleDateString('pt-BR'), obs: obs, em: new Date().toISOString(), origem: 'apontamento' };
    const doneEl = document.getElementById('apt-fo-feito');
    dbFirestore.collection('avaliacoesAlunos').doc(cpf).get().then(function(doc) {
        const dados = doc.exists ? doc.data() : {};
        const lista = dados[chave] || [];
        for (let i = 0; i < qtd; i++) lista.push(Object.assign({}, item));
        const update = {};
        update[chave] = lista;
        update.cpf = cpf;
        update.nome = aptFoTarget.nome || dados.nome || '';
        update.matricula = aptFoTarget.matricula || dados.matricula || '';
        update.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
        return dbFirestore.collection('avaliacoesAlunos').doc(cpf).set(update, { merge: true });
    }).then(function() {
        if (aptPresencas[cpf]) {
            if (aptFoTipo) aptPresencas[cpf].foP = (aptPresencas[cpf].foP || 0) + qtd;
            else aptPresencas[cpf].foN = (aptPresencas[cpf].foN || 0) + qtd;
        }
        apontamentoRenderLista();
        doneEl.textContent = qtd + ' FO' + (aptFoTipo ? '+' : '-') + ' registrado(s) na AV de Comportamento!';
        doneEl.style.color = '#16a34a';
        doneEl.style.display = 'block';
        document.getElementById('apt-fo-form').style.display = 'none';
        setTimeout(apontamentoFOCancelar, 1500);
    }).catch(function(e) {
        console.error('Erro ao salvar FO:', e);
        doneEl.textContent = 'Erro ao salvar: ' + e.message;
        doneEl.style.color = '#dc2626';
        doneEl.style.display = 'block';
    });
}

function apontamentoFOCancelar(event) {
    if (event && event.target && event.target.id !== 'modal-apt-fo-overlay') return;
    aptFoTarget = null;
    aptFoTipo = null;
    const el = document.getElementById('modal-apt-fo-overlay');
    if (el) el.classList.add('hidden');
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
    const selDisc = document.getElementById('apt-disciplina');
    const disciplinaNome = selDisc.options[selDisc.selectedIndex] ? selDisc.options[selDisc.selectedIndex].text : '';
    const projeto = document.getElementById('apt-selecao-projeto').value || '';
    const dados = {
        turma: turma,
        aula: aulaNome,
        aulaId: aulaId,
        alunos: todos,
        criadoEm: new Date().toISOString(),
        criadoPor: currentUserData ? currentUserData.nome || '' : ''
    };
    try {
        const aptRef = await dbFirestore.collection('apontamentos').add(dados);
        const aptId = aptRef.id;

        let dataAula = '';
        try {
            const aulaDoc = await dbFirestore.collection('aulas').doc(aulaId).get();
            if (aulaDoc.exists) dataAula = aulaDoc.data().data || '';
        } catch (e) {}

        const batch = dbFirestore.batch();
        todos.forEach(aluno => {
            const ref = dbFirestore.collection('presencasAlunos').doc();
            batch.set(ref, {
                cpf: aluno.cpf || '',
                nome: aluno.nome || '',
                matricula: aluno.matricula || '',
                turma: turma,
                projeto: projeto,
                disciplina: disciplinaNome,
                aula: aulaNome,
                dataAula: dataAula,
                status: aluno.status || '',
                obs: aluno.obs || '',
                inicioPresente: !!aluno.inicioPresente,
                inicioJustificado: !!aluno.inicioJustificado,
                inicioHora: aluno.inicioHora || '',
                criadoEm: new Date().toISOString(),
                criadoPor: currentUserData ? currentUserData.nome || '' : '',
                apontamentoId: aptId
            });
        });
        await batch.commit();

        apontamentoPararScanner();
        if (aptInicioUnsub) { try { aptInicioUnsub(); } catch(e) {} aptInicioUnsub = null; }
        document.getElementById('modal-apontamento-overlay').classList.add('hidden');
        alert('Apontamento salvo com sucesso!');
        apontamentoFiltrar();
        verificarInativosPorFalta(todos.map(a => a.cpf));
    } catch (e) {
        console.error('Erro ao salvar apontamento:', e);
        alert('Erro ao salvar: ' + e.message);
    }
}

// ===== INATIVO POR FALTA (3 ou mais faltas) =====

async function verificarInativosPorFalta(cpfs) {
    if (!dbFirestore || !cpfs || !cpfs.length) return;
    const lista = cpfs.filter(Boolean);
    if (!lista.length) return;
    const faltas = {};
    for (let i = 0; i < lista.length; i += 10) {
        const lote = lista.slice(i, i + 10);
        try {
            const snap = await dbFirestore.collection('presencasAlunos').where('cpf', 'in', lote).get();
            snap.forEach(doc => {
                const d = doc.data();
                const k = (d.cpf || '').replace(/\D/g, '');
                if (k && d.status === 'Falta') faltas[k] = (faltas[k] || 0) + 1;
            });
        } catch (e) { console.error('Erro ao contar faltas:', e); }
    }
    const batch = dbFirestore.batch();
    let mudou = false;
    candidatos.forEach((c, i) => {
        const k = (c.cpf || '').replace(/\D/g, '');
        if (!k || !faltas[k]) return;
        if ((c.tipoPessoa || 'A') === 'F' || c.remanejadoDocente) return;
        if (c.status === 'Ativo' && faltas[k] >= 3) {
            candidatos[i].status = 'Inativo por Falta';
            if (c.id) batch.update(dbFirestore.collection('candidatos').doc(String(c.id)), { status: 'Inativo por Falta', inativoPorFaltaEm: new Date().toISOString(), inativoPorFaltaMotivo: '3 ou mais faltas' });
            mudou = true;
        } else if (c.status === 'Inativo por Falta' && faltas[k] < 3) {
            candidatos[i].status = 'Ativo';
            if (c.id) batch.update(dbFirestore.collection('candidatos').doc(String(c.id)), { status: 'Ativo', inativoPorFaltaEm: firebase.firestore.FieldValue.delete(), inativoPorFaltaMotivo: firebase.firestore.FieldValue.delete() });
            mudou = true;
        }
    });
    if (mudou) {
        try { await batch.commit(); } catch (e) { console.error('Erro ao atualizar status inativo por falta:', e); }
        renderAlunosList();
        renderList();
    }
}

// ===== HISTÓRICO DE APONTAMENTOS =====
let aptHistoricoCache = [];
let aptHistoricoUnsub = null;

function apontamentoCarregarHistorico() {
    if (aptHistoricoUnsub) { aptHistoricoUnsub(); aptHistoricoUnsub = null; }
    aptHistoricoUnsub = dbFirestore.collection('apontamentos').orderBy('criadoEm', 'desc').limit(200).onSnapshot(function(snap) {
        aptHistoricoCache = [];
        snap.forEach(doc => {
            aptHistoricoCache.push({ docId: doc.id, ...doc.data() });
        });
        apontamentoRender();
    }, function(e) { console.error('Erro historico apontamentos:', e); });
}

function apontamentoPopularFiltroTurma() {
}

function apontamentoLimparFiltros() {
    document.getElementById('apt-filtro-data-inicio').value = '';
    document.getElementById('apt-filtro-data-fim').value = '';
    document.getElementById('apt-filtro-matricula').value = '';
    apontamentoFiltrar();
}

function apontamentoRender() {
    apontamentoFiltrar();
}

function apontamentoFiltrar() {
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
            const stColor = a.status === 'Presente' ? '#16a34a' : a.status === 'Falta' ? '#dc2626' : a.status === 'Justificada' ? '#ca8a04' : '#64748b';
            const stIcon = a.status === 'Presente' ? 'fa-check' : a.status === 'Falta' ? 'fa-xmark' : a.status === 'Justificada' ? 'fa-circle-info' : 'fa-question';
            const recId = r.docId || '';
            return '<tr style="border-bottom:1px solid #e2e8f0">' +
                '<td style="padding:8px 12px;font-size:13px;font-weight:700;color:#16a34a;font-family:Courier New,monospace;white-space:nowrap">' + (a.matricula || '-') + '</td>' +
                '<td style="padding:8px 12px;font-size:13px;color:#1e293b">' + (a.nome || '-') + '</td>' +
                '<td style="padding:8px 12px;text-align:center"><span style="color:' + stColor + ';font-weight:700;font-size:13px"><i class="fa-solid ' + stIcon + '" style="margin-right:4px"></i>' + (a.status || '-') + '</span></td>' +
                '<td style="padding:8px 12px;font-size:12px;color:#64748b">' + (a.obs || '-') + '</td>' +
                '<td style="padding:8px 12px;text-align:center">' +
                    '<button class="btn-icon" style="font-size:11px;padding:4px 6px" title="Editar" onclick="apontamentoEditarAluno(\'' + recId + '\',' + ai + ')"><i class="fa-solid fa-pen"></i></button>' +
                '</td>' +
            '</tr>';
        }).join('');
        const cardId = 'apt-card-' + ri;
        return '<div class="apt-card" id="' + cardId + '" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:16px;overflow:hidden">' +
            '<div style="padding:12px 16px;background:#f0fdf4;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;cursor:pointer;user-select:none" onclick="apontamentoToggleCard(\'' + cardId + '\')">' +
                '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
                    '<i class="fa-solid fa-chevron-down" style="color:#666;font-size:12px;transition:transform 0.2s;transform:rotate(-90deg)" id="apt-arrow-' + ri + '"></i>' +
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
            '<div class="apt-card-body" style="overflow-x:auto;display:none">' +
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
            '<div class="apt-card-footer" style="padding:8px 16px;font-size:10px;color:#555;border-top:1px solid #2a2a3a;display:none">Registrado por: ' + (r.criadoPor || '-') + ' em ' + criadoEmFmt + '</div>' +
        '</div>';
    }).join('');

    const excluirArea = document.getElementById('apt-excluir-area');
    const excluirSelect = document.getElementById('apt-excluir-select');
    if (excluirArea && excluirSelect) {
        if (registros.length > 0) {
            excluirArea.style.display = 'flex';
            excluirSelect.innerHTML = '<option value="">Selecione a lista...</option>';
            registros.forEach(r => {
                const dataFmt = r.dataAula ? new Date(r.dataAula + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data';
                const aulaLabel = r.aula || '---';
                const label = aulaLabel + ' - ' + dataFmt + ' | ' + (r.turma || '---') + ' | ' + (r.disciplina || '---');
                excluirSelect.innerHTML += '<option value="' + r.docId + '">' + label + '</option>';
            });
        } else {
            excluirArea.style.display = 'none';
        }
    }
}

async function apontamentoExcluirLista() {
    const select = document.getElementById('apt-excluir-select');
    const docId = select.value;
    if (!docId) { alert('Selecione uma lista para excluir.'); return; }
    const label = select.options[select.selectedIndex].text;
    if (!confirm('Tem certeza que deseja excluir esta lista?\n\n' + label + '\n\nEsta acao nao pode ser desfeita.')) return;
    try {
        const aptDoc = await dbFirestore.collection('apontamentos').doc(docId).get();
        const aptData = aptDoc.exists ? aptDoc.data() : {};
        await dbFirestore.collection('apontamentos').doc(docId).delete();

        const presSnap1 = await dbFirestore.collection('presencasAlunos').where('apontamentoId', '==', docId).get();
        const batch1 = dbFirestore.batch();
        presSnap1.forEach(doc => batch1.delete(doc.ref));
        if (!presSnap1.empty) await batch1.commit();

        if (aptData.turma || aptData.aula) {
            let q = dbFirestore.collection('presencasAlunos');
            if (aptData.turma) q = q.where('turma', '==', aptData.turma);
            const presSnap2 = await q.get();
            const batch2 = dbFirestore.batch();
            let count = 0;
            presSnap2.forEach(doc => {
                const pd = doc.data();
                if (aptData.aula && pd.aula === aptData.aula) {
                    batch2.delete(doc.ref);
                    count++;
                }
            });
            if (count > 0) await batch2.commit();
        }

        alert('Lista excluida com sucesso!');
        apontamentoFiltrar();
    } catch (e) {
        alert('Erro ao excluir: ' + e.message);
    }
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

    const promisses = [];

    if (recId) {
        promisses.push(dbFirestore.collection('apontamentos').doc(recId).update({ alunos: reg.alunos }));
    }

    if (a.cpf) {
        promisses.push(
            dbFirestore.collection('presencasAlunos').where('cpf', '==', a.cpf).get().then(function(snap) {
                snap.forEach(function(doc) {
                    var pd = doc.data();
                    if (pd.aula === (reg.aula || '') && pd.turma === (reg.turma || '')) {
                        doc.ref.update({ status: statusFinal, obs: a.obs });
                    }
                });
            })
        );
    }

    Promise.all(promisses).then(function() {
        apontamentoFiltrar();
        alert('Alteracao salva com sucesso!');
    }).catch(function(e) { alert('Erro ao salvar: ' + e.message); });
}

window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
});

/* ===== TFM DO ALUNO ===== */
var tfmAlunos = [];
var tfmExistentes = {};
var tfmAgendamentoTurma = null;
var tfmAgendamentoSelecionadoId = null;
var tfmAgendamentoAbrirId = null;

function tfmFormatarDataHora(ts) {
    let d = null;
    if (ts && typeof ts.toDate === 'function') d = ts.toDate();
    else if (ts) {
        const dd = new Date(ts);
        if (!isNaN(dd.getTime())) d = dd;
    }
    if (!d) return '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function tfmAgDataMillis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

function tfmPopulateAgendaDocente(sel) {
    if (!sel) return;
    let ops = '<option value="">Selecione o docente...</option>';
    (docentes || []).slice().sort(function(a, b) { return (a.nome || '').localeCompare(b.nome || ''); }).forEach(function(i) {
        let label = i.nome || '';
        if (i.guerra) label += ' (' + i.guerra + ')';
        ops += '<option value="' + tfmEsc(i.nome).replace(/"/g, '&quot;') + '">' + tfmEsc(label) + '</option>';
    });
    sel.innerHTML = ops;
}

function tfmEsc(val) {
    return String(val == null ? '' : val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tfmInicializar() {
    const selProj = document.getElementById('tfm-selecao-projeto');
    if (!selProj) return;
    selProj.innerHTML = '<option value="">Selecione o projeto...</option>';
    projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').forEach(p => {
        selProj.innerHTML += '<option value="' + p.nome + '">' + p.nome + (p.responsavel ? ' - ' + p.responsavel : '') + '</option>';
    });
    const conteudo = document.getElementById('tfm-conteudo');
    if (conteudo) conteudo.style.display = 'none';
    const selecaoWrap = document.getElementById('tfm-selecao-wrap');
    if (selecaoWrap) selecaoWrap.style.display = 'none';
    const listaWrap = document.getElementById('tfm-lista-wrap');
    if (listaWrap) listaWrap.style.display = '';
    tfmCarregarLista();
}

function tfmOnSelecaoProjetoChange() {
    const projetoNome = document.getElementById('tfm-selecao-projeto').value;
    const selTurma = document.getElementById('tfm-selecao-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    if (projetoNome) {
        turmas.filter(t => t.projeto === projetoNome).forEach(t => {
            selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + (t.descricao ? ' - ' + t.descricao : '') + '</option>';
        });
    }
    tfmOnSelecaoChange();
}

async function tfmOnSelecaoChange() {
    const projeto = document.getElementById('tfm-selecao-projeto').value;
    const turma = document.getElementById('tfm-selecao-turma').value;
    const conteudo = document.getElementById('tfm-conteudo');
    if (!projeto || !turma) { conteudo.style.display = 'none'; tfmRenderSalvos(); return; }
    conteudo.style.display = '';

    tfmAlunos = candidatos.filter(c => c.status === 'Ativo' && c.ativo !== false && c.turma === turma)
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    tfmExistentes = {};
    tfmAgendamentoTurma = null;
    tfmAgendamentoSelecionadoId = null;
    const abrirId = tfmAgendamentoAbrirId;
    tfmAgendamentoAbrirId = null;
    try {
        if (abrirId) {
            const docAg = await dbFirestore.collection('tfmAgendamentos').doc(abrirId).get();
            if (docAg.exists) {
                tfmAgendamentoTurma = docAg.data();
                tfmAgendamentoSelecionadoId = abrirId;
            }
        }
        if (!tfmAgendamentoTurma) {
            const snapAg = await dbFirestore.collection('tfmAgendamentos').where('turma', '==', turma).get();
            let melhor = null;
            let melhorT = -1;
            snapAg.forEach(d => {
                const dts = d.data().criadoEm;
                const t = dts && typeof dts.toMillis === 'function' ? dts.toMillis() : (dts ? new Date(dts).getTime() : 0);
                if (t >= melhorT) { melhorT = t; melhor = d; }
            });
            if (melhor) {
                tfmAgendamentoTurma = melhor.data();
                tfmAgendamentoSelecionadoId = melhor.id;
            }
        }
        const snap = tfmAgendamentoSelecionadoId
            ? await dbFirestore.collection('tfmAlunos').where('agendamentoId', '==', tfmAgendamentoSelecionadoId).get()
            : await dbFirestore.collection('tfmAlunos').where('turma', '==', turma).get();
        snap.forEach(doc => {
            tfmExistentes[doc.data().cpf] = Object.assign({ docId: doc.id }, doc.data());
        });
    } catch(e) { console.error('Erro ao carregar TFM:', e); }

    tfmPreencherAgenda();
    tfmRender();
    tfmAtualizarResumo();
    tfmRenderSalvos();
}

function tfmRender() {
    const tbody = document.getElementById('tfm-table-body');
    if (!tbody) return;
    if (!tfmAlunos.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#64748b"><i class="fa-solid fa-users-slash" style="font-size:28px;margin-bottom:10px;display:block;color:#94a3b8"></i>Nenhum aluno ativo nesta turma.</td></tr>';
        return;
    }
    let html = '';
    tfmAlunos.forEach(al => {
        const e = tfmExistentes[al.cpf] || {};
        const res = e.resultado || 'Pendente';
        const cpfDisplay = formatCPFDisplay(al.cpf || '');
        html += '<tr data-cpf="' + al.cpf + '">' +
            '<td><div style="font-weight:600;font-size:13px;color:#1e293b">' + tfmEsc(al.nome) + '</div>' +
            '<div style="font-size:11px;color:#64748b">Mat: ' + tfmEsc(al.matricula || '-') + ' | CPF: ' + tfmEsc(cpfDisplay || '-') + '</div></td>' +
            '<td><input type="number" min="0" class="config-input small" style="width:88px" id="tfm-flexoes-' + al.cpf + '" value="' + (e.flexoes != null ? e.flexoes : '') + '" placeholder="0" oninput="tfmAtualizarResumo()"></td>' +
            '<td><input type="number" min="0" class="config-input small" style="width:88px" id="tfm-abdominais-' + al.cpf + '" value="' + (e.abdominais != null ? e.abdominais : '') + '" placeholder="0" oninput="tfmAtualizarResumo()"></td>' +
            '<td><input type="number" min="0" class="config-input small" style="width:88px" id="tfm-corrida-' + al.cpf + '" value="' + (e.corridaSeg != null ? e.corridaSeg : '') + '" placeholder="seg" title="Tempo em segundos" oninput="tfmAtualizarResumo()"></td>' +
            '<td><select class="config-input small" style="width:98px" id="tfm-desloc-concluiu-' + al.cpf + '" onchange="tfmAtualizarResumo()">' +
            '<option value="">Concluiu?</option>' +
            '<option value="Sim"' + (e.deslocamentoConcluiu === 'Sim' ? ' selected' : '') + '>Sim</option>' +
            '<option value="Nao"' + (e.deslocamentoConcluiu === 'Nao' ? ' selected' : '') + '>Nao</option>' +
            '</select></td>' +
            '<td><select class="config-input small" style="width:98px" id="tfm-resultado-' + al.cpf + '" onchange="tfmAtualizarResumo()">' +
            '<option value="Pendente"' + (res === 'Pendente' ? ' selected' : '') + '>Pendente</option>' +
            '<option value="Apto"' + (res === 'Apto' ? ' selected' : '') + '>Apto</option>' +
            '<option value="Inapto"' + (res === 'Inapto' ? ' selected' : '') + '>Inapto</option>' +
            '</select></td>' +
            '<td id="tfm-badge-' + al.cpf + '" style="text-align:center"><span style="background:#f1f5f9;color:#64748b;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:700">INCOMPLETO</span></td>' +
            '<td><button class="btn-primary" style="padding:8px 14px;font-size:12px;margin:0" onclick="tfmSalvar(\'' + al.cpf + '\')"><i class="fa-solid fa-floppy-disk"></i> Salvar</button></td>' +
            '</tr>';
    });
    tbody.innerHTML = html;
}

function tfmColetarValores(cpf) {
    function num(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        const v = String(el.value || '').trim();
        if (v === '') return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
    }
    function str(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }
    return {
        flexoes: num('tfm-flexoes-' + cpf),
        abdominais: num('tfm-abdominais-' + cpf),
        corridaSeg: num('tfm-corrida-' + cpf),
        deslocamentoConcluiu: str('tfm-desloc-concluiu-' + cpf),
        resultado: str('tfm-resultado-' + cpf) || 'Pendente'
    };
}

function tfmValoresPreenchidos(v) {
    return v.flexoes != null || v.abdominais != null || v.corridaSeg != null || v.deslocamentoConcluiu || v.resultado !== 'Pendente';
}

function tfmRegrasPadrao() {
    return {
        faixas: [
            { limite: 29, rotulo: 'Ate 29 anos', masculino: { A: 25, B: 35, C: 30 }, feminino: { A: 18, B: 28, C: 40 } },
            { limite: 39, rotulo: '30 a 39 anos', masculino: { A: 20, B: 30, C: 40 }, feminino: { A: 14, B: 24, C: 50 } },
            { limite: 99, rotulo: '40 anos ou +', masculino: { A: 15, B: 25, C: 50 }, feminino: { A: 10, B: 18, C: 60 } }
        ],
        exigeDeslocamento: true
    };
}

function tfmObterRegras() {
    try {
        const raw = localStorage.getItem('tfmRegras1');
        if (raw) {
            const r = JSON.parse(raw);
            if (r && Array.isArray(r.faixas) && r.faixas.length === 3) return r;
        }
    } catch (e) {}
    return tfmRegrasPadrao();
}

function tfmSalvarRegrasNoLocal(regras) {
    localStorage.setItem('tfmRegras1', JSON.stringify(regras));
}

function tfmCalcularAptidao(al, v) {
    if (!v) v = {};
    const genero = (al.genero || '').toLowerCase();
    const idade = calcularIdade(al.nascimento);
    if (genero !== 'masculino' && genero !== 'feminino') {
        return { avaliado: false, apto: false, motivo: 'Informe o genero de nascimento do aluno.' };
    }
    if (idade === '') {
        return { avaliado: false, apto: false, motivo: 'Informe a data de nascimento do aluno.' };
    }
    const regras = tfmObterRegras();
    let faixaSel = null;
    for (const f of regras.faixas) {
        if (idade <= f.limite) { faixaSel = f; break; }
    }
    if (!faixaSel) faixaSel = regras.faixas[regras.faixas.length - 1];
    const lim = faixaSel[genero];
    const A = v.flexoes, B = v.abdominais, C = v.corridaSeg, D = v.deslocamentoConcluiu;
    if (A == null || B == null || C == null || (regras.exigeDeslocamento && !D)) {
        return { avaliado: false, apto: false, motivo: 'Preencha as questoes A, B, C e D.' };
    }
    const falhas = [];
    if (A < lim.A) falhas.push('A) minimo ' + lim.A + ' flexoes (fez ' + A + ')');
    if (B < lim.B) falhas.push('B) minimo ' + lim.B + ' abdominais (fez ' + B + ')');
    if (C > lim.C) falhas.push('C) maximo ' + lim.C + 's (fez ' + C + 's)');
    if (regras.exigeDeslocamento && D !== 'Sim') falhas.push('D) deslocamento deve ser Sim');
    return {
        avaliado: true,
        apto: falhas.length === 0,
        idade: idade,
        faixa: faixaSel.rotulo,
        genero: al.genero,
        motivo: falhas.length ? falhas.join('; ') : 'Todos os criterios atendidos'
    };
}

function tfmRegraEl(id) {
    return document.getElementById(id);
}

function tfmAbrirEditarRegras() {
    const regras = tfmObterRegras();
    const padrao = tfmRegrasPadrao();
    for (let i = 0; i < 3; i++) {
        const f = regras.faixas[i] || padrao.faixas[i];
        if (tfmRegraEl('tfm-regra-faixa-' + i)) tfmRegraEl('tfm-regra-faixa-' + i).value = f.rotulo || '';
        if (tfmRegraEl('tfm-regra-limite-' + i)) tfmRegraEl('tfm-regra-limite-' + i).value = f.limite;
        if (tfmRegraEl('tfm-regra-m-A-' + i)) tfmRegraEl('tfm-regra-m-A-' + i).value = f.masculino.A;
        if (tfmRegraEl('tfm-regra-m-B-' + i)) tfmRegraEl('tfm-regra-m-B-' + i).value = f.masculino.B;
        if (tfmRegraEl('tfm-regra-m-C-' + i)) tfmRegraEl('tfm-regra-m-C-' + i).value = f.masculino.C;
        if (tfmRegraEl('tfm-regra-f-A-' + i)) tfmRegraEl('tfm-regra-f-A-' + i).value = f.feminino.A;
        if (tfmRegraEl('tfm-regra-f-B-' + i)) tfmRegraEl('tfm-regra-f-B-' + i).value = f.feminino.B;
        if (tfmRegraEl('tfm-regra-f-C-' + i)) tfmRegraEl('tfm-regra-f-C-' + i).value = f.feminino.C;
    }
    const cb = tfmRegraEl('tfm-regra-exige-d');
    if (cb) cb.checked = regras.exigeDeslocamento !== false;
    const overlay = tfmRegraEl('modal-tfm-regras-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function tfmFecharEditarRegras(event) {
    if (event && event.target && event.target.id !== 'modal-tfm-regras-overlay') return;
    const overlay = tfmRegraEl('modal-tfm-regras-overlay');
    if (overlay) overlay.classList.add('hidden');
}

async function tfmSalvarRegras() {
    const regras = tfmRegrasPadrao();
    const num = (el) => {
        const n = parseInt(el ? el.value : '', 10);
        return isNaN(n) ? null : n;
    };
    for (let i = 0; i < 3; i++) {
        const faixaEl = tfmRegraEl('tfm-regra-faixa-' + i);
        const limiteEl = tfmRegraEl('tfm-regra-limite-' + i);
        if (!faixaEl || !limiteEl) { alert('Elemento de regra nao encontrado.'); return; }
        const lim = num(limiteEl);
        if (lim === null || lim < 0) { alert('Informe um limite de idade valido na faixa ' + (i + 1) + '.'); return; }
        const mA = num(tfmRegraEl('tfm-regra-m-A-' + i));
        const mB = num(tfmRegraEl('tfm-regra-m-B-' + i));
        const mC = num(tfmRegraEl('tfm-regra-m-C-' + i));
        const fA = num(tfmRegraEl('tfm-regra-f-A-' + i));
        const fB = num(tfmRegraEl('tfm-regra-f-B-' + i));
        const fC = num(tfmRegraEl('tfm-regra-f-C-' + i));
        if (mA === null || mB === null || mC === null || fA === null || fB === null || fC === null) {
            alert('Preencha todos os limites A, B e C da faixa ' + (i + 1) + ' (masculino e feminino).');
            return;
        }
        regras.faixas[i] = {
            limite: lim,
            rotulo: (faixaEl.value || '').trim() || ('Faixa ' + (i + 1)),
            masculino: { A: mA, B: mB, C: mC },
            feminino: { A: fA, B: fB, C: fC }
        };
    }
    regras.faixas.sort((a, b) => a.limite - b.limite);
    const cb = tfmRegraEl('tfm-regra-exige-d');
    regras.exigeDeslocamento = cb ? cb.checked : true;
    tfmSalvarRegrasNoLocal(regras);
    tfmFecharEditarRegras();
    alert('Regras do TFM 1 atualizadas!');
    await tfmSincronizarRegistros();
}

async function tfmSincronizarRegistros() {
    try {
        const snap = await dbFirestore.collection('tfmAlunos').get();
        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
        if (!docs.length) { alert('Nenhum registro de TFM encontrado para sincronizar.'); return; }

        const candMap = {};
        try {
            const snapCand = await dbFirestore.collection('candidatos').get();
            snapCand.forEach(d => { candMap[d.data().cpf] = d.data(); });
        } catch (e) {}

        const pendentes = [];
        let atualizados = 0;
        const lotes = [];
        let lote = [];
        for (const doc of docs) {
            const d = doc.data;
            const cand = candMap[d.cpf] || {};
            const al = {
                nascimento: d.nascimento || cand.nascimento || '',
                genero: d.genero || cand.genero || ''
            };
            const v = {
                flexoes: d.flexoes != null ? d.flexoes : null,
                abdominais: d.abdominais != null ? d.abdominais : null,
                corridaSeg: d.corridaSeg != null ? d.corridaSeg : null,
                deslocamentoConcluiu: d.deslocamentoConcluiu || ''
            };
            const auto = tfmCalcularAptidao(al, v);
            if (!auto.avaliado) { pendentes.push(d.cpf || d.id); continue; }
            const novo = auto.apto ? 'Apto' : 'Inapto';
            if (novo.toUpperCase() !== String(d.resultado || '').toUpperCase()) {
                lote.push({ id: doc.id, resultado: novo });
            }
            if (lote.length >= 400) { lotes.push(lote); lote = []; }
        }
        if (lote.length) lotes.push(lote);

        const erros = [];
        for (const l of lotes) {
            const batch = dbFirestore.batch();
            for (const item of l) {
                batch.update(dbFirestore.collection('tfmAlunos').doc(item.id), { resultado: item.resultado });
            }
            try {
                await batch.commit();
                atualizados += l.length;
            } catch (e) {
                erros.push(e.message);
            }
        }

        let msg = 'Sincronizacao concluida!\nRegistros atualizados com as novas regras: ' + atualizados +
            '\nRegistros sem avaliacao completa (mantidos como estavam): ' + pendentes.length;
        if (erros.length) msg += '\nErros ao gravar: ' + erros.join('; ');
        alert(msg);
        if (typeof tfmOnSelecaoChange === 'function') tfmOnSelecaoChange();
    } catch (e) {
        alert('Erro ao sincronizar os registros: ' + e.message);
    }
}

async function tfmSincronizarDocente() {
    if (!tfmAlunos.length) { alert('Nenhuma turma selecionada para sincronizar.'); return; }
    const turma = tfmAlunos[0].turma || '';
    const antes = Object.assign({}, tfmExistentes);
    const novos = {};
    try {
        const snap = tfmAgendamentoSelecionadoId
            ? await dbFirestore.collection('tfmAlunos').where('agendamentoId', '==', tfmAgendamentoSelecionadoId).get()
            : await dbFirestore.collection('tfmAlunos').where('turma', '==', turma).get();
        snap.forEach(doc => {
            const dd = doc.data();
            if (dd.cpf) novos[dd.cpf] = Object.assign({ docId: doc.id }, dd);
        });
    } catch (e) {
        alert('Erro ao buscar os dados do docente: ' + e.message);
        return;
    }
    const recarregados = Object.keys(novos).length;
    tfmAlunos.forEach(al => {
        const cpf = al.cpf;
        const antigo = antes[cpf] || {};
        const novo = novos[cpf] || {};
        const campos = [
            ['tfm-flexoes-' + cpf, 'flexoes'],
            ['tfm-abdominais-' + cpf, 'abdominais'],
            ['tfm-corrida-' + cpf, 'corridaSeg']
        ];
        campos.forEach(par => {
            const el = document.getElementById(par[0]);
            if (!el) return;
            const atual = String(el.value || '').trim();
            const antigoVal = antigo[par[1]] != null ? String(antigo[par[1]]) : '';
            const novoVal = novo[par[1]] != null ? String(novo[par[1]]) : '';
            if (atual === antigoVal || atual === '') el.value = novoVal;
        });
        const descEl = document.getElementById('tfm-desloc-concluiu-' + cpf);
        if (descEl) {
            const atual = descEl.value;
            const antigoVal = antigo.deslocamentoConcluiu || '';
            const novoVal = novo.deslocamentoConcluiu || '';
            if (atual === antigoVal || atual === '') descEl.value = novoVal;
        }
        const resEl = document.getElementById('tfm-resultado-' + cpf);
        if (resEl) {
            const atual = resEl.value;
            const antigoVal = antigo.resultado || 'Pendente';
            const novoVal = novo.resultado || 'Pendente';
            if (atual === antigoVal) resEl.value = novoVal;
        }
    });
    tfmExistentes = novos;
    tfmAtualizarResumo();
    alert('Sincronizacao com o docente concluida!\nRegistros encontrados: ' + recarregados +
        (recarregados === 0 ? '\nO docente ainda nao salvou resultados para esta turma/agendamento.' : ''));
}

function tfmDadosAgendados() {
    const ag = tfmAgendamentoTurma;
    let dataProva = '';
    if (ag && ag.dataAgendamento) {
        let d = null;
        if (typeof ag.dataAgendamento.toDate === 'function') d = ag.dataAgendamento.toDate();
        else {
            const dd = new Date(ag.dataAgendamento);
            if (!isNaN(dd.getTime())) d = dd;
        }
        if (d) dataProva = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    if (!dataProva) dataProva = new Date().toISOString().slice(0, 10);
    return { dataProva: dataProva, docente: (ag && ag.docente) || '' };
}

async function tfmSalvar(cpf) {
    const al = tfmAlunos.find(a => a.cpf === cpf);
    if (!al) return;
    const v = tfmColetarValores(cpf);
    if (!tfmValoresPreenchidos(v)) { alert('Preencha ao menos um resultado do teste para salvar.'); return; }
    const ag = tfmDadosAgendados();
    const dados = {
        cpf: al.cpf,
        nome: al.nome || '',
        matricula: al.matricula || '',
        turma: al.turma || '',
        projeto: al.projeto || '',
        nascimento: al.nascimento || '',
        genero: al.genero || '',
        dataProva: ag.dataProva,
        docente: ag.docente,
        flexoes: v.flexoes,
        abdominais: v.abdominais,
        corridaSeg: v.corridaSeg,
        deslocamentoConcluiu: v.deslocamentoConcluiu,
        resultado: v.resultado,
        dataResultado: new Date().toISOString()
    };
    if (tfmAgendamentoSelecionadoId) dados.agendamentoId = tfmAgendamentoSelecionadoId;
    const resDocId = tfmAgendamentoSelecionadoId ? tfmAgendamentoSelecionadoId + '__' + al.cpf : al.cpf;
    try {
        await dbFirestore.collection('tfmAlunos').doc(resDocId).set(dados, { merge: true });
        alert('TFM de ' + (al.nome || al.cpf) + ' salvo com sucesso!');
        tfmAgendamentoAbrirId = tfmAgendamentoSelecionadoId;
        tfmOnSelecaoChange();
    } catch(e) {
        alert('Erro ao salvar: ' + e.message);
    }
}

async function tfmSalvarTodos() {
    if (!tfmAlunos.length) { alert('Nenhum aluno nesta turma.'); return; }
    let salvos = 0;
    const erros = [];
    const ag = tfmDadosAgendados();
    for (const al of tfmAlunos) {
        const v = tfmColetarValores(al.cpf);
        if (!tfmValoresPreenchidos(v)) continue;
        try {
            const dados = {
                cpf: al.cpf,
                nome: al.nome || '',
                matricula: al.matricula || '',
                turma: al.turma || '',
                projeto: al.projeto || '',
                nascimento: al.nascimento || '',
                genero: al.genero || '',
                dataProva: ag.dataProva,
                docente: ag.docente,
                flexoes: v.flexoes,
                abdominais: v.abdominais,
                corridaSeg: v.corridaSeg,
                deslocamentoConcluiu: v.deslocamentoConcluiu,
                resultado: v.resultado,
                dataResultado: new Date().toISOString()
            };
            if (tfmAgendamentoSelecionadoId) dados.agendamentoId = tfmAgendamentoSelecionadoId;
            const resDocId = tfmAgendamentoSelecionadoId ? tfmAgendamentoSelecionadoId + '__' + al.cpf : al.cpf;
            await dbFirestore.collection('tfmAlunos').doc(resDocId).set(dados, { merge: true });
            salvos++;
        } catch(e) {
            erros.push((al.nome || al.cpf) + ': ' + e.message);
        }
    }
    if (salvos === 0) { alert('Nenhum resultado preenchido para salvar.'); return; }
    if (erros.length) alert(salvos + ' TFM(s) salvos.\nErros em ' + erros.length + ':\n' + erros.join('\n'));
    else alert(salvos + ' TFM(s) salvos com sucesso!');
    tfmAgendamentoAbrirId = tfmAgendamentoSelecionadoId;
    tfmOnSelecaoChange();
}

function tfmAtualizarResumo() {
    const el = (id, val) => { const x = document.getElementById(id); if (x) x.textContent = val; };
    if (!tfmAlunos.length) {
        el('tfm-resumo-alunos', '0'); el('tfm-resumo-avaliados', '0'); el('tfm-resumo-aptos', '0'); el('tfm-resumo-inaptos', '0');
        return;
    }
    let avaliados = 0, aptos = 0, inaptos = 0;
    tfmAlunos.forEach(al => {
        const v = tfmColetarValores(al.cpf);
        const auto = tfmCalcularAptidao(al, v);
        const badgeEl = document.getElementById('tfm-badge-' + al.cpf);
        const resEl = document.getElementById('tfm-resultado-' + al.cpf);
        if (badgeEl) {
            if (!auto.avaliado) {
                badgeEl.innerHTML = '<span style="background:#f1f5f9;color:#64748b;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:700">INCOMPLETO</span>';
            } else if (auto.apto) {
                badgeEl.innerHTML = '<span style="background:#16a34a;color:#fff;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:700;box-shadow:0 1px 4px rgba(22,163,74,.4)" title="' + tfmEsc(auto.motivo) + '">APTO</span>';
            } else {
                badgeEl.innerHTML = '<span style="background:#dc2626;color:#fff;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:700;box-shadow:0 1px 4px rgba(220,38,38,.4)" title="' + tfmEsc(auto.motivo) + '">INAPTO</span>';
            }
        }
        if (resEl && auto.avaliado) resEl.value = auto.apto ? 'Apto' : 'Inapto';
        if (tfmValoresPreenchidos(v)) {
            avaliados++;
            const resFinal = auto.avaliado ? (auto.apto ? 'Apto' : 'Inapto') : v.resultado;
            if (resFinal === 'Apto') aptos++;
            else if (resFinal === 'Inapto') inaptos++;
        }
    });
    el('tfm-resumo-alunos', tfmAlunos.length);
    el('tfm-resumo-avaliados', avaliados);
    el('tfm-resumo-aptos', aptos);
    el('tfm-resumo-inaptos', inaptos);
}

function tfmRenderSalvos() {
    const tbody = document.getElementById('tfm-salvos-body');
    const countEl = document.getElementById('tfm-salvos-count');
    if (!tbody) return;
    const projeto = document.getElementById('tfm-selecao-projeto') ? document.getElementById('tfm-selecao-projeto').value : '';
    const turma = document.getElementById('tfm-selecao-turma') ? document.getElementById('tfm-selecao-turma').value : '';
    if (!projeto || !turma) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;font-size:13px">Selecione um projeto e turma para visualizar os TFM salvos.</td></tr>';
        if (countEl) countEl.textContent = '0 registro(s)';
        return;
    }
    const cpfs = Object.keys(tfmExistentes).sort(function(a, b) {
        const ea = tfmExistentes[a];
        const eb = tfmExistentes[b];
        const ta = ea.dataResultado ? tfmAgDataMillis(ea.dataResultado) : (ea.dataProva ? tfmAgDataMillis(ea.dataProva) : 0);
        const tb = eb.dataResultado ? tfmAgDataMillis(eb.dataResultado) : (eb.dataProva ? tfmAgDataMillis(eb.dataProva) : 0);
        return tb - ta;
    });
    if (!cpfs.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;font-size:13px">Nenhum TFM salvo para esta turma.</td></tr>';
        if (countEl) countEl.textContent = '0 registro(s)';
        return;
    }
    if (countEl) countEl.textContent = cpfs.length + ' registro(s)';
    tbody.innerHTML = cpfs.map(function(cpf) {
        const e = tfmExistentes[cpf];
        const al = tfmAlunos.find(a => a.cpf === cpf);
        const nome = al ? al.nome : (e.nome || cpf);
        const mat = al ? al.matricula : (e.matricula || '-');
        const res = e.resultado || 'Pendente';
        const cor = res === 'Apto' ? '#16a34a' : res === 'Inapto' ? '#dc2626' : '#ca8a04';
        const dt = e.dataResultado ? new Date(e.dataResultado) : null;
        const dtStr = dt && !isNaN(dt.getTime()) ? dt.toLocaleString('pt-BR') : (e.dataProva || '-');
        return '<tr>' +
            '<td style="font-weight:600">' + tfmEsc(nome) + '</td>' +
            '<td>' + tfmEsc(mat || '-') + '</td>' +
            '<td><span class="badge" style="background:' + cor + '15;color:' + cor + ';border:1px solid ' + cor + '30">' + res + '</span></td>' +
            '<td style="font-size:12px;color:#64748b">' + tfmEsc(dtStr) + '</td>' +
            '<td><div class="actions-cell">' +
                '<button class="btn-icon" title="Editar" onclick="tfmEditarSalvo(\'' + cpf + '\')"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="tfmExcluirSalvo(\'' + cpf + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div></td></tr>';
    }).join('');
}

function tfmEditarSalvo(cpf) {
    const linha = document.querySelector('#tfm-table-body tr[data-cpf="' + cpf + '"]');
    if (!linha) { alert('Aluno nao encontrado na tabela de avaliacao.'); return; }
    linha.scrollIntoView({ behavior: 'smooth', block: 'center' });
    linha.style.transition = 'background .6s';
    linha.style.background = '#fef9c3';
    setTimeout(function() { linha.style.background = ''; }, 2500);
}

async function tfmExcluirSalvo(cpf) {
    const al = tfmAlunos.find(a => a.cpf === cpf);
    const nome = al ? al.nome : (tfmExistentes[cpf] ? tfmExistentes[cpf].nome : cpf);
    if (!confirm('Excluir o TFM de ' + nome + '?')) return;
    try {
        const resDocId = tfmAgendamentoSelecionadoId ? tfmAgendamentoSelecionadoId + '__' + cpf : cpf;
        await dbFirestore.collection('tfmAlunos').doc(resDocId).delete();
        alert('TFM excluido com sucesso!');
        tfmAgendamentoAbrirId = tfmAgendamentoSelecionadoId;
        tfmOnSelecaoChange();
    } catch(e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

function tfmPreencherAgenda() {
    const elData = document.getElementById('tfm-agenda-data');
    const elInst = document.getElementById('tfm-agenda-docente');
    const elObs = document.getElementById('tfm-agenda-obs');
    const btnCanc = document.getElementById('tfm-agenda-btn-cancelar');
    const statusEl = document.getElementById('tfm-agenda-status');
    if (!elData) return;
    const ag = tfmAgendamentoTurma;

    tfmPopulateAgendaDocente(elInst);

    let dt = null;
    if (ag && ag.dataAgendamento) {
        if (typeof ag.dataAgendamento.toDate === 'function') dt = ag.dataAgendamento.toDate();
        else {
            const dd = new Date(ag.dataAgendamento);
            if (!isNaN(dd.getTime())) dt = dd;
        }
    }
    elData.value = dt ? dt.toISOString().slice(0, 16) : '';

    if (ag && ag.docente && elInst) {
        const opt = elInst.querySelector('option[value="' + String(ag.docente).replace(/"/g, '&quot;') + '"]');
        if (opt) elInst.value = ag.docente;
        else {
            const optNovo = document.createElement('option');
            optNovo.value = ag.docente;
            optNovo.textContent = ag.docente;
            elInst.appendChild(optNovo);
            elInst.value = ag.docente;
        }
    }
    if (elObs) elObs.value = (ag && ag.observacao) || '';
    if (btnCanc) btnCanc.style.display = ag ? '' : 'none';
    const testeEl = document.getElementById('tfm-teste-conteudo');
    if (testeEl) testeEl.style.display = ag ? '' : 'none';
    const avisoEl = document.getElementById('tfm-agenda-aviso');
    if (avisoEl) avisoEl.style.display = ag ? 'none' : 'flex';
    if (statusEl) {
        if (ag) {
            statusEl.style.display = '';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#16a34a;margin-right:4px"></i> TFM da turma agendado para ' + tfmEsc(tfmFormatarDataHora(ag.dataAgendamento) || 'data a definir');
        } else {
            statusEl.style.display = 'none';
        }
    }
}

async function tfmSalvarAgendamentoTurma() {
    const projeto = document.getElementById('tfm-selecao-projeto').value;
    const turma = document.getElementById('tfm-selecao-turma').value;
    if (!projeto || !turma) { alert('Selecione o projeto e a turma.'); return; }
    const elData = document.getElementById('tfm-agenda-data');
    const elInst = document.getElementById('tfm-agenda-docente');
    const elObs = document.getElementById('tfm-agenda-obs');
    const dataVal = elData ? elData.value : '';
    if (!dataVal) { alert('Informe a data e hora do TFM.'); return; }
    const dt = new Date(dataVal);
    if (isNaN(dt.getTime())) { alert('Data/hora invalida.'); return; }
    const docente = elInst ? elInst.value : '';
    const observacao = elObs ? elObs.value.trim() : '';
    try {
        const ref = tfmAgendamentoSelecionadoId
            ? dbFirestore.collection('tfmAgendamentos').doc(tfmAgendamentoSelecionadoId)
            : dbFirestore.collection('tfmAgendamentos').doc();
        await ref.set({
            projeto: projeto,
            turma: turma,
            dataAgendamento: firebase.firestore.Timestamp.fromDate(dt),
            docente: docente,
            observacao: observacao,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
        tfmAgendamentoTurma = { projeto: projeto, turma: turma, dataAgendamento: firebase.firestore.Timestamp.fromDate(dt), docente: docente, observacao: observacao };
        tfmAgendamentoSelecionadoId = ref.id;
        tfmAgendadosLista = [];
        tfmPreencherAgenda();
        alert('Agendamento da turma salvo com sucesso!');
    } catch(e) {
        alert('Erro ao salvar agendamento: ' + e.message);
    }
}

async function tfmCancelarAgendamentoTurma() {
    if (!tfmAgendamentoSelecionadoId || !tfmAgendamentoTurma) return;
    const turma = document.getElementById('tfm-selecao-turma').value;
    if (!confirm('Cancelar o agendamento do TFM da turma?')) return;
    try {
        await dbFirestore.collection('tfmAgendamentos').doc(tfmAgendamentoSelecionadoId).delete();
        tfmAgendamentoTurma = null;
        tfmAgendamentoSelecionadoId = null;
        tfmAgendadosLista = [];
        tfmPreencherAgenda();
        alert('Agendamento da turma cancelado com sucesso!');
    } catch(e) {
        alert('Erro ao cancelar agendamento: ' + e.message);
    }
}

var tfmAgendadosLista = [];

async function tfmCarregarLista() {
    const tbody = document.getElementById('tfm-lista-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;font-size:13px"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</td></tr>';
    try {
        const snap = await dbFirestore.collection('tfmAgendamentos').get();
        tfmAgendadosLista = [];
        snap.forEach(doc => {
            tfmAgendadosLista.push(Object.assign({ turmaDoc: doc.id }, doc.data()));
        });
        tfmAgendadosLista.sort(function(a, b) {
            return tfmAgDataMillis(b.dataAgendamento) - tfmAgDataMillis(a.dataAgendamento);
        });
        tfmFiltrarLista();
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px;font-size:13px">Erro ao carregar agendamentos: ' + tfmEsc(e.message) + '</td></tr>';
    }
}

function tfmFiltrarLista() {
    const input = document.getElementById('tfm-lista-filtro');
    const termo = (input ? input.value : '').trim().toLowerCase();
    const resultados = tfmAgendadosLista.filter(function(a) {
        return !termo ||
            String(a.nome || '').toLowerCase().indexOf(termo) !== -1 ||
            String(a.turma || '').toLowerCase().indexOf(termo) !== -1 ||
            String(a.projeto || '').toLowerCase().indexOf(termo) !== -1 ||
            String(a.docente || '').toLowerCase().indexOf(termo) !== -1 ||
            String(a.observacao || '').toLowerCase().indexOf(termo) !== -1;
    });
    const countEl = document.getElementById('tfm-lista-count');
    if (countEl) countEl.textContent = resultados.length + ' agendamento(s)';
    tfmRenderLista(resultados);
}

function tfmRenderLista(resultados) {
    const tbody = document.getElementById('tfm-lista-body');
    if (!tbody) return;
    if (!resultados.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;font-size:13px">Nenhum TFM agendado. Clique em "Novo Agendamento de TFM" para agendar uma turma.</td></tr>';
        return;
    }
    tbody.innerHTML = resultados.map(function(a) {
        const dt = a.dataAgendamento ? tfmFormatarDataHora(a.dataAgendamento) : 'Data a definir';
        const turmaEsc = String(a.turma || '').replace(/'/g, "\\'");
        const projetoEsc = String(a.projeto || '').replace(/'/g, "\\'");
        const docEsc = String(a.turmaDoc || '').replace(/'/g, "\\'");
        return '<tr>' +
            '<td style="font-weight:600;color:#1e293b">' + tfmEsc(a.nome || '-') + '</td>' +
            '<td>' + tfmEsc(a.projeto || '-') + '</td>' +
            '<td style="font-weight:600">' + tfmEsc(a.turma || '-') + '</td>' +
            '<td style="font-size:12px;color:#16a34a;font-weight:700">' + tfmEsc(dt) + '</td>' +
            '<td>' + tfmEsc(a.docente || '-') + '</td>' +
            '<td style="font-size:12px;color:#64748b">' + tfmEsc(a.observacao || '-') + '</td>' +
            '<td><div class="actions-cell">' +
                '<button class="btn-icon" title="Editar agendamento" onclick="tfmAbrirNovoAgendamento(\'' + docEsc + '\')"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-icon" title="Avaliar turma" onclick="tfmAvaliarTurma(\'' + projetoEsc + '\',\'' + turmaEsc + '\',\'' + docEsc + '\')"><i class="fa-solid fa-stopwatch"></i></button>' +
                '<button class="btn-icon btn-danger-icon" title="Excluir agendamento" onclick="tfmExcluirAgendamentoLista(\'' + docEsc + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div></td>' +
            '</tr>';
    }).join('');
}

function tfmAvaliarTurma(projeto, turma, agendamentoId) {
    tfmAgendamentoAbrirId = agendamentoId || null;
    const listaWrap = document.getElementById('tfm-lista-wrap');
    const selecaoWrap = document.getElementById('tfm-selecao-wrap');
    const conteudo = document.getElementById('tfm-conteudo');
    if (listaWrap) listaWrap.style.display = 'none';
    if (selecaoWrap) selecaoWrap.style.display = '';
    const selProj = document.getElementById('tfm-selecao-projeto');
    const selTurma = document.getElementById('tfm-selecao-turma');
    if (selProj) {
        selProj.value = projeto;
        tfmOnSelecaoProjetoChange();
        if (selTurma) selTurma.value = turma;
        tfmOnSelecaoChange();
    }
    if (conteudo) conteudo.style.display = '';
}

function tfmVoltarLista() {
    const listaWrap = document.getElementById('tfm-lista-wrap');
    const selecaoWrap = document.getElementById('tfm-selecao-wrap');
    const conteudo = document.getElementById('tfm-conteudo');
    if (listaWrap) listaWrap.style.display = '';
    if (selecaoWrap) selecaoWrap.style.display = 'none';
    if (conteudo) conteudo.style.display = 'none';
    tfmCarregarLista();
}

async function tfmExcluirAgendamentoLista(docId) {
    const ag = tfmAgendadosLista.find(function(a) { return a.turmaDoc === docId; });
    const turma = ag ? (ag.turma || docId) : docId;
    if (!confirm('Excluir o agendamento do TFM da turma "' + turma + '"?')) return;
    try {
        await dbFirestore.collection('tfmAgendamentos').doc(docId).delete();
        tfmAgendadosLista = tfmAgendadosLista.filter(function(a) { return a.turmaDoc !== docId; });
        if (tfmAgendamentoSelecionadoId === docId) {
            tfmAgendamentoTurma = null;
            tfmAgendamentoSelecionadoId = null;
            tfmPreencherAgenda();
        }
        tfmFiltrarLista();
        alert('Agendamento excluido com sucesso!');
    } catch(e) {
        alert('Erro ao excluir agendamento: ' + e.message);
    }
}

var tfmNovoTurmaOriginal = null;
var tfmNovoAgendamentoDocId = null;

function tfmAbrirNovoAgendamento(turmaDoc) {
    const editar = turmaDoc ? tfmAgendadosLista.find(function(a) { return a.turmaDoc === turmaDoc; }) : null;
    tfmNovoTurmaOriginal = editar ? editar.turma : null;
    tfmNovoAgendamentoDocId = editar ? editar.turmaDoc : null;
    const selProj = document.getElementById('tfm-novo-projeto');
    if (selProj) {
        selProj.innerHTML = '<option value="">Selecione o projeto...</option>';
        projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').forEach(p => {
            selProj.innerHTML += '<option value="' + tfmEsc(p.nome).replace(/"/g, '&quot;') + '">' + tfmEsc(p.nome + (p.responsavel ? ' - ' + p.responsavel : '')).replace(/</g, '&lt;') + '</option>';
        });
    }
    const selTurma = document.getElementById('tfm-novo-turma');
    if (selTurma) selTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    const nomeEl = document.getElementById('tfm-novo-nome');
    if (nomeEl) nomeEl.value = (editar && editar.nome) || '';
    if (editar) {
        if (selProj) selProj.value = editar.projeto;
        tfmNovoOnProjetoChange();
        if (selTurma) selTurma.value = editar.turma;
    } else {
        tfmNovoOnProjetoChange();
    }
    const selData = document.getElementById('tfm-novo-data');
    if (selData) {
        let dt = null;
        if (editar && editar.dataAgendamento) {
            if (typeof editar.dataAgendamento.toDate === 'function') dt = editar.dataAgendamento.toDate();
            else {
                const dd = new Date(editar.dataAgendamento);
                if (!isNaN(dd.getTime())) dt = dd;
            }
        }
        selData.value = dt ? dt.toISOString().slice(0, 16) : '';
    }
    const selInst = document.getElementById('tfm-novo-docente');
    tfmPopulateAgendaDocente(selInst);
    if (selInst && editar && editar.docente) {
        const opt = selInst.querySelector('option[value="' + String(editar.docente).replace(/"/g, '&quot;') + '"]');
        if (opt) selInst.value = editar.docente;
        else {
            const optNovo = document.createElement('option');
            optNovo.value = editar.docente;
            optNovo.textContent = editar.docente;
            selInst.appendChild(optNovo);
            selInst.value = editar.docente;
        }
    }
    const elObs = document.getElementById('tfm-novo-obs');
    if (elObs) elObs.value = (editar && editar.observacao) || '';
    const aviso = document.getElementById('tfm-novo-aviso');
    if (aviso) aviso.style.display = editar ? '' : 'none';
    const titulo = document.getElementById('tfm-novo-titulo');
    if (titulo) titulo.textContent = editar ? 'Editar Agendamento de TFM' : 'Novo Agendamento de TFM';
    tfmNovoQuestoes = [];
    if (editar && editar.questoes && Array.isArray(editar.questoes)) {
        tfmNovoQuestoes = editar.questoes.map(function(q) { return Object.assign({}, q); });
    }
    tfmNovoRenderQuestoes();
    const overlay = document.getElementById('modal-tfm-novo-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function tfmNovoOnProjetoChange() {
    const projetoNome = document.getElementById('tfm-novo-projeto').value;
    const selTurma = document.getElementById('tfm-novo-turma');
    selTurma.innerHTML = '<option value="">Selecione a turma...</option>';
    if (projetoNome) {
        turmas.filter(t => t.projeto === projetoNome).forEach(t => {
            selTurma.innerHTML += '<option value="' + tfmEsc(t.nome).replace(/"/g, '&quot;') + '">' + tfmEsc(t.nome + (t.descricao ? ' - ' + t.descricao : '')).replace(/</g, '&lt;') + '</option>';
        });
    }
    const aviso = document.getElementById('tfm-novo-aviso');
    if (aviso) aviso.style.display = 'none';
}

let tfmNovoQuestoes = [];
let tfmNovoQuestaoId = 0;

function tfmNovoAdicionarQuestao() {
    const id = String.fromCharCode(65 + tfmNovoQuestoes.length);
    tfmNovoQuestoes.push({
        id: id,
        nome: '',
        tipo: 'minimo',
        masculino: { ate29: '', '30_39': '', '40mais': '' },
        feminino: { ate29: '', '30_39': '', '40mais': '' }
    });
    tfmNovoRenderQuestoes();
}

function tfmNovoRemoverQuestao(index) {
    tfmNovoQuestoes.splice(index, 1);
    tfmNovoQuestoes.forEach(function(q, i) { q.id = String.fromCharCode(65 + i); });
    tfmNovoRenderQuestoes();
}

function tfmNovoRenderQuestoes() {
    const container = document.getElementById('tfm-novo-questoes');
    const empty = document.getElementById('tfm-novo-questoes-empty');
    if (!container) return;
    if (empty) empty.style.display = tfmNovoQuestoes.length ? 'none' : '';
    if (!tfmNovoQuestoes.length) { container.innerHTML = ''; return; }
    let html = '';
    tfmNovoQuestoes.forEach(function(q, i) {
        const tipoOptions = '<option value="minimo"' + (q.tipo === 'minimo' ? ' selected' : '') + '>Minimo (mais = melhor)</option><option value="maximo"' + (q.tipo === 'maximo' ? ' selected' : '') + '>Maximo (menos = melhor)</option>';
        html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;position:relative">' +
            '<button type="button" onclick="tfmNovoRemoverQuestao(' + i + ')" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#dc2626;cursor:pointer;font-size:16px" title="Remover questao"><i class="fa-solid fa-xmark"></i></button>' +
            '<div style="font-weight:700;color:#16a34a;font-size:13px;margin-bottom:10px"><i class="fa-solid fa-tag"></i> Questao ' + q.id + '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<div><label style="font-size:11px;color:#64748b;margin-bottom:4px;display:block">Nome da Questao *</label><input type="text" class="config-input" id="tfm-q-nome-' + i + '" value="' + tfmEsc(q.nome) + '" placeholder="Ex: Flexao de bracos" style="width:100%;font-size:12px"></div>' +
            '<div><label style="font-size:11px;color:#64748b;margin-bottom:4px;display:block">Tipo *</label><select class="config-input" id="tfm-q-tipo-' + i + '" style="width:100%;font-size:12px">' + tipoOptions + '</select></div>' +
            '</div>' +
            '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0">' +
            '<div style="font-size:11px;font-weight:600;color:#475569;margin-bottom:8px">Regras por faixa etaria e genero</div>' +
            '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;font-size:11px">' +
            '<div style="color:#64748b;font-weight:600">Faixa</div><div style="color:#64748b;font-weight:600">Masc ate 29</div><div style="color:#64748b;font-weight:600">Masc 30-39</div><div style="color:#64748b;font-weight:600">Masc 40+</div><div style="color:#64748b;font-weight:600">Fem ate 29</div><div style="color:#64748b;font-weight:600">Fem 30-39</div><div style="color:#64748b;font-weight:600">Fem 40+</div>' +
            '<div style="color:#475569;padding:6px 0">Ate 29</div>' +
            '<input type="number" class="config-input" id="tfm-q-m29-' + i + '" value="' + tfmEsc(q.masculino.ate29) + '" placeholder="0" style="width:100%;font-size:11px;padding:5px">' +
            '<input type="number" class="config-input" id="tfm-q-m39-' + i + '" value="' + tfmEsc(q.masculino['30_39']) + '" placeholder="0" style="width:100%;font-size:11px;padding:5px">' +
            '<input type="number" class="config-input" id="tfm-q-m40-' + i + '" value="' + tfmEsc(q.masculino['40mais']) + '" placeholder="0" style="width:100%;font-size:11px;padding:5px">' +
            '<input type="number" class="config-input" id="tfm-q-f29-' + i + '" value="' + tfmEsc(q.feminino.ate29) + '" placeholder="0" style="width:100%;font-size:11px;padding:5px">' +
            '<input type="number" class="config-input" id="tfm-q-f39-' + i + '" value="' + tfmEsc(q.feminino['30_39']) + '" placeholder="0" style="width:100%;font-size:11px;padding:5px">' +
            '<input type="number" class="config-input" id="tfm-q-f40-' + i + '" value="' + tfmEsc(q.feminino['40mais']) + '" placeholder="0" style="width:100%;font-size:11px;padding:5px">' +
            '</div>' +
            '</div></div>';
    });
    container.innerHTML = html;
}

function tfmNovoColetarQuestoes() {
    const questoes = [];
    tfmNovoQuestoes.forEach(function(q, i) {
        const nome = (document.getElementById('tfm-q-nome-' + i) || {}).value || '';
        const tipo = (document.getElementById('tfm-q-tipo-' + i) || {}).value || 'minimo';
        const num = function(id) { const el = document.getElementById(id); return el ? el.value : ''; };
        questoes.push({
            id: q.id,
            nome: nome.trim(),
            tipo: tipo,
            masculino: { ate29: num('tfm-q-m29-' + i), '30_39': num('tfm-q-m39-' + i), '40mais': num('tfm-q-m40-' + i) },
            feminino: { ate29: num('tfm-q-f29-' + i), '30_39': num('tfm-q-f39-' + i), '40mais': num('tfm-q-f40-' + i) }
        });
    });
    return questoes;
}

function tfmFecharNovoAgendamento(event) {
    if (event && event.target && event.target.id !== 'modal-tfm-novo-overlay') return;
    const overlay = document.getElementById('modal-tfm-novo-overlay');
    if (overlay) overlay.classList.add('hidden');
    tfmNovoTurmaOriginal = null;
    tfmNovoAgendamentoDocId = null;
}

async function tfmSalvarNovoAgendamento() {
    const nome = (document.getElementById('tfm-novo-nome') || {}).value || '';
    const projeto = document.getElementById('tfm-novo-projeto').value;
    const turma = document.getElementById('tfm-novo-turma').value;
    const dataVal = document.getElementById('tfm-novo-data').value;
    const docente = document.getElementById('tfm-novo-docente').value;
    const observacao = document.getElementById('tfm-novo-obs').value.trim();
    const questoes = tfmNovoColetarQuestoes();
    if (!nome.trim()) { alert('Informe o nome do agendamento.'); return; }
    if (!projeto) { alert('Selecione o projeto.'); return; }
    if (!turma) { alert('Selecione a turma.'); return; }
    if (!dataVal) { alert('Informe a data e hora do TFM.'); return; }
    const dt = new Date(dataVal);
    if (isNaN(dt.getTime())) { alert('Data/hora invalida.'); return; }
    try {
        const ref = tfmNovoAgendamentoDocId
            ? dbFirestore.collection('tfmAgendamentos').doc(tfmNovoAgendamentoDocId)
            : dbFirestore.collection('tfmAgendamentos').doc();
        await ref.set({
            nome: nome.trim(),
            projeto: projeto,
            turma: turma,
            dataAgendamento: firebase.firestore.Timestamp.fromDate(dt),
            docente: docente,
            observacao: observacao,
            questoes: questoes,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
        tfmNovoTurmaOriginal = null;
        tfmNovoAgendamentoDocId = null;
        tfmFecharNovoAgendamento();
        await tfmCarregarLista();
        alert('Agendamento salvo com sucesso!');
    } catch(e) {
        alert('Erro ao salvar agendamento: ' + e.message);
    }
}

function tfmExportarCSV() {
    if (!tfmAlunos.length) { alert('Nenhuma turma selecionada.'); return; }
    const turma = document.getElementById('tfm-selecao-turma').value;
    const projeto = document.getElementById('tfm-selecao-projeto').value;
    let csv = 'Nome;CPF;Matricula;Projeto;Turma;Data Prova;Docente;Flexoes (1min);Abdominais (1min);Corrida (seg);Desloc. Concluiu;Resultado\n';
    tfmAlunos.forEach(al => {
        const e = tfmExistentes[al.cpf] || {};
        const cpf = formatCPFDisplay(al.cpf || '');
        csv += '"' + String(al.nome || '').replace(/"/g, '""') + '";"' + cpf + '";"' + String(al.matricula || '').replace(/"/g, '""') + '";"' + String(projeto || '').replace(/"/g, '""') + '";"' + String(turma || '').replace(/"/g, '""') + '";"' + (e.dataProva || '') + '";"' + String(e.docente || '').replace(/"/g, '""') + '";' + (e.flexoes != null ? e.flexoes : '') + ';' + (e.abdominais != null ? e.abdominais : '') + ';' + (e.corridaSeg != null ? e.corridaSeg : '') + ';"' + (e.deslocamentoConcluiu || '') + '";"' + (e.resultado || 'Pendente') + '"\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tfm_' + turma.replace(/[^a-zA-Z0-9]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
}

/* ===== APOSTILAS ADMIN ===== */
var apostEditingId = null;

/* ===== APOSTILAS POR DISCIPLINA ===== */
var apostEditingId = null;
var apostDisciplinaId = null;
var apostDisciplina = null;

function apostFecharModal(event) {
    if (event && event.target !== event.currentTarget) return;
    var modal = document.getElementById('apost-modal-overlay');
    if (modal) modal.classList.add('hidden');
}

async function apostAbrirModal(disciplinaId) {
    try {
        var doc = await dbFirestore.collection('disciplinas').doc(disciplinaId).get();
        if (!doc.exists) { alert('Disciplina nao encontrada.'); return; }
        var d = doc.data();
        apostDisciplinaId = disciplinaId;
        apostDisciplina = d;
        var info = document.getElementById('apost-modal-disciplina');
        if (info) {
            info.innerHTML = '<div style="font-size:14px;font-weight:700;color:#9c27b0;margin-bottom:6px"><i class="fa-solid fa-graduation-cap" style="margin-right:6px"></i>' + (d.nome || 'Disciplina') + '</div>' +
                '<div style="font-size:12px;color:#64748b;display:flex;gap:10px;flex-wrap:wrap">' +
                    '<span><i class="fa-solid fa-folder-open" style="margin-right:4px"></i>' + (d.projeto || '-') + '</span>' +
                    '<span><i class="fa-solid fa-users" style="margin-right:4px"></i>' + (d.turma || 'Todas as turmas') + '</span>' +
                    (d.docente ? '<span><i class="fa-solid fa-chalkboard-user" style="margin-right:4px"></i>' + d.docente + '</span>' : '') +
                '</div>';
        }
        document.getElementById('apost-file').value = '';
        document.getElementById('apost-observacao').value = '';
        document.getElementById('apost-ferramentas').value = '';
        document.getElementById('apost-metodo').value = '';
        document.getElementById('apost-visivel').checked = false;
        var msg = document.getElementById('apost-msg');
        if (msg) msg.style.display = 'none';
        var btn = document.getElementById('apost-upload-btn');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar Apostila';
        apostEditingId = null;

        var snap = await dbFirestore.collection('apostilasAlunos').where('disciplinaId', '==', disciplinaId).limit(1).get();
        if (snap.empty) {
            snap = await dbFirestore.collection('apostilasAlunos').where('titulo', '==', (d.nome || '')).limit(1).get();
        }
        if (!snap.empty) {
            snap.forEach(function(apDoc) {
                var a = apDoc.data();
                apostEditingId = apDoc.id;
                document.getElementById('apost-file').value = a.url || '';
                document.getElementById('apost-observacao').value = a.observacao || '';
                document.getElementById('apost-ferramentas').value = a.ferramentas || '';
                document.getElementById('apost-metodo').value = a.metodoAvaliacao || '';
                document.getElementById('apost-visivel').checked = a.visivel !== false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Apostila';
            });
        }

        document.getElementById('apost-modal-overlay').classList.remove('hidden');
    } catch(e) {
        console.error('Erro ao abrir apostila:', e);
        alert('Erro ao carregar apostila: ' + e.message);
    }
}

async function apostSalvarModal(e) {
    e.preventDefault();
    if (!apostDisciplina) return;
    var arquivo = document.getElementById('apost-file').value;
    var observacao = document.getElementById('apost-observacao').value.trim();
    var ferramentas = document.getElementById('apost-ferramentas').value.trim();
    var metodo = document.getElementById('apost-metodo').value.trim();
    var visivel = document.getElementById('apost-visivel').checked;
    if (!arquivo) { apostShowMsg('Selecione o arquivo PDF.', 'err'); return; }
    var btn = document.getElementById('apost-upload-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    try {
        var dados = {
            titulo: apostDisciplina.nome || 'Apostila',
            descricao: observacao,
            observacao: observacao,
            ferramentas: ferramentas,
            metodoAvaliacao: metodo,
            projeto: apostDisciplina.projeto || '',
            turma: apostDisciplina.turma || '',
            disciplinaId: apostDisciplinaId,
            disciplinaNome: apostDisciplina.nome || '',
            url: arquivo,
            visivel: visivel
        };
        if (apostEditingId) {
            await dbFirestore.collection('apostilasAlunos').doc(apostEditingId).update(dados);
            apostShowMsg('Apostila atualizada com sucesso!', 'ok');
        } else {
            dados.data = new Date().toISOString();
            dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
            await dbFirestore.collection('apostilasAlunos').add(dados);
            apostShowMsg('Apostila cadastrada com sucesso!', 'ok');
        }
        setTimeout(function() { apostFecharModal(); }, 1200);
        apostilasLoadList();
    } catch(e) {
        console.error('Erro ao salvar apostila:', e);
        apostShowMsg('Erro: ' + e.message, 'err');
    }
    btn.disabled = false;
    btn.innerHTML = apostEditingId ? '<i class="fa-solid fa-check"></i> Atualizar Apostila' : '<i class="fa-solid fa-check"></i> Salvar Apostila';
}

function apostShowMsg(text, type) {
    var el = document.getElementById('apost-msg');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.background = type === 'ok' ? 'rgba(76,175,80,.15)' : 'rgba(244,67,54,.15)';
    el.style.border = '1px solid ' + (type === 'ok' ? 'rgba(76,175,80,.3)' : 'rgba(244,67,54,.3)');
    el.style.color = type === 'ok' ? '#4caf50' : '#f44336';
}

async function apostilasLoadList() {
    var container = document.getElementById('apost-list');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:#475569;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando disciplinas...</div>';
    try {
        var snapDisc = await dbFirestore.collection('disciplinas').orderBy('nome').get();
        var apostSnap = await dbFirestore.collection('apostilasAlunos').get();
        var apostilas = {};
        apostSnap.forEach(function(doc) {
            var a = doc.data();
            a._id = doc.id;
            apostilas[a.disciplinaId || doc.id] = a;
        });
        if (snapDisc.empty) {
            container.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-graduation-cap" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i><p>Nenhuma disciplina cadastrada. Cadastre disciplinas na secao Disciplinas e Aulas.</p></div>';
            return;
        }
        container.innerHTML = '';
        snapDisc.forEach(function(doc) {
            var d = doc.data();
            var apost = apostilas[d.id] || null;
            var temApostila = !!(apost && apost.url);
            var turmaHtml = d.turma ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">' + d.turma + '</span>' : '<span style="background:#f1f5f9;color:#64748b;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Todas</span>';
            var docenteHtml = d.docente ? '<span style="background:rgba(37,99,235,.1);color:#2563eb;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-chalkboard-user" style="margin-right:3px"></i>' + d.docente + '</span>' : '';
            var statusApost = temApostila
                ? '<span style="background:rgba(76,175,80,.15);color:#4caf50;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-file-pdf" style="margin-right:3px"></i>Com apostila</span>'
                : '<span style="background:rgba(245,158,11,.12);color:#f59e0b;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-circle-plus" style="margin-right:3px"></i>Sem apostila</span>';
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border:1px solid ' + (temApostila ? 'rgba(76,175,80,.4)' : '#e2e8f0') + ';border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all .2s';
            card.onclick = function() { apostAbrirModal(doc.id); };
            card.onmouseover = function() { card.style.borderColor = '#16a34a'; card.style.background = 'rgba(22,163,74,.05)'; };
            card.onmouseout = function() { card.style.borderColor = temApostila ? 'rgba(76,175,80,.4)' : '#e2e8f0'; card.style.background = '#f8fafc'; };
            card.innerHTML = '<div style="width:42px;height:42px;background:rgba(156,39,176,.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-graduation-cap" style="color:#9c27b0;font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (d.nome || 'Disciplina') + '</div>' +
                    '<div style="font-size:11px;color:#64748b;display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">' +
                        '<span>' + (d.projeto || '') + '</span>' + turmaHtml + docenteHtml + statusApost +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button class="btn-primary btn-sm" style="background:#16a34a;border:none;font-size:11px;padding:6px 12px;white-space:nowrap" onclick="event.stopPropagation();apostAbrirModal(\'' + doc.id + '\')"><i class="fa-solid fa-' + (temApostila ? 'pen' : 'file-circle-plus') + '" style="margin-right:4px"></i>' + (temApostila ? 'Editar' : 'Cadastrar') + '</button>' +
                    (temApostila ? '<button title="Abrir PDF" style="background:rgba(76,175,80,.15);border:1px solid rgba(76,175,80,.3);color:#4caf50;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px" onclick="event.stopPropagation();window.open(\'' + apost.url + '\',\'_blank\')"><i class="fa-solid fa-file-pdf"></i></button>' : '') +
                    (temApostila ? '<button title="Excluir apostila" style="background:rgba(244,67,54,.15);border:1px solid rgba(244,67,54,.3);color:#f44336;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px" onclick="event.stopPropagation();apostDelete(\'' + apost._id + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
                '</div>';
            container.appendChild(card);
        });
    } catch(e) {
        console.error('Erro ao listar apostilas:', e);
        container.innerHTML = '<div style="text-align:center;color:#f44336;padding:30px">Erro ao carregar disciplinas.</div>';
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
            if ((p.status || 'Em Andamento') === 'Em Andamento') {
                sel.innerHTML += '<option value="' + p.nome + '">' + p.nome + '</option>';
            }
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

async function discLoadDocentes() {
    var sel = document.getElementById('disc-docente');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('docentes').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o docente...</option>';
        snap.forEach(function(doc) {
            var i = doc.data();
            sel.innerHTML += '<option value="' + i.nome + '">' + i.nome + (i.guerra ? ' (' + i.guerra + ')' : '') + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar docentes</option>';
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
    var docente = document.getElementById('disc-docente').value.trim();
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
            docente: docente
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
        document.getElementById('disc-docente').value = '';
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
    discLoadDocentes();
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
            var turmaHtml = d.turma ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">' + d.turma + '</span>' : '<span style="background:#f1f5f9;color:#64748b;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Todas</span>';
            var docenteHtml = d.docente ? '<span style="background:rgba(37,99,235,.1);color:#2563eb;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-chalkboard-user" style="margin-right:3px"></i>' + d.docente + '</span>' : '';
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px';
            card.innerHTML = '<div style="width:42px;height:42px;background:rgba(156,39,176,.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-graduation-cap" style="color:#9c27b0;font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (d.nome || 'Disciplina') + '</div>' +
                    '<div style="font-size:11px;color:#64748b;display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">' +
                        '<span>' + (d.projeto || '') + '</span>' + turmaHtml + docenteHtml + (dateStr ? '<span>' + dateStr + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button onclick="discEdit(\'' + doc.id + '\')" title="Editar" style="background:rgba(245,127,23,.1);border:1px solid rgba(245,127,23,.25);color:#f57f17;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(245,127,23,.25)\'" onmouseout="this.style.background=\'rgba(245,127,23,.1)\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="discDelete(\'' + doc.id + '\')" title="Excluir" style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.25);color:#dc2626;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(220,38,38,.25)\'" onmouseout="this.style.background=\'rgba(220,38,38,.1)\'"><i class="fa-solid fa-trash"></i></button>' +
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
            document.getElementById('disc-docente').value = d.docente || '';
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
            sel.innerHTML += '<option value="' + d.nome + '" data-projeto="' + (d.projeto || '') + '" data-turma="' + (d.turma || '') + '" data-docente="' + (d.docente || '') + '">' + d.nome + ' (' + (d.projeto || '') + ')</option>';
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
    var docente = opt.getAttribute('data-docente') || '';
    if (projeto) document.getElementById('aula-projeto').value = projeto;
    if (turma) {
        aulaOnProjetoChange();
        setTimeout(function() { document.getElementById('aula-turma').value = turma; }, 100);
    }
    if (docente) document.getElementById('aula-docente').value = docente;
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

async function aulaLoadDocentes() {
    var sel = document.getElementById('aula-docente');
    if (!sel) return;
    try {
        var snap = await dbFirestore.collection('docentes').orderBy('nome').get();
        sel.innerHTML = '<option value="">Selecione o docente...</option>';
        snap.forEach(function(doc) {
            var i = doc.data();
            sel.innerHTML += '<option value="' + i.nome + '">' + i.nome + (i.guerra ? ' (' + i.guerra + ')' : '') + '</option>';
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Erro ao carregar docentes</option>';
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
    var docente = document.getElementById('aula-docente').value.trim();
    var data = document.getElementById('aula-data').value;
    var horario = document.getElementById('aula-horario').value.trim();
    var conteudo = document.getElementById('aula-conteudo').value.trim();
    var avTeorica = document.getElementById('aula-av-teorica').value;
    var avPratica = document.getElementById('aula-av-pratica').value;
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
            docente: docente,
            data: data,
            horario: horario,
            conteudo: conteudo,
            avTeorica: avTeorica,
            avPratica: avPratica
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
        document.getElementById('aula-docente').value = '';
        document.getElementById('aula-data').value = '';
        document.getElementById('aula-horario').value = '';
        document.getElementById('aula-conteudo').value = '';
        document.getElementById('aula-av-teorica').value = '';
        document.getElementById('aula-av-pratica').value = '';
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
    aulaLoadDocentes();
    try {
        var apontadasAulas = {};
        try {
            var aptSnap = await dbFirestore.collection('apontamentos').get();
            aptSnap.forEach(function(aptDoc) {
                var ap = aptDoc.data();
                if (ap.aulaId) apontadasAulas[ap.aulaId] = true;
            });
        } catch (e) { console.error('Erro ao carregar apontamentos (aulas):', e); }
        var snap = await dbFirestore.collection('aulas').orderBy('data', 'desc').get();
        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center;color:#666;padding:30px"><i class="fa-solid fa-chalkboard" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i><p>Nenhuma aula cadastrada.</p></div>';
            return;
        }
        container.innerHTML = '';
        snap.forEach(function(doc) {
            var a = doc.data();
            var apontada = !!apontadasAulas[doc.id];
            var dateStr = a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
            var turmaHtml = a.turma ? '<span style="background:rgba(22,163,74,.1);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">' + a.turma + '</span>' : '<span style="background:#f1f5f9;color:#64748b;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600">Todas</span>';
            var docenteHtml = a.docente ? '<span style="background:rgba(37,99,235,.1);color:#2563eb;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600"><i class="fa-solid fa-chalkboard-user" style="margin-right:3px"></i>' + a.docente + '</span>' : '';
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border:1px solid ' + (apontada ? '#16a34a' : '#e2e8f0') + ';border-radius:10px;margin-bottom:8px' + (apontada ? ';background:rgba(22,163,74,.05)' : '');
            card.innerHTML = '<div style="width:42px;height:42px;background:' + (apontada ? 'rgba(22,163,74,.12)' : 'rgba(37,99,235,.1)') + ';border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-clipboard-check" style="color:' + (apontada ? '#16a34a' : '#2563eb') + ';font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:700;color:' + (apontada ? '#16a34a' : '#1e293b') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (a.disciplina || 'Aula') + (a.conteudo ? ' - ' + a.conteudo : '') + (apontada ? ' <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(22,163,74,.12);color:#16a34a;border:1px solid rgba(22,163,74,.25);vertical-align:middle"><i class="fa-solid fa-check"></i> Apontada</span>' : '') + '</div>' +
                    '<div style="font-size:11px;color:#64748b;display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">' +
                        '<span>' + (a.projeto || '') + '</span>' + turmaHtml + docenteHtml + (dateStr ? '<span><i class="fa-solid fa-calendar-day" style="margin-right:2px"></i>' + dateStr + '</span>' : '') + (a.horario ? '<span><i class="fa-solid fa-clock" style="margin-right:2px"></i>' + a.horario + '</span>' : '') +
                        (a.avTeorica === 'Sim' ? '<span style="background:rgba(168,85,247,.12);color:#9333ea;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:700"><i class="fa-solid fa-file-lines" style="margin-right:3px"></i>AV Teórica</span>' : '') +
                        (a.avPratica === 'Sim' ? '<span style="background:rgba(22,163,74,.12);color:#16a34a;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:700"><i class="fa-solid fa-flask" style="margin-right:3px"></i>AV Prática</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button onclick="aulaEdit(\'' + doc.id + '\')" title="Editar" style="background:rgba(245,127,23,.1);border:1px solid rgba(245,127,23,.25);color:#f57f17;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(245,127,23,.25)\'" onmouseout="this.style.background=\'rgba(245,127,23,.1)\'"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="aulaDelete(\'' + doc.id + '\')" title="Excluir" style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.25);color:#dc2626;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background=\'rgba(220,38,38,.25)\'" onmouseout="this.style.background=\'rgba(220,38,38,.1)\'"><i class="fa-solid fa-trash"></i></button>' +
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
            document.getElementById('aula-docente').value = a.docente || '';
        }, 100);
        document.getElementById('aula-data').value = a.data || '';
        document.getElementById('aula-horario').value = a.horario || '';
        document.getElementById('aula-conteudo').value = a.conteudo || '';
        document.getElementById('aula-av-teorica').value = a.avTeorica || '';
        document.getElementById('aula-av-pratica').value = a.avPratica || '';
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

/* ===== DOCENTES ===== */
let docentes = [];
let editingDocenteId = null;

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

function docenteAbrirModal(id) {
    editingDocenteId = id || null;
    docenteLimparForm();
    docentePopulateSelects();
    var titleEl = document.getElementById('docente-form-title');
    if (id) {
        var inst = docentes.find(i => i.id === id);
        if (!inst) return;
        titleEl.innerHTML = '<i class="fa-solid fa-pen" style="color:#ff9800;margin-right:8px"></i> Editar Docente';
        document.getElementById('intr-id').value = inst.id;
        document.getElementById('intr-nome').value = inst.nome || '';
        document.getElementById('intr-guerra').value = inst.guerra || '';
        document.getElementById('intr-cpf').value = inst.cpf || '';
        document.getElementById('intr-genero').value = inst.genero || '';
        document.getElementById('intr-matricula').value = inst.matricula || '';
        document.getElementById('intr-fone').value = inst.fone || '';
        document.getElementById('intr-email').value = inst.email || '';
        document.getElementById('intr-senha').value = inst.senha || '';
        document.getElementById('intr-nascimento').value = inst.nascimento || '';
        document.getElementById('intr-data-inscricao').value = inst.dataInscricao || '';
        document.getElementById('intr-estado-civil').value = inst.estadoCivil || '';
        document.getElementById('intr-nacionalidade').value = inst.nacionalidade || '';
        document.getElementById('intr-naturalidade').value = inst.naturalidade || '';
        document.getElementById('intr-titulo').value = inst.tituloEleitor || '';
        document.getElementById('intr-profissao').value = inst.profissao || '';
        document.getElementById('intr-mae').value = inst.mae || '';
        document.getElementById('intr-pai').value = inst.pai || '';
        document.getElementById('intr-endereco').value = inst.endereco || '';
        document.getElementById('intr-numero').value = inst.numero || '';
        document.getElementById('intr-bairro').value = inst.bairro || '';
        document.getElementById('intr-cidade').value = inst.cidade || '';
        document.getElementById('intr-estado').value = inst.estado || '';
        document.getElementById('intr-local-votacao').value = inst.localVotacao || '';
        document.getElementById('intr-altura').value = inst.altura || '';
        document.getElementById('intr-peso').value = inst.peso || '';
        document.getElementById('intr-fator-rh').value = inst.fatorRh || '';
        document.getElementById('intr-hipertensao').value = inst.hipertensao || 'Nao';
        document.getElementById('intr-diabetes').value = inst.diabetes || 'Nao';
        document.getElementById('intr-deficiencia').value = inst.deficiencia || 'Nao';
        document.getElementById('intr-tatuagem').value = inst.tatuagem || 'Nao';
        document.getElementById('intr-cirurgia').value = inst.cirurgia || 'Nao';
        document.getElementById('intr-alcool').value = inst.alcool || 'Nao';
        document.getElementById('intr-medicamento').value = inst.medicamento || '';
        document.getElementById('intr-cansaco').value = inst.cansaco || 'Nao';
        document.getElementById('intr-calca').value = inst.calca || '';
        document.getElementById('intr-camisa').value = inst.camisa || '';
        document.getElementById('intr-calcado').value = inst.calcado || '';
        docentePopulateSelects(inst.projeto || [], inst.turma || []);
        calcularIdadeCampo('intr-nascimento', 'intr-idade');
        docentePopulateDisciplinas(inst.disciplinas || []);
    } else {
        titleEl.innerHTML = '<i class="fa-solid fa-plus" style="color:#4caf50;margin-right:8px"></i> Novo Docente';
        docentePopulateDisciplinas([]);
    }
    document.getElementById('modal-docente-overlay').classList.remove('hidden');
}

function docenteFecharModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-docente-overlay').classList.add('hidden');
}

function docenteLimparForm() {
    document.getElementById('intr-id').value = '';
    document.getElementById('intr-origem').value = '';
    document.getElementById('intr-aviso-remanejamento').style.display = 'none';
    ['intr-nome','intr-guerra','intr-cpf','intr-matricula','intr-fone','intr-email','intr-senha','intr-nascimento','intr-idade','intr-data-inscricao','intr-nacionalidade','intr-naturalidade','intr-titulo','intr-profissao','intr-mae','intr-pai','intr-endereco','intr-numero','intr-bairro','intr-cidade','intr-local-votacao','intr-altura','intr-peso','intr-medicamento'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['intr-genero','intr-estado-civil','intr-estado','intr-fator-rh','intr-calca','intr-camisa','intr-calcado'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.selectedIndex = 0;
    });
    ['intr-hipertensao','intr-diabetes','intr-deficiencia','intr-tatuagem','intr-cirurgia','intr-alcool','intr-cansaco'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = 'Nao';
    });
    docentePopulateSelects();
    docentePopulateDisciplinas([]);
}

/* ===== FORMADOS ===== */

function formadosInicializar() {
    var selProj = document.getElementById('formados-filtro-projeto');
    if (!selProj) return;
    var currentProj = selProj.value;
    selProj.innerHTML = '<option value="">Todos os projetos</option>';
    projetos.filter(function(p) { return p.status === 'Concluido'; }).forEach(function(p) {
        selProj.innerHTML += '<option value="' + p.nome + '">' + p.nome + '</option>';
    });
    if (currentProj) selProj.value = currentProj;
    formadosOnFiltroChange();
}

function formadosOnFiltroChange() {
    var selProj = document.getElementById('formados-filtro-projeto');
    var selTurma = document.getElementById('formados-filtro-turma');
    if (!selProj || !selTurma) return;
    var projeto = selProj.value;
    var current = selTurma.value;
    selTurma.innerHTML = '<option value="">Todas as turmas</option>';
    var projetosConcluidos = projetos.filter(function(p) { return p.status === 'Concluido'; });
    var turmasFiltradas = projeto
        ? turmas.filter(function(t) { return t.projeto === projeto; })
        : turmas.filter(function(t) { return projetosConcluidos.some(function(p) { return p.nome === t.projeto; }); });
    turmasFiltradas.forEach(function(t) {
        selTurma.innerHTML += '<option value="' + t.nome + '">' + t.nome + '</option>';
    });
    if (current) selTurma.value = current;
    renderFormadosList();
}

function renderFormadosList() {
    var tbody = document.getElementById('formados-table-body');
    if (!tbody) return;
    var selProj = document.getElementById('formados-filtro-projeto');
    var selTurma = document.getElementById('formados-filtro-turma');
    var projeto = selProj ? selProj.value : '';
    var turma = selTurma ? selTurma.value : '';
    var projetosConcluidos = projetos.filter(function(p) { return p.status === 'Concluido'; });
    var lista = candidatos.filter(function(c) {
        if ((c.tipoPessoa || 'A') !== 'F' || c.status !== 'Ativo') return false;
        var proj = projetos.find(function(p) { return p.nome === c.projeto; });
        if (!proj || proj.status !== 'Concluido') return false;
        return (!projeto || c.projeto === projeto) &&
            (!turma || c.turma === turma);
    });
    var badge = document.getElementById('formados-count-badge');
    if (badge) badge.textContent = lista.length + ' formado' + (lista.length !== 1 ? 's' : '');
    var empty = document.getElementById('formados-empty');
    var listaEl = document.getElementById('formados-lista');
    if (!lista.length) {
        if (empty) empty.style.display = 'block';
        if (listaEl) listaEl.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (listaEl) listaEl.style.display = 'block';
    tbody.innerHTML = lista.map(function(c) {
        var i = candidatos.indexOf(c);
        var statusBadge = c.status === 'Ativo' ? '<span class="badge green">Ativo</span>' : '<span class="badge pendente">' + (c.status || '-') + '</span>';
        var remanejado = c.remanejadoDocente
            ? '<span style="display:inline-block;background:rgba(37,99,235,.1);color:#1d4ed8;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap"><i class="fa-solid fa-user-check"></i> DOCENTE</span>'
            : '<span style="color:#94a3b8;font-size:11px">---</span>';
        return '<tr>' +
            '<td style="font-weight:600">' + (c.nome || '-') + '</td>' +
            '<td>' + formatCPFDisplay(c.cpf) + '</td>' +
            '<td>' + (c.turma || '-') + '</td>' +
            '<td style="color:#ff9800;font-weight:600">' + (c.projeto || '-') + '</td>' +
            '<td>' + (c.matricula || '-') + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + remanejado + '</td>' +
            '<td><div class="actions-cell">' +
                '<button class="btn-icon btn-info" title="Visualizar" onclick="viewCandidato(' + i + ')"><i class="fa-solid fa-eye"></i></button>' +
                '<button class="btn-icon" title="Editar" onclick="editCandidato(' + i + ')"><i class="fa-solid fa-pen"></i></button>' +
                (!c.remanejadoDocente ? '<button class="btn-icon" title="Remanejar como Docente" onclick="remanejarFormado(' + i + ')" style="color:#2563eb"><i class="fa-solid fa-arrows-rotate"></i></button>' : '') +
            '</div></td></tr>';
    }).join('');
}

function docentePopulateSelects(projetosSelecionados, turmasSelecionadas) {
    var containerProj = document.getElementById('intr-projetos-checks');
    if (!containerProj) return;
    var projArr = Array.isArray(projetosSelecionados) ? projetosSelecionados : (projetosSelecionados ? [projetosSelecionados] : []);
    var turmaArr = Array.isArray(turmasSelecionadas) ? turmasSelecionadas : (turmasSelecionadas ? [turmasSelecionadas] : []);
    containerProj.innerHTML = '';
    projetos.filter(p => (p.status || 'Em Andamento') === 'Em Andamento').forEach(p => {
        var checked = projArr.indexOf(p.nome) !== -1 ? 'checked' : '';
        containerProj.innerHTML += '<label class="intr-check-item"><input type="checkbox" class="intr-proj-check" value="' + p.nome + '" ' + checked + ' onchange="docenteOnProjetoChange()"> ' + p.nome + '</label>';
    });
    docenteOnProjetoChange(turmaArr);
}

function docenteOnProjetoChange(turmasSelecionadas) {
    var containerTurma = document.getElementById('intr-turmas-checks');
    if (!containerTurma) return;
    var projsSelecionados = docenteGetSelectedProjetos();
    var turmaArr = (turmasSelecionadas && Array.isArray(turmasSelecionadas)) ? turmasSelecionadas : [];
    containerTurma.innerHTML = '';
    var turmasFiltradas = projsSelecionados.length ? turmas.filter(t => projsSelecionados.indexOf(t.projeto) !== -1) : turmas;
    turmasFiltradas.forEach(t => {
        var checked = turmaArr.indexOf(t.nome) !== -1 ? 'checked' : '';
        containerTurma.innerHTML += '<label class="intr-check-item"><input type="checkbox" class="intr-turma-check" value="' + t.nome + '" ' + checked + '> ' + t.nome + '</label>';
    });
}

function docenteGetSelectedProjetos() {
    return Array.from(document.querySelectorAll('.intr-proj-check:checked')).map(function(cb) { return cb.value; });
}

function docenteGetSelectedTurmas() {
    return Array.from(document.querySelectorAll('.intr-turma-check:checked')).map(function(cb) { return cb.value; });
}

async function remanejarFormado(i) {
    var c = candidatos[i];
    if (!c) return;
    if ((c.tipoPessoa || 'A') !== 'F') { alert('Somente cadastros do tipo Formado (A) podem ser remanejados.'); return; }
    if (c.remanejadoDocente) { alert('Este formado ja foi remanejado como docente.'); return; }
    var senha = prompt('Digite a senha do administrador para remanejar o formado como docente:');
    if (!senha) return;
    if (senha !== ADMIN_SENHA) { alert('Senha incorreta! Remanejamento cancelado.'); return; }
    var jaExiste = docentes.find(x => x.cpf === c.cpf);
    if (jaExiste) { alert('Ja existe um docente cadastrado com este CPF.'); return; }
    docenteAbrirRemanejado(c);
}

function docenteAbrirRemanejado(c) {
    editingDocenteId = null;
    docenteLimparForm();
    document.getElementById('intr-origem').value = c.id || '';
    document.getElementById('intr-aviso-remanejamento').style.display = 'block';
    document.getElementById('docente-form-title').innerHTML = '<i class="fa-solid fa-arrows-rotate" style="color:#2563eb;margin-right:8px"></i> Remanejar Formado como Docente';
    document.getElementById('intr-nome').value = c.nome || '';
    document.getElementById('intr-guerra').value = '';
    document.getElementById('intr-cpf').value = c.cpf || '';
    document.getElementById('intr-genero').value = c.genero || '';
    document.getElementById('intr-matricula').value = c.matricula || '';
    document.getElementById('intr-fone').value = c.whatsapp || '';
    document.getElementById('intr-email').value = c.email || '';
    document.getElementById('intr-senha').value = c.senha || (c.cpf ? c.cpf.substring(0, 6) : '');
    document.getElementById('intr-nascimento').value = c.nascimento || '';
    document.getElementById('intr-data-inscricao').value = c.dataInscricao || '';
    document.getElementById('intr-estado-civil').value = c.estadoCivil || '';
    document.getElementById('intr-nacionalidade').value = c.nacionalidade || '';
    document.getElementById('intr-naturalidade').value = c.naturalidade || '';
    document.getElementById('intr-titulo').value = c.tituloEleitor || '';
    document.getElementById('intr-profissao').value = c.profissao || '';
    document.getElementById('intr-mae').value = c.mae || '';
    document.getElementById('intr-pai').value = c.pai || '';
    document.getElementById('intr-endereco').value = c.endereco || '';
    document.getElementById('intr-numero').value = c.numero || '';
    document.getElementById('intr-bairro').value = c.bairro || '';
    document.getElementById('intr-cidade').value = c.cidade || '';
    document.getElementById('intr-estado').value = c.estado || '';
    document.getElementById('intr-local-votacao').value = c.localVotacao || '';
    document.getElementById('intr-altura').value = c.altura || '';
    document.getElementById('intr-peso').value = c.peso || '';
    document.getElementById('intr-fator-rh').value = c.fatorRh || '';
    document.getElementById('intr-hipertensao').value = c.hipertensao || 'Nao';
    document.getElementById('intr-diabetes').value = c.diabetes || 'Nao';
    document.getElementById('intr-deficiencia').value = c.deficiencia || 'Nao';
    document.getElementById('intr-tatuagem').value = c.tatuagem || 'Nao';
    document.getElementById('intr-cirurgia').value = c.cirurgia || 'Nao';
    document.getElementById('intr-alcool').value = c.alcool || 'Nao';
    document.getElementById('intr-medicamento').value = c.medicamento || '';
    document.getElementById('intr-cansaco').value = c.cansaco || 'Nao';
    document.getElementById('intr-calca').value = c.calca || '';
    document.getElementById('intr-camisa').value = c.camisa || '';
    document.getElementById('intr-calcado').value = c.calcado || '';
    docentePopulateSelects(c.projeto, c.turma);
    calcularIdadeCampo('intr-nascimento', 'intr-idade');
    docentePopulateDisciplinas([]);
    document.getElementById('modal-docente-overlay').classList.remove('hidden');
}

function docentePopulateDisciplinas(selectedArr) {
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
        container.innerHTML += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;background:#f0fdf4;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:13px;color:#475569;white-space:nowrap"><input type="checkbox" value="' + d + '" class="intr-disc-check" ' + checked + '> ' + d + '</label>';
    });
}

function docenteGetSelectedDisciplinas() {
    return Array.from(document.querySelectorAll('.intr-disc-check:checked')).map(function(cb) { return cb.value; });
}

async function docenteSalvar(e) {
    e.preventDefault();
    var nome = document.getElementById('intr-nome').value.trim();
    var guerra = document.getElementById('intr-guerra').value.trim();
    var cpf = document.getElementById('intr-cpf').value.trim().replace(/\D/g, '');
    if (!nome || !guerra || !cpf) { alert('Preencha Nome Completo, Nome de Guerra e CPF'); return; }
    var genero = document.getElementById('intr-genero').value;
    var senha = document.getElementById('intr-senha').value.trim();
    if (!senha) { alert('Preencha a senha de acesso do docente.'); return; }
    if (senha.length < 4) { alert('Senha deve ter minimo 4 caracteres.'); return; }
    var dados = {
        nome: nome,
        guerra: guerra,
        cpf: cpf,
        genero: genero,
        matricula: document.getElementById('intr-matricula').value.trim(),
        fone: document.getElementById('intr-fone').value.trim(),
        email: document.getElementById('intr-email').value.trim(),
        senha: senha,
        projeto: docenteGetSelectedProjetos(),
        turma: docenteGetSelectedTurmas(),
        nascimento: document.getElementById('intr-nascimento').value,
        dataInscricao: document.getElementById('intr-data-inscricao').value,
        estadoCivil: document.getElementById('intr-estado-civil').value,
        nacionalidade: document.getElementById('intr-nacionalidade').value.trim(),
        naturalidade: document.getElementById('intr-naturalidade').value.trim(),
        tituloEleitor: document.getElementById('intr-titulo').value.trim(),
        profissao: document.getElementById('intr-profissao').value.trim(),
        mae: document.getElementById('intr-mae').value.trim(),
        pai: document.getElementById('intr-pai').value.trim(),
        endereco: document.getElementById('intr-endereco').value.trim(),
        numero: document.getElementById('intr-numero').value.trim(),
        bairro: document.getElementById('intr-bairro').value.trim(),
        cidade: document.getElementById('intr-cidade').value.trim(),
        estado: document.getElementById('intr-estado').value,
        localVotacao: document.getElementById('intr-local-votacao').value.trim(),
        altura: document.getElementById('intr-altura').value,
        peso: document.getElementById('intr-peso').value,
        fatorRh: document.getElementById('intr-fator-rh').value,
        hipertensao: document.getElementById('intr-hipertensao').value,
        diabetes: document.getElementById('intr-diabetes').value,
        deficiencia: document.getElementById('intr-deficiencia').value,
        tatuagem: document.getElementById('intr-tatuagem').value,
        cirurgia: document.getElementById('intr-cirurgia').value,
        alcool: document.getElementById('intr-alcool').value,
        medicamento: document.getElementById('intr-medicamento').value.trim(),
        cansaco: document.getElementById('intr-cansaco').value,
        calca: document.getElementById('intr-calca').value,
        camisa: document.getElementById('intr-camisa').value,
        calcado: document.getElementById('intr-calcado').value,
        disciplinas: docenteGetSelectedDisciplinas(),
        atualizadoEm: new Date().toISOString()
    };
    var origemCandidato = document.getElementById('intr-origem').value;
    try {
        if (editingDocenteId) {
            await dbFirestore.collection('docentes').doc(editingDocenteId).update(dados);
            var idx = docentes.findIndex(i => i.id === editingDocenteId);
            if (idx !== -1) Object.assign(docentes[idx], dados);
            alert('Docente atualizado com sucesso!');
        } else {
            var dup = docentes.find(i => i.cpf === cpf);
            if (dup) { alert('Ja existe docente com este CPF'); return; }
            dados.criadoEm = new Date().toISOString();
            var ref = await dbFirestore.collection('docentes').add(dados);
            dados.id = ref.id;
            docentes.push(dados);
            if (origemCandidato) {
                dados.remanejadoDe = origemCandidato;
                dados.remanejadoEm = new Date().toISOString();
                dados.remanejadoPor = currentUserData ? currentUserData.nome : 'Administrador';
                // Envia copia integral do cadastro do formado para o banco de docentes
                var candSnap = await dbFirestore.collection('candidatos').doc(String(origemCandidato)).get();
                var copiaCadastro = {};
                if (candSnap.exists) {
                    var origData = candSnap.data() || {};
                    Object.keys(origData).forEach(function(k) {
                        if (k !== 'id') copiaCadastro['cadastroFormado_' + k] = origData[k];
                    });
                }
                copiaCadastro.remanejadoDe = origemCandidato;
                copiaCadastro.remanejadoEm = dados.remanejadoEm;
                copiaCadastro.remanejadoPor = dados.remanejadoPor;
                copiaCadastro.copiaCadastroFormado = true;
                await dbFirestore.collection('docentes').doc(ref.id).update(copiaCadastro);
                var candIdx = candidatos.findIndex(function(c) { return String(c.id) === String(origemCandidato); });
                if (candIdx !== -1) {
                    candidatos[candIdx].remanejadoDocente = true;
                    candidatos[candIdx].remanejadoEm = dados.remanejadoEm;
                    candidatos[candIdx].remanejadoPor = dados.remanejadoPor;
                    if (candidatos[candIdx].id) {
                        await dbFirestore.collection('candidatos').doc(String(candidatos[candIdx].id)).update({ remanejadoDocente: true, remanejadoEm: dados.remanejadoEm, remanejadoPor: dados.remanejadoPor });
                    }
                    backupCandidatos();
                }
            }
            alert('Docente cadastrado com sucesso!' + (origemCandidato ? ' Formado remanejado e ativado como docente.' : ''));
        }
        docenteFecharModal();
        docenteListar();
        renderList();
        document.getElementById('modal-overlay').classList.add('hidden');
    } catch (e) {
        console.error('Erro ao salvar docente:', e);
        alert('Erro ao salvar docente: ' + e.message);
    }
}

function docenteListar() {
    var tbody = document.getElementById('docentes-table-body');
    var empty = document.getElementById('docentes-empty');
    var lista = document.getElementById('docentes-lista');
    if (!tbody) return;
    if (!docentes.length) {
        if (empty) empty.style.display = 'block';
        if (lista) lista.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (lista) lista.style.display = 'block';
    tbody.innerHTML = docentes.map(function(i) {
        var cpfFmt = i.cpf ? i.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-';
        var discHtml = (i.disciplinas || []).map(function(d) { return '<span class="badge blue" style="font-size:10px;margin:1px">' + d + '</span>'; }).join(' ');
        return '<tr>' +
            '<td style="font-weight:600">' + (i.nome || '-') + (i.remanejadoDe ? ' <span style="display:inline-block;background:rgba(37,99,235,.1);color:#1d4ed8;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:4px">FORMADO</span>' : '') + '</td>' +
            '<td>' + (i.guerra || '-') + '</td>' +
            '<td>' + cpfFmt + '</td>' +
            '<td>' + (i.genero || '-') + '</td>' +
            '<td>' + (i.matricula || '-') + '</td>' +
            '<td>' + (discHtml || '-') + '</td>' +
            '<td>' + (i.fone || '-') + '</td>' +
            '<td>' + (i.email || '-') + '</td>' +
            '<td><div class="actions-cell">' +
                '<button class="btn-icon" title="Editar" onclick="docenteAbrirModal(\'' + i.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="docenteExcluir(\'' + i.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
                '<button class="btn-icon" title="Imprimir" onclick="docenteImprimir(\'' + i.id + '\')" style="color:#4caf50"><i class="fa-solid fa-print"></i></button>' +
            '</div></td></tr>';
    }).join('');
}

async function docenteExcluir(id) {
    if (!confirm('Excluir este docente?')) return;
    try {
        await dbFirestore.collection('docentes').doc(id).delete();
        docentes = docentes.filter(i => i.id !== id);
        docenteListar();
    } catch (e) {
        console.error('Erro ao excluir docente:', e);
        alert('Erro ao excluir docente: ' + e.message);
    }
}

function docenteImprimir(id) {
    var i = docentes.find(x => x.id === id);
    if (!i) return;
    var cpfFmt = i.cpf ? i.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-';
    var discHtml = (i.disciplinas || []).join(', ') || '-';
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Docente - ' + (i.nome || '') + '</title><style>' +
        'body{font-family:Arial,sans-serif;padding:40px;color:#333}' +
        'h2{color:#1a237e;border-bottom:2px solid #1a237e;padding-bottom:8px}' +
        '.field{margin:10px 0;display:flex;gap:8px}' +
        '.label{font-weight:700;min-width:140px;color:#555}' +
        '.val{color:#111}' +
        '.disc-tag{display:inline-block;background:#e3f2fd;color:#1565c0;padding:3px 10px;border-radius:4px;margin:2px;font-size:13px}' +
        '@media print{body{padding:20px}}' +
        '</style></head><body>' +
        '<h2><i class="fa-solid fa-chalkboard-user"></i> Ficha do Docente</h2>' +
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

async function docentesInicializar() {
    if (docentes.length) {
        docenteListar();
        return;
    }
    try {
        var snap = await dbFirestore.collection('docentes').get();
        docentes = [];
        snap.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            docentes.push(data);
        });
        docenteListar();
    } catch (e) {
        console.error('Erro ao carregar docentes:', e);
    }
}

/* ===== NOTICIAS / SLIDE ===== */

var noticiasColunas = ['esquerda', 'meio', 'direita'];
var noticiasPendentes = { esquerda: [], meio: [], direita: [] };
var noticiasLista = [];
var noticiasUnsub = null;

var NOTICIAS_MAX_VIDEO_MB = 50;
var NOTICIAS_MAX_VIDEO_BYTES = NOTICIAS_MAX_VIDEO_MB * 1024 * 1024;
var NOTICIAS_MAX_VIDEO_DURACAO = 120;
var NOTICIAS_COM_PRIMIR_VIDEO_ACIMA_MB = 25;
var NOTICIAS_VIDEO_LARGURA_MAX = 1280;
var NOTICIAS_VIDEO_BITRATE = 2000000;

function noticiasInicializar() {
    noticiasColunas.forEach(function(coluna) {
        noticiasPendentes[coluna] = [];
        var file = document.getElementById('noticias-file-' + coluna);
        if (file) file.value = '';
        var thumbs = document.getElementById('noticias-thumbs-' + coluna);
        if (thumbs) thumbs.innerHTML = '';
        var btnPrev = document.getElementById('noticias-btn-preview-' + coluna);
        if (btnPrev) { btnPrev.style.display = 'none'; btnPrev.innerHTML = '<i class="fa-solid fa-eye"></i> Ver slide'; }
        var prev = document.getElementById('noticias-preview-slider-' + coluna);
        if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
        var txt = document.getElementById('noticias-texto-' + coluna);
        if (txt) txt.value = '';
    });
    noticiasCarregarLista();
}

function noticiasCarregarLista() {
    if (noticiasUnsub) noticiasUnsub();
    noticiasUnsub = dbFirestore.collection('noticiasSlides').orderBy('ordem', 'asc').onSnapshot(function(snap) {
        noticiasLista = [];
        snap.forEach(function(d) {
            var x = d.data();
            x.id = d.id;
            noticiasLista.push(x);
        });
        noticiasColunas.forEach(noticiasRenderLista);
    }, function() {
        noticiasColunas.forEach(function(coluna) {
            var container = document.getElementById('noticias-lista-' + coluna);
            if (container) container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">Erro ao carregar os slides.</div>';
        });
    });
}

function noticiasRenderLista(coluna) {
    var container = document.getElementById('noticias-lista-' + coluna);
    if (!container) return;
    var lista = noticiasLista.filter(function(n) { return n.coluna === coluna; });
    if (!lista.length) {
        container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:16px;font-size:12px"><i class="fa-solid fa-image" style="font-size:24px;display:block;margin-bottom:8px;color:#cbd5e1"></i>Nenhuma imagem nesta coluna.</div>';
        return;
    }
    container.innerHTML = lista.map(function(n, i) {
        var primeiro = i === 0;
        var ultimo = i === lista.length - 1;
        var ehVideo = !!n.videoUrl;
        var rotulo = n.texto || (ehVideo ? 'Video ' + (i + 1) : 'Imagem ' + (i + 1));
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;background:#fff">' +
            '<div style="position:relative;width:70px;height:48px;flex:none">' +
            '<img src="' + n.imagem + '" style="width:70px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0">' +
            (ehVideo ? '<span style="position:absolute;bottom:3px;right:3px;background:#dc2626;color:#fff;font-size:8px;font-weight:700;border-radius:3px;padding:1px 3px;line-height:1.2">VIDEO</span>' : '') +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + rotulo + '</div>' +
            '<div style="font-size:11px;color:#94a3b8">Posicao ' + (i + 1) + ' de ' + lista.length + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px">' +
            '<button class="btn-icon" title="Mover para cima" onclick="noticiasMover(\'' + n.id + '\', -1)"' + (primeiro ? ' disabled style="opacity:.3"' : '') + '><i class="fa-solid fa-arrow-up"></i></button>' +
            '<button class="btn-icon" title="Mover para baixo" onclick="noticiasMover(\'' + n.id + '\', 1)"' + (ultimo ? ' disabled style="opacity:.3"' : '') + '><i class="fa-solid fa-arrow-down"></i></button>' +
            '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="noticiasExcluir(\'' + n.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div></div>';
    }).join('');
}

async function noticiasMover(id, delta) {
    var alvo = noticiasLista.find(function(n) { return n.id === id; });
    if (!alvo) return;
    var coluna = alvo.coluna || 'meio';
    var lista = noticiasLista.filter(function(n) { return n.coluna === coluna; });
    var i = lista.findIndex(function(n) { return n.id === id; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    var a = lista[i];
    var b = lista[j];
    var batch = dbFirestore.batch();
    batch.update(dbFirestore.collection('noticiasSlides').doc(a.id), { ordem: b.ordem });
    batch.update(dbFirestore.collection('noticiasSlides').doc(b.id), { ordem: a.ordem });
    await batch.commit();
    if (window.noticiasSliderRefresh) window.noticiasSliderRefresh();
}

async function noticiasExcluir(id) {
    if (!confirm('Excluir esta imagem?')) return;
    await dbFirestore.collection('noticiasSlides').doc(id).delete();
    if (window.noticiasSliderRefresh) window.noticiasSliderRefresh();
}

function noticiasSelecionarImagens(input, coluna) {
    var files = input.files;
    if (!files || !files.length) return;
    noticiasPendentes[coluna] = [];
    var thumbs = document.getElementById('noticias-thumbs-' + coluna);
    if (thumbs) thumbs.innerHTML = '';
    var remaining = files.length;
    var aviso = document.getElementById('noticias-thumbs-' + coluna);
    Array.prototype.forEach.call(files, function(file) {
        var ehVideo = file.type.indexOf('video/') === 0;
        var process = ehVideo ? noticiasValidarVideo(file).then(function(meta) {
            var grande = file.size > NOTICIAS_COM_PRIMIR_VIDEO_ACIMA_MB * 1024 * 1024;
            var alta = meta.w > NOTICIAS_VIDEO_LARGURA_MAX;
            if (!grande && !alta) return { file: file, thumb: null };
            return noticiasComprimirVideo(file, meta.w, meta.h).then(function(blob) {
                return blob && blob.size < file.size ? { file: blob, thumb: null } : { file: file, thumb: null };
            });
        }).then(function(rs) {
            return noticiasVideoThumb(rs.file).then(function(t) {
                return { file: rs.file, thumb: t.thumb };
            });
        }) : noticiasCompressImage(file);
        process.then(function(rs) {
            if (ehVideo) {
                noticiasPendentes[coluna].push({ tipo: 'video', file: rs.file, thumb: rs.thumb, nomeArquivo: file.name });
            } else {
                noticiasPendentes[coluna].push({ tipo: 'imagem', dataUrl: rs });
            }
            if (thumbs) {
                var box = document.createElement('div');
                box.style.cssText = 'position:relative;width:70px;height:48px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0';
                var img = document.createElement('img');
                img.src = ehVideo ? rs.thumb : rs;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
                box.appendChild(img);
                if (ehVideo) {
                    var badge = document.createElement('span');
                    badge.textContent = 'VIDEO';
                    badge.style.cssText = 'position:absolute;bottom:2px;right:2px;background:#dc2626;color:#fff;font-size:8px;font-weight:700;border-radius:3px;padding:1px 3px;line-height:1.2';
                    box.appendChild(badge);
                }
                thumbs.appendChild(box);
            }
            remaining--;
            if (remaining === 0) {
                var btnPrev = document.getElementById('noticias-btn-preview-' + coluna);
                if (btnPrev) btnPrev.style.display = '';
                var prev = document.getElementById('noticias-preview-slider-' + coluna);
                if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
            }
        }).catch(function(err) {
            remaining--;
            var msg = (err && err.message) ? err.message : 'Falha ao processar arquivo.';
            if (aviso) {
                var wa = document.createElement('div');
                wa.style.cssText = 'color:#dc2626;font-size:12px;font-weight:700;margin:6px 0;padding:6px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px';
                wa.textContent = 'Ignorado: ' + file.name + ' - ' + msg;
                aviso.appendChild(wa);
            }
            if (remaining === 0) {
                var btnPrev = document.getElementById('noticias-btn-preview-' + coluna);
                if (btnPrev) btnPrev.style.display = '';
            }
        });
    });
}

function noticiasVideoThumb(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.onloadeddata = function() {
            try { video.currentTime = 0.1; } catch (e) {}
        };
        video.onseeked = function() {
            try {
                var w = 320;
                var scale = Math.min(1, w / (video.videoWidth || w));
                var canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round((video.videoWidth || w) * scale));
                canvas.height = Math.max(1, Math.round((video.videoHeight || w) * scale));
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve({ thumb: canvas.toDataURL('image/jpeg', 0.7) });
            } catch (e) { URL.revokeObjectURL(url); reject(e); }
        };
        video.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Video invalido')); };
        video.src = url;
    });
}

function noticiasValidarVideo(file) {
    return new Promise(function(resolve, reject) {
        if (file.size > NOTICIAS_MAX_VIDEO_BYTES) {
            reject(new Error('Video muito grande. Tamanho maximo de ' + NOTICIAS_MAX_VIDEO_MB + ' MB.'));
            return;
        }
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
            var dur = video.duration || 0;
            URL.revokeObjectURL(url);
            if (isFinite(dur) && dur > NOTICIAS_MAX_VIDEO_DURACAO) {
                reject(new Error('Video com mais de ' + Math.round(NOTICIAS_MAX_VIDEO_DURACAO / 60) + ' minuto(s). Envie um video mais curto.'));
                return;
            }
            resolve({ dur: isFinite(dur) ? dur : 0, w: video.videoWidth || 0, h: video.videoHeight || 0 });
        };
        video.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Video invalido')); };
        video.src = url;
    });
}

function noticiasComprimirVideo(file, w, h) {
    return new Promise(function(resolve, reject) {
        if (!window.MediaRecorder || !document.createElement('canvas').captureStream) {
            resolve(file);
            return;
        }
        var escala = Math.min(1, NOTICIAS_VIDEO_LARGURA_MAX / (w || NOTICIAS_VIDEO_LARGURA_MAX));
        var cw = Math.max(2, Math.round((w || NOTICIAS_VIDEO_LARGURA_MAX) * escala));
        var ch = Math.max(2, Math.round((h || cw * 0.5625) * escala));
        if (cw % 2) cw--;
        if (ch % 2) ch--;
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.src = url;
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        var chunks = [];
        var recorder = null;
        var stream = null;
        var limpo = false;
        function limpar() {
            if (limpo) return;
            limpo = true;
            try { video.pause(); } catch (e) {}
            try { URL.revokeObjectURL(url); } catch (e) {}
        }
        video.onerror = function() { limpar(); reject(new Error('Video invalido')); };
        video.onloadeddata = function() {
            try {
                stream = canvas.captureStream(30);
                var tipos = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
                var mime = tipos.find(function(t) { return window.MediaRecorder.isTypeSupported(t); }) || '';
                recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: NOTICIAS_VIDEO_BITRATE });
                recorder.ondataavailable = function(ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
                recorder.onstop = function() {
                    limpar();
                    var blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
                    resolve(blob);
                };
                recorder.start(500);
                video.play().catch(function() {});
            } catch (e) { limpar(); reject(e); }
        };
        var raf = null;
        function desenhar() {
            if (limpo) return;
            if (video.ended || (video.currentTime >= (video.duration || 0))) {
                if (recorder && recorder.state === 'recording') { try { recorder.stop(); } catch (e) {} }
                return;
            }
            try { ctx.drawImage(video, 0, 0, cw, ch); } catch (e) {}
            raf = requestAnimationFrame(desenhar);
        }
        video.ontimeupdate = function() {
            if (video.ended && recorder && recorder.state === 'recording') { try { recorder.stop(); } catch (e) {} }
        };
        video.onended = function() {
            if (recorder && recorder.state === 'recording') { try { recorder.stop(); } catch (e) {} }
        };
        video.addEventListener('loadeddata', function() { raf = requestAnimationFrame(desenhar); });
    });
}

function noticiasCompressImage(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var maxW = 1400;
                var scale = Math.min(1, maxW / img.width);
                var w = Math.max(1, Math.round(img.width * scale));
                var h = Math.max(1, Math.round(img.height * scale));
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function noticiasSalvarImagens(coluna) {
    var pend = noticiasPendentes[coluna] || [];
    if (!pend.length) { alert('Selecione imagens ou vídeos primeiro.'); return; }
    var temVideo = pend.some(function(it) { return it.tipo === 'video'; });
    if (temVideo && (!firebase || !firebase.storage)) { alert('Armazenamento de vídeos não configurado. Habilite o Firebase Storage no console do projeto.'); return; }
    var n = pend.length;
    var txtEl = document.getElementById('noticias-texto-' + coluna);
    var texto = txtEl ? txtEl.value.trim() : '';
    var metaRef = dbFirestore.collection('noticiasSlides').doc('_meta');
    await metaRef.set({ total: firebase.firestore.FieldValue.increment(n) }, { merge: true });
    var metaSnap = await metaRef.get();
    var total = metaSnap.exists && metaSnap.data().total ? metaSnap.data().total : n;
    var start = total - n;
    var batch = dbFirestore.batch();
    for (var i = 0; i < pend.length; i++) {
        var item = pend[i];
        var dados = {
            titulo: '',
            texto: texto,
            coluna: coluna,
            ordem: start + 1 + i,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (item.tipo === 'video') {
            var nomeOriginal = item.nomeArquivo || item.file.name || 'video.mp4';
            var ext = (item.file.type === 'video/webm' || (item.file.type || '').indexOf('webm') !== -1) ? 'webm' : (nomeOriginal.split('.').pop() || 'mp4');
            var ref = firebase.storage().ref('noticias/' + Date.now() + '_' + i + '.' + ext);
            await ref.put(item.file);
            var url = await ref.getDownloadURL();
            dados.videoUrl = url;
            dados.imagem = item.thumb || '';
            dados.nomeArquivo = nomeOriginal;
        } else {
            dados.imagem = item.dataUrl;
        }
        batch.set(dbFirestore.collection('noticiasSlides').doc(), dados);
    }
    await batch.commit();
    noticiasPendentes[coluna] = [];
    var file = document.getElementById('noticias-file-' + coluna);
    if (file) file.value = '';
    var btnPrev = document.getElementById('noticias-btn-preview-' + coluna);
    if (btnPrev) { btnPrev.style.display = 'none'; btnPrev.innerHTML = '<i class="fa-solid fa-eye"></i> Ver slide'; }
    var thumbs = document.getElementById('noticias-thumbs-' + coluna);
    if (thumbs) thumbs.innerHTML = '';
    var prev = document.getElementById('noticias-preview-slider-' + coluna);
    if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
    if (txtEl) txtEl.value = '';
    if (window.noticiasSliderRefresh) window.noticiasSliderRefresh();
    var nomeColuna = coluna === 'meio' ? 'central' : coluna;
    alert('Imagens/vídeos adicionados a coluna ' + nomeColuna + '!');
}

function noticiasPreviewIniciar(coluna) {
    var container = document.getElementById('noticias-preview-slider-' + coluna);
    var btn = document.getElementById('noticias-btn-preview-' + coluna);
    if (!container) return;
    var pend = noticiasPendentes[coluna] || [];
    if (!pend.length) return;
    if (container.style.display === 'none' || !container.innerHTML) {
        container.style.display = '';
        var txtEl = document.getElementById('noticias-texto-' + coluna);
        var texto = txtEl ? txtEl.value.trim() : '';
        var slides = pend.map(function(item) {
            if (item.tipo === 'video') {
                return { videoUrl: URL.createObjectURL(item.file), imagem: item.thumb, titulo: '', texto: texto };
            }
            return { imagem: item.dataUrl, titulo: '', texto: texto };
        });
        if (window.noticiasSliderRender) window.noticiasSliderRender(container, slides);
        if (btn) btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ocultar slide';
    } else {
        container.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i> Ver slide';
    }
}

/* ===== BLOG NOTICIAS (ADMIN) ===== */
var blogLista = [];
var blogUnsub = null;

function blogInicializar() {
    blogLimparForm();
    blogCarregarLista();
}

function blogPreviewImagem(input) {
    var preview = document.getElementById('blog-imagem-preview');
    if (!input.files || !input.files[0]) { preview.innerHTML = ''; return; }
    var reader = new FileReader();
    reader.onload = function(e) {
        preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:150px;border-radius:8px;border:1px solid #e2e8f0">';
    };
    reader.readAsDataURL(input.files[0]);
}

function blogLimparForm() {
    document.getElementById('blog-edit-id').value = '';
    document.getElementById('blog-titulo').value = '';
    document.getElementById('blog-subtitulo').value = '';
    document.getElementById('blog-conteudo').value = '';
    document.getElementById('blog-layout').value = 'hero';
    document.getElementById('blog-categoria').value = '';
    document.getElementById('blog-destaque').checked = false;
    document.getElementById('blog-ativo').checked = true;
    document.getElementById('blog-imagem').value = '';
    document.getElementById('blog-imagem-preview').innerHTML = '';
    document.getElementById('blog-form-titulo').textContent = 'Novo Post';
}

async function blogSalvar() {
    var titulo = (document.getElementById('blog-titulo').value || '').trim();
    var subtitulo = (document.getElementById('blog-subtitulo').value || '').trim();
    var conteudo = (document.getElementById('blog-conteudo').value || '').trim();
    var layout = document.getElementById('blog-layout').value;
    var categoria = document.getElementById('blog-categoria').value;
    var destaque = document.getElementById('blog-destaque').checked;
    var ativo = document.getElementById('blog-ativo').checked;
    var editId = document.getElementById('blog-edit-id').value;
    if (!titulo || !conteudo) { alert('Preencha titulo e conteudo.'); return; }

    var dados = {
        titulo: titulo,
        subtitulo: subtitulo,
        texto: conteudo,
        layout: layout,
        categoria: categoria,
        destaque: destaque,
        ativo: ativo,
        data: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
    };

    try {
        var fileInput = document.getElementById('blog-imagem');
        if (fileInput.files && fileInput.files[0]) {
            var file = fileInput.files[0];
            var compressed = await noticiasCompressImage(file, 1200, 800);
            var nomeArq = 'blog/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            var snap = await firebase.storage().ref().child(nomeArq).put(compressed);
            dados.imagem = await snap.ref.getDownloadURL();
        }

        if (editId) {
            await dbFirestore.collection('noticiasAlunos').doc(editId).update(dados);
            alert('Post atualizado com sucesso!');
        } else {
            dados.criadoEm = new Date().toISOString();
            dados.ordem = Date.now();
            await dbFirestore.collection('noticiasAlunos').doc().set(dados);
            alert('Post publicado com sucesso!');
        }
        blogLimparForm();
        blogCarregarLista();
    } catch (e) {
        console.error('Erro ao salvar blog:', e);
        alert('Erro ao salvar: ' + e.message);
    }
}

function blogCarregarLista() {
    if (blogUnsub) blogUnsub();
    blogUnsub = dbFirestore.collection('noticiasAlunos').orderBy('ordem', 'desc').onSnapshot(function(snap) {
        blogLista = [];
        snap.forEach(function(d) {
            var x = d.data();
            x.id = d.id;
            blogLista.push(x);
        });
        blogRenderLista();
    }, function() {
        document.getElementById('blog-lista').innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px">Erro ao carregar posts.</div>';
    });
}

function blogRenderLista() {
    var container = document.getElementById('blog-lista');
    if (!container) return;
    if (!blogLista.length) {
        container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:12px"><i class="fa-solid fa-newspaper" style="font-size:24px;display:block;margin-bottom:8px;color:#cbd5e1"></i>Nenhum post criado ainda.</div>';
        return;
    }
    var layoutIcons = { hero: 'fa-panorama', lateral: 'fa-table-columns', 'lateral-invertido': 'fa-table-columns', '2colunas': 'fa-columns', '3colunas': 'fa-grip', texto: 'fa-align-left', compacto: 'fa-square' };
    var layoutNomes = { hero: 'Hero', lateral: 'Lateral', 'lateral-invertido': 'Lat.Invert.', '2colunas': '2 Colunas', '3colunas': '3 Colunas', texto: 'Texto', compacto: 'Compacto' };
    container.innerHTML = blogLista.map(function(n) {
        var dateStr = n.data ? new Date(n.data).toLocaleDateString('pt-BR') : '';
        var thumb = n.imagem ? '<img src="' + n.imagem + '" style="width:56px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0">' : '<div style="width:56px;height:40px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8"><i class="fa-solid fa-image"></i></div>';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;background:#fff">' +
            thumb +
            '<div style="flex:1;min-width:0">' +
                '<div style="font-size:12px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (n.titulo || 'Sem titulo') + '</div>' +
                '<div style="display:flex;gap:6px;align-items:center;margin-top:2px">' +
                    '<span style="font-size:10px;color:#94a3b8">' + dateStr + '</span>' +
                    '<span style="font-size:9px;padding:1px 5px;background:#f1f5f9;border-radius:4px;color:#64748b"><i class="fa-solid ' + (layoutIcons[n.layout] || 'fa-square') + '" style="margin-right:2px"></i>' + (layoutNomes[n.layout] || n.layout) + '</span>' +
                    (n.destaque ? '<span style="font-size:9px;padding:1px 5px;background:#fef3c7;border-radius:4px;color:#92400e">Destaque</span>' : '') +
                    (n.ativo === false ? '<span style="font-size:9px;padding:1px 5px;background:#fee2e2;border-radius:4px;color:#991b1b">Rascunho</span>' : '') +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px">' +
                '<button class="btn-icon" title="Editar" onclick="blogEditar(\'' + n.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn-icon btn-danger-icon" title="Excluir" onclick="blogExcluir(\'' + n.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div></div>';
    }).join('');
}

function blogEditar(id) {
    var post = blogLista.find(function(n) { return n.id === id; });
    if (!post) return;
    document.getElementById('blog-edit-id').value = id;
    document.getElementById('blog-titulo').value = post.titulo || '';
    document.getElementById('blog-subtitulo').value = post.subtitulo || '';
    document.getElementById('blog-conteudo').value = post.texto || '';
    document.getElementById('blog-layout').value = post.layout || 'hero';
    document.getElementById('blog-categoria').value = post.categoria || '';
    document.getElementById('blog-destaque').checked = !!post.destaque;
    document.getElementById('blog-ativo').checked = post.ativo !== false;
    document.getElementById('blog-form-titulo').textContent = 'Editando Post';
    if (post.imagem) {
        document.getElementById('blog-imagem-preview').innerHTML = '<img src="' + post.imagem + '" style="max-width:100%;max-height:150px;border-radius:8px;border:1px solid #e2e8f0">';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function blogExcluir(id) {
    if (!confirm('Excluir este post permanentemente?')) return;
    try {
        await dbFirestore.collection('noticiasAlunos').doc(id).delete();
        alert('Post excluido!');
        blogCarregarLista();
    } catch (e) { alert('Erro ao excluir: ' + e.message); }
}

/* ===== GALERIA - ALBUNS (ADMIN) ===== */
var galeriaAlbumPendentes = [];

function galeriaAdminVisivel() {
    var s = document.getElementById('admin-galeria');
    return s && s.style.display !== 'none';
}

function galeriaAdminProjetosUnicos(lista) {
    var nomes = [];
    lista.forEach(function(n) {
        n = (n || '').trim();
        if (n && nomes.indexOf(n) === -1) nomes.push(n);
    });
    return nomes.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });
}

function galeriaAdminCarregarProjetos() {
    var selects = ['galeria-selecao-projeto', 'galeria-album-projeto'];
    selects.forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var atual = sel.value;
        var fontes = [];
        projetos.forEach(function(p) { fontes.push(p.nome); });
        turmas.forEach(function(t) { fontes.push(t.projeto); });
        function aplicar() {
            var nomes = galeriaAdminProjetosUnicos(fontes);
            var placeholder = id === 'galeria-selecao-projeto' ? 'Filtrar por projeto...' : 'Projeto...';
            sel.innerHTML = '<option value="">' + placeholder + '</option>';
            nomes.forEach(function(n) {
                sel.innerHTML += '<option value="' + n + '">' + n + '</option>';
            });
            if (atual) sel.value = atual;
        }
        dbFirestore.collection('candidatos').get().then(function(snap) {
            snap.forEach(function(doc) { fontes.push(doc.data().projeto); });
            aplicar();
        }).catch(function() { aplicar(); });
    });
}

function galeriaAdminCarregarTurmas() {
    var selects = ['galeria-selecao-turma', 'galeria-album-turma'];
    selects.forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var atual = sel.value;
        var fontes = [];
        turmas.forEach(function(t) { fontes.push(t.nome); });
        function aplicar() {
            var nomes = galeriaAdminProjetosUnicos(fontes);
            var placeholder = id === 'galeria-selecao-turma' ? 'Filtrar por turma...' : 'Turma...';
            sel.innerHTML = '<option value="">' + placeholder + '</option>';
            nomes.forEach(function(n) {
                sel.innerHTML += '<option value="' + n + '">' + n + '</option>';
            });
            if (atual) sel.value = atual;
        }
        dbFirestore.collection('candidatos').get().then(function(snap) {
            snap.forEach(function(doc) { fontes.push(doc.data().turma); });
            aplicar();
        }).catch(function() { aplicar(); });
    });
}

function galeriaAdminInicializar() {
    galeriaAlbumPendentes = [];
    galeriaAdminCarregarProjetos();
    galeriaAdminCarregarTurmas();
    galeriaAdminCarregar();
}

function galeriaAlbumFiltrarTurmas() {
    var selProj = document.getElementById('galeria-album-projeto');
    var selTurma = document.getElementById('galeria-album-turma');
    if (!selProj || !selTurma) return;
    var projetoNome = selProj.value;
    var atual = selTurma.value;
    selTurma.innerHTML = '<option value="">Turma...</option>';
    var fontes = [];
    if (projetoNome) {
        turmas.filter(function(t) { return t.projeto === projetoNome; }).forEach(function(t) { fontes.push(t.nome); });
    } else {
        turmas.forEach(function(t) { fontes.push(t.nome); });
    }
    var nomes = galeriaAdminProjetosUnicos(fontes);
    nomes.forEach(function(n) {
        selTurma.innerHTML += '<option value="' + n + '">' + n + '</option>';
    });
    if (atual) selTurma.value = atual;
}

function galeriaAbrirModalAlbum() {
    galeriaAlbumPendentes = [];
    document.getElementById('galeria-album-edit-id').value = '';
    document.getElementById('galeria-modal-titulo').textContent = 'Criar Album';
    document.getElementById('galeria-album-btn-texto').textContent = 'Salvar Album';
    document.getElementById('galeria-album-btn-fotos').style.display = '';
    document.getElementById('galeria-album-nome').value = '';
    document.getElementById('galeria-album-data-evento').value = '';
    document.getElementById('galeria-album-thumbs').innerHTML = '';
    document.getElementById('galeria-album-files').value = '';
    document.querySelectorAll('.galeria-album-portal').forEach(function(cb) { cb.checked = true; });
    galeriaAdminCarregarProjetos();
    galeriaAdminCarregarTurmas();
    document.getElementById('galeria-modal-album').style.display = 'block';
}

function galeriaAbrirEditarAlbum(albumId) {
    dbFirestore.collection('galeriaAlbums').doc(albumId).get().then(function(doc) {
        if (!doc.exists) { alert('Album nao encontrado.'); return; }
        var a = doc.data();
        galeriaAlbumPendentes = [];
        document.getElementById('galeria-album-edit-id').value = albumId;
        document.getElementById('galeria-modal-titulo').textContent = 'Editar Album';
        document.getElementById('galeria-album-btn-texto').textContent = 'Salvar Alteracoes';
        document.getElementById('galeria-album-btn-fotos').style.display = 'none';
        document.getElementById('galeria-album-nome').value = a.nome || '';
        document.getElementById('galeria-album-data-evento').value = a.dataEvento || '';
        document.getElementById('galeria-album-thumbs').innerHTML = '<span style="font-size:11px;color:#64748b">Fotos existentes mantidas. Adicione novas fotos se desejar.</span>';
        document.getElementById('galeria-album-files').value = '';
        var portais = a.portais || ['aluno', 'formado', 'docente', 'coordenacao'];
        document.querySelectorAll('.galeria-album-portal').forEach(function(cb) { cb.checked = portais.indexOf(cb.value) !== -1; });
        galeriaAdminCarregarProjetos();
        setTimeout(function() {
            document.getElementById('galeria-album-projeto').value = a.projeto || '';
            galeriaAlbumFiltrarTurmas();
            setTimeout(function() {
                document.getElementById('galeria-album-turma').value = a.turma || '';
            }, 200);
        }, 300);
        document.getElementById('galeria-modal-album').style.display = 'block';
    });
}

function galeriaFecharModalAlbum() {
    document.getElementById('galeria-modal-album').style.display = 'none';
    galeriaAlbumPendentes = [];
}

function galeriaAlbumSelecionarImagens(input) {
    var thumbs = document.getElementById('galeria-album-thumbs');
    if (thumbs) thumbs.innerHTML = '';
    galeriaAlbumPendentes = [];
    if (!input || !input.files || !input.files.length) return;
    Array.prototype.forEach.call(input.files, function(file) {
        noticiasCompressImage(file).then(function(dataUrl) {
            galeriaAlbumPendentes.push(dataUrl);
            if (thumbs) {
                var img = document.createElement('img');
                img.src = dataUrl;
                img.style.cssText = 'width:80px;height:60px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0';
                thumbs.appendChild(img);
            }
        });
    });
}

async function galeriaAlbumSalvar() {
    var editId = document.getElementById('galeria-album-edit-id').value;
    var nome = document.getElementById('galeria-album-nome').value.trim();
    var dataEvento = document.getElementById('galeria-album-data-evento').value;
    var projeto = document.getElementById('galeria-album-projeto').value;
    var turma = document.getElementById('galeria-album-turma').value;
    var portais = [];
    document.querySelectorAll('.galeria-album-portal:checked').forEach(function(cb) { portais.push(cb.value); });
    if (!nome) { alert('Digite o nome do album.'); return; }
    if (!projeto || !turma) { alert('Selecione projeto e turma.'); return; }
    if (!portais.length) { alert('Selecione pelo menos um portal.'); return; }
    try {
        var albumRef;
        if (editId) {
            albumRef = dbFirestore.collection('galeriaAlbums').doc(editId);
            var dadosUpdate = { nome: nome, dataEvento: dataEvento, projeto: projeto, turma: turma, portais: portais };
            if (galeriaAlbumPendentes.length) {
                var batch = dbFirestore.batch();
                galeriaAlbumPendentes.forEach(function(dataUrl) {
                    batch.set(albumRef.collection('fotos').doc(), { url: dataUrl, data: firebase.firestore.FieldValue.serverTimestamp() });
                });
                await batch.commit();
                var snapFotos = await albumRef.collection('fotos').orderBy('data', 'asc').limit(1).get();
                if (!snapFotos.empty) { dadosUpdate.capa = snapFotos.docs[0].data().url; }
                var snapTotal = await albumRef.collection('fotos').get();
                dadosUpdate.totalFotos = snapTotal.size;
            }
            await albumRef.update(dadosUpdate);
            alert('Album atualizado!');
        } else {
            if (!galeriaAlbumPendentes.length) { alert('Adicione pelo menos uma foto.'); return; }
            albumRef = dbFirestore.collection('galeriaAlbums').doc();
            await albumRef.set({
                nome: nome, dataEvento: dataEvento, projeto: projeto, turma: turma, portais: portais,
                capa: galeriaAlbumPendentes[0], totalFotos: galeriaAlbumPendentes.length,
                data: firebase.firestore.FieldValue.serverTimestamp(),
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            var batch2 = dbFirestore.batch();
            galeriaAlbumPendentes.forEach(function(dataUrl) {
                batch2.set(albumRef.collection('fotos').doc(), { url: dataUrl, data: firebase.firestore.FieldValue.serverTimestamp() });
            });
            await batch2.commit();
            alert('Album criado com sucesso!');
        }
        galeriaFecharModalAlbum();
        galeriaAdminCarregar();
    } catch (e) {
        console.error('Erro ao salvar album:', e);
        alert('Erro ao salvar album: ' + e.message);
    }
}

function galeriaAdminCarregar() {
    var container = document.getElementById('galeria-lista-albuns');
    if (!container) return;
    var projeto = document.getElementById('galeria-selecao-projeto').value;
    var turma = document.getElementById('galeria-selecao-turma').value;
    container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;grid-column:1/-1"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>';
    dbFirestore.collection('galeriaAlbums').orderBy('data', 'desc').get().then(function(snap) {
        var arr = [];
        snap.forEach(function(doc) {
            var a = doc.data();
            a.id = doc.id;
            if (projeto && a.projeto && a.projeto !== projeto) return;
            if (turma && a.turma && a.turma !== turma) return;
            arr.push(a);
        });
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;grid-column:1/-1">Nenhum album encontrado.</div>';
            return;
        }
        container.innerHTML = '';
        var promises = arr.map(function(a) {
            if (a.capa) return Promise.resolve(a);
            return dbFirestore.collection('galeriaAlbums').doc(a.id).collection('fotos').orderBy('data', 'asc').limit(1).get().then(function(snap) {
                if (!snap.empty) { a.capa = snap.docs[0].data().url; }
                return a;
            }).catch(function() { return a; });
        });
        Promise.all(promises).then(function(results) {
            container.innerHTML = '';
            results.forEach(function(a) {
                var dateStr = a.dataEvento || (a.data ? new Date(a.data.seconds ? a.data.seconds * 1000 : a.data).toLocaleDateString('pt-BR') : '');
                var portais = a.portais || [];
                var portalIcons = { aluno: '🎓', formado: '🏆', docente: '📚', coordenacao: '📋' };
                var portaisHtml = portais.map(function(p) { return '<span style="font-size:10px;background:#e2e8f0;border-radius:4px;padding:2px 5px">' + (portalIcons[p] || '') + ' ' + p + '</span>'; }).join(' ');
                var capaHtml = a.capa
                    ? '<img src="' + a.capa + '" style="width:100%;height:140px;object-fit:cover;display:block">'
                    : '<div style="background:linear-gradient(135deg,#2563eb,#16a34a);padding:20px;text-align:center;color:#fff;height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center"><i class="fa-solid fa-images" style="font-size:28px;margin-bottom:8px"></i><div style="font-size:11px;opacity:.8">' + (a.totalFotos || 0) + ' fotos</div></div>';
                var card = document.createElement('div');
                card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;transition:.2s';
                card.onmouseover = function() { card.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'; };
                card.onmouseout = function() { card.style.boxShadow = 'none'; };
                card.innerHTML =
                    capaHtml +
                    '<div style="padding:12px">' +
                        '<div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px">' + a.nome + '</div>' +
                        '<div style="font-size:11px;color:#64748b">' + a.projeto + ' - ' + a.turma + '</div>' +
                        (dateStr ? '<div style="font-size:10px;color:#2563eb;margin-top:2px"><i class="fa-solid fa-calendar-days"></i> ' + dateStr + '</div>' : '') +
                        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' + portaisHtml + '</div>' +
                        '<div style="display:flex;gap:6px;margin-top:10px">' +
                            '<button onclick="galeriaAbrirEditarAlbum(\'' + a.id + '\')" style="flex:1;padding:6px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;cursor:pointer"><i class="fa-solid fa-pen"></i> Editar</button>' +
                            '<button onclick="galeriaAdminExcluirAlbum(\'' + a.id + '\')" style="flex:1;padding:6px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:11px;cursor:pointer"><i class="fa-solid fa-trash"></i> Excluir</button>' +
                        '</div>' +
                    '</div>';
                container.appendChild(card);
            });
        });
    }).catch(function() {
        container.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px;font-size:13px;grid-column:1/-1">Erro ao carregar albuns.</div>';
    });
}

function galeriaAdminExcluirAlbum(id) {
    if (!confirm('Excluir este album e todas as suas fotos?')) return;
    var fotosRef = dbFirestore.collection('galeriaAlbums').doc(id).collection('fotos');
    fotosRef.get().then(function(snap) {
        var batch = dbFirestore.batch();
        snap.forEach(function(doc) { batch.delete(doc.ref); });
        return batch.commit();
    }).then(function() {
        return dbFirestore.collection('galeriaAlbums').doc(id).delete();
    }).then(function() {
        galeriaAdminCarregar();
    });
}

/* ===== ATELIE - LOJA DE VENDAS ===== */
var atelieProdutos = [];
var atelieProdutosUnsub = null;
var atelieProdutoEditando = null;

function atelieProdutoMsg(texto, tipo) {
    var el = document.getElementById('atelie-produto-msg');
    if (!el) return;
    el.textContent = texto;
    el.style.display = 'block';
    el.style.background = tipo === 'ok' ? 'rgba(76,175,80,.15)' : 'rgba(244,67,54,.15)';
    el.style.border = '1px solid ' + (tipo === 'ok' ? 'rgba(76,175,80,.3)' : 'rgba(244,67,54,.3)');
    el.style.color = tipo === 'ok' ? '#4caf50' : '#f44336';
}

function atelieProdutosCarregar() {
    if (atelieProdutosUnsub) { atelieProdutosUnsub(); atelieProdutosUnsub = null; }
    var container = document.getElementById('atelie-produtos-lista');
    if (!container) return;
    atelieProdutosUnsub = dbFirestore.collection('atelieProdutos').orderBy('criadoEm', 'desc').onSnapshot(function(snap) {
        atelieProdutos = [];
        snap.forEach(function(doc) {
            var p = doc.data();
            p._id = doc.id;
            atelieProdutos.push(p);
        });
        atelieProdutosRender();
    }, function(e) {
        console.error('Erro ao carregar produtos do Atelie:', e);
        container.innerHTML = '<div class="empty-state" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-triangle-exclamation" style="font-size:30px;color:#dc2626"></i><p style="color:#64748b;margin-top:10px">Erro ao carregar produtos.</p></div>';
    });
}

function atelieProdutosRender() {
    var container = document.getElementById('atelie-produtos-lista');
    if (!container) return;
    if (atelieProdutos.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-bag-shopping" style="font-size:34px;color:#dc2626"></i><h4 style="color:#1e293b;font-size:16px;font-weight:800;margin:10px 0 6px">Nenhum produto cadastrado</h4><p style="color:#64748b;font-size:13px;margin:0">Clique em "Novo Produto" para adicionar o primeiro item a sua vitrine.</p></div>';
        return;
    }
    container.innerHTML = '';
    atelieProdutos.forEach(function(p) {
        container.appendChild(atelieProdutoCard(p));
    });
}

function atelieProdutoCard(p) {
    var card = document.createElement('div');
    card.style.cssText = 'display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin-bottom:10px;flex-wrap:wrap';
    var img = p.imagem ? '<div style="width:54px;height:54px;border-radius:10px;overflow:hidden;background:#f1f5f9;flex-shrink:0;display:flex;align-items:center;justify-content:center"><img src="' + p.imagem + '" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display=\'none\'"><i class="fa-solid fa-image" style="color:#cbd5e1;font-size:18px"></i></div>' : '<div style="width:54px;height:54px;border-radius:10px;background:rgba(220,38,38,.06);flex-shrink:0;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-bag-shopping" style="color:#dc2626;font-size:20px"></i></div>';
    var ativoTag = p.ativo === false
        ? '<span style="background:rgba(244,67,54,.12);color:#f44336;font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600">Inativo</span>'
        : '<span style="background:rgba(76,175,80,.12);color:#16a34a;font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600">Ativo</span>';
    var categoria = p.categoria ? '<span style="background:rgba(100,116,139,.1);color:#475569;font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600">' + escHTML(p.categoria) + '</span>' : '';
    var preco = p.preco ? '<span style="font-size:13px;font-weight:700;color:#16a34a">' + escHTML(p.preco) + '</span>' : '';
    var linkHost = '';
    try { if (p.link) linkHost = new URL(p.link).hostname.replace('www.', ''); } catch(e) {}
    card.innerHTML =
        img +
        '<div style="flex:1;min-width:200px">' +
            '<div style="font-size:14px;font-weight:700;color:#1e293b;word-break:break-word">' + escHTML(p.titulo || 'Sem titulo') + '</div>' +
            '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + ativoTag + categoria + preco + '</div>' +
            '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + (linkHost ? '<i class="fa-solid fa-link"></i> ' + escHTML(linkHost) + (p.link.indexOf('mercadolivre.com') !== -1 ? ' - link do Mercado Livre' : '') : 'sem link') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
            '<button title="Ativar/Inativar" style="background:' + (p.ativo === false ? 'rgba(76,175,80,.15)' : 'rgba(100,116,139,.12)') + ';border:1px solid ' + (p.ativo === false ? 'rgba(76,175,80,.3)' : 'rgba(100,116,139,.25)') + ';color:' + (p.ativo === false ? '#16a34a' : '#64748b') + ';width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:13px" onclick="atelieProdutoToggleAtivo(\'' + p._id + '\')"><i class="fa-solid fa-' + (p.ativo === false ? 'eye' : 'eye-slash') + '"></i></button>' +
            '<button title="Editar" style="background:rgba(37,99,235,.12);border:1px solid rgba(37,99,235,.25);color:#2563eb;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:13px" onclick="atelieProdutoAbrirModal(\'' + p._id + '\')"><i class="fa-solid fa-pen"></i></button>' +
            '<button title="Excluir" style="background:rgba(244,67,54,.12);border:1px solid rgba(244,67,54,.25);color:#f44336;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:13px" onclick="atelieProdutoExcluir(\'' + p._id + '\')"><i class="fa-solid fa-trash"></i></button>' +
        '</div>';
    return card;
}

function atelieProdutoAbrirModal(id) {
    atelieProdutoEditando = null;
    document.getElementById('atelie-produto-modal-titulo').textContent = 'Novo Produto';
    document.getElementById('atelie-produto-titulo').value = '';
    document.getElementById('atelie-produto-preco').value = '';
    document.getElementById('atelie-produto-categoria').value = '';
    document.getElementById('atelie-produto-link').value = '';
    document.getElementById('atelie-produto-imagem').value = '';
    document.getElementById('atelie-produto-descricao').value = '';
    var prev = document.getElementById('atelie-produto-img-preview');
    if (prev) { prev.style.display = 'none'; prev.src = ''; }
    var msg = document.getElementById('atelie-produto-msg');
    if (msg) msg.style.display = 'none';
    if (id) {
        var p = atelieProdutos.find(function(x) { return x._id === id; });
        if (p) {
            atelieProdutoEditando = id;
            document.getElementById('atelie-produto-modal-titulo').textContent = 'Editar Produto';
            document.getElementById('atelie-produto-titulo').value = p.titulo || '';
            document.getElementById('atelie-produto-preco').value = p.preco || '';
            document.getElementById('atelie-produto-categoria').value = p.categoria || '';
            document.getElementById('atelie-produto-link').value = p.link || '';
            document.getElementById('atelie-produto-imagem').value = p.imagem || '';
            document.getElementById('atelie-produto-descricao').value = p.descricao || '';
            atelieProdutoImgPreview();
        }
    }
    document.getElementById('atelie-produto-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Salvar Produto';
    document.getElementById('modal-atelie-produto-overlay').classList.remove('hidden');
}

function atelieProdutoFecharModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-atelie-produto-overlay').classList.add('hidden');
}

function atelieProdutoLinkPreview() {
    var link = document.getElementById('atelie-produto-link').value;
    if (link && link.indexOf('mercadolivre.com') !== -1) {
        atelieProdutoMsg('Link do Mercado Livre identificado. Lembre-se: use o link de afiliado gerado no portal para receber comissao.', 'ok');
    } else if (link) {
        atelieProdutoMsg('Atencao: o link nao parece ser do Mercado Livre. Cole o link de afiliado gerado no portal do ML.', 'err');
    } else {
        var msg = document.getElementById('atelie-produto-msg');
        if (msg) msg.style.display = 'none';
    }
}

function atelieProdutoImgPreview() {
    var url = document.getElementById('atelie-produto-imagem').value;
    var prev = document.getElementById('atelie-produto-img-preview');
    if (!prev) return;
    if (url) { prev.src = url; prev.style.display = 'block'; }
    else { prev.style.display = 'none'; prev.src = ''; }
}

async function atelieProdutoSalvar(event) {
    if (event) event.preventDefault();
    var titulo = document.getElementById('atelie-produto-titulo').value.trim();
    var link = document.getElementById('atelie-produto-link').value.trim();
    if (!titulo || !link) { atelieProdutoMsg('Preencha o titulo e o link do produto.', 'err'); return; }
    var dados = {
        titulo: titulo,
        preco: document.getElementById('atelie-produto-preco').value.trim(),
        categoria: document.getElementById('atelie-produto-categoria').value.trim(),
        link: link,
        imagem: document.getElementById('atelie-produto-imagem').value.trim(),
        descricao: document.getElementById('atelie-produto-descricao').value.trim()
    };
    var btn = document.getElementById('atelie-produto-save-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    try {
        if (atelieProdutoEditando) {
            dados.ativo = true;
            await dbFirestore.collection('atelieProdutos').doc(atelieProdutoEditando).update(dados);
            atelieProdutoMsg('Produto atualizado com sucesso!', 'ok');
        } else {
            dados.ativo = true;
            dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
            dados.criadoPor = currentUserData ? (currentUserData.nome || '') : '';
            await dbFirestore.collection('atelieProdutos').add(dados);
            atelieProdutoMsg('Produto adicionado com sucesso!', 'ok');
        }
        setTimeout(function() {
            atelieProdutoFecharModal();
        }, 900);
    } catch(e) {
        console.error('Erro ao salvar produto:', e);
        atelieProdutoMsg('Erro: ' + e.message, 'err');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar Produto';
}

function atelieProdutoToggleAtivo(id) {
    var p = atelieProdutos.find(function(x) { return x._id === id; });
    if (!p) return;
    var novo = p.ativo === false;
    dbFirestore.collection('atelieProdutos').doc(id).update({ ativo: novo }).catch(function(e) {
        console.error('Erro ao alternar visibilidade:', e);
    });
}

function atelieProdutoExcluir(id) {
    if (!confirm('Excluir este produto da vitrine?')) return;
    dbFirestore.collection('atelieProdutos').doc(id).delete().then(function() {
    }).catch(function(e) {
        console.error('Erro ao excluir produto:', e);
        alert('Erro ao excluir produto.');
    });
}

function atelieLojaAbrirPreview() {
    window.open('atelie.html', '_blank', 'noopener');
}

function escHTML(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ===== CONSTRUTOR DE AVALIACOES (ADMIN) ===== */
const FB_AVALIACOES = 'avaliacoes';
const FB_AVALIACOES_RESPOSTAS = 'avaliacoesRespostas';
let cavEditingId = null;
let cavQuestaoSeq = 0;
let cavNomeAula = {};
let cavNomeAtual = '';
let cavQMax = 20;
let cavAulasOptions = [];
let cavAulasFiltro = '';
let cavTipo = 'teorica';

// retorna o campo da aula que identifica o tipo de avaliacao (avTeorica/avPratica)
function cavCampoAV(tipo) {
    return (tipo === 'pratica') ? 'avPratica' : 'avTeorica';
}
// retorna o rotulo do tipo para mensagens/exibicao
function cavRotuloAV(tipo) {
    return (tipo === 'pratica') ? 'Prática' : 'Teórica';
}
// atualiza os rotulos do formulario conforme o tipo atual
function cavAplicarRotuloTipo() {
    const tipo = cavTipo;
    const rotulo = cavRotuloAV(tipo);
    const rotuloCampo = (tipo === 'pratica') ? 'Prática' : 'Teórica';
    const label = document.getElementById('cav-nome-label');
    if (label) label.textContent = 'Nome da Avaliação (selecione a aula com AV ' + rotuloCampo + ')';
    const busca = document.getElementById('cav-aula-busca');
    if (busca) busca.placeholder = 'Selecione a turma para buscar as aulas com AV ' + rotuloCampo + '...';
    const novoBtn = document.getElementById('cav-nova-btn');
    if (novoBtn) novoBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Nova AV ' + rotuloCampo;
    void rotulo;
}

function cavLoadList() {
    const container = document.getElementById('cav-list');
    if (!container) return;
    container.innerHTML = '<div class="empty-state" style="text-align:center;padding:20px"><p style="color:#64748b">Carregando avaliações...</p></div>';
    dbFirestore.collection(FB_AVALIACOES).orderBy('criadoEm', 'desc').get().then(snap => {
        if (snap.empty) {
            container.innerHTML = '<div class="empty-state" style="text-align:center;padding:30px"><p style="color:#64748b;margin-bottom:12px">Nenhuma avaliação criada ainda.</p>' +
                '<button class="btn-primary btn-sm" onclick="cavNovaAvaliacao()"><i class="fa-solid fa-plus"></i> Criar primeira avaliação</button></div>';
            return;
        }
        const avs = [];
        snap.forEach(doc => avs.push({ id: doc.id, d: doc.data() }));
        return Promise.all([
            dbFirestore.collection(FB_AVALIACOES_RESPOSTAS).get().catch(() => null),
            dbFirestore.collection('avaliacoesAlunos').get().catch(() => null)
        ]).then(([rSnap, aSnap]) => {
            return { avs: avs, respostas: rSnap, avaliacoesAlunos: aSnap };
        });
    }).then(({ avs, respostas, avaliacoesAlunos }) => {
        container.innerHTML = '';
        const contagem = {};
        const rotulos = {};
        if (respostas) {
            respostas.forEach(rDoc => {
                const avId = (rDoc.data() || {}).avaliacaoId;
                if (!avId) return;
                contagem[avId] = (contagem[avId] || 0) + 1;
            });
        }
        if (avaliacoesAlunos) {
            avaliacoesAlunos.forEach(fDoc => {
                const f = fDoc.data() || {};
                const man = f.avPraticaManual || {};
                Object.keys(man).forEach(avId => {
                    contagem[avId] = (contagem[avId] || 0) + 1;
                    rotulos[avId] = 'Prática (docente)';
                });
            });
        }
        avs.forEach(({ id, d }) => {
            const qtd = (d.questoes || []).length;
            const respondidas = contagem[id] || 0;
            let cor, rotuloEstado;
            if (respondidas > 0) { cor = '#16a34a'; rotuloEstado = 'Respondida :: ' + respondidas + (rotulos[id] ? ' (' + rotulos[id] + ')' : ' aluno(s)'); }
            else if (d.enviada) { cor = '#f59e0b'; rotuloEstado = 'Aguardando respostas'; }
            else { cor = '#2563eb'; rotuloEstado = 'Ainda não enviada'; }
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f8fafc;border:2px solid ' + cor + ';border-radius:12px;margin-bottom:10px;flex-wrap:wrap;box-shadow:0 1px 3px rgba(15,23,42,.04)';
            const envBadge = ' <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(22,163,74,.0);color:' + cor + ';border:1px solid ' + cor + '">' + rotuloEstado + '</span>';
            card.innerHTML =
                '<div style="width:44px;height:44px;background:rgba(37,99,235,.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + cor + '"><i class="fa-solid fa-' + (respondidas > 0 ? 'check-double' : (d.enviada ? 'paper-plane' : 'file-lines')) + '" style="color:#fff;font-size:18px"></i></div>' +
                '<div style="flex:1;min-width:170px">' +
                    '<div style="font-size:14px;font-weight:700;color:#0f172a">' + escHTML(d.nome || 'Sem nome') + envBadge + '</div>' +
                    '<div style="font-size:11.5px;color:#64748b;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">' +
                        (d.projeto ? '<span><i class="fa-solid fa-folder-open" style="margin-right:3px"></i>' + escHTML(d.projeto) + '</span>' : '') +
                        (d.turma ? '<span><i class="fa-solid fa-users" style="margin-right:3px"></i>' + escHTML(d.turma) + '</span>' : '') +
                        (d.disciplina ? '<span><i class="fa-solid fa-book" style="margin-right:3px"></i>' + escHTML(d.disciplina) + '</span>' : '') +
                        '<span><i class="fa-solid fa-list-check" style="margin-right:3px"></i>' + qtd + ' questões</span>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">' +
                    '<button class="btn-outline btn-sm" title="Editar" onclick="cavEditarAvaliacao(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>' +
                    '<button class="btn-outline btn-sm" title="Imprimir" onclick="cavImprimirPorId(\'' + id + '\')"><i class="fa-solid fa-print"></i></button>' +
                    '<button class="btn-warning btn-sm" title="Enviar" onclick="cavAbrirEnvioPorId(\'' + id + '\')"><i class="fa-solid fa-paper-plane"></i> Enviar</button>' +
                    '<button class="btn-primary btn-sm" title="Listar avaliados" onclick="cavListarAvaliados(\'' + id + '\')"><i class="fa-solid fa-users"></i> Listar Avaliados</button>' +
                    '<button class="btn-danger btn-sm" title="Excluir" onclick="cavExcluirPorId(\'' + id + '\')"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
            container.appendChild(card);
        });
    }).catch(() => {
        container.innerHTML = '<div class="empty-state" style="text-align:center;padding:20px"><p style="color:#dc2626">Erro ao carregar avaliações.</p></div>';
    });
}

function cavAbrirEnvioPorId(id) {
    cavEditingId = id;
    cavAbrirEnvio();
}

function cavNovaAvaliacao() {
    cavEditingId = null;
    cavNomeAula = {};
    cavNomeAtual = '';
    document.getElementById('cav-nome').innerHTML = '<option value="">Selecione primeiro a turma...</option>';
    const busca = document.getElementById('cav-aula-busca');
    if (busca) busca.value = '';
    document.getElementById('cav-projeto').innerHTML = '<option value="">Selecione o projeto...</option>';
    document.getElementById('cav-turma').innerHTML = '<option value="">Selecione a turma...</option>';
    document.getElementById('cav-docente').innerHTML = '<option value="">Selecione o docente...</option>';
    document.getElementById('cav-questoes').innerHTML = '';
    document.getElementById('cav-gabarito').style.display = 'none';
    document.getElementById('cav-editing-badge').style.display = 'none';
    document.getElementById('cav-editing-badge').innerHTML = '';
    document.getElementById('cav-form-titulo').textContent = 'Nova AV ' + cavRotuloAV(cavTipo);
    cavAplicarRotuloTipo();
    document.getElementById('cav-form').style.display = 'block';
    document.getElementById('cav-add-q-btn').style.display = 'inline-flex';
    cavQMax = 20;
    const limiteSel = document.getElementById('cav-q-limite');
    if (limiteSel) limiteSel.value = '20';
    const qMaxEl = document.getElementById('cav-q-max');
    if (qMaxEl) qMaxEl.textContent = cavQMax;
    cavAtualizarQCount();
    cavPopulateProjetos();
    cavPopulateDocentes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cavMudarLimite(n) {
    cavQMax = ([4, 6, 8, 10, 20].indexOf(n) !== -1) ? n : 20;
    const qMaxEl = document.getElementById('cav-q-max');
    if (qMaxEl) qMaxEl.textContent = cavQMax;
    // remove questoes excedentes
    const wrap = document.getElementById('cav-questoes');
    if (wrap) {
        const extras = wrap.querySelectorAll('.cav-q');
        for (let i = extras.length - 1; i >= cavQMax; i--) {
            if (extras[i]) extras[i].remove();
        }
    }
    cavAtualizarQCount();
}

function cavAtualizarQCount() {
    const count = document.querySelectorAll('#cav-questoes .cav-q').length;
    const el = document.getElementById('cav-q-count');
    if (el) el.textContent = count;
    const addBtn = document.getElementById('cav-add-q-btn');
    if (addBtn) addBtn.style.display = count >= cavQMax ? 'none' : 'inline-flex';
}

function cavPopulateProjetos(value) {
    const sel = document.getElementById('cav-projeto');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o projeto...</option>';
    // Exibe apenas projetos em andamento que possuam turmas cadastradas
    (projetos || []).forEach(p => {
        if ((p.status || 'Em Andamento') !== 'Em Andamento') return;
        const temTurma = (turmas || []).some(t => t.projeto === p.nome);
        if (!temTurma) return;
        const opt = document.createElement('option');
        opt.value = p.nome || '';
        opt.textContent = (p.nome || '') + (p.responsavel ? ' - ' + p.responsavel : '');
        sel.appendChild(opt);
    });
    if (value) sel.value = value;
}

function cavPopulateTurmas(projetoNome, value) {
    const sel = document.getElementById('cav-turma');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a turma...</option>';
    (turmas || []).filter(t => !projetoNome || t.projeto === projetoNome).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.nome || '';
        opt.textContent = (t.nome || '');
        sel.appendChild(opt);
    });
    if (value) sel.value = value;
}

function cavOnProjetoChange() {
    const proj = document.getElementById('cav-projeto').value;
    cavPopulateTurmas(proj, '');
    document.getElementById('cav-nome').innerHTML = '<option value="">Selecione primeiro a turma...</option>';
    const busca = document.getElementById('cav-aula-busca');
    if (busca) { busca.value = ''; busca.disabled = true; }
    cavNomeAula = {};
}

function cavOnTurmaChange() {
    const proj = document.getElementById('cav-projeto').value;
    const turma = document.getElementById('cav-turma').value;
    document.getElementById('cav-nome').innerHTML = '<option value="">Carregando aulas...</option>';
    const busca = document.getElementById('cav-aula-busca');
    if (busca) { busca.value = ''; busca.disabled = !turma; }
    cavNomeAula = {};
    cavLoadAulasNome(proj, turma);
}

// lista de aulas com AV Teorica 'Sim' da turma selecionada para preencher o nome da avaliacao
function cavLoadAulasNome(proj, turma, nomeAlvo) {
    const sel = document.getElementById('cav-nome');
    if (!sel) return;
    cavNomeAula = {};
    cavAulasOptions = [];
    cavAulasFiltro = '';
    sel.innerHTML = '<option value="">Carregando...</option>';
    const campoAV = cavCampoAV(cavTipo);
    dbFirestore.collection('aulas').get().then(snap => {
        sel.innerHTML = '<option value="">Selecione a avaliação...</option>';
        const adicionadas = {};
        snap.forEach(doc => {
            const d = doc.data();
            if (d[campoAV] !== 'Sim') return;
            const dProj = (proj || '').trim();
            const dTurma = (turma || '').trim();
            if (String(d.projeto || '').trim() !== dProj) return;
            if (String(d.turma || '').trim() !== dTurma) return;
            const nomeAula = (d.conteudo || d.disciplina || doc.id);
            const chave = nomeAula;
            // evita duplicar a mesma aula caso haja registros repetidos
            if (adicionadas[String(d.disciplina) + '|' + chave]) return;
            adicionadas[String(d.disciplina) + '|' + chave] = true;
            cavNomeAula[doc.id] = {
                nome: chave,
                disciplina: d.disciplina || '',
                docente: d.docente || ''
            };
            const nomeCompleto = (d.disciplina || 'Aula') + (chave && chave !== d.disciplina ? ' - ' + chave : '');
            cavAulasOptions.push({ value: doc.id, text: nomeCompleto });
        });
        cavRenderAulas();
        if (nomeAlvo) {
            // seleciona a opcao que corresponde ao nome salvo na edicao
            let achou = false;
            Array.prototype.forEach.call(sel.options, o => {
                if (o.getAttribute('data-nomecompleto') === nomeAlvo) { o.selected = true; achou = true; }
            });
            if (achou) cavOnNomeChange();
        }
    }).catch(() => { sel.innerHTML = '<option value="">Erro ao carregar aulas</option>'; });
}

// re-renderiza o select de aulas ja carregadas aplicando o filtro da busca
function cavRenderAulas() {
    const sel = document.getElementById('cav-nome');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Selecione a avaliação...</option>';
    if (cavAulasOptions.length === 0) {
        sel.innerHTML = '<option value="">Nenhuma aula com AV ' + cavRotuloAV(cavTipo) + ' nesta turma</option>';
        return;
    }
    const f = (cavAulasFiltro || '').trim().toLowerCase();
    let count = 0;
    cavAulasOptions.forEach(o => {
        if (f && String(o.text || '').toLowerCase().indexOf(f) === -1) return;
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.text;
        opt.setAttribute('data-nomecompleto', o.text);
        sel.appendChild(opt);
        count++;
    });
    if (count === 0) {
        sel.innerHTML = '<option value="">Nenhuma aula encontrada para a busca</option>';
    }
    // preserva a selecao atual se ainda existe nas opcoes originais
    if (atual && cavAulasOptions.some(o => o.value === atual)) sel.value = atual;
}

// filtra as aulas pelo texto digitado no campo de busca
function cavFiltrarAulas(texto) {
    cavAulasFiltro = texto || '';
    cavRenderAulas();
}

// preenche o nome da avaliacao a partir da aula selecionada
function cavOnNomeChange() {
    const selNome = document.getElementById('cav-nome');
    const idAula = selNome ? selNome.value : '';
    const dadosAula = cavNomeAula[idAula];
    const selDoc = document.getElementById('cav-docente');
    if (dadosAula) {
        cavNomeAtual = (dadosAula.disciplina || '') + (dadosAula.nome && dadosAula.nome !== dadosAula.disciplina ? ' - ' + dadosAula.nome : '');
        cavNomeAtual = cavNomeAtual.trim() || idAula;
        if (dadosAula.docente) {
            // garante que o docente selecionado exista na lista
            let encontrou = false;
            Array.prototype.forEach.call(selDoc.options, o => { if (o.value === dadosAula.docente) encontrou = true; });
            if (encontrou) selDoc.value = dadosAula.docente;
            else {
                const opt = document.createElement('option');
                opt.value = dadosAula.docente; opt.textContent = dadosAula.docente;
                selDoc.appendChild(opt);
                selDoc.value = dadosAula.docente;
            }
        }
    }
}
function cavLoadDisciplinas(proj, turma, value) {
    const sel = document.getElementById('cav-disciplina');
    if (!sel) return;
    sel.innerHTML = '<option value="">Carregando...</option>';
    dbFirestore.collection('disciplinas').orderBy('nome').get().then(snap => {
        sel.innerHTML = '<option value="">Selecione a disciplina...</option>';
        snap.forEach(doc => {
            const d = doc.data();
            if (proj && d.projeto && d.projeto !== proj) return;
            if (turma && d.turma && d.turma !== turma) return;
            const opt = document.createElement('option');
            opt.value = d.nome || '';
            opt.textContent = d.nome || '';
            sel.appendChild(opt);
        });
        if (value) sel.value = value;
        else cavOnDisciplinaChange();
    }).catch(() => { sel.innerHTML = '<option value="">Erro ao carregar</option>'; });
}

function cavLoadAulas(disciplinaNome, value) {
    const sel = document.getElementById('cav-aula');
    if (!sel) return;
    sel.innerHTML = '<option value="">Carregando...</option>';
    dbFirestore.collection('aulas').orderBy('data', 'desc').get().then(snap => {
        sel.innerHTML = '<option value="">Selecione a aula...</option>';
        snap.forEach(doc => {
            const d = doc.data();
            if (disciplinaNome && d.disciplina && d.disciplina !== disciplinaNome) return;
            const opt = document.createElement('option');
            opt.value = d.nome || d.disciplina || doc.id;
            const dataStr = d.data ? new Date(d.data).toLocaleDateString('pt-BR') : '';
            opt.textContent = (d.nome || d.disciplina || doc.id) + (dataStr ? ' - ' + dataStr : '');
            sel.appendChild(opt);
        });
        if (value) sel.value = value;
    }).catch(() => { sel.innerHTML = '<option value="">Erro ao carregar</option>'; });
}

function cavOnDisciplinaChange() {
    const disc = document.getElementById('cav-disciplina').value;
    cavLoadAulas(disc, '');
    // preenche docente a partir da disciplina selecionada
    if (disc) {
        dbFirestore.collection('disciplinas').where('nome', '==', disc).limit(1).get().then(snap => {
            snap.forEach(doc => {
                const d = doc.data();
                if (d.docente) {
                    const selD = document.getElementById('cav-docente');
                    if (selD && selD.value !== d.docente) {
                        selD.innerHTML = '<option value="">Selecione o docente...</option>';
                        const opt = document.createElement('option');
                        opt.value = d.docente; opt.textContent = d.docente;
                        selD.appendChild(opt);
                        selD.value = d.docente;
                    }
                }
            });
        });
    }
}

function cavPopulateDocentes(value) {
    const sel = document.getElementById('cav-docente');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o docente...</option>';
    dbFirestore.collection('docentes').orderBy('nome').get().then(snap => {
        sel.innerHTML = '<option value="">Selecione o docente...</option>';
        snap.forEach(doc => {
            const d = doc.data();
            const opt = document.createElement('option');
            opt.value = d.nome || '';
            opt.textContent = d.nome || '';
            sel.appendChild(opt);
        });
        if (value) sel.value = value;
    }).catch(() => {});
}

function cavAdicionarQuestao(dados) {
    const wrap = document.getElementById('cav-questoes');
    if (!wrap) return;
    const atual = wrap.querySelectorAll('.cav-q').length;
    if (atual >= cavQMax) { alert('O limite é de ' + cavQMax + ' questões por avaliação.'); return; }
    const idx = cavQuestaoSeq++;
    const q = document.createElement('div');
    q.className = 'cav-q';
    q.dataset.idx = idx;
    q.style.cssText = 'background:#fafcff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:14px';
    const e = (dados && dados.enunciado) ? escHTML(dados.enunciado) : '';
    const isPratica = cavTipo === 'pratica';
    let corpo;
    if (isPratica) {
        corpo =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px">' +
                '<strong style="color:#0f172a;font-size:13px">Questão ' + (atual + 1) + '</strong>' +
                '<span style="font-size:11px;color:#64748b;font-weight:600">Marcação: CERTA / PARCIAL / NÃO REALIZOU</span>' +
            '</div>' +
            '<textarea class="cav-q-enunc" style="width:100%;min-height:64px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit;color:#1e293b;resize:vertical;margin-bottom:10px" placeholder="Digite o enunciado da questão...">' + e + '</textarea>';
    } else {
        const op = (dados && dados.opcoes) ? dados.opcoes : null;
        const oa = (op && op.a != null) ? escHTML(op.a) : '';
        const ob = (op && op.b != null) ? escHTML(op.b) : '';
        const oc = (op && op.c != null) ? escHTML(op.c) : '';
        const od = (op && op.d != null) ? escHTML(op.d) : '';
        const correta = (dados && dados.correta) ? dados.correta : '';
        corpo =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px">' +
                '<strong style="color:#0f172a;font-size:13px">Questão ' + (atual + 1) + '</strong>' +
                '<div style="display:flex;align-items:center;gap:8px">' +
                    '<label style="font-size:11px;color:#16a34a;font-weight:700;display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="cav-ok-' + idx + '" value="a" ' + (correta === 'a' ? 'checked' : '') + '>A correta</label>' +
                '</div>' +
            '</div>' +
            '<textarea class="cav-q-enunc" style="width:100%;min-height:64px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit;color:#1e293b;resize:vertical;margin-bottom:10px" placeholder="Digite o enunciado da questão...">' + e + '</textarea>' +
            cavOpcaoInput('a', 'A', oa, idx) +
            cavOpcaoInput('b', 'B', ob, idx) +
            cavOpcaoInput('c', 'C', oc, idx) +
            cavOpcaoInput('d', 'D', od, idx);
    }
    q.innerHTML =
        corpo +
        '<div style="display:flex;justify-content:flex-end;margin-top:6px">' +
            '<button onclick="cavRemoverQuestao(this)" title="Remover questão" style="background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.25);color:#dc2626;padding:5px 10px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600"><i class="fa-solid fa-trash"></i> Remover</button>' +
        '</div>';
    wrap.appendChild(q);
    cavAtualizarQCount();
}

function cavOpcaoInput(letra, rotulo, valor, qidx) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="width:24px;height:24px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#334155;flex-shrink:0">' + rotulo + '</span>' +
        '<span style="font-size:11px;color:#64748b;font-weight:700;flex-shrink:0">' + letra + ')</span>' +
        '<input type="text" class="cav-q-p ca-' + letra + '" data-letra="' + letra + '" value="' + valor + '" placeholder="Opção ' + rotulo + '" style="flex:1;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;color:#1e293b;font-family:inherit">' +
        '<input type="radio" class="cav-q-correta-field" name="cav-ok-' + qidx + '" value="' + letra + '" title="Marcar ' + rotulo + ' como correta" style="width:17px;height:17px;flex-shrink:0;cursor:pointer">' +
    '</div>';
}

function cavRemoverQuestao(btn) {
    const wrap = document.getElementById('cav-questoes');
    const q = btn.closest('.cav-q');
    if (q) q.remove();
    cavRenumerarQuestoes();
    cavAtualizarQCount();
}

function cavRenumerarQuestoes() {
    const qs = document.querySelectorAll('#cav-questoes .cav-q');
    qs.forEach((q, i) => {
        const strong = q.querySelector('strong');
        if (strong) strong.textContent = 'Questão ' + (i + 1);
    });
}

function cavGetQuestoes() {
    const questoes = [];
    document.querySelectorAll('#cav-questoes .cav-q').forEach(q => {
        const enunciado = (q.querySelector('.cav-q-enunc') || {}).value || '';
        if (cavTipo === 'pratica') {
            questoes.push({ enunciado });
            return;
        }
        const opcoes = {
            a: (q.querySelector('.ca-a') || {}).value || '',
            b: (q.querySelector('.ca-b') || {}).value || '',
            c: (q.querySelector('.ca-c') || {}).value || '',
            d: (q.querySelector('.ca-d') || {}).value || ''
        };
        let correta = '';
        const checked = q.querySelector('.cav-q-correta-field:checked');
        if (checked) correta = checked.value;
        questoes.push({ enunciado, opcoes, correta });
    });
    return questoes;
}

function cavColetarDados() {
    const selNome = document.getElementById('cav-nome');
    const nomeId = selNome ? selNome.value : '';
    const dadosNome = (nomeId && cavNomeAula[nomeId]) ? cavNomeAula[nomeId] : null;
    let nome = cavNomeAtual || nomeId;
    const disciplina = dadosNome ? (dadosNome.disciplina || '') : '';
    const aula = dadosNome ? (dadosNome.nome || dadosNome.disciplina || '') : '';
    if (dadosNome) {
        nome = (dadosNome.disciplina || '') + (dadosNome.nome && dadosNome.nome !== dadosNome.disciplina ? ' - ' + dadosNome.nome : '');
        nome = nome.trim() || nomeId;
    }
    const projeto = document.getElementById('cav-projeto').value;
    const turma = document.getElementById('cav-turma').value;
    const docente = document.getElementById('cav-docente').value;
    const questoes = cavGetQuestoes();
    return { nome, projeto, turma, disciplina, aula, aulaId: nomeId, docente, questoes, tipo: cavTipo };
}

function cavSalvar() {
    const d = cavColetarDados();
    if (!d.nome) { alert('Informe o nome da avaliação.'); return; }
    if (!d.projeto) { alert('Selecione o projeto.'); return; }
    if(!d.turma) { alert('Selecione a turma.'); return; }
    if (d.questoes.length === 0) { alert('Adicione ao menos uma questão.'); return; }
    for (let i = 0; i < d.questoes.length; i++) {
        const q = d.questoes[i];
        if (!q.enunciado.trim()) { alert('A questão ' + (i + 1) + ' não tem enunciado.'); return; }
        if (d.tipo !== 'pratica') {
            if (!q.correta) { alert('Marque a resposta correta (A, B, C ou D) da questão ' + (i + 1) + '.'); return; }
            if (!q.opcoes.a.trim() || !q.opcoes.b.trim() || !q.opcoes.c.trim() || !q.opcoes.d.trim()) { alert('Preencha as 4 opções da questão ' + (i + 1) + '.'); return; }
        }
    }
    const dados = {
        nome: d.nome,
        projeto: d.projeto,
        turma: d.turma,
        disciplina: d.disciplina || '',
        aula: d.aula || '',
        aulaId: d.aulaId || '',
        docente: d.docente || '',
        tipo: d.tipo || cavTipo || 'teorica',
        questoes: d.questoes,
        atualizadoEm: new Date()
    };
    const salvar = (ref, update) => {
        if (update) return dbFirestore.collection(FB_AVALIACOES).doc(ref).update({ ...dados });
        return dbFirestore.collection(FB_AVALIACOES).add({ ...dados, criadoEm: new Date() });
    };
    if (cavEditingId) {
        salvar(cavEditingId, true).then(() => { alert('Avaliação atualizada com sucesso!'); cavLoadList(); })
            .catch(e => alert('Erro ao salvar: ' + e.message));
    } else {
        salvar(null, false).then(() => { alert('Avaliação criada com sucesso!'); cavLoadList(); })
            .catch(e => alert('Erro ao salvar: ' + e.message));
    }
}

function cavEditar() {
    const id = cavEditingId;
    if (!id) { alert('Selecione uma avaliação da lista para editar.'); return; }
    dbFirestore.collection(FB_AVALIACOES).doc(id).get().then(doc => {
        if (!doc.exists) { alert('Avaliação não encontrada.'); return; }
        cavPreencherForm(doc.id, doc.data());
    }).catch(e => alert('Erro: ' + e.message));
}

function cavEditarAvaliacao(id) {
    dbFirestore.collection(FB_AVALIACOES).doc(id).get().then(doc => {
        if (!doc.exists) { alert('Avaliação não encontrada.'); return; }
        cavPreencherForm(doc.id, doc.data());
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(e => alert('Erro: ' + e.message));
}

function cavPreencherForm(id, d) {
    cavEditingId = id;
    cavTipo = (d.tipo === 'pratica') ? 'pratica' : 'teorica';
    cavNomeAtual = d.nome || '';
    cavQMax = ([4, 6, 8, 10, 20].indexOf(d.questoes && d.questoes.length) !== -1) ? d.questoes.length : ((d.questoes && d.questoes.length > 10) ? 20 : 10);
    const limiteSel = document.getElementById('cav-q-limite');
    if (limiteSel) limiteSel.value = String(cavQMax);
    const qMaxEl = document.getElementById('cav-q-max');
    if (qMaxEl) qMaxEl.textContent = cavQMax;
    const busca = document.getElementById('cav-aula-busca');
    if (busca) { busca.value = ''; busca.disabled = false; }
    document.getElementById('cav-nome').innerHTML = '<option value="">Carregando...</option>';
    document.getElementById('cav-form').style.display = 'block';
    document.getElementById('cav-form-titulo').textContent = 'Editar AV ' + cavRotuloAV(cavTipo);
    cavAplicarRotuloTipo();
    const badge = document.getElementById('cav-editing-badge');
    badge.style.display = 'inline-flex';
    badge.style.cssText = 'background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.25);color:#2563eb;font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px';
    badge.innerHTML = '<i class="fa-solid fa-pen"></i> Editando: ' + escHTML(d.nome || '');
    document.getElementById('cav-gabarito').style.display = 'none';
    cavPopulateProjetos(d.projeto || '');
    cavPopulateTurmas(d.projeto || '', d.turma || '');
    cavLoadAulasNome(d.projeto || '', d.turma || '', d.nome || '');
    if (d.docente) {
        const selD = document.getElementById('cav-docente');
        selD.innerHTML = '<option value="">Selecione o docente...</option>';
        const opt = document.createElement('option');
        opt.value = d.docente; opt.textContent = d.docente;
        selD.appendChild(opt);
        selD.value = d.docente;
        cavPopulateDocentes(d.docente);
    } else { cavPopulateDocentes(''); }
    const wrap = document.getElementById('cav-questoes');
    wrap.innerHTML = '';
    cavQuestaoSeq = 0;
    (d.questoes || []).forEach(q => {
        cavAdicionarQuestao(q);
    });
    cavAtualizarQCount();
}

function cavExcluir() {
    const id = cavEditingId;
    if (!id) { alert('Selecione uma avaliação da lista para excluir.'); return; }
    if (!confirm('Excluir esta avaliação?')) return;
    dbFirestore.collection(FB_AVALIACOES).doc(id).delete().then(() => {
        alert('Avaliação excluída.');
        cavEditingId = null;
        cavNovaAvaliacao();
        cavLoadList();
    }).catch(e => alert('Erro: ' + e.message));
}

function cavExcluirPorId(id) {
    if (!confirm('Excluir esta avaliação?')) return;
    dbFirestore.collection(FB_AVALIACOES).doc(id).delete().then(() => {
        alert('Avaliação excluída.');
        if (cavEditingId === id) cavNovaAvaliacao();
        cavLoadList();
    }).catch(e => alert('Erro: ' + e.message));
}

function cavGerarGabarito() {
    const d = cavColetarDados();
    const questoes = d.questoes;
    if (questoes.length === 0) { alert('Não há questões para gerar o gabarito.'); return; }
    let html = '';
    questoes.forEach((q, i) => {
        const letra = q.correta ? q.correta.toUpperCase() : '<span style="color:#dc2626">—</span>';
        html += '<div style="display:flex;gap:8px;padding:6px 8px;border-bottom:1px dashed #cbd5e1"><strong style="width:70px">Questão ' + (i + 1) + ':</strong><span>Letra <strong>' + letra + '</strong></span></div>';
    });
    document.getElementById('cav-gabarito-content').innerHTML = html;
    document.getElementById('cav-gabarito').style.display = 'block';
}

function cavImprimir() {
    const d = cavColetarDados();
    if (d.questoes.length === 0) { alert('Não há questões para imprimir (abra uma avaliação da lista ou monte as questões).'); return; }
    cavImprimirHTML(d);
}

function cavImprimirPorId(id) {
    dbFirestore.collection(FB_AVALIACOES).doc(id).get().then(doc => {
        if (!doc.exists) { alert('Avaliação não encontrada.'); return; }
        cavImprimirHTML(doc.data());
    }).catch(e => alert('Erro: ' + e.message));
}

function cavImprimirHTML(d) {
    let questoesHtml = '';
    (d.questoes || []).forEach((q, i) => {
        questoesHtml += '<div style="margin-bottom:18px;page-break-inside:avoid"><div style="font-weight:700;margin-bottom:6px">' + (i + 1) + '. ' + escHTML(q.enunciado) + '</div>' +
            '<div style="margin-left:18px;line-height:1.8">' +
                '<div>A) ' + escHTML(q.opcoes.a) + '</div>' +
                '<div>B) ' + escHTML(q.opcoes.b) + '</div>' +
                '<div>C) ' + escHTML(q.opcoes.c) + '</div>' +
                '<div>D) ' + escHTML(q.opcoes.d) + '</div>' +
            '</div><div style="margin-top:4px;margin-left:18px;display:flex;gap:12px">' +
                '<span style="color:#94a3b8">( ) A</span><span style="color:#94a3b8">( ) B</span><span style="color:#94a3b8">( ) C</span><span style="color:#94a3b8">( ) D</span>' +
            '</div></div>';
    });
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>' + escHTML(d.nome || 'Avaliação') + '</title>' +
        '<style>body{font-family:Arial,sans-serif;color:#111;padding:30px} h1{font-size:20px;margin-bottom:4px} meta{}</style>' +
        '</head><body>' +
        '<h1>' + escHTML((d.nome || 'Avaliação')) + '</h1>' +
        '<div style="color:#555;margin-bottom:20px;font-size:13px">Projeto: ' + escHTML(d.projeto || '-') + ' | Turma: ' + escHTML(d.turma || '-') + (d.disciplina ? ' | Disciplina: ' + escHTML(d.disciplina) : '') + (d.docente ? ' | Docente: ' + escHTML(d.docente) : '') + (d.aula ? ' | Aula: ' + escHTML(d.aula) : '') + '</div>' +
        '<div style="border:1px solid #ccc;border-radius:8px;padding:14px;margin-bottom:22px">' +
            '<div style="font-weight:700;margin-bottom:6px">Gabarito</div>' +
            (d.questoes || []).map((q, i) => '<div>Questão ' + (i + 1) + ': Letra ' + (q.correta || '').toUpperCase() + '</div>').join('') +
        '</div>' +
        questoesHtml +
        '<script>window.onload=function(){window.print();};</scr' + 'ipt>' +
        '</body></html>');
    w.document.close();
}

function cavAbrirEnvio() {
    const id = cavEditingId;
    if (!id) { alert('Salve a avaliação antes de enviar.'); return; }
    const sel = document.getElementById('cav-envio-turma');
    sel.innerHTML = '<option value="">Carregando turmas...</option>';
    dbFirestore.collection(FB_AVALIACOES).doc(id).get().then(doc => {
        if (!doc.exists) { alert('Avaliação não encontrada. Salve novamente.'); return; }
        const data = doc.data();
        if (!data.questoes || data.questoes.length === 0) { alert('A avaliação não possui questões.'); return; }
        sel.innerHTML = '<option value="">Selecione a turma...</option>';
        turmas.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.nome || '';
            opt.textContent = (t.nome || '');
            sel.appendChild(opt);
        });
        if (data.turma) sel.value = data.turma;
        const info = document.getElementById('cav-envio-info');
        info.innerHTML = '<strong>' + escHTML(data.nome || '') + '</strong><br>' +
            'Questões: ' + (data.questoes || []).length + ' · Turma vinculada: ' + escHTML(data.turma || '—');
        document.getElementById('cav-envio-overlay').classList.remove('hidden');
    }).catch(e => alert('Erro: ' + e.message));
}

function cavFecharEnvio() {
    document.getElementById('cav-envio-overlay').classList.add('hidden');
}

function cavConfirmarEnvio() {
    const id = cavEditingId;
    const turma = document.getElementById('cav-envio-turma').value;
    if (!turma) { alert('Selecione a turma para enviar.'); return; }
    if (!confirm('Enviar esta avaliação para a turma "' + turma + '"? Os alunos poderão respondê-la no Portal do Aluno.')) return;
    dbFirestore.collection(FB_AVALIACOES).doc(id).get().then(doc => {
        if (!doc.exists) { alert('Avaliação não encontrada.'); return; }
        const data = doc.data();
        return dbFirestore.collection(FB_AVALIACOES).doc(id).update({
            enviada: true,
            enviadaEm: new Date(),
            turma: turma
        });
    }).then(() => {
        alert('Avaliação enviada para a turma "' + turma + '"!');
        cavFecharEnvio();
        cavLoadList();
    }).catch(e => alert('Erro: ' + e.message));
}

/* ===== LISTAR AVALIADOS (ADMIN) ===== */
var cavListarAvaliacaoId = null;

function cavListarAvaliados(avId) {
    cavListarAvaliacaoId = avId;
    const overlay = document.getElementById('cav-listar-overlay');
    const nomeEl = document.getElementById('cav-listar-avaliacao-nome');
    const content = document.getElementById('cav-listar-avaliados-content');
    if (!overlay || !content) return;
    nomeEl.textContent = 'Avaliação...';
    content.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px">Carregando alunos avaliados... <i class="fa-solid fa-spinner fa-spin"></i></div>';
    overlay.classList.remove('hidden');

    Promise.all([
        dbFirestore.collection(FB_AVALIACOES).doc(avId).get().catch(() => null),
        dbFirestore.collection(FB_AVALIACOES_RESPOSTAS).get().catch(() => null),
        dbFirestore.collection('avaliacoesAlunos').get().catch(() => null)
    ]).then(([avDoc, snap, avAlunos]) => {
        const avNome = (avDoc && avDoc.exists) ? (avDoc.data().nome || 'Avaliação') : 'Avaliação';
        nomeEl.textContent = avNome;
        if (!snap) {
            content.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px">Erro ao carregar respostas. Tente novamente.</div>';
            return;
        }
        const avaliados = [];
        // Respostas enviadas pelo próprio aluno (AV teórica)
        snap.forEach(doc => {
            const r = doc.data() || {};
            if (String(r.avaliacaoId || '') !== avId) return;
            avaliados.push({
                cpf: r.cpf || '',
                nome: r.nome || 'Sem nome',
                matricula: r.matricula || '—',
                pontos: (r.pontos != null ? Number(r.pontos).toFixed(1).replace('.', ',') : '—'),
                certas: r.respostasCertas,
                total: r.totalQuestoes,
                tipo: 'Aluno',
                enviadoEm: r.enviadoEm
            });
        });
        // AV Prática respondida e salva pelo docente (coleção avaliacoesAlunos)
        if (avAlunos) {
            avAlunos.forEach(doc => {
                const f = doc.data() || {};
                const man = (f.avPraticaManual || {})[avId];
                if (!man) return;
                const notaLinha = (man.nota != null ? Number(man.nota).toFixed(1).replace('.', ',') : '—');
                avaliados.push({
                    cpf: f.cpf || '',
                    nome: f.nome || 'Sem nome',
                    matricula: f.matricula || '—',
                    pontos: notaLinha,
                    certas: null,
                    total: man.totalQuestoes,
                    tipo: 'Prática (docente)',
                    enviadoEm: man.respondidoEm
                });
            });
        }
        if (avaliados.length === 0) {
            content.innerHTML = '<div style="text-align:center;color:#64748b;padding:26px"><i class="fa-solid fa-user-slash" style="font-size:36px;color:#cbd5e1;display:block;margin-bottom:10px"></i>Nenhum aluno concluiu esta avaliação ainda.</div>';
            return;
        }
        content.innerHTML = '<div style="font-size:12px;color:#64748b;margin-bottom:10px">' + avaliados.length + ' aluno(s) avaliado(s).</div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
            '<thead><tr style="background:#f1f5f9;color:#475569;text-align:left">' +
                '<th style="padding:8px 10px;border-bottom:1px solid #e2e8f0">Aluno</th>' +
                '<th style="padding:8px 10px;border-bottom:1px solid #e2e8f0">Matrícula</th>' +
                '<th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">Nota</th>' +
                '<th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">Origem</th>' +
                '<th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">Ações</th>' +
            '</tr></thead><tbody>' +
            avaliados.map(function(a) {
                const nome = String(a.nome).replace(/'/g, '');
                return '<tr style="border-bottom:1px solid #f1f5f9">' +
                    '<td style="padding:9px 10px;font-weight:600;color:#0f172a">' + escHTML(a.nome) + '</td>' +
                    '<td style="padding:9px 10px;color:#64748b">' + escHTML(a.matricula) + '</td>' +
                    '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#d97706">' + escHTML(a.pontos) + '</td>' +
                    '<td style="padding:9px 10px;text-align:center">' + escHTML(a.tipo || '—') + '</td>' +
                    '<td style="padding:9px 10px;text-align:center">' +
                        '<button class="btn-outline btn-sm" onclick="cavVerRespostas(\'' + avId + '\',\'' + a.cpf.replace(/'/g, '') + '\')"><i class="fa-solid fa-eye"></i> Ver respostas e pontos</button>' +
                    '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table>';
    }).catch(function(e) {
        console.error('Erro ao listar avaliados:', e);
        content.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px">Erro ao carregar. Tente novamente.</div>';
    });
}

function cavFecharListarAvaliados() {
    document.getElementById('cav-listar-overlay').classList.add('hidden');
}

function cavVerRespostas(avId, cpf) {
    const content = document.getElementById('cav-respostas-content');
    const overlay = document.getElementById('cav-respostas-overlay');
    if (!content || !overlay) return;
    content.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px">Carregando... <i class="fa-solid fa-spinner fa-spin"></i></div>';
    overlay.classList.remove('hidden');

    Promise.all([
        dbFirestore.collection(FB_AVALIACOES).doc(avId).get().catch(() => null),
        dbFirestore.collection(FB_AVALIACOES_RESPOSTAS).doc(cpf + '_' + avId).get().catch(() => null),
        dbFirestore.collection('avaliacoesAlunos').doc(cpf).get().catch(() => null)
    ]).then(function(results) {
        const avDoc = results[0];
        const respDoc = results[1];
        const fichaDoc = results[2];
        if (!avDoc || !avDoc.exists) { content.innerHTML = '<p style="color:#dc2626">Avaliação não encontrada.</p>'; return; }
        const d = avDoc.data() || {};
        const questoes = d.questoes || [];
        // Preferir resposta enviada pelo aluno (AV teórica); caso contrário usar a respondida pelo docente (AV prática)
        if (respDoc && respDoc.exists) {
            const r = respDoc.data() || {};
            const respostas = r.respostas || {};
            const marcadas = r.respostasMarcadas != null ? r.respostasMarcadas : Object.keys(respostas).length;
            const certas = r.respostasCertas != null ? r.respostasCertas : '—';
            const pontos = r.pontos != null ? Number(r.pontos).toFixed(1).replace('.', ',') : '—';
            const total = r.totalQuestoes != null ? r.totalQuestoes : questoes.length;

            const cards =
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#64748b;font-weight:700">ALUNO</div><div style="font-size:13px;font-weight:800;color:#0f172a;margin-top:4px">' + escHTML(r.nome || '—') + '</div></div>' +
                '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#4f46e5;font-weight:700">RESPONDIDAS</div><div style="font-size:20px;font-weight:800;color:#4f46e5;margin-top:4px">' + (marcadas || 0) + '/' + (total || 0) + '</div></div>' +
                '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#16a34a;font-weight:700">CERTAS</div><div style="font-size:20px;font-weight:800;color:#16a34a;margin-top:4px">' + (certas == null ? '—' : certas) + '</div></div>' +
                '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#d97706;font-weight:700">PONTOS</div><div style="font-size:20px;font-weight:800;color:#d97706;margin-top:4px">' + pontos + '</div></div>' +
                '</div>';

            let qHtml = '';
            questoes.forEach(function(q, i) {
                const escolhida = respostas[i] || '';
                const correta = q.correta || '';
                const opcoes = ['a', 'b', 'c', 'd'];
                const opHtml = opcoes.map(function(letra) {
                    const texto = q.opcoes && q.opcoes[letra];
                    const chosen = (escolhida === letra);
                    const chosenIcon = chosen ? (letra === correta ? '✅' : '❌') : (letra === correta ? '✔️' : '');
                    const letraColor = chosen ? (letra === correta ? '#16a34a' : '#dc2626') : (letra === correta ? '#16a34a' : '#1e293b');
                    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:5px;background:' + (chosen ? '#f8fafc' : '#fff') + '">' +
                        '<span style="width:20px;height:20px;border-radius:5px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#334155;flex-shrink:0">' + letra.toUpperCase() + '</span>' +
                        '<span style="font-size:12.5px;color:' + letraColor + ';flex:1">' + escHTML(texto || '') + (letra === correta && !chosen ? ' <span style="color:#16a34a;font-size:10px;font-weight:700">(correta)</span>' : '') + '</span>' +
                        (chosen ? '<span style="font-size:10px;font-weight:700;color:' + (letra === correta ? '#16a34a' : '#dc2626') + '">RESPOSTA</span>' : '') +
                        (chosenIcon ? '<span style="font-size:13px">' + chosenIcon + '</span>' : '') +
                        '</div>';
                }).join('');
                const status = !escolhida
                    ? '<span style="color:#94a3b8;font-size:10px;font-weight:700">Não respondida</span>'
                    : (escolhida === correta
                        ? '<span style="color:#16a34a;font-size:10px;font-weight:700"><i class="fa-solid fa-circle-check"></i> Correta</span>'
                        : '<span style="color:#dc2626;font-size:10px;font-weight:700"><i class="fa-solid fa-circle-xmark"></i> Errada</span>');
                qHtml += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:12.5px;font-weight:700;color:#0f172a">' + (i + 1) + '. ' + escHTML(q.enunciado || '') + '</span>' + status + '</div>' +
                    opHtml +
                    '</div>';
            });

            content.innerHTML = cards + qHtml;
            return;
        }

        // AV Prática respondida pelo docente (coleção avaliacoesAlunos)
        const man = (fichaDoc && fichaDoc.exists && (fichaDoc.data() || {}).avPraticaManual) ? (fichaDoc.data().avPraticaManual[avId]) : null;
        if (man) {
            const f = fichaDoc.data() || {};
            const respostas = man.respostas || {};
            const total = man.totalQuestoes != null ? man.totalQuestoes : questoes.length;
            const nota = man.nota != null ? Number(man.nota).toFixed(1).replace('.', ',') : '—';
            const cards =
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#64748b;font-weight:700">ALUNO</div><div style="font-size:13px;font-weight:800;color:#0f172a;margin-top:4px">' + escHTML(f.nome || '—') + '</div></div>' +
                '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#4f46e5;font-weight:700">AVALIADAS</div><div style="font-size:20px;font-weight:800;color:#4f46e5;margin-top:4px">' + Object.keys(respostas).length + '/' + (total || 0) + '</div></div>' +
                '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:10px;color:#d97706;font-weight:700">NOTA</div><div style="font-size:20px;font-weight:800;color:#d97706;margin-top:4px">' + nota + '</div></div>' +
                '</div>';
            let qHtml = '';
            questoes.forEach(function(q, i) {
                const v = respostas[i] || '';
                const cfg = v === 'certa'
                    ? { cor: '#16a34a', rotulo: 'CERTA', icon: 'fa-circle-check' }
                    : (v === 'parcial' ? { cor: '#f59e0b', rotulo: 'PARCIAL', icon: 'fa-circle-half-stroke' } : { cor: '#dc2626', rotulo: 'NÃO REALIZOU', icon: 'fa-circle-xmark' });
                const status = v ? '<span style="color:' + cfg.cor + ';font-size:10px;font-weight:700"><i class="fa-solid ' + cfg.icon + '"></i> ' + cfg.rotulo + '</span>' : '<span style="color:#94a3b8;font-size:10px;font-weight:700">Não avaliada</span>';
                qHtml += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:12.5px;font-weight:700;color:#0f172a">' + (i + 1) + '. ' + escHTML(q.enunciado || '') + '</span>' + status + '</div>' +
                    '</div>';
            });
            content.innerHTML = cards + qHtml;
            return;
        }

        content.innerHTML = '<p style="color:#64748b">Este aluno não possui resposta registrada para esta avaliação.</p>';
    }).catch(function(e) {
        console.error('Erro ao carregar respostas:', e);
        content.innerHTML = '<p style="color:#dc2626">Erro ao carregar as respostas.</p>';
    });
}

function cavFecharRespostas() {
    document.getElementById('cav-respostas-overlay').classList.add('hidden');
}

/* ===== SELECAO DE TIPO DE AVALIACAO (TEORICA / PRATICA) ===== */
function cavEscolherTipo() {
    const o = document.getElementById('cav-tipo-overlay');
    if (o) o.classList.remove('hidden');
}

function cavEscolherTipoConfirmar(tipo) {
    cavTipo = (tipo === 'pratica') ? 'pratica' : 'teorica';
    const o = document.getElementById('cav-tipo-overlay');
    if (o) o.classList.add('hidden');
    const titulo = document.getElementById('cav-form-titulo');
    if (titulo) titulo.textContent = 'Nova AV ' + cavRotuloAV(cavTipo);
    cavAplicarRotuloTipo();
}

function cavFecharTipo() {
    const o = document.getElementById('cav-tipo-overlay');
    if (o) o.classList.add('hidden');
}

/* ===== CURSOS ===== */
var cursoEditingId = null;
var cursoEpiSeq = 0;

var cursoTipos = ['Profissionalizante', 'Especialização', 'Qualificação', 'Técnico', 'Tecnólogo'];

function cursoResetForm() {
    cursoEditingId = null;
    cursoEpiSeq = 0;
    document.getElementById('curso-nome').value = '';
    var radios = document.querySelectorAll('input[name="curso-tipo"]');
    if (radios[0]) radios[0].checked = true;
    document.getElementById('curso-carga').value = '';
    document.getElementById('curso-lei').value = '';
    document.getElementById('curso-normas').value = '';
    document.getElementById('curso-form-titulo').textContent = 'Novo Curso';
    document.getElementById('curso-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Salvar Curso';
    cursoEpiRender();
    cursoShowMsg('', '');
}

function cursoAbrirForm() {
    cursoResetForm();
    document.getElementById('curso-form-container').style.display = 'block';
    document.getElementById('curso-criar-btn').style.display = 'none';
    document.getElementById('admin-cursos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cursoFecharForm() {
    cursoResetForm();
    document.getElementById('curso-form-container').style.display = 'none';
    document.getElementById('curso-criar-btn').style.display = 'inline-flex';
}

function cursoShowMsg(text, type) {
    var el = document.getElementById('curso-msg');
    if (!el) return;
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.background = type === 'ok' ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.12)';
    el.style.border = '1px solid ' + (type === 'ok' ? 'rgba(22,163,74,.3)' : 'rgba(220,38,38,.3)');
    el.style.color = type === 'ok' ? '#15803d' : '#b91c1c';
    el.textContent = text;
}

function cursoEpiAdicionarLinha(nome, qtd) {
    var idx = cursoEpiSeq++;
    var cont = document.getElementById('curso-epi-lista');
    if (!cont) return;
    var empty = document.getElementById('curso-epi-empty');
    if (empty) empty.remove();
    var div = document.createElement('div');
    div.className = 'curso-epi-linha';
    div.dataset.idx = idx;
    div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
    div.innerHTML =
        '<input type="text" class="config-input curso-epi-nome" placeholder="Nome do equipamento (ex: Capacete)" value="' + escHTML(nome || '') + '" style="flex:2;min-width:120px">' +
        '<input type="number" class="config-input curso-epi-qtd" min="0" placeholder="Qtd por aluno" value="' + (qtd != null ? qtd : '') + '" style="flex:1;min-width:80px">' +
        '<button type="button" title="Remover" style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.25);color:#dc2626;width:32px;height:32px;border-radius:8px;cursor:pointer;flex-shrink:0" onclick="cursoEpiRemoverLinha(this)"><i class="fa-solid fa-trash"></i></button>';
    cont.appendChild(div);
}

function cursoEpiRemoverLinha(btn) {
    var linha = btn.closest('.curso-epi-linha');
    if (linha) linha.remove();
}

function cursoEpiRender() {
    var cont = document.getElementById('curso-epi-lista');
    if (!cont) return;
    cont.innerHTML = '<div id="curso-epi-empty" style="font-size:12px;color:#94a3b8">Nenhum equipamento cadastrado. Clique em "Adicionar Equipamento".</div>';
}

function cursoEpiColetar() {
    var lista = [];
    document.querySelectorAll('#curso-epi-lista .curso-epi-linha').forEach(function(linha) {
        var nome = (linha.querySelector('.curso-epi-nome') || {}).value || '';
        var qtd = (linha.querySelector('.curso-epi-qtd') || {}).value || '';
        if (nome.trim()) lista.push({ nome: nome.trim(), quantidade: (qtd === '' ? null : Number(qtd)) });
    });
    return lista;
}

async function cursoSalvar() {
    var nome = document.getElementById('curso-nome').value.trim();
    if (!nome) { cursoShowMsg('Informe o nome do curso.', 'err'); return; }
    var tipo = '';
    var radioSel = document.querySelector('input[name="curso-tipo"]:checked');
    if (radioSel) tipo = radioSel.value;
    var carga = document.getElementById('curso-carga').value;
    var lei = document.getElementById('curso-lei').value.trim();
    var normas = document.getElementById('curso-normas').value.trim();
    var epis = cursoEpiColetar();

    var btn = document.getElementById('curso-save-btn');
    btn.disabled = true;
    var btnHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    try {
        var base = {
            nome: nome,
            tipo: tipo,
            cargaHoraria: (carga === '' ? null : Number(carga)),
            lei: lei,
            normas: normas,
            epis: epis
        };
        base.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();

        if (cursoEditingId) {
            await dbFirestore.collection('cursos').doc(cursoEditingId).update(base);
            cursoShowMsg('Curso atualizado com sucesso!', 'ok');
        } else {
            base.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
            await dbFirestore.collection('cursos').add(base);
            cursoShowMsg('Curso criado com sucesso!', 'ok');
        }
        cursoFecharForm();
        cursoListLoad();
    } catch (e) {
        console.error('Erro ao salvar curso:', e);
        cursoShowMsg('Erro: ' + e.message, 'err');
    }
    btn.disabled = false;
    btn.innerHTML = btnHtml;
}

async function cursoListLoad() {
    var cont = document.getElementById('curso-list');
    if (!cont) return;
    cont.innerHTML = '<div style="text-align:center;color:#475569;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i><br>Carregando cursos...</div>';
    try {
        var snap = await dbFirestore.collection('cursos').orderBy('criadoEm', 'desc').get();
        if (snap.empty) {
            cont.innerHTML = '<div class="empty-state" style="text-align:center;padding:40px 20px"><i class="fa-solid fa-book-open" style="font-size:36px;color:#94a3b8;margin-bottom:10px"></i><p style="color:#64748b;font-size:13px">Nenhum curso cadastrado. Clique no botão "Salvar Curso" acima para criar o primeiro.</p></div>';
            return;
        }
        cont.innerHTML = '';
        snap.forEach(function(doc) {
            var c = doc.data();
            c._id = doc.id;
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;flex-wrap:wrap';
            card.innerHTML =
                '<div style="width:44px;height:44px;background:rgba(37,99,235,.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-book" style="color:#2563eb;font-size:19px"></i></div>' +
                '<div style="flex:1;min-width:180px">' +
                    '<div style="font-size:14px;font-weight:700;color:#0f172a">' + escHTML(c.nome || 'Curso') + '</div>' +
                    '<div style="font-size:11px;color:#64748b;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">' +
                        '<span style="background:rgba(37,99,235,.1);color:#2563eb;padding:2px 8px;border-radius:6px;font-weight:600">' + escHTML(c.tipo || '-') + '</span>' +
                        '<span>' + (c.cargaHoraria != null ? c.cargaHoraria + ' h' : '-') + '</span>' +
                        '<span>' + (c.epis ? c.epis.length : 0) + ' EPI(s)</span>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-shrink:0">' +
                    '<button class="btn-outline btn-sm" onclick="cursoVerDetalhe(\'' + c._id + '\')"><i class="fa-solid fa-eye"></i></button>' +
                    '<button class="btn-outline btn-sm" onclick="cursoEditar(\'' + c._id + '\')"><i class="fa-solid fa-pen"></i></button>' +
                    '<button class="btn-danger btn-sm" onclick="cursoExcluir(\'' + c._id + '\')"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
            cont.appendChild(card);
        });
    } catch (e) {
        console.error('Erro ao listar cursos:', e);
        cont.innerHTML = '<div style="text-align:center;color:#dc2626;padding:30px">Erro ao carregar cursos: ' + e.message + '</div>';
    }
}

async function cursoEditar(id) {
    try {
        var doc = await dbFirestore.collection('cursos').doc(id).get();
        if (!doc.exists) { alert('Curso não encontrado.'); return; }
        var c = doc.data();
        cursoResetForm();
        cursoEditingId = id;
        document.getElementById('curso-form-container').style.display = 'block';
        document.getElementById('curso-criar-btn').style.display = 'none';
        document.getElementById('curso-nome').value = c.nome || '';
        var radios = document.querySelectorAll('input[name="curso-tipo"]');
        radios.forEach(function(r) { r.checked = (r.value === (c.tipo || '')); });
        document.getElementById('curso-carga').value = (c.cargaHoraria != null ? c.cargaHoraria : '');
        document.getElementById('curso-lei').value = c.lei || '';
        document.getElementById('curso-normas').value = c.normas || '';
        document.getElementById('curso-form-titulo').textContent = 'Editar Curso';
        document.getElementById('curso-cancelar-btn').style.display = 'inline-flex';
        document.getElementById('curso-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Curso';
        cursoEpiRender();
        (c.epis || []).forEach(function(ep) { cursoEpiAdicionarLinha(ep.nome, ep.quantidade); });
        document.getElementById('admin-cursos').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

async function cursoExcluir(id) {
    if (!confirm('Excluir este curso?')) return;
    try {
        await dbFirestore.collection('cursos').doc(id).delete();
        alert('Curso excluído.');
        if (cursoEditingId === id) cursoResetForm();
        cursoListLoad();
    } catch (e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

function cursoVerDetalhe(id) {
    dbFirestore.collection('cursos').doc(id).get().then(function(doc) {
        if (!doc.exists) { alert('Curso não encontrado.'); return; }
        var c = doc.data();
        document.getElementById('curso-detalhe-titulo').innerHTML = '<i class="fa-solid fa-book" style="margin-right:8px"></i> ' + escHTML(c.nome || 'Curso');
        var episHtml = (c.epis || []).length
            ? '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
                '<thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0;font-size:12px">Equipamento</th><th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0;font-size:12px">Qtd por Aluno</th></tr></thead>' +
                '<tbody>' + (c.epis || []).map(function(ep) {
                    return '<tr><td style="padding:6px;border-bottom:1px solid #f1f5f9">' + escHTML(ep.nome || '') + '</td><td style="padding:6px;border-bottom:1px solid #f1f5f9">' + (ep.quantidade != null ? ep.quantidade : '-') + '</td></tr>';
                }).join('') + '</tbody></table>'
            : '<p style="font-size:13px;color:#64748b">Nenhum equipamento EPI cadastrado.</p>';
        var html =
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px"><div style="font-size:11px;color:#64748b;font-weight:700">TIPO</div><div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px">' + escHTML(c.tipo || '-') + '</div></div>' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px"><div style="font-size:11px;color:#64748b;font-weight:700">CARGA HORÁRIA</div><div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px">' + (c.cargaHoraria != null ? c.cargaHoraria + ' h' : '-') + '</div></div>' +
            '</div>' +
            '<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px">LEI E NORMAS</div><p style="font-size:13px;color:#1e293b;margin:0">' + (c.lei ? escHTML(c.lei) : '-') + '</p>' + (c.normas ? '<p style="font-size:13px;color:#475569;margin-top:8px;line-height:1.6">' + escHTML(c.normas) + '</p>' : '') + '</div>' +
            '<div><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">EQUIPAMENTOS EPI (' + (c.epis ? c.epis.length : 0) + ')</div>' + episHtml + '</div>';
        document.getElementById('curso-detalhe-content').innerHTML = html;
        document.getElementById('curso-detalhe-overlay').classList.remove('hidden');
    }).catch(function(e) {
        alert('Erro: ' + e.message);
    });
}

function cursorFecharDetalhe() {
    document.getElementById('curso-detalhe-overlay').classList.add('hidden');
}


