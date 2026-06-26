# SSH 移动终端 — 接口文档 (API)

> 本文档说明前端（浏览器）和后端（Node.js 服务器）之间的通信接口。如果你想改造前端、换用其他框架、或开发新的客户端，参考此文档。

---

## 通信方式

- **协议**: WebSocket (WS) 或 WebSocket Secure (WSS)
- **连接地址**: `ws://服务器地址:3001/ws` 或 `wss://域名/ws`
- **消息格式**: JSON（文本格式）
- **编码**: UTF-8

---

## 消息总览

### 客户端 → 服务端

| type | 说明 | 何时发送 |
|------|------|----------|
| [connect](#connect) | 请求建立 SSH 连接 | 用户点击"连接"按钮 |
| [input](#input) | 发送用户按键 | 用户在终端中每次按键 |
| [resize](#resize) | 终端窗口尺寸变化 | 屏幕旋转、键盘弹出/收起 |

### 服务端 → 客户端

| type | 说明 | 何时发送 |
|------|------|----------|
| [connected](#connected) | SSH 连接成功 | ssh2 连接建立后 |
| [output](#output) | SSH 返回的数据 | 服务器有任何输出 |
| [error](#error) | 错误信息 | 连接失败、认证失败等 |
| [disconnected](#disconnected) | SSH 连接断开 | 服务器主动断开或网络断开 |

---

## 详细消息格式

### connect

客户端请求建立 SSH 连接。

```typescript
{
  "type": "connect",

  // 必填字段
  "host": "192.168.1.100",      // SSH 服务器 IP 或域名
  "port": 22,                    // SSH 端口，默认 22
  "username": "root",            // 登录用户名
  "password": "your_password",   // 登录密码

  // 可选字段
  "cols": 80,                    // 初始终端列数（字符宽度）
  "rows": 24,                    // 初始终端行数（字符高度）
  "token": "access_token"        // 访问令牌（如果服务器有设置）
}
```

**服务端响应**：
- 成功 → `{ "type": "connected" }`
- 失败 → `{ "type": "error", "message": "错误原因" }`

> ⚠️ **安全提示**：密码只在 WebSocket 连接中使用一次。服务端收到密码后立即用于 SSH 认证，不会保存到日志、文件或数据库。

---

### input

客户端发送用户按键到 SSH 终端。

```typescript
{
  "type": "input",
  "data": "ls -la\n"    // 用户按下的按键，包括特殊字符（回车=\n，Tab=\t 等）
}
```

**服务端行为**：将 `data` 原样写入 SSH 会话，不做任何修改或记录。

---

### resize

通知服务端终端窗口尺寸变化。

```typescript
{
  "type": "resize",
  "cols": 100,   // 新的终端列数
  "rows": 40     // 新的终端行数
}
```

**服务端行为**：调用 ssh2 的 `setWindow()` 调整远程终端窗口大小。

---

### connected

服务端通知 SSH 连接已成功建立。

```typescript
{
  "type": "connected"
}
```

**客户端行为**：隐藏连接表单，显示 xterm.js 终端。底部状态栏亮绿灯。

---

### output

服务端转发 SSH 服务器返回的数据。

```typescript
{
  "type": "output",
  "data": "root@server:~$ "
}
```

**说明**：
- `data` 字段包含 SSH 会话的原始输出，包括 ANSI 转义序列（颜色、光标控制等）
- 客户端直接将 `data` 写入 xterm.js，由 xterm.js 负责渲染

---

### error

服务端通知发生了错误。

```typescript
{
  "type": "error",
  "message": "连接失败: Connection refused"
}
```

**常见错误信息**：

| 错误信息 | 原因 | 解决办法 |
|----------|------|----------|
| 访问令牌验证失败 | 客户端令牌不匹配 | 检查令牌输入 |
| 缺少必填参数 | host/username/password 为空 | 填写所有必填项 |
| 已经有一个活跃的 SSH 连接 | 重复连接请求 | 先断开当前连接 |
| 连接失败: Connection refused | SSH 服务未运行 | 检查目标服务器 SSH 状态 |
| 连接失败: Authentication failed | 用户名或密码错误 | 核对登录凭据 |
| 连接失败: Connection timeout | 网络不通 | 检查网络和防火墙 |

---

### disconnected

SSH 连接已断开。

```typescript
{
  "type": "disconnected"
}
```

**客户端行为**：状态栏显示"已断开"，用户需要重新填写连接表单。

---

## WebSocket 生命周期

```
客户端                                  服务端
  |                                       |
  |---- WebSocket 连接建立 --------------->|
  |                                       |
  |---- { type: "connect", ... } -------->|
  |                                       |--- SSH 连接到目标服务器
  |<--- { type: "connected" } -----------|
  |                                       |
  |==== 双向通信阶段 ======================|
  |                                       |
  |---- { type: "input", data: "ls\n" } ->|
  |                                       |--- 写入 SSH 会话
  |<--- { type: "output", data: "..." } --|
  |                                       |
  |---- { type: "resize", ... } --------->|
  |                                       |--- 调整 SSH 窗口大小
  |                                       |
  |==== 断开阶段 =========================|
  |                                       |
  |---- WebSocket 连接关闭 --------------->|
  |                                       |--- 关闭 SSH 连接
  |<--- { type: "disconnected" } --------|
  |                                       |
```

---

## 使用示例

### 用 JavaScript 直接连接

如果你想自己写客户端（不用提供的 React 前端），可以这样做：

```javascript
// 1. 创建 WebSocket 连接
const ws = new WebSocket('ws://localhost:3001/ws');

// 2. 连接成功后发送 SSH 连接请求
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    host: '192.168.1.100',
    port: 22,
    username: 'root',
    password: 'your_password',
    cols: 80,
    rows: 24,
    token: 'your_access_token' // 如果服务器有设置
  }));
};

// 3. 处理服务器发来的消息
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'connected') {
    console.log('SSH 连接成功！');
    // 可以开始发送命令
    ws.send(JSON.stringify({ type: 'input', data: 'ls -la\n' }));
  } else if (msg.type === 'output') {
    console.log('服务器输出:', msg.data);
  } else if (msg.type === 'error') {
    console.error('错误:', msg.message);
  } else if (msg.type === 'disconnected') {
    console.log('连接已断开');
  }
};

// 4. 发送用户输入
function sendCommand(cmd) {
  ws.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
}

// 5. 调整终端大小
function resizeTerminal(cols, rows) {
  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}
```

### 用 curl 测试 WebSocket

可以使用 `wscat` 工具测试 WebSocket 连接：

```bash
# 安装 wscat
npm install -g wscat

# 连接到后端
wscat -c ws://localhost:3001/ws

# 发送连接请求
{"type":"connect","host":"your-server","port":22,"username":"root","password":"your_pwd","cols":80,"rows":24}

# 看到 {"type":"connected"} 表示成功
# 之后发送按键
{"type":"input","data":"ls\n"}
```

---

## 错误处理

### 服务端错误码

本应用不使用数字错误码，而是通过 `error` 消息的 `message` 字段传递人类可读的错误描述。

### 重连机制

客户端目前不自动重连。断开后需要用户手动重新输入信息并连接。这是有意设计的——为了安全，不在客户端缓存任何连接凭据。
