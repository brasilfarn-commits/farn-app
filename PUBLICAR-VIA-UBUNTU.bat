@echo off
chcp 65001 >nul
title FARN - Publicar via Ubuntu
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor\publicar-via-ubuntu.ps1" %*
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
