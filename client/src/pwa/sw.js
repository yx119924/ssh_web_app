// ============================================================
// Service Worker
// 这是 PWA（渐进式 Web 应用）的核心
//
// Service Worker 是一个在后台运行的脚本，
// 它的主要功能：
//   1. 缓存应用的静态文件（HTML/CSS/JS），加速加载
//   2. 拦截网络请求，实现离线访问
//   3. 让 PWA 可以添加到手机主屏幕并以"全屏"模式打开
//
// 注意：这个文件必须是纯 JavaScript（不是 TypeScript），
// 因为 Service Worker 运行在浏览器底层，不支持 TS
// ============================================================

// 缓存的名称（版本号用于更新缓存）
const CACHE_NAME = 'ssh-terminal-v1';

// 需要缓存的文件列表
// 这些文件会在首次访问时被缓存，之后可以从缓存中加载
const CACHE_FILES = [
  '/',
  '/index.html',
];

// ============================================================
// install 事件：Service Worker 安装时触发
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] 正在安装...');

  // skipWaiting() 让新的 Service Worker 立即生效
  self.skipWaiting();

  // 缓存所有需要预加载的文件
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 正在缓存文件:', CACHE_FILES);
      return cache.addAll(CACHE_FILES);
    })
  );
});

// ============================================================
// activate 事件：Service Worker 激活时触发
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] 已激活');

  // 清理旧版本的缓存
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});

// ============================================================
// fetch 事件：拦截所有网络请求
// ============================================================
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求（POST、WebSocket 等不缓存）
  if (event.request.method !== 'GET') return;

  // 不缓存 WebSocket 连接
  if (event.request.url.includes('/ws')) return;

  // 策略：优先使用网络，网络不可用时使用缓存
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 网络请求成功，更新缓存
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // 网络请求失败，尝试使用缓存
        return caches.match(event.request);
      })
  );
});
