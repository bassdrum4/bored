const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function moduleUnderTest(file, names, injections = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import [\s\S]*?;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
  const keys = Object.keys(injections);
  return new Function(...keys, source + '\nreturn {' + names.join(',') + '};')
    (...keys.map(key => injections[key]));
}

const daily = moduleUnderTest('src/daily.js', ['dailyDate', 'dailyStreak', 'seedNumber']);
const dex = moduleUnderTest('src/hub/gacha-dex.js', ['DEX', 'DEX_TYPES', 'DEX_CHART']);
const rewards = moduleUnderTest('src/hub/rewards.js', [
  'mergeWallet', 'walletBalance', 'activateWallet', 'spendFrom', 'grantOnce', 'buyRegular', 'readWallet', 'writeWallet', 'walletTrophies'
], { ...daily, readStored: () => null, writeStored: () => true, readStoredPrefix: () => ({}) });
const gacha = moduleUnderTest('src/hub/gacha.js', ['gachaState', 'pullEggs', 'hatchReady', 'lineOf', 'mon', 'skillsOf', 'lookFor', 'eggPools'],
  { ...daily, ...rewards, DEX: dex.DEX, DEX_TYPES: dex.DEX_TYPES });
const td = moduleUnderTest('src/hub/td.js', [
  'classOf', 'STAGES', 'CHAPTERS', 'canHit', 'pathsOf', 'unitStats', 'newBattle', 'step', 'deploy', 'retreat', 'canDeploy', 'starsFor', 'typeMultiplier',
  'tdFinish', 'tdState', 'dailyMissions', 'mondayOf', 'levelUp', 'squadFrom', 'levelCost', 'W', 'H'
], { ...daily, ...rewards, ...dex, gachaState: gacha.gachaState, lineOf: gacha.lineOf, mon: gacha.mon, skillsOf: gacha.skillsOf, lookFor: gacha.lookFor });
const { walletBalance, activateWallet, grantOnce } = rewards;

const TODAY = '2026-11-16'; // a Monday
const NOW = Date.parse('2026-11-16T15:00:00Z');
let tick = 0;
const later = () => NOW + (++tick) * 1000;
const opts = extra => ({ today: TODAY, now: later(), ...extra });
const always = v => () => v;
const fund = (w, g) => grantOnce(w, 'test:' + (++tick), g, { now: later() }).wallet;
const named = name => dex.DEX.findIndex(row => row[0] === name) + 1;
// A wallet that owns every species in `nums` (through hatch entries).
function owning(nums) {
  let w = fund(activateWallet({}, { today: TODAY, now: NOW }).wallet, {});
  for (const num of nums) w.entries['spend:own-' + num] = { at: 1, g: { regular: 0 }, x: { m: 'move', e: [0], w: 0, n: 0, d: TODAY } };
  w = rewards.mergeWallet(w);
  for (const num of nums) w.entries['hatch:own-' + num + '.0'] = { at: 2, x: { s: num, t: 0, n: 1, k: 0 } };
  return w;
}

test('classes come from stats, with healers the only hand-written list', () => {
  assert.equal(td.classOf(named('Chansey')), 'medic');
  assert.equal(td.classOf(named('Rattata')), 'vanguard');
  assert.equal(td.classOf(named('Onix')), 'blocker');
  assert.equal(td.classOf(named('Alakazam')), 'caster');
  assert.equal(td.classOf(named('Machamp')), 'guard');
  const classes = new Set(dex.DEX.map((row, i) => td.classOf(i + 1)));
  assert.deepEqual([...classes].sort(), ['blocker', 'caster', 'guard', 'medic', 'sniper', 'vanguard']);
});

test('chapter 1 has 8 stages and chapter 2 has 6, each with a walkable path from every spawn to the goal', () => {
  assert.deepEqual(td.CHAPTERS.map(c => c.stages.length), [8, 6]);
  assert.equal(td.STAGES.length, 14, 'stages unlock in this one order across chapters');
  assert.ok(td.CHAPTERS[0].stages[7].boss);
  const proton = td.CHAPTERS[1].stages[5];
  assert.ok(proton.boss && proton.admin, '2-6 is the Proton admin boss, worth 1 Gold');
  assert.ok(td.CHAPTERS[1].stages.every(s => s.waves.some(w => w[5])), 'every chapter 2 stage has flying waves');
  assert.ok(td.CHAPTERS[0].stages.every(s => s.waves.every(w => !w[5])), 'chapter 1 has none');
  for (const stage of td.STAGES) {
    assert.equal(stage.map.length, td.H, stage.id);
    for (const row of stage.map) assert.equal(row.length, td.W, stage.id);
    const paths = td.pathsOf(stage);
    assert.ok(paths.length >= 1, stage.id);
    for (const p of paths) {
      assert.ok(p.length > 1 && stage.map[p[p.length - 1][1]][p[p.length - 1][0]] === 'G', stage.id + ' reaches its goal');
    }
    assert.ok(stage.map.join('').includes('H'), stage.id + ' has high ground');
    assert.ok(stage.before.length && stage.after.length, stage.id + ' has dialogue');
  }
});

test('type matchups apply, and immunity is softened', () => {
  assert.equal(td.typeMultiplier('Water', ['Fire']), 2);
  assert.equal(td.typeMultiplier('Fire', ['Water']), 0.5);
  assert.equal(td.typeMultiplier('Normal', ['Ghost']), 0.25);
  assert.equal(td.typeMultiplier('Ground', ['Poison', 'Flying']), 0.5);
});

test('deploying follows tiles, energy and cooldowns; retreat refunds half', () => {
  const stage = td.STAGES[0];
  const squad = [td.unitStats(named('Machamp')), td.unitStats(named('Alakazam'))];
  const b = td.newBattle(stage, squad);
  assert.equal(td.canDeploy(b, 0, 0, 0), 'energy');
  b.energy = 50;
  assert.equal(td.canDeploy(b, 0, 2, 0), 'tile', 'a guard cannot stand on high ground');
  assert.equal(td.canDeploy(b, 1, 3, 1), 'tile', 'a caster cannot stand on the path');
  assert.equal(td.deploy(b, 0, 3, 1), null);
  assert.equal(td.canDeploy(b, 0, 4, 1), 'deployed');
  assert.equal(td.deploy(b, 1, 2, 0), null);
  const before = b.energy;
  td.retreat(b, b.units[0].id);
  assert.equal(b.energy, before + Math.floor(squad[0].cost / 2));
  assert.equal(td.canDeploy(b, 0, 3, 1), 'cooldown');
});

function play(stage, squad, plan) {
  const b = td.newBattle(stage, squad);
  for (let guard = 0; !b.over && guard < 20 * 400; guard++) {
    for (const [slot, x, y] of plan) td.deploy(b, slot, x, y);
    td.step(b);
  }
  return b;
}

test('an empty field loses stage 1-1, and a sensible squad clears it with 3 stars', () => {
  const stage = td.STAGES[0];
  assert.equal(play(stage, [], []).over, 'lose');
  const squad = [td.unitStats(named('Machamp')), td.unitStats(named('Alakazam')), td.unitStats(named('Onix'))];
  const won = play(stage, squad, [[0, 3, 1], [1, 2, 0], [2, 4, 1]]);
  assert.equal(won.over, 'win');
  assert.equal(td.starsFor(won), 3);
  assert.equal(won.wavesDone, stage.waves.length);
});

// The distance from a tile to the straight line a flyer takes from a spawn to the goal.
function toFlightLines(stage, x, y) {
  return Math.min(...td.pathsOf(stage).map(p => {
    const [[ax, ay], [bx, by]] = [p[0], p[p.length - 1]];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
  }));
}
test('every stage can be cleared by a strong, well-placed squad', () => {
  const groundTeam = ['Machamp', 'Alakazam', 'Onix', 'Blissey', 'Gyarados', 'Gengar', 'Dragonite', 'Snorlax'];
  // Flying stages need snipers: the same squad with three of them in place of casters and a guard.
  const airTeam = ['Machamp', 'Archeops', 'Onix', 'Blissey', 'Salamence', 'Terrakion', 'Dragonite', 'Snorlax'];
  for (const stage of td.STAGES) {
    const flying = stage.waves.some(w => w[5]);
    const squad = (flying ? airTeam : groundTeam).map(n => td.unitStats(named(n), { level: 10 }));
    if (flying) assert.ok(squad.filter(u => u.cls === 'sniper').length >= 2, 'the flying squad has snipers');
    // Block from the goal backwards, where every lane has merged, as a player would;
    // on flying stages, take the high ground nearest the flight lines first.
    const high = [];
    stage.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'H') high.push([x, y]); }));
    if (flying) high.sort((a, b) => toFlightLines(stage, ...a) - toFlightLines(stage, ...b));
    const ground = td.pathsOf(stage)[0].slice().reverse().filter(([x, y]) => stage.map[y][x] === '.');
    // On flying stages the snipers go out first, as a player would.
    const order = squad.map((u, slot) => slot).sort((a, b) => flying ? (squad[b].cls === 'sniper') - (squad[a].cls === 'sniper') : 0);
    const plan = order.map(slot => [slot, ...(squad[slot].ground ? ground.shift() || [0, 0] : high.shift() || [0, 0])]);
    const b = play(stage, squad, plan);
    assert.equal(b.over, 'win', stage.id + ' should be winnable');
  }
});

test('flyers cross in a straight line, ignore blockers, and only snipers hit them', () => {
  const stage = td.STAGES.find(s => s.id === '2-1');
  const blocker = td.unitStats(named('Onix'), { level: 10 }), caster = td.unitStats(named('Alakazam'), { level: 10 });
  const sniper = td.unitStats(named('Archeops'), { level: 10 });
  assert.equal(sniper.cls, 'sniper');
  assert.equal(td.canHit(sniper, { flying: true }), true);
  assert.equal(td.canHit(caster, { flying: true }), false);
  assert.equal(td.canHit(blocker, { flying: false }), true);
  // Without a sniper, every Zubat gets through: the ground wave is held, the flyers leak.
  const noAir = play(stage, [blocker, caster], [[0, 3, 1], [1, 2, 0]]);
  const flyers = stage.waves.filter(w => w[5]).reduce((n, w) => n + w[2], 0);
  assert.equal(noAir.over, 'lose');
  assert.ok(noAir.leaks >= Math.min(flyers, stage.lives), 'flyers leak past a blocker and a caster');
  // A spawned flyer's path is the straight line from spawn to goal.
  const b = td.newBattle(stage, []);
  while (!b.enemies.some(e => e.flying)) td.step(b);
  const bat = b.enemies.find(e => e.flying);
  assert.equal(bat.path.length, 2);
  // With snipers on the high ground beside the line, the stage is cleared.
  const won = play(stage, [blocker, sniper, td.unitStats(named('Salamence'), { level: 10 })], [[0, 4, 1], [1, 2, 0], [2, 5, 2]]);
  assert.equal(won.over, 'win');
});

test('snipers shoot flyers first, and everyone else the enemy with the least way left to go', () => {
  // A Rattata on the path and a Zubat in the air, both in a sniper's range: the Zubat is shot first.
  const stage = { id: 'x', lives: 3, level: 1, map: ['##########', 'S........G', '####H#####', '##########', '##########'],
    waves: [[0, named('Rattata'), 1, 1], [0, named('Zubat'), 1, 1, 0, 1]] };
  const sniper = td.unitStats(named('Archeops'));
  const b = td.newBattle(stage, [sniper]);
  b.energy = 99; td.deploy(b, 0, 4, 2);
  while (b.enemies.length < 2) td.step(b);
  const [rat, bat] = [b.enemies.find(e => !e.flying), b.enemies.find(e => e.flying)];
  // Both in range, the Rattata further along: by distance alone it would be shot first.
  Object.assign(rat, { x: 5, y: 1, seg: 5 }); Object.assign(bat, { x: 3, y: 1, seg: 0 });
  rat.speed = bat.speed = 0;
  while (rat.hp === rat.maxHp && bat.hp === bat.maxHp && !b.over) td.step(b);
  assert.ok(bat.hp < bat.maxHp && rat.hp === rat.maxHp, 'the first shot hits the flyer');
});

test('finishing pays waves every time, and first clear and first 3-star once', () => {
  const team = [named('Machamp'), named('Alakazam')];
  let w = owning(team);
  const first = td.tdFinish(w, { stage: '1-1', stars: 3, team, waves: 2 }, opts());
  assert.ok(first.ok);
  let b = walletBalance(first.wallet);
  assert.equal(b.waves, 2 + 5 * td.tdState(first.wallet, TODAY).daily.filter(m => m.done).length);
  assert.ok(b.coins >= 150, 'first clear 50 + first 3-star 100');
  assert.ok(b.plus >= 1);
  assert.ok(first.wallet.entries['gacha:start:stage'], 'the clear-1-1 starter mission');
  const again = td.tdFinish(first.wallet, { stage: '1-1', stars: 3, team, waves: 2 }, opts());
  const b2 = walletBalance(again.wallet);
  assert.equal(b2.waves - b.waves, 2, 'replays still pay waves');
  assert.equal(b2.coins, b.coins, 'but no second first-clear');
  assert.equal(td.tdFinish(w, { stage: '9-9', stars: 3, team }, opts()).ok, false);
  const lost = td.tdFinish(w, { stage: '1-2', stars: 0, team, waves: 1 }, opts());
  assert.equal(walletBalance(lost.wallet).coins, 0, 'a loss pays only the waves cleared');
});

test('stages unlock in order', () => {
  const team = [named('Machamp')];
  let w = owning(team);
  assert.deepEqual(td.tdState(w, TODAY).unlocked.slice(0, 3), [true, false, false]);
  w = td.tdFinish(w, { stage: '1-1', stars: 1, team, waves: 2 }, opts()).wallet;
  assert.deepEqual(td.tdState(w, TODAY).unlocked.slice(0, 3), [true, true, false]);
});

test('4 daily missions are drawn from the seed, without the admin mission for now', () => {
  const a = td.dailyMissions(TODAY).map(m => m.id), b = td.dailyMissions(TODAY).map(m => m.id);
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.ok(!a.includes('admin'));
  const days = new Set(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].map(d => td.dailyMissions(d).map(m => m.id).join()));
  assert.ok(days.size > 1, 'the draw changes from day to day');
});

test('daily missions pay once each, and all four pay a Plus', () => {
  const team = [named('Dratini'), named('Machamp'), named('Alakazam')]; // a 6★ line, three mons
  let w = owning(team);
  const ids = td.dailyMissions(TODAY).map(m => m.id);
  w = td.tdFinish(w, { stage: '1-1', stars: 3, team, waves: 2 }, opts()).wallet;
  // Clear with one type only, for 'mono'.
  w = td.tdFinish(w, { stage: '1-1', stars: 1, team: [named('Machamp')], waves: 2 }, opts()).wallet;
  const state = td.tdState(w, TODAY);
  for (const m of state.daily) assert.equal(m.done, true, m.id + ' should be done');
  assert.equal(state.dailyAll, true);
  assert.ok(ids.every(id => w.entries['td:daily:' + TODAY + ':' + id]));
});

test('weekly missions: Pokédoku dailies and teams count within the Monday week', () => {
  assert.equal(td.mondayOf('2026-11-22'), '2026-11-16');
  assert.equal(td.mondayOf('2026-11-16'), '2026-11-16');
  const team = [named('Machamp'), named('Alakazam'), named('Onix'), named('Gengar')];
  let w = owning(team);
  for (let i = 0; i < 10; i++) w.entries['pdoku:daily:doku:2026-11-1' + (i < 7 ? 6 + (i % 4) : 2)] = { at: 1 };
  for (let d = 16; d <= 19; d++) for (const mode of ['doku', 'inverse', 'shiny']) w.entries['pdoku:daily:' + mode + ':2026-11-' + d] = { at: 1 };
  for (const t of [[team[0]], [team[1]], [team[2], team[3]]]) w = td.tdFinish(w, { stage: '1-1', stars: 1, team: t, waves: 1 }, opts()).wallet;
  const weekly = Object.fromEntries(td.tdState(w, TODAY).weekly.map(m => [m.id, m.done]));
  assert.equal(weekly.doku10, true);
  assert.equal(weekly.teams3, true);
  assert.equal(weekly.boss5, false, 'the Poké Idle boss is not built yet');
  assert.equal(td.tdState(w, TODAY).weeklyAll, false);
});

test('levels cost coins and raise stats; the squad reads candy upgrades', () => {
  const num = named('Machamp');
  let w = owning([num]);
  assert.equal(td.levelUp(w, gacha.lineOf(num), opts()).reason, 'coins');
  w = fund(w, { coins: 1000 });
  w = td.levelUp(w, gacha.lineOf(num), opts()).wallet;
  assert.equal(walletBalance(w).coins, 1000 - td.levelCost(1));
  const [unit] = td.squadFrom(w, [num], TODAY);
  assert.equal(unit.level, 2);
  assert.ok(unit.atk > td.unitStats(num).atk);
  assert.deepEqual(td.squadFrom(w, [named('Mew')], TODAY), [], 'only owned species');
});

// Difficulty: the late stages want a type-matched squad. From the commons and rares
// (3★ and 4★ lines), take the 60 whose first type hits the stage's enemies hardest
// (or worst), build a squad with a class mix, and play it at level 3 with the same
// placement a player would use (snipers first and beside the flight lines when bats fly).
function squadFor(stage, rank) {
  const mult = (atk, defend) => td.typeMultiplier(atk, defend);
  const foes = stage.waves.map(w => gacha.mon(w[1]).types);
  const fit = num => foes.reduce((s, types) => s + Math.log2(mult(gacha.mon(num).types[0], types)), 0) / foes.length;
  const pool = dex.DEX.map((row, i) => [row, i + 1]).filter(([row]) => row[9] === 3 || row[9] === 4).map(([, num]) => num);
  const ranked = pool.map(num => [num, rank * fit(num) + (gacha.mon(num).bst || 0) / 2000]).sort((a, b) => b[1] - a[1]).map(([num]) => num).slice(0, 60);
  const by = cls => ranked.filter(num => td.classOf(num) === cls);
  const flying = stage.waves.some(w => w[5]);
  const core = [...by('blocker').slice(0, 1), ...by('guard').slice(0, 2), ...by('vanguard').slice(0, 1),
    ...(flying ? by('sniper').slice(0, 2) : by('caster').slice(0, 2)), ...by('sniper').slice(0, 1), ...by('medic').slice(0, 1), ...by('caster').slice(0, 1)];
  return [...new Set([...core, ...ranked])].slice(0, 8).map(num => td.unitStats(num, { level: 3 }));
}
function placed(stage, squad) {
  const flying = stage.waves.some(w => w[5]);
  const high = [];
  stage.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'H') high.push([x, y]); }));
  if (flying) high.sort((a, b) => toFlightLines(stage, ...a) - toFlightLines(stage, ...b));
  const ground = td.pathsOf(stage)[0].slice().reverse().filter(([x, y]) => stage.map[y][x] === '.');
  const order = squad.map((u, slot) => slot).sort((a, b) => flying ? (squad[b].cls === 'sniper') - (squad[a].cls === 'sniper') : 0);
  return order.map(slot => [slot, ...(squad[slot].ground ? ground.shift() || [0, 0] : high.shift() || [0, 0])]);
}
// Deploy in the plan's order, waiting for energy for the next one, as a player with a plan does.
function playInOrder(stage, squad, plan) {
  const b = td.newBattle(stage, squad);
  for (let guard = 0; !b.over && guard < 20 * 450; guard++) {
    for (const [slot, x, y] of plan) if (td.deploy(b, slot, x, y) === 'energy') break;
    td.step(b);
  }
  return b;
}
test('late stages want type-matched squads: matched level-3 commons and rares win, the worst-typed lose', () => {
  for (const id of ['1-8', '2-3', '2-4', '2-5', '2-6']) {
    const stage = td.STAGES.find(s => s.id === id);
    const good = squadFor(stage, 1), bad = squadFor(stage, -1);
    assert.equal(playInOrder(stage, good, placed(stage, good)).over, 'win', id + ': a type-matched level-3 squad wins');
    assert.equal(playInOrder(stage, bad, placed(stage, bad)).over, 'lose', id + ': the worst-typed level-3 squad loses');
  }
});
