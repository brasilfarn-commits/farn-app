@echo off
echo ============================================
echo   FARN - Configurar Firestore Rules
echo ============================================
echo.

cd /d "C:\Users\FARN\Documents\New OpenCode Project\farn-app"

echo [1/3] Fazendo login no Firebase...
firebase login --no-localhost
if errorlevel 1 (
    echo ERRO no login. Tente novamente.
    pause
    exit /b 1
)

echo.
echo [2/3] Selecionando projeto...
firebase use --add farn-app

echo.
echo [3/3] Publicando regras do Firestore...
firebase deploy --only firestore:rules

echo.
echo ============================================
echo   PRONTO! Feche esta janela.
echo ============================================
pause
