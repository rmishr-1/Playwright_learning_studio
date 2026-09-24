@echo off
setlocal EnableExtensions EnableDelayedExpansion
:: ===========================================================================
::  git-sync.bat - one-click sync for the REPO OWNER.
::  ---------------------------------------------------------------------
::  Handles the situations where a plain pull or push gets stuck:
::    - you have uncommitted local changes        -> commits them
::    - collaborators' work landed on GitHub      -> merges it in
::    - local and remote main have diverged       -> merges, then pushes
::    - the merge conflicts                       -> asks you which side wins
::    - the remote moved mid-sync                 -> retries automatically
::
::  Double-click it and everything local ends up on GitHub, and everything
::  on GitHub ends up here. Collaborators: use collab-pull / collab-push.
:: ===========================================================================

set "REPO=https://rmishr-1@github.com/rmishr-1/Playwright_learning_studio.git"
set "MAINBRANCH=main"
set "GITCMD=%ProgramFiles%\Git\cmd"
set "GITCMD2=%LocalAppData%\Programs\Git\cmd"

cd /d "%~dp0"

echo ============================================
echo  Playwright Learning Studio - SYNC with GitHub
echo  %REPO%
echo ============================================
echo.

call :ensure_git || goto :fail

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

echo [check] Looking for the repository on GitHub...
git ls-remote origin >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] GitHub reports no repository at:
    echo         %REPO%
    echo         Create it first at https://github.com/new ^(name: Playwright_learning_studio^).
    goto :fail
)

REM ---------- step 1: commit everything local ----------
echo [ 1/3 ] Committing local changes...
git add -A
git diff --cached --quiet && (
    echo         Nothing new to commit.
) || (
    git commit -m "Update %date% %time%"
    if errorlevel 1 goto :fail
    echo         Committed.
)
git branch -M %MAINBRANCH%

REM ---------- step 2+3: merge remote work, push, retry if remote moves ----------
set /a TRIES=0
:sync_cycle
set /a TRIES+=1
if !TRIES! GTR 3 (
    echo.
    echo [ERROR] The remote kept changing while syncing ^(3 attempts^).
    echo         Someone is pushing right now - wait a minute and run this again.
    goto :fail
)

echo [ 2/3 ] Fetching what is new on GitHub...
git fetch origin --prune
if errorlevel 1 (
    echo [ERROR] Fetch failed - check your network connection.
    goto :fail
)

git rev-parse --verify --quiet "refs/remotes/origin/%MAINBRANCH%" >nul 2>&1
if errorlevel 1 goto :push

set /a BEHIND=0
for /f %%n in ('git rev-list --count "HEAD..origin/%MAINBRANCH%" 2^>nul') do set /a BEHIND=%%n
if !BEHIND! EQU 0 (
    echo         Nothing new on GitHub.
    goto :push
)

echo         GitHub has !BEHIND! commit^(s^) you do not have ^(collaborator work^).
echo         Merging them in...
git merge "origin/%MAINBRANCH%" --no-edit
if errorlevel 1 goto :conflict
echo         Merged.
goto :push

:push
echo [ 3/3 ] Pushing to GitHub...
git push -u origin %MAINBRANCH%
if errorlevel 1 (
    echo         Push rejected - the remote moved while we were merging. Retrying...
    echo.
    goto :sync_cycle
)

echo.
echo [ OK  ] Sync complete - local folder and GitHub now match.
git log -1 --pretty=format:"        HEAD: %%h  %%s"
echo.
pause
exit /b 0

REM ================= conflict handling =================
:conflict
echo.
echo ============================================================
echo  The merge hit a CONFLICT: you and a collaborator changed
echo  the same part of the same file^(s^):
echo ============================================================
for /f "delims=" %%F in ('git diff --name-only --diff-filter=U 2^>nul') do echo     %%F
echo.
echo  How do you want to resolve it?
echo.
echo    M = keep MY version of the conflicting parts
echo    G = take the GITHUB ^(collaborator's^) version
echo    X = stop; I will open the files and resolve by hand
echo.
choice /c MGX /n /m "  Your choice [M/G/X]: "
set "PICK=!errorlevel!"

REM start clean, then redo the merge with the chosen side winning conflicts
git merge --abort >nul 2>&1

if "!PICK!"=="1" (
    echo.
    echo  Re-merging, keeping YOUR side where they clash...
    git merge "origin/%MAINBRANCH%" --no-edit -X ours
    if errorlevel 1 goto :manual
    echo  [ OK ] merged - your versions won the conflicting parts.
    goto :push
)
if "!PICK!"=="2" (
    echo.
    echo  Re-merging, taking GITHUB's side where they clash...
    git merge "origin/%MAINBRANCH%" --no-edit -X theirs
    if errorlevel 1 goto :manual
    echo  [ OK ] merged - GitHub's versions won the conflicting parts.
    goto :push
)

:manual
git merge "origin/%MAINBRANCH%" --no-edit >nul 2>&1
echo.
echo  The merge is left OPEN for you to finish by hand:
echo.
echo    1. Open each file listed above - the clashing parts are marked
echo       between ^<^<^<^<^<^<^< and ^>^>^>^>^>^>^> lines. Edit them how you want.
echo    2. Then run:   git add .
echo    3. Then run:   git commit --no-edit
echo    4. Then double-click this file again to push.
echo.
echo  Changed your mind? Undo the whole merge with:   git merge --abort
goto :fail

REM ================= helpers =================
:ensure_git
where git >nul 2>&1 && exit /b 0
if exist "%GITCMD%\git.exe"  ( set "PATH=%GITCMD%;%PATH%" & exit /b 0 )
if exist "%GITCMD2%\git.exe" ( set "PATH=%GITCMD2%;%PATH%" & exit /b 0 )

echo [setup] Git is not installed. Installing now...
where winget >nul 2>&1 && (
    echo [setup] Installing via winget...
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
) || (
    echo [setup] winget not available - downloading the Git installer...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$a=(Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest').assets | Where-Object {$_.name -match '64-bit\.exe$'} | Select-Object -First 1; $f=Join-Path $env:TEMP 'git-setup.exe'; Invoke-WebRequest $a.browser_download_url -OutFile $f; Start-Process $f -ArgumentList '/VERYSILENT','/NORESTART' -Wait"
)

set "PATH=%GITCMD%;%GITCMD2%;%PATH%"
where git >nul 2>&1 && ( echo [setup] Git installed successfully. & exit /b 0 )
echo [ERROR] Git could not be installed automatically.
echo         Install it manually from https://git-scm.com/download/win and run this again.
exit /b 1

:fail
echo.
echo [ERROR] Sync did not complete - read the messages above.
pause
exit /b 1
