#!/usr/bin/env node

/*
 * Admin Section Diagnostic Tool
 * Versão mais simples para debug de problemas
 * Uso: node admin-simple-check.js
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:8899';
const PORT = 9303;

function log(msg) {
    console.log(`[DIAGNOSTICO] ${msg}`);
}

async function main() {
    log('Iniciando script...');
    
    // Verificar se o Chrome existe
    try {
        fs.accessSync(CHROME, fs.constants.F_OK);
        log('Chrome encontrado em: ' + CHROME);
    } catch(e) {
        log('ERRO: Chrome não encontrado em: ' + CHROME);
        log('Por favor, instale o Google Chrome ou atualize o caminho.');
        process.exit(1);
    }
    
    let chrome;
    try {
        log('Iniciando Chrome...');
        chrome = spawn(CHROME, [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            `--user-data-dir=C:\\Users\\FARN\\AppData\\Local\\Temp\\opencode\\cdp-simple-check` + Date.now()`,
            `--remote-debugging-port=${PORT}`,
            '--no-default-browser-check',
            'about:blank'
        ], { stdio:'pipe' });
        
        chrome.stdout.on('data', data => {
            log('Chrome stdout: ' + data.toString().substring(0, 100));
        });
        
        chrome.stderr.on('data', data => {
            log('Chrome stderr: ' + data.toString().substring(0, 100));
        });
        
        log('Chrome iniciado, aguardando pronta para depuração...');
        
        // Aguardar até o Chrome estar pronto
        for (let i = 0; i < 50; i++) {
            try {
                await new Promise((resolve, reject) => {
                    const req = http.get('http://localhost:' + PORT + '/json/list', (res) => {
                        if (res.statusCode === 200) {
                            log('Chrome está pronto para depuração (tentativa ' + (i+1) + ')');
                            resolve();
                        } else {
                            reject(new Error('Status: ' + res.statusCode));
                        }
                    });
                    req.on('error', reject);
                    req.setTimeout(1000, () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                });
                break;
            } catch(e) {
                if (i === 49) {
                    log('ERRO: Timeout ao aguardar Chrome estar pronto');
                    log('Erro: ' + e.message);
                    log('\nPOSSÍVEIS CAUSAS:');
                    log('1. Caminho do Chrome está errado');
                    log('2. Chrome está bloqueado por firewall');
                    log('3. Porta ' + PORT + ' já está em uso');
                    log('4. Problemas de permissão do Windows');
                    log('\nSOLUÇÃO:');
                    log('- Tente executar o script como Administrador');
                    log('- Verifique se o Chrome está instalado em: ' + CHROME);
                    log('- Tente um número de porta diferente, ex: node admin-simple-check.js 9304');
                    process.exit(1);
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        log('Chrome está pronto para depuração!');
        
        // Executar o diagnóstico completo
        await runDiagnostic();
        
    } catch(e) {
        log('ERRO: ' + e.message);
        console.error(e);
        process.exit(1);
    } finally {
        if (chrome) {
            log('Encerrando Chrome...');
            chrome.kill();
        }
    }
}

async function runDiagnostic() {
    const tab = await fetch('http://localhost:'+PORT+'/json/new?'+encodeURIComponent(BASE+'/index.html'),{method:'PUT'}).then(r=>r.json());
    const ws=new WebSocket(tab.webSocketDebuggerUrl);
    let id=0; 
    const pending=new Map(); 
    const errors=[];
    
    function send(method,params){ 
        return new Promise((resolve,reject)=>{ 
            const mid=++id; 
            pending.set(mid,{resolve,reject}); 
            ws.send(JSON.stringify({id:mid,method,params:params||{}})); 
        }); 
    }
    
    ws.onmessage=ev=>{ 
        const msg=JSON.parse(ev.data); 
        if(msg.id&&pending.has(msg.id)){ 
            const p=pending.get(msg.id); 
            pending.delete(msg.id); 
            msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result); 
        } else if(msg.method==='Runtime.exceptionThrown'){ 
            errors.push(msg.params.exceptionDetails.text+(msg.params.exceptionDetails.exception?msg.params.exceptionDetails.exception.description:'')); 
        } 
    };
    
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    await send('Page.enable'); await send('Runtime.enable');
    await new Promise(r=>setTimeout(r,8000));
    
    const evl=async(expr)=>{ 
        const res=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); 
        if(res.exceptionDetails) return 'EXC:'+(res.exceptionDetails.exception&&res.exceptionDetails.exception.description); 
        return res.result.value; 
    };

    console.log('\n=== DIAGNÓSTICO DE ADMIN ===');
    console.log('ERROS:' + (errors.length ? errors.join('\n') : 'SEM ERROS'));
    
    console.log('\n=== 1. LOGIN ADMIN ===');
    await evl(`document.getElementById('landing-login-portal').value = 'admin'; document.getElementById('landing-login-cpf').value='050.049.594-71'; document.getElementById('landing-login-senha').value='212121';`);
    await evl(`landingLogin({preventDefault:function(){}})`);
    
    for(let i=0;i<10;i++){ 
        await new Promise(r=>setTimeout(r,500)); 
        const ok=await evl(`document.getElementById('screen-admin').classList.contains('active')`); 
        if(ok===true) break; 
    }
    
    console.log('LOGIN ADMIN: ' + (await evl(`currentUserData ? JSON.stringify({nome: currentUserData.nome, cpf: currentUserData.cpf}) : 'NULL'`)));

    // Testar uma seção específica como exemplo
    console.log('\n=== 2. TESTANDO TFM ===');
    await evl(`showAdminSection('admin-tfm', null)`);
    await new Promise(r=>setTimeout(r,500));
    
    const active = await evl(`document.getElementById('admin-tfm').classList.contains('active')`);
    console.log('TFM após show - Ativa: ' + active);
    
    // Chamar o inicializador
    try {
        await evl(`tfmInicializar()`);
        await new Promise(r=>setTimeout(r,3000));
        
        const afterActive = await evl(`document.getElementById('admin-tfm').classList.contains('active')`);
        const afterHtmlLen = await evl(`document.getElementById('admin-tfm').innerHTML.length`);
        const afterContent = await evl(`document.querySelector('#tfm-lista-body') !== null`);
        
        console.log('TFM após init - Ativa: ' + afterActive + ', HTML: ' + afterHtmlLen + ', Content: ' + (afterContent ? 'SIM' : 'NÃO'));
        
        if(afterContent === false) {
            console.log('\\n=== PROBLEMA DETECTADO ===');
            console.log('TFM está ativo mas não tem o elemento #tfm-lista-body');
            console.log('\\nPOSSÍVEIS SOLUÇÕES:');
            console.log('1. Verifique se o template (index.html) tem um elemento com id=\"tfm-lista-body\"');
            console.log('2. Verifique se tfmInicializar() está usando o ID correto');
            console.log('3. Execute tfmCarregarLista() manualmente:');
            console.log('   await tfmCarregarLista();');
        }
        
    } catch(e) {
        console.log('ERRO ao inicializar TFM: ' + e.message);
    }

    console.log('\n=== ERROS JS ===');
    console.log(errors.length ? errors.join('\n') : 'SEM ERROS');
}

main().catch(e => {
    console.error('ERRO:', e.message);
    process.exit(1);
});
