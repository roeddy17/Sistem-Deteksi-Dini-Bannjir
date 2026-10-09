/* Service worker FCM: menampilkan push saat halaman/browser tidak sedang dibuka.
   Konfigurasi dikirim lewat query string saat didaftarkan oleh assets/js/push.js. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const q = new URL(self.location.href).searchParams;
firebase.initializeApp({ apiKey: q.get('apiKey'), projectId: q.get('projectId'), messagingSenderId: q.get('messagingSenderId'), appId: q.get('appId') });
const messaging = firebase.messaging();

/* Pesan dikirim sebagai data-only supaya tampilan notifikasi dikendalikan di sini. */
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  const bahaya = d.status === 'BAHAYA';
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  return self.registration.showNotification(d.title || 'SiagaBanjir', {
    body: d.body || '',
    icon, badge: icon,
    tag: 'siagabanjir', renotify: true,           // tag sama dengan notifikasi lokal agar tidak ganda
    requireInteraction: bahaya,
    vibrate: bahaya ? [600, 200, 600, 200, 600] : [300, 150, 300],
    data: { link: d.link || '' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.link) || new URL('warga.html#beranda', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
