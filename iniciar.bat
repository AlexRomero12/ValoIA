@echo off
cd /d "%~dp0"

where docker >nul 2>nul
if %errorlevel%==0 (
    echo Levantando con Docker...
    docker compose up -d --build
    if %errorlevel%==0 (
        timeout /t 6 /nobreak >nul
        start "" "http://localhost:4321"
        echo Dash en http://localhost:4321 - Para detener: docker compose down
        exit /b 0
    )
    echo Docker fallo, usando modo local...
)

if not exist ".next" (
    echo Primera vez: construyendo...
    call npm run build
)
start "" "http://localhost:4321"
echo Dash en http://localhost:4321 - Cierra esta ventana para detener
set PORT=4321
node node_modules\next\dist\bin\next start
