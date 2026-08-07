@echo off
title LOCALSERV FARN - Recebedor de Fotos 3x4
cd /d "%~dp0"
echo ============================================
echo  LOCALSERV FARN
echo  Recebe as fotos 3x4 da carteira do aluno
echo  e salva na pasta "fotos-carteira".
echo  URL: http://localhost:8899
echo  Para encerrar feche esta janela.
echo ============================================
echo.
node localserv.js
pause
