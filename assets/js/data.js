/*
 * LAPISAN DATA
 * ------------------------------------------------------------------
 * Tampilan hanya berbicara dengan objek SB.data melalui fungsi:
 *   subscribe(fn), getCurrent(), getStatus(), getHistory(jam),
 *   getEvents(), stats(jam), ready (Promise), getLatency(), isConnected()
 * Sumber 'simulasi' menghasilkan data uji. Sumber 'firebase' mendengarkan
 * Firebase Realtime Database secara push (tanpa polling): setiap kali alat
 * menulis /sensor/latest, semua tampilan yang terbuka diperbarui seketika.
 */
(function () {
  const C = SB.config, S = SB.status;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const clamp = v => Math.max(0, Math.min(C.maxLevel, v));
  const rnd = a => (Math.random() - 0.5) * 2 * a;

  /* Riwayat 30 hari (per 30 menit) agar grafik 7/30 hari punya isi. */
  function seedHistory(now) {
    const bumps = [
      { t: now - 20 * HOUR, peak: 21, w: 1.6 * HOUR },
      { t: now - 3.2 * DAY, peak: 12, w: 2.5 * HOUR },
      { t: now - 9 * DAY, peak: 17, w: 3 * HOUR },
      { t: now - 16 * DAY, peak: 23, w: 2.5 * HOUR },
      { t: now - 24 * DAY, peak: 13, w: 2.5 * HOUR }
    ];
    const valueAt = t => {
      let v = 5 + 1.2 * Math.sin((2 * Math.PI * t) / DAY);
      for (const b of bumps) v += (b.peak - 5) * Math.exp(-Math.pow((t - b.t) / b.w, 2));
      const rise = Math.max(0, 1 - (now - t) / (14 * HOUR));        // kenaikan hari ini
      v += 10 * Math.pow(rise, 2.2);
      return clamp(v + rnd(0.25));
    };
    const pts = [];
    for (let t = now - 30 * DAY; t < now - 5 * MIN; t += 30 * MIN) pts.push({ t, v: valueAt(t) });
    return pts;
  }

  function deriveEvents(history) {
    const ev = [];
    if (!history.length) return ev;
    const st = p => p.s || S.of(p.v);              // status dari alat bila ada
    let prev = st(history[0]);
    for (const p of history) {
      const s = st(p);
      if (s !== prev) { ev.push({ id: 'e' + p.t, t: p.t, type: 'status', from: prev, to: s, level: p.v }); prev = s; }
    }
    return ev.reverse(); // terbaru di depan
  }

  function makeStats(getHistory, getCurrent) {
    return function stats(hours, fromTime) {
      const pts = fromTime != null ? getHistory(null, fromTime) : getHistory(hours);
      const cur = getCurrent();
      if (!pts.length) pts.push(cur);                 // belum ada riwayat: pakai nilai terkini
      let max = pts[0], min = pts[0], sum = 0, above = 0;
      const dist = { AMAN: 0, SIAGA: 0, BAHAYA: 0 };
      pts.forEach((p, i) => {
        if (p.v > max.v) max = p; if (p.v < min.v) min = p; sum += p.v;
        const next = pts[i + 1]; const dt = next ? next.t - p.t : 0;
        dist[S.of(p.v)] += dt; if (p.v > C.thresholds.siaga) above += dt;
      });
      const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
      const hourAgo = getHistory(1.05)[0] || cur;
      return {
        max, min, avg: sum / pts.length, count: pts.length, aboveSiaga: above,
        dist: { AMAN: dist.AMAN / total, SIAGA: dist.SIAGA / total, BAHAYA: dist.BAHAYA / total },
        change1h: cur.v - hourAgo.v, ref1h: hourAgo.v
      };
    };
  }

  /* ---------- Sumber data: simulasi ---------- */
  SB.createSimulator = function () {
    const now = Date.now();
    const history = seedHistory(now);
    let current = { t: now, v: clamp(C.simulator.initialLevel + rnd(0.3)) };
    history.push(current);
    const events = deriveEvents(history);
    let status = S.of(current.v);

    const stored = parseFloat(localStorage.getItem('sb-sim-target'));
    let target = isFinite(stored) ? stored : C.simulator.initialLevel;

    const subs = new Set();
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel('siagabanjir-sim') : null;
    if (ch) ch.onmessage = e => { if (e.data && e.data.type === 'target') { target = e.data.value; tick(); } };

    const snapshot = () => ({ current, status, target });
    const emit = extra => subs.forEach(fn => fn(snapshot(), extra));

    /* riwayat tersimpan + nilai terkini (agar grafik selalu sampai detik ini) */
    function getHistory(hours, fromTime) {
      const from = fromTime != null ? fromTime : Date.now() - hours * HOUR;
      const out = history.filter(p => p.t >= from);
      if (current.t >= from && (!out.length || out[out.length - 1].t < current.t)) out.push(current);
      return out;
    }

    const resp = C.simulator.response != null ? C.simulator.response : 1;
    function tick() {
      const v = clamp(current.v + (target - current.v) * resp + rnd(0.15));
      current = { t: Date.now(), v };
      const last = history[history.length - 1];
      if (!last || current.t - last.t >= (C.simulator.logEveryMs || 30000) || S.of(v) !== status) history.push(current);
      while (history.length && history[0].t < Date.now() - 31 * DAY) history.shift();
      const prev = status; status = S.of(v);
      let changed = null;
      if (prev !== status) {
        changed = { id: 'e' + current.t, t: current.t, type: 'status', from: prev, to: status, level: v };
        events.unshift(changed);
      }
      emit({ changed });
    }
    setInterval(tick, C.simulator.intervalMs);

    const api = {
      kind: 'simulasi',
      ready: Promise.resolve(),
      getLatency: () => null,
      isConnected: () => true,
      subscribe(fn) { subs.add(fn); fn(snapshot(), {}); return () => subs.delete(fn); },
      getCurrent: () => current,
      getStatus: () => status,
      getHistory,
      getEvents: () => events,
      getTarget: () => target,
      setTarget(v) {
        target = clamp(v);
        localStorage.setItem('sb-sim-target', String(target));
        if (ch) ch.postMessage({ type: 'target', value: target });
        tick();                                  // langsung diterapkan, tanpa menunggu jadwal berikutnya
      }
    };
    api.stats = makeStats(getHistory, () => current);
    return api;
  };

  /* ---------- Sumber data: Firebase (tahap integrasi) ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.onload = res; el.onerror = () => rej(new Error('Gagal memuat ' + src));
      document.head.appendChild(el);
    });
  }

  /*
   * Alat (ESP8266) menulis:
   *   /sensor/latest        { level: <cm>, ts: <waktu> }   ← setiap pembacaan (mis. tiap 1 detik)
   *   /sensor/history/<id>  { level: <cm>, ts: <waktu> }   ← lebih jarang (mis. tiap 30–60 detik)
   * ts sebaiknya memakai waktu server Firebase ({".sv": "timestamp"}) agar jeda dapat diukur.
   * Browser berlangganan /sensor/latest dengan on('value'): Firebase mengirim (push) data baru
   * lewat koneksi WebSocket yang tetap terbuka, jadi tidak ada jeda polling.
   */
  SB.createFirebaseSource = function () {
    const FB = C.firebase || {};
    if (!FB.databaseURL) throw new Error('Firebase databaseURL belum diisi di config.js.');
    const base = '/' + String(FB.path || '/sensor').replace(/^\/+|\/+$/g, '');
    const subs = new Set();
    let history = [], events = [], current = null, status = 'AMAN', connected = false, latency = null, offset = 0, lastLog = 0;
    try { const c = JSON.parse(localStorage.getItem('sb-last')); if (c && isFinite(c.v)) current = c; } catch (e) { /* abaikan */ }
    if (!current) current = { t: Date.now(), v: 0, placeholder: true };
    status = current.s || S.of(current.v);

    const snapshot = () => ({ current, status, connected, latency });
    const emit = extra => subs.forEach(fn => fn(snapshot(), extra));
    const serverNow = () => Date.now() + offset;

    function getHistory(hours, fromTime) {
      const from = fromTime != null ? fromTime : serverNow() - hours * HOUR;
      const out = history.filter(p => p.t >= from);
      if (!current.placeholder && current.t >= from && (!out.length || out[out.length - 1].t < current.t)) out.push(current);
      return out;
    }
    const valid = d => d && isFinite(+d.level);
    /* status dari alat (memakai histeresis yang sama dengan LCD/buzzer/Telegram); bila tidak ada, dihitung dari level */
    const devStatus = d => (S.order.includes(String(d.status).toUpperCase()) ? String(d.status).toUpperCase() : null);

    let resolveReady;
    const ready = new Promise(r => { resolveReady = r; });
    setTimeout(() => resolveReady(), FB.waitMs || 8000);   // jangan menahan tampilan terlalu lama

    function onLatest(d) {
      if (!valid(d)) return;
      const t = isFinite(+d.ts) && +d.ts > 0 ? +d.ts : serverNow();
      latency = Math.max(0, serverNow() - t);
      if (!current.placeholder && t === current.t && +d.level === current.v) return;
      current = { t, v: +d.level, s: devStatus(d) || undefined };
      try { localStorage.setItem('sb-last', JSON.stringify(current)); } catch (e) { /* abaikan */ }
      const prev = status; status = current.s || S.of(current.v);
      let changed = null;
      if (prev !== status && lastLog) {   // lastLog > 0: riwayat sudah dimuat, perubahan ini nyata
        changed = { id: 'e' + t, t, type: 'status', from: prev, to: status, level: current.v };
        events.unshift(changed);
      }
      resolveReady();
      emit({ changed });
    }

    loadScript(FB.sdk + 'firebase-app-compat.js')
      .then(() => loadScript(FB.sdk + 'firebase-database-compat.js'))
      .then(() => {
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp({ apiKey: FB.apiKey || undefined, databaseURL: FB.databaseURL });
        const db = app.database();
        db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
        db.ref('.info/connected').on('value', s => { connected = !!s.val(); emit({}); });
        db.ref(base + '/history').orderByChild('ts').startAt(Date.now() - 31 * DAY).limitToLast(20000).once('value').then(snap => {
          const pts = [];
          snap.forEach(c => { const d = c.val(); if (valid(d) && isFinite(+d.ts)) pts.push({ t: +d.ts, v: +d.level, s: devStatus(d) || undefined }); });
          pts.sort((a, b) => a.t - b.t);
          history = pts; events = deriveEvents(history); lastLog = Date.now();
          emit({});
        }).catch(err => console.warn('Riwayat Firebase:', err.message));
        db.ref(base + '/latest').on('value', s => onLatest(s.val()), err => console.warn('Data terkini Firebase:', err.message));
      })
      .catch(err => { console.warn(err.message); resolveReady(); emit({ error: err.message }); });

    const api = {
      kind: 'firebase', ready,
      subscribe(fn) { subs.add(fn); fn(snapshot(), {}); return () => subs.delete(fn); },
      getCurrent: () => current,
      getStatus: () => status,
      getHistory,
      getEvents: () => events,
      getLatency: () => latency,
      isConnected: () => connected
    };
    api.stats = makeStats(getHistory, () => current);
    return api;
  };

  try {
    SB.data = C.dataSource === 'firebase' ? SB.createFirebaseSource() : SB.createSimulator();
  } catch (err) {
    console.warn(err.message, '— memakai mode simulasi.');
    SB.data = SB.createSimulator();
  }

  /* ---------- Imbauan BPBD (tersimpan di perangkat, tersinkron antar-tab) ---------- */
  SB.imbauan = (function () {
    const KEY = 'sb-imbauan';
    const subs = new Set();
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel('siagabanjir-imbauan') : null;

    function seed() {
      const n = Date.now();
      return [
        { id: 'i1', t: n - 18 * MIN, judul: 'Amankan dokumen penting', isi: 'Amankan dokumen penting (ijazah, sertifikat) ke tempat yang lebih tinggi.', target: 'SIAGA', push: true, beranda: true, status: 'TERKIRIM' },
        { id: 'i2', t: n - 19.6 * HOUR, judul: 'Menuju titik kumpul terdekat', isi: 'Air mencapai batas bahaya. Segera menuju titik kumpul terdekat dan ikuti arahan petugas.', target: 'BAHAYA', push: true, beranda: true, status: 'TERKIRIM' },
        { id: 'i3', t: n - 20.6 * HOUR, judul: 'Siapkan tas siaga', isi: 'Siapkan tas siaga berisi dokumen, obat-obatan, senter, dan pakaian ganti.', target: 'SIAGA', push: true, beranda: true, status: 'TERKIRIM' }
      ];
    }
    function load() {
      try { const s = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(s)) return s; } catch (e) { /* abaikan */ }
      const s = seed(); save(s); return s;
    }
    function save(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* penyimpanan penuh */ } }

    let list = load();
    const notify = item => subs.forEach(fn => fn(item));
    if (ch) ch.onmessage = e => { if (e.data && e.data.type === 'imbauan') { list = load(); notify(e.data.item); } };

    return {
      all: () => list.slice().sort((a, b) => b.t - a.t),
      sent: () => list.filter(i => i.status === 'TERKIRIM').sort((a, b) => b.t - a.t),
      latest() { return this.sent()[0] || null; },
      add(item) {
        const full = Object.assign({ id: 'i' + Date.now(), t: Date.now() }, item);
        list.push(full); save(list);
        if (full.status === 'TERKIRIM' && ch) ch.postMessage({ type: 'imbauan', item: full });
        notify(full);
        return full;
      },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
    };
  })();
})();
