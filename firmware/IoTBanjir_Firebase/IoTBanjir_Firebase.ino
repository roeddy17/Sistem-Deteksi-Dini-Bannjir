/*
 * IoT Deteksi Dini Banjir — ESP8266 + HC-SR04 + LCD I2C + buzzer
 * ------------------------------------------------------------------
 * Berdasarkan sketsa prototipe "IoTBanjir.ino" (Blynk + Telegram).
 * Perubahan pada versi ini ditandai:
 *   [FIREBASE]   kirim data ke Firebase Realtime Database untuk web SiagaBanjir
 *   [PERBAIKAN]  perbaikan logika status dan notifikasi
 *   [RAHASIA]    token dipindah ke secrets.h (tidak ikut di-commit)
 *
 * Data yang ditulis ke Firebase (dibaca web secara real-time):
 *   /sensor/latest        { level, status, ts }  — saat level/status berubah, atau tiap 5 detik
 *   /sensor/history/<id>  { level, status, ts }  — tiap 60 detik dan setiap status berubah
 *   ts = waktu server Firebase ({".sv":"timestamp"}), agar web dapat mengukur jeda.
 *
 * Pustaka: ESP8266 core, Blynk, UniversalTelegramBot, ArduinoJson (dipakai UniversalTelegramBot),
 *          LiquidCrystal_I2C. Firebase memakai REST (ESP8266HTTPClient), tanpa pustaka tambahan.
 */
#include "secrets.h"            // [RAHASIA] salin dari secrets.example.h

#define PAKAI_BLYNK    1        // 0 = matikan Blynk
#define PAKAI_TELEGRAM 1        // 0 = matikan Telegram (hemat memori & waktu)
#define PAKAI_FIREBASE 1        // 0 = matikan pengiriman ke web

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiClient.h>
#include <ESP8266HTTPClient.h>
#include <BlynkSimpleEsp8266.h>
#include <UniversalTelegramBot.h>
#include <LiquidCrystal_I2C.h>

// ===== WiFi & Blynk =====
char ssid[] = WIFI_SSID;
char pass[] = WIFI_PASS;
char auth[] = BLYNK_AUTH_TOKEN;
WiFiClientSecure telegramClient;
BlynkTimer timer;

// ===== Telegram =====
String chat_id = TELEGRAM_CHAT_ID;       // grup Telegram (pastikan bot jadi admin)
UniversalTelegramBot bot(TELEGRAM_BOT_TOKEN, telegramClient);

// ===== Firebase [FIREBASE] =====
WiFiClientSecure fbClient;
HTTPClient fbHttp;
const unsigned long FB_HEARTBEAT = 5000UL;    // kirim ulang nilai terkini minimal tiap 5 detik
const unsigned long FB_HISTORY   = 60000UL;   // simpan riwayat tiap 60 detik
unsigned long fbLastLatest = 0, fbLastHistory = 0;
int fbLastLevel = -1;

// ===== LCD =====
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ===== Sensor HC-SR04 =====
const int trigPin = D5;
const int echoPin = D6;
#define SOUND_VELOCITY 0.034
const int H = 30;                        // tinggi wadah 30 cm
long duration;
int level = 0;

// ===== Status =====
enum Status {AMAN, SIAGA, BAHAYA};
Status statusNow = AMAN;
String statusText = "AMAN";

// ===== Buzzer =====
const int buzzerPin = D7;                // + buzzer ke D7, - buzzer ke GND
bool buzzerManual = true;                // master switch dari Blynk (V3)
bool buzzerAuto = false;                 // aktif otomatis
uint8_t buzzerMode = 0;                  // 0=off, 1=SIAGA, 2=BAHAYA

// ===== Ambang batas =====
const int T_AMAN_MAX   = 10;             // ≤ 10 cm
const int T_SIAGA_MAX  = 20;             // 10–20 cm
const int HYST = 1;                      // histeresis

// ===== Telegram cooldown =====
unsigned long lastAlertMs = 0;
const unsigned long ALERT_COOLDOWN = 5UL * 60UL * 1000UL;  // 5 menit

// ====== BLYNK: Switch V3 ======
BLYNK_WRITE(V3) {
  // OFF = buzzer mati total
  // ON  = buzzer mengikuti mode otomatis
  buzzerManual = param.asInt();
}
BLYNK_CONNECTED() {
  Blynk.syncVirtual(V3);
}

// ================== SETUP ==================
void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  lcd.init(); lcd.backlight();
  lcd.clear(); lcd.print("Deteksi Banjir");
  lcd.setCursor(0,1); lcd.print("Sinkronisasi...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  telegramClient.setInsecure();
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println("\nWiFi OK");

#if PAKAI_FIREBASE
  fbClient.setInsecure();                // prototipe: sertifikat tidak diverifikasi
  fbHttp.setReuse(true);                 // [FIREBASE] koneksi tetap terbuka -> jeda kirim kecil
  fbHttp.setTimeout(3000);
#endif

#if PAKAI_BLYNK
  Blynk.config(auth);                    // WiFi sudah tersambung di atas
  Blynk.connect(5000);
#endif

  lcd.clear(); lcd.print("WiFi OK");
  delay(800); lcd.clear();

  timer.setInterval(800L,  bacaLevelAir);   // sensor
  timer.setInterval(20L,   loopBuzzer);     // buzzer
#if PAKAI_TELEGRAM
  timer.setInterval(3000L, handleTelegram); // perintah Telegram (/cek); tiap 3 detik agar tidak menahan loop
#endif
}

// ================== LOOP ==================
void loop() {
#if PAKAI_BLYNK
  Blynk.run();
#endif
  timer.run();
}

// ================== FIREBASE (REST) [FIREBASE] ==================
bool firebaseSend(const char* method, const char* path, const String& body) {
  String url = String(FIREBASE_URL) + path + ".json?auth=" + FIREBASE_SECRET;
  if (!fbHttp.begin(fbClient, url)) return false;
  fbHttp.addHeader("Content-Type", "application/json");
  int code = fbHttp.sendRequest(method, body);
  fbHttp.end();                          // dengan setReuse(true) koneksi TLS tetap dipakai ulang
  if (code != 200) Serial.printf("Firebase %s %s gagal: %d\n", method, path, code);
  return code == 200;
}

void kirimFirebase(bool statusBerubah) {
  unsigned long now = millis();
  String body = String("{\"level\":") + level + ",\"status\":\"" + statusText + "\",\"ts\":{\".sv\":\"timestamp\"}}";
  // nilai terkini: segera saat berubah, selain itu tiap FB_HEARTBEAT (tanda alat masih hidup)
  if (statusBerubah || level != fbLastLevel || now - fbLastLatest >= FB_HEARTBEAT) {
    if (firebaseSend("PUT", "/sensor/latest", body)) { fbLastLatest = now; fbLastLevel = level; }
  }
  // riwayat: lebih jarang agar data 30 hari tetap ringan, ditambah setiap perubahan status
  if (statusBerubah || fbLastHistory == 0 || now - fbLastHistory >= FB_HISTORY) {
    if (firebaseSend("POST", "/sensor/history", body)) fbLastHistory = now;
  }
}

// ================== SENSOR & STATUS ==================
void bacaLevelAir() {
  // trigger sensor
  digitalWrite(trigPin, LOW); delayMicroseconds(2);
  digitalWrite(trigPin, HIGH); delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  duration = pulseIn(echoPin, HIGH, 30000UL);
  if (duration > 0) {
    int jarak = duration * SOUND_VELOCITY / 2.0;
    int lvl = H - jarak;
    if (lvl < 0) lvl = 0;
    if (lvl > H) lvl = H;
    level = lvl;
  }

  // [PERBAIKAN] tentukan status dengan histeresis tanpa celah:
  //   naik : AMAN -> SIAGA bila > 11 cm, -> BAHAYA bila > 21 cm
  //   turun: BAHAYA -> SIAGA bila ≤ 19 cm, -> AMAN bila ≤ 9 cm
  // (versi lama: level 21 cm saat AMAN dan 10 cm saat BAHAYA tidak berpindah status)
  Status s = statusNow;
  if (statusNow == AMAN) {
    if (level > T_SIAGA_MAX + HYST)      s = BAHAYA;
    else if (level > T_AMAN_MAX + HYST)  s = SIAGA;
  } else if (statusNow == SIAGA) {
    if (level > T_SIAGA_MAX + HYST)      s = BAHAYA;
    else if (level <= T_AMAN_MAX - HYST) s = AMAN;
  } else { // BAHAYA
    if (level <= T_AMAN_MAX - HYST)       s = AMAN;
    else if (level <= T_SIAGA_MAX - HYST) s = SIAGA;
  }

  // [PERBAIKAN] perubahan status hanya terdeteksi sekali. Versi lama membandingkan statusNow
  // dengan statusPrev yang tidak pernah disamakan lagi, sehingga pesan Telegram terkirim
  // ulang setiap 0,8 detik setelah status pertama kali berubah.
  bool berubah = (s != statusNow);
  statusNow = s;

  if      (statusNow == AMAN)   { statusText = "AMAN";   buzzerAuto = false; buzzerMode = 0; }
  else if (statusNow == SIAGA)  { statusText = "SIAGA";  buzzerAuto = true;  buzzerMode = 1; }
  else                          { statusText = "BAHAYA"; buzzerAuto = true;  buzzerMode = 2; }

  // tampilkan di LCD
  lcd.setCursor(0,0); lcd.print("Level: "); lcd.print(level); lcd.print("cm   ");
  lcd.setCursor(0,1); lcd.print("Status: "); lcd.print(statusText); lcd.print("   ");

#if PAKAI_FIREBASE
  // [FIREBASE] kirim lebih dulu agar web menerima data secepatnya
  if (WiFi.status() == WL_CONNECTED) kirimFirebase(berubah);
#endif

#if PAKAI_BLYNK
  Blynk.virtualWrite(V0, level);
  Blynk.virtualWrite(V1, statusText);
#endif

#if PAKAI_TELEGRAM
  // ===== Notifikasi Telegram =====
  unsigned long now = millis();

  // kirim langsung saat status berubah
  if (berubah) {
    lastAlertMs = now;
    if (statusNow == SIAGA) {
#if PAKAI_BLYNK
      Blynk.logEvent("siaga", "Level SIAGA (" + String(level) + " cm)");
#endif
      bot.sendMessage(chat_id, "⚠️ *SIAGA*\nLevel air: *" + String(level) + " cm*\nHARAP WASPADA!", "Markdown");
    } else if (statusNow == BAHAYA) {
#if PAKAI_BLYNK
      Blynk.logEvent("bahaya", "Level BAHAYA (" + String(level) + " cm)");
#endif
      bot.sendMessage(chat_id, "🚨 *BAHAYA*\nLevel air: *" + String(level) + " cm*\nWASPADA BANJIR!!!!", "Markdown");
    } else {
      bot.sendMessage(chat_id, "✅ *AMAN*\nLevel air: *" + String(level) + " cm*", "Markdown");
    }
  }

  // kirim ulang tiap 5 menit kalau SIAGA/BAHAYA belum berubah
  if ((statusNow == SIAGA || statusNow == BAHAYA) && (now - lastAlertMs > ALERT_COOLDOWN)) {
    lastAlertMs = now;
    if (statusNow == SIAGA) {
      bot.sendMessage(chat_id, "⚠️ *SIAGA*\nLevel masih tinggi: *" + String(level) + " cm*", "Markdown");
    } else {
      bot.sendMessage(chat_id, "🚨 *BAHAYA*\nLevel masih tinggi: *" + String(level) + " cm*", "Markdown");
    }
  }
#endif
}

// ================== BUZZER: SIAGA (2 beep) & BAHAYA (sirine) ==================
void loopBuzzer() {
  static unsigned long t0 = 0;
  static int step = 1;
  static int freq = 1000;
  static int beepCount = 0;
  static bool phase = false;

  if (!buzzerManual) {  // switch OFF dari Blynk
    noTone(buzzerPin);
    return;
  }

  if (buzzerAuto) {
    unsigned long now = millis();

    if (buzzerMode == 1) {
      // SIAGA: beep 2x lalu jeda panjang
      if (!phase && now - t0 >= 200) {
        tone(buzzerPin, 1000);
        phase = true; t0 = now; beepCount++;
      } else if (phase && now - t0 >= 200) {
        noTone(buzzerPin);
        phase = false; t0 = now;
        if (beepCount >= 2) { beepCount = 0; t0 = now + 1000; }
      }
    }
    else if (buzzerMode == 2) {
      // BAHAYA: sirine sweeping
      if (now - t0 >= 20) {
        t0 = now;
        freq += step * 40;
        if (freq >= 2000 || freq <= 800) step = -step;
        tone(buzzerPin, freq);
      }
    }
  } else {
    noTone(buzzerPin);
  }
}

// ================== TELEGRAM COMMAND ==================
#if PAKAI_TELEGRAM
void handleTelegram() {
  int n = bot.getUpdates(bot.last_message_received + 1);
  while (n) {
    for (int i=0; i<n; i++) {
      String txt  = bot.messages[i].text;
      String from = bot.messages[i].chat_id;
      if (txt == "/start") {
        bot.sendMessage(from,
          "👋 Selamat datang di *Monitoring Banjir IoT*.\nPerintah:\n• `/cek` untuk status terkini.",
          "Markdown");
      } else if (txt == "/cek") {
        bot.sendMessage(from,
          "📊 *Status Terkini*\nLevel: *" + String(level) + " cm*\nStatus: *" + statusText + "*",
          "Markdown");
      }
    }
    n = bot.getUpdates(bot.last_message_received + 1);
  }
}
#endif
