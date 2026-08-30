@echo off
title FARN - Habilitar Firebase Storage
echo ============================================
echo   FARN - Habilitar Firebase Storage
echo   (cria o bucket padrao de armazenamento)
echo ============================================
echo.
cd /d "%~dp0"
node "habilitar-storage.js"
echo.
echo ============================================
echo   PRONTO! Feche esta janela.
echo ============================================
pause
