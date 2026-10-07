/*
 * KONFIGURASI SISTEM — SiagaBanjir
 * ------------------------------------------------------------------
 * Semua nilai yang mungkin berubah setelah validasi dengan BPBD
 * dikumpulkan di sini, sehingga tampilan tidak perlu diubah.
 *
 * Ambang batas status mengikuti prototipe sensor (Oktavian et al., 2026):
 *   AMAN   : ketinggian <= 10 cm
 *   SIAGA  : ketinggian > 10 cm dan < 20 cm
 *   BAHAYA : ketinggian >= 20 cm
 * Wadah uji prototipe setinggi 30 cm (maxLevel).
 */
window.SB = window.SB || {};

SB.config = {
  appName: 'SiagaBanjir',
  sensorName: 'Sensor Prototipe',
  locationLabel: 'Kali Acai, Abepura',
  locationNote: 'Rencana pemasangan · Kali Acai, Abepura',

  unit: 'cm',
  maxLevel: 30,
  thresholds: { siaga: 10, bahaya: 20 },

  /* Sumber data: 'simulasi' (data uji) atau 'firebase' (tahap integrasi) */
  dataSource: 'simulasi',

  simulator: {
    intervalMs: 3000,   // jeda antar pembacaan simulasi
    initialLevel: 15    // ketinggian awal (cm)
  },

  /* Diisi pada tahap integrasi Firebase Realtime Database */
  firebase: {
    apiKey: '',
    databaseURL: '',
    path: '/sensor'
  },

  /* Klasifikasi zona rawan pada peta: indeks InaRISK (BNPB), skala 0–1 */
  zoneIndex: [
    { key: 'rendah', label: 'Rendah', range: '0 – 0,3' },
    { key: 'sedang', label: 'Sedang', range: '0,3 – 0,6' },
    { key: 'tinggi', label: 'Tinggi', range: '0,6 – 1' }
  ],

  /*
   * PETA (Leaflet). Zona rawan berbentuk area (poligon) dari BPBD, urutan sumbernya:
   *   1. arcgisLayerUrl — layer publik BPBD di ArcGIS Online (tersinkron otomatis)
   *   2. myMapsId       — My Maps publik (dicoba dibaca langsung; bila diblokir browser,
   *                        otomatis memakai berkas di zonesFile)
   *   3. zonesFile      — berkas .kml atau .geojson di folder assets/data (KMZ diekstrak dulu menjadi KML)
   * Selama data BPBD belum ada, zonesFile berisi DATA CONTOH (bukan data BPBD); data contoh
   * tidak ditampilkan bila layer InaRISK di bawah aktif.
   */
  map: {
    /* Indeks bahaya banjir resmi InaRISK (BNPB), layanan ArcGIS ImageServer publik.
       Ditampilkan sebagai lapisan warna; nilai indeks di titik GPS dibaca lewat "identify". */
    inarisk: {
      url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer',
      opacity: 0.6,
      /* Pilihan indeks lain di panel BPBD (layanan publik yang sama, folder inarisk) */
      others: [
        { key: 'risiko', label: 'Indeks risiko banjir', url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_risiko_banjir/ImageServer' },
        { key: 'kerentanan', label: 'Indeks kerentanan banjir', url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_kerentanan_banjir/ImageServer' },
        { key: 'bandang', label: 'Indeks bahaya banjir bandang', url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir_bandang/ImageServer' }
      ]
    },
    /* Batas administrasi (BNPB), layanan ArcGIS MapServer publik. Lapisan 1–4: provinsi, kabupaten/kota,
       kecamatan/distrik, desa/kelurahan; kolom NAMA_PROP, NAMA_KAB, NAMA_KEC, NAMA_KEL */
    adminUrl: 'https://gis.bnpb.go.id/server/rest/services/Basemap/batas_administrasi/MapServer',
    sensor: { lat: -2.6025, lng: 140.6690 },   // PERKIRAAN titik sensor di Kali Acai — ganti dengan koordinat asli
    sensorApprox: true,                        // true = tampilkan keterangan "titik perkiraan"
    zoom: 15,
    basemap: 'hybrid',                         // 'hybrid' (satelit + nama tempat), 'satelit', atau 'jalan'

    arcgisLayerUrl: '',                        // contoh: https://services.arcgis.com/xxx/arcgis/rest/services/Bahaya_Banjir/FeatureServer/0
    myMapsId: '',                              // nilai "mid=" pada tautan My Maps
    zonesFile: 'assets/data/zona-contoh.kml',
    zonesSample: true,                         // true = berkas di atas adalah data contoh (diberi label di peta)

    /* Kolom atribut yang berisi kelas zona (teks "Rendah/Sedang/Tinggi") atau indeks 0–1.
       Kosongkan untuk deteksi otomatis (KELAS, kelas, class, INDEKS, indeks, index, name, ...) */
    zoneField: ''
  }
};
