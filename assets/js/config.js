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
  dataSource: 'firebase',

  simulator: {
    intervalMs: 1000,   // jeda antar pembacaan simulasi (meniru sensor yang mengirim tiap 1 detik)
    response: 1,        // 1 = nilai langsung mengikuti target (seperti sensor); < 1 = naik/turun perlahan
    logEveryMs: 30000,  // pembacaan disimpan ke riwayat paling sering tiap 30 detik (nilai terkini tetap real-time)
    initialLevel: 15    // ketinggian awal (cm)
  },

  /* Masuk petugas BPBD. enabled:false menonaktifkan gerbang (tidak disarankan saat dipublikasikan).
     Mode firebase memakai Firebase Authentication; mode simulasi memakai akun demo di bawah. */
  auth: { enabled: true, demo: { email: 'petugas@bpbd.demo', password: 'demo1234' } },

  /* Diisi pada tahap integrasi Firebase Realtime Database */
  firebase: {
    apiKey: 'AIzaSyC9S7lVXsXgH6wmkHPoOBWE9JWP-2jeuWI',   // bukan rahasia; keamanan diatur oleh aturan database
    databaseURL: 'https://siagabanjir-f2c62-default-rtdb.asia-southeast1.firebasedatabase.app',
    authDomain: 'siagabanjir-f2c62.firebaseapp.com',
    projectId: 'siagabanjir-f2c62',
    /* Notifikasi push (FCM). Isi dari Firebase Console > Project settings:
       General > Your apps > Web app (messagingSenderId, appId) dan Cloud Messaging > Web Push certificates (vapidKey).
       Selama kosong, notifikasi hanya muncul saat halaman terbuka. */
    messagingSenderId: '',
    appId: '',
    vapidKey: '',
    path: '/sensor',               // /sensor/latest {level, ts} dan /sensor/history/<id> {level, ts}
    sdk: 'https://www.gstatic.com/firebasejs/10.14.1/',
    waitMs: 8000                   // batas tunggu data pertama sebelum tampilan dibuka
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
   * zona-contoh.kml adalah DATA CONTOH (bukan data BPBD); bila zonesSample true, data contoh
   * tidak ditampilkan selama layer InaRISK aktif.
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
    basemap: 'jalan',                          // 'jalan' (OpenStreetMap: nama jalan, kampung, tempat), 'hybrid' (satelit + label), 'satelit'
    /* Tempat penting (fasilitas kesehatan, sekolah, ibadah, kafe, hotel, dll.) dari OpenStreetMap via Overpass API.
       Dimuat untuk area yang terlihat saat peta di-zoom cukup dekat (minZoom). Kosongkan url untuk mematikan. */
    poi: { url: 'https://overpass-api.de/api/interpreter', minZoom: 15, labelZoom: 17 },

    arcgisLayerUrl: '',                        // contoh: https://services.arcgis.com/xxx/arcgis/rest/services/Bahaya_Banjir/FeatureServer/0
    myMapsId: '',                              // nilai "mid=" pada tautan My Maps
    zonesFile: 'assets/data/zona-bpbd-banjir-jayapura.kml',   // dari banjir_jpr.kmz (BPBD Prov. Papua, Okt 2026)
    zonesSample: false,                        // true = berkas di atas adalah data contoh (zona-contoh.kml)
    zonesLabel: 'Peta bahaya banjir BPBD Prov. Papua (Okt 2026)',
    /* Kolom atribut yang berisi kelas zona (teks "Rendah/Sedang/Tinggi") atau indeks 0–1.
       Kosongkan untuk deteksi otomatis (KELAS, kelas, class, INDEKS, indeks, index, name, ...) */
    zoneField: 'Kls_Bahaya'                    // kolom kelas zona pada data BPBD
  }
};

/* Demo tanpa alat: tambahkan ?simulasi pada alamat, mis. warga.html?simulasi atau bpbd.html?simulasi */
if (/[?&]simulasi(=|&|$)/.test(location.search)) SB.config.dataSource = 'simulasi';
