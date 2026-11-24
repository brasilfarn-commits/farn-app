#!/bin/bash
# =====================================================================
#  FARN - publicar site + servidor dentro do proprio Ubuntu
#  Executar logado por SSH:
#    curl -fsSL https://raw.githubusercontent.com/brasilfarn-commits/farn-app/master/servidor/publicar-no-servidor.sh | bash
# =====================================================================
set -e
DST=/opt/farn/servidor
TMP=/tmp/farn-publicar

echo "=============================================="
echo " FARN - publicando no servidor"
echo " Usuario: $(whoami)"
echo " Destino: $DST"
echo "=============================================="

if [ ! -d "$DST" ]; then
  echo "ERRO: pasta $DST nao existe."
  echo "Se o app estiver em outro caminho, me avise o caminho antes de continuar."
  exit 1
fi

# Codigo mais recente do GitHub
rm -rf "$TMP"
git clone --depth 1 -q https://github.com/brasilfarn-commits/farn-app.git "$TMP"
cd "$TMP"

# Site (mesma lista de exclusao do firebase.json)
tar czf /tmp/farn-site.tgz \
  --exclude=./servidor \
  --exclude=./.git \
  --exclude=./.firebase \
  --exclude=./.wrangler \
  --exclude=./node_modules \
  --exclude=./ISIGNEAS \
  --exclude='*.exe' \
  --exclude='*.db' \
  --exclude='*.db-*' \
  --exclude='*.ps1' \
  --exclude='*.bat' \
  --exclude='*.cmd' \
  --exclude=firebase.json \
  --exclude=./opencode.json \
  .

# Sem sudo se o usuario ja escrever na pasta
SUDO=""
if [ ! -w "$DST" ]; then SUDO="sudo"; echo "Vai pedir a senha do sudo."; fi

$SUDO mkdir -p "$DST/public" "$DST/arquivos" "$DST/dados"
$SUDO cp servidor/servidor.js "$DST/servidor.js"
$SUDO rm -rf "$DST/public"
$SUDO mkdir -p "$DST/public"
$SUDO tar xzf /tmp/farn-site.tgz -C "$DST/public"
$SUDO chown -R "$(stat -c '%U' "$DST" 2>/dev/null || echo farn)" "$DST/public" "$DST/arquivos" 2>/dev/null || true
rm -f /tmp/farn-site.tgz
rm -rf "$TMP"

node --check "$DST/servidor.js"

# Reinicia a API (sudo sem senha, se possivel; senao mata o processo e o
# systemd Restart=always sobe de novo)
if ! sudo -n systemctl restart farn-server 2>/dev/null; then
  pkill -f 'node /opt/farn/servidor/servidor.js' 2>/dev/null || true
  echo "Servico reiniciado via systemd (Restart=always)."
fi
sleep 4

echo "--- verificacao ---"
curl -fsS http://localhost:8787/api/ping && echo
printf 'Site: '
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8787/
echo "--- URL do site (tunel) ---"
journalctl -u farn-tunel -n 300 --no-pager 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1 || true
echo "=============================================="
echo "Concluido. Abra a URL acima no navegador."
