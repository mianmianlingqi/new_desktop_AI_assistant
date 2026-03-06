/**
 * Desktop AI Assistant - Electron 主进程
 * 负责窗口管理、系统托盘、截屏功能、IPC通信
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, globalShortcut, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const DEFAULT_COLLAPSED_HEIGHT = 40;

// 初始化配置存储
const store = new Store({
  defaults: {
    // API配置
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-4o',
    // 窗口配置
    windowWidth: 420,
    windowHeight: 650,
    windowX: undefined,
    windowY: undefined,
    alwaysOnTop: true,
    opacity: 0.95,
    // 代理配置
    proxyEnabled: false,
    proxyHost: '127.0.0.1',
    proxyPort: '7890',
    // 截屏快捷键
    screenshotShortcut: 'Alt+S',
    // 最大历史消息数
    maxHistory: 50,
    // 最大生成token数（越小响应越快）
    maxTokens: 2048,
    // 亚克力背景图片配置
    bgImage: '',          // 背景图片 base64（JPEG 压缩后）
    bgBlur: 10,           // 背景模糊度（px）
    bgMaskOpacity: 0.55   // 遮罩透明度（0~1）
  }
});

let mainWindow = null;
let tray = null;
let screenshotWindow = null;
let isQuitting = false;
let forceExitTimer = null;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  console.log(`[${new Date().toISOString()}] [INFO] 检测到已有实例正在运行，当前进程将退出。PID=${process.pid}`);
  app.quit();
}

// 日志工具
function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, message, ...args);
  } else {
    console.log(prefix, message, ...args);
  }
}

/**
 * 获取应用运行时临时目录
 * 将截图等临时文件集中到固定目录，便于退出和卸载时清理
 */
function getRuntimeTempDir() {
  return path.join(app.getPath('temp'), 'desktop-ai-assistant');
}

/**
 * 确保运行时临时目录存在
 */
function ensureRuntimeTempDir() {
  const runtimeTempDir = getRuntimeTempDir();
  fs.mkdirSync(runtimeTempDir, { recursive: true });
  return runtimeTempDir;
}

/**
 * 清理运行期间生成的临时文件
 */
function cleanupRuntimeTempFiles() {
  const runtimeTempDir = getRuntimeTempDir();
  if (!fs.existsSync(runtimeTempDir)) {
    return;
  }

  try {
    fs.rmSync(runtimeTempDir, { recursive: true, force: true });
    log('info', `运行时临时目录已清理: ${runtimeTempDir}`);
  } catch (err) {
    log('error', `清理运行时临时目录失败: ${err.message}`);
  }
}

/**
 * 关闭辅助窗口，避免退出时残留隐藏窗口或截图窗口
 */
function closeAuxiliaryWindows() {
  if (screenshotWindow && !screenshotWindow.isDestroyed()) {
    screenshotWindow.destroy();
    log('info', '截图窗口已销毁');
  }
  screenshotWindow = null;
}

/**
 * 销毁托盘，释放托盘句柄
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
    log('info', '系统托盘已销毁');
  }
}

/**
 * 统一执行应用退出流程
 */
function requestAppQuit(source = 'unknown') {
  if (isQuitting) {
    log('info', `收到重复退出请求，忽略。来源: ${source}`);
    return;
  }

  isQuitting = true;
  log('info', `开始退出应用。来源: ${source}`);

  closeAuxiliaryWindows();
  destroyTray();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }

  if (forceExitTimer) {
    clearTimeout(forceExitTimer);
  }

  forceExitTimer = setTimeout(() => {
    log('error', '常规退出超时，执行强制退出');
    app.exit(0);
  }, 4000);

  app.quit();
}

/**
 * 恢复主窗口到可见并聚焦的状态
 * 用于托盘隐藏、最小化恢复以及二次启动时复用已有实例
 */
function restoreMainWindow(source = 'unknown') {
  if (!mainWindow || mainWindow.isDestroyed()) {
    log('info', `主窗口不存在，准备重新创建。来源: ${source}`);
    createMainWindow();
  }

  if (!mainWindow) {
    log('error', `恢复主窗口失败，主窗口仍不可用。来源: ${source}`);
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
  log('info', `主窗口已恢复到前台。来源: ${source}`);
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    log('info', `检测到重复启动请求，已复用现有实例。主进程PID=${process.pid}`);
    restoreMainWindow('second-instance');
  });
}

/**
 * 规范化API URL，确保请求地址指向 /chat/completions 端点
 * 用户可能输入多种格式的URL，此函数统一处理：
 *  - 已包含 /chat/completions 则直接返回
 *  - 以 /v1 结尾则追加 /chat/completions
 *  - 以 / 结尾则追加 v1/chat/completions
 *  - 其他情况追加 /v1/chat/completions
 */
function normalizeApiUrl(url) {
  if (!url) return url;
  // 已经是完整的 chat/completions 端点
  if (url.endsWith('/chat/completions')) return url;
  // 以 /v1 或 /v1/ 结尾，补全路径
  if (url.endsWith('/v1') || url.endsWith('/v1/')) {
    return url.replace(/\/v1\/?$/, '/v1/chat/completions');
  }
  // 以 / 结尾，追加 v1/chat/completions
  if (url.endsWith('/')) {
    return url + 'v1/chat/completions';
  }
  // 其他情况，追加 /v1/chat/completions
  return url + '/v1/chat/completions';
}

/**
 * 创建主窗口
 */
function createMainWindow() {
  const { windowWidth, windowHeight, windowX, windowY, alwaysOnTop, opacity } = store.store;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowX,
    y: windowY,
    minWidth: 350,
    minHeight: 450,
    frame: false,               // 无边框窗口
    transparent: true,          // 透明背景
    alwaysOnTop: alwaysOnTop,   // 置顶
    resizable: true,
    skipTaskbar: false,
    opacity: opacity,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // 安全：上下文隔离
      nodeIntegration: false,   // 安全：禁用Node集成
      sandbox: true             // 安全：沙箱模式
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      log('info', '主窗口正在随应用退出一起关闭');
      return;
    }

    event.preventDefault();
    log('info', '主窗口关闭请求将触发真正退出');
    requestAppQuit('main-window-close');
  });

  // 保存窗口位置
  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('windowX', x);
    store.set('windowY', y);
  });

  // 保存窗口大小
  mainWindow.on('resized', () => {
    const [width, height] = mainWindow.getSize();
    store.set('windowWidth', width);
    store.set('windowHeight', height);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  log('info', '主窗口已创建');
}

/**
 * 创建系统托盘
 */
function createTray() {
  try {
    // 使用Electron nativeImage动态生成托盘图标
    const size = 32;
    const icon = nativeImage.createEmpty();
    
    // 尝试使用应用图标，如果不存在则跳过托盘
    const iconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
    let trayIcon;
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else {
      // 生成一个有效的16x16 PNG图标
      trayIcon = generateMinimalIcon();
    }
    
    tray = new Tray(trayIcon);
    
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => restoreMainWindow('tray-menu') },
      { label: '置顶切换', type: 'checkbox', checked: store.get('alwaysOnTop'), click: (item) => {
        store.set('alwaysOnTop', item.checked);
        mainWindow && mainWindow.setAlwaysOnTop(item.checked);
      }},
      { type: 'separator' },
      { label: '截屏', click: () => startScreenshot() },
      { type: 'separator' },
      { label: '退出', click: () => requestAppQuit('tray-menu') }
    ]);

    tray.setToolTip('Desktop AI Assistant');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : restoreMainWindow('tray-click');
      }
    });
    log('info', '系统托盘已创建');
  } catch (err) {
    log('error', '创建系统托盘失败（不影响主功能）:', err.message);
  }
}

/**
 * 生成一个最小的有效PNG图标（16x16 青色填充）
 */
function generateMinimalIcon() {
  // 创建一个简单的16x16纯色RGBA buffer，用 Electron nativeImage 处理
  const width = 16;
  const height = 16;
  const channels = 4; // RGBA
  const buffer = Buffer.alloc(width * height * channels);
  
  // 填充青色 (#00D4AA) 带圆角效果
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      // 简单的圆形mask
      const cx = x - width / 2 + 0.5;
      const cy = y - height / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      
      if (dist < width / 2 - 1) {
        buffer[idx] = 0x00;     // R
        buffer[idx + 1] = 0xD4; // G
        buffer[idx + 2] = 0xAA; // B
        buffer[idx + 3] = 0xFF; // A
      } else if (dist < width / 2) {
        // 抗锯齿边缘
        const alpha = Math.max(0, Math.min(255, (width / 2 - dist) * 255));
        buffer[idx] = 0x00;
        buffer[idx + 1] = 0xD4;
        buffer[idx + 2] = 0xAA;
        buffer[idx + 3] = alpha;
      } else {
        buffer[idx + 3] = 0x00; // 完全透明
      }
    }
  }
  
  return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * 开始截屏流程（全屏截取）
 */
async function startScreenshot() {
  log('info', '开始截屏...');
  
  try {
    // 先隐藏主窗口
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }

    // 等待窗口完全隐藏
    await new Promise(resolve => setTimeout(resolve, 300));

    // 使用 desktopCapturer（Electron主进程API）
    const sources = await require('electron').desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: screen.getPrimaryDisplay().size
    });

    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail;
      const screenshotPath = path.join(ensureRuntimeTempDir(), `screenshot_${Date.now()}.png`);
      fs.writeFileSync(screenshotPath, screenshot.toPNG());
      
      log('info', `截屏已保存: ${screenshotPath}`);
      
      // 显示主窗口并发送截屏数据
      if (mainWindow) {
        mainWindow.show();
        const base64 = screenshot.toPNG().toString('base64');
        mainWindow.webContents.send('screenshot-captured', {
          base64: base64,
          path: screenshotPath
        });
      }
    } else {
      throw new Error('无法获取屏幕源');
    }
  } catch (err) {
    log('error', '截屏失败:', err.message);
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('screenshot-error', err.message);
    }
  }
}

/**
 * 使用区域截屏（创建全屏透明窗口让用户选择区域）
 */
async function startRegionScreenshot() {
  log('info', '开始区域截屏...');

  try {
    // 先隐藏主窗口
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    // 先截取全屏
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor;

    const sources = await require('electron').desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: width * scaleFactor, height: height * scaleFactor }
    });

    if (sources.length === 0) {
      throw new Error('无法获取屏幕源');
    }

    const fullScreenshot = sources[0].thumbnail;

    // 创建全屏透明窗口用于框选
    screenshotWindow = new BrowserWindow({
      fullscreen: true,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      cursor: 'crosshair',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    screenshotWindow.loadFile(path.join(__dirname, 'src', 'screenshot.html'));
    
    // 发送全屏截图作为背景
    screenshotWindow.webContents.on('did-finish-load', () => {
      screenshotWindow.webContents.send('set-screenshot-bg', fullScreenshot.toDataURL());
    });

    screenshotWindow.on('closed', () => {
      screenshotWindow = null;
    });

  } catch (err) {
    log('error', '区域截屏失败:', err.message);
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('screenshot-error', err.message);
    }
  }
}

// ============ IPC 事件处理 ============

// 窗口控制
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-close', () => {
  log('info', '收到窗口关闭请求，准备真正退出应用');
  requestAppQuit('renderer-close-button');
});
ipcMain.on('window-toggle-top', (event, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
    store.set('alwaysOnTop', value);
  }
});

// 获取配置
ipcMain.handle('get-config', () => {
  return store.store;
});

// 保存配置
ipcMain.handle('save-config', (event, config) => {
  try {
    Object.keys(config).forEach(key => {
      store.set(key, config[key]);
    });
    log('info', '配置已保存');
    return { success: true };
  } catch (err) {
    log('error', '保存配置失败:', err.message);
    return { success: false, error: err.message };
  }
});

// AI API 调用
ipcMain.handle('send-message', async (event, { messages, imageBase64 }) => {
  const apiUrl = store.get('apiUrl');
  const apiKey = store.get('apiKey');
  const model = store.get('model');

  if (!apiKey) {
    return { success: false, error: '请先在设置中配置 API Key' };
  }

  try {
    log('info', `发送API请求到: ${normalizeApiUrl(apiUrl)}, 模型: ${model}`);

    // 构建请求消息
    const requestMessages = messages.map(msg => {
      if (msg.image) {
        // 包含图片的消息
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content || '请分析这张图片' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${msg.image}` } }
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    // 设置代理
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: requestMessages,
        max_tokens: 4096
      })
    };

    // 如果启用代理
    if (store.get('proxyEnabled')) {
      const proxyHost = store.get('proxyHost');
      const proxyPort = store.get('proxyPort');
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      fetchOptions.agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
    }

    const response = await fetch(normalizeApiUrl(apiUrl), fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      log('error', `API响应错误: ${response.status} - ${errorText}`);
      return { success: false, error: `API错误 (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || '无响应内容';
    
    log('info', 'API响应成功');
    return { success: true, content: assistantMessage };

  } catch (err) {
    log('error', 'API调用失败:', err.message);
    return { success: false, error: `请求失败: ${err.message}` };
  }
});

// 流式API调用
ipcMain.handle('send-message-stream', async (event, { messages, imageBase64 }) => {
  const apiUrl = store.get('apiUrl');
  const apiKey = store.get('apiKey');
  const model = store.get('model');

  if (!apiKey) {
    return { success: false, error: '请先在设置中配置 API Key' };
  }

  try {
    log('info', `发送流式API请求到: ${normalizeApiUrl(apiUrl)}, 模型: ${model}`);

    const requestMessages = messages.map(msg => {
      if (msg.image) {
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content || '请分析这张图片' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${msg.image}` } }
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: requestMessages,
        max_tokens: store.get('maxTokens') || 2048,
        stream: true
      })
    };

    if (store.get('proxyEnabled')) {
      const proxyHost = store.get('proxyHost');
      const proxyPort = store.get('proxyPort');
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      fetchOptions.agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
    }

    const response = await fetch(normalizeApiUrl(apiUrl), fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `API错误 (${response.status}): ${errorText}` };
    }

    // 读取流式响应（使用lineBuffer处理跨chunk的不完整JSON行）
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let lineBuffer = ''; // 缓冲不完整的行

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 将新数据追加到缓冲区
      lineBuffer += decoder.decode(value, { stream: true });

      // 按换行符切割，保留最后一个不完整行
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // 最后一段可能不完整，留到下次处理

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            mainWindow?.webContents.send('stream-chunk', delta);
          }
        } catch {
          // 跨chunk的不完整JSON行，会在下次循环中被补全
        }
      }
    }

    // 处理缓冲区剩余的最后一行
    if (lineBuffer.trim().startsWith('data: ')) {
      const data = lineBuffer.trim().slice(6).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            mainWindow?.webContents.send('stream-chunk', delta);
          }
        } catch { /* ignore */ }
      }
    }

    mainWindow?.webContents.send('stream-end');
    return { success: true, content: fullContent };

  } catch (err) {
    log('error', '流式API调用失败:', err.message);
    mainWindow?.webContents.send('stream-end');
    return { success: false, error: `请求失败: ${err.message}` };
  }
});

// API连接测试
ipcMain.handle('test-connection', async () => {
  const apiUrl = store.get('apiUrl');
  const apiKey = store.get('apiKey');
  const model = store.get('model');

  if (!apiKey) {
    return { success: false, error: '请先配置 API Key' };
  }
  if (!apiUrl) {
    return { success: false, error: '请先配置 API 地址' };
  }

  const startTime = Date.now();
  log('info', `测试API连接: ${normalizeApiUrl(apiUrl)}, 模型: ${model}`);

  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: '你好，请回复"连接成功"四个字。' }],
        max_tokens: 50
      }),
      signal: AbortSignal.timeout(30000) // 30秒超时
    };

    // 如果启用代理
    if (store.get('proxyEnabled')) {
      const proxyHost = store.get('proxyHost');
      const proxyPort = store.get('proxyPort');
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      fetchOptions.agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
    }

    const response = await fetch(normalizeApiUrl(apiUrl), fetchOptions);
    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      log('error', `API测试失败: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        latency
      };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';
    const modelUsed = data.model || model;

    log('info', `API测试成功 - 延迟: ${latency}ms, 模型: ${modelUsed}, 回复: ${reply}`);
    return {
      success: true,
      latency,
      model: modelUsed,
      reply: reply.trim(),
      usage: data.usage || null
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    log('error', `API测试异常: ${err.message}`);
    let errorMsg = err.message;
    if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
      errorMsg = '连接超时（30秒），请检查网络或代理设置';
    } else if (err.message.includes('ECONNREFUSED')) {
      errorMsg = '连接被拒绝，请检查 API 地址或代理服务器';
    } else if (err.message.includes('ENOTFOUND')) {
      errorMsg = 'DNS解析失败，请检查 API 地址或网络连接';
    }
    return { success: false, error: errorMsg, latency };
  }
});

// 调整窗口高度（折叠/展开功能）
ipcMain.on('set-window-height', (event, { height, collapsed }) => {
  if (mainWindow) {
    const [width] = mainWindow.getSize();
    if (collapsed) {
      // 折叠：先解除最小高度限制，再缩小窗口
      const targetHeight = Math.max(DEFAULT_COLLAPSED_HEIGHT, Math.ceil(height));
      mainWindow.setMinimumSize(350, DEFAULT_COLLAPSED_HEIGHT);
      mainWindow.setSize(width, targetHeight, true);
    } else {
      // 展开：先放大窗口，再恢复最小高度限制
      mainWindow.setSize(width, height, true);
      setTimeout(() => mainWindow.setMinimumSize(350, 450), 300);
    }
    log('info', `窗口高度调整为: ${height}px, 折叠状态: ${collapsed}`);
  }
});

// 截屏
ipcMain.handle('take-screenshot', async () => {
  await startScreenshot();
  return { success: true };
});

// 区域截屏
ipcMain.handle('take-region-screenshot', async () => {
  await startRegionScreenshot();
  return { success: true };
});

// 区域截屏完成（从截屏窗口发回）
ipcMain.on('region-screenshot-done', (event, { base64, x, y, width, height }) => {
  log('info', `区域截屏完成: ${width}x${height}`);
  if (screenshotWindow) {
    screenshotWindow.close();
    screenshotWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('screenshot-captured', { base64 });
  }
});

// 取消区域截屏
ipcMain.on('region-screenshot-cancel', () => {
  log('info', '区域截屏已取消');
  if (screenshotWindow) {
    screenshotWindow.close();
    screenshotWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
  }
});

// 打开背景图片选择对话框（压缩后返回 base64）
ipcMain.handle('open-bg-image-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }
    ],
    title: '选择背景图片'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  try {
    const filePath = result.filePaths[0];
    // 使用 nativeImage 读取并压缩图片，限制最大宽度 1200px 以控制存储体积
    const img = nativeImage.createFromPath(filePath);
    const size = img.getSize();
    let resized = img;
    if (size.width > 1200) {
      resized = img.resize({ width: 1200 });
    }
    // 使用 JPEG 80% 质量压缩
    const jpegBuffer = resized.toJPEG(80);
    const base64 = jpegBuffer.toString('base64');
    log('info', `背景图片已选择并压缩: ${filePath}, 压缩后大小: ${Math.round(jpegBuffer.length / 1024)}KB`);
    return { success: true, base64 };
  } catch (err) {
    log('error', '处理背景图片失败:', err.message);
    return { success: false, error: err.message };
  }
});

// 打开文件选择对话框
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  const filePath = result.filePaths[0];
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase().slice(1);

  return { success: true, base64, ext, path: filePath };
});

// ============ 应用生命周期 ============

if (gotSingleInstanceLock) {
  app.on('before-quit', () => {
    isQuitting = true;
    closeAuxiliaryWindows();
    destroyTray();
  });

  app.whenReady().then(() => {
    log('info', `Desktop AI Assistant 启动中... 版本=${app.getVersion()} 主进程PID=${process.pid}`);
    
    createMainWindow();
    createTray();

    // 注册全局截屏快捷键
    const shortcut = store.get('screenshotShortcut');
    try {
      globalShortcut.register(shortcut, () => {
        startRegionScreenshot();
      });
      log('info', `截屏快捷键已注册: ${shortcut}`);
    } catch (err) {
      log('error', `注册快捷键失败: ${err.message}`);
    }

    app.on('activate', () => {
      restoreMainWindow('activate');
    });
  });

  app.on('window-all-closed', () => {
    // macOS上保持应用运行
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    if (forceExitTimer) {
      clearTimeout(forceExitTimer);
      forceExitTimer = null;
    }
    globalShortcut.unregisterAll();
    app.releaseSingleInstanceLock();
    cleanupRuntimeTempFiles();
    log('info', 'Desktop AI Assistant 已退出');
  });

  // 安全：阻止新窗口打开
  app.on('web-contents-created', (event, contents) => {
    contents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  });
}
