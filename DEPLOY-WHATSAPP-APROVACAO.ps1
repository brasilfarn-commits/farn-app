# =====================================================================
#  FARN - deploy COM SUDO das alteracoes (WhatsApp, zoom e Portal do Formado)
# ---------------------------------------------------------------------
#  Envia somente os arquivos alterados e aplica com sudo numa UNICA
#  sessao SSH (evita o "Connection closed" do envio completo do site).
#  O servidor.js NAO foi alterado; o servico so e reiniciado no final.
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

$arquivos = @(
    'app.js',
    'cadastro-cursos.js',
    'cadastro-cursos-nucleo.js',
    'campos-pessoa-comuns.js',
    'coordenacao.js',
    'ficha-geral-compartilhar.js',
    'farn-manutencao.js',
    'formado-acesso.js',
    'foto3x4-visualizar.js',
    'noticias-feed.js',
    'portal-formado.html',
    'portal-formado.js',
    'service-worker.js',
    'tema-game.css',
    'index.html',
    'consultar-regularidade.html',
    'noticias.html',
    'portal-aluno.html',
    'portal-coordenacao.html',
    'portal-coordenacao.js',
    'portal-curso.html',
    'portal-curso.js',
    'portal-docente.html',
    'portal-docente.js',
    'pre-inscricao-via-link.html',
    'recadastramento.html'
)

Write-Host '======================================================'
Write-Host ' FARN - deploy COM SUDO: WhatsApp, zoom e Portal do Formado'
Write-Host " Origem  : $raiz"
Write-Host " Destino : $Destino`:$PastaRemota/servidor/public/"
Write-Host " Arquivos: $($arquivos.Count)"
Write-Host '======================================================'

# Conferencias locais: nao envia nada se uma alteracao estiver faltando.
$js = Get-Content -Raw -LiteralPath (Join-Path $raiz 'cadastro-cursos.js')
if ($js -notmatch 'ccPreMsgAprovacaoWhatsApp') { throw 'Funcao da mensagem NAO encontrada em cadastro-cursos.js.' }
if ($js -notmatch 'cpf\.substring\(0, 6\)') { throw 'Regra da senha (6 digitos do CPF) NAO encontrada.' }
if ($js -notmatch 'ccSiteBaseURL') { throw 'Gerador da URL atual NAO encontrado em cadastro-cursos.js.' }
if ($js -notmatch 'ccDeclaracaoPersonalizada') { throw 'cadastro-cursos.js nao personaliza a declaracao na guia Certificado.' }
if ($js -match 'https://farn-app\.web\.app') { throw 'A URL antiga ainda esta em cadastro-cursos.js.' }
$html = Get-Content -Raw -LiteralPath (Join-Path $raiz 'index.html')
if ($html -notmatch 'cadastro-cursos\.js\?v=47') { throw 'index.html nao esta com cadastro-cursos.js?v=47.' }
if ($html -notmatch 'foto3x4-visualizar\.js\?v=1') { throw 'index.html nao carrega o visualizador de zoom.' }
if ($html -notmatch 'option value="formado"') { throw 'index.html nao tem a opcao FORMADO no login.' }
if ($html -notmatch 'formado-acesso\.js\?v=3') { throw 'index.html nao carrega a regra de acesso do formado.' }
$not = Get-Content -Raw -LiteralPath (Join-Path $raiz 'noticias.html')
if ($not -notmatch 'formado-acesso\.js\?v=3') { throw 'noticias.html nao carrega a regra de acesso do formado.' }
if ($not -notmatch 'app\.js\?v=138') { throw 'noticias.html nao esta com app.js?v=138.' }
$app = Get-Content -Raw -LiteralPath (Join-Path $raiz 'app.js')
if ($app -notmatch 'landingLoginFormado') { throw 'app.js nao tem o login do formado.' }
if ($app -notmatch 'togglePortalManutencao') { throw 'app.js nao tem o controle de manutencao por portal.' }
$manut = Get-Content -Raw -LiteralPath (Join-Path $raiz 'farn-manutencao.js')
if ($manut -notmatch 'farnManutencao') { throw 'farn-manutencao.js nao encontrado.' }
if ($html -notmatch 'btn-portal-aluno') { throw 'index.html nao tem os botoes por portal.' }
if ($html -match 'btn-portal-curso') { throw 'index.html ainda tem o botao do portal curso.' }
$formado = Get-Content -Raw -LiteralPath (Join-Path $raiz 'formado-acesso.js')
if ($formado -notmatch 'turmaDoFormulario') { throw 'formado-acesso.js nao le inicio/previsao da turma.' }
if ($formado -notmatch 'farnDeclaracaoPersonalizar') { throw 'formado-acesso.js nao tem a regra da declaracao.' }
if ($formado -notmatch "'\[CRED\]': matricula") { throw 'formado-acesso.js nao troca [CRED] pela matricula.' }
if ($formado -notmatch "turma\.previsao") { throw 'formado-acesso.js nao usa a previsao da turma em [FIM].' }
$portal = Get-Content -Raw -LiteralPath (Join-Path $raiz 'portal-formado.js')
if ($portal -notmatch 'farnDeclaracaoPersonalizar') { throw 'portal-formado.js nao usa a regra da declaracao.' }
$sw = Get-Content -Raw -LiteralPath (Join-Path $raiz 'service-worker.js')
if ($sw -notmatch 'farn-v137') { throw 'service-worker.js nao esta com o cache farn-v137.' }
if ($sw -notmatch './farn-manutencao\.js') { throw 'service-worker.js nao inclui o controle de manutencao.' }
if ($sw -notmatch './foto3x4-visualizar\.js') { throw 'service-worker.js nao inclui o visualizador.' }
if ($sw -notmatch './portal-formado\.html') { throw 'service-worker.js nao inclui o portal do formado.' }
if ($sw -notmatch './tema-game\.css') { throw 'service-worker.js nao inclui o tema game.' }
$tema = Get-Content -Raw -LiteralPath (Join-Path $raiz 'tema-game.css')
if ($tema -notmatch 'TEMA GAME 3D') { throw 'tema-game.css nao encontrado ou incompleto.' }
if ($html -notmatch 'tema-game\.css\?v=9') { throw 'index.html nao carrega o tema game.' }
Write-Host '[OK] Arquivos locais conferidos.'

if (!(Get-Command scp -ErrorAction SilentlyContinue)) { throw 'scp nao encontrado (OpenSSH Client).' }
if (!(Get-Command ssh -ErrorAction SilentlyContinue)) { throw 'ssh nao encontrado (OpenSSH Client).' }

if (-not $SudoSenha) {
    $segura = Read-Host 'Senha sudo do Ubuntu' -AsSecureString
    $SudoSenha = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
}

# Pasta temporaria so com os arquivos alterados -> uma unica conexao scp.
$tmpLocal = Join-Path $env:TEMP 'farn-deploy-atual'
if (Test-Path -LiteralPath $tmpLocal) { Remove-Item -LiteralPath $tmpLocal -Recurse -Force }
New-Item -ItemType Directory -Path $tmpLocal -Force | Out-Null
foreach ($nome in $arquivos) {
    $origem = Join-Path $raiz $nome
    if (!(Test-Path -LiteralPath $origem)) { throw "Arquivo local ausente: $nome" }
    Copy-Item -LiteralPath $origem -Destination (Join-Path $tmpLocal $nome) -Force
}

$copias = ($arquivos | ForEach-Object { 'cp -f ' + $_ + ' "$DEST/' + $_ + '"' }) -join "`n"

$modelo = @'
set -e
DEST=__DEST__
rm -f /tmp/farn-site.tgz /tmp/farn-server-novo.js /tmp/farn-deploy-wa
cd /tmp/farn-deploy-atual
__COPIAS__
rm -rf /tmp/farn-deploy-atual
grep -Fq 'ccPreMsgAprovacaoWhatsApp' "$DEST/cadastro-cursos.js"
grep -Fq 'ccSiteBaseURL' "$DEST/cadastro-cursos.js"
grep -Fq 'ccDeclaracaoPersonalizada' "$DEST/cadastro-cursos.js"
grep -Fq 'farnDeclaracaoPersonalizar' "$DEST/formado-acesso.js"
if grep -Fq 'https://farn-app.web.app' "$DEST/cadastro-cursos.js"; then
  echo 'ERRO: a URL antiga ainda esta no servidor.'
  exit 1
fi
grep -Fq 'cadastro-cursos.js?v=47' "$DEST/index.html"
grep -Fq 'foto3x4-visualizar.js?v=1' "$DEST/index.html"
grep -Fq 'option value="formado"' "$DEST/index.html"
grep -Fq 'landingLoginFormado' "$DEST/app.js"
grep -Fq 'togglePortalManutencao' "$DEST/app.js"
grep -Fq 'farnManutencao' "$DEST/farn-manutencao.js"
grep -Fq 'btn-portal-aluno' "$DEST/index.html"
grep -Fq 'formado-acesso.js?v=3' "$DEST/noticias.html"
grep -Fq 'farn-v137' "$DEST/service-worker.js"
grep -Fq './farn-manutencao.js' "$DEST/service-worker.js"
grep -Fq './tema-game.css' "$DEST/service-worker.js"
grep -Fq 'TEMA GAME 3D' "$DEST/tema-game.css"
grep -Fq 'tema-game.css?v=9' "$DEST/index.html"
test -f "$DEST/foto3x4-visualizar.js"
test -f "$DEST/formado-acesso.js"
test -f "$DEST/portal-formado.html"
test -f "$DEST/portal-formado.js"
echo '[OK] Arquivos e versoes conferidos no servidor.'
systemctl restart farn-server
sleep 4
echo '[2/2] Verificando...'
curl -fsS http://localhost:8787/api/ping
echo
printf 'HTTP site: '
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8787/
echo 'URL do tunel:'
journalctl -u farn-tunel -n 300 --no-pager 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1 || true
'@

$cmd = $modelo.Replace('__DEST__', "$PastaRemota/servidor/public").Replace('__COPIAS__', $copias)

try {
    Write-Host ''
    Write-Host '[1/2] Enviando arquivos (digite a senha SSH)...'
    & scp -P "$Porta" -o 'StrictHostKeyChecking=no' -r $tmpLocal "${Destino}:/tmp/"
    if ($LASTEXITCODE -ne 0) { throw "Falha no scp (codigo $LASTEXITCODE)" }

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
