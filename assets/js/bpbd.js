/* Panel BPBD (web desktop): Dashboard, Grafik, Peta, Laporan, Kirim Imbauan, Notifikasi. */
(function () {
  const C = SB.config, D = SB.data, F = SB.fmt, S = SB.status, I = SB.icon, ui = SB.ui, esc = ui.esc;
  const th = C.thresholds, HOUR = 3600e3;
  const main = document.getElementById('view');
  const sim = D.kind === 'simulasi';
  let active = null;

  /* ---------- Bagian bersama ---------- */
  const topbar = (title, sub) => `
    <header class="topbar">
      <div><h1>${title}</h1><p>${sub}</p></div>
      <div class="tb-r">
        <span class="chip-live ${sim ? 'is-sim' : ''}"><i></i>${sim ? 'Mode simulasi' : 'Data real-time'}</span>
        <span class="chip-time">${I('clock', 15)}<span id="tb-time"></span></span>
        <a class="icon-btn sq" href="#notifikasi" aria-label="Notifikasi">${I('bell', 18)}</a>
      </div>
    </header>`;
  const statCard = (ic, cls, label, id, subId) => `
    <article class="card stat"><div class="stat-h"><span class="badge b-${cls}">${I(ic, 16)}</span>${label}</div>
      <p class="v" id="${id}"></p><p class="stat-s" id="${subId}"></p></article>`;
  const seg = (ranges, cur, attr = 'h') => `<div class="seg" role="group" aria-label="Rentang waktu">${ranges.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
  const RANGES = [[24, '24 Jam'], [168, '7 Hari'], [720, '30 Hari']];
  const snapNow = () => ({ current: D.getCurrent(), status: D.getStatus() });

  /* Kumpulan notifikasi: perubahan status + imbauan */
  function feed() {
    const ev = D.getEvents().slice(0, 60).map(e => {
      const up = S.rank(e.to) > S.rank(e.from);
      return { t: e.t, kind: e.to, cls: S.cls(e.to), icon: S.icon(e.to), pill: ui.pill(e.to),
        title: e.to === 'AMAN' ? 'Status kembali AMAN' : (up ? 'Status naik ke ' : 'Status turun ke ') + e.to,
        desc: `Ketinggian air ${F.level(e.level)}${e.to === 'BAHAYA' ? ' · bunyi dan getar dikirim ke warga' : ''}` };
    });
    const im = SB.imbauan.sent().map(i => ({ t: i.t, kind: 'IMBAUAN', cls: 'pri', icon: 'mega', pill: ui.tag('IMBAUAN', 'pri'), title: 'Imbauan terkirim', desc: `“${i.judul}” · ke semua pengguna` }));
    return ev.concat(im).sort((a, b) => b.t - a.t);
  }
  /* kunjungan pertama: notifikasi lebih lama dari 6 jam dianggap sudah dibaca */
  if (!localStorage.getItem('sb-bpbd-read')) localStorage.setItem('sb-bpbd-read', String(Date.now() - 6 * HOUR));
  const lastRead = () => +localStorage.getItem('sb-bpbd-read') || 0;
  function paintBadge() {
    const n = feed().filter(i => i.t > lastRead()).length, b = ui.$('#nav-count');
    b.textContent = n > 99 ? '99+' : n; b.hidden = !n;
  }

  /* ================= DASHBOARD ================= */
  const dashboard = {
    hours: 24,
    render() {
      main.innerHTML = `${topbar('Dashboard monitoring', `${esc(C.sensorName)} · lokasi uji ${esc(C.locationLabel)}`)}
        <section class="hero hero-wide" id="hero" aria-live="polite">
          <span class="hero-ic xl" data-k="ic"></span>
          <div class="grow"><div class="row-c"><p class="hero-label">Status saat ini</p><span class="live"><i></i>Live</span></div>
            <p class="hero-status" data-k="status"></p><p class="hero-desc" data-k="desc"></p><p class="hero-upd" data-k="upd"></p></div>
          <div class="hero-val"><p class="hero-label n">Ketinggian air</p><b data-k="val"></b><p class="hero-upd">Siaga ${th.siaga} ${C.unit} · Bahaya ${th.bahaya} ${C.unit}</p></div>
        </section>
        <div class="stats4">
          ${statCard('trend', 'wr', 'Perubahan 1 jam', 's-ch', 's-ch-s')}
          ${statCard('up', 'dg', 'Tertinggi hari ini', 's-max', 's-max-s')}
          ${statCard('down', 'ok', 'Terendah hari ini', 's-min', 's-min-s')}
          ${statCard(sim ? 'sliders' : 'wifi', 'pri', 'Sumber data', 's-src', 's-src-s')}
        </div>
        <div class="cols">
          <article class="card col-chart">
            <div class="row-sb"><h2 class="h2">Grafik ketinggian air</h2>${seg(RANGES, this.hours)}</div>
            <div class="chart chart-lg" id="ch"></div>
          </article>
          <div class="col-side">
            <article class="imb-card" id="imb"></article>
            <article class="card list pad-y0">
              <div class="row-sb li-h"><h2 class="h2">Notifikasi terbaru</h2><a class="link" href="#notifikasi">Lihat semua ${I('chev', 14)}</a></div>
              <div id="mini-feed"></div>
            </article>
          </div>
        </div>`;
      ui.$$('.seg button').forEach(b => b.onclick = () => {
        this.hours = +b.dataset.h; ui.$$('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.update(snapNow());
      });
      this.paintSide();
    },
    paintSide() {
      const it = SB.imbauan.latest(), box = ui.$('#imb');
      box.innerHTML = `<div class="row-c"><span class="badge b-solid">${I('mega', 17)}</span><h2 class="h2 grow c-pri-d">Imbauan aktif</h2>${it ? ui.tag('TERKIRIM', 'ok') : ''}</div>
        ${it ? `<p>${esc(it.isi)}</p><p class="muted sm">Dikirim ${F.time(it.t)} · ke semua pengguna</p>` : '<p class="sub">Belum ada imbauan yang dikirim.</p>'}
        <a class="btn btn-pri" href="#imbauan">${I('plus', 16)}Kirim imbauan baru</a>`;
      ui.$('#mini-feed').innerHTML = feed().slice(0, 3).map(i => `
        <div class="li ai-c"><span class="badge b-${i.cls}">${I(i.icon, 16)}</span><div class="grow"><strong class="sm">${i.title}</strong><p class="sm sub">${esc(i.desc)}</p></div><span class="muted sm">${F.dayLabel(i.t) === 'Hari ini' ? F.time(i.t) : F.dayLabel(i.t).toLowerCase()}</span></div>`).join('');
    },
    update(snap, extra) {
      const cur = snap.current, st = snap.status, hero = ui.$('#hero');
      hero.className = 'hero hero-wide hero-' + S.cls(st);
      hero.querySelector('[data-k=ic]').innerHTML = I(S.icon(st), 34);
      hero.querySelector('[data-k=status]').textContent = st;
      hero.querySelector('[data-k=desc]').textContent = S.descBpbd(st);
      hero.querySelector('[data-k=upd]').textContent = 'Diperbarui ' + F.ago(cur.t);
      hero.querySelector('[data-k=val]').textContent = F.level(cur.v);
      const s24 = D.stats(24), sd = D.stats(null, SB.startOfDay(Date.now())) || s24;
      ui.$('#s-ch').textContent = F.delta(s24.change1h);
      ui.$('#s-ch').className = 'v ' + (Math.round(s24.change1h) > 0 ? 'c-wr' : Math.round(s24.change1h) < 0 ? 'c-ok' : '');
      ui.$('#s-ch-s').textContent = 'dari ' + F.level(s24.ref1h);
      ui.$('#s-max').textContent = F.level(sd.max.v); ui.$('#s-max-s').textContent = 'pukul ' + F.time(sd.max.t);
      ui.$('#s-min').textContent = F.level(sd.min.v); ui.$('#s-min-s').textContent = 'pukul ' + F.time(sd.min.t);
      ui.$('#s-src').textContent = sim ? 'Simulasi' : 'Terhubung';
      ui.$('#s-src').className = 'v ' + (sim ? 'c-wr' : 'c-ok');
      ui.$('#s-src-s').textContent = sim ? 'data uji, bukan pembacaan sensor' : 'via Firebase Realtime Database';
      SB.chart(ui.$('#ch'), D.getHistory(this.hours), { ticks: 6, nowLabel: true, tipTime: true });
      if (extra && extra.changed) this.paintSide();
    }
  };

  /* ================= GRAFIK MONITORING ================= */
  const grafik = {
    hours: 168,
    render() {
      main.innerHTML = `${topbar('Grafik monitoring', 'Tren ketinggian air ' + esc(C.sensorName))}
        <div class="toolbar">${seg(RANGES, this.hours)}<span class="sub sm row-c">${I('cal', 16)}<span id="g-range"></span></span><span class="grow"></span>
          <button type="button" class="btn" id="g-dl">${I('dl', 16)}Unduh grafik</button></div>
        <div class="stats4">
          ${statCard('up', 'dg', 'Tertinggi', 'g-max', 'g-max-s')}
          ${statCard('down', 'ok', 'Terendah', 'g-min', 'g-min-s')}
          ${statCard('avg', 'pri', 'Rata-rata', 'g-avg', 'g-avg-s')}
          ${statCard('clock', 'wr', 'Di atas batas siaga', 'g-ab', 'g-ab-s')}
        </div>
        <div class="cols">
          <article class="card col-chart"><div class="row-sb"><h2 class="h2" id="g-title"></h2>
            <div class="legend-l"><span><i class="ln"></i>Ketinggian air</span><span><i class="ln d wr"></i>Siaga</span><span><i class="ln d dg"></i>Bahaya</span></div></div>
            <div class="chart chart-xl" id="ch"></div></article>
          <div class="col-side">
            <article class="card"><h2 class="h2">Sebaran status</h2><p class="muted sm" id="d-sub"></p><div class="dist" id="dist"></div><div id="dist-l"></div></article>
            <article class="card list pad-y0"><div class="li-h"><h2 class="h2">Kejadian melewati batas</h2><p class="muted sm">Pada rentang yang dipilih</p></div><div id="ev"></div></article>
          </div>
        </div>`;
      ui.$$('.seg button').forEach(b => b.onclick = () => {
        this.hours = +b.dataset.h; ui.$$('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.update(snapNow());
      });
      ui.$('#g-dl').onclick = () => SB.chartToPNG(ui.$('#ch'), `grafik-ketinggian-air-${this.hours}jam.png`);
    },
    update() {
      const h = this.hours, s = D.stats(h), label = RANGES.find(r => r[0] === h)[1];
      ui.$('#g-range').textContent = `${F.date(Date.now() - h * HOUR)} – ${F.date(Date.now())}`;
      ui.$('#g-title').textContent = 'Ketinggian air · ' + label;
      ui.$('#g-max').textContent = F.level(s.max.v); ui.$('#g-max').className = 'v c-dg'; ui.$('#g-max-s').textContent = F.date(s.max.t) + ' · ' + F.time(s.max.t);
      ui.$('#g-min').textContent = F.level(s.min.v); ui.$('#g-min').className = 'v c-ok'; ui.$('#g-min-s').textContent = F.date(s.min.t) + ' · ' + F.time(s.min.t);
      ui.$('#g-avg').textContent = F.level(s.avg); ui.$('#g-avg-s').textContent = label + ' terakhir';
      ui.$('#g-ab').textContent = F.duration(s.aboveSiaga); ui.$('#g-ab').className = 'v c-wr'; ui.$('#g-ab-s').textContent = 'total ' + label.toLowerCase();
      SB.chart(ui.$('#ch'), D.getHistory(h), { ticks: 7, nowLabel: false });
      ui.$('#d-sub').textContent = 'Persentase waktu dalam ' + label.toLowerCase();
      const pct = k => Math.round(s.dist[k] * 100);
      ui.$('#dist').innerHTML = S.order.map(k => `<i class="bg-${S.cls(k)}" style="flex:${Math.max(s.dist[k], 0.01)}"></i>`).join('');
      ui.$('#dist-l').innerHTML = S.order.map(k => `<div class="row-c dl"><i class="dot bg-${S.cls(k)}"></i><span class="grow sub">${k[0] + k.slice(1).toLowerCase()}</span><strong>${pct(k)}%</strong></div>`).join('');
      const from = Date.now() - h * HOUR;
      const evs = D.getEvents().filter(e => e.t >= from && S.rank(e.to) > S.rank(e.from)).slice(0, 5);
      ui.$('#ev').innerHTML = evs.length ? evs.map(e => `<div class="li ai-c">${ui.pill(e.to)}<div class="grow"><strong class="sm">${F.level(e.level)}</strong><p class="muted sm">${F.date(e.t)} · ${F.time(e.t)}</p></div></div>`).join('')
        : '<p class="empty-s">Tidak ada kejadian melewati batas.</p>';
    }
  };

  /* ================= PETA ================= */
  const peta = {
    zones: true, pins: true,
    render() {
      main.innerHTML = `${topbar('Peta &amp; zona rawan bencana', 'Ilustrasi rencana lokasi sensor dengan zona rawan dari BPBD')}
        <div class="cols map-cols">
          <div class="map map-d"><div class="map-svg" id="map-svg"></div><p class="map-note">Ilustrasi · rencana titik pemasangan sensor</p></div>
          <div class="col-side">
            <article class="card"><div class="row-c"><span class="c-pri">${I('layers', 18)}</span><h2 class="h2">Lapisan peta</h2></div>
              <label class="switch-row"><span>Zona rawan bencana</span><input type="checkbox" id="l-zone" ${this.zones ? 'checked' : ''}><span class="switch"></span></label>
              <label class="switch-row"><span>Lokasi sensor</span><input type="checkbox" id="l-pin" ${this.pins ? 'checked' : ''}><span class="switch"></span></label></article>
            <article class="card list pad-y0"><div class="li-h"><h2 class="h2">Klasifikasi zona rawan</h2><p class="muted sm">Indeks InaRISK (BNPB) · skala 0 – 1</p></div>
              ${C.zoneIndex.map(z => `<div class="li ai-c"><i class="zsw z-${z.key}"></i><div class="grow"><strong class="sm">${z.label}</strong><p class="sub sm">Indeks ${z.range}</p></div></div>`).join('')}</article>
            <article class="card sensor-card">
              <div class="row-c"><span class="badge lg" id="p-ic">${I('pin', 20)}</span><div class="grow"><p class="muted sm">Sensor terpilih</p><h2 class="h2">${esc(C.sensorName)}</h2></div><span id="p-pill"></span></div>
              <p class="sub sm">${esc(C.locationNote)}</p><p class="big-val" id="p-val"></p><p class="muted sm" id="p-upd"></p>
              <a class="btn btn-pri" href="#grafik">${I('chart', 16)}Lihat grafik sensor</a></article>
          </div>
        </div>`;
      ui.$('#l-zone').onchange = e => { this.zones = e.target.checked; this.update(snapNow()); };
      ui.$('#l-pin').onchange = e => { this.pins = e.target.checked; this.update(snapNow()); };
    },
    update(snap) {
      const cur = snap.current, st = snap.status;
      ui.$('#map-svg').innerHTML = SB.mapSVG({ status: st, level: cur.v, zones: this.zones });
      if (!this.pins) ui.$$('#map-svg svg > circle, #map-svg svg > g:last-child').forEach(n => n.style.display = 'none');
      ui.$('#p-pill').innerHTML = ui.pill(st);
      ui.$('#p-ic').className = 'badge lg b-' + S.cls(st);
      ui.$('#p-val').textContent = F.level(cur.v);
      ui.$('#p-upd').textContent = 'Diperbarui ' + F.ago(cur.t);
    }
  };

  /* ================= LAPORAN HISTORIS ================= */
  const laporan = {
    hours: 168, status: 'SEMUA', page: 0, per: 10,
    rows() {
      /* satu baris per 30 menit (pembacaan terakhir di tiap rentang) */
      const pts = D.getHistory(this.hours), buckets = new Map();
      pts.forEach(p => buckets.set(Math.floor(p.t / 1800e3), p));
      let rows = Array.from(buckets.values()).sort((a, b) => b.t - a.t).map(p => ({ t: p.t, v: p.v, s: S.of(p.v) }));
      const asc = rows.slice().reverse();
      asc.forEach((r, i) => { const prev = asc[i - 1]; r.note = prev && S.rank(r.s) > S.rank(prev.s) ? (r.s === 'BAHAYA' ? 'Melewati batas bahaya' : 'Melewati batas siaga') : prev && S.rank(r.s) < S.rank(prev.s) ? 'Turun ke ' + r.s : ''; });
      if (rows.length) { const mx = rows.reduce((a, b) => (b.v > a.v ? b : a)); mx.note = mx.note ? mx.note + ' · tertinggi periode' : 'Tertinggi periode'; }
      if (this.status !== 'SEMUA') rows = rows.filter(r => r.s === this.status);
      return rows;
    },
    render() {
      main.innerHTML = `${topbar('Laporan &amp; data historis', 'Rekaman data sensor untuk pelaporan dan kajian risiko bencana')}
        <div class="toolbar">
          <label class="field">${I('cal', 16)}<span class="muted">Periode</span><select id="r-per">${RANGES.map(([h, l]) => `<option value="${h}" ${h === this.hours ? 'selected' : ''}>${l} terakhir</option>`).join('')}</select></label>
          <label class="field">${I('sliders', 16)}<span class="muted">Status</span><select id="r-st">${['SEMUA', 'AMAN', 'SIAGA', 'BAHAYA'].map(s => `<option value="${s}" ${s === this.status ? 'selected' : ''}>${s === 'SEMUA' ? 'Semua' : s}</option>`).join('')}</select></label>
          <span class="grow"></span>
          <button type="button" class="btn" id="r-csv">${I('dl', 16)}Unduh CSV</button>
          <button type="button" class="btn btn-pri" id="r-pdf">${I('dl', 16)}Unduh PDF</button>
        </div>
        <div class="stats4" id="r-stats"></div>
        <p class="info">${I('info', 18)}Unduh data sesuai periode untuk pelaporan. Rekap rutin BPBD: Senin, Rabu, dan Jumat.</p>
        <article class="card table-card"><div class="table-wrap"><table>
          <thead><tr><th>Tanggal</th><th>Waktu</th><th>Ketinggian air</th><th>Status</th><th>Keterangan</th></tr></thead><tbody id="r-body"></tbody></table></div>
          <div class="pager row-sb"><span class="sub sm" id="r-info"></span><div class="pg" id="r-pg"></div></div></article>`;
      ui.$('#r-per').onchange = e => { this.hours = +e.target.value; this.page = 0; this.update(); };
      ui.$('#r-st').onchange = e => { this.status = e.target.value; this.page = 0; this.update(); };
      ui.$('#r-csv').onclick = () => this.csv();
      ui.$('#r-pdf').onclick = () => window.print();
    },
    update() {
      const s = D.stats(this.hours), evs = D.getEvents().filter(e => e.t >= Date.now() - this.hours * HOUR && S.rank(e.to) > S.rank(e.from));
      const nS = evs.filter(e => e.to === 'SIAGA').length, nB = evs.filter(e => e.to === 'BAHAYA').length;
      ui.$('#r-stats').innerHTML = [['db', 'pri', 'Total data tercatat', s.count.toLocaleString('id-ID'), 'pembacaan pada periode ini', ''],
        ['alert', 'wr', 'Kejadian siaga', nS, `status di atas ${th.siaga} ${C.unit}`, 'c-wr'],
        ['alert', 'dg', 'Kejadian bahaya', nB, `status ≥ ${th.bahaya} ${C.unit}`, 'c-dg'],
        ['avg', 'ok', 'Rata-rata ketinggian', F.level(s.avg), 'seluruh periode', '']]
        .map(([ic, c, l, v, sub, vc]) => `<article class="card stat"><div class="stat-h"><span class="badge b-${c}">${I(ic, 16)}</span>${l}</div><p class="v ${vc}">${v}</p><p class="stat-s">${sub}</p></article>`).join('');
      const rows = this.rows(), pages = Math.max(1, Math.ceil(rows.length / this.per));
      this.page = Math.min(this.page, pages - 1);
      const slice = rows.slice(this.page * this.per, (this.page + 1) * this.per);
      ui.$('#r-body').innerHTML = slice.map(r => `<tr><td>${F.dateNum(r.t)}</td><td>${F.time(r.t)}</td><td><strong>${F.level(r.v)}</strong></td><td>${ui.pill(r.s)}</td><td class="sub">${r.note || '—'}</td></tr>`).join('')
        || '<tr><td colspan="5" class="empty-s">Tidak ada data untuk filter ini.</td></tr>';
      ui.$('#r-info').textContent = rows.length ? `Menampilkan ${this.page * this.per + 1}–${this.page * this.per + slice.length} dari ${rows.length.toLocaleString('id-ID')} baris` : '';
      const btns = []; const add = (lab, p, dis, cur) => btns.push(`<button type="button" class="pgb${cur ? ' cur' : ''}" data-p="${p}" ${dis ? 'disabled' : ''} aria-label="Halaman ${p + 1}">${lab}</button>`);
      add(I('back', 15), this.page - 1, this.page === 0);
      const show = new Set([0, pages - 1, this.page - 1, this.page, this.page + 1]);
      let gap = false;
      for (let p = 0; p < pages; p++) { if (show.has(p)) { add(p + 1, p, false, p === this.page); gap = false; } else if (!gap) { btns.push('<span class="pg-gap">…</span>'); gap = true; } }
      add(I('chev', 15), this.page + 1, this.page >= pages - 1);
      ui.$('#r-pg').innerHTML = btns.join('');
      ui.$$('#r-pg .pgb').forEach(b => b.onclick = () => { this.page = +b.dataset.p; this.update(); });
    },
    csv() {
      const rows = this.rows();
      const lines = ['Tanggal,Waktu,Ketinggian (' + C.unit + '),Status,Keterangan'].concat(rows.map(r => [F.dateNum(r.t), F.time(r.t), Math.round(r.v), r.s, '"' + (r.note || '') + '"'].join(',')));
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `laporan-ketinggian-air-${this.hours}jam.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    }
  };

  /* ================= KIRIM IMBAUAN ================= */
  const TEMPLATES = [
    ['Amankan dokumen penting', 'Amankan dokumen penting (ijazah, sertifikat) ke tempat yang lebih tinggi.'],
    ['Siapkan tas siaga', 'Siapkan tas siaga berisi dokumen, obat-obatan, senter, dan pakaian ganti.'],
    ['Menuju titik kumpul', 'Air mencapai batas bahaya. Segera menuju titik kumpul terdekat dan ikuti arahan petugas.'],
    ['Matikan aliran listrik', 'Matikan aliran listrik di rumah dan cabut peralatan elektronik untuk mencegah korsleting.']
  ];
  const imbauan = {
    target: 'SIAGA',
    render() {
      main.innerHTML = `${topbar('Kirim imbauan', 'Pesan singkat dari BPBD yang tampil di web warga')}
        <div class="cols">
          <form class="card form" id="f" novalidate>
            <div class="row-c"><span class="badge b-pri lg">${I('mega', 18)}</span><h2 class="h2 lg">Buat imbauan baru</h2></div>
            <label class="fl"><span>Judul imbauan</span><input id="f-judul" maxlength="60" placeholder="Contoh: Amankan dokumen penting"></label>
            <div class="fl"><span>Tampilkan saat status</span>
              <div class="opt3" role="group" aria-label="Tampilkan saat status">${[['SEMUA', 'Semua status', ''], ['SIAGA', 'Siaga', 'wr'], ['BAHAYA', 'Bahaya', 'dg']].map(([k, l, c]) => `<button type="button" data-t="${k}" class="opt ${c ? 'opt-' + c : ''}" aria-pressed="${k === this.target}">${c ? `<i class="dot bg-${c}"></i>` : ''}${l}</button>`).join('')}</div></div>
            <label class="fl"><span class="row-sb">Isi pesan<em class="muted" id="f-count">0 / 160 karakter</em></span><textarea id="f-isi" maxlength="160" rows="4" placeholder="Tulis pesan singkat dan jelas untuk warga"></textarea></label>
            <div class="fl"><span>Template cepat</span><div class="tpl">${TEMPLATES.map((t, i) => `<button type="button" class="chip-tpl" data-i="${i}">${I('plus', 13)}${t[0]}</button>`).join('')}</div></div>
            <label class="check"><input type="checkbox" id="f-push" checked><span class="box">${I('tick', 14)}</span>Kirim juga sebagai notifikasi ke HP warga</label>
            <label class="check"><input type="checkbox" id="f-ber" checked><span class="box">${I('tick', 14)}</span>Tampilkan di Beranda warga</label>
            <p class="err" id="f-err" hidden></p>
            <div class="form-act"><button type="button" class="btn" id="f-draft">${I('save', 16)}Simpan draf</button><button type="submit" class="btn btn-pri">${I('send', 16)}Kirim imbauan</button></div>
          </form>
          <div class="col-side">
            <article class="card soft"><div class="row-c"><span class="sub">${I('eye', 17)}</span><h2 class="h2">Pratinjau di web warga</h2></div>
              <div class="imbauan" id="pv"></div><p class="muted sm" id="pv-s"></p></article>
            <article class="card list pad-y0"><div class="row-sb li-h"><h2 class="h2">Riwayat imbauan</h2></div><div id="hist"></div></article>
          </div>
        </div>`;
      const judul = ui.$('#f-judul'), isi = ui.$('#f-isi');
      const preview = () => {
        ui.$('#f-count').textContent = isi.value.length + ' / 160 karakter';
        ui.$('#pv').innerHTML = `<span class="badge b-solid">${I('mega', 18)}</span><div class="imb-b"><div class="row-sb"><strong>Imbauan BPBD</strong><span class="muted">sekarang</span></div><p>${esc(isi.value || 'Isi pesan akan tampil di sini.')}</p></div>`;
        ui.$('#pv-s').textContent = this.target === 'SEMUA' ? 'Tampil di Beranda dan Riwayat pada semua status' : `Tampil di Beranda dan Riwayat saat status ${this.target}`;
      };
      judul.oninput = isi.oninput = preview;
      ui.$$('.opt').forEach(b => b.onclick = () => { this.target = b.dataset.t; ui.$$('.opt').forEach(x => x.setAttribute('aria-pressed', String(x === b))); preview(); });
      ui.$$('.chip-tpl').forEach(b => b.onclick = () => { const [j, t] = TEMPLATES[+b.dataset.i]; judul.value = j; isi.value = t; preview(); });
      const submit = status => {
        const err = ui.$('#f-err');
        if (!judul.value.trim() || !isi.value.trim()) { err.textContent = 'Lengkapi judul dan isi pesan sebelum mengirim.'; err.hidden = false; (judul.value.trim() ? isi : judul).focus(); return; }
        err.hidden = true;
        SB.imbauan.add({ judul: judul.value.trim(), isi: isi.value.trim(), target: this.target, push: ui.$('#f-push').checked, beranda: ui.$('#f-ber').checked, status });
        SB.notify.toast(status === 'TERKIRIM'
          ? { title: 'Imbauan terkirim', body: 'Pesan tampil di web warga dan dikirim sebagai notifikasi.', cls: 'ok', icon: 'send' }
          : { title: 'Draf tersimpan', body: 'Draf dapat dikirim kemudian.', cls: 'pri', icon: 'save' });
        judul.value = ''; isi.value = ''; preview(); this.paintHist();
      };
      ui.$('#f').onsubmit = e => { e.preventDefault(); submit('TERKIRIM'); };
      ui.$('#f-draft').onclick = () => submit('DRAF');
      preview(); this.paintHist();
    },
    paintHist() {
      ui.$('#hist').innerHTML = SB.imbauan.all().slice(0, 6).map(i => `<div class="li ai-c"><div class="grow"><strong class="sm">${esc(i.judul)}</strong><p class="muted sm">${i.status === 'DRAF' ? 'Belum dikirim' : F.dayLabel(i.t) + ' · ' + F.time(i.t)}</p></div>${i.status === 'DRAF' ? ui.tag('DRAF', 'mute') : ui.tag('TERKIRIM', 'ok')}</div>`).join('');
    },
    update() {}
  };

  /* ================= NOTIFIKASI ================= */
  const notifikasi = {
    filter: 'SEMUA', q: '',
    render() {
      main.innerHTML = `${topbar('Notifikasi', 'Riwayat perubahan status dan imbauan yang terkirim')}
        <div class="toolbar"><div class="chips" id="n-chips" role="group" aria-label="Saring notifikasi"></div><span class="grow"></span>
          <label class="field search">${I('search', 16)}<input id="n-q" placeholder="Cari notifikasi" aria-label="Cari notifikasi"></label>
          <button type="button" class="btn" id="n-read">${I('checks', 16)}Tandai semua dibaca</button></div>
        <div class="cols">
          <article class="card list pad-y0 feed-d" id="n-list"></article>
          <div class="col-side">
            <article class="card"><div class="row-c"><span class="c-pri">${I('sliders', 18)}</span><h2 class="h2">Pengaturan notifikasi</h2></div>
              <div class="set-row"><span class="badge b-dg">${I('vol', 16)}</span><div class="grow"><strong class="sm">Bunyi peringatan</strong><p class="muted sm">Bunyi dan getar untuk Siaga dan Bahaya</p></div><label class="switch-wrap"><input type="checkbox" id="n-sound" ${SB.notify.soundOn() ? 'checked' : ''}><span class="switch"></span></label></div>
              <div class="set-row"><span class="badge b-pri">${I('bell', 16)}</span><div class="grow"><strong class="sm">Notifikasi browser</strong><p class="muted sm" id="n-perm"></p></div><button type="button" class="btn sm" id="n-allow">Izinkan</button></div>
            </article>
            <article class="card soft"><h2 class="h2">Ambang batas pemicu</h2><p class="muted sm">Mengikuti prototipe sensor; dapat disesuaikan di konfigurasi</p>
              ${[['AMAN', `≤ ${th.siaga} ${C.unit}`, 'notifikasi biasa'], ['SIAGA', `${th.siaga} – ${th.bahaya} ${C.unit}`, 'bunyi + getar'], ['BAHAYA', `≥ ${th.bahaya} ${C.unit}`, 'bunyi + getar']].map(([s, r, n]) => `<div class="thr">${ui.pill(s)}<strong class="grow">${r}</strong><span class="sm ${s === 'AMAN' ? 'muted' : 'c-dg'}">${n}</span></div>`).join('')}
            </article>
          </div>
        </div>`;
      ui.$('#n-q').oninput = e => { this.q = e.target.value.toLowerCase(); this.paint(); };
      ui.$('#n-read').onclick = () => { localStorage.setItem('sb-bpbd-read', String(Date.now())); this.paint(); paintBadge(); };
      ui.$('#n-sound').onchange = e => localStorage.setItem('sb-sound', e.target.checked ? 'on' : 'off');
      const perm = () => { const p = SB.notify.permission(); ui.$('#n-perm').textContent = p === 'granted' ? 'Aktif di browser ini' : p === 'unsupported' ? 'Tidak didukung browser ini' : 'Belum diizinkan'; ui.$('#n-allow').hidden = p === 'granted' || p === 'unsupported'; };
      ui.$('#n-allow').onclick = async () => { await SB.notify.request(); perm(); };
      perm(); this.paint();
    },
    paint() {
      const all = feed(), read = lastRead();
      const counts = { SEMUA: all.length }; all.forEach(i => counts[i.kind] = (counts[i.kind] || 0) + 1);
      const chips = [['SEMUA', 'Semua', ''], ['BAHAYA', 'Bahaya', 'dg'], ['SIAGA', 'Siaga', 'wr'], ['AMAN', 'Aman', 'ok'], ['IMBAUAN', 'Imbauan', 'pri']];
      ui.$('#n-chips').innerHTML = chips.map(([k, l, c]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === this.filter}">${c ? `<i class="dot bg-${c}"></i>` : ''}${l}<em>${counts[k] || 0}</em></button>`).join('');
      ui.$$('#n-chips .chip').forEach(b => b.onclick = () => { this.filter = b.dataset.f; this.paint(); });
      const items = all.filter(i => (this.filter === 'SEMUA' || i.kind === this.filter) && (!this.q || (i.title + ' ' + i.desc).toLowerCase().includes(this.q)));
      if (!items.length) { ui.$('#n-list').innerHTML = '<p class="empty">Tidak ada notifikasi yang cocok.</p>'; return; }
      const groups = {}; items.slice(0, 50).forEach(i => { const k = F.dayLabel(i.t); (groups[k] = groups[k] || []).push(i); });
      ui.$('#n-list').innerHTML = Object.entries(groups).map(([d, list]) => `<p class="group-l in">${d}</p>` + list.map(i => `
        <div class="li ai-c nrow${i.t > read ? ' unread' : ''}"><span class="badge b-${i.cls} lg">${I(i.icon, 18)}</span>
          <div class="grow"><strong>${i.title}</strong>${i.t > read ? '<i class="u-dot" aria-label="belum dibaca"></i>' : ''}<p class="sub sm">${esc(i.desc)}</p></div>${i.pill}<span class="muted sm tm">${F.time(i.t)}</span></div>`).join('')).join('');
    },
    update(snap, extra) { if (extra && extra.changed) this.paint(); }
  };

  /* ================= ROUTER & DATA ================= */
  const views = { dashboard, grafik, peta, laporan, imbauan, notifikasi };
  ui.router(Object.keys(views), 'dashboard', name => {
    active = views[name];
    ui.$$('.nav a').forEach(a => a.dataset.r === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    active.render();
    active.update(snapNow(), {});
    tick();
    window.scrollTo(0, 0);
  });

  function tick() { const t = ui.$('#tb-time'); if (t) t.textContent = F.dateFull(Date.now()) + ' · ' + F.time(Date.now()) + ' WIT'; }
  setInterval(tick, 30000);

  D.subscribe((snap, extra) => {
    if (!active) return;
    if (active !== laporan && active !== imbauan) active.update(snap, extra);
    if (extra && extra.changed) { SB.notify.alertStatus(extra.changed); paintBadge(); }
  });
  SB.imbauan.subscribe(() => { paintBadge(); if (active === dashboard) dashboard.paintSide(); if (active === notifikasi) notifikasi.paint(); });

  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => active && active.update(snapNow(), {}), 150); });
  /* kotak sumber data di sidebar */
  if (!sim) { const b = ui.$('#src-box'); b.className = 'src live'; b.innerHTML = `<b>${I('wifi', 14)}Sensor terhubung</b>Via Firebase Realtime Database`; }
  paintBadge();
  SB.mountSimPanel();
})();
