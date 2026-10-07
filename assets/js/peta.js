/*
 * PETA INTERAKTIF (Leaflet)
 * ------------------------------------------------------------------
 * - Peta dasar gratis tanpa API key: citra satelit Esri (ArcGIS) dan OpenStreetMap.
 * - Indeks bahaya banjir resmi InaRISK (BNPB) dan batas administrasi: layanan ArcGIS publik
 *   gis.bnpb.go.id, ditampilkan sebagai gambar sesuai area peta yang terlihat.
 * - Zona rawan banjir (area/poligon) dari BPBD: layer ArcGIS Online, My Maps, atau berkas KML/GeoJSON
 *   (lihat config.map). Kelas zona dibaca dari atribut (Rendah/Sedang/Tinggi atau indeks 0–1).
 * - Titik sensor dengan status live, dan lokasi pengguna (GPS) beserta zona tempatnya berada.
 * Jika Leaflet gagal dimuat, tampilan kembali ke peta ilustrasi (SB.mapSVG).
 */
(function () {
  const C = SB.config, M = C.map, I = SB.icon, esc = SB.ui.esc;
  const ZCLS = { rendah: 'ok', sedang: 'wr', tinggi: 'dg' };
  const ZCOL = { rendah: '#16A34A', sedang: '#F59E0B', tinggi: '#DC2626', lain: '#64748B' };
  const ZLABEL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
  const ZRANK = { rendah: 1, sedang: 2, tinggi: 3 };

  /* ---------- Membaca KML (ekspor My Maps / ArcGIS "Layer To KML") menjadi GeoJSON ---------- */
  const byTag = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag));
  const first = (el, tag) => byTag(el, tag)[0] || null;
  const txt = el => (el && el.textContent || '').trim();
  const coords = el => txt(el).split(/\s+/).filter(Boolean).map(c => c.split(',').slice(0, 2).map(Number)).filter(c => c.length === 2 && c.every(isFinite));

  function kmlPolygon(p) {
    const outer = first(first(p, 'outerBoundaryIs') || p, 'coordinates');
    const holes = byTag(p, 'innerBoundaryIs').map(b => coords(first(b, 'coordinates')));
    return [coords(outer)].concat(holes).filter(r => r.length >= 4);
  }
  /* Atribut ArcGIS sering disimpan sebagai tabel HTML di <description> */
  function tableAttrs(html) {
    const out = {};
    if (!/<t[dr]/i.test(html)) return out;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('tr').forEach(tr => {
      const c = tr.querySelectorAll('td,th');
      if (c.length === 2) { const k = c[0].textContent.trim(); if (k) out[k] = c[1].textContent.trim(); }
    });
    return out;
  }
  function parseKML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Berkas KML tidak dapat dibaca.');
    const features = [];
    byTag(doc, 'Placemark').forEach(pm => {
      const props = {};
      const name = byTag(pm, 'name').find(n => n.parentNode === pm);
      if (name) props.name = txt(name);
      const desc = byTag(pm, 'description').find(n => n.parentNode === pm);
      if (desc) { Object.assign(props, tableAttrs(desc.textContent)); props.description = txt(desc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
      byTag(pm, 'Data').forEach(d => { props[d.getAttribute('name')] = txt(first(d, 'value')); });
      byTag(pm, 'SimpleData').forEach(d => { props[d.getAttribute('name')] = txt(d); });
      const polys = byTag(pm, 'Polygon').map(kmlPolygon).filter(p => p.length);
      if (polys.length) {
        features.push({ type: 'Feature', properties: props, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
      }
    });
    return { type: 'FeatureCollection', features };
  }

  /* ---------- Kelas zona dari atribut ---------- */
  const KEYS = /kelas|class|kategori|category|tingkat|bahaya|hazard|risk|indeks|index|inarisk|zona|zone/i;
  function fromText(v) {
    const s = String(v).toLowerCase();
    if (/\btinggi\b|\bhigh\b/.test(s)) return 'tinggi';
    if (/\bsedang\b|\bmedium\b|\bmoderate\b/.test(s)) return 'sedang';
    if (/\brendah\b|\blow\b/.test(s)) return 'rendah';
    return null;
  }
  function fromIndex(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n) || n < 0 || n > 1 || !/^\s*[\d.,]+\s*$/.test(String(v))) return null;
    return n < 0.3 ? 'rendah' : n < 0.6 ? 'sedang' : 'tinggi';  // batas kelas InaRISK
  }
  function classify(props) {
    if (M.zoneField && props[M.zoneField] != null) return fromText(props[M.zoneField]) || fromIndex(props[M.zoneField]);
    const keys = Object.keys(props);
    const main = keys.filter(k => KEYS.test(k));
    for (const k of main) { const z = fromText(props[k]); if (z) return z; }
    for (const k of main) { const z = fromIndex(props[k]); if (z) return z; }
    for (const k of keys) { const z = fromText(props[k]); if (z) return z; }
    return null;
  }
  function indexOf(props) {
    for (const k of Object.keys(props)) if (/indeks|index/i.test(k)) { const n = parseFloat(String(props[k]).replace(',', '.')); if (isFinite(n) && n >= 0 && n <= 1) return n; }
    return null;
  }

  /* ---------- Titik di dalam poligon ---------- */
  function inRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inPoly = (pt, poly) => inRing(pt, poly[0]) && !poly.slice(1).some(h => inRing(pt, h));
  function inFeature(pt, f) {
    const g = f.geometry; if (!g) return false;
    if (g.type === 'Polygon') return inPoly(pt, g.coordinates);
    if (g.type === 'MultiPolygon') return g.coordinates.some(p => inPoly(pt, p));
    return false;
  }
  /* Zona tertinggi yang memuat titik (lat, lng) */
  function zoneAt(fc, lat, lng) {
    let best = null;
    (fc ? fc.features : []).forEach(f => {
      if (f.zone && inFeature([lng, lat], f) && (!best || ZRANK[f.zone] > ZRANK[best.zone])) best = f;
    });
    return best;
  }
  function distance(a, b) {
    const R = 6371e3, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';

  /* ---------- Memuat data zona (sekali per halaman) ---------- */
  let zonesPromise = null;
  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }
  function prepare(fc, source) {
    fc.features = (fc.features || []).filter(f => f.geometry && /Polygon/.test(f.geometry.type));
    fc.features.forEach(f => { f.properties = f.properties || {}; f.zone = classify(f.properties); f.index = indexOf(f.properties); });
    const counts = { rendah: 0, sedang: 0, tinggi: 0, lain: 0 };
    fc.features.forEach(f => counts[f.zone || 'lain']++);
    return { fc, source, counts, sample: source === 'file' && M.zonesSample, loadedAt: Date.now() };
  }
  function loadZones() {
    if (zonesPromise) return zonesPromise;
    zonesPromise = (async () => {
      const notes = [];
      if (M.arcgisLayerUrl) {
        try {
          const url = M.arcgisLayerUrl.replace(/\/+$/, '') + '/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
          return prepare(JSON.parse(await fetchText(url)), 'arcgis');
        } catch (e) { notes.push('Layer ArcGIS Online tidak dapat dibaca (' + e.message + ').'); }
      }
      if (M.myMapsId) {
        try {
          return prepare(parseKML(await fetchText('https://www.google.com/maps/d/kml?forcekml=1&mid=' + encodeURIComponent(M.myMapsId))), 'mymaps');
        } catch (e) { notes.push('My Maps tidak dapat dibaca langsung oleh browser; memakai berkas di proyek.'); }
      }
      if (M.zonesSample && M.inarisk && M.inarisk.url) return null;   // data contoh tidak dipakai bila ada InaRISK
      if (!M.zonesFile) return null;
      try {
        const t = await fetchText(M.zonesFile);
        const res = prepare(/\.(geo)?json$/i.test(M.zonesFile) ? JSON.parse(t) : parseKML(t), 'file');
        res.notes = notes; return res;
      } catch (e) {
        throw new Error(location.protocol === 'file:' ? 'Data zona tidak dapat dimuat saat halaman dibuka langsung dari berkas. Jalankan lewat server lokal.' : 'Data zona tidak dapat dimuat (' + e.message + ').');
      }
    })();
    zonesPromise.catch(() => { zonesPromise = null; });
    return zonesPromise;
  }

  /* ---------- Lokasi pengguna (GPS) ---------- */
  function locate() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('Browser ini tidak mendukung fitur lokasi.'));
      if (!window.isSecureContext) return reject(new Error('Fitur lokasi hanya berjalan di alamat https:// atau localhost. Buka web lewat GitHub Pages untuk memakai GPS di HP.'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        e => reject(new Error(e.code === 1 ? 'Izin lokasi ditolak. Izinkan akses lokasi untuk situs ini di pengaturan browser.' : e.code === 3 ? 'Lokasi tidak ditemukan dalam waktu yang cukup. Coba di tempat terbuka.' : 'Lokasi tidak dapat ditentukan.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }

  /* ---------- Layanan ArcGIS (InaRISK, batas administrasi) ---------- */
  /* Meminta satu gambar PNG transparan untuk area peta yang sedang terlihat (export / exportImage) */
  const ArcExport = window.L && L.Layer.extend({
    initialize(url, o) { this.url = url.replace(/\/+$/, ''); this.o = o; this.seq = 0; },
    onAdd(map) { map.on('moveend', this.refresh, this); this.refresh(); },
    onRemove(map) { map.off('moveend', this.refresh, this); if (this.ov) map.removeLayer(this.ov); this.ov = null; this.seq++; },
    getAttribution() { return this.o.attribution; },
    refresh() {
      const map = this._map; if (!map) return;
      const b = map.getBounds(), size = map.getSize();
      const sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
      const url = `${this.url}/${this.o.image ? 'exportImage' : 'export'}?f=image&format=png32&transparent=true&size=${size.x},${size.y}`
        + `&bbox=${sw.x},${sw.y},${ne.x},${ne.y}&bboxSR=3857&imageSR=3857` + (this.o.image ? '' : '&dpi=96');
      const seq = ++this.seq, img = new Image();
      img.onload = () => {
        if (seq !== this.seq || !this._map) return;
        if (this.ov) this.ov.setUrl(url).setBounds(b);
        else this.ov = L.imageOverlay(url, b, { opacity: this.o.opacity, pane: this.o.pane, interactive: false }).addTo(this._map);
        if (this.o.onStatus) this.o.onStatus(true);
      };
      img.onerror = () => { if (seq === this.seq && this.o.onStatus) this.o.onStatus(false); };
      img.src = url;
    }
  });
  /* Nilai indeks InaRISK di satu titik (ImageServer identify). Hasil: { value, zone } atau value null (di luar area bahaya) */
  async function inariskAt(lat, lng, url) {
    const u = url || (M.inarisk && M.inarisk.url); if (!u) return null;
    const geom = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
    const ctl = 'AbortController' in window ? new AbortController() : null;
    const tm = ctl && setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(`${u.replace(/\/+$/, '')}/identify?geometry=${geom}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`, ctl ? { signal: ctl.signal } : {});
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'layanan menolak permintaan');
      const raw = j.value == null ? '' : String(j.value).trim();
      const v = parseFloat(raw.split(/[\s,]+/)[0]);
      if (!raw || /nodata/i.test(raw) || !isFinite(v)) return { value: null, zone: null };
      /* layanan mengembalikan nilai indeks 0–1 sebagai teks, mis. "0.833333" */
      const zone = v >= 0 && v <= 1 ? fromIndex(v) : null;
      return { value: v, zone };
    } catch (e) {
      return { error: e.name === 'AbortError' ? 'server InaRISK tidak merespons' : 'nilai tidak dapat dibaca dari server InaRISK' };
    } finally { if (tm) clearTimeout(tm); }
  }
  /* Nama wilayah di satu titik (MapServer identify batas administrasi) */
  const title = s => String(s || '').toLowerCase().replace(/(^|[\s(/-])\S/g, c => c.toUpperCase());
  async function adminAt(lat, lng) {
    if (!M.adminUrl) return null;
    const d = 0.01, q = `geometry=${lng},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:1,2,3,4&tolerance=1`
      + `&mapExtent=${lng - d},${lat - d},${lng + d},${lat + d}&imageDisplay=400,400,96&returnGeometry=false&f=json`;
    try {
      const j = await (await fetch(`${M.adminUrl.replace(/\/+$/, '')}/identify?${q}`)).json();
      const res = (j.results || []).slice().sort((a, b) => b.layerId - a.layerId);   // tingkat terendah (desa) dulu
      const a = res.length ? res[0].attributes : null; if (!a) return null;
      const w = { kel: a.NAMA_KEL, kec: a.NAMA_KEC, kab: a.NAMA_KAB, prop: a.NAMA_PROP };
      Object.keys(w).forEach(k => { w[k] = w[k] && !/^null$/i.test(w[k]) ? title(w[k]) : ''; });
      /* di Papua, kecamatan disebut distrik */
      w.text = [w.kel, w.kec && 'Distrik ' + w.kec, w.kab, w.prop].filter(Boolean).join(', ');
      return w.text ? w : null;
    } catch (e) { return null; }
  }
  const fmtIdx = v => (Math.round(v * 100) / 100).toString().replace('.', ',');

  /* ---------- Peta ---------- */
  const BASE = {
    jalan: { label: 'Jalan', layers: [['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', 19]] },
    hybrid: { label: 'Hybrid', layers: [
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Citra &copy; Esri, Maxar, Earthstar Geographics'],
      ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', 'Jalan &copy; Esri'],
      ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', 'Label &copy; Esri']] },
    satelit: { label: 'Satelit', layers: [['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Citra &copy; Esri, Maxar, Earthstar Geographics']] }
  };

  /* ---------- Tempat penting dari OpenStreetMap (Overpass API) ---------- */
  const POI_CAT = [
    { key: 'kes', label: 'Kesehatan', icon: 'plus', col: '#DB2777', test: t => /^(hospital|clinic|doctors|pharmacy|dentist)$/.test(t.amenity) },
    { key: 'edu', label: 'Pendidikan', icon: 'book', col: '#0E5AA7', test: t => /^(school|university|college|kindergarten)$/.test(t.amenity) },
    { key: 'ibadah', label: 'Tempat ibadah', icon: 'worship', col: '#6D28D9', test: t => t.amenity === 'place_of_worship' },
    { key: 'gov', label: 'Pemerintahan & keamanan', icon: 'landmark', col: '#475569', test: t => /^(townhall|police|fire_station|post_office|community_centre)$/.test(t.amenity) || t.office === 'government' },
    { key: 'makan', label: 'Kafe & restoran', icon: 'cup', col: '#0891B2', test: t => /^(restaurant|cafe|fast_food|food_court)$/.test(t.amenity) },
    { key: 'inap', label: 'Penginapan', icon: 'bed', col: '#0D9488', test: t => /^(hotel|guest_house|motel|hostel)$/.test(t.tourism) },
    { key: 'belanja', label: 'Belanja & bank', icon: 'cart', col: '#4F46E5', test: t => /^(marketplace|bank)$/.test(t.amenity) || /^(supermarket|mall|convenience|department_store)$/.test(t.shop) }
  ];
  const POI_TYPE = { hospital: 'Rumah sakit', clinic: 'Klinik / puskesmas', doctors: 'Praktik dokter', pharmacy: 'Apotek', dentist: 'Dokter gigi',
    school: 'Sekolah', university: 'Universitas', college: 'Perguruan tinggi', kindergarten: 'TK / PAUD', townhall: 'Kantor pemerintahan',
    police: 'Kantor polisi', fire_station: 'Pemadam kebakaran', post_office: 'Kantor pos', community_centre: 'Balai warga', government: 'Kantor pemerintahan',
    restaurant: 'Restoran', cafe: 'Kafe', fast_food: 'Rumah makan cepat saji', food_court: 'Pujasera', hotel: 'Hotel', guest_house: 'Penginapan',
    motel: 'Motel', hostel: 'Hostel', marketplace: 'Pasar', bank: 'Bank', supermarket: 'Supermarket', mall: 'Pusat perbelanjaan',
    convenience: 'Minimarket', department_store: 'Toserba' };
  const RELIGION = { muslim: 'Masjid / musala', christian: 'Gereja', hindu: 'Pura', buddhist: 'Vihara', confucian: 'Kelenteng' };
  function poiType(t) {
    if (t.amenity === 'place_of_worship') return RELIGION[t.religion] || 'Tempat ibadah';
    return POI_TYPE[t.amenity] || POI_TYPE[t.tourism] || POI_TYPE[t.shop] || POI_TYPE[t.office] || 'Tempat';
  }
  function poiQuery(b) {
    const bb = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
    return `[out:json][timeout:20];(`
      + `nwr["name"]["amenity"~"^(hospital|clinic|doctors|pharmacy|dentist|school|university|college|kindergarten|place_of_worship|townhall|police|fire_station|post_office|community_centre|restaurant|cafe|fast_food|food_court|marketplace|bank)$"](${bb});`
      + `nwr["name"]["tourism"~"^(hotel|guest_house|motel|hostel)$"](${bb});`
      + `nwr["name"]["shop"~"^(supermarket|mall|convenience|department_store)$"](${bb});`
      + `nwr["name"]["office"="government"](${bb});`
      + `node["name"]["place"~"^(suburb|village|neighbourhood|hamlet|quarter)$"](${bb});`
      + `);out center 400;`;
  }
  /* Lapisan tempat penting: dimuat per area terlihat, disimpan agar tidak meminta ulang */
  function poiLayer(map, onState) {
    const P = M.poi || {}, group = L.layerGroup(), seen = new Set();
    let loaded = null, timer = null, busy = false, on = false;
    const iconFor = (cat, name) => L.divIcon({ className: '', iconSize: null, iconAnchor: [11, 11], popupAnchor: [0, -10],
      html: `<span class="poi" style="--c:${cat.col}"><i>${SB.icon(cat.icon, 12)}</i><b>${esc(name)}</b></span>` });
    const placeIcon = name => L.divIcon({ className: '', iconSize: null, iconAnchor: [0, 8], html: `<span class="poi-place">${esc(name)}</span>` });
    function add(els) {
      els.forEach(e => {
        const id = e.type + e.id, t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lng = e.lon != null ? e.lon : e.center && e.center.lon;
        if (seen.has(id) || lat == null || !t.name) return;
        seen.add(id);
        if (t.place) { L.marker([lat, lng], { icon: placeIcon(t.name), interactive: false, keyboard: false }).addTo(group); return; }
        const cat = POI_CAT.find(c => c.test(t)); if (!cat) return;
        L.marker([lat, lng], { icon: iconFor(cat, t.name), title: t.name, riseOnHover: true })
          .bindPopup(`<div class="pp"><span class="pill" style="background:${cat.col}1f;color:${cat.col}">${esc(poiType(t)).toUpperCase()}</span><strong>${esc(t.name)}</strong>`
            + `${t['addr:street'] ? `<span>${esc(t['addr:street'])}${t['addr:housenumber'] ? ' ' + esc(t['addr:housenumber']) : ''}</span>` : ''}`
            + `<a href="${gmapsDir(lat, lng)}" target="_blank" rel="noopener">Rute (Google Maps)</a><span class="muted">Data tempat &copy; OpenStreetMap</span></div>`)
          .addTo(group);
      });
    }
    async function load() {
      if (!on || !P.url || busy) return;
      const z = map.getZoom();
      map.getContainer().classList.toggle('poi-labels', z >= (P.labelZoom || 17));
      if (z < (P.minZoom || 15)) { map.removeLayer(group); onState && onState('zoom'); return; }
      group.addTo(map);
      const view = map.getBounds();
      if (loaded && loaded.contains(view)) return;
      const want = view.pad(0.4);
      busy = true; onState && onState('loading');
      try {
        const r = await fetch(P.url, { method: 'POST', body: 'data=' + encodeURIComponent(poiQuery(want)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        add((await r.json()).elements || []);
        loaded = loaded ? loaded.extend(want) : want;
        onState && onState('ok');
      } catch (e) { onState && onState('error'); }
      busy = false;
    }
    const later = () => { clearTimeout(timer); timer = setTimeout(load, 500); };
    map.on('moveend', later);
    return {
      set(v) { on = v; if (v) load(); else { map.removeLayer(group); map.getContainer().classList.remove('poi-labels'); } },
      count: () => seen.size
    };
  }
  const gmapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const gmapsDir = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  function zonePopup(f, src) {
    const p = f.properties, z = f.zone;
    return `<div class="pp"><span class="pill pill-${z ? ZCLS[z] : 'mute'}">${z ? 'BAHAYA ' + ZLABEL[z].toUpperCase() : 'KELAS TIDAK DIKENALI'}</span>
      <strong>${esc(p.name || p.NAMA || p.nama || 'Zona rawan banjir')}</strong>
      ${f.index != null ? `<span>Indeks bahaya ${String(f.index).replace('.', ',')}</span>` : ''}
      <span class="muted">${src}</span></div>`;
  }
  const SRC_LABEL = { arcgis: 'Sumber: ArcGIS Online BPBD', mymaps: 'Sumber: My Maps BPBD', file: 'Sumber: data peta BPBD' };

  /*
   * SB.liveMap(el, opts) → api
   * opts: zones (bool), sensor (bool), base ('hybrid'|'satelit'|'jalan'), onZones(info), onLocate(result|error)
   */
  SB.liveMap = function (el, opts = {}) {
    if (!window.L) return null;
    const map = L.map(el, { zoomControl: false, attributionControl: true, minZoom: 5, maxZoom: 19 }).setView([M.sensor.lat, M.sensor.lng], M.zoom);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Perbesar', zoomOutTitle: 'Perkecil' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    let base = null, baseKey = null, zonesLayer = null, zoneInfo = null, me = null, meAcc = null, testMode = false;
    const show = { zones: opts.zones !== false, inarisk: opts.inarisk !== false, admin: opts.admin !== false };
    map.createPane('inarisk').style.zIndex = 350;
    map.createPane('admin').style.zIndex = 360;
    function setBase(k) {
      if (!BASE[k]) k = 'jalan';
      if (base) map.removeLayer(base);
      base = L.layerGroup(BASE[k].layers.map(([u, a, nz]) => L.tileLayer(u, { attribution: a, maxZoom: 19, maxNativeZoom: nz || 18 }))).addTo(map);
      baseKey = k;
    }
    setBase(opts.base || M.basemap);

    /* tempat penting (OpenStreetMap) */
    const poi = M.poi && M.poi.url ? poiLayer(map, st => opts.onPoi && opts.onPoi(st)) : null;
    if (poi) poi.set(opts.poi !== false);

    /* titik sensor */
    const pinIcon = st => L.divIcon({ className: '', html: `<span class="sb-pin st-${SB.status.cls(st)}"><i></i></span>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] });
    const sensor = L.marker([M.sensor.lat, M.sensor.lng], { icon: pinIcon('AMAN'), zIndexOffset: 500, keyboard: true, title: C.sensorName });
    if (opts.sensor !== false) sensor.addTo(map);
    let lastSt = null;
    function update(snap) {
      const st = snap.status, v = snap.current.v;
      if (st !== lastSt) { sensor.setIcon(pinIcon(st)); lastSt = st; }
      sensor.bindPopup(`<div class="pp"><span class="pill pill-${SB.status.cls(st)}">${st}</span><strong>${esc(C.sensorName)}</strong>
        <span>Ketinggian air ${SB.fmt.level(v)}</span>${M.sensorApprox ? '<span class="muted">Titik perkiraan lokasi pemasangan</span>' : ''}
        <a href="${gmapsUrl(M.sensor.lat, M.sensor.lng)}" target="_blank" rel="noopener">Buka di Google Maps</a></div>`);
      if (sensor.isPopupOpen()) sensor.getPopup().update();
    }

    /* indeks bahaya InaRISK dan batas administrasi */
    const status = { inarisk: null, admin: null };
    const tell = () => opts.onLayers && opts.onLayers(Object.assign({}, status));
    const IDX = M.inarisk && M.inarisk.url ? [{ key: 'bahaya', label: 'Indeks bahaya banjir', url: M.inarisk.url }].concat(M.inarisk.others || []) : [];
    let idx = IDX[0] || null;
    const inarisk = idx ? new ArcExport(idx.url, { image: true, pane: 'inarisk', opacity: M.inarisk.opacity || 0.6,
      attribution: 'Indeks &copy; <a href="https://inarisk.bnpb.go.id" target="_blank" rel="noopener">InaRISK BNPB</a>',
      onStatus: ok => { if (status.inarisk !== ok) { status.inarisk = ok; tell(); } } }) : null;
    const admin = M.adminUrl ? new ArcExport(M.adminUrl, { pane: 'admin', opacity: 0.9, attribution: 'Batas wilayah &copy; BNPB',
      onStatus: ok => { if (status.admin !== ok) { status.admin = ok; tell(); } } }) : null;
    const toggle = (layer, on) => { if (!layer) return; if (on) layer.addTo(map); else map.removeLayer(layer); };
    toggle(inarisk, show.inarisk); toggle(admin, show.admin);

    /* Ketuk peta: nilai indeks InaRISK dan nama wilayah di titik itu (data resmi BNPB) */
    map.on('click', async e => {
      if (testMode || (!(inarisk && show.inarisk) && !M.adminUrl)) return;
      const cur = inarisk && show.inarisk ? idx : null;
      const pop = L.popup().setLatLng(e.latlng).setContent('<div class="pp"><span class="muted">Membaca data InaRISK…</span></div>').openOn(map);
      const [r, w] = await Promise.all([cur ? inariskAt(e.latlng.lat, e.latlng.lng, cur.url) : null, adminAt(e.latlng.lat, e.latlng.lng)]);
      if (!map.hasLayer(pop)) return;
      const word = cur && cur.key === 'bahaya' || cur && cur.key === 'bandang' ? 'BAHAYA' : cur && cur.key === 'risiko' ? 'RISIKO' : cur && cur.key === 'kerentanan' ? 'KERENTANAN' : 'KELAS';
      const idxHtml = !cur ? '' : r.error ? `<strong>${cur.label}</strong><span>Maaf, ${r.error}.</span>`
        : `<span class="pill pill-${r.zone ? ZCLS[r.zone] : 'mute'}">${r.zone ? word + ' ' + ZLABEL[r.zone].toUpperCase() : 'TIDAK ADA NILAI'}</span>
          <strong>${cur.label}</strong><span>${r.value == null ? 'Tidak ada nilai indeks di titik ini' : 'Nilai indeks ' + fmtIdx(r.value)}</span>`;
      pop.setContent(`<div class="pp">${idxHtml}${w ? `<span class="pp-w">${SB.icon('pin', 12)}${esc(w.text)}</span>` : ''}<span class="muted">Sumber: InaRISK BNPB</span></div>`);
    });

    /* zona rawan (poligon BPBD) */
    function setZones(on) {
      show.zones = on;
      if (zonesLayer) { if (on) zonesLayer.addTo(map); else map.removeLayer(zonesLayer); }
    }
    loadZones().then(info => {
      zoneInfo = info;
      if (!info) { if (opts.onZones) opts.onZones({ none: true, inarisk: !!inarisk }); return; }
      zonesLayer = L.geoJSON(info.fc, {
        style: f => ({ color: ZCOL[f.zone || 'lain'], weight: 1.5, fillColor: ZCOL[f.zone || 'lain'], fillOpacity: f.zone === 'tinggi' ? 0.38 : 0.3 }),
        onEachFeature: (f, layer) => layer.bindPopup(() => zonePopup(f, info.sample ? 'Data contoh, bukan data BPBD' : SRC_LABEL[info.source]))
      });
      zonesLayer.on('click', pick);   // klik pada poligon tidak diteruskan ke peta karena popup
      if (show.zones) zonesLayer.addTo(map);
      if (opts.onZones) opts.onZones(Object.assign({ inarisk: !!inarisk }, info));
    }).catch(err => { if (opts.onZones) opts.onZones({ error: err.message }); });

    /* lokasi pengguna */
    function showMe(pos) {
      const ll = [pos.lat, pos.lng];
      if (!me) {
        me = L.marker(ll, { icon: L.divIcon({ className: '', html: '<span class="sb-me"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 1000, title: 'Lokasi Anda' }).addTo(map);
        meAcc = L.circle(ll, { radius: pos.acc || 0, color: '#0E5AA7', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      } else { me.setLatLng(ll); meAcc.setLatLng(ll).setRadius(pos.acc || 0); }
      map.setView(ll, Math.max(map.getZoom(), 16));
      return result(pos);
    }
    async function result(pos) {
      const [info, ir, wilayah] = await Promise.all([zoneInfo ? Promise.resolve(zoneInfo) : loadZones().catch(() => null), inariskAt(pos.lat, pos.lng), adminAt(pos.lat, pos.lng)]);
      const f = info ? zoneAt(info.fc, pos.lat, pos.lng) : null;
      const irOk = ir && !ir.error;
      /* zona BPBD (bila ada) diutamakan, lalu indeks InaRISK */
      const zone = f ? f.zone : irOk ? ir.zone : null;
      return { pos, zone, zoneSrc: f ? 'bpbd' : irOk && ir.zone ? 'inarisk' : null, feature: f, inarisk: ir, wilayah,
        sample: !!(info && info.sample), zonesReady: !!info || !!irOk, distance: distance(pos, M.sensor) };
    }
    async function locateMe() {
      const pos = await locate();
      return showMe(pos);
    }
    /* Mode uji (simulasi): ketuk peta untuk berpura-pura berada di titik itu */
    map.on('popupopen', e => { if (testMode && e.popup._source !== sensor) map.closePopup(e.popup); });
    function pick(e) {
      if (!testMode) return;
      showMe({ lat: e.latlng.lat, lng: e.latlng.lng, acc: 0 }).then(r => { r.test = true; if (opts.onLocate) opts.onLocate(r); });
    }
    map.on('click', pick);

    return {
      map, update, setZones, setBase, locate: locateMe,
      setInarisk(on) { show.inarisk = on; toggle(inarisk, on); },
      /* ganti jenis indeks InaRISK yang ditampilkan (bahaya / risiko / kerentanan / bandang) */
      setIndex(key) {
        const n = IDX.find(l => l.key === key); if (!n || !inarisk) return;
        idx = n; inarisk.url = n.url.replace(/\/+$/, ''); inarisk.refresh();
      },
      indexLayers: () => IDX.map(l => ({ key: l.key, label: l.label })),
      setAdmin(on) { show.admin = on; toggle(admin, on); },
      setPoi(on) { if (poi) poi.set(on); },
      hasPoi: () => !!poi,
      setSensor(on) { if (on) sensor.addTo(map); else map.removeLayer(sensor); },
      setTestMode(on) { testMode = on; el.classList.toggle('picking', on); },
      recenter() { map.setView([M.sensor.lat, M.sensor.lng], M.zoom); },
      base: () => baseKey,
      zones: () => zoneInfo,
      destroy() { map.remove(); }
    };
  };

  SB.peta = { loadZones, parseKML, classify, zoneAt, distance, fmtDist, inariskAt, adminAt, fmtIdx, gmapsUrl, gmapsDir, BASE, ZLABEL, ZCLS, POI_CAT, available: () => !!window.L };
})();
