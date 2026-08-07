// LOCALSERV - servidor local do dispositivo (FARN)
// Recebe a foto 3x4 da carteira (campo "foto" em multipart/form-data)
// e salva uma copia na pasta "fotos-carteira" dentro da pasta do app.
//
// Como executar:
//   node localserv.js
// O servidor fica disponivel em: http://localhost:8899
//
// Endpoint:
//   POST /upload
//     multipart/form-data com o campo "foto" (arquivo de imagem)
//     e os campos opcionais cpf, matricula e nome.
//   GET /  - pagina de status.

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var PORT = process.env.PORT || 8899;
var DEST_DIR = path.join(__dirname, 'fotos-carteira');

// Criar a pasta de destino se nao existir
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

// Extrai campos de um corpo multipart/form-data.
// Retorna { campos: {nome: valorTexto}, arquivos: {nome: Buffer} }
function parseMultipart(contentType, body) {
    var result = { campos: {}, arquivos: {} };
    var m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
    if (!m) return result;
    var boundary = '--' + (m[1] || m[2]).trim();
    var boundaryBuf = Buffer.from(boundary, 'latin1');
    var parts = [];
    var start = 0;
    // Divide o corpo em partes separadas pelo boundary
    while (true) {
        var idx = body.indexOf(boundaryBuf, start);
        if (idx === -1) break;
        // Pula o proprio boundary (e o \r\n seguinte)
        start = idx + boundaryBuf.length;
        // Verifica se eh o final (boundary--)
        var fim = body.indexOf(Buffer.from('--', 'latin1'), start);
        if (fim === start) break;
        // Pula o \r\n
        if (body[start] === 13 && body[start + 1] === 10) start += 2;
        var endIdx = body.indexOf(boundaryBuf, start);
        if (endIdx === -1) break;
        var partBuf = body.slice(start, endIdx);
        // Remove o \r\n final da parte
        if (partBuf.length >= 2 && partBuf[partBuf.length - 2] === 13 && partBuf[partBuf.length - 1] === 10) {
            partBuf = partBuf.slice(0, partBuf.length - 2);
        }
        parts.push(partBuf);
        start = endIdx;
    }
    parts.forEach(function(part) {
        var headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
            headerEnd = part.indexOf('\n\n');
            if (headerEnd === -1) return;
            headerEnd += 1;
        }
        var head = part.slice(0, headerEnd).toString('latin1');
        var data = part.slice(headerEnd + 4);
        var nameM = /name="([^"]*)"/i.exec(head);
        if (!nameM) return;
        var name = nameM[1];
        var filenameM = /filename="([^"]*)"/i.exec(head);
        if (filenameM) {
            result.arquivos[name] = data;
        } else {
            result.campos[name] = data.toString('utf8');
        }
    });
    return result;
}

var server = http.createServer(function(req, res) {
    // Headers de CORS e Private Network Access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Private-Network-Access-Name', 'localserv');
    res.setHeader('Private-Network-Access-Id', 'carteira-farn');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/status')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>LOCALSERV FARN</title></head><body style="font-family:Arial;text-align:center;padding:40px"><h2>LOCALSERV - FARN</h2><p style="color:#16a34a;font-size:20px">Servidor local rodando.</p><p>Recebe fotos 3x4 da carteira em <b>POST /upload</b> (multipart/form-data, campo <b>foto</b>).</p><p>Pasta de destino: <b>' + DEST_DIR.replace(/\\/g, '/') + '</b></p></body></html>');
        return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
        var chunks = [];
        var size = 0;
        req.on('data', function(chunk) {
            chunks.push(chunk);
            size += chunk.length;
            if (size > 5 * 1024 * 1024) {
                req.destroy();
            }
        });
        req.on('end', function() {
            var body = Buffer.concat(chunks);
            try {
                var parsed = parseMultipart(req.headers['content-type'], body);
                var foto = parsed.arquivos['foto'];
                if (!foto || !foto.length) {
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.writeHead(400);
                    res.end(JSON.stringify({ ok: false, erro: 'Campo "foto" nao encontrado.' }));
                    return;
                }
                var cpf = (parsed.campos['cpf'] || '').replace(/\D/g, '');
                var matricula = parsed.campos['matricula'] || '';
                var nome = parsed.campos['nome'] || '';
                var ext = path.extname(parsed.campos['nome'] || '').toLowerCase();
                var safeExt = /^\.(jpg|jpeg|png|webp|gif)$/i.test(ext) ? ext : '.jpg';
                var nomeArquivo = (cpf || matricula || 'aluno').replace(/[^a-zA-Z0-9_-]/g, '') + '-' + Date.now() + safeExt;
                var destino = path.join(DEST_DIR, nomeArquivo);
                fs.writeFile(destino, foto, function(err) {
                    if (err) {
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.writeHead(500);
                        res.end(JSON.stringify({ ok: false, erro: 'Falha ao salvar: ' + err.message }));
                        return;
                    }
                    console.log('[' + new Date().toISOString() + '] Foto recebida: ' + nomeArquivo + ' (' + (foto.length / 1024).toFixed(1) + ' KB) cpf=' + cpf + ' nome=' + nome);
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true, arquivo: nomeArquivo }));
                });
            } catch (e) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.writeHead(500);
                res.end(JSON.stringify({ ok: false, erro: e.message }));
            }
        });
        return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, erro: 'Rota nao encontrada' }));
});

server.listen(PORT, '0.0.0.0', function() {
    console.log('====================================');
    console.log(' LOCALSERV FARN rodando');
    console.log(' URL: http://localhost:' + PORT);
    console.log(' Pasta: ' + DEST_DIR);
    console.log(' Pressione Ctrl+C para encerrar.');
    console.log('====================================');
});
