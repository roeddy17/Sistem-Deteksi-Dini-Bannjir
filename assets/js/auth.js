/*
 * Gerbang masuk Panel BPBD. Halaman warga tidak memerlukan masuk.
 *  - Mode 'firebase': Firebase Authentication (email + kata sandi). Akun dibuat manual
 *    di konsol Firebase (tanpa pendaftaran). Aturan database (firebase-rules.json)
 *    membatasi penulisan imbauan hanya untuk pengguna yang sudah masuk.
 *  - Mode 'simulasi': akun demo lokal untuk pengujian antarmuka (bukan pengaman).
 * bpbd.js baru dimuat setelah masuk berhasil.
 */
(function () {
  const C = SB.config, ui = SB.ui, I = SB.icon;
  const A = C.auth || {};
  const demo = A.demo || { email: 'petugas@bpbd.demo', password: 'demo1234' };
  const FB = C.firebase || {};
  const KEY = 'sb-bpbd-sesi';
  SB.ICONS.lock = '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
  SB.ICONS.logout = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>';
  SB.ICONS.eyeoff = '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7"/><path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><line x1="2" x2="22" y1="2" y2="22"/>';
  ui.$$('[data-icon]').forEach(el => { el.innerHTML = I(el.dataset.icon, +el.dataset.size || 20); });

  const live = C.dataSource === 'firebase' && A.enabled !== false;
  let fbAuth = null;
  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Gagal memuat ' + src)); document.head.appendChild(s); });

  function initFirebase() {
    if (fbAuth) return Promise.resolve(fbAuth);
    return SB.loadScript(FB.sdk + 'firebase-app-compat.js').then(() => SB.loadScript(FB.sdk + 'firebase-auth-compat.js')).then(() => {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp({ apiKey: FB.apiKey || undefined, databaseURL: FB.databaseURL, authDomain: FB.authDomain || undefined });
      fbAuth = app.auth(); return fbAuth;
    });
  }
  const box = () => document.getElementById('login');
  const show = on => { document.body.classList.toggle('locked', on); box().hidden = !on; };
  let started = false;
  function start(email) {
    SB.auth.email = email;
    show(false);
    const nm = ui.$('#user-name'), av = ui.$('#user-av'), ds = ui.$('#user-desc');
    if (nm) nm.textContent = email.split('@')[0];
    if (av) av.textContent = email.slice(0, 2).toUpperCase();
    if (ds) ds.textContent = 'BPBD Provinsi Papua';
    if (started) return; started = true;
    load('assets/js/bpbd.js?v=15');
  }
  function error(msg) { const e = ui.$('#lg-err'); e.textContent = msg; e.hidden = !msg; }
  function busy(on) { const b = ui.$('#lg-btn'); b.disabled = on; b.querySelector('span:last-child').textContent = on ? 'Memeriksa…' : 'Masuk'; }

  SB.auth = {
    email: null,
    signOut() {
      if (live && fbAuth) fbAuth.signOut().finally(() => location.reload());
      else { try { sessionStorage.removeItem(KEY); } catch (e) { /* abaikan */ } location.reload(); }
    }
  };

  function boot() {
    const f = ui.$('#lg-form'), pw = ui.$('#lg-pw');
    ui.$('#lg-eye').onclick = () => { const h = pw.type === 'password'; pw.type = h ? 'text' : 'password'; ui.$('#lg-eye').innerHTML = I(h ? 'eyeoff' : 'eye', 18); ui.$('#lg-eye').setAttribute('aria-label', h ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'); };
    const hint = ui.$('#lg-demo');
    if (!live) { hint.hidden = false; ui.$('#lg-demo-em').textContent = demo.email; ui.$('#lg-demo-pw').textContent = demo.password; ui.$('#lg-fill').onclick = () => { ui.$('#lg-em').value = demo.email; pw.value = demo.password; pw.focus(); }; }
    f.onsubmit = e => {
      e.preventDefault(); error('');
      const em = ui.$('#lg-em').value.trim(), p = pw.value;
      if (!em || !p) { error('Isi email dan kata sandi.'); return; }
      busy(true);
      if (live) {
        initFirebase().then(a => a.signInWithEmailAndPassword(em, p)).then(() => busy(false)).catch(err => {
          busy(false);
          const c = err && err.code || '';
          error(/network/.test(c) ? 'Tidak dapat terhubung. Periksa koneksi internet.' : /too-many/.test(c) ? 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' : /invalid|wrong|user-not-found/.test(c) ? 'Email atau kata sandi salah.' : 'Gagal masuk. Coba lagi.');
        });
      } else {
        setTimeout(() => {
          busy(false);
          if (em.toLowerCase() === demo.email && p === demo.password) { try { sessionStorage.setItem(KEY, em); } catch (x) { /* abaikan */ } start(em); }
          else error('Email atau kata sandi salah.');
        }, 350);
      }
    };
    ui.$('#btn-out').onclick = () => SB.auth.signOut();
    if (A.enabled === false) { start('petugas@bpbd'); return; }
    if (live) {
      show(true);
      initFirebase().then(a => a.onAuthStateChanged(u => { if (u) start(u.email || 'petugas'); else if (started) location.reload(); else show(true); })).catch(() => error('Layanan masuk tidak dapat dimuat.'));
    } else {
      let s = null; try { s = sessionStorage.getItem(KEY); } catch (e) { /* abaikan */ }
      if (s) start(s); else { show(true); ui.$('#lg-em').focus(); }
    }
  }
  boot();
})();
