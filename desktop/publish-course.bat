@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Publishes the course: builds it from Data\Source, encrypts it for every licence issued here, and
rem pushes it to the course's repository on GitHub (desktop\distribution.json). Every installed
rem studio gets it at its next start, and each day that changed is tagged on its card. Needs Evoke's
rem signing key on this computer, and git signed in to GitHub.

if not exist "..\node_modules\tsx\dist\cli.mjs" (
  echo [BLOCKING] The studio is not installed yet. Run setup.bat in the studio folder first.
  pause & exit /b 1
)
%SYS%\where.exe node >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] Node.js is not on PATH. & pause & exit /b 1 )
%SYS%\where.exe git >nul 2>&1
if errorlevel 1 ( echo [BLOCKING] git is not on PATH. & pause & exit /b 1 )

echo Building the course from Data\Source...
pushd .. || (echo [BLOCKING] Could not open the studio folder. & pause & exit /b 1)
rem CALL: npm and node may be .cmd shims, which would otherwise not return here.
call npm run build:content --silent
if errorlevel 1 ( popd & echo [BLOCKING] The course did not build. Nothing was published. & pause & exit /b 1 )
popd
call node "..\node_modules\tsx\dist\cli.mjs" "scripts\publish.ts" content
echo.
if not defined STUDIO_TOOLS pause
endlocal
