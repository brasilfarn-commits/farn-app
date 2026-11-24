# =====================================================================
#  FARN - publicar o site inteiro no servidor Ubuntu
# ---------------------------------------------------------------------
#  Sobe os arquivos do site + o servidor.js por SSH e reinicia o servico.
#  Uso (duplo clique no PUBLICAR-NO-UBUNTU.bat, ou direto):
#     powershell -ExecutionPolicy Bypass -File servidor\publicar-site.ps1
#  A senha do Ubuntu pode vir da variavel FARN_SUDO_SENHA ou ser digitada.
# =====================================================================
param(
    [string]$Destino = 'brandserv16041984@192.168.1.6',
    [int]$Porta = 22,
    [string]$PastaRemota = '/opt/farn',
    [switch]$SoServidor,
    [string]$SudoSenha = $env:FARN_SUDO_SENHA
)

$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $PSScriptRoot
$tar = Join-Path $env:TEMP 'farn-site-publicar.tgz'
$remotoSite = "$PastaRemota/servidor/public"

function Executar($exe, $argsLista) {
    & $exe @argsLista
    if ($LASTEXITCODE -ne 0) { throw "Falha ($LASTEXITCODE): $exe $($argsLista -join ' ')" }
}

function ExecutarRemoto($scriptRemoto) {
    $entrada = if ($SudoSenha) { "$SudoSenha`n$scriptRemoto" } else { "`n$scriptRemoto" }
    $entrada | & ssh @sshArgs 'sudo -S bash -s'
    if ($LASTEXITCODE -ne 0) { throw "Falha ($LASTEXITCODE) ao executar comandos remotos." }
}

Write-Host '======================================================'
Write-Host ' FARN - publicando no Ubuntu'
Write-Host " Destino : $Destino`:$PastaRemota"
Write-Host " Origem  : $origem"
Write-Host '======================================================'

if (!(Get-Command ssh -ErrorAction SilentlyContinue)) { throw 'ssh nao encontrado. Instale o OpenSSH Client no Windows.' }
if (!(Get-Command scp -ErrorAction SilentlyContinue)) { throw 'scp nao encontrado. Instale o OpenSSH Client no Windows.' }

if (-not $SudoSenha) {
    $segura = Read-Host 'Senha sudo do Ubuntu' -AsSecureString
    $SudoSenha = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
}

$sshArgs = @('-p', "$Porta", '-o', 'StrictHostKeyChecking=no', $Destino)

if ($SoServidor) {
    Write-Host 'Enviando apenas servidor.js...'
    Executar 'scp' @('-P', "$Porta", (Join-Path $origem 'servidor\servidor.js'), "$Destino`:/tmp/farn-server-novo.js")
} else {
    Write-Host 'Montando pacote do site (pode demorar um pouco, tem apostilas PDF)...'
    if (Test-Path $tar) { Remove-Item $tar -Force }

    # Mesma lista de exclusao do firebase.json + arquivos de desenvolvimento.
    # Monta a lista de itens no PowerShell: um --exclude=./.* no tar exclui
    # a propria raiz e gerava um pacote vazio.
    $itens = Get-ChildItem -LiteralPath $origem -Force | Where-Object {
        $nome = $_.Name
        if ($nome -in @('servidor', '.git', '.firebase', '.wrangler', 'node_modules', 'ISIGNEAS', 'firebase.json', 'opencode.json')) { return $false }
        if ($nome -like '.*') { return $false }
        if ($_.Extension -in @('.exe', '.db', '.ps1', '.bat', '.cmd')) { return $false }
        if ($nome -match '\.db-') { return $false }
        return $true
    } | Select-Object -ExpandProperty Name
    if (!$itens -or $itens.Count -lt 5) { throw 'Lista de arquivos do site vazia; abortando.' }
    Executar 'tar' (@('-czf', $tar, '-C', $origem) + @($itens))
    $mb = [math]::Round((Get-Item $tar).Length / 1MB, 1)
    if ($mb -lt 1) { throw "Pacote com $mb MB: a lista de exclusao removeu todos os arquivos." }
    Write-Host "Pacote: $mb MB"

    Write-Host 'Enviando pacote por SSH...'
    Executar 'scp' @('-P', "$Porta", $tar, "$Destino`:/tmp/farn-site.tgz")

    # servidor.js vai dentro da propria pasta temporaria para bastar uma conexao.
    Copy-Item (Join-Path $origem 'servidor\servidor.js') (Join-Path $origem '__servidor_publicar.js') -Force
    Executar 'scp' @('-P', "$Porta", (Join-Path $origem '__servidor_publicar.js'), "$Destino`:/tmp/farn-server-novo.js")
    Remove-Item (Join-Path $origem '__servidor_publicar.js') -Force
}

$cmd = @"
set -e
cd $PastaRemota/servidor
mkdir -p public arquivos dados
"@
if (!$SoServidor) {
    $cmd += @"

if [ -f /tmp/farn-site.tgz ]; then
  cp -a public public.antigo 2>/dev/null || true
  rm -rf public
  mkdir -p public
  tar -xzf /tmp/farn-site.tgz -C public
  rm -f /tmp/farn-site.tgz
  rm -rf public.antigo
fi
"@
}
$cmd += @"

if [ -f /tmp/farn-server-novo.js ]; then
  cp /tmp/farn-server-novo.js servidor.js
  rm -f /tmp/farn-server-novo.js
fi
node --check servidor.js
systemctl restart farn-server
sleep 4

echo '--- verificacao ---'
curl -fsS http://localhost:8787/api/ping
echo
printf 'Site: '
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8787/
printf 'Arquivo de teste: '
echo 'ok' >/tmp/farn-arquivo-teste.txt
curl -fsS -o /dev/null -X POST --data-binary @/tmp/farn-arquivo-teste.txt \
  'http://localhost:8787/api/upload?caminho=testes/publicacao.txt' && echo 'upload OK' || echo 'upload FALHOU'
echo
echo '--- URL do site (tunel) ---'
journalctl -u farn-tunel -n 300 --no-pager 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1 || true
"@

Write-Host 'Aplicando no servidor...'
ExecutarRemoto $cmd

$SudoSenha = $null
if (Test-Path $tar) { Remove-Item $tar -Force }
Write-Host ''
Write-Host 'Publicacao concluida. Abra a URL do tunel mostrada acima no navegador.'
