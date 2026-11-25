@echo off
chcp 65001 >nul
title FARN - Publicar site (sem sudo)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor\publicar-sem-sudo.ps1" %*
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
