// 每次你修改了项目的任何代码，只需把这里的 v 改一下（比如 v5, v6）
const CACHE_NAME = 'eng-calc-v5'; 

const urlsToCache = [
  './',
  './index.html',
  './sample-cutting.html',
  './ep-cathode.html',
  './developer-settings.html',
  './history.html',
  './styles.css',
  './script.js',
  './ep-cathode.js',
  './history.js',
  './navigation.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 安装阶段：强制接管并下载新文件
self.addEventListener('install', event => {
  self.skipWaiting(); // 核心：强制新版本的 Service Worker 立即激活，不等待
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('已开启新缓存库: ', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
  );
});

// 激活阶段：无情清理所有旧版本的残余缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 如果发现名字不匹配（旧版本），直接删掉！
          if (cacheName !== CACHE_NAME) {
            console.log('已清理旧缓存: ', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 拦截请求：优先使用缓存，失败则走网络
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});