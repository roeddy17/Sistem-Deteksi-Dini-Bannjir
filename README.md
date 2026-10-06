# SiagaBanjir — Implementasi Antarmuka Web

Implementasi antarmuka web untuk **Prototype Sistem Deteksi Dini Banjir Berbasis IoT** (tahap *Design Solutions*, metode UCD).
Dibangun dengan HTML, CSS, dan JavaScript tanpa framework, mengikuti mockup dan Design System di Figma.

- `warga.html` — web responsif untuk HP (masyarakat sekitar Kali Acai); menyesuaikan HP kecil (320 px) sampai tablet
- `bpbd.html` — panel web BPBD Provinsi Papua: sidebar penuh di desktop, rail ikon di tablet (768–1100 px), navigasi bawah di HP (< 768 px)

Halaman **Riwayat** (warga) dan **Notifikasi** (BPBD) menampilkan satu hari per tampilan (bawaan: hari ini). Gunakan pemilih hari (‹ kalender ›) untuk melihat hari lain, maksimal 30 hari ke belakang dan tidak bisa melewati hari ini. Daftar bergulir di dalam kartu, sedangkan layar utama tetap diam.
- `index.html` — halaman pilihan tampilan

## Cara menjalankan

**Cara cepat:** klik dua kali `index.html` (dibuka di Chrome atau Edge).

**Disarankan (agar sinkronisasi antar-tab dan notifikasi stabil):** jalankan server lokal dari folder ini:

```
python -m http.server 8000
```

lalu buka `http://localhost:8000` di browser.

Jika perubahan kode belum terlihat, tekan **Ctrl+F5** (atau Ctrl+Shift+R) untuk memuat ulang tanpa cache. Setiap kali CSS/JS diubah, naikkan angka versi `?v=` pada tautan berkas di `index.html`, `warga.html`, dan `bpbd.html` agar browser mengambil berkas terbaru. Untuk mencoba dari HP, sambungkan HP ke WiFi yang sama dan buka `http://<IP-laptop>:8000/warga.html`.

## Mode simulasi

Selama sensor belum terhubung, data berasal dari **simulator** (lihat tombol *Simulator* di pojok kanan bawah):

- Geser target ketinggian air, atau pilih Aman / Siaga / Bahaya.
- Perubahan ikut berlaku di tab lain, jadi buka `warga.html` dan `bpbd.html` berdampingan untuk melihat alur lengkap.
- Riwayat 30 hari dibuat otomatis agar grafik dan laporan memiliki isi.

Data simulasi **bukan pembacaan sensor** dan hanya untuk menguji antarmuka. Hal ini ditandai di tampilan (label *Mode simulasi*).

## Konfigurasi (`assets/js/config.js`)

Nilai yang dapat berubah setelah validasi dengan BPBD dikumpulkan di satu berkas:

| Pengaturan | Nilai sekarang | Keterangan |
|---|---|---|
| `thresholds.siaga` | 10 | Aman jika ≤ 10 cm |
| `thresholds.bahaya` | 20 | Bahaya jika ≥ 20 cm |
| `maxLevel` | 30 | Tinggi wadah uji prototipe (cm) |
| `unit` | `cm` | Satuan tampilan |
| `sensorName`, `locationLabel` | Sensor Prototipe, Kali Acai | Teks lokasi |
| `dataSource` | `simulasi` | Ganti ke `firebase` pada tahap integrasi |
| `zoneIndex` | 0–0,3 / 0,3–0,6 / 0,6–1 | Kelas zona rawan InaRISK (BNPB) |

Ambang batas mengikuti prototipe Oktavian et al. (2026). Status dihitung dari nilai yang dibulatkan ke 1 cm (resolusi sensor).

## Struktur berkas

```
assets/
  css/  base.css    token & komponen bersama (Design System)
        warga.css   tata letak web warga (HP → tablet)
        bpbd.css    tata letak panel BPBD desktop/tablet/HP (+ gaya cetak laporan)
  js/   config.js   konfigurasi
        core.js     logika status, format waktu/angka, ikon, router
        data.js     lapisan data: simulator, statistik, imbauan
        chart.js    grafik SVG (zona, ambang, tooltip, unduh PNG)
        widgets.js  peta ilustrasi, notifikasi, pemilih hari, panel simulator
        warga.js    layar warga
        bpbd.js     layar BPBD
```

## Pemetaan layar mockup ke kode

| Mockup | Halaman | Bagian kode |
|---|---|---|
| A1 Beranda | `warga.html#beranda` | `warga.js` → `beranda` |
| A2 Detail Grafik | `warga.html#grafik` | `warga.js` → `grafik` |
| A3 Peta Sensor | `warga.html#peta` | `warga.js` → `peta` |
| A4 Riwayat | `warga.html#riwayat` | `warga.js` → `riwayat` |
| A5 Menu | `warga.html#menu` | `warga.js` → `menu` |
| A6 Notifikasi | notifikasi melayang + notifikasi browser | `widgets.js` → `SB.notify` |
| A7 Mode Offline | banner otomatis saat koneksi putus | `warga.js` → `setOffline` |
| B1 Dashboard | `bpbd.html#dashboard` | `bpbd.js` → `dashboard` |
| B2 Grafik Monitoring | `bpbd.html#grafik` | `bpbd.js` → `grafik` |
| B3 Peta & Zona Rawan | `bpbd.html#peta` | `bpbd.js` → `peta` |
| B4 Laporan Historis | `bpbd.html#laporan` | `bpbd.js` → `laporan` |
| B5 Kirim Imbauan | `bpbd.html#imbauan` | `bpbd.js` → `imbauan` |
| B6 Notifikasi | `bpbd.html#notifikasi` | `bpbd.js` → `notifikasi` |

## Integrasi Firebase (tahap berikutnya)

Tampilan hanya memanggil fungsi pada `SB.data` (`subscribe`, `getCurrent`, `getStatus`, `getHistory`, `getEvents`, `stats`).
Integrasi cukup membuat `SB.createFirebaseSource()` di `data.js` yang menyediakan fungsi yang sama, lalu mengubah `dataSource` menjadi `firebase`.

Usulan struktur data di Realtime Database (dikirim oleh ESP8266):

```
/sensor/latest           { "level": 15, "ts": 1759600000000 }
/sensor/history/<id>     { "level": 15, "ts": 1759600000000 }
```

`level` adalah ketinggian air dalam cm (jarak sensor HC-SR04 sudah dikonversi menjadi ketinggian pada mikrokontroler).

## Keterbatasan yang perlu dicatat

- **Notifikasi:** versi ini menampilkan notifikasi di halaman, bunyi (meniru buzzer prototipe: bip berulang untuk Siaga, sirene untuk Bahaya), getar di HP Android, dan notifikasi browser saat tab tidak sedang dilihat. Notifikasi yang tetap muncul ketika browser ditutup memerlukan Firebase Cloud Messaging dan *service worker* (tahap integrasi). Di iPhone, notifikasi web hanya berjalan jika situs dipasang ke Home Screen.
- **Imbauan** tersimpan di perangkat (localStorage) dan tersinkron antar-tab pada browser yang sama. Pengiriman ke perangkat lain memerlukan Firebase.
- **Peta** adalah ilustrasi rencana titik pemasangan, karena sensor belum dipasang di lapangan.
- **Font Inter** dimuat dari Google Fonts; tanpa internet, browser memakai font sistem.
