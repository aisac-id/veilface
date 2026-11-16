/* VeilFace — mesin deteksi wajah + overlay kanvas.
 *
 * Prinsip privasi:
 *  - Semua inferensi berjalan lokal (face-api.js + model di dalam paket ekstensi).
 *  - Tidak ada piksel yang meninggalkan perangkat. Relay gambar hanya dipakai
 *    untuk mengambil ulang gambar lintas-origin lewat service worker ekstensi
 *    supaya kanvas tidak "tainted" (dan tetap tanpa permintaan pihak ketiga baru).
 *  - Kotak wajah terakhir dipertahankan beberapa ratus ms supaya sensor tidak
 *    berkedip membuka wajah saat deteksi gagal sesaat.
 */
(function (root) {
  'use strict';

  const KIND_LABEL = { IMG: 'Gambar', VIDEO: 'Video', CANVAS: 'Kanvas' };
  const GRACE_MS = 700;

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
      if (node && node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
    }
    return parts.join(' > ');
  }

  function mediaKey(el) {
    if (el.tagName === 'IMG') return el.currentSrc || el.src || 'img:' + cssPath(el);
    if (el.tagName === 'VIDEO') return el.currentSrc || el.src || 'video:' + cssPath(el);
    return 'canvas:' + cssPath(el);
  }

  function labelFor(el, key) {
    const alt = el.getAttribute && (el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title'));
    if (alt) return alt.slice(0, 70);
    try {
      const u = new URL(key, location.href);
      const base = u.pathname.split('/').filter(Boolean).pop();
      if (base) return decodeURIComponent(base).slice(0, 70);
      return u.hostname;
    } catch (err) { return KIND_LABEL[el.tagName] || 'Media'; }
  }

  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    if (!inter) return 0;
    return inter / (a.w * a.h + b.w * b.h - inter);
  }

  function b64ToBuffer(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function create(options) {
    const E = root.VFEffects;
    const faceapi = root.faceapi;
    const relay = options.relay || function () { return Promise.resolve({ ok: false, error: 'relay tidak tersedia' }); };
    const onStats = options.onStats || function () {};
    const onMedia = options.onMedia || function () {};
    const onLog = options.onLog || function () {};

    let settings = options.settings;
    let destroyed = false;
    let records = new Map();
    let nextId = 1;
    let overlay = null, octx = null, dpr = 1;
    let raf = null, lastFrame = 0, fpsMeter = 0, fpsCount = 0, fpsStamp = 0;
    let detector = null, landmarkNet = null, modelKind = null, modelState = 'idle', modelError = '';
    let modelPromise = null;
    let detectBusy = false;
    let placeholder = null;
    let observer = null, io = null, discoverTimer = null;
    let lastPublish = 0, lastMediaPublish = 0, mediaDirty = true;
    let panicMode = false;
    let revealed = new Set();
    let totalDetections = 0;
    let flashUntil = new Map();

    /* ---------- sumber bersih (anti canvas tainted) ---------- */

    function getPlaceholder(w, h) {
      if (!placeholder) placeholder = document.createElement('canvas');
      const cw = Math.max(8, Math.min(64, w | 0)), ch = Math.max(8, Math.min(64, h | 0));
      if (placeholder.width !== cw || placeholder.height !== ch) {
        placeholder.width = cw; placeholder.height = ch;
        const c = placeholder.getContext('2d');
        const g = c.createLinearGradient(0, 0, cw, ch);
        g.addColorStop(0, '#1a1016');
        g.addColorStop(1, '#2a1a12');
        c.fillStyle = g;
        c.fillRect(0, 0, cw, ch);
      }
      return placeholder;
    }

    function taintTest(canvas) {
      try {
        canvas.getContext('2d').getImageData(0, 0, 1, 1);
        return false;
      } catch (err) { return true; }
    }

    function snapshot(el, maxSide) {
      const nw = el.naturalWidth || el.videoWidth || el.width || 0;
      const nh = el.naturalHeight || el.videoHeight || el.height || 0;
      if (!nw || !nh) return null;
      const scale = Math.min(1, (maxSide || 1600) / Math.max(nw, nh));
      const cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round(nw * scale));
      cv.height = Math.max(2, Math.round(nh * scale));
      const c = cv.getContext('2d');
      try { c.drawImage(el, 0, 0, cv.width, cv.height); } catch (err) { return null; }
      return cv;
    }

    async function prepareSource(rec) {
      const el = rec.el;
      if (rec.kind === 'IMG' && (!el.complete || !el.naturalWidth)) { rec.status = 'menunggu'; return false; }
      if (rec.kind === 'VIDEO' && (!el.videoWidth || el.readyState < 2)) { rec.status = 'menunggu'; return false; }

      if (rec.kind === 'CANVAS') {
        if (taintTest(el)) { rec.blocked = true; rec.clean = null; rec.status = 'terlindungi'; return true; }
        rec.clean = el; rec.natural = { w: el.width, h: el.height }; rec.status = 'siap';
        return true;
      }

      const snap = snapshot(el, rec.kind === 'VIDEO' ? 720 : 1600);
      if (!snap) { rec.status = 'menunggu'; return false; }
      if (!taintTest(snap)) {
        rec.clean = snap;
        rec.natural = { w: el.naturalWidth || el.videoWidth, h: el.naturalHeight || el.videoHeight };
        rec.scale = snap.width / rec.natural.w;
        rec.status = 'siap';
        return true;
      }
      if (rec.kind === 'VIDEO') {
        rec.blocked = true; rec.clean = null;
        rec.natural = { w: el.videoWidth, h: el.videoHeight };
        rec.status = 'terlindungi';
        onLog('Video lintas-origin tidak bisa dibaca; wajah ditutup balok solid.', 'warn');
        return true;
      }
      /* gambar lintas-origin: ambil ulang lewat service worker ekstensi */
      rec.status = 'relay';
      const res = await relay({ type: 'VF_FETCH_IMAGE', src: rec.baseKey || rec.key });
      if (!res || !res.ok) {
        rec.blocked = true; rec.clean = null;
        rec.natural = { w: el.naturalWidth, h: el.naturalHeight };
        rec.status = 'terlindungi';
        return true;
      }
      const img = new Image();
      img.src = 'data:' + res.mime + ';base64,' + res.base64;
      try { await img.decode(); } catch (err) { /* beberapa browser tanpa decode() */ }
      if (!img.naturalWidth) {
        rec.blocked = true; rec.clean = null; rec.status = 'terlindungi';
        return true;
      }
      rec.clean = img;
      rec.natural = { w: img.naturalWidth, h: img.naturalHeight };
      rec.scale = 1;
      rec.relayed = true;
      rec.status = 'siap';
      return true;
    }

    function thumbFor(rec) {
      const src = usableSource(rec);
      if (!src || !rec.natural.w) return '';
      try {
        const cv = document.createElement('canvas');
        const side = 72;
        const s = Math.min(side / rec.natural.w, side / rec.natural.h);
        cv.width = Math.max(8, Math.round(rec.natural.w * s));
        cv.height = Math.max(8, Math.round(rec.natural.h * s));
        cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
        if (taintTest(cv)) return '';
        return cv.toDataURL('image/jpeg', 0.6);
      } catch (err) { return ''; }
    }

    function usableSource(rec) {
      if (rec.blocked) return null;
      return rec.clean || null;
    }

    /* ---------- model ---------- */

    async function fetchManifest(prefix) {
      const res = await relay({ type: 'VF_MODEL_FILE', file: prefix + '-weights_manifest.json', json: true });
      if (!res || !res.ok) throw new Error((res && res.error) || 'manifest tidak terbaca');
      return res.json;
    }

    async function weightMapFor(prefix) {
      const manifest = await fetchManifest(prefix);
      const specs = [];
      const buffers = [];
      let total = 0;
      for (const group of manifest) {
        for (const w of group.weights) specs.push(w);
        for (const path of group.paths) {
          const res = await relay({ type: 'VF_MODEL_FILE', file: path });
          if (!res || !res.ok) throw new Error((res && res.error) || ('shard ' + path + ' gagal'));
          const buf = b64ToBuffer(res.base64);
          buffers.push(buf);
          total += buf.byteLength;
        }
      }
      const merged = new Uint8Array(total);
      let off = 0;
      for (const b of buffers) { merged.set(new Uint8Array(b), off); off += b.byteLength; }
      return faceapi.tf.io.decodeWeights(merged.buffer, specs);
    }

    async function loadModels() {
      if (!faceapi) { modelState = 'error'; modelError = 'face-api.js tidak termuat'; return; }
      const want = settings.model === 'ssd' ? 'ssd' : 'tiny';
      if (detector && modelKind === want && modelState === 'ready') {
        if (settings.landmarks && !landmarkNet) await loadLandmarks();
        if (!settings.landmarks && landmarkNet) { landmarkNet = null; }
        return;
      }
      if (modelPromise) return modelPromise;
      modelState = 'loading';
      modelError = '';
      publishStats(true);
      modelPromise = (async () => {
        try {
          const tf = faceapi.tf;
          try { await tf.setBackend('webgl'); } catch (err) { /* jatuh ke cpu */ }
          await tf.ready();
          const prefix = want === 'ssd' ? 'ssd_mobilenetv1_model' : 'tiny_face_detector_model';
          const map = await weightMapFor(prefix);
          /* API tingkat tinggi face-api memakai instance singleton di faceapi.nets,
           * jadi bobot harus dimuat ke sana. Tensor pada map menjadi milik model:
           * jangan di-dispose atau inferensi akan gagal. */
          const net = want === 'ssd' ? faceapi.nets.ssdMobilenetv1 : faceapi.nets.tinyFaceDetector;
          await net.loadFromWeightMap(map);
          detector = net;
          modelKind = want;
          modelState = 'ready';
          onLog('Model ' + (want === 'ssd' ? 'SSD MobileNet v1' : 'Tiny Face Detector') + ' siap (' + tf.getBackend() + ').', 'ok');
          if (settings.landmarks) await loadLandmarks();
          rescan();
        } catch (err) {
          modelState = 'error';
          modelError = String((err && err.message) || err);
          onLog('Gagal memuat model: ' + modelError, 'danger');
        } finally {
          modelPromise = null;
          publishStats(true);
        }
      })();
      return modelPromise;
    }

    async function loadLandmarks() {
      try {
        const map = await weightMapFor('face_landmark_68_tiny_model');
        const net = faceapi.nets.faceLandmark68TinyNet;
        await net.loadFromWeightMap(map);
        landmarkNet = net;
        onLog('Landmark 68 titik aktif (mode Eye Strip lebih presisi).', 'ok');
      } catch (err) {
        landmarkNet = null;
        onLog('Landmark gagal dimuat: ' + String((err && err.message) || err), 'warn');
      }
    }

    let detectKind = 'IMG';

    function detectorOptions() {
      const d = settings.detect;
      if (modelKind === 'ssd') {
        return new faceapi.SsdMobilenetv1Options({
          minConfidence: Math.max(0.1, Math.min(0.95, d.threshold / 100)),
          maxResults: Math.max(1, d.maxFaces)
        });
      }
      let size = Math.max(128, Math.min(608, Math.round(d.inputSize / 32) * 32));
      /* video dipindai berulang: batasi resolusi agar frame tetap responsif */
      if (detectKind === 'VIDEO') size = Math.min(size, 416);
      return new faceapi.TinyFaceDetectorOptions({
        inputSize: size,
        scoreThreshold: Math.max(0.1, Math.min(0.95, d.threshold / 100))
      });
    }

    /* ---------- deteksi ---------- */

    async function detectRecord(rec) {
      if (destroyed || !detector || !settings.enabled) return;
      const ok = await prepareSource(rec);
      mediaDirty = true;
      if (!ok) { publishMedia(); return; }
      if (!rec.thumb) rec.thumb = thumbFor(rec);
      if (rec.blocked || !usableSource(rec)) {
        /* sumber tak terbaca: seluruh media ditutup, tanpa bocor */
        rec.status = 'terlindungi';
        rec.tracks = [];
        rec.fullCover = true;
        rec.everDetected = true;
        publishMedia();
        return;
      }
      rec.fullCover = false;
      rec.status = 'mendeteksi';
      publishMedia();
      const src = usableSource(rec);
      const scale = rec.scale || 1;
      detectKind = rec.kind;
      try {
        const opts = detectorOptions();
        let results = await faceapi.detectAllFaces(src, opts);
        if (destroyed) return;
        const d = settings.detect;
        const boxes = [];
        for (const r of results) {
          const b = r.box;
          const box = { x: b.x / scale, y: b.y / scale, w: b.width / scale, h: b.height / scale };
          if (Math.min(box.w, box.h) < d.minSize) continue;
          boxes.push({ box, score: r.score });
          if (boxes.length >= d.maxFaces) break;
        }
        mergeTracks(rec, boxes);
        totalDetections += boxes.length;
        rec.everDetected = true;
        rec.status = 'siap';
        rec.lastError = '';
        if (settings.landmarks && landmarkNet && boxes.length) {
          try {
            const lm = await faceapi.detectFaceLandmarksTiny(src);
            rec.landmarks = lm ? true : false;
          } catch (err) { rec.landmarks = false; }
        }
      } catch (err) {
        rec.status = 'galat';
        rec.lastError = String((err && err.message) || err);
        rec.fullCover = true; /* gagal deteksi => tutup total, jangan bocor */
        onLog('Deteksi gagal pada ' + rec.label + ': ' + rec.lastError, 'warn');
      }
      rec.lastDetect = performance.now();
      mediaDirty = true;
      publishMedia();
      publishStats();
    }

    function mergeTracks(rec, boxes) {
      const now = performance.now();
      const used = new Set();
      const next = [];
      for (const det of boxes) {
        let best = null, bestScore = 0.25;
        for (const tr of rec.tracks) {
          if (used.has(tr.id)) continue;
          const s = iou(tr.box, det.box);
          if (s > bestScore) { bestScore = s; best = tr; }
        }
        if (best) {
          used.add(best.id);
          best.box = det.box;
          best.score = det.score;
          best.lastSeen = now;
          next.push(best);
        } else {
          const tr = {
            id: nextId++,
            box: det.box,
            shown: { ...det.box },
            score: det.score,
            lastSeen: now,
            seed: (nextId * 2654435761) % 100000
          };
          next.push(tr);
        }
      }
      /* tahan kotak lama sebentar supaya sensor tidak berkedip */
      for (const tr of rec.tracks) {
        if (!used.has(tr.id) && now - tr.lastSeen < GRACE_MS && rec.kind === 'VIDEO') next.push(tr);
      }
      rec.tracks = next;
    }

    function pumpDetect() {
      if (detectBusy || destroyed || !settings.enabled) return;
      if (modelState !== 'ready') { loadModels(); return; }
      const now = performance.now();
      const interval = Math.max(80, settings.detect.interval);
      let target = null;
      for (const rec of records.values()) {
        if (!rec.visible || !rec.enabled || rec.broken || revealed.has(rec.id)) continue;
        if (rec.kind === 'IMG' && rec.everDetected && !rec.dirty) continue;
        if (rec.kind === 'CANVAS' && rec.everDetected && now - rec.lastDetect < interval * 2) continue;
        if (rec.lastDetect && now - rec.lastDetect < interval) continue;
        if (rec.status === 'menunggu' && rec.lastDetect && now - rec.lastDetect < 400) continue;
        target = rec;
        break;
      }
      if (!target) return;
      detectBusy = true;
      target.lastDetect = now;
      target.dirty = false;
      detectRecord(target).catch(() => {}).then(() => { detectBusy = false; });
    }

    /* ---------- registry media ---------- */

    function excluded(el) {
      for (const sel of settings.excludeSelectors || []) {
        if (!sel) continue;
        try { if (el.matches(sel) || el.closest(sel)) return true; } catch (err) { /* selector salah */ }
      }
      if (el.closest && el.closest('.vf-sidebar-host')) return true;
      return false;
    }

    function included(el) {
      const list = settings.includeSelectors || [];
      if (!list.length) return true;
      for (const sel of list) {
        if (!sel) continue;
        try { if (el.matches(sel) || el.closest(sel)) return true; } catch (err) { /* abaikan */ }
      }
      return false;
    }

    function discover() {
      if (destroyed) return;
      const host = location.hostname;
      if ((settings.allowlist || []).includes(host)) { removeAll(); return; }
      const d = settings.detect;
      const nodes = Array.from(document.querySelectorAll('img, video, canvas'));
      const seen = new Set();
      const dupes = new Map();
      for (const el of nodes) {
        if (el.closest && el.closest('.vf-sidebar-host')) continue;
        if (excluded(el) || !included(el)) continue;
        if (el.tagName === 'IMG' && !d.images) continue;
        if (el.tagName === 'VIDEO' && !d.videos) continue;
        if (el.tagName === 'CANVAS' && (!d.canvases || el === overlay)) continue;
        const base = mediaKey(el);
        const nth = dupes.get(base) || 0;
        dupes.set(base, nth + 1);
        const key = nth ? base + '::' + nth : base;
        seen.add(key);
        let rec = records.get(key);
        if (rec && rec.el !== el) { rec.el = el; rec.dirty = true; }
        if (!rec) {
          const ov = (settings.mediaOverrides || {})[base] || {};
          rec = {
            id: nextId++,
            key,
            baseKey: base,
            el,
            kind: el.tagName,
            label: labelFor(el, base),
            natural: { w: 0, h: 0 },
            scale: 1,
            tracks: [],
            status: 'menunggu',
            enabled: ov.enabled !== false,
            effect: ov.effect || '',
            visible: false,
            everDetected: false,
            lastDetect: 0,
            dirty: true,
            thumb: '',
            broken: false,
            blocked: false,
            fullCover: false,
            clean: null
          };
          records.set(key, rec);
          if (io) io.observe(el);
          if (el.tagName === 'IMG') {
            el.addEventListener('load', () => { rec.dirty = true; rec.broken = false; rec.everDetected = false; rec.clean = null; rec.thumb = ''; }, { passive: true });
            el.addEventListener('error', () => { rec.broken = true; rec.status = 'tidak termuat'; rec.tracks = []; rec.everDetected = true; mediaDirty = true; publishMedia(); }, { passive: true });
          }
          mediaDirty = true;
        }
      }
      for (const [key, rec] of Array.from(records.entries())) {
        if (!seen.has(key) || !rec.el.isConnected) {
          if (io) { try { io.unobserve(rec.el); } catch (err) { /* noop */ } }
          records.delete(key);
          mediaDirty = true;
        }
      }
      publishMedia();
      publishStats();
    }

    function removeAll() {
      for (const rec of records.values()) { rec.tracks = []; rec.clean = null; }
      records.clear();
      mediaDirty = true;
      publishMedia();
      publishStats(true);
    }

    /* ---------- overlay ---------- */

    function ensureOverlay() {
      if (overlay && overlay.isConnected) return;
      overlay = document.createElement('canvas');
      overlay.className = 'vf-overlay';
      overlay.setAttribute('data-vf-ignore', '');
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(overlay);
      octx = overlay.getContext('2d');
      sizeOverlay();
    }

    function sizeOverlay() {
      if (!overlay) return;
      const cap = settings.quality === 'hemat' ? 1 : settings.quality === 'tajam' ? 2 : 1.5;
      dpr = Math.min(cap, root.devicePixelRatio || 1);
      const w = Math.max(1, root.innerWidth), h = Math.max(1, root.innerHeight);
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (overlay.width !== bw || overlay.height !== bh) {
        overlay.width = bw;
        overlay.height = bh;
      }
      overlay.style.width = w + 'px';
      overlay.style.height = h + 'px';
    }

    function paramsFor(rec) {
      const base = settings.params;
      const p = { ...base, emoji: settings.emoji };
      return p;
    }

    function effectFor(rec) {
      return rec.effect || settings.effect;
    }

    function render(ts) {
      raf = requestAnimationFrame(render);
      if (destroyed) return;
      const minDelta = 1000 / Math.max(5, Math.min(60, settings.fps || 30));
      if (ts - lastFrame < minDelta - 1) return;
      lastFrame = ts;
      fpsCount++;
      if (ts - fpsStamp > 700) { fpsMeter = Math.round((fpsCount * 1000) / (ts - fpsStamp)); fpsCount = 0; fpsStamp = ts; }

      ensureOverlay();
      sizeOverlay();
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, root.innerWidth, root.innerHeight);
      pumpDetect();

      const time = settings.screenshotSafe ? 0 : ts;
      let faceCount = 0;
      const active = settings.enabled;

      for (const rec of records.values()) {
        if (!rec.visible || rec.broken) continue;
        const el = rec.el;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.bottom < -80 || r.top > root.innerHeight + 80 || r.right < -80 || r.left > root.innerWidth + 80) continue;
        const on = active && rec.enabled && !revealed.has(rec.id);
        if (!on) continue;

        const nw = rec.natural.w || el.naturalWidth || el.videoWidth || el.width || r.width;
        const nh = rec.natural.h || el.naturalHeight || el.videoHeight || el.height || r.height;
        const sx = r.width / nw, sy = r.height / nh;
        const src = usableSource(rec) || getPlaceholder(nw / 8, nh / 8);
        const p = paramsFor(rec);
        const eff = panicMode ? 'bar' : effectFor(rec);
        const pp = panicMode ? { ...p, intensity: 100, opacity: 100, padding: 0, radius: 0 } : p;

        octx.save();
        octx.beginPath();
        octx.rect(r.left, r.top, r.width, r.height);
        octx.clip();

        const coverAll = panicMode || rec.fullCover;
        if (coverAll) {
          const box = { x: 0, y: 0, w: nw, h: nh };
          E.drawEffect(octx, src, box, { x: r.left, y: r.top, w: r.width, h: r.height }, eff, pp, time, rec.id * 13);
          faceCount += Math.max(1, rec.tracks.length);
        } else if (!rec.everDetected) {
          /* tirai sementara: jangan pernah menampilkan wajah sebelum dipindai */
          octx.fillStyle = 'rgba(10,7,14,0.9)';
          octx.fillRect(r.left, r.top, r.width, r.height);
          const band = ((time / 9) % (r.height + 60)) - 30;
          const g = octx.createLinearGradient(0, r.top + band - 26, 0, r.top + band + 26);
          g.addColorStop(0, 'rgba(255,176,32,0)');
          g.addColorStop(0.5, 'rgba(255,176,32,0.35)');
          g.addColorStop(1, 'rgba(255,176,32,0)');
          octx.fillStyle = g;
          octx.fillRect(r.left, r.top + band - 26, r.width, 52);
          octx.strokeStyle = 'rgba(255,176,32,0.55)';
          octx.lineWidth = 1.5;
          octx.strokeRect(r.left + 1, r.top + 1, r.width - 2, r.height - 2);
        } else {
          const alpha = 1 - (settings.detect.smoothing / 100) * 0.86;
          const pad = pp.padding / 100;
          for (const tr of rec.tracks) {
            tr.shown.x += (tr.box.x - tr.shown.x) * alpha;
            tr.shown.y += (tr.box.y - tr.shown.y) * alpha;
            tr.shown.w += (tr.box.w - tr.shown.w) * alpha;
            tr.shown.h += (tr.box.h - tr.shown.h) * alpha;
            const bx = tr.shown.x - tr.shown.w * pad;
            const by = tr.shown.y - tr.shown.h * pad;
            const bw = tr.shown.w * (1 + pad * 2);
            const bh = tr.shown.h * (1 + pad * 2);
            const rect = { x: r.left + bx * sx, y: r.top + by * sy, w: bw * sx, h: bh * sy };
            if (rect.w < 2 || rect.h < 2) continue;
            E.drawEffect(octx, src, { x: bx, y: by, w: bw, h: bh }, rect, eff, pp, time, tr.seed);
            faceCount++;
            if (settings.showBoxes) {
              octx.save();
              octx.strokeStyle = 'rgba(57,255,180,0.9)';
              octx.setLineDash([4, 3]);
              octx.lineWidth = 1;
              octx.strokeRect(rect.x, rect.y, rect.w, rect.h);
              octx.setLineDash([]);
              octx.fillStyle = 'rgba(8,6,12,0.85)';
              octx.fillRect(rect.x, rect.y - 15, 54, 14);
              octx.fillStyle = '#39FFB4';
              octx.font = '10px ui-monospace, monospace';
              octx.fillText('#' + tr.id + ' ' + Math.round(tr.score * 100) + '%', rect.x + 4, rect.y - 4);
              octx.restore();
            }
          }
        }

        const flash = flashUntil.get(rec.id);
        if (flash && ts < flash) {
          octx.strokeStyle = 'rgba(255,176,32,' + (0.4 + 0.6 * Math.abs(Math.sin(ts / 120))) + ')';
          octx.lineWidth = 3;
          octx.strokeRect(r.left + 2, r.top + 2, r.width - 4, r.height - 4);
        } else if (flash) flashUntil.delete(rec.id);

        octx.restore();
      }

      if (ts - lastPublish > 500) publishStats();
      if (mediaDirty && ts - lastMediaPublish > 450) publishMedia();
      currentFaces = faceCount;
    }

    let currentFaces = 0;

    function statsSnapshot() {
      let ready = 0, guarded = 0, faces = 0;
      for (const rec of records.values()) {
        if (rec.everDetected && !rec.broken) ready++;
        if (rec.blocked || rec.fullCover) guarded++;
        faces += rec.tracks.length;
      }
      return {
        faces: currentFaces,
        media: records.size,
        scanned: ready,
        guarded,
        totalDetections,
        fps: fpsMeter,
        model: modelKind === 'ssd' ? 'SSD MobileNet v1' : modelKind === 'tiny' ? 'Tiny Face Detector' : '—',
        modelState,
        modelError,
        backend: faceapi && faceapi.tf ? faceapi.tf.getBackend() : '—',
        enabled: settings.enabled,
        panic: panicMode
      };
    }

    function publishStats(force) {
      const now = performance.now();
      if (!force && now - lastPublish < 480) return;
      lastPublish = now;
      onStats(statsSnapshot());
    }

    function mediaSnapshot() {
      return Array.from(records.values()).map((rec) => {
        const r = rec.el.getBoundingClientRect ? rec.el.getBoundingClientRect() : { width: 0, height: 0 };
        const best = rec.tracks.reduce((m, t) => Math.max(m, t.score), 0);
        return {
          id: rec.id,
          key: rec.key,
          kind: rec.kind,
          kindLabel: KIND_LABEL[rec.kind] || rec.kind,
          label: rec.label,
          w: rec.natural.w || 0,
          h: rec.natural.h || 0,
          displayW: Math.round(r.width),
          displayH: Math.round(r.height),
          faces: rec.tracks.length,
          score: Math.round(best * 100),
          status: rec.status,
          enabled: rec.enabled,
          effect: rec.effect || '',
          activeEffect: effectFor(rec),
          visible: rec.visible,
          blocked: !!rec.blocked,
          relayed: !!rec.relayed,
          fullCover: !!rec.fullCover,
          revealed: revealed.has(rec.id),
          thumb: rec.thumb,
          error: rec.lastError || ''
        };
      });
    }

    function publishMedia(force) {
      const now = performance.now();
      if (!force && now - lastMediaPublish < 420) return;
      lastMediaPublish = now;
      mediaDirty = false;
      onMedia(mediaSnapshot());
    }

    /* ---------- aksi publik ---------- */

    function scan() {
      discover();
      loadModels();
      if (!raf) { lastFrame = 0; fpsStamp = performance.now(); raf = requestAnimationFrame(render); }
    }

    function rescan() {
      for (const rec of records.values()) {
        rec.tracks = [];
        rec.everDetected = false;
        rec.dirty = true;
        rec.lastDetect = 0;
        rec.fullCover = false;
        if (rec.kind !== 'CANVAS') rec.clean = null;
        rec.thumb = '';
      }
      revealed.clear();
      mediaDirty = true;
      scan();
      publishMedia(true);
      onLog('Pindai ulang: ' + records.size + ' media diperiksa.', 'info');
    }

    function restore() {
      for (const rec of records.values()) { rec.tracks = []; rec.fullCover = false; }
      if (octx) octx.clearRect(0, 0, root.innerWidth, root.innerHeight);
      publishMedia(true);
      publishStats(true);
    }

    function applySettings(next) {
      const prev = settings;
      settings = next;
      /* override yang datang dari storage selalu menang; entri yang belum ada
       * tidak menghapus pilihan yang baru dibuat di sesi ini. */
      const ov = next.mediaOverrides || {};
      for (const rec of records.values()) {
        const entry = ov[rec.baseKey || rec.key];
        if (!entry) continue;
        if (typeof entry.effect === 'string') rec.effect = entry.effect;
        if (typeof entry.enabled === 'boolean') rec.enabled = entry.enabled;
      }
      if (next.model !== prev.model || next.landmarks !== prev.landmarks) loadModels();
      if (next.quality !== prev.quality) sizeOverlay();
      if ((next.allowlist || []).join() !== (prev.allowlist || []).join()) discover();
      if (next.detect.images !== prev.detect.images || next.detect.videos !== prev.detect.videos || next.detect.canvases !== prev.detect.canvases) discover();
      if (next.detect.threshold !== prev.detect.threshold || next.detect.inputSize !== prev.detect.inputSize || next.detect.minSize !== prev.detect.minSize) {
        for (const rec of records.values()) { rec.dirty = true; rec.everDetected = rec.kind === 'VIDEO' ? rec.everDetected : false; }
      }
      if (!next.enabled) restore();
      else if (!prev.enabled) rescan();
      publishStats(true);
      publishMedia(true);
    }

    function setMediaEffect(id, effect) {
      const rec = byId(id);
      if (!rec) return;
      rec.effect = effect || '';
      const ov = { ...(settings.mediaOverrides || {}) };
      const bk = rec.baseKey || rec.key;
      ov[bk] = { ...(ov[bk] || {}), effect: rec.effect, enabled: rec.enabled };
      settings = { ...settings, mediaOverrides: ov };
      mediaDirty = true;
      publishMedia(true);
      return settings.mediaOverrides;
    }

    function toggleMedia(id, enabled) {
      const rec = byId(id);
      if (!rec) return;
      rec.enabled = enabled;
      if (enabled) { rec.dirty = true; rec.everDetected = false; }
      const ov = { ...(settings.mediaOverrides || {}) };
      const bk = rec.baseKey || rec.key;
      ov[bk] = { ...(ov[bk] || {}), effect: rec.effect, enabled };
      settings = { ...settings, mediaOverrides: ov };
      publishMedia(true);
      return settings.mediaOverrides;
    }

    function byId(id) {
      for (const rec of records.values()) if (rec.id === id) return rec;
      return null;
    }

    function reveal(id, on) {
      const rec = byId(id);
      if (!rec) return;
      if (on) revealed.add(rec.id); else { revealed.delete(rec.id); rec.dirty = true; }
      publishMedia(true);
      publishStats(true);
    }

    function revealAll(on) {
      revealed.clear();
      if (on) for (const rec of records.values()) revealed.add(rec.id);
      publishMedia(true);
      publishStats(true);
    }

    function focus(id) {
      const rec = byId(id);
      if (!rec) return false;
      try { rec.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { rec.el.scrollIntoView(); }
      flashUntil.set(rec.id, performance.now() + 1600);
      return true;
    }

    function focusSrc(src) {
      for (const rec of records.values()) {
        if (rec.baseKey === src || rec.key === src || rec.el.currentSrc === src || rec.el.src === src) {
          rec.enabled = true;
          focus(rec.id);
          publishMedia(true);
          return rec.id;
        }
      }
      return 0;
    }

    function exportMedia(id) {
      const rec = byId(id);
      if (!rec) return { ok: false, error: 'media tidak ditemukan' };
      const nw = rec.natural.w || rec.el.naturalWidth || rec.el.videoWidth || 0;
      const nh = rec.natural.h || rec.el.naturalHeight || rec.el.videoHeight || 0;
      if (!nw || !nh) return { ok: false, error: 'media belum siap' };
      const src = usableSource(rec);
      if (!src) return { ok: false, error: 'sumber terproteksi CORS — ekspor tidak tersedia' };
      try {
        const cv = document.createElement('canvas');
        cv.width = nw; cv.height = nh;
        const c = cv.getContext('2d');
        c.drawImage(src, 0, 0, nw, nh);
        const p = { ...paramsFor(rec), emoji: settings.emoji };
        const eff = effectFor(rec);
        const pad = p.padding / 100;
        if (rec.fullCover || panicMode || !rec.tracks.length) {
          E.drawEffect(c, src, { x: 0, y: 0, w: nw, h: nh }, { x: 0, y: 0, w: nw, h: nh }, panicMode ? 'bar' : eff, p, performance.now(), rec.id * 13);
        }
        for (const tr of rec.tracks) {
          const b = tr.shown;
          const box = { x: b.x - b.w * pad, y: b.y - b.h * pad, w: b.w * (1 + pad * 2), h: b.h * (1 + pad * 2) };
          E.drawEffect(c, src, box, { ...box }, eff, p, performance.now(), tr.seed);
        }
        if (taintTest(cv)) return { ok: false, error: 'kanvas terproteksi CORS' };
        return { ok: true, dataUrl: cv.toDataURL('image/png'), name: (rec.label || 'veilface').replace(/[^\w.\-]+/g, '_').slice(0, 48) + '-censored.png' };
      } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
    }

    function panic() {
      panicMode = true;
      settings = { ...settings, enabled: true, screenshotSafe: true };
      revealed.clear();
      for (const rec of records.values()) rec.enabled = true;
      discover();
      publishStats(true);
      publishMedia(true);
      onLog('Panic: seluruh media ditutup balok solid.', 'danger');
      return settings;
    }

    function calm() {
      panicMode = false;
      publishStats(true);
      publishMedia(true);
    }

    function exportConfig() {
      return {
        app: 'VeilFace',
        version: 1,
        exportedAt: new Date().toISOString(),
        effect: settings.effect,
        params: settings.params,
        detect: settings.detect,
        model: settings.model,
        landmarks: settings.landmarks,
        emoji: settings.emoji,
        quality: settings.quality,
        fps: settings.fps,
        includeSelectors: settings.includeSelectors,
        excludeSelectors: settings.excludeSelectors,
        mediaOverrides: settings.mediaOverrides
      };
    }

    /* ----------pengamat ---------- */

    function attach() {
      io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          for (const rec of records.values()) {
            if (rec.el === en.target) {
              rec.visible = en.isIntersecting;
              if (en.isIntersecting && !rec.everDetected) rec.dirty = true;
            }
          }
        }
      }, { rootMargin: '160px' });
      for (const rec of records.values()) io.observe(rec.el);

      observer = new MutationObserver((muts) => {
        let relevant = false;
        for (const m of muts) {
          if (m.type === 'attributes') {
            const t = m.target;
            if (t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) {
              const base = mediaKey(t);
              for (const rec of records.values()) {
                if (rec.baseKey === base && rec.el === t) { rec.dirty = true; rec.everDetected = false; rec.clean = null; rec.thumb = ''; }
              }
              relevant = true;
            }
            continue;
          }
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.matches && (n.matches('img, video, canvas') || n.querySelector('img, video, canvas'))) { relevant = true; break; }
          }
          if (!relevant && m.removedNodes.length) relevant = true;
          if (relevant) break;
        }
        if (!relevant) return;
        if (discoverTimer) clearTimeout(discoverTimer);
        discoverTimer = setTimeout(discover, 260);
      });
      observer.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster']
      });
      root.addEventListener('resize', sizeOverlay, { passive: true });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) publishStats(true); }, { passive: true });
    }

    function destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (observer) observer.disconnect();
      if (io) io.disconnect();
      if (discoverTimer) clearTimeout(discoverTimer);
      if (overlay) overlay.remove();
      overlay = null; octx = null;
      records.clear();
      try { if (detector && detector.dispose) detector.dispose(); } catch (err) { /* noop */ }
      detector = null; landmarkNet = null;
    }

    attach();

    return {
      scan, rescan, restore, applySettings, setMediaEffect, toggleMedia,
      reveal, revealAll, focus, focusSrc, exportMedia, panic, calm,
      exportConfig, destroy,
      getMedia: mediaSnapshot,
      getStats: statsSnapshot,
      getSettings: () => settings,
      isPanic: () => panicMode,
      reloadModel: () => { modelKind = null; detector = null; return loadModels(); },
      publish: () => { publishStats(true); publishMedia(true); }
    };
  }

  root.VFEngine = { create, cssPath, mediaKey };
})(typeof self !== 'undefined' ? self : globalThis);