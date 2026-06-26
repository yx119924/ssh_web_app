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
   * 密码只在当前函数中使用，不会保存到任何地方
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
              // setWindow 签名: (rows, cols, height, width)
              // height/width 设 0 表示由 SSH 服务器自行处理像素尺寸
              stream.setWindow(rows, cols, 0, 0);
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
      // 注意：不要在日志中输出 options.password
      onError(`SSH 连接失败: ${err.message}`);
      reject(err);
    });

    // ---- 连接关闭处理 ----
    client.on('close', () => {
      onClose();
    });

    // ---- 第 5 步：发起连接 ----
    // 密码只在这里被使用一次
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
