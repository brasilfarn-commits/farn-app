#!/bin/bash
# Copiado para o pendrive e executado no PRIMEIRO boot do Ubuntu recem instalado.
# Instala Node 24, cloudflared, os servicos systemd e dispara a migracao do D1
# (que retoma sozinha apos o reset da cota).
set -e
export DEBIAN_FRONTEND=noninteractive
LOG=/var/log/farn-setup.log
exec > >(tee -a "$LOG") 2>&1
echo "=========================================="
echo " FARN SETUP - $(date)"
echo "=========================================="

apt-get update -y
apt-get install -y curl ca-certificates git cron

# Node.js 24 (o Node do apt eh 18 e NAO tem node:sqlite)
if ! node -v 2>/dev/null | grep -Eq '^v(2[4-9]|[3-9][0-9])'; then
  echo "Instalando Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# cloudflared
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Instalando cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb || apt-get -f install -y
  rm -f /tmp/cloudflared.deb
fi
echo "cloudflared instalado"

# Codigo do servidor
mkdir -p /opt/farn/servidor/dados /opt/farn/backups
if [ ! -f /opt/farn/servidor/servidor.js ]; then
  if [ -f /cdrom/servidor/servidor.js ]; then
    echo "Copiando servidor do pendrive..."
    cp /cdrom/servidor/servidor.js /opt/farn/servidor/
    cp /cdrom/servidor/migrar-d1.js /opt/farn/servidor/
  else
    echo "Clonando repositorio do GitHub..."
    git clone --depth 1 https://github.com/brasilfarn-commits/farn-app.git /tmp/farn-app
    cp /tmp/farn-app/servidor/servidor.js /opt/farn/servidor/
    cp /tmp/farn-app/servidor/migrar-d1.js /opt/farn/servidor/
    cp /tmp/farn-app/configurar-servidor.html /opt/farn/ 2>/dev/null || true
    rm -rf /tmp/farn-app
  fi
fi
chown -R farn:farn /opt/farn

# Servico da API
cat > /etc/systemd/system/farn-server.service <<'SERVICO'
[Unit]
Description=FARN Servidor Local (SQLite)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=farn
WorkingDirectory=/opt/farn/servidor
ExecStart=/usr/bin/node /opt/farn/servidor/servidor.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICO

# Servico do tunel
cat > /etc/systemd/system/farn-tunel.service <<'SERVICO'
[Unit]
Description=FARN Tunel Cloudflare (HTTPS)
After=network-online.target farn-server.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --url http://localhost:8787
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICO

# Migracao automatica: tenta a cada 15 min ate terminar
cat > /etc/systemd/system/farn-migrar.service <<'SERVICO'
[Unit]
Description=FARN Migracao D1 -> SQLite (retomavel)
After=network-online.target farn-server.service

[Service]
Type=oneshot
WorkingDirectory=/opt/farn/servidor
ExecStart=/bin/bash -c 'if [ ! -f /opt/farn/servidor/dados/.migrado ]; then /usr/bin/node /opt/farn/servidor/migrar-d1.js && touch /opt/farn/servidor/dados/.migrado; fi'
SERVICO

cat > /etc/systemd/system/farn-migrar.timer <<'SERVICO'
[Unit]
Description=FARN tenta migrar o D1 a cada 15 minutos
[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
AccuracySec=1min
[Install]
WantedBy=timers.target
SERVICO

# Backup diario do banco
cat > /usr/local/bin/farn-backup.sh <<'BACKUP'
#!/bin/bash
cp /opt/farn/servidor/dados/farn.db /opt/farn/backups/farn-$(date +%Y%m%d).db 2>/dev/null || true
find /opt/farn/backups -name 'farn-*.db' -mtime +7 -delete
BACKUP
chmod +x /usr/local/bin/farn-backup.sh
(crontab -l 2>/dev/null | grep -v farn-backup; echo "0 3 * * * /usr/local/bin/farn-backup.sh") | crontab -

# Ativa tudo
systemctl daemon-reload
systemctl enable --now cron
systemctl enable --now farn-server.service
systemctl enable --now farn-tunel.service
systemctl enable --now farn-migrar.timer

echo "=========================================="
echo " SETUP CONCLUIDO"
echo " IP local      : $(hostname -I)"
echo " API local     : http://localhost:8787/api/ping"
echo " Usuario SSH   : farn"
echo " Senha SSH     : Farn@2026Servidor  (troque: passwd farn)"
echo " URL do tunel  : journalctl -u farn-tunel -f"
echo " Migracao      : journalctl -u farn-migrar -f"
echo " Backup        : /opt/farn/backups (diario, 7 dias)"
echo "=========================================="
touch /var/log/farn-setup-concluido
