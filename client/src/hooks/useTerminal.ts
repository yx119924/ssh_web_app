// ============================================================
// useTerminal — xterm.js 终端 Hook
//
// 这个 Hook 负责：
//   1. 初始化 xterm.js（浏览器端的终端模拟器）
//   2. 管理终端的输入输出
//   3. 处理终端窗口大小变化（手机旋转/键盘弹出）
//   4. 处理手机键盘的各种操作（粘贴、回车等）
//
// 什么是 xterm.js？
//   xterm.js 是一个开源的终端模拟器库。
//   它在浏览器中模拟了一个真正的终端，支持颜色、光标、
//   ANSI 转义序列等。VS Code 的内置终端就是用 xterm.js 做的。
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

/**
 * 终端配置常量
 * 这些值控制终端的显示效果
 */
const TERMINAL_CONFIG = {
  /** 字体大小（像素），14px 适合手机阅读 */
  fontSize: 14,
  /** 字体族：优先使用等宽字体 */
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
  /** 光标样式：下划线 */
  cursorStyle: 'underline' as const,
  /** 光标是否闪烁 */
  cursorBlink: true,
  /** 暗色主题配置 */
  theme: {
    background: '#1a1a2e', // 深蓝黑背景
    foreground: '#e0e0e0', // 浅灰文字
    cursor: '#00d4ff',     // 青色光标
    selectionBackground: '#00d4ff44', // 选中文字的背景色（半透明青）
    black: '#1a1a2e',
    red: '#ff6b6b',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#8be9fd',
    magenta: '#ff79c6',
    cyan: '#00d4ff',
    white: '#e0e0e0',
    brightBlack: '#555555',
    brightRed: '#ff6b6b',
    brightGreen: '#50fa7b',
    brightYellow: '#f1fa8c',
    brightBlue: '#8be9fd',
    brightMagenta: '#ff79c6',
    brightCyan: '#00d4ff',
    brightWhite: '#ffffff',
  },
};

/**
 * Hook 的参数类型
 */
interface UseTerminalOptions {
  /** 当用户在终端中按键时的回调，把按键数据传给 SSH */
  onInput: (data: string) => void;
}

/**
 * Hook 的返回值类型
 */
interface UseTerminalReturn {
  /** 终端容器的 ref，需要绑定到 DOM 元素上 */
  terminalRef: React.RefObject<HTMLDivElement | null>;
  /** 向终端写入数据（来自 SSH 的输出） */
  writeToTerminal: (data: string) => void;
  /** 调整终端大小 */
  fitTerminal: () => void;
}

/**
 * 创建和管理 xterm.js 终端实例
 *
 * @param options - 配置选项
 * @returns 终端操作方法和引用
 */
export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const { onInput } = options;

  // ---- 引用 ----
  /** 终端容器 DOM 的引用（绑定到 div 上） */
  const terminalRef = useRef<HTMLDivElement | null>(null);
  /** xterm.js Terminal 实例的引用 */
  const termRef = useRef<Terminal | null>(null);
  /** FitAddon（自适应大小插件）的引用 */
  const fitAddonRef = useRef<FitAddon | null>(null);
  /**
   * 用 ref 保存最新的 onInput 回调
   * 解决 useEffect([]) 闭包捕获旧回调的问题
   */
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // ---- 初始化终端 ----
  useEffect(() => {
    // 如果已经初始化过，不重复创建
    if (termRef.current) return;
    // 如果 DOM 容器还不存在，等待下次
    if (!terminalRef.current) return;

    // 第 1 步：创建终端实例
    const term = new Terminal({
      fontSize: TERMINAL_CONFIG.fontSize,
      fontFamily: TERMINAL_CONFIG.fontFamily,
      cursorStyle: TERMINAL_CONFIG.cursorStyle,
      cursorBlink: TERMINAL_CONFIG.cursorBlink,
      theme: TERMINAL_CONFIG.theme,
      // 不允许浏览器右键菜单（终端内右键该由终端自己处理）
      allowProposedApi: true,
      // 允许传输速率无限制
      allowTransparency: false,
    });

    // 第 2 步：添加 FitAddon 插件
    // 这个插件让终端尺寸自动适应容器大小
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // 第 3 步：尝试添加 WebGL 加速插件
    // WebGL 使用 GPU 加速渲染，让终端更流畅
    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch {
      // 如果设备不支持 WebGL（部分旧手机），降级到 Canvas 渲染
      console.log('[Terminal] WebGL 不可用，使用 Canvas 渲染');
    }

    // 第 4 步：打开终端（挂载到 DOM 容器）
    term.open(terminalRef.current);

    // 第 5 步：自适应大小
    fitAddon.fit();

    // 第 6 步：监听用户输入
    // 当用户在终端中按键时，把数据传给 SSH
    term.onData((data: string) => {
      onInputRef.current(data);
    });

    // 第 7 步：注册自定义键盘事件处理器
    // 解决移动端回退键（Backspace）只能删一格的问题：
    //
    // xterm.js 使用隐藏的 <textarea> 触发虚拟键盘。每次按键后 textarea
    // 会被清空。Backspace 在空 textarea 上执行删除时，浏览器不触发
    // input 事件，导致 onData 不会被调用。
    //
    // 通过在 keydown 阶段直接拦截 Backspace 按键并手动发送 \x7f（DEL），
    // 绕过 textarea 的缺陷，确保每次按下回退键都能正确删除字符。
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type === 'keydown' && event.key === 'Backspace') {
        // 手动发送 DEL 字符（这是终端中回退的标准编码）
        onInputRef.current('\x7f');
        // 返回 false 阻止 xterm.js 再次处理此事件（避免重复删除）
        return false;
      }
      // 其他按键交给 xterm.js 正常处理
      return true;
    });

    // 保存实例引用
    termRef.current = term;

    console.log('[Terminal] 终端初始化完成，尺寸:', term.cols, 'x', term.rows);

    // ---- 清理函数 ----
    return () => {
      console.log('[Terminal] 销毁终端');
      term.dispose();
      termRef.current = null;
    };
  }, []); // 只在首次挂载时执行

  // ---- 向终端写入数据 ----
  const writeToTerminal = useCallback((data: string) => {
    const term = termRef.current;
    if (term) {
      term.write(data);
    }
  }, []);

  // ---- 调整终端大小 ----
  const fitTerminal = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    if (fitAddon) {
      // 给小延迟，等 DOM 更新完成
      setTimeout(() => {
        fitAddon.fit();
        const term = termRef.current;
        if (term) {
          console.log('[Terminal] 尺寸已调整:', term.cols, 'x', term.rows);
        }
      }, 50);
    }
  }, []);

  return { terminalRef, writeToTerminal, fitTerminal };
}
