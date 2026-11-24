@echo off
chcp 65001 >nul
title FARN - Publicar no Ubuntu
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor\publicar-site.ps1" %*
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
