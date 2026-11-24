# =====================================================================
#  FARN - publicar o site inteiro no servidor Ubuntu
# ---------------------------------------------------------------------
#  Sobe os arquivos do site + o servidor.js por SSH e reinicia o servico.
#  Uso (duplo clique no PUBLICAR-NO-UBUNTU.bat, ou direto):
#     powershell -ExecutionPolicy Bypass -File servidor\publicar-site.ps1
#  Senha SSH: a do usuario farn (digite quando o scp/ssh pedir).
# =====================================================================
param(
    [string]$Destino = 'brandserv16041984@192.168.1.6',
    [int]$Porta = 22,
    [string]$PastaRemota = '/opt/farn',
    [switch]$SoServidor
)

$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $PSScriptRoot
$tar = Join-Path $env:TEMP 'farn-site-publicar.tgz'
$remotoSite = "$PastaRemota/servidor/public"

function Executar($exe, $argsLista) {
    & $exe @argsLista
    if ($LASTEXITCODE -ne 0) { throw "Falha ($LASTEXITCODE): $exe $($argsLista -join ' ')" }
}

Write-Host '======================================================'
Write-Host ' FARN - publicando no Ubuntu'
Write-Host " Destino : $Destino`:$PastaRemota"
Write-Host " Origem  : $origem"
Write-Host '======================================================'

if (!(Get-Command ssh -ErrorAction SilentlyContinue)) { throw 'ssh nao encontrado. Instale o OpenSSH Client no Windows.' }
if (!(Get-Command scp -ErrorAction SilentlyContinue)) { throw 'scp nao encontrado. Instale o OpenSSH Client no Windows.' }

if ($SoServidor) {
    Write-Host 'Enviando apenas servidor.js...'
    Executar 'scp' @('-P', "$Porta", (Join-Path $origem 'servidor\servidor.js'), "$Destino`:$PastaRemota/servidor/servidor.js")
} else {
    Write-Host 'Montando pacote do site (pode demorar um pouco, tem apostilas PDF)...'
    if (Test-Path $tar) { Remove-Item $tar -Force }

    # Mesma lista de exclusao do firebase.json + arquivos de desenvolvimento.
    $excluir = @(
        '--exclude=./servidor',
        '--exclude=./.git',
        '--exclude=./.firebase',
        '--exclude=./.wrangler',
        '--exclude=./node_modules',
        '--exclude=./ISIGNEAS',
        '--exclude=./opencode.exe',
        '--exclude=*.exe',
        '--exclude=*.db',
        '--exclude=*.db-*',
        '--exclude=*.ps1',
        '--exclude=*.bat',
        '--exclude=*.cmd',
        '--exclude=firebase.json',
        '--exclude=./.*',
        '--exclude=*/.*',
        '--exclude=opencode.json'
    )
    Executar 'tar' (@('-czf', $tar, '-C', $origem) + $excluir + @('.'))
    $mb = [math]::Round((Get-Item $tar).Length / 1MB, 1)
    Write-Host "Pacote: $mb MB"

    Write-Host 'Enviando pacote por SSH (digite a senha se pedir)...'
    Executar 'scp' @('-P', "$Porta", $tar, "$Destino`:$PastaRemota/servidor/site.tgz")

    # servidor.js vai dentro do proprio pacote para bastar uma conexao SSH.
    Copy-Item (Join-Path $origem 'servidor\servidor.js') (Join-Path $origem '__servidor_publicar.js') -Force
    Executar 'scp' @('-P', "$Porta", (Join-Path $origem '__servidor_publicar.js'), "$Destino`:$PastaRemota/servidor/servidor-novo.js")
    Remove-Item (Join-Path $origem '__servidor_publicar.js') -Force
}

$cmd = @"
set -e
cd $PastaRemota/servidor
mkdir -p public arquivos dados
"@
if (!$SoServidor) {
    $cmd += @"

    if [ -f site.tgz ]; then
      cp -a public public.antigo 2>/dev/null || true
      rm -rf public
      mkdir -p public
      tar -xzf site.tgz -C public
      rm -f site.tgz
      rm -rf public.antigo
    fi
    if [ -f servidor-novo.js ]; then
      cp servidor-novo.js servidor.js
      rm -f servidor-novo.js
    fi
"@
}
$cmd += @"

node --check servidor.js

# Reinicia a API. sudo pode exigir senha; nesse caso basta matar o processo
# do usuario farn -- o systemd (Restart=always) sobe de novo em 5 segundos.
if sudo -n systemctl restart farn-server 2>/dev/null; then
  echo 'Servico reiniciado via systemctl.'
else
  pkill -f 'node /opt/farn/servidor/servidor.js' 2>/dev/null || true
  echo 'Servico reiniciado pelo systemd (Restart=always).'
fi
sleep 4

echo '--- verificacao ---'
curl -fsS http://localhost:8787/api/ping
echo
printf 'Site: '
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8787/
printf 'Arquivo de teste: '
echo 'ok' >/tmp/farn-arquivo-teste.txt || true
curl -fsS -o /dev/null -X POST --data-binary @/tmp/farn-arquivo-teste.txt \
  'http://localhost:8787/api/upload?caminho=testes/publicacao.txt' && echo 'upload OK' || echo 'upload FALHOU'
echo
echo '--- URL do site (tunel) ---'
journalctl -u farn-tunel -n 300 --no-pager 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1 || true
"@

Write-Host 'Aplicando no servidor...'
Executar 'ssh' @('-p', "$Porta", $Destino, $cmd)

if (Test-Path $tar) { Remove-Item $tar -Force }
Write-Host ''
Write-Host 'Publicacao concluida. Abra a URL do tunel mostrada acima no navegador.'
