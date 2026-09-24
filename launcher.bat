@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)

if not exist "node_modules" ( echo Run setup.bat first. & exit /b 1 )

echo Starting the Learning Studio...
echo   backend  http://127.0.0.1:3010   (loopback only)
echo   studio   http://localhost:5185
echo.
start "studio-backend" cmd /c "npm run dev:backend"
%SYS%\timeout.exe /t 3 /nobreak >nul
start "studio-frontend" cmd /c "npm run dev:frontend"
%SYS%\timeout.exe /t 4 /nobreak >nul
start "" "http://localhost:5185"
echo Both processes started in their own windows. Close them to stop.
endlocal
