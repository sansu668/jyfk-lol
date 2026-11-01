// Echo Cave - cave generation, geometry queries and echo lighting.
// The cave is a stream of columns (ceiling + floor height every DX px) plus
// obstacles, crystals and dust motes. Everything is seeded so that the Daily
// Cave is identical for every player on the same date.

export const W = 1280, H = 720;
export const DX = 20;
export const SEG = 380;
export const CPS = SEG / DX;
export const PX_PER_M = 25;
export const WAVE_SPEED = 1150;
export const WAVE_MAX = 780;
export const FADE = 1.7;
export const ENTRANCE = 1400;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash01(a, b) {
  let h = Math.imul((a ^ 0x9e3779b9) | 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function bright(lt, k, now, fadeMul) {
  const a = now - lt;
  if (a < 0 || k <= 0) return 0;
  return k * Math.exp(-a * FADE * fadeMul);
}

export function amb(x) {
  if (x >= ENTRANCE) return 0;
  const q = 1 - x / ENTRANCE;
  return 0.55 * q * Math.sqrt(q);
}

export function diffAt(x) { return clamp(x / 50000, 0, 1); }

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  let t = ((px - ax) * vx + (py - ay) * vy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return Math.sqrt(dx * dx + dy * dy);
}

function inTri(px, py, o) {
  const s1 = (o.bx - o.ax) * (py - o.ay) - (o.by - o.ay) * (px - o.ax);
  const s2 = (o.cx - o.bx) * (py - o.by) - (o.cy - o.by) * (px - o.bx);
  const s3 = (o.ax - o.cx) * (py - o.cy) - (o.ay - o.cy) * (px - o.cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

// Signed-ish distance from a point to an obstacle surface (negative = inside).
export function obsDist(o, x, y) {
  if (o.type === 'spike') {
    if (inTri(x, y, o)) return -1;
    return Math.min(segDist(x, y, o.ax, o.ay, o.cx, o.cy), segDist(x, y, o.cx, o.cy, o.bx, o.by), segDist(x, y, o.ax, o.ay, o.bx, o.by));
  }
  return Math.hypot(o.x - x, o.y - y) - o.r * 0.88;
}

export class Cave {
  constructor(seed, mod) {
    this.seed = seed >>> 0;
    this.mod = mod;
    this.rng = prng(this.seed ^ 0xa5a5a5a5);
    this.cols = [];
    this.base = 0;
    this.obs = [];
    this.crystals = [];
    this.motes = [];
    this.k = 0;
    this.crySeq = 0;
    this.cpA = this.makeCP(0, null);
    this.cpB = this.makeCP(1, this.cpA);
  }

  makeCP(k, prev) {
    if (k < 3) return { cy: 360, hg: 248 };
    const r = this.rng;
    const D = diffAt(k * SEG);
    let hg = lerp(212, 112, D) * (0.84 + 0.32 * r()) * this.mod.gap;
    if (k > 8 && r() < 0.1 + 0.12 * D) hg *= 0.8;
    hg = clamp(hg, 94, 250);
    const amp = lerp(70, 185, D);
    let cy = prev.cy + (r() * 2 - 1) * amp;
    const maxShift = Math.max(50, hg + prev.hg - 130);
    cy = clamp(cy, prev.cy - maxShift, prev.cy + maxShift);
    cy = clamp(cy, 46 + hg, H - 46 - hg);
    return { cy, hg };
  }

  jag(i, salt) {
    const L = Math.floor(i / 4), f = (i - L * 4) / 4, s = f * f * (3 - 2 * f);
    const a = hash01(this.seed ^ salt, L) * 2 - 1, b = hash01(this.seed ^ salt, L + 1) * 2 - 1;
    const fine = hash01(this.seed ^ (salt * 7 + 13), i) * 2 - 1;
    return (a + (b - a) * s) * 0.78 + fine * 0.22;
  }

  ensure(upToX) {
    let n = 0;
    while (this.k * SEG < upToX && n < 40) { this.genSegment(); n++; }
  }

  genSegment() {
    const k = this.k, x0 = k * SEG, D = diffAt(x0);
    const J = k < 3 ? 12 : lerp(12, 24, D);
    const A = this.cpA, B = this.cpB;
    for (let c = 0; c < CPS; c++) {
      const i = k * CPS + c;
      const s = c / CPS, e = s * s * (3 - 2 * s);
      const cy = lerp(A.cy, B.cy, e), hg = lerp(A.hg, B.hg, e);
      let t = cy - hg + this.jag(i, 0x51ed) * J;
      let b = cy + hg + this.jag(i, 0x7a3b) * J;
      t = Math.max(16, t); b = Math.min(H - 16, b);
      if (b - t < 160) { const m = (t + b) / 2; t = m - 80; b = m + 80; }
      this.cols.push({ x: i * DX, t, b, lt: -99, kt: 0, lb: -99, kb: 0 });
    }
    this.k++;
    if (k >= 3) this.placeObstacles(k, x0, D);
    this.placeCrystals(k, x0);
    this.placeMotes(x0);
    this.cpA = this.cpB;
    this.cpB = this.makeCP(this.k + 1, this.cpA);
  }

  top(x) {
    const f = x / DX - this.base, i = Math.floor(f), c = this.cols;
    if (i < 0) return c.length ? c[0].t : 0;
    if (i >= c.length - 1) return c.length ? c[c.length - 1].t : 0;
    const a = c[i], b = c[i + 1];
    return a.t + (b.t - a.t) * (f - i);
  }

  bot(x) {
    const f = x / DX - this.base, i = Math.floor(f), c = this.cols;
    if (i < 0) return c.length ? c[0].b : H;
    if (i >= c.length - 1) return c.length ? c[c.length - 1].b : H;
    const a = c[i], b = c[i + 1];
    return a.b + (b.b - a.b) * (f - i);
  }

  pickKind(k, D) {
    const m = (k * SEG) / PX_PER_M;
    const wts = [
      ['plain', Math.max(0.25, 1.1 - D)],
      ['tite', 0.55 + 0.4 * D],
      ['mite', 0.55 + 0.4 * D],
      ['zig', D > 0.12 ? 0.15 + 0.6 * D : 0],
      ['rock', k >= 6 ? 0.35 + 0.3 * D : 0],
      ['sleeper', m >= 180 ? (0.32 + 0.35 * D) * this.mod.sleep : 0],
    ];
    let tot = 0;
    for (const w of wts) tot += w[1];
    let r = this.rng() * tot;
    for (const w of wts) { r -= w[1]; if (r <= 0) return w[0]; }
    return 'plain';
  }

  placeObstacles(k, x0, D) {
    const pass = lerp(175, 128, D);
    const kind = this.pickKind(k, D);
    const tx = x0 + SEG * (0.3 + 0.4 * this.rng());
    if (kind === 'tite') this.addSpike(tx, true, pass, D, 0);
    else if (kind === 'mite') this.addSpike(tx, false, pass, D, 0);
    else if (kind === 'zig') {
      const first = this.rng() < 0.5;
      this.addSpike(x0 + SEG * 0.28, first, pass, D, 0.46);
      this.addSpike(x0 + SEG * 0.74, !first, pass, D, 0.46);
    } else if (kind === 'rock') this.addRock(tx, pass, D);
    else if (kind === 'sleeper') this.addSleeper(tx, pass);
  }

  addSpike(tx, up, pass, D, maxFrac) {
    const r = this.rng;
    const T = this.top(tx), B = this.bot(tx), gap = B - T;
    let len = gap * lerp(0.34, 0.56, D) * (0.85 + 0.25 * r());
    if (maxFrac) len = Math.min(len, gap * maxFrac);
    len = Math.min(len, gap - pass);
    const bw = 26 + r() * 26 + Math.max(0, len) * 0.12;
    const tipx = tx + (r() - 0.5) * 24;
    if (len < 40) return;
    if (up) {
      this.obs.push({ type: 'spike', up: true, x: tx, r: bw, ax: tx - bw, ay: this.top(tx - bw) - 8, bx: tx + bw, by: this.top(tx + bw) - 8, cx: tipx, cy: T + len, lt: -99, k: 0 });
    } else {
      this.obs.push({ type: 'spike', up: false, x: tx, r: bw, ax: tx - bw, ay: this.bot(tx - bw) + 8, bx: tx + bw, by: this.bot(tx + bw) + 8, cx: tipx, cy: B - len, lt: -99, k: 0 });
    }
  }

  addRock(tx, pass, D) {
    const r = this.rng;
    const T = this.top(tx), B = this.bot(tx), gap = B - T;
    const pb = Math.max(112, pass * 0.8);
    const rMax = Math.min(72, (gap - 2 * pb) / 2);
    if (rMax < 30) { this.addSpike(tx, r() < 0.5, pass, D, 0); return; }
    const rad = 30 + r() * (rMax - 30);
    const y = T + pb + rad + r() * Math.max(0, gap - 2 * pb - 2 * rad);
    const pts = [];
    for (let i = 0; i < 11; i++) pts.push(0.82 + r() * 0.26);
    this.obs.push({ type: 'rock', x: tx, y, r: rad, pts, rot: r() * 6.28, lt: -99, k: 0 });
  }

  addSleeper(tx, pass) {
    const T = this.top(tx), B = this.bot(tx);
    const y = T + 36;
    const ph = this.rng() * 6.28;
    if (B - (y + 26) < pass) return;
    this.obs.push({ type: 'sleeper', x: tx, y, topY: T, r: 24, lt: -99, k: 0, ph });
  }

  clearance(x, y) {
    let c = Math.min(y - this.top(x), this.bot(x) - y);
    for (const o of this.obs) {
      if (Math.abs(o.x - x) > 170) continue;
      const d = obsDist(o, x, y);
      if (d < c) c = d;
    }
    return c;
  }

  placeCrystals(k, x0) {
    if (k < 2) return;
    const r = this.rng;
    let n = r() < Math.min(0.95, 0.5 * this.mod.crys) ? 1 : 0;
    if (this.mod.crys > 1 && r() < 0.45) n++;
    for (let j = 0; j < n; j++) {
      for (let tries = 0; tries < 6; tries++) {
        const x = x0 + 30 + r() * (SEG - 60);
        const T = this.top(x), B = this.bot(x);
        const y = T + 42 + r() * Math.max(0, B - T - 84);
        if (this.clearance(x, y) >= 40) {
          this.crystals.push({ x, y, lt: -99, k: 0, ph: r() * 6.28, n: this.crySeq++ % 5, taken: false });
          break;
        }
      }
    }
  }

  placeMotes(x0) {
    const r = this.rng;
    for (let j = 0; j < 5; j++) {
      const x = x0 + r() * SEG;
      const T = this.top(x), B = this.bot(x);
      this.motes.push({ x, y: T + 10 + r() * Math.max(0, B - T - 20), lt: -99, k: 0, ph: r() * 6.28 });
    }
  }

  prune(limX) {
    let n = 0;
    while (n < this.cols.length - 2 && this.cols[n].x < limX) n++;
    if (n > 0) { this.cols.splice(0, n); this.base += n; }
    if (this.obs.length && this.obs[0].x < limX) this.obs = this.obs.filter(o => o.x > limX);
    if (this.crystals.length && (this.crystals[0].x < limX || this.crystals.some(c => c.taken))) this.crystals = this.crystals.filter(c => c.x > limX && !c.taken);
    if (this.motes.length && this.motes[0].x < limX) this.motes = this.motes.filter(m => m.x > limX);
  }

  // Distance along a ray until it meets rock (for the returning echo sounds).
  raycast(ox, oy, dx, dy, maxD) {
    const near = this.obs.filter(o => o.x > ox - 100 && o.x < ox + maxD + 100);
    for (let s = 24; s < maxD; s += 12) {
      const x = ox + dx * s, y = oy + dy * s;
      if (y <= this.top(x) || y >= this.bot(x)) return s;
      for (const o of near) if (obsDist(o, x, y) <= 0) return s;
    }
    return maxD;
  }

  // Light everything the wave front passes between radius rp and r.
  // Returns lists of newly lit sleepers and crystals (for sounds).
  light(e, rp, r, now, fadeMul, out) {
    const relight = (o, d, key, kkey) => {
      const s = 1 - 0.55 * d / WAVE_MAX;
      const cur = bright(o[key], o[kkey], now, fadeMul);
      o[key] = now; o[kkey] = Math.max(s, cur);
    };
    const c = this.cols;
    const i0 = Math.max(0, Math.floor((e.x - r) / DX) - this.base);
    const i1 = Math.min(c.length - 1, Math.ceil((e.x + r) / DX) - this.base);
    for (let i = i0; i <= i1; i++) {
      const col = c[i], dx = col.x - e.x;
      let d = Math.hypot(dx, col.t - e.y);
      if (d > rp && d <= r) relight(col, d, 'lt', 'kt');
      d = Math.hypot(dx, col.b - e.y);
      if (d > rp && d <= r) relight(col, d, 'lb', 'kb');
    }
    for (const o of this.obs) {
      if (Math.abs(o.x - e.x) > r + 100) continue;
      const d = Math.max(0, obsDist(o, e.x, e.y));
      if (d > rp && d <= r) { relight(o, d, 'lt', 'k'); if (o.type === 'sleeper' && out) out.sleepers.push(o); }
    }
    for (const cr of this.crystals) {
      if (cr.taken || Math.abs(cr.x - e.x) > r) continue;
      const d = Math.hypot(cr.x - e.x, cr.y - e.y);
      if (d > rp && d <= r) { relight(cr, d, 'lt', 'k'); if (out) out.crystals.push(cr); }
    }
    for (const m of this.motes) {
      if (Math.abs(m.x - e.x) > r) continue;
      const d = Math.hypot(m.x - e.x, m.y - e.y);
      if (d > rp && d <= r) relight(m, d, 'lt', 'k');
    }
  }
}
