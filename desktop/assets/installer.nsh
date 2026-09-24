; Included by the installer and uninstaller of every variant (package.ts, nsis.include).
;
; Before installing, updating or uninstalling, electron-builder's installer closes the app if it is
; running. It decides that by whether a program's path starts with the install folder - with no
; backslash after it, so "...\Programs\Evoke Training Studio" also matches everything in
; "...\Programs\Evoke Training Studio BU": installing the internal variant would close a customer
; variant that is open beside it. This is electron-builder 26.15.3's own check
; (templates/nsis/include/allowOnlyOneInstallerInstance.nsh: _CHECK_APP_RUNNING, FIND_PROCESS,
; KILL_PROCESS), the same in every other way, with the backslash after the folder. package.ts stops
; at any other electron-builder version, so the copy is compared again first.

; The original includes these only when there is no customCheckAppRunning.
!include "getProcessInfo.nsh"
Var pid

!macro STUDIO_FIND_PROCESS _FILE _RETURN
  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR\', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
    Pop ${_RETURN}
  ${else}
    ; By the program's name, which is the variant's own ("Evoke Training Studio BU.exe").
    nsExec::Exec `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${_FILE}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${_FILE}\""`
    Pop ${_RETURN}
  ${endIf}
!macroend

!macro STUDIO_KILL_PROCESS _FILE _FORCE
  Push $0
  ${if} ${_FORCE} == 1
    ${if} $IsPowerShellAvailable == 0
      StrCpy $0 "-Force"
    ${else}
      StrCpy $0 "/F"
    ${endIf}
  ${else}
    StrCpy $0 ""
  ${endIf}

  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR\', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }"`
  ${else}
    nsExec::Exec `"$CmdPath" /C taskkill $0 /IM "${_FILE}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
  ${endIf}
  Pop $0
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      # allow app to exit without explicit kill
      Sleep 300
    ${endIf}

    !insertmacro STUDIO_FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${if} ${isUpdated}
        # allow app to exit without explicit kill
        Sleep 1000
        Goto studioStopProcess
      ${endIf}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK studioStopProcess
      Quit

      studioStopProcess:

      DetailPrint "$(appClosing)"

      !insertmacro STUDIO_KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      # to ensure that files are not "in-use"
      Sleep 300

      # Retry counter
      StrCpy $R1 0

      studioLoop:
        IntOp $R1 $R1 + 1

        !insertmacro STUDIO_FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          # wait to give a chance to exit gracefully
          Sleep 1000
          !insertmacro STUDIO_KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1 # 1 = force kill
          !insertmacro STUDIO_FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
          ${if} $R0 == 0
            DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
            Sleep 2000
          ${else}
            Goto studioNotRunning
          ${endIf}
        ${else}
          Goto studioNotRunning
        ${endIf}

        # App likely running with elevated permissions.
        # Ask user to close it manually
        ${if} $R1 > 1
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY studioLoop
          Quit
        ${else}
          Goto studioLoop
        ${endIf}
      studioNotRunning:
    ${endIf}
  ${endIf}
!macroend
