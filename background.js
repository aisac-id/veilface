/* VeilFace — service worker.
 * Selain state global, worker ini menjadi jembatan CORS: model dan gambar
 * lintas-origin diambil di konteks ekstensi lalu diteruskan ke content script.
 * Tidak ada data yang dikirim ke server mana pun. */

const DEFAULTS = {
  enabled: true,
  autoScan: true,
  effect: 'bar',
  model: 'tiny',
  landmarks: false,
  showBoxes: false,
  screenshotSafe: false,
  dockMode: 'dock',
  sound: true,
  theme: 'ember',
  sidebarWidth: 25,
  openTab: 'status',
  emoji: '🙂',
  volume: 55,
  detect: { threshold: 35, inputSize: 608, minSize: 28, maxFaces: 40, interval: 220, smoothing: 55, images: true, videos: true, canvases: true },
  params: { intensity: 85, blur: 14, pixel: 12, glitch: 55, speed: 55, hue: 28, opacity: 100, padding: 12, radius: 8, jitter: 35, grain: 25, scanline: 45 },
  quality: 'balanced',
  fps: 30,
  mediaOverrides: {},
  allowlist: [],
  profiles: {},
  excludeSelectors: ['[data-vf-ignore]', '.vf-sidebar-host'],
  includeSelectors: []
};

async function readSettings() {
  const stored = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULTS, ...(stored.settings || {}) };
  merged.detect = { ...DEFAULTS.detect, ...(merged.detect || {}) };
  merged.params = { ...DEFAULTS.params, ...(merged.params || {}) };
  return merged;
}

/* Tulis berurutan: banyak patch cepat (mis. efek massal) tidak boleh saling menimpa. */
let writeChain = Promise.resolve();
function writeSettings(patch) {
  writeChain = writeChain.then(async () => {
    const current = await readSettings();
    const next = { ...current, ...patch };
    next.detect = { ...current.detect, ...(patch.detect || {}) };
    next.params = { ...current.params, ...(patch.params || {}) };
    if (patch.mediaOverrides) {
      next.mediaOverrides = { ...(current.mediaOverrides || {}) };
      for (const key of Object.keys(patch.mediaOverrides)) {
        next.mediaOverrides[key] = { ...(next.mediaOverrides[key] || {}), ...patch.mediaOverrides[key] };
      }
    }
    await chrome.storage.local.set({ settings: next });
    return next;
  }).catch(() => readSettings());
  return writeChain;
}

function badge(tabId, count, enabled) {
  if (!tabId) return;
  chrome.action.setBadgeText({ tabId, text: !enabled ? 'OFF' : count ? (count > 999 ? '999+' : String(count)) : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? '#FFB020' : '#5A5560' }).catch(() => {});
  chrome.action.setBadgeTextColor({ tabId, color: '#160B08' }).catch(() => {});
}

async function sendToTab(tabId, message) {
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
}

async function ensureInjected(tabId) {
  const probe = await sendToTab(tabId, { type: 'VF_PING' });
  if (probe && probe.ok) return true;
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/page.css'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['vendor/face-api.min.js', 'src/effects.js', 'src/engine.js', 'src/content.js']
    });
    return true;
  } catch (err) { return false; }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULTS });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'vf-open', title: 'Buka sidebar VeilFace', contexts: ['page', 'action'] });
    chrome.contextMenus.create({ id: 'vf-image', title: 'Sensor wajah pada gambar ini', contexts: ['image', 'video'] });
    chrome.contextMenus.create({ id: 'vf-rescan', title: 'Pindai ulang wajah', contexts: ['page', 'action'] });
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  if (!(await ensureInjected(tab.id))) return;
  await sendToTab(tab.id, { type: 'VF_TOGGLE_SIDEBAR' });
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !(await ensureInjected(tab.id))) return;
  if (command === 'toggle-sidebar') await sendToTab(tab.id, { type: 'VF_TOGGLE_SIDEBAR' });
  if (command === 'rescan') await sendToTab(tab.id, { type: 'VF_RESCAN' });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id || !(await ensureInjected(tab.id))) return;
  if (info.menuItemId === 'vf-open') await sendToTab(tab.id, { type: 'VF_TOGGLE_SIDEBAR', force: true });
  if (info.menuItemId === 'vf-rescan') await sendToTab(tab.id, { type: 'VF_RESCAN' });
  if (info.menuItemId === 'vf-image' && info.srcUrl) await sendToTab(tab.id, { type: 'VF_FOCUS_SRC', src: info.srcUrl });
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    if (!msg || typeof msg.type !== 'string') return respond({ ok: false });
    switch (msg.type) {
      case 'VF_GET_SETTINGS': return respond({ ok: true, settings: await readSettings() });
      case 'VF_SET_SETTINGS': {
        const next = await writeSettings(msg.patch || {});
        const tabs = await chrome.tabs.query({});
        for (const t of tabs) if (t.id) sendToTab(t.id, { type: 'VF_SETTINGS_CHANGED', settings: next });
        return respond({ ok: true, settings: next });
      }
      case 'VF_STATS': {
        badge(sender.tab && sender.tab.id, msg.faces || 0, msg.enabled !== false);
        return respond({ ok: true });
      }
      /* Model diambil dari paket ekstensi (origin ekstensi, tanpa CORS). */
      case 'VF_MODEL_FILE': {
        try {
          const url = chrome.runtime.getURL('models/' + String(msg.file).replace(/[^\w.\-]/g, ''));
          const res = await fetch(url);
          if (!res.ok) return respond({ ok: false, error: 'HTTP ' + res.status });
          if (msg.json) return respond({ ok: true, json: await res.json() });
          return respond({ ok: true, base64: toBase64(await res.arrayBuffer()) });
        } catch (err) { return respond({ ok: false, error: String(err) }); }
      }
      /* Gambar lintas-origin: diambil worker supaya kanvas tidak tainted. */
      case 'VF_FETCH_IMAGE': {
        try {
          const res = await fetch(msg.src, { credentials: 'omit' });
          if (!res.ok) return respond({ ok: false, error: 'HTTP ' + res.status });
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 12 * 1024 * 1024) return respond({ ok: false, error: 'gambar terlalu besar' });
          return respond({ ok: true, base64: toBase64(buf), mime: res.headers.get('content-type') || 'image/jpeg' });
        } catch (err) { return respond({ ok: false, error: String(err) }); }
      }
      case 'VF_QUERY_TAB': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return respond({ ok: true, tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null });
      }
      default: return respond({ ok: false, error: 'unknown message' });
    }
  })();
  return true;
});