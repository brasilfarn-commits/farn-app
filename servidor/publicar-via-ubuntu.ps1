# =====================================================================
#  FARN - preparar publicacao enviando arquivos para o Ubuntu
# ---------------------------------------------------------------------
#  O sudo -S via pipe falha neste servidor, mas o sudo interativo
#  funciona. Por isso a etapa final usa ssh -t (terminal remoto):
#  o sudo pede a senha normalmente no proprio PowerShell.
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
    'cadastro-cursos-nucleo.js',
    'coordenacao.js',
    'ficha-geral-compartilhar.js',
    'index.html',
    'noticias.html',
    'portal-aluno.html',
    'portal-docente.html',
    'portal-docente.js',
    'portal-curso.html',
    'portal-curso.js',
    'portal-permissoes.js',
    'service-worker.js',
    'style.css'
)

$sshArgs = @('-p', "$Porta", '-o', 'StrictHostKeyChecking=no', $Destino)
# -t aloca um TTY remoto; sem isso o sudo recusa pedir a senha
# ("sudo: A terminal is required to authenticate").
$sshArgsTty = @('-t', '-p', "$Porta", '-o', 'StrictHostKeyChecking=no', $Destino)

Write-Host '======================================================'
Write-Host ' FARN - preparando publicacao no Ubuntu'
Write-Host " Destino final: $PastaPublic"
Write-Host '======================================================'

# A pasta /tmp/farn-publicar ja existe apos a primeira publicacao. Evita
# abrir uma conexao SSH extra so para cria-la (e pedir mais uma senha).
# Se o servidor foi reinstalado, crie manualmente: mkdir -p /tmp/farn-publicar

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
Write-Host 'Aplicando arquivos no servidor...'
Write-Host 'Digite a senha SSH e, quando pedir, a senha sudo.'
& ssh @sshArgsTty "sudo cp $tmpRemoto/* $PastaPublic/ && sudo rm -f $PastaPublic/portal-usuario.html && echo '--- Verificacao ---' && grep -c 'Apontamento' $PastaPublic/portal-aluno.html && grep -c 'DOCENTE' $PastaPublic/index.html && ls -l $PastaPublic/portal-docente.html $PastaPublic/portal-docente.js"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao aplicar arquivos no servidor.' }
Write-Host 'Deploy concluido. Reabra o portal no celular.'
