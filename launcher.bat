@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Playwright Learning Studio - launcher

rem  launcher.bat          start the Learning Studio (the original frontend) and open it
rem  launcher.bat /noopen  start it without opening the browser
rem  Option C has its own launcher: launcher-ab.bat
rem
rem  Anything already running is reused, not started twice: a second backend used to crash with
rem  "EADDRINUSE: address already in use 127.0.0.1:3010".
set "BACKEND_PORT=3010"
set "STUDIO_PORT=5180"
set "STUDIO_SCRIPT=dev:frontend"
set "STUDIO_NAME=the Playwright Learning Studio"
set "OPEN=yes"
if /i "%~1"=="/noopen" set "OPEN=no"

echo ==========================================================
echo  Starting %STUDIO_NAME%
echo    backend  http://127.0.0.1:%BACKEND_PORT%   (loopback only)
echo    studio   http://localhost:%STUDIO_PORT%
echo ==========================================================
echo.

call :preflight || goto :fail

call :port_busy %BACKEND_PORT%
if errorlevel 1 (
  echo [start] backend...
  start "studio-backend" cmd /k "npm run dev:backend"
) else (
  echo [ ok  ] The backend is already running on port %BACKEND_PORT% - using it.
)

call :port_busy %STUDIO_PORT%
if errorlevel 1 (
  echo [start] studio...
  start "studio-frontend" cmd /k "npm run %STUDIO_SCRIPT%"
) else (
  echo [ ok  ] The studio is already running on port %STUDIO_PORT% - using it.
)

echo.
echo Waiting for both to answer ^(up to a minute the first time^)...
call :wait_port %BACKEND_PORT% 60
if errorlevel 1 (
  echo [WARN] The backend has not started. Look at the "studio-backend" window for the reason.
)
call :wait_port %STUDIO_PORT% 60
if errorlevel 1 (
  echo [ERROR] The studio has not started. Look at the "studio-frontend" window for the reason.
  goto :fail
)

echo [ ok  ] Ready: http://localhost:%STUDIO_PORT%
if /i "%OPEN%"=="yes" start "" "http://localhost:%STUDIO_PORT%"
echo.
echo The backend and the studio run in their own windows. Close those windows to stop them.
ping -n 4 127.0.0.1 >nul 2>&1
endlocal & exit /b 0

rem ================================================================ helpers

:preflight
where node >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] Node.js is not installed, or not on PATH. Run setup.bat first.
  exit /b 1
)
rem  CALL: node may be a .cmd shim from a version manager - see setup.bat.
call node -e "var v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=18)?0:1)" >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] This Node.js is older than 22.18. Install the current LTS from https://nodejs.org
  echo            then run setup.bat again.
  exit /b 1
)
if not exist "node_modules\vite" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat first.
  exit /b 1
)
exit /b 0

rem  Is something listening on port %1? errorlevel 0 = yes. Matches the listening row by its
rem  address rather than the word LISTENING, which Windows translates on non-English systems.
:port_busy
netstat -ano 2>nul | findstr /l /c:":%1 " | findstr /l /c:"0.0.0.0:0 " /c:"[::]:0 " >nul 2>&1
exit /b %errorlevel%

rem  Wait up to %2 seconds for port %1 to be listening. errorlevel 0 = it is.
:wait_port
set /a WAITED=0
:wait_port_loop
call :port_busy %1
if not errorlevel 1 exit /b 0
if %WAITED% GEQ %2 exit /b 1
rem  ping, not timeout: timeout refuses to run when input is redirected, and then does not wait at all.
ping -n 2 127.0.0.1 >nul 2>&1
set /a WAITED+=1
goto :wait_port_loop

:fail
echo.
echo Nothing more was started. Fix the problem above, then run this again.
pause
endlocal & exit /b 1
