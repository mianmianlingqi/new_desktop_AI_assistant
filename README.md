# 🤖 Desktop AI Assistant

> 基于 Electron 的悬浮窗式桌面 AI 助手，支持多 API 接入、图片上传与一键截屏识图。

---

## ✨ 功能特性

- **多模型支持**：兼容 OpenAI、以及任何遵循 OpenAI API 规范的第三方接口
- **悬浮窗模式**：始终置顶，不干扰日常操作，可调节透明度
- **一键截屏**：全局快捷键（默认 `Alt+S`）截取任意屏幕区域
- **图片上传**：支持直接粘贴或上传图片发送给 AI
- **系统托盘**：最小化至托盘，轻量常驻
- **代理支持**：内置 HTTP 代理配置，方便国内用户使用
- **本地持久化**：配置与历史记录通过 `electron-store` 本地保存
- **Markdown 渲染**：AI 回复支持代码高亮与 Markdown 格式展示

---

## 🚀 快速开始

### 环境要求

- Node.js >= 16.x
- npm >= 8.x

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
npm run dev
```

### 打包构建

```bash
# Windows 安装包 + 便携版
npm run build:win

# 仅生成目录（不打包，用于调试）
npm run build:dir
```

打包产物输出至 `dist/` 目录。

---

## ⚙️ 配置说明

首次启动后，点击界面右上角的设置图标进行配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API 地址 | 兼容 OpenAI 格式的接口地址 | `https://api.openai.com/v1/chat/completions` |
| API Key | 访问密钥 | - |
| 模型 | 使用的模型名称 | `gpt-4o` |
| 截屏快捷键 | 全局截屏热键 | `Alt+S` |
| 最大 Token 数 | 单次最大生成长度 | `2048` |
| 代理地址 | HTTP 代理主机与端口 | `127.0.0.1:7890` |
| 透明度 | 窗口透明度（0.1 ～ 1.0） | `0.95` |
| 最大历史条数 | 保留的对话轮次上限 | `50` |

---

## 📁 项目文件结构

```
new_desktop_AI_assistant/
├── 360bdc321987daa2012b50e97acea4f7853cfaec_raw.jpg   # 默认亚克力背景图，打包时随应用分发
├── main.js                                           # Electron 主进程，窗口、托盘、IPC、截图、退出清理与单实例控制
├── preload.js                                        # 预加载桥接，向渲染进程暴露安全 API
├── package.json                                      # 项目依赖、脚本与 electron-builder 配置
├── package-lock.json                                 # npm 依赖锁文件
├── README.md                                         # 项目说明文档
├── .gitignore                                        # Git 忽略规则
├── build/
│   └── installer.nsh                                 # NSIS 卸载扩展脚本，强制清理进程、本地残留数据并异步删除空安装目录
├── scripts/
│   └── safe-build.js                                 # 安全打包脚本，负责清理进程、包装进程与隔离敏感配置
├── src/
│   ├── index.html                                    # 主界面 HTML，含聊天区与设置面板
│   ├── screenshot.html                               # 区域截图选择窗口页面
│   ├── assets/
│   │   └── icon.png                                  # 应用图标
│   ├── scripts/
│   │   ├── renderer.js                               # 渲染进程交互、设置保存、背景图效果逻辑
│   │   └── screenshot-region.js                      # 区域截图框选逻辑
│   └── styles/
│       └── main.css                                  # 主界面样式与文本选择等交互样式
├── dist/                                             # 打包输出目录，由构建流程生成
└── .github/
    ├── copilot-instructions.md                       # Copilot 协作与项目结构规范
    └── agents/                                       # 自定义 AI Agent 配置
```

---

## 🛠 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| [Electron](https://www.electronjs.org/) | ^28.0.0 | 桌面应用框架 |
| [electron-store](https://github.com/sindresorhus/electron-store) | ^8.1.0 | 本地配置与数据持久化 |
| [marked](https://marked.js.org/) | ^11.0.0 | Markdown 解析与渲染 |
| [https-proxy-agent](https://github.com/TooTallNate/proxy-agents) | ^7.0.6 | HTTP/HTTPS 代理支持 |
| [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) | ^1.15.0 | 全屏截图捕获 |
| [electron-builder](https://www.electron.build/) | ^24.0.0 | 应用打包与安装包生成 |

---

## 📦 打包产物说明

执行 `npm run build:win` 后，`dist/` 目录会生成：

- `Desktop AI Assistant Setup x.x.x.exe` — Windows 安装包（NSIS）
- `Desktop AI Assistant-x.x.x-portable.exe` — Windows 便携版，无需安装

---

## 📝 开发规范

本项目使用 GitHub Copilot **蜂后模式**进行 AI 辅助开发：
- 所有代码注释使用**中文**
- 遵循高内聚低耦合架构原则
- 关键路径需有完善的日志与错误处理
- 详见 [.github/copilot-instructions.md](.github/copilot-instructions.md)

---

## 📄 License

[MIT](LICENSE)
