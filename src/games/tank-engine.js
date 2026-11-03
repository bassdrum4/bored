/*
 * Tank 2: a single destructible arena boundary and separate rolling floor.
 * The box's four edges are independent thin surfaces; the world outside the
 * boundary is empty. Soil beneath the wavy floor extends to the bottom edge.
 * Deterministic seed + shot replay is shared by local and online matches.
 */

export const RULES = 2;

export const W = 960, H = 580;
export const BX = 10, BY = 42;      // board's outer rectangle on the canvas
export const BW = 940, BH = 528;
export const T = 26;                // wall thickness
export const IW = BW - 2 * T;       // interior width  (888)
export const IH = BH - 2 * T;       // interior height (476)
const X0 = BX + T, X1 = BX + BW - T, Y0 = BY + T, Y1 = BY + BH - T;

/* The ring road is the box's inner edge: top, right, bottom, left. */
const LENS = [IW, IH, IW, IH];
const OFFS = [0, IW, IW + IH, IW + IH + IW];
export const RING = 2 * IW + 2 * IH;

/* ── Physics and kit ─────────────────────────────────────────────────────── */

export const G = 0.06;              // gravity on shells and anything falling
export const PWSPD = 0.55;          // power becomes launch speed
export const MINPW = 1, MAXPW = 24;
export const MAXHP = 100;
export const TANK = 28, BLEN = 18;  // treads span, barrel length
export const SUPPORTGAP = 12;       // open ground under the treads that drops a tank
export const MAXPU = 4;

export const WEAPONS = Object.freeze(['standard', 'heavy', 'cluster', 'mine', 'ricochet']);
export const WEAPON_NAMES = Object.freeze({
  standard: 'Standard', heavy: 'Heavy', cluster: 'Cluster', mine: 'Mine', ricochet: 'Ricochet'
});
export const RANGE = Object.freeze({
  standard: 26, heavy: 36, cluster: 20, cluster_child: 14, mine: 40, ricochet: 26
});
/* CARVE is the radius of the bowl along the wall; BITE is how deep it digs, in
 * pixels of the 26 thick wall. A standard shell dents about half way, a heavy
 * shell or a mine goes through, and repeated shells on one spot add up until
 * the ground gives. */
export const CARVE = Object.freeze({
  standard: 14, heavy: 30, cluster: 12, cluster_child: 10, mine: 36, ricochet: 16
});
export const BITE = Object.freeze({
  standard: 13, heavy: 34, cluster: 10, cluster_child: 9, mine: 38, ricochet: 15
});
export const DAMAGE = Object.freeze({
  standard: [18, 40], heavy: [34, 62], cluster: [10, 20], cluster_child: [6, 14],
  mine: [38, 56], ricochet: [18, 38]
});
export const WINDMAX = 0.024;       // strongest crosswind per shell step

export const POWERUPS = Object.freeze([
  { key: 'heavy', name: 'Heavy', sym: 'H', amt: 2, weight: 18 },
  { key: 'cluster', name: 'Cluster', sym: 'C', amt: 2, weight: 15 },
  { key: 'mine', name: 'Mine', sym: 'M', amt: 2, weight: 13 },
  { key: 'ricochet', name: 'Ricochet', sym: 'R', amt: 1, weight: 12 },
  { key: 'heal', name: 'Heal', sym: '+', amt: 25, weight: 13 },
  { key: 'shield', name: 'Shield', sym: 'S', amt: 1, weight: 14 },
  { key: 'teleport', name: 'Teleport', sym: 'T', amt: 1, weight: 10 }
]);

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

/* Wind is pure: the same seed and shot index always agree. */
export function windOf(seed, index) {
  return (stream(seed, index * 17 + 11)() * 2 - 1) * WINDMAX;
}

/* ── The ring road ───────────────────────────────────────────────────────── */

/**
 * The box's inner edge as one loop: top (left→right), right (top→bottom),
 * bottom (right→left), left (bottom→top), clockwise from the top-left corner.
 * `s` is the distance in pixels around that loop.
 */
export function ringPoint(s) {
  s = ((Math.round(s) % RING) + RING) % RING;
  let wall = 3, along = s - OFFS[3];
  for (let k = 0; k < 4; k++) if (s < OFFS[k] + LENS[k]) { wall = k; along = s - OFFS[k]; break; }
  switch (wall) {
    case 0: return { wall, along, x: X0 + along, y: Y0, nx: 0, ny: 1, tx: 1, ty: 0, len: LENS[0] };
    case 1: return { wall, along, x: X1, y: Y0 + along, nx: -1, ny: 0, tx: 0, ty: 1, len: LENS[1] };
    case 2: return { wall, along, x: X1 - along, y: Y1, nx: 0, ny: -1, tx: -1, ty: 0, len: LENS[2] };
    default: return { wall, along, x: X0, y: Y1 - along, nx: 1, ny: 0, tx: 0, ty: -1, len: LENS[3] };
  }
}
export const wrapS = s => ((Math.round(s) % RING) + RING) % RING;
// A tank can move across the floor, but never climb the side walls or ceiling.
export const driveS = (s, distance) => clamp(Math.round(s + distance), OFFS[2] + TANK, OFFS[3] - TANK);
const sAt = (wall, along) => OFFS[wall] + Math.max(0, Math.min(LENS[wall], along));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = v => Math.round(v * 100) / 100;

/** Distance from a point to a wall's inner surface line segment. */
function distToWall(wall, x, y) {
  if (wall === 0) return Math.hypot(clamp(x, X0, X1) - x, y - Y0);
  if (wall === 1) return Math.hypot(x - X1, clamp(y, Y0, Y1) - y);
  if (wall === 2) return Math.hypot(clamp(x, X0, X1) - x, y - Y1);
  return Math.hypot(x - X0, clamp(y, Y0, Y1) - y);
}

/**
 * The wall band the point is inside, nearest surface first. Only points that
 * have actually left the open interior count — a shell that is merely flying
 * close to a wall is still inside the box.
 */
function wallAt(x, y) {
  if (x > X0 && x < X1 && y > Y0 && y < Y1) return null;
  let best = null;
  for (let wall = 0; wall < 4; wall++) {
    const d = distToWall(wall, x, y);
    if (d < T * 2 && (best === null || d < best.d)) best = { wall, d };
  }
  return best;
}

/** The point and ring position where this wall's surface meets (x, y). */
function anchor(wall, x, y) {
  if (wall === 0) return { x: clamp(x, X0, X1), y: Y0, along: clamp(x, X0, X1) - X0 };
  if (wall === 1) return { x: X1, y: clamp(y, Y0, Y1), along: clamp(y, Y0, Y1) - Y0 };
  if (wall === 2) return { x: clamp(x, X0, X1), y: Y1, along: X1 - clamp(x, X0, X1) };
  return { x: X0, y: clamp(y, Y0, Y1), along: Y1 - clamp(y, Y0, Y1) };
}

/* ── Terrain: four wall profiles plus a separate interior soil profile ─── */

/** How far the ground has been dug away at this spot, in pixels. */
export function depthAt(world, wall, along) {
  const arr = world.depth[wall];
  return arr[clamp(Math.round(along), 0, arr.length - 1)];
}
export const breached = (world, wall, along) => depthAt(world, wall, along) >= T - 1;

/** The floor and the box's bottom edge are separate physical materials. */
export function floorDepthAt(world, along) {
  return world.floor[clamp(Math.round(along), 0, world.floor.length - 1)];
}
export const floorBreached = (world, along) => floorDepthAt(world, along) >= -1;
export const floorYAt = (world, x) => Y1 + floorDepthAt(world, X1 - clamp(x, X0, X1));

export function tankSurface(world, tank) {
  const p = ringPoint(tank.s), d = floorDepthAt(world, p.along);
  const half = TANK / 2 - 1;
  return { p, d, x: p.x, y: p.y + d, cx: p.x, cy: p.y + d - half };
}

// Keep the playing field open: the terrain and damaged outer walls are the cover.
export function makeBlocks() { return []; }

// The initial floor sits above the bottom of the frame, with smooth, seeded
// undulations. Negative depth is raised ground; blasting increases depth.
export function makeFloor(seed) {
  const rand = random((seed ^ 0x6A12B405) >>> 0);
  const phase = rand() * Math.PI * 2, phase2 = rand() * Math.PI * 2;
  return Array.from({ length: IW }, (_, i) => {
    const x = i / IW;
    const height = 57 + 7.5 * Math.sin(x * Math.PI * 3 + phase)
      + 4.5 * Math.sin(x * Math.PI * 7 + phase2)
      + 2 * Math.sin(x * Math.PI * 13 + phase);
    return -round2(height);
  });
}

function inBlock(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
function blockHoleAt(world, x, y) {
  for (const c of world.blockHoles) if (Math.hypot(c.x - x, c.y - y) <= c.r) return true;
  return false;
}
const circleHitsRect = (x, y, r, b) => {
  const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
  return Math.hypot(nx - x, ny - y) <= r;
};

/** Dig a smooth bowl into one wall's profile, centred at `along`. */
function carveWall(world, wall, along, r, bite) {
  const arr = world.depth[wall], last = arr.length - 1;
  const from = Math.max(0, Math.floor(along - r)), to = Math.min(last, Math.ceil(along + r));
  for (let i = from; i <= to; i++) {
    const q = (i - along) / r;
    if (q <= -1 || q >= 1) continue;
    const gain = bite * (1 - q * q);
    if (gain <= 0.01) continue;
    const was = arr[i], now = Math.min(T, was + gain);
    if (now <= was + 0.005) continue;
    arr[i] = round2(now);
    if (now >= T - 1 && was < T - 1) {
      const p = ringPoint(sAt(wall, i));
      world.events.push({ kind: 'breach', wall, along: i, x: p.x, y: p.y });
    }
  }
}

/** A crater eats soil until it reaches the box's bottom wall. */
function carveFloor(world, x, r, bite) {
  const center = X1 - x;
  const from = Math.max(0, Math.floor(center - r)), to = Math.min(IW - 1, Math.ceil(center + r));
  for (let i = from; i <= to; i++) {
    const q = (i - center) / r;
    if (q <= -1 || q >= 1) continue;
    const was = world.floor[i], now = Math.min(0, was + bite * (1 - q * q));
    if (now <= was + .005) continue;
    world.floor[i] = round2(now);
    if (now >= -1 && was < -1) world.events.push({ kind: 'sinkhole', x: X1 - i, y: Y1 });
  }
}

/** Ground and perimeter damage are independent, but one blast may touch both. */
export function carveAt(world, x, y, r, bite) {
  if (x + r >= X0 && x - r <= X1) {
    const fx = clamp(x, X0, X1);
    if (Math.abs(y - floorYAt(world, fx)) <= r) carveFloor(world, fx, r, bite);
  }
  for (let wall = 0; wall < 4; wall++) {
    if (distToWall(wall, x, y) <= r) carveWall(world, wall, anchor(wall, x, y).along, r, bite);
  }
}

/** A hole in the floor reveals the bottom wall; outside the walls is void. */
export function solidAt(world, x, y) {
  if (x >= X0 && x <= X1 && y <= Y1 && y >= floorYAt(world, x)) {
    const along = X1 - x;
    if (!floorBreached(world, along))
      return { kind: 'ground', wall: 2, along, x, y: floorYAt(world, x) };
  }
  const band = wallAt(x, y);
  if (band && band.d <= T) {
    const spot = anchor(band.wall, x, y), d = depthAt(world, band.wall, spot.along);
    if (d < T - 1 && band.d >= d)
      return { kind: 'wall', wall: band.wall, along: spot.along, x: spot.x, y: spot.y };
  }
  return null;
}

/* ── Tanks and bodies ────────────────────────────────────────────────────── */

export function makeTank(seat) {
  // Seat 1 takes the floor's left quarter, seat 2 the right, each barrel
  // leaning at the other. On the bottom wall the ring runs right→left.
  const along = Math.round((seat === 1 ? 0.75 : 0.25) * LENS[2]);
  return {
    s: sAt(2, along), dir: seat === 1 ? -1 : 1, hp: MAXHP, angle: 45,
    shield: false, ammo: { heavy: 0, cluster: 0, mine: 0, ricochet: 0 },
    falling: null
  };
}

function bodyCentre(world, tank) {
  if (tank.falling) return tank.falling;
  const surf = tankSurface(world, tank);
  return { x: surf.cx, y: surf.cy };
}

/**
 * True while the ground under the treads is still ground. A dent is fine — the
 * tank simply sits lower — but a breach wider than a few pixels is a hole, and
 * a hole is where tanks fall out of the box.
 */
export function supported(world, tank) {
  if (tank.falling) return false;
  let run = 0, worst = 0;
  for (let o = -TANK / 2; o <= TANK / 2; o += 1) {
    const q = ringPoint(tank.s + o);
    if (floorBreached(world, q.along)) { run++; if (run > worst) worst = run; }
    else run = 0;
  }
  return worst < SUPPORTGAP;
}

/* ── Damage, carving, mines ──────────────────────────────────────────────── */

/**
 * A burst: dig the ground, damage tanks at their body centres, sweep loose
 * things. `type` picks the radius and damage envelope; cluster leaves children
 * for the caller to fly.
 */
function burst(world, x, y, type, index, live) {
  const r = RANGE[type] || RANGE.standard;
  const [low, high] = DAMAGE[type] || DAMAGE.standard;
  if (live) {
    carveAt(world, x, y, CARVE[type] || CARVE.standard, BITE[type] || BITE.standard);
    for (const tank of world.tanks) {
      const c = bodyCentre(world, tank);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d >= r + TANK / 2) continue;
      let hit = Math.round(low + Math.max(0, 1 - d / (r + TANK / 2)) * (high - low));
      if (tank.shield) { hit = Math.min(15, hit); tank.shield = false; world.events.push({ kind: 'shield', seat: world.tanks.indexOf(tank) + 1 }); }
      tank.hp = Math.max(0, tank.hp - hit);
      world.events.push({ kind: 'hit', x, y, seat: world.tanks.indexOf(tank) + 1, damage: hit });
    }
    for (let i = world.powerups.length - 1; i >= 0; i--) {
      if (Math.hypot(world.powerups[i].x - x, world.powerups[i].y - y) < r + 8) world.powerups.splice(i, 1);
    }
    for (let i = world.mines.length - 1; i >= 0; i--) {
      const mine = world.mines[i];
      if (Math.hypot(mine.x - x, mine.y - y) < r + 8) {
        world.mines.splice(i, 1);
        world.events.push({ kind: 'mine_out', x: mine.x, y: mine.y });
      }
    }
  }
  world.bursts.push({ x, y, r, type, at: index });
  if (type === 'cluster') {
    const rand = stream(world.seed, index * 7 + 3);
    for (const [vx, vy] of [[-4, -6], [-1, -7], [3, -6]]) {
      world.events.push({
        kind: 'child', x, y,
        vx: vx + (rand() - .5) * .6, vy: vy + (rand() - .5) * .6, at: index
      });
    }
  }
}

/* ── Flight ──────────────────────────────────────────────────────────────── */

function reflect(world, x, y, vx, vy, hit) {
  if (hit.kind === 'wall') {
    if (hit.wall === 0 || hit.wall === 2) { vy = -vy; y += hit.wall === 0 ? 3 : -3; }
    else { vx = -vx; x += hit.wall === 1 ? -3 : 3; }
  } else {
    const b = hit.block;
    const dx = Math.min(x - b.x, b.x + b.w - x), dy = Math.min(y - b.y, b.y + b.h - y);
    if (dx < dy) { vx = -vx; x += x < b.x + b.w / 2 ? -3 : 3; }
    else { vy = -vy; y += y < b.y + b.h / 2 ? -3 : 3; }
  }
  return { vx, vy, x, y };
}

/**
 * One projectile with wind and gravity. `live` mutates the world; a dry run
 * only reports where it ends, which is what the aiming ghost and the AI want.
 */
function flight(world, muzzle, vx, vy, type, index, live, owner) {
  const trail = [{ x: muzzle.x, y: muzzle.y }];
  let { x, y } = muzzle, bounces = 0, speed = Math.hypot(vx, vy);
  const wind = windOf(world.seed, index);
  for (let step = 0; step < 1100; step++) {
    vx += wind; vy += G;
    x += vx; y += vy;
    trail.push({ x, y });
    if (x < -20 || x > W + 20 || y < -20 || y > H + 40) return { trail, outcome: 'out' };
    let struck = null;
    for (const tank of world.tanks) {
      if (tank === owner && step < 10) continue;
      const c = bodyCentre(world, tank);
      if (Math.hypot(c.x - x, c.y - y) <= TANK / 2 + 5) { struck = tank; break; }
    }
    if (struck) {
      if (live) {
        // Every hit also digs at the ground behind the hull, so a duel slowly
        // eats the footing out from under whoever keeps getting hit.
        const surf = tankSurface(world, struck);
        carveAt(world, surf.x, surf.y, (CARVE[type] || CARVE.standard) * .7, (BITE[type] || BITE.standard) * .45);
        burst(world, x, y, type === 'mine' ? 'mine' : type, index, true);
      }
      return { trail, outcome: { kind: 'tank', seat: world.tanks.indexOf(struck) + 1 } };
    }
    const solid = solidAt(world, x, y);
    if (!solid) continue;
    if (type === 'mine' && solid.kind === 'wall') {
      const p = ringPoint(sAt(solid.wall, solid.along));
      const d = depthAt(world, solid.wall, solid.along);
      const plant = { x: p.x - p.nx * d + p.nx * 10, y: p.y - p.ny * d + p.ny * 10 };
      if (live) {
        world.mines.push({ x: plant.x, y: plant.y, seat: index < 0 ? 1 : ownerSeat(world, owner), fuse: 2 });
        world.events.push({ kind: 'plant', x: plant.x, y: plant.y });
      }
      return { trail, outcome: { kind: 'plant', ...plant } };
    }
    if (type === 'ricochet' && bounces < 2) {
      bounces++;
      speed *= 0.85;
      const turned = reflect(world, x, y, vx, vy, solid);
      x = turned.x; y = turned.y;
      const len = Math.hypot(turned.vx, turned.vy) || 1;
      vx = turned.vx / len * speed; vy = turned.vy / len * speed;
      if (live) world.events.push({ kind: 'bounce', x: solid.x, y: solid.y });
      continue;
    }
    if (live) burst(world, x, y, type, index, true);
    return { trail, outcome: solid.kind === 'wall'
      ? { kind: 'wall', x, y, wall: solid.wall, along: solid.along }
      : { kind: 'block', x, y } };
  }
  return { trail, outcome: 'stall' };
}

function pctNormal(wall) {
  switch (wall) {
    case 0: return { nx: 0, ny: 1 };
    case 1: return { nx: -1, ny: 0 };
    case 2: return { nx: 0, ny: -1 };
    default: return { nx: 1, ny: 0 };
  }
}

function ownerSeat(world, tank) {
  const i = world.tanks.indexOf(tank);
  return i < 0 ? 1 : i + 1;
}

/**
 * Dry run: where does this shot land, and how far does it fly. The aiming
 * ghost and the AI both come from here; nothing in the world moves.
 */
export function guide(world, seat, angle, power, weapon) {
  const tank = world.tanks[seat - 1];
  // the ghost must leave from where this shot would leave from, not from the
  // barrel angle of the last turn
  const muzzle = muzzleOf(world, { ...tank, angle });
  const speed = Math.max(MINPW, power) * PWSPD;
  const a = angle * Math.PI / 180;
  const n = normalAt(tank.s), t = tangentAt(tank.s);
  const vx = (n.x * Math.cos(a) + t.x * Math.sin(a) * tank.dir) * speed;
  const vy = (n.y * Math.cos(a) + t.y * Math.sin(a) * tank.dir) * speed;
  const result = flight(world, muzzle, vx, vy, weapon, world.shotCount, false, tank);
  return { trail: result.trail, hit: result.outcome, wind: windOf(world.seed, world.shotCount) };
}

function normalAt(s) {
  const p = ringPoint(s);
  return { x: p.nx, y: p.ny };
}
function tangentAt(s) {
  const p = ringPoint(s);
  return { x: p.tx, y: p.ty };
}
function muzzleOf(world, tank) {
  const surf = tankSurface(world, tank);
  const a = tank.angle * Math.PI / 180;
  const n = normalAt(tank.s), t = tangentAt(tank.s);
  return {
    x: surf.x + n.x * (TANK / 2 - 1) + (n.x * Math.cos(a) + t.x * Math.sin(a) * tank.dir) * BLEN,
    y: surf.y + n.y * (TANK / 2 - 1) + (n.y * Math.cos(a) + t.y * Math.sin(a) * tank.dir) * BLEN
  };
}

/* ── Power-ups ───────────────────────────────────────────────────────────── */

function pickPowerup(rand) {
  const total = POWERUPS.reduce((n, p) => n + p.weight, 0);
  let roll = rand() * total, choice = POWERUPS[0];
  for (const pu of POWERUPS) { roll -= pu.weight; if (roll <= 0) { choice = pu; break; } }
  return choice;
}

/** Spawn from the top edge; the resting spot is decided now, painted falling. */
function spawnPowerup(world, rand) {
  if (world.powerups.length >= MAXPU) return;
  const x = Math.round(X0 + 40 + rand() * (IW - 80));
  const d = floorDepthAt(world, X1 - x);
  if (d >= -4) { world.events.push({ kind: 'pu_out', x }); return; }
  world.powerups.push({ x, y: Y1 + d - 12, key: pickPowerup(rand).key });
}

function collect(world, tank, key, index) {
  const seat = world.tanks.indexOf(tank) + 1;
  if (key === 'heal') tank.hp = Math.min(MAXHP, tank.hp + 25);
  else if (key === 'shield') tank.shield = true;
  else if (key === 'teleport') {
    const rand = stream(world.seed, index * 13 + 5);
    for (let tries = 0; tries < 80; tries++) {
      const s = OFFS[2] + TANK + Math.floor(rand() * (IW - 2 * TANK));
      const candidate = { s, falling: null, world };
      let grounded = true;
      for (let o = -TANK / 2; o <= TANK / 2; o += 4) {
        const q = ringPoint(s + o);
        if (floorBreached(world, q.along)) grounded = false;
      }
      if (grounded && supported(world, candidate)) { tank.s = s; tank.dir = 1; tank.angle = 45; break; }
    }
    world.events.push({ kind: 'warp', seat });
  } else {
    const pu = POWERUPS.find(p => p.key === key);
    tank.ammo[key] = (tank.ammo[key] || 0) + (pu?.amt ?? 1);
  }
  world.events.push({ kind: 'powerup', seat, key });
}

/* ── Falling ─────────────────────────────────────────────────────────────── */

/** When the ground under a tank is gone it drops straight down and lands, or leaves. */
function fallFrom(world, tank) {
  const surf = tankSurface(world, tank);
  const startY = surf.cy;
  let x = surf.cx, y = surf.cy, vy = 0.4;
  for (let step = 0; step < 2000; step++) {
    vy += G; y += vy;
    if (y > H + 40 || x < -40 || x > W + 40) {
      tank.hp = 0;
      world.events.push({ kind: 'fell_out', seat: world.tanks.indexOf(tank) + 1, x, y });
      return;
    }
    // a block in the way breaks under the weight instead of holding the tank
    for (const b of world.blocks) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && !blockHoleAt(world, x, y)) {
        world.blockHoles.push({ x: round2(x), y: round2(b.y + b.h / 2), r: 20 });
        world.events.push({ kind: 'crush', x, y });
      }
    }
    const along = X1 - x;
    if (along >= 0 && along <= IW && y >= Y1 + depthAt(world, 2, along) - TANK / 2) {
      if (depthAt(world, 2, along) < T - 4) {
        tank.s = sAt(2, along); tank.dir = 1; tank.angle = 45;
        let dmg = Math.min(45, Math.round((y - startY) / 22) * 7);
        if (tank.shield) { dmg = Math.min(15, dmg); tank.shield = false; world.events.push({ kind: 'shield', seat: world.tanks.indexOf(tank) + 1 }); }
        tank.hp = Math.max(0, tank.hp - dmg);
        world.events.push({ kind: 'land', seat: world.tanks.indexOf(tank) + 1, damage: dmg, y });
        // anything resting on the floor under the landing spot gets picked up
        sweepPowerups(world, tank);
        return;
      }
    }
  }
  tank.hp = 0;
  world.events.push({ kind: 'fell_out', seat: world.tanks.indexOf(tank) + 1, x, y });
}

function sweepPowerups(world, tank) {
  const c = tankSurface(world, tank);
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    if (Math.hypot(world.powerups[i].x - c.cx, world.powerups[i].y - c.cy) <= 26) {
      collect(world, tank, world.powerups[i].key, world.shotCount);
      world.powerups.splice(i, 1);
    }
  }
}

/* ── World and replay ────────────────────────────────────────────────────── */

export function opening(seed) {
  return { seed: (seed >>> 0) || 1, shots: [], turn: 1, winner: null };
}

function worldFrom(state) {
  const seed = (state?.seed >>> 0) || 1;
  const world = {
    seed,
    depth: LENS.map(len => new Array(len).fill(0)),
    floor: makeFloor(seed),
    blocks: makeBlocks(seed),
    blockHoles: [],
    tanks: [makeTank(1), makeTank(2)],
    powerups: [], mines: [], nextPU: 2,
    turn: 1, winner: null, shotCount: 0,
    trails: [], bursts: [], events: []
  };
  return world;
}

export function validateShot(world, shot, seat) {
  if (!world || !shot || typeof shot !== 'object') return 'That move is missing.';
  if (world.winner) return 'This game is over.';
  if (seat !== 1 && seat !== 2) return 'Unknown player.';
  if (world.turn !== seat) return 'It is not your turn.';
  const drive = Number(shot.drive);
  if (!Number.isFinite(drive) || Math.round(drive) !== drive || Math.abs(drive) > IW) return 'Drive across the floor, not beyond the walls.';
  const angle = Number(shot.angle);
  if (!Number.isFinite(angle) || Math.round(angle) !== angle || angle < 5 || angle > 85) return 'Aim between 5 and 85 degrees.';
  const power = Number(shot.power);
  if (!Number.isFinite(power) || power < MINPW || power > MAXPW) return 'Power is between 1 and 24.';
  if (!WEAPONS.includes(shot.weapon)) return 'Unknown weapon.';
  if (shot.weapon !== 'standard' && !(world.tanks[seat - 1].ammo[shot.weapon] > 0)) return 'No ' + shot.weapon + ' shells left.';
  return null;
}

function takeShot(world, shot, index) {
  const seat = shot.seat === 2 ? 2 : 1;
  const tank = world.tanks[seat - 1];
  world.shotCount = index;
  tank.dir = shot.drive > 0 ? 1 : shot.drive < 0 ? -1 : tank.dir;
  tank.s = driveS(tank.s, shot.drive);
  tank.angle = shot.angle;
  sweepPowerups(world, tank);
  // Driving onto a hole is a whole turn: the fall eats it.
  if (!supported(world, tank)) fallFrom(world, tank);

  if (supported(world, tank)) {
    if (shot.weapon !== 'standard') tank.ammo[shot.weapon] = Math.max(0, tank.ammo[shot.weapon] - 1);
    const muzzle = muzzleOf(world, tank), a = shot.angle * Math.PI / 180;
    const n = normalAt(tank.s), t = tangentAt(tank.s);
    const speed = shot.power * PWSPD;
    const vx = (n.x * Math.cos(a) + t.x * Math.sin(a) * tank.dir) * speed;
    const vy = (n.y * Math.cos(a) + t.y * Math.sin(a) * tank.dir) * speed;
    const result = flight(world, muzzle, vx, vy, shot.weapon, index, true, tank);
    world.trails.push(result.trail);
    // Cluster shells spawn children in flight; send each through the same
    // physics so every client sees identical bomblet craters.
    const childEvents = world.events.filter(e => e.kind === 'child' && e.at === index);
    for (const child of childEvents) {
      world.events.splice(world.events.indexOf(child), 1);
      const fly = flight(world, { x: child.x, y: child.y }, child.vx, child.vy, 'cluster_child', index, true, null);
      fly.trail.child = true;
      world.trails.push(fly.trail);
    }
  }

  // Mines tick on every shot: two turns after plant is detonation time.
  for (let i = world.mines.length - 1; i >= 0; i--) {
    const mine = world.mines[i];
    mine.fuse--;
    if (mine.fuse <= 0) {
      world.mines.splice(i, 1);
      burst(world, mine.x, mine.y, 'mine', index, true);
    }
  }

  // Anyone left standing over a breach — shooter included — drops.
  for (const tank of world.tanks) {
    if (tank.hp > 0 && !supported(world, tank)) fallFrom(world, tank);
  }
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const pu = world.powerups[i];
    if (floorBreached(world, X1 - pu.x)) {
      world.powerups.splice(i, 1);
      world.events.push({ kind: 'pu_out', x: pu.x });
    }
  }

  const dead = world.tanks.map(t => t.hp <= 0);
  if (dead[0] || dead[1]) {
    // A mutual kill hands the round to the player who did not just fire, which
    // is the rule the single-player game already uses.
    world.winner = dead[0] && dead[1] ? 3 - seat : (dead[0] ? 2 : 1);
  }
  world.turn = world.winner ? 0 : 3 - seat;

  const rand = stream(world.seed, index * 3 + 1);
  if (index + 1 >= world.nextPU) {
    spawnPowerup(world, rand);
    world.nextPU = index + 2 + Math.floor(rand() * 2);
    if (rand() < .35) spawnPowerup(world, rand);
  }
  return world;
}

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

/** Play one shot forward: returns the world it produced and the stored state. */
export function advance(state, shot) {
  const world = replay(state);
  const seat = Number(shot?.seat) === 2 ? 2 : 1;
  const error = validateShot(world, shot, seat);
  if (error) throw new Error(error);
  const shots = Array.isArray(state?.shots) ? state.shots.slice() : [];
  const stored = {
    seat, drive: Math.round(Number(shot.drive)), angle: Math.round(Number(shot.angle)),
    power: Math.round(Number(shot.power) * 10) / 10, weapon: shot.weapon
  };
  shots.push(stored);
  takeShot(world, stored, shots.length - 1);
  return {
    world,
    move: stored,
    next: { seed: state.seed, shots, turn: world.winner ? null : 3 - seat, winner: world.winner }
  };
}

/**
 * True when the stored winner and the replay agree. A client that claims a
 * kill the shots do not support leaves a state the other player contradicts.
 */
export function consistent(state) {
  const world = replay(state);
  return (world.winner || null) === (state?.winner || null);
}
