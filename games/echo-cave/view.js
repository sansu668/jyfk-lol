// Echo Cave - drawing of the roost (menu), the dark cave, HUD and summary.
import { W, H, DX, WAVE_MAX, ENTRANCE, clamp, bright, amb } from './cave.js';
import { SKINS, DEAD_SKIN, skinCol, drawBat, drawSpike, drawRock, drawSleeper, drawHunter, drawCrystal, starPath, arrowBtn } from './art.js';
import { S, ACH } from './data.js';

export const BG = '#010206';
export const BAT_SX = 300;
export const STIR = 55;
export const COOLDOWN = 0.85;
export const BLIND_STEP = 2.5;
export const MAX_LIVES = 3;
export const CARD_E = { x: 650, y: 146, w: 520, h: 140 };
export const CARD_D = { x: 650, y: 304, w: 520, h: 170 };
export const SKIN_L = { x: 200, y: 300 }, SKIN_R = { x: 480, y: 300 };
export const ROOST_BAT = { x: 340, y: 168 };
export const TROPHY_Y = 520;
export const trophyX = i => 640 + (i - (ACH.length - 1) / 2) * 60;

export const equipped = () => SKINS.find(s => s.id === S.prof.skin && isUnlocked(s)) || SKINS[0];
export const isUnlocked = s => !s.need || !!S.prof.ach[s.need];
export const blindTime = now => Math.max(0, now - S.blindFrom);
export const multOf = bt => 1 + Math.min(3, Math.floor(bt / BLIND_STEP));

let SK = SKINS[0];
const col = a => skinCol(SK, a);

const ROOST = { top: [], bot: [] };
export function buildRoost() {
  ROOST.top = []; ROOST.bot = [];
  for (let x = -20; x <= W + 20; x += 20) {
    ROOST.top.push([x, 66 + 22 * Math.sin(x * 0.0105 + 0.6) + 12 * Math.sin(x * 0.029 + 2)]);
    ROOST.bot.push([x, 690 - 18 * Math.sin(x * 0.0088 + 1.3) - 9 * Math.sin(x * 0.033 + 0.4)]);
  }
}
const roostTopAt = x => 66 + 22 * Math.sin(x * 0.0105 + 0.6) + 12 * Math.sin(x * 0.029 + 2);

function txt(str, x, y, o) { S.api.text(str, x, y, o); }
function spaced(g, px, fn) { g.letterSpacing = px; fn(); g.letterSpacing = '0px'; }

function strokeLine(g, pts, b, side) {
  const sgn = side ? 1 : -1, edge = side ? H : 0;
  g.beginPath(); g.moveTo(pts[0][0], edge);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(pts[pts.length - 1][0], edge); g.closePath();
  g.fillStyle = col(b * 0.07); g.fill();
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = off => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + off) : g.moveTo(p[0], p[1] + off))); };
  path(0); g.lineWidth = 11; g.strokeStyle = col(b * 0.16); g.stroke();
  g.lineWidth = 2.4; g.strokeStyle = col(b); g.stroke();
  path(15 * sgn); g.lineWidth = 1.4; g.strokeStyle = col(b * 0.38); g.stroke();
  path(36 * sgn); g.lineWidth = 1; g.strokeStyle = col(b * 0.16); g.stroke();
  g.restore();
}

function glowcap(g, x, y, s, now) {
  const p = 0.7 + 0.3 * Math.sin(now * 2 + x);
  const gr = g.createRadialGradient(x, y - 8 * s, 0, x, y - 8 * s, 46 * s);
  gr.addColorStop(0, `rgba(120,255,214,${(0.28 * p).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(120,255,214,0)');
  g.fillStyle = gr; g.fillRect(x - 50 * s, y - 58 * s, 100 * s, 100 * s);
  g.strokeStyle = `rgba(150,255,220,${(0.75 * p).toFixed(3)})`; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x, y - 8 * s); g.stroke();
  g.beginPath(); g.ellipse(x, y - 9 * s, 9 * s, 5 * s, 0, Math.PI, 0); g.closePath();
  g.fillStyle = `rgba(150,255,220,${(0.5 * p).toFixed(3)})`; g.fill(); g.stroke();
}

export function drawRoost(g, now, ui) {
  SK = SKINS[S.skinView] && isUnlocked(SKINS[S.skinView]) ? SKINS[S.skinView] : equipped();
  if (!ui) SK = equipped();
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(560, 380, 40, 560, 380, 720);
  rg.addColorStop(0, col(0.08)); rg.addColorStop(1, col(0));
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  const pulse = 0.5 + 0.08 * Math.sin(now * 1.3);
  strokeLine(g, ROOST.top, pulse, 0);
  strokeLine(g, ROOST.bot, pulse, 1);
  // stalactites
  for (const [x, len] of [[340, 46], [760, 70], [980, 40], [1180, 64], [120, 54]]) {
    const ty = roostTopAt(x);
    const o = { ax: x - 26, ay: ty - 6, bx: x + 26, by: ty - 6, cx: x + 3, cy: ty + len };
    drawSpike(g, o, 0, pulse, col, BG);
  }
  for (const [x, s] of [[80, 1], [150, 0.7], [560, 0.9], [610, 0.6], [880, 1.1], [1060, 0.8], [1210, 1]]) glowcap(g, x, 690 - 18 * Math.sin(x * 0.0088 + 1.3) - 9 * Math.sin(x * 0.033 + 0.4) + 2, s, now);
  // soft periodic echo from the resting bat
  const age = now - S.roostPing;
  const ph = ui ? age : now % 2.6;
  if (ph >= 0 && ph < 1.4) {
    const r = ph * 520, a = 0.3 * (1 - ph / 1.4);
    g.beginPath(); g.arc(ROOST_BAT.x, ROOST_BAT.y, r, 0, Math.PI * 2);
    g.lineWidth = 2; g.strokeStyle = col(a); g.stroke();
  }
  if (S.phase === 'launch' && ui) {
    const t = S.phaseT;
    drawBat(g, ROOST_BAT.x + t * t * 2600, ROOST_BAT.y + t * 260, 1.6, now * 18, 1, SK, Math.PI * (1 - Math.min(1, t * 3)), 1);
  } else {
    const ty = roostTopAt(ROOST_BAT.x) + 46;
    g.strokeStyle = col(0.5); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(ROOST_BAT.x - 3, ty); g.lineTo(ROOST_BAT.x - 3, ROOST_BAT.y - 22); g.moveTo(ROOST_BAT.x + 3, ty); g.lineTo(ROOST_BAT.x + 3, ROOST_BAT.y - 22); g.stroke();
    const view = SKINS[S.skinView] || SKINS[0];
    drawBat(g, ROOST_BAT.x, ROOST_BAT.y, 1.7, now * 1.5, 0.25, ui ? view : SK, Math.PI + Math.sin(now * 1.2) * 0.06, ui && !isUnlocked(view) ? 0.4 : 1);
  }
  if (ui) drawRoostUI(g, now);
  if (S.phase === 'launch') {
    g.fillStyle = `rgba(1,2,6,${clamp(S.phaseT / 0.5, 0, 1).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }
}

function drawCard(g, r, on, title, lines, now) {
  const p = on ? 0.75 + 0.25 * Math.sin(now * 4) : 0;
  S.api.roundRect(r.x, r.y, r.w, r.h, 18, on ? col(0.09) : 'rgba(255,255,255,0.025)', on ? col(0.5 + 0.45 * p) : 'rgba(255,255,255,0.16)', on ? 3 : 2);
  if (on) {
    g.beginPath(); g.moveTo(r.x - 12, r.y + r.h / 2); g.lineTo(r.x - 30, r.y + r.h / 2 - 13); g.lineTo(r.x - 30, r.y + r.h / 2 + 13); g.closePath();
    g.fillStyle = col(0.9); g.fill();
  }
  spaced(g, '4px', () => txt(title, r.x + 32, r.y + 42, { size: 36, weight: 900, align: 'left', color: on ? '#f4f7ff' : 'rgba(225,232,255,0.7)' }));
  lines.forEach((ln, i) => txt(ln, r.x + 32, r.y + 84 + i * 30, { size: i === 2 ? 19 : 22, weight: 600, align: 'left', color: i === 2 ? 'rgba(200,210,240,0.55)' : 'rgba(215,225,250,0.85)', maxWidth: r.w - 50 }));
}

function drawRoostUI(g, now) {
  const P = S.prof;
  const v = SKINS[S.skinView] || SKINS[0];
  const un = isUnlocked(v);
  arrowBtn(g, SKIN_L.x, SKIN_L.y, -1, col);
  arrowBtn(g, SKIN_R.x, SKIN_R.y, 1, col);
  spaced(g, '3px', () => txt(v.name.toUpperCase(), 340, 300, { size: 34, weight: 900, color: un ? skinCol(v, 1) : 'rgba(200,205,225,0.55)' }));
  const need = ACH.find(a => a.id === v.need);
  txt(un ? 'Equipped' : `Locked: ${need ? need.desc : ''}`, 340, 342, { size: 21, weight: 600, color: un ? 'rgba(220,230,255,0.75)' : 'rgba(255,190,150,0.9)', maxWidth: 420 });
  txt(`Skins ${SKINS.filter(isUnlocked).length}/${SKINS.length}`, 340, 376, { size: 19, weight: 700, color: 'rgba(200,210,240,0.5)' });
  spaced(g, '3px', () => txt('CHOOSE A CAVE', 652, 122, { size: 20, weight: 800, align: 'left', color: 'rgba(210,220,250,0.6)' }));
  drawCard(g, CARD_E, S.sel === 0, 'ENDLESS', ['A brand-new cave every flight', `Best ${P.bestEndless}  ·  Deepest ${P.bestM} m`], now);
  const tb = P.daily.date === S.dailyKey ? P.daily.best : 0;
  drawCard(g, CARD_D, S.sel === 1, 'DAILY CAVE', [`${S.dailyKey}  ·  ${S.dailyMod.name}`, `Today's best ${tb}  ·  Streak ${S.streak} ${S.streak === 1 ? 'day' : 'days'}`, 'The same cave for every player today'], now);
  // trophies
  let got = 0;
  ACH.forEach((a, i) => {
    const x = trophyX(i), on = !!P.ach[a.id];
    if (on) got++;
    starPath(g, x, TROPHY_Y, 18);
    if (on) { g.fillStyle = col(0.9); g.fill(); g.lineWidth = 6; g.strokeStyle = col(0.18); g.stroke(); }
    else { g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.28)'; g.stroke(); }
    if (i === S.infoAch) { g.beginPath(); g.arc(x, TROPHY_Y, 26, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke(); }
  });
  txt(`Trophies ${got}/${ACH.length}`, 640, 562, { size: 22, weight: 800, color: 'rgba(225,232,255,0.85)' });
  let info;
  if (S.infoAch >= 0) {
    const a = ACH[S.infoAch];
    info = `${a.name}: ${a.desc}${P.ach[a.id] ? '  (earned)' : ''}`;
  } else {
    const nx = ACH.find(a => !P.ach[a.id]);
    const sk = nx && SKINS.find(s => s.need === nx.id);
    info = nx ? `Next: ${nx.name}. ${nx.desc}${sk ? ` (unlocks ${sk.name})` : ''}` : 'Every trophy earned. The cave knows your name.';
  }
  txt(info, 640, 594, { size: 21, weight: 600, color: col(0.9), maxWidth: 940 });
  const hint = S.api.isTouch ? 'Tap a cave to fly  ·  tap the arrows to change skin' : 'Space: fly  ·  ↑ ↓: choose cave  ·  ← →: skin  ·  or click';
  txt(hint, 640, 634, { size: 20, weight: 600, color: 'rgba(200,210,240,0.55)' });
}

/* ------------------------------------------------------------- the cave */
const NB = 6;
function wallPaths(cave, now, side, P) {
  const c = cave.cols, cam = S.cam, fm = S.mod.fade;
  const j0 = Math.max(0, Math.floor(cam / DX) - cave.base - 1);
  const j1 = Math.min(c.length - 1, Math.ceil((cam + W) / DX) - cave.base + 1);
  const vb = o => Math.max(side ? bright(o.lb, o.kb, now, fm) : bright(o.lt, o.kt, now, fm), amb(o.x));
  const sgn = side ? 1 : -1, edge = side ? H : 0;
  let runK = -1, pts = null;
  const flush = () => {
    if (pts && pts.length >= 4) {
      const k = runK;
      const cp = P.core[k], c1 = P.con1[k], c2 = P.con2[k], f = P.fill[k];
      cp.moveTo(pts[0], pts[1]); c1.moveTo(pts[0], pts[1] + 15 * sgn); c2.moveTo(pts[0], pts[1] + 36 * sgn);
      f.moveTo(pts[0], edge); f.lineTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        cp.lineTo(pts[i], pts[i + 1]); c1.lineTo(pts[i], pts[i + 1] + 15 * sgn); c2.lineTo(pts[i], pts[i + 1] + 36 * sgn); f.lineTo(pts[i], pts[i + 1]);
      }
      f.lineTo(pts[pts.length - 2], edge); f.closePath();
    }
    pts = null;
  };
  let va = j0 >= 0 && c[j0] ? vb(c[j0]) : 0;
  for (let j = j0; j < j1; j++) {
    const a = c[j], b = c[j + 1];
    const vbb = vb(b);
    const v = (va + vbb) * 0.5;
    va = vbb;
    const k = v > 0.025 ? Math.min(NB - 1, (v * NB) | 0) : -1;
    if (k !== runK) { flush(); runK = k; if (k >= 0) pts = [a.x - cam, side ? a.b : a.t]; }
    if (k >= 0) pts.push(b.x - cam, side ? b.b : b.t);
  }
  flush();
}

function drawWalls(g, now) {
  const cave = S.cave;
  if (!cave || cave.cols.length < 2) return;
  const P = { core: [], con1: [], con2: [], fill: [] };
  for (let k = 0; k < NB; k++) { P.core.push(new Path2D()); P.con1.push(new Path2D()); P.con2.push(new Path2D()); P.fill.push(new Path2D()); }
  wallPaths(cave, now, 0, P);
  wallPaths(cave, now, 1, P);
  for (let k = 0; k < NB; k++) { g.fillStyle = col(((k + 0.7) / NB) * 0.07); g.fill(P.fill[k]); }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (let k = 0; k < NB; k++) {
    const al = (k + 0.7) / NB;
    g.strokeStyle = col(al * 0.16); g.lineWidth = 11; g.stroke(P.core[k]);
    g.strokeStyle = col(al); g.lineWidth = 2.4; g.stroke(P.core[k]);
    g.strokeStyle = col(al * 0.38); g.lineWidth = 1.4; g.stroke(P.con1[k]);
    g.strokeStyle = col(al * 0.16); g.lineWidth = 1; g.stroke(P.con2[k]);
  }
  g.restore();
}

export function drawFly(g, now) {
  const cave = S.cave, cam = S.cam, fm = S.mod.fade, bat = S.bat;
  SK = equipped();
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  if (cam < ENTRANCE + 500) {
    const k = clamp(1 - cam / (ENTRANCE + 500), 0, 1);
    const mx = -cam - 120;
    const mg = g.createRadialGradient(mx, 360, 40, mx, 360, 1150);
    mg.addColorStop(0, `rgba(150,175,255,${(0.26 * k).toFixed(3)})`); mg.addColorStop(1, 'rgba(150,175,255,0)');
    g.fillStyle = mg; g.fillRect(0, 0, W, H);
  }
  const ag = g.createRadialGradient(BAT_SX, bat.y, 4, BAT_SX, bat.y, 160);
  ag.addColorStop(0, col(0.11)); ag.addColorStop(1, col(0));
  g.fillStyle = ag; g.fillRect(BAT_SX - 160, bat.y - 160, 320, 320);
  if (!cave) return;
  // dust motes
  for (const m of cave.motes) {
    const x = m.x - cam;
    if (x < -10 || x > W + 10) continue;
    const b = bright(m.lt, m.k, now, fm);
    if (b < 0.03) continue;
    g.fillStyle = col(b * 0.85);
    g.fillRect(x - 1.5, m.y + Math.sin(now * 0.8 + m.ph) * 6 - 1.5, 3, 3);
  }
  drawWalls(g, now);
  const stirring = S.noise >= STIR;
  for (const o of cave.obs) {
    const x = o.x - cam;
    if (x < -120 || x > W + 120) continue;
    const b = Math.max(bright(o.lt, o.k, now, fm), amb(o.x));
    if (o.type === 'spike') drawSpike(g, o, cam, b, col, BG);
    else if (o.type === 'rock') drawRock(g, o, cam, b, col, BG);
    else drawSleeper(g, o, cam, b, stirring, now);
  }
  for (const c of cave.crystals) {
    if (c.taken) continue;
    const x = c.x - cam;
    if (x < -20 || x > W + 20) continue;
    const b = bright(c.lt, c.k, now, fm * 0.6);
    const base = 0.14 + 0.08 * Math.sin(now * 2.4 + c.ph);
    drawCrystal(g, x, c.y, Math.max(base, b), b);
  }
  // echo rings
  for (const e of S.echoes) {
    if (e.r <= 0) continue;
    const q = e.r / WAVE_MAX;
    g.beginPath(); g.arc(e.x - cam, e.y, e.r, 0, Math.PI * 2);
    g.lineWidth = 2; g.strokeStyle = col(0.34 * (1 - q)); g.stroke();
    if (e.r > 30) { g.beginPath(); g.arc(e.x - cam, e.y, e.r - 18, 0, Math.PI * 2); g.lineWidth = 6; g.strokeStyle = col(0.07 * (1 - q)); g.stroke(); }
  }
  // the spot hunters heard
  for (const h of S.hunters) {
    if (h.st !== 'hunt' && h.st !== 'wake') continue;
    const x = h.tx - cam, a = 0.25 + 0.15 * Math.sin(now * 8);
    g.beginPath(); g.arc(x, h.ty, 16 + 4 * Math.sin(now * 8), 0, Math.PI * 2);
    g.lineWidth = 2; g.strokeStyle = `rgba(255,60,90,${a.toFixed(3)})`; g.stroke();
  }
  for (const h of S.hunters) drawHunter(g, h, cam, bright(h.lt, h.k, now, fm), now);
  // bat
  const age = now - S.lastEchoT;
  if (age >= 0 && age < 0.3) {
    for (let i = 0; i < 3; i++) {
      const r = 26 + i * 11 + age * 140;
      g.beginPath(); g.arc(BAT_SX, bat.y, r, -0.55, 0.55);
      g.lineWidth = 2.2; g.strokeStyle = col((1 - age / 0.3) * (0.8 - i * 0.2)); g.stroke();
    }
  }
  const flick = S.inv > 0 && S.phase === 'fly' ? (Math.floor(now * 14) % 2 ? 0.35 : 1) : 1;
  drawBat(g, BAT_SX, bat.y, 1, now * (15 + Math.abs(bat.vy) * 0.012), 1, SK, bat.rot + bat.vy * 0.0007, flick);
  if (S.phase === 'fly') {
    if (S.cd > 0) {
      g.beginPath(); g.arc(BAT_SX, bat.y, 36, -Math.PI / 2, -Math.PI / 2 + (1 - S.cd / COOLDOWN) * Math.PI * 2);
      g.lineWidth = 3; g.strokeStyle = col(0.5); g.stroke();
    } else {
      g.beginPath(); g.arc(BAT_SX, bat.y, 36, 0, Math.PI * 2);
      g.lineWidth = 1.5; g.strokeStyle = col(0.16 + 0.08 * Math.sin(now * 5)); g.stroke();
    }
    if (S.proxK > 0) {
      const c = S.proxSide < 0 ? -Math.PI / 2 : Math.PI / 2;
      g.beginPath(); g.arc(BAT_SX, bat.y, 30, c - 0.9, c + 0.9);
      g.lineWidth = 3.5; g.strokeStyle = `rgba(255,130,90,${(S.proxK * 0.85).toFixed(3)})`; g.stroke();
    }
  }
  const vg = g.createRadialGradient(W / 2, H / 2, 320, W / 2, H / 2, 820);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

export function drawHud(g, now) {
  const api = S.api;
  for (let i = 0; i < MAX_LIVES; i++) drawBat(g, 44 + i * 52, 36, 0.5, 0.6, 1, i < S.lives ? SK : DEAD_SKIN, 0, i < S.lives ? 1 : 0.4);
  const nx = 24, ny = 70, nw = 210;
  const hunted = S.hunters.some(h => h.st === 'hunt' || h.st === 'wake');
  txt('NOISE', nx, ny, { size: 17, weight: 800, align: 'left', color: 'rgba(220,230,255,0.7)' });
  api.roundRect(nx, ny + 13, nw, 12, 6, 'rgba(255,255,255,0.09)');
  const nc = S.noise >= 85 ? '#ff4d6d' : S.noise >= STIR ? '#ffb347' : col(0.85);
  if (S.noise > 1) api.roundRect(nx, ny + 13, Math.max(12, nw * S.noise / 100), 12, 6, nc);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(nx + nw * STIR / 100 - 1, ny + 10, 2, 18);
  const label = hunted ? 'HUNTED' : S.noise >= STIR ? 'STIRRING' : 'CALM';
  txt(label, nx + nw + 14, ny + 19, { size: 18, weight: 900, align: 'left', color: hunted ? '#ff4d6d' : S.noise >= STIR ? '#ffb347' : col(0.85) });
  txt(String(Math.floor(S.points)), W / 2, 40, { size: 46, weight: 900, color: '#f2f6ff', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 6 });
  txt(`${Math.floor(S.meters)} m`, W / 2, 80, { size: 21, weight: 700, color: 'rgba(210,222,255,0.7)' });
  const bt = blindTime(now), m = multOf(bt);
  if (S.phase === 'fly' && S.passedEntrance) {
    const x = W / 2 + 120;
    txt(`BLIND ×${m}`, x, 36, { size: 26, weight: 900, align: 'left', color: m > 1 ? col(0.7 + 0.3 * Math.sin(now * 6)) : 'rgba(210,222,255,0.45)' });
    if (m < 4) {
      api.roundRect(x, 56, 110, 6, 3, 'rgba(255,255,255,0.08)');
      api.roundRect(x, 56, 110 * ((bt % BLIND_STEP) / BLIND_STEP), 6, 3, col(0.6));
    }
  }
  const ml = S.mode === 'daily' ? `DAILY CAVE · ${S.dailyKey} · ${S.dailyMod.name}` : 'ENDLESS';
  txt(ml, 24, H - 22, { size: 18, weight: 700, align: 'left', color: 'rgba(200,210,240,0.45)' });
  if (S.phase === 'fly' && S.phaseT < 2.8) {
    const a = Math.min(1, S.phaseT / 0.4) * clamp((2.8 - S.phaseT) / 0.6, 0, 1);
    spaced(g, '8px', () => txt(S.mode === 'daily' ? 'DAILY CAVE' : 'ENDLESS', W / 2, 210, { size: 44, weight: 900, color: col(a), alpha: 1 }));
    txt(S.mode === 'daily' ? `${S.dailyKey} · ${S.dailyMod.name}` : 'Keep quiet. Keep flying.', W / 2, 256, { size: 23, weight: 600, color: `rgba(220,230,255,${(0.8 * a).toFixed(3)})` });
  }
  if (S.toasts.length) {
    const t = S.toasts[0];
    const a = Math.min(1, t.t / 0.25) * clamp((3.2 - t.t) / 0.4, 0, 1);
    g.save(); g.globalAlpha = a;
    api.roundRect(W / 2 - 290, 108, 580, 70, 16, 'rgba(8,12,28,0.88)', col(0.75), 2);
    starPath(g, W / 2 - 250, 143, 16); g.fillStyle = col(0.95); g.fill();
    txt(t.a, W / 2 - 220, 130, { size: 24, weight: 900, align: 'left', color: '#f4f7ff', maxWidth: 480 });
    txt(t.b, W / 2 - 220, 159, { size: 19, weight: 600, align: 'left', color: col(0.9), maxWidth: 480 });
    g.restore();
  }
  if (S.hintT > 0 && S.hintTxt) {
    const a = clamp(S.hintT / 0.5, 0, 1);
    g.save(); g.globalAlpha = a;
    g.font = '700 25px system-ui, sans-serif';
    const w = Math.min(1100, g.measureText(S.hintTxt).width + 48);
    api.roundRect(W / 2 - w / 2, 622, w, 50, 25, 'rgba(6,10,24,0.8)', col(0.35), 1.5);
    txt(S.hintTxt, W / 2, 648, { size: 25, weight: 700, color: '#e8eeff', maxWidth: 1060 });
    g.restore();
  }
  if (S.phase === 'fly' && S.phaseT < 0.6) {
    g.fillStyle = `rgba(1,2,6,${(1 - S.phaseT / 0.6).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }
}

export function drawSummary(g) {
  const lines = [`${Math.floor(S.meters)} m  ·  ${S.crystalsRun} ${S.crystalsRun === 1 ? 'crystal' : 'crystals'}  ·  longest blind flight ${S.maxBlind.toFixed(1)} s`];
  if (S.mode === 'daily') lines.push(`Daily Cave ${S.dailyKey}  ·  today's best ${S.prof.daily.best}${S.newDailyBest ? '  (new!)' : ''}`);
  lines.forEach((l, i) => txt(l, W / 2, 70 + i * 42, { size: i ? 26 : 30, weight: 800, color: i ? col(1) : '#ffffff', maxWidth: 1180 }));
  const news = S.runNew.map(id => {
    const a = ACH.find(x => x.id === id), sk = SKINS.find(s => s.need === id);
    return `New trophy: ${a.name}${sk ? `  ·  ${sk.name} skin unlocked` : ''}`;
  });
  if (!news.length) {
    const nx = ACH.find(a => !S.prof.ach[a.id]);
    if (nx) news.push(`Next trophy: ${nx.name}. ${nx.desc}`);
  }
  news.slice(0, 3).forEach((l, i) => txt(l, W / 2, 600 + i * 38, { size: 26, weight: 800, color: '#ffe49a', maxWidth: 1180 }));
}
