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
