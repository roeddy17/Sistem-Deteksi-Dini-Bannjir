/* Grafik garis SVG: zona status, garis ambang, tooltip saat disentuh, ekspor PNG. */
(function () {
  const P = { pri: '#0E5AA7', wr: '#F59E0B', wrt: '#B45309', dg: '#DC2626', dgt: '#B91C1C', bd: '#E5EAF0', tx3: '#94A3B8', tx: '#0F172A' };
  const DAY = 864e5;

  function downsample(points, max) {
    if (points.length <= max) return points;
    const out = [], step = (points.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
    return out;
  }

  SB.chart = function (el, points, opts) {
    const o = Object.assign({ compact: false, labels: true, ticks: 5, hover: true, lastTip: true, nowLabel: false }, opts || {});
    if (!points || points.length < 2) { el.innerHTML = '<p class="empty-s">Data belum tersedia.</p>'; return; }
    const C = SB.config, th = C.thresholds, u = C.unit, F = SB.fmt;
    const W = Math.max(200, Math.round(el.clientWidth || 600));
    const H = Math.max(60, Math.round(el.clientHeight || 200));
    const pad = o.compact ? { l: 2, r: 8, t: 10, b: 4 } : { l: 36, r: 14, t: 14, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, yMax = C.maxLevel;
    const t0 = o.from != null ? o.from : points[0].t;
    const t1 = o.to != null ? o.to : points[points.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const X = t => pad.l + ((t - t0) / span) * iw;
    const Y = v => pad.t + (1 - Math.min(v, yMax) / yMax) * ih;
    const pts = downsample(points, Math.max(40, Math.floor(iw / 3)));
    const gid = 'cg' + Math.random().toString(36).slice(2, 8);
    const long = span > 1.5 * DAY;
    const L = [];

    L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafik ketinggian air" font-family="Inter, system-ui, sans-serif">`);
    L.push(`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.pri}" stop-opacity="0.22"/><stop offset="1" stop-color="${P.pri}" stop-opacity="0"/></linearGradient></defs>`);

    if (!o.compact) {
      L.push(`<rect x="${pad.l}" y="${Y(yMax)}" width="${iw}" height="${Y(th.bahaya) - Y(yMax)}" fill="${P.dg}" fill-opacity="0.05"/>`);
      L.push(`<rect x="${pad.l}" y="${Y(th.bahaya)}" width="${iw}" height="${Y(th.siaga) - Y(th.bahaya)}" fill="${P.wr}" fill-opacity="0.07"/>`);
      [0, th.siaga, th.bahaya, yMax].forEach(v =>
        L.push(`<text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" font-weight="500" fill="${P.tx3}">${v}</text>`));
      L.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="${P.bd}"/>`);
    }

    const lines = o.compact
      ? [[th.siaga, P.wr, 'Siaga', P.wrt]]
      : [[th.bahaya, P.dg, `Bahaya ${th.bahaya} ${u}`, P.dgt], [th.siaga, P.wr, `Siaga ${th.siaga} ${u}`, P.wrt]];
    lines.forEach(([v, c, lab, tc]) => {
      L.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
      if (o.labels) L.push(`<text x="${pad.l + 6}" y="${Y(v) - 6}" font-size="11" font-weight="700" fill="${tc}">${lab}</text>`);
    });

    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
    const first = pts[0], last = pts[pts.length - 1];
    L.push(`<path d="${d} L${X(last.t).toFixed(1)} ${Y(0)} L${X(first.t).toFixed(1)} ${Y(0)} Z" fill="url(#${gid})"/>`);
    L.push(`<path d="${d}" fill="none" stroke="${P.pri}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);
    L.push(`<circle cx="${X(last.t)}" cy="${Y(last.v)}" r="5" fill="${P.pri}" stroke="#fff" stroke-width="2.5"/>`);

    if (o.lastTip && !o.compact) {
      const txt = F.level(last.v) + (o.tipTime ? ' · ' + F.time(last.t) : '');
      const tw = txt.length * 6.6 + 18;
      const tx = Math.max(pad.l, X(last.t) - tw - 10), ty = Math.max(2, Y(last.v) - 34);
      L.push(`<g><rect x="${tx}" y="${ty}" width="${tw}" height="22" rx="7" fill="${P.tx}"/><text x="${tx + tw / 2}" y="${ty + 15}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${txt}</text></g>`);
    }

    if (!o.compact) {
      for (let i = 0; i < o.ticks; i++) {
        const t = t0 + (span * i) / (o.ticks - 1);
        const lab = i === o.ticks - 1 && o.nowLabel ? 'Kini' : long ? F.date(t) : F.time(t);
        const anchor = i === 0 ? 'start' : i === o.ticks - 1 ? 'end' : 'middle';
        L.push(`<text x="${X(t)}" y="${H - 6}" text-anchor="${anchor}" font-size="11" font-weight="500" fill="${P.tx3}">${lab}</text>`);
      }
    }

    if (o.hover && !o.compact) {
      L.push(`<g class="hv" style="display:none;pointer-events:none"><line class="hv-l" y1="${pad.t}" y2="${Y(0)}" stroke="${P.tx3}" stroke-dasharray="3 3"/><circle class="hv-c" r="5" fill="#fff" stroke="${P.pri}" stroke-width="2.5"/><rect class="hv-r" height="22" rx="7" fill="${P.tx}"/><text class="hv-t" font-size="11" font-weight="700" fill="#fff" text-anchor="middle"></text></g>`);
      L.push(`<rect class="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent"/>`);
    }
    L.push('</svg>');
    el.innerHTML = L.join('');

    if (o.hover && !o.compact) {
      const svg = el.firstChild, g = svg.querySelector('.hv');
      const hl = g.querySelector('.hv-l'), hc = g.querySelector('.hv-c'), hr = g.querySelector('.hv-r'), ht = g.querySelector('.hv-t');
      svg.addEventListener('pointermove', e => {
        const r = svg.getBoundingClientRect(), x = e.clientX - r.left;
        if (x < pad.l || x > W - pad.r) { g.style.display = 'none'; return; }
        const t = t0 + ((x - pad.l) / iw) * span;
        let best = pts[0];
        for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
        const px = X(best.t), py = Y(best.v);
        hl.setAttribute('x1', px); hl.setAttribute('x2', px);
        hc.setAttribute('cx', px); hc.setAttribute('cy', py);
        const txt = F.level(best.v) + ' · ' + (long ? F.date(best.t) + ' ' : '') + F.time(best.t);
        const tw = txt.length * 6.4 + 18;
        let tx = px + 10; if (tx + tw > W - pad.r) tx = px - tw - 10;
        const ty = Math.max(2, py - 34);
        hr.setAttribute('x', tx); hr.setAttribute('y', ty); hr.setAttribute('width', tw);
        ht.setAttribute('x', tx + tw / 2); ht.setAttribute('y', ty + 15); ht.textContent = txt;
        g.style.display = '';
      });
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
