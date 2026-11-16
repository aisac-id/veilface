/* VeilFace — katalog efek wajah + renderer kanvas.
 * Dipakai bersama oleh content script (overlay halaman) dan sidebar (pratinjau). */
(function (root) {
  'use strict';

  const EFFECTS = [
    { id: 'bar', label: 'Censor Bar', desc: 'Balok solid menutupi seluruh wajah.', tone: '#FFB020', params: ['intensity', 'padding', 'radius', 'hue', 'opacity'], animated: false },
    { id: 'eyes', label: 'Eye Strip', desc: 'Pita hitam di area mata saja.', tone: '#FF6B3D', params: ['intensity', 'padding', 'radius', 'opacity'], animated: false },
    { id: 'blur', label: 'Gaussian Blur', desc: 'Wajah dilarutkan dengan blur halus.', tone: '#FF5CA8', params: ['blur', 'intensity', 'padding', 'opacity'], animated: false },
    { id: 'pixel', label: 'Mozaik', desc: 'Kotak piksel besar ala sensor berita.', tone: '#3DA5FF', params: ['pixel', 'padding', 'intensity', 'opacity'], animated: false },
    { id: 'glitch', label: 'RGB Glitch', desc: 'Kanal warna pecah dan irisan bergeser.', tone: '#FF3D71', params: ['glitch', 'jitter', 'speed', 'padding', 'opacity'], animated: true },
    { id: 'emoji', label: 'Emoji Mask', desc: 'Wajah diganti emoji pilihanmu.', tone: '#FFD84D', params: ['intensity', 'padding', 'opacity'], animated: false },
    { id: 'void', label: 'Void Swirl', desc: 'Lubang gelap berputar menelan wajah.', tone: '#A855F7', params: ['intensity', 'speed', 'hue', 'radius', 'opacity'], animated: true },
    { id: 'hologram', label: 'Hologram', desc: 'Kisi holografik dengan scanline.', tone: '#39FFB4', params: ['hue', 'scanline', 'speed', 'intensity', 'opacity'], animated: true },
    { id: 'thermal', label: 'Thermal', desc: 'Peta panas menggantikan detail wajah.', tone: '#FF8A3D', params: ['intensity', 'hue', 'grain', 'opacity'], animated: false },
    { id: 'noise', label: 'Static Noise', desc: 'Semen statis TV di area wajah.', tone: '#8AA0B4', params: ['grain', 'speed', 'intensity', 'opacity'], animated: true },
    { id: 'spiral', label: 'Hypno Spiral', desc: 'Pola spiral berputar menutupi wajah.', tone: '#B4FF39', params: ['speed', 'intensity', 'hue', 'opacity'], animated: true },
    { id: 'avatar', label: 'Geo Avatar', desc: 'Topeng geometris identitas anonim.', tone: '#5CE1FF', params: ['intensity', 'hue', 'radius', 'opacity'], animated: false },
    { id: 'scramble', label: 'Glyph Scramble', desc: 'Kisi karakter acak di atas wajah.', tone: '#C77DFF', params: ['speed', 'intensity', 'pixel', 'opacity'], animated: true },
    { id: 'outline', label: 'Outline Saja', desc: 'Hanya menandai wajah, tanpa sensor.', tone: '#2FD98A', params: ['intensity', 'padding', 'radius', 'hue', 'opacity'], animated: false }
  ];

  const GLYPHS = '█▓▒░#@%&$*!?01ΔΩΣΞΨ§¤¥×÷≡≠∞';

  function byId(id) { return EFFECTS.find((e) => e.id === id) || EFFECTS[0]; }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* sumber: elemen media atau kanvas bersih; box dalam koordinat sumber alami.
   * ctx: konteks overlay; rect: posisi box di overlay (px CSS * dpr sudah diterapkan). */
  function drawEffect(ctx, source, box, rect, effectId, p, time, seed) {
    const eff = byId(effectId);
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    if (w < 2 || h < 2) return;
    const t = time / 1000;
    const rnd = mulberry(seed || 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, p.opacity / 100);

    const clip = (radius) => { roundRect(ctx, x, y, w, h, radius); ctx.clip(); };
    const paintSource = (filter) => {
      if (!source) return false;
      try {
        ctx.save();
        if (filter) ctx.filter = filter;
        ctx.drawImage(source, box.x, box.y, box.w, box.h, x, y, w, h);
        ctx.restore();
        return true;
      } catch (err) { return false; }
    };

    switch (eff.id) {
      case 'bar': {
        roundRect(ctx, x, y, w, h, p.radius);
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, 'hsl(' + p.hue + ' 80% 12%)');
        g.addColorStop(0.55, '#0a0710');
        g.addColorStop(1, 'hsl(' + ((p.hue + 330) % 360) + ' 78% 15%)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'hsl(' + p.hue + ' 95% 60% / 0.75)';
        ctx.lineWidth = Math.max(1, w * 0.012);
        ctx.stroke();
        ctx.save(); clip(p.radius);
        ctx.fillStyle = 'hsl(' + p.hue + ' 100% 70% / ' + (0.1 + 0.16 * p.intensity / 100) + ')';
        ctx.fillRect(x, y + h * 0.42, w, h * 0.06);
        ctx.restore();
        break;
      }
      case 'eyes': {
        const ey = y + h * 0.28;
        const eh = h * 0.24 * (0.7 + p.intensity / 200);
        roundRect(ctx, x - w * 0.04, ey, w * 1.08, eh, p.radius * 0.5);
        ctx.fillStyle = '#08060a';
        ctx.fill();
        ctx.strokeStyle = 'hsl(' + p.hue + ' 95% 60% / 0.6)';
        ctx.lineWidth = Math.max(1, w * 0.01);
        ctx.stroke();
        break;
      }
      case 'blur': {
        ctx.save(); clip(p.radius);
        const ok = paintSource('blur(' + Math.max(1, p.blur * (w / 160)) + 'px) saturate(' + (1 + p.intensity / 140) + ')');
        if (!ok) { ctx.fillStyle = 'hsl(' + p.hue + ' 40% 30%)'; ctx.fillRect(x, y, w, h); }
        ctx.restore();
        break;
      }
      case 'pixel': {
        const cell = Math.max(2, p.pixel * (w / 160));
        const cols = Math.max(1, Math.round(w / cell));
        const rows = Math.max(1, Math.round(h / cell));
        const tmp = getScratch(cols, rows);
        const tctx = tmp.getContext('2d');
        tctx.clearRect(0, 0, cols, rows);
        let ok = false;
        try { tctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, cols, rows); ok = true; } catch (err) { ok = false; }
        ctx.save(); clip(p.radius);
        ctx.imageSmoothingEnabled = false;
        if (ok) ctx.drawImage(tmp, 0, 0, cols, rows, x, y, w, h);
        else {
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            ctx.fillStyle = 'hsl(' + ((p.hue + rnd() * 60) | 0) + ' 45% ' + (18 + rnd() * 40) + '%)';
            ctx.fillRect(x + c * (w / cols), y + r * (h / rows), w / cols + 1, h / rows + 1);
          }
        }
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
        break;
      }
      case 'glitch': {
        ctx.save(); clip(p.radius);
        paintSource(null);
        const amp = (p.glitch / 100) * w * 0.12;
        const slices = 7;
        for (let i = 0; i < slices; i++) {
          const sy = box.y + (box.h / slices) * i;
          const sh = box.h / slices;
          const off = Math.sin(t * (2 + p.speed / 22) + i * 1.7 + seed) * amp;
          try { ctx.drawImage(source, box.x, sy, box.w, sh, x + off, y + (h / slices) * i, w, h / slices + 1); } catch (err) { /* abaikan */ }
        }
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(255,61,113,' + (0.18 + p.glitch / 400) + ')';
        ctx.fillRect(x + Math.sin(t * 6 + seed) * amp * 0.5, y, w, h);
        ctx.fillStyle = 'rgba(57,255,180,' + (0.14 + p.glitch / 500) + ')';
        ctx.fillRect(x - Math.sin(t * 5 + seed) * amp * 0.5, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        break;
      }
      case 'emoji': {
        ctx.save(); clip(p.radius);
        ctx.fillStyle = 'hsl(' + p.hue + ' 60% 14% / ' + (0.55 + p.intensity / 250) + ')';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.font = Math.round(Math.min(w, h) * 0.92) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji || '🙂', x + w / 2, y + h / 2 + h * 0.03);
        break;
      }
      case 'void': {
        ctx.save();
        roundRect(ctx, x, y, w, h, Math.max(p.radius, Math.min(w, h) / 2));
        ctx.clip();
        const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, Math.max(w, h) / 1.6);
        g.addColorStop(0, '#000');
        g.addColorStop(0.55, 'hsl(' + p.hue + ' 80% 14%)');
        g.addColorStop(1, 'hsl(' + ((p.hue + 60) % 360) + ' 90% 30% / 0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(t * (0.6 + p.speed / 40));
        ctx.strokeStyle = 'hsl(' + p.hue + ' 100% 70% / ' + (0.25 + p.intensity / 220) + ')';
        ctx.lineWidth = Math.max(1, w * 0.02);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, Math.min(w, h) * (0.2 + i * 0.13), i * 1.2, i * 1.2 + 2.1);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'hologram': {
        ctx.save(); clip(p.radius);
        paintSource('grayscale(1) brightness(1.25) contrast(1.2)');
        ctx.fillStyle = 'hsl(' + p.hue + ' 100% 55% / ' + (0.28 + p.intensity / 300) + ')';
        ctx.fillRect(x, y, w, h);
        const step = Math.max(2, (100 - p.scanline) / 12 + 2);
        ctx.fillStyle = 'hsl(' + p.hue + ' 100% 80% / 0.35)';
        const shift = (t * (20 + p.speed)) % step;
        for (let yy = y - step + shift; yy < y + h; yy += step) ctx.fillRect(x, yy, w, 1);
        ctx.restore();
        ctx.strokeStyle = 'hsl(' + p.hue + ' 100% 70% / 0.9)';
        ctx.lineWidth = Math.max(1, w * 0.014);
        roundRect(ctx, x, y, w, h, p.radius);
        ctx.stroke();
        break;
      }
      case 'thermal': {
        ctx.save(); clip(p.radius);
        paintSource('grayscale(1) contrast(1.35)');
        ctx.globalCompositeOperation = 'color';
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, 'hsl(' + ((p.hue + 200) % 360) + ' 100% 45%)');
        g.addColorStop(0.4, 'hsl(' + ((p.hue + 120) % 360) + ' 100% 50%)');
        g.addColorStop(0.7, 'hsl(' + p.hue + ' 100% 55%)');
        g.addColorStop(1, 'hsl(' + ((p.hue + 340) % 360) + ' 100% 60%)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,' + (p.intensity / 260) + ')';
        ctx.fillRect(x, y, w, h);
        const dots = Math.round(30 + p.grain);
        for (let i = 0; i < dots; i++) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + rnd() * 0.08) + ')';
          ctx.fillRect(x + rnd() * w, y + rnd() * h, 2, 2);
        }
        ctx.restore();
        break;
      }
      case 'noise': {
        ctx.save(); clip(p.radius);
        paintSource('grayscale(1) brightness(0.7)');
        const blocks = Math.round(60 + p.grain * 3);
        const bw = Math.max(2, w / 22);
        for (let i = 0; i < blocks; i++) {
          const v = Math.floor(rnd() * 255);
          ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + p.intensity / 200) + ')';
          ctx.fillRect(x + rnd() * w, y + rnd() * h, bw, bw * 0.7);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let yy = y + ((t * 60) % 4); yy < y + h; yy += 4) ctx.fillRect(x, yy, w, 1);
        ctx.restore();
        break;
      }
      case 'spiral': {
        ctx.save();
        roundRect(ctx, x, y, w, h, Math.max(p.radius, Math.min(w, h) / 2));
        ctx.clip();
        ctx.fillStyle = '#07060b';
        ctx.fillRect(x, y, w, h);
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(t * (0.8 + p.speed / 30));
        ctx.strokeStyle = 'hsl(' + p.hue + ' 100% 62% / ' + (0.4 + p.intensity / 200) + ')';
        ctx.lineWidth = Math.max(1.5, w * 0.035);
        ctx.beginPath();
        const turns = 5;
        for (let a = 0; a < Math.PI * 2 * turns; a += 0.12) {
          const r = (a / (Math.PI * 2 * turns)) * Math.min(w, h) * 0.55;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'avatar': {
        ctx.save(); clip(p.radius);
        const base = 'hsl(' + p.hue + ' 70% ' + (16 + p.intensity / 8) + '%)';
        ctx.fillStyle = base;
        ctx.fillRect(x, y, w, h);
        const accent = 'hsl(' + ((p.hue + 150) % 360) + ' 90% 62%)';
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.38, Math.min(w, h) * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'hsl(' + ((p.hue + 40) % 360) + ' 95% 58%)';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.16, y + h);
        ctx.quadraticCurveTo(x + w / 2, y + h * 0.52, x + w * 0.84, y + h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, w * 0.012);
        roundRect(ctx, x + 1, y + 1, w - 2, h - 2, p.radius);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'scramble': {
        ctx.save(); clip(p.radius);
        ctx.fillStyle = 'rgba(8,6,14,' + (0.6 + p.intensity / 300) + ')';
        ctx.fillRect(x, y, w, h);
        const cellSize = Math.max(7, p.pixel * (w / 160) * 1.4);
        ctx.font = Math.round(cellSize) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cols = Math.max(1, Math.floor(w / cellSize));
        const rows = Math.max(1, Math.floor(h / cellSize));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = Math.floor(rnd() * GLYPHS.length);
            ctx.fillStyle = 'hsl(' + p.hue + ' 100% ' + (55 + rnd() * 30) + '% / ' + (0.5 + rnd() * 0.5) + ')';
            ctx.fillText(GLYPHS[idx], x + c * cellSize + cellSize / 2, y + r * cellSize + cellSize / 2);
          }
        }
        ctx.restore();
        break;
      }
      case 'outline':
      default: {
        ctx.strokeStyle = 'hsl(' + p.hue + ' 100% 62% / ' + (0.5 + p.intensity / 200) + ')';
        ctx.lineWidth = Math.max(1.5, w * 0.02);
        roundRect(ctx, x, y, w, h, p.radius);
        ctx.stroke();
        const corner = Math.min(w, h) * 0.18;
        ctx.beginPath();
        ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y);
        ctx.moveTo(x + w - corner, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - corner);
        ctx.lineWidth = Math.max(2, w * 0.03);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  let scratch = null;
  function getScratch(w, h) {
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
    return scratch;
  }

  function mulberry(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Pratinjau sidebar: wajah sintetis supaya efek terlihat tanpa foto nyata. */
  function drawPreviewFace(canvas, effectId, params, time) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1b1220');
    bg.addColorStop(1, '#241a12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.52, r = Math.min(w, h) * 0.34;
    const skin = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.2, cx, cy, r * 1.3);
    skin.addColorStop(0, '#f6d3b0');
    skin.addColorStop(1, '#c98f63');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.82, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1a12';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.75, r * 0.86, r * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20140f';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.34, cy - r * 0.12, r * 0.11, r * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.34, cy - r * 0.12, r * 0.11, r * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8d4b3a';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.3, r * 0.3, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();

    const box = { x: cx - r * 0.9, y: cy - r * 1.15, w: r * 1.8, h: r * 2.2 };
    const rect = { x: box.x, y: box.y, w: box.w, h: box.h };
    drawEffect(ctx, canvas, box, rect, effectId, params, time || 0, 7);
  }

  const api = { EFFECTS, byId, drawEffect, drawPreviewFace, roundRect, GLYPHS };
  root.VFEffects = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);