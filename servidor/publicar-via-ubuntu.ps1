# =====================================================================
#  FARN - preparar publicacao enviando arquivos para o Ubuntu
# ---------------------------------------------------------------------
#  O sudo -S via pipe falha neste servidor, mas o sudo interativo
#  funciona. Entao este script so envia os arquivos para /tmp e o
#  usuario finaliza com um sudo normal dentro do propio Ubuntu.
# =====================================================================
param(
    [string]$Destino = 'brandserv16041984@192.168.1.6',
    [int]$Porta = 22,
    [string]$PastaPublic = '/opt/farn/servidor/public'
)

$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $PSScriptRoot
$tmpRemoto = '/tmp/farn-publicar'

$arquivos = @(
    'aluno-acesso.js',
    'app.js',
    'cadastro-cursos.js',
    'coordenacao.js',
    'index.html',
    'noticias.html',
    'portal-aluno.html',
    'portal-permissoes.js',
    'portal-usuario.html',
    'service-worker.js',
    'style.css'
)

$sshArgs = @('-p', "$Porta", '-o', 'StrictHostKeyChecking=no', $Destino)

Write-Host '======================================================'
Write-Host ' FARN - preparando publicacao no Ubuntu'
Write-Host " Destino final: $PastaPublic"
Write-Host '======================================================'

Write-Host 'Criando pasta temporaria no Ubuntu (digite a senha SSH)...'
& ssh @sshArgs "mkdir -p $tmpRemoto"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar pasta temporaria.' }

$caminhos = @()
foreach ($nome in $arquivos) {
    $caminho = Join-Path $origem $nome
    if (!(Test-Path $caminho)) { throw "Arquivo nao encontrado: $nome" }
    Write-Host "-> $nome"
    $caminhos += $caminho
}

Write-Host 'Enviando arquivos por SCP (digite a senha SSH)...'
$argsLista = @('-P', "$Porta", '-o', 'StrictHostKeyChecking=no') + $caminhos + @("$Destino`:$tmpRemoto/")
& scp @argsLista
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar arquivos.' }

Write-Host ''
Write-Host 'Arquivos enviados. Agora, DENTRO DO UBUNTU, execute:'
Write-Host ''
Write-Host "  sudo cp $tmpRemoto/* $PastaPublic/"
Write-Host ''
Write-Host 'Digite a senha quando o sudo pedir. Depois reabra o portal no celular.'
