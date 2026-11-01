// Echo Cave - a bat in a pitch-black cave that only sees by echo.
// Echo to light the walls for a moment, remember them, steer through the dark.
// Echo too often and the sleepers wake up and strike where they last heard you.
import { createGame } from './kit/jy-kit.js';
import { W, H, PX_PER_M, WAVE_SPEED, WAVE_MAX, ENTRANCE, Cave, clamp, lerp, fnv1a, obsDist, diffAt } from './cave.js';
import { SKINS, setHue, drawBat, skinCol } from './art.js';
import { S, ACH, MODS, NO_MOD, dateKey, loadProfile, calcStreak } from './data.js';
import { BG, BAT_SX, STIR, COOLDOWN, MAX_LIVES, CARD_E, CARD_D, SKIN_L, SKIN_R, ROOST_BAT, TROPHY_Y, trophyX,
  equipped, isUnlocked, blindTime, multOf, buildRoost, drawRoost, drawFly, drawHud, drawSummary } from './view.js';

const BAT_R = 13;
const NOISE_ADD = 28;
const NOISE_DECAY = 16;
const MAXVY = 540;
const NOTES = [523.25, 587.33, 659.25, 783.99, 880];
const ROOST_NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

// input bookkeeping (pointer heuristics survive between runs)
const P = { x: 0, y: 0, down: false, pressed: false, released: false, moved: false };
let lastPX = -1, lastPY = -1, hoverSeen = false;
let ctrl = 'none', targetY = 360, dragMoved = false, pressT = -9, pressX = 0, pressY = 0, releaseT = -9, anchorBat = 360, anchorP = 0;
let tm = {};

function save() { S.api.save('profile', S.prof); }

function refreshDaily() {
  S.dailyKey = dateKey(new Date());
  S.dailySeed = fnv1a('echo-cave/' + S.dailyKey);
  S.dailyMod = MODS[S.dailySeed % MODS.length];
  S.streak = calcStreak(S.prof.days);
}

function hint(id, text, dur) {
  if (S.hints[id]) return;
  S.hints[id] = true;
  S.hintTxt = text; S.hintT = dur || 4.5;
}

function unlock(api, id) {
  if (S.prof.ach[id]) return;
  S.prof.ach[id] = 1;
  const a = ACH.find(x => x.id === id);
  const sk = SKINS.find(s => s.need === id);
  S.runNew.push(id);
  S.toasts.push({ a: `Trophy: ${a.name}`, b: sk ? `${sk.name} skin unlocked in the Roost` : a.desc, t: 0 });
  api.sfx('win');
  save();
}

function checkAch(api) {
  const m = S.meters;
  if (m >= 100) unlock(api, 'first');
  if (m >= 500) unlock(api, 'deep');
  if (m >= 1500) unlock(api, 'abyss');
  if (m >= 400 && S.hits === 0) unlock(api, 'untouched');
  if (m >= 300 && !S.wasLoud) unlock(api, 'silent');
  if (S.mode === 'daily' && m >= 200) unlock(api, 'daily');
  if (S.passedEntrance && blindTime(api.time) >= 8) unlock(api, 'blind');
  if (S.prof.crystals + S.crystalsRun >= 40) unlock(api, 'crystal');
  if (S.evaded > 0) unlock(api, 'lure');
}

/* ------------------------------------------------------------------ roost */
function cycleSkin(api, d) {
  S.skinView = (S.skinView + d + SKINS.length) % SKINS.length;
  const s = SKINS[S.skinView];
  if (isUnlocked(s)) { S.prof.skin = s.id; save(); api.sfx('select'); } else api.tone(200, 0.08, 'square', 0.06);
}

function launch(api) {
  if (S.phase !== 'roost') return;
  S.phase = 'launch'; S.phaseT = 0;
  S.prof.mode = S.sel; save();
  api.sfx('whoosh');
  api.tone(2600, 0.06, 'sine', 0.15, -1500);
}

function roostTap(api, x, y) {
  if (Math.hypot(x - SKIN_L.x, y - SKIN_L.y) < 48) return cycleSkin(api, -1);
  if (Math.hypot(x - SKIN_R.x, y - SKIN_R.y) < 48) return cycleSkin(api, 1);
  if (Math.hypot(x - ROOST_BAT.x, y - ROOST_BAT.y) < 70) return cycleSkin(api, 1);
  const inR = r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inR(CARD_E)) { S.sel = 0; return launch(api); }
  if (inR(CARD_D)) { S.sel = 1; return launch(api); }
  for (let i = 0; i < ACH.length; i++) {
    if (Math.abs(x - trophyX(i)) < 29 && Math.abs(y - TROPHY_Y) < 30) { S.infoAch = i; api.sfx('click'); return; }
  }
  launch(api);
}

function updateRoost(dt, api) {
  const inp = api.input;
  if (inp.pressed('up')) { S.sel = 0; api.sfx('click'); }
  if (inp.pressed('down')) { S.sel = 1; api.sfx('click'); }
  if (inp.pressed('left')) cycleSkin(api, -1);
  if (inp.pressed('right')) cycleSkin(api, 1);
  if (P.pressed) roostTap(api, P.x, P.y);
  else if (inp.pressed('echo')) launch(api);
  tm.music -= dt;
  if (tm.music <= 0) {
    tm.music = 0.62;
    const n = api.pick(ROOST_NOTES);
    api.tone(n, 1.2, 'triangle', 0.035);
    if (api.chance(0.3)) api.tone(n * 1.5, 1.0, 'sine', 0.02, 0, 0.12);
  }
  tm.pad -= dt;
  if (tm.pad <= 0) { tm.pad = 2.4; api.tone(110, 2.6, 'sine', 0.05); }
  if (api.time - S.roostPing > 2.6) { S.roostPing = api.time; api.tone(2400, 0.05, 'sine', 0.05, -1300); }
}

/* -------------------------------------------------------------- the cave */
function startCave(api) {
  S.mode = S.sel === 1 ? 'daily' : 'endless';
  let seed;
  if (S.mode === 'daily') { seed = S.dailySeed; S.mod = S.dailyMod; } else { seed = (api.rand() * 4294967296) >>> 0; S.mod = NO_MOD; }
  S.cave = new Cave(seed, S.mod);
  S.bat.x = BAT_SX; S.bat.y = 360; S.bat.vy = 0; S.bat.rot = 0;
  S.cam = 0;
  S.cave.ensure(W + 900);
  S.phase = 'fly'; S.phaseT = 0;
  ctrl = 'none'; targetY = 360;
  if (S.prof.runs < 3) hint('echo', api.isTouch ? 'Tap to echo. The walls glow for a moment: remember them!' : 'Press Space or click to echo. The walls glow for a moment: remember them!', 5.5);
}

function emitEcho(api, free) {
  const now = api.time, b = S.bat;
  S.echoes.push({ x: b.x, y: b.y, t0: now, r: -1, id: ++S.echoId });
  S.lastEchoT = now;
  S.blindFrom = now; S.lastMult = 1;
  if (!free) {
    S.cd = COOLDOWN;
    S.echoCount++;
    const before = S.noise;
    S.noise = Math.min(100, S.noise + NOISE_ADD);
    S.noiseHold = 0.4;
    if (S.noise >= STIR) { S.wasLoud = true; if (S.prof.runs < 6) hint('loud', 'Too loud! The sleepers are stirring. Let the noise settle.', 3.5); }
    if (before >= STIR) wakeSleepers(api);
    if (before + NOISE_ADD >= 100 && now - S.lastShade > 2.5 && S.hunters.length < 3) spawnShade(api);
    for (const h of S.hunters) {
      if (h.st !== 'fade' && Math.abs(h.x - b.x) < 1100) { h.tx = b.x; h.ty = b.y; if (h.st !== 'wake') { h.st = 'hunt'; h.t = 0; } }
    }
  }
  echoSound(api, b.x, b.y);
}

function newHunter(x, y, kind, api) {
  const b = S.bat;
  S.hunters.push({ x, y, vx: 0, vy: 0, tx: b.x, ty: b.y, st: 'wake', t: 0, wake: kind === 'shade' ? 0.3 : 0.45, r: kind === 'shade' ? 26 : 22, lt: -99, k: 0, ph: api.rand() * 6.28, kind });
  if (S.prof.runs < 8) hint('hunter', 'Hunters strike where they last HEARD you. Move after you echo!', 4.5);
}

function wakeSleepers(api) {
  const b = S.bat, keep = [];
  let woke = 0;
  for (const o of S.cave.obs) {
    if (o.type === 'sleeper' && Math.abs(o.x - b.x) < 800 && S.hunters.length + woke < 4) { newHunter(o.x, o.y, 'sleeper', api); woke++; } else keep.push(o);
  }
  S.cave.obs = keep;
  if (woke) { api.tone(110, 0.5, 'sawtooth', 0.1, -50); api.noise(0.4, 0.14, 0, 420); api.tone(900, 0.35, 'sawtooth', 0.05, 500, 0.1); }
}

function spawnShade(api) {
  S.lastShade = api.time;
  const y = clamp(S.bat.y + api.randRange(-160, 160), 80, H - 80);
  newHunter(S.cam + W + 70, y, 'shade', api);
  api.tone(55, 0.9, 'sawtooth', 0.11, 30);
  api.noise(0.8, 0.1, 0.05, 300);
}

function echoSound(api, ox, oy) {
  api.tone(3000, 0.06, 'sine', 0.2, -1700);
  api.tone(1500, 0.09, 'triangle', 0.08, -600, 0.012);
  const rays = [[-1.05, 1900], [-0.5, 1550], [0, 1250], [0.5, 1000], [1.05, 800]];
  for (const [a, f] of rays) {
    const d = S.cave.raycast(ox, oy, Math.cos(a), Math.sin(a), WAVE_MAX);
    if (d >= WAVE_MAX) continue;
    const q = 1 - d / WAVE_MAX, v = 0.03 + 0.12 * q * q, delay = d / WAVE_SPEED;
    api.tone(f, 0.05, a === 0 ? 'triangle' : 'sine', v, -f * 0.25, delay);
    api.tone(f * 0.98, 0.05, 'sine', v * 0.3, -f * 0.25, delay * 2 + 0.05);
  }
}

function tryEcho(api) {
  if (S.cd > 0) {
    if (tm.dry <= 0) { api.tone(180, 0.04, 'square', 0.05); tm.dry = 0.15; }
    return;
  }
  emitEcho(api, false);
}

function steer(dt, api) {
  const up = api.input.down('up'), dn = api.input.down('down');
  if (up || dn) ctrl = 'keys';
  if (P.pressed) { pressT = api.time; pressX = P.x; pressY = P.y; dragMoved = false; anchorBat = S.bat.y; anchorP = P.y; }
  if (P.down) {
    if (!dragMoved && (Math.abs(P.y - pressY) > 12 || Math.abs(P.x - pressX) > 12)) { dragMoved = true; anchorBat = S.bat.y; anchorP = P.y; }
    if (dragMoved) { ctrl = 'drag'; targetY = anchorBat + (P.y - anchorP) * 1.3; }
  }
  if (P.released) releaseT = api.time;
  if (!P.down && P.moved && api.time - releaseT > 0.25) { ctrl = 'hover'; hoverSeen = true; targetY = P.y; }
  targetY = clamp(targetY, 16, H - 16);
  let want = 0;
  if (ctrl === 'keys') want = ((dn ? 1 : 0) - (up ? 1 : 0)) * MAXVY;
  else if (ctrl === 'drag' || ctrl === 'hover') want = clamp((targetY - S.bat.y) * 9, -MAXVY, MAXVY);
  const acc = 4200 * dt, b = S.bat;
  b.vy = b.vy < want ? Math.min(want, b.vy + acc) : Math.max(want, b.vy - acc);
}

function collide() {
  const b = S.bat, c = S.cave;
  for (const dx of [-8, 0, 8]) {
    const x = b.x + dx;
    if (b.y - BAT_R * 0.8 < c.top(x) || b.y + BAT_R * 0.8 > c.bot(x)) return { kind: 'wall' };
  }
  for (const o of c.obs) {
    if (Math.abs(o.x - b.x) > 170) continue;
    const lim = o.type === 'spike' ? BAT_R * 0.85 : o.type === 'sleeper' ? BAT_R * 0.85 - 2 : BAT_R * 0.85;
    if (obsDist(o, b.x, b.y) < lim) return { kind: o.type };
  }
  for (const h of S.hunters) {
    if (h.st === 'fade') continue;
    if (Math.hypot(h.x - b.x, h.y - b.y) < h.r * 0.75 + BAT_R) return { kind: 'hunter', h };
  }
  return null;
}

function onHit(api, hit) {
  S.lives--; S.hits++;
  S.inv = 1.6; S.recoverT = 0.45;
  if (hit.h) { hit.h.st = 'fade'; hit.h.t = 0.4; }
  api.shake(14, 0.35); api.flash('#ff2a55', 0.22); api.sfx('hit'); api.noise(0.25, 0.22, 0, 500); api.vibrate(80);
  api.burst(BAT_SX, S.bat.y, { count: 22, color: [skinCol(equipped(), 1), '#ffffff', '#ff6f91'], speed: 320, life: 0.6, size: 4 });
  if (S.lives <= 0) {
    S.phase = 'dying'; S.phaseT = 0; S.bat.vy = -220;
    api.sfx('lose');
    return;
  }
  api.floatText(BAT_SX, S.bat.y - 50, S.lives === 1 ? 'Last wing!' : '-1 wing', '#ff8fa8', 30);
  emitEcho(api, true);
}

function pickCrystals(api) {
  const b = S.bat;
  for (const c of S.cave.crystals) {
    if (c.taken || Math.abs(c.x - b.x) > 40) continue;
    if (Math.hypot(c.x - b.x, c.y - b.y) < 24 + BAT_R) {
      c.taken = true;
      S.crystalsRun++; S.points += 25;
      api.floatText(BAT_SX, b.y - 42, '+25', '#ffe49a', 30);
      api.burst(BAT_SX, b.y, { count: 14, color: ['#ffe49a', '#fff6d8'], speed: 240, life: 0.5, size: 3 });
      const n = NOTES[c.n];
      api.tone(n, 0.14, 'triangle', 0.13); api.tone(n * 1.5, 0.2, 'triangle', 0.1, 0, 0.07);
      if (S.crystalsRun % 12 === 0 && S.lives < MAX_LIVES) {
        S.lives++;
        S.toasts.push({ a: 'A wing heals', b: '12 crystals collected this flight', t: 0 });
        api.sfx('powerup');
      }
    }
  }
}

function updateEchoes(api) {
  const now = api.time, out = { sleepers: [], crystals: [] };
  for (const e of S.echoes) {
    const rp = e.r, r = Math.min(WAVE_MAX, (now - e.t0) * WAVE_SPEED);
    if (r <= rp) continue;
    S.cave.light(e, rp, r, now, S.mod.fade, out);
    for (const h of S.hunters) {
      const d = Math.max(0, Math.hypot(h.x - e.x, h.y - e.y) - h.r);
      if (d > rp && d <= r) { h.lt = now; h.k = 1 - 0.5 * d / WAVE_MAX; }
    }
    e.r = r;
  }
  S.echoes = S.echoes.filter(e => e.r < WAVE_MAX);
  let budget = 2;
  for (const o of out.sleepers) { if (budget-- <= 0) break; api.tone(85, 0.35, 'triangle', 0.07, -25); }
  for (const c of out.crystals) { if (budget-- <= 0) break; api.tone(NOTES[c.n] * 2, 0.5, 'sine', 0.04); }
}

function updateHunters(dt, api) {
  const b = S.bat, D = diffAt(b.x), sp = lerp(330, 430, D);
  for (const h of S.hunters) {
    h.t += dt;
    if (h.st === 'wake') {
      if (h.t >= h.wake) { h.st = 'hunt'; h.t = 0; }
    } else if (h.st === 'hunt') {
      const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, 4 * dt);
      h.vx += (dx / d * sp - h.vx) * k; h.vy += (dy / d * sp - h.vy) * k;
      if (d < 34) {
        h.st = 'lost'; h.t = 0;
        if (S.phase === 'fly' && Math.hypot(h.x - b.x, h.y - b.y) > 120) {
          S.evaded++; S.points += 50;
          api.floatText(BAT_SX, b.y - 60, 'Decoy +50', '#ff9fb4', 28);
          api.tone(330, 0.3, 'sawtooth', 0.05, -120);
        }
      }
    } else if (h.st === 'lost') {
      h.vx *= 0.92; h.vy *= 0.92;
      if (h.t > 0.9) { h.st = 'fade'; h.t = 0; }
    } else { h.vx *= 0.95; h.vy *= 0.95; }
    h.x += h.vx * dt; h.y += h.vy * dt;
  }
  S.hunters = S.hunters.filter(h => !(h.st === 'fade' && h.t > 0.8) && h.x > S.cam - 300);
}

function flySounds(dt, api) {
  const b = S.bat;
  tm.drip -= dt;
  if (tm.drip <= 0) {
    tm.drip = api.randRange(1.0, 3.2);
    const f = api.randRange(1300, 2600);
    api.tone(f, 0.05, 'sine', 0.05, -f * 0.45);
    api.tone(f, 0.05, 'sine', 0.02, -f * 0.45, 0.19);
    api.tone(f, 0.05, 'sine', 0.008, -f * 0.45, 0.38);
  }
  tm.wind -= dt;
  if (tm.wind <= 0) { tm.wind = 1.45; api.noise(1.8, 0.022, 0, 240); }
  if (S.phase !== 'fly') return;
  tm.flap -= dt;
  if (tm.flap <= 0) { tm.flap = 0.21; api.noise(0.04, 0.018, 0, 1400); }
  const dT = b.y - S.cave.top(b.x + 20) - BAT_R, dB = S.cave.bot(b.x + 20) - b.y - BAT_R;
  const d = Math.min(dT, dB);
  S.proxSide = dT < dB ? -1 : 1;
  S.proxK = d < 70 ? 1 - Math.max(0, d) / 70 : 0;
  if (S.proxK > 0) {
    tm.beep -= dt;
    if (tm.beep <= 0) { api.tone(480 + 900 * S.proxK, 0.03, 'sine', 0.05); tm.beep = 0.06 + 0.28 * (1 - S.proxK); }
  } else tm.beep = 0;
  let hd = 1e9;
  for (const h of S.hunters) if (h.st === 'hunt' || h.st === 'wake') hd = Math.min(hd, Math.hypot(h.x - b.x, h.y - b.y));
  if (hd < 1e9) {
    tm.heart -= dt;
    if (tm.heart <= 0) {
      api.tone(70, 0.12, 'sine', 0.3, -20); api.tone(62, 0.1, 'sine', 0.22, -15, 0.16);
      tm.heart = lerp(0.32, 0.85, clamp(hd / 900, 0, 1));
    }
  }
}

function finalize(api) {
  if (S.finalized) return;
  S.finalized = true;
  const P0 = S.prof, sc = Math.floor(S.points);
  P0.runs++;
  P0.crystals += S.crystalsRun;
  P0.echoes += S.echoCount;
  P0.bestM = Math.max(P0.bestM, Math.floor(S.meters));
  if (S.mode === 'endless') P0.bestEndless = Math.max(P0.bestEndless, sc);
  else {
    if (P0.daily.date !== S.dailyKey) P0.daily = { date: S.dailyKey, best: 0 };
    S.newDailyBest = sc > P0.daily.best;
    P0.daily.best = Math.max(P0.daily.best, sc);
    if (!P0.days.includes(S.dailyKey)) { P0.days.push(S.dailyKey); if (P0.days.length > 60) P0.days.shift(); }
    S.streak = calcStreak(P0.days);
    if (new Set(P0.days).size >= 3) unlock(api, 'habit');
  }
  checkAch(api);
  save();
}

function updateFly(dt, api) {
  const now = api.time, b = S.bat, cave = S.cave;
  if (S.phase === 'fly') {
    S.speed = (270 + Math.min(250, S.meters * 0.16)) * S.mod.speed;
    steer(dt, api);
    b.y += b.vy * dt;
    if (S.recoverT > 0) {
      S.recoverT -= dt;
      const cx = b.x + 40, mid = (cave.top(cx) + cave.bot(cx)) / 2;
      b.y += (mid - b.y) * Math.min(1, 10 * dt); b.vy *= 0.8;
      targetY = b.y; anchorBat = b.y; anchorP = P.y;
    }
    b.y = clamp(b.y, 14, H - 14);
    b.x += S.speed * dt;
    if (!S.passedEntrance && b.x > ENTRANCE) { S.passedEntrance = true; S.blindFrom = now; }
    let want = api.input.pressed('echo');
    if (P.pressed && hoverSeen) want = true;
    if (P.released && !dragMoved && !hoverSeen && now - pressT < 0.3) want = true;
    if (want) tryEcho(api);
    if (S.cd > 0) { S.cd -= dt; if (S.cd <= 0) { S.cd = 0; api.tone(2600, 0.03, 'sine', 0.035); } }
    if (S.noiseHold > 0) S.noiseHold -= dt; else S.noise = Math.max(0, S.noise - NOISE_DECAY * dt);
    if (S.inv > 0) S.inv -= dt;
    S.meters = (b.x - BAT_SX) / PX_PER_M;
    const bt = S.passedEntrance ? blindTime(now) : 0;
    if (bt > S.maxBlind) S.maxBlind = bt;
    const m = S.passedEntrance ? multOf(bt) : 1;
    if (m > S.lastMult) api.tone(660 + 220 * m, 0.14, 'triangle', 0.07);
    S.lastMult = m;
    S.points += (S.speed * dt / PX_PER_M) * m;
    if (S.inv <= 0) { const hit = collide(); if (hit) onHit(api, hit); }
    if (S.phase === 'fly') { pickCrystals(api); checkAch(api); }
    if (S.prof.runs < 3 && S.phaseT > 7) hint('steer', api.isTouch ? 'Drag up or down to steer. Fewer echoes = bigger BLIND bonus.' : 'Steer with ↑ ↓ / W S or the mouse. Fewer echoes = bigger BLIND bonus.', 5);
  } else {
    b.vy += 1500 * dt; b.y = Math.min(H + 40, b.y + b.vy * dt); b.rot += 7 * dt;
    S.speed = Math.max(0, S.speed - 600 * dt); b.x += S.speed * dt;
    if (S.phaseT > 1.15 && !S.finalized) { finalize(api); api.gameOver(); }
  }
  S.cam = b.x - BAT_SX;
  cave.ensure(S.cam + W + 900);
  cave.prune(S.cam - 260);
  updateEchoes(api);
  updateHunters(dt, api);
  flySounds(dt, api);
}

function resetState(api) {
  S.api = api;
  refreshDaily();
  S.phase = 'roost'; S.phaseT = 0;
  S.sel = S.prof.mode === 1 ? 1 : 0;
  S.skinView = Math.max(0, SKINS.indexOf(equipped()));
  S.infoAch = -1;
  S.mode = 'endless'; S.mod = NO_MOD; S.cave = null;
  S.bat = { x: BAT_SX, y: 360, vy: 0, rot: 0 };
  S.cam = 0; S.speed = 0;
  S.lives = MAX_LIVES; S.inv = 0; S.recoverT = 0; S.hits = 0;
  S.noise = 0; S.noiseHold = 0; S.cd = 0; S.wasLoud = false;
  S.blindFrom = 1e9; S.lastEchoT = -9; S.maxBlind = 0; S.lastMult = 1; S.echoCount = 0;
  S.points = 0; S.meters = 0; S.crystalsRun = 0; S.evaded = 0;
  S.echoes = []; S.hunters = []; S.echoId = 0; S.lastShade = -9;
  S.toasts = []; S.hintTxt = ''; S.hintT = 0; S.hints = {};
  S.runNew = []; S.finalized = false; S.newDailyBest = false;
  S.proxK = 0; S.proxSide = 0; S.passedEntrance = false;
  S.roostPing = 0;
  ctrl = 'none'; targetY = 360; dragMoved = false; pressT = -9; releaseT = -9;
  tm = { drip: 1, wind: 0.2, flap: 0, beep: 0, heart: 0, music: 0.3, pad: 0.1, dry: 0 };
  api.score = 0;
}

createGame({
  id: 'echo-cave',
  title: 'Echo Cave',
  howTo: 'Tap or press Space to echo. Remember the glowing walls, steer through the dark, and keep quiet.',
  overTitle: 'Lost in the Dark',
  orientation: 'landscape',
  width: W,
  height: H,
  background: BG,
  letterbox: '#000000',
  accent: '#8cb6ff',
  hud: false,
  actions: {
    echo: ['Space', 'Enter', 'KeyE', 'KeyJ'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
  },
  touchButtons: [{ action: 'echo', label: ')))', x: 0.9, y: 0.8, size: 0.12 }],

  init(api) {
    S.api = api;
    S.prof = loadProfile(api);
    buildRoost();
    refreshDaily();
  },

  reset(api) { resetState(api); },

  update(dt, api) {
    const p = api.pointer;
    P.x = p.x; P.y = p.y; P.down = p.down; P.pressed = p.pressed; P.released = p.released;
    P.moved = lastPX >= 0 && (Math.abs(P.x - lastPX) > 0.5 || Math.abs(P.y - lastPY) > 0.5);
    lastPX = P.x; lastPY = P.y;
    S.phaseT += dt;
    if (tm.dry > 0) tm.dry -= dt;
    if (S.hintT > 0) S.hintT -= dt;
    if (S.toasts.length) { S.toasts[0].t += dt; if (S.toasts[0].t > 3.2) S.toasts.shift(); }
    if (S.phase === 'roost') { updateRoost(dt, api); return; }
    if (S.phase === 'launch') { if (S.phaseT >= 0.5) startCave(api); return; }
    updateFly(dt, api);
    api.score = Math.floor(S.points);
  },

  render(g, api) {
    const st = api.state;
    if (st === 'title') S.rt += 1 / 60;
    const now = st === 'title' ? S.rt : api.time;
    setHue((now * 45) % 360);
    if (st === 'title' || S.phase === 'roost' || S.phase === 'launch' || !S.cave) {
      drawRoost(g, now, st === 'playing' || st === 'paused');
      return;
    }
    drawFly(g, now);
    if (st === 'over') drawSummary(g); else drawHud(g, now);
  },

  bot(api) {
    if (S.phase === 'roost') { if (S.phaseT > 0.25) api.input.tap('echo'); return; }
    if (S.phase !== 'fly') return;
    const b = S.bat, cave = S.cave;
    let best = b.y, bestS = -1e9;
    for (let y = 24; y <= H - 24; y += 10) {
      let s = 1e9;
      for (const ax of [30, 90, 160, 240]) {
        const t = ax / S.speed, reach = MAXVY * 0.8 * t;
        const yy = b.y + clamp(y - b.y, -reach, reach);
        let c = cave.clearance(b.x + ax, yy);
        for (const h of S.hunters) {
          if (h.st === 'fade') continue;
          const d = Math.hypot(h.x + h.vx * t - (b.x + ax), h.y + h.vy * t - yy);
          if (d < 140) c -= (140 - d);
        }
        if (c < s) s = c;
      }
      s -= Math.abs(y - b.y) * 0.03;
      if (s > bestS) { bestS = s; best = y; }
    }
    if (best < b.y - 6) api.input.hold('up');
    else if (best > b.y + 6) api.input.hold('down');
    if (S.cd <= 0 && S.noise < 30 && api.time - S.lastEchoT > 1.6) api.input.tap('echo');
  },

  drawCover(g, w, h, api) {
    g.save();
    g.scale(w / W, h / H);
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    const sk = SKINS[0], col = a => skinCol(sk, a);
    const bx = 400, by = 410;
    const ag = g.createRadialGradient(bx, by, 10, bx, by, 520);
    ag.addColorStop(0, col(0.3)); ag.addColorStop(1, col(0));
    g.fillStyle = ag; g.fillRect(0, 0, W, H);
    const wall = (fy, side) => {
      const pts = [];
      for (let x = -20; x <= W + 20; x += 20) pts.push([x, fy(x)]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const bb = clamp(1.3 - Math.hypot(x1 - bx, y1 - by) / 800, 0.1, 1);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
        g.lineWidth = 12; g.strokeStyle = col(bb * 0.18); g.stroke();
        g.lineWidth = 3; g.strokeStyle = col(bb); g.stroke();
        g.beginPath(); g.moveTo(x1, y1 + 18 * side); g.lineTo(x2, y2 + 18 * side);
        g.lineWidth = 1.5; g.strokeStyle = col(bb * 0.4); g.stroke();
      }
    };
    wall(x => 110 + 50 * Math.sin(x * 0.006 + 0.5) + 16 * Math.sin(x * 0.031), -1);
    wall(x => 640 - 45 * Math.sin(x * 0.005 + 2.1) - 15 * Math.sin(x * 0.027 + 1), 1);
    const spike = (x, y0, y1) => {
      g.beginPath(); g.moveTo(x - 40, y0); g.lineTo(x + 4, y1); g.lineTo(x + 40, y0);
      g.lineWidth = 10; g.strokeStyle = col(0.15); g.stroke();
      g.lineWidth = 3; g.strokeStyle = col(0.75); g.stroke();
    };
    spike(230, 118, 270); spike(1010, 640, 470);
    for (const r of [110, 230, 370, 530]) {
      g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2);
      g.lineWidth = 3; g.strokeStyle = col(0.55 * (1 - r / 700)); g.stroke();
    }
    drawBat(g, bx, by, 2.8, 0.9, 1, sk, -0.1, 1);
    for (const [ex, ey, s] of [[1110, 380, 1.4], [1210, 520, 1]]) {
      for (const sd of [-1, 1]) {
        const x = ex + sd * 12 * s;
        const gr = g.createRadialGradient(x, ey, 0, x, ey, 26 * s);
        gr.addColorStop(0, 'rgba(255,50,80,0.7)'); gr.addColorStop(1, 'rgba(255,50,80,0)');
        g.fillStyle = gr; g.fillRect(x - 30 * s, ey - 30 * s, 60 * s, 60 * s);
        g.fillStyle = '#ffd0d8'; g.beginPath(); g.ellipse(x, ey, 5 * s, 3 * s, sd * 0.35, 0, Math.PI * 2); g.fill();
      }
    }
    for (const [cx, cy] of [[600, 520], [860, 440], [720, 560]]) {
      g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx + 9, cy); g.lineTo(cx, cy + 14); g.lineTo(cx - 9, cy); g.closePath();
      g.fillStyle = 'rgba(255,228,154,0.6)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff0c0'; g.stroke();
    }
    g.letterSpacing = '6px';
    api.text('ECHO CAVE', 820, 250, { size: 118, weight: 900, color: '#eef4ff', shadow: col(1), shadowBlur: 34 });
    g.letterSpacing = '0px';
    api.text('see only by sound', 820, 330, { size: 40, weight: 700, color: col(1) });
    g.restore();
  },
});
