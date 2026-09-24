@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "REPO=https://rmishr-1@github.com/rmishr-1/Playwright_learning_studio.git"
set "GITCMD=%ProgramFiles%\Git\cmd"
set "GITCMD2=%LocalAppData%\Programs\Git\cmd"

echo ============================================
echo  Playwright Learning Studio - PULL from GitHub
echo  %REPO%
echo ============================================
echo.

call :ensure_git || goto :fail
call :ensure_credentials

REM ---------- repository setup (first run only) ----------
if not exist ".git" (
    echo [setup] Initialising a new git repository...
    git init -b main 2>nul || (git init && git checkout -B main)
)

REM identity enforced repo-locally: this email maps to rmishr-1 on GitHub
git config user.email "rmishra@evoketechnologies.com"
git config user.name  "rmishr-1"

git remote get-url origin >nul 2>nul && (
    git remote set-url origin "%REPO%"
) || (
    git remote add origin "%REPO%"
)

REM ---------- does the repository exist on GitHub? ----------
git ls-remote origin >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] GitHub reports no repository at:
    echo         %REPO%
    echo         Create it first ^(https://github.com/new, name: Playwright_learning_studio^),
    echo         push something with git-push.bat, and then pull.
    goto :fail
)

REM ---------- pull ----------
echo [pull ] Fetching from origin...
git fetch origin
if errorlevel 1 goto :fail

echo [pull ] Merging origin/main into the local folder...
git checkout -B main 2>nul
git pull origin main --allow-unrelated-histories
if errorlevel 1 (
    echo.
    echo [ERROR] The pull stopped - most likely local files conflict with the
    echo         repository's versions. Commit or move your local changes
    echo         ^(or run git-push.bat first^), then run this again.
    goto :fail
)

echo.
echo [ OK  ] Pull complete - the folder now matches the repository.
pause
exit /b 0

REM ================= helpers =================
:ensure_git
where git >nul 2>nul && exit /b 0
if exist "%GITCMD%\git.exe"  ( set "PATH=%GITCMD%;%PATH%" & exit /b 0 )
if exist "%GITCMD2%\git.exe" ( set "PATH=%GITCMD2%;%PATH%" & exit /b 0 )

echo [setup] Git is not installed. Installing now...
where winget >nul 2>nul && (
    echo [setup] Installing via winget...
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
) || (
    echo [setup] winget not available - downloading the Git installer...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$a=(Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest').assets | Where-Object {$_.name -match '64-bit\.exe$'} | Select-Object -First 1; $f=Join-Path $env:TEMP 'git-setup.exe'; Invoke-WebRequest $a.browser_download_url -OutFile $f; Start-Process $f -ArgumentList '/VERYSILENT','/NORESTART' -Wait"
)

set "PATH=%GITCMD%;%GITCMD2%;%PATH%"
where git >nul 2>nul && ( echo [setup] Git installed successfully. & exit /b 0 )
echo [ERROR] Git could not be installed automatically.
echo         Install it manually from https://git-scm.com/download/win and run this again.
exit /b 1

:ensure_credentials
rem  Without a credential helper git asks for the GitHub sign-in on every network command - several
rem  times in a single run, and again on every run. Git Credential Manager, part of Git for Windows,
rem  keeps the sign-in in Windows Credential Manager after the first time. Any helper already set is kept.
set "CRED_HELPER="
for /f "delims=" %%h in ('git config --get credential.helper 2^>nul') do set "CRED_HELPER=%%h"
if defined CRED_HELPER exit /b 0
set "GCM="
git credential-manager --version >nul 2>&1 && set "GCM=manager"
if not defined GCM git credential-manager-core --version >nul 2>&1 && set "GCM=manager-core"
if defined GCM (
    git config --global credential.helper %GCM%
    echo [setup] Git will now remember your GitHub sign-in after the first time.
    exit /b 0
)
echo [WARN] Git cannot remember your GitHub sign-in on this computer, so it may ask more than once.
echo        Install the current Git for Windows - it includes Git Credential Manager:
echo          https://git-scm.com/download/win
exit /b 0

:fail
echo.
echo [ERROR] Pull did not complete - read the messages above.
pause
exit /b 1
