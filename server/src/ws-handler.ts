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
