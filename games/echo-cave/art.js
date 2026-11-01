// Echo Cave - drawing helpers (bat, hunters, sleepers, rocks, crystals, icons).
// Everything is vector art drawn with canvas paths: glowing outlines on black.

export const SKINS = [
  { id: 'dusk', name: 'Dusk', c: [140, 182, 255], body: '#0b1124', eye: '#eef4ff', need: null },
  { id: 'ember', name: 'Ember', c: [255, 152, 84], body: '#1d0c05', eye: '#fff0c4', need: 'deep' },
  { id: 'frost', name: 'Frost', c: [168, 244, 255], body: '#06161b', eye: '#ffffff', need: 'blind' },
  { id: 'moss', name: 'Moss', c: [136, 255, 150], body: '#06180a', eye: '#efffe0', need: 'silent' },
  { id: 'amethyst', name: 'Amethyst', c: [206, 146, 255], body: '#140a21', eye: '#f7ebff', need: 'crystal' },
  { id: 'ghost', name: 'Ghost', c: [236, 238, 248], body: '#15161c', eye: '#9ffcff', need: 'untouched' },
  { id: 'rose', name: 'Rose', c: [255, 122, 172], body: '#1d0711', eye: '#ffe8f2', need: 'daily' },
  { id: 'aurora', name: 'Aurora', c: null, body: '#090d18', eye: '#ffffff', need: 'abyss' },
];
export const DEAD_SKIN = { id: 'dead', c: [110, 120, 150], body: '#05060a', eye: '#2a2f3a', need: null };

let hue = 200;
export function setHue(h) { hue = h; }

export function rgba(c, a) {
  const v = a < 0 ? 0 : a > 1 ? 1 : a;
  return `rgba(${c[0]},${c[1]},${c[2]},${v.toFixed(3)})`;
}

export function skinCol(s, a) {
  if (s.c) return rgba(s.c, a);
  const v = a < 0 ? 0 : a > 1 ? 1 : a;
  return `hsla(${hue | 0},95%,72%,${v.toFixed(3)})`;
}

// Bat seen from the front, wings spread. ph = flap phase, spread 0..1.
export function drawBat(g, x, y, sc, ph, spread, skin, rot, alpha) {
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(sc, sc);
  g.globalAlpha *= alpha === undefined ? 1 : alpha;
  g.lineJoin = 'round';
  const f = Math.sin(ph) * 14 * spread;
  const sp = 0.35 + 0.65 * spread;
  const rim = skinCol(skin, 0.95), glow = skinCol(skin, 0.22);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(5 * s, -5);
    g.quadraticCurveTo(20 * s * sp, -18 + f * 0.4, 46 * s * sp, -9 + f);
    g.lineTo(39 * s * sp, 5 + f * 0.7);
    g.quadraticCurveTo(34 * s * sp, -1 + f * 0.6, 29 * s * sp, 3 + f * 0.55);
    g.quadraticCurveTo(24 * s * sp, 11 + f * 0.4, 18 * s * sp, 6 + f * 0.3);
    g.quadraticCurveTo(13 * s * sp, 12, 6 * s, 7);
    g.closePath();
    g.fillStyle = skin.body; g.fill();
    g.lineWidth = 5; g.strokeStyle = glow; g.stroke();
    g.lineWidth = 1.8; g.strokeStyle = rim; g.stroke();
  }
  // body
  g.beginPath(); g.ellipse(0, 3, 8, 11, 0, 0, Math.PI * 2);
  g.fillStyle = skin.body; g.fill();
  g.lineWidth = 1.8; g.strokeStyle = rim; g.stroke();
  // head with ears
  g.beginPath();
  g.moveTo(-6.5, -6); g.lineTo(-7.5, -19); g.lineTo(-2.5, -12.5); g.lineTo(2.5, -12.5); g.lineTo(7.5, -19); g.lineTo(6.5, -6);
  g.quadraticCurveTo(0, -1, -6.5, -6); g.closePath();
  g.fillStyle = skin.body; g.fill(); g.stroke();
  g.fillStyle = skin.eye;
  g.fillRect(-4.4, -10, 2.6, 2.6); g.fillRect(1.8, -10, 2.6, 2.6);
  g.restore();
}

// Rock stalactite / stalagmite: only the two exposed edges are outlined.
export function drawSpike(g, o, cam, b, col, bg) {
  if (b < 0.02) return;
  const ax = o.ax - cam, bx = o.bx - cam, cx = o.cx - cam;
  g.beginPath(); g.moveTo(ax, o.ay); g.lineTo(cx, o.cy); g.lineTo(bx, o.by); g.closePath();
  g.fillStyle = bg; g.fill();
  g.fillStyle = col(b * 0.07); g.fill();
  g.beginPath(); g.moveTo(ax, o.ay); g.lineTo(cx, o.cy); g.lineTo(bx, o.by);
  g.lineWidth = 10; g.strokeStyle = col(b * 0.16); g.stroke();
  g.lineWidth = 2.4; g.strokeStyle = col(b); g.stroke();
  const mx = (ax + bx) / 2, my = (o.ay + o.by) / 2, k = 0.62;
  g.beginPath();
  g.moveTo(mx + (ax - mx) * k, my + (o.ay - my) * k);
  g.lineTo(mx + (cx - mx) * k, my + (o.cy - my) * k);
  g.lineTo(mx + (bx - mx) * k, my + (o.by - my) * k);
  g.lineWidth = 1.3; g.strokeStyle = col(b * 0.35); g.stroke();
}

function rockPath(g, x, y, o, scale) {
  g.beginPath();
  const n = o.pts.length;
  for (let i = 0; i < n; i++) {
    const a = o.rot + (i / n) * Math.PI * 2, rr = o.r * o.pts[i] * scale;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

export function drawRock(g, o, cam, b, col, bg) {
  if (b < 0.02) return;
  const x = o.x - cam;
  rockPath(g, x, o.y, o, 1);
  g.fillStyle = bg; g.fill();
  g.fillStyle = col(b * 0.07); g.fill();
  g.lineWidth = 10; g.strokeStyle = col(b * 0.16); g.stroke();
  g.lineWidth = 2.4; g.strokeStyle = col(b); g.stroke();
  rockPath(g, x, o.y, o, 0.62);
  g.lineWidth = 1.3; g.strokeStyle = col(b * 0.35); g.stroke();
}

// A sleeping creature hanging from the ceiling. Eyes show as red slits when the cave is stirring.
export function drawSleeper(g, o, cam, b, stirring, now) {
  const x = o.x - cam, y = o.y + Math.sin(now * 1.4 + o.ph) * 2;
  if (b > 0.02) {
    const c = `rgba(255,112,150,${Math.min(1, b).toFixed(3)})`;
    g.save();
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, o.topY - 4); g.lineTo(x, y - 24);
    g.lineWidth = 1.6; g.strokeStyle = c; g.stroke();
    g.beginPath(); g.ellipse(x, y, 16, 25, 0, 0, Math.PI * 2);
    g.fillStyle = '#010206'; g.fill();
    g.lineWidth = 8; g.strokeStyle = `rgba(255,112,150,${(b * 0.15).toFixed(3)})`; g.stroke();
    g.lineWidth = 2.2; g.strokeStyle = c; g.stroke();
    g.beginPath();
    g.moveTo(x - 15, y - 6); g.quadraticCurveTo(x - 4, y + 4, x - 9, y + 22);
    g.moveTo(x + 15, y - 6); g.quadraticCurveTo(x + 4, y + 4, x + 9, y + 22);
    g.lineWidth = 1.3; g.stroke();
    g.restore();
  }
  if (stirring) {
    const a = 0.45 + 0.3 * Math.sin(now * 5 + o.ph);
    g.save();
    g.strokeStyle = `rgba(255,60,90,${a.toFixed(3)})`;
    g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 9, y + 5); g.lineTo(x - 3, y + 7); g.moveTo(x + 9, y + 5); g.lineTo(x + 3, y + 7); g.stroke();
    g.restore();
  }
}

// An awake hunter: a ragged shadow whose body only shows in echo light, eyes always glow.
export function drawHunter(g, h, cam, b, now) {
  const x = h.x - cam, y = h.y;
  let fa = 1;
  if (h.st === 'fade') fa = Math.max(0, 1 - h.t / 0.8);
  if (b > 0.02) {
    const c = `rgba(255,72,104,${(b * fa).toFixed(3)})`;
    g.save();
    g.beginPath();
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = h.r * (0.72 + 0.4 * Math.abs(Math.sin(now * 7 + i * 1.7 + h.ph)));
      const px = x + Math.cos(a) * rr * 1.25, py = y + Math.sin(a) * rr * 0.85;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = '#010206'; g.fill();
    g.lineWidth = 9; g.strokeStyle = `rgba(255,72,104,${(b * fa * 0.15).toFixed(3)})`; g.stroke();
    g.lineWidth = 2; g.strokeStyle = c; g.stroke();
    const sp = Math.hypot(h.vx, h.vy) || 1, ux = -h.vx / sp, uy = -h.vy / sp;
    g.beginPath();
    for (let k = -1; k <= 1; k++) {
      const ox = x + ux * h.r * 0.8 - uy * k * 9, oy = y + uy * h.r * 0.8 + ux * k * 9;
      g.moveTo(ox, oy);
      const w = Math.sin(now * 9 + k * 2) * 7;
      g.quadraticCurveTo(ox + ux * 22 - uy * w, oy + uy * 22 + ux * w, ox + ux * 40, oy + uy * 40);
    }
    g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  let es = 1;
  if (h.st === 'wake') es = Math.min(1, h.t / Math.max(0.05, h.wake));
  let ea = fa;
  if (h.st === 'lost') ea *= 0.55 + 0.45 * Math.abs(Math.sin(now * 6));
  for (const s of [-1, 1]) {
    const ex = x + s * 8, ey = y - 3;
    const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 16 * es);
    gr.addColorStop(0, `rgba(255,50,80,${(0.55 * ea).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,50,80,0)');
    g.fillStyle = gr;
    g.fillRect(ex - 17, ey - 17, 34, 34);
    g.fillStyle = `rgba(255,190,200,${ea.toFixed(3)})`;
    g.beginPath(); g.ellipse(ex, ey, 3.6 * es, 2.2 * es, s * 0.35, 0, Math.PI * 2); g.fill();
  }
}

export function drawCrystal(g, x, y, a, b) {
  g.save();
  g.beginPath(); g.moveTo(x, y - 11); g.lineTo(x + 7, y); g.lineTo(x, y + 11); g.lineTo(x - 7, y); g.closePath();
  g.fillStyle = `rgba(255,228,154,${(a * 0.45).toFixed(3)})`; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = `rgba(255,240,190,${Math.min(1, a).toFixed(3)})`; g.stroke();
  if (b > 0.15) {
    const L = 8 + 16 * b;
    g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L - 4); g.lineTo(x, y + L + 4);
    g.lineWidth = 1; g.strokeStyle = `rgba(255,245,210,${(b * 0.7).toFixed(3)})`; g.stroke();
  }
  g.restore();
}

export function starPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export function arrowBtn(g, x, y, dir, col) {
  g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.04)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = col(0.55); g.stroke();
  g.beginPath(); g.moveTo(x + 10 * dir, y); g.lineTo(x - 7 * dir, y - 12); g.lineTo(x - 7 * dir, y + 12); g.closePath();
  g.fillStyle = col(0.95); g.fill();
}
