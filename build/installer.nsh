!macro customUnInstall
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
!macroend