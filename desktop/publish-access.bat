@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Publishes who has access, without changing the course or the app: after a licence is issued or
rem reissued (so it opens the course), or withdrawn (choose new keys, so it opens nothing from now
rem on and installed copies refuse it). Needs Evoke's signing key on this computer, and git signed in
rem to GitHub.

if not exist "..\node_modules\tsx\dist\cli.mjs" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat in the studio folder first.
  pause & exit /b 1
)
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] Node.js is not on PATH. & pause & exit /b 1 )
%SYS%\where.exe git >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] git is not on PATH. & pause & exit /b 1 )

echo.
echo   1. A licence was issued or reissued: give it access.
echo   2. A licence was withdrawn: new keys, so it opens nothing from now on.
echo.
set "CHOICE="
set /p "CHOICE=  Choose 1 or 2: "
set "REKEY="
if "%CHOICE%"=="2" set "REKEY=--rekey"
if not "%CHOICE%"=="1" if not "%CHOICE%"=="2" ( echo Nothing was published. & pause & exit /b 1 )
rem CALL: node may be a .cmd shim from a version manager, which would otherwise not return here.
call node "..\node_modules\tsx\dist\cli.mjs" "scripts\publish.ts" grants %REKEY%
echo.
pause
endlocal
