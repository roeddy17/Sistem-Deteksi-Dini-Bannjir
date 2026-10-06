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
  ]
};
