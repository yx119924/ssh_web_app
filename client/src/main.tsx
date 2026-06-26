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
