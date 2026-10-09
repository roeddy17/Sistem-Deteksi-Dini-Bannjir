/*
 * Grafik garis SVG: zona status, garis ambang, tooltip saat disentuh, ekspor PNG.
 *
 *   SB.chart(el, points, { hours })      sumbu waktu = <hours> jam terakhir s.d. sekarang
 *   SB.chart(el, points, { from, to })   sumbu waktu = rentang tertentu
 *
 * Sumbu waktu selalu mengikuti rentang yang dipilih (bukan rentang data yang ada), sehingga
 * 24 jam / 7 hari / 30 hari tampil berbeda walaupun riwayat alat baru sebentar. Bagian
 * rentang tanpa data (alat belum aktif atau mati) diberi arsiran dan garis tidak disambung
 * melewatinya.
 */
(function () {
  const P = { pri: '#0E5AA7', wr: '#F59E0B', wrt: '#B45309', dg: '#DC2626', dgt: '#B91C1C', bd: '#E5EAF0', grid: '#EEF2F6', tx3: '#94A3B8', tx2: '#64748B', tx: '#0F172A' };
  const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
  /* jarak antar-pembacaan yang dianggap "putus" (alat mati / tidak mengirim) */
  const GAP = 10 * MIN;
  const STEPS = [HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY];

  const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayNo = t => { const d = new Date(t); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY); };

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

  /* perkecil jumlah titik per kolom waktu, tetap menyimpan puncak & lembah */
  function thin(seg, t0, bucket) {
    if (seg.length <= 3) return seg;
    const out = []; let key = null, lo = null, hi = null;
    const flush = () => { if (!lo) return; if (lo === hi) out.push(lo); else if (lo.t < hi.t) out.push(lo, hi); else out.push(hi, lo); };
    seg.forEach(p => {
      const k = Math.floor((p.t - t0) / bucket);
      if (k !== key) { flush(); key = k; lo = hi = p; return; }
      if (p.v < lo.v) lo = p; if (p.v > hi.v) hi = p;
    });
    flush();
    const last = seg[seg.length - 1];
    if (out[out.length - 1] !== last) out.push(last);   // titik terakhir (nilai terkini) selalu ada
    return out;
  }

  /* posisi tanda waktu yang "rapi": jam bulat untuk 24 jam, tengah malam untuk rentang hari */
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
    const o = Object.assign({ compact: false, labels: true, ticks: 5, hover: true, lastTip: true, nowLabel: false }, opts || {});
    const C = SB.config, th = C.thresholds, u = C.unit, F = SB.fmt;
    points = (points || []).filter(p => p && isFinite(p.t) && isFinite(p.v));
    const now = Date.now();
    const t1 = o.to != null ? o.to : o.hours ? now : points.length ? points[points.length - 1].t : now;
    const t0 = o.from != null ? o.from : o.hours ? t1 - o.hours * HOUR : points.length ? points[0].t : t1 - DAY;
    const span = Math.max(1, t1 - t0);
    points = points.filter(p => p.t >= t0 - MIN && p.t <= t1 + MIN);

    const W = Math.max(200, Math.round(el.clientWidth || 600));
    const H = Math.max(60, Math.round(el.clientHeight || 200));
    const pad = o.compact ? { l: 2, r: 8, t: 10, b: 4 } : { l: 36, r: 16, t: 14, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, yMax = C.maxLevel;
    const X = t => pad.l + ((Math.min(Math.max(t, t0), t1) - t0) / span) * iw;
    const Y = v => pad.t + (1 - Math.min(Math.max(v, 0), yMax) / yMax) * ih;
    const long = span > 1.5 * DAY;
    const gid = 'cg' + Math.random().toString(36).slice(2, 8);
    /* batas putus: lihat SB.gapLimit (data.js), dan tak kurang dari lebar ±2 piksel agar 30 hari tidak terpotong-potong */
    const gap = Math.max(SB.gapLimit ? SB.gapLimit(points) : GAP, (span / iw) * 2);
    const segs = segments(points, gap);
    const bucket = Math.max(1, span / (iw / 2));
    const draw = segs.map(s => thin(s, t0, bucket));
    const last = points[points.length - 1];
    const L = [];

    L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafik ketinggian air ${long ? F.date(t0) + ' sampai ' + F.date(t1) : F.time(t0) + ' sampai ' + F.time(t1)}" font-family="Inter, system-ui, sans-serif">`);
    L.push(`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.pri}" stop-opacity="0.2"/><stop offset="1" stop-color="${P.pri}" stop-opacity="0.02"/></linearGradient>
      <pattern id="${gid}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${P.tx3}" stroke-opacity="0.22" stroke-width="1.5"/></pattern></defs>`);

    /* zona status */
    if (!o.compact) {
      L.push(`<rect x="${pad.l}" y="${Y(yMax)}" width="${iw}" height="${Y(th.bahaya) - Y(yMax)}" fill="${P.dg}" fill-opacity="0.045"/>`);
      L.push(`<rect x="${pad.l}" y="${Y(th.bahaya)}" width="${iw}" height="${Y(th.siaga) - Y(th.bahaya)}" fill="${P.wr}" fill-opacity="0.06"/>`);
    }

    /* tanda waktu + garis kisi tegak (samar) */
    const tickLabs = [];
    if (!o.compact) {
      const maxTicks = Math.max(2, Math.min(o.ticks + 3, Math.floor(iw / (long ? 62 : 52))));
      const { step, ticks } = timeTicks(t0, t1, maxTicks);
      ticks.forEach(t => {
        const x = X(t);
        const edge = long ? 52 : 44;   // ruang untuk label awal & akhir rentang
        if (x < pad.l + edge || x > W - pad.r - edge) return;
        const isMid = t === midnight(t);
        const lab = step >= DAY || (isMid && span > 6 * HOUR) ? F.date(t) : F.time(t);
        L.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pad.t}" y2="${Y(0)}" stroke="${isMid && step < DAY ? P.bd : P.grid}"/>`);
        tickLabs.push(`<text x="${x.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="11" font-weight="${isMid && step < DAY ? 600 : 500}" fill="${isMid && step < DAY ? P.tx2 : P.tx3}">${lab}</text>`);
      });
      if (o.nowLabel) tickLabs.push(`<text x="${W - pad.r}" y="${H - 7}" text-anchor="end" font-size="11" font-weight="600" fill="${P.tx2}">Kini</text>`);
      else tickLabs.push(`<text x="${W - pad.r}" y="${H - 7}" text-anchor="end" font-size="11" font-weight="500" fill="${P.tx3}">${long ? F.date(t1) : F.time(t1)}</text>`);
      tickLabs.push(`<text x="${pad.l}" y="${H - 7}" text-anchor="start" font-size="11" font-weight="500" fill="${P.tx3}">${long ? F.date(t0) : F.time(t0)}</text>`);
      [0, th.siaga, th.bahaya, yMax].forEach(v =>
        L.push(`<text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" font-weight="500" fill="${P.tx3}">${v}</text>`));
    }

    /* bagian tanpa data: sebelum data pertama, di antara ruas, dan setelah data terakhir */
    const holes = [];
    if (!points.length) holes.push([t0, t1, 'Belum ada data pada rentang ini']);
    else {
      if (points[0].t - t0 > gap) holes.push([t0, points[0].t, 'Belum ada data']);
      for (let i = 1; i < segs.length; i++) holes.push([segs[i - 1][segs[i - 1].length - 1].t, segs[i][0].t, 'Tidak ada data']);
      if (t1 - last.t > gap) holes.push([last.t, t1, 'Alat tidak mengirim data']);
    }
    holes.forEach(([a, b, lab]) => {
      const x = X(a), w = X(b) - x; if (w < 1) return;
      L.push(`<rect x="${x.toFixed(1)}" y="${pad.t}" width="${w.toFixed(1)}" height="${ih}" fill="url(#${gid}h)"/>`);
      if (!o.compact && w >= lab.length * 6 + 16) L.push(`<text x="${(x + w / 2).toFixed(1)}" y="${Y(th.siaga / 2) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${P.tx2}">${lab}</text>`);
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

    /* garis data per ruas */
    draw.forEach(seg => {
      if (seg.length === 1) {
        L.push(`<circle cx="${X(seg[0].t).toFixed(1)}" cy="${Y(seg[0].v).toFixed(1)}" r="2.5" fill="${P.pri}"/>`);
        return;
      }
      const d = seg.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
      L.push(`<path d="${d} L${X(seg[seg.length - 1].t).toFixed(1)} ${Y(0)} L${X(seg[0].t).toFixed(1)} ${Y(0)} Z" fill="url(#${gid})"/>`);
      L.push(`<path d="${d}" fill="none" stroke="${P.pri}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    });

    if (last) L.push(`<circle cx="${X(last.t)}" cy="${Y(last.v)}" r="4.5" fill="${P.pri}" stroke="#fff" stroke-width="2"/>`);

    if (last && o.lastTip && !o.compact) {
      const txt = F.level(last.v) + (o.tipTime ? ' · ' + F.time(last.t) : '');
      const tw = txt.length * 6.6 + 18;
      const tx = Math.min(W - pad.r - tw, Math.max(pad.l, X(last.t) - tw - 10));
      const ty = Y(last.v) - 34 < pad.t ? Y(last.v) + 12 : Y(last.v) - 34;
      L.push(`<g><rect x="${tx}" y="${ty}" width="${tw}" height="22" rx="7" fill="${P.tx}"/><text x="${tx + tw / 2}" y="${ty + 15}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${txt}</text></g>`);
    }

    L.push(...tickLabs);

    if (o.hover && !o.compact) {
      L.push(`<g class="hv" style="display:none;pointer-events:none"><line class="hv-l" y1="${pad.t}" y2="${Y(0)}" stroke="${P.tx2}" stroke-dasharray="3 3"/><circle class="hv-c" r="5" fill="#fff" stroke="${P.pri}" stroke-width="2.5"/><rect class="hv-r" height="22" rx="7" fill="${P.tx}"/><text class="hv-t" font-size="11" font-weight="700" fill="#fff" text-anchor="middle"></text></g>`);
      L.push(`<rect class="hit" x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/>`);
    }
    L.push('</svg>');
    el.innerHTML = L.join('');

    if (o.hover && !o.compact) {
      const all = [].concat(...draw);
      const svg = el.firstChild, g = svg.querySelector('.hv');
      const hl = g.querySelector('.hv-l'), hc = g.querySelector('.hv-c'), hr = g.querySelector('.hv-r'), ht = g.querySelector('.hv-t');
      const show = e => {
        const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
        if (x < pad.l || x > W - pad.r) { g.style.display = 'none'; return; }
        const t = t0 + ((x - pad.l) / iw) * span;
        let best = null;
        for (const p of all) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
        const has = best && Math.abs(best.t - t) <= gap;
        const px = has ? X(best.t) : x;
        hl.setAttribute('x1', px); hl.setAttribute('x2', px);
        hc.style.display = has ? '' : 'none';
        if (has) { hc.setAttribute('cx', px); hc.setAttribute('cy', Y(best.v)); }
        const when = tt => (long ? F.date(tt) + ' ' : '') + F.time(tt);
        const txt = has ? F.level(best.v) + ' · ' + when(best.t) : 'Tidak ada data · ' + when(t);
        const tw = txt.length * 6.4 + 18;
        let tx = px + 10; if (tx + tw > W - pad.r) tx = px - tw - 10;
        const ty = has ? Math.max(2, Y(best.v) - 34) : pad.t + 4;
        hr.setAttribute('x', tx); hr.setAttribute('y', ty); hr.setAttribute('width', tw);
        ht.setAttribute('x', tx + tw / 2); ht.setAttribute('y', ty + 15); ht.textContent = txt;
        g.style.display = '';
      };
      svg.addEventListener('pointermove', show);
      svg.addEventListener('pointerdown', show);
      svg.addEventListener('pointerleave', () => { g.style.display = 'none'; });
    }
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
