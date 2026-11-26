# =====================================================================
#  FARN - deploy COM SUDO dos arquivos alterados (WhatsApp na aprovacao)
# ---------------------------------------------------------------------
#  Envia somente cadastro-cursos.js e index.html e aplica com sudo numa
#  UNICA sessao SSH (evita o "Connection closed" do envio completo).
#  O servidor.js NAO foi alterado, por isso nao e enviado/reiniciado
#  separadamente; o servico e reiniciado no final do comando sudo.
#
#  Senha SSH : pedida pelo scp (uma vez).
#  Senha sudo: parametro -SudoSenha, variavel FARN_SUDO_SENHA ou prompt.
#
#  Uso:
#    powershell -NoProfile -ExecutionPolicy Bypass -File "DEPLOY-WHATSAPP-APROVACAO.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "DEPLOY-WHATSAPP-APROVACAO.ps1" -SudoSenha "SUA_SENHA_SUDO"
# =====================================================================
param(
    [string]$Destino = 'brandserv16041984@192.168.1.6',
    [int]$Porta = 22,
    [string]$PastaRemota = '/opt/farn',
    [string]$SudoSenha = $env:FARN_SUDO_SENHA
)

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $raiz

$arquivos = @('cadastro-cursos.js', 'index.html')

Write-Host '======================================================'
Write-Host ' FARN - deploy COM SUDO: WhatsApp na aprovacao'
Write-Host " Origem  : $raiz"
Write-Host " Destino : $Destino`:$PastaRemota/servidor/public/"
Write-Host '======================================================'

# Conferencia de seguranca: nao envia se a alteracao nao estiver nos arquivos.
$js = Get-Content -Raw -LiteralPath (Join-Path $raiz 'cadastro-cursos.js')
if ($js -notmatch 'ccPreMsgAprovacaoWhatsApp') {
    throw 'Alteracao do WhatsApp NAO encontrada em cadastro-cursos.js.'
}
if ($js -notmatch 'cpf\.substring\(0, 6\)') {
    throw 'Regra da senha (6 digitos do CPF) NAO encontrada em cadastro-cursos.js.'
}
$html = Get-Content -Raw -LiteralPath (Join-Path $raiz 'index.html')
if ($html -notmatch 'cadastro-cursos\.js\?v=44') {
    throw 'index.html nao esta com cadastro-cursos.js?v=44.'
}
Write-Host '[OK] Arquivos locais conferidos: cadastro-cursos.js e index.html'

if (!(Get-Command scp -ErrorAction SilentlyContinue)) { throw 'scp nao encontrado (OpenSSH Client).' }
if (!(Get-Command ssh -ErrorAction SilentlyContinue)) { throw 'ssh nao encontrado (OpenSSH Client).' }

if (-not $SudoSenha) {
    $segura = Read-Host 'Senha sudo do Ubuntu' -AsSecureString
    $SudoSenha = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
}

# Pasta temporaria local com so os dois arquivos -> uma unica conexao scp.
$tmpLocal = Join-Path $env:TEMP 'farn-deploy-wa'
if (Test-Path -LiteralPath $tmpLocal) { Remove-Item -LiteralPath $tmpLocal -Recurse -Force }
New-Item -ItemType Directory -Path $tmpLocal -Force | Out-Null
foreach ($nome in $arquivos) {
    Copy-Item -LiteralPath (Join-Path $raiz $nome) -Destination (Join-Path $tmpLocal $nome) -Force
}

try {
    Write-Host ''
    Write-Host '[1/2] Enviando arquivos (digite a senha SSH)...'
    & scp -P "$Porta" -o 'StrictHostKeyChecking=no' -r $tmpLocal "${Destino}:/tmp/"
    if ($LASTEXITCODE -ne 0) { throw "Falha no scp (codigo $LASTEXITCODE)" }

    $cmd = @"
set -e
rm -f /tmp/farn-site.tgz /tmp/farn-server-novo.js
cd /tmp/farn-deploy-wa
cp -f cadastro-cursos.js $PastaRemota/servidor/public/cadastro-cursos.js
cp -f index.html $PastaRemota/servidor/public/index.html
rm -rf /tmp/farn-deploy-wa
grep -Fq 'ccPreMsgAprovacaoWhatsApp' $PastaRemota/servidor/public/cadastro-cursos.js
grep -Fq 'cadastro-cursos.js?v=44' $PastaRemota/servidor/public/index.html
echo '[OK] Arquivos conferidos no servidor.'
systemctl restart farn-server
sleep 4
echo '[2/2] Verificando...'
curl -fsS http://localhost:8787/api/ping
echo
printf 'HTTP site: '
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8787/
echo 'URL do tunel:'
journalctl -u farn-tunel -n 300 --no-pager 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1 || true
"@

    Write-Host '[2/2] Aplicando com sudo (digite a senha sudo)...'
    "$SudoSenha`n$cmd" | & ssh -p "$Porta" -o 'StrictHostKeyChecking=no' $Destino 'sudo -S bash -s'
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar no servidor (codigo $LASTEXITCODE)" }
}
finally {
    $SudoSenha = $null
    if (Test-Path -LiteralPath $tmpLocal) { Remove-Item -LiteralPath $tmpLocal -Recurse -Force }
}

Write-Host ''
Write-Host 'Deploy com sudo concluido.'
Write-Host 'No celular: feche e reabra o portal (ou Ctrl+F5) para pegar a nova versao.'
