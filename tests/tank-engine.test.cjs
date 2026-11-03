// Pastel Tanks runs version 2 rules: four wall bands whose inner edges form one
// ring road. Tanks drive that ring while shells fall with ordinary gravity, and
// a hole in any band drops whatever stands over it. These tests replay matches
// the way Bored Together does: a seed plus a stored shot list, nothing else.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = () => import('../src/games/tank-engine.js');

const SEED = 20261102;

// Both lobes sail clean over both tanks and land on the far floor band. On
// seed 4242 this is the setup for the self-hole sequence further down.
function barren() {
  return { seat: 1, drive: 0, angle: 6, power: 24, weapon: 'standard' };
}
function barrenFor(seat) {
  return { ...barren(), seat };
}

// Search the grid for a shot that lands on the other tank through this seed's
// wind; the box is seed-stable but the wind is not, so the tests cannot assume
// one fixed angle.
async function findHit(state, seat) {
  const { replay, advance } = await engine();
  const world = replay(state);
  const before = world.tanks[2 - seat].hp;
  for (let angle = 5; angle <= 85; angle++) {
    for (let power = 6; power <= 24; power++) {
      const shot = { seat, drive: 0, angle, power, weapon: 'standard' };
      let result;
      try { result = advance(state, shot); } catch { continue; }
      if (result.world.tanks[2 - seat].hp < before) return shot;
    }
  }
  return null;
}

function countHoles(world) {
  return world.panels.reduce((n, row) => n + row.filter(v => !v).length, 0);
}

test('the four wall bands meet at the corners to make one ring road', async () => {
  const { BW, BH, BX, BY, T, IW, IH, ringPoint, RING, COUNTS, PANEL_LENS } = await engine();
  assert.equal(RING, 2 * (BW - 2 * T) + 2 * (BH - 2 * T), 'the loop is the inner edge, corner to corner');
  const X0 = BX + T, X1 = X0 + IW, Y0 = BY + T, Y1 = Y0 + IH;
  // ringPoint(0) is the top-left inner corner and increasing s walks
  // top→right→bottom→left; each joint lands exactly on a corner coordinate.
  assert.deepEqual([ringPoint(0).x, ringPoint(0).y], [X0, Y0]);
  assert.deepEqual([ringPoint(IW).x, ringPoint(IW).y], [X1, Y0]);
  assert.deepEqual([ringPoint(IW + IH).x, ringPoint(IW + IH).y], [X1, Y1]);
  assert.deepEqual([ringPoint(IW + IH + IW).x, ringPoint(IW + IH + IW).y], [X0, Y1]);
  const wrap = ringPoint(RING);
  assert.deepEqual([wrap.x, wrap.y], [X0, Y0], 'the loop closes');
  for (let s = 0; s < RING; s += 37) {
    const p = ringPoint(s);
    assert.ok(p.wall >= 0 && p.wall < 4 && p.along >= 0 && p.along <= p.len);
    const onSurface =
      (p.wall === 0 || p.wall === 2) ? p.y === (p.wall === 0 ? Y0 : Y1) :
      p.x === (p.wall === 1 ? X1 : X0);
    assert.ok(onSurface, 'every point sits on its wall surface line');
    void onSurface;
  }
  for (let wall = 0; wall < 4; wall++) {
    const tiled = COUNTS[wall] * PANEL_LENS[wall];
    const edge = wall % 2 === 0 ? IW : IH;
    assert.equal(Math.round(tiled * 1000) / 1000, edge, 'panels tile the wall edge exactly');
  }
});

test('wrapS keeps a drive on the loop and turning a corner burns fuel', async () => {
  const { wrapS, RING, driveCost, MOVECOST, CORNERCOST } = await engine();
  assert.equal(wrapS(-1), RING - 1, 'backwards past the join wraps to the far end');
  assert.equal(wrapS(RING), 0);
  assert.equal(wrapS(RING + 17), 17);
  const flat = driveCost(2000, 60);
  assert.equal(flat, 60 * MOVECOST, 'a straight drive costs distance only');
  const across = driveCost(2000, 300);
  assert.ok(across > 300 * MOVECOST, 'a drive that leaves the wall pays for corners');
  assert.ok(across <= (300 * MOVECOST + CORNERCOST) + 1e-9, 'and one corner is enough');
  assert.equal(driveCost(100, RING - 60) > driveCost(100, 60), true, 'the long way around costs more');
});

test('a shot list replays to the same box every time', async () => {
  const { opening, replay, advance, RULES } = await engine();
  assert.equal(RULES, 2, 'these tests cover rules version 2');
  const start = opening(987654);
  assert.deepEqual(Object.keys(start).sort(), ['seed', 'shots', 'turn', 'winner'], 'only the seed and shots travel');
  assert.equal(start.turn, 1);
  assert.equal(start.shots.length, 0);
  let state = start;
  for (let i = 0; i < 4; i++) {
    const shot = await findHit(state, state.turn);
    assert.ok(shot, 'seat ' + state.turn + ' can reach the other tank');
    state = advance(state, shot).next;
    assert.deepEqual(Object.keys(state).sort(), ['seed', 'shots', 'turn', 'winner']);
  }
  const once = replay(state), twice = replay(JSON.parse(JSON.stringify(state)));
  assert.equal(JSON.stringify(once.tanks), JSON.stringify(twice.tanks), 'tanks replay identically');
  assert.equal(JSON.stringify(once.panels), JSON.stringify(twice.panels), 'the walls replay identically');
  assert.equal(JSON.stringify(once.trails), JSON.stringify(twice.trails), 'the flight replays identically');
  assert.ok(once.tanks[0].hp < 100 && once.tanks[1].hp < 100, 'both sides took real damage');
  assert.equal(replay(opening(987654)).seed, once.seed);
});

test('the engine never reads the clock or the dice', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/games/tank-engine.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/Math\.random|Date\.now|document\.|window\./.test(code), false, 'the engine stays deterministic');
  const { windOf, random } = await engine();
  assert.equal(random(42)(), random(42)(), 'the stream is a pure function of the seed');
  for (let i = 0; i < 30; i++) {
    const w = windOf(SEED, i);
    assert.equal(w, windOf(SEED, i), 'wind is pure in seed and index');
    assert.ok(Math.abs(w) <= 0.024 + 1e-12, 'wind stays gentle');
  }
});

test('shots are bounded: your turn, your fuel, a legal barrel and shells in hand', async () => {
  const { opening, replay, advance, validateShot } = await engine();
  const state = opening(SEED), world = replay(state);
  const seat = 1;
  const legal = { drive: 0, angle: 45, power: 12, weapon: 'standard' };
  assert.equal(validateShot(world, legal, seat), null);
  assert.match(String(validateShot(world, legal, 2)), /not your turn/);
  assert.match(String(validateShot(world, legal, 3)), /Unknown player/);
  assert.match(String(validateShot(world, { ...legal, drive: 1.5 }, seat)), /Drive along the box/);
  assert.match(String(validateShot(world, { ...legal, drive: 99999 }, seat)), /around the world/);
  assert.match(String(validateShot(world, { ...legal, drive: 600 }, seat)), /fuel/);
  assert.match(String(validateShot(world, { ...legal, angle: 4 }, seat)), /5 and 85/);
  assert.match(String(validateShot(world, { ...legal, angle: 86 }, seat)), /5 and 85/);
  assert.match(String(validateShot(world, { ...legal, angle: 45.5 }, seat)), /5 and 85/);
  assert.match(String(validateShot(world, { ...legal, power: 0 }, seat)), /Power/);
  assert.match(String(validateShot(world, { ...legal, power: 25 }, seat)), /Power/);
  assert.match(String(validateShot(world, { ...legal, weapon: 'nuke' }, seat)), /Unknown weapon/);
  assert.match(String(validateShot(world, { ...legal, weapon: 'heavy' }, seat)), /No heavy shells/);
  assert.throws(() => advance(state, { ...legal, seat: 2 }), /not your turn/);
  // the stored move is the wire format Bored Together subscribes to
  const after = advance(state, { seat: 1, drive: 0, angle: 45, power: 20, weapon: 'standard' });
  assert.deepEqual(after.move, { seat: 1, drive: 0, angle: 45, power: 20, weapon: 'standard' });
  assert.equal(after.next.turn, 2);
  assert.equal(after.world.turn, 2);
});

test('a direct hit soaks damage in, perforates a panel or two, and nobody falls', async () => {
  const { opening, replay, advance, guide, windOf, MAXHP } = await engine();
  const state = opening(SEED);
  const world = replay(state);
  const shot = await findHit(state, 1);
  assert.ok(shot, 'seat 1 can reach seat 2 on this seed');
  const dry = guide(world, 1, shot.angle, shot.power, shot.weapon);
  assert.equal(dry.hit.kind, 'tank', 'the aiming ghost promises a hit');
  assert.equal(dry.wind, windOf(state.seed, world.shotCount), 'the ghost previews the real wind for the shot');
  const result = advance(state, shot);
  assert.ok(result.world.tanks[1].hp < MAXHP && result.world.tanks[1].hp > 0, 'the enemy soaked real damage');
  assert.equal(result.world.tanks[0].hp, MAXHP, 'the shooter is untouched');
  const holes = countHoles(result.world);
  assert.ok(holes >= 1, 'a plain shell perforates the wall it strikes');
  assert.ok(holes <= 3, 'a narrow burst does not gut the whole band');
  assert.equal(result.world.events.some(e => e.kind === 'hit' && e.seat === 2), true, 'the impact is on the record');
  assert.equal(result.world.events.some(e => e.kind === 'fell_out'), false, 'nobody stood over that hole');
  assert.equal(result.world.winner, null);
});

test('standing over the hole you made is how the box eats you', async () => {
  const { opening, replay, advance, IW, IH, driveCost, FUEL } = await engine();
  let state = opening(4242);
  state = advance(state, barrenFor(1)).next;
  state = advance(state, barrenFor(2)).next;
  // A near-flat shell lands a couple of hundred pixels short of the shooter
  // and guts exactly two floor panels of its own stretch.
  const carved = advance(state, { ...barrenFor(1), angle: 80, power: 4 });
  const voidPanels = carved.world.panels[2].map((v, j) => (v ? null : j)).filter(j => j !== null);
  assert.equal(voidPanels.length, 2, 'the near-flat shot opens a strip under its own floor');
  const shooterStill = carved.world.tanks[0];
  assert.ok(shooterStill.hp > 0, 'the shooter is not standing over the hole yet, so it stays up');
  void shooterStill;
  state = advance(carved.next, barrenFor(2)).next;
  const world = replay(state);
  const me = world.tanks[0];
  const floorStart = IW + IH;
  const holeS = floorStart + (voidPanels[0] + .5) * (IW / 32);
  const drive = Math.round(holeS - me.s);
  const cost = driveCost(me.s, drive);
  assert.ok(cost <= FUEL, 'the hole is within walking distance');
  const fall = advance(state, { seat: 1, drive, angle: 45, power: 12, weapon: 'standard' });
  assert.equal(fall.world.events.some(e => e.kind === 'fell_out' && e.seat === 1), true, 'the shooter drops through its own hole');
  assert.equal(fall.world.tanks[0].hp, 0, 'falling out is fatal');
  assert.equal(fall.world.winner, 2, 'the fall hands the round to the player behind');
  assert.equal(fall.next.winner, 2);
  assert.equal(fall.next.turn, null);
});

test('powerups arrive on the record and only from the seeded stream', async () => {
  const { opening, replay, advance, POWERUPS } = await engine();
  let state = opening(SEED);
  state = advance(state, barrenFor(1)).next;
  let world = replay(state);
  assert.equal(world.powerups.length, 0, 'nothing has spawned yet');
  state = advance(state, barrenFor(2)).next;
  world = replay(state);
  assert.ok(world.powerups.length >= 1, 'the first spawn lands after the second shot');
  for (const pu of world.powerups) {
    assert.ok(POWERUPS.some(p => p.key === pu.key), 'the kind comes from the published table');
    assert.ok(pu.y > 300, 'it rests near the floor');
  }
  assert.equal(world.powerups.length <= 4, true, 'at most a handful on the floor');
});

test('mines are plants, not warheads: the shell parks itself in a wall', async () => {
  const { opening, replay, guide, CARVE, RANGE } = await engine();
  const world = replay(opening(SEED));
  let plant = null;
  for (let a = 5; a <= 85 && !plant; a++) {
    for (let p = 1; p <= 24 && !plant; p++) {
      const g = guide(world, 1, a, p, 'mine');
      if (typeof g.hit !== 'string' && g.hit.kind === 'plant') plant = g.hit;
    }
  }
  assert.ok(plant, 'a mine can always find some wall to park in');
  assert.ok(plant.x !== undefined && plant.y !== undefined, 'the plant has a place');
  assert.ok(CARVE.mine > CARVE.standard, 'mines carve wider than plain shells');
  assert.ok(RANGE.mine > RANGE.standard, 'mines blast wider than plain shells');
});

test('ricochets spend their two bounces and still land', async () => {
  const { opening, replay, guide } = await engine();
  const world = replay(opening(SEED));
  let landed = 0, stretched = 0;
  for (let a = 5; a <= 85; a++) {
    for (let p = 6; p <= 24; p++) {
      const g = guide(world, 1, a, p, 'ricochet');
      if (typeof g.hit !== 'string') {
        landed++;
        if (g.trail.length > 40) stretched++;
      }
    }
  }
  assert.ok(landed >= 200, 'ricochets terminate for most angles');
  assert.ok(stretched >= 100, 'many of those lines clearly doubled back on a wall');
});

test('the winner is the tank still standing and the replay agrees', async () => {
  const { opening, replay, advance, consistent } = await engine();
  let state = opening(777);
  let guard = 0;
  while (!state.winner && guard++ < 40) {
    const shot = await findHit(state, state.turn);
    assert.ok(shot, 'both sides can still reach each other');
    state = advance(state, shot).next;
  }
  assert.ok(state.winner, 'one side runs dry');
  assert.equal(state.turn, null);
  const settled = replay(state);
  assert.equal(settled.winner, state.winner, 'the stored winner matches what the shots replay to');
  assert.equal(settled.tanks[state.winner - 1].hp > 0, true, 'the winner is the tank alive');
  assert.equal(consistent(state), true);
  assert.equal(consistent({ ...state, winner: 3 - state.winner }), false, 'a forged result is caught');
  assert.equal(consistent({ ...state, shots: state.shots.slice(1) }), false, 'a truncated shot list betrays its winner');
});

test('new games open on the floor facing each other with fresh kit', async () => {
  const { opening, replay, MAXHP, FUEL, RULES } = await engine();
  assert.equal(RULES, 2);
  const world = replay(opening(1));
  assert.equal(world.tanks.length, 2);
  const xs = world.tanks.map(t => Math.round(t.x + t.nx * 0) || Math.round(t.s));
  void xs;
  world.tanks.forEach((tank, i) => {
    assert.equal(tank.hp, MAXHP);
    assert.equal(tank.fuel, FUEL);
    assert.deepEqual(tank.ammo, { heavy: 0, cluster: 0, mine: 0, ricochet: 0 });
    assert.equal(tank.dir, i === 0 ? -1 : 1, 'the barrel leans at the other tank');
    assert.equal(tank.falling, null);
    const s = tank.s;
    assert.ok(s > 0 && s < 2728, 'the seat starts on the ring');
    assert.ok(Math.abs(Math.round(s) - (i === 0 ? 2030 : 1586)) < 3, 'seat 1 left along the floor, seat 2 right');
  });
  assert.equal(collectionSize(world.powerups), 0, 'fresh worlds carry no mishaps');
  function collectionSize(list) { return list.length; }
});
