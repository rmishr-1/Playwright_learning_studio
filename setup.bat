@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo  Playwright Learning Studio - setup
echo ==========================================================
echo.

where node >nul 2>&1
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

echo.
echo Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 ( echo [BLOCKING] npm install failed. & exit /b 1 )

echo.
echo Installing the browsers the lessons test in: Chromium, Firefox and WebKit...
call npx playwright install chromium firefox webkit
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
echo.
echo  The learning assistant needs ANTHROPIC_API_KEY in the
echo  environment. Without it everything else still works and
echo  the assistant reports itself unavailable.
endlocal
