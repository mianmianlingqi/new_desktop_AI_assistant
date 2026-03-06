/**
 * Desktop AI Assistant - 区域截屏脚本
 * 在全屏透明窗口中实现拖拽框选截屏区域
 */

const bgImg = document.getElementById('screenshot-bg');
const overlay = document.getElementById('overlay');
const selection = document.getElementById('selection');
const sizeInfo = document.getElementById('size-info');
const hint = document.getElementById('hint');
const toolbar = document.getElementById('toolbar');
const btnConfirm = document.getElementById('btn-confirm');
const btnCancel = document.getElementById('btn-cancel-region');

let isDrawing = false;
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;
let selectionDone = false;

// 接收全屏截图作为背景
window.electronAPI.onSetScreenshotBg((dataUrl) => {
  bgImg.src = dataUrl;
});

// 鼠标按下，开始框选
document.addEventListener('mousedown', (e) => {
  if (selectionDone) return;
  if (e.button !== 0) return; // 只处理左键
  
  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  
  selection.style.display = 'block';
  selection.style.left = startX + 'px';
  selection.style.top = startY + 'px';
  selection.style.width = '0px';
  selection.style.height = '0px';
  
  hint.style.display = 'none';
  toolbar.style.display = 'none';
  sizeInfo.style.display = 'block';
});

// 鼠标移动，更新选区
document.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  
  endX = e.clientX;
  endY = e.clientY;
  
  const rect = getSelectionRect();
  
  selection.style.left = rect.x + 'px';
  selection.style.top = rect.y + 'px';
  selection.style.width = rect.width + 'px';
  selection.style.height = rect.height + 'px';
  
  // 更新尺寸信息
  sizeInfo.textContent = `${rect.width} × ${rect.height}`;
  sizeInfo.style.left = (rect.x + rect.width / 2 - 30) + 'px';
  sizeInfo.style.top = (rect.y - 28) + 'px';
});

// 鼠标松开，完成框选
document.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  
  isDrawing = false;
  endX = e.clientX;
  endY = e.clientY;
  
  const rect = getSelectionRect();
  
  // 如果选区太小，忽略
  if (rect.width < 10 || rect.height < 10) {
    selection.style.display = 'none';
    sizeInfo.style.display = 'none';
    hint.style.display = 'block';
    return;
  }
  
  selectionDone = true;
  
  // 显示工具栏
  toolbar.style.display = 'flex';
  toolbar.style.left = (rect.x + rect.width - toolbar.offsetWidth) + 'px';
  toolbar.style.top = (rect.y + rect.height + 8) + 'px';
  
  // 如果工具栏超出屏幕底部，放到选区上方
  if (rect.y + rect.height + 50 > window.innerHeight) {
    toolbar.style.top = (rect.y - 44) + 'px';
  }
});

// 确认截屏
btnConfirm.addEventListener('click', () => {
  const rect = getSelectionRect();
  captureRegion(rect);
});

// 取消截屏
btnCancel.addEventListener('click', () => {
  window.electronAPI.regionScreenshotCancel();
});

// ESC键取消
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.electronAPI.regionScreenshotCancel();
  }
  // Enter键确认
  if (e.key === 'Enter' && selectionDone) {
    const rect = getSelectionRect();
    captureRegion(rect);
  }
});

/**
 * 获取选区矩形（处理反向拖拽）
 */
function getSelectionRect() {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
}

/**
 * 截取选定区域
 */
function captureRegion(rect) {
  // 隐藏UI元素
  selection.style.display = 'none';
  overlay.style.display = 'none';
  sizeInfo.style.display = 'none';
  toolbar.style.display = 'none';
  hint.style.display = 'none';
  
  // 使用Canvas裁剪图片
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // 考虑设备像素比
  const dpr = window.devicePixelRatio || 1;
  const imgWidth = bgImg.naturalWidth;
  const imgHeight = bgImg.naturalHeight;
  const scaleX = imgWidth / window.innerWidth;
  const scaleY = imgHeight / window.innerHeight;
  
  canvas.width = rect.width * scaleX;
  canvas.height = rect.height * scaleY;
  
  ctx.drawImage(
    bgImg,
    rect.x * scaleX,
    rect.y * scaleY,
    rect.width * scaleX,
    rect.height * scaleY,
    0, 0,
    canvas.width,
    canvas.height
  );
  
  // 获取裁剪后的base64
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  
  // 发送回主进程
  window.electronAPI.regionScreenshotDone({
    base64: base64,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  });
}
