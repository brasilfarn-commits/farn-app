@echo off
chcp 65001 >nul
title FARN - Publicar no Ubuntu (senha padrao)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor\publicar-site.ps1" -SudoSenha "Farn@2026Servidor"
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
