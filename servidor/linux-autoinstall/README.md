# Ubuntu Server — instalação 100% automática pelo pendrive

Este pacote deixa o PC novo **pronto sem digitar quase nada**: o Linux se instala sozinho, instala Node 24 + cloudflared, cria os serviços e começa a migração do D1.

> ⚠️ **O Windows será APAGADO.** Confira antes se não há arquivos importantes nesse PC e desative o BitLocker. Use **apenas um disco** ligado na máquina — o instalador `storage: layout: direct` usa o disco inteiro.

## Passo 1 — baixar o ISO

https://ubuntu.com/download/server → **`ubuntu-24.04-live-server-amd64.iso`** (~3 GB).

## Passo 2 — gravar com Rufus

1. Baixe o Rufus: https://rufus.ie
2. Selecione o pendrive (**será apagado**).
3. Selecione o ISO.
4. **Esquema de partição:** `GPT` · **Sistema de arquivos:** `FAT32` · **Modo de gravação:** ISO.
5. Clique em **Iniciar** e aguarde.

## Passo 3 — preparar o pendrive

Feche o Rufus. Na pasta `servidor\linux-autoinstall\` deste projeto, dê **duplo clique em `PREPARAR-PENDRIVE.bat`**.

Ele vai:
- copiar `user-data`, `meta-data` e `setup.sh` para a raiz do pendrive;
- copiar `servidor.js` e `migrar-d1.js` para `\servidor\`;
- editar o `grub.cfg` para adicionar `autoinstall ds=nocloud;s=/cdrom/`.

Digite a letra do pendrive quando perguntado. Se der erro "não achei grub.cfg", rode o Rufus de novo e conferia a letra.

## Passo 4 — instalar

1. Coloque o pendrive no PC servidor e ligue.
2. Se aparecer menu de boot, escolha o pendrive (F12/F8/ESC).
3. No menu GRUB, **pressione ENTER** (ou espere 10 s).
4. A instalação corre sozinha — **não mexa** — e reinicia ao final (10–25 min).
   **Retire o pendrive assim que o reinício começar**, para o cloud-init não reler a configuração.
5. No primeiro boot, o `setup.sh` roda automaticamente (mais 2–5 min).

> Use **cabo de rede**. O instalador e o setup precisam de internet.

## Passo 5 — pegar a URL do túnel

O PC pode ficar sem monitor. Acesse por SSH a partir do seu PC principal:

```bash
ssh farn@IP_DO_SERVIDOR
# senha: Farn@2026Servidor
```

Descubra o IP no roteador ( DHCP → `farn-servidor`) ou com `hostname -I` no servidor.

Depois, no SSH:

```bash
journalctl -u farn-tunel -f
```

Copie a linha `https://xxxx-xxxx.trycloudflare.com`.

## Passo 6 — configurar os navegadores

Em cada computador que usa o app, abra **Servidor Próprio** no administrador, cole a URL do túnel e salve. (A configuração fica no navegador, não no servidor.)

## O que já fica automático

| Item | Como |
|---|---|
| API SQLite na porta 8787 | `farn-server.service` (reinicia sozinho) |
| Túnel HTTPS | `farn-tunel.service` (reinicia sozinho) |
| Migração do D1 | `farn-migrar.timer` tenta a cada 15 min e **retoma** até terminar (inclusive após o reset da cota) |
| Backup do banco | cron diário às 03:00, mantém 7 dias em `/opt/farn/backups` |

## Comandos úteis (via SSH)

```bash
systemctl status farn-server farn-tunel
journalctl -u farn-server -f          # logs da API
journalctl -u farn-migrar -f          # andamento da migração
curl http://localhost:8787/api/stats  # quantos documentos já migraram
passwd farn                           # trocar a senha SSH
sudo poweroff                         # desligar com segurança
```

## Senha padrão

Usuário `farn`, senha `Farn@2026Servidor`. **Troque** com `passwd farn` após o primeiro acesso.

## Se algo falhar

- **Instalação pediu dados manualmente:** o `grub.cfg` não foi patchado —rode `PREPARAR-PENDRIVE.bat` de novo.
- **Setup não rodou:** `cat /var/log/farn-setup.log`.
- **Migração com erro de cota:** é normal; o timer tenta de novo sozinho após as 00:00 UTC (21:00 em Brasília).
- **Túnel não aparece:** `systemctl restart farn-tunel && journalctl -u farn-tunel -n 50`.
