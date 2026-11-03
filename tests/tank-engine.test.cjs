// Pastel Tanks runs version 2 rules: the box's edge is continuous, destructible
// ground. Each wall carries a depth profile per pixel, so a shell digs a bowl,
// tanks ride the profile (a dent sits them lower), and only a breach — depth
// reaching the wall's thickness — opens a hole wide enough to fall through or
// fly out of. These tests replay matches the way Bored Together does: a seed
// plus a stored shot list, nothing else.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = () => import('../src/games/tank-engine.js');

const SEED = 20261102;

// Both lobes sail clean over both tanks and land on the far floor.
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

test('the four walls meet at the corners to make one ring road', async () => {
  const { BW, BH, BX, BY, T, IW, IH, ringPoint, RING } = await engine();
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
  }
});

test('the ground starts whole, and each wall has a depth per pixel of its edge', async () => {
  const { opening, replay, depthAt, IW, IH, T } = await engine();
  const world = replay(opening(SEED));
  assert.equal(world.depth.length, 4, 'four walls');
  assert.deepEqual(world.depth.map(row => row.length), [IW, IH, IW, IH], 'one number per pixel along each edge');
  for (let wall = 0; wall < 4; wall++) {
    for (let along = 0; along < world.depth[wall].length; along += 17) {
      assert.equal(depthAt(world, wall, along), 0, 'nothing is dug before the first shot');
    }
  }
  assert.equal(T, 26, 'the band is 26 thick, so a breach has to dig that far');
  assert.deepEqual(world.blockHoles, [], 'no block has been shot through yet');
  assert.ok(world.blocks.length >= 1, 'the middle of the box has blocks to shoot at');
});

test('wrapS keeps a drive on the loop and drives are no longer rationed', async () => {
  const { wrapS, RING, opening, replay, validateShot } = await engine();
  assert.equal(wrapS(-1), RING - 1, 'backwards past the join wraps to the far end');
  assert.equal(wrapS(RING), 0);
  assert.equal(wrapS(RING + 17), 17);
  const world = replay(opening(SEED));
  const shot = { drive: 600, angle: 45, power: 12, weapon: 'standard' };
  assert.equal(validateShot(world, shot, 1), null, 'a long drive is legal: there is no fuel');
  assert.match(String(validateShot(world, { ...shot, drive: RING * 3 }, 1)), /around the world/);
  assert.match(String(validateShot(world, { ...shot, drive: 1.5 }, 1)), /Drive along the box/);
  assert.equal('fuel' in world.tanks[0], false, 'tanks carry no fuel any more');
});

test('a shot list replays to the same ground every time', async () => {
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
  assert.equal(JSON.stringify(once.depth), JSON.stringify(twice.depth), 'the dug ground replays identically');
  assert.equal(JSON.stringify(once.blockHoles), JSON.stringify(twice.blockHoles), 'block holes replay identically');
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

test('shots are bounded: your turn, a legal barrel and shells in hand', async () => {
  const { opening, replay, advance } = await engine();
  const { validateShot } = await engine();
  const state = opening(SEED), world = replay(state);
  const seat = 1;
  const legal = { drive: 0, angle: 45, power: 12, weapon: 'standard' };
  assert.equal(validateShot(world, legal, seat), null);
  assert.match(String(validateShot(world, legal, 2)), /not your turn/);
  assert.match(String(validateShot(world, legal, 3)), /Unknown player/);
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

// A shot the aiming ghost calls a hull hit, so the test is about the direct
// strike and not about splash from the wall behind it.
async function findDirect(state, seat) {
  const { replay, guide } = await engine();
  const world = replay(state);
  for (let angle = 5; angle <= 85; angle++) {
    for (let power = 6; power <= 24; power++) {
      const g = guide(world, seat, angle, power, 'standard');
      if (g.hit && typeof g.hit === 'object' && g.hit.kind === 'tank' && g.hit.seat !== seat) {
        return { seat, drive: 0, angle, power, weapon: 'standard' };
      }
    }
  }
  return null;
}

test('a direct hit soaks damage in and digs the ground behind the hull', async () => {
  const { opening, replay, advance, guide, windOf, depthAt, ringPoint, T, MAXHP, supported } = await engine();
  const state = opening(SEED);
  const world = replay(state);
  const shot = await findDirect(state, 1);
  assert.ok(shot, 'seat 1 can reach seat 2 on this seed');
  const dry = guide(world, 1, shot.angle, shot.power, shot.weapon);
  assert.equal(dry.hit.kind, 'tank', 'the aiming ghost promises a hit');
  assert.equal(dry.wind, windOf(state.seed, world.shotCount), 'the ghost previews the real wind for the shot');
  const result = advance(state, shot);
  assert.ok(result.world.tanks[1].hp < MAXHP && result.world.tanks[1].hp > 0, 'the enemy soaked real damage');
  assert.equal(result.world.tanks[0].hp, MAXHP, 'the shooter is untouched');
  const enemy = result.world.tanks[1];
  const dug = depthAt(result.world, 2, ringPoint(enemy.s).along);
  assert.ok(dug > 0, 'every hull hit also digs at the ground under the target');
  assert.ok(dug < T, 'one standard shell dents the ground, it does not break through it');
  assert.equal(supported(result.world, enemy), true, 'so the target is still standing');
  assert.equal(result.world.events.some(e => e.kind === 'hit' && e.seat === 2), true, 'the impact is on the record');
  assert.equal(result.world.events.some(e => e.kind === 'fell_out'), false, 'nobody fell');
  assert.equal(result.world.winner, null);
});

test('a dent sits a tank lower, and sustained shells break the ground open', async () => {
  const { opening, replay, carveAt, depthAt, breached, supported, ringPoint, tankSurface, T, SUPPORTGAP, BITE, CARVE } = await engine();
  const world = replay(opening(4242));
  const tank = world.tanks[0];
  const surf = tankSurface(world, tank);
  const spot = ringPoint(tank.s);

  carveAt(world, surf.x, surf.y, CARVE.standard, BITE.standard);
  const first = depthAt(world, spot.wall, spot.along);
  assert.ok(first > 0 && first < T, 'one shell digs a bowl, not a hole');
  assert.ok(tankSurface(world, tank).d > 0, 'the tank rides down into it');
  assert.equal(supported(world, tank), true, 'a bowl still holds a tank');

  for (let i = 0; i < 2; i++) carveAt(world, surf.x, surf.y, CARVE.standard, BITE.standard);
  assert.equal(breached(world, spot.wall, spot.along), true, 'three shells in one spot break through');
  assert.equal(supported(world, tank), false, 'and the tank over a breach is unsupported');

  // the width matters, not just the depth: a narrow breach is still footing
  const narrow = replay(opening(4242));
  const nsurf = tankSurface(narrow, narrow.tanks[1]);
  carveAt(narrow, nsurf.x, nsurf.y, CARVE.heavy, BITE.heavy);
  let best = 0, cur = 0;
  for (let o = -14; o <= 14; o++) {
    const q = ringPoint(narrow.tanks[1].s + o);
    if (depthAt(narrow, q.wall, q.along) >= T - 1) { cur++; if (cur > best) best = cur; } else cur = 0;
  }
  assert.ok(best >= SUPPORTGAP, 'a heavy shell opens a breach wider than the treads can bridge');
  assert.equal(supported(narrow, narrow.tanks[1]), false, 'so that tank falls');
});

test('the middle of the box blocks shots until it is shot away', async () => {
  const { opening, replay, guide, carveAt, solidAt } = await engine();
  const world = replay(opening(SEED));
  const block = world.blocks[0];
  const cx = block.x + block.w / 2, cy = block.y + block.h / 2;
  assert.equal(solidAt(world, cx, cy).kind, 'block', 'a block is solid');
  let ends = 0;
  for (let a = 20; a <= 80; a += 3) for (let p = 12; p <= 24; p += 3) {
    const g = guide(world, 1, a, p, 'standard');
    if (g.hit && g.hit.kind === 'block') ends++;
  }
  assert.ok(ends > 0, 'some shots end on the block instead of reaching the far wall');
  carveAt(world, cx, cy, 24, 20);
  assert.equal(world.blockHoles.length, 1, 'the blast punched the block');
  assert.equal(solidAt(world, cx, cy), null, 'and a shell can now fly through the gap');
});

test('powerups rest on whatever floor is left', async () => {
  const { opening, replay, advance, POWERUPS, BY, BH, T } = await engine();
  const floor = BY + BH - T;
  let state = opening(SEED);
  state = advance(state, barrenFor(1)).next;
  let world = replay(state);
  assert.equal(world.powerups.length, 0, 'nothing has spawned yet');
  state = advance(state, barrenFor(2)).next;
  world = replay(state);
  assert.ok(world.powerups.length >= 1, 'the first spawn lands after the second shot');
  for (const pu of world.powerups) {
    assert.ok(POWERUPS.some(p => p.key === pu.key), 'the kind comes from the published table');
    assert.ok(pu.y > floor - 20, 'it rests on the floor surface');
  }
  assert.equal(world.powerups.length <= 4, true, 'at most a handful on the floor');
});

test('mines are plants, not warheads: the shell parks itself in the wall', async () => {
  const { opening, replay, guide, CARVE, RANGE, BITE, T } = await engine();
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
  assert.ok(BITE.mine > T, 'a mine digs through the wall in one go');
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
  assert.ok(stretched >= 100, 'many of those lines clearly doubled back off something');
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
  const { opening, replay, MAXHP, RULES } = await engine();
  assert.equal(RULES, 2);
  const world = replay(opening(1));
  assert.equal(world.tanks.length, 2);
  world.tanks.forEach((tank, i) => {
    assert.equal(tank.hp, MAXHP);
    assert.deepEqual(tank.ammo, { heavy: 0, cluster: 0, mine: 0, ricochet: 0 });
    assert.equal(tank.dir, i === 0 ? -1 : 1, 'the barrel leans at the other tank');
    assert.equal(tank.falling, null);
    const s = tank.s;
    assert.ok(s > 0 && s < 2728, 'the seat starts on the ring');
    assert.ok(Math.abs(Math.round(s) - (i === 0 ? 2030 : 1586)) < 3, 'seat 1 left along the floor, seat 2 right');
  });
  assert.equal(world.powerups.length, 0, 'fresh worlds carry no mishaps');
});
