@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" ( echo Run setup.bat first. & exit /b 1 )

echo Starting the Learning Studio...
echo   backend  http://127.0.0.1:3010   (loopback only)
echo   studio   http://localhost:5185
echo.
start "studio-backend" cmd /c "npm run dev:backend"
timeout /t 3 /nobreak >nul
start "studio-frontend" cmd /c "npm run dev:frontend"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5185"
echo Both processes started in their own windows. Close them to stop.
endlocal
