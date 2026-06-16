// 灵集 Service Worker — 离线缓存 + 添加到桌面支持
const CACHE_NAME = 'lingji-v1';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/brand/logo-mark.png',
  '/brand/favicon.svg',
  '/brand/app-icon.svg',
];

// 安装：预缓存核心静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截：网络优先（页面内容），缓存回退
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 跳过非 GET 请求和 API 请求
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // 静态资源：缓存优先
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML/页面请求：网络优先，离线时回退缓存
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
