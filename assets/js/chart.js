/*
 * Grafik ketinggian air (SVG) bergaya grafik pasar/real-time:
 *   SB.chart(el, points, { hours })      sumbu waktu = <hours> jam terakhir s.d. sekarang
 *   SB.chart(el, points, { from, to })   sumbu waktu = rentang tertentu
 *
 * - Sumbu tinggi di kanan dengan penanda nilai terkini (warna status) dan garis harga
 *   putus-putus; titik terkini berdenyut selama alat mengirim data dan bergeser halus saat
 *   nilai berubah.
 * - Crosshair: garis tegak + mendatar dengan label waktu di sumbu bawah dan nilai di sumbu kanan.
 * - Perbesar/geser: roda tetikus (perbesar di posisi kursor), seret (geser), jepit dua jari
 *   di HP, tombol "Perbesar ke data"; klik ganda / "Tampilkan semua" untuk kembali.
 * - Data rapat diringkas per selang waktu rapi; garis = nilai tertinggi tiap selang agar
 *   puncak banjir tidak hilang. Bagian tanpa data diarsir dan garis tidak disambung.
 */
(function () {
  const P = { pri: '#0E5AA7', wr: '#F59E0B', wrt: '#B45309', dg: '#DC2626', dgt: '#B91C1C', ok: '#15803D', bd: '#E5EAF0', grid: '#EEF2F6', tx3: '#94A3B8', tx2: '#64748B', tx: '#0F172A' };
  const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
  const GAP = 10 * MIN;      // jarak antar-pembacaan yang dianggap "putus" (lihat SB.gapLimit di data.js)
  const MIN_SPAN = 10 * MIN; // perbesaran paling dekat
  const STEPS = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY];
  const BINS = [2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY];

  const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayNo = t => { const d = new Date(t); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY); };
  const durLabel = ms => ms >= DAY ? ms / DAY + ' hari' : ms >= HOUR ? ms / HOUR + ' jam' : ms / MIN + ' menit';
  const tw = s => s.length * 6.3 + 18;   // perkiraan lebar teks 11px
  const f1 = n => n.toFixed(1);
  const stColor = s => (s === 'BAHAYA' ? P.dgt : s === 'SIAGA' ? P.wrt : P.ok);

  /* pecah data menjadi beberapa ruas bila ada jeda > batas */
  function segments(points, gap) {
    const out = []; let cur = [];
    points.forEach((p, i) => {
      if (i && p.t - points[i - 1].t > gap) { out.push(cur); cur = []; }
      cur.push(p);
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /* ringkas satu ruas per selang waktu: terendah, tertinggi, rata-rata */
  function bin(seg, origin, size) {
    const out = []; let b = null;
    seg.forEach(p => {
      const k = Math.floor((p.t - origin) / size);
      if (!b || b.k !== k) { b = { k, a: origin + k * size, b: origin + (k + 1) * size, min: p.v, max: p.v, sum: 0, n: 0, t0: p.t, t1: p.t }; out.push(b); }
      b.sum += p.v; b.n++; b.t1 = p.t;
      if (p.v < b.min) b.min = p.v; if (p.v > b.max) b.max = p.v;
    });
    out.forEach(x => { x.avg = x.sum / x.n; x.t = (x.t0 + x.t1) / 2; });
    return out;
  }

  /* posisi tanda waktu yang "rapi": menit/jam bulat, atau tengah malam untuk rentang hari */
  function timeTicks(t0, t1, maxTicks) {
    const span = t1 - t0;
    const step = STEPS.find(s => span / s <= maxTicks) || STEPS[STEPS.length - 1];
    const ticks = [];
    if (step < DAY) {
      for (let t = midnight(t0) + Math.ceil((t0 - midnight(t0)) / step) * step; t <= t1; t += step) ticks.push(t);
    } else {
      const n = step / DAY;
      for (let t = midnight(t0); t <= t1; t = midnight(t + 1.5 * DAY)) if (t >= t0 && dayNo(t) % n === 0) ticks.push(t);
    }
    return { step, ticks };
  }

  SB.chart = function (el, points, opts) {
    el._sb = { points, opts };
    render(el);
  };

  function render(el) {
    const { points, opts } = el._sb;
    const o = Object.assign({ compact: false, labels: true, ticks: 5, hover: true, nowLabel: false }, opts || {});
    const C = SB.config, th = C.thresholds, u = C.unit, F = SB.fmt;
    const all = (points || []).filter(p => p && isFinite(p.t) && isFinite(p.v));
    const now = Date.now();
    const b1 = o.to != null ? o.to : o.hours ? now : all.length ? all[all.length - 1].t : now;
    const b0 = o.from != null ? o.from : o.hours ? b1 - o.hours * HOUR : all.length ? all[0].t : b1 - DAY;
    const interactive = o.hover && !o.compact;

    /* perbesaran tersimpan per elemen; hilang bila rentang (1 jam/24 jam/7 hari/...) diganti */
    const key = o.hours ? 'h' + o.hours : b0 + '-' + b1;
    if (el._sbZoom && el._sbZoom.key !== key) el._sbZoom = null;
    const z = interactive && el._sbZoom;
    const t1 = z ? (z.follow ? b1 : Math.min(b1, z.to)) : b1;         // perbesaran yang menyentuh "kini" ikut bergeser
    const t0 = z ? Math.max(b0, z.follow ? b1 - (z.to - z.from) : z.from) : b0;
    const span = Math.max(1, t1 - t0);

    /* data dalam rentang, plus satu titik di luar tiap tepi agar garis menyambung ke tepi */
    let i0 = all.findIndex(p => p.t >= t0); if (i0 < 0) i0 = all.length;
    let i1 = all.length; while (i1 > i0 && all[i1 - 1].t > t1) i1--;
    const pts = all.slice(i0, i1);
    const before = i0 > 0 ? all[i0 - 1] : null, after = i1 < all.length ? all[i1] : null;

    const W = Math.max(200, Math.round(el.clientWidth || 600));
    const H = Math.max(60, Math.round(el.clientHeight || 200));
    const pad = o.compact ? { l: 2, r: 8, t: 10, b: 4 } : { l: 12, r: 44, t: 30, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, yMax = C.maxLevel;
    const X = t => pad.l + ((Math.min(Math.max(t, t0), t1) - t0) / span) * iw;
    const Y = v => pad.t + (1 - Math.min(Math.max(v, 0), yMax) / yMax) * ih;
    const long = span > 1.5 * DAY, multiDay = midnight(t0) !== midnight(t1);
    const when = t => (multiDay ? F.date(t) + ' ' : '') + F.time(t);
    const gid = 'cg' + Math.random().toString(36).slice(2, 8);

    /* ringkas bila pembacaan lebih rapat dari ±2 px (mis. 7/30 hari); rentang pendek digambar apa adanya */
    const size = BINS.find(s => span / s <= Math.max(20, iw / 3)) || DAY;
    const lim = SB.gapLimit ? SB.gapLimit(pts) : GAP;
    let gap = Math.max(lim, (span / iw) * 2);
    let segs = segments(pts, gap);
    const origin = midnight(t0);
    let bins = segs.map(s => bin(s, origin, size));
    const agg = pts.length > iw / 2 && pts.length > 1.5 * bins.reduce((n, b) => n + b.length, 0);
    if (agg && size * 1.5 > gap) { gap = Math.max(gap, size * 1.5); segs = segments(pts, gap); bins = segs.map(s => bin(s, origin, size)); }
    const edgeIn = before && pts.length && pts[0].t - before.t <= gap;
    const edgeOut = after && pts.length && after.t - pts[pts.length - 1].t <= gap;
    const last = pts[pts.length - 1];
    const isLatest = !!last && !after;
    const live = isLatest && b1 >= now - MIN && t1 >= b1 - MIN && t1 - last.t <= Math.max(gap, 2 * MIN);
    const L = [];

    L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafik ketinggian air ${long ? F.date(t0) + ' sampai ' + F.date(t1) : when(t0) + ' sampai ' + when(t1)}" font-family="Inter, system-ui, sans-serif">`);
    L.push(`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.pri}" stop-opacity="0.22"/><stop offset="1" stop-color="${P.pri}" stop-opacity="0.02"/></linearGradient>
      <pattern id="${gid}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${P.tx3}" stroke-opacity="0.16" stroke-width="1.5"/></pattern>
      <clipPath id="${gid}c"><rect x="${pad.l}" y="${pad.t - 4}" width="${iw}" height="${ih + 8}"/></clipPath></defs>`);

    /* zona status */
    if (!o.compact) {
      L.push(`<rect x="${pad.l}" y="${Y(yMax)}" width="${iw}" height="${Y(th.bahaya) - Y(yMax)}" fill="${P.dg}" fill-opacity="0.04"/>`);
      L.push(`<rect x="${pad.l}" y="${Y(th.bahaya)}" width="${iw}" height="${Y(th.siaga) - Y(th.bahaya)}" fill="${P.wr}" fill-opacity="0.055"/>`);
    }

    /* sumbu: tanda waktu + garis kisi samar, label tepi kiri/kanan, angka tinggi di kanan */
    const axis = [];
    let capText = '';
    if (!o.compact) {
      const showDate = long || (z && multiDay);
      const labL = z ? (long ? F.date(t0) : when(t0)) : long ? F.date(t0) : F.time(t0);
      const labR = (o.nowLabel || (long && o.hover)) && t1 >= b1 - MIN && b1 >= now - MIN ? 'Kini' : z ? (long ? F.date(t1) : when(t1)) : long ? F.date(t1) : F.time(t1);
      const wL = tw(labL) - 8, wR = tw(labR) - 8;
      const maxTicks = Math.max(2, Math.min(o.ticks + 3, Math.floor(iw / (showDate ? 62 : 52))));
      const { step, ticks } = timeTicks(t0, t1, maxTicks);
      ticks.forEach(t => {
        const x = X(t), isMid = t === midnight(t);
        const lab = step >= DAY || (isMid && span > 6 * HOUR) ? F.date(t) : F.time(t);
        const hw = tw(lab) / 2 - 4;
        if (x - hw < pad.l + wL || x + hw > W - pad.r - wR || lab === labL || lab === labR) return;
        const strong = isMid && step < DAY;
        L.push(`<line x1="${f1(x)}" x2="${f1(x)}" y1="${pad.t}" y2="${Y(0)}" stroke="${strong ? P.bd : P.grid}"/>`);
        axis.push(`<text x="${f1(x)}" y="${H - 7}" text-anchor="middle" font-size="11" font-weight="${strong ? 600 : 500}" fill="${strong ? P.tx2 : P.tx3}">${lab}</text>`);
      });
      axis.push(`<text x="${W - pad.r}" y="${H - 7}" text-anchor="end" font-size="11" font-weight="${labR === 'Kini' ? 600 : 500}" fill="${labR === 'Kini' ? P.tx2 : P.tx3}">${labR}</text>`);
      axis.push(`<text x="${pad.l}" y="${H - 7}" text-anchor="start" font-size="11" font-weight="500" fill="${P.tx3}">${labL}</text>`);
      [0, th.siaga, th.bahaya, yMax].forEach(v => {
        if (v !== 0 && v !== yMax) L.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${P.grid}"/>`);
        axis.push(`<text x="${W - pad.r + 8}" y="${Y(v) + 4}" font-size="11" font-weight="500" fill="${P.tx3}">${v}</text>`);
      });
      axis.push(`<text x="${W - pad.r + 8}" y="14" font-size="10.5" font-weight="600" fill="${P.tx3}">${u}</text>`);
      if (agg) capText = W < 480 ? 'Tertinggi per ' + durLabel(size) : 'Nilai tertinggi per ' + durLabel(size) + (o.hover ? ' · arahkan kursor untuk rincian' : '');
    }

    /* bagian tanpa data: sebelum data pertama, di antara ruas, dan setelah data terakhir */
    const holes = [];
    if (!pts.length) holes.push([t0, t1, before || after ? 'Tidak ada data' : 'Belum ada data pada rentang ini']);
    else {
      if (pts[0].t - t0 > gap && !edgeIn) holes.push([t0, pts[0].t, before ? 'Tidak ada data' : 'Belum ada data']);
      for (let i = 1; i < segs.length; i++) holes.push([segs[i - 1][segs[i - 1].length - 1].t, segs[i][0].t, 'Tidak ada data']);
      if (t1 - last.t > gap && !edgeOut) holes.push([last.t, t1, after ? 'Tidak ada data' : 'Alat tidak mengirim data']);
    }
    holes.forEach(([a, b, lab]) => {
      const x = X(a), w = X(b) - x; if (w < 1) return;
      L.push(`<rect x="${f1(x)}" y="${pad.t}" width="${f1(w)}" height="${ih}" fill="url(#${gid}h)"/>`);
      if (!o.compact && w >= tw(lab)) L.push(`<text x="${f1(x + w / 2)}" y="${Y(th.siaga / 2) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${P.tx2}">${lab}</text>`);
    });

    L.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="${P.bd}"/>`);

    /* garis ambang */
    const lines = o.compact
      ? [[th.siaga, P.wr, 'Siaga', P.wrt]]
      : [[th.bahaya, P.dg, `Bahaya ${th.bahaya} ${u}`, P.dgt], [th.siaga, P.wr, `Siaga ${th.siaga} ${u}`, P.wrt]];
    lines.forEach(([v, c, lab, tc]) => {
      L.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-width="1.25" stroke-dasharray="5 4"/>`);
      if (o.labels) L.push(`<text x="${pad.l + 6}" y="${Y(v) - 5}" font-size="11" font-weight="700" fill="${tc}" paint-order="stroke" stroke="#fff" stroke-width="3">${lab}</text>`);
    });

    /* data */
    L.push(`<g clip-path="url(#${gid}c)">`);
    const area = (d, xa, xb) => {
      L.push(`<path d="${d} L${f1(xb)} ${Y(0)} L${f1(xa)} ${Y(0)} Z" fill="url(#${gid})"/>`);
      L.push(`<path d="${d}" fill="none" stroke="${P.pri}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    };
    if (agg) {
      bins.forEach((bs, si) => {
        const seg = segs[si], lo = seg[0].t, hi = seg[seg.length - 1].t;
        const pt = bs.map(b => [X(Math.min(Math.max(b.t, lo), hi)), Y(b.max)]);
        if (si === 0 && edgeIn) pt[0][0] = X(t0);
        if (si === bins.length - 1 && edgeOut) pt[pt.length - 1][0] = X(t1);
        if (si === bins.length - 1 && !edgeOut && last) pt.push([X(last.t), Y(last.v)]);   // berakhir di nilai terkini
        if (pt.length === 1) pt.push([Math.min(X(t1), pt[0][0] + 3), pt[0][1]]);
        area(pt.map((q, i) => (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1])).join(' '), pt[0][0], pt[pt.length - 1][0]);
      });
    } else {
      segs.forEach((seg, si) => {
        const s = seg.slice();
        if (si === 0 && edgeIn) s.unshift(before);
        if (si === segs.length - 1 && edgeOut) s.push(after);
        if (s.length === 1) { L.push(`<circle cx="${f1(X(s[0].t))}" cy="${f1(Y(s[0].v))}" r="2.5" fill="${P.pri}"/>`); return; }
        area(s.map((p, i) => (i ? 'L' : 'M') + f1(X(p.t)) + ' ' + f1(Y(p.v))).join(' '), X(s[0].t), X(s[s.length - 1].t));
      });
    }
    L.push('</g>');

    L.push(...axis);

    /* nilai terkini: garis harga + penanda di sumbu kanan + titik berdenyut, bergeser halus bila berubah */
    if (isLatest) {
      const st = last.s || SB.status.of(last.v), col = live ? stColor(st) : P.tx2;
      const prev = el._sbPrev, dy = prev && prev.v !== last.v && !el._sbAct ? f1(Y(prev.v) - Y(last.v)) : 0;
      el._sbPrev = { v: last.v };
      const x = X(last.t), y = Y(last.v);
      L.push(`<g class="ch-now${dy ? ' ch-slide' : ''}" style="--dy:${dy}px">`);
      if (interactive) {
        L.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${f1(y)}" y2="${f1(y)}" stroke="${col}" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>`);
        L.push(`<rect x="${W - pad.r + 2}" y="${f1(y - 10)}" width="${pad.r - 4}" height="20" rx="5" fill="${col}"/><text x="${W - pad.r / 2}" y="${f1(y + 4)}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${Math.round(last.v)}</text>`);
      }
      if (live) L.push(`<circle class="ch-pulse" cx="${f1(x)}" cy="${f1(y)}" r="4.5" fill="${P.pri}"/>`);
      L.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="4.5" fill="${P.pri}" stroke="#fff" stroke-width="2"/></g>`);
    }

    if (!o.compact) L.push(`<text class="cap" x="${W - pad.r}" y="14" text-anchor="end" font-size="10.5" font-weight="500" fill="${P.tx2}">${capText}</text>`);

    if (interactive) {
      L.push(`<g class="hv" style="display:none;pointer-events:none">
        <line class="hv-x" y1="${pad.t}" y2="${Y(0)}" stroke="${P.tx2}" stroke-dasharray="3 3"/>
        <line class="hv-y" x1="${pad.l}" x2="${W - pad.r}" stroke="${P.tx2}" stroke-dasharray="3 3"/>
        <circle class="hv-c" r="5" fill="#fff" stroke="${P.pri}" stroke-width="2.5"/>
        <rect class="hv-vr" x="${W - pad.r + 2}" width="${pad.r - 4}" height="20" rx="5" fill="${P.tx}"/><text class="hv-vt" x="${W - pad.r / 2}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff"></text>
        <rect class="hv-tr" y="${H - pad.b + 3}" height="20" rx="5" fill="${P.tx}"/><text class="hv-tt" y="${H - pad.b + 17}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff"></text>
      </g>`);
      L.push(`<rect class="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent"/>`);
    }
    L.push('</svg>');

    /* tombol perbesar */
    /* selalu ada [+] [−]; "Perbesar ke data" bila sebagian rentang kosong, "Tampilkan semua" bila diperbesar */
    let tools = '';
    if (interactive) {
      const empty = holes.reduce((n, [a, b]) => n + (b - a), 0) / span;
      tools = `<button type="button" class="ch-btn ch-ic" data-z="in" aria-label="Perbesar" title="Perbesar">+</button>`
        + `<button type="button" class="ch-btn ch-ic" data-z="out" aria-label="Perkecil" title="Perkecil"${z ? '' : ' disabled'}>−</button>`;
      if (z) tools += `<button type="button" class="ch-btn" data-z="reset">Tampilkan semua</button>`;
      else if (pts.length > 1 && empty > 0.05) tools += `<button type="button" class="ch-btn" data-z="fit">Perbesar ke data</button>`;
    }
    el.innerHTML = L.join('') + (tools ? `<div class="ch-tools" style="left:${pad.l}px">${tools}</div>` : '');
    el.classList.toggle('is-zoom', !!z);
    if (!interactive) { el._sbS = null; return; }

    /* keadaan gambar ini, dipakai oleh penangan sentuh/tetikus (dipasang sekali per elemen) */
    const svg = el.firstChild, g = svg.querySelector('.hv'), cap = svg.querySelector('.cap');
    const q = c => g.querySelector(c);
    const flat = agg ? [].concat(...bins) : pts;
    const S = el._sbS = { t0, t1, b0, b1, key, span, pad, W, iw, Y, X };
    S.hide = () => { g.style.display = 'none'; cap.textContent = capText; el.classList.remove('is-hv'); };
    S.showAt = x => {
      if (x < pad.l || x > W - pad.r) { S.hide(); return; }
      const t = t0 + ((x - pad.l) / iw) * span;
      let best = null;
      if (agg) best = flat.find(b => t >= b.a && t < b.b) || null;
      else for (const p of flat) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const has = !!best && (agg || Math.abs(best.t - t) <= gap);
      const v = has ? (agg ? best.max : best.v) : 0;
      const px = has ? X(best.t) : x, py = Y(v);
      q('.hv-x').setAttribute('x1', px); q('.hv-x').setAttribute('x2', px);
      ['.hv-y', '.hv-c', '.hv-vr', '.hv-vt'].forEach(c => { q(c).style.display = has ? '' : 'none'; });
      if (has) {
        q('.hv-y').setAttribute('y1', py); q('.hv-y').setAttribute('y2', py);
        q('.hv-c').setAttribute('cx', px); q('.hv-c').setAttribute('cy', py);
        q('.hv-vr').setAttribute('y', py - 10); q('.hv-vt').setAttribute('y', py + 4); q('.hv-vt').textContent = Math.round(v);
      }
      const tl = has && agg ? when(Math.max(best.a, t0)) + '–' + F.time(Math.min(best.b, t1)) : when(has ? best.t : t);
      const w = tw(tl) - 6, tx = Math.min(Math.max(px - w / 2, 0), W - w);
      q('.hv-tr').setAttribute('x', tx); q('.hv-tr').setAttribute('width', w);
      q('.hv-tt').setAttribute('x', tx + w / 2); q('.hv-tt').textContent = tl;
      cap.textContent = !has ? 'Tidak ada data'
        : agg ? `Tertinggi ${Math.round(best.max)} · rata-rata ${Math.round(best.avg)} · terendah ${Math.round(best.min)} ${u}`
        : `${F.level(best.v)} · ${best.s || SB.status.of(best.v)}`;
      g.style.display = ''; el.classList.add('is-hv');
    };
    el.querySelectorAll('.ch-tools button').forEach(tb => tb.onclick = () => {
      const k = tb.dataset.z;
      if (k === 'reset') { el._sbZoom = null; render(el); return; }
      if (k === 'fit') {
        const lt = pts[pts.length - 1].t, m = Math.max((lt - pts[0].t) * 0.06, 10 * MIN);
        setView(el, pts[0].t - m, b1 - lt <= lim ? b1 : lt + m); return;
      }
      /* perbesar/perkecil 2×: bertumpu di tepi kanan bila sedang menampilkan "kini", selain itu di tengah */
      const w = k === 'in' ? span / 2 : span * 2, right = t1 >= b1 - MIN;
      const a = right ? t1 - w : (t0 + t1) / 2 - w / 2;
      setView(el, a, a + w);
    });
    bind(el);
    if (el._sbHx != null) S.showAt(el._sbHx);   // pertahankan crosshair saat data baru masuk
  }

  /* atur jendela waktu yang ditampilkan (dibatasi pada rentang yang dipilih) */
  function setView(el, a, b) {
    const S = el._sbS; if (!S) return;
    const full = S.b1 - S.b0, w = Math.max(MIN_SPAN, Math.min(b - a, full));
    if (w >= full - 1000) el._sbZoom = null;
    else {
      a = Math.min(Math.max(a, S.b0), S.b1 - w);
      el._sbZoom = { key: S.key, from: a, to: a + w, follow: a + w >= S.b1 - Math.max(MIN, w * 0.02) };
    }
    if (!el._sbRaf) el._sbRaf = requestAnimationFrame(() => { el._sbRaf = 0; render(el); });
  }

  function bind(el) {
    if (el._sbBound) return;
    el._sbBound = true;
    const ptrs = new Map();
    let pan = null, pinch = null;
    const toX = e => { const S = el._sbS, r = el.getBoundingClientRect(); return (e.clientX - r.left) * (S.W / r.width); };
    const tAt = x => { const S = el._sbS; return S.t0 + ((x - S.pad.l) / S.iw) * S.span; };
    const inPlot = e => !e.target.closest || !e.target.closest('.ch-tools');

    el.addEventListener('pointerdown', e => {
      const S = el._sbS; if (!S || !inPlot(e)) return;
      const x = toX(e); ptrs.set(e.pointerId, x);
      if (ptrs.size === 2) {
        const [x1, x2] = [...ptrs.values()];
        pinch = { d: Math.max(20, Math.abs(x2 - x1)), m: tAt((x1 + x2) / 2), w: S.t1 - S.t0 };
        pan = null; el._sbAct = true; el._sbHx = null; S.hide(); return;
      }
      if (e.pointerType === 'mouse' && e.button === 0 && el._sbZoom) {
        pan = { x, a: S.t0, w: S.t1 - S.t0 }; el._sbAct = true;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* abaikan */ }
        el.classList.add('is-pan'); S.hide(); return;
      }
      el._sbHx = x; S.showAt(x);
    });
    el.addEventListener('pointermove', e => {
      const S = el._sbS; if (!S) return;
      if (!inPlot(e) && !pan && !pinch) { el._sbHx = null; S.hide(); return; }
      const x = toX(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, x);
      if (pinch && ptrs.size >= 2) {
        const [x1, x2] = [...ptrs.values()];
        const w = pinch.w * pinch.d / Math.max(20, Math.abs(x2 - x1)), a = pinch.m - ((x1 + x2) / 2 - S.pad.l) / S.iw * w;
        setView(el, a, a + w); return;
      }
      if (pan) { const a = pan.a + (pan.x - x) / S.iw * pan.w; setView(el, a, a + pan.w); return; }
      el._sbHx = x; S.showAt(x);
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (pan) { pan = null; el.classList.remove('is-pan'); }
      if (!ptrs.size) el._sbAct = false;
      if (e.type === 'pointercancel' && el._sbS) { el._sbHx = null; el._sbS.hide(); }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', e => {
      if (pan || pinch || !el._sbS) return;
      if (e.pointerType !== 'mouse') ptrs.delete(e.pointerId);
      el._sbHx = null; el._sbS.hide();
    });
    el.addEventListener('wheel', e => {
      const S = el._sbS; if (!S || !inPlot(e)) return;
      e.preventDefault();
      const x = Math.min(Math.max(toX(e), S.pad.l), S.W - S.pad.r), t = tAt(x);
      const w = (S.t1 - S.t0) * Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.004);
      const a = t - ((x - S.pad.l) / S.iw) * w;
      setView(el, a, a + w);
    }, { passive: false });
    el.addEventListener('dblclick', () => { if (el._sbZoom) { el._sbZoom = null; render(el); } });
  }

  /* Unduh grafik sebagai PNG */
  SB.chartToPNG = function (el, filename) {
    const svg = el.querySelector('svg'); if (!svg) return;
    const w = svg.width.baseVal.value, h = svg.height.baseVal.value, scale = 2;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };
})();
