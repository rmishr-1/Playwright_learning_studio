@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)

rem  launcher.bat          start the Learning Studio and open it
rem  launcher.bat /noopen  start it without opening the browser
rem
rem  Anything already running is reused, not started twice: a second backend used to crash with
rem  "EADDRINUSE: address already in use 127.0.0.1:3010".
set "BACKEND_PORT=3010"
set "STUDIO_PORT=5185"
set "OPEN=yes"
if /i "%~1"=="/noopen" set "OPEN=no"

if not exist "node_modules" ( echo Run setup.bat first. & goto :fail )

echo Starting the Learning Studio...
echo   backend  http://127.0.0.1:%BACKEND_PORT%   (loopback only)
echo   studio   http://localhost:%STUDIO_PORT%
echo.

rem  cmd /k, not /c: if a server crashes, its window stays open with the error in it.
call :port_busy %BACKEND_PORT%
if errorlevel 1 (
  start "studio-backend" %SYS%\cmd.exe /k "npm run dev:backend"
) else (
  echo [ ok  ] The backend is already running on port %BACKEND_PORT% - using it.
)
call :port_busy %STUDIO_PORT%
if errorlevel 1 (
  start "studio-frontend" %SYS%\cmd.exe /k "npm run dev:frontend"
) else (
  echo [ ok  ] The studio is already running on port %STUDIO_PORT% - using it.
)

echo Waiting for both to answer (up to a minute the first time)...
call :wait_port %BACKEND_PORT% 60
if errorlevel 1 echo [WARN] The backend has not started. Look at the "studio-backend" window for the reason.
call :wait_port %STUDIO_PORT% 60
if errorlevel 1 (
  echo [ERROR] The studio has not started. Look at the "studio-frontend" window for the reason.
  goto :fail
)

echo [ ok  ] Ready: http://localhost:%STUDIO_PORT%
if /i "%OPEN%"=="yes" start "" "http://localhost:%STUDIO_PORT%"
echo Both processes run in their own windows. Close them to stop.
endlocal & exit /b 0

rem ================================================================ helpers

rem  Is something listening on port %1? errorlevel 0 = yes. Matches the listening row by its
rem  address rather than the word LISTENING, which Windows translates on non-English systems.
:port_busy
%SYS%\netstat.exe -ano 2>nul | %SYS%\findstr.exe /l /c:":%1 " | %SYS%\findstr.exe /l /c:"0.0.0.0:0 " /c:"[::]:0 " >nul 2>&1
exit /b %errorlevel%

rem  Wait up to %2 seconds for port %1 to be listening. errorlevel 0 = it is.
:wait_port
set /a WAITED=0
:wait_port_loop
call :port_busy %1
if not errorlevel 1 exit /b 0
if %WAITED% GEQ %2 exit /b 1
rem  ping, not timeout: timeout refuses to run when input is redirected, and then does not wait at all.
%SYS%\ping.exe -n 2 127.0.0.1 >nul 2>&1
set /a WAITED+=1
goto :wait_port_loop

:fail
echo.
echo Nothing more was started. Fix the problem above, then run this again.
pause
endlocal & exit /b 1
