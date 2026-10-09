/*
 * Notifikasi push (Firebase Cloud Messaging) untuk web warga.
 * Peringatan SIAGA/BAHAYA dan imbauan BPBD tetap sampai ke HP walau browser/tab ditutup.
 * Alurnya: izin notifikasi -> service worker (firebase-messaging-sw.js) -> token FCM disimpan di
 * /fcmTokens/<token> -> Cloud Function mendaftarkan token ke topik "warga" dan mengirim push
 * saat status berubah atau imbauan dikirim (lihat folder functions/).
 * Hanya aktif pada mode Firebase dan bila messagingSenderId, appId, dan vapidKey di config.js terisi;
 * selain itu halaman memakai notifikasi lokal biasa (hanya saat halaman terbuka).
 */
(function () {
  const C = SB.config, FB = C.firebase || {};
  const KEY = 'sb-push-token';
  const configured = () => !!(FB.messagingSenderId && FB.appId && FB.vapidKey);
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const available = () => C.dataSource === 'firebase' && configured() && supported() && !!SB.data && SB.data.kind === 'firebase' && !!SB.data.app;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  /* iPhone/iPad: push web hanya bekerja setelah situs ditambahkan ke Layar Utama */
  const needsInstall = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone();

  let pending = null;
  function enable() {
    if (pending) return pending;
    pending = (async () => {
      if (!available()) return needsInstall() ? 'install' : 'unsupported';
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') return perm;
      await SB.loadScript(FB.sdk + 'firebase-messaging-compat.js');
      const app = await SB.data.app;
      const q = new URLSearchParams({ apiKey: FB.apiKey || '', projectId: FB.projectId || '', messagingSenderId: FB.messagingSenderId, appId: FB.appId });
      const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js?' + q.toString());
      await navigator.serviceWorker.ready;
      const token = await firebase.messaging(app).getToken({ vapidKey: FB.vapidKey, serviceWorkerRegistration: reg });
      if (!token) throw new Error('Token FCM kosong.');
      let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { /* abaikan */ }
      if (saved !== token) {
        try { await app.database().ref('fcmTokens/' + token).set({ t: firebase.database.ServerValue.TIMESTAMP }); } catch (e) { /* token sudah terdaftar */ }
        try { localStorage.setItem(KEY, token); } catch (e) { /* abaikan */ }
      }
      return 'granted';
    })().finally(() => { pending = null; });
    return pending;
  }

  SB.push = {
    available, needsInstall, enable,
    active: () => { try { return available() && Notification.permission === 'granted' && !!localStorage.getItem(KEY); } catch (e) { return false; } }
  };

  /* izin sudah diberikan sebelumnya: segarkan token diam-diam (token dapat berganti) */
  if (C.dataSource === 'firebase' && 'Notification' in window && Notification.permission === 'granted') {
    const wait = () => (SB.data && SB.data.app ? SB.data.app : Promise.reject());
    Promise.resolve().then(wait).then(() => available() && enable()).catch(err => err && console.warn('Push:', err.message));
  }
})();
