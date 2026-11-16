/* VeilFace — content script.
 * Memasang sidebar selebar 1/4 layar (tab vertikal ke bawah), menjembatani
 * pesan sidebar ↔ mesin deteksi, dan meneruskan relay model/gambar ke worker. */
(function () {
  'use strict';
  if (window.__veilfaceLoaded) return;
  window.__veilfaceLoaded = true;
  if (!document.documentElement || document.documentElement.tagName !== 'HTML') return;

  const CHANNEL = 'VEILFACE_BUS';
  const FALLBACK = {
    enabled: true, autoScan: true, effect: 'bar', model: 'tiny', landmarks: false,
    showBoxes: false, screenshotSafe: false, dockMode: 'dock', sound: true, theme: 'ember',
    sidebarWidth: 25, openTab: 'status', emoji: '\ud83d\ude42', volume: 55,
    detect: { threshold: 35, inputSize: 608, minSize: 28, maxFaces: 40, interval: 220, smoothing: 55, images: true, videos: true, canvases: true },
    params: { intensity: 85, blur: 14, pixel: 12, glitch: 55, speed: 55, hue: 28, opacity: 100, padding: 12, radius: 8, jitter: 35, grain: 25, scanline: 45 },
    quality: 'balanced', fps: 30, mediaOverrides: {}, allowlist: [], profiles: {},
    excludeSelectors: ['[data-vf-ignore]', '.vf-sidebar-host'], includeSelectors: []
  };

  function effective(base) {
    const merged = {
      ...FALLBACK, ...base,
      params: { ...FALLBACK.params, ...(base.params || {}) },
      detect: { ...FALLBACK.detect, ...(base.detect || {}) }
    };
    const profile = (merged.profiles || {})[location.hostname];
    const withProfile = profile
      ? { ...merged, ...profile, params: { ...merged.params, ...(profile.params || {}) }, detect: { ...merged.detect, ...(profile.detect || {}) } }
      : merged;
    if ((withProfile.allowlist || []).includes(location.hostname)) withProfile.enabled = false;
    return withProfile;
  }

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let engine = null;
  let settings = null;
  let frame = null;
  let sidebarOpen = false;
  let lastStats = { faces: 0, media: 0, scanned: 0, guarded: 0, fps: 0, model: '—', modelState: 'idle', backend: '—', enabled: true, panic: false, totalDetections: 0, modelError: '' };
  let lastMedia = [];
  let logs = [];
  let ready = false;

  function post(payload) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ channel: CHANNEL, token, ...payload }, '*');
  }

  function log(message, tone) {
    logs.unshift({ message, tone: tone || 'info', ts: Date.now() });
    logs = logs.slice(0, 60);
    post({ type: 'VF_LOG', logs });
  }

  function persist(patch) {
    chrome.runtime.sendMessage({ type: 'VF_SET_SETTINGS', patch }).catch(() => {});
  }

  function relay(msg) {
    return chrome.runtime.sendMessage(msg).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));
  }

  function applyWidth() {
    const pct = Math.min(50, Math.max(18, Number(settings.sidebarWidth) || 25));
    document.documentElement.style.setProperty('--vf-sidebar-w', pct + 'vw');
    document.documentElement.classList.toggle('vf-docked', sidebarOpen && settings.dockMode === 'dock');
    document.documentElement.classList.toggle('vf-off', !settings.enabled);
    document.documentElement.classList.toggle('vf-shot', !!settings.screenshotSafe);
  }

  function buildSidebar() {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.className = 'vf-sidebar-host';
    frame.setAttribute('data-vf-ignore', '');
    frame.setAttribute('title', 'VeilFace — panel sensor wajah');
    frame.setAttribute('allow', 'clipboard-write');
    frame.dataset.state = 'closed';
    frame.src = chrome.runtime.getURL('sidebar.html') + '#k=' + token;
    document.documentElement.appendChild(frame);
    return frame;
  }

  function hello() {
    post({
      type: 'VF_HELLO', settings, stats: lastStats, media: lastMedia, logs,
      url: location.href, title: document.title
    });
  }

  function openSidebar(force) {
    buildSidebar();
    sidebarOpen = force === true ? true : force === false ? false : !sidebarOpen;
    frame.dataset.state = sidebarOpen ? 'open' : 'closed';
    applyWidth();
    if (sidebarOpen) setTimeout(hello, 260);
  }

  function statsChanged(stats) {
    lastStats = stats;
    post({ type: 'VF_STATS', stats });
    chrome.runtime.sendMessage({ type: 'VF_STATS', faces: stats.faces, enabled: stats.enabled }).catch(() => {});
  }

  function mediaChanged(media) {
    lastMedia = media;
    post({ type: 'VF_MEDIA', media });
  }

  function boot(next) {
    settings = effective(next || {});
    applyWidth();
    engine = window.VFEngine.create({
      settings,
      relay,
      onStats: statsChanged,
      onMedia: mediaChanged,
      onLog: log
    });
    ready = true;
    if (settings.enabled && settings.autoScan) engine.scan();
    else engine.publish();
    log('VeilFace siap di ' + location.hostname + '.', 'ok');
  }

  chrome.runtime.sendMessage({ type: 'VF_GET_SETTINGS' }).then((res) => {
    boot(res && res.ok ? res.settings : FALLBACK);
  }).catch(() => boot(FALLBACK));

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'VF_PING') { respond({ ok: true, open: sidebarOpen }); return; }
    if (msg.type === 'VF_TOGGLE_SIDEBAR') { openSidebar(msg.force); respond({ ok: true, open: sidebarOpen }); return; }
    if (msg.type === 'VF_RESCAN') { if (engine) engine.rescan(); respond({ ok: true }); return; }
    if (msg.type === 'VF_FOCUS_SRC') {
      const id = engine ? engine.focusSrc(msg.src) : 0;
      openSidebar(true);
      respond({ ok: !!id });
      return;
    }
    if (msg.type === 'VF_SETTINGS_CHANGED') {
      if (!ready) { boot(msg.settings); respond({ ok: true }); return; }
      settings = effective(msg.settings || {});
      engine.applySettings(settings);
      applyWidth();
      post({ type: 'VF_SETTINGS', settings });
      respond({ ok: true });
      return;
    }
  });

  /* Pesan dari sidebar (iframe ekstensi), divalidasi dengan token sesi. */
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.channel !== CHANNEL || data.token !== token) return;
    if (!frame || ev.source !== frame.contentWindow) return;
    if (!engine) return;
    switch (data.type) {
      case 'VF_SIDEBAR_READY': hello(); break;
      case 'VF_PATCH': {
        const patch = data.patch || {};
        settings = {
          ...settings, ...patch,
          params: { ...settings.params, ...(patch.params || {}) },
          detect: { ...settings.detect, ...(patch.detect || {}) }
        };
        engine.applySettings(settings);
        applyWidth();
        persist(patch);
        post({ type: 'VF_SETTINGS', settings });
        break;
      }
      case 'VF_SCAN': engine.rescan(); break;
      case 'VF_RESTORE': engine.restore(); log('Overlay dibersihkan sementara.', 'warn'); break;
      case 'VF_REVEAL': engine.reveal(data.id, !!data.on); break;
      case 'VF_REVEAL_ALL': engine.revealAll(!!data.on); log(data.on ? 'Semua sensor dibuka sementara.' : 'Sensor dipasang kembali.', data.on ? 'warn' : 'ok'); break;
      case 'VF_FOCUS': {
        const ok = engine.focus(data.id);
        post({ type: 'VF_FOCUS_RESULT', id: data.id, ok });
        break;
      }
      case 'VF_MEDIA_EFFECT': {
        const ov = engine.setMediaEffect(data.id, data.effect);
        if (ov) persist({ mediaOverrides: ov });
        break;
      }
      case 'VF_MEDIA_TOGGLE': {
        const ov = engine.toggleMedia(data.id, !!data.on);
        if (ov) persist({ mediaOverrides: ov });
        break;
      }
      case 'VF_EXPORT_MEDIA': {
        const res = engine.exportMedia(data.id);
        post({ type: 'VF_EXPORT_RESULT', id: data.id, ...res });
        if (!res.ok) log('Ekspor gagal: ' + res.error, 'warn');
        break;
      }
      case 'VF_PANIC': {
        const next = engine.panic();
        settings = next;
        persist({ enabled: true, screenshotSafe: true });
        applyWidth();
        post({ type: 'VF_SETTINGS', settings: next });
        break;
      }
      case 'VF_CALM': engine.calm(); log('Mode panic dimatikan.', 'ok'); break;
      case 'VF_RELOAD_MODEL': engine.reloadModel(); log('Model dimuat ulang…', 'info'); break;
      case 'VF_EXPORT': post({ type: 'VF_CONFIG', config: engine.exportConfig(), stats: lastStats, media: lastMedia }); break;
      case 'VF_CLOSE': openSidebar(false); break;
      case 'VF_SET_PROFILE': {
        const profiles = { ...(settings.profiles || {}) };
        if (data.profile) profiles[location.hostname] = data.profile;
        else delete profiles[location.hostname];
        settings = { ...settings, profiles };
        persist({ profiles });
        post({ type: 'VF_SETTINGS', settings });
        log(data.profile ? 'Profil situs disimpan untuk ' + location.hostname : 'Profil situs dihapus.', 'ok');
        break;
      }
      case 'VF_ALLOWLIST': {
        const list = new Set(settings.allowlist || []);
        if (data.on) list.add(location.hostname); else list.delete(location.hostname);
        const allowlist = Array.from(list);
        settings = effective({ ...settings, allowlist });
        engine.applySettings(settings);
        applyWidth();
        persist({ allowlist });
        post({ type: 'VF_SETTINGS', settings });
        break;
      }
      default: break;
    }
  });

  /* Alt+Shift+F / Alt+Shift+R tetap jalan walau situs memakai shortcut sendiri. */
  window.addEventListener('keydown', (ev) => {
    if (ev.altKey && ev.shiftKey && ev.code === 'KeyF') { ev.preventDefault(); openSidebar(); }
    if (ev.altKey && ev.shiftKey && ev.code === 'KeyR') { ev.preventDefault(); if (engine) engine.rescan(); }
  }, true);

  window.addEventListener('pagehide', () => { if (engine) engine.destroy(); });
})();