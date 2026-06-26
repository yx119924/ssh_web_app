# SSH 移动终端 — 部署文档

> 本文档面向初学者，逐步指导如何将 SSH 终端部署到服务器上，让你可以通过手机浏览器随时连接远程服务器。

---

## 目录

1. [前置准备](#1-前置准备)
2. [本地开发环境启动](#2-本地开发环境启动)
3. [部署到服务器](#3-部署到服务器)
4. [配置 SSL（HTTPS/WSS）](#4-配置-sslhttpswss)
5. [配置访问令牌](#5-配置访问令牌)
6. [使用 PM2 持久运行](#6-使用-pm2-持久运行)
7. [使用 Nginx 反向代理](#7-使用-nginx-反向代理)
8. [在手机上使用](#8-在手机上使用)
9. [常见问题](#9-常见问题)

---

## 1. 前置准备

### 你需要什么

| 项目 | 说明 |
|------|------|
| 一台服务器 | 部署后端服务，需要能运行 Node.js（Linux 推荐） |
| Node.js | 版本 >= 18，[下载地址](https://nodejs.org/) |
| 域名（可选） | 用于配置 SSL 证书，实现 HTTPS 安全连接 |

### 安装 Node.js

**Windows/Mac**：去 [nodejs.org](https://nodejs.org/) 下载安装包，安装 LTS 版本。

**Linux (Ubuntu/Debian)**：
```bash
# 使用 nvm 安装（推荐，方便切换版本）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version  # 应该显示 v20.x.x
```

### 获取代码

```bash
# 将项目代码拷贝到服务器上（可以用 git clone 或 scp 上传）
# 如果使用 git：
git clone <你的仓库地址> ssh_app
cd ssh_app
npm install
```

---

## 2. 本地开发环境启动

在部署到服务器之前，可以现在自己的电脑上试运行。

```bash
# 进入项目目录
cd ssh_app

# 安装依赖（首次运行）
npm install

# 启动后端（终端 1）
npm run dev:server

# 你会看到：
# ========================================
#   SSH 移动终端 - 后端服务
# ========================================
#   监听地址: 0.0.0.0:3001
#   ✅ 服务器已启动: http://0.0.0.0:3001

# 启动前端（终端 2）
npm run dev:client

# 你会看到：
# VITE v5.x.x  ready in xxx ms
# ➜  Local:   http://localhost:5173/

# 打开浏览器访问 http://localhost:5173
```

> **提示**：开发模式下，前端代码修改后会自动刷新；后端需要手动重启。

---

## 3. 部署到服务器

### 3.1 构建生产版本

```bash
cd ssh_app

# 安装依赖
npm install

# 构建前端（生成 dist/client/ 目录）
npm run build:client

# 构建后端（生成 dist/server/ 目录）
npm run build:server
```

构建完成后，目录结构：
```
ssh_app/
├── dist/
│   ├── client/     # 前端静态文件（HTML、JS、CSS）
│   └── server/     # 后端 Node.js 代码
├── node_modules/   # 依赖包
└── ...
```

### 3.2 启动生产服务

```bash
# 方式一：直接启动
node dist/server/index.js

# 方式二：使用 npm script
npm start
```

后端会启动在 `0.0.0.0:3001`。你还需要提供前端文件——可以通过 Nginx（推荐）或让后端也托管前端文件。

### 3.3 让后端也托管前端静态文件

修改 `server/src/index.ts`，在 HTTP 服务器部分添加静态文件服务：

详细说明见 [代码说明文档](CODE-GUIDE.md)。

---

## 4. 配置 SSL（HTTPS/WSS）

> ⚠️ **重要**：部署到公网时，必须配置 SSL。否则密码在传输过程中可能被窃听。

### 4.1 使用 Let's Encrypt 免费证书

```bash
# 安装 certbot（Ubuntu/Debian）
sudo apt-get update
sudo apt-get install certbot

# 获取证书（需要域名指向你的服务器 IP）
sudo certbot certonly --standalone -d your-domain.com

# 证书文件位置：
# 证书：/etc/letsencrypt/live/your-domain.com/fullchain.pem
# 私钥：/etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 4.2 修改后端代码启用 SSL

编辑 `server/src/index.ts`：

```typescript
// 将这部分：
import { createServer } from 'http';
// ...
const httpServer = createServer(/*...*/);

// 改为：
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
// ...
const httpsServer = createHttpsServer(
  {
    cert: readFileSync('/etc/letsencrypt/live/your-domain.com/fullchain.pem'),
    key: readFileSync('/etc/letsencrypt/live/your-domain.com/privkey.pem'),
  },
  (req, res) => { /* ... 同样的处理逻辑 */ }
);
```

或者更简单的方式：使用 Nginx 做 SSL 终止（见第 7 节）。

---

## 5. 配置访问令牌

设置访问令牌可以防止未授权的用户使用你的 SSH 代理服务。

```bash
# 设置环境变量
export SSH_ACCESS_TOKEN="你的密码令牌"

# 启动服务器
node dist/server/index.js
```

客户端在连接表单的"访问令牌"字段中输入相同的令牌即可。

---

## 6. 使用 PM2 持久运行

PM2 是一个进程管理工具，能在服务崩溃时自动重启，系统重启后自动恢复。

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/server/index.js --name ssh-terminal

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs ssh-terminal

# 重启服务
pm2 restart ssh-terminal
```

---

## 7. 使用 Nginx 反向代理

Nginx 是最推荐的生产部署方式，它负责：
- SSL 终止（HTTPS）
- 托管前端静态文件
- 将 WebSocket 请求转发到后端

### 7.1 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt-get install nginx
```

### 7.2 Nginx 配置

创建配置文件 `/etc/nginx/sites-available/ssh-terminal`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 强制跳转 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 前端静态文件
    root /path/to/ssh_app/dist/client;
    index index.html;

    # WebSocket 代理
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400; # 24小时超时（SSH 长连接）
    }

    # 其他请求（前端页面）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 7.3 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/ssh-terminal /etc/nginx/sites-enabled/

# 测试配置是否正确
sudo nginx -t

# 重载 Nginx
sudo nginx -s reload
```

配置完成后，访问 `https://your-domain.com` 即可使用。

---

## 8. 在手机上使用

### 8.1 通过浏览器访问

1. 在手机浏览器中打开 `https://your-domain.com`（或 `http://服务器IP:5173` 开发模式）
2. 第一次访问时会看到连接表单
3. 填写 SSH 服务器信息并连接

### 8.2 添加到主屏幕（PWA）

1. **iOS Safari**：打开网页 → 点击底部"分享"按钮 → "添加到主屏幕"
2. **Android Chrome**：打开网页 → 点击右上角菜单 → "添加到主屏幕"

添加后，SSH Terminal 会像一个原生 App 一样出现在你的手机桌面上，点击即可全屏打开。

### 8.3 使用注意事项

- **横屏模式**：建议横屏使用，终端显示区域更大
- **键盘操作**：连接后直接打开手机键盘即可输入命令
- **断开连接**：点击底部状态栏的"断开"按钮，或直接关闭页面
- **网络切换**：WiFi 切到移动数据会导致断连，需要重新连接

---

## 9. 常见问题

### Q: 为什么连接后一片黑屏？

A: 这通常意味着 SSH 正在等待服务器发送欢迎信息。稍等几秒，如果仍然黑屏，检查：
- SSH 服务器地址和端口是否正确
- 用户名和密码是否正确
- 目标服务器是否允许密码登录（有些服务器只允许密钥认证）

### Q: 手机键盘弹出后终端被遮挡怎么办？

A: 应用会自动调整终端大小以适应键盘。如果仍有问题：
- 尝试使用手机横屏模式
- 在系统设置中调整键盘高度

### Q: 如何更换后端端口？

A: 设置环境变量 `SSH_PORT=自定义端口号`，然后重启服务。

### Q: 忘记设置访问令牌怎么办？

A: 不设置令牌也可以使用，但任何人都能连接你的后端代理。建议公网部署时始终设置令牌。

### Q: WebSocket 连接老是断开？

A: 检查：
- 防火墙是否允许 3001 端口（或你自定义的端口）
- 如果使用 Nginx，检查 `proxy_read_timeout` 设置
- 网络环境是否稳定

### Q: 如何更新到新版本？

```bash
cd ssh_app
git pull                    # 拉取最新代码
npm install                 # 更新依赖
npm run build:client        # 重新构建前端
npm run build:server        # 重新构建后端
pm2 restart ssh-terminal    # 重启服务
```

---

## 部署清单

- [ ] 服务器上安装了 Node.js 18+
- [ ] 项目代码已上传到服务器
- [ ] `npm install` 安装依赖成功
- [ ] `npm run build:client` 构建前端成功
- [ ] `npm run build:server` 构建后端成功
- [ ] 配置了 SSL 证书（Let's Encrypt）
- [ ] 设置了 SSH_ACCESS_TOKEN 环境变量
- [ ] 配置了 Nginx 反向代理
- [ ] 使用 PM2 管理进程
- [ ] 手机浏览器可以正常访问和连接
