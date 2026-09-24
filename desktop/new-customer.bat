@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Issues a licence to a new customer and builds the app they get: a zip, their licence file and a
rem read-me, in desktop\deliveries\. Needs Evoke's signing key on this computer: it is kept, encrypted
rem for the Windows user, in %USERPROFILE%\.evoke-studio\ (see desktop\README.md).

rem Packages' install scripts run only where package.json allows them (allowScripts), which npm 11
rem enforces. An older npm would run every one of them.
set "NPM_MAJOR=0"
for /f "tokens=1 delims=." %%m in ('npm -v 2^>nul') do set "NPM_MAJOR=%%m"
if %NPM_MAJOR% LSS 11 (
  echo [BLOCKING] npm 11 or later is needed ^(found %NPM_MAJOR%^). Install the current Node 24 LTS, which comes with it.
  pause & exit /b 1
)

if not exist "..\node_modules" (
  echo Installing the studio's packages, first time only...
  pushd .. & call npm ci --no-audit --no-fund & popd
)
if not exist "node_modules" (
  echo Installing the build tools, first time only...
  call npm ci --no-audit --no-fund
)

call npm run new-customer --silent
echo.
pause
endlocal
