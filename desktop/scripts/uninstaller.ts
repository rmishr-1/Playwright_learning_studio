/**
 * Uninstall.bat, for the customer's zip. The installer (nsis) brings its own uninstaller; a zip has
 * none, so package.ts writes this one into the app's folder beside the program.
 *
 * It removes exactly the files and folders the zip put there, named one by one when the app is
 * packed, and then the folder itself only if nothing else is left in it: someone who unzipped
 * straight into their Desktop or Downloads loses nothing of their own. It will not run while the
 * studio is open (its files are in use then), and it asks before deleting the learner's progress,
 * work and licence (%APPDATA%\<product>), which it keeps by default, as the installer's
 * uninstaller does.
 */

/** The folder a packaged app keeps its data in: Electron's userData, named after the product. */
const dataDir = (product: string): string => '%APPDATA%\\' + product;

export function uninstallScript(product: string, entries: readonly string[]): string {
  // Names go into the script as they are, inside quotes: nothing in them may mean something to cmd.
  for (const name of [product, ...entries]) {
    if (!name || /[%!^&|<>"\r\n\\/]/.test(name)) throw new Error('Cannot name "' + name + '" safely in Uninstall.bat.');
  }
  const exe = product + '.exe';
  if (!entries.includes(exe)) throw new Error('Uninstall.bat: the app folder has no ' + exe + '.');
  const lines = [
    '@echo off',
    'setlocal',
    'set "NoDefaultCurrentDirectoryInExePath=1"',
    "rem Windows' own programs, by their full path: a folder early in PATH cannot stand in for them.",
    'set "SYS=%SystemRoot%\\System32"',
    'title Uninstall ' + product,
    'rem The folder this file is in, without its last backslash.',
    'set "APPDIR=%~dp0"',
    'set "APPDIR=%APPDIR:~0,-1%"',
    'set "DATADIR=' + dataDir(product) + '"',
    '',
    'echo ==========================================================',
    'echo  Uninstall ' + product,
    'echo ==========================================================',
    'echo  From: "%APPDIR%"',
    'echo.',
    '',
    'if not exist "%APPDIR%\\' + exe + '" goto :not_here',
    '%SYS%\\tasklist.exe /fi "imagename eq ' + exe + '" /fo csv /nh 2>nul | %SYS%\\findstr.exe /i /l /c:"' + exe + '" >nul',
    'if not errorlevel 1 goto :running',
    '',
    '%SYS%\\choice.exe /c YN /n /m "Remove the studio from this folder? [Y/N] "',
    'if errorlevel 2 goto :cancelled',
    '',
    'rem Progress, the code written in the studio and the licence: kept unless the learner says otherwise.',
    'set "DELDATA=no"',
    'if not exist "%DATADIR%\\" goto :remove_app',
    'echo.',
    'echo Your progress, the code you wrote in the studio and your licence are kept in',
    'echo   "%DATADIR%"',
    'echo Keep them if you may use the studio again on this computer.',
    '%SYS%\\choice.exe /c YN /n /m "Delete them too? [Y/N] "',
    'if not errorlevel 2 set "DELDATA=yes"',
    '',
    ':remove_app',
    'rem Out of the folder being removed, so this window does not keep it in use.',
    'cd /d "%TEMP%"',
    'echo.',
    'echo Removing the studio...',
    ...entries.map((name) => 'call :remove "%APPDIR%\\' + name + '"'),
    'set "LEFT=no"',
    ...entries.map((name) => 'if exist "%APPDIR%\\' + name + '" set "LEFT=yes"'),
    'if "%LEFT%"=="yes" goto :in_use',
    '',
    'if "%DELDATA%"=="no" goto :done',
    'if exist "%DATADIR%\\" rd /s /q "%DATADIR%"',
    'if exist "%DATADIR%\\" goto :data_in_use',
    'echo Your progress, work and licence were deleted.',
    '',
    ':done',
    'echo.',
    'echo ' + product + ' has been uninstalled.',
    'if "%DELDATA%"=="no" if exist "%DATADIR%\\" echo Your progress, work and licence are still in "%DATADIR%".',
    'echo.',
    'pause',
    'rem Last, this file itself, then its folder if nothing else is in it. (goto) ends the script first,',
    'rem so cmd does not go looking for the next line of a file that is gone.',
    '(goto) 2>nul & del /f /q "%~f0" & rd "%APPDIR%" 2>nul',
    '',
    'rem A folder (its attributes start with d) goes with everything in it; a file on its own.',
    ':remove',
    'set "ATTR=%~a1"',
    'if not defined ATTR exit /b 0',
    'if /i "%ATTR:~0,1%"=="d" (rd /s /q "%~1") else del /f /q "%~1"',
    'exit /b 0',
    '',
    ':not_here',
    'echo [STOP] ' + exe + ' is not in this folder, so this is not the studio\'s folder. Nothing was removed.',
    'goto :stop',
    '',
    ':running',
    'echo [STOP] The studio is open. Close it, then run Uninstall.bat again. Nothing was removed.',
    'goto :stop',
    '',
    ':cancelled',
    'echo Nothing was removed.',
    'goto :stop',
    '',
    ':in_use',
    'echo.',
    'echo [WARN] Some of the studio\'s files could not be removed: something is still using them.',
    'echo        Restart Windows, then run Uninstall.bat again from "%APPDIR%".',
    'goto :stop',
    '',
    ':data_in_use',
    'echo [WARN] The studio was removed, but some of your data could not be deleted:',
    'echo        "%DATADIR%"',
    'goto :stop',
    '',
    ':stop',
    'echo.',
    'pause',
    'endlocal & exit /b 1',
    '',
  ];
  // cmd.exe misreads batch files with Unix line endings.
  return lines.join('\r\n');
}
