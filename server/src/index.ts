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
