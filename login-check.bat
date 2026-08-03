@echo off
title Diagnostico de Login - FARN
color 1F

cd /d "%~dp0"

echo.
echo === DIAGNOSTICO DE LOGIN DO ADMIN ===
echo.

echo 1. Iniciando Chrome em modo de debug...
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-first-run --user-data-dir="%temp%\tfm-login-debug" --remote-debugging-port=9305 --no-default-browser-check "http://localhost:8899/index.html" &

timeout /t 5 /nobreak >nul 2>&1

echo 2. Verificando se a pagina carregou...
curl -s "http://localhost:8899/index.html" -o nul -w "Status HTTP: %%http_code%%\n" 2>nul

echo.
echo === TENTE FAZER LOGIN MANUALMENTE ===
echo.
echo 1. Abra: http://localhost:8899/index.html
echo 2. Login:
echo    - Portal: Administrador
echo    - CPF: 050.049.594-71
echo    - Senha: 212121
echo.
echo 3. SE O LOGIN NAO FUNCIONAR:
echo    Pressione F12 no Chrome e veja ERROS NO CONSOLE
echo.
echo 4. ME ENVIE A FOTO DA ABa CONSOLE DO CHROME
echo.

echo Verificando arquivos...
if exist "index.html" (echo [OK] index.html) else (echo [FALTA] index.html)
if exist "app.js" (echo [OK] app.js) else (echo [FALTA] app.js)

echo.
echo === POSSIVEIS PROBLEMAS ===
echo 1. Servidor nao esta rodando - execute: firebase serve --port 8899
echo 2. Erro no app.js - verifique o console do Chrome
echo 3. CPF/Senha errado - use exatos: 05004959471 / 212121
echo.
pause