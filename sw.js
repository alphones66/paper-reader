const CACHE = 'paper-pages-v10';
const FILES = ['./', 'index.html', 'parse.js', 'pp-manifest.json', 'pp-icon2-180.png', 'pp-icon2-192.png', 'pp-icon2-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('paper-pages-') && key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// 先向伺服器確認有沒有新版，連不上網才用存起來的
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (/\/papers\//.test(new URL(event.request.url).pathname) || /\.(mp3|m4a|mp4)$/i.test(new URL(event.request.url).pathname)) return;   // 音檔交給瀏覽器（拖曳進度要用 Range 請求）
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).then(res => {
      if (res.ok && new URL(event.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('index.html')))
  );
});
