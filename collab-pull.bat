@echo off
setlocal EnableExtensions EnableDelayedExpansion
:: ===========================================================================
::  collab-pull.bat - for COLLABORATORS, not the repo owner.
::  ---------------------------------------------------------------------
::  FIRST RUN: download just this file, put it anywhere (Desktop, Downloads),
::  and double-click it. It installs git if needed and clones the whole
::  repository into an "Playwright_learning_studio" folder next to this file.
::
::  AFTER THAT: brings your branch up to date with everything that has landed
::  on main, and with your own branch if you pushed it from another machine.
::
::    collab-pull.bat            refuses if you have uncommitted changes
::    collab-pull.bat /stash     stash them, sync, put them back
::
::  Two stages, in this order:
::    1. sync your branch with its own copy on the remote
::    2. rebase your branch on top of the latest main
::
::  Rebase, not merge, so your commits stay together on top of main and the
::  pull request stays readable. Nothing is ever discarded: on a conflict it
::  stops with your work intact and tells you exactly what to do.
:: ===========================================================================

set "REMOTE_URL=https://github.com/rmishr-1/Playwright_learning_studio.git"
set "MAINBRANCH=main"
set "REPO_DIR=Playwright_learning_studio"
set "GITCMD=%ProgramFiles%\Git\cmd"
set "GITCMD2=%LocalAppData%\Programs\Git\cmd"

cd /d "%~dp0"

set "DO_STASH=no"
if /i "%~1"=="/stash" set "DO_STASH=yes"
if /i "%~1"=="stash"  set "DO_STASH=yes"
if /i "%~1"=="-h"     goto :usage
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="/?"     goto :usage

echo.
echo ===========================================================================
echo   collab-pull  -  get the repo / sync your branch with main
echo   Folder : %CD%
echo   Remote : %REMOTE_URL%
echo ===========================================================================
echo.

call :ensure_git || goto :die

:: --------------------------------------------------------------------------
:: First run: nothing here yet. Clone the repository so a collaborator can
:: download just this one file, double-click it, and get the entire repo.
:: --------------------------------------------------------------------------
if exist ".git" goto :have_repo
if exist "%REPO_DIR%\.git" (
  echo   Using the existing clone in "%REPO_DIR%".
  cd /d "%REPO_DIR%"
  goto :have_repo
)
echo   No repository here yet - cloning it now.
echo   ^(a browser window may open for GitHub sign-in^)
echo.
git clone %REMOTE_URL% "%REPO_DIR%"
if errorlevel 1 (
  echo.
  echo   [FAIL] Clone failed. The usual causes:
  echo     - the repository is private and you are not a collaborator yet:
  echo       ask the owner to add you at
  echo         https://github.com/rmishr-1/Playwright_learning_studio/settings/access
  echo     - sign-in was cancelled: run this file again and complete it
  echo     - no network connection
  goto :die
)
cd /d "%REPO_DIR%"
echo.
echo   [ OK ] Repository cloned to:
echo            %CD%
echo   Work inside that folder from now on. Continuing with a normal sync...
echo.
:have_repo

call :ensure_identity || goto :die

set "HAVE_ORIGIN="
for /f "tokens=*" %%u in ('git remote get-url origin 2^>nul') do set "HAVE_ORIGIN=%%u"
if not defined HAVE_ORIGIN (
  echo   [FAIL] No 'origin' remote. Fix with:
  echo            git remote add origin %REMOTE_URL%
  goto :die
)

set "CURBRANCH="
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURBRANCH=%%b"
echo   Branch : !CURBRANCH!

:: --------------------------------------------------------------------------
:: Dirty tree. Rebasing over uncommitted work aborts part-way, so settle it up
:: front rather than discovering it mid-operation.
:: --------------------------------------------------------------------------
set /a NDIRTY=0
for /f %%n in ('git status --porcelain 2^>nul ^| find /c /v ""') do set /a NDIRTY=%%n

set "STASHED=no"
if !NDIRTY! EQU 0 goto :fetch

echo.
echo   You have !NDIRTY! uncommitted change^(s^).
if /i "!DO_STASH!"=="yes" goto :do_stash
echo.
echo   [STOP] Not syncing over uncommitted work.
echo.
echo          Pick one:
echo            collab-push.bat "message"   commit and push them first
echo            collab-pull.bat /stash      set them aside, sync, restore
echo            git stash                   set them aside yourself
echo            git checkout -- .           THROW THEM AWAY - not undoable
echo.
goto :die

:do_stash
echo   Stashing them first.
git stash push -u -m "collab-pull.bat auto-stash" >nul 2>&1
if errorlevel 1 (
  echo   [FAIL] git stash failed. Nothing was changed.
  goto :die
)
set "STASHED=yes"
echo   [ OK ] stashed

:fetch
echo.
echo   ---------------------------------------------------------------------
echo   Fetching
echo   ---------------------------------------------------------------------
git fetch origin --prune
if errorlevel 1 (
  echo   [FAIL] fetch failed. Check your network, and that you still have
  echo          access to %REMOTE_URL%
  goto :restore_and_die
)
echo   [ OK ] fetched

:: --------------------------------------------------------------------------
:: Stage 1: your own branch, if it exists on the remote.
:: --------------------------------------------------------------------------
git rev-parse --verify --quiet "refs/remotes/origin/!CURBRANCH!" >nul 2>&1
if errorlevel 1 (
  echo   Your branch is not on the remote yet - nothing to sync from it.
  goto :onto_main
)
echo.
echo   Syncing with origin/!CURBRANCH!
git pull --rebase origin "!CURBRANCH!"
if errorlevel 1 goto :rebase_failed
echo   [ OK ] in step with your remote branch

:onto_main
:: --------------------------------------------------------------------------
:: Stage 2: rebase onto main, unless main IS the current branch.
:: --------------------------------------------------------------------------
if /i "!CURBRANCH!"=="%MAINBRANCH%" (
  echo.
  echo   You are on %MAINBRANCH%, so there is nothing further to rebase onto.
  goto :finish
)

git rev-parse --verify --quiet "refs/remotes/origin/%MAINBRANCH%" >nul 2>&1
if errorlevel 1 (
  echo   [WARN] origin/%MAINBRANCH% does not exist yet. Skipping the rebase.
  goto :finish
)

set /a BEHIND=0
for /f %%n in ('git rev-list --count "HEAD..origin/%MAINBRANCH%" 2^>nul') do set /a BEHIND=%%n
echo.
if !BEHIND! EQU 0 (
  echo   Already up to date with origin/%MAINBRANCH%.
  goto :finish
)
echo   origin/%MAINBRANCH% has !BEHIND! commit^(s^) you do not have. Rebasing onto it.
git rebase "origin/%MAINBRANCH%"
if errorlevel 1 goto :rebase_failed
echo   [ OK ] your work now sits on top of the latest %MAINBRANCH%

:finish
if /i "!STASHED!"=="yes" (
  echo.
  echo   Restoring your stashed changes.
  git stash pop
  if errorlevel 1 (
    echo.
    echo   [WARN] Your changes conflicted with what was pulled.
    echo          They are SAFE - still in the stash. Inspect with:
    echo            git stash list
    echo            git stash show -p
    echo          Resolve the conflicts, then:  git stash drop
    goto :die
  )
  echo   [ OK ] restored
)

echo.
for /f "tokens=*" %%c in ('git log -1 --pretty=format:"%%h  %%an  %%s" 2^>nul') do echo   HEAD is now: %%c
echo.
echo   Next: collab-push.bat "your message"
echo.
pause
endlocal & exit /b 0

:rebase_failed
echo.
echo   [FAIL] rebase stopped.
echo.
echo   Most likely a conflict. Git has paused and left the tree mid-rebase,
echo   with the conflicting files marked. To finish:
echo.
echo       1. Open the marked files and resolve them.
echo       2. git add .
echo       3. git rebase --continue
echo.
echo   Or back out completely and return to where you started:
echo.
echo       git rebase --abort
echo.
if /i "!STASHED!"=="yes" (
  echo   NOTE: your uncommitted changes are still stashed and are NOT lost.
  echo         Get them back with:  git stash pop
  echo.
)
goto :die

:restore_and_die
if /i "!STASHED!"=="yes" (
  echo   Restoring your stashed changes before exiting.
  git stash pop >nul 2>&1
)
goto :die

:usage
echo.
echo   collab-pull.bat            first run: clone the repo; after: sync with main
echo   collab-pull.bat /stash     stash uncommitted changes, sync, restore
echo.
endlocal & exit /b 0

:: ================= helpers =================
:ensure_git
where git >nul 2>&1 && exit /b 0
if exist "%GITCMD%\git.exe"  ( set "PATH=%GITCMD%;%PATH%" & exit /b 0 )
if exist "%GITCMD2%\git.exe" ( set "PATH=%GITCMD2%;%PATH%" & exit /b 0 )

echo   [setup] Git is not installed. Installing now...
where winget >nul 2>&1 && (
    echo   [setup] Installing via winget...
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
) || (
    echo   [setup] winget not available - downloading the Git installer...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$a=(Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest').assets | Where-Object {$_.name -match '64-bit\.exe$'} | Select-Object -First 1; $f=Join-Path $env:TEMP 'git-setup.exe'; Invoke-WebRequest $a.browser_download_url -OutFile $f; Start-Process $f -ArgumentList '/VERYSILENT','/NORESTART' -Wait"
)

set "PATH=%GITCMD%;%GITCMD2%;%PATH%"
where git >nul 2>&1 && ( echo   [setup] Git installed successfully. & exit /b 0 )
echo   [FAIL] Git could not be installed automatically.
echo          Install it from https://git-scm.com/download/win and run this again.
exit /b 1

:ensure_identity
set "GIT_NAME="
set "GIT_MAIL="
for /f "tokens=*" %%v in ('git config user.name 2^>nul')  do set "GIT_NAME=%%v"
for /f "tokens=*" %%v in ('git config user.email 2^>nul') do set "GIT_MAIL=%%v"
if defined GIT_NAME if defined GIT_MAIL exit /b 0
echo.
echo   ---------------------------------------------------------------------
echo   One-time setup: git needs to know who you are, so your commits are
echo   labelled with your name on GitHub. Asked once, then remembered.
echo   ---------------------------------------------------------------------
if not defined GIT_NAME set /p "GIT_NAME=  Your full name                    : "
if not defined GIT_NAME (
  echo   [FAIL] No name entered.
  exit /b 1
)
if not defined GIT_MAIL set /p "GIT_MAIL=  Email linked to your GitHub login : "
if not defined GIT_MAIL (
  echo   [FAIL] No email entered.
  exit /b 1
)
git config --global user.name  "!GIT_NAME!"
git config --global user.email "!GIT_MAIL!"
echo   [ OK ] saved - git will remember this on this machine.
echo.
exit /b 0

:die
echo.
pause
endlocal & exit /b 1
