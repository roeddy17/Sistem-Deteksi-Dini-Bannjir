/* Logika murni (tanpa Firebase) agar mudah diuji. */
const ORDER = ['AMAN', 'SIAGA', 'BAHAYA'];
const LOCATION = 'Kali Acai, Abepura';
const T = { siaga: 10, bahaya: 20 };   // samakan dengan assets/js/config.js (thresholds)

const rank = s => ORDER.indexOf(s);

/* Status dari alat (sudah memakai histeresis); bila tidak ada, dihitung dari level. */
function statusOf(d) {
  if (!d) return null;
  const s = String(d.status || '').toUpperCase();
  if (ORDER.includes(s)) return s;
  const v = Math.round(+d.level);
  if (!isFinite(v)) return null;
  return v >= T.bahaya ? 'BAHAYA' : v > T.siaga ? 'SIAGA' : 'AMAN';
}

/* Imbauan tampil bila targetnya SEMUA atau status sekarang >= status sasaran. */
const applies = (imb, status) => !imb.target || imb.target === 'SEMUA' || rank(status) >= rank(imb.target);

function statusMessage(before, after, level) {
  const up = rank(after) > rank(before);
  const tail = after === 'BAHAYA' ? ' Segera menuju titik kumpul terdekat.' : after === 'SIAGA' ? ' Tetap waspada.' : '';
  return {
    title: up ? `Peringatan ${after}` : `Status turun ke ${after}`,
    body: `Ketinggian air ${LOCATION} mencapai ${Math.round(+level)} cm.${tail}`,
    kind: 'status', status: after
  };
}

const imbauanMessage = imb => ({ title: 'Imbauan BPBD', body: String(imb.isi || '').slice(0, 240), kind: 'imbauan', status: '' });

module.exports = { ORDER, rank, statusOf, applies, statusMessage, imbauanMessage };
