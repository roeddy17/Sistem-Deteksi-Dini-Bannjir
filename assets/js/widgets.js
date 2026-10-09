/* Komponen bersama: peta ilustrasi, notifikasi, dan panel simulator. */
(function () {
  const C = SB.config, I = SB.icon, esc = SB.ui.esc;
  const COL = { ok: '#16A34A', wr: '#F59E0B', dg: '#DC2626' };

  /* ---------- Peta ilustrasi (bukan peta asli; sensor belum dipasang) ---------- */
  SB.mapSVG = function (o) {
    const col = COL[SB.status.cls(o.status)];
    const cx = 380, cy = 330, label = `${C.sensorName} · ${SB.fmt.level(o.level)}`, lw = label.length * 7.6 + 34;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 620" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustrasi rencana lokasi sensor di Kali Acai" font-family="Inter, system-ui, sans-serif">
      <rect width="760" height="620" fill="#EAF0E6"/>
      <g class="zones"${o.zones ? '' : ' style="display:none"'}>
        <ellipse cx="380" cy="330" rx="470" ry="270" fill="#16A34A" fill-opacity=".16"/>
        <ellipse cx="380" cy="335" rx="350" ry="180" fill="#F59E0B" fill-opacity=".2"/>
        <ellipse cx="380" cy="340" rx="210" ry="95" fill="#DC2626" fill-opacity=".2"/>
      </g>
      <g fill="#DCE3D6">
        <rect x="40" y="40" width="110" height="70" rx="10"/><rect x="190" y="30" width="90" height="60" rx="10"/>
        <rect x="560" y="40" width="130" height="80" rx="10"/><rect x="40" y="500" width="120" height="80" rx="10"/>
        <rect x="260" y="520" width="100" height="70" rx="10"/><rect x="560" y="490" width="130" height="90" rx="10"/>
      </g>
      <path d="M0 160 L760 140" stroke="#fff" stroke-width="12"/>
      <path d="M430 0 L460 620" stroke="#fff" stroke-width="12"/>
      <path d="M-20 400 C120 340 240 450 380 330 C520 260 620 420 790 330" fill="none" stroke="#8DBDE8" stroke-width="40" stroke-linecap="round"/>
      <text x="210" y="448" font-size="16" font-weight="700" fill="#2F6FA8">Kali Acai</text>
      <circle cx="${cx}" cy="${cy}" r="42" fill="${col}" fill-opacity=".22"/>
      <circle cx="${cx}" cy="${cy}" r="18" fill="${col}" stroke="#fff" stroke-width="5"/>
      <g transform="translate(${cx - lw / 2},${cy - 78})">
        <rect width="${lw}" height="36" rx="12" fill="#fff" stroke="#E5EAF0"/>
        <circle cx="18" cy="18" r="5" fill="${col}"/>
        <text x="30" y="23" font-size="14" font-weight="700" fill="#0F172A">${esc(label)}</text>
      </g>
    </svg>`;
  };

  /* ---------- Notifikasi ---------- */
  SB.notify = (function () {
    let ctx = null;
    const unlock = () => {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

    const soundOn = () => localStorage.getItem('sb-sound') !== 'off';

    /* Bunyi meniru buzzer prototipe: SIAGA = bip pendek berulang, BAHAYA = sirene naik-turun */
    function beep(status) {
      if (!ctx || !soundOn()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); g.gain.value = 0.0001;
      if (status === 'SIAGA') {
        o.type = 'square'; o.frequency.value = 880;
        [0, 0.3, 0.6].forEach(s => { g.gain.setValueAtTime(0.12, t + s); g.gain.setValueAtTime(0.0001, t + s + 0.15); });
        o.start(t); o.stop(t + 0.8);
      } else {
        o.type = 'sawtooth';
        for (let i = 0; i < 3; i++) { o.frequency.setValueAtTime(600, t + i * 0.8); o.frequency.linearRampToValueAtTime(1200, t + i * 0.8 + 0.4); o.frequency.linearRampToValueAtTime(600, t + i * 0.8 + 0.8); }
        g.gain.setValueAtTime(0.1, t); g.gain.setValueAtTime(0.0001, t + 2.4);
        o.start(t); o.stop(t + 2.4);
      }
    }
    const vibrate = s => { if (navigator.vibrate) navigator.vibrate(s === 'BAHAYA' ? [400, 150, 400, 150, 400] : [200, 100, 200]); };

    function toast({ title, body, cls = 'pri', icon = 'bell', duration = 7000 }) {
      const host = document.getElementById('toasts'); if (!host) return;
      const el = document.createElement('div');
      el.className = 'toast toast-' + cls; el.setAttribute('role', 'status');
      el.innerHTML = `${I(icon, 18)}<div class="toast-b"><strong>${esc(title)}</strong><span>${esc(body)}</span></div><button type="button" class="toast-x" aria-label="Tutup">${I('x', 16)}</button>`;
      el.querySelector('.toast-x').onclick = () => el.remove();
      host.prepend(el);
      setTimeout(() => el.remove(), duration);
    }
    const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');
    async function request() {
      if (!('Notification' in window)) return 'unsupported';
      let r;
      try { r = await Notification.requestPermission(); } catch (e) { r = Notification.permission; }
      /* izin diberikan: daftarkan perangkat untuk push (tetap menerima peringatan saat browser ditutup) */
      if (r === 'granted' && SB.push && SB.push.available()) SB.push.enable().catch(err => console.warn('Push:', err.message));
      return r;
    }
    /* Notifikasi sistem hanya saat halaman tidak sedang dilihat. Versi Firebase Cloud Messaging
       (tetap muncul saat browser ditutup) dikerjakan pada tahap integrasi. */
    function system(title, body) {
      if (permission() !== 'granted' || document.visibilityState === 'visible') return;
      try { new Notification(title, { body, tag: 'siagabanjir', renotify: true }); } catch (e) { /* perlu service worker di sebagian HP */ }
    }

    function alertStatus(ev) {
      const up = SB.status.rank(ev.to) > SB.status.rank(ev.from);
      const title = up ? (ev.to === 'BAHAYA' ? 'Peringatan BAHAYA' : `Status ${ev.to}`) : `Status turun ke ${ev.to}`;
      const tail = ev.to === 'BAHAYA' ? ' Segera lakukan evakuasi ke titik kumpul terdekat.' : ev.to === 'SIAGA' ? ' Tetap waspada.' : '';
      const body = `Ketinggian air ${String(C.locationLabel).split(',')[0]} mencapai ${SB.fmt.level(ev.level)}.${tail}`;
      toast({ title, body, cls: SB.status.cls(ev.to), icon: SB.status.icon(ev.to) });
      system(title, body);
      if (up && ev.to !== 'AMAN') { beep(ev.to); vibrate(ev.to); }
    }
    function alertImbauan(item) {
      toast({ title: 'Imbauan BPBD', body: item.isi, cls: 'pri', icon: 'mega', duration: 9000 });
      system('Imbauan BPBD', item.isi);
    }
    return { toast, request, permission, alertStatus, alertImbauan, soundOn };
  })();

  /* ---------- Pemilih hari: ‹ [kalender · Hari ini] › ----------
     Daftar riwayat/notifikasi hanya menampilkan satu hari. Hari berikutnya
     tidak bisa melewati hari ini, hari sebelumnya dibatasi `days` hari ke belakang. */
  SB.dayPicker = function (el, o) {
    const DAY = 864e5, F = SB.fmt, pad = n => String(n).padStart(2, '0');
    const today = () => SB.startOfDay(Date.now());
    const min = () => today() - (o.days || 30) * DAY;
    const iso = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const clampDay = t => Math.max(min(), Math.min(today(), SB.startOfDay(t)));
    let day = clampDay(o.day != null ? o.day : Date.now());

    el.classList.add('daypick');
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Pilih hari');
    el.innerHTML = `<button type="button" class="dp-b" data-d="-1" aria-label="Hari sebelumnya">${I('back', 16)}</button>
      <button type="button" class="dp-cur" aria-label="Pilih tanggal">${I('cal', 16)}<span data-k="l"></span><input type="date" tabindex="-1" aria-hidden="true"></button>
      <button type="button" class="dp-b" data-d="1" aria-label="Hari berikutnya">${I('chev', 16)}</button>`;
    const input = el.querySelector('input'), cur = el.querySelector('.dp-cur');

    function paint() {
      const rel = F.dayLabel(day);
      el.querySelector('[data-k=l]').textContent = rel === 'Hari ini' || rel === 'Kemarin' ? `${rel}, ${F.date(day)}` : rel;
      input.min = iso(min()); input.max = iso(today()); input.value = iso(day);
      el.querySelector('[data-d="-1"]').disabled = day <= min();
      el.querySelector('[data-d="1"]').disabled = day >= today();
    }
    function set(t) {
      const n = clampDay(t); paint();
      if (n === day) return;
      day = n; paint(); o.onChange(day);
    }
    el.querySelectorAll('.dp-b').forEach(b => b.onclick = () => set(day + (+b.dataset.d) * DAY + DAY / 2));
    cur.onclick = () => { try { input.showPicker(); } catch (e) { input.style.pointerEvents = 'auto'; input.focus(); input.click(); } };
    input.onchange = () => {
      if (!input.value) return;
      const [y, m, d] = input.value.split('-').map(Number);
      set(new Date(y, m - 1, d).getTime());
    };
    paint();
    return { get: () => day, set, range: () => [day, day + DAY], isToday: () => day === today() };
  };

  /* ---------- Panel simulator (hanya pada mode simulasi) ---------- */
  SB.mountSimPanel = function () {
    if (SB.data.kind !== 'simulasi') return;
    const th = C.thresholds;
    const presets = [
      ['Aman', Math.round(th.siaga / 2)],
      ['Siaga', Math.round((th.siaga + th.bahaya) / 2)],
      ['Bahaya', Math.round(th.bahaya + (C.maxLevel - th.bahaya) / 2)]
    ];
    const fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'sim-fab no-print'; fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = I('sliders', 18) + '<span>Simulator</span>';
    const panel = document.createElement('section');
    panel.className = 'sim-panel no-print'; panel.hidden = true; panel.setAttribute('aria-label', 'Simulator data');
    panel.innerHTML = `
      <div class="row-sb"><h2 class="h2">Simulator data</h2><button type="button" class="icon-x" aria-label="Tutup simulator">${I('x', 18)}</button></div>
      <p class="sim-note">Data uji untuk mencoba antarmuka, bukan pembacaan sensor. Perubahan ikut berlaku di tab lain yang terbuka.</p>
      <label class="sim-l" for="sim-range">Target ketinggian air <b id="sim-val"></b></label>
      <input id="sim-range" type="range" min="0" max="${C.maxLevel}" step="1">
      <div class="sim-presets">${presets.map(([l, v]) => `<button type="button" class="btn sm" data-v="${v}">${l} · ${v} ${C.unit}</button>`).join('')}</div>`;
    document.body.append(fab, panel);
    const range = panel.querySelector('#sim-range'), val = panel.querySelector('#sim-val');
    const sync = () => { range.value = Math.round(SB.data.getTarget()); val.textContent = range.value + ' ' + C.unit; };
    const toggle = open => { panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); if (open) sync(); };
    fab.onclick = () => toggle(panel.hidden);
    panel.querySelector('.icon-x').onclick = () => toggle(false);
    range.oninput = () => { val.textContent = range.value + ' ' + C.unit; };
    range.onchange = () => SB.data.setTarget(+range.value);
    panel.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { SB.data.setTarget(+b.dataset.v); sync(); });
    SB.data.subscribe(() => { if (!panel.hidden && document.activeElement !== range) sync(); });
  };
})();
