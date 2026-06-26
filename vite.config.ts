// Vite 构建配置文件
// Vite 是一个现代前端构建工具，负责打包、热更新、开发服务器等

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 使用 React 插件，支持 JSX 语法
  plugins: [react()],

  // 开发服务器配置
  server: {
    port: 5173,

    // 代理配置：将 /api 和 /ws 请求转发到后端服务器
    // 这样前端请求 ws://localhost:5173/ws 时，
    // Vite 会自动转发到 ws://localhost:3001/ws
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true, // 必须开启 WebSocket 代理
      },
    },
  },

  // 生产构建配置
  build: {
    // 输出目录
    outDir: '../dist/client',
  },
});
