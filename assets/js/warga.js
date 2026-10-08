/* Tampilan warga (web mobile): Beranda, Grafik, Peta, Riwayat, Menu. */
(function () {
  const C = SB.config, D = SB.data, F = SB.fmt, S = SB.status, I = SB.icon, ui = SB.ui, esc = ui.esc;
  const view = document.getElementById('view');
  const th = C.thresholds;
  let active = null;            // { name, update }
  let offline = !navigator.onLine;

  /* Simpan pembacaan terakhir agar tetap tampil saat offline */
  const saveLast = snap => { try { localStorage.setItem('sb-last', JSON.stringify(snap.current)); } catch (e) { /* abaikan */ } };
  const lastSaved = () => { try { return JSON.parse(localStorage.getItem('sb-last')); } catch (e) { return null; } };

  /* Imbauan BPBD baru "diterima" warga saat status sudah mencapai status sasarannya
     (SEMUA = langsung). Waktu diterima disimpan agar notifikasi tidak berulang. */
  const RECV_KEY = 'sb-imb-terima';
  let recv = (() => { try { return JSON.parse(localStorage.getItem(RECV_KEY)); } catch (e) { return null; } })();
  const saveRecv = () => { try { localStorage.setItem(RECV_KEY, JSON.stringify(recv)); } catch (e) { /* abaikan */ } };
  if (!recv) { recv = {}; SB.imbauan.sent().forEach(i => { recv[i.id] = i.t; }); saveRecv(); }   // kunjungan pertama: imbauan lama dianggap sudah diterima
  const applies = (i, st) => i.target === 'SEMUA' || S.rank(st) >= S.rank(i.target);
  function deliver(st, notify) {
    try { recv = Object.assign(JSON.parse(localStorage.getItem(RECV_KEY)) || {}, recv); } catch (e) { /* abaikan */ }   // tab lain mungkin sudah menerima
    const fresh = SB.imbauan.sent().filter(i => recv[i.id] == null && applies(i, st));
    fresh.forEach(i => { recv[i.id] = Date.now(); });
    if (fresh.length) saveRecv();
    if (notify) fresh.filter(i => i.push !== false).forEach(i => SB.notify.alertImbauan(i));
    return fresh.length;
  }
  const received = () => SB.imbauan.sent().filter(i => recv[i.id] != null);

  const subHeader = (title, sub, back = '#beranda') =>
    `<header class="subhead"><a class="back" href="${back}" aria-label="Kembali">${I('back', 20)}</a><div><h1>${title}</h1><p>${sub}</p></div></header>`;

  function heroHTML(id = 'hero') {
    return `<section class="hero" id="${id}" aria-live="polite">
      <div class="hero-top">
        <span class="hero-ic" data-k="ic"></span>
        <div class="hero-txt"><p class="hero-label" data-k="label">Status saat ini</p><p class="hero-status" data-k="status"></p></div>
        <span class="live" data-k="live"><i></i>Live</span>
      </div>
      <p class="hero-desc" data-k="desc"></p>
      <div class="hero-meta"><span>${I('clock', 13)}<span data-k="upd"></span></span><span>1 sensor prototipe</span></div>
    </section>`;
  }
  function paintHero(el, cur, st) {
    el.className = 'hero hero-' + S.cls(st) + (offline ? ' stale' : '');
    el.querySelector('[data-k=ic]').innerHTML = I(S.icon(st), 26);
    el.querySelector('[data-k=status]').textContent = st;
    el.querySelector('[data-k=label]').textContent = offline ? 'Status terakhir tersimpan' : 'Status saat ini';
    el.querySelector('[data-k=desc]').textContent = offline ? 'Data mungkin sudah berubah. Tetap perhatikan kondisi sungai secara langsung.' : S.desc(st);
    el.querySelector('[data-k=upd]').textContent = offline ? 'Data terakhir ' + F.time(cur.t) : 'Diperbarui ' + F.ago(cur.t);
    el.querySelector('[data-k=live]').hidden = offline;
  }

  /* ================= BERANDA ================= */
  const beranda = {
    render() {
      const segs = [th.siaga, th.bahaya - th.siaga, C.maxLevel - th.bahaya];
      view.innerHTML = `
        <header class="top">
          <div><p class="loc">${I('pin', 14)}Lokasi uji coba</p><h1>${esc(C.locationLabel)}</h1></div>
          <button type="button" class="icon-btn" id="btn-notif">${I('bell', 20)}<span class="dot" hidden></span></button>
        </header>
        ${heroHTML()}
        <div class="grid2">
          <article class="card stat">
            <span class="badge b-pri">${I('drop', 16)}</span>
            <p class="stat-l">Ketinggian air</p><p class="stat-v" id="st-level"></p>
            <div class="gauge" aria-hidden="true">
              <i class="g-ok" style="flex:${segs[0]}"></i><i class="g-wr" style="flex:${segs[1]}"></i><i class="g-dg" style="flex:${segs[2]}"></i><b id="gauge-mark"></b>
            </div>
            <p class="stat-s">Batas siaga ${th.siaga} ${C.unit}</p>
          </article>
          <article class="card stat">
            <span class="badge" id="st-delta-ic"></span>
            <p class="stat-l">Perubahan</p><p class="stat-v" id="st-delta"></p><p class="stat-s" id="st-delta-s"></p>
          </article>
        </div>
        <article class="card">
          <div class="row-sb"><h2 class="h2">Tren 24 jam</h2><a class="link" href="#grafik">Lihat detail ${I('chev', 14)}</a></div>
          <div class="chart chart-sm" id="ch-mini"></div>
          <div class="axis"><span>24 jam lalu</span><span>12 jam lalu</span><span>Sekarang</span></div>
        </article>
        <a class="imbauan" id="imb" href="#riwayat?f=imbauan" hidden></a>`;
      const btn = ui.$('#btn-notif');
      const paintBell = () => {
        const p = SB.notify.permission();
        btn.setAttribute('aria-label', p === 'granted' ? 'Notifikasi aktif' : 'Aktifkan notifikasi');
        btn.classList.toggle('on', p === 'granted');
        btn.querySelector('.dot').hidden = p === 'granted' || p === 'unsupported';
      };
      paintBell();
      btn.onclick = async () => {
        const r = await SB.notify.request(); paintBell();
        SB.notify.toast(r === 'granted'
          ? { title: 'Notifikasi aktif', body: 'Anda akan diberi tahu saat status berubah menjadi Siaga atau Bahaya.', cls: 'ok', icon: 'bell' }
          : { title: 'Notifikasi belum aktif', body: r === 'unsupported' ? 'Browser ini tidak mendukung notifikasi.' : 'Izinkan notifikasi di pengaturan browser untuk menerima peringatan.', cls: 'wr', icon: 'bell' });
      };
      this.paintImbauan();
    },
    paintImbauan() {
      const el = ui.$('#imb'); if (!el) return;
      /* tampil jika status saat ini sudah mencapai status sasaran imbauan */
      const st = D.getStatus();
      const it = received().find(i => i.beranda !== false && applies(i, st));
      el.hidden = !it; if (!it) return;
      el.innerHTML = `<span class="badge b-solid">${I('mega', 18)}</span>
        <div class="imb-b"><div class="row-sb"><strong>Imbauan BPBD</strong><span class="muted">${F.time(it.t)}</span></div><p>${esc(it.isi)}</p></div>`;
    },
    update(snap) {
      const cur = snap.current, st = snap.status, s = D.stats(24);
      paintHero(ui.$('#hero'), cur, st);
      ui.$('#st-level').textContent = F.level(cur.v);
      ui.$('#gauge-mark').style.left = Math.min(100, (cur.v / C.maxLevel) * 100) + '%';
      const ch = s.change1h, dir = Math.round(ch) > 0 ? 'naik' : Math.round(ch) < 0 ? 'turun' : 'stabil';
      ui.$('#st-delta').textContent = F.delta(ch);
      ui.$('#st-delta').className = 'stat-v' + (dir === 'naik' ? ' c-wr' : dir === 'turun' ? ' c-ok' : '');
      ui.$('#st-delta-s').textContent = dir === 'stabil' ? 'stabil dalam 1 jam' : dir + ' dalam 1 jam';
      const ic = ui.$('#st-delta-ic');
      ic.className = 'badge ' + (dir === 'naik' ? 'b-wr' : dir === 'turun' ? 'b-ok' : 'b-mute');
      ic.innerHTML = I(dir === 'turun' ? 'trendDown' : 'trend', 16);
      SB.chart(ui.$('#ch-mini'), D.getHistory(24), { compact: true, hover: false });
      if (arguments[1] && arguments[1].changed) this.paintImbauan();
    }
  };

  /* ================= GRAFIK ================= */
  const RANGES = [[24, '24 Jam'], [168, '7 Hari'], [720, '30 Hari']];
  const grafik = {
    hours: 24,
    render() {
      view.innerHTML = `${subHeader('Grafik ketinggian air', esc(C.sensorName))}
        <div class="seg" role="group" aria-label="Rentang waktu">${RANGES.map(([h, l]) => `<button type="button" data-h="${h}" aria-pressed="${h === this.hours}">${l}</button>`).join('')}</div>
        <div class="row-sb al-end">
          <div><p class="sub">Ketinggian saat ini</p><div class="val-row"><span class="big-val" id="g-val"></span><span class="chip-delta" id="g-delta"></span></div></div>
          <span id="g-pill"></span>
        </div>
        <article class="card pad-sm"><div class="chart chart-md" id="ch-main"></div></article>
        <div class="grid3" id="g-stats"></div>
        <h2 class="h2">Riwayat pembacaan</h2>
        <article class="card list pad-y0" id="g-list"></article>`;
      ui.$$('.seg button').forEach(b => b.onclick = () => {
        this.hours = +b.dataset.h; ui.$$('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        this.update({ current: D.getCurrent(), status: D.getStatus() }, true);
      });
    },
    update(snap) {
      const cur = snap.current, st = snap.status, s = D.stats(this.hours), ch = s.change1h;
      ui.$('#g-val').textContent = F.level(cur.v);
      const r = Math.round(ch);
      ui.$('#g-delta').innerHTML = r ? `${I(r > 0 ? 'up' : 'down', 13)}${Math.abs(r)}` : '';
      ui.$('#g-delta').className = 'chip-delta ' + (r > 0 ? 'c-wr-s' : 'c-ok-s');
      ui.$('#g-delta').hidden = !r;
      ui.$('#g-pill').innerHTML = ui.pill(st);
      SB.chart(ui.$('#ch-main'), D.getHistory(this.hours), { ticks: 5, nowLabel: true });
      ui.$('#g-stats').innerHTML = [['Tertinggi', s.max.v, 'c-dg'], ['Terendah', s.min.v, 'c-ok'], ['Rata-rata', s.avg, '']]
        .map(([l, v, c]) => `<article class="card stat-sm"><p class="stat-l">${l}</p><p class="stat-v sm ${c}">${F.level(v)}</p></article>`).join('');
      const step = (this.hours / 24) * 3600e3, rows = [];
      for (let i = 0; i < 5; i++) {
        const t = Date.now() - i * step, pts = D.getHistory(null, t - step / 2).filter(p => p.t <= t);
        const p = i === 0 ? cur : pts[pts.length - 1]; if (p) rows.push(p);
      }
      ui.$('#g-list').innerHTML = rows.map(p => {
        const ps = S.of(p.v);
        return `<div class="li ai-c"><span class="badge b-${S.cls(ps)} sm">${I('drop', 15)}</span>
          <span class="li-t sub">${this.hours > 24 ? F.date(p.t) + ' ' : ''}${F.time(p.t)}</span>
          <strong class="li-v">${F.level(p.v)}</strong>${ui.pill(ps)}</div>`;
      }).join('');
    }
  };

  /* ================= PETA ================= */
  const ZDESC = {
    tinggi: 'Lokasi ini termasuk zona bahaya banjir TINGGI. Saat status Siaga atau Bahaya, segera bersiap dan ikuti arahan petugas.',
    sedang: 'Lokasi ini termasuk zona bahaya banjir SEDANG. Tetap waspada saat status Siaga atau Bahaya.',
    rendah: 'Lokasi ini termasuk zona bahaya banjir RENDAH. Tetap pantau informasi dari BPBD.'
  };
  const POI_HINT = { zoom: 'Perbesar peta untuk melihat tempat.', loading: 'Memuat tempat…', error: 'Data tempat tidak dapat dimuat.', ok: 'Data tempat: OpenStreetMap' };
  const peta = {
    zones: true, poi: true, base: null, lm: null, test: false,
    render() {
      const P = SB.peta, live = P && P.available();
      const sim = D.kind === 'simulasi';
      view.innerHTML = `${subHeader('Peta zona rawan', '1 sensor prototipe · Kali Acai')}
        <div class="map map-m" id="map">
          ${live ? '<div class="lmap" id="lmap"></div>' : '<div class="map-svg" id="map-svg"></div>'}
          <button type="button" class="map-chip" id="zone-t" aria-pressed="${this.zones}">${I('layers', 15)}Zona rawan<span class="sw"><i></i></span></button>
          ${live && C.map.poi && C.map.poi.url ? `<button type="button" class="map-chip poi-t" id="poi-t" aria-pressed="${this.poi}">${I('pin', 15)}Tempat<span class="sw"><i></i></span></button>` : ''}
          ${live ? `<div class="map-base" role="group" aria-label="Jenis peta">${Object.entries(P.BASE).map(([k, b]) => `<button type="button" data-b="${k}">${b.label}</button>`).join('')}</div>
          <button type="button" class="map-fab" id="loc-btn" aria-label="Lokasi saya" title="Lokasi saya">${I('locate', 20)}</button>` : ''}
          <p class="map-note" id="map-note">${live ? 'Memuat data zona…' : 'Ilustrasi · rencana titik pemasangan sensor'}</p>
        </div>
        <div class="legend" id="legend" ${this.zones ? '' : 'hidden'}><span class="muted">Indeks InaRISK:</span>${C.zoneIndex.map(z => `<span class="lg lg-${z.key}">${z.label} ${z.range}</span>`).join('')}</div>
        ${live && C.map.poi && C.map.poi.url ? `<div class="legend poi-legend" id="poi-legend" ${this.poi ? '' : 'hidden'}>${SB.peta.POI_CAT.map(c => `<span class="lg-poi" style="--c:${c.col}"><i>${I(c.icon, 10)}</i>${c.label}</span>`).join('')}<span class="muted" id="poi-hint"></span></div>` : ''}
        ${live ? `<article class="card loc-res" id="loc-res">
          <div class="row-c"><span class="badge b-pri lg" id="lr-ic">${I('locate', 20)}</span>
            <div class="grow"><h2 class="h2" id="lr-t">Cek zona di lokasi Anda</h2><p class="sub sm" id="lr-d">Ketuk tombol di bawah untuk melihat apakah lokasi Anda berada di zona rawan banjir.</p></div></div>
          <div class="loc-act"><button type="button" class="btn btn-pri" id="lr-btn">${I('locate', 16)}Cek lokasi saya</button>
            ${sim ? `<button type="button" class="btn" id="lr-test" aria-pressed="${this.test}">${I('pin', 16)}Uji: ketuk peta</button>` : ''}</div>
        </article>` : ''}
        <article class="card sheet">
          <div class="row-c"><span class="badge b-wr lg" id="pm-ic">${I('pin', 20)}</span>
            <div class="grow"><h2 class="h2">${esc(C.sensorName)}</h2><p class="sub sm">${esc(C.locationNote)}</p></div><span id="pm-pill"></span></div>
          <div class="row-sb al-end"><div><p class="big-val" id="pm-val"></p><p class="muted sm" id="pm-upd"></p></div><a class="btn btn-pri" href="#grafik">Lihat grafik</a></div>
          ${live ? `<a class="btn" href="${SB.peta.gmapsDir(C.map.sensor.lat, C.map.sensor.lng)}" target="_blank" rel="noopener">${I('nav', 16)}Rute ke sensor (Google Maps)</a>` : ''}
        </article>`;
      ui.$('#zone-t').onclick = () => {
        this.zones = !this.zones; ui.$('#zone-t').setAttribute('aria-pressed', String(this.zones));
        ui.$('#legend').hidden = !this.zones;
        if (this.lm) { this.lm.setZones(this.zones); this.lm.setInarisk(this.zones); } else this.update({ current: D.getCurrent(), status: D.getStatus() });
      };
      if (!live) return;
      const lm = this.lm = SB.liveMap(ui.$('#lmap'), {
        zones: this.zones, inarisk: this.zones, base: this.base,
        onZones: info => { this.zinfo = info; this.paintNote(); },
        onLayers: st => { this.lst = st; this.paintNote(); },
        poi: this.poi, onPoi: st => { const h = ui.$('#poi-hint'); if (h) h.textContent = POI_HINT[st] || ''; },
        onLocate: r => this.paintLoc(r)
      });
      const pt = ui.$('#poi-t');
      if (pt) pt.onclick = () => { this.poi = !this.poi; pt.setAttribute('aria-pressed', String(this.poi)); ui.$('#poi-legend').hidden = !this.poi; lm.setPoi(this.poi); };
      const paintBase = () => ui.$$('.map-base button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.b === lm.base())));
      ui.$$('.map-base button').forEach(b => b.onclick = () => { lm.setBase(b.dataset.b); this.base = b.dataset.b; paintBase(); });
      paintBase();
      const go = async () => {
        const btns = [ui.$('#lr-btn'), ui.$('#loc-btn')];
        btns.forEach(b => b && (b.disabled = true));
        ui.$('#lr-t').textContent = 'Mencari lokasi Anda…';
        try { this.paintLoc(await lm.locate()); }
        catch (e) { this.paintLoc({ error: e.message }); }
        btns.forEach(b => b && (b.disabled = false));
      };
      ui.$('#lr-btn').onclick = go; ui.$('#loc-btn').onclick = go;
      const tb = ui.$('#lr-test');
      if (tb) {
        const setT = on => { this.test = on; tb.setAttribute('aria-pressed', String(on)); lm.setTestMode(on); };
        tb.onclick = () => setT(!this.test); setT(this.test);
      }
    },
    paintNote() {
      const n = ui.$('#map-note'), info = this.zinfo || {}, st = this.lst || {}; if (!n) return;
      const parts = [];
      if (info.fc) parts.push(info.sample ? 'Zona contoh (bukan data BPBD)' : 'Zona rawan BPBD');
      if (info.inarisk) parts.push(st.inarisk === false ? 'Layer InaRISK gagal dimuat' : 'Indeks bahaya: InaRISK BNPB');
      n.textContent = info.error || parts.join(' · ') || 'Memuat data zona…';
      n.classList.toggle('warn', !!(info.error || info.sample || st.inarisk === false));
    },
    paintLoc(r) {
      const ic = ui.$('#lr-ic'), t = ui.$('#lr-t'), d = ui.$('#lr-d'); if (!ic) return;
      if (r.error) {
        ic.className = 'badge lg b-wr'; ic.innerHTML = I('alert', 20);
        t.textContent = 'Lokasi belum dapat ditampilkan'; d.textContent = r.error; return;
      }
      const z = r.zone, P = SB.peta;
      ic.className = 'badge lg b-' + (z ? P.ZCLS[z] : r.zonesReady ? 'ok' : 'mute');
      ic.innerHTML = I(z && z !== 'rendah' ? 'alert' : 'check', 20);
      const ir = r.inarisk;
      t.textContent = !r.zonesReady ? 'Lokasi ditemukan' : z ? 'Zona bahaya ' + P.ZLABEL[z].toLowerCase() : 'Di luar zona rawan yang dipetakan';
      d.textContent = (r.wilayah ? `Wilayah: ${r.wilayah.text}. ` : '') + (!r.zonesReady ? 'Data zona belum dapat dimuat.' : z ? ZDESC[z] : 'Lokasi ini tidak termasuk area bahaya banjir pada peta. Tetap pantau informasi dan imbauan.')
        + (ir ? ir.error ? ` Indeks InaRISK: ${ir.error}.` : ir.value != null ? ` Indeks bahaya InaRISK di titik ini ${P.fmtIdx(ir.value)}.` : '' : '')
        + ` Jarak ke sensor ${P.fmtDist(r.distance)}.` + (r.test ? ' (Titik uji)' : '') + (r.sample && r.zoneSrc === 'bpbd' ? ' Catatan: zona masih data contoh.' : '');
    },
    update(snap) {
      const cur = snap.current, st = snap.status;
      if (this.lm) this.lm.update(snap);
      else ui.$('#map-svg').innerHTML = SB.mapSVG({ status: st, level: cur.v, zones: this.zones });
      ui.$('#pm-pill').innerHTML = ui.pill(st);
      ui.$('#pm-ic').className = 'badge lg b-' + S.cls(st);
      ui.$('#pm-val').textContent = F.level(cur.v);
      ui.$('#pm-upd').textContent = 'Diperbarui ' + F.ago(cur.t);
    },
    leave() { if (this.lm) { this.lm.destroy(); this.lm = null; } }
  };

  /* ================= RIWAYAT ================= */
  function feedItems() {
    const ev = D.getEvents().map(e => {
      const up = S.rank(e.to) > S.rank(e.from);
      return {
        t: e.t, kind: e.to, pill: ui.pill(e.to), cls: S.cls(e.to), icon: S.icon(e.to),
        title: e.to === 'AMAN' ? 'Status kembali AMAN' : (up ? 'Status naik ke ' : 'Status turun ke ') + e.to,
        desc: `Ketinggian air ${e.to === 'AMAN' ? 'turun ke' : 'mencapai'} ${F.level(e.level)}.`
      };
    });
    const im = received().map(i => ({ t: Math.max(i.t, recv[i.id]), kind: 'IMBAUAN', pill: ui.tag('IMBAUAN', 'pri'), cls: 'pri', icon: 'mega', title: 'Imbauan BPBD', desc: i.isi }));
    return ev.concat(im).sort((a, b) => b.t - a.t);
  }
  /* Satu hari per tampilan; daftar bergulir di dalam kartu, layar utama tetap diam */
  const riwayat = {
    filter: 'SEMUA', day: null, lock: true,
    render(q) {
      if (q && q.get('f') === 'imbauan') this.filter = 'IMBAUAN';
      const chips = [['SEMUA', 'Semua'], ['BAHAYA', 'Bahaya'], ['SIAGA', 'Siaga'], ['IMBAUAN', 'Imbauan']];
      view.innerHTML = `<header class="top"><div><h1 class="h1">Riwayat</h1><p class="sub">Perubahan status &amp; imbauan BPBD</p></div></header>
        <div class="chips" role="group" aria-label="Saring riwayat">${chips.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === this.filter}">${l}</button>`).join('')}</div>
        <div class="row-sb"><div id="dp"></div><span class="feed-count" id="feed-n"></span></div>
        <article class="card list pad-y0 scroll-card" id="feed" tabindex="0" aria-label="Daftar riwayat"></article>`;
      ui.$$('.chip').forEach(b => b.onclick = () => { this.filter = b.dataset.f; ui.$$('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.paint(); });
      this.dp = SB.dayPicker(ui.$('#dp'), { day: this.day, days: 30, onChange: d => { this.day = d; this.paint(true); } });
      this.paint(true);
    },
    paint(top) {
      const [from, to] = this.dp.range(), box = ui.$('#feed');
      const items = feedItems().filter(i => i.t >= from && i.t < to && (this.filter === 'SEMUA' || i.kind === this.filter));
      ui.$('#feed-n').textContent = items.length ? items.length + ' kejadian' : '';
      box.innerHTML = items.length ? items.map(i => `
          <div class="li"><span class="badge b-${i.cls} lg">${I(i.icon, 18)}</span>
            <div class="grow"><div class="row-sb"><strong>${i.title}</strong><span class="muted sm">${F.time(i.t)}</span></div>
            <p class="sub sm">${esc(i.desc)}</p>${i.pill}</div></div>`).join('')
        : `<p class="empty">Tidak ada riwayat ${this.filter === 'SEMUA' ? '' : 'kategori ini '}pada ${this.dp.isToday() ? 'hari ini' : 'tanggal ini'}.</p>`;
      if (top) box.scrollTop = 0;
    },
    update(snap, extra) { if (extra && extra.changed && this.dp.isToday()) this.paint(); }
  };

  /* ================= MENU ================= */
  const menu = {
    render() {
      const row = (ic, cls, title, sub, attrs = '', warn = false) => `
        <a class="li menu-row" ${attrs}><span class="badge b-${cls} lg">${I(ic, 18)}</span>
          <div class="grow"><strong>${title}</strong><p class="sm ${warn ? 'c-wr' : 'muted'}">${sub}</p></div>${I('chev', 18)}</a>`;
      const perm = SB.notify.permission();
      view.innerHTML = `<header class="top"><div><h1 class="h1">Menu</h1><p class="sub">Fitur pendukung keselamatan &amp; pengaturan</p></div></header>
        <section class="loc-card"><span class="badge b-glass lg">${I('pin', 20)}</span><div class="grow"><p class="sm">Lokasi dipantau</p><strong>${esc(C.locationLabel)}</strong></div></section>
        <p class="group-l">Keselamatan</p>
        <article class="card list pad-y0">
          <details class="li-d"><summary class="li menu-row"><span class="badge b-ok lg">${I('nav', 18)}</span><div class="grow"><strong>Jalur evakuasi &amp; titik kumpul</strong><p class="sm c-wr">Bukan jaminan lokasi 100% aman</p></div>${I('down', 18)}</summary>
            <div class="li-more"><p>Titik kumpul ditetapkan oleh BPBD dan pengurus RT/RW setempat. Peta jalur evakuasi akan ditampilkan setelah data titik kumpul resmi tersedia.</p><p>Saat status Bahaya, ikuti arahan petugas di lapangan.</p></div></details>
          <details class="li-d"><summary class="li menu-row"><span class="badge b-wr lg">${I('shield', 18)}</span><div class="grow"><strong>Panduan keselamatan</strong><p class="sm muted">Langkah yang dilakukan tiap status</p></div>${I('down', 18)}</summary>
            <div class="li-more">
              <p>${ui.pill('AMAN')} Pantau informasi secara berkala dan siapkan tas siaga.</p>
              <p>${ui.pill('SIAGA')} Amankan dokumen penting dan barang berharga ke tempat tinggi. Cabut peralatan listrik.</p>
              <p>${ui.pill('BAHAYA')} Matikan aliran listrik, ajak keluarga ke titik kumpul terdekat, dan ikuti arahan petugas.</p></div></details>
        </article>
        <p class="group-l">Informasi</p>
        <article class="card list pad-y0">${row('mega', 'pri', 'Imbauan dari BPBD', 'Pesan terbaru dari BPBD', 'href="#riwayat?f=imbauan"')}</article>
        <p class="group-l">Pengaturan</p>
        <article class="card list pad-y0">
          <button type="button" class="li menu-row" id="m-notif"><span class="badge b-vio lg">${I('bell', 18)}</span><div class="grow"><strong>Notifikasi peringatan</strong><p class="sm muted" id="m-notif-s">${perm === 'granted' ? 'Aktif · bunyi &amp; getar untuk Siaga dan Bahaya' : 'Belum aktif · ketuk untuk mengaktifkan'}</p></div>${I('chev', 18)}</button>
          <div class="li menu-row"><span class="badge b-mute lg">${I('db', 18)}</span><div class="grow"><strong>Data offline</strong><p class="sm muted">Data terakhir tersimpan di perangkat dan tetap tampil saat koneksi terputus</p></div></div>
        </article>`;
      ui.$('#m-notif').onclick = async () => {
        const r = await SB.notify.request();
        ui.$('#m-notif-s').innerHTML = r === 'granted' ? 'Aktif · bunyi &amp; getar untuk Siaga dan Bahaya' : 'Belum aktif · izinkan notifikasi di pengaturan browser';
      };
    },
    update() {}
  };

  /* ================= ROUTER ================= */
  const views = { beranda, grafik, peta, riwayat, menu };
  /* tampilan dibuka setelah data pertama tersedia (Firebase) — mode simulasi langsung */
  if (D.kind !== 'simulasi') view.innerHTML = '<p class="empty">Menghubungkan ke sensor…</p>';
  D.ready.then(() => ui.router(Object.keys(views), 'beranda', (name, q) => {
    if (active && active.leave) active.leave();
    active = views[name];
    document.body.classList.toggle('lock', !!active.lock);
    active.render(q);
    ui.$$('.bottom-nav a').forEach(a => a.dataset.r === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    paintNow({});
    window.scrollTo(0, 0);
  }));

  function paintNow(extra) {
    if (!active) return;
    let snap = { current: D.getCurrent(), status: D.getStatus() };
    if (offline) { const l = lastSaved(); if (l) snap = { current: l, status: S.of(l.v) }; }
    active.update(snap, extra);
  }

  /* Data masuk */
  D.subscribe((snap, extra) => {
    if (offline) return;                       // saat offline, tampilan memakai data terakhir
    saveLast(snap);
    if (active) active.update(snap, extra);
    if (extra && extra.changed) {
      SB.notify.alertStatus(extra.changed);
      /* status naik: imbauan yang menunggu status ini sekarang diterima */
      if (deliver(snap.status, true)) { if (active === beranda) beranda.paintImbauan(); if (active === riwayat) riwayat.paint(); }
    }
  });
  SB.imbauan.subscribe(() => {
    deliver(D.getStatus(), true);             // hanya imbauan yang sasarannya sudah tercapai
    if (active === beranda) beranda.paintImbauan();
    if (active === riwayat) riwayat.paint();
  });
  D.ready.then(() => { if (deliver(D.getStatus(), true) && active) paintNow({ changed: null }); });

  /* Status koneksi */
  const banner = document.getElementById('offline-banner');
  function setOffline(v) {
    offline = v; banner.hidden = !v;
    const l = lastSaved(); banner.querySelector('[data-k=t]').textContent = l ? 'Menampilkan data terakhir pukul ' + F.time(l.t) : 'Belum ada data tersimpan';
    paintNow({});
  }
  window.addEventListener('offline', () => setOffline(true));
  window.addEventListener('online', () => setOffline(false));
  if (offline) setOffline(true);
  ui.$('#retry').onclick = () => setOffline(!navigator.onLine);

  /* Gambar ulang grafik saat ukuran layar berubah */
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => paintNow({}), 150); });

  SB.mountSimPanel();
})();
