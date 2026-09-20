@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "REPO=https://rmishr-1@github.com/rmishr-1/Playwright_learning_studio.git"
set "GITCMD=%ProgramFiles%\Git\cmd"
set "GITCMD2=%LocalAppData%\Programs\Git\cmd"

echo ============================================
echo  Playwright Learning Studio - PUSH to GitHub
echo  %REPO%
echo ============================================
echo.

call :ensure_git || goto :fail

REM ---------- repository setup (first run only) ----------
if not exist ".git" (
    echo [setup] Initialising a new git repository...
    git init -b main 2>nul || (git init && git checkout -B main)
)

if not exist ".gitignore" (
    echo [setup] Creating .gitignore...
    (
        echo webui/backups/
        echo .~lock.*#
        echo ~$*
        echo __pycache__/
    ) > .gitignore
)

REM identity enforced repo-locally: this email maps to rmishr-1 on GitHub
git config user.email "rmishra@evoketechnologies.com"
git config user.name  "rmishr-1"

REM point origin at the repository (add it, or fix it if it changed)
git remote get-url origin >nul 2>nul && (
    git remote set-url origin "%REPO%"
) || (
    git remote add origin "%REPO%"
)

REM ---------- does the repository exist on GitHub? ----------
echo [check] Looking for the repository on GitHub...
git ls-remote origin >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] GitHub reports no repository at:
    echo         %REPO%
    echo         GitHub does NOT create a repository on first push - it must exist first.
    echo.
    echo         Opening https://github.com/new in your browser. Create it there:
    echo           Owner: rmishr-1      Repository name: Playwright_learning_studio
    echo           Leave it EMPTY - no README, no .gitignore, no license.
    echo         Then double-click this file again.
    start "" https://github.com/new
    goto :fail
)

REM ---------- stage, commit, push ----------
echo [push ] Staging all changes...
git add -A

git diff --cached --quiet && (
    echo [push ] Nothing new to commit - pushing current state...
) || (
    git commit -m "Update %date% %time%"
    if errorlevel 1 goto :fail
)

git branch -M main
echo [push ] Pushing to origin/main...
echo         ^(first push: a browser window may open for GitHub sign-in^)
git push -u origin main
if errorlevel 1 goto :fail

echo.
echo [ OK  ] Push complete.
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

:fail
echo.
echo [ERROR] Push did not complete - read the messages above.
pause
exit /b 1
