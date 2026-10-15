/*
 * Cloud Functions SiagaBanjir — mengirim push (FCM) ke semua perangkat warga yang sudah
 * mengaktifkan notifikasi (topik "warga"):
 *   - daftarkanToken : token baru di /fcmTokens/<token> didaftarkan ke topik
 *   - pushStatus     : status alat berubah (/sensor/latest) -> kirim peringatan,
 *                      lalu kirim imbauan tertunda yang status sasarannya sudah tercapai
 *   - pushImbauan    : imbauan baru di /imbauan -> kirim bila status sasaran sudah tercapai
 * Wilayah dan instance harus sama dengan Realtime Database (asia-southeast1).
 */
const { onValueWritten, onValueCreated } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { rank, statusOf, applies, statusMessage, imbauanMessage } = require('./logic');

admin.initializeApp();

const REGION = 'asia-southeast1';
const INSTANCE = 'siagabanjir-f2c62-default-rtdb';
const TOPIC = 'warga';
const SITE = 'https://roeddy17.github.io/Sistem-Deteksi-Dini-Bannjir/warga.html';
const opt = ref => ({ ref, instance: INSTANCE, region: REGION });

function push(m) {
  return admin.messaging().send({
    topic: TOPIC,
    data: { title: m.title, body: m.body, kind: m.kind, status: m.status || '', link: SITE + (m.kind === 'imbauan' ? '#riwayat?f=imbauan' : '#beranda') },
    webpush: { headers: { Urgency: 'high', TTL: '3600' } }   // peringatan kedaluwarsa setelah 1 jam
  });
}

/* Menandai imbauan sudah dikirim; hanya satu pemanggil yang menang (hindari push ganda). */
async function claim(ref) {
  const r = await ref.child('pushedAt').transaction(cur => (cur ? undefined : Date.now()));
  return r.committed;
}

async function kirimImbauanTertunda(status) {
  const snap = await admin.database().ref('imbauan').orderByChild('t').limitToLast(30).get();
  const todo = [];
  snap.forEach(c => { const v = c.val(); if (v && v.isi && v.push !== false && !v.pushedAt && applies(v, status)) todo.push({ ref: c.ref, v }); });
  for (const j of todo) { if (await claim(j.ref)) await push(imbauanMessage(j.v)); }
}

exports.daftarkanToken = onValueCreated(opt('/fcmTokens/{token}'), async event => {
  const token = event.params.token;
  const r = await admin.messaging().subscribeToTopic(token, TOPIC);
  if (r.failureCount) { logger.warn('Token tidak valid, dihapus', r.errors); await event.data.ref.remove(); }
});

exports.pushStatus = onValueWritten(opt('/sensor/latest'), async event => {
  const before = statusOf(event.data.before.val());
  const latest = event.data.after.val();
  const after = statusOf(latest);
  if (!after || before === after) return;
  /* dedupe: jangan kirim status yang sama dua kali berturut-turut */
  const meta = await admin.database().ref('meta/pushStatus').transaction(cur => (cur && cur.status === after ? undefined : { status: after, t: Date.now() }));
  if (!meta.committed) return;
  if (!before) return;   // pembacaan pertama: hanya catat
  await push(statusMessage(before, after, latest.level));
  await kirimImbauanTertunda(after);
});

exports.pushImbauan = onValueCreated(opt('/imbauan/{id}'), async event => {
  const v = event.data.val();
  if (!v || !v.isi || v.push === false) return;
  const status = statusOf((await admin.database().ref('sensor/latest').get()).val());
  if (!status || !applies(v, status)) return;   // belum tercapai: dikirim saat status mencapai sasaran
  if (await claim(event.data.ref)) await push(imbauanMessage(v));
});
