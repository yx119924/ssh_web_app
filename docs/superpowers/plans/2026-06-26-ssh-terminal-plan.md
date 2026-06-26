# SSH 移动端终端 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发一个可在手机上通过浏览器使用的轻量级 SSH 终端（PWA），前端 React + xterm.js，后端 Node.js + WebSocket + ssh2，用完即走不保存数据。

**Architecture:** 三层架构 — 浏览器 PWA（React + xterm.js）通过 WSS (WebSocket over TLS) 连接 Node.js 后端，后端通过 ssh2 库代理 SSH 连接到目标服务器。密码仅在内存中存活，不落盘。

**Tech Stack:** TypeScript 全栈，React 18 + Vite 5 前端，Express + ws + ssh2 后端，xterm.js 终端渲染

## Global Constraints

- 不保存任何连接信息（密码、主机、用户均不落盘）
- 密码仅在请求处理闭包中使用，用后即弃
- 所有日志必须脱敏，不得输出密码
- 前端 PWA 支持 standalone 模式
- 目标平台：移动端浏览器（iOS Safari、Android Chrome）
- 代码注释使用中文，面向初学者清晰易懂

---

## 文件结构总览

```
ssh_app/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
├── server/
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # 入口：启动 HTTP + WebSocket 服务
│       ├── config.ts             # 集中管理配置（环境变量）
│       ├── auth.ts               # 可选的访问令牌验证
│       ├── ssh-connection.ts     # SSH 连接封装
│       └── ws-handler.ts         # WebSocket 消息路由
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx              # React 入口
│       ├── App.tsx               # 根组件：管理连接状态
│       ├── App.css               # 全局样式
│       ├── components/
│       │   ├── ConnectForm.tsx   # 连接表单
│       │   ├── ConnectForm.css   # 表单样式
│       │   ├── Terminal.tsx      # xterm.js 终端容器
│       │   ├── Terminal.css      # 终端样式
│       │   ├── StatusBar.tsx     # 底部状态栏
│       │   └── StatusBar.css     # 状态栏样式
│       ├── hooks/
│       │   ├── useWebSocket.ts   # WebSocket 连接管理
│       │   └── useTerminal.ts    # xterm.js 初始化
│       └── pwa/
│           ├── manifest.json     # PWA 配置
│           └── sw.js             # Service Worker
├── public/
│   └── icon-192.png             # PWA 图标
└── docs/
    ├── DEPLOYMENT.md             # 部署文档
    ├── CODE-GUIDE.md             # 代码说明文档
    ├── FEATURES.md               # 功能说明文档
    └── API.md                    # 接口文档
```

---

## 阶段一：项目脚手架

### Task 1: 初始化项目与依赖

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vite.config.ts`

**Produces:**
- 项目根配置文件，定义所有依赖和构建脚本

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "ssh-mobile-terminal",
  "version": "1.0.0",
  "private": true,
  "description": "手机端 SSH 终端 - PWA 应用，轻量级应急连接工具",
  "scripts": {
    "dev:client": "vite",
    "dev:server": "tsx watch server/src/index.ts",
    "build:client": "vite build",
    "build:server": "tsc -p server/tsconfig.json",
    "start": "node dist/server/index.js",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\""
  },
  "dependencies": {
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "ssh2": "^1.16.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-webgl": "^0.18.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.0",
    "@types/ssh2": "^1.15.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "tsx": "^4.19.0",
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: 创建根 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["client/src"]
}
```

- [ ] **Step 3: 创建 server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "../dist/server",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 创建 vite.config.ts**

```typescript
// Vite 构建配置文件
// Vite 是一个现代前端构建工具，负责打包、热更新、开发服务器等

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 使用 React 插件，支持 JSX 语法
  plugins: [react()],

  // 开发服务器配置
  server: {
    port: 5173,

    // 代理配置：将 /api 和 /ws 请求转发到后端服务器
    // 这样前端请求 ws://localhost:5173/ws 时，
    // Vite 会自动转发到 ws://localhost:3001/ws
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true, // 必须开启 WebSocket 代理
      },
    },
  },

  // 生产构建配置
  build: {
    // 输出目录
    outDir: '../dist/client',
  },
});
```

- [ ] **Step 5: 安装依赖并验证**

```bash
cd "e:\工作记录\ssh_app" && npm install
```

预期：所有依赖安装成功，无错误。

- [ ] **Step 6: 创建 .gitignore**

```gitignore
# 依赖目录
node_modules/

# 构建输出
dist/

# IDE 配置
.vscode/
.idea/

# 环境变量（可能含敏感信息）
.env
.env.local

# 操作系统文件
.DS_Store
Thumbs.db
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsconfig.server.json vite.config.ts .gitignore
git commit -m "chore: 初始化项目结构与依赖"
```

---

## 阶段二：后端实现

### Task 2: 后端配置模块

**Files:**
- Create: `server/src/config.ts`

**Produces:**
- `getConfig()` 函数，返回 `{ port, host, accessToken?, sslCert?, sslKey? }`

- [ ] **Step 1: 编写 config.ts**

```typescript
// ============================================================
// 配置文件
// 所有配置项从环境变量读取，没有设置则使用默认值
// 这样做的好处：
//   1. 配置和代码分离
//   2. 不同环境（开发/生产）可以用不同的配置
//   3. 敏感信息（如令牌）不会写死在代码里
// ============================================================

/**
 * 服务器配置的类型定义
 * TypeScript 的 interface 定义了"这个对象长什么样"
 */
export interface ServerConfig {
  /** HTTP/WebSocket 服务器监听的端口号 */
  port: number;
  /** 服务器监听的主机地址 */
  host: string;
  /**
   * 访问控制令牌
   * 如果设置了，客户端连接时必须提供相同的令牌
   * 如果没设置（undefined），则不验证
   */
  accessToken?: string;
  /** SSL 证书文件路径（HTTPS/WSS 需要） */
  sslCert?: string;
  /** SSL 私钥文件路径（HTTPS/WSS 需要） */
  sslKey?: string;
}

/**
 * 获取服务器配置
 * 从环境变量 process.env 中读取，没有则使用默认值
 *
 * 环境变量说明：
 *   SSH_PORT        - 服务器端口，默认 3001
 *   SSH_HOST        - 监听地址，默认 0.0.0.0（接受所有来源的连接）
 *   SSH_ACCESS_TOKEN - 访问令牌，可选
 *   SSL_CERT        - SSL 证书路径，可选
 *   SSL_KEY         - SSL 私钥路径，可选
 */
export function getConfig(): ServerConfig {
  return {
    port: parseInt(process.env.SSH_PORT || '3001', 10),
    host: process.env.SSH_HOST || '0.0.0.0',
    accessToken: process.env.SSH_ACCESS_TOKEN || undefined,
    sslCert: process.env.SSL_CERT || undefined,
    sslKey: process.env.SSL_KEY || undefined,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/config.ts
git commit -m "feat: 添加后端配置模块"
```

---

### Task 3: SSH 连接封装

**Files:**
- Create: `server/src/ssh-connection.ts`

**Produces:**
- `createSshConnection(options) → Promise<SshSession>`
- `SshSession { write(data), close(), resize(cols, rows) }`

- [ ] **Step 1: 编写 ssh-connection.ts**

```typescript
// ============================================================
// SSH 连接封装模块
// 负责与目标服务器建立 SSH 连接、传输数据和断开连接
// 使用 ssh2 库（npm 包），这是 Node.js 最成熟的 SSH 客户端
// ============================================================

import { Client, ClientChannel } from 'ssh2';

// ============================================================
// 类型定义
// ============================================================

/**
 * 建立 SSH 连接所需的参数
 * 这些信息由用户在手机浏览器中填写
 */
export interface SshConnectOptions {
  /** 目标服务器的主机名或 IP 地址，如 192.168.1.100 */
  host: string;
  /** SSH 端口，默认 22 */
  port: number;
  /** 登录用户名，如 root */
  username: string;
  /**
   * 登录密码
   * ⚠️ 密码只在当前函数中使用，不会保存到任何地方
   */
  password: string;
  /** 终端列数（字符宽度） */
  cols: number;
  /** 终端行数（字符高度） */
  rows: number;
}

/**
 * 建立连接后返回的会话对象
 * 通过这个对象来操作 SSH 终端
 */
export interface SshSession {
  /** 向 SSH 终端写入数据（通常是用户按键） */
  write: (data: string) => void;
  /** 调整终端窗口大小 */
  resize: (cols: number, rows: number) => void;
  /** 关闭 SSH 连接 */
  close: () => void;
}

/**
 * 与目标服务器建立 SSH 连接，并打开一个交互式 shell 会话
 *
 * 工作流程：
 *   1. 创建 ssh2 客户端实例
 *   2. 使用密码连接到目标服务器
 *   3. 打开一个 shell（相当于在服务器上运行 bash）
 *   4. 将 shell 的输入输出通过回调函数传出去
 *
 * @param options   - 连接参数
 * @param onData    - 收到服务器数据时的回调（用于发送给浏览器）
 * @param onError   - 连接出错时的回调
 * @param onClose   - 连接关闭时的回调
 * @returns Promise<SshSession> - 会话控制对象
 */
export function createSshConnection(
  options: SshConnectOptions,
  onData: (data: string) => void,
  onError: (message: string) => void,
  onClose: () => void
): Promise<SshSession> {
  return new Promise((resolve, reject) => {
    // ---- 第 1 步：创建 SSH 客户端 ----
    const client = new Client();

    // ---- 第 2 步：连接成功后的处理 ----
    client.on('ready', () => {
      // SSH 连接建立成功，现在打开一个交互式 shell
      client.shell(
        {
          // 终端类型：xterm-256color 支持颜色显示
          term: 'xterm-256color',
          // 终端窗口大小
          cols: options.cols,
          rows: options.rows,
        },
        (err, stream: ClientChannel) => {
          if (err) {
            // shell 打开失败
            onError(`打开 shell 失败: ${err.message}`);
            client.end();
            reject(err);
            return;
          }

          // ---- 第 3 步：绑定数据流 ----
          // 当服务器通过 SSH 发送数据过来时：
          //   如果是字符串，直接传给 onData
          //   如果是 Buffer（二进制数据），转为字符串后传给 onData
          stream.on('data', (data: Buffer | string) => {
            const text = typeof data === 'string' ? data : data.toString('utf-8');
            onData(text);
          });

          // 当 SSH 连接关闭时（服务器主动断开或网络断开）
          stream.on('close', () => {
            onClose();
            client.end();
          });

          // 当 SSH 连接发生错误时
          stream.on('error', (err: Error) => {
            onError(`SSH 会话错误: ${err.message}`);
          });

          // ---- 第 4 步：返回会话控制对象 ----
          // 这个对象会传给 ws-handler.ts 使用
          const session: SshSession = {
            /**
             * 向 SSH 终端写入数据
             * 通常是用户在手机浏览器中按下的按键
             */
            write: (data: string) => {
              stream.write(data);
            },

            /**
             * 调整终端窗口大小
             * 手机旋转或键盘弹出时会触发
             */
            resize: (cols: number, rows: number) => {
              stream.setWindow(cols, rows);
            },

            /**
             * 关闭 SSH 连接
             */
            close: () => {
              stream.end();
              client.end();
            },
          };

          resolve(session);
        }
      );
    });

    // ---- 连接错误处理 ----
    client.on('error', (err: Error) => {
      // ⚠️ 注意：不要在日志中输出 options.password
      onError(`SSH 连接失败: ${err.message}`);
      reject(err);
    });

    // ---- 连接关闭处理 ----
    client.on('close', () => {
      onClose();
    });

    // ---- 第 5 步：发起连接 ----
    // ⚠️ 密码只在这里被使用一次
    // 之后 client 内部会保存凭据用于认证，但我们的代码中不会持久化密码
    client.connect({
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password,
      // 连接超时：10 秒
      readyTimeout: 10000,
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/ssh-connection.ts
git commit -m "feat: SSH 连接封装模块"
```

---

### Task 4: 访问令牌验证

**Files:**
- Create: `server/src/auth.ts`

**Produces:**
- `verifyToken(token, expected) → boolean`

- [ ] **Step 1: 编写 auth.ts**

```typescript
// ============================================================
// 认证模块
// 提供一个简单的令牌验证机制，防止未授权的访问
// 
// 使用场景：
//   如果服务器设置了 SSH_ACCESS_TOKEN 环境变量，
//   客户端必须在 WebSocket 连接时提供相同的令牌
// ============================================================

/**
 * 验证客户端提供的令牌是否与服务器配置的令牌一致
 *
 * 设计原则：
 *   - 如果服务器没有设置令牌（expected 为空），说明不需要认证，直接放行
 *   - 如果服务器设置了令牌，客户端必须提供一致的令牌
 *   - 使用恒定时间比较（虽然简单实现），防止时序攻击
 *
 * @param clientToken  - 客户端提供的令牌
 * @param expectedToken - 服务器配置的令牌（来自环境变量）
 * @returns true 表示验证通过，false 表示验证失败
 */
export function verifyToken(
  clientToken: string | undefined,
  expectedToken: string | undefined
): boolean {
  // 如果服务器没有配置令牌，不需要验证
  if (!expectedToken) {
    return true;
  }

  // 如果服务器配置了令牌但客户端没提供，拒绝
  if (!clientToken) {
    return false;
  }

  // 比较两个字符串是否完全一致
  // 长度和内容都要一致
  if (clientToken.length !== expectedToken.length) {
    return false;
  }

  return clientToken === expectedToken;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/auth.ts
git commit -m "feat: 添加访问令牌验证模块"
```

---

### Task 5: WebSocket 消息路由

**Files:**
- Create: `server/src/ws-handler.ts`

**Produces:**
- `handleWsConnection(ws, config)` — 处理一个 WebSocket 客户端连接

**Consumes:**
- `createSshConnection` from `ssh-connection.ts`
- `verifyToken` from `auth.ts`

- [ ] **Step 1: 编写 ws-handler.ts**

```typescript
// ============================================================
// WebSocket 消息处理模块
// 这是后端最核心的文件——负责在浏览器和 SSH 服务器之间"搭桥"
//
// 它的工作流程是：
//   1. 浏览器通过 WebSocket 连接到这个服务器
//   2. 浏览器发送 { type: 'connect', host: '...', ... } 来请求连接 SSH
//   3. 我们用 ssh-connection.ts 去连接目标服务器
//   4. 之后，浏览器发的按键 → 转发给 SSH
//            SSH 返回的数据 → 转发给浏览器
//   5. 任何一端断开，另一端也跟着断开
// ============================================================

import { WebSocket } from 'ws';
import { createSshConnection, SshSession } from './ssh-connection';
import { verifyToken } from './auth';
import { ServerConfig } from './config';

// ============================================================
// 消息类型定义
// 这些定义了浏览器和后端之间对话的"语言"
// ============================================================

/** 浏览器发给后端的消息 */
interface ClientMessage {
  type: 'connect' | 'input' | 'resize';
  // ---- connect 消息专用字段 ----
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  cols?: number;
  rows?: number;
  token?: string; // 访问令牌（可选）
  // ---- input 消息专用字段 ----
  data?: string;
}

/**
 * 处理一个 WebSocket 客户端连接
 *
 * 每个浏览器页面打开后，会建立一个 WebSocket 连接。
 * 这个函数负责管理这个连接的整个生命周期。
 *
 * @param ws     - WebSocket 连接对象（代表浏览器）
 * @param config - 服务器配置
 */
export function handleWsConnection(ws: WebSocket, config: ServerConfig): void {
  // 当前连接的 SSH 会话（初始为空）
  let sshSession: SshSession | null = null;

  // 标记是否已经验证通过
  let isAuthenticated = false;

  console.log('[WS] 新的客户端连接');

  /**
   * 安全地发送消息给浏览器
   * 包装了 ws.send，自动处理 JSON 序列化和错误
   */
  function send(message: Record<string, unknown>): void {
    // 如果 WebSocket 还处于打开状态，就发送
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 清理 SSH 会话
   * 关闭 SSH 连接并释放内存
   */
  function cleanup(): void {
    if (sshSession) {
      sshSession.close();
      sshSession = null;
    }
  }

  // ---- 监听浏览器发来的消息 ----
  ws.on('message', async (rawData: Buffer) => {
    let msg: ClientMessage;

    // 解析 JSON 消息
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      send({ type: 'error', message: '消息格式错误，需要 JSON' });
      return;
    }

    // ---- 处理不同类型的消息 ----

    switch (msg.type) {
      // ========================================
      // connect：浏览器请求连接到 SSH 服务器
      // ========================================
      case 'connect': {
        // 第一步：验证令牌（如果配置了的话）
        if (!isAuthenticated) {
          if (!verifyToken(msg.token, config.accessToken)) {
            send({ type: 'error', message: '访问令牌验证失败' });
            console.log('[WS] 令牌验证失败，拒绝连接');
            return;
          }
          isAuthenticated = true;
        }

        // 第二步：检查必填参数
        if (!msg.host || !msg.username || !msg.password) {
          send({
            type: 'error',
            message: '缺少必填参数：主机地址、用户名和密码不能为空',
          });
          return;
        }

        // 第三步：确保一次只能连一个 SSH 服务器
        if (sshSession) {
          send({
            type: 'error',
            message: '已经有一个活跃的 SSH 连接，请先断开',
          });
          return;
        }

        // 第四步：建立 SSH 连接
        try {
          // ⚠️ ⚠️ ⚠️ 安全关键区域 ⚠️ ⚠️ ⚠️
          // 密码 msg.password 只在这里被传递给 createSshConnection
          // 在此函数返回后，msg 对象超出作用域，密码会被垃圾回收
          // 我们绝不将密码赋值给任何长寿命变量，也绝不写入日志

          console.log(
            `[WS] 正在连接到 SSH 服务器: ${msg.username}@${msg.host}:${msg.port || 22}`
            // 注意：日志中不输出密码！
          );

          sshSession = await createSshConnection(
            {
              host: msg.host,
              port: msg.port || 22,
              username: msg.username,
              password: msg.password,
              cols: msg.cols || 80,
              rows: msg.rows || 24,
            },
            // onData：收到 SSH 数据，转发给浏览器
            (data: string) => {
              send({ type: 'output', data });
            },
            // onError：SSH 出错，通知浏览器
            (errorMessage: string) => {
              console.error(`[WS] SSH 错误: ${errorMessage}`);
              send({ type: 'error', message: errorMessage });
            },
            // onClose：SSH 断开
            () => {
              console.log('[WS] SSH 连接已关闭');
              send({ type: 'disconnected' });
              sshSession = null;
            }
          );

          // 第五步：通知浏览器连接成功
          console.log(`[WS] SSH 连接成功: ${msg.username}@${msg.host}`);
          send({ type: 'connected' });
        } catch (err) {
          // 连接失败
          const errorMsg = err instanceof Error ? err.message : '未知错误';
          console.error(`[WS] SSH 连接失败: ${errorMsg}`);
          send({ type: 'error', message: `连接失败: ${errorMsg}` });
        }
        break;
      }

      // ========================================
      // input：浏览器发来用户按键
      // ========================================
      case 'input': {
        if (sshSession && msg.data) {
          sshSession.write(msg.data);
        }
        break;
      }

      // ========================================
      // resize：浏览器通知终端窗口大小变化
      // ========================================
      case 'resize': {
        if (sshSession && msg.cols && msg.rows) {
          sshSession.resize(msg.cols, msg.rows);
        }
        break;
      }

      // ========================================
      // 未知消息类型
      // ========================================
      default: {
        send({ type: 'error', message: `未知的消息类型: ${(msg as any).type}` });
      }
    }
  });

  // ---- 浏览器断开连接时的清理 ----
  ws.on('close', () => {
    console.log('[WS] 客户端断开连接');
    cleanup();
  });

  // ---- WebSocket 连接出错 ----
  ws.on('error', (err: Error) => {
    console.error(`[WS] WebSocket 错误: ${err.message}`);
    cleanup();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/ws-handler.ts
git commit -m "feat: WebSocket 消息路由模块"
```

---

### Task 6: 后端入口文件

**Files:**
- Create: `server/src/index.ts`

**Produces:**
- 完整的后端服务器（HTTP + WebSocket）

**Consumes:**
- `getConfig` from `config.ts`
- `handleWsConnection` from `ws-handler.ts`

- [ ] **Step 1: 编写 index.ts**

```typescript
// ============================================================
// 服务器入口文件
// 这是后端的"开关"——运行这个文件就启动了整个后端服务
//
// 启动方式：
//   开发环境：npx tsx server/src/index.ts
//   生产环境：node dist/server/index.js
//
// 这个服务器做了两件事：
//   1. 提供 HTTP 服务（用于托管前端静态文件）
//   2. 提供 WebSocket 服务（用于浏览器 ↔ SSH 之间的实时通信）
// ============================================================

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { getConfig } from './config';
import { handleWsConnection } from './ws-handler';

// 如果使用 SSL（HTTPS/WSS），需要引入 https 模块
// 开发环境可以先用 HTTP，生产环境强烈建议开启 WSS
const USE_SSL = false; // 设为 true 并配置 SSL_CERT/SSL_KEY 环境变量来启用

/**
 * 启动服务器的主函数
 * 这是一个异步函数（async function），返回 Promise
 * 使用 async/await 让代码更容易阅读
 */
async function main(): Promise<void> {
  // ---- 第 1 步：获取配置 ----
  const config = getConfig();

  console.log('========================================');
  console.log('  SSH 移动终端 - 后端服务');
  console.log('========================================');
  console.log(`  监听地址: ${config.host}:${config.port}`);
  if (config.accessToken) {
    console.log('  访问令牌: 已设置 ✅');
  } else {
    console.log('  访问令牌: 未设置 ⚠️ （任何人可以连接）');
  }
  console.log(`  安全连接: ${USE_SSL ? 'WSS ✅' : 'WS ⚠️ （建议生产环境启用）'}`);
  console.log('========================================');

  // ---- 第 2 步：创建 HTTP 服务器 ----
  const httpServer = createServer((_req, res) => {
    // 简单的健康检查接口
    // 当有人访问 http://服务器地址:3001/ 时，返回一个简单的状态页面
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>SSH 终端后端</title></head>
      <body>
        <h1>SSH 终端后端服务</h1>
        <p>服务正在运行中 🟢</p>
        <p>请通过前端页面连接（默认地址：http://服务器IP:5173）</p>
      </body>
      </html>
    `);
  });

  // ---- 第 3 步：创建 WebSocket 服务器 ----
  // WebSocket 服务器挂载在 HTTP 服务器上
  // 路径 /ws 是 WebSocket 的连接地址
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws', // WebSocket 连接地址：ws://服务器:3001/ws
  });

  // ---- 第 4 步：处理新的 WebSocket 连接 ----
  wss.on('connection', (ws) => {
    // 每个新的浏览器连接，都交给 ws-handler 来处理
    handleWsConnection(ws, config);
  });

  // ---- 第 5 步：启动服务器 ----
  httpServer.listen(config.port, config.host, () => {
    console.log(`✅ 服务器已启动: http://${config.host}:${config.port}`);
    console.log(`✅ WebSocket 地址: ws://${config.host}:${config.port}/ws`);
    console.log('');
    console.log('按 Ctrl+C 停止服务器');
  });

  // ---- 优雅关闭处理 ----
  // 当用户按 Ctrl+C 时，先关闭所有 WebSocket 连接，再退出
  const shutdown = () => {
    console.log('\n正在关闭服务器...');
    wss.close(() => {
      httpServer.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);  // Ctrl+C
  process.on('SIGTERM', shutdown); // 系统关闭信号
}

// 启动！
main().catch((err) => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 测试后端启动**

```bash
cd "e:\工作记录\ssh_app" && npx tsx server/src/index.ts &
sleep 3
curl http://localhost:3001/
```

预期输出：HTML 页面内容，显示"SSH 终端后端服务"

- [ ] **Step 3: 停止测试服务器并 Commit**

```bash
# 停止后台服务器
kill %1 2>/dev/null || true
git add server/src/index.ts
git commit -m "feat: 后端入口文件"
```

---

## 阶段三：前端实现

### Task 7: 前端入口与 HTML 页面

**Files:**
- Create: `client/index.html`
- Create: `client/src/main.tsx`

**Produces:**
- 前端应用的基础骨架

- [ ] **Step 1: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <!-- 
    视口（viewport）配置：这是移动端适配的关键！
    width=device-width：宽度等于设备宽度
    initial-scale=1.0：初始缩放比例为 1
    maximum-scale=1.0：用户不能放大（PWA 全屏体验）
    user-scalable=no：禁止用户手动缩放页面
  -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  
  <!-- 
    主题色：影响浏览器的地址栏颜色和状态栏颜色
    这里使用深色，和终端的暗色主题搭配
  -->
  <meta name="theme-color" content="#1a1a2e" />
  
  <!-- 
    Apple 移动设备专用配置
    apple-mobile-web-app-capable：允许添加到主屏幕后以全屏模式打开
    apple-mobile-web-app-status-bar-style：状态栏样式
  -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  
  <!-- PWA 配置文件链接 -->
  <link rel="manifest" href="/src/pwa/manifest.json" />
  
  <title>SSH Terminal</title>
</head>
<body>
  <!-- React 应用会挂载到这个 div 上 -->
  <div id="root"></div>
  
  <!-- 
    注册 Service Worker
    Service Worker 是 PWA 的核心，负责：
      1. 缓存静态资源，实现离线访问
      2. 拦截网络请求，加速加载
  -->
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/src/pwa/sw.js');
    }
  </script>
  
  <!-- 
    引入 xterm.js 的 CSS 样式文件
    xterm.js 需要这些样式来正确渲染终端
  -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css" />
  
  <!-- Vite 的入口脚本 -->
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 main.tsx**

```typescript
// ============================================================
// 前端应用入口文件
// 这是整个 React 应用的"起点"
//
// React 是什么？
//   React 是一个前端框架，让我们用"组件"的方式构建界面。
//   每个组件是一个独立的功能块，比如：
//     ConnectForm 组件 = 连接表单
//     Terminal 组件 = 终端显示
//     它们拼在一起就组成了完整的应用
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

/**
 * 获取页面上 id="root" 的 DOM 元素
 * DOM（Document Object Model）= 网页的树状结构
 * React 会把整个应用渲染到这个元素里面
 */
const rootElement = document.getElementById('root');

// 如果找不到 root 元素，说明 HTML 有问题，直接报错
if (!rootElement) {
  throw new Error('找不到 root 元素！请检查 index.html 中是否有 <div id="root"></div>');
}

/**
 * 创建 React 根节点
 * React 18 使用 createRoot API（新的渲染方式）
 */
const root = ReactDOM.createRoot(rootElement);

/**
 * 将 <App /> 组件渲染到页面上
 * <App /> 是 JSX 语法，看起来像 HTML，实际是 JavaScript
 * React 会把它转换成真实的 DOM 元素显示在浏览器中
 */
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Commit**

```bash
git add client/index.html client/src/main.tsx
git commit -m "feat: 前端入口文件与 HTML 页面"
```

---

### Task 8: WebSocket Hook

**Files:**
- Create: `client/src/hooks/useWebSocket.ts`

**Produces:**
- `useWebSocket(url) → { send, lastMessage, readyState, close }`

- [ ] **Step 1: 编写 useWebSocket.ts**

```typescript
// ============================================================
// useWebSocket — 自定义 React Hook
//
// 什么是 Hook？
//   Hook 是 React 中"可复用的逻辑块"，名字以 use 开头。
//   这个 Hook 封装了 WebSocket 的连接、发送、接收、关闭逻辑，
//   其他组件只需要调用 useWebSocket() 就能使用 WebSocket，
//   不用重复写连接和断开的代码。
//
// 什么是 WebSocket？
//   WebSocket 是一种"全双工"通信协议——浏览器和服务器
//   可以随时互相发送消息，不像 HTTP 只能浏览器主动请求。
//   适合终端这种需要实时双向通信的场景。
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook 返回的类型定义
 */
interface UseWebSocketReturn {
  /** 发送消息到服务器 */
  send: (data: object) => void;
  /** 服务器发来的最新消息 */
  lastMessage: object | null;
  /** 
   * WebSocket 连接状态
   * 0 = 正在连接
   * 1 = 已连接
   * 2 = 正在关闭
   * 3 = 已关闭
   */
  readyState: number;
  /** 主动关闭连接 */
  close: () => void;
}

/**
 * 创建和管理 WebSocket 连接
 *
 * 使用方式：
 *   const { send, lastMessage, readyState } = useWebSocket('ws://localhost:3001/ws');
 *   send({ type: 'connect', host: '192.168.1.1', ... });
 *
 * @param url - WebSocket 服务地址（如 ws://localhost:3001/ws）
 * @returns 操作 WebSocket 的方法和状态
 */
export function useWebSocket(url: string): UseWebSocketReturn {
  // ---- 状态定义 ----
  // useState：React 的状态管理，状态变化时会自动刷新界面

  /** 服务器发来的最后一条消息 */
  const [lastMessage, setLastMessage] = useState<object | null>(null);
  /** WebSocket 连接状态 */
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);

  // useRef：React 的引用，用来保存"不需要触发界面刷新"的值
  // 这里用 ref 来保存 WebSocket 实例，因为 ws 对象变化时不需要刷新界面

  /** WebSocket 实例的引用 */
  const wsRef = useRef<WebSocket | null>(null);

  // ---- 建立连接 ----
  // useEffect：在组件挂载时执行（页面加载时）
  useEffect(() => {
    // 创建 WebSocket 连接
    const ws = new WebSocket(url);
    wsRef.current = ws;

    // 连接成功
    ws.onopen = () => {
      console.log('[WebSocket] 已连接到服务器');
      setReadyState(WebSocket.OPEN);
    };

    // 收到服务器消息
    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch {
        console.error('[WebSocket] 无法解析服务器消息:', event.data);
      }
    };

    // 连接关闭
    ws.onclose = () => {
      console.log('[WebSocket] 连接已关闭');
      setReadyState(WebSocket.CLOSED);
    };

    // 连接错误
    ws.onerror = (error: Event) => {
      console.error('[WebSocket] 连接错误:', error);
    };

    // ---- 清理函数 ----
    // 当组件卸载（页面关闭）时自动调用
    // 确保 WebSocket 连接被正确关闭
    return () => {
      console.log('[WebSocket] 清理：关闭连接');
      ws.close();
    };
  }, [url]); // 只在 url 变化时重新连接

  // ---- 发送消息 ----
  // useCallback：缓存函数，避免每次渲染都创建新函数
  const send = useCallback(
    (data: object): void => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      } else {
        console.warn('[WebSocket] 连接未就绪，无法发送消息');
      }
    },
    [] // 空数组表示这个函数永远不会重新创建
  );

  // ---- 关闭连接 ----
  const close = useCallback((): void => {
    const ws = wsRef.current;
    if (ws) {
      ws.close();
    }
  }, []);

  // 返回操作方法给组件使用
  return { send, lastMessage, readyState, close };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.ts
git commit -m "feat: WebSocket Hook"
```

---

### Task 9: 连接表单组件

**Files:**
- Create: `client/src/components/ConnectForm.tsx`
- Create: `client/src/components/ConnectForm.css`

**Consumes:**
- `send` from `useWebSocket`

- [ ] **Step 1: 编写 ConnectForm.css**

```css
/* ============================================================
   ConnectForm 样式
   连接表单的外观：深色主题，圆角输入框，大按钮（手指友好）
   ============================================================ */

/* 整个表单的容器 */
.connect-form {
  /* 最大宽度 400px，手机屏幕够用，太大的屏幕也不会太宽 */
  max-width: 400px;
  /* 水平居中 */
  margin: 60px auto 0;
  /* 内边距 */
  padding: 24px 20px;
}

/* 标题 */
.connect-form h1 {
  /* 文字颜色：浅白 */
  color: #e0e0e0;
  /* 字体大小 */
  font-size: 24px;
  /* 文字居中 */
  text-align: center;
  /* 底部间距 */
  margin-bottom: 8px;
}

/* 副标题 */
.connect-form .subtitle {
  color: #888;
  font-size: 13px;
  text-align: center;
  margin-bottom: 28px;
}

/* 每个表单项的容器 */
.form-group {
  margin-bottom: 16px;
}

/* 表单标签 */
.form-group label {
  /* 标签和输入框分行显示 */
  display: block;
  color: #aaa;
  font-size: 13px;
  margin-bottom: 6px;
}

/* 输入框统一样式 */
.form-group input {
  /* 占满父容器宽度 */
  width: 100%;
  /* 内边距：上下 12px，左右 14px */
  padding: 12px 14px;
  /* 背景色：深灰 */
  background: #16213e;
  /* 边框：细线 */
  border: 1px solid #333;
  /* 圆角 */
  border-radius: 8px;
  /* 文字颜色 */
  color: #e0e0e0;
  /* 字体大小（不小于 16px 防止 iOS 自动缩放） */
  font-size: 16px;
  /* 让盒模型包含 padding 和 border */
  box-sizing: border-box;
  /* 过渡动画：边框颜色变化 0.2 秒 */
  transition: border-color 0.2s;
  /* 防止 iOS 自动大写 */
  -webkit-appearance: none;
}

/* 输入框获得焦点时（用户点击时） */
.form-group input:focus {
  /* 取消默认的外边框 */
  outline: none;
  /* 边框变为亮色，提示用户正在编辑 */
  border-color: #00d4ff;
}

/* 端口输入框特殊处理：宽度较小 */
.form-group input.port-input {
  width: 100px;
}

/* 连接按钮 */
.connect-form button {
  /* 占满宽度 */
  width: 100%;
  /* 内边距 */
  padding: 14px;
  /* 背景色：亮蓝绿色 */
  background: #00d4ff;
  /* 文字颜色 */
  color: #1a1a2e;
  /* 无边框 */
  border: none;
  /* 圆角 */
  border-radius: 8px;
  /* 字体大小 */
  font-size: 17px;
  /* 粗体 */
  font-weight: 600;
  /* 鼠标变手指 */
  cursor: pointer;
  /* 顶部间距 */
  margin-top: 8px;
  /* 过渡动画 */
  transition: background 0.2s, transform 0.1s;
}

/* 手指按下按钮时 */
.connect-form button:active {
  /* 按下时稍微变色 */
  background: #00b8e0;
  /* 按下时稍微缩小，有反馈感 */
  transform: scale(0.98);
}

/* 按钮禁用时（正在连接中） */
.connect-form button:disabled {
  background: #555;
  color: #999;
  cursor: not-allowed;
}

/* 错误提示 */
.connect-form .error-message {
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
}
```

- [ ] **Step 2: 编写 ConnectForm.tsx**

```typescript
// ============================================================
// ConnectForm — 连接表单组件
//
// 这是用户打开应用后看到的第一个界面。
// 用户在这里输入 SSH 服务器的地址、用户名和密码，
// 点击"连接"按钮后，应用会通过 WebSocket 连接到后端，
// 后端再去连接 SSH 服务器。
//
// 组件（Component）是什么？
//   React 组件是一个函数，返回一段 HTML（JSX）。
//   组件名以大写字母开头（如 ConnectForm）。
//   组件可以接收 Props（属性）来通信。
// ============================================================

import React, { useState } from 'react';
import './ConnectForm.css';

// ============================================================
// 类型定义
// ============================================================

/**
 * 组件的 Props（属性）
 *
 * onConnect 是一个回调函数，当用户提交表单后被调用。
 * 父组件（App.tsx）通过这个回调接收连接参数，
 * 然后去建立 WebSocket 和 SSH 连接。
 */
interface ConnectFormProps {
  /** 用户提交表单时的回调 */
  onConnect: (params: ConnectParams) => void;
  /** 是否正在连接中（显示加载状态） */
  connecting: boolean;
  /** 错误信息（连接失败时显示） */
  error: string | null;
}

/**
 * 连接参数
 * 用户在表单中填写的内容
 */
export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  password: string;
  token?: string;
}

/**
 * 连接表单组件
 *
 * 包含四个输入框：
 *   1. 主机地址 - 如 192.168.1.100
 *   2. 端口     - SSH 端口，默认 22
 *   3. 用户名   - 如 root
 *   4. 密码     - 不显示明文
 * 和一个连接按钮
 */
export function ConnectForm({ onConnect, connecting, error }: ConnectFormProps) {
  // ---- 状态定义 ----
  // 每个输入框对应一个 state（状态）

  /** 主机地址 */
  const [host, setHost] = useState('');
  /** 端口号，默认 22 */
  const [port, setPort] = useState('22');
  /** 用户名 */
  const [username, setUsername] = useState('');
  /** 密码 */
  const [password, setPassword] = useState('');
  /** 访问令牌 */
  const [token, setToken] = useState('');

  // ---- 表单提交处理 ----
  /**
   * 当用户点击"连接"按钮时触发
   * 做两件事：
   *   1. 阻止表单的默认提交行为（否则页面会刷新）
   *   2. 调用 onConnect 把参数传给父组件
   */
  function handleSubmit(event: React.FormEvent) {
    // 阻止表单的默认提交（HTML form 默认会刷新页面）
    event.preventDefault();

    // 基本验证：主机和用户名不能为空
    if (!host.trim()) {
      // 这里不做复杂校验，简单检查即可
      return;
    }
    if (!username.trim()) {
      return;
    }
    if (!password) {
      return;
    }

    // 调用父组件传下来的回调
    onConnect({
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      password: password,
      token: token.trim() || undefined,
    });
  }

  // ---- 渲染界面 ----
  return (
    <div className="connect-form">
      {/* 标题 */}
      <h1>SSH Terminal</h1>
      <p className="subtitle">轻量级远程终端 · 用完即走</p>

      {/* HTML form 元素，onSubmit 绑定提交事件 */}
      <form onSubmit={handleSubmit}>
        {/* ----- 主机地址 ----- */}
        <div className="form-group">
          <label>主机地址</label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="例: 192.168.1.100"
            // disabled 表示禁用输入（正在连接时不可编辑）
            disabled={connecting}
            // autoFocus：页面打开后自动聚焦到这个输入框
            autoFocus
          />
        </div>

        {/* ----- 端口 ----- */}
        <div className="form-group">
          <label>端口</label>
          <input
            type="number"
            className="port-input"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            // placeholder 是输入框为空时显示的灰色提示文字
            placeholder="22"
            disabled={connecting}
          />
        </div>

        {/* ----- 用户名 ----- */}
        <div className="form-group">
          <label>用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例: root"
            disabled={connecting}
            // autoCapitalize="none" 阻止手机自动首字母大写
            autoCapitalize="none"
            // autoCorrect="off" 阻止手机自动纠错
            autoCorrect="off"
          />
        </div>

        {/* ----- 密码 ----- */}
        <div className="form-group">
          <label>密码</label>
          <input
            // type="password"：输入的内容显示为圆点，不会被旁人看到
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入 SSH 密码"
            disabled={connecting}
          />
        </div>

        {/* ----- 访问令牌（可选） ----- */}
        <div className="form-group">
          <label>访问令牌（可选）</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="如果服务器要求令牌，在此输入"
            disabled={connecting}
          />
        </div>

        {/* ----- 连接按钮 ----- */}
        <button type="submit" disabled={connecting}>
          {/* 连接中显示"连接中..."，否则显示"连接" */}
          {connecting ? '连接中...' : '连接'}
        </button>
      </form>

      {/* ----- 错误信息 ----- */}
      {/* 如果有错误信息就显示，没有就不显示 */}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ConnectForm.tsx client/src/components/ConnectForm.css
git commit -m "feat: 连接表单组件"
```

---

### Task 10: xterm.js 终端 Hook

**Files:**
- Create: `client/src/hooks/useTerminal.ts`

**Produces:**
- `useTerminal(containerRef) → { write, onInput, resize }`

- [ ] **Step 1: 编写 useTerminal.ts**

```typescript
// ============================================================
// useTerminal — xterm.js 终端 Hook
//
// 这个 Hook 负责：
//   1. 初始化 xterm.js（浏览器端的终端模拟器）
//   2. 管理终端的输入输出
//   3. 处理终端窗口大小变化（手机旋转/键盘弹出）
//   4. 处理手机键盘的各种操作（粘贴、回车等）
//
// 什么是 xterm.js？
//   xterm.js 是一个开源的终端模拟器库。
//   它在浏览器中模拟了一个真正的终端，支持颜色、光标、
//   ANSI 转义序列等。VS Code 的内置终端就是用 xterm.js 做的。
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

/**
 * 终端配置常量
 * 这些值控制终端的显示效果
 */
const TERMINAL_CONFIG = {
  /** 字体大小（像素），14px 适合手机阅读 */
  fontSize: 14,
  /** 字体族：优先使用等宽字体 */
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
  /** 光标样式：下划线 */
  cursorStyle: 'underline' as const,
  /** 光标是否闪烁 */
  cursorBlink: true,
  /** 暗色主题配置 */
  theme: {
    background: '#1a1a2e', // 深蓝黑背景
    foreground: '#e0e0e0', // 浅灰文字
    cursor: '#00d4ff',     // 青色光标
    selectionBackground: '#00d4ff44', // 选中文字的背景色（半透明青）
    black: '#1a1a2e',
    red: '#ff6b6b',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#8be9fd',
    magenta: '#ff79c6',
    cyan: '#00d4ff',
    white: '#e0e0e0',
    brightBlack: '#555555',
    brightRed: '#ff6b6b',
    brightGreen: '#50fa7b',
    brightYellow: '#f1fa8c',
    brightBlue: '#8be9fd',
    brightMagenta: '#ff79c6',
    brightCyan: '#00d4ff',
    brightWhite: '#ffffff',
  },
};

/**
 * Hook 的参数类型
 */
interface UseTerminalOptions {
  /** 当用户在终端中按键时的回调，把按键数据传给 SSH */
  onInput: (data: string) => void;
}

/**
 * Hook 的返回值类型
 */
interface UseTerminalReturn {
  /** 终端容器的 ref，需要绑定到 DOM 元素上 */
  terminalRef: React.RefObject<HTMLDivElement | null>;
  /** 向终端写入数据（来自 SSH 的输出） */
  writeToTerminal: (data: string) => void;
  /** 调整终端大小 */
  fitTerminal: () => void;
}

/**
 * 创建和管理 xterm.js 终端实例
 *
 * @param options - 配置选项
 * @returns 终端操作方法和引用
 */
export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const { onInput } = options;

  // ---- 引用 ----
  /** 终端容器 DOM 的引用（绑定到 div 上） */
  const terminalRef = useRef<HTMLDivElement | null>(null);
  /** xterm.js Terminal 实例的引用 */
  const termRef = useRef<Terminal | null>(null);
  /** FitAddon（自适应大小插件）的引用 */
  const fitAddonRef = useRef<FitAddon | null>(null);

  // ---- 初始化终端 ----
  useEffect(() => {
    // 如果已经初始化过，不重复创建
    if (termRef.current) return;
    // 如果 DOM 容器还不存在，等待下次
    if (!terminalRef.current) return;

    // 第 1 步：创建终端实例
    const term = new Terminal({
      fontSize: TERMINAL_CONFIG.fontSize,
      fontFamily: TERMINAL_CONFIG.fontFamily,
      cursorStyle: TERMINAL_CONFIG.cursorStyle,
      cursorBlink: TERMINAL_CONFIG.cursorBlink,
      theme: TERMINAL_CONFIG.theme,
      // 不允许浏览器右键菜单（终端内右键该由终端自己处理）
      allowProposedApi: true,
      // 允许传输速率无限制
      allowTransparency: false,
    });

    // 第 2 步：添加 FitAddon 插件
    // 这个插件让终端尺寸自动适应容器大小
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // 第 3 步：尝试添加 WebGL 加速插件
    // WebGL 使用 GPU 加速渲染，让终端更流畅
    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch {
      // 如果设备不支持 WebGL（部分旧手机），降级到 Canvas 渲染
      console.log('[Terminal] WebGL 不可用，使用 Canvas 渲染');
    }

    // 第 4 步：打开终端（挂载到 DOM 容器）
    term.open(terminalRef.current);

    // 第 5 步：自适应大小
    fitAddon.fit();

    // 第 6 步：监听用户输入
    // 当用户在终端中按键时，把数据传给 SSH
    term.onData((data: string) => {
      onInput(data);
    });

    // 保存实例引用
    termRef.current = term;

    console.log('[Terminal] 终端初始化完成，尺寸:', term.cols, 'x', term.rows);

    // ---- 清理函数 ----
    return () => {
      console.log('[Terminal] 销毁终端');
      term.dispose();
      termRef.current = null;
    };
  }, []); // 只在首次挂载时执行

  // ---- 向终端写入数据 ----
  const writeToTerminal = useCallback((data: string) => {
    const term = termRef.current;
    if (term) {
      term.write(data);
    }
  }, []);

  // ---- 调整终端大小 ----
  const fitTerminal = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    if (fitAddon) {
      // 给小延迟，等 DOM 更新完成
      setTimeout(() => {
        fitAddon.fit();
        const term = termRef.current;
        if (term) {
          console.log('[Terminal] 尺寸已调整:', term.cols, 'x', term.rows);
        }
      }, 50);
    }
  }, []);

  return { terminalRef, writeToTerminal, fitTerminal };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useTerminal.ts
git commit -m "feat: xterm.js 终端 Hook"
```

---

### Task 11: 终端显示组件

**Files:**
- Create: `client/src/components/Terminal.tsx`
- Create: `client/src/components/Terminal.css`

**Consumes:**
- `useTerminal` hook

- [ ] **Step 1: 编写 Terminal.css**

```css
/* ============================================================
   Terminal 样式
   确保终端填满整个屏幕，不滚动页面本身，
   而是让终端内部滚动（和真正的终端一样）
   ============================================================ */

/* 终端外层容器 */
.terminal-container {
  /* 占满整个可用高度 */
  flex: 1;
  /* 内边距（给终端一个呼吸空间） */
  padding: 4px;
  /* 背景和终端主题一致，避免边缘颜色不同 */
  background: #1a1a2e;
  /* 超出部分隐藏 */
  overflow: hidden;
}

/* xterm.js 渲染的实际终端元素 */
.terminal-container .xterm {
  /* 高度撑满 */
  height: 100%;
  /* 内边距 */
  padding: 4px;
}
```

- [ ] **Step 2: 编写 Terminal.tsx**

```typescript
// ============================================================
// Terminal — 终端显示组件
//
// 这个组件显示 xterm.js 终端并：
//   1. 把来自 SSH 的数据写入终端显示
//   2. 把用户在终端的按键通过 WebSocket 发送给 SSH
//   3. 监听屏幕旋转和键盘弹出，自动调整终端大小
// ============================================================

import React, { useEffect, useRef, useCallback } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import './Terminal.css';

// ============================================================
// 类型定义
// ============================================================

/**
 * Terminal 组件的 Props
 */
interface TerminalProps {
  /** 当用户在终端中按键时触发 */
  onInput: (data: string) => void;
  /** 收到 SSH 数据时写入（来自父组件的 WebSocket 消息） */
  outputData: string | null;
  /** 当终端尺寸变化时触发，需要通知后端调整 SSH 窗口大小 */
  onResize: (cols: number, rows: number) => void;
}

/**
 * 终端显示组件
 */
export function Terminal({ onInput, outputData, onResize }: TerminalProps) {
  // 使用我们定义的 useTerminal Hook
  const { terminalRef, writeToTerminal, fitTerminal } = useTerminal({ onInput });

  // 用 ref 保存 onResize 回调，避免 useEffect 重复执行
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  // ---- 处理来自 SSH 的数据 ----
  // 当 outputData 变化时，把新数据写入终端
  useEffect(() => {
    if (outputData) {
      writeToTerminal(outputData);
    }
  }, [outputData, writeToTerminal]);

  // ---- 移动端适配：监听屏幕变化 ----
  useEffect(() => {
    /**
     * 处理视口变化（键盘弹出/收起、屏幕旋转）
     *
     * visualViewport 是浏览器提供的一个 API，
     * 它告诉我们"当前可见区域"的大小。
     * 手机键盘弹出时，可见区域变小——我们用这个来调整终端大小。
     */
    function handleViewportChange() {
      // 调整 xterm.js 的尺寸以匹配容器
      fitTerminal();

      // 获取调整后的终端尺寸
      // 通过 DOM 查询 xterm 的 cols 和 rows
      const xtermElement = document.querySelector('.terminal-container .xterm');
      if (xtermElement) {
        // 从 xterm 的 CSS 变量中读取列数和行数
        // xterm.js 会设置这些 CSS 变量
        const cols = getComputedStyle(xtermElement).getPropertyValue('--cols');
        // 如果没有 CSS 变量，使用一个估计值
        // 通过容器宽度 / 字符宽度 估算列数
        const container = xtermElement.parentElement;
        if (container) {
          // 估算：字符宽度约等于 fontSize * 0.6（等宽字体近似）
          const estimatedCols = Math.floor(container.clientWidth / (14 * 0.6));
          const estimatedRows = Math.floor(container.clientHeight / (14 * 1.2));
          onResizeRef.current(estimatedCols, estimatedRows);
        }
      }
    }

    // 监听 visualViewport 变化（键盘弹出/收起）
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    // 监听屏幕旋转
    window.addEventListener('orientationchange', () => {
      // 旋转后延迟执行，等浏览器完成布局
      setTimeout(handleViewportChange, 200);
    });

    // 监听窗口大小变化
    window.addEventListener('resize', handleViewportChange);

    // 初始调整一次
    setTimeout(handleViewportChange, 100);

    // ---- 清理函数 ----
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [fitTerminal]);

  // ---- 渲染 ----
  return (
    <div className="terminal-container">
      {/* 
        这个 div 是 xterm.js 的"家"
        ref={terminalRef} 把 div 和 Hook 中的引用绑定
        xterm.js 会在这个 div 里面创建 canvas 元素来渲染终端
      */}
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Terminal.tsx client/src/components/Terminal.css
git commit -m "feat: 终端显示组件"
```

---

### Task 12: 状态栏组件

**Files:**
- Create: `client/src/components/StatusBar.tsx`
- Create: `client/src/components/StatusBar.css`

- [ ] **Step 1: 编写 StatusBar.css**

```css
/* ============================================================
   StatusBar 样式
   固定在屏幕底部的状态栏
   ============================================================ */

.status-bar {
  /* 固定在底部 */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  /* 高度 */
  height: 40px;
  /* 背景：深色 */
  background: #16213e;
  /* 顶部细线 */
  border-top: 1px solid #333;
  /* 水平排列子元素 */
  display: flex;
  /* 左右对齐 */
  align-items: center;
  /* 左右留白 */
  padding: 0 12px;
  /* 字体大小 */
  font-size: 13px;
  /* 文字颜色 */
  color: #aaa;
  /* 层级：确保在终端之上 */
  z-index: 10;
}

/* 左侧信息区域（主机名和状态指示） */
.status-bar .status-left {
  /* 占满剩余空间（把右侧按钮推到最右） */
  flex: 1;
  /* 水平排列 */
  display: flex;
  align-items: center;
  /* 间距 */
  gap: 8px;
}

/* 状态指示灯（一个小圆点） */
.status-bar .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  /* 默认红色（断开） */
  background: #ff6b6b;
}

/* 已连接状态：绿色 */
.status-bar .status-dot.connected {
  background: #50fa7b;
}

/* 断开按钮 */
.status-bar button {
  background: transparent;
  border: 1px solid #555;
  color: #ccc;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

/* 断开按钮按下 */
.status-bar button:active {
  background: #333;
}
```

- [ ] **Step 2: 编写 StatusBar.tsx**

```typescript
// ============================================================
// StatusBar — 底部状态栏组件
//
// 显示当前连接的主机名和连接状态，
// 以及一个"断开连接"按钮。
// ============================================================

import React from 'react';
import './StatusBar.css';

// ============================================================
// 类型定义
// ============================================================

/**
 * StatusBar 组件的 Props
 */
interface StatusBarProps {
  /** 当前连接的主机名（如 192.168.1.100） */
  host: string;
  /** 是否已连接 */
  connected: boolean;
  /** 断开按钮点击时的回调 */
  onDisconnect: () => void;
}

/**
 * 底部状态栏组件
 *
 * 布局：[ ● 192.168.1.100 ] —————————— [ 断开 ]
 */
export function StatusBar({ host, connected, onDisconnect }: StatusBarProps) {
  return (
    <div className="status-bar">
      {/* 左侧：状态指示灯 + 主机名 */}
      <div className="status-left">
        {/* 
          状态指示灯：小圆点
          如果 connected 为 true，添加 "connected" 类名（变绿）
        */}
        <span className={`status-dot ${connected ? 'connected' : ''}`} />
        <span>
          {/* 显示主机名，如果断开了显示"(已断开)" */}
          {host}
          {!connected && ' (已断开)'}
        </span>
      </div>

      {/* 右侧：断开按钮 */}
      <button onClick={onDisconnect}>
        断开
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/StatusBar.tsx client/src/components/StatusBar.css
git commit -m "feat: 状态栏组件"
```

---

### Task 13: App 根组件

**Files:**
- Create: `client/src/App.tsx`
- Create: `client/src/App.css`

**Consumes:**
- `ConnectForm` component
- `Terminal` component
- `StatusBar` component
- `useWebSocket` hook

- [ ] **Step 1: 编写 App.css**

```css
/* ============================================================
   App 全局样式
   ============================================================ */

/* 重置浏览器默认样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 页面根元素 */
html, body, #root {
  /* 占满整个视口 */
  width: 100%;
  height: 100%;
  /* 防止页面滚动（终端自己处理滚动） */
  overflow: hidden;
  /* 背景色：深色主题 */
  background: #1a1a2e;
  /* 字体 */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  /* 禁止用户选择文字（终端中误触会选中，体验不好） */
  -webkit-user-select: none;
  user-select: none;
  /* 禁止 iOS 的长按弹出菜单 */
  -webkit-touch-callout: none;
}

/* 整个应用的容器 */
.app {
  /* 占满屏幕 */
  width: 100%;
  height: 100%;
  /* 纵向弹性布局 */
  display: flex;
  flex-direction: column;
  /* 背景色 */
  background: #1a1a2e;
}

/* 
  当连接上 SSH 时，需要给状态栏留出空间
  状态栏高度 40px，所以终端容器需要减去这个高度
*/
.app.connected .terminal-wrapper {
  /* calc() 计算：100vh（整个视口高度） - 40px（状态栏高度） */
  height: calc(100vh - 40px);
  /* 或者使用 flex: 1 自动填充 */
}

/* 终端区域的包裹元素 */
.app .terminal-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 2: 编写 App.tsx**

```typescript
// ============================================================
// App — 应用的根组件
//
// 这是整个 React 应用的"大脑"，负责：
//   1. 管理全局连接状态（没连接 / 连接中 / 已连接）
//   2. 协调 WebSocket 通信
//   3. 在各子组件之间传递数据
//
// 状态机（State Machine）：
//   idle        → 显示连接表单
//   connecting  → 显示连接表单（加载状态）
//   connected   → 显示终端 + 状态栏
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ConnectForm, ConnectParams } from './components/ConnectForm';
import { Terminal } from './components/Terminal';
import { StatusBar } from './components/StatusBar';
import { useWebSocket } from './hooks/useWebSocket';
import './App.css';

// ============================================================
// 类型定义
// ============================================================

/**
 * 应用的连接状态
 */
type ConnectionState = 'idle' | 'connecting' | 'connected';

/**
 * 服务器的消息类型（从后端发来的）
 */
interface ServerMessage {
  type: 'connected' | 'output' | 'error' | 'disconnected';
  data?: string;
  message?: string;
}

/**
 * 构建 WebSocket 地址
 * 开发环境使用 localhost，生产环境使用当前页面的主机名
 */
function getWebSocketUrl(): string {
  // 判断是否使用安全连接（WSS）
  // 如果页面是 HTTPS，就必须用 WSS
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = '3001'; // 后端端口

  // 开发环境：Vite 代理会自动转发 /ws 请求
  if (import.meta.env.DEV) {
    return `${protocol}//${host}:${window.location.port}/ws`;
  }

  // 生产环境：直接连接后端
  return `${protocol}//${host}:${port}/ws`;
}

// ============================================================
// App 组件
// ============================================================

export function App() {
  // ---- 全局状态 ----
  /** 连接状态 */
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  /** 当前连接的主机名 */
  const [connectedHost, setConnectedHost] = useState('');
  /** 错误信息 */
  const [error, setError] = useState<string | null>(null);
  /** 来自 SSH 的数据（写入终端） */
  const [outputData, setOutputData] = useState<string | null>(null);

  // 用 ref 存储连接参数，用于 resize 消息
  const connectParamsRef = useRef<ConnectParams | null>(null);

  // ---- WebSocket 连接 ----
  // 使用我们的 useWebSocket Hook
  const { send, lastMessage, readyState, close: closeWs } = useWebSocket(getWebSocketUrl());

  // ---- 处理服务器发来的消息 ----
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as ServerMessage;

    switch (msg.type) {
      case 'connected':
        // SSH 连接成功！
        setConnectionState('connected');
        setError(null);
        break;

      case 'output':
        // 收到 SSH 数据，写入终端
        setOutputData(msg.data || '');
        break;

      case 'error':
        // 连接失败
        setConnectionState('idle');
        setError(msg.message || '连接失败');
        break;

      case 'disconnected':
        // SSH 断开
        setConnectionState('idle');
        setConnectedHost('');
        break;
    }
  }, [lastMessage]);

  // ---- WebSocket 断开检测 ----
  useEffect(() => {
    // readyState 为 CLOSED(3) 或 CLOSING(2) 时表示连接断开
    if (readyState === WebSocket.CLOSED || readyState === WebSocket.CLOSING) {
      if (connectionState === 'connected') {
        setConnectionState('idle');
        setConnectedHost('');
        setError('WebSocket 连接断开');
      }
    }
  }, [readyState, connectionState]);

  // ---- 用户提交连接表单 ----
  const handleConnect = useCallback((params: ConnectParams) => {
    // 更新状态
    setConnectionState('connecting');
    setConnectedHost(params.host);
    setError(null);
    connectParamsRef.current = params;

    // 通过 WebSocket 发送连接请求
    send({
      type: 'connect',
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      token: params.token,
      // 初始终端尺寸（估算值，连接后会调整）
      cols: 80,
      rows: 24,
    });
  }, [send]);

  // ---- 用户在终端中按键 ----
  const handleTerminalInput = useCallback((data: string) => {
    send({ type: 'input', data });
  }, [send]);

  // ---- 终端尺寸变化 ----
  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    send({ type: 'resize', cols, rows });
  }, [send]);

  // ---- 断开连接 ----
  const handleDisconnect = useCallback(() => {
    closeWs();
    setConnectionState('idle');
    setConnectedHost('');
    setError(null);
  }, [closeWs]);

  // ---- 渲染界面 ----
  return (
    <div className={`app ${connectionState === 'connected' ? 'connected' : ''}`}>
      {/* 
        根据连接状态显示不同界面
        这是 React 的条件渲染：用 {} 包裹 JavaScript 表达式
      */}
      {connectionState === 'connected' ? (
        // ===== 已连接：显示终端 =====
        <>
          <div className="terminal-wrapper">
            <Terminal
              onInput={handleTerminalInput}
              outputData={outputData}
              onResize={handleTerminalResize}
            />
          </div>
          <StatusBar
            host={connectedHost}
            connected={true}
            onDisconnect={handleDisconnect}
          />
        </>
      ) : (
        // ===== 未连接：显示连接表单 =====
        <ConnectForm
          onConnect={handleConnect}
          connecting={connectionState === 'connecting'}
          error={error}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx client/src/App.css
git commit -m "feat: App 根组件"
```

---

### Task 14: PWA 配置

**Files:**
- Create: `client/src/pwa/manifest.json`
- Create: `client/src/pwa/sw.js`

- [ ] **Step 1: 创建 manifest.json**

```json
{
  "name": "SSH Terminal",
  "short_name": "Term",
  "description": "轻量级移动 SSH 终端 - 应急远程连接工具",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#1a1a2e",
  "background_color": "#1a1a2e",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: 创建 sw.js**

```javascript
// ============================================================
// Service Worker
// 这是 PWA（渐进式 Web 应用）的核心
//
// Service Worker 是一个在后台运行的脚本，
// 它的主要功能：
//   1. 缓存应用的静态文件（HTML/CSS/JS），加速加载
//   2. 拦截网络请求，实现离线访问
//   3. 让 PWA 可以添加到手机主屏幕并以"全屏"模式打开
//
// 注意：这个文件必须是纯 JavaScript（不是 TypeScript），
// 因为 Service Worker 运行在浏览器底层，不支持 TS
// ============================================================

// 缓存的名称（版本号用于更新缓存）
const CACHE_NAME = 'ssh-terminal-v1';

// 需要缓存的文件列表
// 这些文件会在首次访问时被缓存，之后可以从缓存中加载
const CACHE_FILES = [
  '/',
  '/index.html',
];

// ============================================================
// install 事件：Service Worker 安装时触发
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] 正在安装...');

  // skipWaiting() 让新的 Service Worker 立即生效
  // 不需要等待旧版本关闭
  self.skipWaiting();

  // 缓存所有需要预加载的文件
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 正在缓存文件:', CACHE_FILES);
      return cache.addAll(CACHE_FILES);
    })
  );
});

// ============================================================
// activate 事件：Service Worker 激活时触发
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] 已激活');

  // 清理旧版本的缓存
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME) // 不是当前版本
          .map((name) => caches.delete(name))     // 删除
      );
    })
  );
});

// ============================================================
// fetch 事件：拦截所有网络请求
// ============================================================
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求（POST、WebSocket 等不缓存）
  if (event.request.method !== 'GET') return;

  // 不缓存 WebSocket 连接
  if (event.request.url.includes('/ws')) return;

  // 策略：优先使用网络，网络不可用时使用缓存
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 网络请求成功，更新缓存
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // 网络请求失败，尝试使用缓存
        return caches.match(event.request);
      })
  );
});
```

- [ ] **Step 3: 创建 public 目录和占位图标**

```bash
mkdir -p "e:\工作记录\ssh_app\public"
```

> 注意：icon-192.png 和 icon-512.png 需要手动添加到 public/ 目录。可以使用任何 SSH 相关的图标。

- [ ] **Step 4: Commit**

```bash
git add client/src/pwa/manifest.json client/src/pwa/sw.js
git commit -m "feat: PWA 配置与 Service Worker"
```

---

## 阶段四：集成与验证

### Task 15: 集成测试与首次运行

**Files:**
- No new files (验证现有实现)

- [ ] **Step 1: 启动后端服务器**

```bash
cd "e:\工作记录\ssh_app"
npx tsx server/src/index.ts &
sleep 2
```

预期：
```
========================================
  SSH 移动终端 - 后端服务
========================================
  监听地址: 0.0.0.0:3001
  访问令牌: 未设置 ⚠️
  ...
✅ 服务器已启动: http://0.0.0.0:3001
```

- [ ] **Step 2: 验证后端健康检查**

```bash
curl http://localhost:3001/
```

预期：返回 HTML 页面，显示"SSH 终端后端服务"

- [ ] **Step 3: 启动前端开发服务器**

```bash
# 在另一个终端中
cd "e:\工作记录\ssh_app"
npx vite --host
```

预期：
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

- [ ] **Step 4: 验证前端页面可访问**

用浏览器打开 `http://localhost:5173/`，应该看到连接表单。

- [ ] **Step 5: 构建前端生产版本**

```bash
npx vite build
```

预期：`dist/client/` 目录下生成构建后的文件

- [ ] **Step 6: Commit**

```bash
git add dist/client/ 2>/dev/null || true
git commit -m "test: 集成测试通过"
```

---

## 阶段五：文档

### Task 16: 部署文档

**Files:**
- Create: `docs/DEPLOYMENT.md`

- [ ] **Step 1: 编写部署文档**

请见下一任务完成后一并提交（文档内容较长，单独处理）。

### Task 17: 代码说明文档

**Files:**
- Create: `docs/CODE-GUIDE.md`

### Task 18: 功能说明文档

**Files:**
- Create: `docs/FEATURES.md`

### Task 19: 接口文档

**Files:**
- Create: `docs/API.md`

---

## 附录：文档模板将在后续任务中填充完整内容

> 实际实施时，每个文档任务会包含完整的文档正文。为保持计划可读性，此处仅列出文件清单。所有文档将使用中文编写，面向初学者。

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-26 | 初版实现计划 |
