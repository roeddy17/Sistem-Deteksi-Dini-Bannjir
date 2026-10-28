/*
 * SiagaBanjir — pengirim push (FCM) di Cloudflare Workers, pengganti Cloud Functions
 * agar tidak perlu paket Blaze. Dijalankan terjadwal tiap menit:
 *   1. token baru di /fcmTokens didaftarkan ke topik "warga"
 *   2. status alat (/sensor/latest) berubah -> kirim peringatan
 *   3. imbauan (/imbauan) yang belum dikirim dan status sasarannya tercapai -> kirim
 * Logika status/pesan memakai berkas yang sama dengan Cloud Functions.
 */
import logic from '../functions/logic.js';
const { statusOf, applies, statusMessage, imbauanMessage } = logic;

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = s => new TextEncoder().encode(s);
let cached = { token: '', exp: 0 };

async function accessToken(sa, f) {
  if (cached.token && Date.now() < cached.exp - 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(enc(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc(head + '.' + claim)));
  const r = await f('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Gagal mengambil token Google: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function run(env, f = fetch) {
  const db = (path, init, q = '') => f(`${env.DB_URL}/${path}.json?auth=${env.FIREBASE_SECRET}${q}`, init).then(r => {
    if (!r.ok) throw new Error(`Database ${path}: HTTP ${r.status}`);
    return r.json();
  });
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  const topic = env.TOPIC || 'warga';
  const out = { subscribed: 0, status: null, sent: 0 };

  const [latest, meta, tokens, imb] = await Promise.all([
    db('sensor/latest'), db('meta/pushStatus'), db('fcmTokens'), db('imbauan', undefined, '&orderBy="$key"&limitToLast=30')
  ]);
  const now = statusOf(latest);
  const imbauan = Object.entries(imb || {}).filter(([, v]) => v && v.isi && v.push !== false && !v.pushedAt
    && (typeof v.t !== 'number' || Date.now() - v.t < 24 * 3600 * 1000));

  /* 1) token baru -> topik */
  const fresh = Object.entries(tokens || {}).filter(([, v]) => !(v && v.s)).map(([k]) => k).slice(0, 900);
  let tok = '';
  const getTok = async () => tok || (tok = await accessToken(sa, f));
  if (fresh.length) {
    const r = await f('https://iid.googleapis.com/iid/v1:batchAdd', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await getTok(), 'Content-Type': 'application/json', access_token_auth: 'true' },
      body: JSON.stringify({ to: '/topics/' + topic, registration_tokens: fresh })
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j.results)) {
      const patch = {};
      fresh.forEach((k, i) => { if (j.results[i] && j.results[i].error) patch[k] = null; else patch[k + '/s'] = 1; });
      await db('fcmTokens', { method: 'PATCH', body: JSON.stringify(patch) });
      out.subscribed = j.results.filter(x => !x.error).length;
    } else console.warn('batchAdd gagal', r.status, JSON.stringify(j));
  }

  const DIRECT_MAX = 35;   // batas subrequest paket gratis (50): di bawah ini kirim langsung ke tiap token
  const dead = [];
  const send = async m => {
    const base = {
      data: { title: m.title, body: m.body, kind: m.kind, status: m.status || '', link: env.SITE + (m.kind === 'imbauan' ? '#riwayat?f=imbauan' : '#beranda') },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } }
    };
    const post = async target => {
      const r = await f(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT}/messages:send`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + await getTok(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { ...target, ...base } })
      });
      return { ok: r.ok, status: r.status, text: r.ok ? '' : await r.text() };
    };
    const ids = Object.keys(tokens || {});
    if (ids.length && ids.length <= DIRECT_MAX) {
      const res = await Promise.all(ids.map(t => post({ token: t }).then(x => ({ t, ...x }))));
      res.forEach(x => {
        if (x.ok) out.sent++;
        else {
          console.warn('FCM gagal untuk ...' + x.t.slice(-8) + ': ' + x.status + ' ' + x.text.slice(0, 300));
          if (x.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(x.text)) dead.push(x.t);
        }
      });
    } else {
      const x = await post({ topic });
      if (!x.ok) throw new Error('FCM gagal: ' + x.status + ' ' + x.text);
      out.sent++;
    }
  };

  /* 2) perubahan status */
  if (now) {
    const before = meta && meta.status;
    if (before !== now) {
      await db('meta/pushStatus', { method: 'PUT', body: JSON.stringify({ status: now, t: Date.now() }) });   // catat dulu agar tidak terkirim ganda
      out.status = now;
      if (before) await send(statusMessage(before, now, latest.level));
    }
  }

  /* 3) imbauan yang statusnya sudah tercapai */
  if (now) for (const [id, v] of imbauan) {
    if (!applies(v, now)) continue;
    await db('imbauan/' + id, { method: 'PATCH', body: JSON.stringify({ pushedAt: Date.now() }) });
    await send(imbauanMessage(v));
  }
  if (dead.length) { const p = {}; dead.forEach(t => { p[t] = null; }); await db('fcmTokens', { method: 'PATCH', body: JSON.stringify(p) }); out.removed = dead.length; }
  return out;
}

export default {
  async scheduled(_evt, env, ctx) { ctx.waitUntil(run(env).then(r => console.log(JSON.stringify(r)), e => console.error(e.message))); },
  async fetch() { return new Response('SiagaBanjir push worker aktif.'); }
};
