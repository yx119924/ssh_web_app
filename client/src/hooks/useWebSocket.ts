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
 * Hook 的参数类型
 */
interface UseWebSocketOptions {
  /**
   * 可选的直接消息回调
   * 每条 WebSocket 消息到达时立即调用，绕过 React 状态批处理
   * 用于终端输出等高频实时数据流，避免消息被 React 18 自动批处理丢失
   */
  onMessage?: (data: any) => void;
}

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
export function useWebSocket(url: string, options?: UseWebSocketOptions): UseWebSocketReturn {
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

  /**
   * 用 ref 保存最新的 onMessage 回调
   * 避免 WebSocket onmessage 闭包捕获到过时的回调
   */
  const onMessageRef = useRef(options?.onMessage);
  onMessageRef.current = options?.onMessage;

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
        // 绕过 React 状态批处理，直接回调给调用方
        // 这对于终端输出等高频实时数据流至关重要——
        // React 18 的自动批处理会合并快速连续的状态更新，
        // 导致中间的 WebSocket 消息丢失
        onMessageRef.current?.(data);
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
