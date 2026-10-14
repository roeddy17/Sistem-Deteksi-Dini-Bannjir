/*
 * Grafik garis SVG: zona status, garis ambang, tooltip saat disentuh, perbesar, ekspor PNG.
 *
 *   SB.chart(el, points, { hours })      sumbu waktu = <hours> jam terakhir s.d. sekarang
 *   SB.chart(el, points, { from, to })   sumbu waktu = rentang tertentu
 *
 * - Sumbu waktu mengikuti rentang yang dipilih; bagian tanpa data (alat belum aktif/mati)
 *   diarsir dan garis tidak disambung melewatinya.
 * - Bila data terlalu rapat untuk lebar layar (mis. 7/30 hari), data diringkas per selang
 *   waktu (10 menit, 1 jam, ...) dan yang digambar adalah nilai TERTINGGI tiap selang,
 *   sehingga puncak banjir tidak pernah hilang; tooltip menampilkan tertinggi, rata-rata
 *   dan terendah selang tersebut.
 * - Perbesar: seret di grafik (mouse) atau tombol "Perbesar ke data"; klik ganda / tombol
 *   "Tampilkan semua" untuk kembali.
 */
(function () {
  const P = { pri: '#0E5AA7', wr: '#F59E0B', wrt: '#B45309', dg: '#DC2626', dgt: '#B91C1C', bd: '#E5EAF0', grid: '#EEF2F6', tx3: '#94A3B8', tx2: '#64748B', tx: '#0F172A' };
  const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
  const GAP = 10 * MIN;   // jarak antar-pembacaan yang dianggap "putus" (lihat SB.gapLimit di data.js)
  const STEPS = [5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY];
  const BINS = [2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY];

  const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayNo = t => { const d = new Date(t); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY); };
  const durLabel = ms => ms >= DAY ? ms / DAY + ' hari' : ms >= HOUR ? ms / HOUR + ' jam' : ms / MIN + ' menit';
  const tw = s => s.length * 6.3 + 18;   // perkiraan lebar teks 11px

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
      for (let t = midnight(t0); t <= t1; t += step) if (t >= t0) ticks.push(t);
    } else {
      const n = step / DAY;
      for (let t = midnight(t0); t <= t1; t = midnight(t + 1.5 * DAY)) if (t >= t0 && dayNo(t) % n === 0) ticks.push(t);
    }
    return { step, ticks };
  }

  SB.chart = function (el, points, opts) {
    el._sb = { points, opts };              // dipakai saat perbesar/perkecil
    if (el._sbDrag) { el._sbPend = true; return; }   // sedang menyeret: gambar ulang setelah dilepas
    const o = Object.assign({ compact: false, labels: true, ticks: 5, hover: true, lastTip: true, nowLabel: false }, opts || {});
    const C = SB.config, th = C.thresholds, u = C.unit, F = SB.fmt;
    const rerender = () => SB.chart(el, el._sb.points, el._sb.opts);
    const all = (points || []).filter(p => p && isFinite(p.t) && isFinite(p.v));
    const now = Date.now();
    const b1 = o.to != null ? o.to : o.hours ? now : all.length ? all[all.length - 1].t : now;
    const b0 = o.from != null ? o.from : o.hours ? b1 - o.hours * HOUR : all.length ? all[0].t : b1 - DAY;

    /* perbesaran tersimpan per elemen; hilang bila rentang (24 jam/7 hari/30 hari) diganti */
    const key = o.hours ? 'h' + o.hours : b0 + '-' + b1;
    if (el._sbZoom && el._sbZoom.key !== key) el._sbZoom = null;
    const z = !o.compact && o.hover && el._sbZoom;
    const t0 = z ? Math.max(b0, z.from) : b0, t1 = z ? Math.min(b1, z.to) : b1;
    const span = Math.max(1, t1 - t0);

    /* data dalam rentang, plus satu titik di luar tiap tepi agar garis menyambung ke tepi */
    let i0 = all.findIndex(p => p.t >= t0); if (i0 < 0) i0 = all.length;
    let i1 = all.length; for (let i = all.length - 1; i >= 0; i--) if (all[i].t <= t1) { i1 = i + 1; break; } else i1 = i;
    const pts = all.slice(i0, i1);
    const before = i0 > 0 ? all[i0 - 1] : null, after = i1 < all.length ? all[i1] : null;

    const W = Math.max(200, Math.round(el.clientWidth || 600));
    const H = Math.max(60, Math.round(el.clientHeight || 200));
    const pad = o.compact ? { l: 2, r: 8, t: 10, b: 4 } : { l: 36, r: 16, t: 30, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, yMax = C.maxLevel;
    const X = t => pad.l + ((Math.min(Math.max(t, t0), t1) - t0) / span) * iw;
    const Y = v => pad.t + (1 - Math.min(Math.max(v, 0), yMax) / yMax) * ih;
    const long = span > 1.5 * DAY, multiDay = midnight(t0) !== midnight(t1);
    const when = t => (multiDay ? F.date(t) + ' ' : '') + F.time(t);
    const gid = 'cg' + Math.random().toString(36).slice(2, 8);

    /* ringkas bila rata-rata > 1,5 pembacaan per selang (selang ±3 px) */
    const size = BINS.find(s => span / s <= Math.max(20, iw / 3)) || DAY;
    const lim = SB.gapLimit ? SB.gapLimit(pts) : GAP;
    let gap = Math.max(lim, (span / iw) * 2);
    let segs = segments(pts, gap);
    const origin = midnight(t0);
    let bins = segs.map(s => bin(s, origin, size));
    const agg = pts.length > 1.5 * bins.reduce((n, b) => n + b.length, 0);
    if (agg && size * 1.5 > gap) { gap = Math.max(gap, size * 1.5); segs = segments(pts, gap); bins = segs.map(s => bin(s, origin, size)); }
    const edgeIn = before && pts.length && pts[0].t - before.t <= gap;
    const edgeOut = after && pts.length && after.t - pts[pts.length - 1].t <= gap;
    const last = pts[pts.length - 1];
    const L = [];

    L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafik ketinggian air ${long ? F.date(t0) + ' sampai ' + F.date(t1) : when(t0) + ' sampai ' + when(t1)}" font-family="Inter, system-ui, sans-serif">`);
    L.push(`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.pri}" stop-opacity="0.2"/><stop offset="1" stop-color="${P.pri}" stop-opacity="0.02"/></linearGradient>
      <pattern id="${gid}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${P.tx3}" stroke-opacity="0.16" stroke-width="1.5"/></pattern>
      <clipPath id="${gid}c"><rect x="${pad.l}" y="${pad.t - 4}" width="${iw}" height="${ih + 8}"/></clipPath></defs>`);

    /* zona status */
    if (!o.compact) {
      L.push(`<rect x="${pad.l}" y="${Y(yMax)}" width="${iw}" height="${Y(th.bahaya) - Y(yMax)}" fill="${P.dg}" fill-opacity="0.04"/>`);
      L.push(`<rect x="${pad.l}" y="${Y(th.bahaya)}" width="${iw}" height="${Y(th.siaga) - Y(th.bahaya)}" fill="${P.wr}" fill-opacity="0.055"/>`);
    }

    /* sumbu: tanda waktu + garis kisi tegak samar, label tepi kiri/kanan, angka tinggi */
    const tickLabs = [];
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
        L.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pad.t}" y2="${Y(0)}" stroke="${strong ? P.bd : P.grid}"/>`);
        tickLabs.push(`<text x="${x.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="11" font-weight="${strong ? 600 : 500}" fill="${strong ? P.tx2 : P.tx3}">${lab}</text>`);
      });
      tickLabs.push(`<text x="${W - pad.r}" y="${H - 7}" text-anchor="end" font-size="11" font-weight="${labR === 'Kini' ? 600 : 500}" fill="${labR === 'Kini' ? P.tx2 : P.tx3}">${labR}</text>`);
      tickLabs.push(`<text x="${pad.l}" y="${H - 7}" text-anchor="start" font-size="11" font-weight="500" fill="${P.tx3}">${labL}</text>`);
      [0, th.siaga, th.bahaya, yMax].forEach(v =>
        L.push(`<text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" font-weight="500" fill="${P.tx3}">${v}</text>`));
      L.push(`<text x="${pad.l - 8}" y="14" text-anchor="end" font-size="10.5" font-weight="600" fill="${P.tx3}">${u}</text>`);
      if (agg) L.push(`<text x="${W - pad.r}" y="14" text-anchor="end" font-size="10.5" font-weight="500" fill="${P.tx2}">${W < 480 ? 'Tertinggi per ' + durLabel(size) : 'Nilai tertinggi per ' + durLabel(size) + (o.hover ? ' · arahkan kursor untuk rincian' : '')}</text>`);
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
      L.push(`<rect x="${x.toFixed(1)}" y="${pad.t}" width="${w.toFixed(1)}" height="${ih}" fill="url(#${gid}h)"/>`);
      if (!o.compact && w >= tw(lab)) L.push(`<text x="${(x + w / 2).toFixed(1)}" y="${Y(th.siaga / 2) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${P.tx2}">${lab}</text>`);
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
    const f1 = n => n.toFixed(1);
    if (agg) {
      bins.forEach((bs, si) => {
        const seg = segs[si], lo = seg[0].t, hi = seg[seg.length - 1].t;
        const pt = bs.map(b => [X(Math.min(Math.max(b.t, lo), hi)), Y(b.max)]);
        if (si === 0 && edgeIn) pt[0][0] = X(t0);
        if (si === bins.length - 1 && edgeOut) pt[pt.length - 1][0] = X(t1);
        if (pt.length === 1) pt.push([Math.min(X(t1), pt[0][0] + 3), pt[0][1]]);
        const d = pt.map((q, i) => (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1])).join(' ');
        L.push(`<path d="${d} L${f1(pt[pt.length - 1][0])} ${Y(0)} L${f1(pt[0][0])} ${Y(0)} Z" fill="url(#${gid})"/>`);
        L.push(`<path d="${d}" fill="none" stroke="${P.pri}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      });
    } else {
      segs.forEach((seg, si) => {
        const s = seg.slice();
        if (si === 0 && edgeIn) s.unshift(before);
        if (si === segs.length - 1 && edgeOut) s.push(after);
        if (s.length === 1) { L.push(`<circle cx="${f1(X(s[0].t))}" cy="${f1(Y(s[0].v))}" r="2.5" fill="${P.pri}"/>`); return; }
        const d = s.map((p, i) => (i ? 'L' : 'M') + f1(X(p.t)) + ' ' + f1(Y(p.v))).join(' ');
        L.push(`<path d="${d} L${f1(X(s[s.length - 1].t))} ${Y(0)} L${f1(X(s[0].t))} ${Y(0)} Z" fill="url(#${gid})"/>`);
        L.push(`<path d="${d}" fill="none" stroke="${P.pri}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      });
    }
    L.push('</g>');

    const isLatest = last && !after;
    if (isLatest) L.push(`<circle cx="${X(last.t)}" cy="${Y(last.v)}" r="4.5" fill="${P.pri}" stroke="#fff" stroke-width="2"/>`);
    if (isLatest && o.lastTip && !o.compact && t1 - last.t <= gap) {
      const txt = F.level(last.v) + (o.tipTime ? ' · ' + F.time(last.t) : ''), w = tw(txt);
      const tx = Math.min(W - pad.r - w, Math.max(pad.l, X(last.t) - w - 10));
      const ty = Y(last.v) - 34 < pad.t - 6 ? Y(last.v) + 12 : Y(last.v) - 34;
      L.push(`<g><rect x="${tx}" y="${ty}" width="${w}" height="22" rx="7" fill="${P.tx}"/><text x="${tx + w / 2}" y="${ty + 15}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${txt}</text></g>`);
    }

    L.push(...tickLabs);

    const interactive = o.hover && !o.compact;
    if (interactive) {
      L.push(`<rect class="sel" x="0" y="${pad.t}" width="0" height="${ih}" fill="${P.pri}" fill-opacity="0.1" stroke="${P.pri}" stroke-opacity="0.5" style="display:none"/>`);
      L.push(`<g class="hv" style="display:none;pointer-events:none"><line class="hv-l" y1="${pad.t}" y2="${Y(0)}" stroke="${P.tx2}" stroke-dasharray="3 3"/><circle class="hv-c" r="5" fill="#fff" stroke="${P.pri}" stroke-width="2.5"/><rect class="hv-r" rx="7" fill="${P.tx}"/><text class="hv-t" font-size="11" font-weight="700" fill="#fff" text-anchor="middle"></text><text class="hv-t2" font-size="11" font-weight="500" fill="#CBD5E1" text-anchor="middle"></text></g>`);
      L.push(`<rect class="hit" x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent" style="cursor:crosshair"/>`);
    }
    L.push('</svg>');

    /* tombol perbesar */
    let tools = '';
    if (interactive) {
      const first = pts[0];
      if (z) tools = `<button type="button" class="ch-btn" data-z="reset">Tampilkan semua</button>`;
      else if (pts.length > 1 && last.t - first.t < 0.6 * span) tools = `<button type="button" class="ch-btn" data-z="fit">Perbesar ke data</button>`;
    }
    el.innerHTML = L.join('') + (tools ? `<div class="ch-tools" style="left:${pad.l}px">${tools}</div>` : '');
    if (!interactive) return;

    const zoomTo = (a, b) => {
      const minSpan = 15 * MIN;
      if (b - a < minSpan) { const c = (a + b) / 2; a = c - minSpan / 2; b = c + minSpan / 2; }
      a = Math.max(b0, a); b = Math.min(b1, b);
      el._sbZoom = { key, from: a, to: b };
      rerender();
    };
    const tb = el.querySelector('.ch-tools button');
    if (tb) tb.onclick = () => {
      if (tb.dataset.z === 'reset') { el._sbZoom = null; rerender(); return; }
      const ext = pts[pts.length - 1].t - pts[0].t, m = Math.max(ext * 0.06, 10 * MIN);
      zoomTo(pts[0].t - m, pts[pts.length - 1].t + m);
    };

    const svg = el.firstChild, g = svg.querySelector('.hv'), sel = svg.querySelector('.sel');
    const hl = g.querySelector('.hv-l'), hc = g.querySelector('.hv-c'), hr = g.querySelector('.hv-r'), ht = g.querySelector('.hv-t'), ht2 = g.querySelector('.hv-t2');
    const flat = agg ? [].concat(...bins) : pts;
    const toX = e => { const r = svg.getBoundingClientRect(); return (e.clientX - r.left) * (W / r.width); };
    const showAt = x => {
      if (x < pad.l || x > W - pad.r) { g.style.display = 'none'; return; }
      const t = t0 + ((x - pad.l) / iw) * span;
      let best = null;
      if (agg) best = flat.find(b => t >= b.a && t < b.b) || null;
      else for (const p of flat) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const has = !!best && (agg || Math.abs(best.t - t) <= gap);
      const v = has ? (agg ? best.max : best.v) : 0;
      const px = has ? X(best.t) : x;
      hl.setAttribute('x1', px); hl.setAttribute('x2', px);
      hc.style.display = has ? '' : 'none';
      if (has) { hc.setAttribute('cx', px); hc.setAttribute('cy', Y(v)); }
      let l1, l2 = '';
      if (!has) l1 = 'Tidak ada data · ' + when(t);
      else if (agg) { l1 = when(Math.max(best.a, t0)) + '–' + F.time(Math.min(best.b, t1)); l2 = `Tertinggi ${Math.round(best.max)} · rata-rata ${Math.round(best.avg)} · terendah ${Math.round(best.min)} ${u}`; }
      else l1 = F.level(best.v) + ' · ' + when(best.t);
      const w = Math.max(tw(l1), l2 ? l2.length * 5.9 + 18 : 0), h = l2 ? 38 : 22;
      let tx = px + 10; if (tx + w > W - pad.r) tx = px - w - 10; if (tx < 2) tx = 2;
      const ty = has ? Math.min(Math.max(2, Y(v) - h - 12), H - pad.b - h) : pad.t + 4;
      hr.setAttribute('x', tx); hr.setAttribute('y', ty); hr.setAttribute('width', w); hr.setAttribute('height', h);
      ht.setAttribute('x', tx + w / 2); ht.setAttribute('y', ty + 15); ht.textContent = l1;
      ht2.setAttribute('x', tx + w / 2); ht2.setAttribute('y', ty + 31); ht2.textContent = l2;
      g.style.display = '';
    };
    const clampX = x => Math.min(W - pad.r, Math.max(pad.l, x));

    svg.addEventListener('pointerdown', e => {
      const x = toX(e);
      if (e.pointerType === 'mouse' && e.button === 0 && x >= pad.l && x <= W - pad.r) {
        el._sbDrag = { x0: x, x1: x }; svg.setPointerCapture(e.pointerId);
      }
      el._sbHx = x; showAt(x);
    });
    svg.addEventListener('pointermove', e => {
      const x = toX(e), d = el._sbDrag;
      if (d) {
        d.x1 = clampX(x);
        if (Math.abs(d.x1 - d.x0) > 4) {
          g.style.display = 'none'; sel.style.display = '';
          sel.setAttribute('x', Math.min(d.x0, d.x1)); sel.setAttribute('width', Math.abs(d.x1 - d.x0));
          return;
        }
      }
      el._sbHx = x; showAt(x);
    });
    const end = () => {
      const d = el._sbDrag; if (!d) return;
      el._sbDrag = null;
      if (Math.abs(d.x1 - d.x0) >= 10) {
        const tA = t0 + ((Math.min(d.x0, d.x1) - pad.l) / iw) * span, tB = t0 + ((Math.max(d.x0, d.x1) - pad.l) / iw) * span;
        el._sbHx = null; el._sbPend = false; zoomTo(tA, tB);
      } else if (el._sbPend) { el._sbPend = false; rerender(); }   // data baru yang tertahan selama menyeret
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', () => { if (!el._sbDrag) { el._sbHx = null; g.style.display = 'none'; } });
    svg.addEventListener('dblclick', () => { if (el._sbZoom) { el._sbZoom = null; rerender(); } });
    if (el._sbHx != null) showAt(el._sbHx);   // pertahankan tooltip saat data baru masuk
  };

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
