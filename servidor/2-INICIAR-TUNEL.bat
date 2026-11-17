@echo off
chcp 65001 >nul
title FARN - Tunel Cloudflare
cd /d "%~dp0"
echo.
echo  ============================================
echo   FARN - TUNEL (HTTPS sem abrir portas)
echo  ============================================
echo.
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo  cloudflared nao encontrado.
  echo.
  echo  Baixe em: https://github.com/cloudflare/cloudflared/releases/latest
  echo  Baixe o arquivo: cloudflared-windows-amd64.exe
  echo  Renomeie para: cloudflared.exe
  echo  E coloque dentro desta pasta: %~dp0
  echo.
  echo  Depois rode este arquivo novamente.
  pause
  exit /b
)
echo  Abrindo o tunel... copie a URL https://xxxx.trycloudflare.com
echo  que aparecer e cole na pagina de configuracao do app.
echo.
echo Deixe esta janela ABERTA.
"%~dp0cloudflared.exe" tunnel --url http://localhost:8787
pause
