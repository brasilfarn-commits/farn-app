# =====================================================================
#  FARN - publicar so os arquivos alterados (sem sudo e sem tar)
# ---------------------------------------------------------------------
#  Envia cada arquivo via SCP direto para servidor/public. Nao abre
#  sessao SSH interativa (evita o "Connection closed" do bash -s) e nao
#  reinicia servico: o servidor.js le os arquivos do disco em cada GET.
# =====================================================================
param(
    [string]$Destino = 'brandserv16041984@192.168.1.6',
    [int]$Porta = 22,
    [string]$PastaRemota = '/opt/farn'
)

$ErrorActionPreference = 'Stop'
$origem = Split-Path -Parent $PSScriptRoot
$remoto = "$Destino`:$PastaRemota/servidor/public/"

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

Write-Host '======================================================'
Write-Host ' FARN - publicando arquivos alterados'
Write-Host " Destino : $remoto"
Write-Host '======================================================'

if (!(Get-Command scp -ErrorAction SilentlyContinue)) { throw 'scp nao encontrado.' }

$caminhos = @()
foreach ($nome in $arquivos) {
    $caminho = Join-Path $origem $nome
    if (!(Test-Path $caminho)) { throw "Arquivo nao encontrado: $nome" }
    Write-Host "-> $nome"
    $caminhos += $caminho
}

# Uma unica conexao SCP: pede a senha uma vez e envia tudo junto.
$argsLista = @('-P', "$Porta", '-o', 'StrictHostKeyChecking=no') + $caminhos + @($remoto)
& scp @argsLista
if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar arquivos (codigo $LASTEXITCODE)" }

Write-Host ''
Write-Host 'Arquivos enviados. O servidor le do disco em cada requisicao;'
Write-Host 'feche e reabra o portal no celular para pegar a nova versao.'
