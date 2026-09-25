@echo off
setlocal
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)
rem Builds one of the apps in variants.json: lists them and asks which ("Evoke Training Studio",
rem Evoke's own, or a customer's such as "Evoke Training Studio BU"), then whether as an installer
rem or a zip. What to send goes into desktop\deliveries\<code>\. A customer's app builds only on the
rem computer that holds their licence (desktop\licences\). A new customer: new-customer.bat.

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
  pause & exit /b 1
)

rem Every build starts from exactly what the lockfiles list: nothing left over or changed in
rem node_modules goes into an app.
echo Installing the studio's packages as package-lock.json lists them...
pushd .. || (echo [BLOCKING] Could not open the studio folder. & pause & exit /b 1)
call npm ci --no-audit --no-fund --strict-allow-scripts --no-dangerously-allow-all-scripts
if errorlevel 1 ( popd & echo [BLOCKING] npm ci failed in the studio folder. & pause & exit /b 1 )
popd
echo Installing the build tools as desktop\package-lock.json lists them...
call npm ci --no-audit --no-fund --strict-allow-scripts --no-dangerously-allow-all-scripts
if errorlevel 1 ( echo [BLOCKING] npm ci failed in desktop. & pause & exit /b 1 )

call npm run build-variant --silent
echo.
pause
endlocal
