// 갓생 앱 서비스 워커: 푸시 알림 받기
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try {
    const j = e.data ? e.data.json() : {};
    d = j.data || j.notification || j;
  } catch (_) {
    d = { title: '갓생', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(self.registration.showNotification(d.title || '갓생', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { link: d.link || '' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '';
  const url = new URL(link || './', self.registration.scope).href;
  const p = new URL(url).searchParams.get('p');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) { if (p) c.postMessage({ open: p }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
