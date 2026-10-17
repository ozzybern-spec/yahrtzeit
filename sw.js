// Offline support: own files network-first, CDN assets cache-first.
const CACHE = 'yizkor-v9';
const SHELL = [
  './', 'index.html', 'src/styles.css', 'src/app.js', 'src/i18n.js', 'src/yahrzeit.js',
  'icon.svg', 'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Our own files and data: network-first, so updates show up right away.
  // 'no-cache' revalidates with the server instead of using the browser's
  // HTTP cache (GitHub Pages sends max-age=600).
  if (url.origin === location.origin) {
    e.respondWith(fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); return res; })
      .catch(() => caches.match(request)));
    return;
  }

  // CDN library and fonts: versioned, so cache-first.
  if (/jsdelivr|gstatic|googleapis/.test(url.host)) {
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    })));
  }
});
