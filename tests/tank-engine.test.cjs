const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = () => import('../src/games/tank-engine.js');

function documentTerrain() {
  const source = fs.readFileSync(path.join(__dirname, '../src/games/content/tank2.html'), 'utf8');
  const names = ['genHills', 'genMountains', 'genValley', 'genDunes', 'genPlateau'];
  const extract = name => {
    const start = source.indexOf('function ' + name + '(');
    let end = source.indexOf('{', start), depth = 1;
    while (depth && ++end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
    return source.slice(start, end + 1);
  };
  const setup = 'const W=960,H=540,BEDY=H-25;let terrain=[];';
  const fn = new Function(setup + names.map(extract).join('\n') +
    ';return {read:()=>terrain.slice(),gens:[' + names.join(',') + ']};')();
  return fn.gens.map(gen => { gen(); return fn.read(); });
}

// Search a small grid of shots for one that actually lands on the other tank:
// terrain decides whether a given angle clears the hills, so the tests cannot
// assume a fixed one.
async function findHit(state, seat) {
  const { replay, advance } = await engine();
  const tank = replay(state).tanks[seat - 1];
  const before = replay(state).tanks[2 - seat].hp;
  for (const angle of [45, 40, 50, 35, 55, 30, 60, 25, 65, 20, 70]) {
    for (const power of [20, 18, 16, 14, 12, 10]) {
      const shot = { seat, x: tank.x, angle, power, weapon: 'standard' };
      let result;
      try { result = advance(state, shot); } catch { continue; }
      if (result.world.tanks[2 - seat].hp < before) return shot;
    }
  }
  return null;
}

test('the engine terrain is the document terrain, column for column, on every layout', async () => {
  const { terrain, LAYOUTS } = await engine();
  const boards = documentTerrain();
  assert.equal(boards.length, LAYOUTS.length);
  boards.forEach((board, index) => {
    const ours = terrain(index, 0);
    assert.equal(ours.length, board.length);
    for (let x = 0; x < board.length; x++) assert.ok(Math.abs(ours[x] - board[x]) < 1e-9, `layout ${index} at ${x}`);
  });
});

test('a shot list replays to the same board every time, and only the seed decides the map', async () => {
  const { opening, replay, advance, terrain } = await engine();
  const start = opening(1234567);
  assert.equal(start.shots.length, 0);
  assert.equal(start.turn, 1);
  const world = replay(start);
  assert.equal(world.tanks[0].x < world.tanks[1].x, true, 'the first player starts on the left');
  assert.ok(Math.abs(world.tanks[0].x - 144) <= 60, 'a tank settles on a level spot near its side');
  let state = start;
  for (let i = 0; i < 4; i++) {
    const shot = await findHit(state, state.turn);
    assert.ok(shot, 'seat ' + state.turn + ' can reach the other tank on this map');
    state = advance(state, shot).next;
  }
  const once = replay(state), twice = replay(JSON.parse(JSON.stringify(state)));
  assert.equal(once.tanks[0].hp, twice.tanks[0].hp);
  assert.equal(once.tanks[1].hp, twice.tanks[1].hp);
  assert.deepEqual([...once.board], [...twice.board]);
  assert.ok(once.tanks[0].hp < 100 && once.tanks[1].hp < 100, 'both sides took damage the replay reproduces');
  const other = replay(opening(99));
  assert.notDeepEqual([...other.board], [...once.board], 'a different seed is a different map');
  assert.equal(replay(opening(1234567)).layout, world.layout);
  assert.notEqual(terrain(0, 0)[480], terrain(0, .4)[480]);
});

test('shots are bounded by the field, the fuel tank, the angle and the shells in hand', async () => {
  const { opening, replay, advance, validateShot } = await engine();
  const state = opening(4242), world = replay(state);
  const seat = 1, x = world.tanks[0].x;
  assert.equal(validateShot(world, { x, angle: 45, power: 10, weapon: 'standard' }, seat), null);
  assert.match(validateShot(world, { x, angle: 45, power: 10, weapon: 'standard' }, 2), /not your turn/);
  assert.match(validateShot(world, { x: 5, angle: 45, power: 10, weapon: 'standard' }, seat), /off the field/);
  assert.match(validateShot(world, { x: x + 700, angle: 45, power: 10, weapon: 'standard' }, seat), /fuel/);
  assert.match(validateShot(world, { x, angle: 89, power: 10, weapon: 'standard' }, seat), /5 and 85/);
  assert.match(validateShot(world, { x, angle: 45, power: 0, weapon: 'standard' }, seat), /Power/);
  assert.match(validateShot(world, { x, angle: 45, power: 10, weapon: 'nuke' }, seat), /No nuke/);
  assert.match(validateShot(world, { x, angle: 45.5, power: 10, weapon: 'standard' }, seat), /5 and 85/);
  assert.throws(() => advance(state, { seat: 2, x, angle: 45, power: 10, weapon: 'standard' }), /not your turn/);
  const after = advance(state, { seat: 1, x, angle: 45, power: 20, weapon: 'standard' });
  assert.equal(after.next.turn, 2);
  assert.deepEqual(after.next.shots[0], { seat: 1, x, angle: 45, power: 20, weapon: 'standard' });
  assert.ok(after.world.powerups.length >= 1, 'a power-up appears as the turn ends');
});

test('power-ups, damage and a winner all come out of the replay, not out of a report', async () => {
  const { opening, replay, advance, consistent, POWERUPS } = await engine();
  let state = opening(777);
  let guard = 0;
  while (!state.winner && guard++ < 24) {
    const shot = await findHit(state, state.turn);
    assert.ok(shot, 'both sides can still reach each other');
    const result = advance(state, shot);
    state = result.next;
    for (const pu of result.world.powerups) assert.ok(POWERUPS.some(p => p.key === pu.key));
  }
  assert.ok(state.winner, 'one side runs out of hit points');
  assert.equal(state.turn, null);
  const settled = replay(state);
  assert.equal(settled.winner, state.winner);
  assert.equal(settled.tanks[state.winner - 1].hp > 0, true, 'the winner is the tank still standing');
  assert.equal(consistent(state), true);
  assert.equal(consistent({ ...state, winner: 3 - state.winner }), false, 'a claimed result the shots do not support is caught');
  assert.equal(advance.length >= 2, true);
  // The board itself never travels: only the seed and the shots do.
  assert.deepEqual(Object.keys(state).sort(), ['seed', 'shots', 'turn', 'winner']);
  const source = fs.readFileSync(path.join(__dirname, '../src/games/tank-engine.js'), 'utf8');
  assert.equal(/Math\.random|Date\.now|document\./.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'the engine stays deterministic');
});
