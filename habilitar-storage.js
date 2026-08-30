/* Habilitar Firebase Storage - automatiza a criacao do bucket padrao
 * usando o refresh token do Firebase CLI ja logado (brasilfarn@gmail.com).
 * Requer o plano Blaze (pay-as-you-go) para criar o bucket default.
 * Arquivo de config do firebase-tools lido de:
 *   C:\Users\FARN\.config\configstore\firebase-tools.json
 */
'use strict';
const fs = require('fs');
const https = require('https');
const path = require('path');

const PROJECT_ID = 'farn-app';

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findConfig() {
    const candidates = [
        path.join(process.env.APPDATA || '', 'firebase', 'tools.json'),
        path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'),
        path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    throw new Error('Nao encontrei o arquivo de configuracao do Firebase CLI (firebase-tools.json).');
}

function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (e) { json = null; }
                resolve({ status: res.statusCode, json, raw: data });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function getNewAccessToken(clientId, refreshToken) {
    const body = new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    }).toString();
    const r = await request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
    if (!r.json || !r.json.access_token) {
        throw new Error('Falha ao obter access token: ' + r.raw);
    }
    return r.json.access_token;
}

async function apiCall(accessToken, method, pathUrl, bodyObj) {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const r = await request({
        hostname: 'firebasestorage.googleapis.com',
        path: pathUrl,
        method: method,
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
            'Content-Length': body ? Buffer.byteLength(body) : 0
        }
    }, body);
    return r;
}

(async () => {
    console.log('===========================================');
    console.log('  FARN - Habilitar Firebase Storage');
    console.log('===========================================');

    let cfg;
    try {
        cfg = readJson(findConfig());
    } catch (e) {
        console.error('Erro: ' + e.message);
        console.error('Execute "firebase login" antes de rodar este arquivo.');
        process.exit(1);
    }

    const tokens = cfg.tokens;
    const user = cfg.user || {};
    const refreshToken = tokens && tokens.refresh_token;
    const clientId = user.azp || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';

    let accessToken = tokens && tokens.access_token;
    let tokenOk = false;

    console.log('Usuario: ' + (user.email || 'desconhecido'));
    console.log('Projeto: ' + PROJECT_ID);

    if (!accessToken) {
        console.error('Nenhum access token encontrado. Execute "firebase login" e tente novamente.');
        process.exit(1);
    }

    /* Testa o access token salvo; se 401, tenta renovar via refresh token. */
    let probe = await apiCall(accessToken, 'GET', '/v1alpha/projects/' + PROJECT_ID + '/defaultBucket');
    if (probe.status === 200 || probe.status === 404) {
        tokenOk = true;
        console.log('Usando access token ja salvo (valido).');
    }

    if (!tokenOk && refreshToken) {
        console.log('Access token expirado. Tentando renovar via refresh token...');
        try {
            accessToken = await getNewAccessToken(clientId, refreshToken);
            tokenOk = true;
            console.log('Access token renovado com sucesso.');
        } catch (e) {
            console.error('Nao foi possivel renovar o access token: ' + e.message);
            console.error('Execute "firebase login" para reautenticar e tente novamente.');
            process.exit(1);
        }
    }

    if (!tokenOk) {
        console.error('Nao foi possivel obter um access token valido. Execute "firebase login".');
        process.exit(1);
    }

    const basePath = '/v1alpha/projects/' + PROJECT_ID;

    console.log('\n[1/2] Verificando status do bucket padrao...');
    let r = probe;
    if (r.status === 200 && r.json && r.json.bucket) {
        console.log('Bucket padrao JA EXISTE e esta vinculado:');
        console.log('  ' + r.json.bucket);
        console.log('\nNothing a fazer. O Storage ja esta configurado.');
        console.log('Rode o publicar-regras.bat para aplicar as regras de seguranca.');
    } else if (r.status === 404) {
        console.log('Bucket padrao ainda nao criado. Tentando criar...');
        console.log('[2/2] Criando bucket padrao (' + PROJECT_ID + '.firebasestorage.app)...');
        let body = { location: 'us-central1' };
        let cr = await apiCall(accessToken, 'POST', basePath + '/defaultBucket', body);
        if (cr.status === 200 && cr.json && cr.json.bucket) {
            console.log('Bucket criado com sucesso!');
            console.log('  ' + cr.json.bucket);
            console.log('\nAgora rode o publicar-regras.bat para aplicar as regras de seguranca,');
            console.log('e depois podera cadastrar os cursos com PDF pelo painel admin.');
        } else {
            console.log('Nao foi possivel criar o bucket. Resposta do servidor:');
            console.log('  HTTP ' + cr.status + ': ' + (cr.raw || cr.json ? JSON.stringify(cr.json) : ''));
            if (cr.raw && cr.raw.indexOf('billing') !== -1 || (cr.json && JSON.stringify(cr.json).indexOf('billing') !== -1)) {
                console.log('\nProvavelmente o projeto esta no plano gratuito (Spark).');
                console.log('Para criar o bucket do Storage e necessario ativar o plano Blaze (pay-as-you-go).');
            }
        }
    } else {
        console.log('Resposta inesperada (HTTP ' + r.status + '): ' + r.raw);
    }

    console.log('\n===========================================');
    console.log('  Concluido.');
    console.log('===========================================');
})();
