// Tideline: hold to dive, let go to rise, and slip through kelp gates that ride the tide.
import { createGame } from './kit/jy-kit.js';
import { W, H, TAU, DIVER_X, DIVER_R, SURF_BASE, SEABED, GATE_W, PX_PER_M, READY_Y, SKINS, ZONES, clamp, rgba, glow, rr, skinColors } from './util.js';
import { drawWorld, drawSurfaceLine, drawSeabed, drawGate, drawPearl, drawDiver, drawBubble, drawLock, drawArrowBtn, drawMarker } from './art.js';
import { prof, day, loadProfile, saveProfile, isUnlocked, unlockedCount, reqText, reqRatio, nextLocked, syncDay, streakNow, touchStreak, bankDive } from './profile.js';

const ARROW_L = { x: 128, y: 935 }, ARROW_R = { x: 592, y: 935 };
const TITLE_Y = 912;
const TIPS = [
  'When the waterline drops, every gap drops with it.',
  'Let go a little early. You keep sinking for a moment.',
  'The glowing pods mark the edges of each gap.',
  'Fast tide? Aim where the gap will be, not where it is.',
  'Reach the daily goal for bonus pearls.',
  'Gold pearls are worth 5. Pearls unlock new divers.',
  'Listen for the low bell: it rings when the tide turns.',
];

let phase, diver, gates, bubbles, banners, tide, off, surf, tideDir, tideDirT;
let dist, speed, runPearls, nextMile, deadT, finalized, result, viewSkin, zone, goalShown, recordShown, lastGateC, bubbleT;
let lastResult = null;
let vt = 0;

function diffAt(m) {
  // Difficulty keeps climbing until about 1000 m (roughly two minutes of diving).
  return {
    speed: 250 + Math.min(170, m * 0.17),
    gap: Math.max(205, 340 - m * 0.135),
    spacing: Math.max(400, 560 - m * 0.16),
    A: Math.min(170, 50 + m * 0.12),
    P: Math.max(4.4, 8.5 - m * 0.0041),
    h2: clamp((m - 300) / 600, 0, 1) * 0.32,
  };
}
function tideOffAt(ph) { return -tide.A * (Math.sin(ph) + tide.h2 * Math.sin(2.13 * ph + 1.1)) / (1 + tide.h2); }
function meters() { return Math.floor(dist / PX_PER_M); }
function zoneAt(m) { let z = 0; for (let i = 0; i < ZONES.length; i++) if (m >= ZONES[i].from) z = i; return z; }
function banner(text, color, life = 2.2, size = 44) { banners.push({ text, color, t: 0, life, size }); if (banners.length > 3) banners.shift(); }

function spawnGate(api, x) {
  const d = diffAt(meters() + (x - DIVER_X) / PX_PER_M);
  const gap = d.gap * api.randRange(0.96, 1.06);
  const aPlan = Math.min(175, d.A + 25);
  const lo = SURF_BASE + 80 + gap / 2;
  const hi = Math.max(lo, SEABED - 50 - aPlan - gap / 2);
  const T = d.spacing / d.speed;
  const step = clamp(Math.min(160 + meters() * 0.06, 420 * (T - 0.25) - d.A * (TAU / d.P) * 0.7 * T), 70, 240);
  let c = lastGateC === null ? (lo + hi) / 2 : lastGateC + api.randRange(-step, step);
  if (lastGateC !== null && Math.abs(c - lastGateC) < 40) c += c < (lo + hi) / 2 ? 60 : -60;
  c = clamp(c, lo, hi);
  const pearl = api.chance(0.72) ? { dy: api.randRange(-0.24, 0.24) * gap, gold: api.chance(0.07), got: false } : null;
  gates.push({ x, c, gap, passed: false, pearl, seed: api.rand() * 100, z: zoneAt(meters() + (x - DIVER_X) / PX_PER_M) });
  lastGateC = c;
}

function cycleSkin(api, dir) {
  viewSkin = (viewSkin + dir + SKINS.length) % SKINS.length;
  if (isUnlocked(viewSkin)) { prof.skin = viewSkin; saveProfile(api); }
  api.sfx('select');
}

function begin(api) {
  if (!isUnlocked(viewSkin)) viewSkin = prof.skin;
  phase = 'dive';
  speed = 200;
  touchStreak(api);
  spawnGate(api, W + 160);
  api.noise(0.25, 0.12, 0, 1400);
  if (prof.runs === 0) banner('Watch the waterline: the gaps follow it', '#9ff6ff', 3.6, 32);
}

function finalize(api) {
  if (finalized || phase === 'ready') return;
  finalized = true;
  result = bankDive(api, meters(), runPearls);
  lastResult = result;
}

function die(api) {
  phase = 'dead';
  deadT = 0;
  diver.vy = -60;
  const c = skinColors(SKINS[prof.skin], vt).glow;
  api.shake(16, 0.4);
  api.flash('#ff5fa8', 0.2);
  api.sfx('hit');
  api.vibrate(80);
  api.burst(diver.x, diver.y, { count: 30, color: ['#ff7ad9', '#ffd0f4', c], speed: 380, life: 0.8, size: 7 });
  finalize(api);
  if (result && result.pearls > 0) api.floatText(diver.x + 90, diver.y - 70, `+${result.pearls} pearls`, '#ffe08a', 44);
  if (result && result.newSkins.length) banner(`New diver: ${SKINS[result.newSkins[result.newSkins.length - 1]].name}!`, '#ff9fe0', 2, 44);
  if (result && result.goalReward) banner(`Daily goal  +${result.goalReward} pearls`, '#5dffb0', 2, 40);
  api.after(0.85, a => { a.sfx('lose'); a.gameOver(); });
}

function helmet() {
  const ca = Math.cos(diver.tilt), sa = Math.sin(diver.tilt);
  return [diver.x + ca * 26 + sa * 8, diver.y + sa * 26 - ca * 8];
}
function addBubble(api, x, y, big) {
  if (bubbles.length >= 100) return;
  bubbles.push({ x, y, r: api.randRange(3, big ? 9 : 6), vy: api.randRange(110, 190), ph: api.rand() * 6 });
}
function updateReady(dt, api) {
  diver.y += (READY_Y + Math.sin(vt * 2.2) * 9 - diver.y) * Math.min(1, 6 * dt);
  diver.tilt = Math.sin(vt * 1.1) * 0.08;
  diver.fin += dt * 5;
  bubbleT -= dt;
  if (bubbleT <= 0) { const [hx, hy] = helmet(); addBubble(api, hx, hy, false); bubbleT = 0.45; }
  const p = api.pointer;
  if (p.pressed) {
    const x = p.x, y = p.y;
    if (Math.hypot(x - ARROW_L.x, y - ARROW_L.y) < 72) cycleSkin(api, -1);
    else if (Math.hypot(x - ARROW_R.x, y - ARROW_R.y) < 72) cycleSkin(api, 1);
    else { begin(api); return; }
  }
  if (api.input.pressed('left')) cycleSkin(api, -1);
  if (api.input.pressed('right')) cycleSkin(api, 1);
  if (api.input.pressed('dive')) begin(api);
}

function updateDive(dt, api) {
  const d = diffAt(meters());
  const p = api.pointer;
  const hold = p.down || api.input.down('dive');
  if (p.pressed || api.input.pressed('dive')) api.tone(190, 0.1, 'sine', 0.06, -50);
  diver.vy += (hold ? 1650 : -1250) * dt;
  diver.vy -= diver.vy * Math.min(1, 2.6 * dt);
  diver.vy = clamp(diver.vy, -600, 640);
  diver.y += diver.vy * dt;
  const top = surf + 24, floor = SEABED - 34;
  if (diver.y < top) { diver.y = top; if (diver.vy < 0) diver.vy = 0; }
  if (diver.y > floor) {
    if (diver.vy > 260) api.burst(diver.x, SEABED - 6, { count: 10, color: '#7aa6c4', speed: 160, life: 0.5, spread: Math.PI, angle: -Math.PI / 2 });
    diver.y = floor;
    if (diver.vy > 0) diver.vy = 0;
  }
  diver.tilt += (clamp(diver.vy / 650, -1, 1) * 0.55 - diver.tilt) * Math.min(1, 10 * dt);
  diver.fin += dt * (hold ? 17 : 7);

  speed += clamp(d.speed - speed, -60 * dt, 60 * dt);
  const dx = speed * dt;
  dist += dx;
  api.score = meters();
  for (const gt of gates) gt.x -= dx;
  while (gates.length && gates[0].x + GATE_W < -80) gates.shift();
  while (gates[gates.length - 1].x < W + 420) spawnGate(api, gates[gates.length - 1].x + d.spacing * api.randRange(0.92, 1.08));

  for (const gt of gates) {
    const c = gt.c + off;
    if (gt.pearl && !gt.pearl.got) {
      const px = gt.x + GATE_W / 2, py = c + gt.pearl.dy;
      if (api.util.dist2(px, py, diver.x, diver.y) < (DIVER_R + 18) * (DIVER_R + 18)) {
        gt.pearl.got = true;
        const v = gt.pearl.gold ? 5 : 1;
        runPearls += v;
        api.floatText(px, py - 44, gt.pearl.gold ? '+5' : '+1', gt.pearl.gold ? '#ffd45e' : '#dff1ff', gt.pearl.gold ? 46 : 36);
        api.sfx(gt.pearl.gold ? 'powerup' : 'coin');
        api.burst(px, py, { count: gt.pearl.gold ? 24 : 12, color: gt.pearl.gold ? ['#ffd45e', '#fff2c0'] : ['#ffffff', '#bfe3ff'], speed: 260, life: 0.5, size: 5 });
      }
    }
    if (gt.x > diver.x + DIVER_R + 30 || gt.x + GATE_W < diver.x - DIVER_R - 4) {
      if (!gt.passed && gt.x + GATE_W < diver.x - DIVER_R) { gt.passed = true; api.tone(620 + (gt.z * 90), 0.09, 'triangle', 0.07); }
      continue;
    }
    const top2 = c - gt.gap / 2, bot2 = c + gt.gap / 2;
    const cr = api.util.circleRect;
    const ca = Math.cos(diver.tilt), sa = Math.sin(diver.tilt);
    const hx = diver.x + ca * 29 + sa * 3, hy = diver.y + sa * 29 - ca * 3;
    const hit = (x, y, r) => cr(x, y, r, gt.x + 12, top2 - 3000, GATE_W - 24, 3000) || cr(x, y, r, gt.x + 12, bot2, GATE_W - 24, 3000);
    if (hit(diver.x, diver.y, DIVER_R - 2) || hit(hx, hy, 13)) {
      die(api);
      return;
    }
  }

  const m = meters();
  if (m >= nextMile) {
    banner(`${nextMile} m`, '#eaffff', 1.6, 64);
    api.sfx('combo');
    nextMile += 100;
  }
  const z = zoneAt(m);
  if (z !== zone) { zone = z; banner(`Entering ${ZONES[z].name}`, ZONES[z].glow, 2.6, 40); api.sfx('win'); }
  if (!goalShown && !prof.daily.goal && m >= day.goal) { goalShown = true; banner('Daily goal reached!', '#5dffb0', 2.4, 44); api.sfx('powerup'); }
  if (!recordShown && prof.far > 0 && m > prof.far) { recordShown = true; banner('New record!', '#ffd45e', 2.4, 52); api.sfx('win'); }

  bubbleT -= dt;
  if (bubbleT <= 0) {
    const [hx, hy] = helmet();
    addBubble(api, hx, hy, !hold);
    bubbleT = hold ? 0.24 : 0.1;
  }
}

function updateDead(dt, api) {
  deadT += dt;
  speed *= Math.max(0, 1 - 3 * dt);
  for (const gt of gates) gt.x -= speed * dt;
  diver.vy += (-260 - diver.vy) * Math.min(1, 2 * dt);
  diver.y = Math.max(surf + 24, diver.y + diver.vy * dt);
  diver.tilt += dt * 4;
  bubbleT -= dt;
  if (bubbleT <= 0 && deadT < 0.7) { const [hx, hy] = helmet(); addBubble(api, hx, hy, true); bubbleT = 0.05; }
}

function updateBubbles(dt) {
  for (const b of bubbles) {
    b.x -= speed * dt;
    b.y -= b.vy * dt;
    b.x += Math.sin(vt * 3 + b.ph) * 22 * dt;
  }
  bubbles = bubbles.filter(b => b.y > surf + 6 && b.x > -20);
  for (const b of banners) b.t += dt;
  banners = banners.filter(b => b.t < b.life);
}
const TXT = { stroke: 'rgba(2,10,26,.82)', strokeWidth: 8 };
function say(api, s, x, y, size, color, o = {}) { api.text(s, x, y, { size, color, weight: o.weight || 800, ...TXT, ...o }); }

function drawMarkers(g, api) {
  const list = [];
  if (prof.far >= 20) list.push([prof.far, '#ffd45e', `BEST ${prof.far} m`]);
  if (!prof.daily.goal) list.push([day.goal, '#5dffb0', `GOAL ${day.goal} m`]);
  if (prof.daily.best >= 20) list.push([prof.daily.best, '#7fe8ff', `TODAY ${prof.daily.best} m`]);
  const used = [];
  for (const [m, col, label] of list) {
    if (used.some(u => Math.abs(u - m) < 15)) continue;
    used.push(m);
    const x = DIVER_X + (m * PX_PER_M - dist);
    if (x < -60 || x > W + 60) continue;
    drawMarker(g, x, surf, SEABED, col, label, api);
  }
  // seabed distance posts every 100 m
  const first = Math.max(100, Math.ceil((dist - DIVER_X - 60) / PX_PER_M / 100) * 100);
  for (let mm = first; mm < first + 400; mm += 100) {
    const x = DIVER_X + (mm * PX_PER_M - dist);
    if (x > W + 60) break;
    g.strokeStyle = '#2a4a66'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x, SEABED + 6); g.lineTo(x, SEABED - 60); g.stroke();
    glow(g, x, SEABED - 66, 26, '#9ff6ff', 0.8);
    say(api, `${mm} m`, x, SEABED - 100, 26, '#cffcff');
  }
}

function drawTideGauge(g, api) {
  const x = 26, top = SURF_BASE - 180, bot = SURF_BASE + 180;
  g.strokeStyle = 'rgba(160,240,255,0.28)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
  for (let y = top; y <= bot + 1; y += 36) {
    const w = Math.abs(y - SURF_BASE) < 2 ? 16 : 8;
    g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.stroke();
  }
  const rate = tideOffAt(tide.ph + 0.02) - off;
  const a = clamp(Math.abs(rate) / (tide.A * 0.02 * TAU / 4 + 0.001), 0.25, 1);
  const y = clamp(surf, top, bot);
  glow(g, x, y, 26, '#7ff6ff', 0.9);
  g.fillStyle = '#eaffff';
  g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 20, y - 9); g.lineTo(x + 20, y + 9); g.closePath(); g.fill();
  const dir = rate < 0 ? -1 : 1;
  g.globalAlpha = a;
  g.fillStyle = dir < 0 ? '#7ff6ff' : '#ff9fe0';
  const ay = y + dir * 30;
  g.beginPath(); g.moveTo(x - 10, ay - dir * 6); g.lineTo(x + 10, ay - dir * 6); g.lineTo(x, ay + dir * 8); g.closePath(); g.fill();
  g.globalAlpha = 1;
}

function drawHud(g, api) {
  say(api, `${meters()} m`, W / 2, 64, 60, '#f0ffff', { weight: 900, strokeWidth: 10 });
  drawPearl(g, 48, 64, false, vt, 15);
  say(api, String(runPearls), 76, 66, 40, '#e6f3ff', { align: 'left' });
  drawTideGauge(g, api);
  banners.forEach((b, i) => {
    const k = b.t / b.life;
    const a = k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1;
    say(api, b.text, W / 2, 210 + i * 66 - k * 16, b.size, b.color, { alpha: clamp(a, 0, 1), weight: 900, maxWidth: 680 });
  });
}

function drawReady(g, api) {
  const sk = SKINS[viewSkin];
  const col = skinColors(sk, vt).glow;
  const un = isUnlocked(viewSkin);
  glow(g, W / 2, 398, 230, '#46f0ff', 0.18 + 0.1 * Math.sin(vt * 4));
  say(api, 'Hold to dive', W / 2, 398, Math.round(72 + 3 * Math.sin(vt * 4)), '#ffffff', { weight: 900, strokeWidth: 12 });
  say(api, 'Let go to float up. The gaps ride the tide.', W / 2, 462, 29, '#a6ecff', { maxWidth: 680 });
  if (lastResult) say(api, `Last dive ${lastResult.meters} m  ·  +${lastResult.pearls} pearls`, W / 2, 520, 28, '#ffe08a');
  else say(api, 'Space, mouse button or touch', W / 2, 520, 24, '#8fcde0');
  // hold / let go hint
  const bob = (vt * 1.4) % 1;
  g.fillStyle = '#7ff6ff';
  for (const [hx, dirY, label, c] of [[430, 1, 'hold', '#7ff6ff'], [570, -1, 'let go', '#ff9fe0']]) {
    const y = READY_Y - 10 + dirY * (bob * 26 - 13);
    g.fillStyle = c;
    g.beginPath(); g.moveTo(hx - 18, y - dirY * 14); g.lineTo(hx + 18, y - dirY * 14); g.lineTo(hx, y + dirY * 14); g.closePath(); g.fill();
    glow(g, hx, y, 30, c, 0.5);
    say(api, label, hx, READY_Y + 44, 26, c);
  }
  // diver picker
  rr(g, 64, 850, 592, 178, 36);
  g.fillStyle = 'rgba(3,18,38,0.82)'; g.fill();
  g.strokeStyle = rgba(col, 0.55); g.lineWidth = 3; g.stroke();
  drawArrowBtn(g, ARROW_L.x, ARROW_L.y, -1, col);
  drawArrowBtn(g, ARROW_R.x, ARROW_R.y, 1, col);
  say(api, sk.name, W / 2, 898, 38, un ? col : '#8aa3b8', { weight: 900, maxWidth: 360 });
  if (un) {
    const isNew = lastResult && lastResult.newSkins.includes(viewSkin);
    say(api, isNew ? 'New diver unlocked!' : 'Equipped', W / 2, 946, 26, isNew ? '#ffe08a' : '#bdf6ff');
  } else {
    drawLock(g, W / 2 - 150, 940, 0.9, '#8aa3b8');
    say(api, reqText(viewSkin), W / 2 + 14, 944, 22, '#c9dbe8', { maxWidth: 300 });
    rr(g, W / 2 - 130, 966, 260, 10, 5); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill();
    rr(g, W / 2 - 130, 966, 260 * reqRatio(viewSkin), 10, 5); g.fillStyle = '#ffd45e'; g.fill();
  }
  for (let i = 0; i < SKINS.length; i++) {
    const dx = W / 2 + (i - (SKINS.length - 1) / 2) * 28;
    g.beginPath(); g.arc(dx, 1004, i === viewSkin ? 7 : 5, 0, TAU);
    if (isUnlocked(i)) { g.fillStyle = i === viewSkin ? '#ffffff' : 'rgba(200,240,255,0.6)'; g.fill(); }
    else { g.strokeStyle = 'rgba(200,240,255,0.5)'; g.lineWidth = 2; g.stroke(); }
  }
  say(api, `Today's best ${prof.daily.best} m   ·   Daily goal ${day.goal} m${prof.daily.goal ? ' (done)' : ''}`, W / 2, 1068, 25, '#c9f6ff', { maxWidth: 690 });
  say(api, `Day streak ${streakNow()}   ·   ${prof.pearls} pearls banked`, W / 2, 1106, 25, '#ffe08a', { maxWidth: 690 });
}
function drawProgress(g, api, y) {
  const i = nextLocked();
  if (i < 0) { say(api, 'Every diver unlocked!', W / 2, y, 36, '#fff6d6', { weight: 900 }); return; }
  say(api, `Next diver: ${SKINS[i].name}`, W / 2, y, 36, '#ffffff', { weight: 900 });
  say(api, reqText(i), W / 2, y + 44, 28, '#f2fbff', { maxWidth: 640 });
  rr(g, W / 2 - 200, y + 70, 400, 14, 7); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
  rr(g, W / 2 - 200, y + 70, 400 * reqRatio(i), 14, 7); g.fillStyle = '#ffd45e'; g.fill();
}

function drawTitleInfo(g, api) {
  say(api, `${prof.pearls} pearls  ·  ${unlockedCount()}/${SKINS.length} divers`, W / 2, 1040, 38, '#fff6d6', { weight: 900 });
  say(api, `Today's best ${prof.daily.best} m  ·  Daily goal ${day.goal} m`, W / 2, 1094, 32, '#ffffff', { maxWidth: 680 });
}

function drawOverInfo(g, api) {
  // The kit's results overlay dims the canvas, so everything here is drawn large and near-white.
  const r = result;
  if (r) {
    const label = r.pearls > 0 ? `+${r.pearls} pearl${r.pearls === 1 ? '' : 's'}` : 'No pearls this dive';
    const size = r.pearls > 0 ? 66 : 50;
    g.font = `900 ${size}px system-ui, sans-serif`;
    const tw = g.measureText(label).width;
    drawPearl(g, W / 2 - tw / 2 - 12, 186, false, vt, 22);
    say(api, label, W / 2 + 22, 188, size, '#fff6d6', { weight: 900 });
    say(api, `${r.total} banked  ·  today's best ${prof.daily.best} m`, W / 2, 262, 34, '#ffffff', { maxWidth: 680 });
    let y = 915;
    if (r.newSkins.length) { say(api, `New diver: ${SKINS[r.newSkins[r.newSkins.length - 1]].name}!`, W / 2, y, 44, '#ffe9f8', { weight: 900 }); y += 58; }
    if (r.goalReward) { say(api, `Daily goal reached  +${r.goalReward} pearls`, W / 2, y, 36, '#e8fff2', { weight: 900 }); y += 52; }
    drawProgress(g, api, Math.max(y + 10, 1000));
  } else {
    drawProgress(g, api, 960);
  }
  say(api, TIPS[prof.runs % TIPS.length], W / 2, 1204, 28, '#f2fbff', { maxWidth: 690 });
}

createGame({
  id: 'tideline',
  title: 'Tideline',
  howTo: 'Hold to dive, let go to rise. Slip through the kelp gaps as they rise and fall with the tide.',
  overTitle: 'Tangled!',
  orientation: 'portrait',
  width: W,
  height: H,
  background: '#020a18',
  letterbox: '#020814',
  accent: '#46f0ff',
  hud: false,
  actions: { dive: ['Space', 'ArrowDown', 'KeyS', 'Enter', 'NumpadEnter'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] },

  init(api) {
    loadProfile(api);
  },

  reset(api) {
    syncDay();
    phase = 'ready';
    diver = { x: DIVER_X, y: READY_Y, vy: 0, tilt: 0, fin: 0 };
    gates = [];
    bubbles = [];
    banners = [];
    tide = { ph: api.rand() * TAU, A: 50, P: 8.5, h2: 0 };
    off = tideOffAt(tide.ph);
    surf = SURF_BASE + off;
    tideDir = 0;
    tideDirT = 0;
    dist = 0;
    speed = 0;
    runPearls = 0;
    nextMile = 100;
    deadT = 0;
    finalized = false;
    result = null;
    viewSkin = prof.skin;
    zone = 0;
    goalShown = false;
    recordShown = false;
    lastGateC = null;
    bubbleT = 0;
  },

  update(dt, api) {
    vt += dt;
    if (phase === 'dive') {
      const d = diffAt(meters());
      tide.A += clamp(d.A - tide.A, -8 * dt, 8 * dt);
      tide.P = d.P;
      tide.h2 = d.h2;
    }
    const prev = off;
    tide.ph += dt * TAU / tide.P;
    off = tideOffAt(tide.ph);
    surf = SURF_BASE + off;
    const dir = off < prev ? -1 : 1;
    tideDirT += dt;
    if (dir !== tideDir) {
      if (phase === 'dive' && tideDirT > 0.8) { api.tone(147, 0.6, 'sine', 0.1); api.tone(220, 0.4, 'triangle', 0.04, 0, 0.06); }
      tideDir = dir;
      tideDirT = 0;
    }
    if (phase === 'ready') updateReady(dt, api);
    else if (phase === 'dive') updateDive(dt, api);
    else updateDead(dt, api);
    updateBubbles(dt);
  },
  render(g, api) {
    const st = api.state;
    if (st === 'title' || st === 'over') {
      vt += 1 / 60;
      tide.ph += (1 / 60) * TAU / tide.P;
      off = tideOffAt(tide.ph);
      surf = SURF_BASE + off;
      if (phase === 'ready') diver.y = TITLE_Y + Math.sin(vt * 2.2) * 9;
    }
    if (st === 'over' && !finalized) finalize(api);
    const scroll = dist + vt * 16;
    drawWorld(g, W, H, surf, SEABED, scroll, vt, { x: 600, y: 196, r: 30 });
    // mean-tide reference line
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 2;
    g.setLineDash([10, 16]);
    g.beginPath(); g.moveTo(50, SURF_BASE); g.lineTo(W, SURF_BASE); g.stroke();
    g.restore();
    for (const gt of gates) {
      if (gt.x > W + 40 || gt.x < -GATE_W - 40) continue;
      drawGate(g, gt.x, surf, gt.c + off, gt.gap, SEABED, vt, gt.seed, ZONES[gt.z]);
    }
    drawSeabed(g, W, H, SEABED, scroll, vt);
    if (phase !== 'ready') drawMarkers(g, api);
    for (const gt of gates) {
      if (gt.pearl && !gt.pearl.got && gt.x < W + 40) drawPearl(g, gt.x + GATE_W / 2, gt.c + off + gt.pearl.dy, gt.pearl.gold, vt);
    }
    for (const b of bubbles) drawBubble(g, b.x, b.y, b.r);
    const sk = SKINS[phase === 'ready' ? viewSkin : prof.skin];
    const locked = phase === 'ready' && !isUnlocked(viewSkin);
    if (!(st === 'over' && phase === 'ready')) drawDiver(g, diver.x, diver.y, diver.tilt, sk, vt, { fin: diver.fin, alpha: locked ? 0.4 : 1, scale: 1.1 });
    if (locked) drawLock(g, diver.x + 4, diver.y - 58, 1.1, '#e6f3ff');
    drawSurfaceLine(g, W, surf, vt);
    if (st === 'playing' || st === 'paused') {
      if (phase === 'ready') drawReady(g, api);
      else drawHud(g, api);
    } else if (st === 'title') drawTitleInfo(g, api);
    else if (st === 'over') drawOverInfo(g, api);
  },

  bot(api) {
    if (phase === 'ready') { api.input.hold('dive'); return; }
    if (phase !== 'dive') return;
    let target = SURF_BASE + 330 + off;
    let gate = null;
    for (const gt of gates) { if (gt.x + GATE_W > diver.x - DIVER_R - 4) { gate = gt; break; } }
    if (gate) {
      const lead = Math.min(0.6, Math.max(0, (gate.x + GATE_W / 2 - diver.x) / Math.max(1, speed)));
      target = gate.c + tideOffAt(tide.ph + lead * TAU / tide.P);
      if (gate.pearl && !gate.pearl.got) target += gate.pearl.dy * 0.6;
    }
    if (diver.y + diver.vy * 0.16 < target) api.input.hold('dive');
  },

  drawCover(g, w, h, api) {
    g.save();
    g.scale(w / 1280, h / 720);
    const t = 2.2, surfY = 236, bedY = 664;
    drawWorld(g, 1280, 720, surfY, bedY, 420, t, { x: 1150, y: 92, r: 36 });
    drawGate(g, 720, surfY, 452, 214, bedY, t, 1.3, ZONES[0]);
    drawGate(g, 1040, surfY, 372, 206, bedY, t, 4.1, ZONES[1]);
    drawSeabed(g, 1280, 720, bedY, 420, t);
    drawPearl(g, 774, 452, true, t, 14);
    drawPearl(g, 1094, 360, false, t, 13);
    for (const [bx, by, br] of [[332, 360, 7], [312, 318, 5], [346, 286, 9], [326, 250, 4]]) drawBubble(g, bx, by, br);
    drawDiver(g, 420, 430, -0.22, SKINS[0], t, { scale: 1.75, fin: 1.2 });
    drawSurfaceLine(g, 1280, surfY, t);
    // tide arrows on the left
    g.fillStyle = '#7ff6ff';
    g.beginPath(); g.moveTo(60, 300); g.lineTo(90, 300); g.lineTo(75, 276); g.closePath(); g.fill();
    g.fillStyle = '#ff9fe0';
    g.beginPath(); g.moveTo(60, 330); g.lineTo(90, 330); g.lineTo(75, 354); g.closePath(); g.fill();
    api.text('Tideline', 520, 122, { size: 132, weight: 900, color: '#effeff', stroke: '#06122e', strokeWidth: 16, shadow: '#46f0ff', shadowBlur: 34 });
    api.text('hold to dive  ·  ride the tide', 520, 204, { size: 34, weight: 800, color: '#a6ecff', stroke: '#06122e', strokeWidth: 8 });
    g.restore();
  },
});
