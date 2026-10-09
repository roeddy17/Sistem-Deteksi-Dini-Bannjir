/*
 * LAPORAN CETAK (A4)
 * ------------------------------------------------------------------
 * Menyusun dokumen laporan khusus cetak/PDF di elemen #print-report, terpisah dari
 * tampilan layar: kop, identitas laporan, ringkasan, grafik, kejadian perubahan status,
 * tabel data lengkap, keterangan, dan blok pengesahan. Ukuran kertas dan margin diatur
 * di assets/css/cetak.css (@page A4).
 */
(function () {
  const C = SB.config, D = SB.data, F = SB.fmt, S = SB.status, esc = SB.ui.esc;
  const th = C.thresholds, HOUR = 3600e3;
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const pad = n => String(n).padStart(2, '0');
  const tgl = t => { const d = new Date(t); return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); };
  const tglJam = t => tgl(t) + ', ' + F.time(t) + ' WIT';
  const num = (v, d = 1) => v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = v => num(v * 100, 1) + '%';
  const durasi = ms => { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? `${h} jam ${m % 60} menit` : `${m} menit`; };
  const pill = s => `<span class="pr-st pr-${S.cls(s)}">${s}</span>`;

  function host() {
    let el = document.getElementById('print-report');
    if (!el) { el = document.createElement('div'); el.id = 'print-report'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
    return el;
  }

  /*
   * o: { hours, label, status, rows } — rows dari halaman Laporan (satu baris per 30 menit,
   *    sudah tersaring status), urut terbaru dulu.
   */
  function build(o) {
    const now = Date.now(), from = now - o.hours * HOUR, s = D.stats(o.hours);
    const sim = D.kind === 'simulasi';
    const rows = o.rows.slice().reverse();                                  // kronologis
    const evs = D.getEvents().filter(e => e.t >= from).slice().reverse();   // kronologis
    const nS = evs.filter(e => e.to === 'SIAGA' && S.rank(e.to) > S.rank(e.from)).length;
    const nB = evs.filter(e => e.to === 'BAHAYA').length;
    const span = o.hours * HOUR;
    const statusLabel = o.status === 'SEMUA' ? 'Semua status' : 'Hanya status ' + o.status;

    const el = host();
    el.innerHTML = `
      <header class="pr-kop">
        <div class="pr-logo">${SB.icon('waves', 30)}</div>
        <div class="pr-kop-t">
          <p class="pr-org">SISTEM DETEKSI DINI BANJIR BERBASIS IoT</p>
          <p class="pr-app">SiagaBanjir — Pemantauan Ketinggian Air ${esc(C.locationLabel)}</p>
          <p class="pr-for">Disusun untuk Pusat Pengendalian Operasi (Pusdalops) BPBD Provinsi Papua</p>
        </div>
      </header>

      <h1 class="pr-title">Laporan Data Historis Ketinggian Air</h1>
      <p class="pr-sub">${esc(o.label)} terakhir · ${tglJam(from)} s.d. ${tglJam(now)}</p>

      ${sim ? `<p class="pr-warn"><b>Catatan:</b> laporan ini disusun dari <b>data simulasi</b> untuk pengujian antarmuka, bukan pembacaan sensor di lapangan.</p>` : ''}

      <table class="pr-id">
        <tr><th>Lokasi pemantauan</th><td>${esc(C.sensorName)}, ${esc(C.locationLabel)}</td></tr>
        <tr><th>Periode laporan</th><td>${tglJam(from)} – ${tglJam(now)} (${esc(o.label.toLowerCase())})</td></tr>
        <tr><th>Sumber data</th><td>${sim ? 'Simulator data uji (mode simulasi)' : 'Sensor ultrasonik melalui Firebase Realtime Database'}</td></tr>
        <tr><th>Ambang batas status</th><td>Aman ≤ ${th.siaga} ${C.unit} · Siaga ${th.siaga}–${th.bahaya} ${C.unit} · Bahaya ≥ ${th.bahaya} ${C.unit}</td></tr>
        <tr><th>Saringan data rinci</th><td>${statusLabel}; satu baris per 30 menit (pembacaan terakhir pada tiap rentang)</td></tr>
        <tr><th>Tanggal cetak</th><td>${HARI[new Date(now).getDay()]}, ${tglJam(now)}</td></tr>
      </table>

      <h2 class="pr-h">1. Ringkasan</h2>
      ${s ? `<table class="pr-sum">
        <tr><th>Jumlah data tercatat</th><td>${s.count.toLocaleString('id-ID')} pembacaan</td><th>Rata-rata ketinggian</th><td>${num(s.avg)} ${C.unit}</td></tr>
        <tr><th>Ketinggian tertinggi</th><td>${num(s.max.v)} ${C.unit} <span class="pr-m">(${tgl(s.max.t)}, ${F.time(s.max.t)})</span></td><th>Ketinggian terendah</th><td>${num(s.min.v)} ${C.unit} <span class="pr-m">(${tgl(s.min.t)}, ${F.time(s.min.t)})</span></td></tr>
        <tr><th>Kejadian naik ke Siaga</th><td>${nS} kali</td><th>Kejadian naik ke Bahaya</th><td>${nB} kali</td></tr>
        <tr><th>Durasi di atas batas siaga</th><td colspan="3">${durasi(s.aboveSiaga)} (${pct(s.aboveSiaga / span)} dari periode)</td></tr>
      </table>
      <p class="pr-cap">Sebaran waktu menurut status</p>
      <table class="pr-grid pr-dist">
        <thead><tr><th>Status</th><th>Rentang ketinggian</th><th class="r">Persentase waktu</th><th class="r">Perkiraan durasi</th></tr></thead>
        <tbody>${S.order.map(k => `<tr><td>${pill(k)}</td><td>${k === 'AMAN' ? `≤ ${th.siaga}` : k === 'SIAGA' ? `${th.siaga} – ${th.bahaya}` : `≥ ${th.bahaya}`} ${C.unit}</td><td class="r">${pct(s.dist[k])}</td><td class="r">${durasi(s.dist[k] * span)}</td></tr>`).join('')}</tbody>
      </table>` : '<p>Tidak ada data pada periode ini.</p>'}

      <h2 class="pr-h">2. Grafik ketinggian air</h2>
      <figure class="pr-fig"><div class="pr-chart" id="pr-chart"></div>
        <figcaption>Gambar 1. Ketinggian air ${esc(C.sensorName)} periode ${tgl(from)} – ${tgl(now)}. Garis putus-putus menunjukkan batas siaga (${th.siaga} ${C.unit}) dan batas bahaya (${th.bahaya} ${C.unit}).</figcaption></figure>

      <h2 class="pr-h">3. Kejadian perubahan status</h2>
      ${evs.length ? `<table class="pr-grid">
        <thead><tr><th class="c">No.</th><th>Tanggal</th><th>Waktu</th><th>Perubahan status</th><th class="r">Ketinggian</th></tr></thead>
        <tbody>${evs.map((e, i) => `<tr><td class="c">${i + 1}</td><td>${tgl(e.t)}</td><td>${F.time(e.t)} WIT</td><td>${pill(e.from)} → ${pill(e.to)}</td><td class="r">${num(e.level)} ${C.unit}</td></tr>`).join('')}</tbody>
      </table>` : '<p>Tidak ada perubahan status pada periode ini.</p>'}

      <h2 class="pr-h">4. Data rinci</h2>
      ${rows.length ? `<table class="pr-grid pr-data">
        <thead><tr><th class="c">No.</th><th>Tanggal</th><th>Waktu</th><th class="r">Ketinggian</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${F.dateNum(r.t)}</td><td>${F.time(r.t)}</td><td class="r">${num(r.v)} ${C.unit}</td><td>${pill(r.s)}</td><td>${r.note || ''}</td></tr>`).join('')}</tbody>
      </table>
      <p class="pr-note">Jumlah baris: ${rows.length.toLocaleString('id-ID')}. Nilai ketinggian ditampilkan satu angka desimal; status ditentukan dari nilai yang dibulatkan ke 1 ${C.unit} sesuai resolusi sensor.</p>` : '<p>Tidak ada data untuk saringan ini.</p>'}

      <section class="pr-end">
        <p class="pr-cap">Keterangan</p>
        <ul class="pr-ket">
          <li><b>AMAN</b>: ketinggian air ≤ ${th.siaga} ${C.unit}; kondisi normal.</li>
          <li><b>SIAGA</b>: ketinggian air di atas ${th.siaga} ${C.unit} dan di bawah ${th.bahaya} ${C.unit}; warga diminta waspada.</li>
          <li><b>BAHAYA</b>: ketinggian air ≥ ${th.bahaya} ${C.unit}; warga diarahkan menuju titik kumpul.</li>
        </ul>
        <div class="pr-sign">
          <p>Jayapura, ${tgl(now)}</p>
          <p>Petugas Pusdalops</p>
          <p>BPBD Provinsi Papua</p>
          <div class="pr-sign-space"></div>
          <p class="pr-sign-name">(......................................................)</p>
          <p class="pr-m">NIP.</p>
        </div>
      </section>`;

    SB.chart(el.querySelector('#pr-chart'), D.getHistory(o.hours), { from, to: now, ticks: 7, hover: false, lastTip: false, nowLabel: false });
    const d = new Date(now);
    return `Laporan Ketinggian Air ${C.locationLabel} - ${o.label} - ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* Susun laporan, buka dialog cetak (simpan sebagai PDF), lalu kembalikan tampilan */
  let keepTitle = null;
  function cleanup() {
    document.body.classList.remove('has-report');
    if (keepTitle !== null) { document.title = keepTitle; keepTitle = null; }
  }
  window.addEventListener('afterprint', cleanup);

  SB.laporanCetak = {
    build(o) {
      const name = build(o);
      document.body.classList.add('has-report');
      if (keepTitle === null) keepTitle = document.title;
      document.title = name;   // dipakai browser sebagai nama berkas PDF
    },
    print(o) { this.build(o); window.print(); },
    cleanup
  };
})();
