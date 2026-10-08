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

Selama sensor belum terhubung, data berasal dari **simulator** (pembacaan tiap 1 detik; perubahan target langsung diterapkan) (lihat tombol *Simulator* di pojok kanan bawah):

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
| `map.inarisk.url` | `gis.bnpb.go.id/.../inarisk/layer_bahaya_banjir/ImageServer` | Indeks bahaya banjir resmi InaRISK (BNPB) |
| `map.adminUrl` | `gis.bnpb.go.id/.../Basemap/batas_administrasi/MapServer` | Batas administrasi (BNPB) |
| `map.sensor` | -2.6025, 140.6690 | Koordinat titik sensor (**masih perkiraan**) |
| `map.zonesFile` | `assets/data/zona-contoh.kml` | Data zona rawan (**masih data contoh**) |
| `map.myMapsId`, `map.arcgisLayerUrl` | kosong | Sumber zona langsung dari My Maps / ArcGIS Online BPBD |

## Laporan PDF (A4)

Tombol **Unduh PDF** di halaman Laporan BPBD menyusun dokumen laporan khusus cetak (bukan cetakan tampilan layar), ukuran **A4** dengan margin atas 20 mm, kanan 20 mm, bawah 22 mm, kiri 25 mm:

1. kop, judul, dan identitas laporan (lokasi, periode, sumber data, ambang batas, tanggal cetak); catatan khusus bila data berasal dari mode simulasi;
2. ringkasan statistik dan sebaran waktu menurut status;
3. grafik ketinggian air periode laporan;
4. tabel kejadian perubahan status;
5. tabel data rinci lengkap (seluruh baris periode, judul kolom diulang tiap halaman);
6. keterangan status dan blok pengesahan petugas.

Pada dialog cetak pilih **Simpan sebagai PDF**, kertas **A4**, margin **Default**, matikan **Header dan footer** bawaan browser, dan aktifkan **Grafik latar belakang** agar warna tabel tercetak. Nomor halaman ("Halaman X dari Y") dicetak oleh Chrome/Edge versi terbaru; Firefox belum mendukung kotak margin halaman sehingga nomor halaman tidak muncul. Kode: `assets/js/laporan-cetak.js`, `assets/css/cetak.css`.

## Peta zona rawan

Halaman Peta (warga dan BPBD) memakai **Leaflet** (library JavaScript peta, disimpan di `assets/vendor/leaflet`) dengan peta dasar gratis tanpa API key: **Jalan** (OpenStreetMap, bawaan; nama jalan, kampung, dan tempat), **Hybrid** (citra satelit Esri + nama jalan dan tempat), dan **Satelit**. Fitur:

- **tempat penting** dari OpenStreetMap (Overpass API): fasilitas kesehatan, pendidikan, tempat ibadah, kantor pemerintahan/polisi, kafe & restoran, penginapan, pasar/bank, serta nama kampung; dimuat untuk area yang terlihat mulai zoom 15, nama tampil mulai zoom 17; ketuk ikon untuk jenis tempat dan rute Google Maps. Kelengkapan data bergantung pada kontribusi OpenStreetMap di wilayah tersebut;

- **indeks bahaya banjir resmi InaRISK (BNPB)**, dibaca langsung dari layanan ArcGIS publik `gis.bnpb.go.id` sehingga selalu sama dengan peta InaRISK; ketuk titik di peta untuk melihat nilai indeksnya;
- batas administrasi (BNPB); ketuk peta atau cek lokasi juga menampilkan **nama wilayah** (kelurahan/kampung, distrik, kota/kabupaten, provinsi) dari layanan yang sama;
- panel BPBD dapat mengganti jenis indeks InaRISK: **bahaya banjir** (bawaan), **risiko banjir**, **kerentanan banjir**, atau **bahaya banjir bandang** (`map.inarisk.others`);
- zona rawan banjir (area) dari BPBD bila sudah dimasukkan, berwarna hijau/kuning/merah sesuai kelas indeks; ketuk area untuk melihat kelasnya;
- titik sensor dengan warna status live (Aman/Siaga/Bahaya) dan tautan rute di Google Maps;
- **Cek lokasi saya** (GPS): menampilkan posisi pengguna, zona tempatnya berada (zona BPBD diutamakan, lalu indeks InaRISK), dan nilai indeks InaRISK di titik itu. GPS hanya berjalan di `https://` (misalnya GitHub Pages) atau `localhost`;
- mode simulasi: tombol **Uji: ketuk peta** untuk mencoba hasil cek zona di titik mana pun tanpa GPS.

Data zona contoh di `assets/data/zona-contoh.kml` hanya dipakai bila layer InaRISK dikosongkan.

**Menambahkan zona rawan (area) dari BPBD** (`assets/js/config.js`, bagian `map`):

1. *Layer publik ArcGIS Online* → isi `arcgisLayerUrl` dengan URL layer (`.../FeatureServer/0`). Tersinkron otomatis.
2. *My Maps* → isi `myMapsId` dengan nilai `mid=` dari tautan My Maps (peta harus dibagikan publik). Jika browser menolak membaca My Maps secara langsung, peta otomatis memakai berkas di `zonesFile`, jadi simpan juga hasil ekspor KML-nya.
3. *Berkas KML/GeoJSON* → simpan di `assets/data/`, isi `zonesFile` dengan namanya, lalu ubah `zonesSample` menjadi `false` (wajib, agar berkas ditampilkan bersama layer InaRISK). Berkas KMZ adalah ZIP: ekstrak dulu, ambil `doc.kml` di dalamnya.

Kelas zona dibaca otomatis dari atribut yang berisi kata Rendah/Sedang/Tinggi atau nilai indeks 0–1 (mis. kolom `KELAS` atau `INDEKS`). Jika nama kolomnya lain, isi `zoneField`. Data harus memakai koordinat WGS 84 (latitude/longitude).

Ambang batas mengikuti prototipe Oktavian et al. (2026). Status dihitung dari nilai yang dibulatkan ke 1 cm (resolusi sensor).

## Struktur berkas

```
assets/
  css/  base.css    token & komponen bersama (Design System)
        warga.css   tata letak web warga (HP → tablet)
        bpbd.css    tata letak panel BPBD desktop/tablet/HP
        cetak.css   laporan cetak A4 (ukuran kertas, margin, nomor halaman)
  js/   config.js   konfigurasi
        core.js     logika status, format waktu/angka, ikon, router
        data.js     lapisan data: simulator, statistik, imbauan
        chart.js    grafik SVG (zona, ambang, tooltip, unduh PNG)
        widgets.js  peta ilustrasi (cadangan), notifikasi, pemilih hari, panel simulator
        laporan-cetak.js  penyusun dokumen laporan PDF A4
        peta.js     peta interaktif: InaRISK, batas wilayah, zona BPBD (KML/GeoJSON/ArcGIS), sensor, GPS
  data/ zona-contoh.kml   data zona CONTOH (ganti dengan data BPBD)
  vendor/leaflet/   library peta Leaflet 1.9.4 (lisensi BSD-2)
        warga.js    layar warga
        bpbd.js     layar BPBD
```

## Pemetaan layar mockup ke kode

| Mockup | Halaman | Bagian kode |
|---|---|---|
| A1 Beranda | `warga.html#beranda` | `warga.js` → `beranda` |
| A2 Detail Grafik | `warga.html#grafik` | `warga.js` → `grafik` |
| A3 Peta Sensor | `warga.html#peta` | `warga.js` → `peta`, `peta.js` |
| A4 Riwayat | `warga.html#riwayat` | `warga.js` → `riwayat` |
| A5 Menu | `warga.html#menu` | `warga.js` → `menu` |
| A6 Notifikasi | notifikasi melayang + notifikasi browser | `widgets.js` → `SB.notify` |
| A7 Mode Offline | banner otomatis saat koneksi putus | `warga.js` → `setOffline` |
| B1 Dashboard | `bpbd.html#dashboard` | `bpbd.js` → `dashboard` |
| B2 Grafik Monitoring | `bpbd.html#grafik` | `bpbd.js` → `grafik` |
| B3 Peta & Zona Rawan | `bpbd.html#peta` | `bpbd.js` → `peta`, `peta.js` |
| B4 Laporan Historis | `bpbd.html#laporan` | `bpbd.js` → `laporan` |
| B5 Kirim Imbauan | `bpbd.html#imbauan` | `bpbd.js` → `imbauan` |
| B6 Notifikasi | `bpbd.html#notifikasi` | `bpbd.js` → `notifikasi` |

## Integrasi Firebase (real-time)

Sumber data `firebase` sudah tersedia di `data.js`. Untuk mengaktifkannya, isi `firebase.databaseURL` (dan `apiKey` bila perlu) di `config.js`, lalu ubah `dataSource` menjadi `firebase`. SDK Firebase dimuat otomatis dari gstatic.

**Cara kerja (tanpa polling):** browser berlangganan `/sensor/latest` dengan `on('value')`. Firebase menjaga satu koneksi WebSocket tetap terbuka dan **mendorong (push)** data baru begitu alat menulisnya, sehingga semua tampilan (warga dan BPBD) diperbarui seketika. Jeda di sisi tampilan, dari data diterima sampai angka di layar berubah, terukur **±3–5 ms** (uji dengan SDK tiruan). Panel BPBD menampilkan status koneksi dan **jeda server → browser** pada kartu *Sumber data*.

Struktur data yang ditulis ESP8266:

```
/sensor/latest           { "level": 15, "ts": {".sv": "timestamp"} }   ← setiap pembacaan, mis. tiap 1 detik
/sensor/history/<id>     { "level": 15, "ts": {".sv": "timestamp"} }   ← lebih jarang, mis. tiap 30–60 detik
```

`level` adalah ketinggian air dalam cm. `ts` memakai waktu server Firebase agar jeda dapat diukur. Riwayat ditulis lebih jarang supaya data 30 hari tetap ringan dimuat; nilai terkini tetap real-time.

**Perkiraan jeda total alat → layar** (bergantung jaringan, bukan kode tampilan):

| Tahap | Perkiraan |
|---|---|
| Interval kirim ESP8266 | sesuai pengaturan alat (mis. 1 detik); ini penentu terbesar |
| Pengukuran HC-SR04 | ±30–60 ms |
| ESP8266 → Firebase (WiFi + internet) | ±100–500 ms |
| Firebase → browser (WebSocket, push) | ±50–300 ms |
| Data diterima → tampil di layar | ±3–5 ms |

Pilih lokasi database **asia-southeast1 (Singapura)** saat membuat Realtime Database agar jarak ke Jayapura lebih dekat.

## Keterbatasan yang perlu dicatat

- **Notifikasi:** versi ini menampilkan notifikasi di halaman, bunyi (meniru buzzer prototipe: bip berulang untuk Siaga, sirene untuk Bahaya), getar di HP Android, dan notifikasi browser saat tab tidak sedang dilihat. Notifikasi yang tetap muncul ketika browser ditutup memerlukan Firebase Cloud Messaging dan *service worker* (tahap integrasi). Di iPhone, notifikasi web hanya berjalan jika situs dipasang ke Home Screen.
- **Imbauan** tersimpan di perangkat (localStorage) dan tersinkron antar-tab pada browser yang sama. Pengiriman ke perangkat lain memerlukan Firebase.
- **Peta**: titik sensor masih perkiraan. Layer InaRISK dan batas administrasi bergantung pada ketersediaan server BNPB; bila server tidak dapat diakses, peta menampilkan keterangan "gagal dimuat". Pembacaan nilai indeks (ketuk peta / cek lokasi) memakai operasi *identify*; sudah diuji berhasil dari browser (server BNPB mengizinkan permintaan lintas situs). Contoh uji: pada titik sensor (−2,6025; 140,6690) nilai indeks = 0,833333 (kelas Tinggi). Peta dasar memerlukan internet; atribusi Esri dan OpenStreetMap tampil di pojok peta sesuai ketentuan pemakaiannya.
- **Font Inter** dimuat dari Google Fonts; tanpa internet, browser memakai font sistem.
