@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "NoDefaultCurrentDirectoryInExePath=1"
rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.
set "SYS=%SystemRoot%\System32"
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

cd /d "%~dp0" || (echo [ERROR] Could not open the folder this file is in. & pause & exit /b 1)

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

REM Who is committing: asked once, when git does not know yet, and kept for this repository. Never
REM assumed, so nobody's commits go out under someone else's name.
set "HAVE_MAIL="
for /f "tokens=*" %%v in ('git config user.email 2^>nul') do set "HAVE_MAIL=%%v"
if not defined HAVE_MAIL (
    echo [setup] Git does not know who is committing on this computer. Asked once, then remembered.
    set "NEW_NAME="
    set "NEW_MAIL="
    set /p "NEW_NAME=        Your full name                    : "
    set /p "NEW_MAIL=        Email linked to your GitHub login : "
    if not defined NEW_NAME goto :fail
    if not defined NEW_MAIL goto :fail
    git config user.name "!NEW_NAME!"
    git config user.email "!NEW_MAIL!"
)

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

REM Files that must never be committed, as git pathspecs (any folder, any case), and the text of
REM tokens and private keys that must never be committed inside any file.
set SECRET_FILES=":(glob,icase)**/*.pem" ":(glob,icase)**/*.pfx" ":(glob,icase)**/*.p12" ":(glob,icase)**/*.key" ":(glob,icase)**/*.dpapi" ":(glob,icase)**/*.lic" ":(glob,icase)**/*.lic.old" ":(glob,icase)**/issued.csv" ":(glob,icase)**/seals.json" ":(glob,icase)**/.env" ":(glob,icase)**/.env.*" ":(glob,icase)**/*.bak" ":(glob,icase)**/*.backup" ":(glob,icase)**/id_rsa*" ":(glob,icase)**/id_ed25519*" ":(glob,icase)**/credentials*.json" ":(glob,icase)**/secrets*.json" ":(glob,icase)**/deliveries/**" ":(glob,icase)**/licences/**" ":(glob,icase)**/keys/**" ":(exclude)desktop/src/licence-public.pem"
set "SECRET_TEXT=(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36}|_auth[T]oken=)"

REM ---------- step 1: commit everything local ----------
echo [ 1/3 ] Committing local changes...
git add -A
git diff --cached --quiet -- %SECRET_FILES% || (
    echo.
    echo [STOP] These staged files look like keys, certificates, licences, backups or secrets:
    git diff --cached --name-only -- %SECRET_FILES%
    echo        Nothing was committed. Move them out of the project, or add them to .gitignore.
    git reset -q
    goto :fail
)
git diff --cached --quiet -G "%SECRET_TEXT%" || (
    echo.
    echo [STOP] These staged files contain what looks like an access token or a private key:
    git diff --cached --name-only -G "%SECRET_TEXT%"
    echo        Nothing was committed. Take the secret out of the file ^(and revoke it if it was real^).
    git reset -q
    goto :fail
)
git diff --cached --quiet && (
    echo         Nothing new to commit.
) || (
    echo         These changes will be committed and pushed to GitHub:
    git diff --cached --stat
    %SYS%\choice.exe /c YN /n /m "        Commit and push them? [Y/N] "
    if !errorlevel! neq 1 (
        git reset -q
        echo         Nothing was committed or pushed.
        goto :fail
    )
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
call :scan_outgoing || goto :fail
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


:: ================= everything about to be pushed =================
:: Not only what this script staged: commits made in an editor or a terminal are checked too,
:: against the same file list and the same token pattern. %1 is the branch being pushed.
:scan_outgoing
set "RANGE=HEAD"
git rev-parse --verify --quiet "refs/remotes/origin/%MAINBRANCH%" >nul 2>&1 && set "RANGE=origin/%MAINBRANCH%..HEAD"
if not "%~1"=="" git rev-parse --verify --quiet "refs/remotes/origin/%~1" >nul 2>&1 && set "RANGE=origin/%~1..HEAD"
:: A range git cannot read stops the push: the scan never passes by failing.
git rev-list "%RANGE%" >nul 2>&1 || (
    echo.
    echo [STOP] Could not list the commits about to be pushed ^(%RANGE%^). Nothing was pushed.
    exit /b 1
)
:: Merge commits are scanned too (against their first parent: a secret added while resolving a
:: conflict lives only in the merge), and so is every commit of a merged side branch (--full-history:
:: git would otherwise skip one whose files end up as they started).
git log --full-history --diff-merges=first-parent --no-patch --format=%%h --diff-filter=AMR "%RANGE%" -- %SECRET_FILES% 2>nul | %SYS%\findstr.exe . >nul && (
    echo.
    echo [STOP] Commits about to be pushed add files that look like keys, certificates, licences or secrets:
    git log --full-history --diff-merges=first-parent --format= --name-only --diff-filter=AMR "%RANGE%" -- %SECRET_FILES%
    echo        Nothing was pushed. Take them out of those commits first.
    exit /b 1
)
git log --full-history --diff-merges=first-parent --no-patch --format=%%h -G "%SECRET_TEXT%" "%RANGE%" 2>nul | %SYS%\findstr.exe . >nul && (
    echo.
    echo [STOP] Commits about to be pushed contain what looks like an access token or a private key:
    git log --full-history --diff-merges=first-parent --no-patch --format="        %%h %%s" -G "%SECRET_TEXT%" "%RANGE%"
    echo        Nothing was pushed. Take the secret out of those commits ^(and revoke it if it was real^).
    exit /b 1
)
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
%SYS%\choice.exe /c MGX /n /m "  Your choice [M/G/X]: "
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
%SYS%\where.exe git >nul 2>&1 && exit /b 0
if exist "%GITCMD%\git.exe"  ( set "PATH=%GITCMD%;%PATH%" & exit /b 0 )
if exist "%GITCMD2%\git.exe" ( set "PATH=%GITCMD2%;%PATH%" & exit /b 0 )

echo [setup] Git is not installed.
echo [setup] Installing it accepts the Git for Windows licence ^(GPL v2^) and, through winget,
echo         the winget source agreements.
%SYS%\choice.exe /c YN /n /m "[setup] Install Git for Windows now? [Y/N] "
if not "%errorlevel%"=="1" (
    echo [setup] Git was not installed. Install it from https://git-scm.com/download/win and run this again.
    exit /b 1
)
%SYS%\where.exe winget >nul 2>&1 && (
    echo [setup] Installing via winget...
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
) || (
    echo [setup] winget not available - downloading the Git installer, and checking its signature...
    REM The download goes to a folder of its own, and runs only when Windows confirms it is
    REM signed by the Git for Windows project.
    %SYS%\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -Command ^
      "$a=(Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest').assets | Where-Object {$_.name -match '^Git-[\d.]+-64-bit\.exe$'} | Select-Object -First 1; $d=Join-Path $env:TEMP ([guid]::NewGuid().ToString()); New-Item -ItemType Directory $d | Out-Null; $f=Join-Path $d $a.name; Invoke-WebRequest $a.browser_download_url -OutFile $f; $s=Get-AuthenticodeSignature -LiteralPath $f; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '^CN=Johannes Schindelin,') { Remove-Item -Recurse -Force $d; throw ('The Git installer is not signed by the Git for Windows project (' + $s.Status + '). Nothing was installed.') }; Start-Process -FilePath $f -ArgumentList '/VERYSILENT','/NORESTART' -Wait; Remove-Item -Recurse -Force $d"
)

set "PATH=%GITCMD%;%GITCMD2%;%PATH%"
%SYS%\where.exe git >nul 2>&1 && ( echo [setup] Git installed successfully. & exit /b 0 )
echo [ERROR] Git could not be installed automatically.
echo         Install it manually from https://git-scm.com/download/win and run this again.
exit /b 1

:fail
echo.
echo [ERROR] Sync did not complete - read the messages above.
pause
exit /b 1
