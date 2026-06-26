# SSH 移动终端 — 代码说明文档

> 本文档面向想要阅读、修改或扩展代码的开发者。如果你是初学者，建议先看 [功能说明文档](FEATURES.md) 了解项目做什么，再回来看代码怎么做的。

---

## 目录

1. [项目结构总览](#1-项目结构总览)
2. [技术栈简介](#2-技术栈简介)
3. [后端代码详解](#3-后端代码详解)
4. [前端代码详解](#4-前端代码详解)
5. [数据流向](#5-数据流向)
6. [如何扩展功能](#6-如何扩展功能)

---

## 1. 项目结构总览

```
ssh_app/
├── package.json              # 项目配置文件：名称、依赖、脚本
├── tsconfig.json             # TypeScript 编译选项（前端用）
├── vite.config.ts            # Vite 构建配置
│
├── server/                   # 后端代码（Node.js）
│   ├── tsconfig.json         # TypeScript 编译选项（后端用）
│   └── src/
│       ├── index.ts          # 🔑 服务器入口文件：启动服务
│       ├── config.ts         # 配置管理：读取环境变量
│       ├── auth.ts           # 认证模块：令牌验证
│       ├── ssh-connection.ts # SSH 连接封装：连接远程服务器
│       └── ws-handler.ts     # 🔑 WebSocket 处理：浏览器↔SSH 的桥梁
│
├── client/                   # 前端代码（React）
│   ├── index.html            # HTML 页面模板
│   └── src/
│       ├── main.tsx          # React 应用入口
│       ├── App.tsx           # 🔑 根组件：状态管理和界面切换
│       ├── App.css           # 全局样式
│       ├── vite-env.d.ts     # Vite 类型声明
│       ├── components/       # 组件目录
│       │   ├── ConnectForm.tsx   # 连接表单
│       │   ├── ConnectForm.css   # 表单样式
│       │   ├── Terminal.tsx      # 终端显示
│       │   ├── Terminal.css      # 终端样式
│       │   ├── StatusBar.tsx     # 底部状态栏
│       │   └── StatusBar.css     # 状态栏样式
│       ├── hooks/            # 自定义 Hook 目录
│       │   ├── useWebSocket.ts   # WebSocket 连接管理
│       │   └── useTerminal.ts    # xterm.js 终端管理
│       └── pwa/              # PWA 配置
│           ├── manifest.json     # PWA 清单
│           └── sw.js             # Service Worker
│
├── public/                   # 静态资源（PWA 图标等）
├── docs/                     # 文档目录
│   ├── DEPLOYMENT.md         # 部署文档
│   ├── API.md                # 接口文档
│   ├── FEATURES.md           # 功能说明
│   └── CODE-GUIDE.md         # 本文件：代码说明
│
└── dist/                     # 构建输出（运行 npm run build 后生成）
    ├── client/               # 前端构建产物
    └── server/               # 后端构建产物
```

---

## 2. 技术栈简介

### 什么是 TypeScript？

TypeScript 是 JavaScript 的"增强版"。它在 JavaScript 基础上添加了**类型标注**，让你写代码时就能发现错误（比如把字符串传给需要数字的函数），而不是等到运行时才报错。

```typescript
// JavaScript：运行时才发现拼写错误
function add(a, b) { return a + b; }
add(1, "2");  // 结果："12"（字符串拼接，不是 3！）

// TypeScript：写代码时编辑器就提示错误
function add(a: number, b: number): number { return a + b; }
add(1, "2");  // ❌ 编辑器标红：类型不匹配
```

### 什么是 React？

React 是 Facebook 开发的**前端 UI 框架**。它把界面拆成"组件"——每个组件是一块独立的 HTML + CSS + 逻辑。组件之间通过 props（属性）传递数据。

```tsx
// 组件示例：一个带标题的卡片
function Card({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

// 使用组件
<Card title="欢迎">
  <p>这是卡片内容</p>
</Card>
```

### 什么是 xterm.js？

xterm.js 是一个在浏览器中模拟**真实终端**的库。它能渲染 ANSI 转义序列（颜色、光标控制等），让网页上的终端看起来和真的一样。VS Code 的内置终端就是用它做的。

### 什么是 WebSocket？

HTTP 是"请求-响应"模式——浏览器问，服务器答。WebSocket 不同：建立连接后，双方可以**随时互发消息**，不需要等对方先开口。这非常适合 SSH 终端——你按下一个键，需要立刻传给服务器；服务器有输出，也需要立刻显示出来。

---

## 3. 后端代码详解

### 3.1 执行流程

```
启动服务器 (index.ts)
    ↓
读取配置 (config.ts)
    ↓
创建 HTTP 服务器 + WebSocket 服务器 (index.ts)
    ↓
等待浏览器 WebSocket 连接
    ↓
收到连接 → 转给 ws-handler.ts 处理
    ↓
收到 connect 消息 → 验证令牌 (auth.ts)
    ↓
验证通过 → 建立 SSH 连接 (ssh-connection.ts)
    ↓
双向转发：浏览器按键 → SSH 写入
            SSH 输出 → 浏览器显示
    ↓
任意一端断开 → 清理另一端的连接
```

### 3.2 config.ts — 配置管理

**作用**：从环境变量读取服务器配置。

```typescript
// 环境变量是什么？
// 环境变量是操作系统级别的变量，用来传递配置信息
// 例如：SSH_PORT=3001 node server.js
//       意思是"用端口 3001 启动服务器"

export function getConfig(): ServerConfig {
  return {
    port: parseInt(process.env.SSH_PORT || '3001', 10),
    host: process.env.SSH_HOST || '0.0.0.0',
    accessToken: process.env.SSH_ACCESS_TOKEN || undefined,
  };
}
```

**为什么要用环境变量？**
- 密码/令牌不会写死在代码里
- 同一个代码在不同环境（开发/生产）用不同配置
- 不会不小心把密码提交到 git

### 3.3 auth.ts — 令牌验证

**作用**：验证客户端是否有权使用后端代理。

```typescript
export function verifyToken(clientToken, expectedToken) {
  // 如果服务器没有设置令牌 → 允许所有连接
  if (!expectedToken) return true;
  // 如果服务器设置了令牌但客户端没提供 → 拒绝
  if (!clientToken) return false;
  // 比较是否一致
  return clientToken === expectedToken;
}
```

### 3.4 ssh-connection.ts — SSH 连接封装

**作用**：使用 ssh2 库连接远程服务器，打开交互式 shell。

关键点：
1. 密码只在 `client.connect()` 调用时使用一次
2. 函数返回后密码变量被 JavaScript 垃圾回收
3. 不记录包含密码的日志

```typescript
// 核心流程简化为伪代码：
function createConnection(options) {
  const client = new ssh2.Client();

  client.connect({
    host: options.host,
    username: options.username,
    password: options.password,  // ← 密码只在这里用
  });

  client.on('ready', () => {
    client.shell({}, (err, stream) => {
      // stream 就是 SSH 的输入输出流
      stream.on('data', (data) => onData(data));  // 服务器输出 → 转发
      stream.write('...');  // 浏览器输入 → 转发给服务器
    });
  });

  return { write, close, resize };  // 三个操作接口
}
```

### 3.5 ws-handler.ts — WebSocket 消息处理

**作用**：这是后端的核心文件——在浏览器和 SSH 之间搭桥。

它监听三种消息：

| 消息类型 | 处理逻辑 |
|----------|----------|
| `connect` | 验证→连接 SSH→返回结果 |
| `input` | 写入 SSH 会话 |
| `resize` | 调整 SSH 窗口大小 |

### 3.6 index.ts — 服务器入口

**作用**：把 config、auth、ssh-connection、ws-handler 组装起来，启动服务。

---

## 4. 前端代码详解

### 4.1 组件关系图

```
App.tsx (根组件 - 状态管理)
├── ConnectForm.tsx    (未连接时显示)
│   └── 调用 useWebSocket 的 send()
├── Terminal.tsx       (已连接时显示)
│   └── 调用 useTerminal Hook
│       └── 使用 xterm.js 库
└── StatusBar.tsx      (已连接时显示)
    └── 显示主机名 + 断开按钮
```

### 4.2 App.tsx — 应用核心

**作用**：管理整个应用的"状态"——当前是显示表单还是终端。

```typescript
// 状态机：
// idle       → 用户还没连接 → 显示 ConnectForm
// connecting → 正在连接中   → 显示 ConnectForm（按钮禁用）
// connected  → 已连接       → 显示 Terminal + StatusBar

function App() {
  const [connectionState, setConnectionState] = useState('idle');

  // 根据状态显示不同界面
  if (connectionState === 'connected') {
    return <><Terminal /><StatusBar /></>;
  } else {
    return <ConnectForm />;
  }
}
```

### 4.3 React 核心概念解释

**useState**：React 的"记忆"机制。当你调用 `setConnectionState('connected')` 时：
1. React 更新这个值
2. React 自动重新渲染界面

**useEffect**：React 的"副作用"机制。当你需要在组件显示后做一些事情（如连接 WebSocket），放在 useEffect 里。

**useCallback**：React 的"函数缓存"机制。防止每次渲染都创建新函数，提高性能。

**useRef**：React 的"引用"机制。保存一个值，但变化时不触发重新渲染。适合保存 WebSocket 实例、定时器 ID 等。

### 4.4 数据流动路径

```
用户在 ConnectForm 填写信息
    ↓ 点击"连接"
App.tsx 的 handleConnect() 被调用
    ↓ 通过 useWebSocket 的 send()
WebSocket 发送 { type: 'connect', ... } 到后端
    ↓
后端返回 { type: 'connected' }
    ↓
useWebSocket 的 lastMessage 更新
    ↓
App.tsx 的 useEffect 检测到 connected 消息
    ↓
setConnectionState('connected')
    ↓
界面切换为 Terminal + StatusBar
    ↓
用户按键 → Terminal.onInput → send({ type: 'input' }) → WebSocket → 后端 → SSH
后端收到 SSH 数据 → WebSocket → lastMessage → Terminal 显示
```

### 4.5 ConnectForm.tsx — 连接表单

每个输入框都有对应的 state：
- `host` — 主机地址
- `port` — 端口（默认 "22"）
- `username` — 用户名
- `password` — 密码
- `token` — 访问令牌

```tsx
// 输入框绑定 state 的写法：
<input
  value={host}                         // 显示当前值
  onChange={(e) => setHost(e.target.value)}  // 用户输入时更新 state
/>
```

### 4.6 Terminal.tsx + useTerminal.ts — 终端

`useTerminal` Hook 封装了 xterm.js 的初始化和操作：

1. **初始化**：创建 Terminal 实例 + FitAddon（自适应） + WebglAddon（GPU 加速）
2. **onData 回调**：用户在终端按键时触发，转发给 SSH
3. **writeToTerminal**：把 SSH 数据写入终端显示
4. **fitTerminal**：调整终端大小

---

## 5. 数据流向

```
┌─────────────────────────────────────────────────────────────┐
│                      手机浏览器                              │
│                                                             │
│  ┌─────────┐  onConnect()   ┌───────┐  send()   ┌────────┐ │
│  │ConnectForm│ ────────────→ │ App   │ ────────→ │useWebSocket│
│  └─────────┘                └───────┘           └────────┘ │
│                                   ↑                   │     │
│                              lastMessage             │     │
│                                   │                   │     │
│  ┌─────────┐  writeToTerminal()   │    onInput()     │     │
│  │Terminal │ ←─────────────────── │ ←─────────────── │     │
│  └─────────┘                     │                   │     │
│       │                          │                   │     │
│       │ onData (用户按键)         │                   │     │
│       └─────────────────────────→│                   │     │
│                                  │                   │     │
└──────────────────────────────────┼───────────────────┼─────┘
                                   │                   │
                              WebSocket            WebSocket
                                   │                   │
┌──────────────────────────────────┼───────────────────┼─────┐
│                      后端服务器   │                   │     │
│                                  ↓                   ↓     │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────┐  │
│  │  config  │←──│ ws-handler   │←──│  ssh-connection   │  │
│  │  + auth  │   │ (消息路由)    │   │  (ssh2 库)        │  │
│  └──────────┘   └──────────────┘   └─────────┬─────────┘  │
│                                              │             │
└──────────────────────────────────────────────┼─────────────┘
                                               │ SSH (TCP/22)
                                        ┌──────┴──────┐
                                        │  目标服务器   │
                                        └─────────────┘
```

---

## 6. 如何扩展功能

### 6.1 添加密钥文件认证

在 `ssh-connection.ts` 的 `client.connect()` 中添加 `privateKey` 选项：

```typescript
client.connect({
  host: options.host,
  username: options.username,
  // 添加私钥认证
  privateKey: fs.readFileSync('/path/to/private/key'),
  // 如果私钥有密码
  passphrase: 'key_password',
});
```

在前端添加密钥文件上传功能（`<input type="file">`），读取文件内容后通过 WebSocket 传输。

### 6.2 添加连接历史

当前设计**不使用任何持久化存储**。如果你需要保存历史记录：

1. 使用 `localStorage` 保存最近连接的列表（不含密码）
2. 密码仍然不保存，每次需要手动输入
3. 在 `ConnectForm` 中添加历史记录下拉列表

### 6.3 支持多标签

当前设计**每次只能连接一个服务器**。如果需要多标签：

1. 将 `App.tsx` 中的单个 `connectionState` 改为一个连接列表
2. 每个标签对应一个独立的 WebSocket 连接
3. 顶层添加标签栏 UI 组件

### 6.4 更换主题配色

在 `client/src/hooks/useTerminal.ts` 的 `TERMINAL_CONFIG.theme` 中修改颜色值。xterm.js 支持 ANSI 16 色自定义。

### 6.5 本地开发技巧

```bash
# 同时启动前后端（推荐）
npm run dev

# 只启动后端
npm run dev:server

# 只启动前端
npm run dev:client

# 检查 TypeScript 类型
npx tsc --noEmit                # 前端
npx tsc -p server/tsconfig.json --noEmit  # 后端
```

---

## 术语表

| 术语 | 解释 |
|------|------|
| SSH | Secure Shell，安全远程登录协议 |
| WebSocket | 浏览器和服务器之间的双向实时通信协议 |
| PWA | Progressive Web App，可像原生 App 一样安装的网页应用 |
| xterm.js | 浏览器中的终端模拟器 |
| ssh2 | Node.js 的 SSH 客户端库 |
| React | Facebook 开发的前端 UI 框架 |
| TypeScript | 带类型系统的 JavaScript |
| Vite | 现代前端构建工具 |
| Hook | React 中复用逻辑的函数，以 use 开头 |
| State | 组件的"状态"或"记忆" |
| Props | 组件之间传递的数据 |
