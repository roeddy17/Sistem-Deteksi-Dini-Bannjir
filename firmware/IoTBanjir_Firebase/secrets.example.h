/*
 * CONTOH berkas rahasia. Salin menjadi "secrets.h" (folder yang sama), lalu isi.
 * secrets.h tidak ikut di-commit ke GitHub (lihat .gitignore).
 */
#pragma once

// ===== WiFi =====
#define WIFI_SSID       "nama-wifi"
#define WIFI_PASS       "kata-sandi-wifi"

// ===== Blynk (dari dasbor Blynk) =====
#define BLYNK_TEMPLATE_ID   "TMPLxxxxxxx"
#define BLYNK_TEMPLATE_NAME "Monitoring Banjir"
#define BLYNK_AUTH_TOKEN    "token-perangkat-blynk"

// ===== Telegram (dari @BotFather) =====
#define TELEGRAM_BOT_TOKEN  "1234567890:token-bot"
#define TELEGRAM_CHAT_ID    "-100xxxxxxxxxx"

// ===== Firebase Realtime Database =====
// URL tanpa garis miring di akhir, contoh: https://siagabanjir-default-rtdb.asia-southeast1.firebasedatabase.app
#define FIREBASE_URL     "https://nama-proyek-default-rtdb.asia-southeast1.firebasedatabase.app"
// Rahasia database: Firebase Console > Project settings > Service accounts > Database secrets.
// Hanya disimpan di alat, tidak pernah di web.
#define FIREBASE_SECRET  "rahasia-database"
