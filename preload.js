/**
 * Desktop AI Assistant - 预加载脚本
 * 安全桥接主进程与渲染进程的通信
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  toggleTop: (value) => ipcRenderer.send('window-toggle-top', value),
  setWindowHeight: (height, collapsed) => ipcRenderer.send('set-window-height', { height, collapsed }),

  // 配置管理
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // AI消息
  sendMessage: (data) => ipcRenderer.invoke('send-message', data),
  sendMessageStream: (data) => ipcRenderer.invoke('send-message-stream', data),
  onStreamChunk: (callback) => {
    const handler = (event, chunk) => callback(chunk);
    ipcRenderer.on('stream-chunk', handler);
    return () => ipcRenderer.removeListener('stream-chunk', handler);
  },
  onStreamEnd: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('stream-end', handler);
    return () => ipcRenderer.removeListener('stream-end', handler);
  },

  // 截屏
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  takeRegionScreenshot: () => ipcRenderer.invoke('take-region-screenshot'),
  onScreenshotCaptured: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('screenshot-captured', handler);
    return () => ipcRenderer.removeListener('screenshot-captured', handler);
  },
  onScreenshotError: (callback) => {
    const handler = (event, error) => callback(error);
    ipcRenderer.on('screenshot-error', handler);
    return () => ipcRenderer.removeListener('screenshot-error', handler);
  },

  // API连接测试
  testConnection: () => ipcRenderer.invoke('test-connection'),

  // 文件
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  // 背景图片选择（返回压缩后的 base64）
  openBgImageDialog: () => ipcRenderer.invoke('open-bg-image-dialog'),

  // 区域截屏（截屏窗口使用）
  onSetScreenshotBg: (callback) => {
    const handler = (event, dataUrl) => callback(dataUrl);
    ipcRenderer.on('set-screenshot-bg', handler);
    return () => ipcRenderer.removeListener('set-screenshot-bg', handler);
  },
  regionScreenshotDone: (data) => ipcRenderer.send('region-screenshot-done', data),
  regionScreenshotCancel: () => ipcRenderer.send('region-screenshot-cancel')
});
