// Echo Cave - trophies, daily cave twists, profile storage and shared run state.

export const ACH = [
  { id: 'first', name: 'First Flight', desc: 'Fly 100 m' },
  { id: 'deep', name: 'Deep Diver', desc: 'Reach 500 m in one flight' },
  { id: 'blind', name: 'Blind Faith', desc: 'Fly 8 seconds without an echo' },
  { id: 'silent', name: 'Silent Wings', desc: 'Reach 300 m and never leave Calm' },
  { id: 'crystal', name: 'Crystal Ear', desc: 'Collect 40 crystals in total' },
  { id: 'lure', name: 'Decoy', desc: 'Make a hunter strike an empty echo' },
  { id: 'untouched', name: 'Untouched', desc: 'Reach 400 m without losing a wing' },
  { id: 'daily', name: 'Daily Diver', desc: 'Reach 200 m in a Daily Cave' },
  { id: 'habit', name: 'Night Shift', desc: 'Fly Daily Caves on 3 different days' },
  { id: 'abyss', name: 'Abyss Walker', desc: 'Reach 1500 m in one flight' },
];

export const MODS = [
  { id: 'tight', name: 'Tight Squeeze', gap: 0.86, sleep: 1, crys: 1, speed: 1, fade: 1 },
  { id: 'restless', name: 'Restless Roost', gap: 1, sleep: 1.9, crys: 1, speed: 1, fade: 1 },
  { id: 'vein', name: 'Crystal Vein', gap: 1, sleep: 1, crys: 2.2, speed: 1, fade: 1 },
  { id: 'swift', name: 'Swift Draft', gap: 1.06, sleep: 1, crys: 1, speed: 1.13, fade: 1 },
  { id: 'long', name: 'Long Echo', gap: 0.94, sleep: 1.2, crys: 1, speed: 1, fade: 0.65 },
];
export const NO_MOD = { id: 'none', name: '', gap: 1, sleep: 1, crys: 1, speed: 1, fade: 1 };

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function freshProfile() {
  return { v: 1, ach: {}, skin: 'dusk', crystals: 0, runs: 0, echoes: 0, bestM: 0, bestEndless: 0, daily: { date: '', best: 0 }, days: [], mode: 0 };
}

export function loadProfile(api) {
  const p = freshProfile();
  const s = api.load('profile', null);
  if (s && typeof s === 'object') {
    for (const k of Object.keys(p)) if (s[k] !== undefined && typeof s[k] === typeof p[k]) p[k] = s[k];
    p.ach = Object.assign({}, s.ach && typeof s.ach === 'object' ? s.ach : {});
    p.days = Array.isArray(s.days) ? s.days.filter(d => typeof d === 'string').slice(-60) : [];
    p.daily = s.daily && typeof s.daily === 'object' ? { date: String(s.daily.date || ''), best: Number(s.daily.best) || 0 } : { date: '', best: 0 };
  }
  return p;
}

export function calcStreak(days) {
  const set = new Set(days);
  const d = new Date();
  if (!set.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dateKey(d)) && n < 400) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Shared mutable state used by game.js (logic) and view.js (drawing).
export const S = {
  api: null,
  prof: freshProfile(),
  phase: 'roost', phaseT: 0,
  sel: 0, skinView: 0, infoAch: -1,
  mode: 'endless', mod: NO_MOD,
  dailyKey: '', dailySeed: 1, dailyMod: MODS[0], streak: 0,
  cave: null,
  bat: { x: 300, y: 360, vy: 0, rot: 0 },
  cam: 0, speed: 0,
  lives: 3, inv: 0, recoverT: 0, hits: 0,
  noise: 0, noiseHold: 0, cd: 0, wasLoud: false,
  blindFrom: 1e9, lastEchoT: -9, maxBlind: 0, lastMult: 1, echoCount: 0,
  points: 0, meters: 0, crystalsRun: 0, evaded: 0,
  echoes: [], hunters: [], echoId: 0, lastShade: -9,
  toasts: [], hintTxt: '', hintT: 0, hints: {},
  runNew: [], finalized: false, newDailyBest: false,
  proxK: 0, proxSide: 0, passedEntrance: false,
  roostPing: 0, rt: 0,
};
