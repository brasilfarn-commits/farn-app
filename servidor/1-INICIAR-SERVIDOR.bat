@echo off
chcp 65001 >nul
title FARN - Servidor Local
cd /d "%~dp0"
echo.
echo  ============================================
echo   FARN - SERVIDOR LOCAL COM BANCO PROPRIO
echo  ============================================
echo.
echo  Iniciando na porta 8787...
echo  Banco: servidor\dados\farn.db
echo.
echo  Deixe esta janela ABERTA enquanto o app for usado.
echo  Para parar: CTRL + C
echo.
node "%~dp0servidor.js"
if errorlevel 1 (
  echo.
  echo  ERRO: Node.js nao encontrado ou falha ao iniciar.
  echo  Instale o Node.js em https://nodejs.org
)
pause
