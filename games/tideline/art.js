// Tideline art: everything is drawn with canvas paths, no image files.
import { TAU, GATE_W, hash, wrap, noise1, rgba, glow, rr, skinColors } from './util.js';

export function waveY(x, surfY, t) {
  return surfY + Math.sin(x * 0.018 + t * 1.6) * 6 + Math.sin(x * 0.041 - t * 2.3) * 3;
}

// Sky, moon, water body, light rays, far ridges, far kelp and drifting marine snow.
export function drawWorld(g, w, h, surfY, bedY, scroll, t, moon) {
  const sg = g.createLinearGradient(0, 0, 0, Math.max(60, surfY));
  sg.addColorStop(0, '#07041a');
  sg.addColorStop(1, '#2b1752');
  g.fillStyle = sg;
  g.fillRect(0, 0, w, surfY + 30);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    const sx = hash(i) * w, sy = 8 + hash(i + 50) * 470;
    if (sy > surfY - 14) continue;
    g.globalAlpha = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * (1 + hash(i + 9) * 3) + i));
    const s = hash(i + 70) < 0.2 ? 3 : 2;
    g.fillRect(sx, sy, s, s);
  }
  g.globalAlpha = 1;
  if (moon) {
    glow(g, moon.x, moon.y, moon.r * 4.5, '#b49cff', 0.35);
    g.fillStyle = '#f4efff';
    g.beginPath(); g.arc(moon.x, moon.y, moon.r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,140,220,.35)';
    g.beginPath(); g.arc(moon.x - moon.r * 0.3, moon.y - moon.r * 0.2, moon.r * 0.22, 0, TAU); g.fill();
    g.beginPath(); g.arc(moon.x + moon.r * 0.35, moon.y + moon.r * 0.3, moon.r * 0.15, 0, TAU); g.fill();
  }

  // water body
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w + 24; x += 24) g.lineTo(x, waveY(x, surfY, t));
  g.lineTo(w, h);
  g.closePath();
  const wg = g.createLinearGradient(0, surfY - 10, 0, h);
  wg.addColorStop(0, '#0f6496');
  wg.addColorStop(0.07, '#0a4272');
  wg.addColorStop(0.38, '#062747');
  wg.addColorStop(0.75, '#03152c');
  wg.addColorStop(1, '#020a18');
  g.fillStyle = wg;
  g.fill();

  // light rays from the surface
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const span = w * 1.4;
    const rx = wrap(hash(i + 7) * span - scroll * 0.06 + Math.sin(t * 0.3 + i) * 30, span) - w * 0.2;
    const len = 560 + hash(i + 3) * 260;
    const rg = g.createLinearGradient(0, surfY, 0, surfY + len);
    rg.addColorStop(0, 'rgba(120,230,255,0.10)');
    rg.addColorStop(1, 'rgba(120,230,255,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(rx - 16, surfY);
    g.lineTo(rx + 16, surfY);
    g.lineTo(rx + 150, surfY + len);
    g.lineTo(rx + 40, surfY + len);
    g.closePath();
    g.fill();
  }
  g.restore();

  // far ridge
  g.fillStyle = '#041a2f';
  g.beginPath();
  g.moveTo(0, bedY + 40);
  for (let x = 0; x <= w + 40; x += 40) {
    const n = noise1((x + scroll * 0.18) * 0.004) * 0.7 + noise1((x + scroll * 0.18) * 0.011 + 20) * 0.3;
    g.lineTo(x, bedY - 70 - n * 150);
  }
  g.lineTo(w, bedY + 40);
  g.closePath();
  g.fill();

  // far kelp silhouettes
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(10,70,90,0.55)';
  g.lineWidth = 9;
  const ps = scroll * 0.45, step = 92;
  for (let j = Math.floor(ps / step) - 1; j <= Math.floor((ps + w) / step) + 1; j++) {
    const bx = j * step - ps + hash(j) * 50;
    const ht = 180 + hash(j + 3) * 360;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const yy = bedY - (ht * k) / 10;
      const xx = bx + Math.sin(yy * 0.015 + t * 1.2 + j) * (2 + k * 1.4);
      if (k === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
    }
    g.stroke();
    glow(g, bx + Math.sin((bedY - ht) * 0.015 + t * 1.2 + j) * 16, bedY - ht, 16, '#3fe0d0', 0.25);
  }

  // marine snow
  g.fillStyle = '#c4f1ff';
  const deep = Math.max(80, bedY - surfY - 20);
  for (let i = 0; i < 48; i++) {
    const sx = wrap(hash(i + 100) * w - scroll * (0.2 + hash(i + 9) * 0.4) - t * 6, w);
    const sy = surfY + 20 + wrap(hash(i + 20) * 900 + t * (8 + hash(i + 30) * 18), deep);
    g.globalAlpha = 0.18 + hash(i + 40) * 0.4;
    const s = hash(i + 60) < 0.3 ? 3 : 2;
    g.fillRect(sx, sy, s, s);
  }
  g.globalAlpha = 1;
}

// Glowing waterline drawn on top of everything under water.
export function drawSurfaceLine(g, w, surfY, t) {
  g.beginPath();
  for (let x = 0; x <= w + 24; x += 24) {
    const y = waveY(x, surfY, t);
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(95,244,255,0.20)';
  g.lineWidth = 16;
  g.stroke();
  g.restore();
  g.strokeStyle = '#a6fbff';
  g.lineWidth = 3;
  g.stroke();
}
// Sea floor with anemones, tube corals and fan shells. It never moves with the tide.
export function drawSeabed(g, w, h, bedY, scroll, t) {
  const sy = x => bedY + Math.sin((x + scroll) * 0.008) * 10 + Math.sin((x + scroll) * 0.021) * 5;
  const step = 132;
  g.lineCap = 'round';
  for (let j = Math.floor(scroll / step) - 1; j <= Math.floor((scroll + w) / step) + 1; j++) {
    const x = j * step - scroll + hash(j + 5) * 60;
    const kind = hash(j + 11);
    const base = sy(x) + 4;
    if (kind < 0.38) {
      const col = hash(j + 2) < 0.5 ? '#ff6ccf' : '#b48bff';
      g.strokeStyle = rgba(col, 0.75);
      g.lineWidth = 5;
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.28 + Math.sin(t * 2 + j + k) * 0.12;
        const len = 34 + hash(j * 7 + k) * 22;
        const tx = x + Math.cos(a) * len, ty = base + Math.sin(a) * len;
        g.beginPath();
        g.moveTo(x, base);
        g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + Math.sin(t * 2 + k) * 6, base + Math.sin(a) * len * 0.6, tx, ty);
        g.stroke();
        glow(g, tx, ty, 11, col, 0.8);
      }
    } else if (kind < 0.62) {
      const col = hash(j + 4) < 0.5 ? '#ffb03f' : '#3ff5e0';
      for (let k = 0; k < 3; k++) {
        const tw = 14, th = 30 + hash(j * 3 + k) * 46;
        const tx = x + (k - 1) * 18;
        g.fillStyle = '#0c2238';
        rr(g, tx - tw / 2, base - th, tw, th + 6, 7);
        g.fill();
        g.strokeStyle = rgba(col, 0.8);
        g.lineWidth = 3;
        g.beginPath(); g.ellipse(tx, base - th, tw / 2, 4, 0, 0, TAU); g.stroke();
        glow(g, tx, base - th, 16, col, 0.5 + 0.3 * Math.sin(t * 3 + k + j));
      }
    } else if (kind < 0.8) {
      g.fillStyle = 'rgba(255,214,120,0.75)';
      g.beginPath();
      g.moveTo(x, base);
      g.arc(x, base, 20, Math.PI, TAU);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(80,40,10,0.6)';
      g.lineWidth = 2;
      for (let k = 1; k < 5; k++) {
        const a = Math.PI + (k / 5) * Math.PI;
        g.beginPath(); g.moveTo(x, base); g.lineTo(x + Math.cos(a) * 20, base + Math.sin(a) * 20); g.stroke();
      }
    }
  }
  // sand
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w + 30; x += 30) g.lineTo(x, sy(x));
  g.lineTo(w, h);
  g.closePath();
  const sg = g.createLinearGradient(0, bedY - 20, 0, h);
  sg.addColorStop(0, '#12304a');
  sg.addColorStop(0.35, '#0a1d30');
  sg.addColorStop(1, '#040b15');
  g.fillStyle = sg;
  g.fill();
  g.beginPath();
  for (let x = 0; x <= w + 30; x += 30) { if (x === 0) g.moveTo(x, sy(x)); else g.lineTo(x, sy(x)); }
  g.strokeStyle = 'rgba(63,245,224,0.28)';
  g.lineWidth = 3;
  g.stroke();
}

// One kelp column. tipAtEnd=true: anchored at y0 (raft), free tip at y1. Otherwise anchored at y1 (sea floor), tip at y0.
function drawKelp(g, x, y0, y1, t, seed, pal, tipAtEnd) {
  const len = y1 - y0;
  if (len < 6) return;
  g.fillStyle = pal.back;
  rr(g, x + 7, y0, GATE_W - 14, len, 16);
  g.fill();
  g.strokeStyle = rgba(pal.glow, 0.22);
  g.lineWidth = 2;
  g.stroke();
  const strands = new Path2D(), leaves = new Path2D();
  const tips = [];
  const n = Math.max(1, Math.ceil(len / 24));
  for (let i = 0; i < 3; i++) {
    const sx = x + 22 + i * 32, ph = seed + i * 1.9;
    let tip = null;
    for (let k = 0; k <= n; k++) {
      const y = y0 + (len * k) / n;
      const free = tipAtEnd ? (y - y0) / 500 : (y1 - y) / 500;
      const px = sx + Math.sin(y * 0.021 + t * 1.8 + ph) * (2 + 7 * Math.min(1, free));
      if (k === 0) strands.moveTo(px, y); else strands.lineTo(px, y);
      if (k % 2 === 1 && k < n) {
        const side = (k + i) % 4 === 1 ? -1 : 1;
        leaves.moveTo(px, y);
        leaves.lineTo(px + side * 13, y + (tipAtEnd ? 9 : -9));
      }
      if ((tipAtEnd && k === n) || (!tipAtEnd && k === 0)) tip = [px, y];
    }
    tips.push(tip);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = pal.dark;
  g.lineWidth = 20;
  g.stroke(strands);
  g.lineWidth = 10;
  g.stroke(leaves);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(pal.glow, 0.55);
  g.lineWidth = 9;
  g.stroke(strands);
  g.strokeStyle = rgba(pal.glow, 0.35);
  g.lineWidth = 5;
  g.stroke(leaves);
  g.restore();
  g.strokeStyle = pal.core;
  g.lineWidth = 2;
  g.stroke(strands);
  // glowing float pods mark the edge of the gap
  for (const [px, py] of tips) {
    glow(g, px, py, 34, pal.pod, 0.85 + 0.15 * Math.sin(t * 4 + px));
    g.fillStyle = pal.podCore;
    g.beginPath(); g.arc(px, py, 9, 0, TAU); g.fill();
  }
}

// A full gate: a raft floating on the waterline, hanging kelp, a gap, and kelp rising from the floor.
export function drawGate(g, x, surfY, gapC, gap, bedY, t, seed, pal) {
  const top = gapC - gap / 2, bot = gapC + gap / 2;
  drawKelp(g, x, surfY + 4, top, t, seed, pal, true);
  drawKelp(g, x, bot, bedY + 30, t, seed + 3, pal, false);
  const ry = surfY + Math.sin(t * 2 + seed) * 3;
  g.fillStyle = '#1b1336';
  rr(g, x - 6, ry - 15, GATE_W + 12, 22, 11);
  g.fill();
  g.strokeStyle = rgba(pal.glow, 0.7);
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x + 6, ry - 6); g.lineTo(x + GATE_W - 6, ry - 6); g.stroke();
  const lx = x + GATE_W / 2;
  g.strokeStyle = '#3a2d5c';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(lx, ry - 14); g.lineTo(lx, ry - 34); g.stroke();
  glow(g, lx, ry - 38, 30, '#ffd36b', 0.8 + 0.2 * Math.sin(t * 5 + seed));
  g.fillStyle = '#fff1c4';
  g.beginPath(); g.arc(lx, ry - 38, 6, 0, TAU); g.fill();
}

export function drawPearl(g, x, y, gold, t, r = 12) {
  const col = gold ? '#ffd45e' : '#cfe8ff';
  glow(g, x, y, r * (gold ? 3.9 : 2.9), col, 0.7 + 0.25 * Math.sin(t * 5 + x * 0.01));
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.5, gold ? '#ffe39a' : '#eaf3ff');
  gr.addColorStop(1, gold ? '#d18a12' : '#8fb6e8');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
// The diver faces right. o: { scale, alpha, fin, beam, hurt }
export function drawDiver(g, x, y, tilt, skin, t, o = {}) {
  const c = skinColors(skin, t);
  const s = o.scale || 1;
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.scale(s, s);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  if (o.beam !== false) {
    const bg = g.createLinearGradient(30, 0, 270, 0);
    bg.addColorStop(0, rgba(c.visor, 0.30));
    bg.addColorStop(1, rgba(c.visor, 0));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = bg;
    g.beginPath(); g.moveTo(30, -10); g.lineTo(270, -78); g.lineTo(270, 56); g.closePath(); g.fill();
    g.restore();
  }
  glow(g, -2, 0, 88, c.glow, 0.3);
  const f = Math.sin(o.fin || 0) * 0.45;
  // legs + fins
  g.lineCap = 'round';
  for (const [ly, fl] of [[-2, f], [8, -f]]) {
    const ex = -44, ey = ly + fl * 8;
    g.strokeStyle = c.glow; g.lineWidth = 15;
    g.beginPath(); g.moveTo(-12, ly * 0.5 + 2); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = c.suit; g.lineWidth = 10;
    g.beginPath(); g.moveTo(-12, ly * 0.5 + 2); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = rgba(c.glow, 0.85);
    g.beginPath();
    g.moveTo(ex + 2, ey - 3);
    g.lineTo(ex - 26, ey - 10 + fl * 10);
    g.lineTo(ex - 24, ey + 8 + fl * 10);
    g.closePath();
    g.fill();
  }
  // air tank
  g.fillStyle = '#1d2c3e';
  rr(g, -28, -21, 32, 11, 5);
  g.fill();
  g.strokeStyle = c.glow; g.lineWidth = 2; g.stroke();
  // body
  g.fillStyle = c.suit;
  g.beginPath(); g.ellipse(-2, 2, 26, 14, 0, 0, TAU); g.fill();
  g.strokeStyle = c.glow; g.lineWidth = 3; g.stroke();
  g.strokeStyle = rgba(c.glow, 0.7); g.lineWidth = 3;
  g.beginPath(); g.moveTo(-10, -10); g.lineTo(-6, 14); g.stroke();
  // arm reaching forward
  g.strokeStyle = c.glow; g.lineWidth = 9;
  g.beginPath(); g.moveTo(6, 6); g.lineTo(26, 14); g.stroke();
  g.strokeStyle = c.suit; g.lineWidth = 5;
  g.beginPath(); g.moveTo(6, 6); g.lineTo(26, 14); g.stroke();
  // helmet + visor
  g.fillStyle = c.suit;
  g.beginPath(); g.arc(24, -3, 15, 0, TAU); g.fill();
  g.strokeStyle = c.glow; g.lineWidth = 3; g.stroke();
  glow(g, 29, -4, 26, c.visor, 0.75);
  g.fillStyle = c.visor;
  g.beginPath(); g.ellipse(29, -4, 8, 9, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(31, -8, 2.5, 0, TAU); g.fill();
  // head lamp
  glow(g, 22, -18, 16, c.visor, 0.9);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(22, -18, 3.5, 0, TAU); g.fill();
  if (skin.lure) {
    g.strokeStyle = c.glow; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(18, -17); g.quadraticCurveTo(26, -56, 54, -46); g.stroke();
    const bob = Math.sin(t * 4) * 3;
    glow(g, 54, -44 + bob, 30, c.visor, 1);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(54, -44 + bob, 5, 0, TAU); g.fill();
  }
  g.restore();
}

export function drawBubble(g, x, y, r) {
  g.strokeStyle = 'rgba(190,245,255,0.7)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(x - r * 0.45, y - r * 0.5, 2, 2);
}

export function drawLock(g, x, y, s, col) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.strokeStyle = col; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-8, 0); g.lineTo(-8, -7); g.arc(0, -7, 8, Math.PI, 0); g.lineTo(8, 0); g.stroke();
  g.fillStyle = col;
  rr(g, -12, -2, 24, 18, 4);
  g.fill();
  g.restore();
}

export function drawArrowBtn(g, x, y, dir, col) {
  g.fillStyle = 'rgba(8,36,64,0.85)';
  g.beginPath(); g.arc(x, y, 40, 0, TAU); g.fill();
  g.strokeStyle = rgba(col, 0.8); g.lineWidth = 3; g.stroke();
  g.strokeStyle = '#eaffff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x - dir * 7, y - 15); g.lineTo(x + dir * 9, y); g.lineTo(x - dir * 7, y + 15); g.stroke();
}

// Vertical marker line + buoy used for BEST / GOAL / TODAY targets.
export function drawMarker(g, x, surfY, bedY, col, label, api) {
  g.save();
  g.strokeStyle = rgba(col, 0.4);
  g.lineWidth = 3;
  g.setLineDash([14, 14]);
  g.beginPath(); g.moveTo(x, surfY + 10); g.lineTo(x, bedY); g.stroke();
  g.setLineDash([]);
  g.restore();
  glow(g, x, surfY, 30, col, 0.9);
  g.fillStyle = col;
  g.beginPath(); g.arc(x, surfY, 9, 0, TAU); g.fill();
  api.text(label, x, surfY + 44, { size: 24, weight: 900, color: col, stroke: 'rgba(2,10,24,.8)', strokeWidth: 6 });
}
