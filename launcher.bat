@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" ( echo Run setup.bat first. & exit /b 1 )
if not exist "Data\Content\course-index.json" ( echo No imported content. Run setup.bat first. & exit /b 1 )

rem The authored side-cars (Data\Content\lessons\, variations\) are merged into the generated
rem day files. setup.bat gets that for free because the importer does it, but the importer needs
rem the 147-notebook training repo - so after a plain `git pull` this is the only thing that
rem applies new lesson content. It is idempotent and takes well under a second, so it runs every
rem time rather than asking anyone to remember it.
echo Applying authored lesson content...
call npm run overlay
if errorlevel 1 (
  echo   [WARN] Could not apply the lesson overlays - check the message above.
  echo          Starting anyway on the content already on disk.
)
echo.

echo Starting the Learning Studio...
echo   backend  http://127.0.0.1:3010   (loopback only)
echo   studio   http://localhost:5180
echo.
start "studio-backend" cmd /c "npm run dev:backend"
timeout /t 3 /nobreak >nul
start "studio-frontend" cmd /c "npm run dev:frontend"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5180"
echo Both processes started in their own windows. Close them to stop.
endlocal
