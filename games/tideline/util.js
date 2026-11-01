// Tideline shared constants and small drawing helpers.
export const W = 720, H = 1280;
export const TAU = Math.PI * 2;
export const DIVER_X = 210;
export const DIVER_R = 21;
export const SURF_BASE = 300;
export const SEABED = 1168;
export const GATE_W = 108;
export const PX_PER_M = 38;
export const READY_Y = 720;

export const SKINS = [
  { name: 'Glowkit', pearls: 0, suit: '#0c2a3a', glow: '#46f0ff', visor: '#c9fdff' },
  { name: 'Coral Bloom', pearls: 40, suit: '#3a1030', glow: '#ff6ccf', visor: '#ffd6f3' },
  { name: 'Kelp Ranger', pearls: 100, suit: '#0d3322', glow: '#5cff9c', visor: '#dcffe9' },
  { name: 'Sunray', pearls: 180, suit: '#3d2b08', glow: '#ffcf4f', visor: '#fff3c9' },
  { name: 'Abyss Lantern', pearls: 300, suit: '#191038', glow: '#a48bff', visor: '#e6deff', lure: true },
  { name: 'Prism Drifter', dist: 750, suit: '#121a2a', glow: '#ffffff', visor: '#ffffff', prism: true },
];

export const ZONES = [
  { from: 0, name: 'Lantern Shallows', glow: '#36f2c4', core: '#c4fff0', dark: '#0a3a3a', back: 'rgba(30,190,160,0.17)', pod: '#ff5fd2', podCore: '#ffd0f4' },
  { from: 250, name: 'Blue Hollow', glow: '#3fc8ff', core: '#d0f4ff', dark: '#0a2c48', back: 'rgba(40,150,230,0.17)', pod: '#ffb03f', podCore: '#fff0c8' },
  { from: 600, name: 'Violet Deep', glow: '#a07bff', core: '#e7dcff', dark: '#221a4a', back: 'rgba(140,100,255,0.18)', pod: '#5dffb0', podCore: '#e0fff0' },
];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const wrap = (v, m) => ((v % m) + m) % m;
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + to(f(0)) + to(f(8)) + to(f(4));
}

const glowCache = new Map();
function glowSprite(hex) {
  if (glowCache.has(hex)) return glowCache.get(hex);
  let c = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      c = new OffscreenCanvas(64, 64);
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(hex, 1));
      gr.addColorStop(0.25, rgba(hex, 0.55));
      gr.addColorStop(0.6, rgba(hex, 0.16));
      gr.addColorStop(1, rgba(hex, 0));
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
    } catch (e) { c = null; }
  }
  glowCache.set(hex, c);
  return c;
}

// Additive soft glow centred on (x, y).
export function glow(g, x, y, r, hex, a = 1) {
  if (a <= 0 || r <= 0) return;
  const s = glowSprite(hex);
  const pa = g.globalAlpha, pc = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = pa * Math.min(1, a);
  if (s) g.drawImage(s, x - r, y - r, r * 2, r * 2);
  else {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(hex, 0.9));
    gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = pa;
  g.globalCompositeOperation = pc;
}

export function rr(g, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + q, y); g.lineTo(x + w - q, y); g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q); g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  g.lineTo(x + q, y + h); g.quadraticCurveTo(x, y + h, x, y + h - q);
  g.lineTo(x, y + q); g.quadraticCurveTo(x, y, x + q, y);
  g.closePath();
}

export function skinColors(skin, t) {
  if (!skin.prism) return skin;
  const h = Math.floor(((t * 60) % 360) / 15) * 15;
  return { suit: skin.suit, glow: hslHex(h, 100, 66), visor: hslHex((h + 50) % 360, 100, 86) };
}
