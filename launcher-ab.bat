@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" ( echo Run setup.bat first. & exit /b 1 )

echo Starting the Learning Studio design options...
echo   backend   http://127.0.0.1:3010   (loopback only)
echo   Option A  http://localhost:5183
echo   Option B  http://localhost:5184
echo   Option C  http://localhost:5185   (B's dashboard + A's lessons)
echo.
echo If the backend is already running (for example from launcher.bat), its new window will
echo report the port in use and close - the running one keeps serving every option.
echo.
start "studio-backend" cmd /c "npm run dev:backend"
timeout /t 3 /nobreak >nul
start "studio-frontend-a" cmd /c "npm run dev:frontend-a"
start "studio-frontend-b" cmd /c "npm run dev:frontend-b"
start "studio-frontend-c" cmd /c "npm run dev:frontend-c"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5183"
start "" "http://localhost:5184"
start "" "http://localhost:5185"
echo All processes started in their own windows. Close them to stop.
endlocal
