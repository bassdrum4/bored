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
const gacha = moduleUnderTest('src/hub/gacha.js', ['gachaState', 'pullEggs', 'hatchReady', 'lineOf', 'mon', 'skillsOf', 'lookFor', 'eggPools', 'pickStarter', 'STARTERS', 'STARTER_GIFTS'],
  { ...daily, ...rewards, DEX: dex.DEX, DEX_TYPES: dex.DEX_TYPES });
const td = moduleUnderTest('src/hub/td.js', [
  'classOf', 'STAGES', 'CHAPTERS', 'MAX_RISK', 'WEEKLY_MILESTONES', 'WEEKLY_UNLOCK', 'canHit', 'FUSE', 'BLAST', 'ARMOR', 'RISKS', 'riskOf', 'weeklyStage', 'tdWeekly', 'pathsOf', 'unitStats', 'newBattle', 'step', 'deploy', 'retreat', 'canDeploy', 'starsFor', 'typeMultiplier',
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

test('chapters 1-4 have 8, 6, 6 and 6 stages, each with a walkable path from every spawn to the goal', () => {
  assert.deepEqual(td.CHAPTERS.map(c => c.stages.length), [8, 6, 6, 6]);
  assert.equal(td.STAGES.length, 26, 'stages unlock in this one order across chapters');
  const ariana = td.CHAPTERS[3].stages[5];
  assert.ok(ariana.boss && ariana.admin && ariana.waves.some(w => w[4] && w[7]), '4-6 is the Ariana admin boss, an armored Arbok');
  assert.ok(td.CHAPTERS[3].stages.every(s => s.waves.some(w => w[7])), 'every chapter 4 stage has armored waves');
  const petrel = td.CHAPTERS[2].stages[5];
  assert.ok(petrel.boss && petrel.admin, '3-6 is the Petrel admin boss');
  assert.ok(td.CHAPTERS[2].stages.every(s => s.waves.some(w => w[6])), 'every chapter 3 stage has exploding waves');
  assert.ok(td.STAGES.filter(s => (s.chapter || 1) < 3).every(s => s.waves.every(w => !w[6])), 'chapters 1 and 2 have none');
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
  // Armored stages need casters too: two of each.
  const mixedTeam = ['Machamp', 'Alakazam', 'Onix', 'Blissey', 'Archeops', 'Gengar', 'Salamence', 'Snorlax'];
  for (const stage of td.STAGES) {
    const flying = stage.waves.some(w => w[5]);
    const armored = stage.waves.some(w => w[7]);
    const squad = (armored ? mixedTeam : flying ? airTeam : groundTeam).map(n => td.unitStats(named(n), { level: 10 }));
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

test('exploders light a fuse when blocked and blow up on every unit nearby, unless killed first', () => {
  const stage = { id: 'x', lives: 3, level: 1, map: ['##########', 'S........G', '##H#######', '##########', '##########'], waves: [[0, named('Koffing'), 1, 1, 0, 0, 1]] };
  const onix = td.unitStats(named('Onix')), machamp = td.unitStats(named('Machamp'));
  // A blocker alone: the Koffing is held, burns its fuse, and blasts the blocker and its neighbour.
  let b = td.newBattle(stage, [onix, machamp]);
  b.energy = 99;
  td.deploy(b, 0, 3, 1); td.deploy(b, 1, 4, 1);
  b.units.forEach(u => { u.atk = 0; });
  const full = b.units.map(u => u.hp);
  while (!b.enemies.length) td.step(b);
  while (!b.enemies[0].fuse) td.step(b);
  assert.ok(b.enemies[0].fuse <= td.FUSE, 'the fuse is lit once it is blocked');
  while (b.enemies.length) td.step(b);
  assert.equal(b.blasts, 1, 'it blew up');
  assert.ok(b.units.every((u, i) => u.hp < full[i]), 'every unit within the blast is hurt');
  assert.equal(b.leaks, 0, 'a blast is not a leak');
  // Killed before the fuse runs out: no blast.
  b = td.newBattle(stage, [onix, td.unitStats(named('Mewtwo'), { level: 10 })]);
  b.energy = 99;
  td.deploy(b, 0, 3, 1); td.deploy(b, 1, 2, 2);
  for (let i = 0; i < 400 && !b.over; i++) td.step(b);
  assert.equal(b.over, 'win');
  assert.ok(!b.blasts, 'a Koffing shot down before its fuse runs out never explodes');
  // The fuse goes out when its blocker leaves.
  b = td.newBattle(stage, [onix]);
  b.energy = 99; td.deploy(b, 0, 5, 1);
  b.units[0].atk = 0;
  while (!b.enemies.length || !b.enemies[0].fuse) td.step(b);
  td.retreat(b, b.units[0].id);
  td.step(b);
  assert.equal(b.enemies[0].fuse, null, 'unblocked, it walks on with no fuse');
});

test('armor triples Defense against physical hits, and casters go straight through it', () => {
  const stage = { id: 'x', lives: 3, level: 1, map: ['##########', 'S........G', '####H#####', '##########', '##########'],
    waves: [[0, named('Graveler'), 1, 1, 0, 0, 0, 1]] };
  const damage = unit => {
    const b = td.newBattle(stage, [unit]);
    b.energy = 99; td.deploy(b, 0, 4, 2);
    while (!b.enemies.length) td.step(b);
    const e = b.enemies[0];
    Object.assign(e, { x: 4, y: 1, seg: 4, speed: 0 });
    while (e.hp === e.maxHp) td.step(b);
    return e.maxHp - e.hp;
  };
  const sniper = td.unitStats(named('Archeops'), { level: 5 }), caster = td.unitStats(named('Alakazam'), { level: 5 });
  const plain = { ...stage, waves: [[0, named('Graveler'), 1, 1]] };
  const plainDamage = unit => { const b = td.newBattle(plain, [unit]); b.energy = 99; td.deploy(b, 0, 4, 2); while (!b.enemies.length) td.step(b);
    const e = b.enemies[0]; Object.assign(e, { x: 4, y: 1, seg: 4, speed: 0 }); while (e.hp === e.maxHp) td.step(b); return e.maxHp - e.hp; };
  assert.ok(damage(sniper) < plainDamage(sniper), 'a sniper does less to an armored Graveler');
  assert.equal(damage(caster), plainDamage(caster), 'a caster does the same either way');
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
  assert.equal(weekly.boss5, false, 'no daily boss wins yet');
  assert.equal(td.tdState(w, TODAY).weeklyAll, false);
});

test('weekly: the Poké Idle daily boss on 5 days of the week opens the mission (and the all-weekly Gold can be reached)', () => {
  let w = owning([named('Machamp')]);
  for (const d of ['2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']) w.entries['pi:boss:' + d] = { at: 1, g: { coins: 150, waves: 15 } };
  const done = wallet => td.tdState(wallet, TODAY).weekly.find(m => m.id === 'boss5').done;
  w = td.tdFinish(w, { stage: '1-1', stars: 1, team: [named('Machamp')], waves: 1 }, opts()).wallet;
  assert.equal(done(w), false, 'last Friday is another week');
  w.entries['pi:boss:2026-11-22'] = { at: 1, g: { coins: 150, waves: 15 } };
  w = td.tdFinish(w, { stage: '1-1', stars: 1, team: [named('Machamp')], waves: 1 }, opts()).wallet;
  assert.equal(done(w), true);
  assert.ok(w.entries['td:week:2026-11-16:boss5']);
  assert.ok(td.tdState(w, TODAY).weekly.every(m => !m.later), 'no weekly mission is locked');
});

test('weekly missions report how far along they are', () => {
  let w = owning([named('Machamp')]);
  for (const d of ['2026-11-16', '2026-11-17']) w.entries['pi:boss:' + d] = { at: 1 };
  for (let d = 16; d <= 18; d++) w.entries['pdoku:daily:doku:2026-11-' + d] = { at: 1 };
  w = td.tdFinish(w, { stage: '1-1', stars: 1, team: [named('Machamp')], waves: 1 }, opts()).wallet;
  const weekly = Object.fromEntries(td.tdState(w, TODAY).weekly.map(m => [m.id, [m.have, m.need, m.done]]));
  assert.deepEqual(weekly.boss5, [2, 5, false]);
  assert.deepEqual(weekly.doku10, [3, 10, false]);
  assert.deepEqual(weekly.teams3, [1, 3, false]);
  assert.deepEqual(weekly.star3x5, [0, 5, false]);
  for (let d = 19; d <= 21; d++) w.entries['pi:boss:2026-11-' + d] = { at: 1 };
  w = td.tdFinish(w, { stage: '1-1', stars: 1, team: [named('Machamp')], waves: 1 }, opts()).wallet;
  assert.deepEqual(td.tdState(w, TODAY).weekly.find(m => m.id === 'boss5').have, 5, 'a claimed mission shows full');
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
  // Snipers first when bats fly; on armored stages a cheap vanguard holds the path first.
  const armored = stage.waves.some(w => w[7]);
  const pri = u => (armored && u.cls === 'vanguard' ? 2 : 0) + (flying && u.cls === 'sniper' ? 1 : 0);
  const order = squad.map((u, slot) => slot).sort((a, b) => pri(squad[b]) - pri(squad[a]));
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
  for (const id of ['1-8', '2-3', '2-4', '2-5', '2-6', '3-1', '3-2', '3-3', '3-4', '3-5', '3-6', '4-1', '4-2', '4-4', '4-5', '4-6']) {
    const stage = td.STAGES.find(s => s.id === id);
    const good = squadFor(stage, 1), bad = squadFor(stage, -1);
    assert.equal(playInOrder(stage, good, placed(stage, good)).over, 'win', id + ': a type-matched level-3 squad wins');
    // The Petrel boss is the one stage a worst-typed squad can scrape through, with 1 star.
    if (id !== '3-6') assert.equal(playInOrder(stage, bad, placed(stage, bad)).over, 'lose', id + ': the worst-typed level-3 squad loses');
  }
});

test('weekly challenge: one stage a week for everyone, and risks that stack', () => {
  const a = td.weeklyStage('2026-11-16'), b = td.weeklyStage('2026-11-16');
  assert.equal(a.base, b.base, 'the same stage for everyone in a week');
  assert.ok(!a.boss && a.weekly);
  const weeks = new Set(['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'].map(m => td.weeklyStage(m).base));
  assert.ok(weeks.size > 1, 'it changes from week to week');
  assert.equal(td.riskOf(['hp', 'onelife', 'six']), 6);
  assert.equal(td.riskOf(['nonsense']), 0);
  // The risks change the battle.
  const squad = [td.unitStats(named('Chansey')), td.unitStats(named('Machamp'))];
  const plain = td.newBattle(a, squad), hard = td.newBattle(a, squad, ['onelife', 'nomedic', 'cost', 'energy']);
  assert.equal(hard.life, 1);
  hard.energy = 99;
  assert.equal(td.canDeploy(hard, 0, 0, 0), 'banned', 'no medics');
  plain.energy = hard.energy = 20; td.step(plain); td.step(hard);
  assert.ok(hard.energy - 20 < plain.energy - 20, 'energy refills slower');
  const six = td.newBattle(a, Array(8).fill(td.unitStats(named('Machamp'))), ['six']);
  six.energy = 999;
  const ground = []; a.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.') ground.push([x, y]); }));
  for (let slot = 0; slot < 8; slot++) td.deploy(six, slot, ...ground[slot]);
  assert.equal(six.units.length, 6, 'at most 6 units on the field');
  // Spawned enemies carry the HP risk.
  const tough = td.newBattle(a, [], ['hp']), base = td.newBattle(a, []);
  while (!tough.enemies.length) td.step(tough);
  while (!base.enemies.length) td.step(base);
  assert.ok(tough.enemies[0].maxHp > base.enemies[0].maxHp);
});

test('weekly challenge: a win records its risk as the week score, and waves still pay', () => {
  const team = [named('Machamp')];
  let w = owning(team);
  w = td.tdFinish(w, { stage: '1-8', stars: 1, team, waves: 0 }, opts()).wallet;
  const wavesBefore = walletBalance(w).waves;
  w = td.tdWeekly(w, { mods: ['hp', 'atk'], stars: 2, waves: 2 }, opts()).wallet;
  w = td.tdWeekly(w, { mods: ['onelife'], stars: 0, waves: 1 }, opts()).wallet;
  const state = td.tdState(w, TODAY);
  assert.equal(state.challengeBest, 2, 'a loss does not count; the win with 2 risk does');
  assert.equal(walletBalance(w).waves - wavesBefore, 3, 'waves cleared pay either way');
});

test('weekly challenge: opens after 1-8, and risk milestones pay once a week each', () => {
  assert.equal(td.MAX_RISK, 13, 'every risk at once');
  assert.deepEqual(td.WEEKLY_MILESTONES.map(m => m.risk), [3, 7, 10, 12], 'about 25, 50, 75 and 90% of 13');
  assert.equal(td.WEEKLY_UNLOCK, '1-8');
  const team = [named('Machamp')];
  let w = owning(team);
  assert.equal(td.tdState(w, TODAY).challengeOpen, false);
  assert.equal(td.tdWeekly(w, { mods: ['hp'], stars: 3, waves: 2 }, opts()).reason, 'locked', 'locked until the chapter 1 boss falls');
  w = td.tdFinish(w, { stage: '1-8', stars: 1, team, waves: 0 }, opts()).wallet;
  assert.equal(td.tdState(w, TODAY).challengeOpen, true);
  const before = walletBalance(w);
  // A loss at risk 13 pays no milestone.
  const all = td.RISKS.map(r => r.id);
  let r = td.tdWeekly(w, { mods: all, stars: 0, waves: 1 }, opts());
  assert.deepEqual(r.claimed, []);
  // A win at risk 7 (one life + fast + six = 7) pays the first two.
  r = td.tdWeekly(r.wallet, { mods: ['onelife', 'fast', 'six'], stars: 1, waves: 2 }, opts());
  assert.equal(r.risk, 7);
  assert.deepEqual(r.claimed, [0, 1]);
  w = r.wallet;
  let bal = walletBalance(w);
  assert.deepEqual([bal.plus - before.plus, bal.premium - before.premium, bal.gold - before.gold], [1, 1, 0]);
  // The same milestones never pay twice in a week; risk 13 adds Gold and 50 shards.
  r = td.tdWeekly(w, { mods: ['onelife', 'fast', 'six'], stars: 3, waves: 2 }, opts());
  assert.deepEqual(r.claimed, [], 'already paid this week');
  r = td.tdWeekly(r.wallet, { mods: all, stars: 1, waves: 2 }, opts());
  assert.deepEqual(r.claimed, [2, 3]);
  bal = walletBalance(r.wallet);
  assert.deepEqual([bal.plus - before.plus, bal.premium - before.premium, bal.gold - before.gold, bal.shards - before.shards], [1, 1, 1, 50]);
  assert.deepEqual(td.tdState(r.wallet, TODAY).challengeClaimed, [true, true, true, true]);
  // Next week they pay again.
  const nextWeek = '2026-11-23';
  assert.deepEqual(td.tdState(r.wallet, nextWeek).challengeClaimed, [false, false, false, false]);
  const again = td.tdWeekly(r.wallet, { mods: ['onelife'], stars: 1, waves: 2 }, { today: nextWeek, now: later() });
  assert.deepEqual(again.claimed, [0]);
});

test('every starter with its three gifts clears 1-1 at level 1, deployed blocker first', () => {
  const stage = td.STAGES.find(s => s.id === '1-1');
  for (const starter of gacha.STARTERS) {
    const wallet = gacha.pickStarter(activateWallet({}, { today: TODAY, now: NOW }).wallet, starter, opts()).wallet;
    // The gifts first (Geodude holds the path), then the starter, as the squad screen lists them.
    const squad = td.squadFrom(wallet, [...gacha.STARTER_GIFTS, starter], TODAY);
    assert.equal(squad.length, 4, 'the starter squad is four');
    const plan = placed(stage, squad);
    const b = playInOrder(stage, squad, plan);
    assert.equal(b.over, 'win', gacha.mon(starter).name + ' and the gifts win 1-1');
  }
});
