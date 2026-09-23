@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo  Playwright Learning Studio - setup
echo ==========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [BLOCKING] Node.js is not on PATH. Install Node 20+ and re-run.
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   node %%v

echo.
echo Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 ( echo [BLOCKING] npm install failed. & exit /b 1 )

echo.
echo Installing the Chromium the code runner drives...
call npx playwright install chromium
if errorlevel 1 ( echo [BLOCKING] playwright install failed. & exit /b 1 )

if not exist "Data\Config\studio.config.json" (
  echo.
  echo Writing a local-dev Data\Config\studio.config.json ...
  copy /y "Data\Config\studio.config.example.json" "Data\Config\studio.config.json" >nul
)


echo.
echo ==========================================================
echo  All blocking checks passed. Run launcher.bat next.
echo ==========================================================
echo.
echo  The learning assistant needs ANTHROPIC_API_KEY in the
echo  environment. Without it everything else still works and
echo  the assistant reports itself unavailable.
endlocal
