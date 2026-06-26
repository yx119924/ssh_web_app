// ============================================================
// Terminal — 终端显示组件
//
// 这个组件显示 xterm.js 终端并：
//   1. 把来自 SSH 的数据写入终端显示
//   2. 把用户在终端的按键通过 WebSocket 发送给 SSH
//   3. 监听屏幕旋转和键盘弹出，自动调整终端大小
// ============================================================

import React, { useEffect, useRef } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import './Terminal.css';

// ============================================================
// 类型定义
// ============================================================

/**
 * Terminal 组件的 Props
 */
interface TerminalProps {
  /** 当用户在终端中按键时触发 */
  onInput: (data: string) => void;
  /** 收到 SSH 数据时写入（来自父组件的 WebSocket 消息） */
  outputData: string | null;
  /** 当终端尺寸变化时触发，需要通知后端调整 SSH 窗口大小 */
  onResize: (cols: number, rows: number) => void;
}

/**
 * 终端显示组件
 */
export function Terminal({ onInput, outputData, onResize }: TerminalProps) {
  // 使用我们定义的 useTerminal Hook
  const { terminalRef, writeToTerminal, fitTerminal } = useTerminal({ onInput });

  // 用 ref 保存 onResize 回调，避免 useEffect 重复执行
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  // ---- 处理来自 SSH 的数据 ----
  // 当 outputData 变化时，把新数据写入终端
  useEffect(() => {
    if (outputData) {
      writeToTerminal(outputData);
    }
  }, [outputData, writeToTerminal]);

  // ---- 移动端适配：监听屏幕变化 ----
  useEffect(() => {
    /**
     * 处理视口变化（键盘弹出/收起、屏幕旋转）
     *
     * visualViewport 是浏览器提供的一个 API，
     * 它告诉我们"当前可见区域"的大小。
     * 手机键盘弹出时，可见区域变小——我们用这个来调整终端大小。
     */
    function handleViewportChange() {
      // 调整 xterm.js 的尺寸以匹配容器
      fitTerminal();

      // 获取调整后的终端尺寸
      const xtermElement = document.querySelector('.terminal-container .xterm');
      if (xtermElement) {
        const container = xtermElement.parentElement;
        if (container) {
          // 估算：字符宽度约等于 fontSize * 0.6（等宽字体近似）
          const estimatedCols = Math.floor(container.clientWidth / (14 * 0.6));
          const estimatedRows = Math.floor(container.clientHeight / (14 * 1.2));
          onResizeRef.current(estimatedCols, estimatedRows);
        }
      }
    }

    // 监听 visualViewport 变化（键盘弹出/收起）
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    // 监听屏幕旋转
    window.addEventListener('orientationchange', () => {
      // 旋转后延迟执行，等浏览器完成布局
      setTimeout(handleViewportChange, 200);
    });

    // 监听窗口大小变化
    window.addEventListener('resize', handleViewportChange);

    // 初始调整一次
    setTimeout(handleViewportChange, 100);

    // ---- 清理函数 ----
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [fitTerminal]);

  // ---- 渲染 ----
  return (
    <div className="terminal-container">
      {/*
        这个 div 是 xterm.js 的"家"
        ref={terminalRef} 把 div 和 Hook 中的引用绑定
        xterm.js 会在这个 div 里面创建 canvas 元素来渲染终端
      */}
      <div ref={terminalRef as unknown as React.Ref<HTMLDivElement>} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
