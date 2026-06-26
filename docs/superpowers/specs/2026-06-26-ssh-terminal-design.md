# SSH 移动端终端 — 设计文档

> 日期：2026-06-26  
> 状态：已确认

---

## 1. 项目概述

开发一款轻量级 SSH 终端，在手机上通过浏览器即可连接远程服务器并执行命令。

**核心定位**：应急使用的临时连接工具，用完即走，不留痕迹。

---

## 2. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 应用形态 | PWA | 浏览器打开即用，可添加到主屏幕，跨平台 |
| 架构 | 前端 + WebSocket 后端代理 | 手机网络不稳定时 WebSocket 更可靠，绕过浏览器网络限制 |
| 全栈语言 | TypeScript | 前后端统一技术栈，维护成本低 |
| 前端框架 | React + xterm.js | xterm.js 是最成熟的浏览器终端模拟库 |
| 后端 SSH | ssh2 (npm) | Node.js 生态最成熟的 SSH 客户端库 |
| 数据持久化 | 不保存 | 密码与连接信息均不落盘 |

---

## 3. 架构设计

```
┌───────────────────┐       WSS (WebSocket over TLS)      ┌───────────────────┐       SSH (TCP/22)       ┌──────────────┐
│   PWA (浏览器)     │ ◄──────────────────────────────────► │   Node.js 后端     │ ◄───────────────────► │  目标服务器   │
│                   │                                     │                   │                       │              │
│   React + xterm   │                                     │   Express + WS    │                       │              │
│   Vite 构建       │                                     │   ssh2 库         │                       │              │
└───────────────────┘                                     └───────────────────┘                       └──────────────┘
```

### 数据流

1. 用户在手机浏览器打开 PWA，填写主机、端口、用户名、密码
2. 前端通过 WSS 连接后端，发送 `connect` 消息（含 SSH 凭据）
3. 后端使用 ssh2 库与目标服务器建立 SSH 连接
4. 终端输入/输出经 WebSocket 双向流转
5. 关闭页面 → WebSocket 断开 → SSH 断开 → 内存中凭据被 GC 回收

---

## 4. 安全性设计

### 4.1 凭据生命周期

```
用户输入密码 → WSS加密传输 → 后端内存暂存(仅本次会话) → ssh2连接使用 → 断开立即丢弃
                                                                      ↓
                                                         不记录日志、不落盘、不缓存
```

### 4.2 分层安全措施

| 层级 | 措施 | 说明 |
|------|------|------|
| 传输层 | WSS (WebSocket over TLS) | 密码从浏览器到后端全程加密，防止中间人窃听 |
| 应用层 | 内存即抛 | 密码仅在后端进程内存中存活，连接断开后释放 |
| 日志安全 | 敏感信息脱敏 | 后端日志记录连接事件时过滤密码字段 |
| 访问控制 | 可选的基础认证令牌 | 防止未授权使用后端代理 |
| 客户端 | 无残留 | 前端不缓存密码，关闭后自动清除 |

### 4.3 关键实现细节

- 密码只在 WebSocket `connect` 消息的处理闭包中使用一次，不在任何变量中长期持有
- 后端日志中仅记录 `用户连接 host X`，不输出密码字段
- 不使用任何持久化存储（无数据库、无文件）
- 推荐生产环境使用 Let's Encrypt 签发 SSL 证书

---

## 5. 后端设计

### 5.1 目录结构

```
server/src/
├── index.ts              # 入口：创建 HTTP + WebSocket 服务
├── ws-handler.ts         # WebSocket 消息路由与会话管理
├── ssh-connection.ts     # SSH 连接封装
├── auth.ts              # 可选的访问令牌验证
└── config.ts            # 端口、证书路径等配置
```

### 5.2 组件职责

| 组件 | 职责 | 对外接口 |
|------|------|----------|
| `index.ts` | 创建 Express 服务器，挂载 WebSocket，启动监听 | `startServer(port)` |
| `ws-handler.ts` | 解析 WS 消息，协调 SSH 连接生命周期 | `onConnection(ws)` |
| `ssh-connection.ts` | 封装 ssh2，提供连接/写入/关闭/事件回调 | `createConnection(opts) → { write, close, onData, onError }` |
| `auth.ts` | 验证请求头中的令牌 | `verifyToken(token) → boolean` |
| `config.ts` | 集中管理所有配置项（环境变量） | `{ port, accessToken?, sslCert?, sslKey? }` |

### 5.3 WebSocket 消息协议

```typescript
// 客户端 → 服务端
type ClientMessage =
  | { type: 'connect'; host: string; port: number; username: string; password: string; cols: number; rows: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }

// 服务端 → 客户端
type ServerMessage =
  | { type: 'connected' }
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'disconnected' }
```

### 5.4 SSH 连接流程

1. 收到 `connect` 消息 → 调用 `ssh-connection.ts` 创建连接
2. ssh2 建立 TCP 连接到目标服务器
3. 打开 shell session（`xterm-256color`）
4. 返回 `connected` 给前端
5. 后续 `input` 消息直接写入 SSH session
6. WebSocket 断开 → 关闭 SSH 连接 → 内存释放

---

## 6. 前端设计

### 6.1 目录结构

```
client/src/
├── main.tsx                 # 入口，挂载 App
├── App.tsx                  # 根组件：管理连接状态
├── components/
│   ├── ConnectForm.tsx      # 连接表单
│   ├── Terminal.tsx         # xterm.js 终端容器
│   └── StatusBar.tsx        # 底部状态栏
├── hooks/
│   ├── useWebSocket.ts      # WebSocket 连接管理
│   └── useTerminal.ts       # xterm.js 初始化与绑定
├── pwa/
│   ├── manifest.json        # PWA 配置
│   └── sw.js                # Service Worker
└── styles/
    └── global.css           # 全局样式
```

### 6.2 组件说明

**App.tsx**
- 管理全局连接状态：`idle → connecting → connected → disconnected`
- `idle` 时显示 ConnectForm
- `connected` 时显示 Terminal + StatusBar

**ConnectForm.tsx**
- 输入字段：主机、端口（默认 22）、用户名、密码（`type="password"`）
- 表单验证：必填项检查
- 连接成功后收起表单，切换到终端视图
- 关闭后表单自动清除（不缓存）

**Terminal.tsx**
- 使用 xterm.js 渲染终端，暗色主题（如 Monokai 或 Dracula）
- 键盘输入 → WebSocket `input` 消息
- WebSocket `output` 消息 → xterm.write()
- 响应屏幕变化（键盘弹出/收起、旋转）→ 调用 `fitAddon.fit()` 并发送 `resize`

**StatusBar.tsx**
- 显示连接主机名和状态指示（绿点=已连接，红点=断开）
- 「断开」按钮：关闭连接，返回表单

### 6.3 移动端适配

| 功能 | 实现方式 |
|------|----------|
| 键盘不遮挡终端 | `visualViewport` API 动态调整终端容器高度 |
| 字体大小 | 14px，保证手机屏幕可读 |
| 手势缩放 | 双指缩放触发字体大小调整 |
| 横屏适配 | `ResizeObserver` 监听容器变化，自动发送 `resize` |
| PWA 全屏 | `manifest.json` 配置 `"display": "standalone"` |
| 主题 | 暗色背景 `#1a1a2e`，减少眩光 |

### 6.4 PWA 配置

```json
{
  "name": "SSH Terminal",
  "short_name": "Term",
  "display": "standalone",
  "theme_color": "#1a1a2e",
  "background_color": "#1a1a2e",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192" }]
}
```

---

## 7. 项目完整目录

```
ssh_app/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server/
│   └── src/
│       ├── index.ts
│       ├── ws-handler.ts
│       ├── ssh-connection.ts
│       ├── auth.ts
│       └── config.ts
└── client/
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── components/
        │   ├── ConnectForm.tsx
        │   ├── Terminal.tsx
        │   └── StatusBar.tsx
        ├── hooks/
        │   ├── useWebSocket.ts
        │   └── useTerminal.ts
        ├── pwa/
        │   ├── manifest.json
        │   └── sw.js
        └── styles/
            └── global.css
```

---

## 8. 开发阶段

| 阶段 | 内容 |
|------|------|
| 1. 后端核心 | SSH 连接封装 + WebSocket 服务器 + 消息协议 |
| 2. 前端核心 | React 脚手架 + xterm.js 集成 + WebSocket 通信 |
| 3. 移动端适配 | 响应式 + 键盘适配 + PWA 配置 |
| 4. 安全加固 | WSS 配置 + 令牌认证 + 日志脱敏 |
| 5. 部署 | 生产构建 + 服务器部署 + SSL 配置 |

---

## 9. 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `ssh2` | ^1.x | 后端 SSH 客户端 |
| `ws` | ^8.x | WebSocket 服务端 |
| `express` | ^4.x | HTTP 服务器 |
| `typescript` | ^5.x | 全栈类型安全 |
| `vite` | ^5.x | 前端构建工具 |
| `react` | ^18.x | 前端 UI 框架 |
| `@xterm/xterm` | ^5.x | 终端模拟器 |
| `@xterm/addon-fit` | ^0.x | 终端自适应插件 |
| `@xterm/addon-webgl` | ^0.x | WebGL 渲染加速 |

---

## 10. 不需要做的

- ❌ 不保存连接历史
- ❌ 不支持 SFTP 文件传输
- ❌ 不实现多标签/多会话
- ❌ 不上架应用商店
- ❌ 不支持密钥文件认证（首版仅密码）

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 手机浏览器 WebSocket 不支持 | 降级为长轮询（极小概率，现代浏览器均支持） |
| 网络切换导致断连 | 提示用户重新连接，不做自动重连（安全考量） |
| xterm.js 在移动端性能 | 使用 WebGL addon 加速渲染 |

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-26 | 初版设计文档 |
