@echo off
chcp 65001 >nul
title FARN - Publicar arquivos alterados
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor\publicar-arquivos-alterados.ps1" %*
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
