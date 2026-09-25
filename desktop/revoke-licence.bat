@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Revokes a licence: lists the licences in desktop\licences\, asks which and why, and adds it to
rem desktop\revoked.json, so builds made from now on refuse it. Then commit revoked.json, and
rem rebuild the app it opened (build-app.bat) and have it installed again: a copy already
rem installed keeps accepting the licence until then.

if not exist "..\node_modules\tsx\dist\cli.mjs" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat in the studio folder first.
  pause & exit /b 1
)
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] Node.js is not on PATH. & pause & exit /b 1 )
rem CALL: node may be a .cmd shim from a version manager, which would otherwise not return here.
call node "..\node_modules\tsx\dist\cli.mjs" "scripts\licence-ask.ts" revoke
echo.
pause
endlocal
