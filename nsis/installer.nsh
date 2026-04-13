; Injected by electron-builder (see package.json build.nsis.include).
; Ensures the app fully exits — including child processes (e.g. PowerShell mouse hook) —
; so files under $INSTDIR are not locked during uninstall.

!macro customUnInit
  ; /T kills the process tree (important for spawned helpers).
  ExecWait 'cmd.exe /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"' $0
  Sleep 2000
!macroend
