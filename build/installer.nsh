!macro customUnInstall
  ; 卸载前强制终止应用主进程，避免文件占用导致安装目录残留
  DetailPrint "正在终止残留进程..."
  nsExec::ExecToLog 'taskkill /F /T /IM "Desktop AI Assistant.exe"'
  Sleep 1500

  ; 强制清理安装目录中的常见运行文件，降低卸载后空目录或残留文件的概率
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.exe"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.yml"
  Delete "$INSTDIR\*.yaml"
  Delete "$INSTDIR\*.blockmap"
  RMDir /r "$INSTDIR\resources"
  RMDir "$INSTDIR"

  ; 清理桌面快捷方式残留
  Delete "$DESKTOP\Desktop AI Assistant.lnk"

  ; 清理开始菜单残留
  Delete "$SMPROGRAMS\Desktop AI Assistant\Desktop AI Assistant.lnk"
  Delete "$SMPROGRAMS\Desktop AI Assistant\Uninstall Desktop AI Assistant.lnk"
  RMDir "$SMPROGRAMS\Desktop AI Assistant"

  ; 清理应用数据目录（包含 electron-store 配置、API Key、历史记录等）
  RMDir /r "$APPDATA\desktop-ai-assistant"
  RMDir /r "$APPDATA\Desktop AI Assistant"

  ; 清理本地缓存目录
  RMDir /r "$LOCALAPPDATA\desktop-ai-assistant"
  RMDir /r "$LOCALAPPDATA\Desktop AI Assistant"
  RMDir /r "$LOCALAPPDATA\desktop-ai-assistant-updater"
  RMDir /r "$LOCALAPPDATA\Temp\desktop-ai-assistant"
  RMDir /r "$TEMP\desktop-ai-assistant"

  ; 卸载器自身位于安装目录内时，可能导致空目录无法立刻删除。
  ; 这里在临时目录生成异步清理脚本，循环重试删除安装根目录。
  InitPluginsDir
  SetOutPath "$TEMP"
  FileOpen $0 "$PLUGINSDIR\cleanup-instdir.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "cd /d %TEMP%$\r$\n"
  FileWrite $0 "for /L %%i in (1,1,30) do ($\r$\n"
  FileWrite $0 "  rmdir /S /Q $\"$INSTDIR$\" >nul 2>nul$\r$\n"
  FileWrite $0 "  if not exist $\"$INSTDIR$\" goto done$\r$\n"
  FileWrite $0 "  ping 127.0.0.1 -n 2 >nul$\r$\n"
  FileWrite $0 ")$\r$\n"
  FileWrite $0 ":done$\r$\n"
  FileWrite $0 "del /F /Q $\"%~f0$\" >nul 2>nul$\r$\n"
  FileClose $0
  Exec '"$SYSDIR\cmd.exe" /D /C ""$PLUGINSDIR\cleanup-instdir.cmd""'
!macroend