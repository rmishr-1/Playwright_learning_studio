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
  echo   Trainer code is "change-me" - change it before anyone else uses this.
)

echo.
echo Importing the course from the training repo...
if defined TRAINING_REPO ( echo   TRAINING_REPO=%TRAINING_REPO% ) else ( echo   using the default path in scripts\import-notebooks.ts )
call npm run import
if errorlevel 1 ( echo [BLOCKING] import failed - is TRAINING_REPO set correctly? & exit /b 1 )

echo.
echo Verifying the imported content...
call npm run verify
if errorlevel 1 ( echo [BLOCKING] content verification failed. & exit /b 1 )

echo.
echo ==========================================================
echo  All blocking checks passed. Run launcher.bat next.
echo ==========================================================
echo.
echo  The learning assistant needs ANTHROPIC_API_KEY in the
echo  environment. Without it everything else still works and
echo  the assistant reports itself unavailable.
endlocal
