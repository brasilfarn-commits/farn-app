Execute o script de diagnóstico das seções do administrador no Windows PowerShell:

```powershell
node admin-check.js
```

Ou, se preferir a versão em batch:

```batch
@echo off
:: Admin Section Diagnostic Tool
:: Script para diagnosticar problemas nas seções: TFM, Recadastramento, Chat, Apostilas, Disciplinas, Notícias, Galeria e Pré-inscrição

echo =================================================================
echo SCRIPT DE DIAGNÓSTICO DE ADMIN

echo =================================================================
echo.
echo Execute usando:
echo   node admin-check.js
echo.
echo =================================================================

:: Matar processos anteriores do Chrome
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

:: Executar o diagnóstico
node admin-check.js

echo =================================================================
echo Diagnóstico concluído!
echo =================================================================
