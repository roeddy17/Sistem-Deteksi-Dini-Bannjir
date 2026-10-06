/*
 * LAPISAN DATA
 * ------------------------------------------------------------------
 * Tampilan hanya berbicara dengan objek SB.data melalui fungsi:
 *   subscribe(fn), getCurrent(), getStatus(), getHistory(jam),
 *   getEvents(), stats(jam)
 * Sumber 'simulasi' menghasilkan data uji. Pada tahap integrasi,
 * sumber 'firebase' cukup menyediakan fungsi yang sama.
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
    let prev = S.of(history[0].v);
    for (const p of history) {
      const s = S.of(p.v);
      if (s !== prev) { ev.push({ id: 'e' + p.t, t: p.t, type: 'status', from: prev, to: s, level: p.v }); prev = s; }
    }
    return ev.reverse(); // terbaru di depan
  }

  function makeStats(getHistory, getCurrent) {
    return function stats(hours, fromTime) {
      const pts = fromTime != null ? getHistory(null, fromTime) : getHistory(hours);
      const cur = getCurrent();
      if (!pts.length) return null;
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
    if (ch) ch.onmessage = e => { if (e.data && e.data.type === 'target') { target = e.data.value; emit({}); } };

    const snapshot = () => ({ current, status, target });
    const emit = extra => subs.forEach(fn => fn(snapshot(), extra));

    function getHistory(hours, fromTime) {
      const from = fromTime != null ? fromTime : Date.now() - hours * HOUR;
      return history.filter(p => p.t >= from);
    }

    function tick() {
      const v = clamp(current.v + (target - current.v) * 0.35 + rnd(0.15));
      current = { t: Date.now(), v };
      history.push(current);
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
        emit({});
      }
    };
    api.stats = makeStats(getHistory, () => current);
    return api;
  };

  /* ---------- Sumber data: Firebase (tahap integrasi) ---------- */
  SB.createFirebaseSource = function () {
    throw new Error('Integrasi Firebase belum diaktifkan. Lihat README, bagian "Integrasi Firebase".');
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
