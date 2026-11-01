// Tideline save data: pearls, unlocked divers, daily best / daily goal, day streak.
import { SKINS } from './util.js';

export const prof = { pearls: 0, skin: 0, far: 0, runs: 0, streak: 0, lastDay: '', daily: { date: '', best: 0, goal: false } };
export const day = { key: '', goal: 200 };

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);

export function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayNum(key) {
  const p = String(key).split('-').map(Number);
  return Math.round(new Date(p[0], p[1] - 1, p[2]).getTime() / 86400000);
}
function goalFor(key) {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return 200 + (h % 6) * 50;
}

export function isUnlocked(i) {
  const s = SKINS[i];
  if (!s) return false;
  return s.dist ? prof.far >= s.dist : prof.pearls >= s.pearls;
}
export function unlockedCount() { return SKINS.filter((s, i) => isUnlocked(i)).length; }
export function reqText(i) {
  const s = SKINS[i];
  return s.dist ? `Reach ${s.dist} m in one dive (${Math.floor(prof.far)}/${s.dist})` : `Collect ${s.pearls} pearls (${prof.pearls}/${s.pearls})`;
}
export function reqRatio(i) {
  const s = SKINS[i];
  return Math.min(1, s.dist ? prof.far / s.dist : prof.pearls / Math.max(1, s.pearls));
}
export function nextLocked() {
  for (let i = 0; i < SKINS.length; i++) if (!SKINS[i].dist && !isUnlocked(i)) return i;
  for (let i = 0; i < SKINS.length; i++) if (!isUnlocked(i)) return i;
  return -1;
}

export function syncDay() {
  day.key = todayKey();
  day.goal = goalFor(day.key);
  if (prof.daily.date !== day.key) prof.daily = { date: day.key, best: 0, goal: false };
}
export function streakNow() {
  if (!prof.lastDay) return 0;
  const gap = dayNum(day.key) - dayNum(prof.lastDay);
  return gap <= 1 ? prof.streak : 0;
}

export function loadProfile(api) {
  const p = api.load('profile', null) || {};
  prof.pearls = Math.floor(num(p.pearls, 0));
  prof.far = Math.floor(num(p.far, 0));
  prof.runs = Math.floor(num(p.runs, 0));
  prof.streak = Math.floor(num(p.streak, 0));
  prof.lastDay = typeof p.lastDay === 'string' ? p.lastDay : '';
  const d = p.daily && typeof p.daily === 'object' ? p.daily : {};
  prof.daily = { date: String(d.date || ''), best: Math.floor(num(d.best, 0)), goal: !!d.goal };
  prof.skin = Math.min(SKINS.length - 1, Math.floor(num(p.skin, 0)));
  if (!isUnlocked(prof.skin)) prof.skin = 0;
  syncDay();
}
export function saveProfile(api) { api.save('profile', prof); }

// Called once per day when a dive starts.
export function touchStreak(api) {
  syncDay();
  if (prof.lastDay === day.key) return;
  const gap = prof.lastDay ? dayNum(day.key) - dayNum(prof.lastDay) : 99;
  prof.streak = gap === 1 ? prof.streak + 1 : 1;
  prof.lastDay = day.key;
  saveProfile(api);
}

// Bank the results of a finished dive. Returns a summary for the results screens.
export function bankDive(api, meters, pearls) {
  syncDay();
  const before = SKINS.map((s, i) => isUnlocked(i));
  const r = { meters, pearls, goalReward: 0, newSkins: [], dailyBest: false, record: meters > prof.far && prof.far > 0 };
  prof.pearls += pearls;
  prof.runs += 1;
  if (meters > prof.daily.best) { prof.daily.best = meters; r.dailyBest = true; }
  if (!prof.daily.goal && meters >= day.goal) {
    prof.daily.goal = true;
    r.goalReward = 10 + 5 * Math.min(4, Math.max(1, prof.streak));
    prof.pearls += r.goalReward;
  }
  if (meters > prof.far) prof.far = meters;
  SKINS.forEach((s, i) => { if (!before[i] && isUnlocked(i)) r.newSkins.push(i); });
  if (r.newSkins.length) prof.skin = r.newSkins[r.newSkins.length - 1];
  r.total = prof.pearls;
  saveProfile(api);
  return r;
}
