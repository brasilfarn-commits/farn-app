# FARN — Servidor próprio em casa (leitura ilimitada)

Este modo troca o Cloudflare D1 por um **banco SQLite no seu computador**. Não há limite diário de leituras nem de escritas. O Firebase Hosting continua hospedando o site (estático) normalmente.

## Como funciona

```
Navegador (farn-app.web.app)
        |  HTTPS
        v
Túnel Cloudflare (trycloudflare.com)
        |  http://localhost:8787
        v
servidor.js  ->  servidor/dados/farn.db  (SQLite)
```

- `servidor/servidor.js` replica **exatamente** a API do Worker (`/api/all`, `/api/changes`, `/api/set`, `/api/delete`, `/api/batch`, `/api/import`, `/api/ping`) e acrescenta `/api/stats`.
- `farn-db.js` passou a usar a URL salva no navegador. Todo o resto do app continua igual.
- O servidor mantém um **cache em memória** das coleções: leituras repetidas nem consultam o SQLite.

## Instalação (uma vez)

1. Instale o **Node.js 22.5+** (recomendado 24): https://nodejs.org
   - O `node:sqlite` já vem embutido — **não precisa instalar nada**.
2. Rode a migração (copia os dados do D1 para o seu PC):
   ```
   node servidor\servidor.js
   ```
   Em outra janela:
   ```
   node servidor\migrar-d1.js
   ```
   > Se der erro de limite diário do D1, espere as **00:00 UTC (21:00 em Brasília)** e rode o comando de novo. Ele retoma de onde parou.
3. Para expor na internet, baixe o **cloudflared**:
   https://github.com/cloudflare/cloudflared/releases/latest
   Baixe `cloudflared-windows-amd64.exe`, renomeie para `cloudflared.exe` e coloque dentro da pasta `servidor`.

## Uso diário

1. Rode `servidor\1-INICIAR-SERVIDOR.bat` — deixe a janela aberta.
2. Rode `servidor\2-INICIAR-TUNEL.bat` — deixe a janela aberta.
3. Copie a URL `https://xxxx.trycloudflare.com` que aparecer.
4. No administrador, abra **Servidor Próprio** (menu lateral), cole a URL e clique em **Salvar e usar servidor próprio**.
5. Recarregue o app com **Ctrl+F5**.

Se o PC reiniciar, a URL do túnel muda — atualize novamente no passo 4.

## Voltar para a nuvem

Em **Servidor Próprio**, clique em **Voltar para a nuvem (Worker/D1)**. O app volta a usar `https://farn-api.farn-api-farn.workers.dev` imediatamente.

## Segurança

- O túnel **não abre portas** no roteador e já sai com HTTPS válido.
- A URL do `trycloudflare.com` é aleatória e não indexada — trate-a como senha.
- Para exigir token, inicie o servidor com:
  ```
  set FARN_TOKEN=seu_token_aqui
  node servidor\servidor.js
  ```
  e informe o mesmo token na página de configuração.

## Backup

O banco é um único arquivo: `servidor\dados\farn.db`. Copie esse arquivo para outro disco/nuvem regularmente — ele contém **todos** os cadastros, notas, apontamentos e cursos.

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `OFFLINE` na página de configuração | Servidor ou túnel desligado | Rodar os dois `.bat` |
| Dados antigos aparecendo | Cache do navegador | Ctrl+F5 |
| Erro `Token invalido` | Token diferente no servidor e no navegador | Conferir o campo Token |
| `node:sqlite` não encontrado | Node < 22.5 | Atualizar o Node.js |
| D1 `exceeded free tier` na migração | Cota diária | Rodar de novo após 00:00 UTC |
