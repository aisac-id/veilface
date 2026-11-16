/* VeilFace — logika sidebar.
 * Tab disusun vertikal ke bawah; setiap kontrol mengirim patch yang langsung
 * terlihat di overlay halaman. Tidak ada gambar yang dikirim ke jaringan. */
(function () {
  'use strict';

  const E = window.VFEffects;
  const AUDIO = window.VFAUDIO;
  const CHANNEL = 'VEILFACE_BUS';
  const token = (location.hash.match(/k=([a-z0-9]+)/i) || [])[1] || '';
  const standalone = window.parent === window;

  const DEFAULTS = {
    enabled: true, autoScan: true, effect: 'bar', model: 'tiny', landmarks: false,
    showBoxes: false, screenshotSafe: false, dockMode: 'dock', sound: true, theme: 'ember',
    sidebarWidth: 25, openTab: 'status', emoji: '🙂', volume: 55,
    detect: { threshold: 35, inputSize: 608, minSize: 28, maxFaces: 40, interval: 220, smoothing: 55, images: true, videos: true, canvases: true },
    params: { intensity: 85, blur: 14, pixel: 12, glitch: 55, speed: 55, hue: 28, opacity: 100, padding: 12, radius: 8, jitter: 35, grain: 25, scanline: 45 },
    quality: 'balanced', fps: 30, mediaOverrides: {}, allowlist: [], profiles: {},
    excludeSelectors: ['[data-vf-ignore]', '.vf-sidebar-host'], includeSelectors: []
  };

  const S = {
    settings: JSON.parse(JSON.stringify(DEFAULTS)),
    stats: { faces: 0, media: 0, scanned: 0, guarded: 0, fps: 0, model: '—', modelState: 'idle', modelError: '', backend: '—', enabled: true, panic: false, totalDetections: 0 },
    media: [], logs: [], url: '', title: ''
  };
  const UI = { tab: 'status', search: '', filter: 'all', sort: 'faces', selected: new Set(), peekAll: false, resetArmed: false, lastShot: null };

  /* ---------- util DOM ---------- */
  function el(tag, props, kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') node.className = props[k];
        else if (k === 'text') node.textContent = props[k];
        else if (k === 'html') node.innerHTML = props[k];
        else if (k === 'style') node.setAttribute('style', props[k]);
        else if (k.startsWith('on') && typeof props[k] === 'function') node.addEventListener(k.slice(2), props[k]);
        else if (props[k] !== null && props[k] !== undefined && props[k] !== false) node.setAttribute(k, props[k] === true ? '' : props[k]);
      }
    }
    for (const kid of [].concat(kids || [])) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }
  const svg = (paths, extra) => {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 24 24');
    if (extra) for (const k in extra) wrap.setAttribute(k, extra[k]);
    wrap.innerHTML = paths;
    return wrap;
  };
  const ICON = {
    gauge: '<path d="M12 13l4-4"/><path d="M4 18a9 9 0 1 1 16 0"/><circle cx="12" cy="13" r="1.4"/>',
    radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6-4"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>',
    frames: '<rect x="3" y="5" width="12" height="10" rx="2"/><path d="M8 19h11a2 2 0 0 0 2-2V9"/><circle cx="8" cy="9.5" r="1.4"/><path d="M4 14l3-2.5 3 2.5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    download: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3"/>',
    eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="M4 4l16 16"/><path d="M9.6 5.6A9.7 9.7 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6M6.2 7.9A16.7 16.7 0 0 0 2 11s3.6 6 10 6a9.6 9.6 0 0 0 3.4-.6"/>',
    face: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 10h.01M15.5 10h.01"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6.5 17.5l11-11"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4h4"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8.2-8 9-4.5-.8-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 11l6-3v8l-6-3z"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l5-4 4 3 3-2.5 4 3.5"/>'
  };

  const TABS = [
    { id: 'status', label: 'Status', sub: 'wajah & aktivitas', icon: 'gauge' },
    { id: 'detect', label: 'Deteksi', sub: 'model · ambang · pelacakan', icon: 'radar' },
    { id: 'effects', label: 'Efek Wajah', sub: E.EFFECTS.length + ' gaya sensor', icon: 'spark' },
    { id: 'tune', label: 'Parameter', sub: 'kontrol live', icon: 'sliders' },
    { id: 'media', label: 'Media', sub: 'gambar · video · kanvas', icon: 'frames' },
    { id: 'site', label: 'Situs & Area', sub: 'dock · selector · profil', icon: 'target' },
    { id: 'export', label: 'Ekspor', sub: 'PNG tersensor & konfigurasi', icon: 'download' },
    { id: 'settings', label: 'Pengaturan', sub: 'tema · suara · performa', icon: 'gear' }
  ];

  const PARAM_META = [
    { key: 'intensity', label: 'Intensitas', min: 0, max: 100, unit: '%' },
    { key: 'blur', label: 'Radius blur', min: 1, max: 40, unit: 'px' },
    { key: 'pixel', label: 'Ukuran mozaik', min: 2, max: 34, unit: 'px' },
    { key: 'glitch', label: 'Kekuatan glitch', min: 0, max: 100, unit: '%' },
    { key: 'speed', label: 'Kecepatan animasi', min: 0, max: 100, unit: '%' },
    { key: 'hue', label: 'Rona warna', min: 0, max: 360, unit: '°' },
    { key: 'opacity', label: 'Opasitas', min: 25, max: 100, unit: '%' },
    { key: 'padding', label: 'Tepi sensor', min: 0, max: 45, unit: '%' },
    { key: 'radius', label: 'Sudut membulat', min: 0, max: 40, unit: 'px' },
    { key: 'jitter', label: 'Getaran', min: 0, max: 100, unit: '%' },
    { key: 'grain', label: 'Butiran / noise', min: 0, max: 100, unit: '%' },
    { key: 'scanline', label: 'Kerapatan scanline', min: 8, max: 100, unit: '%' }
  ];

  const DETECT_META = [
    { key: 'threshold', label: 'Ambang keyakinan', min: 10, max: 95, step: 1, unit: '%' },
    { key: 'inputSize', label: 'Resolusi deteksi', min: 128, max: 608, step: 32, unit: 'px' },
    { key: 'minSize', label: 'Wajah minimum', min: 12, max: 200, step: 2, unit: 'px' },
    { key: 'maxFaces', label: 'Batas wajah / media', min: 1, max: 120, step: 1, unit: '' },
    { key: 'interval', label: 'Jeda pindai video', min: 80, max: 1200, step: 20, unit: 'ms' },
    { key: 'smoothing', label: 'Penghalusan kotak', min: 0, max: 95, step: 1, unit: '%' }
  ];

  const refs = {};
  let previewRaf = null;
  let lastConfig = null;

  /* ---------- komunikasi ---------- */
  function send(type, extra) {
    if (standalone) { demoHandle(type, extra); return; }
    window.parent.postMessage({ channel: CHANNEL, token, type, ...(extra || {}) }, '*');
  }
  const LIGHT_KEYS = new Set(['params', 'volume', 'sound', 'theme', 'openTab', 'emoji', 'effect', 'sidebarWidth', 'dockMode', 'fps', 'quality', 'showBoxes', 'screenshotSafe']);
  function patch(obj) {
    S.settings = {
      ...S.settings, ...obj,
      params: { ...S.settings.params, ...(obj.params || {}) },
      detect: { ...S.settings.detect, ...(obj.detect || {}) }
    };
    applyLocalTheme();
    const light = Object.keys(obj).every((k) => LIGHT_KEYS.has(k));
    if (light) {
      refreshHeader(); refreshTune(); refreshEffects(); refreshStatus(); refreshSettings();
      if (obj.sidebarWidth || obj.dockMode) refreshSite();
    } else {
      refreshAll();
    }
    send('VF_PATCH', { patch: obj });
  }
  function sfx(name) { if (S.settings.sound) AUDIO.play(name); }

  function toast(text, actionLabel, action) {
    const box = refs.toast;
    refs.toastText.textContent = text;
    refs.toastAction.hidden = !actionLabel;
    if (actionLabel) {
      refs.toastAction.textContent = actionLabel;
      refs.toastAction.onclick = () => { box.hidden = true; if (action) action(); };
    }
    box.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { box.hidden = true; }, 6000);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    sfx('copy');
    toast('Berkas ' + filename + ' dibuat.');
  }
  function triggerDownload(url, filename) {
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      sfx('copy');
      toast('Disalin ke clipboard.');
    } catch (err) {
      const ta = el('textarea', { class: 'vf-sr' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Disalin ke clipboard.'); } catch (e2) { toast('Clipboard diblokir browser.'); }
      ta.remove();
    }
  }

  /* ---------- header & tema ---------- */
  function hostName() {
    try { return S.url ? new URL(S.url).hostname : (standalone ? 'mode pratinjau' : '—'); } catch (err) { return '—'; }
  }
  function refreshHeader() {
    refs.power.setAttribute('aria-pressed', String(!!S.settings.enabled));
    refs.power.querySelector('.vf-power-label').textContent = S.settings.enabled ? 'AKTIF' : 'MATI';
    refs.sound.setAttribute('aria-pressed', String(!!S.settings.sound));
    refs.faces.textContent = String(S.stats.faces || 0);
    refs.facePill.classList.toggle('is-zero', !S.stats.faces);
    refs.effPill.textContent = E.byId(S.settings.effect).label;
    refs.host.textContent = hostName() + (S.title ? ' · ' + S.title.slice(0, 38) : '');
    const st = S.stats.modelState;
    refs.modelPill.textContent = st === 'ready' ? S.stats.model : st === 'loading' ? 'memuat model…' : st === 'error' ? 'model galat' : 'model siaga';
    refs.modelPill.classList.toggle('is-loading', st === 'loading');
    refs.modelPill.classList.toggle('is-error', st === 'error');
    refs.peek.setAttribute('aria-pressed', String(UI.peekAll));
    document.documentElement.dataset.theme = S.settings.theme || 'ember';
  }
  function applyLocalTheme() {
    document.documentElement.dataset.theme = S.settings.theme || 'ember';
    AUDIO.setEnabled(!!S.settings.sound);
    AUDIO.setVolume((S.settings.volume == null ? 55 : S.settings.volume) / 100);
  }

  /* ---------- tab vertikal ---------- */
  function buildTabs() {
    TABS.forEach((tab, i) => {
      const panel = el('div', { class: 'vf-panel', id: 'panel-' + tab.id });
      const head = el('button', {
        class: 'vf-tab-head', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'panel-' + tab.id,
        onclick: () => setTab(UI.tab === tab.id ? null : tab.id)
      }, [
        el('span', { class: 'vf-tab-index', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'vf-tab-icon' }, svg(ICON[tab.icon])),
        el('span', { class: 'vf-tab-title' }, [el('b', { text: tab.label }), el('span', { text: tab.sub })]),
        el('span', { class: 'vf-tab-badge is-empty', text: '0' }),
        el('span', { class: 'vf-chevron' }, svg(ICON.chev))
      ]);
      const wrap = el('div', { class: 'vf-panel-wrap' }, el('div', { class: 'vf-panel-clip' }, panel));
      const box = el('section', { class: 'vf-tab', id: 'tab-' + tab.id, style: 'animation-delay:' + (i * 45) + 'ms' }, [head, wrap]);
      refs.tabs.appendChild(box);
      refs['badge_' + tab.id] = head.querySelector('.vf-tab-badge');
      refs['panel_' + tab.id] = panel;
      refs['head_' + tab.id] = head;
      refs['box_' + tab.id] = box;
    });
  }

  function setTab(id, quiet) {
    UI.tab = id;
    for (const tab of TABS) {
      const open = tab.id === id;
      refs['box_' + tab.id].classList.toggle('is-open', open);
      refs['head_' + tab.id].setAttribute('aria-expanded', String(open));
    }
    if (id && !quiet) {
      sfx('tab');
      patch({ openTab: id });
      const box = refs['box_' + id];
      setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 240);
    }
    if (id === 'media') refreshMedia();
    if (id === 'export') refreshExport();
    ensurePreviewLoop();
  }

  function badge(id, value, empty) {
    const node = refs['badge_' + id];
    if (!node) return;
    node.textContent = String(value);
    node.classList.toggle('is-empty', !!empty || value === 0 || value === '0');
  }

  /* ---------- loop pratinjau kanvas (satu rAF untuk semua) ---------- */
  function ensurePreviewLoop() {
    const needed = UI.tab === 'effects' || UI.tab === 'status' || UI.tab === 'tune';
    if (!needed) {
      if (previewRaf) cancelAnimationFrame(previewRaf);
      previewRaf = null;
      return;
    }
    if (previewRaf) return;
    const step = (ts) => {
      previewRaf = requestAnimationFrame(step);
      const p = { ...S.settings.params, emoji: S.settings.emoji };
      const time = S.settings.screenshotSafe ? 0 : ts;
      if (UI.tab === 'effects') {
        for (const eff of E.EFFECTS) {
          const cv = refs.effCards[eff.id].canvas;
          fitCanvas(cv);
          E.drawPreviewFace(cv, eff.id, p, time);
        }
      }
      if (UI.tab === 'status' || UI.tab === 'tune') {
        const cv = UI.tab === 'status' ? refs.stageCanvas : refs.tuneCanvas;
        if (cv) {
          fitCanvas(cv);
          E.drawPreviewFace(cv, S.settings.effect, p, time);
        }
        if (refs.stageFps) refs.stageFps.textContent = (S.stats.fps || 0) + ' fps';
      }
    };
    previewRaf = requestAnimationFrame(step);
  }
  function fitCanvas(cv) {
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(40, Math.round(cv.clientWidth * dpr));
    const h = Math.max(40, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }

  /* ---------- panel: status ---------- */
  function buildStatus() {
    const panel = refs.panel_status;
    const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ringSvg.setAttribute('viewBox', '0 0 80 80');
    ringSvg.innerHTML = '<circle cx="40" cy="40" r="32" fill="none" stroke="#2e1e28" stroke-width="9"/>';
    refs.ringSegs = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', '32');
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '9');
      c.setAttribute('stroke-dasharray', '0 999');
      ringSvg.appendChild(c);
      refs.ringSegs.push(c);
    }
    refs.ringValue = el('b', { text: '0' });
    const hero = el('div', { class: 'vf-hero' }, [
      el('div', { class: 'vf-ring' }, [ringSvg, el('div', { class: 'vf-ring-center' }, [refs.ringValue, el('span', { text: 'wajah' })])]),
      el('div', { class: 'vf-hero-text' }, [
        refs.heroTitle = el('b', { text: 'Menyiapkan model…' }),
        refs.heroText = el('p', { text: 'Memuat detektor wajah lokal.' })
      ])
    ]);

    refs.tiles = {};
    const tileDefs = [['media', 'media dipindai', ''], ['faces', 'wajah tersensor', 'amber'], ['guarded', 'media terkunci', 'magenta'], ['fps', 'render fps', 'violet']];
    const tiles = el('div', { class: 'vf-tiles' }, tileDefs.map(([key, label, tone]) => {
      const b = el('b', { text: '0' });
      refs.tiles[key] = b;
      return el('div', { class: 'vf-tile ' + tone }, [b, el('span', { text: label })]);
    }));

    refs.stageCanvas = el('canvas', { class: 'vf-stage-canvas' });
    refs.stageFps = el('span', { class: 'vf-stage-fps', text: '0 fps' });
    refs.stageLabel = el('span', { class: 'vf-stage-label', text: 'Censor Bar' });
    const stage = el('div', { class: 'vf-stage' }, [refs.stageCanvas, refs.stageLabel, refs.stageFps]);

    const actions = el('div', { class: 'vf-row wrap' }, [
      el('button', { class: 'vf-btn vf-btn-primary vf-btn-sm', type: 'button', onclick: () => { sfx('scan'); send('VF_SCAN'); toast('Memindai ulang semua media…'); } }, [svg(ICON.reset), 'Pindai ulang']),
      el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => { sfx('model'); send('VF_RELOAD_MODEL'); toast('Model dimuat ulang…'); } }, [svg(ICON.chip), 'Muat model']),
      el('button', { class: 'vf-btn vf-btn-ghost vf-btn-sm', type: 'button', onclick: () => { send('VF_RESTORE'); toast('Overlay dibersihkan. Tekan Pindai untuk memasang lagi.'); } }, [svg(ICON.eyeOff), 'Bersihkan'])
    ]);

    refs.faceChips = el('div', { class: 'vf-faces' });
    refs.bars = el('div', { class: 'vf-bars' });
    refs.log = el('div', { class: 'vf-log' });

    panel.append(
      hero, tiles, stage, actions,
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label' }, [document.createTextNode('Wajah terdeteksi'), refs.faceTotal = el('i', { text: '0' })]), refs.faceChips]),
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label', text: 'Sebaran media' }), refs.bars]),
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label', text: 'Aktivitas terakhir' }), refs.log]),
      el('p', { class: 'vf-hint', text: 'Inferensi 100% lokal memakai model di dalam paket ekstensi. Tidak ada gambar, wajah, atau embedding yang dikirim ke server mana pun.' })
    );
  }

  function refreshStatus() {
    const faces = S.stats.faces || 0;
    refs.ringValue.textContent = String(faces);
    const groups = {};
    for (const m of S.media) {
      const key = m.kindLabel + ' · ' + E.byId(m.activeEffect).label;
      groups[key] = (groups[key] || 0) + Math.max(1, m.faces);
    }
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0) || 1;
    const circ = 2 * Math.PI * 32;
    const tones = ['#FFB020', '#FF6B3D', '#FF3D71', '#B4FF39', '#5CE1FF', '#A855F7'];
    let offset = 0;
    refs.ringSegs.forEach((seg, i) => {
      const entry = entries[i];
      if (!entry) { seg.setAttribute('stroke-dasharray', '0 999'); return; }
      const len = (entry[1] / total) * circ;
      seg.setAttribute('stroke', tones[i % tones.length]);
      seg.setAttribute('stroke-dasharray', Math.max(0, len - 1.5) + ' ' + (circ - len + 1.5));
      seg.setAttribute('stroke-dashoffset', String(-offset));
      offset += len;
    });

    refs.tiles.media.textContent = (S.stats.scanned || 0) + '/' + (S.stats.media || 0);
    refs.tiles.faces.textContent = String(faces);
    refs.tiles.guarded.textContent = String(S.stats.guarded || 0);
    refs.tiles.fps.textContent = String(S.stats.fps || 0);
    refs.stageLabel.textContent = E.byId(S.settings.effect).label;

    const st = S.stats.modelState;
    refs.heroTitle.textContent = !S.settings.enabled ? 'Sensor dimatikan'
      : S.stats.panic ? 'Panic mode aktif'
      : st === 'loading' ? 'Memuat model wajah…'
      : st === 'error' ? 'Model gagal dimuat'
      : faces ? 'Wajah tersensor' : 'Menunggu wajah';
    refs.heroText.textContent = !S.settings.enabled
      ? 'Master switch mati. Nyalakan lewat tombol di header atau tab Pengaturan.'
      : st === 'error' ? (S.stats.modelError || 'Periksa tab Deteksi lalu muat ulang model.')
      : st === 'loading' ? 'Bobot model dibaca dari paket ekstensi, tanpa jaringan.'
      : faces + ' wajah ditutup dengan ' + E.byId(S.settings.effect).label + ' pada ' + (S.stats.media || 0) + ' media. Backend: ' + (S.stats.backend || '—') + '.';

    refs.faceTotal.textContent = faces + ' kotak';
    refs.faceChips.textContent = '';
    const withFaces = S.media.filter((m) => m.faces > 0);
    if (!withFaces.length) refs.faceChips.appendChild(el('span', { class: 'vf-hint', text: 'Belum ada wajah terdeteksi pada media yang terlihat.' }));
    withFaces.slice(0, 12).forEach((m) => {
      refs.faceChips.appendChild(el('button', {
        class: 'vf-face-chip', type: 'button', title: 'Fokuskan ' + m.label,
        onclick: () => { sfx('face'); send('VF_FOCUS', { id: m.id }); }
      }, [el('i'), document.createTextNode(m.label.slice(0, 18) + ' · ' + m.faces)]));
    });

    refs.bars.textContent = '';
    if (!entries.length) refs.bars.appendChild(el('p', { class: 'vf-hint', text: 'Belum ada media yang dipindai di halaman ini.' }));
    entries.slice(0, 6).forEach(([label, n], i) => {
      const pct = Math.round((n / total) * 100);
      refs.bars.appendChild(el('div', { class: 'vf-bar-row' }, [
        el('span', { text: label, title: label }),
        el('div', { class: 'vf-bar-track' }, el('div', { class: 'vf-bar-fill', style: 'width:' + pct + '%;background:linear-gradient(90deg,' + tones[i % tones.length] + ',#FF3D71)' })),
        el('b', { text: String(n) })
      ]));
    });

    refreshLog();
    badge('status', faces, !faces);
  }

  function refreshLog() {
    refs.log.textContent = '';
    const logs = S.logs.slice(0, 14);
    if (!logs.length) {
      refs.log.appendChild(el('div', { class: 'vf-log-item' }, [el('time', { text: '--:--' }), el('span', { text: 'Belum ada aktivitas.' })]));
      return;
    }
    const toneColor = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--flame)' };
    for (const entry of logs) {
      const d = new Date(entry.ts);
      refs.log.appendChild(el('div', {
        class: 'vf-log-item', style: 'border-left-color:' + (toneColor[entry.tone] || 'var(--flame)')
      }, [
        el('time', { text: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }),
        el('span', { text: entry.message })
      ]));
    }
  }

  /* ---------- panel: deteksi ---------- */
  function buildDetect() {
    const panel = refs.panel_detect;
    refs.modelSelect = el('select', {
      class: 'vf-select', 'aria-label': 'Model deteksi',
      onchange: (ev) => { sfx('model'); patch({ model: ev.target.value }); toast('Model ' + (ev.target.value === 'ssd' ? 'SSD MobileNet v1' : 'Tiny Face Detector') + ' dimuat…'); }
    }, [
      el('option', { value: 'tiny', text: 'Tiny Face Detector — cepat (190 KB)' }),
      el('option', { value: 'ssd', text: 'SSD MobileNet v1 — akurat (5,4 MB)' })
    ]);

    refs.modelState = el('span', { class: 'vf-model-state', text: 'siaga' });
    refs.modelName = el('b', { text: '—' });
    refs.modelMeta = el('div', { class: 'vf-model-meta' });
    refs.modelErr = el('div', { class: 'vf-model-err', hidden: true });
    const modelCard = el('div', { class: 'vf-model' }, [
      el('div', { class: 'vf-model-top' }, [svg(ICON.chip, { class: 'vf-model-icon' }), refs.modelName, refs.modelState]),
      refs.modelMeta, refs.modelErr,
      el('button', { class: 'vf-btn vf-btn-sm block', type: 'button', onclick: () => { sfx('model'); send('VF_RELOAD_MODEL'); toast('Memuat ulang bobot model…'); } }, [svg(ICON.reset), 'Muat ulang model'])
    ]);

    const switchRow = (label, hint, get, set) => {
      const sw = el('button', {
        class: 'vf-switch', type: 'button', 'aria-pressed': 'false',
        onclick: () => { const on = !get(); sfx(on ? 'toggleOn' : 'toggleOff'); set(on); }
      });
      return { row: el('div', { class: 'vf-det' }, [el('span', { class: 'vf-det-text' }, [el('b', { text: label }), el('span', { text: hint })]), sw]), sw };
    };
    refs.detSwitches = {};
    const landmark = switchRow('Landmark 68 titik', 'presisi ekstra untuk area mata', () => S.settings.landmarks, (on) => patch({ landmarks: on }));
    const boxes = switchRow('Tampilkan kotak debug', 'garis + skor keyakinan di overlay', () => S.settings.showBoxes, (on) => patch({ showBoxes: on }));
    const images = switchRow('Pindai gambar', 'elemen <img> di halaman', () => S.settings.detect.images, (on) => patch({ detect: { images: on } }));
    const videos = switchRow('Pindai video', 'frame video dipindai berkala', () => S.settings.detect.videos, (on) => patch({ detect: { videos: on } }));
    const canvases = switchRow('Pindai kanvas', 'elemen <canvas> milik halaman', () => S.settings.detect.canvases, (on) => patch({ detect: { canvases: on } }));
    refs.detSwitches = { landmarks: landmark.sw, showBoxes: boxes.sw, images: images.sw, videos: videos.sw, canvases: canvases.sw };

    refs.detSliders = {};
    const sliderGroup = el('div', { class: 'vf-group' });
    for (const meta of DETECT_META) {
      const out = el('output', { text: '0' });
      const range = el('input', {
        class: 'vf-range', type: 'range', min: meta.min, max: meta.max, step: meta.step, 'aria-label': meta.label,
        oninput: (ev) => {
          const value = Number(ev.target.value);
          out.textContent = value + meta.unit;
          patch({ detect: { [meta.key]: value } });
        },
        onchange: () => sfx('slider')
      });
      const row = el('div', { class: 'vf-slider-row' }, [
        el('div', { class: 'vf-slider-top' }, [el('label', { text: meta.label }), out]), range
      ]);
      refs.detSliders[meta.key] = { row, range, out, meta };
      sliderGroup.appendChild(row);
    }

    panel.append(
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label', text: 'Model deteksi' }), refs.modelSelect, modelCard]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Jenis media' }),
        images.row, videos.row, canvases.row
      ]),
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label', text: 'Sensitivitas & pelacakan' }), sliderGroup]),
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label', text: 'Bantuan visual' }), landmark.row, boxes.row]),
      el('p', { class: 'vf-hint', text: 'Ambang lebih rendah menangkap lebih banyak wajah (termasuk yang miring/kecil) tapi bisa salah deteksi. Penghalusan tinggi membuat sensor bergerak mulus mengikuti wajah.' })
    );
  }

  function refreshDetect() {
    refs.modelSelect.value = S.settings.model || 'tiny';
    const st = S.stats.modelState;
    refs.modelName.textContent = S.stats.model && S.stats.model !== '—' ? S.stats.model : (S.settings.model === 'ssd' ? 'SSD MobileNet v1' : 'Tiny Face Detector');
    refs.modelState.textContent = st === 'ready' ? 'siap' : st === 'loading' ? 'memuat' : st === 'error' ? 'galat' : 'siaga';
    refs.modelState.className = 'vf-model-state' + (st === 'loading' ? ' loading' : st === 'error' ? ' error' : '');
    refs.modelMeta.textContent = '';
    [
      'backend ' + (S.stats.backend || '—'),
      'ambang ' + S.settings.detect.threshold + '%',
      'input ' + S.settings.detect.inputSize + 'px',
      'deteksi total ' + (S.stats.totalDetections || 0)
    ].forEach((t) => refs.modelMeta.appendChild(el('span', { text: t })));
    refs.modelErr.hidden = !S.stats.modelError;
    refs.modelErr.textContent = S.stats.modelError || '';

    refs.detSwitches.landmarks.setAttribute('aria-pressed', String(!!S.settings.landmarks));
    refs.detSwitches.showBoxes.setAttribute('aria-pressed', String(!!S.settings.showBoxes));
    ['images', 'videos', 'canvases'].forEach((k) => refs.detSwitches[k].setAttribute('aria-pressed', String(!!S.settings.detect[k])));

    for (const meta of DETECT_META) {
      const ref = refs.detSliders[meta.key];
      const value = S.settings.detect[meta.key];
      if (document.activeElement !== ref.range) ref.range.value = String(value);
      ref.out.textContent = value + meta.unit;
      ref.row.classList.toggle('is-relevant', meta.key === 'threshold' || meta.key === 'smoothing');
    }
    const onKinds = ['images', 'videos', 'canvases'].filter((k) => S.settings.detect[k]).length;
    badge('detect', onKinds, !onKinds);
  }

  /* ---------- panel: efek ---------- */
  function buildEffects() {
    const panel = refs.panel_effects;
    refs.effCards = {};
    const grid = el('div', { class: 'vf-eff-grid' });
    for (const eff of E.EFFECTS) {
      const canvas = el('canvas', { class: 'vf-eff-canvas' });
      const card = el('button', {
        class: 'vf-eff-card', type: 'button', title: eff.desc,
        onclick: () => { sfx('done'); patch({ effect: eff.id }); toast('Efek ' + eff.label + ' diterapkan ke semua wajah.'); }
      }, [
        eff.animated ? el('span', { class: 'vf-eff-anim', text: 'LIVE' }) : null,
        el('span', { class: 'vf-eff-name' }, [el('i', { style: 'background:' + eff.tone }), el('b', { text: eff.label })]),
        canvas,
        el('span', { class: 'vf-eff-desc', text: eff.desc })
      ]);
      refs.effCards[eff.id] = { card, canvas };
      grid.appendChild(card);
    }
    refs.emojiRow = el('div', { class: 'vf-row wrap' });
    ['🙂', '😎', '🤖', '👽', '🐱', '💀', '🌸', '🚫', '🎃', '👤'].forEach((em) => {
      refs.emojiRow.appendChild(el('button', {
        class: 'vf-btn vf-btn-sm', type: 'button', text: em, title: 'Pakai ' + em,
        onclick: () => { sfx('face'); patch({ emoji: em, effect: 'emoji' }); }
      }));
    });
    refs.emojiInput = el('input', { class: 'vf-input', type: 'text', maxlength: 4, placeholder: 'emoji lain…', 'aria-label': 'Emoji khusus' });
    refs.emojiInput.addEventListener('change', (ev) => {
      const v = ev.target.value.trim();
      if (!v) return;
      sfx('face');
      patch({ emoji: v, effect: 'emoji' });
      toast('Emoji ' + v + ' dipakai.');
    });

    panel.append(
      el('p', { class: 'vf-hint', text: 'Pratinjau di bawah dirender langsung dengan parameter aktif — klik satu kartu untuk memakai efeknya di seluruh wajah pada halaman.' }),
      grid,
      el('div', { class: 'vf-group' }, [el('div', { class: 'vf-label', text: 'Emoji untuk Emoji Mask' }), refs.emojiRow, refs.emojiInput]),
      el('div', { class: 'vf-row' }, [
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => randomizeEffect() }, [svg(ICON.dice), 'Efek acak']),
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => setTab('tune') }, [svg(ICON.sliders), 'Atur parameter'])
      ])
    );
  }

  function randomizeEffect() {
    const eff = E.EFFECTS[Math.floor(Math.random() * E.EFFECTS.length)];
    const params = { ...S.settings.params };
    for (const key of eff.params) {
      const meta = PARAM_META.find((m) => m.key === key);
      if (!meta) continue;
      params[key] = Math.round(meta.min + Math.random() * (meta.max - meta.min));
    }
    params.opacity = Math.max(80, params.opacity);
    sfx('done');
    patch({ effect: eff.id, params });
    toast('Acak: ' + eff.label + ' dengan parameter baru.');
  }

  function refreshEffects() {
    for (const eff of E.EFFECTS) {
      refs.effCards[eff.id].card.classList.toggle('is-active', S.settings.effect === eff.id);
    }
    if (refs.emojiInput && document.activeElement !== refs.emojiInput) refs.emojiInput.value = S.settings.emoji || '';
    badge('effects', E.EFFECTS.length);
    ensurePreviewLoop();
  }

  /* ---------- panel: parameter ---------- */
  function buildTune() {
    const panel = refs.panel_tune;
    refs.sliders = {};
    const group = el('div', { class: 'vf-group' });
    for (const meta of PARAM_META) {
      const out = el('output', { text: '0' });
      const range = el('input', {
        class: 'vf-range', type: 'range', min: meta.min, max: meta.max, step: 1, 'aria-label': meta.label,
        oninput: (ev) => {
          const value = Number(ev.target.value);
          out.textContent = value + meta.unit;
          patch({ params: { [meta.key]: value } });
        },
        onchange: () => sfx('slider')
      });
      const row = el('div', { class: 'vf-slider-row' }, [
        el('div', { class: 'vf-slider-top' }, [el('label', { text: meta.label }), out]), range
      ]);
      refs.sliders[meta.key] = { row, range, out, meta };
      group.appendChild(row);
    }
    refs.tuneCanvas = el('canvas');
    refs.tuneLabel = el('span', { class: 'vf-stage-label', text: '—' });
    const stage = el('div', { class: 'vf-stage' }, [refs.tuneCanvas, refs.tuneLabel]);

    panel.append(
      el('p', { class: 'vf-hint', text: 'Semua slider berlaku seketika di overlay halaman tanpa tombol simpan. Baris menyala = relevan untuk efek aktif.' }),
      stage, group,
      el('div', { class: 'vf-row' }, [
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => { sfx('reset'); patch({ params: { ...DEFAULTS.params } }); toast('Parameter kembali ke bawaan.'); } }, [svg(ICON.reset), 'Reset']),
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => randomizeEffect() }, [svg(ICON.dice), 'Acak']),
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => download('veilface-config.json', JSON.stringify(lastConfig || buildConfig(), null, 2)) }, [svg(ICON.download), 'Ekspor'])
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Preset cepat' }),
        el('div', { class: 'vf-row wrap' }, [
          presetBtn('Berita', { effect: 'pixel', params: { pixel: 16, padding: 10, opacity: 100 } }),
          presetBtn('Rapat', { effect: 'bar', params: { intensity: 95, padding: 14, radius: 6, hue: 28 } }),
          presetBtn('Siaran', { effect: 'glitch', params: { glitch: 82, jitter: 60, speed: 78, hue: 320 } }),
          presetBtn('Halus', { effect: 'blur', params: { blur: 22, intensity: 70, padding: 16 } }),
          presetBtn('Sci-fi', { effect: 'hologram', params: { hue: 165, scanline: 70, speed: 65 } }),
          presetBtn('Anonim', { effect: 'avatar', params: { hue: 200, intensity: 60, radius: 24 } })
        ])
      ])
    );
  }
  function presetBtn(label, config) {
    return el('button', {
      class: 'vf-btn vf-btn-sm', type: 'button', text: label,
      onclick: () => { sfx('done'); patch(config); toast('Preset ' + label + ' dipakai.'); }
    });
  }
  function refreshTune() {
    const relevant = E.byId(S.settings.effect).params;
    for (const meta of PARAM_META) {
      const ref = refs.sliders[meta.key];
      const value = S.settings.params[meta.key];
      if (document.activeElement !== ref.range) ref.range.value = String(value);
      ref.out.textContent = value + meta.unit;
      ref.row.classList.toggle('is-relevant', relevant.includes(meta.key));
    }
    if (refs.tuneLabel) refs.tuneLabel.textContent = E.byId(S.settings.effect).label;
    badge('tune', PARAM_META.length);
  }

  /* ---------- panel: media ---------- */
  function buildMedia() {
    const panel = refs.panel_media;
    refs.mediaSearch = el('input', {
      class: 'vf-input', type: 'search', placeholder: 'Cari nama berkas, alt, atau jenis…', 'aria-label': 'Cari media',
      oninput: (ev) => { UI.search = ev.target.value.toLowerCase(); refreshMedia(); }
    });
    refs.mediaFilter = el('select', { class: 'vf-select', 'aria-label': 'Filter jenis media', onchange: (ev) => { UI.filter = ev.target.value; sfx('tab'); refreshMedia(); } });
    refs.mediaSort = el('select', {
      class: 'vf-select', 'aria-label': 'Urutkan media',
      onchange: (ev) => { UI.sort = ev.target.value; sfx('tab'); refreshMedia(); }
    }, [
      el('option', { value: 'faces', text: 'Wajah terbanyak' }),
      el('option', { value: 'recent', text: 'Terbaru' }),
      el('option', { value: 'name', text: 'Nama A–Z' }),
      el('option', { value: 'size', text: 'Resolusi terbesar' })
    ]);
    refs.mediaSelectAll = el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => toggleSelectAll() }, 'Pilih semua');
    refs.mediaBulkOn = el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => bulkToggle(true) }, [svg(ICON.shield), 'Sensor']);
    refs.mediaBulkOff = el('button', { class: 'vf-btn vf-btn-sm vf-btn-ghost', type: 'button', onclick: () => bulkToggle(false) }, [svg(ICON.ban), 'Bebas']);
    refs.mediaBulkEffect = el('select', { class: 'vf-select', 'aria-label': 'Efek untuk media terpilih', onchange: (ev) => bulkEffect(ev.target.value) },
      [el('option', { value: '', text: 'Efek terpilih…' })].concat(E.EFFECTS.map((e) => el('option', { value: e.id, text: e.label }))));
    refs.mediaList = el('div', { class: 'vf-media-list' });
    refs.mediaSummary = el('div', { class: 'vf-label' }, [document.createTextNode('Inventaris media'), refs.mediaCount = el('i', { text: '0' })]);

    panel.append(
      el('div', { class: 'vf-vault-tools' }, [refs.mediaSearch, el('div', { class: 'vf-vault-filters' }, [refs.mediaFilter, refs.mediaSort])]),
      el('div', { class: 'vf-row wrap' }, [refs.mediaSelectAll, refs.mediaBulkOn, refs.mediaBulkOff]),
      refs.mediaBulkEffect,
      el('div', { class: 'vf-row' }, [
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => { patch({ mediaOverrides: {} }); send('VF_SCAN'); toast('Semua override media dihapus.'); } }, [svg(ICON.reset), 'Reset override']),
        el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => { UI.peekAll = false; send('VF_REVEAL_ALL', { on: false }); refreshHeader(); refreshMedia(); } }, [svg(ICON.eyeOff), 'Tutup semua'])
      ]),
      el('p', { class: 'vf-hint', text: 'Media lintas-origin yang tidak terbaca tetap ditutup penuh.' }),
      refs.mediaSummary,
      refs.mediaList
    );
  }

  function filteredMedia() {
    let list = S.media.slice();
    if (UI.filter !== 'all') list = list.filter((m) => m.kind === UI.filter);
    if (UI.search) {
      list = list.filter((m) => (m.label || '').toLowerCase().includes(UI.search) ||
        (m.key || '').toLowerCase().includes(UI.search) ||
        (m.kindLabel || '').toLowerCase().includes(UI.search));
    }
    if (UI.sort === 'name') list.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    else if (UI.sort === 'size') list.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    else if (UI.sort === 'recent') list.sort((a, b) => b.id - a.id);
    else list.sort((a, b) => b.faces - a.faces || b.id - a.id);
    return list;
  }

  function toggleSelectAll() {
    const list = filteredMedia();
    if (UI.selected.size >= list.length && list.length) UI.selected.clear();
    else list.forEach((m) => UI.selected.add(m.key));
    sfx('tab');
    refreshMedia();
  }
  /* seleksi memakai key media yang stabil, bukan id yang bisa berubah saat pemindaian ulang */
  function selectedIds() {
    return S.media.filter((m) => UI.selected.has(m.key)).map((m) => m.id);
  }
  function bulkToggle(on) {
    const ids = selectedIds();
    if (!ids.length) { sfx('error'); toast('Pilih dulu media yang mau diubah.'); return; }
    ids.forEach((id) => send('VF_MEDIA_TOGGLE', { id, on }));
    sfx(on ? 'toggleOn' : 'toggleOff');
    toast(ids.length + ' media ' + (on ? 'disensor.' : 'dibebaskan.'));
  }
  function bulkEffect(effect) {
    if (!effect) return;
    const ids = selectedIds();
    if (!ids.length) { sfx('error'); toast('Pilih dulu media yang mau diubah.'); refs.mediaBulkEffect.value = ''; return; }
    ids.forEach((id) => send('VF_MEDIA_EFFECT', { id, effect }));
    sfx('done');
    toast(ids.length + ' media memakai ' + E.byId(effect).label + '.');
    refs.mediaBulkEffect.value = '';
  }

  function refreshMediaFilterOptions() {
    const kinds = Array.from(new Set(S.media.map((m) => m.kind)));
    refs.mediaFilter.textContent = '';
    refs.mediaFilter.appendChild(el('option', { value: 'all', text: 'Semua media (' + S.media.length + ')' }));
    kinds.forEach((kind) => {
      const n = S.media.filter((m) => m.kind === kind).length;
      const label = (S.media.find((m) => m.kind === kind) || {}).kindLabel || kind;
      refs.mediaFilter.appendChild(el('option', { value: kind, text: label + ' (' + n + ')' }));
    });
    refs.mediaFilter.value = kinds.includes(UI.filter) || UI.filter === 'all' ? UI.filter : 'all';
    UI.filter = refs.mediaFilter.value;
  }

  function refreshMedia() {
    refreshMediaFilterOptions();
    const list = filteredMedia();
    refs.mediaCount.textContent = list.length + ' dari ' + S.media.length;
    refs.mediaList.textContent = '';
    badge('media', S.media.length, !S.media.length);
    refs.mediaBulkOn.disabled = !UI.selected.size;
    refs.mediaBulkOff.disabled = !UI.selected.size;
    refs.mediaSelectAll.textContent = UI.selected.size && UI.selected.size >= list.length ? 'Batal pilih' : 'Pilih semua';

    if (!list.length) {
      refs.mediaList.appendChild(el('div', { class: 'vf-empty' }, [
        svg(ICON.inbox),
        el('b', { text: S.media.length ? 'Tidak ada yang cocok' : 'Belum ada media' }),
        el('span', { text: S.media.length ? 'Ubah kata pencarian atau filter jenis.' : 'Buka halaman berisi foto/video lalu tekan Pindai.' })
      ]));
      return;
    }

    for (const m of list.slice(0, 120)) {
      const selected = UI.selected.has(m.key);
      const check = el('button', {
        class: 'vf-check', type: 'button', 'aria-pressed': String(selected), title: 'Pilih media',
        onclick: () => { if (selected) UI.selected.delete(m.key); else UI.selected.add(m.key); sfx('tab'); refreshMedia(); }
      }, svg(ICON.check));

      const thumb = el('div', { class: 'vf-media-thumb' }, [
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : svg(m.kind === 'VIDEO' ? ICON.video : m.kind === 'CANVAS' ? ICON.frames : ICON.image),
        m.faces ? el('b', { text: String(m.faces) }) : null
      ]);

      const effectSelect = el('select', {
        class: 'vf-select', 'aria-label': 'Efek untuk ' + m.label,
        onchange: (ev) => { sfx('done'); send('VF_MEDIA_EFFECT', { id: m.id, effect: ev.target.value }); }
      }, [el('option', { value: '', text: 'Ikuti global — ' + E.byId(S.settings.effect).label })]
        .concat(E.EFFECTS.map((e) => el('option', { value: e.id, text: e.label }))));
      effectSelect.value = m.effect || '';

      const toggle = el('button', {
        class: 'vf-switch', type: 'button', 'aria-pressed': String(m.enabled), title: 'Sensor media ini',
        onclick: () => { sfx(m.enabled ? 'toggleOff' : 'toggleOn'); send('VF_MEDIA_TOGGLE', { id: m.id, on: !m.enabled }); }
      });

      const meta = el('div', { class: 'vf-media-meta' }, [
        el('span', { class: 'vf-tag', text: m.kindLabel }),
        el('span', { text: (m.w || 0) + '×' + (m.h || 0) }),
        el('span', { text: m.status }),
        m.score ? el('span', { text: m.score + '%' }) : null,
        m.relayed ? el('span', { class: 'vf-tag guard', text: 'relay' }) : null,
        m.fullCover || m.blocked ? el('span', { class: 'vf-tag guard', text: 'tutup penuh' }) : null,
        m.error ? el('span', { class: 'vf-tag err', text: 'galat' }) : null
      ]);

      const actions = el('div', { class: 'vf-media-tools' }, [
        el('button', { class: 'vf-mini', type: 'button', title: 'Fokuskan di halaman', onclick: () => { sfx('face'); send('VF_FOCUS', { id: m.id }); } }, svg(ICON.crosshair)),
        el('button', {
          class: 'vf-mini', type: 'button', title: m.revealed ? 'Sensor lagi' : 'Intip sementara', 'aria-pressed': String(!!m.revealed),
          onclick: () => { sfx('reveal'); send('VF_REVEAL', { id: m.id, on: !m.revealed }); }
        }, svg(m.revealed ? ICON.eyeOff : ICON.eye)),
        el('button', { class: 'vf-mini', type: 'button', title: 'Ekspor PNG tersensor', onclick: () => { sfx('shutter'); send('VF_EXPORT_MEDIA', { id: m.id }); toast('Menyiapkan PNG tersensor…'); } }, svg(ICON.camera)),
        toggle
      ]);

      const row = el('div', {
        class: 'vf-media' + (selected ? ' is-selected' : '') + (!m.enabled ? ' is-off' : '') + (m.fullCover || m.blocked ? ' is-guarded' : '')
      }, [
        thumb,
        el('div', { class: 'vf-media-body' }, [
          el('div', { class: 'vf-media-row2' }, [check, el('span', { class: 'vf-media-name vf-spacer', text: m.label, title: m.key })]),
          meta, el('div', { class: 'vf-media-row3' }, [effectSelect, actions])
        ])
      ]);
      refs.mediaList.appendChild(row);
    }
  }

  /* ---------- panel: situs & area ---------- */
  function buildSite() {
    const panel = refs.panel_site;
    refs.dockSelect = el('select', {
      class: 'vf-select', 'aria-label': 'Mode sidebar',
      onchange: (ev) => { sfx('tab'); patch({ dockMode: ev.target.value }); }
    }, [el('option', { value: 'dock', text: 'Dock — halaman digeser' }), el('option', { value: 'overlay', text: 'Overlay — mengapung di atas' })]);

    refs.widthOut = el('output', { text: '25%' });
    refs.widthRange = el('input', {
      class: 'vf-range', type: 'range', min: 18, max: 50, step: 1, 'aria-label': 'Lebar sidebar',
      oninput: (ev) => { refs.widthOut.textContent = ev.target.value + '%'; patch({ sidebarWidth: Number(ev.target.value) }); },
      onchange: () => sfx('slider')
    });

    refs.incChips = el('div', { class: 'vf-chips' });
    refs.excChips = el('div', { class: 'vf-chips' });
    refs.incInput = el('input', { class: 'vf-input', type: 'text', placeholder: 'Selector fokus, mis. main, #galeri' });
    refs.excInput = el('input', { class: 'vf-input', type: 'text', placeholder: 'Selector dikecualikan, mis. .avatar-kecil' });
    const addSelector = (kind) => {
      const input = kind === 'include' ? refs.incInput : refs.excInput;
      const value = input.value.trim();
      if (!value) { sfx('error'); toast('Selector belum diisi.'); return; }
      try { document.querySelector(value); } catch (err) { sfx('error'); toast('Selector tidak valid.'); return; }
      const key = kind === 'include' ? 'includeSelectors' : 'excludeSelectors';
      input.value = '';
      sfx('toggleOn');
      patch({ [key]: Array.from(new Set([...(S.settings[key] || []), value])) });
      send('VF_SCAN');
    };
    refs.incInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') addSelector('include'); });
    refs.excInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') addSelector('exclude'); });

    refs.allowSwitch = el('button', {
      class: 'vf-switch', type: 'button', 'aria-pressed': 'false',
      onclick: () => { const on = refs.allowSwitch.getAttribute('aria-pressed') !== 'true'; sfx(on ? 'toggleOff' : 'toggleOn'); send('VF_ALLOWLIST', { on }); }
    });
    refs.profileState = el('span', { class: 'vf-hint', text: 'Belum ada profil untuk situs ini.' });
    refs.overrideList = el('div', { class: 'vf-group' });

    panel.append(
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Tata letak sidebar' }),
        refs.dockSelect,
        el('div', { class: 'vf-slider-row is-relevant' }, [
          el('div', { class: 'vf-slider-top' }, [el('label', { text: 'Lebar sidebar' }), refs.widthOut]), refs.widthRange
        ]),
        el('p', { class: 'vf-hint', text: 'Default 1/4 lebar layar (25%). Mode dock menggeser halaman sehingga tidak ada konten tertutup sidebar.' })
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Hanya pindai area ini' }),
        refs.incChips,
        el('div', { class: 'vf-row' }, [refs.incInput, el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => addSelector('include') }, [svg(ICON.plus)])])
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Kecualikan area ini' }),
        refs.excChips,
        el('div', { class: 'vf-row' }, [refs.excInput, el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => addSelector('exclude') }, [svg(ICON.plus)])])
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Override tersimpan' }),
        refs.overrideList
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Situs ini' }),
        el('div', { class: 'vf-det' }, [
          el('span', { class: 'vf-det-text' }, [el('b', { text: 'Lewati situs ini' }), el('span', { text: 'masukkan ke allowlist' })]), refs.allowSwitch
        ]),
        refs.profileState,
        el('div', { class: 'vf-row' }, [
          el('button', {
            class: 'vf-btn vf-btn-sm vf-spacer', type: 'button',
            onclick: () => {
              sfx('done');
              send('VF_SET_PROFILE', { profile: { effect: S.settings.effect, params: S.settings.params, detect: S.settings.detect, model: S.settings.model } });
              toast('Profil situs disimpan.');
            }
          }, [svg(ICON.shield), 'Simpan profil']),
          el('button', { class: 'vf-btn vf-btn-sm vf-btn-ghost vf-spacer', type: 'button', onclick: () => { sfx('toggleOff'); send('VF_SET_PROFILE', { profile: null }); toast('Profil situs dihapus.'); } }, [svg(ICON.trash), 'Hapus'])
        ])
      ])
    );
  }

  function chipList(host, values, key) {
    host.textContent = '';
    if (!values.length) { host.appendChild(el('span', { class: 'vf-hint', text: 'Kosong.' })); return; }
    values.forEach((value) => {
      host.appendChild(el('span', { class: 'vf-chip' }, [
        el('span', { text: value, title: value }),
        el('button', {
          type: 'button', text: '×', title: 'Hapus',
          onclick: () => { patch({ [key]: values.filter((v) => v !== value) }); sfx('toggleOff'); send('VF_SCAN'); toast('Selector dihapus.'); }
        })
      ]));
    });
  }

  function refreshSite() {
    refs.dockSelect.value = S.settings.dockMode || 'dock';
    refs.widthRange.value = String(S.settings.sidebarWidth || 25);
    refs.widthOut.textContent = (S.settings.sidebarWidth || 25) + '%';
    chipList(refs.incChips, S.settings.includeSelectors || [], 'includeSelectors');
    chipList(refs.excChips, S.settings.excludeSelectors || [], 'excludeSelectors');
    const host = hostName();
    refs.allowSwitch.setAttribute('aria-pressed', String((S.settings.allowlist || []).includes(host)));
    const overrides = Object.entries(S.settings.mediaOverrides || {});
    refs.overrideList.textContent = '';
    if (!overrides.length) refs.overrideList.appendChild(el('p', { class: 'vf-hint', text: 'Belum ada media dengan pengaturan tersendiri.' }));
    overrides.slice(0, 20).forEach(([key, ov]) => {
      let name = key;
      try { name = new URL(key, S.url || location.href).pathname.split('/').pop() || key; } catch (err) { name = key; }
      refs.overrideList.appendChild(el('div', { class: 'vf-rule' }, [
        el('div', { class: 'vf-rule-head' }, [
          el('b', { text: (ov.effect ? E.byId(ov.effect).label : 'Efek global') + (ov.enabled === false ? ' · bebas' : '') }),
          el('button', {
            class: 'vf-mini danger', type: 'button', title: 'Hapus override',
            onclick: () => {
              const next = { ...(S.settings.mediaOverrides || {}) };
              delete next[key];
              sfx('toggleOff');
              patch({ mediaOverrides: next });
              send('VF_SCAN');
              toast('Override dihapus.');
            }
          }, svg(ICON.trash))
        ]),
        el('code', { text: name })
      ]));
    });
    const hasProfile = !!(S.settings.profiles || {})[host];
    refs.profileState.textContent = hasProfile ? 'Profil tersimpan untuk ' + host + ' — efek, parameter, dan deteksi ikut profil.' : 'Belum ada profil untuk situs ini.';
    badge('site', overrides.length + (S.settings.includeSelectors || []).length + (S.settings.excludeSelectors || []).length);
  }

  /* ---------- panel: ekspor ---------- */
  function buildConfig() {
    return {
      app: 'VeilFace', version: 1, exportedAt: new Date().toISOString(),
      effect: S.settings.effect, params: S.settings.params, detect: S.settings.detect,
      model: S.settings.model, landmarks: S.settings.landmarks, emoji: S.settings.emoji,
      quality: S.settings.quality, fps: S.settings.fps, dockMode: S.settings.dockMode,
      sidebarWidth: S.settings.sidebarWidth, includeSelectors: S.settings.includeSelectors,
      excludeSelectors: S.settings.excludeSelectors, mediaOverrides: S.settings.mediaOverrides
    };
  }
  function buildReport() {
    const lines = ['# Laporan VeilFace', '', 'Situs: ' + (S.url || '-'), 'Waktu: ' + new Date().toLocaleString('id-ID'),
      'Model: ' + (S.stats.model || '-') + ' (' + (S.stats.backend || '-') + ')',
      'Efek: ' + E.byId(S.settings.effect).label,
      'Wajah tersensor: ' + (S.stats.faces || 0), 'Media dipindai: ' + (S.stats.media || 0), '', '## Media'];
    for (const m of S.media) {
      lines.push('- ' + m.label + ' · ' + m.kindLabel + ' · ' + m.w + '×' + m.h + ' · wajah: ' + m.faces + ' · efek: ' + E.byId(m.activeEffect).label + (m.fullCover ? ' · tutup penuh' : ''));
    }
    lines.push('', 'Laporan ini tidak memuat gambar, koordinat wajah, maupun data biometrik.');
    return lines.join('\n');
  }
  function buildCsv() {
    const rows = [['nama', 'jenis', 'lebar', 'tinggi', 'wajah', 'skor', 'efek', 'status', 'sumber']];
    for (const m of S.media) {
      rows.push([m.label, m.kindLabel, String(m.w), String(m.h), String(m.faces), String(m.score), E.byId(m.activeEffect).label, m.status, m.key]);
    }
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  function buildExport() {
    const panel = refs.panel_export;
    refs.shotSwitch = el('button', {
      class: 'vf-switch', type: 'button', 'aria-pressed': 'false',
      onclick: () => {
        const on = !S.settings.screenshotSafe;
        sfx(on ? 'toggleOn' : 'toggleOff');
        patch({ screenshotSafe: on });
        toast(on ? 'Mode tangkapan layar: animasi sensor dibekukan.' : 'Animasi sensor hidup kembali.');
      }
    });
    refs.shotTarget = el('select', { class: 'vf-select', 'aria-label': 'Media untuk diekspor' });
    refs.shotPreview = el('div', { class: 'vf-shot-preview', hidden: true }, el('img', { alt: 'Pratinjau hasil sensor' }));
    refs.configPreview = el('pre', { class: 'vf-code', text: '{}' });
    refs.importArea = el('textarea', { class: 'vf-textarea', placeholder: 'Tempel JSON konfigurasi VeilFace di sini…', 'aria-label': 'Impor konfigurasi' });
    refs.importFile = el('input', { type: 'file', accept: '.json,application/json', class: 'vf-sr', onchange: (ev) => readImportFile(ev.target.files[0]) });

    panel.append(
      el('div', { class: 'vf-det' }, [
        el('span', { class: 'vf-det-text' }, [el('b', { text: 'Mode tangkapan layar' }), el('span', { text: 'animasi dibekukan agar hasil konsisten' })]), refs.shotSwitch
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Ekspor gambar tersensor' }),
        refs.shotTarget,
        el('div', { class: 'vf-row' }, [
          el('button', {
            class: 'vf-btn vf-btn-primary vf-btn-sm vf-spacer', type: 'button',
            onclick: () => {
              const id = Number(refs.shotTarget.value);
              if (!id) { sfx('error'); toast('Pilih media dulu.'); return; }
              sfx('shutter');
              send('VF_EXPORT_MEDIA', { id });
              toast('Menyiapkan PNG tersensor…');
            }
          }, [svg(ICON.camera), 'Unduh PNG']),
          el('button', {
            class: 'vf-btn vf-btn-sm vf-spacer', type: 'button',
            onclick: () => {
              const targets = S.media.filter((m) => m.faces > 0 || m.fullCover);
              if (!targets.length) { sfx('error'); toast('Belum ada media berisi wajah.'); return; }
              targets.slice(0, 8).forEach((m, i) => setTimeout(() => send('VF_EXPORT_MEDIA', { id: m.id }), i * 320));
              sfx('shutter');
              toast('Mengekspor ' + Math.min(8, targets.length) + ' media tersensor…');
            }
          }, [svg(ICON.frames), 'Semua berwajah'])
        ]),
        refs.shotPreview
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Unduh konfigurasi & laporan' }),
        el('div', { class: 'vf-row wrap' }, [
          el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => download('veilface-config.json', JSON.stringify(lastConfig || buildConfig(), null, 2)) }, [svg(ICON.download), 'JSON']),
          el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => download('veilface-media.csv', buildCsv(), 'text/csv') }, [svg(ICON.download), 'CSV']),
          el('button', { class: 'vf-btn vf-btn-sm', type: 'button', onclick: () => download('veilface-laporan.md', buildReport(), 'text/markdown') }, [svg(ICON.download), 'Laporan MD'])
        ]),
        el('button', { class: 'vf-btn vf-btn-ghost vf-btn-sm block', type: 'button', onclick: () => copyText(buildReport()) }, [svg(ICON.copy), 'Salin laporan'])
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Impor konfigurasi' }),
        refs.importArea,
        el('div', { class: 'vf-row' }, [
          el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => applyImport(refs.importArea.value) }, [svg(ICON.check), 'Terapkan']),
          el('button', { class: 'vf-btn vf-btn-sm vf-spacer', type: 'button', onclick: () => refs.importFile.click() }, [svg(ICON.download), 'Dari berkas'])
        ]),
        refs.importFile
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label' }, [document.createTextNode('Pratinjau konfigurasi'), el('button', { class: 'vf-btn vf-btn-sm vf-btn-ghost', type: 'button', onclick: () => { send('VF_EXPORT'); refreshExport(); } }, 'Segarkan')]),
        refs.configPreview
      ]),
      el('p', { class: 'vf-hint', text: 'PNG hasil ekspor sudah menyatu dengan sensor — wajah asli tidak bisa dipulihkan dari berkas itu.' })
    );
  }

  function readImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { refs.importArea.value = String(reader.result); applyImport(String(reader.result)); };
    reader.readAsText(file);
  }
  function applyImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (err) { sfx('error'); toast('JSON tidak valid.'); return; }
    if (!data || data.app !== 'VeilFace') { sfx('error'); toast('Berkas bukan konfigurasi VeilFace.'); return; }
    const allowed = ['effect', 'params', 'detect', 'model', 'landmarks', 'emoji', 'quality', 'fps', 'dockMode', 'sidebarWidth', 'includeSelectors', 'excludeSelectors', 'mediaOverrides'];
    const obj = {};
    for (const key of allowed) if (data[key] !== undefined) obj[key] = data[key];
    if (obj.effect && !E.EFFECTS.some((e) => e.id === obj.effect)) delete obj.effect;
    sfx('done');
    patch(obj);
    send('VF_SCAN');
    toast('Konfigurasi diimpor dan diterapkan.');
  }

  function refreshExport() {
    refs.shotSwitch.setAttribute('aria-pressed', String(!!S.settings.screenshotSafe));
    const current = refs.shotTarget.value;
    refs.shotTarget.textContent = '';
    refs.shotTarget.appendChild(el('option', { value: '', text: 'Pilih media…' }));
    S.media.forEach((m) => {
      refs.shotTarget.appendChild(el('option', { value: String(m.id), text: m.label.slice(0, 32) + ' · ' + m.faces + ' wajah' }));
    });
    if (S.media.some((m) => String(m.id) === current)) refs.shotTarget.value = current;
    else if (S.media.length) refs.shotTarget.value = String((S.media.find((m) => m.faces > 0) || S.media[0]).id);
    refs.configPreview.textContent = JSON.stringify(lastConfig || buildConfig(), null, 2);
    badge('export', S.media.filter((m) => m.faces > 0).length);
  }

  /* ---------- panel: pengaturan ---------- */
  function buildSettings() {
    const panel = refs.panel_settings;
    const switchRow = (label, hint, key) => {
      const sw = el('button', {
        class: 'vf-switch', type: 'button', 'aria-pressed': 'false',
        onclick: () => { const on = !S.settings[key]; sfx(on ? 'toggleOn' : 'toggleOff'); patch({ [key]: on }); }
      });
      refs['sw_' + key] = sw;
      return el('div', { class: 'vf-det' }, [el('span', { class: 'vf-det-text' }, [el('b', { text: label }), el('span', { text: hint })]), sw]);
    };

    refs.themeSelect = el('select', {
      class: 'vf-select', 'aria-label': 'Tema',
      onchange: (ev) => { sfx('tab'); patch({ theme: ev.target.value }); }
    }, [
      el('option', { value: 'ember', text: 'Ember — amber & bara' }),
      el('option', { value: 'neon', text: 'Neon — magenta & ungu' }),
      el('option', { value: 'ash', text: 'Ash — lime & biru' })
    ]);
    refs.qualitySelect = el('select', {
      class: 'vf-select', 'aria-label': 'Kualitas render',
      onchange: (ev) => { sfx('tab'); patch({ quality: ev.target.value }); }
    }, [
      el('option', { value: 'hemat', text: 'Hemat — 1× piksel' }),
      el('option', { value: 'balanced', text: 'Seimbang — maks 1,5×' }),
      el('option', { value: 'tajam', text: 'Tajam — hingga 2×' })
    ]);

    refs.volOut = el('output', { text: '55%' });
    refs.volRange = el('input', {
      class: 'vf-range', type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'Volume suara',
      oninput: (ev) => { refs.volOut.textContent = ev.target.value + '%'; patch({ volume: Number(ev.target.value) }); },
      onchange: () => sfx('slider')
    });
    refs.fpsOut = el('output', { text: '30' });
    refs.fpsRange = el('input', {
      class: 'vf-range', type: 'range', min: 6, max: 60, step: 1, 'aria-label': 'Batas FPS overlay',
      oninput: (ev) => { refs.fpsOut.textContent = ev.target.value + ' fps'; patch({ fps: Number(ev.target.value) }); },
      onchange: () => sfx('slider')
    });

    refs.resetBtn = el('button', {
      class: 'vf-btn vf-btn-danger vf-btn-sm block', type: 'button',
      onclick: () => {
        if (!UI.resetArmed) {
          UI.resetArmed = true;
          refs.resetBtn.textContent = 'Yakin? Klik lagi untuk reset total';
          setTimeout(() => { UI.resetArmed = false; refs.resetBtn.textContent = 'Reset semua pengaturan'; }, 4000);
          sfx('error');
          return;
        }
        UI.resetArmed = false;
        refs.resetBtn.textContent = 'Reset semua pengaturan';
        const fresh = JSON.parse(JSON.stringify(DEFAULTS));
        fresh.mediaOverrides = {}; fresh.profiles = {}; fresh.allowlist = [];
        sfx('done');
        patch(fresh);
        send('VF_SCAN');
        toast('Semua pengaturan kembali ke bawaan.');
      }
    }, 'Reset semua pengaturan');

    panel.append(
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Perilaku sensor' }),
        switchRow('Sensor aktif', 'master switch untuk semua tab', 'enabled'),
        switchRow('Pindai otomatis', 'ikuti media yang muncul dinamis', 'autoScan')
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Tampilan & suara' }),
        refs.themeSelect,
        switchRow('Suara antarmuka', 'efek sintetis, tanpa berkas audio', 'sound'),
        el('div', { class: 'vf-slider-row' }, [el('div', { class: 'vf-slider-top' }, [el('label', { text: 'Volume' }), refs.volOut]), refs.volRange])
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Performa' }),
        refs.qualitySelect,
        el('div', { class: 'vf-slider-row' }, [el('div', { class: 'vf-slider-top' }, [el('label', { text: 'Batas FPS overlay' }), refs.fpsOut]), refs.fpsRange]),
        el('p', { class: 'vf-hint', text: 'Turunkan FPS dan pilih mode Hemat bila halaman terasa berat; sensor tetap aktif penuh.' })
      ]),
      el('div', { class: 'vf-group' }, [
        el('div', { class: 'vf-label', text: 'Pintasan' }),
        el('div', { class: 'vf-chips' }, [
          el('span', { class: 'vf-chip tone' }, el('span', { text: 'Alt+Shift+F — buka/tutup sidebar' })),
          el('span', { class: 'vf-chip tone' }, el('span', { text: 'Alt+Shift+R — pindai ulang' })),
          el('span', { class: 'vf-chip' }, el('span', { text: 'Klik kanan gambar — sensor gambar ini' }))
        ])
      ]),
      refs.resetBtn,
      el('p', { class: 'vf-hint', text: 'VeilFace 1.0 · MIT · dibuat oleh aisac-id. Deteksi memakai face-api.js (MIT) dengan model yang dibundel lokal. Kode sumber: github.com/aisac-id/veilface' })
    );
  }

  function refreshSettings() {
    ['enabled', 'autoScan', 'sound'].forEach((key) => {
      const sw = refs['sw_' + key];
      if (sw) sw.setAttribute('aria-pressed', String(!!S.settings[key]));
    });
    refs.themeSelect.value = S.settings.theme || 'ember';
    refs.qualitySelect.value = S.settings.quality || 'balanced';
    refs.volRange.value = String(S.settings.volume == null ? 55 : S.settings.volume);
    refs.volOut.textContent = (S.settings.volume == null ? 55 : S.settings.volume) + '%';
    refs.fpsRange.value = String(S.settings.fps || 30);
    refs.fpsOut.textContent = (S.settings.fps || 30) + ' fps';
    badge('settings', S.settings.quality === 'tajam' ? 'HQ' : S.settings.quality === 'hemat' ? 'ECO' : 'MID');
  }

  function refreshAll() {
    refreshHeader();
    refreshStatus();
    refreshDetect();
    refreshEffects();
    refreshTune();
    refreshMedia();
    refreshSite();
    refreshExport();
    refreshSettings();
  }

  /* ---------- mode pratinjau mandiri ---------- */
  function demoThumb(seed) {
    const cv = document.createElement('canvas');
    cv.width = 72; cv.height = 72;
    E.drawPreviewFace(cv, 'outline', { ...S.settings.params, opacity: 30 }, seed * 100);
    return cv.toDataURL('image/png');
  }
  function seedDemo() {
    S.url = 'https://contoh.internal/tim';
    S.title = 'Galeri Tim — Contoh';
    const names = ['team-offsite.jpg', 'rapat-direksi.jpg', 'profil-founder.png', 'klip-wawancara.mp4', 'avatar-kanvas'];
    const kinds = ['IMG', 'IMG', 'IMG', 'VIDEO', 'CANVAS'];
    const counts = [5, 3, 1, 2, 1];
    S.media = names.map((label, i) => ({
      id: i + 1, key: 'https://contoh.internal/assets/' + label, kind: kinds[i],
      kindLabel: kinds[i] === 'IMG' ? 'Gambar' : kinds[i] === 'VIDEO' ? 'Video' : 'Kanvas',
      label, w: 1200 - i * 120, h: 800 - i * 60, displayW: 420, displayH: 280,
      faces: counts[i], score: 88 - i * 4, status: 'siap', enabled: true, effect: '',
      activeEffect: S.settings.effect, visible: true, blocked: false, relayed: i === 2,
      fullCover: false, revealed: false, thumb: demoThumb(i + 1), error: ''
    }));
    recomputeDemoStats();
    S.logs = [{ message: 'Mode pratinjau: media contoh dimuat.', tone: 'info', ts: Date.now() }];
  }
  function recomputeDemoStats() {
    const faces = S.media.reduce((sum, m) => sum + (m.enabled && !m.revealed ? m.faces : 0), 0);
    S.stats = {
      faces, media: S.media.length, scanned: S.media.length, guarded: S.media.filter((m) => m.fullCover).length,
      fps: S.settings.fps, model: S.settings.model === 'ssd' ? 'SSD MobileNet v1' : 'Tiny Face Detector',
      modelState: 'ready', modelError: '', backend: 'webgl', enabled: S.settings.enabled,
      panic: false, totalDetections: faces * 3
    };
    S.media.forEach((m) => { m.activeEffect = m.effect || S.settings.effect; });
  }
  function demoHandle(type, extra) {
    const find = (id) => S.media.find((m) => m.id === id);
    if (type === 'VF_PATCH') { recomputeDemoStats(); refreshAll(); return; }
    if (type === 'VF_SCAN') { seedDemo(); S.logs.unshift({ message: 'Pindai ulang selesai (contoh).', tone: 'ok', ts: Date.now() }); refreshAll(); return; }
    if (type === 'VF_RESTORE') { S.media.forEach((m) => { m.faces = 0; }); recomputeDemoStats(); refreshAll(); return; }
    if (type === 'VF_MEDIA_EFFECT') { const m = find(extra.id); if (m) m.effect = extra.effect; recomputeDemoStats(); refreshAll(); return; }
    if (type === 'VF_MEDIA_TOGGLE') { const m = find(extra.id); if (m) m.enabled = extra.on; recomputeDemoStats(); refreshAll(); return; }
    if (type === 'VF_REVEAL') { const m = find(extra.id); if (m) m.revealed = extra.on; recomputeDemoStats(); refreshAll(); return; }
    if (type === 'VF_REVEAL_ALL') { S.media.forEach((m) => { m.revealed = !!extra.on; }); recomputeDemoStats(); refreshAll(); return; }
    if (type === 'VF_EXPORT_MEDIA') {
      const m = find(extra.id);
      if (!m) return;
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 220;
      E.drawPreviewFace(cv, m.activeEffect, { ...S.settings.params, emoji: S.settings.emoji }, 0);
      showShot(cv.toDataURL('image/png'), m.label.replace(/\.\w+$/, '') + '-censored.png');
      return;
    }
    if (type === 'VF_EXPORT') { lastConfig = buildConfig(); refreshExport(); return; }
    if (type === 'VF_ALLOWLIST') {
      const host = 'contoh.internal';
      const list = new Set(S.settings.allowlist || []);
      if (extra.on) list.add(host); else list.delete(host);
      S.settings.allowlist = Array.from(list);
      S.settings.enabled = !list.has(host);
      recomputeDemoStats(); refreshAll(); return;
    }
    if (type === 'VF_SET_PROFILE') {
      const profiles = { ...(S.settings.profiles || {}) };
      if (extra.profile) profiles['contoh.internal'] = extra.profile; else delete profiles['contoh.internal'];
      S.settings.profiles = profiles;
      refreshAll();
    }
  }

  function showShot(dataUrl, name) {
    UI.lastShot = { dataUrl, name };
    refs.shotPreview.hidden = false;
    refs.shotPreview.querySelector('img').src = dataUrl;
    triggerDownload(dataUrl, name);
    sfx('shutter');
    toast('PNG tersensor diunduh: ' + name, 'Unduh lagi', () => triggerDownload(dataUrl, name));
  }

  /* ---------- boot ---------- */
  function bindHeader() {
    refs.power = document.getElementById('vfPower');
    refs.sound = document.getElementById('vfSound');
    refs.close = document.getElementById('vfClose');
    refs.host = document.getElementById('vfHost');
    refs.faces = document.getElementById('vfFaces');
    refs.facePill = document.getElementById('vfFacePill');
    refs.effPill = document.getElementById('vfEffPill');
    refs.modelPill = document.getElementById('vfModelPill');
    refs.tabs = document.getElementById('vfTabs');
    refs.toast = document.getElementById('vfToast');
    refs.toastText = document.getElementById('vfToastText');
    refs.toastAction = document.getElementById('vfToastAction');
    refs.peek = document.getElementById('vfPeek');

    refs.power.addEventListener('click', () => {
      const on = !S.settings.enabled;
      sfx(on ? 'toggleOn' : 'toggleOff');
      patch({ enabled: on });
      toast(on ? 'Sensor wajah dinyalakan.' : 'Sensor wajah dimatikan sementara.');
    });
    refs.sound.addEventListener('click', () => {
      const on = !S.settings.sound;
      patch({ sound: on });
      AUDIO.setEnabled(on);
      if (on) AUDIO.play('toggleOn');
      toast(on ? 'Suara antarmuka menyala.' : 'Semua suara dimatikan.');
    });
    refs.close.addEventListener('click', () => { sfx('tab'); send('VF_CLOSE'); });
    document.getElementById('vfRescan').addEventListener('click', () => { sfx('scan'); send('VF_SCAN'); toast('Memindai ulang semua media…'); });
    document.getElementById('vfPanic').addEventListener('click', () => {
      sfx('panic');
      UI.peekAll = false;
      send('VF_PANIC');
      if (standalone) { S.settings.enabled = true; S.media.forEach((m) => { m.enabled = true; m.revealed = false; m.fullCover = true; }); recomputeDemoStats(); refreshAll(); }
      toast('Panic: semua media ditutup balok solid.', 'Batalkan', () => { send('VF_CALM'); if (standalone) { S.media.forEach((m) => { m.fullCover = false; }); recomputeDemoStats(); refreshAll(); } });
    });
    refs.peek.addEventListener('click', () => {
      UI.peekAll = !UI.peekAll;
      sfx('reveal');
      send('VF_REVEAL_ALL', { on: UI.peekAll });
      if (standalone) { S.media.forEach((m) => { m.revealed = UI.peekAll; }); recomputeDemoStats(); }
      refreshHeader(); refreshMedia(); refreshStatus();
      toast(UI.peekAll ? 'Semua sensor dibuka sementara.' : 'Sensor dipasang kembali.');
    });
  }

  function ingestSettings(next) {
    if (!next) return;
    S.settings = {
      ...DEFAULTS, ...next,
      params: { ...DEFAULTS.params, ...(next.params || {}) },
      detect: { ...DEFAULTS.detect, ...(next.detect || {}) }
    };
    applyLocalTheme();
  }

  function boot() {
    bindHeader();
    buildTabs();
    buildStatus();
    buildDetect();
    buildEffects();
    buildTune();
    buildMedia();
    buildSite();
    buildExport();
    buildSettings();
    applyLocalTheme();
    refreshAll();
    setTab(DEFAULTS.openTab, true);

    if (standalone) {
      seedDemo();
      refreshAll();
      setTab('status', true);
      return;
    }

    window.addEventListener('message', (ev) => {
      const data = ev.data;
      if (!data || data.channel !== CHANNEL || data.token !== token) return;
      switch (data.type) {
        case 'VF_HELLO':
          ingestSettings(data.settings);
          S.stats = data.stats || S.stats;
          S.media = data.media || [];
          S.logs = data.logs || [];
          S.url = data.url || '';
          S.title = data.title || '';
          refreshAll();
          setTab(S.settings.openTab || 'status', true);
          break;
        case 'VF_SETTINGS': ingestSettings(data.settings); refreshAll(); break;
        case 'VF_STATS': {
          const before = S.stats.faces || 0;
          const prevState = S.stats.modelState;
          S.stats = data.stats || S.stats;
          refreshHeader(); refreshStatus(); refreshDetect();
          if (S.stats.faces > before) sfx('face');
          if (prevState !== 'ready' && S.stats.modelState === 'ready') sfx('model');
          break;
        }
        case 'VF_MEDIA':
          S.media = data.media || [];
          for (const key of Array.from(UI.selected)) if (!S.media.some((m) => m.key === key)) UI.selected.delete(key);
          refreshMedia(); refreshStatus(); refreshExport();
          break;
        case 'VF_LOG': S.logs = data.logs || []; refreshLog(); break;
        case 'VF_CONFIG': lastConfig = data.config; refreshExport(); break;
        case 'VF_EXPORT_RESULT':
          if (data.ok) showShot(data.dataUrl, data.name || 'veilface-censored.png');
          else { sfx('error'); toast('Ekspor gagal: ' + data.error); }
          break;
        case 'VF_FOCUS_RESULT':
          if (!data.ok) { sfx('error'); toast('Media sudah tidak ada di halaman.'); }
          break;
        default: break;
      }
    });

    send('VF_SIDEBAR_READY');

    chrome.storage.local.get('settings').then((res) => {
      if (res && res.settings) { ingestSettings(res.settings); refreshAll(); }
    }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) { ingestSettings(changes.settings.newValue); refreshAll(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();