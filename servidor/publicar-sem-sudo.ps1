# =====================================================================
#  FARN - publicar arquivos do site SEM SUDO
# ---------------------------------------------------------------------
#  O servidor.js le os HTML/JS/CSS do disco em cada requisicao, entao
#  so precisa substituir os arquivos em servidor/public. Nao reinicia
#  servico e nao pede senha sudo: usa apenas a senha SSH do usuario.
# =====================================================================
param(
    [string]$Destino = 'brandserv16041984@192.168.1.6',
    [int]$Porta = 22,
    [string]$PastaRemota = '/opt/farn'
)

$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $PSScriptRoot
$tar = Join-Path $env:TEMP 'farn-site-publicar.tgz'

function Executar($exe, $argsLista) {
    & $exe @argsLista
    if ($LASTEXITCODE -ne 0) { throw "Falha ($LASTEXITCODE): $exe $($argsLista -join ' ')" }
}

Write-Host '======================================================'
Write-Host ' FARN - publicando site (sem sudo)'
Write-Host " Destino : $Destino`:$PastaRemota"
Write-Host " Origem  : $origem"
Write-Host '======================================================'

if (!(Get-Command ssh -ErrorAction SilentlyContinue)) { throw 'ssh nao encontrado.' }
if (!(Get-Command scp -ErrorAction SilentlyContinue)) { throw 'scp nao encontrado.' }

$itens = Get-ChildItem -LiteralPath $origem -Force | Where-Object {
    $nome = $_.Name
    if ($nome -in @('servidor', '.git', '.firebase', '.wrangler', 'node_modules', 'ISIGNEAS', 'firebase.json', 'opencode.json')) { return $false }
    if ($nome -like '.*') { return $false }
    if ($_.Extension -in @('.exe', '.db', '.ps1', '.bat', '.cmd')) { return $false }
    if ($nome -match '\.db-') { return $false }
    return $true
} | Select-Object -ExpandProperty Name
if (!$itens -or $itens.Count -lt 5) { throw 'Lista de arquivos vazia; abortando.' }

Write-Host 'Montando pacote do site...'
if (Test-Path $tar) { Remove-Item $tar -Force }
Executar 'tar' (@('-czf', $tar, '-C', $origem) + @($itens))
$mb = [math]::Round((Get-Item $tar).Length / 1MB, 1)
if ($mb -lt 1) { throw "Pacote com $mb MB: abortando." }
Write-Host "Pacote: $mb MB"

$sshArgs = @('-p', "$Porta", '-o', 'StrictHostKeyChecking=no', $Destino)

Write-Host 'Enviando pacote por SSH...'
Executar 'scp' @('-P', "$Porta", $tar, "$Destino`:/tmp/farn-site.tgz")

$cmd = @"
set -e
echo '[1/3] Extraindo site...'
cd $PastaRemota/servidor
tar -xzf /tmp/farn-site.tgz -C public
rm -f /tmp/farn-site.tgz
echo '[2/3] Verificando no servidor...'
curl -fsS -o /dev/null -w 'HTTP: %{http_code}\n' http://localhost:8787/portal-aluno.html
if curl -fsS http://localhost:8787/portal-aluno.html | grep -q 'Apontamento'; then
  echo 'NOVO SITE OK (secao Apontamento presente)'
else
  echo 'ATENCAO: secao Apontamento ainda nao apareceu'
fi
echo '[3/3] URL do tunel:'
journalctl -u farn-tunel -n 300 --no-pager 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1 || true
"@

Write-Host 'Aplicando no servidor...'
" `n$cmd" | & ssh @sshArgs 'bash -s'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair no servidor (sem permissao de escrita?).' }

if (Test-Path $tar) { Remove-Item $tar -Force }
Write-Host 'Publicacao concluida.'
