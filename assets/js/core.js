/* Fungsi inti: logika status, format angka/waktu, ikon, dan router. */
(function () {
  const C = SB.config;

  /* ---------- Logika status (sesuai config.thresholds) ---------- */
  SB.status = {
    order: ['AMAN', 'SIAGA', 'BAHAYA'],
    /* nilai dibulatkan ke 1 cm (resolusi sensor) agar status sama dengan angka yang tampil */
    of(v) {
      const t = C.thresholds; v = Math.round(v);
      if (v >= t.bahaya) return 'BAHAYA';
      if (v > t.siaga) return 'SIAGA';
      return 'AMAN';
    },
    rank(s) { return this.order.indexOf(s); },
    cls(s) { return { AMAN: 'ok', SIAGA: 'wr', BAHAYA: 'dg' }[s]; },
    icon(s) { return s === 'AMAN' ? 'check' : 'alert'; },
    desc(s) {
      return {
        AMAN: 'Ketinggian air normal. Tetap pantau informasi secara berkala.',
        SIAGA: 'Ketinggian air melewati batas siaga. Tetap waspada dan pantau informasi berikutnya.',
        BAHAYA: 'Ketinggian air mencapai batas bahaya. Segera amankan diri dan menuju titik kumpul terdekat.'
      }[s];
    },
    descBpbd(s) {
      return {
        AMAN: 'Ketinggian air berada di bawah batas siaga.',
        SIAGA: 'Ketinggian air berada di atas batas siaga. Pertimbangkan mengirim imbauan kepada warga.',
        BAHAYA: 'Ketinggian air mencapai batas bahaya. Segera kirim imbauan evakuasi kepada warga.'
      }[s];
    }
  };

  /* ---------- Format ---------- */
  const pad = n => String(n).padStart(2, '0');
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  SB.fmt = {
    level: v => Math.round(v) + ' ' + C.unit,
    delta(v) {
      const r = Math.round(v);
      return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + ' ' + C.unit;
    },
    time: t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    date: t => { const d = new Date(t); return d.getDate() + ' ' + BULAN[d.getMonth()]; },
    dateNum: t => { const d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); },
    dateFull: t => { const d = new Date(t); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); },
    ago(t) {
      const s = Math.round((Date.now() - t) / 1000);
      if (s < 10) return 'baru saja';
      if (s < 60) return s + ' detik lalu';
      const m = Math.round(s / 60); if (m < 60) return m + ' menit lalu';
      const h = Math.round(m / 60); if (h < 24) return h + ' jam lalu';
      return Math.round(h / 24) + ' hari lalu';
    },
    dayLabel(t) {
      const today = startOfDay(Date.now()), day = startOfDay(t);
      if (day === today) return 'Hari ini';
      if (day === today - 864e5) return 'Kemarin';
      return SB.fmt.dateFull(t);
    },
    duration(ms) {
      const m = Math.round(ms / 60000), h = Math.floor(m / 60), r = m % 60;
      return h ? `${h} j ${r} m` : `${r} m`;
    }
  };
  SB.startOfDay = startOfDay;

  /* Muat script sekali saja (dipakai bersama oleh data.js dan auth.js untuk SDK Firebase) */
  const loaded = {};
  SB.loadScript = src => loaded[src] || (loaded[src] = new Promise((ok, no) => {
    const el = document.createElement('script');
    el.src = src; el.onload = ok; el.onerror = () => { delete loaded[src]; no(new Error('Gagal memuat ' + src)); };
    document.head.appendChild(el);
  }));

  /* ---------- Ikon (gaya garis, sama dengan design system) ---------- */
  SB.ICONS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    tick: '<polyline points="20 6 9 17 4 12"/>',
    drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    trendDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    mega: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    wifi: '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>',
    wifioff: '<line x1="2" x2="22" y1="2" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 13a10 10 0 0 1 5.24-2.76"/><line x1="12" x2="12.01" y1="20" y2="20"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    dash: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
    vol: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    checks: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
    avg: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    cup: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>',
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    worship: '<path d="M12 2v4"/><path d="M10 4h4"/><path d="M6 22V11l6-4 6 4v11"/><path d="M10 22v-5h4v5"/><path d="M3 22h18"/>',
    locate: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>'
  };
  SB.icon = (n, s = 20) =>
    `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SB.ICONS[n] || ''}</svg>`;

  /* ---------- Helper tampilan ---------- */
  SB.ui = {
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pill: s => `<span class="pill pill-${SB.status.cls(s)}">${s}</span>`,
    tag: (text, cls) => `<span class="pill pill-${cls}">${SB.ui.esc(text)}</span>`,
    $: (sel, root) => (root || document).querySelector(sel),
    $$: (sel, root) => Array.from((root || document).querySelectorAll(sel)),

    /* Router berbasis hash: #nama?param=nilai */
    router(names, def, onRoute) {
      function go() {
        const raw = location.hash.slice(1);
        const [name, qs] = raw.split('?');
        onRoute(names.includes(name) ? name : def, new URLSearchParams(qs || ''));
      }
      window.addEventListener('hashchange', go);
      go();
    }
  };

  /* Isi ikon pada elemen HTML statis: <span data-icon="home" data-size="22"></span> */
  SB.ui.$$('[data-icon]').forEach(el => { el.innerHTML = SB.icon(el.dataset.icon, +el.dataset.size || 20); });
})();
