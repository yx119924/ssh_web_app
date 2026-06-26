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

  /**
   * 直接写入终端的函数引用
   * 终端输出数据通过这个 ref 直接写入 xterm.js，
   * 不经过 React 状态 → 避免 React 18 自动批处理导致消息丢失
   */
  const writeToTerminalRef = useRef<((data: string) => void) | null>(null);

  // 用 ref 存储连接参数，用于 resize 消息
  const connectParamsRef = useRef<ConnectParams | null>(null);

  // ---- WebSocket 连接 ----
  // onMessage 回调在每条 WebSocket 消息到达时立即调用，
  // 对于 'output' 类型的消息，直接写入终端，绕过 React 状态
  const { send, lastMessage, readyState, close: closeWs } = useWebSocket(getWebSocketUrl(), {
    onMessage: (data: any) => {
      // 高频终端输出：直接写入 xterm.js，不经过 React 状态
      // 这样可以避免 React 18 自动批处理合并状态更新导致中间消息丢失
      if (data.type === 'output' && writeToTerminalRef.current) {
        writeToTerminalRef.current(data.data || '');
      }
    },
  });

  // ---- 处理服务器发来的消息（仅处理连接状态变更） ----
  // 注意：'output' 类型消息已在 useWebSocket 的 onMessage 回调中
  //       直接写入终端，不经过此 useEffect，避免消息丢失
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
        // output 消息已通过 onMessage 回调直接写入终端
        // 这里不需要处理（保留此分支避免触发 default 报错）
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

  // ---- 终端就绪回调 ----
  // 当 Terminal 组件初始化完成后，把 writeToTerminal 函数存储到 ref 中
  // 供 WebSocket onMessage 回调直接调用
  const handleTerminalReady = useCallback(
    (handlers: { writeToTerminal: (data: string) => void; fitTerminal: () => void }) => {
      writeToTerminalRef.current = handlers.writeToTerminal;
    },
    []
  );

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
              onResize={handleTerminalResize}
              onReady={handleTerminalReady}
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
