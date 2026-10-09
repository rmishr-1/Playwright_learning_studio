@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Opens the Studio Tools window: every double-click job here and in the studio folder, by stage,
rem with the state of this computer (the signing key, licences, apps, what is published, git) and
rem a terminal inside the window that the chosen job runs in. See desktop\README.md.

if not exist "..\node_modules\tsx\dist\cli.mjs" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat in the studio folder first.
  pause & exit /b 1
)
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] Node.js is not on PATH. & pause & exit /b 1 )

if exist "node_modules\node-pty\package.json" if exist "node_modules\esbuild\package.json" if exist "node_modules\electron\package.json" goto :launch

rem The window's own packages are not here yet: install desktop's packages as package-lock.json
rem lists them, under the same install-script rules every build uses (allowScripts in package.json,
rem strict-allow-scripts in .npmrc). Only an npm that knows that setting enforces it.
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
  pause & exit /b 1
)
echo Installing the build tools as desktop\package-lock.json lists them...
call npm ci --no-audit --no-fund --strict-allow-scripts --no-dangerously-allow-all-scripts
if errorlevel 1 ( echo [BLOCKING] npm ci failed in desktop. & pause & exit /b 1 )

:launch
rem CALL: node may be a .cmd shim from a version manager, which would otherwise not return here.
call node "..\node_modules\tsx\dist\cli.mjs" "tools\launch.ts"
if errorlevel 1 ( echo [BLOCKING] The Studio Tools window could not start. & pause & exit /b 1 )
endlocal
