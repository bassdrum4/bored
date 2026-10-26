/*
 * Pastel Tanks as rules rather than as a canvas.
 *
 * A Bored Together match stores only its seed, the shots that were fired and
 * the power-ups those shots produced. Both players replay that list through
 * this file, so the board, the damage and the winner are recomputed on each
 * side instead of being reported by whichever client moved.
 *
 * Everything here is deterministic: the terrain comes from the seed, the
 * power-up stream is a seeded random function of the shot index, and nothing
 * reads the clock, the DOM or Math.random. content/tank2.html mirrors the five
 * terrain functions for offline play; tests/tank-engine.test.cjs compares every
 * column of every layout so the two cannot drift.
 */

export const RULES = 1;
export const W = 960;
export const H = 540;
export const BEDY = H - 25;
export const G = 0.1;
export const MAXPW = 20;
export const MINPW = 1;
export const PWF = 0.5;
export const BLEN = 20;
export const MAXHP = 100;
export const FUELMAX = 100;
export const FUELCOST = 0.25;
export const MOVESP = 1.5;
export const TW = 26;
export const TH = 12;
export const TRH = 5;
export const MAXPU = 5;
export const WEAPONS = Object.freeze(['standard', 'heavy', 'cluster', 'nuke']);
export const RANGE = Object.freeze({ standard: 30, heavy: 48, cluster: 20, cluster_child: 16, nuke: 65 });
export const DAMAGE = Object.freeze({
  standard: [20, 50], heavy: [30, 65], cluster: [10, 25], cluster_child: [8, 20], nuke: [40, 90]
});
export const LAYOUTS = Object.freeze(['Rolling Hills', 'Mountains', 'Valley', 'Dunes', 'Plateau']);
// Same weights the single-player game picks power-ups with.
export const POWERUPS = Object.freeze([
  { key: 'heavy', name: 'Heavy', sym: 'H', weight: 20 },
  { key: 'cluster', name: 'Cluster', sym: 'C', weight: 16 },
  { key: 'nuke', name: 'Nuke', sym: 'N', weight: 5 },
  { key: 'fuel', name: 'Fuel', sym: 'F', weight: 18 },
  { key: 'heal', name: 'Heal', sym: '+', weight: 13 },
  { key: 'shield', name: 'Shield', sym: 'S', weight: 16 },
  { key: 'teleport', name: 'Teleport', sym: 'T', weight: 10 }
]);

/* ── Terrain ─────────────────────────────────────────────────────────────── */

function hills(x, phase) {
  const h = H * .55 + Math.sin(x * .002 + 1 + phase) * 50 + Math.sin(x * .009 + 2) * 25 +
    Math.sin(x * .025 + .5) * 12 + Math.sin(x * .07 + 3) * 6;
  return Math.max(H * .32, Math.min(BEDY - 15, h));
}
function mountains(x, phase) {
  const h = H * .48 + Math.sin(x * .003 + phase) * 65 + Math.sin(x * .013 + 1) * 32 +
    Math.sin(x * .038 + 2) * 16 + Math.sin(x * .09 + .5) * 7;
  return Math.max(H * .15, Math.min(BEDY - 15, h));
}
function valley(x, phase) {
  const d = Math.abs(x - W / 2) / (W / 2);
  const h = H * .42 + d * 110 + Math.sin(x * .01 + phase) * 15 + Math.sin(x * .035 + 1) * 8;
  return Math.max(H * .3, Math.min(BEDY - 15, h));
}
function dunes(x, phase) {
  const h = H * .52 + Math.sin(x * .004 + .5 + phase) * 35 + Math.sin(x * .016 + 2) * 18 +
    Math.sin(x * .05 + 1) * 8 + Math.sin(x * .13) * 3;
  return Math.max(H * .35, Math.min(BEDY - 15, h));
}
function plateau(x, phase) {
  let h = H * .58;
  h -= Math.exp(-((x - W * .22) ** 2) / (2 * 85 ** 2)) * 110;
  h -= Math.exp(-((x - W * .5) ** 2) / (2 * 70 ** 2)) * 80;
  h -= Math.exp(-((x - W * .78) ** 2) / (2 * 85 ** 2)) * 110;
  h += Math.sin(x * .01 + phase) * 8 + Math.sin(x * .035) * 4;
  return Math.max(H * .18, Math.min(BEDY - 15, h));
}
const LAYOUT_FNS = [hills, mountains, valley, dunes, plateau];

export function terrain(layout = 0, phase = 0) {
  const fn = LAYOUT_FNS[((layout % 5) + 5) % 5];
  const out = new Float64Array(W);
  for (let x = 0; x < W; x++) out[x] = fn(x, phase);
  return out;
}

/* ── Seeded randomness ───────────────────────────────────────────────────── */

export function random(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const stream = (seed, index) => random((seed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0);

/* ── Board ───────────────────────────────────────────────────────────────── */

const height = (board, x) => board[Math.max(0, Math.min(W - 1, Math.round(x)))];

function makeTank(xp) {
  return { x: Math.round(W * xp), hp: MAXHP, angle: 45, fuel: FUELMAX, ammo: { heavy: 0, cluster: 0, nuke: 0 }, shield: false };
}

// Both tanks start on a level spot, and far enough apart to shoot at each other.
function settle(tanks, board) {
  for (const tank of tanks) {
    let best = tank.x, score = Infinity;
    for (let cx = tank.x - 60; cx <= tank.x + 60; cx++) {
      if (cx < 30 || cx > W - 30) continue;
      let sum = 0;
      for (let d = -8; d <= 8; d++) sum += Math.abs(height(board, cx + d) - height(board, cx));
      if (sum < score) { score = sum; best = cx; }
    }
    tank.x = best;
  }
  if (Math.abs(tanks[0].x - tanks[1].x) < 120) {
    tanks[0].x = Math.max(50, tanks[0].x - 60);
    tanks[1].x = Math.min(W - 50, tanks[1].x + 60);
  }
  return tanks;
}

export function opening(seed) {
  return { seed: (seed >>> 0) || 1, shots: [], turn: 1, winner: null };
}

function worldFrom(state) {
  const seed = (state?.seed >>> 0) || 1;
  const board = terrain(seed % 5, ((seed >>> 8) % 1000) / 1000);
  return {
    seed, board, layout: seed % 5,
    tanks: settle([makeTank(.15), makeTank(.85)], board),
    powerups: [], nextPU: 1, turn: 1, winner: null,
    trails: [], bursts: [], events: []
  };
}

/* ── Damage and craters ──────────────────────────────────────────────────── */

function crater(board, cx, cy, r) {
  const from = Math.max(0, Math.floor(cx - r)), to = Math.min(W - 1, Math.ceil(cx + r));
  for (let x = from; x <= to; x++) {
    const dy = Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
    board[x] = Math.min(Math.max(board[x], cy + dy), BEDY);
  }
}

function damage(world, cx, cy, r, type) {
  const [low, high] = DAMAGE[type] || DAMAGE.standard;
  for (const tank of world.tanks) {
    const ground = height(world.board, tank.x);
    const centerY = ground - TRH - TH / 2;
    const d = Math.hypot(tank.x - cx, centerY - cy);
    if (d >= r + TW / 2) continue;
    let hit = Math.round(low + Math.max(0, 1 - d / (r + TW / 2)) * (high - low));
    if (tank.shield) { hit = Math.min(15, hit); tank.shield = false; world.events.push({ kind: 'shield', tank: world.tanks.indexOf(tank) + 1 }); }
    tank.hp = Math.max(0, tank.hp - hit);
    world.events.push({ kind: 'hit', tank: world.tanks.indexOf(tank) + 1, damage: hit });
  }
}

function burst(world, x, y, type, index) {
  const r = RANGE[type] || RANGE.standard;
  crater(world.board, x, y, r);
  damage(world, x, y, r, type);
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const pu = world.powerups[i];
    if (Math.hypot(pu.x - x, pu.y - y) < r + 8) world.powerups.splice(i, 1);
  }
  world.bursts.push({ x, y, r, type, at: index });
  if (type === 'cluster') {
    const rand = stream(world.seed, index * 7 + 3);
    const spread = [[-3.5, -5], [-2, -6], [-.5, -6.5], [.5, -6.5], [2, -6], [3.5, -5]];
    for (const [vx, vy] of spread) {
      world.events.push({ kind: 'child', x, y, vx: vx + (rand() - .5) * .5, vy: vy + (rand() - .5) * .5, at: index });
    }
  }
}

/* ── Projectiles ─────────────────────────────────────────────────────────── */

function fly(world, shot, index) {
  const start = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy };
  const trail = [{ x: start.x, y: start.y }];
  let { x, y, vx, vy } = start;
  for (let step = 0; step < 900; step++) {
    x += vx; y += vy; vy += G;
    trail.push({ x, y });
    if (x < -20 || x > W + 20 || y > BEDY + 50) { world.trails.push(trail); return; }
    const sx = Math.round(x);
    if (sx >= 0 && sx < W && y >= world.board[sx]) { world.trails.push(trail); burst(world, x, y, shot.type, index); return; }
    let struck = false;
    for (const tank of world.tanks) {
      const ground = height(world.board, tank.x), centerY = ground - TRH - TH / 2;
      if (Math.abs(x - tank.x) < TW / 2 + 5 && Math.abs(y - centerY) < TH / 2 + TRH + 5) { struck = true; break; }
    }
    if (struck) { world.trails.push(trail); burst(world, x, y, shot.type, index); return; }
  }
  world.trails.push(trail);
}

function fire(world, tank, seat, weapon, power, index) {
  const dir = seat === 1 ? 1 : -1;
  const ar = tank.angle * Math.PI / 180;
  const ground = height(world.board, tank.x);
  const pivotY = ground - TRH - TH;
  const cos = Math.cos(ar), sin = Math.sin(ar);
  const speed = Math.max(power, 1) * PWF;
  const shot = {
    x: tank.x + dir * cos * BLEN, y: pivotY - sin * BLEN,
    vx: dir * cos * speed, vy: -sin * speed, type: weapon
  };
  fly(world, shot, index);
  // Cluster shells spawn children once they land; send those through the same
  // flight so both players get an identical set of craters.
  let guard = 0;
  while (world.events.some(e => e.kind === 'child') && guard++ < 12) {
    const child = world.events.find(e => e.kind === 'child');
    world.events.splice(world.events.indexOf(child), 1);
    const trailBefore = world.trails.length;
    fly(world, { x: child.x, y: child.y, vx: child.vx, vy: child.vy, type: 'cluster_child' }, index);
    if (world.trails.length > trailBefore) world.trails[world.trails.length - 1].child = true;
  }
}

/* ── Power-ups ───────────────────────────────────────────────────────────── */

function spawnPowerup(world, rand) {
  if (world.powerups.length >= MAXPU) return;
  const total = POWERUPS.reduce((n, p) => n + p.weight, 0);
  let roll = rand() * total, pick = POWERUPS[0];
  for (const pu of POWERUPS) { roll -= pu.weight; if (roll <= 0) { pick = pu; break; } }
  const x = 80 + rand() * (W - 160);
  world.powerups.push({ x, y: height(world.board, x) - 8, key: pick.key, sym: pick.sym });
}

function collect(world, tank, powerup, index) {
  const rand = stream(world.seed, index * 13 + 5);
  const key = powerup.key;
  if (key === 'heavy' || key === 'cluster' || key === 'nuke') tank.ammo[key] = (tank.ammo[key] || 0) + (key === 'nuke' ? 1 : 2);
  else if (key === 'fuel') tank.fuel = Math.min(FUELMAX, tank.fuel + 35);
  else if (key === 'heal') tank.hp = Math.min(MAXHP, tank.hp + 25);
  else if (key === 'shield') tank.shield = true;
  else if (key === 'teleport') {
    let next = tank.x, tries = 0;
    do { next = 60 + rand() * (W - 120); tries++; }
    while (tries < 80 && (Math.abs(height(world.board, next) - height(world.board, next - 10)) > 8 ||
      Math.abs(height(world.board, next) - height(world.board, next + 10)) > 8));
    tank.x = next;
  }
  world.events.push({ kind: 'powerup', key });
}

/* ── A shot ──────────────────────────────────────────────────────────────── */

const clampX = x => Math.max(20, Math.min(W - 20, x));

export function validateShot(world, shot, seat) {
  if (!world || !shot) return 'That move is missing.';
  if (world.winner) return 'This game is over.';
  if (seat !== 1 && seat !== 2) return 'Unknown player.';
  if (world.turn !== seat) return 'It is not your turn.';
  const x = Number(shot.x), angle = Number(shot.angle), power = Number(shot.power);
  if (!Number.isFinite(x) || Math.round(x) !== x || x < 20 || x > W - 20) return 'That is off the field.';
  if (!Number.isFinite(angle) || Math.round(angle) !== angle || angle < 5 || angle > 85) return 'Aim between 5 and 85 degrees.';
  if (!Number.isFinite(power) || power < MINPW || power > MAXPW) return 'Power is between 1 and 20.';
  if (!WEAPONS.includes(shot.weapon)) return 'Unknown weapon.';
  const tank = world.tanks[seat - 1];
  if (Math.abs(x - tank.x) / MOVESP * FUELCOST > tank.fuel + 1e-9) return 'Not enough fuel to drive there.';
  if (shot.weapon !== 'standard' && !(tank.ammo[shot.weapon] > 0)) return 'No ' + shot.weapon + ' shells left.';
  return null;
}

function takeShot(world, shot, index) {
  const seat = shot.seat === 2 ? 2 : 1;
  const tank = world.tanks[seat - 1];
  const from = tank.x;
  const to = clampX(Number(shot.x));
  tank.fuel = Math.max(0, tank.fuel - Math.abs(to - from) / MOVESP * FUELCOST);
  const low = Math.min(from, to) - TW / 2 - 16, high = Math.max(from, to) + TW / 2 + 16;
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const pu = world.powerups[i];
    if (pu.x >= low && pu.x <= high) { collect(world, tank, pu, index); world.powerups.splice(i, 1); }
  }
  tank.x = to;
  tank.angle = Number(shot.angle);
  if (shot.weapon !== 'standard') tank.ammo[shot.weapon] = Math.max(0, (tank.ammo[shot.weapon] || 0) - 1);
  fire(world, tank, seat, shot.weapon, Number(shot.power), index);

  const dead = world.tanks.map(t => t.hp <= 0);
  if (dead[0] || dead[1]) {
    // A mutual kill hands the round to the player who did not just fire, which
    // is the rule the single-player game already uses.
    world.winner = dead[0] && dead[1] ? 3 - seat : (dead[0] ? 2 : 1);
  }
  world.turn = world.winner ? 0 : 3 - seat;

  const rand = stream(world.seed, index * 3 + 1);
  const nextShot = index + 1;
  if (nextShot >= world.nextPU && world.powerups.length < MAXPU) {
    spawnPowerup(world, rand);
    world.nextPU = nextShot + 1 + Math.floor(rand() * 2);
    if (rand() < .35) spawnPowerup(world, rand);
  }
  return world;
}

/* ── Public replay ───────────────────────────────────────────────────────── */

/**
 * Recompute a match from its seed and shot list. A malformed shot stops the
 * replay rather than throwing, so one bad row cannot blank the board.
 */
export function replay(state) {
  const world = worldFrom(state);
  const shots = Array.isArray(state?.shots) ? state.shots : [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    if (world.winner) break;
    const seat = Number(shot?.seat) === 2 ? 2 : 1;
    if (validateShot(world, shot, seat)) break;
    takeShot(world, shot, i);
  }
  if (world.winner) world.turn = 0;
  else world.turn = Number(state?.turn) === 2 ? 2 : 1;
  world.shotCount = shots.length;
  return world;
}

/**
 * Play one shot forward. Returns the stored state after it and the world that
 * produced it, so the caller can draw the arc it just sent.
 */
export function advance(state, shot) {
  const world = replay(state);
  const seat = Number(shot?.seat) === 2 ? 2 : 1;
  const error = validateShot(world, shot, seat);
  if (error) throw new Error(error);
  const shots = Array.isArray(state?.shots) ? state.shots.slice() : [];
  const stored = { seat, x: Math.round(Number(shot.x)), angle: Math.round(Number(shot.angle)), power: Math.round(Number(shot.power) * 10) / 10, weapon: shot.weapon };
  shots.push(stored);
  takeShot(world, stored, shots.length - 1);
  return {
    world,
    move: stored,
    next: { seed: state.seed, shots, turn: world.winner ? null : 3 - seat, winner: world.winner }
  };
}

/**
 * True when the stored winner and the replay agree. A client that claims a kill
 * it did not earn leaves a state the other player's replay contradicts.
 */
export function consistent(state) {
  const world = replay(state);
  return (world.winner || null) === (state?.winner || null);
}
