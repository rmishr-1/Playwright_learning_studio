@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Issues a licence, asking for each detail: a new one for a person or team at Evoke (it opens
rem "Evoke Training Studio", the internal app), or a reissue of one already issued - a new end date
rem or a different computer - that keeps its ID. The licence goes into desktop\licences\. A new
rem customer gets their own app and licence from new-customer.bat instead. Needs Evoke's signing key
rem on this computer, kept encrypted for the Windows user in %USERPROFILE%\.evoke-studio\ (see
rem desktop\README.md).

if not exist "..\node_modules\tsx\dist\cli.mjs" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat in the studio folder first.
  pause & exit /b 1
)
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] Node.js is not on PATH. & pause & exit /b 1 )
rem CALL: node may be a .cmd shim from a version manager, which would otherwise not return here.
call node "..\node_modules\tsx\dist\cli.mjs" "scripts\licence-ask.ts" issue
echo.
pause
endlocal
