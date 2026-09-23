@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Playwright Learning Studio - setup

rem  setup.bat           check this computer, install everything, build the course
rem  setup.bat /check    only run the checks - installs nothing
rem  setup.bat /nopause  do not wait for a key at the end (for scripts)
rem
rem  It always stops with a message and waits for a key, so a double-clicked window never closes
rem  before the reason can be read.
set "CHECK_ONLY=no"
set "PAUSE_AT_END=yes"
for %%a in (%*) do (
  if /i "%%~a"=="/check"   set "CHECK_ONLY=yes"
  if /i "%%~a"=="/nopause" set "PAUSE_AT_END=no"
)

echo ==========================================================
echo  Playwright Learning Studio - setup
echo  Folder: %CD%
echo ==========================================================
echo.

if not exist "package.json" (
  echo [BLOCKING] package.json is not here. Run setup.bat from the repository folder,
  echo            not from a copy of the file on its own.
  goto :fail
)

rem ---------------------------------------------------------------- 1. Node.js
echo [1/5] Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] Node.js is not installed, or not on PATH.
  echo            Install Node 22.18 or later ^(the LTS^) from https://nodejs.org
  echo            then open a NEW window and run setup.bat again.
  goto :fail
)
set "NODEV="
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODEV=%%v"
if not defined NODEV (
  echo [BLOCKING] Node.js is on PATH but does not run. Reinstall it from https://nodejs.org
  goto :fail
)
echo       found node %NODEV%
rem  CALL, not a bare "node": Node installed through a version manager ^(nvm-windows, nodist and
rem  others^) can be a node.cmd shim, and running a .cmd from a batch file without CALL hands control
rem  to it and never returns - setup used to stop silently right here. "var", not newer syntax, so
rem  even a very old Node can run the check and report itself too old instead of failing to parse it.
call node -e "var v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=18)?0:1)" >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] Node %NODEV% is too old. The lessons run TypeScript files directly with node,
  echo            which needs Node 22.18 or later. Install the current LTS from https://nodejs.org
  echo            ^(with nvm-windows: nvm install lts ^&^& nvm use lts^), open a NEW window, run this again.
  goto :fail
)

rem ---------------------------------------------------------------- 2. npm
echo [2/5] npm
set "NPMV="
for /f "delims=" %%v in ('npm -v 2^>nul') do set "NPMV=%%v"
if not defined NPMV (
  echo [BLOCKING] npm did not run. It comes with Node - reinstall Node from https://nodejs.org
  goto :fail
)
echo       found npm %NPMV%

if /i "%CHECK_ONLY%"=="yes" (
  echo.
  echo [ OK ] All checks passed. Run setup.bat without /check to install.
  goto :done
)

rem ---------------------------------------------------------------- 3. dependencies
echo.
echo [3/5] Installing dependencies ^(the first time takes a few minutes^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [BLOCKING] npm install failed. Read the lines above. The usual causes:
  echo            - no internet, or a company proxy: npm config set proxy http://your-proxy:port
  echo            - a half-finished earlier install: delete the node_modules folder, run this again
  echo            - antivirus locking files: run this again once it has finished scanning
  goto :fail
)

rem ---------------------------------------------------------------- 4. browsers
echo.
echo [4/5] Installing the browsers the lessons test in: Chromium, Firefox and WebKit...
rem  --yes: never stop to ask "Need to install the following packages?" - it is already installed.
call npx --yes playwright install chromium firefox webkit
if errorlevel 1 (
  echo.
  echo [BLOCKING] Installing the browsers failed. Check the internet connection and run this again.
  goto :fail
)

if not exist "Data\Config\studio.config.json" (
  echo.
  echo Writing a local-dev Data\Config\studio.config.json ...
  copy /y "Data\Config\studio.config.example.json" "Data\Config\studio.config.json" >nul
)

rem ---------------------------------------------------------------- 5. course
echo.
echo [5/5] Building the course from Data\Source...
call npm run build:content
if errorlevel 1 (
  echo.
  echo [BLOCKING] The course did not build. Read the error above.
  goto :fail
)

echo.
echo ==========================================================
echo  All blocking checks passed. Run launcher.bat next.
echo ==========================================================

:done
if /i "%PAUSE_AT_END%"=="yes" pause
endlocal & exit /b 0

:fail
echo.
echo ==========================================================
echo  Setup stopped - nothing after this point was done.
echo  Fix the problem above, then run setup.bat again.
echo ==========================================================
if /i "%PAUSE_AT_END%"=="yes" pause
endlocal & exit /b 1
