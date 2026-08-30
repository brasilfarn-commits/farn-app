'use strict';
const fs = require('fs');
const https = require('https');
const path = require('path');

const PROJECT_ID = 'farn-app';

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function findConfig() {
    const candidates = [
        path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'),
        path.join(process.env.APPDATA || '', 'firebase', 'tools.json')
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error('firebase-tools.json nao encontrado.');
}

function request(host, pathUrl, method, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname: host, path: pathUrl, method, headers: { Authorization: 'Bearer ' + token } }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    const cfg = readJson(findConfig());
    const accessToken = cfg.tokens && cfg.tokens.access_token;
    if (!accessToken) { console.error('Sem access token.'); process.exit(1); }

    console.log('== Projeto Firebase (firebase.googleapis.com) ==');
    let r = await request('firebase.googleapis.com', '/v1beta1/projects/' + PROJECT_ID, 'GET', accessToken);
    console.log('HTTP ' + r.status);
    try {
        const j = JSON.parse(r.body);
        console.log('displayName:', j.displayName);
        console.log('projectId:', j.projectId);
        console.log('state:', j.state);
        console.log('resources:', JSON.stringify(j.resources || {}));
    } catch (e) { console.log(r.body.slice(0, 2000)); }

    console.log('\n== Billing (billing.googleapis.com) ==');
    r = await request('billing.googleapis.com', '/v1/projects/' + PROJECT_ID + '/billingInfo', 'GET', accessToken);
    console.log('HTTP ' + r.status);
    try {
        const j = JSON.parse(r.body);
        console.log('billingEnabled:', j.billingEnabled);
        console.log('billingAccountName:', j.billingAccountName);
    } catch (e) { console.log(r.body.slice(0, 2000)); }

    console.log('\n== Verificando buckets vinculados (firebasestorage) ==');
    r = await request('firebasestorage.googleapis.com', '/v1beta/projects/' + PROJECT_ID + '/buckets', 'GET', accessToken);
    console.log('HTTP ' + r.status);
    console.log(r.body.slice(0, 2000));
})();
