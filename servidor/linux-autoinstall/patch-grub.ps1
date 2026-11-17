param([Parameter(Mandatory=$true)][string]$Arquivo)

$conteudo = [IO.File]::ReadAllText($Arquivo)
if ($conteudo -match 'autoinstall') {
    Write-Host 'OK: o grub.cfg ja estava preparado.'
    exit 0
}

# Substitui apenas as linhas 'linux ...', preservando as quebras de linha originais.
$padrao = '(?m)^([ \t]*linux\b[^\r\n]*)$'
$avaliador = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $linha = $m.Groups[1].Value
    $pos = $linha.IndexOf(' ---')
    if ($pos -ge 0) {
        return $linha.Substring(0, $pos) + ' autoinstall ds=nocloud;s=/cdrom/' + $linha.Substring($pos)
    }
    return $linha + ' autoinstall ds=nocloud;s=/cdrom/'
}
$novo = [regex]::Replace($conteudo, $padrao, $avaliador)

if ($novo -eq $conteudo) {
    Write-Host 'AVISO: nenhuma linha linux encontrada no grub.cfg.'
} else {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Arquivo, $novo, $utf8)
    Write-Host 'OK: GRUB preparado para autoinstall.'
}
