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
