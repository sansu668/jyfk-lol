// Comet Catcher - reference game for the JY factory.
// Shows: actions + pointer drag, spawning & difficulty ramp, combos, lives,
// particles / float text / shake / flash, sfx, a scoring bot, and a cover.
import { createGame } from './kit/jy-kit.js';

const W = 720, H = 1280;
const CATCH_Y = 1120;
const MAX_LIVES = 3;

let sky = [];
let catcher, items, lives, combo, spawnT, elapsed, hurtT, bestCombo;

function mult() { return Math.min(5, 1 + Math.floor(combo / 5)); }

function spawn(api) {
  const r = api.rand();
  const meteorChance = Math.min(0.42, 0.16 + elapsed * 0.0022);
  let type = 'star';
  if (r < meteorChance) type = 'meteor';
  else if (r < meteorChance + 0.07) type = 'comet';
  else if (lives < MAX_LIVES && r < meteorChance + 0.09) type = 'heart';
  const speed = Math.min(800, 300 + elapsed * 3.3) * api.randRange(0.86, 1.14);
  const radius = type === 'meteor' ? 38 : type === 'comet' ? 30 : 30;
  items.push({
    type,
    x: api.randRange(70, W - 70),
    y: -70,
    vy: type === 'comet' ? speed * 1.15 : speed,
    vx: type === 'comet' ? api.randRange(-160, 160) : 0,
    r: radius,
    rot: api.rand() * Math.PI * 2,
    spin: api.randRange(-2.5, 2.5),
  });
}

function drawStar(g, x, y, r, rot, fill) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.shadowColor = fill;
  g.shadowBlur = 18;
  g.fill();
  g.restore();
}

function drawHeart(g, x, y, s, fill) {
  g.save();
  g.translate(x, y);
  g.scale(s / 30, s / 30);
  g.beginPath();
  g.moveTo(0, 12);
  g.bezierCurveTo(-30, -8, -18, -32, 0, -16);
  g.bezierCurveTo(18, -32, 30, -8, 0, 12);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

function drawMeteor(g, x, y, r, rot, api) {
  // fire trail
  const grad = g.createLinearGradient(x, y - r * 3.2, x, y);
  grad.addColorStop(0, 'rgba(255,90,40,0)');
  grad.addColorStop(1, 'rgba(255,120,40,0.75)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x - r * 0.8, y);
  g.lineTo(x, y - r * 3.4);
  g.lineTo(x + r * 0.8, y);
  g.closePath();
  g.fill();
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (i % 3 === 0 ? 0.82 : i % 2 === 0 ? 1 : 0.92);
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = '#c2412d';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#ff8a4c';
  g.stroke();
  g.fillStyle = 'rgba(90,20,10,.55)';
  g.beginPath(); g.arc(-r * 0.3, -r * 0.2, r * 0.22, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(r * 0.35, r * 0.25, r * 0.16, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawComet(g, x, y, r, vx, vy) {
  const len = 5.5;
  const sp = Math.hypot(vx, vy) || 1;
  const tx = x - (vx / sp) * r * len, ty = y - (vy / sp) * r * len;
  const grad = g.createLinearGradient(tx, ty, x, y);
  grad.addColorStop(0, 'rgba(120,220,255,0)');
  grad.addColorStop(1, 'rgba(160,240,255,0.9)');
  g.strokeStyle = grad;
  g.lineWidth = r * 1.5;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke();
  g.save();
  g.shadowColor = '#9ff3ff';
  g.shadowBlur = 26;
  g.fillStyle = '#e9fdff';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawCatcher(g, x, y, w, hurt, api) {
  const h = 46;
  g.save();
  g.globalAlpha = hurt > 0 && Math.floor(hurt * 16) % 2 === 0 ? 0.45 : 1;
  g.shadowColor = '#7cf7d4';
  g.shadowBlur = 22;
  g.fillStyle = '#2de0b0';
  g.beginPath();
  g.moveTo(x - w / 2, y - 6);
  g.quadraticCurveTo(x, y + h * 1.6, x + w / 2, y - 6);
  g.lineTo(x + w / 2 - 18, y - 6);
  g.quadraticCurveTo(x, y + h * 0.9, x - w / 2 + 18, y - 6);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  api.circle(x - w / 2 + 9, y - 6, 9, '#b9fff0');
  api.circle(x + w / 2 - 9, y - 6, 9, '#b9fff0');
  g.restore();
}

function drawSky(g, api, w, h, t) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0f2c');
  grad.addColorStop(0.6, '#1a1350');
  grad.addColorStop(1, '#3a1d5c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (const s of sky) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
    g.globalAlpha = a;
    g.fillStyle = '#ffffff';
    g.fillRect(s.x * w, ((s.y * h + t * s.sp) % h), s.s, s.s);
  }
  g.globalAlpha = 1;
}

createGame({
  id: 'comet-catcher',
  title: 'Comet Catcher',
  howTo: 'Drag or use ← → to catch stars and comets. Dodge the red meteors!',
  orientation: 'portrait',
  width: W,
  height: H,
  background: '#0a0f2c',
  accent: '#ffd23f',
  actions: { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] },

  init(api) {
    sky = [];
    for (let i = 0; i < 90; i++) {
      sky.push({ x: api.rand(), y: api.rand(), s: api.rand() < 0.15 ? 4 : 2, tw: api.randRange(1, 4), ph: api.rand() * 6, sp: api.randRange(4, 18) });
    }
  },

  reset(api) {
    catcher = { x: W / 2, w: 176 };
    items = [];
    lives = MAX_LIVES;
    combo = 0;
    bestCombo = 0;
    spawnT = 0.6;
    elapsed = 0;
    hurtT = 0;
  },

  update(dt, api) {
    elapsed += dt;
    if (hurtT > 0) hurtT -= dt;

    // movement: drag (touch / mouse) or keys
    const p = api.pointer;
    if (p.down) {
      catcher.x = api.util.approach(catcher.x, p.x, 2000 * dt);
    } else {
      let move = 0;
      if (api.input.down('left')) move -= 1;
      if (api.input.down('right')) move += 1;
      catcher.x += move * 920 * dt;
    }
    catcher.x = api.util.clamp(catcher.x, catcher.w / 2, W - catcher.w / 2);

    // spawning gets faster over time
    spawnT -= dt;
    if (spawnT <= 0) {
      spawn(api);
      spawnT = Math.max(0.3, 0.92 - elapsed * 0.0065) * api.randRange(0.75, 1.25);
    }

    const keep = [];
    for (const it of items) {
      it.y += it.vy * dt;
      it.x += it.vx * dt;
      it.rot += it.spin * dt;
      if (it.x < it.r || it.x > W - it.r) { it.vx = -it.vx; it.x = api.util.clamp(it.x, it.r, W - it.r); }

      const inBand = it.y + it.r >= CATCH_Y - 14 && it.y - it.r <= CATCH_Y + 34;
      const inX = Math.abs(it.x - catcher.x) <= catcher.w / 2 + it.r * 0.35;
      if (inBand && inX) {
        if (it.type === 'meteor') {
          if (hurtT <= 0) {
            lives -= 1;
            combo = 0;
            hurtT = 0.9;
            api.shake(18, 0.35);
            api.flash('#ff3b3b', 0.2);
            api.sfx('hit');
            api.vibrate(60);
            api.burst(it.x, it.y, { count: 26, color: ['#ff8a4c', '#c2412d', '#ffd23f'], speed: 420, life: 0.7, size: 7 });
            if (lives <= 0) { api.sfx('lose'); api.after(0.05, a => a.gameOver()); }
          }
          continue;
        }
        if (it.type === 'heart') {
          lives = Math.min(MAX_LIVES, lives + 1);
          api.addScore(5, it.x, it.y - 40, '#ff7aa8');
          api.sfx('powerup');
          api.burst(it.x, it.y, { count: 18, color: '#ff7aa8', speed: 300 });
          continue;
        }
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        const base = it.type === 'comet' ? 50 : 10;
        const pts = base * mult();
        api.addScore(pts, it.x, it.y - 40, it.type === 'comet' ? '#9ff3ff' : '#ffd23f');
        api.sfx(it.type === 'comet' ? 'powerup' : 'coin');
        if (combo > 0 && combo % 5 === 0) { api.sfx('combo'); api.floatText(W / 2, 300, `Combo x${mult()}!`, '#7cf7d4', 54); }
        api.burst(it.x, it.y, { count: it.type === 'comet' ? 30 : 16, color: it.type === 'comet' ? ['#e9fdff', '#9ff3ff'] : ['#ffd23f', '#fff4b0'], speed: 340, life: 0.6 });
        continue;
      }
      if (it.y - it.r > H + 10) {
        if (it.type === 'star' || it.type === 'comet') combo = 0;
        continue;
      }
      keep.push(it);
    }
    items = keep;
  },

  render(g, api) {
    drawSky(g, api, W, H, api.time);
    // ground glow
    const gg = g.createRadialGradient(W / 2, H + 220, 40, W / 2, H + 220, 620);
    gg.addColorStop(0, 'rgba(45,224,176,.35)');
    gg.addColorStop(1, 'rgba(45,224,176,0)');
    g.fillStyle = gg;
    g.fillRect(0, H - 420, W, 420);

    for (const it of items) {
      if (it.type === 'star') drawStar(g, it.x, it.y, it.r, it.rot, '#ffd23f');
      else if (it.type === 'comet') drawComet(g, it.x, it.y, it.r, it.vx, it.vy);
      else if (it.type === 'meteor') drawMeteor(g, it.x, it.y, it.r, it.rot, api);
      else if (it.type === 'heart') drawHeart(g, it.x, it.y, 34, '#ff7aa8');
    }
    drawCatcher(g, catcher.x, CATCH_Y, catcher.w, hurtT, api);

    // lives + combo
    for (let i = 0; i < MAX_LIVES; i++) drawHeart(g, 50 + i * 58, 64, 26, i < lives ? '#ff5d8f' : 'rgba(255,255,255,.18)');
    if (mult() > 1) api.text(`x${mult()}`, W - 60, 64, { size: 46, color: '#7cf7d4', stroke: 'rgba(0,0,0,.5)' });
  },

  bot(api) {
    // pick the most urgent reachable good item, then steer around meteors
    let target = null, bestY = -Infinity;
    for (const it of items) {
      if (it.type === 'meteor' || it.y > CATCH_Y) continue;
      const t = (CATCH_Y - it.y) / it.vy;
      const need = Math.abs(it.x - catcher.x) / 920;
      if (need > t + 0.1) continue;
      const pri = it.y + (it.type === 'comet' ? 160 : 0) + (it.type === 'heart' ? 240 : 0);
      if (pri > bestY) { bestY = pri; target = it; }
    }
    let tx = target ? target.x : W / 2;
    for (const it of items) {
      if (it.type !== 'meteor') continue;
      const dy = CATCH_Y - it.y;
      if (dy > -20 && dy < 420 && Math.abs(it.x - tx) < catcher.w / 2 + it.r + 16) {
        tx = it.x < W / 2 ? it.x + catcher.w / 2 + it.r + 50 : it.x - catcher.w / 2 - it.r - 50;
      }
    }
    const dx = tx - catcher.x;
    if (dx < -14) api.input.hold('left');
    else if (dx > 14) api.input.hold('right');
  },

  drawCover(g, w, h, api) {
    g.save();
    const sx = w / 1280, sy = h / 720;
    g.scale(sx, sy);
    drawSky(g, api, 1280, 720, 3.2);
    drawComet(g, 900, 230, 46, -260, 420);
    drawStar(g, 300, 220, 48, 0.3, '#ffd23f');
    drawStar(g, 1080, 470, 34, 0.9, '#ffd23f');
    drawMeteor(g, 520, 420, 52, 0.5, api);
    drawHeart(g, 180, 470, 40, '#ff7aa8');
    drawCatcher(g, 640, 600, 300, 0, api);
    api.text('Comet Catcher', 640, 110, { size: 104, weight: 900, color: '#fff4b0', stroke: '#1a1350', strokeWidth: 14 });
    g.restore();
  },
});
