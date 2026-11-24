# FARN — tudo no servidor Ubuntu (site + dados + arquivos)

O servidor próprio publica **o app inteiro**: páginas, JavaScript, imagens, banco SQLite e os arquivos enviados pelo app (fotos, vídeos, apostilas, insignias). O Firebase Hosting não é mais necessário — isso também resolve a cota estourada do Hosting.

```
Navegador  --->  https://xxxx.trycloudflare.com  (túnel HTTPS)
                          |
                          v
                 servidor.js (porta 8787)
                    |         |          |
              /public      /dados    /arquivos
              (site)     (SQLite)   (uploads)
```

## Publicar (no PC, quando quiser atualizar o Ubuntu)

1. Dê **duplo clique em `PUBLICAR-NO-UBUNTU.bat`** (na raiz do projeto).
2. Digite a senha SSH do usuário `farn` quando o `scp`/`ssh` pedir (pode pedir 2 ou 3 vezes).
3. O script envia os arquivos, reinicia `farn-server` e mostra no final a **URL do túnel**.
4. Abra essa URL no navegador. Não precisa mais abrir `farn-app.web.app`.

Se quiser enviar só o `servidor.js` (sem o site todo):
```
powershell -ExecutionPolicy Bypass -File servidor\publicar-site.ps1 -SoServidor
```

Para outro servidor/porta:
```
powershell -ExecutionPolicy Bypass -File servidor\publicar-site.ps1 -Destino farn@192.168.1.6 -Porta 22
```

## O que muda para os usuários

- A URL do túnel passa a ser o **site**, não só a API. Site e API ficam na mesma origem — sem CORS, sem configuração manual em cada navegador.
- Os arquivos novos vão para `/opt/farn/servidor/arquivos/` e as URLs gravadas no banco são `https://<túnel>/api/arquivo/...`.
- **Arquivos antigos do Firebase Storage continuam abrindo** normalmente (as URLs antigas seguem válidas). O app só deixa de enviar arquivos novos para lá.
- Se o túnel reiniciar e mudar de endereço, basta abrir a nova URL: as URLs de arquivo antigas mudam de host, mas o app continua funcionando porque os caminhos são relativos à origem atual. (Se algum registro tiver URL antiga gravada, ela é identificada pelo `/api/arquivo/` e reescrita para a origem atual.)

## Estrutura no Ubuntu

| Caminho | Conteúdo |
|---|---|
| `/opt/farn/servidor/servidor.js` | API + servidor de arquivos + site |
| `/opt/farn/servidor/public/` | site publicado (HTML/JS/CSS/imagens) |
| `/opt/farn/servidor/arquivos/` | uploads (fotos, vídeos, insignias, apostilas) |
| `/opt/farn/servidor/dados/farn.db` | banco SQLite com todos os cadastros |
| `/opt/farn/backups/` | backup diário do banco (7 dias) |

## Instalação inicial (se precisar reinstalar)

O pacote `servidor/linux-autoinstall` instala Node 24, cloudflared, os serviços e faz a migração do D1. Depois rode o `PUBLICAR-NO-UBUNTU.bat` para subir o site.

Usuário SSH inicial: `farn` · senha padrão: `Farn@2026Servidor` (troque com `passwd farn`).

## Serviços

```bash
systemctl status farn-server farn-tunel
journalctl -u farn-server -f          # logs da API/site
journalctl -u farn-tunel -f           # pegar a URL https do túnel
curl http://localhost:8787/api/ping
curl http://localhost:8787/api/sistema
```

## Backup

Copie para outro disco/nuvem, com regularidade:

```bash
tar czf backup-farn-$(date +%Y%m%d).tgz \
  /opt/farn/servidor/dados/farn.db \
  /opt/farn/servidor/arquivos
```

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Site não abre na URL do túnel | `farn-server` parado | `sudo systemctl restart farn-server` |
| `403/404` em imagem antiga | URL do Firebase expirou | reenviar a imagem pelo app |
| Página velha após publicar | cache do navegador/service worker | Ctrl+F5 |
| `upload FALHOU` no script | disco cheio ou permissão | ver `journalctl -u farn-server -n 50` |
| Túnel mudou de endereço | reinício do `farn-tunel` | pegar a nova URL em `journalctl -u farn-tunel -f` |
