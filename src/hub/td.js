// Poké Gacha tower defense: chapter 1 (Team Rocket grunts), the battle
// simulation, and the TD rewards and missions.
//
// The simulation is plain data stepped at a fixed rate, so it runs the same in
// the page and in tests. Classes come from each species' stats; nothing is
// hand-tagged except the healers. Rewards are wallet entries like every other
// grant (src/hub/rewards.js):
//   td:run:<uuid>             one finished battle: g = { waves }, x = { st, s, tm, d }
//                               stage, stars (0 = lost), team (species deployed), day
//   td:first:<stage>          first clear: 50 coins + 2 Regular
//   td:star3:<stage>          first 3-star: 100 coins + 1 Plus
//   td:admin:<stage>          first clear of a Rocket admin boss: 1 Gold (none in chapter 1)
//   td:daily:<day>:<id>|all   daily missions
//   td:week:<monday>:<id>|all weekly missions
//   spend:<uuid> x = { lv }   a level bought with coins
// 1 TD wave cleared = 1 hatch wave.
import { DEX, DEX_CHART, DEX_TYPES } from './gacha-dex.js';
import { dailyDate, seedNumber } from '../daily.js';
import { mergeWallet, walletBalance, grantOnce, spendFrom, readWallet, writeWallet } from './rewards.js';
import { gachaState, lineOf, mon, skillsOf, lookFor } from './gacha.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const seconds = now => Math.floor(now / 1000);
const uuid = () => globalThis.crypto?.randomUUID?.() || 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

/* ── Classes, derived from stats ─────────────────────────────────────── */

// The only hand-written list: the healers.
const HEALERS = new Set([113, 242, 440, 531]);
export const CLASSES = {
  vanguard: { name: 'Vanguard', ground: true, block: 1, range: 1.2, cost: 8, sp: 10, about: 'Cheap; its skill gives energy back.' },
  guard: { name: 'Guard', ground: true, block: 2, range: 1.2, cost: 13, sp: 20, about: 'Physical melee; blocks 2.' },
  blocker: { name: 'Blocker', ground: true, block: 3, range: 1.2, cost: 16, sp: 25, hp: 1.5, about: 'High HP and Defense; blocks 3.' },
  sniper: { name: 'Sniper', ground: false, block: 0, range: 3.2, cost: 12, sp: 20, air: true, about: 'Ranged physical; the only class that hits flying enemies.' },
  caster: { name: 'Caster', ground: false, block: 0, range: 2.6, cost: 17, sp: 25, splash: 0.9, about: 'Special Attack; hits an area.' },
  medic: { name: 'Medic', ground: false, block: 0, range: 2.6, cost: 15, sp: 20, heal: true, about: 'Heals allies in range.' }
};
export function classOf(num) {
  const m = mon(num);
  if (!m) return 'guard';
  if (HEALERS.has(num)) return 'medic';
  if (m.bst <= 360 && m.spe >= 70 && m.atk >= m.spa) return 'vanguard';
  if (m.hp + m.def > (m.atk + m.spa) * 1.15 && m.def >= 70) return 'blocker';
  if (m.spa > m.atk * 1.1) return 'caster';
  if (m.atk >= m.spa && m.spe >= m.def + 10) return 'sniper';
  return 'guard';
}

/* ── Chapter 1: the grunts ────────────────────────────────────────────── */

// Maps are 10×5 tiles: '#' no deploy, '.' ground (melee, and the path runs on
// it), 'H' high ground (ranged), 'S' where enemies come in, 'G' the goal.
// Waves: [seconds, species, count, gap between them]. Each line is one wave.
export const CHAPTER = { id: 1, name: 'Team Rocket Grunts', boss: 'Grunt boss' };
export const STAGES = [
  { id: '1-1', name: 'First patrol', lives: 3, level: 1, map: ['##H##H####', 'S........G', '##H##H####', '##########', '##########'],
    waves: [[3, 19, 3, 3], [16, 19, 4, 2.5]],
    before: ['Grunt: Hey! This route belongs to Team Rocket now.', 'Deploy a mon on the path to block, or on high ground to shoot.'],
    after: ['Grunt: Tch. That was just the first patrol.'] },
  { id: '1-2', name: 'Tall grass', lives: 3, level: 1.05, map: ['##########', 'S....H####', '####.H####', '#H.......G', '###H######'],
    waves: [[3, 19, 4, 2.5], [14, 41, 3, 3], [28, 19, 5, 2]],
    before: ['Grunt: Zubat, swarm them!', 'Enemies follow the path around corners. Block where they turn.'],
    after: ['Grunt: The bats were supposed to win that.'] },
  { id: '1-3', name: 'Snake pit', lives: 3, level: 1.1, map: ['####H#####', 'S.......H#', '####H#.###', '#H.....H##', '#G...H####'],
    waves: [[3, 23, 3, 3], [15, 19, 5, 2], [30, 23, 4, 2.5]],
    before: ['Grunt: Ekans bite back. Good luck.', 'Type matchups count: Ground and Psychic hit Poison hard.'],
    after: ['Grunt: Fine, fine. You can pass.'] },
  { id: '1-4', name: 'Rock slide', lives: 3, level: 1.15, map: ['##H###H###', 'S........#', '##H#.##H.#', '###H.....G', '##########'],
    waves: [[3, 27, 3, 3.5], [16, 19, 6, 1.8], [32, 27, 4, 3]],
    before: ['Grunt: Sandshrew shrugs off weak hits.', 'Casters and strong hitters break through high Defense.'],
    after: ['Grunt: My Sandshrew curled up and quit!'] },
  { id: '1-5', name: 'Fast feet', lives: 3, level: 1.2, map: ['#H#H#H#H##', 'S........G', '#H#H#H#H##', '##########', '##########'],
    waves: [[3, 52, 4, 2], [14, 21, 5, 1.8], [28, 52, 6, 1.5]],
    before: ['Grunt: Meowth and Spearow are faster than you.', 'Fast waves need blockers early on the path.'],
    after: ['Grunt: How did you keep up with that?'] },
  { id: '1-6', name: 'Two lanes', lives: 3, level: 1.3, map: ['S...H#####', '###....H##', '#H#H#.....', 'S.....H#.G', '#####H####'],
    waves: [[3, 23, 4, 2.5], [10, 41, 4, 2.5], [24, 19, 7, 1.5], [38, 27, 3, 3]],
    before: ['Grunt: Two paths, and you can only block so many!', 'Enemies come in from both ends of the map.'],
    after: ['Grunt: The boss will hear about this.'] },
  { id: '1-7', name: 'Night shift', lives: 3, level: 1.4, map: ['##H##H##H#', 'S.........', '##H##H##.#', '#G.......#', '###H##H###'],
    waves: [[3, 52, 5, 1.8], [16, 23, 5, 2], [30, 27, 4, 2.5], [44, 41, 7, 1.2]],
    before: ['Grunt: Everything we have, all at once!', 'Medics keep blockers standing through long waves.'],
    after: ['Grunt: Run! Tell the boss a trainer is coming!'] },
  { id: '1-8', name: 'Grunt boss', boss: true, lives: 3, level: 1.5, map: ['##H#H#H###', 'S........#', '#H#H.#H#.#', '#.......H#', '#G..H#####'],
    waves: [[3, 19, 6, 1.5], [16, 23, 5, 2], [30, 52, 5, 1.6], [42, 20, 1, 1, 6]],
    before: ['Grunt Boss: So you are the one beating my grunts.', 'Grunt Boss: Raticate, show them what Team Rocket can do!', 'The boss Raticate has four times the HP. Save your skills for it.'],
    after: ['Grunt Boss: Impossible... This is not over. The admins will deal with you.', 'Chapter 1 cleared. More of Team Rocket is coming.'] }
];
export const stageById = id => STAGES.find(stage => stage.id === id) || null;
export const W = 10, H = 5;

// The path from each spawn to the goal over ground tiles (breadth-first, so the shortest).
export function pathsOf(stage) {
  const at = (x, y) => (stage.map[y] || '')[x] || '#';
  const walk = (x, y) => ['.', 'S', 'G'].includes(at(x, y));
  let goal = null;
  const spawns = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (at(x, y) === 'G') goal = [x, y]; if (at(x, y) === 'S') spawns.push([x, y]); }
  return spawns.map(([sx, sy]) => {
    const prev = new Map([[sx + ',' + sy, null]]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === goal[0] && y === goal[1]) break;
      for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key) || !walk(nx, ny)) continue;
        prev.set(key, [x, y]);
        queue.push([nx, ny]);
      }
    }
    const path = [];
    for (let cell = goal; cell; cell = prev.get(cell[0] + ',' + cell[1])) path.unshift(cell);
    return path;
  });
}

/* ── Units and enemies ────────────────────────────────────────────────── */

const typeIndex = name => DEX_TYPES.indexOf(name);
// Attack type against a defender's types: the chart's 0, h, 1, 2. Immunity is
// softened to a quarter so no stage can be impossible.
export function typeMultiplier(attack, defend) {
  const row = DEX_CHART[typeIndex(attack)];
  if (!row) return 1;
  return defend.reduce((m, type) => {
    const c = row[typeIndex(type)];
    return m * (c === '0' ? 0.25 : c === 'h' ? 0.5 : c === '2' ? 2 : 1);
  }, 1);
}
export const MAX_LEVEL = 10;
export const levelCost = level => 40 * level;

/** A squad member's battle stats: level from coins, passive and cost cuts from candy. */
export function unitStats(num, { level = 1, passive = false, costCut = 0, skills = [true, false, false, false] } = {}) {
  const m = mon(num), cls = classOf(num), c = CLASSES[cls];
  const grow = 1 + 0.08 * (level - 1);
  const special = cls === 'caster' || cls === 'medic';
  const skillAt = skills[3] ? 3 : [2, 1, 0].find(i => skills[i]) ?? 0;
  return {
    num, cls, name: m.name, types: m.types,
    hp: Math.round((m.hp * 5 + 140) * grow * (c.hp || 1)),
    atk: Math.round((special ? m.spa : m.atk) * 1.3 * grow * (passive ? 1.1 : 1)),
    def: Math.round(m.def * 0.6 * grow),
    interval: Math.max(0.6, Math.min(1.6, 1.7 - m.spe / 140)),
    cost: Math.max(4, c.cost + Math.round(m.bst / 160) - 2 - costCut),
    block: c.block, range: c.range, ground: c.ground, spMax: c.sp,
    skill: skillsOf(num)[skillAt], rare: skillAt === 3
  };
}
export function enemyStats(num, level, boss = false) {
  const m = mon(num);
  return {
    num, name: m.name, types: m.types, flying: false,
    hp: Math.round((m.hp * 3 + 50) * level * (boss ? 4 : 1)),
    atk: Math.round(m.atk * 0.9 * level * (boss ? 1.5 : 1)),
    def: Math.round(m.def * 0.5 * level),
    speed: 0.45 + m.spe / 260,
    interval: 1.2
  };
}
const hit = (atk, def, mult) => Math.max(1, Math.round(Math.max(atk * 0.2, atk - def * 0.6) * mult));

/* ── The battle ──────────────────────────────────────────────────────── */

export const TICK = 0.05;
export const REDEPLOY = 18;
export const START_ENERGY = 10;

/** A fresh battle. `squad` is up to 8 unitStats(). */
export function newBattle(stage, squad) {
  const paths = pathsOf(stage);
  const queue = [];
  stage.waves.forEach(([at, num, count, gap, boss], wave) => {
    for (let i = 0; i < count; i++) queue.push({ at: at + i * gap, num, wave, path: (i + wave) % paths.length, boss: !!boss });
  });
  queue.sort((a, b) => a.at - b.at);
  return { stage, paths, squad: squad.slice(0, 8), t: 0, energy: START_ENERGY, life: stage.lives, queue, spawned: 0,
    units: [], enemies: [], waveLeft: stage.waves.map(w => w[2]), wavesDone: 0, leaks: 0, kills: 0,
    deployed: new Set(), cooldown: {}, nextId: 1, over: null, log: [] };
}
const tileAt = (b, x, y) => (b.stage.map[y] || '')[x] || '#';
export function canDeploy(b, slot, x, y) {
  const u = b.squad[slot];
  if (!u || b.over) return 'none';
  if (b.units.some(unit => unit.slot === slot)) return 'deployed';
  if ((b.cooldown[slot] || 0) > b.t) return 'cooldown';
  if (b.energy < u.cost) return 'energy';
  const tile = tileAt(b, x, y);
  if (u.ground ? tile !== '.' : tile !== 'H') return 'tile';
  if (b.units.some(unit => unit.x === x && unit.y === y)) return 'taken';
  return null;
}
export function deploy(b, slot, x, y) {
  const why = canDeploy(b, slot, x, y);
  if (why) return why;
  const u = b.squad[slot];
  b.energy -= u.cost;
  b.units.push({ ...u, id: b.nextId++, slot, x, y, maxHp: u.hp, cd: 0, sp: 0, blocking: [] });
  b.deployed.add(u.num);
  return null;
}
export function retreat(b, id) {
  const i = b.units.findIndex(unit => unit.id === id);
  if (i < 0) return false;
  const [unit] = b.units.splice(i, 1);
  b.energy = Math.min(99, b.energy + Math.floor(unit.cost / 2));
  b.cooldown[unit.slot] = b.t + REDEPLOY;
  for (const e of b.enemies) if (e.blockedBy === unit.id) e.blockedBy = null;
  return true;
}
const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);
function finishWaveFor(b, e) {
  b.waveLeft[e.wave]--;
  if (b.waveLeft[e.wave] === 0) b.wavesDone++;
}
function useSkill(b, u) {
  const power = u.rare ? 1.3 : 1;
  if (u.cls === 'vanguard') b.energy = Math.min(99, b.energy + Math.round(8 * power));
  else if (u.cls === 'blocker') u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.4 * power));
  else if (u.cls === 'medic') { for (const a of b.units) if (dist(a, u.x, u.y) <= u.range) a.hp = Math.min(a.maxHp, a.hp + Math.round(u.atk * 1.5 * power)); }
  else {
    const targets = b.enemies.filter(e => dist(e, u.x, u.y) <= u.range + 0.5);
    const list = u.cls === 'caster' ? targets : targets.slice(0, u.cls === 'sniper' ? 3 : 1);
    for (const e of list) e.hp -= hit(u.atk, e.def, typeMultiplier(u.types[0], e.types)) * (u.cls === 'guard' ? 3 : 1.5) * power;
  }
  b.log.push({ t: b.t, skill: u.skill, unit: u.id });
}

/** Advance the battle by one tick. Returns the battle. */
export function step(b, dt = TICK) {
  if (b.over) return b;
  b.t += dt;
  b.energy = Math.min(99, b.energy + dt);
  // Spawns.
  while (b.queue.length && b.queue[0].at <= b.t) {
    const s = b.queue.shift();
    const path = b.paths[s.path];
    b.enemies.push({ ...enemyStats(s.num, b.stage.level, s.boss), id: b.nextId++, wave: s.wave, boss: s.boss, path, seg: 0,
      x: path[0][0], y: path[0][1], cd: 0, blockedBy: null, maxHp: 0 });
    const e = b.enemies[b.enemies.length - 1];
    e.maxHp = e.hp;
    b.spawned++;
  }
  // Movement and blocking.
  for (const e of b.enemies) {
    if (e.blockedBy && !b.units.some(u => u.id === e.blockedBy)) e.blockedBy = null;
    if (e.blockedBy) continue;
    const tx = Math.round(e.x), ty = Math.round(e.y);
    const blocker = b.units.find(u => u.ground && u.x === tx && u.y === ty && Math.abs(e.x - tx) + Math.abs(e.y - ty) < 0.35 &&
      b.enemies.filter(o => o.blockedBy === u.id).length < u.block);
    if (blocker) { e.blockedBy = blocker.id; continue; }
    let move = e.speed * dt;
    while (move > 0 && e.seg < e.path.length - 1) {
      const [nx, ny] = e.path[e.seg + 1];
      const d = Math.hypot(nx - e.x, ny - e.y);
      if (d <= move) { e.x = nx; e.y = ny; e.seg++; move -= d; } else { e.x += (nx - e.x) / d * move; e.y += (ny - e.y) / d * move; move = 0; }
    }
    if (e.seg >= e.path.length - 1) { e.leaked = true; b.life--; b.leaks++; finishWaveFor(b, e); }
  }
  b.enemies = b.enemies.filter(e => !e.leaked);
  // Units act.
  for (const u of b.units) {
    u.sp = Math.min(u.spMax, u.sp + dt);
    if (u.sp >= u.spMax && (u.cls === 'vanguard' || u.cls === 'blocker' && u.hp < u.maxHp * 0.6 || u.cls === 'medic' && b.units.some(a => a.hp < a.maxHp) ||
        b.enemies.some(e => dist(e, u.x, u.y) <= u.range))) { useSkill(b, u); u.sp = 0; }
    u.cd -= dt;
    if (u.cd > 0) continue;
    if (u.cls === 'medic') {
      const hurt = b.units.filter(a => a.hp < a.maxHp && dist(a, u.x, u.y) <= u.range).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
      if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + Math.round(u.atk * 0.9)); u.cd = u.interval; }
      continue;
    }
    const inRange = b.enemies.filter(e => e.blockedBy === u.id || dist(e, u.x, u.y) <= u.range);
    if (!inRange.length) continue;
    // The enemy closest to the goal first, as in Arknights.
    const target = inRange.sort((a, c) => (c.seg + (c.blockedBy === u.id ? 99 : 0)) - (a.seg + (a.blockedBy === u.id ? 99 : 0)))[0];
    const victims = u.cls === 'caster' ? b.enemies.filter(e => dist(e, target.x, target.y) <= CLASSES.caster.splash) : [target];
    for (const e of victims) e.hp -= hit(u.atk, e.def, typeMultiplier(u.types[0], e.types));
    u.cd = u.interval;
  }
  // Enemies hit whoever blocks them.
  for (const e of b.enemies) {
    if (!e.blockedBy) continue;
    e.cd -= dt;
    if (e.cd > 0) continue;
    const u = b.units.find(unit => unit.id === e.blockedBy);
    if (u) u.hp -= hit(e.atk, u.def, typeMultiplier(e.types[0], u.types));
    e.cd = e.interval;
  }
  // The fallen.
  for (const e of b.enemies) if (e.hp <= 0) { b.kills++; finishWaveFor(b, e); }
  b.enemies = b.enemies.filter(e => e.hp > 0);
  for (const u of b.units) if (u.hp <= 0) b.cooldown[u.slot] = b.t + REDEPLOY;
  const fallen = new Set(b.units.filter(u => u.hp <= 0).map(u => u.id));
  if (fallen.size) { b.units = b.units.filter(u => u.hp > 0); for (const e of b.enemies) if (fallen.has(e.blockedBy)) e.blockedBy = null; }
  if (b.life <= 0) b.over = 'lose';
  else if (!b.queue.length && !b.enemies.length) b.over = 'win';
  return b;
}
export function starsFor(b) {
  if (b.over !== 'win') return 0;
  return b.leaks === 0 ? 3 : b.leaks === 1 ? 2 : 1;
}

/* ── Rewards and missions ─────────────────────────────────────────────── */

export const FIRST_CLEAR = { coins: 50, regular: 2 };
export const FIRST_STAR3 = { coins: 100, plus: 1 };
export const ADMIN_CLEAR = { gold: 1 };
export const DAILY_REWARD = { coins: 50, waves: 5 };
export const DAILY_ALL = { plus: 1 };
export const WEEKLY_REWARD = { plus: 1 };
export const WEEKLY_ALL = { gold: 1 };
export const DAILY_POOL = [
  { id: 'clear', label: 'Clear any stage' },
  { id: 'star3', label: '3-star a stage' },
  { id: 'mono', label: 'Clear using only one type' },
  { id: 'five', label: 'Clear with 5 or fewer mons deployed' },
  { id: 'admin', label: 'Clear a Rocket admin stage' },
  { id: 'big', label: 'Use a 5★ or better in a clear' }
];
export const WEEKLY = [
  { id: 'star3x5', label: '3-star 5 stages' },
  { id: 'daily5', label: 'Finish all daily missions on 5 days' },
  { id: 'boss5', label: 'Beat the Poké Idle daily boss on 5 days', later: true },
  { id: 'teams3', label: 'Clear one stage with 3 different teams' },
  { id: 'doku10', label: 'Finish 10 Pokédoku dailies' }
];
const shiftDay = (date, days) => { const at = new Date(date + 'T00:00:00Z'); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10); };
export function mondayOf(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return shiftDay(date, -((dow + 6) % 7));
}
/** Today's 4 daily missions, the same for everyone. Admin stages only once a chapter has one. */
export function dailyMissions(date) {
  const pool = DAILY_POOL.filter(m => m.id !== 'admin' || STAGES.some(s => s.admin));
  let seed = seedNumber('td:' + date) || 1;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const list = pool.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, 4);
}
function runs(entries) {
  const out = [];
  for (const [id, entry] of Object.entries(entries)) {
    if (!id.startsWith('td:run:')) continue;
    const x = object(entry.x);
    if (!stageById(x.st) || !Array.isArray(x.tm) || typeof x.d !== 'string') continue;
    out.push({ stage: x.st, stars: Number(x.s) || 0, team: x.tm.filter(n => Number.isInteger(n) && n >= 1 && n <= DEX.length), day: x.d, at: entry.at });
  }
  return out;
}
const sharesType = team => team.length > 0 && mon(team[0]).types.some(type => team.every(num => mon(num).types.includes(type)));
const lineStar = num => (DEX[lineOf(num) - 1] || [])[9] || 0;
function dailyDone(id, list) {
  const won = list.filter(r => r.stars > 0);
  if (id === 'clear') return won.length > 0;
  if (id === 'star3') return won.some(r => r.stars === 3);
  if (id === 'mono') return won.some(r => sharesType(r.team));
  if (id === 'five') return won.some(r => r.team.length <= 5);
  if (id === 'admin') return won.some(r => stageById(r.stage).admin);
  if (id === 'big') return won.some(r => r.team.some(num => lineStar(num) >= 5));
  return false;
}
function weeklyDone(id, entries, list, monday) {
  const inWeek = day => day >= monday && day < shiftDay(monday, 7);
  const week = list.filter(r => r.stars > 0 && inWeek(r.day));
  if (id === 'star3x5') return new Set(week.filter(r => r.stars === 3).map(r => r.stage)).size >= 5;
  if (id === 'daily5') return Object.keys(entries).filter(k => /^td:daily:\d{4}-\d{2}-\d{2}:all$/.test(k) && inWeek(k.slice(9, 19))).length >= 5;
  if (id === 'teams3') {
    const teams = {};
    for (const r of week) (teams[r.stage] ||= new Set()).add(r.team.slice().sort((a, b) => a - b).join(','));
    return Object.values(teams).some(set => set.size >= 3);
  }
  if (id === 'doku10') return Object.keys(entries).filter(k => /^pdoku:daily:[a-z]+:\d{4}-\d{2}-\d{2}$/.test(k) && inWeek(k.slice(-10))).length >= 10;
  return false;
}
/** Grant whatever missions are now complete. */
function claimMissions(wallet, today, now) {
  let next = mergeWallet(wallet);
  const list = runs(next.entries);
  const todays = list.filter(r => r.day === today);
  const daily = dailyMissions(today);
  for (const m of daily) if (dailyDone(m.id, todays)) next = grantOnce(next, 'td:daily:' + today + ':' + m.id, DAILY_REWARD, { now }).wallet;
  if (daily.every(m => next.entries['td:daily:' + today + ':' + m.id])) next = grantOnce(next, 'td:daily:' + today + ':all', DAILY_ALL, { now }).wallet;
  const monday = mondayOf(today);
  for (const m of WEEKLY) if (!m.later && weeklyDone(m.id, next.entries, list, monday)) next = grantOnce(next, 'td:week:' + monday + ':' + m.id, WEEKLY_REWARD, { now }).wallet;
  if (WEEKLY.every(m => next.entries['td:week:' + monday + ':' + m.id])) next = grantOnce(next, 'td:week:' + monday + ':all', WEEKLY_ALL, { now }).wallet;
  return next;
}
/** Mission and stage progress for the screens. */
export function tdState(wallet, today = dailyDate()) {
  const merged = mergeWallet(wallet);
  const e = merged.entries;
  const list = runs(e);
  const best = {};
  for (const r of list) best[r.stage] = Math.max(best[r.stage] || 0, r.stars);
  const monday = mondayOf(today);
  const levels = {};
  for (const entry of Object.values(e)) {
    const x = object(entry.x);
    if (Number.isInteger(x.lv) && Number.isInteger(x.to)) levels[x.lv] = Math.max(levels[x.lv] || 1, Math.min(MAX_LEVEL, x.to));
  }
  return {
    best, levels,
    unlocked: STAGES.map((s, i) => i === 0 || (best[STAGES[i - 1].id] || 0) > 0),
    daily: dailyMissions(today).map(m => ({ ...m, done: !!e['td:daily:' + today + ':' + m.id] })),
    dailyAll: !!e['td:daily:' + today + ':all'],
    weekly: WEEKLY.map(m => ({ ...m, done: !!e['td:week:' + monday + ':' + m.id] })),
    weeklyAll: !!e['td:week:' + monday + ':all'],
    monday
  };
}
/**
 * Record a finished battle and pay for it: waves cleared, first clears, first
 * 3-stars, the starter mission and any missions now complete. `team` is the
 * species that were deployed.
 */
export function tdFinish(wallet, { stage, stars, team = [], waves = 0 } = {}, { today = dailyDate(), now = Date.now() } = {}) {
  const s = stageById(stage);
  if (!s || !Number.isInteger(stars) || stars < 0 || stars > 3) return { wallet: mergeWallet(wallet), ok: false, reason: 'unknown' };
  const state = gachaState(wallet, today);
  const deployed = [...new Set(team)].filter(num => state.owned.includes(num)).slice(0, 8);
  if (!state.active) return { wallet: mergeWallet(wallet), ok: false, reason: 'inactive' };
  const cleared = Math.max(0, Math.min(s.waves.length, Math.floor(waves)));
  let next = mergeWallet(wallet);
  next.entries['td:run:' + uuid()] = { at: seconds(now), ...(cleared ? { g: { waves: cleared } } : {}), x: { st: s.id, s: stars, tm: deployed, d: today } };
  const before = Object.keys(next.entries).length;
  if (stars > 0) {
    next = grantOnce(next, 'td:first:' + s.id, FIRST_CLEAR, { now }).wallet;
    if (s.admin) next = grantOnce(next, 'td:admin:' + s.id, ADMIN_CLEAR, { now }).wallet;
    if (s.id === '1-1') next = grantOnce(next, 'gacha:start:stage', { regular: 2 }, { now }).wallet;
  }
  if (stars === 3) next = grantOnce(next, 'td:star3:' + s.id, FIRST_STAR3, { now }).wallet;
  next = claimMissions(next, today, now);
  return { wallet: next, ok: true, waves: cleared, newGrants: Object.keys(next.entries).length - before };
}
/** Buy a level for a line with coins. */
export function levelUp(wallet, line, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  if (!state.lines[line]) return { wallet: mergeWallet(wallet), ok: false, reason: 'not-owned' };
  const level = tdState(wallet, today).levels[line] || 1;
  if (level >= MAX_LEVEL) return { wallet: mergeWallet(wallet), ok: false, reason: 'owned' };
  const result = spendFrom(wallet, { coins: levelCost(level) }, { id: uuid(), now, x: { lv: line, to: level + 1 } });
  return result.ok ? { wallet: result.wallet, ok: true } : { wallet: mergeWallet(wallet), ok: false, reason: 'coins' };
}
/** The squad's battle stats from the wallet: levels, passives, cost cuts, unlocked skills. */
export function squadFrom(wallet, species, today = dailyDate()) {
  const state = gachaState(wallet, today), td = tdState(wallet, today);
  return species.filter(num => state.owned.includes(num)).slice(0, 8).map(num => {
    const l = state.lines[lineOf(num)] || {};
    return { ...unitStats(num, { level: td.levels[lineOf(num)] || 1, passive: !!l.passive, costCut: l.cost || 0, skills: l.skills || [true, false, false, false] }),
      look: lookFor(state, num), level: td.levels[lineOf(num)] || 1 };
  });
}

/* ── The bridge, merged into parent.__boredGacha.td ─────────────────── */
export function tdBridge({ onChange = () => {} } = {}) {
  const act = run => (options = {}) => {
    const { wallet, ...result } = run(readWallet(), options);
    if (result.ok && wallet) { writeWallet(wallet); try { onChange(); } catch {} }
    return result;
  };
  return {
    stages: STAGES, chapter: CHAPTER, classes: CLASSES, W, H, TICK, REDEPLOY, maxLevel: MAX_LEVEL, levelCost,
    classOf, pathsOf, newBattle, step, deploy, retreat, canDeploy, starsFor, typeMultiplier,
    state: () => tdState(readWallet()),
    squad: species => squadFrom(readWallet(), species),
    finish: act((w, o) => tdFinish(w, o)),
    levelUp: act((w, o) => levelUp(w, o.line))
  };
}
