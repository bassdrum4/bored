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
const { DEX, DEX_TYPES } = moduleUnderTest('src/hub/gacha-dex.js', ['DEX', 'DEX_TYPES']);
const rewards = moduleUnderTest('src/hub/rewards.js', [
  'mergeWallet', 'walletBalance', 'activateWallet', 'spendFrom', 'grantOnce', 'buyRegular', 'readWallet', 'writeWallet', 'walletTrophies'
], { ...daily, readStored: () => null, writeStored: () => true, readStoredPrefix: () => ({}) });
const gacha = moduleUnderTest('src/hub/gacha.js', [
  'gachaState', 'pullEggs', 'hatchReady', 'evolve', 'upgrade', 'buySp', 'setBuddy', 'claimLogin',
  'eggPools', 'bannerFor', 'lineOf', 'stageOf', 'evolutionsOf', 'skillsOf', 'RARITY_PITY'
], { ...daily, ...rewards, DEX, DEX_TYPES });
const { mergeWallet, walletBalance, activateWallet, grantOnce } = rewards;
const { gachaState, pullEggs, hatchReady, evolve, upgrade, buySp, setBuddy, claimLogin, eggPools, bannerFor } = gacha;

const TODAY = '2026-11-16';
const NOW = Date.parse('2026-11-16T15:00:00Z');
// mulberry32: a small seeded generator so every run rolls the same eggs.
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const always = value => () => value;
let tick = 0;
const later = () => NOW + (++tick) * 1000;
const opts = extra => ({ today: TODAY, now: later(), ...extra });
const fund = (wallet, grant, id = 'test:' + (++tick)) => grantOnce(wallet, id, grant, { now: later() }).wallet;
const fresh = grant => fund(activateWallet({}, { today: TODAY, now: NOW }).wallet, grant);
const pull = (wallet, extra) => {
  const result = pullEggs(wallet, opts(extra));
  assert.ok(result.ok, 'pull refused: ' + result.reason);
  return result;
};

test('the egg pool is base forms only, with no mythicals, and every tier is filled', () => {
  const pools = eggPools();
  assert.deepEqual(pools.slice(0, 4).map(p => p.length > 0), [true, true, true, true]);
  for (const pool of pools) for (const num of pool) {
    assert.equal(DEX[num - 1][8], 0, DEX[num - 1][0] + ' is not a base form');
    assert.notEqual(DEX[num - 1][10], 'my', DEX[num - 1][0] + ' is a mythical');
  }
  const named = name => DEX.findIndex(row => row[0] === name) + 1;
  assert.ok(pools[3].includes(named('Dratini')) && pools[3].includes(named('Mewtwo')));
  assert.ok(pools[2].includes(named('Eevee')) && pools[2].includes(named('Riolu')) && pools[2].includes(named('Bulbasaur')));
  assert.ok(!pools.flat().includes(named('Pikachu')), 'Pichu is the base form, not Pikachu');
  assert.ok(pools[4].every(num => pools[3].includes(num) && DEX[num - 1][10] === 'lg'), 'banners are legendaries');
});

test('the banner legendary comes from the shared daily seed', () => {
  assert.equal(bannerFor(TODAY), bannerFor(TODAY));
  const week = new Set(['10', '11', '12', '13', '14', '15', '16'].map(d => bannerFor('2026-11-' + d)));
  assert.ok(week.size > 1, 'the banner changes from day to day');
});

test('rates follow the 256 table', () => {
  let wallet = fresh({ regular: 5000, waves: 0 });
  const counts = [0, 0, 0, 0, 0];
  const rand = seeded(7);
  for (let i = 0; i < 400; i++) {
    const result = pull(wallet, { voucher: 'regular', count: 1, machine: 'legend', rand });
    counts[result.eggs[0].tier]++;
    // Hatch nothing; drop the eggs by starting from the same funds each time but keep pity moving.
    wallet = result.wallet;
    if (gachaState(wallet, TODAY).eggs.length >= 99) wallet = fund(wallet, { waves: 1000 }), wallet = hatchReady(wallet, opts({ rand })).wallet;
  }
  // 400 eggs: about 317 Common and 69 Rare by the table, with pity adding Rares.
  assert.ok(counts[0] > 250 && counts[0] < 340, 'common ' + counts[0]);
  assert.ok(counts[1] > 40 && counts[1] < 110, 'rare ' + counts[1]);
});

test('rarity pity upgrades the next Common after 9 eggs with no Rare, and after 59 with no Epic', () => {
  let wallet = fresh({ regular: 200, waves: 100000 });
  const tiers = [];
  for (let i = 0; i < 60; i++) {
    const result = pull(wallet, { voucher: 'regular', count: 1, machine: 'move', rand: always(0) });
    tiers.push(result.eggs[0].tier);
    wallet = result.wallet;
  }
  assert.deepEqual(tiers.slice(0, 10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(tiers[19], 1);
  assert.equal(tiers[59], 2, 'the 60th egg is the Epic pity');
  assert.equal(gachaState(wallet, TODAY).pity.epic, 0);
});

test('Legendary UP counts each non-legendary egg double toward Legendary pity', () => {
  let wallet = fresh({ regular: 20 });
  wallet = pull(wallet, { voucher: 'regular', count: 1, machine: 'legend', rand: always(0) }).wallet;
  wallet = pull(wallet, { voucher: 'regular', count: 1, machine: 'move', rand: always(0) }).wallet;
  assert.equal(gachaState(wallet, TODAY).pity.legendary, 3);
});

test('Premium, Gold and ten Regulars carry their guarantee', () => {
  const low = always(0.01);
  const premium = pull(fresh({ premium: 1 }), { voucher: 'premium', rand: low });
  assert.equal(premium.eggs.length, 10);
  assert.ok(premium.eggs.some(e => e.tier >= 1));
  const gold = pull(fresh({ gold: 1 }), { voucher: 'gold', rand: low });
  assert.equal(gold.eggs.length, 25);
  assert.ok(gold.eggs.some(e => e.tier >= 2));
  const plus = pull(fresh({ plus: 1 }), { voucher: 'plus', rand: low });
  assert.equal(plus.eggs.length, 5);
  const ten = pull(fresh({ regular: 10 }), { voucher: 'regular', count: 10, rand: low });
  assert.ok(ten.eggs.some(e => e.tier >= 1));
  assert.equal(walletBalance(ten.wallet).regular, 2, 'ten spent, plus the first-pull starter mission');
  assert.equal(pullEggs(fresh({ regular: 5 }), opts({ count: 5 })).ok, false, 'only 1 or 10 Regulars at once');
});

test('a pull needs vouchers, an active wallet and room under 99 eggs', () => {
  assert.equal(pullEggs(fresh({}), opts()).reason, 'vouchers');
  assert.equal(pullEggs(fund({}, { regular: 1 }), opts()).reason, 'inactive');
  let wallet = fresh({ gold: 4 });
  for (let i = 0; i < 3; i++) wallet = pull(wallet, { voucher: 'gold' }).wallet;
  assert.equal(gachaState(wallet, TODAY).eggs.length, 75);
  assert.equal(pullEggs(wallet, opts({ voucher: 'gold' })).reason, 'full');
});

test('eggs count down on waves earned after the pull, and hatch once', () => {
  let wallet = fresh({ regular: 1, waves: 50 });
  wallet = pull(wallet, { rand: always(0) }).wallet;
  let state = gachaState(wallet, TODAY);
  assert.deepEqual([state.eggs[0].progress, state.eggs[0].need, state.eggs[0].ready], [0, 5, false],
    'waves banked before the pull do not count');
  assert.equal(hatchReady(wallet, opts()).hatched.length, 0);
  wallet = fund(wallet, { waves: 5 });
  const hatched = hatchReady(wallet, opts({ rand: always(0) }));
  assert.equal(hatched.hatched.length, 1);
  const egg = hatched.hatched[0];
  assert.equal(egg.fresh, true);
  assert.equal(egg.shards, 0);
  state = gachaState(hatched.wallet, TODAY);
  assert.equal(state.eggs.length, 0);
  assert.deepEqual(state.owned, [egg.species]);
  assert.equal(state.lines[egg.species].candy, 10);
  assert.ok(state.lines[egg.species].skills.some(Boolean), 'the first hatch always gives a skill');
  assert.equal(state.missions.hatch, true);
  assert.equal(hatchReady(hatched.wallet, opts()).hatched.length, 0);
});

test('an egg hatched on two devices pays once after the merge', () => {
  let wallet = fresh({ regular: 2, waves: 0 });
  wallet = pull(wallet, { rand: always(0) }).wallet;
  wallet = pull(wallet, { rand: always(0) }).wallet;
  wallet = fund(wallet, { waves: 10 });
  const a = hatchReady(wallet, opts({ rand: always(0) })).wallet;
  const b = hatchReady(wallet, opts({ rand: always(0.5) })).wallet;
  const merged = mergeWallet(a, b);
  assert.equal(gachaState(merged, TODAY).hatched.length, 2);
  const shards = walletBalance(merged).shards;
  assert.ok(shards === walletBalance(a).shards || shards === walletBalance(b).shards);
});

test('dupes give shards, and the 10th hatch after 9 dupes in a tier is new', () => {
  let wallet = fresh({ regular: 20, waves: 0 });
  for (let i = 0; i < 12; i++) wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = fund(wallet, { waves: 100 });
  // Always the first species in the pool. The 10th egg is a Rare from rarity
  // pity, so the 12 eggs hold 11 Commons: one new, nine dupes, then dupe pity.
  const { hatched, wallet: after } = hatchReady(wallet, opts({ rand: always(0.001) }));
  const commons = hatched.filter(h => h.tier === 0);
  assert.equal(commons[0].fresh, true);
  assert.ok(commons.slice(1, 10).every(h => !h.fresh && h.shards === 1), 'nine dupes, 1 shard each');
  assert.equal(commons[10].fresh, true, 'dupe pity forces a new species');
  assert.equal(walletBalance(after).shards, 9);
});

test('candy evolves, unlocks the passive and cuts the deploy cost in order', () => {
  let wallet = fresh({ regular: 3, waves: 0 });
  wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = fund(wallet, { waves: 100 });
  wallet = hatchReady(wallet, opts({ rand: always(0.001) })).wallet;
  const base = gachaState(wallet, TODAY).owned[0];
  const line = gacha.lineOf(base);
  assert.equal(gachaState(wallet, TODAY).lines[line].candy, 30);
  const next = gacha.evolutionsOf(base)[0];
  assert.ok(next, 'the first common species evolves');
  assert.equal(evolve(wallet, base, 1, opts()).reason, 'unknown');
  wallet = evolve(wallet, base, next, opts()).wallet;
  let state = gachaState(wallet, TODAY);
  assert.ok(state.owned.includes(next));
  assert.equal(state.lines[line].candy, 5);
  assert.equal(evolve(wallet, base, next, opts()).reason, 'owned');
  assert.equal(upgrade(wallet, line, 'passive', opts()).reason, 'candy');
  wallet = fund(wallet, { ['candy:' + line]: 200 });
  assert.equal(upgrade(wallet, line, 'cost2', opts()).reason, 'order');
  wallet = upgrade(wallet, line, 'passive', opts()).wallet;
  wallet = upgrade(wallet, line, 'cost1', opts()).wallet;
  wallet = upgrade(wallet, line, 'cost2', opts()).wallet;
  state = gachaState(wallet, TODAY);
  assert.deepEqual([state.lines[line].passive, state.lines[line].cost, state.lines[line].candy], [true, 2, 205 - 50 - 30 - 60]);
});

test('Shiny UP rolls shinies and SP skins; the shard shop sells SP', () => {
  let wallet = fresh({ regular: 1, waves: 0 });
  wallet = pull(wallet, { machine: 'shiny', rand: always(0.001) }).wallet;
  wallet = fund(wallet, { waves: 10 });
  const egg = hatchReady(wallet, opts({ rand: always(0.001) }));
  assert.equal(egg.hatched[0].shiny, true);
  assert.equal(egg.hatched[0].sp, true);
  let other = fresh({ regular: 1, waves: 0 });
  other = pull(other, { machine: 'move', rand: always(0.001) }).wallet;
  other = hatchReady(fund(other, { waves: 10 }), opts({ rand: always(0.001) })).wallet;
  const line = gachaState(other, TODAY).owned[0];
  assert.equal(gachaState(other, TODAY).lines[line].sp, false, 'only Shiny UP rolls SP');
  assert.equal(buySp(other, line, opts()).reason, 'shards');
  other = buySp(fund(other, { shards: 300 }), line, opts()).wallet;
  assert.equal(gachaState(other, TODAY).lines[line].sp, true);
  assert.equal(walletBalance(other).shards, 0);
});

test('the buddy must be owned, its look unlocked, and the latest choice wins', () => {
  let wallet = fresh({ regular: 2, waves: 0 });
  wallet = pull(wallet, { rand: always(0.9) }).wallet;
  wallet = pull(wallet, { rand: always(0.1) }).wallet;
  wallet = hatchReady(fund(wallet, { waves: 100 }), opts({ rand: always(0.9) })).wallet;
  const [a, b] = gachaState(wallet, TODAY).owned;
  assert.equal(setBuddy(wallet, 25, opts()).reason, 'not-owned');
  assert.equal(setBuddy(wallet, a, opts({ shiny: true })).reason, 'locked');
  wallet = setBuddy(wallet, a, opts()).wallet;
  wallet = setBuddy(wallet, b || a, opts()).wallet;
  const state = gachaState(wallet, TODAY);
  assert.equal(state.buddy.species, b || a);
  assert.equal(state.missions.buddy, true);
});

test('the daily login pays three Regulars once a day', () => {
  let wallet = fresh({});
  wallet = claimLogin(wallet, opts()).wallet;
  assert.equal(claimLogin(wallet, opts()).ok, false);
  wallet = claimLogin(wallet, opts({ today: '2026-11-17' })).wallet;
  assert.equal(walletBalance(wallet).regular, 6);
  assert.equal(claimLogin(fund({}, {}), opts()).ok, false, 'not before Poké Gacha has been opened');
});

test('skills come from the line\'s types', () => {
  const named = name => DEX.findIndex(row => row[0] === name) + 1;
  assert.deepEqual(gacha.skillsOf(named('Charmander')), ['Ember', 'Flame Wheel', 'Fire Spin', 'Overheat']);
  assert.deepEqual(gacha.skillsOf(named('Bulbasaur')), ['Vine Whip', 'Razor Leaf', 'Poison Sting', 'Solar Beam']);
  assert.deepEqual(gacha.skillsOf(named('Venusaur')), gacha.skillsOf(named('Bulbasaur')), 'shared by the line');
  assert.equal(gacha.stageOf(named('Venusaur')), 3);
});
