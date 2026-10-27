// Service Worker：统一网络优先 + 缓存回退
// 教训（两次事故）：源码资源无文件名哈希，cache-first 会在忘记递增版本号时持续发放旧 JS，
// 造成“新 index.html + 旧 main.js”混跑（表现为页面点击无反应）。网络优先保证在线永远最新，
// 缓存仅作离线回退；发布时仍建议递增 CACHE 以清理历史缓存。
const CACHE = 'xq-v4';   // v4：棋盘列号边带 + 复盘面板布局改动，清一次历史缓存
const PRECACHE = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
                  './data/courses/courses.json', './data/puzzles/puzzles.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      // 接管后让已打开的页面立即重新加载：旧页面里可能还是无自动刷新逻辑的旧脚本
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(wins => Promise.all(wins.map(w => w.navigate(w.url).catch(() => {}))))
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isNav = e.request.mode === 'navigate' || e.request.destination === 'document' || url.pathname.endsWith('.html');
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(hit =>
        hit ||
        (isNav ? caches.match('./index.html') : Response.error())
      )
    )
  );
});
