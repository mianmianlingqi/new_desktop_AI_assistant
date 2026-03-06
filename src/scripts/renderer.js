/**
 * Desktop AI Assistant - 渲染进程主逻辑
 * 处理UI交互、消息管理、API调用
 */

// ============ 状态管理 ============
const state = {
  messages: [],          // 聊天消息历史
  currentImage: null,    // 当前待发送的图片 (base64)
  isLoading: false,      // 是否正在等待响应
  streamContent: '',     // 流式响应内容
  config: {},            // 应用配置
  isCollapsed: false,    // 是否已折叠
  expandedHeight: 0,     // 展开时的窗口高度
  pendingBgImage: null   // 设置面板中待保存的背景图 base64（null=未更改、''=已清除）
};

// ============ DOM 元素引用 ============
const elements = {
  chatContainer: document.getElementById('chat-container'),
  welcomeMessage: document.getElementById('welcome-message'),
  messageInput: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),
  btnScreenshot: document.getElementById('btn-screenshot'),
  btnUpload: document.getElementById('btn-upload'),
  btnSettings: document.getElementById('btn-settings'),
  btnMinimize: document.getElementById('btn-minimize'),
  btnClose: document.getElementById('btn-close'),
  settingsOverlay: document.getElementById('settings-overlay'),
  btnSettingsClose: document.getElementById('btn-settings-close'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnCancelSettings: document.getElementById('btn-cancel-settings'),
  btnTogglePassword: document.getElementById('btn-toggle-password'),
  btnCollapse: document.getElementById('btn-collapse'),
  collapseIcon: document.getElementById('collapse-icon'),
  mainContainer: document.getElementById('main-container') || document.querySelector('.main-container'),
  titlebar: document.getElementById('titlebar'),
  imagePreviewContainer: document.getElementById('image-preview-container'),
  imagePreview: document.getElementById('image-preview'),
  btnRemoveImage: document.getElementById('btn-remove-image'),
  opacityValue: document.getElementById('opacity-value'),
  btnTestConnection: document.getElementById('btn-test-connection'),
  testResult: document.getElementById('test-result'),
  // 亚克力背景图相关元素
  btnPickBg: document.getElementById('btn-pick-bg'),
  btnClearBg: document.getElementById('btn-clear-bg'),
  bgPreviewWrap: document.getElementById('bg-preview-wrap'),
  bgPreviewImg: document.getElementById('bg-preview-img'),
  acrylicControls: document.getElementById('acrylic-controls'),
  bgImageLayer: document.getElementById('bg-image-layer'),
  bgMaskLayer: document.getElementById('bg-mask-layer')
};

// ============ 初始化 ============
async function init() {
  console.log('[渲染进程] 初始化中...');
  
  // 加载配置
  state.config = await window.electronAPI.getConfig();
  
  // 应用背景图片配置（亚克力效果）
  applyBackground(state.config);

  // 绑定事件
  bindEvents();
  
  // 注册IPC监听
  registerIPCListeners();
  
  console.log('[渲染进程] 初始化完成');
}

// ============ 事件绑定 ============
function bindEvents() {
  // 窗口控制
  elements.btnMinimize.addEventListener('click', () => window.electronAPI.minimize());
  elements.btnClose.addEventListener('click', () => window.electronAPI.close());

  // 发送消息
  elements.btnSend.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 自动调整输入框高度
  elements.messageInput.addEventListener('input', autoResizeInput);

  // 截屏
  elements.btnScreenshot.addEventListener('click', () => {
    window.electronAPI.takeRegionScreenshot();
  });

  // 上传图片
  elements.btnUpload.addEventListener('click', uploadImage);

  // 移除图片
  elements.btnRemoveImage.addEventListener('click', removeImage);

  // 设置面板
  elements.btnSettings.addEventListener('click', openSettings);
  elements.btnSettingsClose.addEventListener('click', closeSettings);
  elements.btnSaveSettings.addEventListener('click', saveSettings);
  elements.btnCancelSettings.addEventListener('click', closeSettings);

  // API连接测试
  elements.btnTestConnection.addEventListener('click', testConnection);

  // 密码显示切换
  elements.btnTogglePassword.addEventListener('click', () => {
    const input = document.getElementById('setting-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // 透明度滑块
  const opacitySlider = document.getElementById('setting-opacity');
  opacitySlider.addEventListener('input', (e) => {
    elements.opacityValue.textContent = e.target.value;
  });

  // 点击设置覆盖层关闭
  elements.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === elements.settingsOverlay) {
      closeSettings();
    }
  });

  // 背景图片选择与清除
  elements.btnPickBg.addEventListener('click', pickBgImage);
  elements.btnClearBg.addEventListener('click', clearBgImage);

  // 亚克力模糊度滑块
  document.getElementById('setting-bg-blur').addEventListener('input', (e) => {
    document.getElementById('bg-blur-value').textContent = e.target.value;
  });

  // 遮罩透明度滑块
  document.getElementById('setting-bg-mask').addEventListener('input', (e) => {
    document.getElementById('bg-mask-value').textContent = e.target.value;
  });

  // 折叠/展开
  elements.btnCollapse.addEventListener('click', toggleCollapse);
}

/**
 * 折叠或展开聊天区域
 */
function toggleCollapse() {
  state.isCollapsed = !state.isCollapsed;

  if (state.isCollapsed) {
    // 记录展开高度
    state.expandedHeight = window.outerHeight;
    // 隐藏主内容区
    elements.mainContainer.classList.add('collapsed');
    document.body.classList.add('collapsed');
    elements.titlebar.classList.add('collapsed');
    // 更换图标为向下箭头（表示可展开）
    elements.collapseIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
    elements.btnCollapse.title = '展开';
    // 通知主进程缩小窗口（collapsed=true 先解除最小高度限制）
    window.electronAPI.setWindowHeight(42, true);
  } else {
    // 展开：先恢复窗口高度
    const targetHeight = state.expandedHeight || 650;
    window.electronAPI.setWindowHeight(targetHeight, false);
    setTimeout(() => {
      elements.mainContainer.classList.remove('collapsed');
      document.body.classList.remove('collapsed');
      elements.titlebar.classList.remove('collapsed');
    }, 50);
    // 更换图标为向上箭头（表示可折叠）
    elements.collapseIcon.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
    elements.btnCollapse.title = '折叠';
  }

  console.log(`[渲染进程] 窗口${state.isCollapsed ? '已折叠' : '已展开'}`);
}

// ============ IPC 监听 ============
function registerIPCListeners() {
  // 截屏完成
  window.electronAPI.onScreenshotCaptured((data) => {
    console.log('[渲染进程] 收到截屏数据');
    setImage(data.base64);
    showToast('截屏已捕获，输入问题后发送', 'success');
  });

  // 截屏错误
  window.electronAPI.onScreenshotError((error) => {
    console.error('[渲染进程] 截屏错误:', error);
    showToast(`截屏失败: ${error}`, 'error');
  });

  // 流式响应
  window.electronAPI.onStreamChunk((chunk) => {
    state.streamContent += chunk;
    updateStreamMessage(state.streamContent);
  });

  window.electronAPI.onStreamEnd(() => {
    finalizeStreamMessage();
  });
}

// ============ 消息处理 ============

/**
 * 发送消息
 */
async function sendMessage() {
  const text = elements.messageInput.value.trim();
  
  if (!text && !state.currentImage) return;
  if (state.isLoading) return;

  // 隐藏欢迎消息
  if (elements.welcomeMessage) {
    elements.welcomeMessage.style.display = 'none';
  }

  // 创建用户消息
  const userMessage = {
    role: 'user',
    content: text || '请分析这张图片',
    image: state.currentImage,
    timestamp: new Date()
  };

  // 添加到消息历史
  state.messages.push(userMessage);
  
  // 渲染用户消息
  renderMessage(userMessage);

  // 清空输入
  elements.messageInput.value = '';
  autoResizeInput();
  removeImage();

  // 显示加载状态
  setLoading(true);
  const loadingEl = showTypingIndicator();

  try {
    // 构建API消息（保留最近的消息作为上下文）
    const maxHistory = state.config.maxHistory || 50;
    const apiMessages = state.messages.slice(-maxHistory).map(msg => ({
      role: msg.role,
      content: msg.content,
      image: msg.image || undefined
    }));

    // 调用API（使用流式传输）
    state.streamContent = '';
    const result = await window.electronAPI.sendMessageStream({ messages: apiMessages });

    // 移除加载指示器
    removeTypingIndicator(loadingEl);

    if (result.success) {
      const assistantMessage = {
        role: 'assistant',
        content: result.content,
        timestamp: new Date()
      };
      state.messages.push(assistantMessage);
      
      // 流式内容已通过 stream-chunk 实时渲染，无需再次渲染
      // 只有在没有流式内容时（如API不支持流式），才手动渲染消息
      if (!state.streamContent) {
        renderMessage(assistantMessage);
      }
    } else {
      renderErrorMessage(result.error);
    }
  } catch (err) {
    removeTypingIndicator(loadingEl);
    renderErrorMessage(`请求异常: ${err.message}`);
    console.error('[渲染进程] 发送消息失败:', err);
  } finally {
    setLoading(false);
  }
}

/**
 * 渲染消息
 */
function renderMessage(msg) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${msg.role}`;

  let content = '';

  // 如果有图片
  if (msg.image) {
    content += `<img class="message-image" src="data:image/png;base64,${msg.image}" alt="图片">`;
  }

  // 消息文本（助手消息渲染为Markdown）
  if (msg.content) {
    if (msg.role === 'assistant') {
      content += renderMarkdown(msg.content);
    } else {
      content += escapeHtml(msg.content);
    }
  }

  const timeStr = formatTime(msg.timestamp);

  messageEl.innerHTML = `
    <div class="message-bubble">${content}</div>
    <div class="message-time">${timeStr}</div>
  `;

  elements.chatContainer.appendChild(messageEl);
  scrollToBottom();
}

/**
 * 渲染错误消息
 */
function renderErrorMessage(error) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message assistant';
  messageEl.innerHTML = `
    <div class="message-bubble message-error">${escapeHtml(error)}</div>
    <div class="message-time">${formatTime(new Date())}</div>
  `;
  elements.chatContainer.appendChild(messageEl);
  scrollToBottom();
}

/**
 * 显示正在输入指示器
 */
function showTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'message assistant typing';
  el.innerHTML = `
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  elements.chatContainer.appendChild(el);
  scrollToBottom();
  return el;
}

/**
 * 移除正在输入指示器
 */
function removeTypingIndicator(el) {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

/**
 * 更新流式消息内容
 */
function updateStreamMessage(content) {
  let streamEl = document.querySelector('.stream-message');
  
  if (!streamEl) {
    // 移除typing indicator
    const typingEl = document.querySelector('.message.typing');
    if (typingEl) typingEl.remove();
    
    streamEl = document.createElement('div');
    streamEl.className = 'message assistant stream-message';
    streamEl.innerHTML = `
      <div class="message-bubble">${renderMarkdown(content)}</div>
    `;
    elements.chatContainer.appendChild(streamEl);
  } else {
    const bubble = streamEl.querySelector('.message-bubble');
    bubble.innerHTML = renderMarkdown(content);
  }
  
  scrollToBottom();
}

/**
 * 完成流式消息
 */
function finalizeStreamMessage() {
  const streamEl = document.querySelector('.stream-message');
  if (streamEl) {
    streamEl.classList.remove('stream-message');
    // 添加时间
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTime(new Date());
    streamEl.appendChild(timeEl);
  }
}

// ============ 图片处理 ============

/**
 * 上传图片
 */
async function uploadImage() {
  try {
    const result = await window.electronAPI.openFileDialog();
    if (result.success) {
      setImage(result.base64);
      showToast('图片已加载', 'success');
    }
  } catch (err) {
    console.error('[渲染进程] 上传图片失败:', err);
    showToast('图片上传失败', 'error');
  }
}

/**
 * 设置待发送的图片
 */
function setImage(base64) {
  state.currentImage = base64;
  elements.imagePreview.src = `data:image/png;base64,${base64}`;
  elements.imagePreviewContainer.style.display = 'block';
  elements.messageInput.focus();
}

/**
 * 移除待发送的图片
 */
function removeImage() {
  state.currentImage = null;
  elements.imagePreview.src = '';
  elements.imagePreviewContainer.style.display = 'none';
}

// ============ 设置面板 ============

/**
 * 打开设置面板
 */
async function openSettings() {
  const config = await window.electronAPI.getConfig();
  
  document.getElementById('setting-api-url').value = config.apiUrl || '';
  document.getElementById('setting-api-key').value = config.apiKey || '';
  document.getElementById('setting-model').value = config.model || '';
  document.getElementById('setting-max-tokens').value = config.maxTokens || 2048;
  document.getElementById('setting-proxy-enabled').checked = config.proxyEnabled || false;
  document.getElementById('setting-proxy-host').value = config.proxyHost || '';
  document.getElementById('setting-proxy-port').value = config.proxyPort || '';
  document.getElementById('setting-always-top').checked = config.alwaysOnTop !== false;
  document.getElementById('setting-opacity').value = config.opacity || 0.95;
  elements.opacityValue.textContent = config.opacity || 0.95;

  // 加载亚克力背景图片配置
  state.pendingBgImage = null; // 重置待保存状态
  const bgBlurSlider = document.getElementById('setting-bg-blur');
  const bgMaskSlider = document.getElementById('setting-bg-mask');
  bgBlurSlider.value = config.bgBlur !== undefined ? config.bgBlur : 10;
  bgMaskSlider.value = Math.round((config.bgMaskOpacity !== undefined ? config.bgMaskOpacity : 0.55) * 100);
  document.getElementById('bg-blur-value').textContent = bgBlurSlider.value;
  document.getElementById('bg-mask-value').textContent = bgMaskSlider.value;

  if (config.bgImage) {
    elements.bgPreviewImg.src = `data:image/jpeg;base64,${config.bgImage}`;
    elements.bgPreviewWrap.style.display = 'block';
    elements.btnClearBg.style.display = 'flex';
    elements.acrylicControls.style.display = 'flex';
  } else {
    elements.bgPreviewImg.src = '';
    elements.bgPreviewWrap.style.display = 'none';
    elements.btnClearBg.style.display = 'none';
    elements.acrylicControls.style.display = 'none';
  }

  elements.settingsOverlay.style.display = 'flex';
}

/**
 * 关闭设置面板
 */
function closeSettings() {
  elements.settingsOverlay.style.display = 'none';
  state.pendingBgImage = null; // 关闭时重置待保存状态
}

/**
 * 保存设置
 */
async function saveSettings() {
  const config = {
    apiUrl: document.getElementById('setting-api-url').value.trim(),
    apiKey: document.getElementById('setting-api-key').value.trim(),
    model: document.getElementById('setting-model').value.trim(),
    maxTokens: parseInt(document.getElementById('setting-max-tokens').value) || 2048,
    proxyEnabled: document.getElementById('setting-proxy-enabled').checked,
    proxyHost: document.getElementById('setting-proxy-host').value.trim(),
    proxyPort: document.getElementById('setting-proxy-port').value.trim(),
    alwaysOnTop: document.getElementById('setting-always-top').checked,
    opacity: parseFloat(document.getElementById('setting-opacity').value),
    // 亚克力背景图片配置
    bgImage: state.pendingBgImage !== null ? state.pendingBgImage : (state.config.bgImage || ''),
    bgBlur: parseInt(document.getElementById('setting-bg-blur').value) || 10,
    bgMaskOpacity: (parseInt(document.getElementById('setting-bg-mask').value) || 55) / 100
  };

  // 验证必要字段
  if (config.apiUrl && !isValidUrl(config.apiUrl)) {
    showToast('请输入有效的 API 地址', 'error');
    return;
  }

  const result = await window.electronAPI.saveConfig(config);
  
  if (result.success) {
    state.config = { ...state.config, ...config };
    
    // 实时应用窗口设置
    window.electronAPI.toggleTop(config.alwaysOnTop);
    
    // 实时应用亚克力背景效果
    applyBackground(config);
    
    closeSettings();
    showToast('设置已保存', 'success');
  } else {
    showToast('保存失败: ' + result.error, 'error');
  }
}

/**
 * 测试API连接
 */
async function testConnection() {
  const btn = elements.btnTestConnection;
  const resultEl = elements.testResult;

  // 先保存当前设置面板中的值到配置
  const tempConfig = {
    apiUrl: document.getElementById('setting-api-url').value.trim(),
    apiKey: document.getElementById('setting-api-key').value.trim(),
    model: document.getElementById('setting-model').value.trim(),
    proxyEnabled: document.getElementById('setting-proxy-enabled').checked,
    proxyHost: document.getElementById('setting-proxy-host').value.trim(),
    proxyPort: document.getElementById('setting-proxy-port').value.trim()
  };

  // 验证基本字段
  if (!tempConfig.apiUrl) {
    showTestResult(resultEl, false, '请填写 API 地址');
    return;
  }
  if (!tempConfig.apiKey) {
    showTestResult(resultEl, false, '请填写 API Key');
    return;
  }

  // 先将当前面板值临时保存到配置中（这样主进程能读取到最新值）
  await window.electronAPI.saveConfig(tempConfig);

  // 切换按钮为加载状态
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>正在测试...</span>';
  resultEl.style.display = 'none';

  try {
    const result = await window.electronAPI.testConnection();

    if (result.success) {
      let html = '<div class="result-row"><span class="result-label">状态</span><span class="result-value">✅ 连接成功</span></div>';
      html += `<div class="result-row"><span class="result-label">延迟</span><span class="result-value">${result.latency}ms</span></div>`;
      html += `<div class="result-row"><span class="result-label">模型</span><span class="result-value">${result.model}</span></div>`;
      if (result.reply) {
        html += `<div class="result-row"><span class="result-label">回复</span><span class="result-value">${escapeHtml(result.reply.substring(0, 100))}</span></div>`;
      }
      if (result.usage) {
        html += `<div class="result-row"><span class="result-label">Token消耗</span><span class="result-value">${result.usage.total_tokens || '-'}</span></div>`;
      }
      showTestResult(resultEl, true, html);
    } else {
      showTestResult(resultEl, false, `❌ ${escapeHtml(result.error)}${result.latency ? ` (${result.latency}ms)` : ''}`);
    }
  } catch (err) {
    showTestResult(resultEl, false, `❌ 测试异常: ${escapeHtml(err.message)}`);
    console.error('[渲染进程] 测试连接失败:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>测试 API 连接</span>`;
  }
}

/**
 * 显示测试结果
 */
function showTestResult(el, success, content) {
  el.className = `test-result ${success ? 'success' : 'error'}`;
  el.innerHTML = content;
  el.style.display = 'block';
}

// ============ 工具函数 ============

/**
 * 自动调整输入框高度
 */
function autoResizeInput() {
  const el = elements.messageInput;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  requestAnimationFrame(() => {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
  });
}

/**
 * 设置加载状态
 */
function setLoading(loading) {
  state.isLoading = loading;
  elements.btnSend.disabled = loading;
  elements.messageInput.disabled = loading;
}

/**
 * 格式化时间
 */
function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * HTML转义（防止XSS）
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 简单的Markdown渲染
 */
function renderMarkdown(text) {
  if (!text) return '';
  
  let html = escapeHtml(text);
  
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 加粗
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // 斜体
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // 引用
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  
  // 无序列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // 换行
  html = html.replace(/\n/g, '<br>');
  
  // 清理多余的br
  html = html.replace(/<br><br>/g, '</p><p>');
  html = html.replace(/<br>(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)<br>/g, '$1');
  html = html.replace(/<br>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<br>/g, '$1');
  html = html.replace(/<br>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<br>/g, '$1');
  html = html.replace(/<br>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<br>/g, '$1');
  
  return html;
}

// ============ 背景图片 / 亚克力效果 ============

/**
 * 选择背景图片
 * 通过主进程打开文件对话框，读取并压缩图片为 JPEG base64
 */
async function pickBgImage() {
  try {
    const result = await window.electronAPI.openBgImageDialog();
    if (result.success) {
      state.pendingBgImage = result.base64;
      elements.bgPreviewImg.src = `data:image/jpeg;base64,${result.base64}`;
      elements.bgPreviewWrap.style.display = 'block';
      elements.btnClearBg.style.display = 'flex';
      elements.acrylicControls.style.display = 'flex';
    }
  } catch (err) {
    console.error('[渲染进程] 选择背景图片失败:', err);
    showToast('背景图片加载失败', 'error');
  }
}

/**
 * 清除背景图片（设置面板内）
 */
function clearBgImage() {
  state.pendingBgImage = '';   // 空字符串表示"用户主动清除"
  elements.bgPreviewImg.src = '';
  elements.bgPreviewWrap.style.display = 'none';
  elements.btnClearBg.style.display = 'none';
  elements.acrylicControls.style.display = 'none';
}

/**
 * 应用背景图片及亚克力效果到窗口
 * @param {object} config - 包含 bgImage、bgBlur、bgMaskOpacity 的配置对象
 */
function applyBackground(config) {
  const bgImageLayer = elements.bgImageLayer;
  const bgMaskLayer = elements.bgMaskLayer;

  if (config.bgImage) {
    // 设置亚克力 CSS 变量
    document.documentElement.style.setProperty('--acrylic-blur', `${config.bgBlur !== undefined ? config.bgBlur : 10}px`);
    document.documentElement.style.setProperty('--acrylic-mask', config.bgMaskOpacity !== undefined ? config.bgMaskOpacity : 0.55);
    // 将 base64 图片设置到背景图层
    bgImageLayer.style.backgroundImage = `url(data:image/jpeg;base64,${config.bgImage})`;
    // 激活亚克力模式
    document.body.classList.add('has-bg-image');
  } else {
    // 清除背景图并关闭亚克力模式
    bgImageLayer.style.backgroundImage = '';
    document.body.classList.remove('has-bg-image');
  }
}

/**
 * 验证URL
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// ============ 启动 ============
init();
