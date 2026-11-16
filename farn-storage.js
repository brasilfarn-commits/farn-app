/* =====================================================================
   FARN STORAGE
   Arquivos (fotos, icones, apostilas) ficam no Firebase Storage.
   O Firestore guarda apenas URLs curtas, reduzindo muito o consumo de cota.
   ===================================================================== */

var FS_FOTOS_COL = 'fotosUrls';
function fsStorage() { return (typeof firebase !== 'undefined' && firebase.storage) ? firebase.storage() : null; }
function fsDb() { return (typeof dbFirestore !== 'undefined') ? dbFirestore : null; }

function fsDataUrlToBlob(dataUrl) {
    try {
        var partes = String(dataUrl || '').split(',');
        if (partes.length < 2) return null;
        var mime = (partes[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
        var bin = atob(partes[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    } catch (e) { return null; }
}

async function fsUpload(caminho, dataUrl) {
    var st = fsStorage();
    if (!st) return null;
    var blob = fsDataUrlToBlob(dataUrl);
    if (!blob) return null;
    try {
        var ref = st.ref(caminho);
        await ref.put(blob, { contentType: blob.type });
        return await ref.getDownloadURL();
    } catch (e) {
        console.warn('Falha ao enviar arquivo ao Storage:', e);
        return null;
    }
}

/* Grava a foto no Storage e a URL num documento pequeno (fotosUrls/CPF). */
async function fsSalvarFoto(cpf, dataUrl, versao) {
    var url = await fsUpload('fotos/' + String(cpf) + '.jpg', dataUrl);
    if (!url) return null;
    var db = fsDb();
    if (db) {
        try {
            await db.collection(FS_FOTOS_COL).doc(String(cpf)).set({
                url: url, versao: String(versao || Date.now()), atualizadoEm: new Date().toISOString()
            });
        } catch (e) { console.warn('Falha ao gravar URL da foto:', e); }
    }
    return url;
}

async function fsBuscarFoto(cpf) {
    var db = fsDb();
    if (!db) return null;
    try {
        var doc = await db.collection(FS_FOTOS_COL).doc(String(cpf)).get();
        if (doc.exists) return (doc.data() || {}).url || null;
    } catch (e) {}
    return null;
}

/* Icone e apostila dos cursos. */
async function fsSalvarArquivoCurso(cursoId, tipo, dataUrl) {
    var extensao = String(dataUrl || '').indexOf('data:application/pdf') === 0 ? 'pdf' : 'jpg';
    var url = await fsUpload('cursos/' + String(cursoId) + '/' + tipo + '.' + extensao, dataUrl);
    return url;
}

async function fsMigrarFotosInterface() {
    if (!confirm('Migrar as fotos em base64 do Firestore para o Storage (gratuito)?\n\nAs fotos continuam aparecendo normalmente. Após a migração, os documentos ficam bem menores.')) return;
    var btn = document.querySelector('[onclick="fsMigrarFotosInterface()"]');
    try {
        var ok = await fsMigrarFotosParaStorage(function (atual, total, sucessos, falhas) {
            console.log('Migracao de fotos: ' + atual + '/' + total + ' ok=' + sucessos + ' falhas=' + falhas);
        });
        alert('Migração concluída: ' + ok + ' foto(s) enviada(s) ao Storage e removida(s) do Firestore.');
    } catch (e) { alert('Erro na migração: ' + e.message); }
}

/* Migracao unica: le os candidatos que ainda tem photoDataUrl, envia ao
   Storage, grava a URL e remove o campo grande do documento. */
async function fsMigrarFotosParaStorage(onProgresso) {
    var db = fsDb();
    if (!db) { alert('Firebase nao conectado.'); return 0; }
    var total = 0, ok = 0, falhas = 0;
    var snap = await db.collection('candidatos').get();
    total = snap.size;
    for (var i = 0; i < snap.docs.length; i++) {
        var doc = snap.docs[i];
        var d = doc.data() || {};
        var cpf = String(d.cpf || '');
        if (!cpf || !d.photoDataUrl) continue;
        try {
            var versao = String(d.fotoVersao || d.fotoAtualizadaEm || Date.now());
            var url = await fsSalvarFoto(cpf, d.photoDataUrl, versao);
            if (!url) { falhas++; continue; }
            await db.collection('candidatos').doc(doc.id).set({
                fotoUrl: url,
                hasPhoto: true,
                fotoVersao: versao,
                photoDataUrl: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            ok++;
        } catch (e) { falhas++; console.warn('Erro ao migrar foto de ' + cpf, e); }
        if (onProgresso) onProgresso(i + 1, total, ok, falhas);
    }
    if (onProgresso) onProgresso(total, total, ok, falhas);
    return ok;
}
