@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
echo ==========================================================
echo  Playwright Learning Studio - setup
echo ==========================================================
echo.

%SYS%\where.exe node >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] Node.js is not on PATH. Install Node 22.18 or later and re-run.
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   node %%v
rem The TypeScript lessons run .ts files directly with node, which needs Node 22.18 or later.
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo [BLOCKING] Node 22.18 or later is needed: the TypeScript lessons run .ts files directly.
  exit /b 1
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
  exit /b 1
)

echo.
echo Installing dependencies...
call npm ci --no-audit --no-fund
if errorlevel 1 ( echo [BLOCKING] npm ci failed. & exit /b 1 )

echo.
echo Installing the browsers the lessons test in: Chromium, Firefox and WebKit...
rem The studio's own Playwright, never one npx would fetch.
call node node_modules\playwright\cli.js install chromium firefox webkit
if errorlevel 1 ( echo [BLOCKING] playwright install failed. & exit /b 1 )

if not exist "Data\Config\studio.config.json" (
  echo.
  echo Writing a local-dev Data\Config\studio.config.json ...
  copy /y "Data\Config\studio.config.example.json" "Data\Config\studio.config.json" >nul
)


echo.
echo Building the course from Data\Source...
call npm run build:content
if errorlevel 1 ( echo [BLOCKING] the course did not build. & exit /b 1 )

echo.
echo ==========================================================
echo  All blocking checks passed. Run launcher.bat next.
echo ==========================================================
endlocal
