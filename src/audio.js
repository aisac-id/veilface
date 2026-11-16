/* VeilFace — suara antarmuka. Disintesis lokal dengan WebAudio,
 * tidak ada file audio, tidak ada jaringan. */
(function (root) {
  'use strict';
  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.5;

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume * 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const osc = c.createOscillator();
    const g = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200;
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain || 0.25), c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(filter); filter.connect(g); g.connect(master);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  }

  function noise(dur, gain) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = gain || 0.12;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
  }

  const SFX = {
    tab: () => tone(520, 0.09, 'triangle', 0.16, 720),
    toggleOn: () => { tone(440, 0.08, 'square', 0.1, 660); setTimeout(() => tone(880, 0.1, 'sine', 0.12), 60); },
    toggleOff: () => tone(420, 0.12, 'sine', 0.12, 220),
    slider: () => tone(1200, 0.03, 'sine', 0.05),
    scan: () => { tone(300, 0.22, 'sawtooth', 0.08, 900); noise(0.18, 0.05); },
    done: () => { tone(660, 0.1, 'sine', 0.12); setTimeout(() => tone(990, 0.14, 'sine', 0.1), 90); },
    panic: () => { tone(150, 0.4, 'square', 0.2, 60); noise(0.3, 0.14); },
    error: () => tone(200, 0.18, 'square', 0.14, 140),
    reveal: () => tone(1400, 0.06, 'sine', 0.07, 1800),
    copy: () => { tone(1000, 0.05, 'triangle', 0.1); setTimeout(() => tone(1500, 0.06, 'triangle', 0.08), 50); },
    face: () => { tone(720, 0.06, 'triangle', 0.09, 980); setTimeout(() => tone(1240, 0.07, 'sine', 0.07), 55); },
    shutter: () => { noise(0.06, 0.16); setTimeout(() => noise(0.09, 0.1), 70); },
    model: () => { tone(240, 0.16, 'sine', 0.1, 480); setTimeout(() => tone(720, 0.18, 'triangle', 0.09), 130); }
  };

  root.VFAUDIO = {
    play(name) { const fn = SFX[name]; if (fn) fn(); },
    setEnabled(on) { enabled = !!on; if (on) ensure(); },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume * 0.5; },
    isEnabled: () => enabled
  };
})(typeof self !== 'undefined' ? self : globalThis);