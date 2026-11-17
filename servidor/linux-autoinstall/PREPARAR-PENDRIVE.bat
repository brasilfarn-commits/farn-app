@echo off
chcp 65001 >nul
title FARN - Preparar pendrive (autoinstall)
cd /d "%~dp0"
echo.
echo  ================================================================
echo   FARN - PREPARAR PENDRIVE PARA INSTALACAO AUTOMATICA
echo  ================================================================
echo.
echo  ANTES: grave o ISO ubuntu-24.04-live-server-amd64.iso no pendrive
echo  com o Rufus (modo ISO, GPT + UEFI). O penddrive SERA APAGADO.
echo.
set /p UNID="Letra do pendrive (ex.: E)]: "
if "%UNID%"=="" (echo Letra nao informada. & pause & exit /b 1)
set PEN=%UNID%:\

if not exist "%PEN%boot\grub\grub.cfg" (
  echo.
  echo  ERRO: nao achei %PEN%boot\grub\grub.cfg
  echo  Rode o Rufus primeiro e digite a letra correta do pendrive.
  pause
  exit /b 1
)

echo.
echo Copiando arquivos de configuracao...
copy /Y "%~dp0user-data" "%PEN%" >nul
copy /Y "%~dp0meta-data" "%PEN%" >nul
copy /Y "%~dp0setup.sh" "%PEN%" >nul

echo Copiando codigo do servidor...
if not exist "%PEN%servidor" mkdir "%PEN%servidor"
copy /Y "%~dp0..\servidor.js" "%PEN%servidor\" >nul
copy /Y "%~dp0..\migrar-d1.js" "%PEN%servidor\" >nul

echo Ajustando o GRUB para instalar sozinho...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-grub.ps1" "%PEN%boot\grub\grub.cfg"

echo.
echo  ================================================================
echo   PRONTO!
echo   1. Escope o pendrive com seguranca.
echo   2. Coloque no PC servidor e ligue.
echo   3. Pressione ENTER no menu GRUB (ou espere 10 segundos).
echo   4. A instalacao corrente sozinha (10 a 25 minutos) e reinicia.
echo   5. No primeiro boot, o setup.sh instala Node, tunel e servicos.
echo  ================================================================
echo.
echo  Usuario: farn
echo  Senha  : Farn@2026Servidor  (troque depois com: passwd farn)
echo.
pause
