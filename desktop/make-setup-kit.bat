@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Makes Evoke-Studio-Setup-Kit.exe on your desktop: the licence signing key, the record of issued
rem licences and every licence file in desktop\licences\, encrypted with a passphrase you choose.
rem Run the .exe on another computer - one with the studio cloned and set up - to let it build the
rem apps and issue licences too. Send the passphrase another way, and delete the kit once used.
rem Only on the computer that holds the signing key (see desktop\README.md).

if not exist "..\node_modules\tsx\dist\cli.mjs" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat in the studio folder first.
  pause & exit /b 1
)
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] Node.js is not on PATH. & pause & exit /b 1 )
rem CALL: node may be a .cmd shim from a version manager, which would otherwise not return here.
call node "..\node_modules\tsx\dist\cli.mjs" "scripts\setup-kit.ts" make
echo.
if not defined STUDIO_TOOLS pause
endlocal
