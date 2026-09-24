@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
cd /d "%~dp0"
rem Issues a licence to a new customer and builds the app they get: a zip, their licence file and a
rem read-me, in desktop\deliveries\. Needs Evoke's signing key (desktop\keys) on this computer.

if not exist "..\node_modules" (
  echo Installing the studio's packages, first time only...
  pushd .. & call npm install --no-audit --no-fund & popd
)
if not exist "node_modules" (
  echo Installing the build tools, first time only...
  call npm install --no-audit --no-fund
)

call npm run new-customer --silent
echo.
pause
endlocal
