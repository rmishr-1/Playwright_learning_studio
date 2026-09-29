@echo off
<<<<<<< HEAD
setlocal EnableExtensions
cd /d "%~dp0"
title Playwright Learning Studio - setup

rem  setup.bat           check this computer, install everything, build the course
rem  setup.bat /check    only run the checks - installs nothing
=======
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)

rem  setup.bat           check this computer, install everything, build the course
>>>>>>> origin/main
rem  setup.bat /nopause  do not wait for a key at the end (for scripts)
rem
rem  It always stops with a message and waits for a key, so a double-clicked window never closes
rem  before the reason can be read.
<<<<<<< HEAD
set "CHECK_ONLY=no"
set "PAUSE_AT_END=yes"
for %%a in (%*) do (
  if /i "%%~a"=="/check"   set "CHECK_ONLY=yes"
  if /i "%%~a"=="/nopause" set "PAUSE_AT_END=no"
)
=======
set "PAUSE_AT_END=yes"
if /i "%~1"=="/nopause" set "PAUSE_AT_END=no"
>>>>>>> origin/main

echo ==========================================================
echo  Playwright Learning Studio - setup
echo  Folder: %CD%
echo ==========================================================
echo.

<<<<<<< HEAD
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
=======
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] Node.js is not on PATH. Install Node 22.18 or later and re-run.
  goto :fail
)
for /f "tokens=*" %%v in ('node -v') do echo   node %%v
rem The TypeScript lessons run .ts files directly with node, which needs Node 22.18 or later.
rem CALL, not a bare "node": Node installed through a version manager (nvm-windows, nodist and
rem others) can be a node.cmd shim, and running a .cmd from a batch file without CALL hands control
rem to it and never returns - setup used to stop silently right here.
call node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo [BLOCKING] Node 22.18 or later is needed: the TypeScript lessons run .ts files directly.
  goto :fail
)

rem Packages' install scripts run only where package.json allows them (allowScripts, with
rem strict-allow-scripts in .npmrc). Only an npm that knows that setting enforces it: an older one
rem would run every install script, so it is refused. npm says "Unknown project config" for a
rem setting it does not know.
set "NPM_MAJOR=0"
for /f "tokens=1 delims=." %%m in ('npm -v 2^>nul') do set "NPM_MAJOR=%%m"
set "STRICT="
for /f "delims=" %%v in ('npm config get strict-allow-scripts 2^>nul') do set "STRICT=%%v"
set "UNKNOWN="
for /f "delims=" %%v in ('npm config get strict-allow-scripts 2^>^&1 ^| %SYS%\findstr.exe /c:"Unknown project config"') do set "UNKNOWN=1"
if %NPM_MAJOR% LSS 11 set "UNKNOWN=1"
if /i not "%STRICT%"=="true" set "UNKNOWN=1"
if defined UNKNOWN (
  echo [BLOCKING] This npm does not enforce the studio's install-script rules. Install the current
  echo            Node 24 LTS, which comes with an npm that does, and run this again.
  goto :fail
)

echo.
echo Installing dependencies...
call npm ci --no-audit --no-fund --strict-allow-scripts --no-dangerously-allow-all-scripts
if errorlevel 1 ( echo [BLOCKING] npm ci failed. & goto :fail )
>>>>>>> origin/main

if /i "%CHECK_ONLY%"=="yes" (
  echo.
  echo [ OK ] All checks passed. Run setup.bat without /check to install.
  goto :done
)

rem ---------------------------------------------------------------- 3. dependencies
echo.
<<<<<<< HEAD
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
=======
echo Installing the browsers the lessons test in: Chromium, Firefox and WebKit...
rem The studio's own Playwright, never one npx would fetch.
call node node_modules\playwright\cli.js install chromium firefox webkit
if errorlevel 1 ( echo [BLOCKING] playwright install failed. & goto :fail )
>>>>>>> origin/main

if not exist "Data\Config\studio.config.json" (
  echo.
  echo Writing a local-dev Data\Config\studio.config.json ...
  copy /y "Data\Config\studio.config.example.json" "Data\Config\studio.config.json" >nul
)

rem ---------------------------------------------------------------- 5. course
echo.
echo [5/5] Building the course from Data\Source...
call npm run build:content
<<<<<<< HEAD
if errorlevel 1 (
  echo.
  echo [BLOCKING] The course did not build. Read the error above.
  goto :fail
)
=======
if errorlevel 1 ( echo [BLOCKING] the course did not build. & goto :fail )
>>>>>>> origin/main

echo.
echo ==========================================================
echo  All blocking checks passed. Run launcher.bat next.
echo ==========================================================
<<<<<<< HEAD

:done
=======
>>>>>>> origin/main
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
