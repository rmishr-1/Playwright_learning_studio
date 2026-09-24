@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "NoDefaultCurrentDirectoryInExePath=1"
:: ===========================================================================
::  collab-push.bat - for COLLABORATORS, not the repo owner.
::  ---------------------------------------------------------------------
::  Commits your work, pushes it to YOUR OWN BRANCH, and gives you the link
::  to open a pull request: the owner reviews it before it reaches main.
::
::    collab-push.bat                          commit with an automatic message
::    collab-push.bat "what you changed"       commit with your own message
::    collab-push.bat "message" /branch fix-week3-typo
::
::  Nothing reaches main without review: customer builds are made from main,
::  so every change there goes through a pull request.
::
::  No repo on this machine yet? Run collab-pull.bat first - it clones it.
::  Owner pushing to main directly? Use git-sync.bat.
:: ===========================================================================

set "REMOTE_URL=https://github.com/rmishr-1/Playwright_learning_studio.git"
set "REPO_WEB=https://github.com/rmishr-1/Playwright_learning_studio"
set "MAINBRANCH=main"
set "REPO_DIR=Playwright_learning_studio"
set "GITCMD=%ProgramFiles%\Git\cmd"
set "GITCMD2=%LocalAppData%\Programs\Git\cmd"

cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)

set "MSG="
set "WANTBRANCH="
if /i "%~1"=="-h"     goto :usage
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="/?"     goto :usage
if not "%~1"=="" set "MSG=%~1"
if /i "%~2"=="/branch" set "WANTBRANCH=%~3"
if /i "%~1"=="/branch" set "WANTBRANCH=%~2" & set "MSG="

echo.
echo ===========================================================================
echo   collab-push  -  push your work to your own branch
echo   Repo   : %CD%
echo   Remote : %REMOTE_URL%
echo ===========================================================================
echo.

call :ensure_git || goto :die

:: --------------------------------------------------------------------------
:: Must be a clone. Also accept sitting NEXT TO the clone that collab-pull.bat
:: made, so a double-clicked copy of this file in Downloads still works.
:: A collaborator should never `git init` here: that creates a repository with
:: no shared history, and nothing you push could ever merge.
:: --------------------------------------------------------------------------
if exist ".git" goto :have_repo
if exist "%REPO_DIR%\.git" (
  echo   Using the clone in "%REPO_DIR%".
  cd /d "%REPO_DIR%" || goto :die
  goto :have_repo
)
echo   [FAIL] There is no repository here yet.
echo.
echo          Run collab-pull.bat first - it clones the repository for you
echo          into a "%REPO_DIR%" folder. Then run this again.
echo.
goto :die
:have_repo

REM Files that must never be committed, as git pathspecs (any folder, any case), and the text of
REM tokens and private keys that must never be committed inside any file.
set SECRET_FILES=":(glob,icase)**/*.pem" ":(glob,icase)**/*.pfx" ":(glob,icase)**/*.p12" ":(glob,icase)**/*.key" ":(glob,icase)**/*.dpapi" ":(glob,icase)**/*.lic" ":(glob,icase)**/*.lic.old" ":(glob,icase)**/issued.csv" ":(glob,icase)**/seals.json" ":(glob,icase)**/.env" ":(glob,icase)**/.env.*" ":(glob,icase)**/*.bak" ":(glob,icase)**/*.backup" ":(glob,icase)**/id_rsa*" ":(glob,icase)**/id_ed25519*" ":(glob,icase)**/credentials*.json" ":(glob,icase)**/secrets*.json" ":(exclude)desktop/src/licence-public.pem"
set "SECRET_TEXT=(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,})"

:: Identity ------------------------------------------------------------------
call :ensure_identity || goto :die
echo   Author : !GIT_NAME! ^<!GIT_MAIL!^>

:: Remote --------------------------------------------------------------------
set "HAVE_ORIGIN="
for /f "tokens=*" %%u in ('git remote get-url origin 2^>nul') do set "HAVE_ORIGIN=%%u"
if not defined HAVE_ORIGIN (
  echo   [FAIL] No 'origin' remote. This clone is misconfigured. Fix with:
  echo            git remote add origin %REMOTE_URL%
  goto :die
)

:: --------------------------------------------------------------------------
:: Work out which branch to push. If you are sitting on main, we make you a
:: branch rather than refusing outright -- refusing would just teach people to
:: push to main from a terminal instead.
:: --------------------------------------------------------------------------
set "CURBRANCH="
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURBRANCH=%%b"

set "TARGET="
if defined WANTBRANCH set "TARGET=%WANTBRANCH%"

if not defined TARGET (
  if /i "!CURBRANCH!"=="%MAINBRANCH%" goto :derive
  if /i "!CURBRANCH!"=="master"       goto :derive
  if "!CURBRANCH!"=="HEAD"            goto :derive
  set "TARGET=!CURBRANCH!"
  goto :have_target
)
goto :have_target

:derive
:: Turn "Ada Lovelace" into "ada-lovelace/work". Done in PowerShell because
:: batch string munging on arbitrary names is a bug factory.
:: NOTE the doubled caret. In a batch for/f command, ^ is the escape character,
:: so a single [^a-z0-9] reaches PowerShell as [a-z0-9] -- which replaces every
:: alphanumeric instead of every non-alphanumeric and yields an empty slug.
set "SLUG="
for /f "usebackq delims=" %%S in (`powershell -NoProfile -NonInteractive -Command "$n=[regex]::Replace($env:GIT_NAME.ToLower(),'[^^a-z0-9]+','-').Trim('-'); if($n -eq ''){'collab'}else{$n}" 2^>nul`) do set "SLUG=%%S"
set "SLUG=!SLUG: =!"
if not defined SLUG set "SLUG=collab"
set "TARGET=!SLUG!/work"
echo.
echo   You are on '!CURBRANCH!', which is shared. Moving your work to a
echo   personal branch instead: !TARGET!

:have_target
if /i "!TARGET!"=="%MAINBRANCH%" (
  echo   [FAIL] Refusing to push to '%MAINBRANCH%' -- that branch is reviewed.
  echo          Re-run without /branch, or pick a name:
  echo            collab-push.bat "message" /branch my-change
  goto :die
)
echo   Branch : !TARGET!

:: Create or switch to it, carrying any uncommitted work along.
git rev-parse --verify --quiet "refs/heads/!TARGET!" >nul 2>&1
if errorlevel 1 (
  git checkout -b "!TARGET!" >nul 2>&1
  if errorlevel 1 (
    echo   [FAIL] Could not create branch !TARGET!
    goto :die
  )
  echo   [ OK ] created branch !TARGET!
) else (
  if /i not "!CURBRANCH!"=="!TARGET!" (
    git checkout "!TARGET!" >nul 2>&1
    if errorlevel 1 (
      echo   [FAIL] Could not switch to !TARGET!  -- you may have conflicting local changes.
      goto :die
    )
    echo   [ OK ] switched to !TARGET!
  )
)

:: --------------------------------------------------------------------------
:: Stage and show.
:: --------------------------------------------------------------------------
echo.
echo   ---------------------------------------------------------------------
echo   Changes to commit
echo   ---------------------------------------------------------------------
git add -A
if errorlevel 1 (
  echo   [FAIL] git add failed.
  goto :die
)
git diff --cached --quiet -- %SECRET_FILES% || (
    echo.
    echo [STOP] These staged files look like keys, certificates, licences, backups or secrets:
    git diff --cached --name-only -- %SECRET_FILES%
    echo        Nothing was committed. Move them out of the project, or add them to .gitignore.
    git reset -q
    goto :die
)
git diff --cached --quiet -G "%SECRET_TEXT%" || (
    echo.
    echo [STOP] These staged files contain what looks like an access token or a private key:
    git diff --cached --name-only -G "%SECRET_TEXT%"
    echo        Nothing was committed. Take the secret out of the file ^(and revoke it if it was real^).
    git reset -q
    goto :die
)

set /a NCHANGES=0
for /f %%n in ('git diff --cached --name-only 2^>nul ^| find /c /v ""') do set /a NCHANGES=%%n
if !NCHANGES! EQU 0 (
  echo   Nothing to commit - the working tree matches the last commit.
  goto :do_push
)
echo   !NCHANGES! file^(s^) staged:
set /a SHOWN=0
for /f "tokens=*" %%L in ('git diff --cached --name-status 2^>nul') do (
  set /a SHOWN+=1
  if !SHOWN! LEQ 25 echo     %%L
)
if !NCHANGES! GTR 25 echo     ... and the rest, !NCHANGES! files in total
echo.
choice /c YN /n /m "  Commit these and push them to !TARGET!? [Y/N] "
if not "!errorlevel!"=="1" (
  git reset -q
  echo   Nothing was committed or pushed.
  goto :die
)

if not defined MSG (
  for /f "usebackq delims=" %%d in (`powershell -NoProfile -NonInteractive -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\"" 2^>nul`) do set "STAMP=%%d"
  set "MSG=Work in progress: !STAMP!"
)
echo.
echo   Committing: "!MSG!"
git commit -m "!MSG!" >nul 2>&1
if errorlevel 1 (
  echo   [WARN] git commit reported nothing to do.
) else (
  echo   [ OK ] committed
)

:do_push
echo.
echo   ---------------------------------------------------------------------
echo   Pushing !TARGET! to origin
echo   ---------------------------------------------------------------------

:: collab-pull.bat rebases your branch onto main, and rebasing REWRITES your
:: commits. After it runs, your branch no longer descends from its own copy on
:: the remote, so a plain push is rejected as non-fast-forward -- forever. That
:: is not an error, it is what rebasing means. Handle it, but only after
:: proving the remote holds nothing that would be destroyed.
git fetch origin "!TARGET!" >nul 2>&1
git rev-parse --verify --quiet "refs/remotes/origin/!TARGET!" >nul 2>&1
if errorlevel 1 goto :plain_push

:: If the remote tip is an ancestor of ours, an ordinary push fast-forwards.
git merge-base --is-ancestor "origin/!TARGET!" HEAD >nul 2>&1
if not errorlevel 1 goto :plain_push

:: Not an ancestor, so history was rewritten. git cherry marks every commit
:: on the remote branch:
::     -   already here as an equivalent patch   -> safe to replace
::     +   genuinely missing here                -> somebody else's work
set /a UNMERGED=0
for /f "tokens=1" %%C in ('git cherry HEAD "origin/!TARGET!" 2^>nul') do (
  if "%%C"=="+" set /a UNMERGED+=1
)
if !UNMERGED! GTR 0 (
  echo   [FAIL] origin/!TARGET! has !UNMERGED! commit^(s^) that are not in your
  echo          history. Someone else pushed to your branch, or you pushed from
  echo          another machine. Refusing to overwrite it.
  echo.
  echo          Run collab-pull.bat first - it will bring those commits in.
  goto :die
)

echo   Your branch was rebased onto %MAINBRANCH%, so its history no longer
echo   matches the remote copy. Checked: the remote holds nothing that is not
echo   already here, so replacing your own branch is safe.
echo.
:: --force-with-lease, never --force: it aborts if the remote moved since the
:: fetch above. And this only ever targets YOUR branch, never %MAINBRANCH%.
git push --force-with-lease origin "!TARGET!"
if errorlevel 1 goto :push_failed
goto :pushed

:plain_push
git push -u origin "!TARGET!"
if errorlevel 1 goto :push_failed

:pushed

echo.
echo   [ OK ] Pushed branch !TARGET!
echo.
echo   Open a pull request so the owner can review it and bring it into %MAINBRANCH%:
echo     %REPO_WEB%/compare/%MAINBRANCH%...!TARGET!?expand=1
echo.
pause
endlocal & exit /b 0

:push_failed
echo.
echo   [FAIL] push was rejected.
echo.
echo   The usual causes, in order of likelihood:
echo.
echo     0. The remote branch moved between the check and the push, so
echo        --force-with-lease refused. Run collab-pull.bat and try again -
echo        the lease just stopped you overwriting a commit that arrived
echo        seconds ago.
echo.
echo     1. You are not a collaborator on this repository yet, so you have
echo        read access but not write. Ask the owner to add you at
echo          %REPO_WEB%/settings/access
echo        Or fork the repo, push to your fork, and open a pull request
echo        from there.
echo.
echo     2. Your branch has moved on the remote - you pushed it from another
echo        machine. Run collab-pull.bat, then try again.
echo.
echo     3. Authentication. GitHub does not accept passwords. Use a Personal
echo        Access Token as the password: https://github.com/settings/tokens
echo.
echo   This script never plain-force-pushes, and never to %MAINBRANCH%: it replaces only
echo   your own branch, and only when the remote holds nothing that is not already here.
echo.
goto :die

:usage
echo.
echo   collab-push.bat                          commit with an automatic message
echo   collab-push.bat "what you changed"       commit with your own message
echo   collab-push.bat "message" /branch NAME   push to a specific branch
echo.
echo   Pushes to your own branch, and gives you the link for a pull request into %MAINBRANCH%,
echo   where the owner reviews it. Nothing is ever pushed to %MAINBRANCH% itself.
echo.
endlocal & exit /b 0

:: ================= helpers =================
:ensure_git
where git >nul 2>&1 && exit /b 0
if exist "%GITCMD%\git.exe"  ( set "PATH=%GITCMD%;%PATH%" & exit /b 0 )
if exist "%GITCMD2%\git.exe" ( set "PATH=%GITCMD2%;%PATH%" & exit /b 0 )

echo   [setup] Git is not installed.
echo   [setup] Installing it accepts the Git for Windows licence ^(GPL v2^) and, through winget,
echo           the winget source agreements.
choice /c YN /n /m "  [setup] Install Git for Windows now? [Y/N] "
if not "%errorlevel%"=="1" (
    echo   [setup] Git was not installed. Install it from https://git-scm.com/download/win and run this again.
    exit /b 1
)
where winget >nul 2>&1 && (
    echo   [setup] Installing via winget...
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
) || (
    echo   [setup] winget not available - downloading the Git installer, and checking its signature...
    REM The download goes to a folder of its own, and runs only when Windows confirms it is
    REM signed by the Git for Windows project.
    powershell -NoProfile -NonInteractive -Command ^
      "$a=(Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest').assets | Where-Object {$_.name -match '^Git-[\d.]+-64-bit\.exe$'} | Select-Object -First 1; $d=Join-Path $env:TEMP ([guid]::NewGuid().ToString()); New-Item -ItemType Directory $d | Out-Null; $f=Join-Path $d $a.name; Invoke-WebRequest $a.browser_download_url -OutFile $f; $s=Get-AuthenticodeSignature -LiteralPath $f; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '^CN=Johannes Schindelin,') { Remove-Item -Recurse -Force $d; throw ('The Git installer is not signed by the Git for Windows project (' + $s.Status + '). Nothing was installed.') }; Start-Process -FilePath $f -ArgumentList '/VERYSILENT','/NORESTART' -Wait; Remove-Item -Recurse -Force $d"
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
