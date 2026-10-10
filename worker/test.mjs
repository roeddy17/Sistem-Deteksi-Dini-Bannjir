import assert from 'assert';
import { generateKeyPairSync } from 'crypto';
import { run } from './index.js';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { client_email: 'x@y.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
function mk(db) {
  const calls = [];
  const f = async (url, init = {}) => {
    const m = init.method || 'GET'; calls.push({ url, m, body: init.body });
    const J = (o, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => o, text: async () => JSON.stringify(o) });
    if (url.includes('oauth2.googleapis.com')) return J({ access_token: 'AT', expires_in: 3600 });
    if (url.includes('iid.googleapis.com')) { const n = JSON.parse(init.body).registration_tokens; return J({ results: n.map(t => t === 'bad' ? { error: 'INVALID_ARGUMENT' } : {}) }); }
    if (url.includes('fcm.googleapis.com')) return J({ name: 'ok' });
    const path = url.split('.json')[0].split('.app/')[1];
    if (m === 'GET') return J(db[path] ?? null);
    return J({});
  };
  return { f, calls };
}
const env = { DB_URL: 'https://x.app', FIREBASE_SECRET: 's', FCM_SERVICE_ACCOUNT: JSON.stringify(sa), FCM_PROJECT: 'p', SITE: 'https://s/warga.html', TOPIC: 'warga' };
const fcm = c => c.filter(x => x.url.includes('fcm.googleapis'));
let t = mk({ 'sensor/latest': { level: 12, status: 'SIAGA' }, 'meta/pushStatus': { status: 'AMAN' }, fcmTokens: { a: { t: 1 }, bad: { t: 1 }, c: { t: 1, s: 1 } },
  imbauan: { i1: { isi: 'Waspada', target: 'SIAGA', push: true, t: Date.now() }, i2: { isi: 'x', target: 'BAHAYA', t: Date.now() }, i3: { isi: 'lama', pushedAt: 5 } } });
let r = await run(env, t.f);
assert.equal(r.subscribed, 1); assert.equal(r.status, 'SIAGA'); assert.equal(r.sent, 6);   // 3 token x (status + imbauan)
const patch = t.calls.find(c => c.m === 'PATCH' && c.url.includes('fcmTokens'));
assert.deepEqual(JSON.parse(patch.body), { 'a/s': 1, bad: null });
const msgs = fcm(t.calls).map(c => JSON.parse(c.body).message);
assert.equal(msgs[0].data.title, 'Status SIAGA'); assert.ok(msgs[0].token); assert.equal(msgs[5].data.kind, 'imbauan');
assert.ok(t.calls.find(c => c.url.includes('imbauan/i1')));
assert.ok(!t.calls.find(c => c.url.includes('imbauan/i2')));
// status sama -> tidak ada kiriman; pembacaan pertama -> hanya dicatat
t = mk({ 'sensor/latest': { level: 5 }, 'meta/pushStatus': { status: 'AMAN' } });
assert.equal((await run(env, t.f)).sent, 0);
t = mk({ 'sensor/latest': { level: 5 } });
r = await run(env, t.f); assert.equal(r.sent, 0); assert.equal(r.status, 'AMAN');
console.log('uji worker lulus');
